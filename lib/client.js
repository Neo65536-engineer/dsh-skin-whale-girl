/**
 * dsh-skin-whale-girl —— 浏览器侧（皮肤）。v0.2
 *
 * 本版（v0.2）按用户要求重做视觉方案，核心变化：
 *
 *  ① **左右两张对称立绘**：同一张素材，左侧 `scaleX(-1)` 镜像，分别贴住视口左右两边，
 *     不再被"右栏浮动面板"挤走，也不再退化成"中间一张"。
 *  ② **文字区加白底**（"背景图不挡字"）：正文列铺一层**受控衬纸**（theme-aware 半透明），
 *     立绘即使伸到正文列下面，文字依旧清楚 —— 这是"美术随便画、文字有底"的分工。
 *  ③ **随窗口动态缩放**：立绘高度由 vh / vw / 可用美术带共同决定，用 clamp 连续变化，
 *     不做"档位跳变"；窗口太窄（<960px）或空档 <110px 时才退到"中间下部一张"的退路。
 *  ④ **Q 版**：搬到**侧栏中下部**当吉祥物（坐在侧栏底部导航块上方），带极轻的浮动动画，
 *     侧栏收成轨道（<170px）时自动隐藏。
 *  ⑤ **花边**：不再是 1px 金线（看不见），改成三件套 —— 顶部蕾丝带 + 底部蕾丝带 + 角花，
 *     外加**输入框九宫格描金画框**（`border-image` + 内联 SVG，零字节、任意高度不变形）。
 *
 * 仍然遵守 v0.1 定下的硬约束：
 *  - 美术层在官方 UI **之下**（挂进 dsh-safe-area 的美术槽；引擎不在也自己 prepend 到 body）
 *  - 不改官方 z-index；不使用 shell.overlay
 *  - 官方不透明大面 → 半透明化（可还原，带还原账本）
 *  - 全部几何优先取引擎发布的 CSS 变量，引擎缺席时用兜底值照常显示
 */
