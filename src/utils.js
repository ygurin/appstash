// SPDX-License-Identifier: GPL-3.0-or-later

export function getRoleName(role, indicator) {
    if (!role) return '';

    // AppIndicator / KStatusNotifierItem indicators share a generic role
    // suffix; Electron apps additionally collide on SNI Id (all report
    // "chrome_status_icon_1") and on commandLine (Flatpak'd ones report the
    // xdg-dbus-proxy shim instead of the real binary). Pick the best
    // disambiguator we can find, falling back to busName so two apps with
    // no usable metadata at least don't collapse into one entry.
    const sni = indicator?._indicator;
    if (sni?.id) {
        if (sni.title) return `sni:${sni.id}|${sni.title}`;

        const cmd = sni._commandLine;
        const cmdExe = cmd ? cmd.trim().split(/\s+/)[0] : '';
        const cmdBase = cmdExe ? cmdExe.split('/').pop() : '';
        if (cmdBase && !cmdBase.includes('xdg-dbus-proxy')) {
            return `sni:${sni.id}|${cmdBase}`;
        }

        // No stable info -- bus name is unique within this session only.
        // The stash entry for this app will need to be redone after logout.
        if (sni.busName) return `sni:${sni.id}@${sni.busName}`;
        return `sni:${sni.id}`;
    }

    let roleName = role;
    roleName = roleName.split('/');
    roleName = roleName[roleName.length - 1];
    roleName = roleName.split('@')[0];

    const keyWords = roleName.match(/((\d)*[A-Z]+(\d)*)+/gi);
    if (!keyWords) return roleName;
    return keyWords.join('_');
}

export function getDisplayName(name) {
    if (!name) return '';
    if (!name.startsWith('sni:')) return name;
    const rest = name.slice(4);

    // "id|extra" -- prefer the human-readable extra.
    const pipe = rest.indexOf('|');
    if (pipe !== -1) {
        const id = rest.slice(0, pipe);
        const extra = rest.slice(pipe + 1);
        if (extra && !extra.startsWith('/')) return prettify(extra);
        return prettify(id);
    }

    // "id@:busName" -- bus-name fallback. Suffix the id with the bus number
    // so two otherwise-identical entries are visually distinguishable.
    const at = rest.lastIndexOf('@');
    if (at !== -1) {
        const id = rest.slice(0, at);
        const bus = rest.slice(at + 1).replace(/^:/, '');
        return `${prettify(id)} #${bus}`;
    }

    return prettify(rest);
}

function prettify(s) {
    if (!s) return '';
    return s
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(w => w[0].toUpperCase() + w.slice(1))
        .join(' ');
}
