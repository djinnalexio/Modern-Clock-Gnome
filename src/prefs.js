// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import * as Config from 'resource:///org/gnome/Shell/Extensions/js/misc/config.js';

import { createAboutRow } from './prefsModules/about.js';

export default class ModernClockPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const shellVersion = parseFloat(Config.PACKAGE_VERSION);

        // Check if Anurati can render the weekdays (only ships A–Z)
        const anuratiGlyphs = /^[A-Z ]+$/;
        const weekdays = [1, 2, 3, 4, 5, 6, 7]
            .map(d => GLib.DateTime.new_local(2024, 1, d, 0, 0, 0).format('%A').toUpperCase())
            .join('');
        const anuratiCoversLocale = anuratiGlyphs.test(weekdays);

        // Page
        const page = new Adw.PreferencesPage({
            title: this.metadata.name,
            icon_name: 'preferences-system-time-symbolic',
        });

        window.default_width = 400;
        window.default_height = 660;
        window.add(page);

        //#region About
        const aboutGroup = new Adw.PreferencesGroup({ title: _('Information') });
        page.add(aboutGroup);

        const aboutRow = new createAboutRow(this.metadata);
        aboutGroup.add(aboutRow);
        //#endregion

        //#region Layout Group
        const layoutGroup = new Adw.PreferencesGroup({ title: _('Layout') });
        page.add(layoutGroup);

        function addMarkedSlider(title, key, marks, inverted = false) {
            const axisRow = new Adw.PreferencesRow({ title, activatable: false });
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
                margin_top: 4,
                margin_bottom: 4,
            });
            axisScale.add_mark(0.1, Gtk.PositionType.TOP, marks[0]);
            axisScale.add_mark(0.25, Gtk.PositionType.TOP, null);
            axisScale.add_mark(0.5, Gtk.PositionType.TOP, null);
            axisScale.add_mark(0.75, Gtk.PositionType.TOP, null);
            axisScale.add_mark(0.9, Gtk.PositionType.TOP, marks[1]);
            axisRow.set_child(axisScale);
            settings.bind(key, axisScale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
            layoutGroup.add(axisRow);
        }

        // Horizontal
        addMarkedSlider(_('Horizontal'), 'position-x', [_('Left'), _('Right')]);

        // Vertical
        addMarkedSlider(_('Vertical'), 'position-y', [_('Top'), _('Bottom')], true);

        // Scale
        addMarkedSlider(_('Scale'), 'scale', [_('Small'), _('Large')]);
        //#endregion

        //#region Language Group
        // only relevant if the time format language isn't already in English
        const isLcTimeEnglish =
            GLib.get_language_names_with_category('LC_TIME')[0].startsWith('en');

        if (!isLcTimeEnglish) {
            const langGroup = new Adw.PreferencesGroup({ title: _('Language') });
            page.add(langGroup);

            // 'system'=0, 'auto'=1, 'english'=2
            const langModes = [
                {
                    label: _('System'),
                    hint: _(
                        'Always use your time format language. Some characters may appear in a different font.'
                    ),
                },
                {
                    label: _('Auto'),
                    hint: _(
                        'Use your time format language unless the weekday font cannot display every weekday.'
                    ),
                },
                {
                    label: _('English'),
                    hint: _('Always use English.'),
                },
            ];
            const currentMode = settings.get_enum('language-mode');

            // Subtitle/Hint
            const langSubRow = new Adw.PreferencesRow({ activatable: false });
            const langSubLabel = new Gtk.Label({
                wrap: true,
                justify: Gtk.Justification.CENTER,
                hexpand: true,
                margin_start: 12,
                margin_end: 12,
                margin_top: 8,
                margin_bottom: 8,
                css_classes: ['subtitle'],
            });
            function updateLangSub(keyIndex) {
                langSubLabel.set_label(langModes[keyIndex].hint);
            }
            langSubRow.set_child(langSubLabel);

            // Language Toggle
            let langRow;
            if (shellVersion >= 48) {
                langRow = new Adw.PreferencesRow({
                    title: _('Mode'),
                    activatable: false,
                });

                const langToggleGroup = new Adw.ToggleGroup({
                    valign: Gtk.Align.CENTER,
                    homogeneous: true,
                    margin_start: 12,
                    margin_end: 12,
                    margin_top: 8,
                    margin_bottom: 8,
                });
                langModes.forEach(mode =>
                    langToggleGroup.add(new Adw.Toggle({ label: mode.label }))
                );
                langToggleGroup.set_active(currentMode);
                updateLangSub(currentMode);

                langToggleGroup.connect('notify::active', () => {
                    const index = langToggleGroup.get_active();
                    settings.set_enum('language-mode', index);
                    updateLangSub(index);
                });

                langRow.set_child(langToggleGroup);
            } else {
                langRow = new Adw.ComboRow({
                    title: _('Mode'),
                    model: Gtk.StringList.new(langModes.map(mode => mode.label)),
                    selected: settings.get_enum('language-mode'),
                });
                updateLangSub(currentMode);
                langRow.connect('notify::selected', () => {
                    settings.set_enum('language-mode', langRow.get_selected());
                    updateLangSub(langRow.get_selected());
                });
            }
            langGroup.add(langRow);
            langGroup.add(langSubRow);
        }
        //#endregion

        //#region Date Group
        const dateGroup = new Adw.PreferencesGroup({ title: _('Date') });
        page.add(dateGroup);

        // Date format
        function updateFormatExampleList(comboRow) {
            const mode = settings.get_string('language-mode');
            const useEnglish = mode === 'english' || (mode === 'auto' && !anuratiCoversLocale);

            const exampleDate = GLib.DateTime.new_local(2026, 9, 1, 0, 0, 0);
            // prettier-ignore
            const strings = useEnglish
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
        settings.connect('changed::language-mode', () => updateFormatExampleList(dateFormatRow));
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
        if (shellVersion >= 48) {
            timeFormatRow = new Adw.ActionRow({ title: _('Format') });
            const timeFormatToggleGroup = new Adw.ToggleGroup({
                valign: Gtk.Align.CENTER,
                homogeneous: true,
            });
            timeFormatToggleGroup.add(new Adw.Toggle({ label: _('24-hour'), name: '24h' }));
            timeFormatToggleGroup.add(new Adw.Toggle({ label: _('AM / PM'), name: 'ampm' }));
            timeFormatToggleGroup.set_active(settings.get_boolean('use-24h') ? 0 : 1);
            timeFormatRow.add_suffix(timeFormatToggleGroup);
            timeFormatToggleGroup.connect('notify::active', () =>
                settings.set_boolean('use-24h', timeFormatToggleGroup.get_active() === 0)
            );
        } else {
            timeFormatRow = new Adw.ComboRow({
                title: _('Format'),
                model: Gtk.StringList.new([_('24-hour'), _('AM / PM')]),
                selected: settings.get_boolean('use-24h') ? 0 : 1,
            });
            timeFormatRow.connect('notify::selected', widget =>
                settings.set_boolean('use-24h', widget.get_selected() === 0)
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
