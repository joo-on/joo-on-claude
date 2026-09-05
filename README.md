# joo-on-claude

Personal Claude Code plugin — HUD statusline and more.

## Features

### HUD (Statusline)

A two-line statusline inspired by OMC.

**Line 1** — session metadata:
```
~/w/mac-cfg (main) [Opus] ▓▓▓▓░░░░░░ 42% $1.23 ⚡23%(1h30m) 14:30
```

**Line 2** — live activity (shown only when there is something to show):
```
tool:Read | agents:2[Explore(45s),Plan(2m)] | skill:brainstorm | 3/7
```

## Install

```
/plugin install joo-on/joo-on-claude
```

## Setup

```
/joo-on-claude:hud setup
```

## Commands

| Command | Description |
|---------|-------------|
| `/joo-on-claude:hud setup` | Install and configure the HUD |
| `/joo-on-claude:hud status` | Show current HUD status |
| `/joo-on-claude:hud remove` | Remove the HUD and restore the original statusline |

## Skills

| Skill | Description |
|-------|-------------|
| `/joo-on-claude:code-quality [target]` | 9-dimension code-quality report (4 parallel Explores, writes `quality-YYYYMMDD-HHmmss.md`) |
| `/joo-on-claude:code-explore [target]` | Deep dive into structure, dependencies, and tests via 3–5 parallel Explores (writes `code-<slug>-<ts>.md`) |
| `/joo-on-claude:merge-permissions [apply]` | Merge `settings.local.json` into `~/.claude/settings.json` (dry-run by default; warns on widening; auto-backup; deny rules are union-only) |
| `/joo-on-claude:claude-backup [backup\|list\|restore]` | Snapshot `~/.claude/` to `~/.claude-backup/claude-<ts>/` (sibling dir — survives a reinstall). Strict allowlist; caches, session state and bot tokens excluded. Restore is dry-run by default and additive. |
| `save-conversation` | Save a conversation summary to `conv-logs/YYYYMM/DD/conv-TS.md`. Per-session incremental saves, records elapsed time between saves, English template. Triggers: "save conv", "대화 저장", etc. |
| `handoff` | Write a forward-looking brief for the next session to `.claude/reports/handoff/handoff-TS.md` — Key Decisions, Traps to Avoid, line-numbered file refs, status-form Open Work, ~2K token budget. Triggers: "handoff", "세션 인계", etc. |
| `catchup` | Resume from the newest handoff — Read-verifies every referenced file (✅Confirmed / ⚠️Shifted / ❌Missing / ❓Ambiguous), cross-checks `git status` / `git log`, then **stops** for instruction. Triggers: "catchup", "이어서 작업", etc. |
| `tdd-team` | 3-agent Red-Green-Refactor TDD orchestration. Sequential agent calls per cycle, task breakdown → user checkpoints. Triggers: "start TDD", "TDD 시작", "test first", etc. |

## Safety Hooks

Two hooks are registered automatically when the plugin is installed, both on `PreToolUse`.

| Hook | Event / Matcher | Role |
|------|-----------------|------|
| `block-dangerous-bash.sh`    | `PreToolUse` / `Bash`         | Blocks destructive or credential-leaking commands such as `rm -rf`, `curl \| sh`, `chmod 777`, `git push --force` / `--mirror` |
| `block-dangerous-write.sh`   | `PreToolUse` / `Write\|Edit`  | Validates file writes via a three-tier policy (see below) |

### Write hook — three-tier policy

- **Tier 1 — always blocked (cannot be overridden):** `.env*`, `credentials/secret/token/password/apikey.*`, `~/.ssh/id_*`, `~/.ssh/authorized_keys`, `~/.ssh/known_hosts`, `~/.aws/credentials`, `~/.gcloud/`, `~/.kube/config`, `~/.gnupg/`
- **Tier 2 — blocked by default, can be opted in per project:** system paths (`/etc`, `/usr`, `/System`, `/Library`, `/bin`, `/sbin`, `/var`, `/tmp`, `/private`), `~/.ssh/config`, `~/.aws/config`, anything outside the project directory
- **Tier 3 — always allowed:** inside the project, and `~/.claude/`

"Inside the project" is auto-detected from `$CLAUDE_PROJECT_DIR`, with fallbacks to the hook payload's `cwd`, the shell's `pwd`, and a `git rev-parse --show-toplevel` promotion to the repo root.

### Per-project allowlist

To opt out of Tier 2 for a project, create this file at the project root:

```
<project>/.claude/hook-write-allowlist
```

One glob pattern per line; `~` expands to `$HOME`; lines starting with `#` are comments. **Tier 1 cannot be unblocked via the allowlist** — even an accidental entry will not let a private key through.

For example, a dotfiles / machine-config project (a repo that manages `~/.zshrc`, `~/.config/**`, etc.) might use:

```
# Example — dotfiles / machine-config project
~/.zshrc
~/.config/**
~/Library/Preferences/com.apple.**
```

This example is illustrative only — each project decides its own allowed paths.

## Requirements

- Node.js 18+
- Claude Code

## License

MIT. See [`LICENSE`](LICENSE).

Portions derived from third-party MIT-licensed projects — see [`NOTICES.md`](NOTICES.md) for attribution.
