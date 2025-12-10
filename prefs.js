import GObject from "gi://GObject";
import Gio from "gi://Gio";
import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gdk from "gi://Gdk";
import GdkPixbuf from "gi://GdkPixbuf";
import GLib from "gi://GLib";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

Gio._promisify(Gio.File.prototype, "enumerate_children_async");
Gio._promisify(Gio.FileEnumerator.prototype, "next_files_async");

export default class AppearanceKeeperPrefs extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    this._settings = this.getSettings();
    this._desktopSettings = new Gio.Settings({
      schema: "org.gnome.desktop.background",
    });

    const generalPage = new Adw.PreferencesPage();
    window.add(generalPage);

    collectAllThemes().then((themes) => {
      this._themes = themes;
      this._sortThemesAlphabetically();

      generalPage.add(this._keybindingGroup());
      generalPage.add(this._lightModeGroup());
      generalPage.add(this._darkModeGroup());
      generalPage.add(this._backgroundGroup());
    });

    window.connect("close-request", () => {
      this._settings = null;
      this._themes = null;
      this._desktopSettings = null;
    });
  }

  _sortThemesAlphabetically() {
    const sortByName = (a, b) => a.name.localeCompare(b.name);
    
    if (this._themes.cursor) this._themes.cursor.sort(sortByName);
    if (this._themes.icons) this._themes.icons.sort(sortByName);
    if (this._themes.shell) this._themes.shell.sort(sortByName);
    if (this._themes.gtk3) this._themes.gtk3.sort(sortByName);
  }

  _keybindingGroup() {
    const group = new Adw.PreferencesGroup({
      title: _("Keyboard Shortcut"),
    });

    const keybindingRow = buildKeybindingRow({
      title: _("Toggle Dark/Light Mode"),
      settings: this._settings,
      key: "dark-light-toggle",
    });

    group.add(keybindingRow);
    return group;
  }

  _lightModeGroup() {
    const group = new Adw.PreferencesGroup({
      title: _("Light Mode"),
    });

    const accentColors = [
      { name: _("Blue"), value: "blue", color: "#1c71d8" },
      { name: _("Teal"), value: "teal", color: "#26a269" },
      { name: _("Green"), value: "green", color: "#2ec27e" },
      { name: _("Yellow"), value: "yellow", color: "#e5a50a" },
      { name: _("Orange"), value: "orange", color: "#ff7800" },
      { name: _("Red"), value: "red", color: "#e01b24" },
      { name: _("Pink"), value: "pink", color: "#e4679d" },
      { name: _("Purple"), value: "purple", color: "#9141ac" },
      { name: _("Slate"), value: "slate", color: "#667885" },
    ];

    group.add(buildAccentDropDown({
      title: _("Accent Color"),
      items: accentColors,
      selected: this._settings.get_string("light-accent-color"),
      bind: [this._settings, "light-accent-color"],
    }));

    group.add(buildDropDown({
      title: _("Cursor"),
      items: this._themes.cursor,
      selected: this._settings.get_string("light-cursor-theme"),
      bind: [this._settings, "light-cursor-theme"],
    }));

    group.add(buildDropDown({
      title: _("Icons"),
      items: this._themes.icons,
      selected: this._settings.get_string("light-icon-theme"),
      bind: [this._settings, "light-icon-theme"],
    }));

    group.add(buildDropDown({
      title: _("Legacy Applications"),
      items: this._themes.gtk3,
      selected: this._settings.get_string("light-gtk-theme"),
      bind: [this._settings, "light-gtk-theme"],
    }));

    group.add(buildDropDown({
      title: _("Shell"),
      items: this._themes.shell,
      selected: this._settings.get_string("light-shell-theme"),
      bind: [this._settings, "light-shell-theme"],
    }));

    return group;
  }

  _darkModeGroup() {
    const group = new Adw.PreferencesGroup({
      title: _("Dark Mode"),
    });

    const accentColors = [
      { name: _("Blue"), value: "blue", color: "#1c71d8" },
      { name: _("Teal"), value: "teal", color: "#26a269" },
      { name: _("Green"), value: "green", color: "#2ec27e" },
      { name: _("Yellow"), value: "yellow", color: "#e5a50a" },
      { name: _("Orange"), value: "orange", color: "#ff7800" },
      { name: _("Red"), value: "red", color: "#e01b24" },
      { name: _("Pink"), value: "pink", color: "#e4679d" },
      { name: _("Purple"), value: "purple", color: "#9141ac" },
      { name: _("Slate"), value: "slate", color: "#667885" },
    ];

    group.add(buildAccentDropDown({
      title: _("Accent Color"),
      items: accentColors,
      selected: this._settings.get_string("dark-accent-color"),
      bind: [this._settings, "dark-accent-color"],
    }));

    group.add(buildDropDown({
      title: _("Cursor"),
      items: this._themes.cursor,
      selected: this._settings.get_string("dark-cursor-theme"),
      bind: [this._settings, "dark-cursor-theme"],
    }));

    group.add(buildDropDown({
      title: _("Icons"),
      items: this._themes.icons,
      selected: this._settings.get_string("dark-icon-theme"),
      bind: [this._settings, "dark-icon-theme"],
    }));

    group.add(buildDropDown({
      title: _("Legacy Applications"),
      items: this._themes.gtk3,
      selected: this._settings.get_string("dark-gtk-theme"),
      bind: [this._settings, "dark-gtk-theme"],
    }));

    group.add(buildDropDown({
      title: _("Shell"),
      items: this._themes.shell,
      selected: this._settings.get_string("dark-shell-theme"),
      bind: [this._settings, "dark-shell-theme"],
    }));

    return group;
  }

  _backgroundGroup() {
    const group = new Adw.PreferencesGroup({
      title: _("Wallpapers"),
    });

    group.add(buildBackgroundPreviewRow({
      desktopSettings: this._desktopSettings,
    }));

    return group;
  }
}

