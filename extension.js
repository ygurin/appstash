// SPDX-License-Identifier: GPL-3.0-or-later

import GLib from 'gi://GLib';
import St from 'gi://St';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import { StashController } from './src/stashPopup.js';
import { getRoleName } from './src/utils.js';

const ICON_CLOSED = 'pan-up-symbolic';
const ICON_OPEN = 'pan-down-symbolic';

export default class AppstashExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._button = new PanelMenu.Button(0.5, _('Appstash'), false);
        this._icon = new St.Icon({
            icon_name: ICON_CLOSED,
            style_class: 'system-status-icon',
        });
        this._button.add_child(this._icon);

        this._controller = new StashController({
            menu: this._button.menu,
            settings: this._settings,
            openPreferences: () => this.openPreferences(),
        });

        this._popupStateId = this._button.menu.connect('open-state-changed', (_m, isOpen) => {
            this._icon.icon_name = isOpen ? ICON_OPEN : ICON_CLOSED;
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
