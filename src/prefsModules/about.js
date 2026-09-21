// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

//#region Imports
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import {
    gettext as _,
    pgettext,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
//#endregion

//#region Credits
// Feel free to add your name and url in the relevant section below if you have contributed.

// Translators do not need to write in this file and must instead use the "translator_credits"
// string located in the translation files.
const artists = [];
const designers = [];
const developers = [
    'Tony Rain https://github.com/Tony-Rain',
    'Djinn Alexio https://gitlab.gnome.org/DjinnAlexio',
];
const documenters = [];

const extensionIcon = '';
const copyright = '© 2026 Modern Clock for GNOME Contributors';
const developerName = 'Modern Clock for GNOME Contributors';
const issueUrl = 'https://github.com/Tony-Rain/Modern-Clock-Gnome/issues';
const licenseType = Gtk.License.GPL_3_0;
// The string for `release_notes` supports paragraphs <p>, emphasis (italics) <em>, code <code>,
// and ordered <ol> and unordered <ul> lists with <li> list items.
const releaseNotes = ``;
const supportUrl = '';
//#endregion

//#region About row
/**
 * Creates a row that opens an AboutDialog window with information about the extension.
 * @param {ExtensionMetadata} metadata - The metadata object from metadata.json.
 */
export function createAboutRow(metadata) {
    const row = new Adw.ActionRow({
        title: _('About Modern Clock'),
        activatable: true,
    });
    row.add_prefix(new Gtk.Image({ icon_name: 'help-about-symbolic' }));
    row.add_suffix(new Gtk.Image({ icon_name: 'go-next-symbolic' }));

    //#region About dialog
    const aboutWindow = new Adw.AboutDialog({
        application_icon: extensionIcon,
        application_name: metadata.name,
        artists,
        comments: metadata.description,
        copyright,
        designers,
        developer_name: developerName,
        developers,
        documenters,
        issue_url: issueUrl,
        license_type: licenseType,
        release_notes: releaseNotes,
        release_notes_version: metadata['version-name'],
        support_url: supportUrl,
        translator_credits: pgettext('(USER)NAME EMAIL', 'translator_credits'),
        version: metadata['version-name'],
        website: metadata.url,
    });
    aboutWindow.add_link(
        _('Extension Page'),
        'https://extensions.gnome.org/extension/9882/modern-clock/'
    );
    aboutWindow.add_acknowledgement_section(_('Port of'), [
        'Modern Clock for KDE https://github.com/Prayag2/kde_modernclock',
    ]);
    //#endregion

    row.connect('activated', () => aboutWindow.present(row));
    return row;
}
//#endregion
