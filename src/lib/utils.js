// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';

export function anuratiCanRenderWeekdays() {
    const anuratiGlyphs = /^[A-Z ]+$/;
    const weekdays = [1, 2, 3, 4, 5, 6, 7]
        .map(d => GLib.DateTime.new_local(2024, 1, d, 0, 0, 0).format('%A').toUpperCase())
        .join('');
    return anuratiGlyphs.test(weekdays);
}
