// SPDX-FileCopyrightText:
// SPDX-License-Identifier: GPL-3.0-or-later

import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';

/**
 * --- Entry point class ---
 * Minimal, delegates all logic to PreferencesManager
 */
export default class AppearanceKeeperPreferences {
    constructor() {
        this._manager = new PreferencesManager();
    }

    fillPreferencesWindow(window) {
        this._manager.fillPreferencesWindow(window);
    }
}


/**
 * --- Core logic class ---
 * Handles settings, UI, accent colors, and wallpapers
 */
class PreferencesManager {
    constructor() {
        this._valueLabels = new Map();
        this._imageWidgets = new Map();
        this._handlers = [];
        this._accentCircles = new Map();
        this._accentColors = {
            'default': '#1c71d8',
            'blue': '#1c71d8',
            'green': '#2ec27e',
            'yellow': '#e5a50a',
            'orange': '#ff7800',
            'red': '#c01c28',
            'purple': '#813d9c',
            'pink': '#e66197',
            'slate': '#52606d'
        };
    }

    fillPreferencesWindow(window) {
        this._window = window;
        try {
            this._settings = new Gio.Settings({ schema_id: 'org.gnome.shell.extensions.appearance-keeper' });
            this._backgroundSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });

            this._loadCSS();
            this._buildUI();
            this._connectSignals();

