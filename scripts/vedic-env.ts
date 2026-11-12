import { initVedic } from '../src/engine/vedic.ts'

// Node 下 Emscripten 只会 fetch，垫一层 file:// 支持（仅本地脚本；浏览器端无此问题）
let installed = false
function installFetchShim(): void {
  if (installed) return
  installed = true
  const realFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : typeof Request === 'function' && input instanceof Request
            ? input.url
            : String(input)
    if (url.startsWith('file://')) {
      const { readFileSync } = await import('node:fs')
      const { fileURLToPath } = await import('node:url')
      return new Response(readFileSync(fileURLToPath(url)), {
        headers: { 'content-type': 'application/wasm' },
      })
    }
    return realFetch(input, init)
  }
}

export async function ensureVedic(): Promise<void> {
  installFetchShim()
  const wasmUrl = import.meta.resolve('@swisseph/browser/dist/swisseph.wasm')
  await initVedic(wasmUrl)
}
