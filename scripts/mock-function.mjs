// 本地联调用 mock Function：模拟 POST /functions/v1/app/api/interpret 的应用侧 SSE 帧。
// 不含任何凭据，不访问云端；仅用于检验前端流式、停止与兜底路径。生产不部署此文件。
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT || 8787)

const MODE_TEXT = {
  merge: `一、互相印证
盘面显达人缘之广。中式依据：年柱庚辰正官透出，官星坐库。印占依据：太阳落第九宫，与上升同一风向宫位。
盘面显思虑深沉。中式依据：日主癸水身弱，水旺而漂。印占依据：月亮落双鱼第十宫，宿主土星。
盘面显行动先行。中式依据：时柱壬子比肩帮身。印占依据：火星落白羊第十一宫。

二、彼此错位
中式五行缺木，印占木星却落第十二宫显收敛。可能原因：体系差异——五行看气体分布，印占看宫位领域。
中式身弱喜金水，印占上升双子由水星主之偏灵动。可能原因：时间精度——上升度数对出生分钟敏感。
中式官星在年柱显早，印占第十宫月亮显稳。可能原因：宫制——整宫制放大了星座对宫位的覆盖。

三、综合判断
两盘共同指向一个外柔内韧、以智驭事的底色。

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
  return MODE_TEXT[mode] ?? `盘面已阅，此方向（${mode}）的解读稍后奉上。

依据：时柱比肩，主自立。

本解读为传统文化娱乐内容，不构成任何决策依据。`
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  if (req.method === 'GET' && url.pathname.endsWith('/api/health')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  if (req.method !== 'POST' || !url.pathname.endsWith('/api/interpret')) {
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'not_found' } }))
    return
  }
  let body = ''
  req.on('data', (c) => {
    body += c
    if (body.length > 65536) req.destroy()
  })
  req.on('end', () => {
    let mode = 'career'
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed?.mode === 'string') mode = parsed.mode
    } catch {}
    const scenario = url.searchParams.get('scenario')
    if (scenario === 'http-error') {
      res.writeHead(503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { code: 'service_unavailable' } }))
      return
    }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store, no-transform',
    })
    const answer = mockAnswer(mode)
    const chunks = answer.match(/.{1,3}|\n/g) ?? []
    let offset = 0
    const send = (obj) => res.write(`event: frame\ndata: ${JSON.stringify(obj)}\n\n`)
    send({ t: 'ready' })
    const tick = () => {
      if (res.destroyed || res.writableEnded) return
      if (scenario === 'stall' && offset > 6) return // 悬挂，用于测超时兜底
      if (scenario === 'fail' && offset > 20) {
        send({ t: 'error', code: 'upstream' })
        res.end()
        return
      }
      if (offset >= chunks.length) {
        send({ t: 'done' })
        res.end()
        return
      }
      send({ t: 'delta', text: chunks[offset++] })
      const delay = scenario === 'slow' ? 90 : 28
      setTimeout(tick, delay)
    }
    setTimeout(tick, 300)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock function on http://127.0.0.1:${PORT}`)
})
