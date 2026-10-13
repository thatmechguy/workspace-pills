# Workspace Pills

A GNOME Shell extension that shows your workspaces and the apps running in each
one as compact **pills** in the top bar.

Each pill shows the workspace number followed by the icons of the apps on that
workspace. A small badge appears on an icon when the same app has more than one
window open. The active workspace is highlighted using the configured color.

## Features

- Workspace pills with per-workspace app icons and window-count badges.
- Click a pill to switch to that workspace.
- Scroll over the pills to move between workspaces.
- Fully configurable appearance (colors, borders, radius, padding, icon size).
- Optional workspace number labels.
- Option to hide empty workspaces (the active workspace is always shown).
- Place the pills on the left, center, or right of the top bar.
- Optionally hide the default Activities button.
- Keyboard accessible: focus a pill and press `Enter`/`Space` to activate it.

## Installation

### From source (recommended for development)

```sh
git clone https://github.com/thatmechguy/workspace-pills.git
cd workspace-pills
glib-compile-schemas schemas/
cp -r . ~/.local/share/gnome-shell/extensions/workspace-pills@thatmechguy/
```

Then restart GNOME Shell:

- **X11:** press `Alt+F2`, type `r`, and press `Enter`.
- **Wayland:** log out and log back in.

Enable the extension:

```sh
gnome-extensions enable workspace-pills@thatmechguy
```

## Settings

Settings are available through the GNOME Extensions app or
`gnome-extensions prefs workspace-pills@thatmechguy`.

| Setting | Description |
| --- | --- |
| Inactive / Active / Hover Color | Pill background colors. |
| Inactive / Active Border Color | Pill border colors. |
| Border Radius | Corner roundness in pixels. |
| Vertical / Horizontal Padding | Inner spacing of each pill. |
| Icon Size | Size of the app icons in pixels. |
| Panel Position | Left, center, or right of the top bar. |
| Show Workspace Number | Toggle the numeric label. |
| Hide Empty Workspaces | Hide workspaces without windows. |
| Show Activities Button | Show/hide the default Activities button. |

## Compatibility

GNOME Shell 45 through 50.

## License

This project is licensed under the GNU General Public License v2.0 or later.
See [LICENSE](LICENSE) for details.
