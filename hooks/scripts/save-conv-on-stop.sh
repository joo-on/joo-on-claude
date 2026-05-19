#!/bin/bash
# ─────────────────────────────────────────────────────────────
# save-conv-on-stop.sh — Claude Code Stop hook
#
# Safety net for sessions that don't end in a `git commit` (exploration,
# debugging, conversations that didn't produce code changes). The
# commit-time hook (`save-conv-before-commit.sh`) doesn't fire for those,
# so without this hook the conversation would never be archived.
#
# Behavior: when Claude is about to stop responding, check the freshness
# of the latest conv-log. If no log exists, or the latest is older than
# 60 minutes, block the stop and instruct Claude to run the
# save-conversation skill first.
#
# Threshold rationale: 60 min is intentionally looser than the commit
# hook's 30 min. The commit hook is the primary capture mechanism — this
# is just a backstop for long, commit-less sessions. Brief Q&A sessions
# (well under 60 min since the previous session's last save) won't trip
# the nudge.
#
# Opt-in by project: same as commit hook — only fires when
# <project>/conv-logs/ already exists.
#
# Loop prevention: if `stop_hook_active` is true in the payload, the
# Stop event is already a re-evaluation triggered by this hook — exit
# cleanly to avoid infinite blocking.
#
# Exit codes: 0 = allow stop · 2 = block stop (Claude must address)
# ─────────────────────────────────────────────────────────────

INPUT=$(cat)

# Loop guard: don't re-trigger ourselves.
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
[ "$STOP_HOOK_ACTIVE" = "true" ] && exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"
[ -z "$PROJECT_DIR" ] && PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // ""')
[ -z "$PROJECT_DIR" ] && PROJECT_DIR=$(pwd)

PROJECT_ROOT=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$PROJECT_DIR")
LOGDIR="$PROJECT_ROOT/conv-logs"

# Opt-in gate.
[ ! -d "$LOGDIR" ] && exit 0

LATEST_LOG=$(find "$LOGDIR" -name 'conv-*.md' -type f -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)

# No log at all → nudge.
if [ -z "$LATEST_LOG" ]; then
  cat >&2 <<'EOF'
{
  "decision": "block",
  "reason": "Session ending without any conversation log",
  "systemMessage": "HOOK INSTRUCTION: This session has produced no conversation log yet, but conv-logs/ is initialized. Before stopping, run the save-conversation skill (invoke Skill tool with skill: 'joo-on-claude:save-conversation'). Do NOT ask the user for confirmation - just do it."
}
EOF
  exit 2
fi

# Stale log (> 60 min) → nudge.
if [[ "$OSTYPE" == "darwin"* ]]; then
  FILE_TIME=$(stat -f %m "$LATEST_LOG")
else
  FILE_TIME=$(stat -c %Y "$LATEST_LOG")
fi
CURRENT_TIME=$(date +%s)
AGE=$(( CURRENT_TIME - FILE_TIME ))

if [ "$AGE" -gt 3600 ]; then
  cat >&2 <<'EOF'
{
  "decision": "block",
  "reason": "Latest conversation log is older than 60 minutes",
  "systemMessage": "HOOK INSTRUCTION: The latest conversation log is over 60 minutes old. Before stopping, run the save-conversation skill (invoke Skill tool with skill: 'joo-on-claude:save-conversation') to capture this session's activity. Do NOT ask the user for confirmation - just do it."
}
EOF
  exit 2
fi

exit 0
