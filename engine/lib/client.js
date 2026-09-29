/**
 * dsh-safe-area —— 浏览器侧（安全区引擎）。
 *
 * 设计要点（与设计报告 v3 + 复核意见一致）：
 *  - 美术层在 UI **之下**：引擎在 <body> 前插一个 fixed 容器（z-index:0），
 *    里面依次是 [美术槽][衬底层]。官方 frame 是 position:relative 且在 DOM 中更靠后，
 *    因此官方 UI 天然画在引擎容器之上，引擎永远不可能拦截点击。
 *  - 引擎不认识任何皮肤。它只做四件事：
 *      1) 运行时测量 UI 保护区（多级降级链，容忍上游 DOM 漂移）
 *      2) 把几何发布成 CSS 变量 + <html> 状态属性（供任何皮肤消费）
 *      3) 在顶部带（标题栏 / 会话头）铺一层受控衬底，保证原生图标对比度
 *      4) 越界自检 + 安全区可视化
 *  - 不做：不改官方 z-index（会压死列宽拖拽手柄 z-index:11 / dockkit / 窗口按钮）、
 *    不使用 shell.overlay（那是 z-index:20，在所有列之上，会盖住 UI）。
 *
 * 契约（供皮肤消费）：
 *  css 变量: --dsh-safe-top/right/bottom/left, --dsh-safe-inset,
 *           --dsh-art-top, --dsh-art-bottom, --dsh-protect-*,
 *           --dsh-substrate, --dsh-viewport-w/h
 *  属性:     html[data-dsh-safearea="on"], html[data-dsh-theme="dark|light"]
 *  JS:      window.dshSafeArea.{artRoot,rects,report,visualize,setMode,trust}
 */
