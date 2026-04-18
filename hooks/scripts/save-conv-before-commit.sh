#!/bin/bash
# ─────────────────────────────────────────────────────────────
# save-conv-before-commit.sh — Claude Code PreToolUse hook
#
# Matcher: "Bash" (chained after block-dangerous-bash.sh).
# Intercepts `git commit` invocations (including chained forms like
# `git add ... && git commit ...`) and enforces the save-conversation
# workflow:
#
#   1. A recent conversation log must exist under <project>/conv-logs/
#   2. The log must be ≤ 3 minutes old (stale logs ⇒ run save-conversation)
#   3. The log must be staged for commit (or already committed earlier)
#
# Opt-in by project: the hook is a no-op unless <project>/conv-logs/
# already exists. This keeps projects that don't use the save-conversation
# workflow unaffected.
#
# When a check fails, the hook emits a structured JSON block on stderr
# with a `systemMessage` that instructs Claude to run the
# save-conversation skill before retrying the commit.
#
# Exit codes: 0 = allow · 2 = block
# ─────────────────────────────────────────────────────────────
# NOTE: no `set -euo pipefail` — we intentionally tolerate empty pipes
# (`find ... | xargs -0 ls -t | head -1` can legitimately yield nothing)
# and we never want a transient shell-option failure to block commits
# silently.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# Only intercept commands that contain `git commit` (direct or chained).
if ! echo "$COMMAND" | grep -qE '(^|\&\&|;|\|)\s*git\s+commit(\s|$)'; then
  exit 0
fi

PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // ""')
if [ -z "$PROJECT_DIR" ]; then
  PROJECT_DIR=$(pwd)
fi

# Resolve the git repo root — conv-logs always lives there.
PROJECT_ROOT=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$PROJECT_DIR")

LOGDIR="$PROJECT_ROOT/conv-logs"

# ── Opt-in gate ────────────────────────────────────────────
# Projects without conv-logs/ don't use this workflow — skip enforcement.
if [ ! -d "$LOGDIR" ]; then
  exit 0
fi

# ── 1. Recent log exists? ──────────────────────────────────
LATEST_LOG=$(find "$LOGDIR" -name 'conv-*.md' -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)

if [ -z "$LATEST_LOG" ]; then
  cat >&2 <<'EOF'
{
  "decision": "deny",
  "reason": "git commit intercepted: no conversation log found",
  "systemMessage": "HOOK INSTRUCTION: Before running git commit, you MUST do the following steps in order:\n1. Run the save-conversation skill (invoke Skill tool with skill: 'joo-on-claude:save-conversation')\n2. Then retry the original git commit command.\n\nDo NOT skip these steps. Do NOT ask the user for confirmation - just do it."
}
EOF
  exit 2
fi

# ── 2. Log is fresh (≤ 3 minutes old)? ─────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  FILE_TIME=$(stat -f %m "$LATEST_LOG")
else
  FILE_TIME=$(stat -c %Y "$LATEST_LOG")
fi
CURRENT_TIME=$(date +%s)
AGE=$(( CURRENT_TIME - FILE_TIME ))

if [ "$AGE" -gt 180 ]; then
  cat >&2 <<'EOF'
{
  "decision": "deny",
  "reason": "git commit intercepted: conversation log is older than 3 minutes",
  "systemMessage": "HOOK INSTRUCTION: The latest conversation log is stale. Before running git commit, you MUST do the following steps in order:\n1. Run the save-conversation skill (invoke Skill tool with skill: 'joo-on-claude:save-conversation')\n2. Then retry the original git commit command.\n\nDo NOT skip these steps. Do NOT ask the user for confirmation - just do it."
}
EOF
  exit 2
fi

# ── 3. Log is staged (or already tracked)? ─────────────────
RELATIVE_LOG=$(python3 -c "import os,sys; print(os.path.relpath(sys.argv[1], sys.argv[2]))" "$LATEST_LOG" "$PROJECT_ROOT")

cd "$PROJECT_ROOT"
if ! git diff --cached --name-only | grep -qF "$RELATIVE_LOG"; then
  if ! git ls-files --error-unmatch "$RELATIVE_LOG" >/dev/null 2>&1; then
    cat >&2 <<EOF
{
  "decision": "deny",
  "reason": "git commit intercepted: conversation log not staged",
  "systemMessage": "HOOK INSTRUCTION: Conversation log exists but is not staged. Run: git add \"$RELATIVE_LOG\" and then retry the git commit."
}
EOF
    exit 2
  fi
fi

# All checks passed.
exit 0
