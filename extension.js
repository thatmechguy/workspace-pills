// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

/**
 * Represents a single workspace indicator in the top bar.
 * It displays the workspace number and the icons of running apps.
 */
const WorkspaceIndicator = GObject.registerClass(
class WorkspaceIndicator extends St.BoxLayout {
    _init(workspace, settings) {
        super._init({
            style_class: 'workspace-pill',
            reactive: true,
            can_focus: true,
            track_hover: true,
        });

        this._workspace = workspace;
        this._settings = settings;
        this._tracker = Shell.WindowTracker.get_default();
        this._isActive = false;
        this._redisplayIdleId = 0;

        // Add the workspace number
        this._label = new St.Label({
            text: (this._workspace.index() + 1).toString(),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'workspace-pill-label',
        });
        this.add_child(this._label);

        // Create a container for app icons
        this._appIconsBox = new St.BoxLayout({
            style_class: 'workspace-pill-app-icons',
        });
        this.add_child(this._appIconsBox);

        // Switch to this workspace when clicked
        this.connect('button-press-event', (actor, event) => {
            this._workspace.activate(event.get_time());
        });

        // Connect to workspace signals to update app icons
        this._windowAddedId = this._workspace.connect('window-added', () => this._queueRedisplay());
        this._windowRemovedId = this._workspace.connect('window-removed', () => this._queueRedisplay());
        this._trackerChangedId = this._tracker.connect('tracked-windows-changed', () => this._queueRedisplay());

        // Watch for setting changes and hover
        this._settingsChangedId = this._settings.connect('changed', (s, key) => {
            if (key === 'icon-size') {
                this._queueRedisplay();
            }
            this._updateStyle();
        });
        this.connect('notify::hover', () => this._updateStyle());

        this._redisplay();
        this._updateStyle();
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
        this._isActive = isActive;
        this._updateStyle();
    }

    _updateStyle() {
        const isHover = this.hover;
        let bgColor = this._settings.get_string('inactive-color');
        
        if (this._isActive) {
            bgColor = this._settings.get_string('active-color');
        } else if (isHover) {
            bgColor = this._settings.get_string('hover-color');
        }

        const radius = this._settings.get_int('border-radius');
        const vPad = this._settings.get_int('vertical-padding');
        const hPad = this._settings.get_int('horizontal-padding');

        this.style = `
            background-color: ${bgColor};
            border-color: ${this._isActive ? bgColor : 'rgba(128, 128, 128, 0.3)'};
            border-radius: ${radius}px;
            padding: ${vPad}px ${hPad}px;
        `;
    }

    // Redraw the app icons for this workspace
    _redisplay() {
        this._appIconsBox.destroy_all_children();
        const windows = this._workspace.list_windows();
        const appCounts = new Map();

        // Get a unique set of apps from the windows on this workspace
        for (const window of windows) {
            if (window.is_skip_taskbar())
                continue;
            const app = this._tracker.get_window_app(window);
            if (app) {
                appCounts.set(app, (appCounts.get(app) || 0) + 1);
            }
        }

        // Create and add an icon for each unique app
        const iconSize = this._settings.get_int('icon-size');
        for (const [app, count] of appCounts) {
            const iconContainer = new St.Widget({
                layout_manager: new Clutter.BinLayout(),
                y_align: Clutter.ActorAlign.CENTER,
            });

            const icon = new St.Icon({
                gicon: app.get_icon(),
                icon_size: iconSize,
                style_class: 'workspace-pill-app-icon',
                x_expand: true,
                y_expand: true,
            });
            iconContainer.add_child(icon);

            if (count > 1) {
                const badge = new St.Label({
                    text: count.toString(),
                    style_class: 'workspace-pill-app-badge',
                    x_expand: true,
                    y_expand: true,
                    x_align: Clutter.ActorAlign.END,
                    y_align: Clutter.ActorAlign.START,
                });
                iconContainer.add_child(badge);
            }
            this._appIconsBox.add_child(iconContainer);
        }
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

        // Connect to workspace manager signals
        this._signals = [
            this._workspaceManager.connect('notify::n-workspaces', () => this._redisplay()),
            this._workspaceManager.connect('workspace-switched', () => this._updateActiveWorkspace()),
        ];

        // Handle scroll events to switch workspaces
        this.connect('scroll-event', (actor, event) => {
            const direction = event.get_scroll_direction();
            const activeIndex = this._workspaceManager.get_active_workspace_index();
            const nWorkspaces = this._workspaceManager.get_n_workspaces();
            let newIndex = activeIndex;

            if (direction === Clutter.ScrollDirection.UP) {
                newIndex--;
            } else if (direction === Clutter.ScrollDirection.DOWN) {
                newIndex++;
            }

            if (newIndex >= 0 && newIndex < nWorkspaces && newIndex !== activeIndex) {
                this._workspaceManager.get_workspace_by_index(newIndex).activate(event.get_time());
            }
            return Clutter.EVENT_STOP;
        });

        this._redisplay();
    }

    // Redraw all workspace indicators
    _redisplay() {
        this.destroy_all_children();

        const nWorkspaces = this._workspaceManager.get_n_workspaces();
        for (let i = 0; i < nWorkspaces; i++) {
            const workspace = this._workspaceManager.get_workspace_by_index(i);
            const indicator = new WorkspaceIndicator(workspace, this._settings);
            this.add_child(indicator);
        }
        this._updateActiveWorkspace();
    }

    // Apply a style to the currently active workspace indicator
    _updateActiveWorkspace() {
        const activeIndex = this._workspaceManager.get_active_workspace_index();
        this.get_children().forEach((child, index) => {
            child.setActive(index === activeIndex);
        });
    }

    // Cleanup on destruction
    destroy() {
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
                    if (this._button.visible) {
                        this._button.visible = false;
                    }
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
        Main.panel._leftBox.insert_child_at_index(this._indicator, 0);

        // Initialize the activities button controller
        this._activitiesButtonController = new ActivitiesButtonController(this._settings);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;

        this._activitiesButtonController?.destroy();
        this._activitiesButtonController = null;
        
        this._settings = null;
    }
}