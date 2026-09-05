---
name: catchup
description: Pick up where the previous Claude Code session left off. Finds the most recent handoff document under `.claude/reports/handoff/`, reads it, then VERIFIES its claims against the live codebase (Read each referenced file, run git status / git log) before reporting findings and waiting for user instruction. Treats the handoff as a hypothesis, not fact — the previous session may have been confused. Trigger on "catchup", "catch up", "이어서 작업", "이어서 해줘", "이전 세션 이어", "resume from handoff", "handoff 읽어", "handoff 참고해서 시작", "어제 작업 이어서", "지난번 이어서", "새 세션 준비", "prepare to continue", "pick up where we left off", "캐치업". Also trigger when the user starts a new session by referencing prior work ("어제 한 작업 이어서 하자", "계속 하자", "resume the auth refactor") and a `.claude/reports/handoff/` directory exists in the project. Do NOT trigger when the user wants to start a brand-new unrelated task, or when they want to read a specific named document (use Read directly).
allowed-tools: Read, Glob, Grep, Bash(git:*), Bash(find:*), Bash(ls:*), Bash(stat:*), Bash(date:*)
model: opus
---

<!--
  Based on toby-plugins (MIT, © Toby Lee)
  Source: https://github.com/tobyilee/toby-plugins
          → plugins/toby-session/skills/catchup/SKILL.md

  Changes from upstream:
    1. Dropped non-standard frontmatter keys (`user-invocable`, `version`);
       folded description flattened to a single line, matching the rest of
       this plugin.
    2. Added `allowed-tools` and `model: opus`. The tool list deliberately
       OMITS Write and Edit: this skill reports and stops, and must never
       modify the repository. The permission list is the enforcement.
    3. `git rev-parse --show-toplevel` now falls back to `pwd`.
    4. Latest-handoff lookup switched from `ls -1t <glob>` to a
       `find -print0 | xargs -0 ls -t` pipeline, matching the lookup style
       used by save-conversation in this plugin and tolerating a missing
       handoff directory without a shell glob error.

  Intentionally preserved:
    - "Handoff is hypothesis, not fact" as the guiding rule.
    - The ✅Confirmed / ⚠️Shifted / ❌Missing / ❓Ambiguous classification,
      which is what structurally forces the verification pass — the report
      cannot be produced without it.
    - The hard STOP at the end: report situational awareness, then wait.
-->

# catchup

Resume a Claude Code session from the handoff document left by the previous session — but **verify before acting**. The core rule: a handoff document is a hypothesis. The previous session may have been under-caffeinated, confused, or wrong. This skill's job is to reconcile the handoff's claims with the current state of the code and git, report divergences, and then stop and wait for user instruction.

## Guiding rule

> Handoff is hypothesis, not fact.

If the handoff says "the retry path is scaffolded at `TokenService.kt:L45-L72`", do not trust that — Read the file and confirm. If the lines have shifted or the content disagrees with the claim, flag it in the report.

## Workflow

### Step 1: Locate the latest handoff

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
HANDOFF_DIR="${PROJECT_ROOT}/.claude/reports/handoff"

