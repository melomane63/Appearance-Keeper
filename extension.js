// SPDX-FileCopyrightText:
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * --- Entry point class ---
 * Minimal, delegates all logic to AppearanceKeeperManager
 */
export default class AppearanceKeeperExtension {
    constructor() {
        this._manager = new AppearanceKeeperManager();
    }

    enable() {
        this._manager.start();
    }

    disable() {
        this._manager.stop();
    }
}


/**
 * --- Core logic class ---
 * Handles settings, theme, monitoring, and saving
 */
class AppearanceKeeperManager {
    constructor() {
        this._settings = null;
        this._interfaceSettings = null;
        this._settingsExt = null;
        this._userThemeSettings = null;
        this._storedWallpapers = { light: null, dark: null };
        this._handlers = [];
        this._DEBUG = false;
        this._suspendSave = false;
    }

    // --- Lifecycle ---
    start() {
        this._log('Starting extension activation');
        if (!this._initializeServices()) {
            this.stop();
            return;
        }
        this._initializeMonitoring();
        this._log('Extension activated successfully');
    }

    stop() {
        this._log('Disabling extension');
        this._cleanupAllHandlers();
        this._settings = null;
        this._interfaceSettings = null;
        this._settingsExt = null;
        this._userThemeSettings = null;
        this._storedWallpapers = { light: null, dark: null };
        this._log('Extension disabled successfully');
    }

    // --- Logging ---
    _log(message, level = 'info') {
        const prefix = 'AppearanceKeeper:';
        if (level === 'error' || this._DEBUG) log(`${prefix} ${message}`);
    }

    // --- Initialization ---
    _initializeServices() {
        const success = this._initSettingsExt() &&
                        this._initUserThemeSettings() &&
                        this._initMainSettings();
        if (!success) {
            this._log('Service initialization failed', 'error');
            return false;
        }
        return true;
    }

    _initMainSettings() {
        this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._log('Main settings initialized');
        return true;
    }

    _initSettingsExt() {
        const schemaName = 'org.gnome.shell.extensions.appearance-keeper';
        const schemaSource = Gio.SettingsSchemaSource.get_default();
        const schema = schemaSource.lookup(schemaName, false);

        if (schema) {
            this._settingsExt = new Gio.Settings({ schema_id: schemaName });
            this._log('Extension schema initialized');
            return true;
        } else {
            this._log(`Schema ${schemaName} not found, starting without extension storage`);
            return false;
        }
    }

    _initUserThemeSettings() {
        const schemaSource = Gio.SettingsSchemaSource.get_default();
        const schema = schemaSource.lookup('org.gnome.shell.extensions.user-theme', true);
        if (schema) {
            this._userThemeSettings = new Gio.Settings({ schema_id: 'org.gnome.shell.extensions.user-theme' });
            this._log('User theme settings initialized');
        } else {
            this._log('User theme plugin not installed, using default Shell theme.');
        }
        return true;
    }

    // --- Monitoring ---
    _initializeMonitoring() {
        this._storedWallpapers.light = this._settings.get_string('picture-uri');
        this._storedWallpapers.dark = this._settings.get_string('picture-uri-dark');

        const wallpaperHandler = this._settings.connect('changed', (settings, key) => {
            if (key === 'picture-uri' || key === 'picture-uri-dark')
                this._handleWallpaperChange(key);
        });
        this._storeHandler(this._settings, wallpaperHandler);

        const styleHandler = this._interfaceSettings.connect('changed::color-scheme', () => {
            this._handleStyleChange();
        });
        this._storeHandler(this._interfaceSettings, styleHandler);

        this._setupThemeSettingsMonitoring();
    }

    _setupThemeSettingsMonitoring() {
        const themeKeys = ['gtk-theme', 'icon-theme', 'cursor-theme', 'accent-color'];
        themeKeys.forEach(key => {
            const handler = this._interfaceSettings.connect(`changed::${key}`, () => {
                this._saveParam(key);
            });
            this._storeHandler(this._interfaceSettings, handler);
        });

        if (this._userThemeSettings) {
            const shellHandler = this._userThemeSettings.connect('changed::name', () => {
                this._saveParam('shell');
            });
            this._storeHandler(this._userThemeSettings, shellHandler);
        }
    }

    _storeHandler(settings, handlerId) {
        this._handlers.push({ settings, id: handlerId });
    }

    _cleanupAllHandlers() {
        this._handlers.forEach(handler => {
            if (handler?.settings && handler.id)
                handler.settings.disconnect(handler.id);
        });
        this._handlers = [];
    }

    // --- Utilities ---
    _getSetting(settings, key, defaultValue = '') {
        return settings ? settings.get_string(key) || defaultValue : defaultValue;
    }

    _setSetting(settings, key, value) {
        if (!settings) return;
        const current = settings.get_string(key);
        if (current !== value) settings.set_string(key, value);
    }

    _getValidatedSetting(settings, key, defaultValue = '') {
        const value = this._getSetting(settings, key, defaultValue);
        if (typeof value !== 'string' || value.length > 100) return '';
        return value;
    }

    _saveParam(param) {
        if (this._suspendSave) return;

        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');

        const themeMap = {
            'gtk-theme': this._getValidatedSetting(this._interfaceSettings, 'gtk-theme'),
            'icon-theme': this._getValidatedSetting(this._interfaceSettings, 'icon-theme'),
            'cursor-theme': this._getValidatedSetting(this._interfaceSettings, 'cursor-theme'),
            'accent-color': this._getValidatedSetting(this._interfaceSettings, 'accent-color'),
            'shell': this._getCurrentShellTheme(),
        };

        const value = themeMap[param];
        if (!value && param !== 'shell') return;

        const prefix = isDark ? 'dark-' : 'light-';
        const key = param === 'shell' ? `${prefix}shell-theme` : `${prefix}${param}`;
        this._setDconfString(key, value);
    }

