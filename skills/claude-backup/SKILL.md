---
name: claude-backup
description: Back up and restore the user-authored parts of ~/.claude — global CLAUDE.md, settings.json (hooks live there too), user-level commands/skills/subagents, HUD scripts, and installed plugin manifests plus marketplace clones. Snapshots are timestamped under ~/.claude-backup/, a sibling of ~/.claude/ so they survive a reinstall that deletes it. Restore is dry-run by default and additive — it never deletes work added since the snapshot. Trigger on "claude backup", "backup claude", "backup my claude config", "snapshot claude", "restore claude", "claude 백업", "클로드 백업", "claude 복구", "claude 복원", "설정 백업", "글로벌 설정 백업", "내 claude 설정 저장", "claude 설정 복원", "plugin 백업", "설치된 플러그인 백업", "백업으로 되돌려", "이전 백업으로 복원", "원래 상태로 되돌려", "backup ~/.claude", "restore my plugins", "migrate claude to another machine". Also trigger when the user is about to do something risky to their global Claude config (a big settings edit, a plugin overhaul, reinstalling Claude Code) and wants a checkpoint first, or when they mention losing plugins and wanting the previous state back. Do NOT trigger for project-level backups, git stashes, or generic "backup my repo" — this skill is specifically for the ~/.claude user directory.
argument-hint: "[backup|list|restore] [--apply] [--backup PATH]"
allowed-tools: Read, Bash(bash:*), Bash(ls:*), Bash(du:*)
model: opus
---

