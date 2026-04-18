#!/bin/bash
# ─────────────────────────────────────────────────────────────
# block-dangerous-bash.sh — Claude Code PreToolUse hook
#
# Matcher: "Bash" (see hooks/hooks.json).
# Reads tool_input.command from stdin JSON and rejects destructive
# or credential-leaking shell patterns before execution.
#
# Rejected patterns (exit 2):
#   - rm -rf outside the project (direct, or via bash -c / eval)
#   - rm targeting critical system paths (/etc, /usr, /var, /System, ...)
#   - curl|wget piped to a shell
#   - chmod 777 (with or without -R)
#   - direct disk writes (dd of=/dev/*, mkfs.*, fdisk, diskutil erase)
#   - git push --force (use --force-with-lease)
#   - env/printenv piped to curl|wget|nc (credential exfiltration)
#
# Exit codes: 0 = allow · 2 = block (stderr is fed back to the model)
# ─────────────────────────────────────────────────────────────
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""')

# ─────────────────────────────────────────────
# 1. 간접 실행을 통한 rm -rf 우회 차단
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qiE '(bash|sh|zsh)\s+-c\s+.*rm\s+-(rf|fr|r)\b'; then
  echo "BLOCKED: Indirect rm -rf via shell -c is not allowed" >&2
  exit 2
fi
if echo "$COMMAND" | grep -qiE 'eval\s+.*rm\s+-(rf|fr|r)\b'; then
  echo "BLOCKED: Indirect rm -rf via eval is not allowed" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 2. 프로젝트 외부 rm -rf 차단
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'rm\s+-(rf|fr|r)\b' || echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]+\s+)+.*-[a-zA-Z]*r'; then
  PROJECT_DIR=$(pwd)
  BLOCKED=false
  TARGETS=$(echo "$COMMAND" | sed -E 's/^.*rm\s+(-[a-zA-Z]+\s+)+//' | tr ' ' '\n')
  while IFS= read -r TARGET; do
    [ -z "$TARGET" ] && continue
    TARGET=$(echo "$TARGET" | sed -E "s/^['\"]|['\"]$//g")
    [ -z "$TARGET" ] && continue
    if [[ "$TARGET" = /* ]]; then
      ABS_PATH="$TARGET"
    else
      ABS_PATH="$PROJECT_DIR/$TARGET"
    fi
    ABS_PATH=$(python3 -c "import os,sys; print(os.path.normpath(sys.argv[1]))" "$ABS_PATH")
    if [[ "$ABS_PATH" != "$PROJECT_DIR"/* ]]; then
      BLOCKED=true
      break
    fi
  done <<< "$TARGETS"
  if $BLOCKED; then
    echo "BLOCKED: rm -rf outside project directory ($ABS_PATH not under $PROJECT_DIR)" >&2
    exit 2
  fi
fi

# ─────────────────────────────────────────────
# 3. 위험한 시스템 경로 삭제 차단
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'rm\s+.*(/|~|/etc|/usr|/var|/System|/Applications|/Library|\$HOME)\s*$'; then
  echo "BLOCKED: Deletion targeting critical system path" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 4. 원격 스크립트 파이프 실행 차단
#    curl/wget 결과를 sh/bash로 파이프하는 패턴
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qiE '(curl|wget)\s+.*\|\s*(bash|sh|zsh|source)'; then
  echo "BLOCKED: Piping remote content to shell is not allowed" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 5. 위험한 권한 변경 차단
#    chmod 777, chmod -R 777 등 과도한 권한 부여
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE 'chmod\s+(-R\s+)?777\b'; then
  echo "BLOCKED: chmod 777 is insecure — use specific permissions" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 6. 디스크/파티션 직접 쓰기 차단
#    dd, mkfs 등 디스크 레벨 명령어
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qE '\b(dd\s+.*of=/dev/|mkfs\.|fdisk|diskutil\s+(erase|partitionDisk))'; then
  echo "BLOCKED: Direct disk write operation is not allowed" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 7. git 위험 연산 차단
#    - push --force (단, --force-with-lease 는 허용)
#    - push --mirror (원격 전체 덮어쓰기)
# ─────────────────────────────────────────────
# --force 뒤에 공백 또는 EOL 이 오는 경우만 매칭 → --force-with-lease 는 통과
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--force($|[[:space:]])'; then
  echo "BLOCKED: git push --force is not allowed — use --force-with-lease" >&2
  exit 2
fi
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*--mirror\b'; then
  echo "BLOCKED: git push --mirror overwrites all remote refs — specify branches explicitly" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 8. 환경 변수/자격 증명 유출 차단
#    env, printenv 결과를 외부로 전송
# ─────────────────────────────────────────────
if echo "$COMMAND" | grep -qiE '(env|printenv|set)\s*\|.*\b(curl|wget|nc|ncat)\b'; then
  echo "BLOCKED: Piping environment variables to external commands" >&2
  exit 2
fi

exit 0
