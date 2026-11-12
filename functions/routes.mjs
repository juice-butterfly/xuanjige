// 玄机阁 · 玄机先生解读路由。浏览器 → 本 Function → Qoder Cloud Agents。
// V1 为无状态单发解读：每次请求新建 Cloud Session、发一条消息、流式转发、用后即弃。
// 无数据库、无会话持久化；提示词只在服务端拼装，浏览器只送已排好的结构化盘面。
import {
  createCloudAgentsClient,
  ensureCloudResources,
  CloudAgentsError,
} from './cloud-agents.mjs';
import { readSSE, encodeSSE } from './sse.mjs';

// 来自 sites.get_context().runtime.cloudAgents.apiOrigin（已配置为 true）。
// 停止部署若该值未配置；不得用管理端 origin 或文档示例兜底。
const CLOUD_ORIGIN = 'https://api.qoder.com.cn';
// 稳定应用域，固定于服务端配置；禁止取自 Host 头或请求参数。
const APP_SCOPE = 'xuanjige-master-v1';

const MODES = new Set(['merge', 'family', 'study', 'career', 'marriage', 'health', 'social']);
const DIRECTION_CN = {
  merge: '合参',
  family: '家运亲情',
  study: '学业考试',
  career: '事业工作',
  marriage: '婚恋感情',
  health: '健康',
  social: '人际',
};
const ELEMENTS = ['金', '木', '水', '火', '土'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SYSTEM_PROMPT = [
  '你是「玄机先生」，玄机阁的解盘先生。你只依据用户给出的命盘数据说话，不引入盘面之外的信息，不确定的地方明说不确定。',
  '规矩：',
  '- 不判生死，不承诺财运，不出现具体金额，不做健康断言。',
  '- 术语只随体系走：中式术语（日主、十神、五行、大运、神煞）只用于八字；印占术语（上升、宫位、月宿、运限、九曜）只用于印占盘。严禁杂交两个体系的词汇。',
  '- 语气平实，不用感叹号堆叠，不奉承。输出纯文本，不用 Markdown 符号。',
  '- 每次回答结尾固定单独一行：本解读为传统文化娱乐内容，不构成任何决策依据。',
].join('\n');

function createMemoryCoordinator() {
  // 单实例内可用的锁与登记。跨实例并发首建可能产生重复资源，届时
  // ensureCloudResources 会以 ai_initialization_conflict 拒绝，重试即可复用其一；本站流量下风险可接受。
  const gates = new Map();
  const boxes = new Map();
  return {
    async withLock(key, callback) {
      const previous = gates.get(key) ?? Promise.resolve();
      let release;
      const gate = new Promise(resolve => {
        release = resolve;
      });
      gates.set(key, gate);
      let released = false;
      await previous.catch(() => {});
      const box = boxes.get(key) ?? { value: null };
      boxes.set(key, box);
      const lease = {
        async read() {
          return box.value;
        },
        async write(value) {
          box.value = value;
        },
        assertHeld() {
          if (released) throw new Error('lock_lost');
        },
      };
      try {
        return await callback(lease);
      } finally {
        released = true;
        release();
        if (gates.get(key) === gate) gates.delete(key);
      }
    },
  };
}

function fail(code, status) {
  throw new CloudAgentsError(code, status ?? 400);
}

async function readJson(request, limit) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail('invalid_input', 400);
  const reader = request.body?.getReader();
  if (!reader) fail('invalid_input', 400);
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        fail('payload_too_large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('invalid_input', 400);
  }
}

