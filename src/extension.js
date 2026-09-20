// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import Pango from 'gi://Pango';
import St from 'gi://St';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

//#region Constants
// ── Base dimensions for 1080p ────────────────────────────────────────────────
const BASE_HEIGHT = 1080;
const BASE_WEEKDAY_SIZE = 88;
const BASE_WEEKDAY_LS = 20;
const BASE_SUB_SIZE = 24;
const BASE_SUB_LS = 4;
const BASE_DATE_TOP_PAD = 8;
const BASE_TIME_TOP_PAD = 4;
const MIN_SCALE = 0.5;
const NEUTRAL_SCALE = 1.0;
const MAX_SCALE = 2.0;
// ── English weekdays and months ──────────────────────────────────────────────
const WEEKDAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const MONTHS = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
];
const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));
// ── Font files ───────────────────────────────────────────────────────────────
const FONT_FILES = ['Anurati.otf', 'Poppins.ttf'];
//#endregion

export default class ModernClockExtension extends Extension {
    //#region enable
    enable() {
        // ── Version check ────────────────────────────────────────────────────
        this._shellVersion = parseFloat(Config.PACKAGE_VERSION);

        // ── Custom extension logger ──────────────────────────────────────────
        this._logger = this._shellVersion >= 48 ? this.getLogger() : this._getFallbackLogger();

        // ── Connect to settings ──────────────────────────────────────────────
        this._settings = this.getSettings();
        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            this._clockWidgets.forEach(clockWidget => {
                this._updateClockDisplay(clockWidget);
                if (key === 'scale') this._scaleClock(clockWidget);
                this._positionClock(clockWidget);
            });
        });

        // ── Install fonts ────────────────────────────────────────────────────
        this._installFonts();

        // ── Build clocks when the layout is ready ────────────────────────────
        this._clockWidgets = [];
        this._ready = false;
        this._lastMonitorSnapshot = null;

        if (Main.layoutManager._startingUp) {
            this._startupCompleteId = Main.layoutManager.connect('startup-complete', () => {
                Main.layoutManager.disconnect(this._startupCompleteId);
                this._startupCompleteId = null;
                this._ready = true;
                this._buildAllClocks();
            });
        } else {
            this._ready = true;
            this._buildAllClocks();
        }

        // ── Connect to monitor changes ───────────────────────────────────────
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            if (this._lastMonitorSnapshot !== this._snapshotMonitor()) this._buildAllClocks();
        });

        // ── Connect to work areas changes ────────────────────────────────────
        this._workareasChangedId = global.display.connect('workareas-changed', () =>
            this._clockWidgets.forEach(clockWidget => this._positionClock(clockWidget))
        );

        // ── Connect to GNOME Clock ───────────────────────────────────────────
        this._wallClock = new GnomeDesktop.WallClock();
        this._lastMinute = null;
        this._clockChangedId = this._wallClock.connect('notify::clock', () => {
            const now = GLib.DateTime.new_now_local();
            const minute = now.get_hour() * 60 + now.get_minute();
            if (this._lastMinute === minute) return;

            this._lastMinute = minute;
            this._clockWidgets.forEach(clockWidget => {
                this._updateClockDisplay(clockWidget);
                this._positionClock(clockWidget);
            });
        });
    }
    //#endregion

    //#region disable
    disable() {
        // Signals
        if (this._clockChangedId) {
            this._wallClock.disconnect(this._clockChangedId);
            this._clockChangedId = null;
        }
        if (this._workareasChangedId) {
            global.display.disconnect(this._workareasChangedId);
            this._workareasChangedId = null;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = null;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        // Objects
        this._wallClock = null;
        this._settings = null;
        this._destroyAllClocks();
        this._clockWidgets = [];
        this._logger = null;
    }
    //#endregion

    //#region buildAllClocks
    _buildAllClocks() {
        if (!this._ready) return;

        // Remove old clocks
        this._destroyAllClocks();
        this._clockWidgets = [];

        const monitors = Main.layoutManager.monitors;
        this._lastMonitorSnapshot = this._snapshotMonitor();
        this._clockWidgets = monitors.map(monitor => this._buildClock(monitor));
    }
    //#endregion

    //#region destroyAllClocks
    _destroyAllClocks() {
        this._clockWidgets.forEach(clockWidget => {
            if (clockWidget.allocationNotifyId) {
                clockWidget.disconnect(clockWidget.allocationNotifyId);
                clockWidget.allocationNotifyId = null;
            }
            clockWidget.destroy();
        });
    }
    //#endregion

    //#region buildClock
    _buildClock(monitor) {
        // Build widget
        const container = new St.BoxLayout({
            name: `ModernClockWidget-${monitor.index}`,
            style_class: 'modernclock-container',
            can_focus: false,
            reactive: false,
            track_hover: false,
            opacity: 0, // keep it hidden until ready
        });
        container.monitor = monitor;
        if (this._shellVersion >= 48) container.set_orientation(Clutter.Orientation.VERTICAL);
        else container.set_vertical(true);

        // Build labels
        container.weekdayLabel = new St.Label({ style_class: 'modernclock-day' });
        container.dateLabel = new St.Label({ style_class: 'modernclock-date' });
        container.timeLabel = new St.Label({ style_class: 'modernclock-time' });

        [container.weekdayLabel, container.dateLabel, container.timeLabel].forEach(label => {
            label.set_x_align(Clutter.ActorAlign.CENTER);
            label.set_x_expand(true);
            label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            container.add_child(label);
        });

        // Connect to allocation signal
        container.allocationNotifyId = container.connect('notify::allocation', () =>
            this._positionClock(container)
        );

        // Add to layout
        Main.layoutManager._backgroundGroup.add_child(container);

        // Setup widget
        this._updateClockDisplay(container);
        this._scaleClock(container);
        this._positionClock(container);

        // Reveal
        container.set_opacity(255);

        return container;
    }
    //#endregion

    //#region updateClockDisplay
    _updateClockDisplay(clockWidget) {
        const now = GLib.DateTime.new_now_local();
        const useEnglish = this._settings.get_boolean('use-english');
        const dateDeco = this._settings.get_string('date-deco');
        const timeDeco = this._settings.get_string('time-deco');

        // Weekday
        const weekday = useEnglish
            ? WEEKDAYS[now.get_day_of_week() - 1]
            : now.format('%A').toUpperCase();
        // Date
        let date;
        switch (this._settings.get_string('date-format')) {
            case 'long':
                date = useEnglish
                    ? now.format(`%d ${MONTHS[now.get_month() - 1]} %Y`)
                    : now.format('%d %B %Y').toUpperCase();
                break;
            case 'numeric':
                date = now.format('%d.%m.%Y');
                break;
            case 'text':
            default:
                date = useEnglish
                    ? now.format(`%d ${MONTHS_SHORT[now.get_month() - 1]} %Y`)
                    : now.format('%d %b %Y').toUpperCase();
                break;
        }
        // Time
        let time;
        if (this._settings.get_boolean('use-24h')) {
            time = `${now.format(`%H:%M`)}`;
        } else {
            // Manually calculate AM/PM format because some locales don't support it
            const hours = now.get_hour();
            const h12 = hours % 12 || 12;
            const ampm = hours < 12 ? 'AM' : 'PM';
            time = `${now.format(`${h12.toString().padStart(2, '0')}:%M ${ampm}`)}`;
        }

        clockWidget.weekdayLabel.set_text(weekday);
        clockWidget.dateLabel.set_text(`${dateDeco} ${date} ${dateDeco}`);
        clockWidget.timeLabel.set_text(`${timeDeco} ${time} ${timeDeco}`);
    }
    //#endregion

    //#region scaleClock
    _scaleClock(clockWidget) {
        // Update the monitor
        clockWidget.monitor = Main.layoutManager.monitors[clockWidget.monitor.index];

        const referenceDimension = Math.min(clockWidget.monitor.width, clockWidget.monitor.height);
        const monitorScale = referenceDimension / BASE_HEIGHT;
        const userScale = this._settings.get_double('scale');
        const sizeScale =
            userScale < 0.5
                ? MIN_SCALE + (NEUTRAL_SCALE - MIN_SCALE) * (userScale / 0.5)
                : NEUTRAL_SCALE + (MAX_SCALE - NEUTRAL_SCALE) * ((userScale - 0.5) / 0.5);

        const weekdaySize = Math.round(BASE_WEEKDAY_SIZE * monitorScale * sizeScale);
        const weekdayLS = Math.round(BASE_WEEKDAY_LS * monitorScale * sizeScale);
        const subSize = Math.round(BASE_SUB_SIZE * monitorScale * sizeScale);
        const subLS = Math.round(BASE_SUB_LS * monitorScale * sizeScale);
        const padTopDate = Math.round(BASE_DATE_TOP_PAD * monitorScale * sizeScale);
        const padTopTime = Math.round(BASE_TIME_TOP_PAD * monitorScale * sizeScale);

        const style = {
            weekday: `font-size: ${weekdaySize}px; letter-spacing: ${weekdayLS}px;`,
            date: `font-size: ${subSize}px; letter-spacing: ${subLS}px; padding-top: ${padTopDate}px;`,
            time: `font-size: ${subSize}px; letter-spacing: ${subLS}px; padding-top: ${padTopTime}px;`,
        };
        clockWidget.weekdayLabel.set_style(style.weekday);
        clockWidget.dateLabel.set_style(style.date);
        clockWidget.timeLabel.set_style(style.time);
    }
    //#endregion

    //#region positionClock
    _positionClock(clockWidget) {
        const workArea = Main.layoutManager.getWorkAreaForMonitor(clockWidget.monitor.index);

        const positionX = this._settings.get_double('position-x');
        const positionY = this._settings.get_double('position-y');
        const [, width] = clockWidget.get_preferred_width(-1);
        const [, height] = clockWidget.get_preferred_height(-1);

        const x = Math.round(workArea.x + positionX * (workArea.width - width));
        const y = Math.round(workArea.y + positionY * (workArea.height - height));

        if (clockWidget.x !== x || clockWidget.y !== y) clockWidget.set_position(x, y);
    }
    //#endregion
    //#region snapshotMonitor
    _snapshotMonitor() {
        return Main.layoutManager.monitors
            .map(m => `${m.index}:${m.x},${m.y},${m.width}x${m.height}`)
            .join('|');
    }
    //#endregion

    //#region installFonts
    _installFonts() {
        const fontsDir = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts', 'modernclock'])
        );
        if (this._fontsPresent(fontsDir)) return;

        this._logger.log(
            `fonts missing, installing at ${fontsDir.get_path()} (takes effect next session)`
        );
        try {
            const srcDir = Gio.File.new_for_path(GLib.build_filenamev([this.path, 'fonts']));
            if (!fontsDir.query_exists(null)) fontsDir.make_directory_with_parents(null);
            FONT_FILES.forEach(fontName => {
                const srcChild = srcDir.get_child(fontName);
                const destChild = fontsDir.get_child(fontName);
                srcChild.copy(destChild, Gio.FileCopyFlags.OVERWRITE, null, null);
            });
        } catch (e) {
            this._logger.warn('failed to install fonts:', e);
        }
    }
    //#endregion

    //#region fontsPresent
    _fontsPresent(fontsDir) {
        if (!fontsDir.query_exists(null)) return false;
        try {
            return FONT_FILES.every(fontName => fontsDir.get_child(fontName).query_exists(null));
        } catch {
            return false;
        }
    }
    //#endregion

    //#region getFallbackLogger
    _getFallbackLogger() {
        const prefix = `[${this.metadata.name}]`;
        return {
            log: (...args) => console.log(prefix, ...args),
            warn: (...args) => console.warn(prefix, ...args),
            error: (...args) => console.error(prefix, ...args),
            debug: (...args) => console.debug(prefix, ...args),
        };
    }
    //#endregion
}
