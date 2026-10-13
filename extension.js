// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Represents a single app icon inside a workspace pill.
 *
 * Left-click focuses the app's window on the workspace, cycling through its
 * windows when it is already focused. Middle-click (optional) closes all of
 * the app's windows on the workspace.
 */
const WorkspaceAppIcon = GObject.registerClass(
class WorkspaceAppIcon extends St.Widget {
    _init(app, windows, settings) {
        super._init({
            layout_manager: new Clutter.BinLayout(),
            y_align: Clutter.ActorAlign.CENTER,
            reactive: true,
            track_hover: true,
            style_class: 'workspace-pill-app-icon-container',
        });

        this._app = app;
        this._windows = windows;
        this._settings = settings;
        this._windowSignals = [];

        this._icon = new St.Icon({
            gicon: app.get_icon(),
            icon_size: settings.get_int('icon-size'),
            style_class: 'workspace-pill-app-icon',
            x_expand: true,
            y_expand: true,
        });
        this.add_child(this._icon);

        if (windows.length > 1) {
            this._badge = new St.Label({
                text: windows.length.toString(),
                style_class: 'workspace-pill-app-badge',
                x_expand: true,
                y_expand: true,
                x_align: Clutter.ActorAlign.END,
                y_align: Clutter.ActorAlign.START,
            });
            this.add_child(this._badge);
        }

        // Focused app indicator (a small underline below the icon)
        this._focusUnderline = new St.Widget({
            style_class: 'workspace-pill-app-underline',
            x_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.END,
            visible: false,
        });
        this.add_child(this._focusUnderline);

        // Attention indicator (a small dot for windows requesting attention)
        this._attentionDot = new St.Widget({
            style_class: 'workspace-pill-app-attention',
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.START,
            visible: false,
        });
        this.add_child(this._attentionDot);

        this.accessible_name = app.get_name();

        this.connect('button-press-event', (actor, event) => this._onButtonPress(event));

        // Watch the windows this icon represents for state changes
        for (const window of windows) {
            this._windowSignals.push(
                [window, window.connect('notify::demands-attention', () => this._updateState())],
                [window, window.connect('notify::minimized', () => this._updateState())]);
        }
        this._focusWindowId = global.display.connect('notify::focus-window', () => this._updateState());

        this._updateState();
    }

    _onButtonPress(event) {
        const button = event.get_button();

        if (button === 1) {
            this._activateApp();
            return Clutter.EVENT_STOP;
        }

        if (button === 2 && this._settings.get_boolean('close-on-middle-click')) {
            for (const window of this._windows)
                window.delete(global.get_current_time());
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    // Focus the app's most recent window, cycling when it is already focused
    _activateApp() {
        if (!this._windows.length)
            return;

        const focus = global.display.focus_window;
        const index = this._windows.indexOf(focus);
        const target = index === -1
            ? this._windows[0]
            : this._windows[(index + 1) % this._windows.length];

        target.activate(global.get_current_time());
    }

    _updateState() {
        // Focused app underline
        const focus = global.display.focus_window;
        this._focusUnderline.visible =
            this._settings.get_boolean('highlight-focused-app') &&
            !!focus && this._windows.includes(focus);

        // Attention dot
        this._attentionDot.visible =
            this._settings.get_boolean('highlight-attention') &&
            this._windows.some(w => w.demands_attention);

        // Dim icons whose windows are all minimized
        const dimmed = this._settings.get_boolean('dim-minimized') &&
            this._windows.length > 0 &&
            this._windows.every(w => w.minimized);
        this._icon.opacity = dimmed ? 120 : 255;
    }

    destroy() {
        for (const [window, id] of this._windowSignals)
            window.disconnect(id);
        this._windowSignals = [];

        if (this._focusWindowId) {
            global.display.disconnect(this._focusWindowId);
            this._focusWindowId = 0;
        }
        super.destroy();
    }
});

/**
 * A panel button styled as a pill that opens the GNOME Shell overview.
 */
const OverviewButton = GObject.registerClass(
class OverviewButton extends St.Button {
    _init() {
        super._init({
            style_class: 'workspace-pill workspace-pill-overview',
            can_focus: true,
            track_hover: true,
        });

        this.child = new St.Icon({
            icon_name: 'view-app-grid-symbolic',
            icon_size: 16,
            style_class: 'workspace-pill-overview-icon',
        });

        this.accessible_name = 'Overview';
        this.connect('clicked', () => this._toggleOverview());
    }

    _toggleOverview() {
        if (typeof Main.overview.toggle === 'function') {
            Main.overview.toggle();
        } else if (Main.overview.visible) {
            Main.overview.hide();
        } else {
            Main.overview.show();
        }
    }
});

/**
 * Represents a single workspace indicator in the top bar.
 * It displays the workspace number and the icons of running apps.
 */
const WorkspaceIndicator = GObject.registerClass(
class WorkspaceIndicator extends St.BoxLayout {
    _init(workspace, settings, wmSettings) {
        super._init({
            style_class: 'workspace-pill',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._workspace = workspace;
        this._settings = settings;
        this._wmSettings = wmSettings;
        this._tracker = Shell.WindowTracker.get_default();
        this._isActive = false;
        this._redisplayIdleId = 0;

        // Add the workspace number/name
        this._label = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'workspace-pill-label',
        });
        this.add_child(this._label);

        // Create a container for app icons
        this._appIconsBox = new St.BoxLayout({
            style_class: 'workspace-pill-app-icons',
        });
        this.add_child(this._appIconsBox);

        // Switch to this workspace when clicked (left click only)
        this.connect('button-press-event', (actor, event) => {
            if (event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;
            this._activate();
            return Clutter.EVENT_STOP;
        });

        // Keyboard accessibility: Enter/Space activates the workspace
        this.connect('key-press-event', (actor, event) => {
            const symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return ||
                symbol === Clutter.KEY_KP_Enter ||
                symbol === Clutter.KEY_space) {
                this._activate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        // Connect to workspace signals to update app icons
        this._windowAddedId = this._workspace.connect('window-added', () => this._queueRedisplay());
        this._windowRemovedId = this._workspace.connect('window-removed', () => this._queueRedisplay());
        this._trackerChangedId = this._tracker.connect('tracked-windows-changed', () => this._queueRedisplay());
        this._wmSettingsId = this._wmSettings.connect('changed::workspace-names', () => this._updateLabel());

        // Watch for setting changes and hover
        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            if (key === 'icon-size' || key === 'show-workspace-number' ||
                key === 'show-workspace-name' || key === 'highlight-focused-app' ||
                key === 'highlight-attention' || key === 'dim-minimized' ||
                key === 'close-on-middle-click')
                this._queueRedisplay();
            if (key === 'active-color' || key === 'inactive-color' ||
                key === 'hover-color' || key === 'border-color' ||
                key === 'active-border-color' || key === 'border-radius' ||
                key === 'vertical-padding' || key === 'horizontal-padding' ||
                key === 'match-shell-color')
                this._updateStyle();
        });
        this.connect('notify::hover', () => this._updateStyle());

        this._redisplay();
        this._updateStyle();
    }

    get workspace() {
        return this._workspace;
    }

    // Whether this workspace has any regular (non-skip-taskbar) windows
    hasWindows() {
        return this._workspace.list_windows().some(w => !w.is_skip_taskbar());
    }

    _activate() {
        this._workspace.activate(global.get_current_time());
    }

    // Update the label text based on the configured label mode
    _updateLabel() {
        const index = this._workspace.index();
        const showName = this._settings.get_boolean('show-workspace-name');
        const showNumber = this._settings.get_boolean('show-workspace-number');

        let text = '';
        if (showName) {
            const names = this._wmSettings.get_strv('workspace-names');
            const name = names[index];
            text = name && name.trim() ? name : (index + 1).toString();
        } else if (showNumber) {
            text = (index + 1).toString();
        }

        this._label.text = text;
        this._label.visible = text !== '';
    }

    _queueRedisplay() {
        if (this._redisplayIdleId) return;
        this._redisplayIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._redisplayIdleId = 0;
            this._redisplay();
            return GLib.SOURCE_REMOVE;
        });
    }

    setActive(isActive) {
        if (this._isActive === isActive) return;
        this._isActive = isActive;
        this._updateStyle();
    }

    _updateStyle() {
        const isHover = this.hover;
        let bgColor = '';
        let borderColor = '';

        if (this._isActive) {
            this.add_style_class_name('active');
            if (this._settings.get_boolean('match-shell-color')) {
                // Let the stylesheet resolve -st-accent-color so the pill
                // always matches the GNOME Shell accent color.
                this.add_style_class_name('match-accent');
            } else {
                this.remove_style_class_name('match-accent');
                bgColor = this._settings.get_string('active-color');
                borderColor = this._settings.get_string('active-border-color');
            }
        } else {
            this.remove_style_class_name('active');
            this.remove_style_class_name('match-accent');
            bgColor = isHover
                ? this._settings.get_string('hover-color')
                : this._settings.get_string('inactive-color');
            borderColor = this._settings.get_string('border-color');
        }

        const radius = this._settings.get_int('border-radius');
        const vPad = this._settings.get_int('vertical-padding');
        const hPad = this._settings.get_int('horizontal-padding');

        this.style = `
            ${bgColor ? `background-color: ${bgColor};` : ''}
            ${borderColor ? `border-color: ${borderColor};` : ''}
            border-radius: ${radius}px;
            padding: ${vPad}px ${hPad}px;
        `;
    }

    // Rebuild the app icons for this workspace
    _redisplay() {
        this._appIconsBox.destroy_all_children();

        // Filter out background windows and keep a stable order so icons
        // don't shuffle around every time a window is added or removed.
        const windows = this._workspace.list_windows()
            .filter(w => !w.is_skip_taskbar())
            .sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());

        const apps = new Map();
        for (const window of windows) {
            const app = this._tracker.get_window_app(window);
            if (!app) continue;

            if (!apps.has(app))
                apps.set(app, []);
            apps.get(app).push(window);
        }

        for (const [app, appWindows] of apps) {
            this._appIconsBox.add_child(
                new WorkspaceAppIcon(app, appWindows, this._settings));
        }

        this._updateLabel();
        this.accessible_name = `${this._workspace.index() + 1}: ` +
            (apps.size ? [...apps.keys()].map(a => a.get_name()).join(', ') : 'empty');
    }

    // Cleanup on destruction
    destroy() {
        if (this._redisplayIdleId) {
            GLib.source_remove(this._redisplayIdleId);
            this._redisplayIdleId = 0;
        }
        if (this._windowAddedId) {
            this._workspace.disconnect(this._windowAddedId);
            this._windowAddedId = 0;
        }
        if (this._windowRemovedId) {
            this._workspace.disconnect(this._windowRemovedId);
            this._windowRemovedId = 0;
        }
        if (this._trackerChangedId) {
            this._tracker.disconnect(this._trackerChangedId);
            this._trackerChangedId = 0;
        }
        if (this._wmSettingsId) {
            this._wmSettings.disconnect(this._wmSettingsId);
            this._wmSettingsId = 0;
        }
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        super.destroy();
    }
});

