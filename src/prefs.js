// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-only

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

export default class ModernClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const shellVersion = parseFloat(Config.PACKAGE_VERSION);

        // Page
        const page = new Adw.PreferencesPage({
            title: this.metadata.name,
            icon_name: 'preferences-system-time-symbolic',
        });

        window.default_width = 380;
        window.default_height = 620;
        window.add(page);

        //#region Position Group
        const positionGroup = new Adw.PreferencesGroup({ title: _('Position') });
        page.add(positionGroup);

        function addPositionSlider(key, marks, inverted) {
            const axisRow = new Adw.PreferencesRow({ activatable: false });
            const axisScale = new Gtk.Scale({
                adjustment: new Gtk.Adjustment({
                    lower: 0,
                    upper: 1,
                    step_increment: 0.01,
                    page_increment: 0.1,
                }),
                digits: 2,
                round_digits: 2,
                orientation: Gtk.Orientation.HORIZONTAL,
                inverted,
                hexpand: true,
                valign: Gtk.Align.CENTER,
                has_origin: false,
                margin_start: 12,
                margin_end: 12,
                margin_top: 8,
                margin_bottom: 8,
            });
            axisScale.add_mark(0.1, Gtk.PositionType.TOP, marks[0]);
            axisScale.add_mark(0.25, Gtk.PositionType.TOP, null);
            axisScale.add_mark(0.5, Gtk.PositionType.TOP, null);
            axisScale.add_mark(0.75, Gtk.PositionType.TOP, null);
            axisScale.add_mark(0.9, Gtk.PositionType.TOP, marks[1]);
            axisRow.set_child(axisScale);
            settings.bind(key, axisScale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
            positionGroup.add(axisRow);
        }

        // Horizontal
        addPositionSlider('position-x', [_('Left'), _('Right')], false);

        // Vertical
        addPositionSlider('position-y', [_('Top'), _('Bottom')], true);
        //#endregion

        //#region Date Group
        const dateGroup = new Adw.PreferencesGroup({ title: _('Date') });
        page.add(dateGroup);

        // Date Language — only relevant if the time and date information isn't already in English
        let isLcTimeEnglish;
        // On older versions, `GLib.get_language_names_with_category` doesn't get the user locale setting override
        if (shellVersion >= 47) {
            isLcTimeEnglish = GLib.get_language_names_with_category('LC_TIME')[0].startsWith('en');
        } else {
            const localeSettings = new Gio.Settings({ schema_id: 'org.gnome.system.locale' });
            isLcTimeEnglish = localeSettings.get_string('region').startsWith('en');
        }

        if (!isLcTimeEnglish) {
            const englishRow = new Adw.SwitchRow({ title: _('English Date') });
            settings.bind('use-english', englishRow, 'active', Gio.SettingsBindFlags.DEFAULT);
            dateGroup.add(englishRow);
        }

        // Date format
        function updateFormatExampleList(comboRow) {
            const exampleDate = GLib.DateTime.new_local(2026, 9, 1, 0, 0, 0);
            // prettier-ignore
            const strings = settings.get_boolean('use-english')
                ? ['01.09.2026', '01 SEP 2026', '01 SEPTEMBER 2026']
                : [
                    exampleDate.format('%d.%m.%Y').toUpperCase(),
                    exampleDate.format('%d %b %Y').toUpperCase(),
                    exampleDate.format('%d %B %Y').toUpperCase(),
                ];
            comboRow.model.splice(0, comboRow.model.get_n_items(), strings);
        }
        const dateFormatRow = new Adw.ComboRow({
            title: _('Format'),
            model: Gtk.StringList.new([]),
        });
        updateFormatExampleList(dateFormatRow);
        dateFormatRow.set_selected(settings.get_enum('date-format'));
        dateFormatRow.connect('notify::selected', () =>
            settings.set_enum('date-format', dateFormatRow.get_selected())
        );
        settings.connect('changed::use-english', () => updateFormatExampleList(dateFormatRow));
        dateGroup.add(dateFormatRow);

        // Date Decoration
        const dateDecoRow = new Adw.ActionRow({ title: _('Decoration') });
        const dateDecoEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            max_width_chars: 12,
            buffer: new Gtk.EntryBuffer({ text: settings.get_string('date-deco') }),
        });
        settings.bind('date-deco', dateDecoEntry.buffer, 'text', Gio.SettingsBindFlags.DEFAULT);
        dateDecoRow.add_suffix(dateDecoEntry);
        dateGroup.add(dateDecoRow);
        //#endregion

        //#region Time group
        const timeGroup = new Adw.PreferencesGroup({ title: _('Time') });
        page.add(timeGroup);

        // Time format
        let timeFormatRow;
        if (shellVersion >= 47) {
            timeFormatRow = new Adw.ActionRow({ title: _('Format') });
            const timeFormatToggleGroup = new Adw.ToggleGroup({
                valign: Gtk.Align.CENTER,
                homogeneous: true,
            });
            timeFormatToggleGroup.add(new Adw.Toggle({ label: _('24-hour'), name: '24h' }));
            timeFormatToggleGroup.add(new Adw.Toggle({ label: _('AM / PM'), name: 'ampm' }));
            timeFormatToggleGroup.set_active(settings.get_enum('time-format'));
            timeFormatRow.add_suffix(timeFormatToggleGroup);
            timeFormatToggleGroup.connect('notify::active', () =>
                settings.set_enum('time-format', timeFormatToggleGroup.get_active())
            );
        } else {
            timeFormatRow = new Adw.ComboRow({
                title: _('Format'),
                model: Gtk.StringList.new([_('24-hour'), _('AM / PM')]),
                selected: settings.get_enum('time-format'),
            });
            timeFormatRow.connect('notify::selected', widget =>
                settings.set_enum('time-format', widget.get_selected())
            );
        }
        timeGroup.add(timeFormatRow);

        // Time Decoration
        const timeDecoRow = new Adw.ActionRow({ title: _('Decoration') });
        const timeDecoEntry = new Gtk.Entry({
            valign: Gtk.Align.CENTER,
            max_width_chars: 12,
            buffer: new Gtk.EntryBuffer({
                text: settings.get_string('time-deco'),
            }),
        });
        settings.bind('time-deco', timeDecoEntry.buffer, 'text', Gio.SettingsBindFlags.DEFAULT);
        timeDecoRow.add_suffix(timeDecoEntry);
        timeGroup.add(timeDecoRow);
        //#endregion
    }
}
