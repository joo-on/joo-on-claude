#!/bin/bash
# ─────────────────────────────────────────────────────────────
# block-dangerous-write.sh — Claude Code PreToolUse hook
#
# Matcher: "Write|Edit" (see hooks/hooks.json).
# Reads tool_input.file_path from stdin JSON and applies a
# three-tier policy.
#
# Tier 1 — HARD BLOCK (never overridable):
#   .env* files, credentials/secret/token/password/apikey.*
#   ~/.ssh/id_*, ~/.ssh/authorized_keys, ~/.ssh/known_hosts
#   ~/.aws/credentials, ~/.gcloud/**, ~/.kube/config, ~/.gnupg/**
#
# Tier 2 — DEFAULT BLOCK, overridable via project allowlist:
#   system paths (/etc, /usr, /System, /Library, /bin, /sbin,
#                 /var, /tmp, /private)
#   ~/.ssh/config, ~/.aws/config
#   any path outside the current project directory
#
# Tier 3 — ALWAYS ALLOW:
#   inside the current project directory
#   inside ~/.claude/
#
# Project opt-in (Tier 2 override only):
#   <project>/.claude/hook-write-allowlist — one glob per line.
#   Supports leading ~ expansion; `#` starts a comment.
#   Matching patterns bypass Tier 2 but NEVER Tier 1.
#
# Exit codes: 0 = allow · 2 = block (stderr is fed back to the model)
# ─────────────────────────────────────────────────────────────
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')
[ -z "$FILE_PATH" ] && exit 0

# ─────────────────────────────────────────────
# Resolve PROJECT_DIR:
#   1. JSON `cwd` from hook payload (most accurate — the session's CWD)
#   2. shell `pwd` as fallback
#   3. Promote to the enclosing git repo root if available.
#      This way a Write from inside a subdirectory still treats the
#      whole repo as "inside the project" (Tier 3), and the allowlist
#      at <repo-root>/.claude/hook-write-allowlist is found regardless
#      of which subdir Claude is cd'd into.
# ─────────────────────────────────────────────
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // ""')
[ -z "$PROJECT_DIR" ] && PROJECT_DIR=$(pwd)
PROJECT_DIR=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$PROJECT_DIR")

CLAUDE_DIR="$HOME/.claude"
ALLOWLIST_FILE="$PROJECT_DIR/.claude/hook-write-allowlist"

# Normalize to absolute path
if [[ "$FILE_PATH" = /* ]]; then
  ABS_PATH="$FILE_PATH"
else
  ABS_PATH="$PROJECT_DIR/$FILE_PATH"
fi
ABS_PATH=$(python3 -c "import os,sys; print(os.path.normpath(sys.argv[1]))" "$ABS_PATH")
FILENAME=$(basename "$ABS_PATH")

# ─────────────────────────────────────────────
# Tier 1 — HARD BLOCK (never overridable)
# ─────────────────────────────────────────────

# .env* files (e.g. .env, .env.production)
if echo "$FILENAME" | grep -qiE '^\.env(\.|$)'; then
  echo "BLOCKED [Tier 1]: Writing to environment file is not allowed ($FILENAME)" >&2
  exit 2
fi

# Credential-like filenames (matches also 'my-credentials.yaml')
if echo "$FILENAME" | grep -qiE '(credentials|secret|token|password|apikey)\.(json|yaml|yml|toml|xml|txt|cfg|ini)$'; then
  echo "BLOCKED [Tier 1]: Writing to credentials file is not allowed ($FILENAME)" >&2
  exit 2
fi

# Private keys & authoritative credential paths (cannot be allowlisted)
if echo "$ABS_PATH" | grep -qE '(\.ssh/(id_|authorized_keys|known_hosts)|\.aws/credentials|\.gcloud/|\.kube/config|\.gnupg/)'; then
  echo "BLOCKED [Tier 1]: Writing to secret credentials/key path is not allowed ($ABS_PATH)" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# Tier 3 — ALWAYS ALLOW
# ─────────────────────────────────────────────

# Inside project directory
if [[ "$ABS_PATH" == "$PROJECT_DIR"/* ]]; then
  exit 0
fi

# Inside ~/.claude/ (Claude workspace — plans, skills, memory, settings)
if [[ "$ABS_PATH" == "$CLAUDE_DIR"/* ]]; then
  exit 0
fi

# ─────────────────────────────────────────────
# Tier 2 override — project allowlist
# ─────────────────────────────────────────────

if [ -f "$ALLOWLIST_FILE" ]; then
  while IFS= read -r PATTERN || [ -n "$PATTERN" ]; do
    # Strip comments and surrounding whitespace
    PATTERN="${PATTERN%%#*}"
    PATTERN="${PATTERN#"${PATTERN%%[![:space:]]*}"}"
    PATTERN="${PATTERN%"${PATTERN##*[![:space:]]}"}"
    [ -z "$PATTERN" ] && continue
    # Expand leading ~ to $HOME
    EXPANDED="${PATTERN/#\~/$HOME}"
    # Unquoted $EXPANDED → bash pattern matching
    if [[ "$ABS_PATH" == $EXPANDED ]]; then
      exit 0
    fi
  done < "$ALLOWLIST_FILE"
fi

# ─────────────────────────────────────────────
# Tier 2 defaults — block with guidance toward the allowlist
# ─────────────────────────────────────────────

if echo "$ABS_PATH" | grep -qE '^/(etc|usr|System|Library|bin|sbin|var|tmp|private)/'; then
  echo "BLOCKED [Tier 2]: Writing to system path ($ABS_PATH)" >&2
  echo "  → To allow, add a glob pattern to $ALLOWLIST_FILE" >&2
  exit 2
fi

if echo "$ABS_PATH" | grep -qE '(\.ssh/config$|\.aws/config$)'; then
  echo "BLOCKED [Tier 2]: Writing to sensitive config path ($ABS_PATH)" >&2
  echo "  → To allow, add a glob pattern to $ALLOWLIST_FILE" >&2
  exit 2
fi

# Outside project directory (catch-all)
echo "BLOCKED [Tier 2]: Writing outside project directory ($ABS_PATH not under $PROJECT_DIR)" >&2
echo "  → To allow, add a glob pattern to $ALLOWLIST_FILE" >&2
exit 2
