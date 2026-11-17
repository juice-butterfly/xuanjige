// 本地联调用 mock Function：与线上一致的两段式接口。
//   POST /functions/v1/app/api/interpret -> { session }
//   POST /functions/v1/app/api/ask       -> { ok: true }
//   GET  /functions/v1/app/api/events    -> { text, state, replies }
// 不含任何凭据，不访问云端；仅用于检验前端轮询、停止与兜底路径。生产不部署此文件。
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8787)
const FIRST_MS = Number(process.env.MOCK_FIRST_MS || 600)
const CPS = Number(process.env.MOCK_CPS || 120)

const MODE_TEXT = {
  merge: `一、互相印证
盘面显达人缘之广。
中式依据：年柱庚辰正官透出，官星坐库。
印占依据：太阳落第九宫，与上升同一风向宫位。

盘面显思虑深沉。
中式依据：日主癸水身弱，水旺而漂。
印占依据：月亮落双鱼第十宫，宿主土星。

盘面显行动先行。
中式依据：时柱壬子比肩帮身。
印占依据：火星落白羊第十一宫。

二、彼此错位
中式五行缺木，印占木星却落第十二宫显收敛。
可能原因：体系差异——五行看气体分布，印占看宫位领域。

中式身弱喜金水，印占上升双子由水星主之偏灵动。
可能原因：时间精度——上升度数对出生分钟敏感。

中式官星在年柱显早，印占第十宫月亮显稳。
可能原因：宫制——整宫制放大了星座对宫位的覆盖。

三、综合判断
两盘共同指向一个外柔内韧、以智驭事的底色。

本解读为传统文化娱乐内容，不构成任何决策依据。`,
  relation: `一、两人底色
本人偏于内敛，遇事先看清再动。
本人依据：日主癸水身弱，月柱印星护身。
关系人外显明快，处事先行后思。
关系人依据：日主丙火当令，年柱比肩透出。

二、相合处
两人都重实际，不爱空谈。
本人依据：时柱正财坐库。
关系人依据：金星落第二宫。
两人都能在压力下做事。
本人依据：日主得月令之余气。
关系人依据：土星落第十宫。

三、相冲处
节奏一快一慢，容易互相催促。
本人依据：五行水旺，行事偏缓。
关系人依据：火星落白羊，行动直接。
表达方式不同，一个藏，一个露。
本人依据：日支为印，心事不外露。
关系人依据：月亮落第五宫，情绪外显。

四、相处建议
把「先说清再动手」定成两个人的惯例，快的一方留半步，慢的一方给准话。

本解读为传统文化娱乐内容，不构成任何决策依据。`,
  career: `盘面显早年自立，做事讲究章法。
依据：月柱正官透干，官星主职守与规范。

盘面显中年转稳，宜守成中求进。
依据：当前大运戊寅，官印相生。

盘面显当下行动力强，适合推进搁置已久的事。
依据：印占当前火星大运 · 罗睺小运，火星主执行。

盘面显沟通协调是长处，但忌多头并进。
依据：上升双子，水星主之。

本解读为传统文化娱乐内容，不构成任何决策依据。`,
  health: `盘面显体质偏燥，秋冬季尤需留意作息。
依据：日主辛金，火多而燥。

盘面显思虑过度则寝浅，宜亥时前入睡。
依据：印占月亮落第十宫，宿主土星，土星主静养。

若有具体不适，以医生意见为准。

本解读为传统文化娱乐内容，不构成任何决策依据。`,
}

export function mockAnswer(mode) {
  return (
    MODE_TEXT[mode] ??
    `盘面已阅，此方向（${mode}）的解读稍后奉上。

依据：时柱比肩，主自立。

本解读为传统文化娱乐内容，不构成任何决策依据。`
  )
}

const sessions = new Map()

function newSession() {
  return {
    id: `sess_mock_${Math.random().toString(36).slice(2, 10)}`,
    turns: [],
  }
}

function addTurn(session, mode, scenario) {
  session.turns.push({
    startedAt: Date.now(),
    answer: mockAnswer(mode),
    scenario,
    done: false,
    replies: 0,
  })
  return session.turns[session.turns.length - 1]
}

function snapshot(session) {
  const turn = session.turns[session.turns.length - 1]
  if (!turn) return { text: '', state: 'running', replies: 0 }
  const elapsed = Date.now() - turn.startedAt
  if (turn.scenario === 'stall') return { text: '', state: 'running', replies: 0 }
  const first = turn.scenario === 'slow' ? 18000 : FIRST_MS
  const shown = Math.max(0, Math.floor(((elapsed - first) / 1000) * CPS))
  const text = turn.answer.slice(0, shown)
  let state = 'running'
  if (turn.scenario === 'fail' && shown > 20) {
    turn.done = true
    state = 'failed'
  } else if (turn.scenario === 'error') {
    state = 'failed'
  } else if (shown >= turn.answer.length) {
    if (!turn.done) {
      turn.done = true
      turn.replies = session.turns.filter((t) => t.done).length
    }
    state = 'completed'
  }
  const replies = session.turns.filter((t) => t.done).length
  return { text, state, replies }
}

function send(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function readBody(req, cb) {
  let body = ''
  req.on('data', (c) => {
    body += c
    if (body.length > 65536) req.destroy()
  })
  req.on('end', () => cb(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  const scenario = url.searchParams.get('scenario') || ''

  if (req.method === 'GET' && url.pathname.endsWith('/api/health')) {
    send(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && url.pathname.endsWith('/api/interpret')) {
    readBody(req, (body) => {
      let mode = 'career'
      try {
        const parsed = JSON.parse(body)
        if (typeof parsed?.mode === 'string') mode = parsed.mode
      } catch {}
      if (scenario === 'http-error') {
        send(res, 503, { error: { code: 'service_unavailable' } })
        return
      }
      const session = newSession()
      addTurn(session, mode, scenario)
      sessions.set(session.id, session)
      send(res, 200, { session: session.id })
    })
    return
  }

  if (req.method === 'POST' && url.pathname.endsWith('/api/ask')) {
    readBody(req, (body) => {
      let id = ''
      let mode = 'ask'
      try {
        const parsed = JSON.parse(body)
        if (typeof parsed?.session === 'string') id = parsed.session
        if (typeof parsed?.question === 'string' && parsed.question.trim()) mode = 'merge'
      } catch {}
      const session = sessions.get(id)
      if (!session) {
        send(res, 404, { error: { code: 'session_not_found' } })
        return
      }
      addTurn(session, mode, scenario)
      send(res, 200, { ok: true })
    })
    return
  }

  if (req.method === 'GET' && url.pathname.endsWith('/api/events')) {
    const id = url.searchParams.get('session') || ''
    const session = sessions.get(id)
    if (!session) {
      send(res, 404, { error: { code: 'session_not_found' } })
      return
    }
    send(res, 200, snapshot(session))
    return
  }

  send(res, 404, { error: { code: 'not_found' } })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock function on http://127.0.0.1:${PORT}`)
})
