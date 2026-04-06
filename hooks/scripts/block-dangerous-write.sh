#!/bin/bash
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

[ -z "$FILE_PATH" ] && exit 0

# ─────────────────────────────────────────────
# 1. 시스템 경로에 파일 쓰기 차단
#    /etc, /usr, /System, /Library, /bin, /sbin 등
# ─────────────────────────────────────────────
if echo "$FILE_PATH" | grep -qE '^/(etc|usr|System|Library|bin|sbin|var|tmp|private)/'; then
  echo "BLOCKED: Writing to system path is not allowed ($FILE_PATH)" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 2. 민감한 자격 증명 파일 덮어쓰기 차단
#    .env, credentials, 키 파일, AWS/GCP/SSH 설정
# ─────────────────────────────────────────────
FILENAME=$(basename "$FILE_PATH")
if echo "$FILENAME" | grep -qiE '^\.(env|env\..+)$'; then
  echo "BLOCKED: Writing to environment file is not allowed ($FILENAME)" >&2
  exit 2
fi
if echo "$FILENAME" | grep -qiE '(credentials|secret|token|password|apikey)\.(json|yaml|yml|toml|xml|txt|cfg|ini)$'; then
  echo "BLOCKED: Writing to credentials file is not allowed ($FILENAME)" >&2
  exit 2
fi
if echo "$FILE_PATH" | grep -qE '(\.ssh/(id_|authorized_keys|known_hosts|config)|\.aws/(credentials|config)|\.gcloud/|\.kube/config|\.gnupg/)'; then
  echo "BLOCKED: Writing to sensitive config path is not allowed ($FILE_PATH)" >&2
  exit 2
fi

# ─────────────────────────────────────────────
# 3. 프로젝트 외부 경로에 파일 쓰기 경고
#    절대 경로가 프로젝트 디렉토리 밖이면 차단
#    (홈 디렉토리의 dotfiles 수정도 방지)
# ─────────────────────────────────────────────
PROJECT_DIR=$(pwd)
if [[ "$FILE_PATH" = /* ]]; then
  ABS_PATH="$FILE_PATH"
else
  ABS_PATH="$PROJECT_DIR/$FILE_PATH"
fi
ABS_PATH=$(python3 -c "import os,sys; print(os.path.normpath(sys.argv[1]))" "$ABS_PATH")

# ~/.claude/ 하위는 Claude Code 작업 공간이므로 허용
# (스킬, 플랜, 메모리, 설정 등 — 민감 경로는 섹션 1,2에서 이미 차단됨)
CLAUDE_DIR="$HOME/.claude"
if [[ "$ABS_PATH" == "$CLAUDE_DIR"/* ]]; then
  exit 0
fi

# 프로젝트 디렉토리 내부가 아니면 차단
if [[ "$ABS_PATH" != "$PROJECT_DIR"/* ]]; then
  echo "BLOCKED: Writing outside project directory ($ABS_PATH not under $PROJECT_DIR)" >&2
  exit 2
fi

exit 0
