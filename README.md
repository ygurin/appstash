# Appstash

A collapsible system tray for GNOME. Stash top-bar indicators behind an arrow button and reveal them in a popup. Inspired by KDE Plasma System Tray.

![demo](demo.gif)

## Purpose

In Gnome 2026 I could not find any extension that provides a System Tray to hide icons. A Gnome extension called [Lilypad](https://github.com/shendrew/Lilypad) works, but fails to solve the issue of icons overlaying on top of the Gnome Clock.

## Status

**Proof of concept.** Written using generative AI tools as an experimental GNOME Shell extension.  Use it, fork it, learn from it. This is purely experimental I do not intend to support it in the future.

Targets GNOME Shell version:

- 50

## What it does

- Adds an arrow button to the top bar (`V` closed, `^` open).
- In preferences, pick which top-bar indicators to "stash".
- Stashed indicators are hidden from the panel; clicking the arrow reveals them in a popup row.
- A cog icon at the end of the popup opens preferences.
- Icon size, "hide when empty", and which indicators to stash are all configurable.

## Install

```sh
git clone https://github.com/ygurin/appstash.git
cd appstash
make install
```

This compiles the schemas and symlinks the repo into `~/.local/share/gnome-shell/extensions/appstash@ygurin.github.io`.

Then log out and log back in (Wayland requires this — there's no in-place reload). After login:

```sh
make enable
make prefs
```

Other targets: `make disable`, `make pack` (builds a `.shell-extension.zip`), `make clean`.

## Uninstall

```sh
make uninstall
```

## License

GPL-3.0-or-later.
