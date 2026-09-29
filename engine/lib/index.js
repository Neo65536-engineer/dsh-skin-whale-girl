/**
 * dsh-safe-area —— 宿主侧。
 *
 * 只做一件事：接收浏览器侧的自检报告并落盘，供"重启后无需人工开 DevTools"地取证。
 * 这是一个**开发期诊断通道**，不是产品功能，因此刻意写得极窄：
 *  - 只接受 POST + application/json
 *  - 同源校验（带 Origin 时必须与 Host 同源）
 *  - 体积上限 256 KB
 *  - 只写一个固定文件名（不接受任何来自请求的路径）
 *  - 路由注册包在 webCtx.effect 内，卸载即撤销
 *
 * 引擎的其余工作全部在浏览器侧，宿主侧不需要别的服务。
 */
import { mkdir, writeFile } from 'node:fs/promises'

const ROUTE = '/dsh-safe-area/report'
const MAX_BYTES = 256 * 1024

/** 报告落在插件包自己的 run/ 目录：不依赖 $DSH_HOME 的解析方式，一定可写可读。 */
const OUT = new URL('../run/safe-area-report.json', import.meta.url)

function sameOrigin(req) {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true   // 同源 fetch 可能不带 Origin
  const host = req.headers.host
  if (typeof host !== 'string') return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BYTES) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx.get('webServer')
    webCtx.effect(() => server.register({
      kind: 'exact',
      path: ROUTE,
      handler: async (req, res) => {
        const json = (code, payload) => {
          res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
          res.end(JSON.stringify(payload))
        }
        if (req.method !== 'POST') return json(405, { ok: false, error: 'method' })
        if (!sameOrigin(req)) return json(403, { ok: false, error: 'cross_origin' })
        if ((req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
          return json(415, { ok: false, error: 'content_type' })
        }
        const body = await readBody(req)
        if (body === null) return json(413, { ok: false, error: 'too_large' })
        let parsed
        try {
          parsed = JSON.parse(body.toString('utf8'))
        } catch {
          return json(400, { ok: false, error: 'bad_json' })
        }
        try {
          await mkdir(new URL('../run/', import.meta.url), { recursive: true })
          await writeFile(OUT, JSON.stringify(parsed, null, 2), 'utf8')
        } catch (err) {
          ctx.logger?.error?.(`dsh-safe-area: 报告落盘失败: ${String(err)}`)
          return json(500, { ok: false, error: 'write_failed' })
        }
        return json(200, { ok: true, route: ROUTE })
      },
    }), 'dsh-safe-area: self-check report sink')
  })
}