function isStr(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

function isElement(v) {
  return ELEMENTS.includes(v);
}

// 只收白名单字段，其余一律丢弃；形状不对整体拒绝。
function validChart(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.gender !== '男' && c.gender !== '女') return null;
  const b = c.bazi;
  const v = c.vedic;
  if (!b || typeof b !== 'object' || !v || typeof v !== 'object') return null;
  if (!isStr(b.day_master, 2) || !isElement(b.day_master_element)) return null;
  if (!isStr(b.day_strength, 12)) return null;
  if (!Array.isArray(b.favorable) || b.favorable.length > 2 || !b.favorable.every(isElement)) return null;
  if (!Array.isArray(b.pillars) || b.pillars.length !== 4) return null;
  for (const p of b.pillars) {
    if (!p || typeof p !== 'object' || !isStr(p.name, 2) || !isStr(p.ganzhi, 2) || !isStr(p.shi_shen_gan, 8)) return null;
  }
  if (!b.wuxing_count || typeof b.wuxing_count !== 'object') return null;
  for (const e of ELEMENTS) {
    const n = b.wuxing_count[e];
    if (!Number.isInteger(n) || n < 0 || n > 8) return null;
  }
  if (!Array.isArray(b.wuxing_missing) || b.wuxing_missing.length > 5 || !b.wuxing_missing.every(isElement)) return null;
  if (!isStr(b.current_dayun, 2)) return null;
  if (b.shen_sha !== undefined) {
    if (!Array.isArray(b.shen_sha) || b.shen_sha.length > 6 || !b.shen_sha.every(s => isStr(s, 24))) return null;
  }
  if (!isStr(v.lagna, 24)) return null;
  if (!isStr(v.moon_nakshatra, 48)) return null;
  if (!Array.isArray(v.planets) || v.planets.length !== 9) return null;
  for (const p of v.planets) {
    if (!p || typeof p !== 'object' || !isStr(p.planet, 4) || !isStr(p.sign_cn, 4)) return null;
    if (!Number.isInteger(p.house) || p.house < 1 || p.house > 12) return null;
    if (typeof p.retro !== 'boolean') return null;
  }
  if (!isStr(v.current_dasha, 24)) return null;
  if (v.ayanamsa !== undefined && (!Number.isFinite(v.ayanamsa) || v.ayanamsa < 15 || v.ayanamsa > 35)) return null;
  return c;
}

function chartBlock(chart) {
  const b = chart.bazi;
  const v = chart.vedic;
  const lines = [];
  lines.push(`性别：${chart.gender}`);
  lines.push('——中式八字——');
  lines.push(`四柱：${b.pillars.map(p => `${p.name} ${p.ganzhi}（${p.shi_shen_gan}）`).join(' · ')}`);
  lines.push(`日主：${b.day_master}${b.day_master_element}`);
  lines.push(`五行分布：${ELEMENTS.map(e => `${e}${b.wuxing_count[e] ?? 0}`).join(' ')}（缺 ${b.wuxing_missing.length ? b.wuxing_missing.join('、') : '无'}）`);
  lines.push(`身强弱：${b.day_strength} · 喜用 ${b.favorable.join('、') || '未定'}`);
  if (Array.isArray(b.shen_sha) && b.shen_sha.length) lines.push(`神煞：${b.shen_sha.join(' · ')}`);
  lines.push(`当前大运：${b.current_dayun}`);
  lines.push('——印占——');
  lines.push(`上升（Lagna）：${v.lagna}`);
  lines.push(`月亮宿：${v.moon_nakshatra}`);
  lines.push(`九曜落宫：${v.planets.map(p => `${p.planet} ${p.sign_cn}·第${p.house}宫${p.retro ? '（逆）' : ''}`).join('；')}`);
  lines.push(`当前运限（dasha）：${v.current_dasha}`);
  if (v.ayanamsa !== undefined) lines.push(`岁差：${Number(v.ayanamsa).toFixed(2)}°`);
  return lines.join('\n');
}

