---
name: cmux
description: Reference for cmux terminal app — notifications, CLI commands, socket API, workspace management, browser automation, and Claude Code integration. Use when working with cmux features, sending notifications, automating terminals, or managing workspaces.
version: 1.0.0
---

# cmux Reference

cmux is a native macOS terminal app built on Ghostty for managing multiple AI coding agents. Vertical tabs, notification rings, split panes, embedded browser, and a socket API for automation.

## Quick Detection

```bash
# Check if running inside cmux
[ -S "${CMUX_SOCKET_PATH:-$HOME/.cmux/cmux.sock}" ] && echo "cmux available"
command -v cmux &>/dev/null && cmux ping
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `CMUX_SOCKET_PATH` | Override socket path |
| `CMUX_WORKSPACE_ID` | Auto-set: current workspace |
| `CMUX_SURFACE_ID` | Auto-set: current surface |
| `CMUX_SOCKET_MODE` | Access mode (cmuxOnly, allowAll, off) |
| `CMUX_SOCKET_ENABLE` | Force enable/disable (1/0) |
| `TERM_PROGRAM` | Set to `ghostty` |

## Hierarchy

Window > Workspace (sidebar tab) > Pane (split) > Surface (terminal or browser)

## Notifications

cmux has **built-in notification support** — panes light up with blue rings when agents need attention, desktop notifications fire automatically, and unread badges appear on workspace tabs.

### Sending Notifications

**CLI (preferred):**
```bash
cmux notify --title "Title" --body "Message"
cmux notify --title "Claude Code" --subtitle "Done" --body "Task complete"
```

**OSC escape sequences:**
```bash
# OSC 777 (simple)
printf '\033]777;notify;Title;Body\007'
# OSC 99 (kitty, rich)
printf '\033]99;i=1;title=Title;subtitle=Sub\007'
```

**Socket API:**
```bash
echo '{"method":"notification.create","params":{"title":"Done","body":"Complete"}}' | nc -U ~/.cmux/cmux.sock
```

### Notification Lifecycle
Received (panel + desktop alert) > Unread (badge) > Read (view workspace) > Cleared

### Suppression
Desktop alerts suppressed when: cmux window focused, workspace active, or notification panel open.

### Managing
```bash
cmux list-notifications
cmux clear-notifications
```

**Jump to latest unread:** `Cmd+Shift+U`

## CLI Commands

### Workspace Management
```bash
cmux list-workspaces
cmux new-workspace [name]
cmux select-workspace [id]
cmux close-workspace
```

### Split Panes
```bash
cmux new-split right|left|up|down
cmux list-surfaces
cmux focus-surface [id]
```

### Input Control
```bash
cmux send "text"                    # To focused terminal
cmux send-key enter|tab|escape|up|down|left|right
cmux send-surface [id] "text"       # To specific surface
cmux send-key-surface [id] enter
```

### Sidebar Metadata
```bash
cmux set-status [key] [value]       # Status pill (unique key)
cmux clear-status [key]
cmux set-progress 0.5               # Progress bar (0.0-1.0)
cmux clear-progress
cmux log info|success|warning|error "message"
cmux clear-log
```

### Utility
```bash
cmux ping
cmux capabilities
cmux identify                       # Current window/workspace/pane/surface
```

## Claude Code Integration

### Hooks
cmux notifications replace osascript-based hooks. Since cmux auto-detects when agents need attention (blue rings + desktop alerts), a custom `Notification` hook using osascript is **redundant**.

If you still want explicit hook-based notifications:
```json
{
  "Notification": [{
    "matcher": "",
    "hooks": [{
      "type": "command",
      "command": "cmux notify --title 'Claude Code' --body \"$(python3 -c \"import sys,json; print(json.load(sys.stdin).get('message','Needs attention'))\")\""
    }]
  }]
}
```

### Teams Mode
```bash
cmux claude-teams [args]
```
Sets `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, installs tmux shim, teammates appear as native splits.

## Browser Automation
```bash
cmux browser goto [url]
cmux browser snapshot              # Accessibility tree
cmux browser screenshot [file]
cmux browser click [selector]
cmux browser fill [selector] [text]
cmux browser eval [javascript]
cmux browser get-text [selector]
cmux browser wait-selector [sel]
cmux browser wait-text [text]
```

## Custom Commands (cmux.json)

Place at project root or `~/.config/cmux/cmux.json`:
```json
{
  "commands": [{
    "name": "Dev Setup",
    "command": "npm run dev",
    "confirm": false
  }]
}
```

Workspace layouts with splits:
```json
{
  "name": "Dev",
  "layout": {
    "type": "split", "direction": "right", "divider": 0.6,
    "children": [
      {"type": "pane", "surfaces": [{"type": "terminal", "command": "npm run dev"}]},
      {"type": "pane", "surfaces": [{"type": "browser", "url": "http://localhost:3000"}]}
    ]
  }
}
```

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New workspace | `Cmd+T` |
| Prev/Next workspace | `Cmd+Shift+[` / `]` |
| Jump workspace 1-8 | `Cmd+1` - `Cmd+8` |
| Close workspace | `Cmd+W` |
| Split right | `Cmd+D` |
| Split down | `Cmd+Shift+D` |
| Focus pane | `Cmd+Option+Arrow` |
| Browser | `Cmd+B` |
| Notifications panel | `Cmd+Shift+I` |
| Jump unread | `Cmd+Shift+U` |
| Find | `Cmd+F` |

All shortcuts configurable in `~/.config/cmux/settings.json`.

## SSH
```bash
cmux ssh user@host [-n name] [-p port] [-i key]
```
Browser panes route through remote network. Drag-and-drop files via scp. Notifications appear locally.

## Socket API

Socket at `~/.cmux/cmux.sock`. Send newline-terminated JSON:
```bash
echo '{"method":"workspace.list","params":{}}' | nc -U ~/.cmux/cmux.sock
```

Access modes: Off | cmuxOnly (default) | allowAll
