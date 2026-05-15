// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class StashPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({ GTypeName: 'AppstashPrefsPage' }, this);
    }

    constructor({ settings, ...params }) {
        super(params);

        this._settings = settings;
        this._switches = new Map();

        this._buildBehaviorGroup();
        this._buildIndicatorGroup();

        this._knownChangedId = this._settings.connect(
            'changed::known-roles', () => this._rebuildIndicatorRows());
        this._stashedChangedId = this._settings.connect(
            'changed::stashed-roles', () => this._syncSwitchesFromSettings());

        this.connect('destroy', () => {
            this._settings.disconnect(this._knownChangedId);
            this._settings.disconnect(this._stashedChangedId);
        });
    }

    _buildBehaviorGroup() {
        const group = new Adw.PreferencesGroup({ title: _('Behavior') });

        const hideRow = new Adw.SwitchRow({
            title: _('Hide arrow button when stash is empty'),
            subtitle: _('The arrow only appears once something is stashed.'),
        });
        this._settings.bind('hide-when-empty', hideRow, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(hideRow);

        const sizeRow = new Adw.SpinRow({
            title: _('Icon size'),
            subtitle: _('Pixel size of indicator icons inside the popup.'),
            adjustment: new Gtk.Adjustment({
                lower: 8,
                upper: 64,
                step_increment: 1,
                page_increment: 4,
            }),
        });
        this._settings.bind('icon-size', sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(sizeRow);

        this.add(group);
    }

    _buildIndicatorGroup() {
        this._indicatorGroup = new Adw.PreferencesGroup({
            title: _('Indicators'),
            description: _('Toggle which top-bar indicators are stashed inside the arrow popup. The list is populated by the running extension; if it’s empty, enable Appstash first.'),
        });
        this.add(this._indicatorGroup);

        this._rebuildIndicatorRows();
    }

    _rebuildIndicatorRows() {
        for (const [, row] of this._switches) this._indicatorGroup.remove(row);
        this._switches.clear();

        const known = this._settings.get_strv('known-roles');
        const stashed = new Set(this._settings.get_strv('stashed-roles'));

        if (known.length === 0) {
            const placeholder = new Adw.ActionRow({
                title: _('No indicators detected yet'),
                subtitle: _('Open or reload the extension to populate this list.'),
            });
            this._switches.set('__placeholder__', placeholder);
            this._indicatorGroup.add(placeholder);
            return;
        }

        for (const role of known) {
            const row = new Adw.SwitchRow({
                title: role,
                active: stashed.has(role),
            });
            row.connect('notify::active', () => this._onToggle(role, row.active));
            this._switches.set(role, row);
            this._indicatorGroup.add(row);
        }
    }

    _syncSwitchesFromSettings() {
        const stashed = new Set(this._settings.get_strv('stashed-roles'));
        for (const [role, row] of this._switches) {
            if (role === '__placeholder__') continue;
            const desired = stashed.has(role);
            if (row.active !== desired) row.active = desired;
        }
    }

    _onToggle(role, active) {
        const current = this._settings.get_strv('stashed-roles');
        const has = current.includes(role);

        if (active && !has) {
            this._settings.set_strv('stashed-roles', [...current, role]);
        } else if (!active && has) {
            this._settings.set_strv('stashed-roles', current.filter(r => r !== role));
        }
    }
}
