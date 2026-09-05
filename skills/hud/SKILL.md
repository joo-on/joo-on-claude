---
name: hud
description: Install, configure, or remove the joo-on-claude HUD statusline — a two-line status bar showing path, branch, model, context-window usage, session cost, rate limit and clock on line 1, and the last tool, running agents with elapsed time, the last skill, and todo progress on line 2. Trigger on "hud setup", "install the hud", "statusline 설치", "HUD 설치", "상태줄 설정", "hud status", "HUD 상태", "hud remove", "HUD 제거", "상태줄 없애줘", or when the user asks why their statusline is blank or out of date. Do NOT trigger for editing settings.json in general — use the settings tooling for that.
argument-hint: "[setup|status|remove]"
allowed-tools: Read, Write, Edit, Bash(mkdir:*), Bash(ln:*), Bash(rm:*), Bash(ls:*), Bash(readlink:*), Bash(test:*), Bash(node:*), Bash(diff:*)
model: opus
---

# HUD Skill

Install and manage the joo-on-claude HUD (Heads-Up Display) statusline.

Read `$ARGUMENTS` to pick the operation. With no argument, default to `setup`.

## How the install works

Setup **symlinks** the plugin's `statusline/statusline.mjs` into `~/.claude/hud/` rather than copying it. The trade-off is deliberate:

- **Why a symlink:** a copy silently goes stale. Every plugin update would leave the installed statusline frozen at whatever version was current when you ran setup, with nothing reporting the drift. The link always resolves to the installed plugin, so updating the plugin updates the HUD.
- **What it costs:** if the plugin is uninstalled or its cache directory is pruned, the link dangles and the statusline goes blank. Run `remove` before uninstalling the plugin, or re-run `setup` afterwards. `status` detects a dangling link explicitly.

## `setup` (default)

1. **Create the directory and replace any previous install:**
   ```bash
   mkdir -p ~/.claude/hud
   rm -f ~/.claude/hud/statusline.mjs ~/.claude/hud/.cache.json
   ln -s "${CLAUDE_PLUGIN_ROOT}/statusline/statusline.mjs" ~/.claude/hud/statusline.mjs
   ```
   `rm -f` clears both a stale copy from an older install and `.cache.json`, which older versions of the statusline wrote and current versions do not.

2. **Verify the link resolves:**
   ```bash
   test -e ~/.claude/hud/statusline.mjs && echo OK || echo BROKEN
   ```
   If this prints `BROKEN`, `${CLAUDE_PLUGIN_ROOT}` did not expand — report that instead of continuing, because the statusline would render blank.

3. **Point settings.json at it.** Read `~/.claude/settings.json` and set:
   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node ~/.claude/hud/statusline.mjs"
     }
   }
   ```
   Overwrite any existing `statusLine` value. Preserve every other key in the file.

4. **Check the Node version:**
   ```bash
   node --version
   ```
   Warn if it is below 18.

5. **Report:** tell the user the HUD is installed and that restarting Claude Code (`/exit`, then start again) applies the new statusline.

## `status`

Report four things:

1. **Link** — `readlink ~/.claude/hud/statusline.mjs`
   - a path into the plugin → `✅ linked`
   - resolves to nothing (`test -e` fails) → `❌ broken link` and suggest re-running `setup`
   - a regular file, not a link → `⚠️ copy (legacy)`; `diff` it against `${CLAUDE_PLUGIN_ROOT}/statusline/statusline.mjs` and report whether it is current, then suggest re-running `setup` to convert it to a link
   - missing → `❌ not installed`
2. **Settings** — whether `statusLine.command` in `~/.claude/settings.json` is `node ~/.claude/hud/statusline.mjs`
3. **Node** — `node --version`, flagged if below 18
4. **Render check** — confirm the script parses:
   ```bash
   node --check ~/.claude/hud/statusline.mjs
   ```

Print it as a short block:

```
HUD Status:
- Link:     ✅ linked → <plugin>/statusline/statusline.mjs
- Settings: ✅ configured
- Node:     ✅ v22.11.0
- Script:   ✅ parses
```

## `remove`

1. Remove the `statusLine` field from `~/.claude/settings.json`, preserving every other key.
2. Delete the directory:
   ```bash
   rm -rf ~/.claude/hud
   ```
3. Report that the HUD is removed and that restarting Claude Code restores the default statusline.

## Troubleshooting a blank statusline

The statusline writes diagnostics to **stderr**, so a failure is no longer silent. Run it by hand against a minimal payload to see what it says:

```bash
echo '{"cwd":"'"$PWD"'"}' | node ~/.claude/hud/statusline.mjs
```

Line 1 renders even when the transcript cannot be parsed — the two are handled separately on purpose, so a transcript problem costs you line 2 only.

## Environment variables

- `CLAUDE_CONFIG_DIR` — Claude's config directory (default `~/.claude`). Honour it in every path this skill touches.
- `CLAUDE_PLUGIN_ROOT` — set by Claude Code to this plugin's root. It is what makes the symlink target correct across installs; never hardcode a path into the plugin cache.