    // --- Wallpaper logic (intact) ---
    _isPairedWallpaper(uri) {
        if (!uri) return false;
        const filename = uri.replace('file://', '').split('/').pop() || '';
        return /-l\.[a-zA-Z0-9]+$/.test(filename) || /-d\.[a-zA-Z0-9]+$/.test(filename);
    }

    _isSpecialBackgroundFile(uri) {
        return uri.includes('/.config/background');
    }

    _getFileExtension(filePath) {
        const basename = filePath.split('/').pop() || '';
        const lastDotIndex = basename.lastIndexOf('.');
        return lastDotIndex !== -1 ? basename.slice(lastDotIndex) : '.png';
    }

    _handleSpecialBackgroundFile(changedKey, newValue, isDark) {
        try {
            const userHome = GLib.get_home_dir();
            const backgroundPath = `${userHome}/.config/background`;
            const extension = this._getFileExtension(backgroundPath);
            const isLightChange = changedKey === 'picture-uri';

            this._log(`Processing special wallpaper: ${changedKey}, mode: ${isDark ? 'dark' : 'light'}`);

            if ((isLightChange && !isDark) || (!isLightChange && isDark)) {
                const suffix = isDark ? '-dark' : '-light';
                const newPath = `${backgroundPath}${suffix}${extension}`;
                const fileOrig = Gio.File.new_for_path(backgroundPath);
                const fileNew = Gio.File.new_for_path(newPath);

                if (fileOrig.query_exists(null)) {
                    fileOrig.copy(fileNew, Gio.FileCopyFlags.OVERWRITE, null, null);
                    const newUri = `file://${newPath}`;
                    
                    this._settings.set_string(changedKey, newUri);
                    if (isDark) this._storedWallpapers.dark = newUri;
                    else this._storedWallpapers.light = newUri;
                }
            } else {
                if (changedKey === 'picture-uri')
                    this._settings.set_string('picture-uri', this._storedWallpapers.light);
                else
                    this._settings.set_string('picture-uri-dark', this._storedWallpapers.dark);
            }
        } catch (e) {
            this._log(`Error in handleSpecialBackgroundFile - ${e}`, 'error');
        }
    }

    _handleWallpaperChange(changedKey) {
        const newValue = this._settings.get_string(changedKey) || '';
        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');

        this._log(`Wallpaper change detected: ${changedKey} = ${newValue} (mode: ${isDark ? 'dark' : 'light'})`);

        if (this._isSpecialBackgroundFile(newValue)) {
            this._handleSpecialBackgroundFile(changedKey, newValue, isDark);
            return;
        }

        const isPaired = this._isPairedWallpaper(newValue);
        if (isPaired) {
            if (changedKey === 'picture-uri')
                this._storedWallpapers.light = newValue;
            else
                this._storedWallpapers.dark = newValue;
        } else {
            if (changedKey === 'picture-uri' && isDark)
                this._settings.set_string('picture-uri', this._storedWallpapers.light);
            else if (changedKey === 'picture-uri-dark' && !isDark)
                this._settings.set_string('picture-uri-dark', this._storedWallpapers.dark);
            else if (changedKey === 'picture-uri')
                this._storedWallpapers.light = newValue;
            else
                this._storedWallpapers.dark = newValue;
        }
    }

    _handleStyleChange() {
        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');
        this._log(`Style change detected: ${colorScheme} (isDark: ${isDark})`);
        this._applyTheme(isDark);
    }

    // --- Shell theme ---
    _getCurrentShellTheme() {
        return this._getSetting(this._userThemeSettings, 'name', '');
    }

    async _setShellTheme(themeName) {
        try {
            if (!this._userThemeSettings) return;
            if (!themeName) {
                this._userThemeSettings.reset('name');
                this._log('Shell theme reset to system default');
                return;
            }
            this._userThemeSettings.set_string('name', themeName);
            this._log(`Shell theme applied: ${themeName}`);
        } catch (e) {
            this._log(`Error in setShellTheme - ${e}`, 'error');
        }
    }

    // --- Apply theme ---
    async _applyTheme(isDark) {
        try {
            this._suspendSave = true;

            const prefix = isDark ? 'dark' : 'light';
            const gtk = this._getValidatedSetting(this._settingsExt, `${prefix}-gtk-theme`);
            const shell = this._getValidatedSetting(this._settingsExt, `${prefix}-shell-theme`);
            const icon = this._getValidatedSetting(this._settingsExt, `${prefix}-icon-theme`);
            const cursor = this._getValidatedSetting(this._settingsExt, `${prefix}-cursor-theme`);
            const accent = this._getValidatedSetting(this._settingsExt, `${prefix}-accent-color`);

            this._setSetting(this._interfaceSettings, 'gtk-theme', gtk);
            this._setSetting(this._interfaceSettings, 'icon-theme', icon);
            this._setSetting(this._interfaceSettings, 'cursor-theme', cursor);
            this._setSetting(this._interfaceSettings, 'accent-color', accent);

            const currentShell = this._getCurrentShellTheme();
            if (shell !== currentShell) {
                await this._setShellTheme(shell);
            }

        } catch (e) {
            this._log(`Error in applyTheme - ${e}`, 'error');
        } finally {
            this._suspendSave = false;
        }
    }

    _getDconfString(key, defaultValue) {
        return this._getSetting(this._settingsExt, key, defaultValue);
    }

    _setDconfString(key, value) {
        this._setSetting(this._settingsExt, key, value);
    }
}