const DropdownItems = GObject.registerClass({
  Properties: {
    name: GObject.ParamSpec.string("name", "name", "name", GObject.ParamFlags.READWRITE, null),
    value: GObject.ParamSpec.string("value", "value", "value", GObject.ParamFlags.READWRITE, null),
  },
}, class DropdownItems extends GObject.Object {
  _init(name, value) {
    super._init({ name, value });
  }
});

const AccentItems = GObject.registerClass({
  Properties: {
    name: GObject.ParamSpec.string("name", "name", "name", GObject.ParamFlags.READWRITE, null),
    value: GObject.ParamSpec.string("value", "value", "value", GObject.ParamFlags.READWRITE, null),
    color: GObject.ParamSpec.string("color", "color", "color", GObject.ParamFlags.READWRITE, null),
  },
}, class AccentItems extends GObject.Object {
  _init(name, value, color) {
    super._init({ name, value, color });
  }
});

function buildDropDown(opts) {
  const liststore = new Gio.ListStore({ item_type: DropdownItems });
  
  for (const item of opts.items) {
    liststore.append(new DropdownItems(item.name, item.value));
  }

  let selected = -1;
  for (let i = 0; i < liststore.get_n_items(); i++) {
    if (liststore.get_item(i).value === opts.selected) {
      selected = i;
      break;
    }
  }

  const comboRow = new Adw.ComboRow({
    title: opts.title,
    model: liststore,
    expression: new Gtk.PropertyExpression(DropdownItems, null, "name"),
    selected: selected,
  });

  if (opts.bind) {
    comboRow.connect("notify::selected", () => {
      if (comboRow.selectedItem) {
        opts.bind[0].set_string(opts.bind[1], comboRow.selectedItem.value);
      }
    });
  }

  return comboRow;
}

