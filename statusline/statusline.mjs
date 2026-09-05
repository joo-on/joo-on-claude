#!/usr/bin/env node
/**
 * joo-on-claude HUD — Claude Code Statusline
 *
 * OMC 수준의 풍부한 상태줄을 제공합니다.
 * Line 1: 경로, 브랜치, 모델, 컨텍스트 바, 비용, rate limit, 시계
 * Line 2: 마지막 도구, 에이전트 추적, 스킬, Todo 진행률
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
 * Rate limit 표시 + 리셋까지 남은 시간
 */
function renderRateLimit(rateLimit) {
  if (!rateLimit?.five_hour) return '';
  const { used_percentage, resets_at } = rateLimit.five_hour;
  if (used_percentage == null) return '';

  const pct = Math.round(used_percentage);
  let color = GREEN;
  if (pct >= 80) color = RED;
  else if (pct >= 50) color = YELLOW;

  let timeLeft = '';
  if (resets_at) {
    const remaining = resets_at * 1000 - Date.now();
    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      timeLeft = hours > 0 ? `(${hours}h${mins}m)` : `(${mins}m)`;
    }
  }

  return `${color}⚡${pct}%${timeLeft}${RESET}`;
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
function buildLine1(input) {
  const cwd = input.workspace?.current_dir || input.cwd || '';
  const model = input.model?.display_name || input.model?.id || '';
  const ctxPct = input.context_window?.used_percentage;
  const cost = input.cost?.total_cost_usd;
  const rateLimit = input.rate_limits;
  const branch = getGitBranch(cwd);
  const clock = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const parts = [];
  parts.push(`${BLUE}${renderFishPath(cwd)}${RESET}`);
  if (branch) parts.push(`${YELLOW}(${branch})${RESET}`);
  if (model) parts.push(`${CYAN}[${model}]${RESET}`);
  if (ctxPct != null) parts.push(renderContextBar(ctxPct));

  const costStr = renderCost(cost);
  if (costStr) parts.push(costStr);

  const rateLimitStr = renderRateLimit(rateLimit);
  if (rateLimitStr) parts.push(rateLimitStr);

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
// Line 2 렌더 함수 (transcript 기반)
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

function buildLine2(transcript) {
  const parts = [];

  const toolStr = renderLastTool(transcript.lastToolName);
  if (toolStr) parts.push(toolStr);

  const agentStr = renderAgents(transcript.agents);
  if (agentStr) parts.push(agentStr);

  const skillStr = renderLastSkill(transcript.lastSkill);
  if (skillStr) parts.push(skillStr);

  const todoStr = renderTodos(transcript.todos);
  if (todoStr) parts.push(todoStr);

  return parts.length > 0 ? parts.join(`${DIM} | ${RESET}`) : '';
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

  process.stdout.write(buildLine1(input) + '\n');

  // 트랜스크립트 문제 때문에 Line 1까지 잃지 않도록 분리해서 감싼다.
  try {
    const line2 = buildLine2(parseTranscript(input.transcript_path));
    if (line2) process.stdout.write(line2 + '\n');
  } catch (err) {
    warn(`트랜스크립트 파싱 실패: ${err?.stack || err}`);
  }
}

main().catch((err) => {
  warn(err?.stack || err);
  process.stdout.write('\n');
});
