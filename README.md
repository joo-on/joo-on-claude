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

## Skills

| Skill | Description |
|-------|-------------|
| `/joo-on-claude:code-quality [target]` | 9차원 코드 품질 리포트 (Explore 4개 병렬, `quality-YYYYMMDD.md` 생성) |
| `/joo-on-claude:code-explore [target]` | 3-5개 병렬 Explore로 구조·의존성·테스트 딥다이브 (`code-<slug>-<ts>.md` 생성) |
| `/joo-on-claude:merge-permissions [apply]` | `settings.local.json` → `~/.claude/settings.json` 병합 (기본 dry-run, widening 경고, 자동 백업, deny-union-only) |
| `save-conversation` | 대화 요약을 `conv-logs/YYYYMM/DD/conv-TS.md`에 저장 (세션 내 증분 저장, 월별 prompt 로그). 트리거: "save conv", "대화 저장" 등 |

## Safety Hooks

플러그인 설치 시 세 개의 `PreToolUse` 훅이 자동 등록됩니다.

| Hook | Matcher | 역할 |
|------|---------|------|
| `block-dangerous-bash.sh`  | `Bash`        | `rm -rf`/`curl \| sh`/`chmod 777`/`git push --force`·`--mirror` 등 파괴적·자격증명 유출 명령 차단 |
| `save-conv-before-commit.sh` | `Bash` (체인) | `git commit` 가로채기 — 프로젝트에 `conv-logs/` 있을 때만 활성화(opt-in). 3분 이내 대화 로그가 스테이지 안 돼 있으면 커밋 거절 |
| `block-dangerous-write.sh` | `Write\|Edit` | 세 계층 정책으로 파일 쓰기 검증 (아래 참조) |

### Write 훅의 3계층 정책

- **Tier 1 — 절대 차단 (해제 불가):** `.env*`, `credentials/secret/token/password/apikey.*`, `~/.ssh/id_*`, `~/.ssh/authorized_keys`, `~/.ssh/known_hosts`, `~/.aws/credentials`, `~/.gcloud/`, `~/.kube/config`, `~/.gnupg/`
- **Tier 2 — 기본 차단, 프로젝트 opt-in으로 해제 가능:** 시스템 경로(`/etc`, `/usr`, `/System`, `/Library`, `/bin`, `/sbin`, `/var`, `/tmp`, `/private`), `~/.ssh/config`, `~/.aws/config`, 프로젝트 디렉토리 외부
- **Tier 3 — 항상 허용:** 프로젝트 내부, `~/.claude/`

### 프로젝트별 허용 목록

Tier 2를 풀고 싶은 프로젝트는 루트에 다음 파일을 둡니다:

```
<project>/.claude/hook-write-allowlist
```

한 줄에 하나씩 글롭 패턴을 적고, `~`는 `$HOME`으로 확장됩니다. `#`으로 시작하는 줄은 주석입니다. **Tier 1은 허용 목록으로도 풀 수 없습니다** (실수로 비밀 키를 허용해도 차단).

예를 들어, dotfiles 성격의 machine-config 프로젝트(`~/.zshrc`, `~/.config/**` 등을 관리하는 레포)라면 아래와 같이 적습니다:

```
# 예시 — dotfiles / machine-config 프로젝트
~/.zshrc
~/.zprofile
~/.gitconfig
~/.config/**
~/Library/Preferences/com.apple.**
~/.dotfiles-backup-*/**
```

위 예시는 설명용이며, 실제 허용할 경로는 각 프로젝트가 스스로 결정합니다.

## Requirements

- Node.js 18+
- Claude Code

## License

MIT
