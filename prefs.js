import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WorkspacePillsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        const addSwitch = (group, title, subtitle, key) => {
            const row = new Adw.SwitchRow({ title, subtitle });
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };

        // Appearance
        const appearanceGroup = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(appearanceGroup);

        const createColorRow = (group, title, key) => {
            const row = new Adw.ActionRow({ title });
            const button = new Gtk.ColorButton({ valign: Gtk.Align.CENTER });

            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.get_string(key)))
                button.rgba = rgba;

            button.connect('color-set', () => {
                settings.set_string(key, button.rgba.to_string());
            });

            row.add_suffix(button);
            row.activatable_widget = button;
            group.add(row);
        };

        createColorRow(appearanceGroup, 'Inactive Color', 'inactive-color');
        createColorRow(appearanceGroup, 'Active Color', 'active-color');
        createColorRow(appearanceGroup, 'Hover Color', 'hover-color');
        createColorRow(appearanceGroup, 'Inactive Border Color', 'border-color');
        createColorRow(appearanceGroup, 'Active Border Color', 'active-border-color');

        const createSpinRow = (group, title, key, min, max) => {
            const row = new Adw.ActionRow({ title });
            const spin = Gtk.SpinButton.new_with_range(min, max, 1);
            spin.valign = Gtk.Align.CENTER;
            spin.set_value(settings.get_int(key));

            spin.connect('value-changed', () => {
                settings.set_int(key, spin.get_value_as_int());
            });

            row.add_suffix(spin);
            row.activatable_widget = spin;
            group.add(row);
        };

        createSpinRow(appearanceGroup, 'Border Radius', 'border-radius', 0, 50);
        createSpinRow(appearanceGroup, 'Vertical Padding', 'vertical-padding', 0, 20);
        createSpinRow(appearanceGroup, 'Horizontal Padding', 'horizontal-padding', 0, 30);
        createSpinRow(appearanceGroup, 'Icon Size', 'icon-size', 8, 64);

        addSwitch(appearanceGroup, 'Match Shell Accent Color', 'Use the GNOME Shell accent color for the active pill', 'match-shell-color');

        // Layout
        const layoutGroup = new Adw.PreferencesGroup({ title: 'Layout' });
        page.add(layoutGroup);

        const positions = ['left', 'center', 'right'];
        const positionRow = new Adw.ComboRow({
            title: 'Panel Position',
            subtitle: 'Where the pills are placed in the top bar',
            model: Gtk.StringList.new(['Left', 'Center', 'Right']),
        });
        positionRow.selected = Math.max(0, positions.indexOf(settings.get_string('panel-position')));
        positionRow.connect('notify::selected', () => {
            settings.set_string('panel-position', positions[positionRow.selected]);
        });
        layoutGroup.add(positionRow);

        addSwitch(layoutGroup, 'Show Workspace Number', 'Display the workspace number before its app icons', 'show-workspace-number');
        addSwitch(layoutGroup, 'Show Workspace Name', 'Use the workspace name when one is set (falls back to the number)', 'show-workspace-name');
        addSwitch(layoutGroup, 'Hide Empty Workspaces', 'Only show the active workspace and workspaces with windows', 'hide-empty-workspaces');
        addSwitch(layoutGroup, 'Wrap Scrolling', 'Continue from the end back to the start when scrolling', 'scroll-wrap');
        addSwitch(layoutGroup, 'Show Overview Button', 'Add a pill button that opens the GNOME overview', 'show-overview-button');

        // App Icons
        const iconsGroup = new Adw.PreferencesGroup({
            title: 'App Icons',
            description: 'Left-click an app icon to focus it; click again to cycle its windows.',
        });
        page.add(iconsGroup);

        addSwitch(iconsGroup, 'Close on Middle Click', 'Middle-click an app icon to close all of its windows on the workspace', 'close-on-middle-click');
        addSwitch(iconsGroup, 'Highlight Focused App', 'Underline the icon of the currently focused app', 'highlight-focused-app');
        addSwitch(iconsGroup, 'Highlight Attention', 'Show a dot when an app is requesting attention', 'highlight-attention');
        addSwitch(iconsGroup, 'Dim Minimized Apps', 'Fade icons whose windows are all minimized', 'dim-minimized');

        // Behavior
        const behaviorGroup = new Adw.PreferencesGroup({ title: 'Behavior' });
        page.add(behaviorGroup);

        addSwitch(behaviorGroup, 'Show Activities Button', 'Show the default GNOME activities indicator', 'show-activities');
    }
}
