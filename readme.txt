AppearanceKeeper GNOME Shell Extension

Maintainer: melomane13
License: GPL-3.0-or-later

Overview
--------
AppearanceKeeper automatically saves and restores your desktop appearance for light and dark modes, including wallpapers. GNOME by default does not allow a separate wallpaper for light and dark modes — this extension fills that gap.

It manages:
- Wallpapers (light and dark, independently)
- GTK, icon, cursor, and accent themes
- Shell theme (requires user-theme extension)

The extension listens to system changes and applies your saved preferences automatically when the color scheme changes.

Key Feature: Dual Wallpapers
----------------------------
Unlike GNOME’s default behavior, AppearanceKeeper allows you to:
- Set a specific wallpaper for light mode
- Set a different wallpaper for dark mode
- Switch automatically when the system theme changes

This is achieved by tracking changes to `picture-uri` (light) and `picture-uri-dark` (dark) keys and storing separate URIs in the extension's GSettings schema.

How It Works
------------
User changes wallpaper or theme
           │
           ▼
GSettings 'changed' signal triggered
           │
           ▼
Debounce (50ms to prevent rapid triggers)
           │
           ▼
Wallpaper or theme validated
           │
           ▼
Saved separately for light and dark modes
           │
           ▼
Applied automatically when color scheme changes

Important:
- Light and dark wallpapers are stored independently.
- XML wallpapers are stored directly.
- Special wallpapers in `~/.config/background` are handled safely.
- Rapid successive changes are debounced (50 ms default).

Features
--------
- Automatic Light/Dark Mode Persistence
- Separate wallpapers for light and dark mode (GNOME does not natively support this)
- Theme persistence for GTK, icon, cursor, accent, and shell theme
- Fully automatic, no UI required
- Debug logging available

Limitations
-----------
- Shell theme requires the user-theme extension.
- Some unusual wallpaper formats may not be fully supported.
- Debounce interval is fixed at 50 ms.

License
-------
GPL-3.0-or-later — see LICENSE

