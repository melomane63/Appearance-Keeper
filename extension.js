// SPDX-FileCopyrightText: [Your Copyright Information]
// SPDX-License-Identifier: GPL-3.0-or-later

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export default class AppearanceKeeperExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._manager = null;
        this._settings = null;
    }

    enable() {
        this._manager = new AppearanceKeeperManager(this.getSettings());
        this._manager.start();
    }

    disable() {
        if (this._manager) {
            this._manager.stop();
            this._manager = null;
        }
    }
}


/**
 * Core logic manager for appearance tracking
 */
class AppearanceKeeperManager {
    constructor(settings) {
        this._settings = settings;
        this._interfaceSettings = null;
        this._userThemeSettings = null;
        this._backgroundSettings = null;
        this._storedWallpapers = { light: null, dark: null };
        this._handlers = [];
        this._DEBUG = false;
        this._suspendSave = false;

        // Debounce timers for wallpaper changes
        this._debounceTimers = {};

        // Schema constants
        this._SCHEMA_BACKGROUND = 'org.gnome.desktop.background';
        this._SCHEMA_INTERFACE = 'org.gnome.desktop.interface';
        this._SCHEMA_USER_THEME = 'org.gnome.shell.extensions.user-theme';
    }

    // --- Lifecycle Management ---

    start() {
        this._log('Starting extension');

        if (!this._initializeServices()) {
            this._log('Service initialization failed', 'error');
            this.stop();
            return;
        }

        this._initializeMonitoring();
        this._log('Extension started successfully');
    }

    stop() {
        this._log('Stopping extension');

        // Disconnect all GSettings handlers
        this._cleanupAllHandlers();

        // Remove all active debounce timers
        this._cleanupDebounceTimers();

        // Reset all references
        this._resetAllSettings();

        this._log('Extension stopped');
    }

    // --- Logging ---

    _log(message, level = 'debug') {
        const prefix = '[AppearanceKeeper]';
        if (level === 'error') console.error(`${prefix} ERROR: ${message}`);
        else if (level === 'warning') console.warn(`${prefix} WARNING: ${message}`);
        else if (this._DEBUG) console.debug(`${prefix} ${message}`);
    }

    // --- Service Initialization ---

    _initializeServices() {
        try {
            return this._initMainSettings() &&
                   this._initBackgroundSettings() &&
                   this._initUserThemeSettings();
        } catch (error) {
            this._log(`Service initialization error: ${error}`, 'error');
            return false;
        }
    }

    _initMainSettings() {
        try {
            this._interfaceSettings = new Gio.Settings({ schema_id: this._SCHEMA_INTERFACE });
            this._log('Main settings initialized');
            return true;
        } catch (error) {
            this._log(`Failed to initialize main settings: ${error}`, 'error');
            return false;
        }
    }

    _initBackgroundSettings() {
        try {
            this._backgroundSettings = new Gio.Settings({ schema_id: this._SCHEMA_BACKGROUND });
            this._log('Background settings initialized');
            return true;
        } catch (error) {
            this._log(`Failed to initialize background settings: ${error}`, 'error');
            return false;
        }
    }

    _initUserThemeSettings() {
        try {
            const schemaSource = Gio.SettingsSchemaSource.get_default();
            const schema = schemaSource.lookup(this._SCHEMA_USER_THEME, true);

            if (schema) {
                this._userThemeSettings = new Gio.Settings({ schema_id: this._SCHEMA_USER_THEME });
                this._log('User theme settings initialized');
            } else {
                this._log('User theme extension not available', 'debug');
            }
            return true;
        } catch (error) {
            this._log(`Failed to initialize user theme settings: ${error}`, 'warning');
            return true;
        }
    }

    // --- Monitoring Setup ---

    _initializeMonitoring() {
        this._loadInitialWallpapers();
        this._setupWallpaperMonitoring();
        this._setupThemeMonitoring();
        this._setupStyleMonitoring();
    }

    _loadInitialWallpapers() {
        this._storedWallpapers.light = this._backgroundSettings.get_string('picture-uri');
        this._storedWallpapers.dark = this._backgroundSettings.get_string('picture-uri-dark');
        this._log('Initial wallpapers loaded');
    }

    _setupWallpaperMonitoring() {
        const handler = this._backgroundSettings.connect('changed', (settings, key) => {
            if (key === 'picture-uri' || key === 'picture-uri-dark') {
                this._handleWallpaperChange(key);
            }
        });
        this._storeHandler(this._backgroundSettings, handler);
    }

