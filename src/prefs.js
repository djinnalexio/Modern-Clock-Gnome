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

export default class ModernClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Page
        const page = new Adw.PreferencesPage({
            title: 'Modern Clock',
            icon_name: 'preferences-system-time-symbolic',
        });

        window.default_width = 270;
        window.default_height = 660;
        window.add(page);

        //#region Position Group
        const positionGroup = new Adw.PreferencesGroup({ title: _('Position') });
        page.add(positionGroup);

        // Horizontal
        const horizontalPositionRow = new Adw.ComboRow({
            title: _('Horizontal Alignment'),
            model: Gtk.StringList.new([_('Left'), _('Center'), _('Right')]),
            selected: settings.get_enum('horizontal-position'),
        });
        horizontalPositionRow.connect('notify::selected', widget =>
            settings.set_enum('horizontal-position', widget.get_selected())
        );
        positionGroup.add(horizontalPositionRow);

        // Vertical
        const verticalPositionRow = new Adw.ComboRow({
            title: _('Vertical Alignment'),
            model: Gtk.StringList.new([_('Top'), _('Center'), _('Bottom')]),
            selected: settings.get_enum('vertical-position'),
        });
        verticalPositionRow.connect('notify::selected', widget =>
            settings.set_enum('vertical-position', widget.get_selected())
        );
        positionGroup.add(verticalPositionRow);

        // Border
        const borderRow = new Adw.ActionRow({ title: _('Border') });
        const borderScale = new Gtk.Scale({
            orientation: Gtk.Orientation.HORIZONTAL,
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 0.4,
                step_increment: 0.01,
                page_increment: 0.05,
            }),
            digits: 2,
            round_digits: 2,
            hexpand: true,
            valign: Gtk.Align.CENTER,
        });
        borderRow.add_suffix(borderScale);
        settings.bind('border', borderScale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        positionGroup.add(borderRow);

        //#region Date Group
        const dateGroup = new Adw.PreferencesGroup({ title: _('Date') });
        page.add(dateGroup);

        // Date Language — only relevant if the time and date information isn't already in English
        const isLcTimeEnglish =
            GLib.get_language_names_with_category('LC_TIME')[0].startsWith('en');
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

        //#region Time group
        const timeGroup = new Adw.PreferencesGroup({ title: _('Time') });
        page.add(timeGroup);

        // Time format
        let timeFormatRow;
        // 'Adw.ToggleGroup' available in GNOME 47+
        if (Adw.ToggleGroup) {
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
    }
}