window.__ModuleLoader__.load({
  id: 'dsh-safe-area',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    exports.name = 'dsh-safe-area'
    exports.inject = []

    /* ------------------------------------------------------------------ 常量 */
    const ROOT_ID = 'dsh-safe-area-root'
    const ART_ID = 'dsh-safe-area-art'
    const SUB_ID = 'dsh-safe-area-substrate'
    const VIZ_ID = 'dsh-safe-area-viz'
    const STYLE_ID = 'dsh-safe-area-style'

    const FALLBACK = { header: 76, composer: 152 }   // 与上游兜底值一致

    /* ------------------------------------------------------------- CSS 文本 */
    const CSS = `
#${ROOT_ID}{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;contain:layout paint}
#${ART_ID},#${SUB_ID},#${VIZ_ID}{position:absolute;inset:0}
#${ART_ID}{z-index:0}
#${SUB_ID}{z-index:1}
#${VIZ_ID}{z-index:2;display:none}
#${ROOT_ID}[data-viz="on"] #${VIZ_ID}{display:block}
.sa-sub{position:absolute;pointer-events:none}
.sa-viz-box{position:absolute;border:1px dashed rgba(255,90,140,.95);background:rgba(255,90,140,.10);box-sizing:border-box}
.sa-viz-label{position:absolute;font:10px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#fff;
  background:rgba(210,20,80,.92);padding:1px 4px;border-radius:3px;white-space:nowrap;transform:translateY(-100%)}
`

    /* --------------------------------------------------------------- 工具 */
    const num = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0)

    /** display:contents 的元素自身量不到 rect → 向下合并子元素（限深）。 */
    function ownRect(el) {
      if (!el || !el.isConnected) return null
      const r = el.getBoundingClientRect()
      if (r.width > 0.5 && r.height > 0.5) return r
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      const walk = (node, depth) => {
        if (depth > 4) return
        for (const c of node.children) {
          const cr = c.getBoundingClientRect()
          if (cr.width > 0.5 && cr.height > 0.5) {
            if (cr.left < x0) x0 = cr.left
            if (cr.top < y0) y0 = cr.top
            if (cr.right > x1) x1 = cr.right
            if (cr.bottom > y1) y1 = cr.bottom
          } else walk(c, depth + 1)
        }
      }
      walk(el, 0)
      return x0 === Infinity ? null : { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0 }
    }

    function rectOfAny(selectors) {
      for (const s of selectors) {
        let el = null
        try { el = document.querySelector(s) } catch { /* 无效选择器忽略 */ }
        const r = ownRect(el)
        if (r) return r
      }
      return null
    }

    function isDark() {
      const de = document.documentElement
      if (de.hasAttribute('data-ds-dark-theme') || document.body?.hasAttribute('data-ds-dark-theme')) return true
      if (de.getAttribute('data-ds-theme') === 'dark') return true
      if (de.hasAttribute('data-ds-light-theme')) return false
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
    }

    function whenBody() {
      if (document.body) return Promise.resolve()
      return new Promise((res) => {
        const mo = new MutationObserver(() => {
          if (document.body) { mo.disconnect(); res() }
        })
        mo.observe(document.documentElement, { childList: true })
      })
    }

    /* --------------------------------------------------------------- 测量 */
    function measureTitlebar() {
      const el = document.querySelector('.dshDesktopFrameTitlebar')
      const r = ownRect(el)
      if (r && r.height > 1) return r.height
      if (document.documentElement.hasAttribute('data-windows-titlebar')) {
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height'))
        if (Number.isFinite(v) && v > 0) return v
      }
      const seat = rectOfAny(['[data-windows-titlebar]'])
      return seat ? seat.height : 0
    }

    /** 右上角图标簇最左边缘（corner / utilities / actions 并集），逐帧重算。 */
    function headerRightEdge(vw) {
      let left = Infinity
      for (const s of ['[data-slot="conversation.session.header.corner"]',
                       '[data-slot="conversation.session.header.utilities"]',
                       '[data-slot="conversation.session.header.actions"]']) {
        const r = rectOfAny([s])
        if (r && r.width > 1) left = Math.min(left, r.left)
      }
      return left === Infinity ? vw : left
    }

    function measure() {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const titlebar = measureTitlebar()

      const header = rectOfAny([
        '[data-conversation-header]',
        '[data-slot="conversation.header"] > header',
        '[data-slot="conversation.session.header"] > header',
        '[data-slot="conversation.session.header"]:has(> header)',
      ])
      const composer = rectOfAny([
        '[data-slot="conversation.composer"]',
        '[data-conversation-composer]',
      ])
      const sidebar = rectOfAny(['[data-slot="sidebar"]'])
      const details = rectOfAny(['[data-rightbar-col]', '[data-slot="details"]'])
      const scroll = rectOfAny(['[data-conversation-scroll]'])
      /* 正文列：官方把聊天内容宽度放在 CSS 变量里
         （`--dsh-chat-content-width: min(calc(100% - 32px), 920px)`）。
         注意 [data-conversation-content] 是**全宽**的 body，不是文字列本身 —— 量它会把
         空档算成 0（真机踩过：artZones 变成 0/0，立绘高度 0，表现就是"人物没了"）。
         所以：文字列 = body 居中、宽度取变量里的上限。 */
      const bodyEl = (() => {
        for (const s of ['[data-conversation-content]', '[data-conversation-scroll]']) {
          let el = null
          try { el = document.querySelector(s) } catch { /* 无效选择器 */ }
          if (ownRect(el)) return el
        }
        return null
      })()
      const body = bodyEl ? ownRect(bodyEl) : null
      let textW = null
      if (body && bodyEl) {
        const raw = getComputedStyle(bodyEl).getPropertyValue('--dsh-chat-content-width') || ''
        const px = (raw.match(/([\d.]+)px/g) || []).map((s) => parseFloat(s))
        const cap = px.length ? Math.max.apply(null, px) : null
        textW = cap === null ? Math.min(body.width * 0.6, 920) : Math.min(cap, body.width - 32)
      }

      /* 输入框**卡片**（不是整个停靠区）：皮肤要拿它给输入框描一圈九宫格画框。
         停靠区通常比卡片高得多（还含状态条），量错就会把画框铺到状态条上。 */
      const card = (() => {
        const slot = document.querySelector('[data-slot="conversation.composer"]')
        if (!slot) return null
        const direct = slot.querySelector('[data-composer-card]')
        if (ownRect(direct)) return ownRect(direct)
        for (const c of slot.children) {
          const r = ownRect(c)
          if (r && r.height > 40) return r
        }
        return null
      })()

      const headerH = header ? header.height : FALLBACK.header
      const headerBottom = header ? header.bottom : (titlebar + FALLBACK.header)
      const composerH = composer ? composer.height : FALLBACK.composer
      const composerTop = composer ? composer.top : (vh - FALLBACK.composer)

      // 允许绘制带：会话头下沿 → 输入区上沿；左右各让出侧栏/右栏
      const artTop = Math.max(titlebar, headerBottom)
      const artBottom = Math.max(0, vh - composerTop)
      const sideLeft = sidebar && sidebar.width > 1 ? sidebar.width : 0
      const sideRight = details && details.width > 1 ? details.width : 0

      /* 立绘可用的左右"空档"宽度 = 文字列两侧。
         右侧按**视口**算而不是按右栏算：右栏常是一个透明的浮动面板，
         按它让位会把立绘推到正文上面（真机踩过）。左侧仍按侧栏算 ——
         侧栏保留了磨砂底，美术压在它后面会变暗。 */
      const sane = (v) => (Number.isFinite(v) && v > 8 && v < vw * 2 ? v : null)
      let zoneLeft, zoneRight, contentLeft, contentRight
      if (body && textW && textW > 120) {
        const center = body.left + body.width / 2
        contentLeft = center - textW / 2
        contentRight = center + textW / 2
        if (sane(contentLeft) === null || sane(contentRight) === null) {
          contentLeft = null; contentRight = null
        }
      } else {
        contentLeft = null; contentRight = null
      }
      if (contentLeft !== null) {
        /* 两侧空档都按**可见美术带**算：右栏（详情面板）是真面板，立绘压在它后面就没意义了。
           v2: 早先右侧按视口算，结果右立绘整段落在浮动面板里（真机踩过）。 */
        zoneLeft = Math.max(0, contentLeft - sideLeft)
        zoneRight = Math.max(0, (vw - sideRight) - contentRight)
      } else {
        /* 量不到文字列（空白会话等）→ 把可用带宽对半分 */
        zoneLeft = Math.max(0, (vw - sideLeft - sideRight) / 2)
        zoneRight = zoneLeft
      }

      return {
        vw, vh, titlebar, header, composer, card, sidebar, details, scroll, body, textW,
        contentLeft, contentRight, zoneLeft, zoneRight,
        headerH, composerH, headerRight: headerRightEdge(vw),
        safe: { top: artTop, right: sideRight, bottom: artBottom, left: sideLeft },
        dark: isDark(),
      }
    }

    /* ------------------------------------------------------------- 发布 */
    const written = new Map()
    function setVar(el, name, value) {
      const key = name
      if (written.get(key) === value) return
      written.set(key, value)
      el.style.setProperty(name, value)
    }

    /* --------------------------------------------------------- 引擎实例 */
    function create(ctx) {
      const docEl = document.documentElement
      const subs = new Map()      // key -> element
      let last = null
      let raf = 0
      let mode = 'standard'
      const trusted = new Set()
      /** 订阅者（皮肤用）。引擎已经有一套观察者，皮肤不该再挂第二套。 */
      const refreshSubs = new Set()

      /* --- 样式 --- */
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)

      /* --- 根容器：美术槽 + 衬底层 + 可视化层 --- */
      const root = document.createElement('div')
      root.id = ROOT_ID
      root.setAttribute('data-dsh-safearea-root', '')
      const artSlot = document.createElement('div')
      artSlot.id = ART_ID
      artSlot.setAttribute('data-dsh-art-slot', '')
      const substrate = document.createElement('div')
      substrate.id = SUB_ID
      const viz = document.createElement('div')
      viz.id = VIZ_ID
      root.append(artSlot, substrate, viz)
      document.body.insertBefore(root, document.body.firstChild)

      docEl.setAttribute('data-dsh-safearea', 'on')

      /* --- 衬底 --- */
      function substrateFor(dark) {
        return dark
          ? { top: 'rgba(3,17,34,.62)', mid: 'rgba(3,17,34,.50)' }
          : { top: 'rgba(238,250,255,.66)', mid: 'rgba(238,250,255,.52)' }
      }
      function ensureSub(key, rect, dark, fadeTop) {
        let el = subs.get(key)
        if (!el) {
          el = document.createElement('div')
          el.className = 'sa-sub'
          el.setAttribute('data-safearea-managed', key)
          substrate.appendChild(el)
          subs.set(key, el)
        }
        Object.assign(el.style, {
          left: num(rect.left) + 'px', top: num(rect.top) + 'px',
          width: num(rect.width) + 'px', height: num(rect.height) + 'px',
        })
        const c = substrateFor(dark)
        el.style.background = fadeTop
          ? `linear-gradient(to bottom, ${c.top} 0%, ${c.mid} 74%, rgba(0,0,0,0) 100%)`
          : `linear-gradient(to top, ${c.top} 0%, ${c.mid} 74%, rgba(0,0,0,0) 100%)`
        el.style.display = 'block'
      }
      function hideSub(key) {
        const el = subs.get(key)
        if (el) el.style.display = 'none'
      }

      /* --- 可视化 --- */
      function drawViz(m) {
        viz.textContent = ''
        const push = (label, l, t, w, h) => {
          const box = document.createElement('div')
          box.className = 'sa-viz-box'
          Object.assign(box.style, { left: num(l) + 'px', top: num(t) + 'px', width: num(w) + 'px', height: num(h) + 'px' })
          const tag = document.createElement('div')
          tag.className = 'sa-viz-label'
          tag.textContent = label
          Object.assign(tag.style, { left: num(l) + 'px', top: num(t) + 'px' })
          viz.append(box, tag)
        }
        push('titlebar h=' + num(m.titlebar), 0, 0, m.vw, Math.max(m.titlebar, 1))
        if (m.header) push('header h=' + num(m.headerH), m.header.left, m.header.top, m.header.width, m.header.height)
        push('header-right ← ' + num(m.headerRight), m.headerRight, m.titlebar, Math.max(0, m.vw - m.headerRight), Math.max(m.headerH, 1))
        if (m.composer) push('composer h=' + num(m.composerH), m.composer.left, m.composer.top, m.composer.width, m.composer.height)
        if (m.sidebar && m.sidebar.width > 1) push('sidebar w=' + num(m.sidebar.width), m.sidebar.left, m.sidebar.top, m.sidebar.width, m.sidebar.height)
        if (m.details && m.details.width > 1) push('details w=' + num(m.details.width), m.details.left, m.details.top, m.details.width, m.details.height)
        push('ART BAND', 0, m.safe.top, m.vw, Math.max(0, m.vh - m.safe.top - m.safe.bottom))
      }

      /* --- 一次完整刷新 --- */
      function refresh() {
        raf = 0
        if (document.hidden) return
        const m = measure()
        last = m

        setVar(docEl, '--dsh-viewport-w', num(m.vw) + 'px')
        setVar(docEl, '--dsh-viewport-h', num(m.vh) + 'px')
        setVar(docEl, '--dsh-safe-top', num(m.safe.top) + 'px')
        setVar(docEl, '--dsh-safe-right', num(m.safe.right) + 'px')
        setVar(docEl, '--dsh-safe-bottom', num(m.safe.bottom) + 'px')
        setVar(docEl, '--dsh-safe-left', num(m.safe.left) + 'px')
        setVar(docEl, '--dsh-safe-inset',
          `${num(m.safe.top)}px ${num(m.safe.right)}px ${num(m.safe.bottom)}px ${num(m.safe.left)}px`)
        setVar(docEl, '--dsh-art-top', num(m.safe.top) + 'px')
        setVar(docEl, '--dsh-art-bottom', num(m.safe.bottom) + 'px')
        setVar(docEl, '--dsh-protect-titlebar-height', num(m.titlebar) + 'px')
        setVar(docEl, '--dsh-protect-header-height', num(m.headerH) + 'px')
        setVar(docEl, '--dsh-protect-header-right', num(m.headerRight) + 'px')
        setVar(docEl, '--dsh-protect-composer-height', num(m.composerH) + 'px')
        setVar(docEl, '--dsh-protect-sidebar-width', num(m.safe.left) + 'px')
        setVar(docEl, '--dsh-protect-details-width', num(m.safe.right) + 'px')
        /* 立绘可用空档（皮肤据此定尺寸与位置，避免压住正文） */
        setVar(docEl, '--dsh-art-zone-left', num(m.zoneLeft) + 'px')
        setVar(docEl, '--dsh-art-zone-right', num(m.zoneRight) + 'px')
        setVar(docEl, '--dsh-art-zone-min', num(Math.min(m.zoneLeft, m.zoneRight)) + 'px')
        /* 量到的正文列宽（皮肤可用它做"衬纸宽度 / 空档比例"这类换算） */
        setVar(docEl, '--dsh-art-content-w', num(m.textW ?? 0) + 'px')
        /* 输入框卡片四边（皮肤据此描九宫格画框；量不到时退化成 0，皮肤用兜底值） */
        setVar(docEl, '--dsh-composer-card-left', num(m.card ? m.card.left : 0) + 'px')
        setVar(docEl, '--dsh-composer-card-right-inset', num(m.card ? m.vw - m.card.right : 0) + 'px')
        setVar(docEl, '--dsh-composer-card-bottom', num(m.card ? m.vh - m.card.bottom : 0) + 'px')
        setVar(docEl, '--dsh-composer-card-height', num(m.card ? m.card.height : 0) + 'px')
        if (m.contentLeft !== null) {
          setVar(docEl, '--dsh-protect-content-left', num(m.contentLeft) + 'px')
          setVar(docEl, '--dsh-protect-content-right-inset', num(m.vw - m.contentRight) + 'px')
          setVar(docEl, '--dsh-content-center', num((m.contentLeft + m.contentRight) / 2) + 'px')
        } else {
          setVar(docEl, '--dsh-protect-content-left', num(m.safe.left) + 'px')
          setVar(docEl, '--dsh-protect-content-right-inset', num(m.safe.right) + 'px')
          setVar(docEl, '--dsh-content-center', num(m.vw / 2) + 'px')
        }
        setVar(docEl, '--dsh-substrate', m.dark ? 'rgba(3,17,34,.62)' : 'rgba(238,250,255,.66)')
        docEl.setAttribute('data-dsh-theme', m.dark ? 'dark' : 'light')

        // 衬底：只在顶部带（标题栏 / 会话头）。输入区自带卡片底色，不需要。
        if (mode !== 'off') {
          if (m.titlebar > 1) ensureSub('titlebar', { left: 0, top: 0, width: m.vw, height: m.titlebar + 6 }, m.dark, true)
          else hideSub('titlebar')
          const hb = Math.max(m.headerH, 1)
          ensureSub('header', { left: 0, top: Math.max(0, m.titlebar - 2), width: m.vw, height: m.titlebar + hb + 10 }, m.dark, true)
        } else {
          hideSub('titlebar'); hideSub('header')
        }

        if (viz.dataset.on === 'on') drawViz(m)

        /* 通知订阅者（皮肤据此重算"空会话/有会话"等状态）。
           订阅者异常绝不能影响引擎本身。 */
        for (const cb of refreshSubs) {
          try { cb(m) } catch (err) { console.warn('[dsh-safe-area] refresh 订阅者异常', err) }
        }
      }

      function schedule() {
        if (raf) return
        raf = requestAnimationFrame(refresh)
      }

      /* --- 观察者 --- */
      const ro = new ResizeObserver(schedule)
      const observed = new WeakSet()
      function observeTargets() {
        for (const el of document.querySelectorAll(
          '[data-slot="sidebar"],[data-conversation-header],[data-slot="conversation.composer"],' +
          '[data-rightbar-col],[data-conversation-scroll],[data-shell-overlay]')) {
          if (!observed.has(el)) { observed.add(el); ro.observe(el) }
        }
      }
      const mo = new MutationObserver(() => { observeTargets(); schedule() })
      function startObservers() {
        observeTargets()
        mo.observe(document.documentElement, {
          childList: true, subtree: true,
          attributes: true,
          /* 只盯结构性属性：'class' 全站都在变，不能纳入（会把自己变成热点） */
          attributeFilter: ['data-sidebar-collapsed', 'data-rightbar-collapsed', 'data-sidebar-right-expand',
                            'data-windows-titlebar', 'data-ds-dark-theme'],
        })
        window.addEventListener('resize', schedule)
        document.addEventListener('visibilitychange', onVis)
      }
      function onVis() { if (!document.hidden) schedule() }

      /* --- 自检 --- */
      const ANCHORS = [
        ['shell.overlay', '[data-shell-overlay]'],
        ['shell.leading', '[data-shell-leading]'],
        ['rightbar-col', '[data-rightbar-col]'],
        ['conversation-header', '[data-conversation-header]'],
        ['conversation-scroll', '[data-conversation-scroll]'],
        ['conversation-content', '[data-conversation-content]'],
        ['composer-slot', '[data-slot="conversation.composer"]'],
        ['sidebar-slot', '[data-slot="sidebar"]'],
        ['header-actions', '[data-slot="conversation.session.header.actions"]'],
        ['header-utilities', '[data-slot="conversation.session.header.utilities"]'],
        ['header-corner', '[data-slot="conversation.session.header.corner"]'],
        ['rightbar-expand', '[data-sidebar-right-expand]'],
        ['class-centerCol', '[class*="centerCol"]'],
        ['class-sidebarCol', '[class*="sidebarCol"]'],
        ['class-rightbarCol', '[class*="rightbarCol"]'],
        ['titlebar-el', '.dshDesktopFrameTitlebar'],
      ]

      /** 结构轮廓：把某棵子树里"有尺寸"的元素记成一行（类名/属性/尺寸/底色）。
          皮肤要按"行"铺底，必须知道真实类名 —— 与其猜，不如让引擎量一次写进报告。 */
      function outlineOf(sel, maxDepth, maxRows) {
        let root = null
        try { root = document.querySelector(sel) } catch { /* 无效选择器 */ }
        if (!root) return null
        const rows = []
        const walk = (el, d) => {
          if (d > maxDepth || rows.length >= maxRows) return
          for (const c of el.children) {
            const r = c.getBoundingClientRect()
            if (r.height < 4 && r.width < 4) { walk(c, d); continue }
            const cs = getComputedStyle(c)
            const attrs = []
            for (const a of c.attributes) if (a.name.startsWith('data-')) attrs.push(a.name + '=' + a.value)
            rows.push({
              d,
              tag: c.tagName.toLowerCase(),
              cls: String(c.className || '').replace(/\s+/g, ' ').slice(0, 64),
              data: attrs.join(' ').slice(0, 110),
              wh: Math.round(r.width) + 'x' + Math.round(r.height),
              bg: cs.backgroundColor,
              img: cs.backgroundImage === 'none' ? '' : 'img',
            })
            walk(c, d + 1)
          }
        }
        walk(root, 0)
        return rows
      }

      function report() {
        const m = last || measure()
        const anchors = {}
        for (const [key, sel] of ANCHORS) {
          let el = null
          try { el = document.querySelector(sel) } catch { /* 无效选择器 */ }
          const r = el ? el.getBoundingClientRect() : null
          anchors[key] = el
            ? { found: true, w: Math.round(r.width), h: Math.round(r.height), display: getComputedStyle(el).display }
            : { found: false }
        }
        const out = {
          at: new Date().toISOString(),
          url: window.location?.href ?? document.baseURI,
          baseURI: document.baseURI,
          dpr: window.devicePixelRatio,
          theme: m.dark ? 'dark' : 'light',
          mode,
          viewport: [m.vw, m.vh],
          htmlAttrs: {
            safearea: docEl.getAttribute('data-dsh-safearea'),
            theme: docEl.getAttribute('data-dsh-theme'),
            skin: docEl.getAttribute('data-dsh-skin'),
            skinColumns: docEl.getAttribute('data-dsh-skin-columns'),
            degraded: docEl.getAttribute('data-dsh-skin-degraded'),
            windowsTitlebar: docEl.hasAttribute('data-windows-titlebar'),
            dsDarkTheme: docEl.hasAttribute('data-ds-dark-theme'),
          },
          cssVars: {},
          measured: {
            titlebar: num(m.titlebar), headerH: num(m.headerH), headerRight: num(m.headerRight),
            composerH: num(m.composerH), sidebarW: num(m.safe.left), detailsW: num(m.safe.right),
            composerCard: m.card ? { w: num(m.card.width), h: num(m.card.height), top: num(m.card.top), bottom: num(m.card.bottom) } : null,
            artBand: [num(m.safe.top), num(m.vh - m.safe.bottom)],
            contentColumn: m.contentLeft === null ? null : [num(m.contentLeft), num(m.contentRight)],
            textWidth: m.textW === null ? null : num(m.textW),
            artZones: [num(m.zoneLeft), num(m.zoneRight)],
          },
          anchors,
          hitTest: [],
          violations: [],
          engine: {
            rootPresent: !!document.getElementById(ROOT_ID),
            artSlotChildren: artSlot.childElementCount,
            stylePresent: !!document.getElementById(STYLE_ID),
            substrateRects: subs.size,
          },
          skinState: window.__DSH_SKIN_WHALE_GIRL_STATE__ ?? null,
          outline: {
            conversation: outlineOf('[data-conversation-scroll]', 4, 70),
            sidebar: outlineOf('[data-slot="sidebar"]', 3, 30),
            composer: outlineOf('[data-slot="conversation.composer"]', 3, 24),
          },
        }
        for (const v of ['--dsh-art-top', '--dsh-art-bottom', '--dsh-protect-header-right',
                         '--dsh-protect-sidebar-width', '--dsh-substrate', '--dsh-safe-inset']) {
          out.cssVars[v] = getComputedStyle(docEl).getPropertyValue(v).trim()
        }
        const probes = []
        const add = (label, sel) => { const el = document.querySelector(sel); if (el) probes.push([label, el]) }
        add('右栏展开钮', '[data-sidebar-right-expand]')
        add('会话头 corner', '[data-slot="conversation.session.header.corner"]')
        add('会话头 utilities', '[data-slot="conversation.session.header.utilities"]')
        add('会话头 actions', '[data-slot="conversation.session.header.actions"]')
        add('输入框', '[data-slot="conversation.composer"]')
        add('列宽手柄', '[data-rightbar-col]')
        for (const [label, el] of probes) {
          const r = el.getBoundingClientRect()
          if (r.width < 1 || r.height < 1) continue
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
          const hit = document.elementFromPoint(x, y)
          const ok = !!hit && (hit === el || el.contains(hit) || hit.contains(el))
          out.hitTest.push({ label, x, y, ok, hit: hit ? (hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '')) : null })
          if (!ok) out.violations.push(`${label} 中心点被 ${out.hitTest[out.hitTest.length - 1].hit} 命中`)
        }
        if (artSlot.childElementCount === 0) out.violations.push('美术槽为空（没有皮肤声明美术层）')
        window.__DSH_SAFEAREA_REPORT__ = out
        return out
      }

      /** 把自检报告 POST 给宿主落盘（重启后无需人工开 DevTools）。 */
      async function send() {
        const payload = report()
        try {
          const res = await fetch(new URL('dsh-safe-area/report', document.baseURI).href, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          payload.posted = res.ok
          if (!res.ok) payload.postError = `HTTP ${res.status}`
        } catch (err) {
          payload.posted = false
          payload.postError = String(err)
        }
        window.__DSH_SAFEAREA_REPORT__ = payload
        return payload
      }

      const api = {
        get artRoot() { return artSlot },
        get root() { return root },
        get mode() { return mode },
        rects: () => (last || measure()),
        report,
        setMode(m) { mode = m; schedule(); return mode },
        trust(id) { trusted.add(id) },
        visualize(on) {
          const v = on === undefined ? viz.dataset.on !== 'on' : !!on
          viz.dataset.on = v ? 'on' : 'off'
          root.dataset.viz = v ? 'on' : 'off'
          if (v) drawViz(last || measure())
          else viz.textContent = ''
          return v
        },
        refresh: () => { refresh() },
        send,
        /** 皮肤订阅引擎的重算时机（引擎已在跑观察者，别再挂第二套）。立即回调一次。 */
        onRefresh(cb) {
          refreshSubs.add(cb)
          try { cb(last || measure()) } catch { /* 订阅者异常忽略 */ }
          return () => { refreshSubs.delete(cb) }
        },
      }
      window.dshSafeArea = api

      /* --- 快捷键 Ctrl/Cmd+Shift+S --- */
      function onKey(e) {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
          e.preventDefault(); api.visualize()
        }
      }
      window.addEventListener('keydown', onKey, true)

      /* --- 启动 --- */
      startObservers()
      refresh()
      /* 自动上报一次（界面稳定后）。失败不影响任何显示。 */
      const autoSend = setTimeout(() => { if (!document.hidden) send().catch(() => {}) }, 2500)

      /* --- 还原账本 --- */
      return () => {
        try {
          if (raf) cancelAnimationFrame(raf)
          clearTimeout(autoSend)
          ro.disconnect(); mo.disconnect()
          window.removeEventListener('resize', schedule)
          window.removeEventListener('keydown', onKey, true)
          document.removeEventListener('visibilitychange', onVis)
          root.remove(); style.remove()
          docEl.removeAttribute('data-dsh-safearea')
          docEl.removeAttribute('data-dsh-theme')
          refreshSubs.clear()
          for (const k of written.keys()) docEl.style.removeProperty(k)
          written.clear()
          if (window.dshSafeArea === api) delete window.dshSafeArea
          delete window.__DSH_SAFEAREA_REPORT__
        } catch (err) { /* 卸载阶段绝不再抛 */ }
      }
    }

    /* ------------------------------------------------------------------ apply */
    function apply(ctx) {
      let dispose
      whenBody().then(() => {
        try {
          dispose = create(ctx)
        } catch (err) {
          console.error('[dsh-safe-area] 初始化失败（已降级，不影响 DSH 本体）', err)
          document.documentElement.setAttribute('data-dsh-safearea', 'off')
        }
      })
      ctx.effect(() => () => { if (dispose) dispose() })
    }

    exports.apply = apply
    return module.exports
  },
})
