---
name: save-conversation
description: Save a structured summary of the current conversation to conv-logs/<YYYYMM>/<DD>/conv-<TIMESTAMP>.md at the project root, with per-session incremental saves (only content since the last save) and a monthly prompt-rewrite log. Trigger on "save conv", "save conversation", "대화 저장", "대화내용 저장", "대화 저장해줘", "대화내용 저장해줘", "conversation 저장", "로그 저장", "대화 기록 남겨", "save chat", "save log", "대화 정리해서 저장", "지금까지 대화 저장", "conv 저장". Also trigger when the user asks to log, archive, or record the current conversation, or wants a summary saved to a file. Do NOT trigger for memory saving (use the memory system) or for generating git commit messages.
allowed-tools: Read, Write, Glob, Grep, Bash(git:*), Bash(find:*), Bash(xargs:*), Bash(ls:*), Bash(mkdir:*), Bash(date:*), Bash(stat:*)
model: opus
---

<!--
  Based on toby-plugins (MIT, © Toby Lee)
  Source: https://github.com/tobyilee/toby-plugins
          → plugins/toby-essentials/skills/save-conversation/SKILL.md

  This port is mostly faithful. Changes from upstream:
    1. "Toby" is not hardcoded — the user's name is resolved at runtime
       via `git config user.name` (fallback: "사용자").
    2. Claude model name is resolved from the runtime environment rather
       than a hardcoded example (Claude Code exposes the active model
       through its system context).
    3. Removed upstream-specific frontmatter keys (`user-invocable`,
       `version`) that are not part of the current Claude Code skill
       schema. Model-invocation is enabled by the rich trigger-phrase
       list in `description`; user-invocation works via the skill slash
       surface `/joo-on-claude:save-conversation`.

  Intentionally preserved:
    - Per-session incremental behavior (only content since the last save)
    - Monthly prompt-rewrite log (conv-logs/YYYYMM/prompt-YYYYMM.md)
    - Auto-staging via `git add` so the log becomes part of the project's
      history (works with the save-conv-before-commit hook)
-->

# save-conversation

Save a concise, structured summary of the current conversation to a
Markdown file under the project's `conv-logs/` directory. The goal is a
*readable record of what was discussed and accomplished* — not a verbatim
transcript, but a structured summary useful for future reference.

## Workflow

**IMPORTANT:** Always resolve the project root via
`git rev-parse --show-toplevel` and use that as the base for `conv-logs/`.
Do NOT use the current working directory — it may be a subdirectory.

### Step 1: Create the output directory

Use the current date to create a hierarchical directory structure:

```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel)
YYYYMM=$(date +%Y%m)
DD=$(date +%d)
mkdir -p "${PROJECT_ROOT}/conv-logs/${YYYYMM}/${DD}"
```

### Step 2: Check for a previous save in this session

Look for the most recent file across all subdirectories of `conv-logs/`
under the project root:

```bash
find "${PROJECT_ROOT}/conv-logs" -name 'conv-*.md' -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1
```

If a previous save exists, read it to determine where the last save
ended — the new save should only include conversation that happened
*after* that point. Always start numbering from `## 1.` in each save file.

If no previous save exists, this is the first save of the session —
include everything.

### Step 3: Resolve the user's display name

```bash
USER_NAME=$(git config user.name 2>/dev/null || echo "사용자")
```

Use `${USER_NAME}` wherever the template below says `{user}`. If the
repo has no git config name, the fallback is the Korean word for "user".

### Step 4: Generate the filename

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
YYYYMM=$(date +%Y%m)
DD=$(date +%d)
FILENAME="${PROJECT_ROOT}/conv-logs/${YYYYMM}/${DD}/conv-${TIMESTAMP}.md"
```

### Step 5: Write the conversation summary

Review the conversation history (only the part after the last save, or
everything if first save) and write a Markdown file with this structure:

```markdown
# Conversation Log — {YYYY-MM-DD HH:MM}

# 참여자
- {user} (사용자)
- Claude ({model name, e.g. Opus 4.7})

## 브랜치
- `{branch}` (or `main` if no feature branch)

---

## 1. {Topic Title}
사용: {comma-separated list of skills, tools, agents used in this exchange}

{user}: {one-sentence summary of the request}

Claude: {what was done — actions, key results. Use a bullet list for multiple items:}
- item 1
- item 2

---

## 2. {Next Topic}
사용: {skills, tools, agents}

{user}: …

Claude: …

(Continue numbering for each distinct topic. Use `---` between sections.)

---

## 변경된 파일
- `path/to/new-file.md` (추가)
- `path/to/modified-file.json` (수정)
- `path/to/deleted-file.md` (삭제)
```

Before writing the file, run `git diff --name-status HEAD` (or compare
against the commit at session start) to get the actual list of
added/modified/deleted files. Use the status codes:
- `A` → (추가)
- `M` → (수정)
- `D` → (삭제)
- `R` → (이름변경)

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
- Add a `사용:` line right after each section title listing skills, tools,
  and agents used (e.g. `사용: skill-creator, firecrawl, Bash, Explore agent`).
- Group related back-and-forth exchanges into a single section under one
  topic.
- Include file paths, command names, surface refs, and version numbers —
  these are the details that matter.
- Write in the same language as the conversation (Korean if Korean,
  English if English).
- Skip trivial confirmations ("ok", "yes") — only log meaningful exchanges.
- For incremental saves: always start numbering from `## 1.` (do not
  continue from the previous file's numbering). Do not include a
  reference to the previous log file.

### Step 6: Save prompt rewrites (monthly)

Review the conversation for any Korean prompts that were rewritten into
English (lines like `Your prompt rewritten: "…"`). If any exist, append
them to a monthly prompt log file:

```bash
PROMPT_FILE="${PROJECT_ROOT}/conv-logs/${YYYYMM}/prompt-${YYYYMM}.md"
```

If the file does not exist, create it with a header:

```markdown
# Prompt Rewrites — {YYYY-MM}

| id | datetime | korean | english |
|----|----------|--------|---------|
```

Append each rewrite as a new row. Use an auto-incrementing `id` (continue
from the last id in the file, or start at 1). The `datetime` is the
approximate time of the exchange.

예를 들어 (illustrative rows — actual content depends on the session):

```markdown
| 1 | 2026-04-18 21:30 | .idea는 .gitignore에 포함해줘 | Add .idea to .gitignore. |
| 2 | 2026-04-18 21:32 | save-conversation skill에서 md 문서를 만든 뒤에 git add로 tracking까지 해주도록 변경해줘 | Modify the save-conversation skill so that after creating the markdown file, it also runs `git add` to track the file. |
```

If there are no Korean-to-English rewrites in the conversation (or the
scope being saved), skip this step.

After writing, run `git add` on the prompt file:

```bash
git add "${PROMPT_FILE}"
```

### Step 7: Save and confirm

Write the conversation log file using the Write tool, then run `git add`
to track it:

```bash
git add "${FILENAME}"
```

Then tell the user:
> "대화 내용을 저장했습니다: `conv-logs/{yyyymm}/{dd}/conv-{timestamp}.md`"

Show a brief preview (first 10-15 lines) so the user can verify the
content looks right.
