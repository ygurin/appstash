// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class StashPage extends Adw.PreferencesPage {
    static {
        GObject.registerClass({ GTypeName: 'AppstashPrefsPage' }, this);
    }

    constructor({ settings, ...params }) {
        super(params);

        this._settings = settings;

        this._buildBehaviorGroup();
        this._buildListsGroup();

        this._knownChangedId = this._settings.connect(
            'changed::known-roles', () => this._rebuildLists());
        this._stashedChangedId = this._settings.connect(
            'changed::stashed-roles', () => this._rebuildLists());

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

        const perRow = new Adw.SpinRow({
            title: _('Max icons per row'),
            subtitle: _('Extras wrap onto a new row.'),
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 32,
                step_increment: 1,
                page_increment: 2,
            }),
        });
        this._settings.bind('max-per-row', perRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        group.add(perRow);

        this.add(group);
    }

    _buildListsGroup() {
        const stashedGroup = new Adw.PreferencesGroup({
            title: _('Stashed'),
            description: _('Indicators hidden behind the arrow. Drag to reorder, or drag back to "Available" to unstash.'),
        });
        this._stashedList = this._makeListBox();
        stashedGroup.add(this._wrap(this._stashedList));
        this.add(stashedGroup);

        const availableGroup = new Adw.PreferencesGroup({
            title: _('Available'),
            description: _('Indicators currently visible in the panel. Drag into "Stashed" to hide them behind the arrow.'),
        });
        this._availableList = this._makeListBox();
        availableGroup.add(this._wrap(this._availableList));
        this.add(availableGroup);

        const clearButton = new Gtk.Button({
            label: _('Clear stash'),
            css_classes: ['destructive-action'],
            valign: Gtk.Align.CENTER,
        });
        clearButton.connect('clicked', () => {
            this._settings.set_strv('stashed-roles', []);
        });
        const clearGroup = new Adw.PreferencesGroup({
            title: _('Reset'),
            description: _('Move every stashed indicator back to the panel.'),
            header_suffix: clearButton,
        });
        this.add(clearGroup);

        this._rebuildLists();
    }

    _wrap(listbox) {
        const clamp = new Adw.Clamp({ maximum_size: 600 });
        clamp.set_child(listbox);
        return clamp;
    }

    _makeListBox() {
        const lb = new Gtk.ListBox({ css_classes: ['boxed-list'] });
        const target = Gtk.DropTarget.new(Gtk.ListBoxRow, Gdk.DragAction.MOVE);
        lb.add_controller(target);
        target.connect('drop', (_t, value, _x, y) => this._onDrop(lb, value, y));
        return lb;
    }

    _addRow(listbox, name) {
        const row = new Adw.ActionRow({ title: name, selectable: false });

        row.add_prefix(new Gtk.Image({
            icon_name: 'list-drag-handle-symbolic',
            css_classes: ['dim-label'],
        }));

        const dragSource = new Gtk.DragSource({ actions: Gdk.DragAction.MOVE });
        row.add_controller(dragSource);

        dragSource.connect('prepare', () => {
            const v = new GObject.Value();
            v.init(Gtk.ListBoxRow);
            v.set_object(row);
            return Gdk.ContentProvider.new_for_value(v);
        });

        dragSource.connect('drag-begin', (_s, drag) => {
            const dragWidget = new Gtk.ListBox();
            dragWidget.set_size_request(row.get_width(), row.get_height());
            dragWidget.add_css_class('boxed-list');
            const dragRow = new Adw.ActionRow({ title: name });
            dragRow.add_prefix(new Gtk.Image({
                icon_name: 'list-drag-handle-symbolic',
                css_classes: ['dim-label'],
            }));
            dragWidget.append(dragRow);
            dragWidget.drag_highlight_row(dragRow);
            const icon = Gtk.DragIcon.get_for_drag(drag);
            icon.child = dragWidget;
        });

        listbox.append(row);
    }

    _onDrop(targetList, value, y) {
        if (!value) return false;
        const draggedName = value.title;
        if (!draggedName) return false;

        const targetRow = targetList.get_row_at_y(y);
        const targetIndex = targetRow ? targetRow.get_index() : -1;

        let stashed = this._settings.get_strv('stashed-roles');
        stashed = stashed.filter(r => r !== draggedName);

        if (targetList === this._stashedList) {
            const idx = targetIndex >= 0 ? targetIndex : stashed.length;
            stashed.splice(idx, 0, draggedName);
        }

        this._settings.set_strv('stashed-roles', stashed);
        return true;
    }

    _rebuildLists() {
        if (!this._stashedList || !this._availableList) return;

        this._clearList(this._stashedList);
        this._clearList(this._availableList);

        const known = this._settings.get_strv('known-roles');
        const stashed = this._settings.get_strv('stashed-roles');
        const stashedSet = new Set(stashed);

        if (stashed.length === 0) {
            this._addPlaceholder(this._stashedList, _('Drop indicators here to hide them.'));
        } else {
            for (const name of stashed) this._addRow(this._stashedList, name);
        }

        const available = known.filter(n => !stashedSet.has(n));
        if (available.length === 0) {
            this._addPlaceholder(this._availableList, known.length === 0
                ? _('No indicators detected yet. Enable Appstash first.')
                : _('All known indicators are currently stashed.'));
        } else {
            for (const name of available) this._addRow(this._availableList, name);
        }
    }

    _addPlaceholder(listbox, text) {
        const row = new Adw.ActionRow({
            title: text,
            selectable: false,
            css_classes: ['dim-label'],
        });
        listbox.append(row);
    }

    _clearList(lb) {
        let row = lb.get_first_child();
        while (row) {
            const next = row.get_next_sibling();
            lb.remove(row);
            row = next;
        }
    }
}
