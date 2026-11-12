import { calcVedic } from '../src/engine/vedic.ts'
import { ensureVedic } from './vedic-env.ts'

await ensureVedic()

const res = await calcVedic(
  { dob: '1965-02-06', time: '15:00', place: '上海', lat: 31.23, lon: 121.48 },
  '2026-11-12',
)

console.log(JSON.stringify(res, null, 2))