/**
 * The main container for all workspace indicators.
 * Manages creating, destroying, and updating indicators.
 */
const WorkspaceAppsIndicator = GObject.registerClass(
class WorkspaceAppsIndicator extends St.BoxLayout {
    _init(settings) {
        super._init({
            style_class: 'workspace-pills-container',
            reactive: true,
        });
        this._workspaceManager = global.workspace_manager;
        this._settings = settings;
        this._wmSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.preferences'});
        this._indicators = [];
        this._workspaceSignals = [];

        // Connect to workspace manager signals
        this._signals = [
            this._workspaceManager.connect('notify::n-workspaces', () => this._redisplay()),
            this._workspaceManager.connect('workspace-switched', () => this._updateActiveWorkspace()),
            this._workspaceManager.connect('workspaces-reordered', () => this._redisplay()),
        ];

        // Handle scroll events to switch workspaces
        this.connect('scroll-event', (actor, event) => this._onScroll(event));

        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            if (key === 'hide-empty-workspaces' || key === 'show-overview-button')
                this._redisplay();
        });

        this._redisplay();
    }

    _onScroll(event) {
        const direction = event.get_scroll_direction();
        const activeIndex = this._workspaceManager.get_active_workspace_index();
        const nWorkspaces = this._workspaceManager.get_n_workspaces();

        let newIndex = activeIndex;
        if (direction === Clutter.ScrollDirection.UP)
            newIndex--;
        else if (direction === Clutter.ScrollDirection.DOWN)
            newIndex++;
        else
            return Clutter.EVENT_PROPAGATE;

        if (this._settings.get_boolean('scroll-wrap'))
            newIndex = (newIndex + nWorkspaces) % nWorkspaces;

        if (newIndex >= 0 && newIndex < nWorkspaces && newIndex !== activeIndex)
            this._workspaceManager.get_workspace_by_index(newIndex).activate(event.get_time());
        return Clutter.EVENT_STOP;
    }

    // Redraw all workspace indicators
    _redisplay() {
        this._disconnectWorkspaceSignals();
        this.destroy_all_children();
        this._indicators = [];

        if (this._settings.get_boolean('show-overview-button'))
            this.add_child(new OverviewButton());

        const nWorkspaces = this._workspaceManager.get_n_workspaces();
        for (let i = 0; i < nWorkspaces; i++) {
            const workspace = this._workspaceManager.get_workspace_by_index(i);
            const indicator = new WorkspaceIndicator(workspace, this._settings, this._wmSettings);
            this.add_child(indicator);
            this._indicators.push(indicator);
        }

        // When empty workspaces are hidden we need to re-evaluate visibility
        // whenever a window is added to or removed from any workspace.
        if (this._settings.get_boolean('hide-empty-workspaces')) {
            for (const indicator of this._indicators) {
                const workspace = indicator.workspace;
                this._workspaceSignals.push(
                    [workspace, workspace.connect('window-added', () => this._updateActiveWorkspace())],
                    [workspace, workspace.connect('window-removed', () => this._updateActiveWorkspace())]);
            }
        }

        this._updateActiveWorkspace();
    }

    _disconnectWorkspaceSignals() {
        for (const [workspace, id] of this._workspaceSignals)
            workspace.disconnect(id);
        this._workspaceSignals = [];
    }

    // Apply a style to the currently active workspace indicator and hide
    // empty ones when requested.
    _updateActiveWorkspace() {
        const activeWorkspace = this._workspaceManager.get_active_workspace();
        const hideEmpty = this._settings.get_boolean('hide-empty-workspaces');

        for (const indicator of this._indicators) {
            const isActive = indicator.workspace === activeWorkspace;
            indicator.setActive(isActive);
            indicator.visible = !hideEmpty || isActive || indicator.hasWindows();
        }
    }

    // Cleanup on destruction
    destroy() {
        this._disconnectWorkspaceSignals();

        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        if (this._signals) {
            this._signals.forEach(id => this._workspaceManager.disconnect(id));
            this._signals = null;
        }
        super.destroy();
    }
});

