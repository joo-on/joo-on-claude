---
name: merge-permissions
description: Merge a project's .claude/settings.local.json permissions into ~/.claude/settings.json with safety guarantees — dry-run is the default, widening is flagged, project-specific patterns are suggested to stay local, a timestamped backup is written before any mutation, and deny rules follow a strict union-only invariant that never removes or consolidates them. Use ONLY when the user explicitly invokes /merge-permissions — do not trigger from ambient mentions of settings, permissions, or merging.
argument-hint: "[apply]"
disable-model-invocation: true
allowed-tools: Read, Write, Bash(cat:*), Bash(cp:*), Bash(date:*), Bash(mkdir:*)
model: opus
---

<!--
  Based on toby-plugins (MIT, © Toby Lee)
  Source: https://github.com/tobyilee/toby-plugins
          → plugins/toby-essentials/commands/merge-permissions.md

  This is NOT a faithful copy. The upstream does "combine, dedupe, sort,
  overwrite global." This port adds five safety features because a naive
  merge can silently widen global capability or weaken deny policy:

    1. Dry-run is the default. `apply` must be passed explicitly to mutate.
    2. Widening warnings: if a local allow rule subsumes narrower global
       rules, it is flagged with options (keep narrow / accept widening /
       keep both). No silent broadening.
    3. Project-specific filter suggestions: paths that look tied to one
       project (absolute project paths, plugin-cache references) are
       recommended to stay local rather than polluting global settings.
    4. Automatic timestamped backup of ~/.claude/settings.json before any
       write.
    5. Deny-union-only invariant: merged deny = old_global_deny ∪ local_deny.
       Rules are only ever added. Never removed, never consolidated into
       broader patterns. Removing a deny rule is always a manual edit.

  Upstream command→skill conversion follows the same pattern as code-quality
  and code-explore — see those skills for the rationale.
-->

# Merge Project Permissions into Global Settings

Merge `permissions` from the current project's `.claude/settings.local.json`
into `~/.claude/settings.json`, with security-hardened safeguards.

Invoke via `/joo-on-claude:merge-permissions` (dry-run) or
`/joo-on-claude:merge-permissions apply` (mutate after checks).

## Invariants — must always hold

1. **Deny-union-only.** Merged `permissions.deny` is the set union of
   old global deny and local deny. **Rules are never removed, never
   consolidated into broader patterns, never replaced.** If the user wants
   to drop a deny rule, they must edit `~/.claude/settings.json` manually.
   This skill will not do it.

2. **Non-permission keys are preserved byte-identical.** Every top-level
   key in the global settings file outside `permissions` (e.g. `env`,
   `model`, `statusLine`, `enabledPlugins`, `extraKnownMarketplaces`,
   `hooks`, `skipAutoPermissionPrompt`) is left untouched.

3. **Backup before any write.** Every `apply` run first copies
   `~/.claude/settings.json` to
   `~/.claude/settings.json.bak-YYYYMMDD-HHmmss`.

4. **No silent widening.** An allow rule that subsumes existing narrower
   global rules is flagged in the dry-run. In `apply` mode, widening is
   applied only if the user explicitly chose to accept it; otherwise the
   narrower rules stay and the broader rule is skipped.

## Phase 1: Read Inputs

1. Local file: `<project-root>/.claude/settings.local.json`
   - If missing → report "no local permissions to merge" and stop.
2. Global file: `~/.claude/settings.json`
   - If missing → report the file is absent and recommend creating it
     manually first. Do not auto-create — a missing global settings file
     usually means something is wrong and auto-creating could mask it.
3. Parse both as JSON. On parse failure → surface the parse error with
   the file path and line number (if possible). Do not proceed.

## Phase 2: Classify Each Local Entry

### For `permissions.allow`

Classify every rule into exactly one bucket:

- **Exact duplicate** — byte-identical to a rule already in global allow.
  → Silently dropped (no-op).

- **Widening** — local rule is a strict superset of one or more global
  rules. Detection rule:
  - Both have the same tool prefix (e.g. both `Bash(...)`).
  - Local pattern with `*` expanded can match every literal string the
    narrower global pattern can match.
  - Examples (illustrative — actual rules depend on the files):
      - `Bash(git:*)` is wider than `Bash(git add:*)` and `Bash(git commit:*)`.
      - `Read(~/**)` is wider than `Read(~/.config/*)`.
  → Flag as WARNING with all subsumed narrower rules listed.

- **Project-specific (heuristic)** — rule references paths unlikely to
  apply outside this project. Signals:
  - Absolute path starting with the current project directory.
  - Reference to `.claude/plugins/cache/` (plugin-cache paths are
    install-local).
  - Hard-coded `/tmp`, `/var/folders/…`, or other ephemeral paths.
  - Examples (illustrative): `Bash(cat ~/.claude/plugins/cache/.../plugin.json)`,
    `Bash(find <project-abs-path>/... -exec ...)`.
  → Recommend "keep local". User decides.

