#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Install:   curl -fsSL https://raw.githubusercontent.com/ygurin/appstash/main/install.sh | bash
# Uninstall: curl -fsSL https://raw.githubusercontent.com/ygurin/appstash/main/install.sh | bash -s -- uninstall

set -euo pipefail

UUID='appstash@ygurin.github.io'
TARBALL='https://github.com/ygurin/appstash/archive/refs/heads/main.tar.gz'
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

die() {
    echo "error: $*" >&2
    exit 1
}

# Adding to the list directly works before the shell knows about the extension,
# unlike `gnome-extensions enable`, so it loads by itself on the next login.
mark_enabled() {
    local current
    current=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null) || return 1
    case "$current" in
        *"'$UUID'"*) ;;
        '@as []' | '[]') gsettings set org.gnome.shell enabled-extensions "['$UUID']" ;;
        *) gsettings set org.gnome.shell enabled-extensions "${current%]}, '$UUID']" ;;
    esac
}

# The running shell watches this list, so removing the entry also disables the
# extension right away and puts stashed indicators back on the panel.
mark_disabled() {
    local current
    current=$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null) || return 1
    case "$current" in
        *"'$UUID'"*)
            gsettings set org.gnome.shell enabled-extensions \
                "$(printf '%s' "$current" | sed -e "s/'$UUID', //" -e "s/, '$UUID'//" -e "s/'$UUID'//")"
            ;;
    esac
}

warn_if_unsupported() {
    local metadata=$1 shell_version major supported
    if ! command -v gnome-shell >/dev/null; then
        echo "warning: gnome-shell not found; Appstash only runs on GNOME Shell." >&2
        return 0
    fi
    shell_version=$(gnome-shell --version)
    shell_version=${shell_version##* }
    major=${shell_version%%.*}
    if ! grep '"shell-version"' "$metadata" | grep -q "\"$major\""; then
        supported=$(sed -n 's/.*"shell-version": *\[\(.*\)\].*/\1/p' "$metadata" | tr -d '"')
        echo "warning: GNOME Shell $major is not supported (supported: $supported); the extension will not load." >&2
    fi
}

missing_tool() {
    die "$1 is required but not installed. Install it with your package manager, for example:
  Debian/Ubuntu: sudo apt install curl libglib2.0-bin
  Fedora:        sudo dnf install curl glib2
  Arch:          sudo pacman -S curl glib2
  openSUSE:      sudo zypper install curl glib2-tools"
}

do_install() {
    local cmd tmp src stage
    for cmd in curl tar glib-compile-schemas; do
        command -v "$cmd" >/dev/null || missing_tool "$cmd"
    done

    tmp=$(mktemp -d)
    # shellcheck disable=SC2064  # expand now: tmp is local and gone by EXIT
    trap "rm -rf '$tmp'" EXIT

    echo "Downloading Appstash..."
    curl -fsSL "$TARBALL" | tar -xz -C "$tmp"
    src="$tmp/appstash-main"
    [ -f "$src/metadata.json" ] || die "downloaded archive has no metadata.json"

    warn_if_unsupported "$src/metadata.json"

    stage="$tmp/stage"
    mkdir "$stage"
    cp -r "$src/extension.js" "$src/prefs.js" "$src/metadata.json" "$src/icon.svg" \
        "$src/src" "$src/schemas" "$stage/"
    glib-compile-schemas "$stage/schemas"

    # Removes only the link if a `make install` symlink is here, not the repo.
    mkdir -p "$(dirname "$TARGET")"
    rm -rf "$TARGET"
    mv "$stage" "$TARGET"

    mark_enabled || echo "warning: could not enable automatically; run: gnome-extensions enable $UUID" >&2

    echo "Installed to $TARGET"
    echo "Log out and back in to start using Appstash."
}

do_uninstall() {
    mark_disabled || echo "warning: could not update enabled-extensions" >&2

    if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
        rm -rf "$TARGET"
        echo "Removed $TARGET"
    else
        echo "Appstash is not installed."
    fi
}

# Everything runs from here so a download cut off midway does nothing.
main() {
    [ "$(id -u)" -ne 0 ] || die "run as your normal user, not root (extensions install per user)"

    case "${1:-install}" in
        install) do_install ;;
        uninstall) do_uninstall ;;
        *) die "unknown command '$1' (expected install or uninstall)" ;;
    esac
}

main "$@"