    _setupThemeMonitoring() {
        const themeKeys = ['gtk-theme', 'icon-theme', 'cursor-theme', 'accent-color'];
        themeKeys.forEach(key => {
            const handler = this._interfaceSettings.connect(`changed::${key}`, () => {
                this._saveThemeParameter(key);
            });
            this._storeHandler(this._interfaceSettings, handler);
        });

        if (this._userThemeSettings) {
            const shellHandler = this._userThemeSettings.connect('changed::name', () => {
                this._saveThemeParameter('shell-theme');
            });
            this._storeHandler(this._userThemeSettings, shellHandler);
        }
    }

    _setupStyleMonitoring() {
        const handler = this._interfaceSettings.connect('changed::color-scheme', () => {
            this._handleColorSchemeChange();
        });
        this._storeHandler(this._interfaceSettings, handler);
    }

    // --- Handler Management ---

    _storeHandler(settings, handlerId) {
        this._handlers.push({ settings, id: handlerId });
    }

    _cleanupAllHandlers() {
        this._handlers.forEach(handler => {
            try {
                if (handler?.settings && handler.id) {
                    handler.settings.disconnect(handler.id);
                }
            } catch (error) {
                this._log(`Error cleaning up handler: ${error}`, 'warning');
            }
        });
        this._handlers = [];
    }

    // --- Debounce Timer Management ---

    _cleanupDebounceTimers() {
        for (const key in this._debounceTimers) {
            if (this._debounceTimers[key]) {
                try {
                    GLib.source_remove(this._debounceTimers[key]);
                } catch (error) {
                    this._log(`Error removing debounce timer for ${key}: ${error}`, 'warning');
                }
            }
        }
        // Clear the timer dictionary
        this._debounceTimers = {};
    }

    // --- Reset Settings ---
    _resetAllSettings() {
        // Nullify all settings references
        this._interfaceSettings = null;
        this._userThemeSettings = null;
        this._backgroundSettings = null;

        // Clear stored wallpaper URIs
        this._storedWallpapers = { light: null, dark: null };
    }

    // --- Settings Utilities ---

    _getSetting(settings, key, defaultValue = '') {
        if (!settings) return defaultValue;
        try { return settings.get_string(key) || defaultValue; }
        catch (error) { this._log(`Error reading setting ${key}: ${error}`, 'warning'); return defaultValue; }
    }

    _setSetting(settings, key, value) {
        if (!settings || value === null) return;
        try {
            const current = settings.get_string(key);
            if (current !== value) settings.set_string(key, value);
        } catch (error) {
            this._log(`Error setting ${key}: ${error}`, 'error');
        }
    }

    _getValidatedSetting(settings, key, defaultValue = '') {
        const value = this._getSetting(settings, key, defaultValue);
        if (typeof value !== 'string') return defaultValue;
        if (value.length > 100) return defaultValue;
        return value;
    }

    // --- Theme Management ---

    _saveThemeParameter(parameter) {
        if (this._suspendSave || !this._settings) return;

        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');
        const prefix = isDark ? 'dark' : 'light';
        let value = '';

        switch (parameter) {
            case 'gtk-theme':
            case 'icon-theme':
            case 'cursor-theme':
            case 'accent-color':
                value = this._getValidatedSetting(this._interfaceSettings, parameter);
                break;
            case 'shell-theme':
                value = this._getSetting(this._userThemeSettings, 'name', '');
                break;
            default:
                this._log(`Unknown theme parameter: ${parameter}`, 'warning');
                return;
        }

        const key = parameter === 'shell-theme' ? `${prefix}-shell-theme` : `${prefix}-${parameter}`;
        this._setSetting(this._settings, key, value);
        this._log(`Saved ${parameter} for ${prefix} mode: ${value || '(default)'}`);
    }

    async _setShellTheme(themeName) {
        if (!this._userThemeSettings) return;
        try {
            if (!themeName) {
                this._userThemeSettings.reset('name');
                this._log('Shell theme reset to default');
            } else {
                this._userThemeSettings.set_string('name', themeName);
                this._log(`Shell theme applied: ${themeName}`);
            }
        } catch (error) {
            this._log(`Error setting shell theme: ${error}`, 'error');
        }
    }

    // --- Wallpaper Logic with Debounce ---