/**
 * Handles the visibility of the default GNOME Activities button.
 */
class ActivitiesButtonController {
    constructor(settings) {
        this._settings = settings;
        this._button = Main.panel.statusArea.activities;
        this._visibilityId = 0;
        this._settingsId = 0;

        if (this._button) {
            this._updateVisibility();
            this._settingsId = this._settings.connect('changed::show-activities', () => {
                this._updateVisibility();
            });
        }
    }

    _updateVisibility() {
        if (!this._button) return;

        const show = this._settings.get_boolean('show-activities');

        if (show) {
            this._disconnectVisibilityListener();
            this._button.visible = true;
        } else {
            this._button.visible = false;
            if (!this._visibilityId) {
                this._visibilityId = this._button.connect('notify::visible', () => {
                    if (this._button.visible)
                        this._button.visible = false;
                });
            }
        }
    }

    _disconnectVisibilityListener() {
        if (this._visibilityId) {
            this._button.disconnect(this._visibilityId);
            this._visibilityId = 0;
        }
    }

    destroy() {
        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }

        this._disconnectVisibilityListener();

        if (this._button) {
            this._button.visible = true;
            this._button = null;
        }
        this._settings = null;
    }
}

export default class WorkspaceAppsIndicatorExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        // Initialize the indicator
        this._indicator = new WorkspaceAppsIndicator(this._settings);
        this._positionIndicator();

        this._positionChangedId = this._settings.connect('changed::panel-position', () => {
            this._positionIndicator();
        });

        // Initialize the activities button controller
        this._activitiesButtonController = new ActivitiesButtonController(this._settings);
    }

    _positionIndicator() {
        const boxes = {
            left: Main.panel._leftBox,
            center: Main.panel._centerBox,
            right: Main.panel._rightBox,
        };
        const box = boxes[this._settings.get_string('panel-position')] ?? Main.panel._leftBox;

        this._indicator.get_parent()?.remove_child(this._indicator);
        box.insert_child_at_index(this._indicator, 0);
    }

    disable() {
        if (this._positionChangedId) {
            this._settings.disconnect(this._positionChangedId);
            this._positionChangedId = 0;
        }

        this._indicator?.destroy();
        this._indicator = null;

        this._activitiesButtonController?.destroy();
        this._activitiesButtonController = null;

        this._settings = null;
    }
}