- **New rule** — none of the above.
  → Proposed addition.

### For `permissions.deny`

- Exact duplicates → dropped.
- Everything else → proposed addition.

The widening and project-specific filters do NOT apply to deny, because
more-restrictive deny is always safe and no path heuristic should ever
block a user from tightening security globally.

## Phase 3: Dry-Run Report

Render the following Markdown (adapt counts and content to the actual files):

```markdown
# Merge Permissions — Dry Run

**Local:**  <abs-path-to-local>   (allow: N, deny: M)
**Global:** <abs-path-to-global>  (allow: N, deny: M)

## Proposed Changes

### allow — additions (<count>)
- `<rule>`
- …

### allow — WIDENING warnings (<count>)
⚠️ The following local rules are broader than existing global rules.
   Merging them will grant more capability globally than before.

- `<local-broad-rule>` subsumes:
    - `<narrower-global-rule-1>`
    - `<narrower-global-rule-2>`
  Options:
    (a) Accept widening — broad rule replaces the narrower ones
    (b) Keep narrow — don't add the broad rule, leave narrow as-is (default)
    (c) Keep both — add broad alongside existing narrow (redundant but explicit)

### allow — project-specific (<count>) — recommend KEEP LOCAL
The following rules look project-specific. Adding them globally would
pollute global settings with paths that only this project uses.

- `<rule>` — reason: <absolute path pointing into this project / plugin cache / etc.>

### allow — no-ops (<count>)
Already present in global, will be silently dropped.

### deny — additions (<count>) — union-only, always safe
- `<rule>`
- …

## Resulting Global Permissions (preview — sorted)

allow:
  - …
deny:
  - …

## To apply

Run `/joo-on-claude:merge-permissions apply` — a backup
(`settings.json.bak-YYYYMMDD-HHmmss`) will be written first.

If there are widening warnings, state your choice per rule before
running `apply`.
```

After rendering, stop. Do not write anything.

## Phase 4: Apply (only when invoked with `apply`)

Preconditions:
- The dry-run must have been presented in the current conversation (so
  the user has seen widening warnings and project-specific flags).
- If there are unresolved widening warnings — i.e. the user has not
  stated a choice (a/b/c) per rule — default to **(b) keep narrow**.

Steps:

1. **Backup.** Run
   `cp ~/.claude/settings.json ~/.claude/settings.json.bak-$(date +%Y%m%d-%H%M%S)`.
   If this fails, abort and report — do not proceed to write.

2. **Build new `permissions.allow`:**
   - Start with `global.allow` as a set.
   - Add rules from "New rule" additions.
   - Apply widening decisions:
     - (a) Accept → remove the subsumed narrower rules, add the broad rule.
     - (b) Keep narrow (default) → do nothing, skip the broad rule.
     - (c) Keep both → add the broad rule, keep narrow.
   - Apply project-specific decisions — only add rules the user explicitly
     chose to promote. Default is KEEP LOCAL (don't add).
   - Sort alphabetically.

3. **Build new `permissions.deny`:**
   - `new_deny = sorted(set(global.deny) ∪ set(local.deny))`
   - No other operation. No collapse, no subsumption check, no removal.

4. **Build new global JSON:**
   - Take the parsed global object.
   - Replace only `permissions.allow` and `permissions.deny`.
   - Preserve `permissions.defaultMode` and any other sub-keys under
     `permissions` (e.g., `additionalDirectories`) unless the user asked
     to change them.
   - Leave every other top-level key untouched.

5. **Serialize** with 2-space indent. UTF-8, no BOM. Trailing newline.

6. **Write** to `~/.claude/settings.json` via the Write tool.
   - Note: this write is allowed because `~/.claude/` is Tier 3
     (always-allow) in `block-dangerous-write.sh`.

7. **Report:**
   - Backup path.
   - Counts: rules added to allow, rules added to deny, widenings
     accepted, project-specific rules promoted.
   - Final sizes of allow and deny lists.
   - How to roll back:
     `cp <backup-path> ~/.claude/settings.json`.

## Error Handling

| Condition | Action |
|-----------|--------|
| Local file missing | Report "nothing to merge", exit 0 |
| Global file missing | Report, recommend manual creation, do not auto-create |
| JSON parse error (either file) | Surface error, exit 1, do not write |
| Backup `cp` failed | Abort before write, surface error |
| Write failed mid-way | Report — user can restore from the backup already written |
| User passes unknown argument | Treat as dry-run, warn about unknown arg |

## Out of Scope

- Merging non-`permissions` keys (env, statusLine, enabledPlugins, etc.).
- Cross-project merging (multiple local files at once).
- Reverse / unmerge operation — user restores from backup manually.
- Auto-editing the project's `.claude/settings.local.json` to remove
  rules that were merged up.