    _handleWallpaperChange(changedKey) {
        // Debounce: cancel existing timers for this key
        if (this._debounceTimers[changedKey]) {
            GLib.source_remove(this._debounceTimers[changedKey]);
        }

        // Schedule new debounce timer
        this._debounceTimers[changedKey] = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._processWallpaperChange(changedKey);
            delete this._debounceTimers[changedKey];
            return GLib.SOURCE_REMOVE;
        });
    }

    _processWallpaperChange(changedKey) {
        const newValue = this._backgroundSettings.get_string(changedKey) || '';
        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');

        this._log(`Wallpaper changed: ${changedKey} = ${newValue.substring(0, 100)}...`);

        if (newValue.endsWith('.xml')) {
            this._log('XML wallpaper detected, storing directly');
            this._storedWallpapers[changedKey === 'picture-uri' ? 'light' : 'dark'] = newValue;
            return;
        }

        if (this._isSpecialBackgroundFile(newValue)) {
            this._handleSpecialBackgroundFile(changedKey, newValue, isDark);
            return;
        }

        this._handleRegularWallpaper(changedKey, newValue, isDark);
    }

    _isSpecialBackgroundFile(uri) {
        return uri.includes('/.config/background');
    }

    _isPairedWallpaper(uri) {
        if (!uri) return false;
        const filename = uri.replace('file://', '').split('/').pop() || '';
        const hasThemeSuffix = /[-_](l|d|light|dark|day|night)\.[a-zA-Z0-9]+$/.test(filename);
        const isXmlFile = filename.endsWith('.xml');
        return hasThemeSuffix || isXmlFile;
    }

    _handleSpecialBackgroundFile(changedKey, newValue, isDark) {
        try {
            const userHome = GLib.get_home_dir();
            const backgroundPath = `${userHome}/.config/background`;
            const extension = this._getFileExtension(backgroundPath);
            const isLightChange = changedKey === 'picture-uri';

            this._log(`Processing special background file for ${isDark ? 'dark' : 'light'} mode`);

            if ((isLightChange && !isDark) || (!isLightChange && isDark)) {
                const suffix = isDark ? '-dark' : '-light';
                const newPath = `${backgroundPath}${suffix}${extension}`;
                const fileOrig = Gio.File.new_for_path(backgroundPath);
                const fileNew = Gio.File.new_for_path(newPath);

                if (fileOrig.query_exists(null)) {
                    fileOrig.copy(fileNew, Gio.FileCopyFlags.OVERWRITE, null, null);
                    const newUri = `file://${newPath}`;
                    this._backgroundSettings.set_string(changedKey, newUri);
                    this._storedWallpapers[isDark ? 'dark' : 'light'] = newUri;
                }
            } else {
                const restoreKey = changedKey === 'picture-uri' ? 'light' : 'dark';
                this._backgroundSettings.set_string(changedKey, this._storedWallpapers[restoreKey]);
            }
        } catch (error) {
            this._log(`Error handling special background: ${error}`, 'error');
        }
    }

    _handleRegularWallpaper(changedKey, newValue, isDark) {
        const isPaired = this._isPairedWallpaper(newValue);
        
        if (isPaired) {
            this._storedWallpapers[changedKey === 'picture-uri' ? 'light' : 'dark'] = newValue;
        } else {
            if (changedKey === 'picture-uri' && isDark) {
                this._backgroundSettings.set_string('picture-uri', this._storedWallpapers.light);
            } else if (changedKey === 'picture-uri-dark' && !isDark) {
                this._backgroundSettings.set_string('picture-uri-dark', this._storedWallpapers.dark);
            } else {
                this._storedWallpapers[changedKey === 'picture-uri' ? 'light' : 'dark'] = newValue;
            }
        }
    }

    _getFileExtension(filePath) {
        const basename = filePath.split('/').pop() || '';
        const lastDotIndex = basename.lastIndexOf('.');
        return lastDotIndex !== -1 ? basename.slice(lastDotIndex) : '.png';
    }

    // --- Color Scheme Handling ---

    _handleColorSchemeChange() {
        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');
        this._log(`Color scheme changed to: ${colorScheme}`);
        this._applyThemeForScheme(isDark);
    }

    async _applyThemeForScheme(isDark) {
        if (!this._settings) return;
        try {
            this._suspendSave = true;
            const prefix = isDark ? 'dark' : 'light';

            const themes = {
                gtk: this._getValidatedSetting(this._settings, `${prefix}-gtk-theme`),
                shell: this._getValidatedSetting(this._settings, `${prefix}-shell-theme`),
                icon: this._getValidatedSetting(this._settings, `${prefix}-icon-theme`),
                cursor: this._getValidatedSetting(this._settings, `${prefix}-cursor-theme`),
                accent: this._getValidatedSetting(this._settings, `${prefix}-accent-color`)
            };

            this._setSetting(this._interfaceSettings, 'gtk-theme', themes.gtk);
            this._setSetting(this._interfaceSettings, 'icon-theme', themes.icon);
            this._setSetting(this._interfaceSettings, 'cursor-theme', themes.cursor);
            this._setSetting(this._interfaceSettings, 'accent-color', themes.accent);

            const currentShell = this._getSetting(this._userThemeSettings, 'name', '');
            if (themes.shell !== null && themes.shell !== currentShell) {
                await this._setShellTheme(themes.shell);
            }

            this._log(`Applied ${prefix} theme settings`);
            this._log(`Shell theme: ${themes.shell || '(default)'}`);

        } catch (error) {
            this._log(`Error applying theme: ${error}`, 'error');
        } finally {
            this._suspendSave = false;
        }
    }
}

