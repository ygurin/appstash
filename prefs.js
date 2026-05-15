// SPDX-License-Identifier: GPL-3.0-or-later

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import StashPage from './src/prefsPage.js';

export default class AppstashPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(640, 720);

        const page = new StashPage({
            title: _('Appstash'),
            icon_name: 'view-grid-symbolic',
            settings: this.getSettings(),
        });
        window.add(page);
    }
}
