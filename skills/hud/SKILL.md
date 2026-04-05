---
name: hud
description: Install, configure, or remove the joo-on-claude HUD statusline
argument-hint: "[setup|status|remove]"
---

# HUD Skill

Configure the joo-on-claude HUD (Heads-Up Display) statusline.

## Quick Commands

| Command | Description |
|---------|-------------|
| `/joo-on-claude:hud setup` | HUD 설치 및 설정 |
| `/joo-on-claude:hud status` | 현재 HUD 상태 확인 |
| `/joo-on-claude:hud remove` | HUD 제거 및 원복 |

## Arguments

### `setup` (default)

HUD를 설치합니다. 다음 단계를 순서대로 수행하세요:

1. **HUD 디렉토리 확인 및 생성:**
   ```bash
   mkdir -p ~/.claude/hud
   ```

2. **플러그인에서 statusline.mjs 복사:**
   - 이 스킬이 위치한 플러그인의 `statusline/statusline.mjs` 파일을 찾습니다
   - 플러그인 경로: 이 SKILL.md 파일의 2단계 상위 디렉토리에 `statusline/statusline.mjs`가 있습니다
   - 해당 파일을 `~/.claude/hud/statusline.mjs`로 복사합니다
   ```bash
   # 플러그인 캐시에서 statusline.mjs 위치를 찾아 복사
   find ~/.claude/plugins/cache -path "*/joo-on-claude/*/statusline/statusline.mjs" -newer ~/.claude/hud/statusline.mjs 2>/dev/null | head -1
   ```

3. **settings.json 업데이트:**
   - `~/.claude/settings.json`을 읽습니다
   - `statusLine` 필드를 다음으로 설정합니다:
     ```json
     {
       "statusLine": {
         "type": "command",
         "command": "node ~/.claude/hud/statusline.mjs"
       }
     }
     ```
   - 기존 statusLine 설정이 있으면 덮어씁니다

4. **Node.js 확인:**
   ```bash
   node --version
   ```
   Node.js 18 미만이면 경고를 표시합니다.

5. **완료 메시지:**
   - "HUD가 설치되었습니다. Claude Code를 재시작하면 새 상태줄이 적용됩니다."
   - 재시작 방법 안내: `/exit` 후 다시 시작

### `status`

현재 HUD 상태를 확인합니다:

1. `~/.claude/hud/statusline.mjs` 파일 존재 여부 확인
2. `~/.claude/settings.json`의 `statusLine.command`가 `node ~/.claude/hud/statusline.mjs`인지 확인
3. 캐시 파일 (`~/.claude/hud/.cache.json`) 존재 여부 및 크기 확인
4. 결과를 표로 출력:
   ```
   HUD Status:
   - Script:   ✅ installed (~/.claude/hud/statusline.mjs)
   - Settings: ✅ configured
   - Cache:    ✅ active (2.1KB)
   ```

### `remove`

HUD를 제거합니다:

1. `~/.claude/settings.json`에서 `statusLine` 필드를 제거합니다
2. `~/.claude/hud/` 디렉토리를 삭제합니다
3. "HUD가 제거되었습니다. Claude Code를 재시작하면 기본 상태줄로 돌아갑니다."

## Environment Variables

- `CLAUDE_CONFIG_DIR`: Claude 설정 디렉토리 (기본값: `~/.claude`)
  - 이 변수가 설정되어 있으면 모든 경로에서 `~/.claude` 대신 이 경로를 사용합니다