window.__ModuleLoader__.load({
  id: 'dsh-skin-whale-girl',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    exports.name = 'dsh-skin-whale-girl'
    exports.inject = []

    const VERSION = '0.2.0'
    const ROOT_ID = 'dsh-skin-whale-girl'
    const STYLE_ID = 'dsh-skin-whale-girl-style'
    const ASSET_DIR = 'skin-assets/whale-girl/'
    const SKIN_KEY = 'whale-girl'

    /* 素材兜底名单（manifest 取不到时仍能显示） */
    const ASSETS = {
      'bg-night': 'bg-night.webp',
      'bg-day': 'bg-day.webp',
      'char': 'char.webp',
      'half': 'half.webp',
      'chibi-idle': 'chibi-idle.webp',
      'chibi-think': 'chibi-think.webp',
      'chibi-done': 'chibi-done.webp',
    }

    /**
     * ── 可调参数（都在这里，改一个数字就能重调构图）─────────────────────────
     * 高度公式：charH = clamp(FLOOR, min(vh*VH, vw*VW, band*BAND), CEIL)
     *   band = 可用美术带高 = 100vh - art-top - art-bottom
     */
    const TUNE = {
      /** 高度 ≈ 视口的 2/3（头不顶到顶），上下限 900 / 450（下限=上限的一半） */
      char: { vh: 0.66, band: 0.86, floor: 450, ceil: 900, sink: 0.012 },
      compact: { vh: 0.34, floor: 300, ceil: 460 },
      /** 正文列目标宽度（同时写进官方 --dsh-chat-content-width，撑出左右空档） */
      chatWidth: 'clamp(600px, 42vw, 820px)',
      railBelow: 170,
      /** 只有窗口**真的很窄**时才退成"中间一张"；右栏开合不再触发退路 */
      compactBelowVw: 620,
    }

    /**
     * 侧栏/右栏的底：用**横向渐变**而不是一块实底。
     * 实底会在"侧栏右边界"处留一道硬边；但太透（早先 .72→0）又会让工作区文字糊在背景图上。
     * 现在把主体提到 .90/.84、只在最后 12% 收到 .62 —— 文字稳了，交界也还是软的。
     */
    const COLUMN_GRADIENT = {
      dark: {
        left: 'linear-gradient(to right, rgba(5,18,38,.90) 0%, rgba(5,18,38,.84) 88%, rgba(5,18,38,.60) 100%)',
        right: 'linear-gradient(to left, rgba(5,18,38,.90) 0%, rgba(5,18,38,.84) 88%, rgba(5,18,38,.60) 100%)',
      },
      light: {
        left: 'linear-gradient(to right, rgba(240,251,255,.92) 0%, rgba(240,251,255,.86) 88%, rgba(240,251,255,.62) 100%)',
        right: 'linear-gradient(to left, rgba(240,251,255,.92) 0%, rgba(240,251,255,.86) 88%, rgba(240,251,255,.62) 100%)',
      },
    }

    /* ------------------------------------------------------------ 程序化装饰 */
    const svgUrl = (w, h, body) =>
      `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}")`

    /* 装饰有两套配色。为什么必须两套：
       亮色主题下衬纸是白的，**白色蕾丝会糊在白底上等于没画**（真机踩过）；
       所以亮色用深金 + 深蓝灰，暗色反过来用亮金 + 亮蓝。 */
    const PAL = {
      light: { gold: '#b8913c', goldSoft: 'rgba(184,145,60,.60)', lace: 'rgba(88,120,164,.72)', fill: 'rgba(126,160,206,.20)' },
      dark: { gold: '#e8c98c', goldSoft: 'rgba(232,201,140,.58)', lace: 'rgba(198,218,255,.66)', fill: 'rgba(180,208,255,.16)' },
    }

    /* 顶部蕾丝：一条金线 + 一排扇贝 + 金珠（横向平铺，128 一格） */
    const laceTop = (p) => svgUrl(128, 34,
      `<path d="M0 3H128" stroke="${p.gold}" stroke-width="1.3" fill="none" opacity=".95"/>` +
      `<path d="M0 7Q16 31 32 7Q48 31 64 7Q80 31 96 7Q112 31 128 7" fill="${p.fill}" stroke="${p.lace}" stroke-width="1.15"/>` +
      `<circle cx="16" cy="6" r="1.8" fill="${p.gold}"/><circle cx="48" cy="6" r="1.8" fill="${p.gold}"/>` +
      `<circle cx="80" cy="6" r="1.8" fill="${p.gold}"/><circle cx="112" cy="6" r="1.8" fill="${p.gold}"/>` +
      `<circle cx="32" cy="1.6" r="1.3" fill="${p.gold}" opacity=".85"/>` +
      `<circle cx="64" cy="1.6" r="1.3" fill="${p.gold}" opacity=".85"/>` +
      `<circle cx="96" cy="1.6" r="1.3" fill="${p.gold}" opacity=".85"/>`)

    /* 底部蕾丝：上下镜像（扇贝朝上） */
    const laceBottom = (p) => svgUrl(128, 34,
      `<path d="M0 31H128" stroke="${p.gold}" stroke-width="1.3" fill="none" opacity=".95"/>` +
      `<path d="M0 27Q16 3 32 27Q48 3 64 27Q80 3 96 27Q112 3 128 27" fill="${p.fill}" stroke="${p.lace}" stroke-width="1.15"/>` +
      `<circle cx="16" cy="28" r="1.8" fill="${p.gold}"/><circle cx="48" cy="28" r="1.8" fill="${p.gold}"/>` +
      `<circle cx="80" cy="28" r="1.8" fill="${p.gold}"/><circle cx="112" cy="28" r="1.8" fill="${p.gold}"/>` +
      `<circle cx="32" cy="32.4" r="1.3" fill="${p.gold}" opacity=".85"/>` +
      `<circle cx="64" cy="32.4" r="1.3" fill="${p.gold}" opacity=".85"/>` +
      `<circle cx="96" cy="32.4" r="1.3" fill="${p.gold}" opacity=".85"/>`)

    /* 角花：蕾丝两端的收头（左端开口向右，右端镜像） */
    const cornerLeft = (p) => svgUrl(76, 40,
      `<path d="M0 3H44" stroke="${p.gold}" stroke-width="1.3" fill="none" opacity=".95"/>` +
      `<path d="M44 3c9 0 15 6 18 12-6-1-11 0-14 5-3-5-4-11-4-17z" fill="${p.fill}" stroke="${p.lace}" stroke-width="1.1"/>` +
      `<path d="M0 3C0 18 6 26 18 30" fill="none" stroke="${p.goldSoft}" stroke-width="1.1"/>` +
      `<circle cx="12" cy="6" r="1.8" fill="${p.gold}"/><circle cx="30" cy="6" r="1.8" fill="${p.gold}"/>` +
      `<path d="M52 24a6 6 0 1 0 6-6" fill="none" stroke="${p.lace}" stroke-width="1.1"/>`)

    const cornerRight = (p) => svgUrl(76, 40,
      `<path d="M76 3H32" stroke="${p.gold}" stroke-width="1.3" fill="none" opacity=".95"/>` +
      `<path d="M32 3c-9 0-15 6-18 12 6-1 11 0 14 5 3-5 4-11 4-17z" fill="${p.fill}" stroke="${p.lace}" stroke-width="1.1"/>` +
      `<path d="M76 3C76 18 70 26 58 30" fill="none" stroke="${p.goldSoft}" stroke-width="1.1"/>` +
      `<circle cx="64" cy="6" r="1.8" fill="${p.gold}"/><circle cx="46" cy="6" r="1.8" fill="${p.gold}"/>` +
      `<path d="M24 24a6 6 0 1 1-6-6" fill="none" stroke="${p.lace}" stroke-width="1.1"/>`)

    /**
     * 输入框九宫格画框（96×96，切 30px）：
     * 四角是卷草纹，四边只有两条平行线 —— 只有"线"的部分会被拉伸，
     * 所以画框在任意宽高下都不变形。中间不 fill，输入框本身照旧可见。
     */
    const frameArt = (p) => svgUrl(96, 96,
      `<path d="M30 3H66M30 93H66M3 30V66M93 30V66" fill="none" stroke="${p.gold}" stroke-width="1.5" opacity=".95"/>` +
      `<path d="M30 11H66M30 85H66M11 30V66M85 30V66" fill="none" stroke="${p.lace}" stroke-width="1" opacity=".8"/>` +
      `<path d="M3 30V21a18 18 0 0 1 18-18h9" fill="none" stroke="${p.gold}" stroke-width="1.5" opacity=".95"/>` +
      `<path d="M93 30V21a18 18 0 0 0-18-18h-9" fill="none" stroke="${p.gold}" stroke-width="1.5" opacity=".95"/>` +
      `<path d="M3 66v9a18 18 0 0 0 18 18h9" fill="none" stroke="${p.gold}" stroke-width="1.5" opacity=".95"/>` +
      `<path d="M93 66v9a18 18 0 0 1-18 18h-9" fill="none" stroke="${p.gold}" stroke-width="1.5" opacity=".95"/>` +
      `<path d="M11 30v-7a12 12 0 0 1 12-12h7" fill="none" stroke="${p.lace}" stroke-width="1" opacity=".8"/>` +
      `<path d="M85 30v-7a12 12 0 0 0-12-12h-7" fill="none" stroke="${p.lace}" stroke-width="1" opacity=".8"/>` +
      `<path d="M11 66v7a12 12 0 0 0 12 12h7" fill="none" stroke="${p.lace}" stroke-width="1" opacity=".8"/>` +
      `<path d="M85 66v7a12 12 0 0 1-12 12h-7" fill="none" stroke="${p.lace}" stroke-width="1" opacity=".8"/>` +
      `<circle cx="15" cy="15" r="2.2" fill="${p.gold}"/><circle cx="81" cy="15" r="2.2" fill="${p.gold}"/>` +
      `<circle cx="15" cy="81" r="2.2" fill="${p.gold}"/><circle cx="81" cy="81" r="2.2" fill="${p.gold}"/>` +
      `<path d="M22 15a7 7 0 0 1 7-7M74 15a7 7 0 0 0-7-7M22 81a7 7 0 0 0 7 7M74 81a7 7 0 0 1-7 7" fill="none" stroke="${p.goldSoft}" stroke-width=".95"/>` +
      `<path d="M48 1.5l3 3-3 3-3-3z" fill="${p.gold}"/>` +
      `<path d="M48 88.5l3 3-3 3-3-3z" fill="${p.gold}"/>`)

    /* 侧栏分隔饰线：一条金线 + 中间菱形（Q 版脚下那条"架子"） */
    const sideRule = (p) => svgUrl(240, 22,
      `<path d="M0 11H96M144 11H240" stroke="${p.goldSoft}" stroke-width="1" fill="none"/>` +
      `<path d="M120 3l8 8-8 8-8-8z" fill="none" stroke="${p.gold}" stroke-width="1.1"/>` +
      `<circle cx="120" cy="11" r="2" fill="${p.gold}"/>` +
      `<path d="M96 11c6 0 8-4 12-6M144 11c-6 0-8-4-12-6" fill="none" stroke="${p.lace}" stroke-width="1"/>`)

    const DECO = {
      light: { top: laceTop(PAL.light), bottom: laceBottom(PAL.light), cl: cornerLeft(PAL.light),
               cr: cornerRight(PAL.light), frame: frameArt(PAL.light), rule: sideRule(PAL.light) },
      dark: { top: laceTop(PAL.dark), bottom: laceBottom(PAL.dark), cl: cornerLeft(PAL.dark),
              cr: cornerRight(PAL.dark), frame: frameArt(PAL.dark), rule: sideRule(PAL.dark) },
    }
    const DECO_VARS = (t) => `
  --wgs-deco-top-${t}:${DECO[t].top};--wgs-deco-bottom-${t}:${DECO[t].bottom};
  --wgs-deco-cl-${t}:${DECO[t].cl};--wgs-deco-cr-${t}:${DECO[t].cr};
  --wgs-deco-frame-${t}:${DECO[t].frame};--wgs-deco-rule-${t}:${DECO[t].rule};`

    /* ------------------------------------------------------------------ CSS */
    const CSS = `
#${ROOT_ID}{position:absolute;inset:0;pointer-events:none;z-index:0}
#${ROOT_ID} .wgs-layer{position:absolute;inset:0;pointer-events:none}

/* 装饰配色两套。默认（无主题信号 / 暗色）走亮金；亮色主题换成深金 —— 否则白蕾丝
   画在白衬纸上等于没画（真机踩过）。 */
#${ROOT_ID}{${DECO_VARS('dark')}
  --wgs-lace-top:var(--wgs-deco-top-dark);
  --wgs-lace-bottom:var(--wgs-deco-bottom-dark);
  --wgs-corner-l:var(--wgs-deco-cl-dark);
  --wgs-corner-r:var(--wgs-deco-cr-dark);
  --wgs-deco-frame:var(--wgs-deco-frame-dark)}
:is(html[data-dsh-theme="light"],html[data-ds-light-theme],body[data-ds-light-theme]) #${ROOT_ID}{${DECO_VARS('light')}
  --wgs-lace-top:var(--wgs-deco-top-light);
  --wgs-lace-bottom:var(--wgs-deco-bottom-light);
  --wgs-corner-l:var(--wgs-deco-cl-light);
  --wgs-corner-r:var(--wgs-deco-cr-light);
  --wgs-deco-frame:var(--wgs-deco-frame-light)}
/* ⚠ 必须有 position+inset：否则这是两个静态 div，高度为 0，背景图会画进零高盒子里 */
#${ROOT_ID} .wgs-bg{position:absolute;inset:0;
  background-size:cover;background-position:center center;background-repeat:no-repeat;
  opacity:0;transition:opacity .55s ease}
#${ROOT_ID} .wgs-bg--night{background-image:var(--wgs-bg-night)}
#${ROOT_ID} .wgs-bg--day{background-image:var(--wgs-bg-day)}
/* 昼夜两张背景叠着。**每一条判据都要成对写**：点亮一张的同时把另一张明确压成 0。
   只写"点亮"是不够的 —— 真机上 <html> 可能同时挂着 data-ds-light-theme 与
   data-ds-dark-theme（本机实测就是这样），此时"点亮 day"的规则会把夜色盖掉，
   表现就是"切了深色主题还是白昼图 = 切不到黑夜"。这是本 bug 的根因。 */
html[data-dsh-theme="dark"] #${ROOT_ID} .wgs-bg--night,
html[data-ds-dark-theme] #${ROOT_ID} .wgs-bg--night,
body[data-ds-dark-theme] #${ROOT_ID} .wgs-bg--night{opacity:1}
html[data-dsh-theme="dark"] #${ROOT_ID} .wgs-bg--day,
html[data-ds-dark-theme] #${ROOT_ID} .wgs-bg--day,
body[data-ds-dark-theme] #${ROOT_ID} .wgs-bg--day{opacity:0}
html[data-dsh-theme="light"] #${ROOT_ID} .wgs-bg--day,
html[data-ds-light-theme]:not([data-ds-dark-theme]) #${ROOT_ID} .wgs-bg--day,
body[data-ds-light-theme]:not([data-ds-dark-theme]) #${ROOT_ID} .wgs-bg--day{opacity:1}
html[data-dsh-theme="light"] #${ROOT_ID} .wgs-bg--night,
html[data-ds-light-theme]:not([data-ds-dark-theme]) #${ROOT_ID} .wgs-bg--night,
body[data-ds-light-theme]:not([data-ds-dark-theme]) #${ROOT_ID} .wgs-bg--night{opacity:0}
/* 什么信号都没有（引擎也不在岗）→ 跟随系统 */
@media (prefers-color-scheme: dark){
  html:not([data-dsh-theme]):not([data-ds-dark-theme]):not([data-ds-light-theme]) #${ROOT_ID} .wgs-bg--night{opacity:1}}
@media (prefers-color-scheme: light){
  html:not([data-dsh-theme]):not([data-ds-dark-theme]):not([data-ds-light-theme]) #${ROOT_ID} .wgs-bg--day{opacity:1}}
/* 亮色主题下官方 UI 本身就白，底图再亮就"看不见皮肤"了 —— 轻微压暗一档拉开层次 */
html[data-dsh-theme="light"] #${ROOT_ID} .wgs-bg{filter:brightness(.955) saturate(1.07)}

/* ============================ 立绘（左右对称 + 动态缩放）============================ */
#${ROOT_ID}{
  --wgs-band-h:calc(100vh - var(--dsh-art-top,76px) - var(--dsh-art-bottom,170px));
  /* 高度只跟"窗口"走：92vh 与可用美术带取小，再夹上下限 —— 窗口一变就连续变。
     **不再**用正文列空档当上限：那样右栏一开空档变小，立绘就缩到看不见了。 */
  --wgs-char-h:clamp(${TUNE.char.floor}px,
      min(calc(100vh * ${TUNE.char.vh}), calc(var(--wgs-band-h) * ${TUNE.char.band})),
      ${TUNE.char.ceil}px);
}
#${ROOT_ID} .wgs-char{position:absolute;width:auto;object-fit:contain;
  height:var(--wgs-char-h);
  bottom:calc(var(--dsh-art-bottom,170px) - 100vh * ${TUNE.char.sink});
  opacity:0;transition:opacity .7s ease, height .3s ease}
/* 左：紧贴侧栏右边（侧栏是半透明的，立绘从它后面透出来）；右：贴视口最右。
   同一张素材，左侧水平镜像 —— 这就是"一张图左右对称"。 */
#${ROOT_ID} .wgs-char--left{left:var(--dsh-protect-sidebar-width,0px);transform:scaleX(-1)}
#${ROOT_ID} .wgs-char--right{right:0}
html[data-dsh-theme="dark"] #${ROOT_ID} .wgs-char{filter:drop-shadow(0 10px 30px rgba(0,0,0,.55))}
html[data-dsh-theme="light"] #${ROOT_ID} .wgs-char{
  filter:drop-shadow(0 5px 16px rgba(9,44,78,.50)) drop-shadow(0 1px 2px rgba(9,44,78,.45)) brightness(.97) saturate(1.03)}

/* 退路：窗口太窄 / 空档太小 → 只留一张，放到中间下部（在文字之下，靠衬纸保证不遮挡） */
#${ROOT_ID}[data-place="compact"] .wgs-char--left{opacity:0!important}
#${ROOT_ID}[data-place="compact"] .wgs-char--right{
  left:var(--dsh-content-center,50vw);right:auto;transform:translateX(-50%);
  height:clamp(${TUNE.compact.floor}px, 100vh * ${TUNE.compact.vh}, ${TUNE.compact.ceil}px)}
html[data-dsh-theme="dark"] #${ROOT_ID}[data-place="compact"] .wgs-char--right{opacity:.42!important}
html[data-dsh-theme="light"] #${ROOT_ID}[data-place="compact"] .wgs-char--right{opacity:.78!important}

/* ============================ 正文白底：两层（方案 1c）============================
   问题（用户实测）：白底原来挂在 div[class*=markdown] 这一个盒子上，而官方会给它
   设宽度上限；**比它宽的东西就露在白底外面** —— 对比表那种"单元格不换行"的整表、
   或者压根不是它子节点的兄弟块。真机上就是表格最右一列挂在背景上（夜色下直接看不见）。

   1c 的解法分两层：
     ① **浅底**（.40 / .48）：皮肤自己画一条**正文列宽**的"地板"，从美术带顶铺到底。
        任何"跑出卡片"的内容至少落在这层上，不会裸奔在背景图上。
        为什么不用"官方行"当这层：行的盒子可能是**整个中栏宽**（= 会把两侧立绘整片压住），
        而正文列的宽度是引擎量出来的、可靠的。
     ② **实底**（.90 / .86）：正文块 / 代码块 / 表格 / 卡片**各自**按自己的盒子铺满。
        关键点：表格即使比容器宽，**它自己的背景也跟它一起宽**，所以最右一列也有底。 */
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="markdown"],
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="assistantStep"],
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="MessageItem"] [class*="body"],
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] pre,
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] table,
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="codeBlock"],
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="CodeCard"]{
  background-color:rgba(255,255,255,.90);
  border-radius:16px;
  /* box-shadow 做"视觉内边距"：不影响官方布局，却能给文字留出呼吸边 */
  box-shadow:0 0 0 12px rgba(255,255,255,.90)}
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="markdown"],
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="assistantStep"],
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] pre,
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] table,
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="codeBlock"],
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="CodeCard"],
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="markdown"],
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="assistantStep"],
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] pre,
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] table,
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="codeBlock"],
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] [class*="CodeCard"]{
  background-color:rgba(9,23,44,.86);
  box-shadow:0 0 0 12px rgba(9,23,44,.86)}

/* ① 浅底"地板"本体 —— 正文列宽、铺满美术带，坐在**立绘之上**、正文之下 */
#${ROOT_ID} .wgs-floor{position:absolute;
  left:var(--dsh-protect-content-left,0px);
  right:var(--dsh-protect-content-right-inset,0px);
  top:calc(var(--dsh-art-top,76px) + 6px);
  bottom:calc(var(--dsh-art-bottom,170px) - 6px);
  border-radius:20px;background:rgba(255,255,255,.40);
  opacity:0;transition:opacity .5s ease}
html[data-dsh-theme="dark"] #${ROOT_ID} .wgs-floor,
body[data-ds-dark-theme] #${ROOT_ID} .wgs-floor{background:rgba(9,23,44,.48)}
/* 空白会话(landing)：正文列让位给半身像，不要地板 */
#${ROOT_ID}[data-hero="1"] .wgs-floor{opacity:0!important}

/* 非正文行（思考 / 调用工具 / 已编辑…）在浅底之上再抬一档，保持和正文输出的层次区分 */
html[data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] > *:not(:has([class*="markdown"])){
  background-color:rgba(255,255,255,.46);
  border-radius:14px;
  box-shadow:0 0 0 10px rgba(255,255,255,.46)}
html[data-dsh-theme="dark"][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] > *:not(:has([class*="markdown"])),
body[data-ds-dark-theme][data-dsh-skin="${SKIN_KEY}"] [data-chat-flow] > *:not(:has([class*="markdown"])){
  background-color:rgba(9,23,44,.52);
  box-shadow:0 0 0 10px rgba(9,23,44,.52)}

/* ============================ 花边：顶部/底部蕾丝 + 角花 ============================ */
#${ROOT_ID} .wgs-frieze{position:absolute;height:34px;background-repeat:repeat-x;
  background-size:auto 34px;opacity:0;transition:opacity .7s ease;
  left:var(--dsh-protect-content-left,0px);right:var(--dsh-protect-content-right-inset,0px)}
#${ROOT_ID} .wgs-frieze--top{top:var(--dsh-art-top,76px);background-image:var(--wgs-lace-top)}
#${ROOT_ID} .wgs-frieze--bottom{bottom:calc(var(--dsh-art-bottom,170px) - 20px);background-image:var(--wgs-lace-bottom)}
#${ROOT_ID} .wgs-corner{position:absolute;top:var(--dsh-art-top,76px);width:76px;height:40px;
  background-repeat:no-repeat;background-size:contain;opacity:0;transition:opacity .7s ease}
#${ROOT_ID} .wgs-corner--left{left:var(--dsh-protect-content-left,0px);background-image:var(--wgs-corner-l)}
#${ROOT_ID} .wgs-corner--right{right:var(--dsh-protect-content-right-inset,0px);background-image:var(--wgs-corner-r)}

/* 输入框画框：九宫格 border-image —— 只有直线段被拉伸，四角花纹在任何高度都不变形。
   位置直接吃引擎量到的**输入框卡片**四边（不是整个停靠区），所以画框正好贴在输入框上。 */
#${ROOT_ID} .wgs-composer-frame{position:absolute;
  left:calc(var(--dsh-composer-card-left,0px) - 18px);
  right:calc(var(--dsh-composer-card-right-inset,0px) - 18px);
  bottom:calc(var(--dsh-composer-card-bottom,0px) - 14px);
  height:calc(var(--dsh-composer-card-height,0px) + 28px);
  min-height:64px;
  border-style:solid;border-width:26px;box-sizing:border-box;
  /* border-color 必须显式给透明：万一 border-image 没生效，solid 边框会以 currentColor
     画出一圈 **黑色** 粗框（真机风险）。透明则最坏情况只是"没有画框"。 */
  border-color:transparent;
  border-image-source:var(--wgs-deco-frame);
  border-image-slice:30;border-image-width:26px;border-image-repeat:stretch;
  opacity:0;transition:opacity .7s ease}
/* 引擎没量到输入框卡片时（引擎缺席/结构变了）→ 退化成"框正文列下部" */
#${ROOT_ID}[data-card="0"] .wgs-composer-frame{
  left:calc(var(--dsh-protect-content-left,0px) - 18px);
  right:calc(var(--dsh-protect-content-right-inset,0px) - 18px);
  bottom:calc(var(--dsh-art-bottom,170px) - 6px);
  height:clamp(72px, calc(var(--dsh-protect-composer-height,152px) - 42px), 220px)}

/* ============================ Q 版（侧栏吉祥物）============================
   关键：贴进**侧栏自己的 DOM**，坐在侧栏底色**之上**。
   留在美术层里会被侧栏那层白底压成一层雾 —— 真机踩过：侧栏加白底后 Q 版几乎看不见。
   元素挂在 html[data-dsh-skin] 作用域下（不带 #ROOT 前缀），因为挂进侧栏后它就在 #ROOT 之外了。 */
html[data-dsh-skin="${SKIN_KEY}"] .wgs-mascot{position:absolute;left:50%;transform:translateX(-50%);
  bottom:clamp(96px, 13vh, 180px);width:min(210px, 56%);aspect-ratio:1 / 1;z-index:3;pointer-events:none;
  filter:drop-shadow(0 8px 18px rgba(0,0,0,.38));
  animation:wgs-bob 5.2s ease-in-out infinite}
/* 三张 Q 版叠在一起做交叉淡入 —— 换表情不会闪一下白，也不会有加载空档 */
html[data-dsh-skin="${SKIN_KEY}"] .wgs-mascot img{position:absolute;inset:0;width:100%;height:100%;
  object-fit:contain;opacity:0;transition:opacity .5s ease}
html[data-dsh-skin="${SKIN_KEY}"] .wgs-mascot img.wgs-on{opacity:1}
@keyframes wgs-bob{0%,100%{margin-bottom:0}50%{margin-bottom:9px}}
/* 侧栏收成轨道时藏起来（否则会跑到屏幕外） */
html[data-dsh-skin="${SKIN_KEY}"][data-dsh-rail="1"] .wgs-mascot{display:none}

/* ============================ 空白会话(landing)的半身像 ============================ */
#${ROOT_ID} .wgs-half{position:absolute;right:0;
  bottom:calc(var(--dsh-art-bottom,170px) - 100vh * ${TUNE.char.sink});
  width:auto;object-fit:contain;
  height:min(calc(var(--wgs-band-h) * 1.06), 58vh, ${TUNE.char.ceil}px);
  opacity:0;transition:opacity .7s ease}
#${ROOT_ID}[data-hero="1"] .wgs-half{opacity:.97}
#${ROOT_ID}[data-hero="1"] .wgs-char--right{opacity:0!important}
html[data-dsh-theme="dark"] #${ROOT_ID} .wgs-half{filter:drop-shadow(0 12px 34px rgba(0,0,0,.55))}
html[data-dsh-theme="light"] #${ROOT_ID} .wgs-half{
  filter:drop-shadow(0 6px 18px rgba(9,44,78,.5)) drop-shadow(0 1px 2px rgba(9,44,78,.45)) brightness(.97)}

/* ============================ 揭示 ============================ */
html[data-dsh-skin="${SKIN_KEY}"] #${ROOT_ID} .wgs-char{opacity:.98}
html[data-dsh-skin="${SKIN_KEY}"] #${ROOT_ID} .wgs-floor{opacity:1}
/* ⚠ 背景**不能**在这里一律设成 1：昼夜两张图会同时可见，白昼那张压在夜色上
   → 暗色主题永远显示白昼图（v0.1 真机 bug，v0.2 修）。按主题各揭各的。 */
/* 昼夜由上面的「成对判据」统一决定（点一张必压另一张），这里只留手动覆盖。 */
/* 手动指定昼夜：优先级最高（Ctrl+Alt+N 循环 跟随主题 → 夜 → 昼） */
#${ROOT_ID}[data-backdrop="night"] .wgs-bg--night{opacity:1!important}
#${ROOT_ID}[data-backdrop="night"] .wgs-bg--day{opacity:0!important}
#${ROOT_ID}[data-backdrop="day"] .wgs-bg--day{opacity:1!important}
#${ROOT_ID}[data-backdrop="day"] .wgs-bg--night{opacity:0!important}
html[data-dsh-skin="${SKIN_KEY}"] #${ROOT_ID} .wgs-frieze{opacity:.92}
html[data-dsh-skin="${SKIN_KEY}"] #${ROOT_ID} .wgs-corner{opacity:.95}
html[data-dsh-skin="${SKIN_KEY}"] #${ROOT_ID} .wgs-composer-frame{opacity:.95}
html[data-dsh-skin="${SKIN_KEY}"] #${ROOT_ID} .wgs-frieze--bottom{opacity:.8}

/* ============================ 官方表面适配 ============================ */
/* ① 【主手段】直接改官方 token —— 比逐个抓 class 稳得多（class 带哈希前缀，换版本就失效）。
   依据 dsh-client-ui-theme 在 2.0.15 里的定义，这两个 token 覆盖了**整个结构外壳**：
     --dsw-alias-bg-base        → <body> / AppFrame / [data-windows-titlebar] frame + ::before /
                                  会话根 ConversationRoot / 右栏 dock tabHost / dockScrim /
                                  **会话底部的 composerSeat 渐变**（"下面那条白带"的元凶）
     --dsw-specific-sidebar-fill → 左栏 sidebarCol / 侧栏 root /（含它底部那块"没有自己底色"的
                                  插件市场·远程控制区 —— 它一直是白的就是因为共用这一个 fill）
   取 transparent：这些面都跨在立绘上方，只要给一点点白就会把立绘糊掉；
   文字可读性交给下面的"正文衬纸"+ 侧栏渐变，不靠这些结构层。
   用 !important：官方插件 CSS 是运行时注入的，可能排在我们后面。 */
html[data-dsh-skin="${SKIN_KEY}"]{
  --dsw-alias-bg-base:transparent!important;
  --dsw-specific-sidebar-fill:transparent!important}
body[data-dsh-skin="${SKIN_KEY}"]{
  --dsw-alias-bg-base:transparent!important;
  --dsw-specific-sidebar-fill:transparent!important}
body[data-dsh-skin="${SKIN_KEY}"][data-ds-dark-theme]{
  --dsw-alias-bg-base:transparent!important;
  --dsw-specific-sidebar-fill:transparent!important}
/* ③ 会话底部那条 36px 的粘性渐变（composerSeat）明确压掉。
      它内部用 color-mix 又包了一层 --dsw-alias-bg-base，token 改动未必能完全吃住
      （真机这次就没吃住，"最下面还是白的"），所以再钉一条。 */
html[data-dsh-skin="${SKIN_KEY}"] [class*="composerSeat"]{background:transparent!important}
/* ② 应用根节点透明（官方 UI 照常画在美术之上，靠 DOM 顺序；不碰 z-index） */
html[data-dsh-skin="${SKIN_KEY}"] #root{background:transparent!important}
html[data-dsh-skin="${SKIN_KEY}"] [data-slot="root"]{background:transparent!important}
/* frame 的 ::before 是 Windows 标题栏拖拽条；它吃 --dsw-specific-sidebar-fill，
   为防上面那条 !important 被官方更靠后的规则盖掉，这里再钉一次。 */
html[data-dsh-skin="${SKIN_KEY}"] [data-wgs-frame]::before{background:transparent!important}
/* ② 正文列收窄 → 两侧空档变大，立绘才有地方站（官方自己也是读这个变量定宽度）
      三个位置都写一遍：官方可能定义在 html / body / 正文容器任意一层，
      我们必须在**它那一层或更近**覆盖，引擎量到的值与真实渲染才会一致。 */
html[data-dsh-skin="${SKIN_KEY}"]{--dsh-chat-content-width:${TUNE.chatWidth}}
html[data-dsh-skin="${SKIN_KEY}"] body{--dsh-chat-content-width:${TUNE.chatWidth}}
html[data-dsh-skin="${SKIN_KEY}"] [data-conversation-content],
html[data-dsh-skin="${SKIN_KEY}"] [data-conversation-scroll]{--dsh-chat-content-width:${TUNE.chatWidth}!important}
`

    /* ----------------------------------------------------------------- 工具 */
    const whenBody = () => document.body ? Promise.resolve() : new Promise((res) => {
      const mo = new MutationObserver(() => { if (document.body) { mo.disconnect(); res() } })
      mo.observe(document.documentElement, { childList: true })
    })

    const isDark = () => {
      const de = document.documentElement
      if (de.hasAttribute('data-ds-dark-theme') || document.body?.hasAttribute('data-ds-dark-theme')) return true
      if (de.hasAttribute('data-ds-light-theme')) return false
      const t = de.getAttribute('data-dsh-theme')
      if (t === 'dark') return true
      if (t === 'light') return false
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
    }

    /** 等引擎就位（最多 ms 毫秒）；引擎不在也照常显示。 */
    async function waitEngine(ms) {
      const t0 = Date.now()
      while (Date.now() - t0 < ms) {
        if (window.dshSafeArea?.artRoot) return window.dshSafeArea
        await new Promise((r) => setTimeout(r, 80))
      }
      return window.dshSafeArea ?? null
    }

    function preload(src) {
      return new Promise((res) => {
        const img = new Image()
        img.onload = () => res(true)
        img.onerror = () => res(false)
        img.src = src
      })
    }

    const nums = (k, fallback = 0) => {
      const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k))
      return Number.isFinite(v) ? v : fallback
    }

    /* --------------------------------------------- 让官方底色变透（可还原） */
    function climbTo(el, parent) {
      let cur = el
      while (cur && cur.parentElement && cur.parentElement !== parent) cur = cur.parentElement
      return cur && cur.parentElement === parent ? cur : null
    }

    /** 清理与取证共用的排除规则：对话框/菜单/弹层/官方浮层/输入区/我们自己的容器。 */
    function skipChrome(el) {
      return el.id === ROOT_ID || el.hasAttribute('data-shell-overlay') ||
        !!el.closest('[role="dialog"],[role="menu"],[role="listbox"],[aria-modal="true"],' +
                     '[data-slot="conversation.composer"]')
    }

    /** 颜色是否"实色且不透明"（透明/半透明都不算）。 */
    function isOpaqueColor(c) {
      if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return false
      const m = /^rgba?\(([^)]+)\)$/.exec(c)
      if (!m) return false
      const parts = m[1].split(',').map((s) => parseFloat(s))
      return parts.length < 4 || parts[3] >= 0.98
    }

    /** 把实色降成指定不透明度（0 = 全透明）。保留色相便于半透明档位复用。 */
    function toSemi(c, alpha) {
      const m = /^rgba?\(([^)]+)\)$/.exec(c)
      if (!m) return c
      const p = m[1].split(',').map((s) => parseFloat(s))
      if (p.length < 3) return c
      return `rgba(${Math.round(p[0])},${Math.round(p[1])},${Math.round(p[2])},${alpha})`
    }

    /**
     * 判定"这是一块该被半透明化的官方大面"。
     * 三类命中（任一即可）：
     *  · 面积 ≥ 视口 8%
     *  · 通栏/通高（某一轴 ≥86% 视口）且面积 ≥ 视口 1.2%
     *    （1.2% 是为了抓"输入区停靠条 / 状态条"这类**很薄但通栏**的白带 —— 真机上
     *      "下面还是白的"就是它；门槛放到 3% 会把它漏掉）
     *  · 位于侧栏/右栏里，且面积 ≥ 该列 6%（抓"侧栏底部那条不透明白带"）
     *  · 位于侧栏/右栏里，且面积 ≥ 该列 6%（抓"侧栏底部那条不透明白带"）
     * 排除: 对话框/菜单/弹层/官方浮层/输入区子树 与 我们自己改过的元素。
     */
    function chromeHit(el, r, cols) {
      const vw = window.innerWidth, vh = window.innerHeight
      const vp = vw * vh
      const area = r.width * r.height
      if (area >= vp * 0.08) return true
      if ((r.width >= vw * 0.86 || r.height >= vh * 0.86) && area >= vp * 0.012) return true
      for (const col of cols) {
        if (col && col.contains(el) && col !== el) {
          const ca = col.clientWidth * col.clientHeight
          if (ca > 0 && area >= ca * 0.06) return true
        }
      }
      return false
    }

    function clearOpaqueChrome(frame, book, painted, cols, alpha) {
      let cleared = 0
      const walk = (el, depth) => {
        if (depth > 8) return
        for (const child of el.children) {
          if (!skipChrome(child) && !painted.has(child)) {
            const r = child.getBoundingClientRect()
            if (r.width > 1 && r.height > 1 && chromeHit(child, r, cols)) {
              const cs = getComputedStyle(child)
              const img = cs.backgroundImage
              if ((img === 'none' || !img) && isOpaqueColor(cs.backgroundColor)) {
                painted.add(child)
                book.push([child, child.getAttribute('style'), 'whale-girl:chrome'])
                child.style.setProperty('background-color', toSemi(cs.backgroundColor, alpha), 'important')
                child.setAttribute('data-safearea-managed', 'whale-girl:chrome')
                cleared++
              }
            }
          }
          walk(child, depth + 1)
        }
      }
      walk(frame, 0)
      return cleared
    }

    /** 取证走查：把仍然"大且不透明/带底图"的官方面记下来，供下一轮定位。 */
    function auditChrome(frame, skin, cols) {
      const vw = window.innerWidth, vh = window.innerHeight
      skin.audit = []
      const walk = (el, depth) => {
        if (depth > 8 || skin.audit.length > 40) return
        for (const child of el.children) {
          if (!skipChrome(child) && !child.hasAttribute('data-safearea-managed')) {
            const r = child.getBoundingClientRect()
            if (r.width > 1 && r.height > 1 && chromeHit(child, r, cols)) {
              const cs = getComputedStyle(child)
              const bg = cs.backgroundColor, img = cs.backgroundImage
              const opaque = isOpaqueColor(bg)
              const hasImg = !!img && img !== 'none'
              if (opaque || hasImg) {
                skin.audit.push({
                  tag: child.tagName.toLowerCase(),
                  cls: String(child.className || '').replace(/\s+/g, ' ').slice(0, 56),
                  slot: child.getAttribute('data-slot') || child.getAttribute('data-pane') || '',
                  areaPct: Math.round(100 * r.width * r.height / (vw * vh)),
                  w: Math.round(r.width), h: Math.round(r.height),
                  bg: opaque ? bg : 'transparent',
                  img: hasImg ? 'has-image' : '',
                })
              }
            }
          }
          walk(child, depth + 1)
        }
      }
      walk(frame, 0)
    }

    /**
     * 让官方"整屏底色"变透。分两段：
     *  ① 语义锚点（frame + 三个列容器）—— 源码实证，精确
     *  ② 通用大面半透明化：官方内部还有很多包裹层自带不透明底（会话面板、侧栏底部导航块、
     *     输入区停靠条、右栏面板……），只清那 4 个节点远远不够。
     */
    function installTransparency(book, painted, skin) {
      const overlay = document.querySelector('[data-shell-overlay]')
      const rootSlot = document.querySelector('[data-slot="root"]')
      const frame = (overlay && overlay.parentElement) ||
                    (rootSlot && rootSlot.firstElementChild) ||
                    document.getElementById('root') || null
      if (!frame) {
        document.documentElement.setAttribute('data-dsh-skin-degraded', 'frame-not-found')
        console.warn('[dsh-skin-whale-girl] 找不到官方 frame：美术会被不透明底挡住。' +
                     '请在控制台执行 document.querySelector("[data-shell-overlay]") 反馈结果。')
        return null
      }

      const byClass = (frag) => frame.querySelector(`[class*="${frag}"]`)
      const childAt = (i) => frame.children[i] ?? null
      const colOf = (semantic, frag, index) =>
        (semantic && climbTo(semantic, frame)) || byClass(frag) || childAt(index)

      const paint = (el, image, reason) => {
        if (!el || painted.has(el)) return
        painted.add(el)
        /* 注意：**不能**跳过 frame。frame 自带不透明底，不清它整张美术都会被挡在后面。 */
        book.push([el, el.getAttribute('style'), reason])
        el.style.setProperty('background-color', 'transparent', 'important')
        if (image) el.style.setProperty('background-image', image, 'important')
        el.setAttribute('data-safearea-managed', reason)
      }

      frame.setAttribute('data-wgs-frame', '')
      const dark = isDark()
      const g = COLUMN_GRADIENT[dark ? 'dark' : 'light']

      const centerEl = colOf(document.querySelector('[data-conversation-header]'), 'centerCol', 1)
      const sidebarEl = colOf(document.querySelector('[data-slot="sidebar"]'), 'sidebarCol', 0)
      const detailsEl = document.querySelector('[data-rightbar-col]') || byClass('rightbarCol') || childAt(2)

      paint(frame, 'none', 'whale-girl:frame')
      paint(centerEl, 'none', 'whale-girl:center')
      paint(sidebarEl, g.left, 'whale-girl:sidebar')
      paint(detailsEl, g.right, 'whale-girl:details')

      /* ② 通用大面清理。
         为什么用**全透明**而不是"留一点底色"：官方这些包裹层是**层层嵌套**的，
         每层各留 55% 的白，叠四层就等于又把美术糊死了（v0.2 第一次渲染实测）。
         文字可读性由正文衬纸 + 列渐变负责，不靠这些结构层。 */
      const cols = [sidebarEl, detailsEl]
      skin.lastChrome = clearOpaqueChrome(frame, book, painted, cols, 0)
      auditChrome(frame, skin, cols)

      document.documentElement.setAttribute('data-dsh-skin-columns',
        [centerEl ? 'center' : '', sidebarEl ? 'sidebar' : '', detailsEl ? 'details' : ''].filter(Boolean).join('+') || 'none')
      document.documentElement.setAttribute('data-dsh-skin-chrome', String(skin.lastChrome))
      return { frame, cols, centerEl, sidebarEl, detailsEl }
    }

    /* ------------------------------------------------------------------ 主流程 */
    function create() {
      const docEl = document.documentElement
      const ledger = []          // [element, 原始 style 属性, reason] 还原账本
      const painted = new Set()  // 防止同一元素被记账两次
      const skin = { audit: [] }
      const nodes = []
      const observers = []
      let disposed = false

      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
      nodes.push(style)

      const base = new URL(ASSET_DIR, document.baseURI).href
      const map = { ...ASSETS }
      const url = (k) => base + (map[k] ?? ASSETS[k])

      const root = document.createElement('div')
      root.id = ROOT_ID
      root.setAttribute('data-dsh-skin-root', SKIN_KEY)
      docEl.style.setProperty('--wgs-bg-night', `url("${url('bg-night')}?v=${VERSION}")`)
      docEl.style.setProperty('--wgs-bg-day', `url("${url('bg-day')}?v=${VERSION}")`)

      /* 层序（从下到上）：背景 < 蕾丝/角花 < 立绘 < 正文衬纸 < 输入框画框/侧栏饰线 < Q版 */
      const backdrop = document.createElement('div')
      backdrop.className = 'wgs-layer'
      backdrop.setAttribute('data-dsh-art-layer', 'backdrop')
      const bgN = document.createElement('div'); bgN.className = 'wgs-bg wgs-bg--night'
      const bgD = document.createElement('div'); bgD.className = 'wgs-bg wgs-bg--day'
      backdrop.append(bgN, bgD)

      const decoBack = document.createElement('div')
      decoBack.className = 'wgs-layer'
      decoBack.setAttribute('data-dsh-art-layer', 'frieze')
      const friezeTop = document.createElement('div'); friezeTop.className = 'wgs-frieze wgs-frieze--top'
      const friezeBottom = document.createElement('div'); friezeBottom.className = 'wgs-frieze wgs-frieze--bottom'
      const cornerLeft = document.createElement('div'); cornerLeft.className = 'wgs-corner wgs-corner--left'
      const cornerRight = document.createElement('div'); cornerRight.className = 'wgs-corner wgs-corner--right'
      decoBack.append(friezeTop, friezeBottom, cornerLeft, cornerRight)

      const charLayer = document.createElement('div')
      charLayer.className = 'wgs-layer'
      charLayer.setAttribute('data-dsh-art-layer', 'character')
      const imgLeft = document.createElement('img')
      imgLeft.className = 'wgs-char wgs-char--left'
      imgLeft.alt = ''; imgLeft.draggable = false
      const imgRight = document.createElement('img')
      imgRight.className = 'wgs-char wgs-char--right'
      imgRight.alt = ''; imgRight.draggable = false
      const imgHalf = document.createElement('img')
      imgHalf.className = 'wgs-half'
      imgHalf.alt = ''; imgHalf.draggable = false
      /* 立绘 / 地板的"揭示"用**内联**不透明度，而且**在插入文档之前**就设好。
         两个坑都踩过：
           ① 只靠 CSS 层叠不可靠 —— 基础规则里的 opacity:0 会在某些主题/尺寸组合下
              压过揭示规则，表现是"立绘整个消失"（getComputedStyle 也报 0，很难查）；
           ② 若等挂载后再改 opacity，就会走 `.wgs-char{transition:opacity .7s}` 这条**过渡**，
              在虚拟时钟/慢渲染下可能停在中途 —— 表现为"有时候有人物、有时候没有"。
         插入前设好内联值 ⇒ 首次样式解析就是最终值 ⇒ 没有过渡、结果确定。
         compact / hero 那几条带 !important 的规则仍然压得住内联值。 */
      imgLeft.style.opacity = '0.98'
      imgRight.style.opacity = '0.98'
      charLayer.append(imgLeft, imgRight, imgHalf)

      /* 层序（从下到上）：背景 < 蕾丝/角花 < 立绘 < 浅底地板 < 输入框画框 */
      const floor = document.createElement('div')
      floor.className = 'wgs-floor'
      floor.style.opacity = '1'

      const decoFront = document.createElement('div')
      decoFront.className = 'wgs-layer'
      decoFront.setAttribute('data-dsh-art-layer', 'frame')
      const composerFrame = document.createElement('div'); composerFrame.className = 'wgs-composer-frame'
      decoFront.append(composerFrame)

      /* Q 版：不放进美术层 —— 稍后贴进侧栏 DOM（在侧栏白底之上）。
         两张 <img> 叠着做交叉淡入，用来随机换表情（idle / think / done 三张）。 */
      const mascot = document.createElement('div')
      mascot.className = 'wgs-mascot'
      const mascotImgs = [document.createElement('img'), document.createElement('img')]
      for (const im of mascotImgs) { im.alt = ''; im.draggable = false; mascot.appendChild(im) }

      root.append(backdrop, decoBack, charLayer, floor, decoFront)
      nodes.push(root)

      let mountedInEngine = false
      function mount(engine) {
        const slot = engine?.artRoot
        if (slot) {
          if (root.parentElement !== slot) slot.appendChild(root)
          mountedInEngine = true
        } else if (root.parentElement !== document.body) {
          document.body.insertBefore(root, document.body.firstChild)
          mountedInEngine = false
        }
      }

      /* ---- 状态计算 ---- */
      let lastDark = null
      let lastRail = null
      let lastHero = null
      let lastPlace = null
      let lastCard = null
      let lastChromeAt = 0

      function applyTheme() {
        const dark = isDark()
        const rail = nums('--dsh-protect-sidebar-width') > 0 && nums('--dsh-protect-sidebar-width') < TUNE.railBelow
        if (rail !== lastRail) {
          lastRail = rail
          root.dataset.rail = rail ? '1' : '0'
          /* Q 版挂在 #ROOT 之外（侧栏里），所以轨道标记也要打在 html 上给它用 */
          docEl.setAttribute('data-dsh-rail', rail ? '1' : '0')
        }
        if (dark === lastDark) return
        lastDark = dark
        const g = COLUMN_GRADIENT[dark ? 'dark' : 'light']
        for (const [el, , reason] of ledger) {
          if (reason === 'whale-girl:sidebar') el.style.setProperty('background-image', g.left, 'important')
          if (reason === 'whale-girl:details') el.style.setProperty('background-image', g.right, 'important')
        }
      }

      /* 空白会话(landing)：官方 conversation.hero.brand.mark 槽位在场即为空白会话 */
      function applyHero() {
        const on = !!document.querySelector('[data-slot="conversation.hero.brand.mark"]')
        if (on === lastHero) return
        lastHero = on
        root.dataset.hero = on ? '1' : '0'
      }

      /**
       * 站位：能站两边就站两边（用户要的对称双立绘）；
       * 只有"窗口确实太窄"或"正文列两侧真的没有空档"时才退成中间一张。
       */
      function applyPlacement() {
        const vw = window.innerWidth
        const place = vw < TUNE.compactBelowVw ? 'compact' : 'side'
        if (place !== lastPlace) { lastPlace = place; root.dataset.place = place }
        /* 输入框卡片量到了才用九宫格画框贴它；没量到就退化成"框正文列下部" */
        const cardOk = nums('--dsh-composer-card-height') > 40
        if (cardOk !== lastCard) { lastCard = cardOk; root.dataset.card = cardOk ? '1' : '0' }
      }

      /* Q 版挂载：找到侧栏里"真正有尺寸"的那层容器，把它放进去。
         [data-slot="sidebar"] 是 display:contents，自身没有盒子，要往上找一层。 */
      let mascotHost = null
      function attachMascot() {
        if (disposed) return
        if (mascotHost && mascotHost.isConnected && mascot.parentElement === mascotHost) return
        const slot = document.querySelector('[data-slot="sidebar"]')
        if (!slot) return
        /* 从槽位**自身**开始往上找第一个有尺寸的盒子：
           侧栏槽在真机是 display:contents（rect 为 0），往上就是侧栏列；
           在别的 DOM 里槽位本身就有宽度，那就直接用槽位本身。
           （早先写成「从 parentElement 开始」，结果一路走到 frame，Q 版跑到了窗口正中。） */
        let host = slot
        while (host && host !== document.body && host.getBoundingClientRect().width < 40) host = host.parentElement
        if (!host || host === document.body) return
        /* 容器若是 static，绝对定位会跑到视口上 —— 补一个 relative，并记进还原账本 */
        if (getComputedStyle(host).position === 'static') {
          ledger.push([host, host.getAttribute('style'), 'whale-girl:mascot-host'])
          host.style.setProperty('position', 'relative')
        }
        host.appendChild(mascot)
        mascotHost = host
        if (window.__DSH_SKIN_WHALE_GIRL_STATE__) window.__DSH_SKIN_WHALE_GIRL_STATE__.mascot = true
      }

      /* ---- 动态能力 ①：Q 版随机换表情 ----------------------------------
         三张立绘（待机 / 思考 / 完成）随机切换，5–11s 一次，且**不会连续重复同一张**。
         两张 img 交叉淡入，所以不会有闪烁或空档。 */
      const SPRITES = ['chibi-idle', 'chibi-think', 'chibi-done']
      let spriteSlot = 0            // 当前可见的那张 <img>
      let spriteKey = 'chibi-idle'
      let chibiTimer = 0
      function showSprite(key) {
        const next = 1 - spriteSlot
        mascotImgs[next].src = `${url(key)}?v=${VERSION}`
        mascotImgs[next].classList.add('wgs-on')
        mascotImgs[spriteSlot].classList.remove('wgs-on')
        spriteSlot = next
        spriteKey = key
        const st = window.__DSH_SKIN_WHALE_GIRL_STATE__
        if (st) st.sprite = spriteKey
      }
      function scheduleChibi() {
        clearTimeout(chibiTimer)
        const wait = 5000 + Math.random() * 6000
        chibiTimer = setTimeout(() => {
          if (disposed || document.hidden) { scheduleChibi(); return }
          const pool = SPRITES.filter((s) => s !== spriteKey)
          showSprite(pool[Math.floor(Math.random() * pool.length)])
          scheduleChibi()
        }, wait)
      }

      /* ---- 动态能力 ②：昼夜背景切换 ------------------------------------
         默认**跟随 DSH 主题**（切深色就是夜色）。另外给一个手动覆盖：
         Ctrl+Alt+N（或控制台 dshSkinWhaleGirl.setBackdrop('night')）循环
         「跟随主题 → 夜 → 昼」，选择存在 localStorage 里。 */
      const BACKDROP_LS = 'dsh-skin-whale-girl:backdrop'
      let backdropMode = 'auto'
      try {
        const saved = localStorage.getItem(BACKDROP_LS)
        if (saved === 'night' || saved === 'day' || saved === 'auto') backdropMode = saved
      } catch { /* 私隐模式等拿不到 localStorage 就用默认 */ }
      function applyBackdrop() {
        if (backdropMode === 'auto') delete root.dataset.backdrop
        else root.dataset.backdrop = backdropMode
        const st = window.__DSH_SKIN_WHALE_GIRL_STATE__
        if (st) st.backdrop = backdropMode
      }
      function setBackdrop(m) {
        backdropMode = (m === 'night' || m === 'day') ? m : 'auto'
        try { localStorage.setItem(BACKDROP_LS, backdropMode) } catch { /* noop */ }
        applyBackdrop()
        return backdropMode
      }
      function onKey(e) {
        if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'n' || e.key === 'N')) {
          e.preventDefault()
          const order = ['auto', 'night', 'day']
          const next = order[(order.indexOf(backdropMode) + 1) % order.length]
          const m = setBackdrop(next)
          console.info(`[dsh-skin-whale-girl] 背景 = ${m}` +
            (m === 'auto' ? '（跟随 DSH 主题：深色=夜色 / 浅色=白昼）' : ''))
        }
      }
      window.addEventListener('keydown', onKey, true)

      /* 给用户/脚本留一个明确的开关（也方便截图取证） */
      window.dshSkinWhaleGirl = {
        setBackdrop,
        get backdrop() { return backdropMode },
        sprites: () => SPRITES.slice(),
        setSprite: (k) => (SPRITES.includes(k) ? (showSprite(k), k) : null),
      }

      function onResize() { applyTheme(); applyHero(); applyPlacement() }
      window.addEventListener('resize', onResize)

      return (async () => {
        /* 1. 清单（失败就用兜底名单） */
        try {
          const res = await fetch(`${base}manifest.json?v=${VERSION}`, { cache: 'no-cache' })
          if (res.ok) Object.assign(map, await res.json())
        } catch { /* 兜底名单 */ }

        /* 2. 预加载，好了再揭示（避免先看到半张图） */
        const charSrc = `${url('char')}?v=${VERSION}`
        const halfSrc = `${url('half')}?v=${VERSION}`
        imgLeft.src = charSrc
        imgRight.src = charSrc
        imgHalf.src = halfSrc
        await Promise.all([
          preload(`${url('bg-night')}?v=${VERSION}`),
          preload(`${url('bg-day')}?v=${VERSION}`),
          preload(charSrc), preload(halfSrc),
          ...SPRITES.map((k) => preload(`${url(k)}?v=${VERSION}`)),
        ])
        if (disposed) return

        /* 3. 让官方底色变透 */
        const installed = installTransparency(ledger, painted, skin)
        const frame = installed?.frame ?? null
        const cols = installed?.cols ?? []

        /* 4. 挂载 + 揭示 */
        const engine = await waitEngine(1200)
        mount(engine)
        applyTheme(); applyHero(); applyPlacement()
        attachMascot()
        showSprite('chibi-idle')
        scheduleChibi()
        applyBackdrop()
        /* 皮肤标记同时打在 html 与 body 上：官方暗色主题选择器是 body[data-ds-dark-theme]，
           我们覆盖 token 的规则也必须写在 body 那一层才压得住。 */
        docEl.setAttribute('data-dsh-skin', SKIN_KEY)
        document.body?.setAttribute('data-dsh-skin', SKIN_KEY)

        window.__DSH_SKIN_WHALE_GIRL_STATE__ = {
          version: VERSION,
          mountedInEngine,
          frameFound: !!frame,
          columns: docEl.getAttribute('data-dsh-skin-columns'),
          degraded: docEl.getAttribute('data-dsh-skin-degraded') ?? null,
          assets: { ...map },
          resolved: { char: charSrc, half: halfSrc, night: url('bg-night'), day: url('bg-day'), chibi: url('chibi-idle') },
          rail: root.dataset.rail === '1',
          hero: root.dataset.hero === '1',
          place: root.dataset.place ?? null,
          backdrop: backdropMode,
          sprite: spriteKey,
          sprites: SPRITES.slice(),
          gutter: Math.round(nums('--dsh-art-zone-min', -1)),
          chatWidth: TUNE.chatWidth,
          charH: Math.round(imgLeft.getBoundingClientRect().height),
          chromeCleared: docEl.getAttribute('data-dsh-skin-chrome'),
          /* 账本摘要：每个被我们改过的元素 + 原因 + 当前尺寸（判断"侧栏渐变到底有没有铺上"） */
          painted: ledger.map(([el, , reason]) => {
            const r = el.getBoundingClientRect()
            return `${reason} ${el.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)}`
          }),
          stillOpaque: skin.audit,
        }

        /* 5. 引擎后到则搬进美术槽 */
        let tries = 0
        const adopt = setInterval(() => {
          tries += 1
          if (disposed || tries > 40) { clearInterval(adopt); return }
          if (!mountedInEngine && window.dshSafeArea?.artRoot) {
            mount(window.dshSafeArea)
            clearInterval(adopt)
          }
        }, 250)

        /* 6. 主题观察 */
        const mo = new MutationObserver(() => applyTheme())
        mo.observe(docEl, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'data-ds-light-theme', 'data-dsh-theme'] })
        const moBody = new MutationObserver(() => applyTheme())
        if (document.body) moBody.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
        observers.push(mo, moBody)

        /* 7. 引擎的刷新回调：换页面/改列宽/切主题都会走这里 */
        const unsub = engine?.onRefresh
          ? engine.onRefresh(() => {
              applyHero(); applyTheme(); applyPlacement()
              /* 侧栏是 React 渲染的，重渲染可能把 Q 版节点冲掉 → 每次刷新补挂一次 */
              attachMascot()
              const t = Date.now()
              if (frame && !document.hidden && t - lastChromeAt > 1500) {
                lastChromeAt = t
                const n = clearOpaqueChrome(frame, ledger, painted, cols, 0)
                if (n > 0) {
                  skin.lastChrome = (skin.lastChrome ?? 0) + n
                  docEl.setAttribute('data-dsh-skin-chrome', String(skin.lastChrome))
                  auditChrome(frame, skin, cols)
                  const st = window.__DSH_SKIN_WHALE_GIRL_STATE__
                  if (st) { st.chromeCleared = String(skin.lastChrome); st.stillOpaque = skin.audit }
                }
              }
            })
          : (applyHero(), null)

        /* 8. 卸载账本：本函数是唯一的还原入口 */
        return () => {
          disposed = true
          clearInterval(adopt)
          clearTimeout(chibiTimer)
          window.removeEventListener('resize', onResize)
          window.removeEventListener('keydown', onKey, true)
          if (window.dshSkinWhaleGirl) delete window.dshSkinWhaleGirl
          if (typeof unsub === 'function') unsub()
          for (const o of observers) { try { o.disconnect() } catch { /* noop */ } }
          docEl.removeAttribute('data-dsh-skin')
          document.body?.removeAttribute('data-dsh-skin')
          docEl.removeAttribute('data-dsh-rail')
          docEl.removeAttribute('data-dsh-skin-columns')
          docEl.removeAttribute('data-dsh-skin-degraded')
          docEl.removeAttribute('data-dsh-skin-chrome')
          delete window.__DSH_SKIN_WHALE_GIRL_STATE__
          docEl.style.removeProperty('--wgs-bg-night')
          docEl.style.removeProperty('--wgs-bg-day')
          mascot.remove()
          root.remove()
          style.remove()
          for (const [el, original] of ledger) {
            try {
              if (original === null) el.removeAttribute('style')
              else el.setAttribute('style', original)
            } catch { /* noop */ }
          }
          ledger.length = 0
        }
      })()
    }

    /* ==================== 安全区引擎（原 dsh-safe-area，已合并进本包）====================
       合并的理由只有一个：**让用户一次安装即用**。引擎单独发包时，用户得先 clone
       再从子目录装第二个包 —— 那就不叫即装即用了。它自己仍然零依赖、可独立卸载。
       它照旧把 window.dshSafeArea 摆出来，所以下面皮肤的逻辑一行都不用改。 */
    const SafeAreaEngine = (() => {

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
      return { create }
    })()
    /* ------------------------------------------------------------------ apply */
    function apply(ctx) {
      /* 引擎先起来：皮肤下面用到的几何全部来自它发布的 CSS 变量。
         它跑在自己的 IIFE 作用域里，卸载也各管各的。 */
      let stopEngine = null
      whenBody().then(() => {
        try { stopEngine = SafeAreaEngine.create() } catch (err) {
          console.error('[dsh-skin-whale-girl] 安全区引擎初始化失败（皮肤退回兜底几何）', err)
        }
      })
      ctx.effect(() => () => { try { if (stopEngine) stopEngine() } catch { /* noop */ } })
      let inner = null
      let stop = null
      whenBody().then(async () => {
        try {
          inner = create()
          stop = await inner
        } catch (err) {
          console.error('[dsh-skin-whale-girl] 初始化失败（已降级，不影响 DSH 本体）', err)
        }
      })
      ctx.effect(() => () => {
        try {
          if (stop) stop()
          else {
            document.documentElement.removeAttribute('data-dsh-skin')
            document.getElementById(ROOT_ID)?.remove()
            document.getElementById(STYLE_ID)?.remove()
          }
        } catch { /* 卸载阶段不再抛 */ }
      })
    }

    exports.apply = apply
    return module.exports
  },
})
