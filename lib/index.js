/**
 * dsh-skin-whale-girl —— 宿主侧。
 *
 * 只做一件事：把随包发布的素材以只读前缀路由发出去。
 * 安全约束（照抄已实装的 maid-atelier 做法）：
 *  - 路径**只来自随包 allowlist**（manifest.json 里列出的文件名），绝不从磁盘遍历 → 无路径穿越
 *  - 只接受 GET / HEAD，其余 405
 *  - ETag + If-None-Match → 304；X-Content-Type-Options: nosniff
 *  - 路由注册包在 webCtx.effect 里，卸载即撤销
 */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const SKIN_ID = 'whale-girl'
const PREFIX = `/skin-assets/${SKIN_ID}`
const MIME = { webp: 'image/webp', png: 'image/png', svg: 'image/svg+xml', json: 'application/json', ico: 'image/x-icon' }

/** 允许被服务的文件名 = manifest 里列出的素材 + manifest 自己。 */
async function loadAllowlist(dir) {
  const raw = await readFile(new URL('manifest.json', dir), 'utf8')
  const map = JSON.parse(raw)
  const names = new Set(Object.values(map).filter((v) => typeof v === 'string'))
  names.add('manifest.json')
  return names
}

export function apply(ctx) {
  const dir = new URL('../assets/runtime/', import.meta.url)

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
          allowlist ??= await loadAllowlist(dir)
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
          bytes = await readFile(new URL(file, dir))
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
  })
}