            this._window.connect('close-request', () => {
                this._cleanup();
                return false;
            });
        } catch (error) {
            console.error('Error in fillPreferencesWindow:', error);
            this._showErrorPage(error);
        }
    }

    _loadCSS() {
        const css = `
            .wallpaper-vertical-preview { border-radius: 6px; border: 1px solid @borders; background-color: @card_bg_color }
            .dim-label { opacity: 0.7 }
            .error-icon { color: @error_color; opacity: 0.7 }
            .param-container, .param-row { width: 280px; min-width: 280px }
            .param-title { width: 130px; min-width: 130px; opacity: 0.7; font-weight: 600; text-align: left }
            .param-value-container { width: 150px; min-width: 150px; justify-content: flex-end }
            .param-value { text-align: right; opacity: 1 }
            .accent-circle { font-size: 12px; margin-left: 4px; flex-shrink: 0 }
        `;

        const provider = new Gtk.CssProvider();
        provider.load_from_data(css, -1);
        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _buildUI() {
        const page = new Adw.PreferencesPage();
        page.set_title('Appearance Keeper');
        page.set_icon_name('preferences-desktop-theme-symbolic');

        const mainGroup = new Adw.PreferencesGroup();
        mainGroup.set_description(`Keeps your appearance settings in sync and applies them automatically when switching between light and dark modes.
This is a preview of your configuration. Change it using the GNOME tools.`);

        const verticalContainer = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 12,
            hexpand: true,
            margin_top: 4,
            margin_bottom: 8
        });

        verticalContainer.append(this._createModeSection('Light Mode', 'light', 'picture-uri'));
        verticalContainer.append(new Gtk.Separator({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 12, margin_bottom: 12 }));
        verticalContainer.append(this._createModeSection('Dark Mode', 'dark', 'picture-uri-dark'));

        const customRow = new Adw.ActionRow();
        customRow.set_activatable(false);
        customRow.add_suffix(verticalContainer);
        mainGroup.add(customRow);
        page.add(mainGroup);
        this._window.add(page);
    }

    _createModeSection(modeTitle, mode, wallpaperKey) {
        const modeBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, hexpand: true });
        const horizontalContainer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 16, hexpand: true });

        const leftSection = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, hexpand: false, halign: Gtk.Align.START });
        leftSection.append(this._createModeTitleRow(modeTitle));
        leftSection.append(this._createParamsList(mode));

        horizontalContainer.append(leftSection);
        horizontalContainer.append(this._createWallpaperImage(wallpaperKey, mode));
        modeBox.append(horizontalContainer);
        return modeBox;
    }

    _createModeTitleRow(title) {
        const titleBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.START, margin_bottom: 6 });
        const titleLabel = new Gtk.Label({ label: title, halign: Gtk.Align.START, hexpand: true, xalign: 0 });
        titleLabel.add_css_class('title-4');
        titleLabel.add_css_class('mode-title-left');
        titleBox.append(titleLabel);
        return titleBox;
    }

    _createParamsList(mode) {
        const paramsBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, hexpand: false, halign: Gtk.Align.START });
        paramsBox.set_size_request(280, -1);
        paramsBox.add_css_class('param-container');

        const settings = ['gtk-theme', 'shell-theme', 'icon-theme', 'cursor-theme', 'accent-color'];
        settings.forEach(key => paramsBox.append(this._createParamRow(
            key.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
            `${mode}-${key}`,
            key
        )));
        return paramsBox;
    }

    _createParamRow(title, settingsKey, paramType) {
        const rowBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, halign: Gtk.Align.START, hexpand: true });
        rowBox.add_css_class('param-row');
        rowBox.set_size_request(280, -1);

        const titleLabel = new Gtk.Label({ label: title, halign: Gtk.Align.START, hexpand: false, xalign: 0 });
        titleLabel.add_css_class('param-title');
        titleLabel.add_css_class('dim-label');
        titleLabel.set_size_request(130, -1);
        rowBox.append(titleLabel);

        rowBox.append(new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true }));

        const valueContainer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4, halign: Gtk.Align.END, hexpand: false });
        valueContainer.add_css_class('param-value-container');
        valueContainer.set_size_request(150, -1);

        const currentValue = this._settings.get_string(settingsKey) || 'Default';
        const valueLabel = new Gtk.Label({ label: currentValue, halign: Gtk.Align.END, hexpand: true, xalign: 1 });
        valueLabel.add_css_class('param-value');

        if (paramType === 'accent-color' && currentValue !== 'Default') {
            valueLabel.set_size_request(120, -1);
            valueContainer.append(valueLabel);
            const circleLabel = this._createAccentCircle(currentValue);
            valueContainer.append(circleLabel);
            this._accentCircles.set(settingsKey, circleLabel);
        } else {
            valueLabel.set_size_request(150, -1);
            valueContainer.append(valueLabel);
        }

        this._valueLabels.set(settingsKey, { label: valueLabel, type: paramType, container: valueContainer });
        rowBox.append(valueContainer);
        return rowBox;
    }

    _createAccentCircle(colorValue) {
        const circleLabel = new Gtk.Label({ label: '⬤', halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, hexpand: false });
        const colorHex = this._accentColors[colorValue] || this._accentColors['default'];
        const cssProvider = new Gtk.CssProvider();
        cssProvider.load_from_data(`.accent-circle-${colorValue} { color: ${colorHex}; font-size: 12px; margin-left: 2px; min-width: 12px }`, -1);

        circleLabel.get_style_context().add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        circleLabel.get_style_context().add_class(`accent-circle-${colorValue}`);
        circleLabel.add_css_class('accent-circle');
        circleLabel.set_size_request(16, -1);

        return circleLabel;
    }

    _createWallpaperImage(wallpaperKey, mode) {
        const imageBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER, hexpand: false });
        const imageContainer = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
        this._imageWidgets.set(wallpaperKey, imageContainer);
        this._updateWallpaperImage(wallpaperKey, imageContainer);
        imageBox.append(imageContainer);
        return imageBox;
    }

    _updateWallpaperImage(wallpaperKey, imageContainer) {
        let child = imageContainer.get_first_child();
        while (child) {
            const next = child.get_next_sibling();
            imageContainer.remove(child);
            child = next;
        }

        const wallpaperValue = this._backgroundSettings.get_string(wallpaperKey);
        if (wallpaperValue && wallpaperValue !== 'Not set' && wallpaperValue.startsWith('file://')) {
            try {
                const filePath = decodeURIComponent(wallpaperValue.substring(7));
                const file = Gio.File.new_for_path(filePath);
                if (file.query_exists(null)) {
                    const wallpaperImage = new Gtk.Image();
                    wallpaperImage.set_from_file(filePath);
                    wallpaperImage.set_size_request(160, 120);
                    wallpaperImage.add_css_class('wallpaper-vertical-preview');
                    imageContainer.append(wallpaperImage);
                    return;
                }
            } catch {}
        }
        this._addPlaceholderImage(imageContainer, 'image-missing', 'dim-label');
    }

    _addPlaceholderImage(imageContainer, iconName, cssClass) {
        const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
        const icon = new Gtk.Image();
        icon.set_from_icon_name(iconName);
        icon.set_pixel_size(36);
        icon.add_css_class(cssClass);
        box.append(icon);
        imageContainer.append(box);
    }

    _connectSignals() {
        const extensionKeys = [
            'light-gtk-theme', 'light-shell-theme', 'light-icon-theme', 'light-cursor-theme', 'light-accent-color',
            'dark-gtk-theme', 'dark-shell-theme', 'dark-icon-theme', 'dark-cursor-theme', 'dark-accent-color'
        ];

        extensionKeys.forEach(key => {
            const handlerId = this._settings.connect(`changed::${key}`, () => this._updateValueLabel(key));
            this._handlers.push({ settings: this._settings, id: handlerId });
        });

        ['picture-uri', 'picture-uri-dark'].forEach(key => {
            const handlerId = this._backgroundSettings.connect(`changed::${key}`, () => this._updateWallpaperDisplay(key));
            this._handlers.push({ settings: this._backgroundSettings, id: handlerId });
        });
    }

    _updateValueLabel(settingsKey) {
        const valueData = this._valueLabels.get(settingsKey);
        if (!valueData) return;

        const { label, type, container } = valueData;
        const currentValue = this._settings.get_string(settingsKey) || 'Default';
        label.set_label(currentValue);

        if (type === 'accent-color') {
            const existingCircle = this._accentCircles.get(settingsKey);
            if (currentValue !== 'Default') {
                if (existingCircle) {
                    const ctx = existingCircle.get_style_context();
                    Object.keys(this._accentColors).forEach(c => ctx.remove_class(`accent-circle-${c}`));
                    const colorHex = this._accentColors[currentValue] || this._accentColors['default'];
                    const cssProvider = new Gtk.CssProvider();
                    cssProvider.load_from_data(`.accent-circle-${currentValue} { color: ${colorHex} }`, -1);
                    ctx.add_provider(cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
                    ctx.add_class(`accent-circle-${currentValue}`);
                } else {
                    const newCircle = this._createAccentCircle(currentValue);
                    container.append(newCircle);
                    this._accentCircles.set(settingsKey, newCircle);
                }
            } else if (existingCircle) {
                container.remove(existingCircle);
                this._accentCircles.delete(settingsKey);
            }
        }
    }

    _updateWallpaperDisplay(wallpaperKey) {
        const imageContainer = this._imageWidgets.get(wallpaperKey);
        if (imageContainer) this._updateWallpaperImage(wallpaperKey, imageContainer);
    }

    _cleanup() {
        this._handlers.forEach(h => {
            if (h.settings && h.id) h.settings.disconnect(h.id);
        });

        this._handlers = [];
        this._valueLabels?.clear();
        this._imageWidgets?.clear();
        this._accentCircles?.clear();

        this._valueLabels = null;
        this._imageWidgets = null;
        this._accentCircles = null;
        this._settings = null;
        this._backgroundSettings = null;
        this._window = null;
    }

    _showErrorPage(error) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        const row = new Adw.ActionRow();

        row.set_title('Error loading preferences');
        row.set_subtitle(String(error));
        group.add(row);
        page.add(group);
        this._window.add(page);
    }
}

