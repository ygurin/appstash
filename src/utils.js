// SPDX-License-Identifier: GPL-3.0-or-later

export function getRoleName(role) {
    if (!role) return '';

    let roleName = role;
    roleName = roleName.split('/');
    roleName = roleName[roleName.length - 1];
    roleName = roleName.split('@')[0];

    const keyWords = roleName.match(/((\d)*[A-Z]+(\d)*)+/gi);
    if (!keyWords) return roleName;
    return keyWords.join('_');
}
