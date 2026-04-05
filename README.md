# joo-on-claude

Personal Claude Code plugin — HUD statusline and more.

## Features

### HUD (Statusline)

OMC 수준의 2줄 상태줄을 제공합니다.

**Line 1** — 세션 메타 정보:
```
~/w/mac-cfg (main) [Opus] ▓▓▓▓░░░░░░ 42% $1.23 ⚡23%(1h30m) 14:30
```

**Line 2** — 실시간 활동 (정보가 있을 때만):
```
tool:Read | agents:2[Explore(45s),Plan(2m)] | skill:brainstorm | 3/7
```

## Install

```
/plugin install joo-on/joo-on-claude
```

## Setup

```
/joo-on-claude:hud setup
```

## Commands

| Command | Description |
|---------|-------------|
| `/joo-on-claude:hud setup` | HUD 설치 및 설정 |
| `/joo-on-claude:hud status` | 현재 HUD 상태 확인 |
| `/joo-on-claude:hud remove` | HUD 제거 및 원복 |

## Requirements

- Node.js 18+
- Claude Code

## License

MIT
