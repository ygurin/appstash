// SPDX-License-Identifier: GPL-3.0-or-later

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { getDisplayName } from './utils.js';

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
            description: _('Indicators hidden behind the arrow. Drag to reorder. Use the remove button to unstash.'),
        });
        this._stashedList = this._makeStashedListBox();
        stashedGroup.add(this._wrap(this._stashedList));
        this.add(stashedGroup);

        const availableGroup = new Adw.PreferencesGroup({
            title: _('Available'),
            description: _('Indicators currently visible in the panel. Click one to move it into "Stashed".'),
        });
        this._availableList = this._makeAvailableListBox();
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

    _makeStashedListBox() {
        const lb = new Gtk.ListBox({ css_classes: ['boxed-list'] });
        const target = Gtk.DropTarget.new(Gtk.ListBoxRow, Gdk.DragAction.MOVE);
        lb.add_controller(target);
        target.connect('drop', (_t, value, _x, y) => this._onReorderDrop(value, y));
        return lb;
    }

    _makeAvailableListBox() {
        return new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
        });
    }

    _addStashedRow(name) {
        const label = getDisplayName(name);
        const row = new Adw.ActionRow({ title: label, selectable: false });
        row._appstashName = name;

        row.add_prefix(new Gtk.Image({
            icon_name: 'list-drag-handle-symbolic',
            css_classes: ['dim-label'],
        }));

        const removeButton = new Gtk.Button({
            icon_name: 'window-close-symbolic',
            css_classes: ['flat'],
            valign: Gtk.Align.CENTER,
            tooltip_text: _('Move back to Available'),
        });
        removeButton.connect('clicked', () => this._unstash(name));
        row.add_suffix(removeButton);

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
            const dragRow = new Adw.ActionRow({ title: label });
            dragRow.add_prefix(new Gtk.Image({
                icon_name: 'list-drag-handle-symbolic',
                css_classes: ['dim-label'],
            }));
            dragWidget.append(dragRow);
            dragWidget.drag_highlight_row(dragRow);
            const icon = Gtk.DragIcon.get_for_drag(drag);
            icon.child = dragWidget;
        });

        this._stashedList.append(row);
    }

    _addAvailableRow(name) {
        const row = new Adw.ActionRow({
            title: getDisplayName(name),
            activatable: true,
            selectable: false,
        });
        row._appstashName = name;
        row.add_suffix(new Gtk.Image({
            icon_name: 'list-add-symbolic',
            css_classes: ['dim-label'],
        }));
        row.connect('activated', () => this._stash(name));
        this._availableList.append(row);
    }

    _stash(name) {
        const stashed = this._settings.get_strv('stashed-roles');
        if (stashed.includes(name)) return;
        stashed.push(name);
        this._settings.set_strv('stashed-roles', stashed);
    }

    _unstash(name) {
        const stashed = this._settings.get_strv('stashed-roles').filter(r => r !== name);
        this._settings.set_strv('stashed-roles', stashed);
    }

    _onReorderDrop(value, y) {
        if (!value) return false;
        const draggedName = value._appstashName;
        if (!draggedName) return false;

        const targetRow = this._stashedList.get_row_at_y(y);
        const targetIndex = targetRow ? targetRow.get_index() : -1;

        let stashed = this._settings.get_strv('stashed-roles');
        if (!stashed.includes(draggedName)) return false;

        stashed = stashed.filter(r => r !== draggedName);
        const idx = targetIndex >= 0 ? targetIndex : stashed.length;
        stashed.splice(idx, 0, draggedName);

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
            this._addPlaceholder(this._stashedList, _('No indicators stashed. Click one in "Available" to hide it.'));
        } else {
            for (const name of stashed) this._addStashedRow(name);
        }

        const available = known.filter(n => !stashedSet.has(n));
        if (available.length === 0) {
            this._addPlaceholder(this._availableList, known.length === 0
                ? _('No indicators detected yet. Enable Appstash first.')
                : _('All known indicators are currently stashed.'));
        } else {
            for (const name of available) this._addAvailableRow(name);
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
