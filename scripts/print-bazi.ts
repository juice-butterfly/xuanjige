import { calcBazi } from '../src/engine/bazi.ts'

const result = calcBazi(1965, 2, 6, 15, 0, '女', true, '上海', 2026)
console.log(JSON.stringify(result, null, 2))