function buildPrompt(mode, chart) {
  const task = [];
  if (mode === 'merge') {
    task.push(
      '【任务】中西合参。严格按以下四段输出：',
      '一、互相印证：找三处两盘指向一致的地方。每条先给结论，再另起一行给「中式依据：…」与「印占依据：…」。',
      '二、彼此错位：找三处两盘说法相左的地方，每条说明可能原因（体系差异 / 时间精度 / 宫制）。若确实找不到错位，本段直接写「两盘方向基本一致」并简述缘由，不许编造矛盾。',
      '三、综合判断：只写一句，两张盘共同指向的人格底色。',
      '四、结尾固定一行：本解读为传统文化娱乐内容，不构成任何决策依据。',
      '',
      '【禁止】',
      '- 禁止杂交术语（例：不许说「印占七杀」「八字上升星座」）。',
      '- 禁止为凑印证硬拉因果；两处只是措辞相近而并无共同指向的，不算印证。',
    );
  } else {
    const name = DIRECTION_CN[mode];
    task.push(`【任务】就「${name}」一方向解读：`);
    task.push('- 以中式四柱与十神为主，印占补充当前运限（dasha）阶段与月亮宿性格。');
    task.push('- 分点作答，至多四条；每条结论后必须另起一行，以「依据：」开头，写明出处（中式哪一柱 / 哪个十神，或印占哪一宫 / 哪个月宿 / 哪个运限）。');
    if (mode === 'health') {
      task.push('- 只谈作息与体质趋势；涉及具体病症，一律写「以医生意见为准」。');
    }
    task.push('- 只依据盘面数据；没有对应依据的猜测不要写。');
  }
  return `【盘面】\n${chartBlock(chart)}\n\n${task.join('\n')}`;
}

let cachedModel;

async function pickModel(cloud) {
  if (cachedModel) return cachedModel;
  const result = await cloud.request('/api/v1/cloud/models');
  const list = Array.isArray(result?.data) ? result.data : [];
  const enabled = list.filter(m => m && typeof m.id === 'string');
  const chosen = enabled.find(m => m.enabled === true || m.status === 'enabled') ?? enabled.find(m => m.enabled !== false && m.status !== 'disabled' && m.status !== 'unavailable');
  if (!chosen) fail('ai_model_unavailable', 503);
  cachedModel = chosen.id;
  return cachedModel;
}

function textOfContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(textOfContent).join('');
  if (content && typeof content === 'object' && typeof content.text === 'string') return content.text;
  return '';
}

function unwrap(obj) {
  return obj?.event && typeof obj.event === 'object' ? obj.event : obj;
}

function deltaText(obj) {
  const d = obj?.delta ?? unwrap(obj)?.delta;
  if (d && (d.type === 'content_delta' || d.type === undefined)) return textOfContent(d.content);
  return '';
}

function messageText(obj) {
  const e = unwrap(obj);
  if (e?.type === 'agent.message') {
    const text = textOfContent(e.content);
    return typeof text === 'string' ? text : null;
  }
  return null;
}

function terminalStatus(obj) {
  const e = unwrap(obj);
  const t = typeof e?.type === 'string' ? e.type.toLowerCase() : '';
  if (!t) return null;
  if (t.includes('interrupt') || t.includes('abort')) return 'interrupted';
  if (t.includes('fail') || t === 'error' || t === 'session.error') return 'failed';
  const st = typeof e?.state === 'string' ? e.state : typeof e?.status === 'string' ? e.status : '';
  if (/fail|error/.test(st)) return 'failed';
  if (/interrupt|abort/.test(st)) return 'interrupted';
  return null;
}

function safeErrorCode(error) {
  if (error instanceof CloudAgentsError) return error.code;
  return 'upstream';
}