LATEST=$(find "${HANDOFF_DIR}" -name 'handoff-*.md' -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
```

**If no handoff exists** (directory missing or empty): tell the user plainly:

> "No handoff document found under `.claude/reports/handoff/`. Either this is the first session, or the previous session didn't write one. Do you want to start fresh, or should I ignore catchup and wait for your instruction?"

Then stop. Do not invent context.

**If multiple handoffs exist:** the newest by mtime wins. Mention the age of the file in your report ("Handoff written 18 hours ago") — old handoffs are stale hypotheses, and the user should know.

### Step 2: Read in parallel

Read all of these in parallel (independent lookups):

- The handoff file itself (use Read tool — do NOT `cat`).
- Run `git status` to see uncommitted state.
- Run `git log --oneline -15` to see what has moved since the handoff was written.
- Run `git diff --stat` if there are uncommitted edits.
- Read `CLAUDE.md` at the project root if it exists — **but only to know what NOT to restate** in your report.

### Step 3: Verify every file reference

For each entry under "Relevant Files" in the handoff:

1. Use the Read tool to open the file at the cited line range.
2. Compare the actual content against the handoff's description.
3. Classify each reference:
   - ✅ **Confirmed** — file exists, content at cited lines matches the claim.
   - ⚠️ **Shifted** — file exists, but content has moved (line numbers differ or content changed).
   - ❌ **Missing** — file or referenced symbol no longer exists.
   - ❓ **Ambiguous** — reference is too vague to verify (flag this as a handoff-quality issue).

Do this in parallel when there are 2+ files to check.

### Step 4: Cross-check git state

Compare the handoff's claims against git:

- "Open Work" says X is "not yet implemented" — is X now in git log? (previous session may have finished it in a last commit.)
- Any commits exist after the handoff's timestamp? Those are changes the handoff doesn't know about.
- Any uncommitted edits — these are probably what the previous session was mid-writing when it ended.

### Step 5: Report to the user — then stop

Produce a verification report with this structure (use plain markdown, do NOT restate CLAUDE.md content):

```markdown
## Catchup Report

**Handoff source:** `.claude/reports/handoff/handoff-<timestamp>.md` (written {N} hours ago)
**Previous session summary:** {1–2 lines quoted from the handoff's Summary section}

### Verification of referenced files
- ✅ `src/auth/TokenService.kt:L45-L72` — matches handoff description.
- ⚠️ `src/auth/OAuthClient.kt:L10-L30` — file exists but refresh method has moved to L44-L66 since the handoff was written.
- ❌ `src/auth/BackoffUtil.kt` — file not found; handoff may be stale or this was an unfulfilled plan.

### Git movement since handoff
- {N} new commits since handoff timestamp: {list `--oneline`}
- Uncommitted changes: {file list from `git diff --stat`, or "none"}

### Open Work reconciled against current state
- {Item from handoff} — still matches / now done / divergent (explain).
- ...

### Traps to Avoid (carried forward from handoff)
- {List verbatim — these failed-approach warnings are the handoff's highest-value content.}

### What I am NOT doing
I'm treating this handoff as a hypothesis, not a work order. I've verified the above and I am now waiting for your instructions before touching anything. Tell me what you want to work on.
```

Then **stop**. Do not start implementing. Do not propose a next action unless the user asks. The whole point of the skill is to restore situational awareness, not to auto-resume work from stale notes.

## Notes

- **`/clear` followed by catchup is the canonical resume pattern.** The previous session runs `handoff` just before exiting; the new session starts, the user runs `/catchup` (or this skill auto-triggers), and the fresh context gets a compact hypothesis-style brief from the handoff plus a verification pass. Total token cost: a few thousand, vs. rebuilding the whole context from scratch.
- **If the handoff is older than a few days**, say so in the report. Stale handoffs are more hypothesis-y — the code has drifted further from the handoff's snapshot, and more references are likely to have shifted.
- **Do not merge multiple handoffs.** If the user has two recent handoffs (e.g. one from yesterday evening, one from this morning on a quick spike), catchup uses the newest only and mentions the existence of older ones. The user can ask to cross-reference explicitly.
- **Symmetry with `handoff`.** The two skills are paired: `handoff` writes the artifact `catchup` consumes. If you find yourself wanting to write something in handoff that catchup couldn't meaningfully verify, that's a smell — lean on concrete file:line references instead of abstract descriptions.

## Background

This skill operationalizes the verification side of the "Document & Clear" pattern (Tier 2 of the handoff strategy described in `claude-session-context-handoff-4-layer-strategy.md`, an external reference article not included in this repo). The reference article's core insight — that handoffs must be treated as hypothesis, not fact — is enforced structurally here: the skill physically cannot skip the verification step, because reporting requires the verification output.