function buildAccentDropDown(opts) {
  const liststore = new Gio.ListStore({ item_type: AccentItems });
  
  for (const item of opts.items) {
    liststore.append(new AccentItems(item.name, item.value, item.color));
  }

  let selected = -1;
  for (let i = 0; i < liststore.get_n_items(); i++) {
    if (liststore.get_item(i).value === opts.selected) {
      selected = i;
      break;
    }
  }

  const factory = new Gtk.SignalListItemFactory();
  
  factory.connect("setup", (factory, list_item) => {
    const label = new Gtk.Label({
      xalign: 0,
      hexpand: true,
      use_markup: true,
    });
    list_item.set_child(label);
  });
  
  factory.connect("bind", (factory, list_item) => {
    const item = list_item.get_item();
    const label = list_item.get_child();
    const coloredText = `<span foreground="${item.color}">${item.name}</span>`;
    label.set_markup(coloredText);
  });

  const comboRow = new Adw.ComboRow({
    title: opts.title,
    model: liststore,
    selected: selected,
    factory: factory,
    expression: new Gtk.PropertyExpression(AccentItems, null, "name"),
  });

  if (opts.bind) {
    comboRow.connect("notify::selected", () => {
      if (comboRow.selectedItem) {
        opts.bind[0].set_string(opts.bind[1], comboRow.selectedItem.value);
      }
    });
  }

  return comboRow;
}

function createImagePreview(uri, width = 150, height = 100) {
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    width_request: width,
  });

  const picture = new Gtk.Picture({
    width_request: width,
    height_request: height,
    can_shrink: true,
    content_fit: Gtk.ContentFit.COVER,
  });

  if (uri && uri.trim() !== '') {
    let filePath = uri.replace("file://", "");
    
    if (uri.includes('%')) {
      filePath = decodeURIComponent(uri).replace("file://", "");
    }
    
    const file = Gio.File.new_for_path(filePath);
    if (file.query_exists(null)) {
      const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(
        filePath,
        width * 2,
        height * 2,
        true
      );
      const texture = Gdk.Texture.new_for_pixbuf(pixbuf);
      picture.set_paintable(texture);
    }
  }

  const frame = new Gtk.Frame({
    child: picture,
    css_classes: ["card"],
  });

  box.append(frame);
  return box;
}

function buildBackgroundPreviewRow(opts) {
  const previewContainer = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 20,
    margin_top: 12,
    margin_bottom: 12,
    margin_start: 12,
    margin_end: 12,
    halign: Gtk.Align.CENTER,
  });

  const lightBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    hexpand: true,
  });

  lightBox.append(new Gtk.Label({
    label: `<b>${_("Light Mode")}</b>`,
    use_markup: true,
    xalign: 0,
  }));

  const lightUri = opts.desktopSettings.get_string("picture-uri");
  lightBox.append(createImagePreview(lightUri));

  const lightButton = new Gtk.Button({
    label: _("Choose Image"),
    halign: Gtk.Align.CENTER,
  });
  lightBox.append(lightButton);

  const darkBox = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    hexpand: true,
  });

  darkBox.append(new Gtk.Label({
    label: `<b>${_("Dark Mode")}</b>`,
    use_markup: true,
    xalign: 0,
  }));

  const darkUri = opts.desktopSettings.get_string("picture-uri-dark");
  darkBox.append(createImagePreview(darkUri));

  const darkButton = new Gtk.Button({
    label: _("Choose Image"),
    halign: Gtk.Align.CENTER,
  });
  darkBox.append(darkButton);

  previewContainer.append(lightBox);
  previewContainer.append(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));
  previewContainer.append(darkBox);

  const updatePreview = (box, uri) => {
    const oldPreview = box.get_first_child().get_next_sibling();
    const newPreview = createImagePreview(uri);
    box.remove(oldPreview);
    box.insert_child_after(newPreview, box.get_first_child());
  };

  lightButton.connect("clicked", () => {
    const dialog = Gtk.FileChooserNative.new(
      _("Choose Light Mode Background"),
      previewContainer.get_root(),
      Gtk.FileChooserAction.OPEN,
      _("Open"),
      _("Cancel")
    );

    const filter = new Gtk.FileFilter();
    filter.set_name(_("Images"));
    filter.add_mime_type("image/jpeg");
    filter.add_mime_type("image/jpg");
    filter.add_mime_type("image/png");
    filter.add_mime_type("image/webp");
    filter.add_mime_type("image/bmp");
    filter.add_mime_type("image/svg+xml");
    dialog.add_filter(filter);

    const picturesPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
    if (picturesPath) {
      dialog.set_current_folder(Gio.File.new_for_path(picturesPath));
    }

    dialog.connect("response", (dlg, response) => {
      if (response === Gtk.ResponseType.ACCEPT) {
        const file = dlg.get_file();
        if (file) {
          const uri = file.get_uri();
          if (uri) {
            opts.desktopSettings.set_string("picture-uri", uri);
            updatePreview(lightBox, uri);
          }
        }
      }
      dlg.destroy();
    });

    dialog.set_modal(true);
    dialog.show();
  });

  darkButton.connect("clicked", () => {
    const dialog = Gtk.FileChooserNative.new(
      _("Choose Dark Mode Background"),
      previewContainer.get_root(),
      Gtk.FileChooserAction.OPEN,
      _("Open"),
      _("Cancel")
    );

    const filter = new Gtk.FileFilter();
    filter.set_name(_("Images"));
    filter.add_mime_type("image/jpeg");
    filter.add_mime_type("image/jpg");
    filter.add_mime_type("image/png");
    filter.add_mime_type("image/webp");
    filter.add_mime_type("image/bmp");
    filter.add_mime_type("image/svg+xml");
    dialog.add_filter(filter);

    const picturesPath = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
    if (picturesPath) {
      dialog.set_current_folder(Gio.File.new_for_path(picturesPath));
    }

    dialog.connect("response", (dlg, response) => {
      if (response === Gtk.ResponseType.ACCEPT) {
        const file = dlg.get_file();
        if (file) {
          const uri = file.get_uri();
          if (uri) {
            opts.desktopSettings.set_string("picture-uri-dark", uri);
            updatePreview(darkBox, uri);
          }
        }
      }
      dlg.destroy();
    });

    dialog.set_modal(true);
    dialog.show();
  });

  return new Adw.PreferencesRow({
    child: previewContainer,
  });
}

