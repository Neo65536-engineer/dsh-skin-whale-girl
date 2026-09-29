/**
 * dsh-skin-whale-girl —— 宿主侧。
 *
 * 两件事，都是**开发/取景用的窄通道**，不是产品功能：
 *  ① 把随包发布的素材以只读前缀 `/skin-assets/whale-girl/` 发出去；
 *  ② 接收浏览器侧的自检报告，落到 `run/safe-area-report.json`（免开 DevTools 取证）。
 *
 * 安全约束（素材路由照抄已实装的 maid-atelier 做法）：
 *  - 素材路径**只来自随包 allowlist**（manifest.json 里列出的文件名），绝不从磁盘遍历 → 无路径穿越
 *  - 素材路由只接受 GET / HEAD，其余 405；ETag + If-None-Match → 304；nosniff
 *  - 报告路由只接受 POST + application/json、同源校验、体积上限 256KB、
 *    **只写一个固定文件名**（不接受任何来自请求的路径）
 *  - 两条路由的注册都包在 `webCtx.effect` 里，卸载即撤销
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const SKIN_ID = 'whale-girl'
const PREFIX = `/skin-assets/${SKIN_ID}`
const MIME = { webp: 'image/webp', png: 'image/png', svg: 'image/svg+xml', json: 'application/json', ico: 'image/x-icon' }

const REPORT_ROUTE = '/dsh-safe-area/report'
const REPORT_MAX_BYTES = 256 * 1024

/** 允许被服务的文件名 = manifest 里列出的素材 + manifest 自己。 */
async function loadAllowlist(dir) {
  const raw = await readFile(new URL('manifest.json', dir), 'utf8')
  const map = JSON.parse(raw)
  const names = new Set(Object.values(map).filter((v) => typeof v === 'string'))
  names.add('manifest.json')
  return names
}

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
    if (size > REPORT_MAX_BYTES) return null
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export function apply(ctx) {
  const assetDir = new URL('../assets/runtime/', import.meta.url)
  /* 自检报告落在包自己的 run/ 目录：不依赖 $DSH_HOME 的解析方式，一定可写可读。 */
  const reportFile = new URL('../run/safe-area-report.json', import.meta.url)

  ctx.inject(['webServer'], (webCtx) => {
    const server = webCtx.get('webServer')
    let allowlist = null
    const etags = new Map()

    webCtx.effect(() => server.register({
      kind: 'prefix',
      path: PREFIX,
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' }).end()
          return
        }
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        const file = pathname.startsWith(`${PREFIX}/`) ? pathname.slice(PREFIX.length + 1) : ''
        if (file === '' || file.includes('/') || file.includes('\\') || file.includes('..')) {
          res.writeHead(404).end()
          return
        }
        try {
          allowlist ??= await loadAllowlist(assetDir)
        } catch {
          res.writeHead(500).end()
          return
        }
        if (!allowlist.has(file)) {
          res.writeHead(404).end()
          return
        }
        let bytes
        try {
          bytes = await readFile(new URL(file, assetDir))
        } catch (err) {
          if (err && err.code === 'ENOENT') { res.writeHead(404).end(); return }
          throw err
        }
        let tag = etags.get(file)
        if (tag === undefined) {
          tag = `"${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}"`
          etags.set(file, tag)
        }
        const ext = file.slice(file.lastIndexOf('.') + 1).toLowerCase()
        const headers = {
          'Content-Type': MIME[ext] ?? 'application/octet-stream',
          'Cache-Control': ext === 'json' ? 'no-cache' : 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          ETag: tag,
          'Content-Length': bytes.length,
        }
        const inm = req.headers['if-none-match']
        if (typeof inm === 'string' && inm.split(',').some((v) => v.trim().replace(/^W\//, '') === tag || v.trim() === '*')) {
          res.writeHead(304, headers).end()
          return
        }
        res.writeHead(200, headers)
        res.end(req.method === 'HEAD' ? undefined : bytes)
      },
    }), `${SKIN_ID}: packaged artwork`)

    /* ---- 自检报告落盘（开发期诊断通道） ---- */
    webCtx.effect(() => server.register({
      kind: 'exact',
      path: REPORT_ROUTE,
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
          await writeFile(reportFile, JSON.stringify(parsed, null, 2), 'utf8')
        } catch (err) {
          ctx.logger?.error?.(`${SKIN_ID}: 自检报告落盘失败: ${String(err)}`)
          return json(500, { ok: false, error: 'write_failed' })
        }
        return json(200, { ok: true, route: REPORT_ROUTE })
      },
    }), `${SKIN_ID}: self-check report sink`)
  })
}