<!--
  Based on toby-plugins (MIT, © Toby Lee)
  Source: https://github.com/tobyilee/toby-plugins
          → plugins/toby-claude-config/skills/claude-backup/
            (SKILL.md, references/include-exclude.md, scripts/*.sh)

  Changes from upstream:
    1. Dropped the non-standard `version` frontmatter key; folded description
       flattened to a single line, matching the rest of this plugin.
    2. Added `allowed-tools`, `model: opus`, and `argument-hint`.
    3. Upstream ships three slash commands (/claude-backup,
       /claude-backup-list, /claude-restore) wrapping this skill. They are
       folded into this single skill with a subcommand argument instead,
       matching the shape of the `hud` skill in this plugin.
    4. `scripts/backup.sh` gained `--exclude='.cache.json'` — upstream's
       exclude list only covers directories named cache/, so a regenerable
       dotfile cache with that conventional name would be copied.
    5. `scripts/list-backups.sh` header comment said the snapshots live under
       ~/.claude/backups/ while the code reads ~/.claude-backup/. Fixed to
       match the code.

  Intentionally preserved:
    - The strict allowlist. A deny-list would silently start shipping
      sensitive files the moment a plugin creates a new directory.
    - Backup root as a SIBLING of ~/.claude/, so a reinstall that wipes
      ~/.claude/ cannot take the snapshots with it.
    - Dry-run-by-default, additive restore (no --delete): restoring can
      never remove work added since the snapshot.
    - Exclusion of channels/ (bot tokens) as a policy decision.
-->

# claude-backup

Back up the user-authored parts of `~/.claude/` to a timestamped folder, and restore from it later.

## When to use

- The user wants a checkpoint before changing plugins, settings, or hooks.
- The user wants to move their Claude Code setup to another machine.
- The user lost or corrupted a file under `~/.claude/` and wants the previous state.
- The user says "back up my claude config" / "restore claude" in any phrasing.

## Subcommands

Read `$ARGUMENTS` to pick the operation. With no argument, default to `backup`.

### `backup` (default) — create a snapshot

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/claude-backup/scripts/backup.sh
```

Writes to `~/.claude-backup/claude-<YYYYMMDD-HHMMSS>/`. Prints the path and total size at the end. Exits non-zero only if the source directory is missing or a copy fails.

The backup root lives **outside** `~/.claude/` deliberately — it survives a full reinstall that deletes `~/.claude/`.

### `list` — show existing snapshots

```bash
bash ${CLAUDE_PLUGIN_ROOT}/skills/claude-backup/scripts/list-backups.sh
```

Prints size, creation timestamp, and path for each backup under `~/.claude-backup/`, newest first.

### `restore` — put a snapshot back

```bash
# Dry run against the newest backup (default — shows what would change, does nothing)
bash ${CLAUDE_PLUGIN_ROOT}/skills/claude-backup/scripts/restore.sh

# Dry run against a specific backup
bash ${CLAUDE_PLUGIN_ROOT}/skills/claude-backup/scripts/restore.sh --backup ~/.claude-backup/claude-20260905-171500

# Actually overwrite live files
bash ${CLAUDE_PLUGIN_ROOT}/skills/claude-backup/scripts/restore.sh --apply
```

**Restore is additive**, not destructive: it overwrites files present in the backup, but does NOT delete files that exist today and weren't in the backup. You can never lose work added since the last snapshot by restoring.

## What's inside a backup

Each backup mirrors the `~/.claude/` layout under a `dotclaude/` subfolder, so restore is a one-line `rsync`:

```
~/.claude-backup/claude-20260905-171500/
├── MANIFEST.txt                # timestamp, source, host, entries copied, exclusion policy
└── dotclaude/
    ├── CLAUDE.md
    ├── settings.json           # your hooks + permissions live in here
    ├── statusline.sh
    ├── statusline-command.sh
    ├── .omc-config.json
    ├── commands/               # user-level slash commands
    ├── skills/                 # user-level skills (symlinks preserved verbatim)
    ├── agents/                 # user-level subagents, if any
    ├── plans/
    ├── hud/                    # HUD scripts (statusline.mjs); .cache.json excluded
    ├── teams/
    ├── .omc/
    └── plugins/
        ├── installed_plugins.json
        ├── known_marketplaces.json
        ├── blocklist.json
        └── marketplaces/       # cloned marketplace repos, .git kept, temp_* dropped
```

## What is NOT backed up, and why

Anything regenerable, session-scoped, or not user-authored. Restoring these would be wasteful (caches rebuild), stale (session state), or a security risk (bot tokens):

- **Session / runtime:** `projects/`, `sessions/`, `session-env/`, `shell-snapshots/`, `file-history/`, `transcripts/`, `tasks/`, `history.jsonl`, `.session-stats.json`, `security_warnings_state_*.json`, `ide/`, `chrome/`
- **Caches:** `cache/`, `paste-cache/`, `plugins/cache/`, `plugins/install-counts-cache.json`, plus any `cache/`, `node_modules/`, `__pycache__/`, `*.log`, `.DS_Store`, `.cache.json` inside copied dirs
- **Plugin-generated data:** `plugins/data/`, `plugins/oh-my-claudecode/`
- **Secrets:** `channels/` (Discord/Telegram bot tokens) — re-run the relevant configure skill after restoring on a new machine
- **Telemetry:** `telemetry/`
- **Legacy one-off snapshots:** `.claude.YYYYMMDD` dirs from older upgrade flows
- **Temp marketplaces:** `plugins/marketplaces/temp_*`

See `references/include-exclude.md` for the full rationale — including why hooks have no backup entry of their own (they live inside `settings.json`).

## Behaviour notes

- **Where:** default backup root is `~/.claude-backup/`, a sibling of `~/.claude/`. Override with `CLAUDE_BACKUP_ROOT=/some/other/path`.
- **Source override:** set `CLAUDE_HOME` to point at a non-default Claude home.
- **Idempotent:** running `backup.sh` twice makes two independent timestamped folders. It never mutates a prior backup.
- **Restore safety:** without `--apply`, `restore.sh` performs an rsync dry run and prints an itemized change list. Review it before re-running with `--apply`.
- **After restore on a new machine:** symlinks under `skills/` are preserved verbatim, so their targets must exist on the destination machine too.

## Conversation patterns

When the user asks for a backup, just run `backup.sh` and report the resulting path and size. Don't prompt for preferences unless they ask about scope — the allowlist is stable and is the whole point of the skill.

When the user asks to restore, default to the dry run and show them the itemized change list. Only run `--apply` after they confirm. If they also want today's state captured before overwriting, run `backup.sh` first, then `restore.sh --apply`.
