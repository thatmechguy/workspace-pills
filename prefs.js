import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class WorkspacePillsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({ title: 'Appearance' });
        page.add(group);

        // Helper to create color rows
        const createColorRow = (title, key) => {
            const row = new Adw.ActionRow({ title: title });
            const button = new Gtk.ColorButton({
                valign: Gtk.Align.CENTER,
            });
            
            const rgba = new Gdk.RGBA();
            if (rgba.parse(settings.get_string(key))) {
                button.rgba = rgba;
            }

            button.connect('color-set', () => {
                settings.set_string(key, button.rgba.to_string());
            });

            row.add_suffix(button);
            group.add(row);
        };

        createColorRow('Inactive Color', 'inactive-color');
        createColorRow('Active Color', 'active-color');
        createColorRow('Hover Color', 'hover-color');

        // Size and Shape
        const createSpinRow = (title, key, min, max) => {
            const row = new Adw.ActionRow({ title: title });
            const spin = Gtk.SpinButton.new_with_range(min, max, 1);
            spin.valign = Gtk.Align.CENTER;
            spin.set_value(settings.get_int(key));

            spin.connect('value-changed', () => {
                settings.set_int(key, spin.get_value_as_int());
            });

            row.add_suffix(spin);
            group.add(row);
        };

        createSpinRow('Border Radius', 'border-radius', 0, 50);
        createSpinRow('Vertical Padding', 'vertical-padding', 0, 20);
        createSpinRow('Horizontal Padding', 'horizontal-padding', 0, 30);
        createSpinRow('Icon Size', 'icon-size', 8, 64);

        // Behavior Group
        const behaviorGroup = new Adw.PreferencesGroup({ title: 'Behavior' });
        page.add(behaviorGroup);

        const activitiesRow = new Adw.SwitchRow({
            title: 'Show Activities Button',
            subtitle: 'Show the default GNOME activities indicator',
        });
        activitiesRow.set_active(settings.get_boolean('show-activities'));
        activitiesRow.connect('notify::active', () => {
            settings.set_boolean('show-activities', activitiesRow.get_active());
        });
        behaviorGroup.add(activitiesRow);

        window.add(page);
    }
}