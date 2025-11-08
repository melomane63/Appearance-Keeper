// SPDX-FileCopyrightText:
// SPDX-License-Identifier: GPL-3.0-or-later

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export default class AppearanceKeeperExtension {
    constructor() {
        this._settings = null;
        this._interfaceSettings = null;
        this._settingsExt = null;
        this._userThemeSettings = null;
        this._storedWallpapers = { light: null, dark: null };
        this._handlers = [];
        this._DEBUG = false; // 🔹 Activer ou désactiver les logs debug ici
        this._suspendSave = false; // 🔒 Empêche les sauvegardes pendant l'application d'un thème
    }

    enable() {
        this._log('Starting extension activation');
        
        if (!this._initializeServices()) {
            this.disable();
            return;
        }
        
        this._initializeMonitoring();
        this._log('Extension activated successfully');
    }

    disable() {
        this._log('Disabling extension');
        this._cleanupAllHandlers();
        this._settings = null;
        this._interfaceSettings = null;
        this._settingsExt = null;
        this._userThemeSettings = null;
        this._storedWallpapers = { light: null, dark: null };
        this._log('Extension disabled successfully');
    }

    // --- Structured logging ---
    _log(message, level = 'info') {
        const prefix = 'AppearanceKeeper:';
        if (level === 'error' || this._DEBUG) {
            log(`${prefix} ${message}`);
        }
    }

    // --- Service initialization with validation ---
    _initializeServices() {
        try {
            const success = this._initSettingsExt() && 
                           this._initUserThemeSettings() &&
                           this._initMainSettings();
            
            if (!success) {
                this._log('Service initialization failed', 'error');
                return false;
            }
            
            return true;
        } catch (e) {
            this._log(`Error during service initialization - ${e}`, 'error');
            return false;
        }
    }

    _initMainSettings() {
        try {
            this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
            this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            this._log('Main settings initialized');
            return true;
        } catch (e) {
            this._log(`Failed to initialize main settings - ${e}`, 'error');
            return false;
        }
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

    _cleanupAllHandlers() {
        this._handlers.forEach(handler => {
            if (handler?.settings && handler.id)
                handler.settings.disconnect(handler.id);
        });
        this._handlers = [];
    }

    _storeHandler(settings, handlerId) {
        this._handlers.push({ settings, id: handlerId });
    }

    _initUserThemeSettings() {
        try {
            const schemaSource = Gio.SettingsSchemaSource.get_default();
            const schema = schemaSource.lookup('org.gnome.shell.extensions.user-theme', true);
            if (schema) {
                this._userThemeSettings = new Gio.Settings({
                    schema_id: 'org.gnome.shell.extensions.user-theme'
                });
                this._log('User theme settings initialized');
            } else {
                this._log('User theme plugin not installed, using default Shell theme.');
            }
            return true;
        } catch (e) {
            this._log(`Error during user-theme initialization - ${e}`, 'error');
            return false;
        }
    }

    // --- Monitoring initialization ---
    _initializeMonitoring() {
        try {
            this._settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
            this._interfaceSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
            this._storedWallpapers.light = this._settings.get_string('picture-uri');
            this._storedWallpapers.dark = this._settings.get_string('picture-uri-dark');

            // --- Wallpaper change monitoring ---
            const wallpaperHandler = this._settings.connect('changed', (settings, key) => {
                if (key === 'picture-uri' || key === 'picture-uri-dark')
                    this._handleWallpaperChange(key);
            });
            this._storeHandler(this._settings, wallpaperHandler);

            // --- Style change monitoring ---
            const styleHandler = this._interfaceSettings.connect('changed::color-scheme', () => {
                this._handleStyleChange();
            });
            this._storeHandler(this._interfaceSettings, styleHandler);

            // --- Theme parameters (GTK, icons, etc.) monitoring ---
            this._setupThemeSettingsMonitoring();
        } catch (e) {
            this._log(`Error during monitoring initialization - ${e}`, 'error');
        }
    }

    _setupThemeSettingsMonitoring() {
        const themeKeys = ['gtk-theme', 'icon-theme', 'cursor-theme', 'accent-color'];
        themeKeys.forEach(key => {
            const handler = this._interfaceSettings.connect(`changed::${key}`, () => {
                this._saveSingleThemeParamToKey(key);
            });
            this._storeHandler(this._interfaceSettings, handler);
        });

        if (this._userThemeSettings) {
            const shellHandler = this._userThemeSettings.connect('changed::name', () => {
                this._saveSingleThemeParamToKey('shell');
            });
            this._storeHandler(this._userThemeSettings, shellHandler);
        }
    }

    // --- Validation ---
    _validateThemeValue(value) {
        if (typeof value !== 'string') {
            this._log(`Invalid theme value (type): ${typeof value}`, 'error');
            return false;
        }
        if (value.length > 100) {
            this._log(`Theme value too long: ${value.length} characters`, 'error');
            return false;
        }
        return true;
    }

    // --- Individual parameter saving ---
    _saveSingleThemeParamToKey(param) {
        if (this._suspendSave) {
            this._log(`Save ignored during theme application (${param})`);
            return;
        }

        try {
            const colorScheme = this._interfaceSettings.get_string('color-scheme') || 'default';
            const isDark = colorScheme.includes('dark');

            const themeMap = {
                'gtk-theme': this._interfaceSettings.get_string('gtk-theme') || '',
                'icon-theme': this._interfaceSettings.get_string('icon-theme') || '',
                'cursor-theme': this._interfaceSettings.get_string('cursor-theme') || '',
                'accent-color': this._interfaceSettings.get_string('accent-color') || '',
                'shell': this._getCurrentShellTheme() || '',
            };


const value = themeMap[param];

// Ne plus ignorer '' pour le shell
if (!value && param !== 'shell') {
    this._log(`Empty value for ${param}, saving ignored`);
    return;
}



            if (!this._validateThemeValue(value)) {
                this._log(`Invalid value for ${param}, saving ignored`, 'error');
                return;
            }

            const prefix = isDark ? 'dark-' : 'light-';
            const key = param === 'shell' ? `${prefix}shell-theme` : `${prefix}${param}`;
            
            this._setDconfString(key, value);
            this._log(`Parameter saved: ${key} = ${value}`);
        } catch (e) {
            this._log(`Error saving ${param} - ${e}`, 'error');
        }
    }

    // --- Wallpaper logic (inchangé) ---
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
        try {
            const newValue = this._settings.get_string(changedKey) || '';
            const colorScheme = this._interfaceSettings.get_string('color-scheme') || 'default';
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
        } catch (e) {
            this._log(`Error in handleWallpaperChange - ${e}`, 'error');
        }
    }

    _handleStyleChange() {
        try {
            const colorScheme = this._interfaceSettings.get_string('color-scheme') || 'default';
            const isDark = colorScheme.includes('dark');
            this._log(`Style change detected: ${colorScheme} (isDark: ${isDark})`);
            this._applyTheme(isDark);
        } catch (e) {
            this._log(`Error in handleStyleChange - ${e}`, 'error');
        }
    }

    // --- Shell theme functions modifiées ---
    _getCurrentShellTheme() {
        try {
            return this._userThemeSettings ? this._userThemeSettings.get_string('name') || '' : '';
        } catch (e) {
            this._log(`Error in getCurrentShellTheme - ${e}`, 'error');
            return '';
        }
    }

    async _setShellTheme(themeName) {
        try {
            if (!this._userThemeSettings) return;

            if (!themeName) {
                // Thème vide → reset vers le thème système
                this._userThemeSettings.reset('name');
                this._log('Shell theme reset to system default');
                return;
            }

            // Thème personnalisé
            this._userThemeSettings.set_string('name', themeName);
            this._log(`Shell theme applied: ${themeName}`);
        } catch (e) {
            this._log(`Error in setShellTheme - ${e}`, 'error');
        }
    }

    // --- Optimized theme application ---
    async _applyTheme(isDark) {
        try {
            this._suspendSave = true; // 🔒 bloque les sauvegardes pendant la mise à jour du thème

            const prefix = isDark ? 'dark' : 'light';
            const gtk = this._getDconfString(`${prefix}-gtk-theme`, '');
            const shell = this._getDconfString(`${prefix}-shell-theme`, '');
            const icon = this._getDconfString(`${prefix}-icon-theme`, '');
            const cursor = this._getDconfString(`${prefix}-cursor-theme`, '');
            const accent = this._getDconfString(`${prefix}-accent-color`, '');

            const applyIfDifferent = (settings, key, value) => {
                if (!value) return;
                const current = settings.get_string(key);
                if (current !== value) {
                    settings.set_string(key, value);
                    this._log(`Updated ${key} → ${value}`);
                } else {
                    this._log(`Skipped ${key}, already ${value}`);
                }
            };

            applyIfDifferent(this._interfaceSettings, 'gtk-theme', gtk);
            applyIfDifferent(this._interfaceSettings, 'icon-theme', icon);
            applyIfDifferent(this._interfaceSettings, 'cursor-theme', cursor);
            applyIfDifferent(this._interfaceSettings, 'accent-color', accent);

            const currentShell = this._getCurrentShellTheme();
            if (shell !== currentShell) {
                await this._setShellTheme(shell);
            } else {
                this._log(`Skipped shell theme, already ${currentShell || '(system default)'}`);
            }

        } catch (e) {
            this._log(`Error in applyTheme - ${e}`, 'error');
        } finally {
            this._suspendSave = false; // 🔓 réactive les sauvegardes
        }
    }

    // --- DConf utilities ---
    _getDconfString(key, defaultValue) {
        return this._settingsExt ? this._settingsExt.get_string(key) || defaultValue : defaultValue;
    }

    _setDconfString(key, value) {
        try {
            if (this._settingsExt)
                this._settingsExt.set_string(key, value);
            else
                this._log(`Cannot write ${key}, schema not found`);
        } catch (e) {
            this._log(`Error in setDconfString ${key} - ${e}`, 'error');
        }
    }
}