async function interpret(request, ctx, requireUserFn) {
  const user = requireUserFn(ctx);
  if (!user?.id) fail('login_required', 401);
  const requestId = request.headers.get('x-request-id');
  if (!UUID_RE.test(requestId ?? '')) fail('invalid_input', 400);
  const body = await readJson(request, 8192);
  if (!MODES.has(body?.mode)) fail('invalid_input', 400);
  const chart = validChart(body.chart);
  if (!chart) fail('invalid_input', 400);

  const prompt = buildPrompt(body.mode, chart);
  const lifetime = new AbortController();
  if (request.signal.aborted) lifetime.abort();
  else request.signal.addEventListener('abort', () => lifetime.abort(), { once: true });
  const lifetimeTimer = setTimeout(() => lifetime.abort(), 110000);

  try {
    const model = await pickModel(cloud);
    const binding = await ensureCloudResources({
      client: cloud,
      coordinator,
      applicationScope: APP_SCOPE,
      agent: {
        name: '玄机先生',
        model,
        system: SYSTEM_PROMPT,
        metadata: { app: 'xuanjige', purpose: 'interpretation' },
      },
      environment: { name: '玄机先生环境', config: { type: 'cloud' } },
    });
    const session = await cloud.request('/api/v1/cloud/sessions', {
      method: 'POST',
      body: { ...binding, title: '玄机阁解读', metadata: { app: 'xuanjige', purpose: 'interpretation' } },
    });
    if (typeof session?.id !== 'string' || !/^sess_[A-Za-z0-9_-]+$/.test(session.id)) fail('ai_response_invalid', 503);

    // 先接上游流，再发消息，避免漏掉最早的事件块。
    const upstream = await cloud.openStream(session.id, { signal: lifetime.signal });
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const push = frame => {
          if (closed) return;
          try {
            controller.enqueue(encodeSSE('frame', frame));
          } catch {
            closed = true;
          }
        };
        const ping = setInterval(() => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(': ping\n\n'));
          } catch {
            closed = true;
          }
        }, 15000);
        let sent = '';
        try {
          push({ t: 'ready' });
          await cloud.request(`/api/v1/cloud/sessions/${session.id}/events`, {
            method: 'POST',
            body: { events: [{ type: 'user.message', content: [{ type: 'text', text: prompt }] }] },
          });
          for await (const frame of readSSE(upstream.body, { signal: lifetime.signal })) {
            let evt;
            try {
              evt = JSON.parse(frame.data);
            } catch {
              continue;
            }
            const piece = deltaText(evt);
            if (piece) {
              sent += piece;
              push({ t: 'delta', text: piece });
              continue;
            }
            const full = messageText(evt);
            if (full !== null && full !== sent) {
              push({ t: 'replace', text: full });
              sent = full;
              continue;
            }
            const term = terminalStatus(evt);
            if (term) {
              push({ t: 'error', code: term === 'interrupted' ? 'interrupted' : 'upstream' });
              closed = true;
            }
          }
          if (!closed && !lifetime.signal.aborted) push(sent ? { t: 'done' } : { t: 'error', code: 'no_reply' });
        } catch (error) {
          if (!closed && !lifetime.signal.aborted) push({ t: 'error', code: safeErrorCode(error) });
        } finally {
          clearInterval(ping);
          closed = true;
          try {
            upstream.close();
          } catch {}
          try {
            controller.close();
          } catch {}
        }
      },
      cancel() {
        lifetime.abort();
      },
    });
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store, no-transform',
      },
    });
  } catch (error) {
    clearTimeout(lifetimeTimer);
    if (error instanceof CloudAgentsError) {
      const status = [400, 401, 403, 404, 409, 413, 429].includes(error.status) ? error.status : 503;
      return Response.json({ error: { code: error.code } }, { status });
    }
    return Response.json({ error: { code: 'service_unavailable' } }, { status: 503 });
  }
}

export function application({ requireUser }) {
  return async ctx => {
    const request = ctx.request;
    // 网关保留后缀，但把 app 换成部署的物理 Function 名；Provider 可能已剥掉 /functions/v1。
    const pathname = new URL(request.url).pathname;
    const match = pathname.match(/^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/);
    if (!match) fail('not_found', 404);
    const path = match[1] || '/';
    if (path === '/api/health' && request.method === 'GET') return Response.json({ ok: true });
    if (path === '/api/interpret' && request.method === 'POST') return interpret(request, ctx, requireUser);
    fail('not_found', 404);
  };
}
