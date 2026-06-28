// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import St from 'gi://St';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { StashController } from './src/stashPopup.js';
import { getRoleName } from './src/utils.js';

const ICONS_BY_SIDE = {
    [St.Side.TOP]:    { closed: 'pan-down-symbolic',  open: 'pan-up-symbolic'    },
    [St.Side.BOTTOM]: { closed: 'pan-up-symbolic',    open: 'pan-down-symbolic'  },
    [St.Side.LEFT]:   { closed: 'pan-end-symbolic',   open: 'pan-start-symbolic' },
    [St.Side.RIGHT]:  { closed: 'pan-start-symbolic', open: 'pan-end-symbolic'   },
};

export default class AppstashExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._button = new PanelMenu.Button(0.5, _('Appstash'), false);
        this._icon = new St.Icon({
            icon_name: ICONS_BY_SIDE[St.Side.TOP].closed,
            style_class: 'system-status-icon',
        });
        this._button.add_child(this._icon);

        this._controller = new StashController({
            menu: this._button.menu,
            settings: this._settings,
            openPreferences: () => this.openPreferences(),
        });

        this._popupStateId = this._button.menu.connect('open-state-changed', (_m, isOpen) => {
            this._updateIcon();
            if (!isOpen) this._applyStashState();
        });

        // Patch addToStatusArea so indicators registered after enable() are hidden immediately if stashed
        Panel.Panel.prototype._appstashOriginalAddToStatusArea = Panel.Panel.prototype.addToStatusArea;
        const self = this;
        Panel.Panel.prototype.addToStatusArea = function (role, indicator, position, box) {
            this._appstashOriginalAddToStatusArea(role, indicator, position, box);
            self._applyStashState();
            // SNI proxies populate id/_commandLine asynchronously; re-run
            // shortly so late-arriving fields produce the correct key in
            // known-roles instead of the generic "StatusNotifierItem" fallback.
            self._scheduleDeferredRefresh();
        };

        this._signalHandlers = [];
        this._signalHandlers.push(
            this._settings.connect('changed::stashed-roles', () => this._applyStashState()));
        this._signalHandlers.push(
            this._settings.connect('changed::icon-size', () => this._controller?.applyIconSizeToLifted?.()));

        Main.panel.addToStatusArea(this.uuid, this._button);

        // Detach from the panel's menuManager so other panel menus opening dont auto-close
        // StashController handles click-outside itself
        Main.panel.menuManager.removeMenu(this._button.menu);

        this._applyStashState();

        // Panel position (e.g. dash-to-panel bottom/left/right) is only known
        // after the button has been allocated; defer to the next idle.
        this._scheduleIconUpdate();

        // Re-evaluate when the button is reparented or moves/resizes —
        // dash-to-panel emits both when the panel switches sides.
        this._allocChangedId = this._button.connect(
            'notify::allocation', () => this._scheduleIconUpdate());
        this._parentSetId = this._button.connect(
            'parent-set', () => this._scheduleIconUpdate());
    }

    _scheduleIconUpdate() {
        if (this._iconUpdateId) return;
        this._iconUpdateId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._iconUpdateId = 0;
            this._updateIcon();
            return GLib.SOURCE_REMOVE;
        });
    }

    _detectPanelSide() {
        const actor = this._button;
        if (!actor) return St.Side.TOP;

        const [x, y] = actor.get_transformed_position();
        const [w, h] = actor.get_transformed_size();
        if (!Number.isFinite(x) || !Number.isFinite(y) || (w === 0 && h === 0))
            return St.Side.TOP;

        const cx = x + w / 2;
        const cy = y + h / 2;

        const monitor = Main.layoutManager.monitors.find(m =>
            cx >= m.x && cx < m.x + m.width &&
            cy >= m.y && cy < m.y + m.height
        ) || Main.layoutManager.primaryMonitor;
        if (!monitor) return St.Side.TOP;

        // Whichever monitor edge the button hugs most closely is the panel side.
        const dTop    = y - monitor.y;
        const dBottom = (monitor.y + monitor.height) - (y + h);
        const dLeft   = x - monitor.x;
        const dRight  = (monitor.x + monitor.width) - (x + w);

        const minD = Math.min(dTop, dBottom, dLeft, dRight);
        if (minD === dTop)    return St.Side.TOP;
        if (minD === dBottom) return St.Side.BOTTOM;
        if (minD === dLeft)   return St.Side.LEFT;
        return St.Side.RIGHT;
    }

    _updateIcon() {
        if (!this._icon) return;
        const icons = ICONS_BY_SIDE[this._detectPanelSide()] || ICONS_BY_SIDE[St.Side.TOP];
        const isOpen = this._button?.menu?.isOpen;
        this._icon.icon_name = isOpen ? icons.open : icons.closed;
    }

    _scheduleDeferredRefresh() {
        if (this._deferredRefreshId) return;
        this._deferredRefreshId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
            this._deferredRefreshId = 0;
            this._applyStashState();
            return GLib.SOURCE_REMOVE;
        });
    }

    disable() {
        if (this._deferredRefreshId) {
            GLib.source_remove(this._deferredRefreshId);
            this._deferredRefreshId = 0;
        }
        if (this._iconUpdateId) {
            GLib.source_remove(this._iconUpdateId);
            this._iconUpdateId = 0;
        }
        if (this._allocChangedId && this._button) {
            this._button.disconnect(this._allocChangedId);
            this._allocChangedId = 0;
        }
        if (this._parentSetId && this._button) {
            this._button.disconnect(this._parentSetId);
            this._parentSetId = 0;
        }
        if (this._button?.menu?.isOpen) this._button.menu.close();

        for (const role in Main.panel.statusArea) {
            const ind = Main.panel.statusArea[role];
            if (!ind?.container) continue;
            ind.container.show();
        }

        if (Panel.Panel.prototype._appstashOriginalAddToStatusArea) {
            Panel.Panel.prototype.addToStatusArea = Panel.Panel.prototype._appstashOriginalAddToStatusArea;
            Panel.Panel.prototype._appstashOriginalAddToStatusArea = null;
        }

        for (const id of this._signalHandlers || []) this._settings.disconnect(id);
        this._signalHandlers = null;

        if (this._popupStateId && this._button?.menu) {
            this._button.menu.disconnect(this._popupStateId);
        }
        this._popupStateId = 0;

        this._controller?.destroy();
        this._controller = null;

        this._button?.destroy();
        this._button = null;
        this._icon = null;
        this._settings = null;
    }

    _applyStashState() {
        if (!this._settings || !this._button) return;

        const stashed = new Set(this._settings.get_strv('stashed-roles'));
        const popupOpen = this._button.menu?.isOpen;

        const known = new Set();
        for (const role in Main.panel.statusArea) {
            const ind = Main.panel.statusArea[role];
            if (!ind?.container) continue;
            if (ind === this._button) continue;

            try {
                const name = getRoleName(role, ind);
                if (name) known.add(name);

                const isStashed = stashed.has(name);
                // The controller owns lifted actors while the popup is open
                if (popupOpen && isStashed) continue;
                ind.container.visible = !isStashed;
            } catch (_) {
                // Indicator GObject is being disposed (app exiting); skip it.
            }
        }

        const knownArr = [...known].sort();
        const current = this._settings.get_strv('known-roles');
        if (knownArr.length !== current.length || knownArr.some((r, i) => r !== current[i])) {
            this._settings.set_strv('known-roles', knownArr);
        }
    }
}
