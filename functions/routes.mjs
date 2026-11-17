// 玄机阁 · 玄机先生解读路由。浏览器 → 本 Function → Qoder Cloud Agents。
// V1 为无状态单发解读：每次请求新建 Cloud Session、发一条消息、流式转发、用后即弃。
// 无数据库、无会话持久化；提示词只在服务端拼装，浏览器只送已排好的结构化盘面。
import {
  createCloudAgentsClient,
  ensureCloudResources,
  CloudAgentsError,
} from './cloud-agents.mjs';

// 来自 sites.get_context().runtime.cloudAgents.apiOrigin（已配置为 true）。
// 停止部署若该值未配置；不得用管理端 origin 或文档示例兜底。
const CLOUD_ORIGIN = 'https://api.qoder.com.cn';
// 稳定应用域，固定于服务端配置；禁止取自 Host 头或请求参数。
const APP_SCOPE = 'xuanjige-master-v1';

// 令牌只从平台注入的 QODER_PAT 读取；客户端与浏览器都接触不到。
const cloud = createCloudAgentsClient({ origin: CLOUD_ORIGIN });
const coordinator = createMemoryCoordinator();

const MODES = new Set(['merge', 'relation', 'family', 'study', 'career', 'marriage', 'health', 'social', 'ask']);
// 固定模型：账号模型列表里的 DeepSeek-Flash。列表变动时退回第一个启用项。
const PINNED_MODEL = 'dfmodel';
const DIRECTION_CN = {
  merge: '合参',
  family: '家运亲情',
  study: '学业考试',
  career: '事业工作',
  marriage: '婚恋感情',
  health: '健康',
  social: '人际',
};
const RELATION_CN = {
  friend: '朋友',
  partner: '情侣',
  crush: '有好感的人',
  family: '亲人',
  stranger: '陌生人',
  classmate: '同学',
};
const RELATION_SCALE = {
  friend: '按朋友看，重点在相处的边界与分寸。',
  partner: '按情侣看，重点在相处方式与磨合之处。',
  crush: '按有好感的人看，重点在靠近的分寸；不预测对方心意，不替对方表态。',
  family: '按亲人看，重点在代际差异与彼此的照应。',
  stranger: '按陌生人看，只谈气场与初识相处的注意，不推断私交。',
  classmate: '按同学看，重点在同侪之间的分寸与协作。',
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
  // 喜用按十神组命名（官杀 / 食伤 / 财 / 印 / 比劫 / 调候用神 / 扶抑平衡），不是五行。
  if (!Array.isArray(b.favorable) || b.favorable.length > 3) return null;
  if (!b.favorable.every(s => isStr(s, 12))) return null;
  if (!Array.isArray(b.pillars) || b.pillars.length !== 4) return null;
  for (const p of b.pillars) {
    if (!p || typeof p !== 'object' || !isStr(p.name, 2)) return null;
    // 时柱可因时辰不详而为空串。
    if (typeof p.ganzhi !== 'string' || p.ganzhi.length > 2) return null;
    // 日柱天干即日主，其十神为空串。
    if (typeof p.shi_shen_gan !== 'string' || p.shi_shen_gan.length > 8) return null;
  }
  if (!b.wuxing_count || typeof b.wuxing_count !== 'object') return null;
  for (const e of ELEMENTS) {
    const n = b.wuxing_count[e];
    if (!Number.isInteger(n) || n < 0 || n > 8) return null;
  }
  if (!Array.isArray(b.wuxing_missing) || b.wuxing_missing.length > 5 || !b.wuxing_missing.every(isElement)) return null;
  // 时辰不详时无当前大运，允许空串。
  if (typeof b.current_dayun !== 'string' || b.current_dayun.length > 2) return null;
  if (b.shen_sha !== undefined) {
    if (!Array.isArray(b.shen_sha) || b.shen_sha.length > 6 || !b.shen_sha.every(s => isStr(s, 24))) return null;
  }
  if (!isStr(v.lagna, 24)) return null;
  if (!isStr(v.moon_nakshatra, 48)) return null;
  if (!Array.isArray(v.planets) || v.planets.length !== 9) return null;
  for (const p of v.planets) {
    if (!p || typeof p !== 'object' || !isStr(p.planet, 12) || !isStr(p.sign_cn, 4)) return null;
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
  const pillars = b.pillars.filter(p => p.ganzhi).map(p => `${p.name} ${p.ganzhi}（${p.shi_shen_gan}）`);
  lines.push(`四柱：${pillars.join(' · ')}${b.pillars.length > pillars.length ? '（时柱不详）' : ''}`);
  lines.push(`日主：${b.day_master}${b.day_master_element}`);
  lines.push(`五行分布：${ELEMENTS.map(e => `${e}${b.wuxing_count[e] ?? 0}`).join(' ')}（缺 ${b.wuxing_missing.length ? b.wuxing_missing.join('、') : '无'}）`);
  lines.push(`身强弱：${b.day_strength} · 喜用十神 ${b.favorable.join('、') || '未定'}`);
  if (Array.isArray(b.shen_sha) && b.shen_sha.length) lines.push(`神煞：${b.shen_sha.join(' · ')}`);
  lines.push(`当前大运：${b.current_dayun || '时辰不详，未排大运'}`);
  lines.push('——印占——');
  lines.push(`上升（Lagna）：${v.lagna}`);
  lines.push(`月亮宿：${v.moon_nakshatra}`);
  lines.push(`九曜落宫：${v.planets.map(p => `${p.planet} ${p.sign_cn}·第${p.house}宫${p.retro ? '（逆）' : ''}`).join('；')}`);
  lines.push(`当前运限（dasha）：${v.current_dasha}`);
  if (v.ayanamsa !== undefined) lines.push(`岁差：${Number(v.ayanamsa).toFixed(2)}°`);
  return lines.join('\n');
}

function buildPrompt(mode, chart, question, relation, partner) {
  if (mode === 'ask') {
    return [
      `【盘面】\n${chartBlock(chart)}`,
      `【提问】${question}`,
      '',
      '【作答】只依据上面盘面回答，盘面没有的不要编；术语仍只随体系走，不杂交。',
      '不判生死，不承诺财运，不做健康断言，不给具体金额。分点作答，至多四条，每条另起一行以「依据：」写明出处。',
      '输出纯文本，不用 Markdown 符号。',
    ].join('\n');
  }
  if (mode === 'relation') {
    const label = RELATION_CN[relation];
    const task = [
      `【任务】就「${label}」这一关系，把本人盘与关系人盘合看。两盘各说各的依据，不可混为一谈。`,
      `【关系尺度】${RELATION_SCALE[relation]}`,
      '严格按以下四段输出：',
      '一、两人底色：先本人、后关系人，各一两句；每条另起一行给「本人依据：…」「关系人依据：…」。',
      '二、相合处：找两到三处，先给结论，再另起两行给双方依据。',
      '三、相冲处：找两到三处，先给结论，再另起两行给双方依据。若确实找不到，本段直接写「两盘未见明显相冲」并简述缘由，不许编造矛盾。',
      '四、相处建议：只写一句，具体可做，不判分合。',
      '结尾固定一行：本解读为传统文化娱乐内容，不构成任何决策依据。',
      '',
      '【禁止】',
      '- 不判两人合不合、不给分数、不断言结局。',
      '- 不预测对方心意，不替对方表态或下结论。',
      '- 禁止杂交术语（例：不许说「印占七杀」「八字上升星座」）。',
      '- 禁止为凑结论硬拉因果或编造依据。',
    ];
    return [
      `【本人盘】\n${chartBlock(chart)}`,
      `【关系人盘 · ${label}】\n${chartBlock(partner)}`,
      '',
      task.join('\n'),
    ].join('\n\n');
  }
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
  // 列表字段为 is_enabled；首项通常是 auto（平台自动路由）。
  const usable = list.filter(m => m && typeof m.id === 'string'
    && m.is_enabled !== false && m.enabled !== false
    && m.status !== 'disabled' && m.status !== 'unavailable');
  const chosen = usable.find(m => m.id === PINNED_MODEL)
    ?? usable.find(m => m.id !== 'auto')
    ?? usable[0];
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

// 平台对单次响应有约 60 秒上限，而首字可能迟至 50 秒才出现，
// 故一次长连接必然被截断：改由浏览器先起会话、再分次短轮询。
function projectEvents(events) {
  let text = '';
  let replies = 0;
  let state = 'running';
  // 只按最后一条用户消息之后的状态判终态，避免上一轮的 idle 冒充本轮。
  let turnStart = 0;
  events.forEach((evt, index) => {
    if (evt?.type === 'user.message') turnStart = index + 1;
  });
  for (const evt of events) {
    const type = typeof evt?.type === 'string' ? evt.type : '';
    if (type === 'agent.message') {
      const piece = textOfContent(evt.content);
      if (piece) {
        text = piece;
        replies++;
      }
    }
  }
  for (let index = turnStart; index < events.length; index++) {
    const lowered = String(events[index]?.type ?? '').toLowerCase();
    if (/fail|error/.test(lowered)) state = 'failed';
    else if (/interrupt|abort|cancel/.test(lowered)) state = 'interrupted';
    else if (state === 'running' && /idle|completed|done|finished|end/.test(lowered)) state = 'completed';
  }
  return { text, state, replies };
}

async function listEvents(session) {
  const events = [];
  let page;
  for (let index = 0; index < 10; index++) {
    const query = `order=asc&limit=100${page ? `&page=${encodeURIComponent(page)}` : ''}`;
    const result = await cloud.request(`/api/v1/cloud/sessions/${session}/events?${query}`);
    events.push(...(Array.isArray(result?.data) ? result.data : []));
    if (!result?.has_more) break;
    if (typeof result.next_page !== 'string' || !result.next_page) break;
    page = result.next_page;
  }
  return events;
}

function failResponse(error) {
  if (error instanceof CloudAgentsError) {
    const status = [400, 401, 403, 404, 409, 413, 429].includes(error.status) ? error.status : 503;
    return Response.json({ error: { code: error.code } }, { status });
  }
  return Response.json({ error: { code: 'service_unavailable' } }, { status: 503 });
}

async function startSession(mode, chart, question, visitor, relation, partner) {
  const prompt = buildPrompt(mode, chart, question, relation, partner);
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
    body: {
      ...binding,
      title: '玄机阁解读',
      metadata: { app: 'xuanjige', purpose: 'interpretation', ...(visitor ? { visitor } : {}) },
    },
  });
  if (typeof session?.id !== 'string' || !/^sess_[A-Za-z0-9_-]+$/.test(session.id)) fail('ai_response_invalid', 503);
  await cloud.request(`/api/v1/cloud/sessions/${session.id}/events`, {
    method: 'POST',
    body: { events: [{ type: 'user.message', content: [{ type: 'text', text: prompt }] }] },
  });
  return { session: session.id, model };
}