function buildKeybindingRow(opts) {
  const row = new Adw.ActionRow({
    title: opts.title,
  });

  const keybinding = opts.settings.get_strv(opts.key)[0] || "";
  
  const button = new Gtk.Button({
    label: keybinding || _("Disabled"),
    valign: Gtk.Align.CENTER,
    has_frame: true,
  });

  const updateButtonLabel = () => {
    const currentBinding = opts.settings.get_strv(opts.key)[0];
    button.label = currentBinding || _("Disabled");
  };

  button.connect("clicked", () => {
    const dialog = new Gtk.MessageDialog({
      transient_for: row.get_root(),
      modal: true,
      buttons: Gtk.ButtonsType.CANCEL,
      message_type: Gtk.MessageType.INFO,
      text: _("Press a key combination"),
      secondary_text: _("Press Escape to cancel or Backspace to disable the shortcut"),
    });

    const controller = new Gtk.EventControllerKey();
    
    controller.connect("key-pressed", (ctrl, keyval, keycode, state) => {
      let mask = state & Gtk.accelerator_get_default_mod_mask();
      mask &= ~Gdk.ModifierType.LOCK_MASK;

      if (keyval === Gdk.KEY_Escape) {
        dialog.close();
        return Gdk.EVENT_STOP;
      }

      if (keyval === Gdk.KEY_BackSpace) {
        opts.settings.set_strv(opts.key, []);
        updateButtonLabel();
        dialog.close();
        return Gdk.EVENT_STOP;
      }

      if (
        keyval === Gdk.KEY_Control_L ||
        keyval === Gdk.KEY_Control_R ||
        keyval === Gdk.KEY_Shift_L ||
        keyval === Gdk.KEY_Shift_R ||
        keyval === Gdk.KEY_Alt_L ||
        keyval === Gdk.KEY_Alt_R ||
        keyval === Gdk.KEY_Super_L ||
        keyval === Gdk.KEY_Super_R
      ) {
        return Gdk.EVENT_STOP;
      }

      const binding = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);

      if (binding) {
        opts.settings.set_strv(opts.key, [binding]);
        updateButtonLabel();
        dialog.close();
      }

      return Gdk.EVENT_STOP;
    });

    dialog.add_controller(controller);
    dialog.present();
  });

  row.add_suffix(button);
  row.activatable_widget = button;

  return row;
}

