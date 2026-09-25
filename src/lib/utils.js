// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

export function getAnuratiWeekdaySupport() {
    const anuratiGlyphs = /^[A-Z ]+$/;
    const [long, short] = ['%A', '%a'].map(format => {
        return anuratiGlyphs.test(
            [1, 2, 3, 4, 5, 6, 7] // Jan 1 2024 is a Monday, so this covers all 7 weekdays
                .map(d => GLib.DateTime.new_local(2024, 1, d, 0, 0, 0).format(format).toUpperCase())
                .join('')
        );
    });
    return { long, short };
}