async function interpret(request, ctx, requireUserFn) {
  try {
    // 站点公开访问（auth_integration_status: not_required），匿名访客也可问事；
    // 有身份时照常通过，无身份不作为拒绝条件。V1 不存会话，故无需归属校验。
    try {
      requireUserFn(ctx);
    } catch {
      /* 匿名访客 */
    }
    const requestId = request.headers.get('x-request-id');
    if (!UUID_RE.test(requestId ?? '')) fail('invalid_input', 400);
    const body = await readJson(request, 8192);
    if (!MODES.has(body?.mode)) fail('invalid_input', 400);
    const chart = validChart(body.chart);
    if (!chart) fail('invalid_input', 400);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (body.mode === 'ask' ? !(question.length >= 1 && question.length <= 500) : question.length > 500) {
      fail('invalid_input', 400);
    }
    const visitor = typeof body?.visitor === 'string' && UUID_RE.test(body.visitor) ? body.visitor : '';
    let relation = '';
    let partner = null;
    if (body.mode === 'relation') {
      relation = typeof body?.relation === 'string' ? body.relation : '';
      if (!Object.hasOwn(RELATION_CN, relation)) fail('invalid_input', 400);
      partner = validChart(body.partner);
      if (!partner) fail('invalid_input', 400);
    }
    const started = await startSession(body.mode, chart, question, visitor, relation, partner);
    return Response.json(started, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failResponse(error);
  }
}

async function readEvents(request) {
  try {
    const session = new URL(request.url).searchParams.get('session') ?? '';
    if (!/^sess_[A-Za-z0-9_-]+$/.test(session)) fail('invalid_input', 400);
    const events = await listEvents(session);
    const { text, state, replies } = projectEvents(events);
    const payload = { text, state, replies };
    if (request.headers.get('x-debug') === '1') {
      payload.types = [...new Set(events.map(e => e?.type).filter(t => typeof t === 'string'))];
    }
    return Response.json(payload, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failResponse(error);
  }
}

// 追问：把新问题投进原会话，模型沿用前文与同一张盘。
async function ask(request) {
  try {
    const requestId = request.headers.get('x-request-id');
    if (!UUID_RE.test(requestId ?? '')) fail('invalid_input', 400);
    const body = await readJson(request, 4096);
    const session = typeof body?.session === 'string' ? body.session : '';
    if (!/^sess_[A-Za-z0-9_-]+$/.test(session)) fail('invalid_input', 400);
    const visitor = typeof body?.visitor === 'string' && UUID_RE.test(body.visitor) ? body.visitor : '';
    if (!visitor) fail('invalid_input', 400);
    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question || question.length > 500) fail('invalid_input', 400);
    // 会话登记过访客标识的，必须是同一访客；不暴露会话是否存在。
    const info = await cloud.request(`/api/v1/cloud/sessions/${session}`);
    if (info?.metadata?.visitor !== visitor) fail('not_found', 404);
    await cloud.request(`/api/v1/cloud/sessions/${session}/events`, {
      method: 'POST',
      body: { events: [{ type: 'user.message', content: [{ type: 'text', text: `【追问】${question}` }] }] },
    });
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failResponse(error);
  }
}

export function application({ requireUser }) {
  return async ctx => {
    const request = ctx.request;
    try {
      // 网关保留后缀，但把 app 换成部署的物理 Function 名；Provider 可能已剥掉 /functions/v1。
      const pathname = new URL(request.url).pathname;
      const match = pathname.match(/^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/);
      if (!match) fail('not_found', 404);
      const path = match[1] || '/';
      if (path === '/api/health' && request.method === 'GET') return Response.json({ ok: true });
      // 必须以 await 返回，否则内部拒绝会绕过外层 try/catch，变成平台 500。
      if (path === '/api/interpret' && request.method === 'POST') return await interpret(request, ctx, requireUser);
      if (path === '/api/ask' && request.method === 'POST') return await ask(request);
      if (path === '/api/events' && request.method === 'GET') return await readEvents(request);
      fail('not_found', 404);
    } catch (error) {
      return failResponse(error);
    }
  };
}
