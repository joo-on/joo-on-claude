#!/usr/bin/env node
/**
 * joo-on-claude HUD — Claude Code Statusline
 *
 * OMC 수준의 풍부한 상태줄을 제공합니다.
 * 한 줄에 한 범주씩, 위에서 아래로:
 *   1 정체성 — 경로, 브랜치, 모델·effort, output style, 컨텍스트 바, 시계
 *   2 예산   — 경과, 비용, 변경 줄 수, rate limit(5h/7d), 프롬프트 캐시
 *   3 활동   — 마지막 도구, 에이전트, 스킬, Todo  (보여줄 게 없으면 줄 자체를 생략)
 *
 * 의존성: Node.js 빌트인만 사용 (fs, child_process, os)
 */

import { readFileSync, statSync, openSync, readSync, closeSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';

// ============================================================================
// 색상 상수
// ============================================================================

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

// ============================================================================
// Line 1 렌더 함수 (stdin JSON 기반)
// ============================================================================

/**
 * Fish-style 경로 축약: 중간 디렉토리를 첫 글자로 줄임
 * ~/workspace/mac-cfg → ~/w/mac-cfg
 */
function renderFishPath(cwd) {
  if (!cwd) return '~';
  const home = homedir();
  let rel = cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;

  const parts = rel.split('/').filter(Boolean);
  if (parts.length <= 1) return rel;

  const hasHome = parts[0] === '~';
  const segments = hasHome ? parts.slice(1) : parts;
  const prefix = hasHome ? '~' : '';

  if (segments.length <= 1) return `${prefix}/${segments[0] || ''}`;

  const shortened = segments.slice(0, -1).map(s => s[0]);
  shortened.push(segments[segments.length - 1]);
  return `${prefix}/${shortened.join('/')}`;
}

/**
 * 컨텍스트 윈도우 프로그레스 바 + 색상
 */
function renderContextBar(pct) {
  if (pct == null) return '';
  const p = Math.round(pct);
  const barWidth = 10;
  const filled = Math.round(p * barWidth / 100);
  const empty = barWidth - filled;
  const bar = '▓'.repeat(filled) + '░'.repeat(empty);

  let color = GREEN;
  if (p >= 80) color = RED;
  else if (p >= 50) color = YELLOW;

  return `${color}${bar} ${p}%${RESET}`;
}

/**
 * 세션 비용 표시
 */
function renderCost(cost) {
  if (cost == null || cost === 0) return '';
  return `${DIM}$${cost.toFixed(2)}${RESET}`;
}

/**
 * 사용률에 따른 신호등 색
 */
function usageColor(pct) {
  if (pct >= 80) return RED;
  if (pct >= 50) return YELLOW;
  return GREEN;
}

/**
 * epoch(초) → 남은 시간 문자열
 */
function untilReset(resetsAt) {
  if (!resetsAt) return '';
  const remaining = resetsAt * 1000 - Date.now();
  if (remaining <= 0) return '';
  const hours = Math.floor(remaining / 3600000);
  const mins = Math.floor((remaining % 3600000) / 60000);
  if (hours >= 24) return `(${Math.floor(hours / 24)}d${hours % 24}h)`;
  return hours > 0 ? `(${hours}h${mins}m)` : `(${mins}m)`;
}

/**
 * Rate limit — 5시간 창과 7일 창을 함께 표시한다.
 *
 * 리셋 카운트다운은 둘 중 더 많이 소진된 쪽에만 붙인다. 양쪽 모두에 붙이면
 * 줄만 길어지고, 정작 급한 창이 어느 쪽인지 읽기 어려워진다.
 */
function renderRateLimits(rateLimits) {
  if (!rateLimits) return '';

  const windows = [
    { label: '5h', data: rateLimits.five_hour },
    { label: '7d', data: rateLimits.seven_day },
  ].filter(w => w.data?.used_percentage != null);

  if (windows.length === 0) return '';

  const worst = windows.reduce((a, b) =>
    b.data.used_percentage > a.data.used_percentage ? b : a);

  const rendered = windows.map(w => {
    const pct = Math.round(w.data.used_percentage);
    const countdown = w === worst ? untilReset(w.data.resets_at) : '';
    return `${usageColor(pct)}${w.label} ${pct}%${countdown}${RESET}`;
  });

  return `${DIM}⚡${RESET}${rendered.join(' ')}`;
}

/** 만료 몇 분 전부터 경고할지 */
const CACHE_EXPIRY_WARNING_MS = 10 * 60 * 1000;

/**
 * 토큰 수를 짧게: 45000 → 45k, 1240000 → 1.2M
 */
function formatTokens(n) {
  if (n == null) return '';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * 프롬프트 캐시 상태.
 *
 * 세 가지를 구분해서 보여준다:
 *   cold        이미 식음 — 다음 요청이 prefix 전체를 다시 캐시에 쓴다
 *   N분 남음    아직 따뜻하지만 곧 식는다 (식기 *전에* 알리는 게 요점)
 *   적중률      그 외 평시. hit_ratio는 세션 누적이라 굼뜬 지표이므로
 *               위 두 즉시 신호가 항상 우선한다.
 *
 * 경고 상태에는 recache_tokens_if_cold를 괄호로 붙인다 — "식었다/곧 식는다"만으로는
 * 지금 멈출지 계속할지 판단할 수 없고, 다시 채우는 비용을 알아야 결정이 선다.
 * 이 값은 세션 누적 사용량이 아니라 현재 컨텍스트 prefix의 크기다.
 */
function renderPromptCache(cache) {
  if (!cache) return '';

  const recache = formatTokens(cache.recache_tokens_if_cold);
  const cost = recache ? `${DIM}(${recache})${RESET}` : '';

  if (cache.warm === false) return `${RED}cache:cold${RESET}${cost}`;

  if (cache.expires_at) {
    const left = cache.expires_at * 1000 - Date.now();
    if (left > 0 && left <= CACHE_EXPIRY_WARNING_MS) {
      const mins = Math.max(1, Math.round(left / 60000));
      return `${YELLOW}cache:${mins}m${RESET}${cost}`;
    }
  }

  if (cache.hit_ratio == null) return `${DIM}cache:warm${RESET}`;
  const pct = Math.round(cache.hit_ratio * 100);
  const color = pct >= 80 ? GREEN : pct >= 50 ? YELLOW : RED;
  return `${color}cache:${pct}%${RESET}`;
}

/**
 * 세션 경과 시간. 1분 미만은 폭을 쓸 값어치가 없다.
 */
function renderDuration(ms) {
  if (ms == null || ms < 60000) return '';
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  // 분이 0이면 떼어낸다 — "3h0m"보다 "3h"가 읽기 낫다.
  const label = h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}h`) : `${m}m`;
  return `${DIM}up ${label}${RESET}`;
}

/**
 * 이 세션이 건드린 코드량
 */
function renderLinesChanged(added, removed) {
  if (!added && !removed) return '';
  return `${GREEN}+${added || 0}${RESET}${DIM}/${RESET}${RED}-${removed || 0}${RESET}`;
}

/**
 * output style — 기본값일 때는 표시하지 않는다.
 */
function renderOutputStyle(style) {
  const name = style?.name;
  if (!name || name === 'default') return '';
  return `${MAGENTA}style:${name}${RESET}`;
}

/**
 * Git 브랜치 가져오기
 */
function getGitBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD 2>/dev/null', {
      cwd,
      timeout: 1000,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Line 1 조립
 */
function buildIdentityLine(input) {
  const cwd = input.workspace?.current_dir || input.cwd || '';
  const model = input.model?.display_name || input.model?.id || '';
  const effort = input.effort?.level;
  const ctxPct = input.context_window?.used_percentage;
  const branch = getGitBranch(cwd);
  const clock = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const parts = [];
  parts.push(`${BLUE}${renderFishPath(cwd)}${RESET}`);
  if (branch) parts.push(`${YELLOW}(${branch})${RESET}`);
  if (model) parts.push(`${CYAN}[${model}${effort ? `·${effort}` : ''}]${RESET}`);

  const styleStr = renderOutputStyle(input.output_style);
  if (styleStr) parts.push(styleStr);

  if (ctxPct != null) parts.push(renderContextBar(ctxPct));
  parts.push(`${DIM}${clock}${RESET}`);

  return parts.join(' ');
}

// ============================================================================
// Transcript JSONL 파서 (에이전트, 도구, 스킬, Todo 추적)
// ============================================================================

const MAX_TAIL_BYTES = 512 * 1024; // 500KB
const MAX_AGENT_MAP_SIZE = 50;

/**
 * 파일 끝부분만 읽어서 라인 배열로 반환
 */
function readTailLines(filePath, fileSize, maxBytes) {
  const startOffset = Math.max(0, fileSize - maxBytes);
  const bytesToRead = fileSize - startOffset;
  const fd = openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytesToRead);

  try {
    readSync(fd, buffer, 0, bytesToRead, startOffset);
  } finally {
    closeSync(fd);
  }

  const lines = buffer.toString('utf8').split('\n');
  if (startOffset > 0 && lines.length > 0) lines.shift();
  return lines;
}

/**
 * Transcript JSONL 파싱
 *
 * 캐시는 의도적으로 없다. 이전에는 ~/.claude/hud/.cache.json 하나를 모든
 * 세션이 공유했는데, 실측 결과 292KB 트랜스크립트 기준 절약폭이 8ms
 * (91ms → 83ms)뿐이었다. 나머지는 전부 Node 기동 비용이다. 게다가 세션을
 * 두 개만 켜도 두 세션이 서로의 캐시를 덮어써서 적중률이 0이 된다.
 * 렌더마다 디스크에 쓰는 비용과 교차 세션 충돌을 8ms에 살 이유가 없다.
 * 다시 넣고 싶다면 먼저 재고, 트랜스크립트별로 키를 나눌 것.
 */
function parseTranscript(transcriptPath) {
  const empty = { agents: [], todos: [], lastToolName: null, lastSkill: null, toolCallCount: 0, agentCallCount: 0 };
  if (!transcriptPath || !existsSync(transcriptPath)) return empty;

  let stat;
  try {
    stat = statSync(transcriptPath);
  } catch {
    return empty;
  }

  // JSONL 파싱
  const agentMap = new Map();
  const result = { ...empty };
  const latestTodos = [];

  const lines = stat.size > MAX_TAIL_BYTES
    ? readTailLines(transcriptPath, stat.size, MAX_TAIL_BYTES)
    : readFileSync(transcriptPath, 'utf8').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      processEntry(entry, agentMap, latestTodos, result);
    } catch { /* 깨진 라인 스킵 */ }
  }

  // 에이전트 결과 정리
  const running = [];
  const completed = [];
  for (const agent of agentMap.values()) {
    if (agent.status === 'running') running.push(agent);
    else completed.push(agent);
  }
  result.agents = [...running, ...completed.slice(-(10 - running.length))].slice(0, 10);
  result.todos = latestTodos;

  return result;
}

/**
 * 단일 transcript 엔트리 처리
 */
function processEntry(entry, agentMap, latestTodos, result) {
  const content = entry.message?.content;
  if (!content || !Array.isArray(content)) return;
  const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();

  for (const block of content) {
    if (block.type === 'tool_use' && block.id && block.name) {
      result.toolCallCount++;
      result.lastToolName = block.name;

      // 에이전트 추적
      if (block.name === 'Agent' || block.name === 'Task' || block.name === 'proxy_Task') {
        result.agentCallCount++;
        const input = block.input || {};

        if (agentMap.size >= MAX_AGENT_MAP_SIZE) {
          let oldestId = null, oldestTime = Infinity;
          for (const [id, a] of agentMap) {
            if (a.status === 'completed' && a.startTime < oldestTime) {
              oldestTime = a.startTime;
              oldestId = id;
            }
          }
          if (oldestId) agentMap.delete(oldestId);
        }

        agentMap.set(block.id, {
          id: block.id,
          type: input.subagent_type || 'unknown',
          model: input.model,
          description: input.description,
          status: 'running',
          startTime: timestamp.getTime(),
        });
      }

      // 스킬 추적
      if (block.name === 'Skill' || block.name === 'proxy_Skill') {
        const input = block.input || {};
        if (input.skill) {
          result.lastSkill = { name: input.skill, args: input.args };
        }
      }

      // Todo 추적 (TodoWrite)
      if (block.name === 'TodoWrite' || block.name === 'proxy_TodoWrite') {
        const input = block.input || {};
        if (input.todos && Array.isArray(input.todos)) {
          latestTodos.length = 0;
          latestTodos.push(...input.todos.map(t => ({ content: t.content, status: t.status })));
        }
      }

      // Todo 추적 (TaskCreate/TaskUpdate)
      if (block.name === 'TaskCreate' || block.name === 'proxy_TaskCreate') {
        const input = block.input || {};
        latestTodos.push({ content: input.subject || '', status: 'pending' });
      }
      if (block.name === 'TaskUpdate' || block.name === 'proxy_TaskUpdate') {
        const input = block.input || {};
        if (input.status) {
          const existing = latestTodos.find(t => t.content === input.subject);
          if (existing) existing.status = input.status;
        }
      }
    }

    // tool_result로 에이전트 완료 처리
    if (block.type === 'tool_result' && block.tool_use_id) {
      const agent = agentMap.get(block.tool_use_id);
      if (agent) {
        const text = typeof block.content === 'string'
          ? block.content
          : Array.isArray(block.content)
            ? (block.content.find(c => c.type === 'text')?.text || '')
            : '';
        if (!text.includes('Async agent launched')) {
          agent.status = 'completed';
          agent.endTime = timestamp.getTime();
        }
      }
    }
  }
}

// ============================================================================
// 예산 / 활동 줄
// ============================================================================

function shortAgentType(type) {
  const name = type.split(':').pop() || type;
  const abbrevs = {
    'general-purpose': 'general', 'Explore': 'explore', 'Plan': 'plan',
    'code-reviewer': 'review', 'code-refactoring-expert': 'refactor',
  };
  return abbrevs[name] || name;
}

function renderAgents(agents) {
  const running = agents.filter(a => a.status === 'running');
  if (running.length === 0) return '';

  const now = Date.now();
  const withDuration = running.map(a => {
    const name = shortAgentType(a.type);
    const dur = now - a.startTime;
    const secs = Math.floor(dur / 1000);
    if (secs < 10) return name;
    if (secs < 60) return `${name}(${secs}s)`;
    return `${name}(${Math.floor(secs / 60)}m)`;
  });

  return `${CYAN}agents:${running.length}${RESET}${DIM}[${withDuration.join(',')}]${RESET}`;
}

function renderLastTool(name) {
  if (!name) return '';
  return `${DIM}tool:${RESET}${name.replace('proxy_', '')}`;
}

function renderLastSkill(skill) {
  if (!skill) return '';
  const display = skill.name.split(':').pop() || skill.name;
  const args = skill.args ? `(${skill.args.slice(0, 15)})` : '';
  return `${MAGENTA}skill:${display}${args}${RESET}`;
}

function renderTodos(todos) {
  if (!todos || todos.length === 0) return '';
  const completed = todos.filter(t =>
    t.status === 'completed' || t.status === 'done' || t.status === 'complete'
  ).length;
  const total = todos.length;
  const color = completed === total ? GREEN : YELLOW;
  return `${color}${completed}/${total}${RESET}`;
}

const SEP = `${DIM} | ${RESET}`;

/**
 * 예산 줄 — 이 세션이 무엇을 쓰고 있나.
 * stdin payload만 보므로 트랜스크립트 파싱보다 먼저, 그리고 그것과 무관하게 그려진다.
 */
function buildBudgetLine(input) {
  return [
    renderDuration(input.cost?.total_duration_ms),
    renderCost(input.cost?.total_cost_usd),
    renderLinesChanged(input.cost?.total_lines_added, input.cost?.total_lines_removed),
    renderRateLimits(input.rate_limits),
    renderPromptCache(input.prompt_cache),
  ].filter(Boolean).join(SEP);
}

/**
 * 활동 줄 — 지금 무슨 일이 벌어지고 있나.
 * 보여줄 게 없으면 빈 문자열을 돌려주고, 호출부가 줄 자체를 생략한다.
 */
function buildActivityLine(transcript) {
  return [
    renderLastTool(transcript.lastToolName),
    renderAgents(transcript.agents),
    renderLastSkill(transcript.lastSkill),
    renderTodos(transcript.todos),
  ].filter(Boolean).join(SEP);
}

// ============================================================================
// 메인
// ============================================================================

const warn = (msg) => process.stderr.write(`[joo-on-claude HUD] ${msg}\n`);

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);

  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch (err) {
    // 파싱에 실패해도 빈 줄보다는 쓸모 있는 줄을 그린다.
    warn(`stdin을 파싱하지 못했습니다: ${err.message}`);
    input = { cwd: process.cwd() };
  }

  process.stdout.write(buildIdentityLine(input) + '\n');

  const budget = buildBudgetLine(input);
  if (budget) process.stdout.write(budget + '\n');

  // 활동 줄만 트랜스크립트에 의존한다. 여기서 실패해도 위 두 줄은 이미 나갔다.
  try {
    const activity = buildActivityLine(parseTranscript(input.transcript_path));
    if (activity) process.stdout.write(activity + '\n');
  } catch (err) {
    warn(`트랜스크립트 파싱 실패: ${err?.stack || err}`);
  }
}

main().catch((err) => {
  warn(err?.stack || err);
  process.stdout.write('\n');
});
