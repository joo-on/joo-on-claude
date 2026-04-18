---
name: save-conversation
description: Save a structured summary of the current conversation to conv-logs/<YYYYMM>/<DD>/conv-<TIMESTAMP>.md at the project root, with per-session incremental saves (only content since the last save) and elapsed-time tracking. Trigger on "save conv", "save conversation", "대화 저장", "대화내용 저장", "대화 저장해줘", "대화내용 저장해줘", "conversation 저장", "로그 저장", "대화 기록 남겨", "save chat", "save log", "대화 정리해서 저장", "지금까지 대화 저장", "conv 저장". Also trigger when the user asks to log, archive, or record the current conversation, or wants a summary saved to a file. Do NOT trigger for memory saving (use the memory system) or for generating git commit messages.
allowed-tools: Read, Write, Glob, Grep, Bash(git:*), Bash(find:*), Bash(xargs:*), Bash(ls:*), Bash(mkdir:*), Bash(date:*), Bash(stat:*), Bash(printf:*)
model: opus
---

<!--
  Based on toby-plugins (MIT, © Toby Lee)
  Source: https://github.com/tobyilee/toby-plugins
          → plugins/toby-essentials/skills/save-conversation/SKILL.md

  This port is NOT a faithful copy. Changes from upstream:
    1. Removed the monthly Korean-to-English prompt-rewrite log (the user
       tracks those globally via ~/.claude/english-learning/log.md — no
       need to duplicate per-project).
    2. Template is English-only (field labels, section headers). Content
       still written in the language of the conversation.
    3. Dropped the `Branch` header line — redundant with `git status`.
    4. Added wall-clock elapsed time since the previous save (file-system
       mtime based), to support post-session analysis.
    5. "Toby" hardcoding replaced with `git config user.name` (fallback
       "user").
    6. Removed non-standard frontmatter keys (user-invocable, version).

  Intentionally preserved:
    - Per-session incremental behavior (only content since the last save).
    - Auto-staging via `git add` so the log commits alongside the work
      (pairs with save-conv-before-commit hook).
    - Per-topic tool-use tracking (the `Used:` line) — the user wants
      this for post-hoc analysis of which skills/agents were involved.
-->

# save-conversation

Save a concise, structured summary of the current conversation to a
Markdown file under the project's `conv-logs/` directory. The goal is a
*readable record of what was discussed and accomplished* — a structured
summary, not a verbatim transcript.

## Workflow

**IMPORTANT:** Always resolve the project root via
`git rev-parse --show-toplevel` and use that as the base for `conv-logs/`.
Do NOT use the current working directory — it may be a subdirectory.

### Step 1: Create the output directory

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
YYYYMM=$(date +%Y%m)
DD=$(date +%d)
mkdir -p "${PROJECT_ROOT}/conv-logs/${YYYYMM}/${DD}"
```

### Step 2: Locate the previous save

Look for the most recent `conv-*.md` across all subdirectories of
`conv-logs/` under the project root:

```bash
LATEST=$(find "${PROJECT_ROOT}/conv-logs" -name 'conv-*.md' -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
```

If a previous save exists:
- **Incremental boundary:** read it to determine where the last save
  ended — the new save should include only conversation that happened
  *after* that point.
- **Elapsed time:** capture its mtime for the elapsed-since-last-save
  calculation in Step 5.

If no previous save exists, this is the first save of the session —
include everything and mark elapsed time as `first save`.

Always start topic numbering from `## 1.` in every save file — do NOT
continue numbering from a previous file.

### Step 3: Resolve the user's display name

```bash
USER_NAME=$(git config user.name 2>/dev/null || echo "user")
```

Use `${USER_NAME}` wherever the template below says `{user}`.

### Step 4: Generate the filename

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="${PROJECT_ROOT}/conv-logs/${YYYYMM}/${DD}/conv-${TIMESTAMP}.md"
```

### Step 5: Compute elapsed time

```bash
if [ -n "$LATEST" ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    PREV_TIME=$(stat -f %m "$LATEST")
  else
    PREV_TIME=$(stat -c %Y "$LATEST")
  fi
  NOW=$(date +%s)
  ELAPSED=$(( NOW - PREV_TIME ))
  printf -v ELAPSED_FMT '%02d:%02d:%02d' \
    $((ELAPSED/3600)) $(((ELAPSED%3600)/60)) $((ELAPSED%60))
else
  ELAPSED_FMT="first save"
fi
```

### Step 6: Write the conversation summary

Review the conversation history (only the part after the last save, or
everything if first save) and write a Markdown file with this structure:

```markdown
# Conversation Log — {YYYY-MM-DD HH:MM}

## Participants
- {user}
- Claude ({model name, e.g. Opus 4.7})

## Elapsed
- Since last save: {HH:MM:SS, or "first save"}

---

## 1. {Topic Title}
Used: {comma-separated list of skills, tools, agents used in this exchange}

{user}: {one-sentence summary of the request}

Claude: {what was done — actions, key results. Use a bullet list for multiple items:}
- item 1
- item 2

---

## 2. {Next Topic}
Used: {skills, tools, agents}

{user}: …

Claude: …

(Continue numbering for each distinct topic. Use `---` between sections.)

---

## Changed files
- `path/to/new-file.md` (added)
- `path/to/modified-file.json` (modified)
- `path/to/deleted-file.md` (deleted)
- `path/to/old → path/to/new` (renamed)
```

Before writing the file, run `git diff --name-status HEAD` (or compare
against the commit at session start) to get the actual list of
added/modified/deleted files. Use the status codes:
- `A` → (added)
- `M` → (modified)
- `D` → (deleted)
- `R` → (renamed)

If there are no uncommitted changes (everything was already committed
and pushed), use `git diff --name-status {first_commit_of_session}..HEAD`
to capture all changes made during the session. For incremental saves,
only list files changed since the previous save.

**Guidelines for writing the summary:**
- Number each topic section sequentially (`## 1.`, `## 2.`, …).
- Give each section a descriptive title that captures the topic.
- `{user}:` lines capture the user's intent in one sentence (not verbatim).
- `Claude:` lines describe what was actually done — use bullet lists when
  there are multiple actions or results.
- Do NOT use bold markup (`**`) on the `{user}` / `Claude` names — keep
  them plain text.
- Add a `Used:` line right after each section title listing skills,
  tools, and agents used in that exchange (e.g.
  `Used: skill-creator, firecrawl, Bash, Explore agent`). Be specific —
  name individual tools and agents rather than generic labels.
- Group related back-and-forth exchanges into a single section under one
  topic.
- Include file paths, command names, surface refs, and version numbers —
  these are the details that matter for later analysis.
- Write the conversation content in the same language as the conversation
  itself (Korean if the exchange was Korean, English if English). Only
  the field labels and section headers are in English.
- Skip trivial confirmations ("ok", "yes") — only log meaningful exchanges.
- For incremental saves: always start numbering from `## 1.`. Do not
  reference the previous log file.

### Step 7: Save and stage

Write the conversation log file using the Write tool, then run `git add`
to track it so it commits alongside the work:

```bash
git add "${FILENAME}"
```

Then tell the user:
> "Saved conversation: `conv-logs/{yyyymm}/{dd}/conv-{timestamp}.md`"

Show a brief preview (first 10-15 lines) so the user can verify the
content looks right.
