// SPDX-License-Identifier: GPL-3.0-or-later

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class AppearanceKeeperExtension extends Extension {
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

class AppearanceKeeperManager {
    constructor(settings) {
        this._settings = settings;
        this._interfaceSettings = null;
        this._userThemeSettings = null;
        this._handlers = [];
        this._suspendSave = false;
        this._suspendApply = false;
        this._debounceTimers = {};
        
        this._SCHEMA_INTERFACE = 'org.gnome.desktop.interface';
        this._SCHEMA_USER_THEME = 'org.gnome.shell.extensions.user-theme';
        this._keybindingId = 'dark-light-toggle';
    }

    start() {
        if (!this._initializeServices()) {
            this.stop();
            return;
        }

        this._initializeMonitoring();
        this._registerKeybinding();
    }

    stop() {
        this._cleanupAllHandlers();
        this._cleanupDebounceTimers();
        this._cleanupKeybinding();
        this._resetAllSettings();
    }

    _initializeServices() {
        return this._initMainSettings() && this._initUserThemeSettings();
    }

    _initMainSettings() {
        this._interfaceSettings = new Gio.Settings({ schema_id: this._SCHEMA_INTERFACE });
        return true;
    }

    _initUserThemeSettings() {
        let schemaSource = Gio.SettingsSchemaSource.get_default();
        let schema = schemaSource.lookup(this._SCHEMA_USER_THEME, true);

        if (!schema) {
            const userThemePaths = [
                `${GLib.get_home_dir()}/.local/share/gnome-shell/extensions/user-theme@gnome-shell-extensions.gcampax.github.com/schemas`,
                '/usr/share/gnome-shell/extensions/user-theme@gnome-shell-extensions.gcampax.github.com/schemas'
            ];

            for (const path of userThemePaths) {
                const schemaDir = Gio.File.new_for_path(path);
                if (schemaDir.query_exists(null)) {
                    try {
                        const schemaSourceUser = Gio.SettingsSchemaSource.new_from_directory(
                            path,
                            schemaSource,
                            false
                        );
                        schema = schemaSourceUser.lookup(this._SCHEMA_USER_THEME, false);
                        if (schema) {
                            schemaSource = schemaSourceUser;
                            break;
                        }
                    } catch (e) {
                        // Schema not found in this path, continue
                    }
                }
            }
        }

        if (schema) {
            this._userThemeSettings = new Gio.Settings({ settings_schema: schema });
        }
        
        return true;
    }

    _initializeMonitoring() {
        this._setupThemeMonitoring();
        this._setupStyleMonitoring();
        this._setupExtensionSettingsMonitoring();
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

    _setupExtensionSettingsMonitoring() {
        const themeKeys = [
            'light-gtk-theme', 'light-shell-theme', 'light-icon-theme', 
            'light-cursor-theme', 'light-accent-color',
            'dark-gtk-theme', 'dark-shell-theme', 'dark-icon-theme', 
            'dark-cursor-theme', 'dark-accent-color'
        ];

        themeKeys.forEach(key => {
            const handler = this._settings.connect(`changed::${key}`, () => {
                this._handleExtensionSettingChange(key);
            });
            this._storeHandler(this._settings, handler);
        });
    }

    _handleExtensionSettingChange(key) {
        if (this._suspendApply) return;

        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');
        const prefix = isDark ? 'dark' : 'light';

        if (!key.startsWith(prefix)) return;
        
        const settingType = key.replace(`${prefix}-`, '');
        
        this._suspendSave = true;
        
        const value = this._getValidatedSetting(this._settings, key);
        
        switch (settingType) {
            case 'gtk-theme':
                this._setSetting(this._interfaceSettings, 'gtk-theme', value);
                break;
            case 'icon-theme':
                this._setSetting(this._interfaceSettings, 'icon-theme', value);
                break;
            case 'cursor-theme':
                this._setSetting(this._interfaceSettings, 'cursor-theme', value);
                break;
            case 'accent-color':
                this._setSetting(this._interfaceSettings, 'accent-color', value);
                break;
            case 'shell-theme':
                this._setShellTheme(value);
                break;
        }
        
        this._suspendSave = false;
    }

    _storeHandler(settings, handlerId) {
        this._handlers.push({ settings, id: handlerId });
    }

    _cleanupAllHandlers() {
        this._handlers.forEach(handler => {
            if (handler?.settings && handler.id) {
                handler.settings.disconnect(handler.id);
            }
        });
        this._handlers = [];
    }

    _cleanupDebounceTimers() {
        for (const key in this._debounceTimers) {
            if (this._debounceTimers[key]) {
                GLib.source_remove(this._debounceTimers[key]);
            }
        }
        this._debounceTimers = {};
    }

    _resetAllSettings() {
        this._interfaceSettings = null;
        this._userThemeSettings = null;
    }

    _getSetting(settings, key, defaultValue = '') {
        if (!settings) return defaultValue;
        return settings.get_string(key) || defaultValue;
    }

    _setSetting(settings, key, value) {
        if (!settings || value === null) return;
        const current = settings.get_string(key);
        if (current !== value) settings.set_string(key, value);
    }

    _getValidatedSetting(settings, key, defaultValue = '') {
        const value = this._getSetting(settings, key, defaultValue);
        if (typeof value !== 'string') return defaultValue;
        if (value.length > 100) return defaultValue;
        return value;
    }

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
                return;
        }

        const key = `${prefix}-${parameter}`;
        this._setSetting(this._settings, key, value);
    }

    _setShellTheme(themeName) {
        if (!this._userThemeSettings) return;
        
        if (!themeName || themeName === '' || themeName === 'Default') {
            this._userThemeSettings.reset('name');
        } else {
            const currentTheme = this._userThemeSettings.get_string('name');
            if (currentTheme !== themeName) {
                this._userThemeSettings.set_string('name', themeName);
            }
        }
    }

    _handleColorSchemeChange() {
        const colorScheme = this._getSetting(this._interfaceSettings, 'color-scheme', 'default');
        const isDark = colorScheme.includes('dark');
        this._applyThemeForScheme(isDark);
    }

    _applyThemeForScheme(isDark) {
        if (!this._settings) return;
        
        this._suspendSave = true;
        this._suspendApply = true;
        
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
            this._setShellTheme(themes.shell);
        }

        this._suspendApply = false;
        this._suspendSave = false;
    }

    _registerKeybinding() {
        Main.wm.addKeybinding(
            this._keybindingId,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            this._toggleColorScheme.bind(this)
        );
    }

    _cleanupKeybinding() {
        Main.wm.removeKeybinding(this._keybindingId);
    }

    _toggleColorScheme() {
        const current = this._interfaceSettings.get_string('color-scheme');
        const newScheme = current === 'prefer-dark' ? 'default' : 'prefer-dark';
        this._interfaceSettings.set_string('color-scheme', newScheme);
    }
}
