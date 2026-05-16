// SPDX-License-Identifier: GPL-3.0-or-later

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { getRoleName } from './utils.js';

const CONTAINER_STYLE = 'padding: 10px 16px; spacing: 6px;';
const SUB_ROW_STYLE = 'spacing: 16px;';

export class StashController {
    constructor({ menu, settings, openPreferences }) {
        this._menu = menu;
        this._settings = settings;
        this._openPreferences = openPreferences;
        this._lifted = [];
        this._subRows = [];

        this._row = new St.BoxLayout({
            vertical: true,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style: CONTAINER_STYLE,
        });
        this._menu.box.add_child(this._row);

        this._cogIcon = new St.Icon({
            icon_name: 'emblem-system-symbolic',
            icon_size: this._settings.get_int('icon-size'),
            style_class: 'system-status-icon',
        });
        this._cog = new St.Button({
            child: this._cogIcon,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'panel-button',
            x_expand: false,
            y_expand: false,
        });
        this._cog.connect('clicked', () => {
            this._menu.close();
            try {
                this._openPreferences?.();
            } catch (e) {
                console.log(`[Appstash] openPreferences failed: ${e}`);
            }
        });

        // Lift indicators before the menu grab is set up otherwise the grab snapshots the actor tree without them
        this._origMenuOpen = this._menu.open.bind(this._menu);
        this._menu.open = (...args) => {
            if (!this._menu.isOpen) {
                try {
                    this._lift();
                } catch (e) {
                    console.log(`[Appstash] _lift error: ${e}`);
                }
            }
            return this._origMenuOpen(...args);
        };

        this._stateChangedId = this._menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) this._installOutsideClickHandler();
            else this._uninstallOutsideClickHandler();
            if (!isOpen) this._restore();
            this._settings.set_boolean('popup-open', isOpen);
        });
    }

    // The popup is detached from the panels menuManager so child indicator menus dont force-close it
    _installOutsideClickHandler() {
        if (this._capturedEventId || this._grab) return;

        try {
            this._grab = Main.pushModal(this._menu.actor, {
                actionMode: Shell.ActionMode.POPUP,
            });
        } catch (e) {
            console.log(`[Appstash] pushModal failed: ${e}`);
            this._grab = null;
        }

        this._capturedEventId = this._menu.actor.connect('captured-event', (_actor, event) => {
            try {
                const type = event.type();
                if (type !== Clutter.EventType.BUTTON_PRESS &&
                    type !== Clutter.EventType.TOUCH_BEGIN) {
                    return Clutter.EVENT_PROPAGATE;
                }
                if (!this._menu?.isOpen) return Clutter.EVENT_PROPAGATE;

                const [x, y] = event.get_coords();
                const target = global.stage.get_actor_at_pos(
                    Clutter.PickMode.REACTIVE, x, y);

                const menuActor = this._menu?.actor;
                const sourceActor = this._menu?.sourceActor;
                if (this._isDescendantOf(target, menuActor) ||
                    this._isDescendantOf(target, sourceActor)) {
                    return Clutter.EVENT_PROPAGATE;
                }
                this._menu.close();
            } catch (e) {
                console.log(`[Appstash] outside-click handler error: ${e}`);
            }
            return Clutter.EVENT_PROPAGATE;
        });
    }

    _uninstallOutsideClickHandler() {
        if (this._capturedEventId && this._menu?.actor) {
            try {
                this._menu.actor.disconnect(this._capturedEventId);
            } catch (_) {}
            this._capturedEventId = 0;
        }
        if (this._grab) {
            try {
                Main.popModal(this._grab);
            } catch (_) {}
            this._grab = null;
        }
    }

    _isDescendantOf(actor, ancestor) {
        if (!actor || !ancestor) return false;
        let cur = actor;
        while (cur) {
            if (cur === ancestor) return true;
            cur = cur.get_parent();
        }
        return false;
    }

    getStashedRoles() {
        const stashed = this._settings.get_strv('stashed-roles');
        if (stashed.length === 0) return [];

        const nameToRole = new Map();
        for (const role in Main.panel.statusArea) {
            const ind = Main.panel.statusArea[role];
            if (!ind || !ind.container) continue;
            const name = getRoleName(role);
            if (name && !nameToRole.has(name)) nameToRole.set(name, role);
        }

        const result = [];
        for (const name of stashed) {
            const role = nameToRole.get(name);
            if (role) result.push(role);
        }
        return result;
    }

    applyIconSizeToLifted() {
        const size = this._settings.get_int('icon-size');
        for (const { container } of this._lifted) {
            this._applyIconSize(container);
        }
        if (this._cogIcon) this._cogIcon.icon_size = size;
    }

    _applyIconSize(container) {
        const size = this._settings.get_int('icon-size');
        container.set_size(size, size);
        container.set_x_expand(false);
        container.set_y_expand(false);
        this._resizeFirstIcon(container, size);
    }

    _resizeFirstIcon(actor, size) {
        if (!actor) return;
        if (actor instanceof St.Icon) {
            actor.icon_size = size;
            return;
        }
        if (typeof actor.get_children === 'function') {
            for (const child of actor.get_children()) {
                this._resizeFirstIcon(child, size);
            }
        }
    }

    _newSubRow() {
        const sub = new St.BoxLayout({
            vertical: false,
            x_expand: false,
            y_expand: false,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.CENTER,
            style: SUB_ROW_STYLE,
        });
        this._row.add_child(sub);
        this._subRows.push(sub);
        return sub;
    }

    _lift() {
        const roles = this.getStashedRoles();
        const maxPerRow = Math.max(1, this._settings.get_int('max-per-row'));

        // total slots = stashed indicators + the trailing cog
        const total = roles.length + 1;
        const rowCount = Math.ceil(total / maxPerRow);
        for (let i = 0; i < rowCount; i++) this._newSubRow();

        for (let i = 0; i < roles.length; i++) {
            const role = roles[i];
            const indicator = Main.panel.statusArea[role];
            if (!indicator?.container) continue;

            const container = indicator.container;
            const parent = container.get_parent();
            if (!parent) continue;

            const originalIndex = parent.get_children().indexOf(container);
            const originalSize = {
                xExpand: container.x_expand,
                yExpand: container.y_expand,
            };

            this._lifted.push({
                role, container, originalParent: parent, originalIndex, originalSize,
            });

            parent.remove_child(container);
            const rowIdx = Math.floor(i / maxPerRow);
            this._subRows[rowIdx].add_child(container);
            container.show();
            this._applyIconSize(container);
        }

        if (this._cog?.get_parent()) {
            this._cog.get_parent().remove_child(this._cog);
        }
        this._subRows[this._subRows.length - 1].add_child(this._cog);
    }

    _restore() {
        for (let i = this._lifted.length - 1; i >= 0; i--) {
            const { container, originalParent, originalIndex, originalSize } = this._lifted[i];

            const currentParent = container.get_parent();
            if (currentParent) currentParent.remove_child(container);

            container.set_size(-1, -1);
            container.set_x_expand(originalSize?.xExpand ?? true);
            container.set_y_expand(originalSize?.yExpand ?? true);

            if (originalParent) {
                const max = originalParent.get_n_children();
                originalParent.insert_child_at_index(container, Math.min(originalIndex, max));
            }
        }
        this._lifted = [];

        if (this._cog?.get_parent()) {
            this._cog.get_parent().remove_child(this._cog);
        }
        for (const sub of this._subRows) sub.destroy();
        this._subRows = [];
    }

    destroy() {
        this._uninstallOutsideClickHandler();
        if (this._stateChangedId && this._menu) {
            this._menu.disconnect(this._stateChangedId);
            this._stateChangedId = 0;
        }
        if (this._origMenuOpen && this._menu) {
            this._menu.open = this._origMenuOpen;
            this._origMenuOpen = null;
        }
        this._restore();
        this._cog?.destroy();
        this._cog = null;
        this._cogIcon = null;
        if (this._row && this._row.get_parent()) {
            this._row.get_parent().remove_child(this._row);
        }
        this._row?.destroy();
        this._row = null;
    }
}
