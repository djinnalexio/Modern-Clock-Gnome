// SPDX-FileCopyrightText: 2026 Modern Clock for GNOME Contributors
// SPDX-License-Identifier: GPL-3.0-only

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
// ── Базовые размеры (для 1080p) ──────────────────────────────────────────────
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
        this._settingsChangedId = this._settings.connect('changed', () => this._updateAllClocks());

        // ── Автоустановка шрифтов ────────────────────────────────────────────
        this._installFonts();

        // ── Build clocks when the layout is ready ────────────────────────────
        this._clockWidgets = [];
        this._ready = false;

        if (Main.layoutManager._startingUp) {
            this._startupCompleteId = Main.layoutManager.connect('startup-complete', () => {
                this._ready = true;
                this._buildAllClocks();
                Main.layoutManager.disconnect(this._startupCompleteId);
                this._startupCompleteId = null;
            });
        } else {
            this._ready = true;
            this._buildAllClocks();
        }

        // ── Connect to monitor changes ───────────────────────────────────────
        this._lastMonitorSnapshot = null;
        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            const snapshot = Main.layoutManager.monitors
                .map(m => `${m.index}:${m.x},${m.y},${m.width}x${m.height}`)
                .join('|');
            if (this._lastMonitorSnapshot !== snapshot) {
                this._lastMonitorSnapshot = snapshot;
                this._buildAllClocks();
            }
        });

        // ── Connect to GNOME Clock ───────────────────────────────────────────
        this._wallClock = new GnomeDesktop.WallClock();
        this._lastMinute = null;
        this._clockChangedId = this._wallClock.connect('notify::clock', () => {
            const now = GLib.DateTime.new_now_local();
            const minute = now.get_hour() * 60 + now.get_minute();
            if (this._lastMinute !== minute) {
                this._lastMinute = minute;
                this._updateAllClocks();
            }
        });
    }
    //#endregion

    //#region disable
    disable() {
        // Signals
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._startupCompleteId) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = null;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
        if (this._clockChangedId) {
            this._wallClock.disconnect(this._clockChangedId);
            this._clockChangedId = null;
        }

        // Objects
        this._logger = null;
        this._settings = null;
        this._destroyAllClocks();
        this._clockWidgets = [];
        this._wallClock = null;
    }
    //#endregion

    //#region buildAllClocks
    _buildAllClocks() {
        if (!this._ready) return;

        // Remove old clocks
        this._destroyAllClocks();
        this._clockWidgets = [];

        const monitors = Main.layoutManager.monitors;
        monitors.forEach(monitor => {
            const widget = this._buildClockWidget(monitor);
            if (widget) this._clockWidgets.push(widget);
        });

        this._clockWidgets.forEach(clockWidget =>
            Main.layoutManager._backgroundGroup.add_child(clockWidget)
        );

        this._updateAllClocks();
        this._clockWidgets.forEach(clockWidget => clockWidget.set_opacity(255));
    }
    //#endregion

    //#region destroyAllClocks
    _destroyAllClocks() {
        if (!this._clockWidgets || this._clockWidgets.length === 0) return;

        this._clockWidgets.forEach(clockWidget => {
            // Disconnect reposition signal
            if (clockWidget.allocationNotifyId) {
                clockWidget.disconnect(clockWidget.allocationNotifyId);
                clockWidget.allocationNotifyId = null;
            }
            // Remove from layoutManager
            try {
                if (clockWidget.get_parent()) clockWidget.get_parent().remove_child(clockWidget);
            } catch (e) {
                this._logger.warn('Failed to remove widget:', e);
            }
            clockWidget.destroy();
        });
    }
    //#endregion

    //#region buildClockWidget
    _buildClockWidget(monitor) {
        const container = new St.BoxLayout({
            name: `ModernClockWidget-${monitor.index}`,
            style_class: 'modernclock-container',
            can_focus: false,
            reactive: false,
            track_hover: false,
            opacity: 0, // keep it hidden until ready
        });
        if (this._shellVersion >= 48) container.set_orientation(Clutter.Orientation.VERTICAL);
        else container.set_vertical(true);

        const styles = this._buildStyles(monitor);
        container.weekdayLabel = new St.Label({
            style: styles.day,
            style_class: 'modernclock-day',
        });
        container.dateLabel = new St.Label({
            style: styles.date,
            style_class: 'modernclock-date',
        });
        container.timeLabel = new St.Label({
            style: styles.time,
            style_class: 'modernclock-time',
        });
        container.monitor = monitor;

        [container.weekdayLabel, container.dateLabel, container.timeLabel].forEach(label => {
            label.set_x_align(Clutter.ActorAlign.CENTER);
            label.set_x_expand(true);
            label.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
            container.add_child(label);
        });

        container.allocationNotifyId = container.connect('notify::allocation', () =>
            this._rescaleClockWidget(container)
        );

        return container;
    }
    //#endregion

    //#region updateAllClocks
    _updateAllClocks() {
        if (!this._ready) return;

        if (!this._clockWidgets || this._clockWidgets.length === 0) {
            this._logger.warn('There is no clock to update!');
            return;
        }

        const now = GLib.DateTime.new_now_local();
        const useEnglish = this._settings.get_boolean('use-english');
        const dateDeco = this._settings.get_string('date-deco');
        const timeDeco = this._settings.get_string('time-deco');

        // Weekday
        const weekday = useEnglish
            ? WEEKDAYS[now.get_day_of_week() - 1]
            : now.format('%A').toUpperCase();
        // Date
        let date, time;
        switch (this._settings.get_string('date-format')) {
            case 'text':
                date = useEnglish
                    ? now.format(`%d ${MONTHS[now.get_month() - 1]} %Y`)
                    : now.format('%d %B %Y').toUpperCase();
                break;
            case 'numeric':
                date = now.format('%d.%m.%Y');
                break;
            case 'short':
            default:
                date = useEnglish
                    ? now.format(`%d ${MONTHS_SHORT[now.get_month() - 1]} %Y`)
                    : now.format('%d %b %Y').toUpperCase();
                break;
        }
        // Time
        switch (this._settings.get_string('time-format')) {
            case '24h':
                time = `${now.format(`%H:%M`)}`;
                break;
            case 'ampm':
            default: {
                // Manually calculate AM/PM format because some locales don't support it
                const hours = now.get_hour();
                const h12 = hours % 12 || 12;
                const ampm = hours < 12 ? 'AM' : 'PM';
                time = `${now.format(`${h12.toString().padStart(2, '0')}:%M ${ampm}`)}`;
                break;
            }
        }

        this._clockWidgets.forEach(clockWidget => {
            clockWidget.weekdayLabel.set_text(weekday);
            clockWidget.dateLabel.set_text(`${dateDeco} ${date} ${dateDeco}`);
            clockWidget.timeLabel.set_text(`${timeDeco} ${time} ${timeDeco}`);
            this._rescaleClockWidget(clockWidget);
        });
    }
    //#endregion

    //#region buildStyles
    _buildStyles(monitor) {
        // Масштаб относительно 1080p
        const referenceDimension = Math.min(monitor.width, monitor.height);
        const monitorScale = referenceDimension / BASE_HEIGHT;
        const rawScale = this._settings.get_double('scale');
        // convert 0-1 to MIN_SCALE-MAX_SCALE
        const sizeScale =
            rawScale < 0.5
                ? MIN_SCALE + (NEUTRAL_SCALE - MIN_SCALE) * (rawScale / 0.5)
                : NEUTRAL_SCALE + (MAX_SCALE - NEUTRAL_SCALE) * ((rawScale - 0.5) / 0.5);

        const weekdaySize = Math.round(BASE_WEEKDAY_SIZE * monitorScale * sizeScale);
        const weekdayLS = Math.round(BASE_WEEKDAY_LS * monitorScale * sizeScale);
        const subSize = Math.round(BASE_SUB_SIZE * monitorScale * sizeScale);
        const subLS = Math.round(BASE_SUB_LS * monitorScale * sizeScale);
        const padTopDate = Math.round(BASE_DATE_TOP_PAD * monitorScale * sizeScale);
        const padTopTime = Math.round(BASE_TIME_TOP_PAD * monitorScale * sizeScale);

        return {
            day: `font-size: ${weekdaySize}px; letter-spacing: ${weekdayLS}px;`,
            date: `font-size: ${subSize}px; letter-spacing: ${subLS}px; padding-top: ${padTopDate}px;`,
            time: `font-size: ${subSize}px; letter-spacing: ${subLS}px; padding-top: ${padTopTime}px;`,
        };
    }
    //#endregion

    //#region repositionClock
    _repositionClockWidget(clockWidget) {
        if (!clockWidget.monitor) return;

        const workArea = Main.layoutManager.getWorkAreaForMonitor(clockWidget.monitor.index);

        const positionX = this._settings.get_double('position-x');
        const positionY = this._settings.get_double('position-y');
        const [, preferredWidth] = clockWidget.get_preferred_width(-1);
        const [, preferredHeight] = clockWidget.get_preferred_height(-1);
        const width = Math.max(clockWidget.width, preferredWidth);
        const height = Math.max(clockWidget.height, preferredHeight);

        const x = workArea.x + positionX * (workArea.width - width);
        const y = workArea.y + positionY * (workArea.height - height);

        clockWidget.set_position(Math.round(x), Math.round(y));
    }
    //#endregion

    //#region rescaleClockWidget
    _rescaleClockWidget(clockWidget) {
        const monitor = Main.layoutManager.monitors[clockWidget.monitor.index];
        if (!monitor) return;

        const styles = this._buildStyles(monitor);
        clockWidget.weekdayLabel.set_style(styles.day);
        clockWidget.dateLabel.set_style(styles.date);
        clockWidget.timeLabel.set_style(styles.time);
        clockWidget.monitor = monitor;
        this._repositionClockWidget(clockWidget);
    }
    //#endregion

    //#region installFonts
    _installFonts() {
        const fontsDir = Gio.File.new_for_path(
            GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts', 'modernclock'])
        );
        if (this._fontsPresent(fontsDir)) return;

        let children = null;
        try {
            if (!fontsDir.query_exists(null)) fontsDir.make_directory_with_parents(null);
            const srcDir = Gio.File.new_for_path(GLib.build_filenamev([this.path, 'fonts']));
            children = srcDir.enumerate_children(
                'standard::name,standard::type',
                Gio.FileQueryInfoFlags.NONE,
                null
            );

            let info;
            while ((info = children.next_file(null)) !== null) {
                const name = info.get_name();
                const srcChild = srcDir.get_child(name);
                const destChild = fontsDir.get_child(name);

                srcChild.copy(destChild, Gio.FileCopyFlags.OVERWRITE, null, null);
            }
        } catch (e) {
            this._logger.warn('Failed to install fonts:', e);
        } finally {
            if (children) children.close(null);
        }
    }
    //#endregion

    //#region fontsPresent
    _fontsPresent(fontsDir) {
        if (!fontsDir.query_exists(null)) return false;

        let children = null;
        try {
            children = fontsDir.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
            return children.next_file(null) !== null;
        } catch {
            return false;
        } finally {
            if (children) children.close(null);
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