// Theme collection utilities
function getDirs(type) {
  const fn = (...args) => GLib.build_filenamev(args);
  return [
    fn(GLib.get_home_dir(), "." + type),
    fn(GLib.get_user_data_dir(), type),
    ...GLib.get_system_data_dirs().map((dir) => fn(dir, type)),
  ];
}

function getModeThemeDirs() {
  const fn = (...args) => GLib.build_filenamev(args);
  return GLib.get_system_data_dirs().map((dir) => fn(dir, "gnome-shell", "theme"));
}

function isPathExist(path) {
  return GLib.access(path, 0) === 0;
}

async function readDir(dir) {
  const fileInfos = [];
  let fileEnum;
  
  try {
    fileEnum = await dir.enumerate_children_async(
      Gio.FILE_ATTRIBUTE_STANDARD_NAME,
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      null
    );
  } catch (e) {
    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) {
      logError(e);
    }
    return [];
  }
  
  let infos;
  do {
    infos = await fileEnum.next_files_async(100, GLib.PRIORITY_DEFAULT, null);
    fileInfos.push(...infos);
  } while (infos.length > 0);
  
  return fileInfos.map((info) => info.get_name());
}

async function getThemes(type) {
  const fn = (...args) => GLib.build_filenamev(args);
  const paths = [];
  
  await Promise.all(
    getDirs(type).map(async (dirName) => {
      const dir = Gio.File.new_for_path(dirName);
      (await readDir(dir)).forEach((name) => paths.push(fn(dirName, name)));
    })
  );
  
  return paths;
}

async function collectAllThemes() {
  const fn = (...args) => GLib.build_filenamev(args);
  const DEFAULT = { name: "Adwaita (Default)", value: "Adwaita" };
  const themes = {
    cursor: [],
    icons: [],
    shell: [],
    gtk3: [
      { name: "HighContrast", value: "HighContrast" },
      { name: "HighContrastInverse", value: "HighContrastInverse" },
    ],
  };
  
  const themePaths = await getThemes("themes");
  const iconPaths = await getThemes("icons");
  
  for (const themepath of themePaths) {
    const value = themepath.split("/").pop();
    const name = value.charAt(0).toUpperCase() + value.slice(1);
    
    if (
      isPathExist(fn(themepath, "gtk-3.0", "gtk.css")) &&
      !themes.gtk3.some((e) => e.value === value)
    ) {
      themes.gtk3.push({ name, value });
    }
    
    if (
      isPathExist(fn(themepath, "gnome-shell", "gnome-shell.css")) &&
      !themes.shell.some((e) => e.value === value)
    ) {
      themes.shell.push({ name, value });
    }
  }
  
  for (const themepath of iconPaths) {
    const value = themepath.split("/").pop();
    const name = value.charAt(0).toUpperCase() + value.slice(1);
    
    if (isPathExist(fn(themepath, "cursors")) && !themes.cursor.some((e) => e.value === value)) {
      themes.cursor.push({ name, value });
    }
    
    if (isPathExist(fn(themepath, "index.theme")) && !themes.icons.some((e) => e.value === value)) {
      themes.icons.push({ name, value });
    }
  }
  
  for (const dirName of getModeThemeDirs()) {
    const dir = Gio.File.new_for_path(dirName);
    for (const filename of await readDir(dir)) {
      if (!filename.endsWith(".css")) continue;
      const value = filename.slice(0, -4);
      const name = value.charAt(0).toUpperCase() + value.slice(1);
      themes.shell.push({ name, value });
    }
  }
  
  ["gtk3", "shell", "cursor", "icons"].forEach((type) => {
    themes[type].sort((a, b) => a.name.localeCompare(b.value));
    const isAdwaitaAlreadyExist = themes[type].find((e) => e.name === "Adwaita");
    if (isAdwaitaAlreadyExist) {
      isAdwaitaAlreadyExist.name += " (Default)";
    } else {
      themes[type].unshift(DEFAULT);
    }
  });
  
  return themes;
}
