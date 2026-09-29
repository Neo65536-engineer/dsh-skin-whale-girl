# dsh-safe-area · DSH 安全区引擎

给 DSH Desktop 的皮肤/主题插件用的一套**运行时避让契约**。

它自己**不显示任何东西、不带任何素材**。它只做四件事：

1. **测量**官方 UI 的保护区（标题栏 / 会话头 / 侧栏 / 右栏 / 输入区 / 正文列），多级降级链，容忍上游 DOM 漂移；
2. 把几何**发布**成 CSS 变量 + `<html>` 状态属性，供任何皮肤消费；
3. 在顶部带（标题栏 / 会话头）铺一层**受控衬底**，保证原生图标的对比度；
4. **越界自检**：关键控件的中心点命中测试 + 保护矩形可视化。

| | |
| --- | --- |
| 实测环境 | DSH Desktop **2.0.15**（Windows / x64） |
| 依赖 | **零** —— 无 peerDependencies、无 install 钩子、无原生模块、无构建步骤 |
| 素材 | **零** |

## 为什么要有它

皮肤要在官方 UI **底下**画美术，就必然面对三个问题：**立绘该躲开哪些矩形**、
**官方底不透明导致美术看不见**、**美术会不会挡住按钮**。

把这三件事塞进每个皮肤里各写一遍，会得到一堆互相打架的魔改。
所以这里把它抽成一个引擎：**引擎只测量与发布，不认识任何皮肤；皮肤只消费契约，不碰官方 DOM 的层级。**

配套皮肤：[`dsh-skin-whale-girl`](https://github.com/Neo65536-engineer/dsh-skin-whale-girl)。
两者**刻意互不写入依赖** —— 引擎缺席时皮肤退回兜底值照常显示，皮肤缺席时引擎只是空转。

## 安装

```sh
dsh plugin --profile desktop add <本仓来源>
```

然后编辑 `<DSH_HOME>/profiles/desktop/package.json`，把 `dsh-safe-area` 加进 `dsh.profile.bundles`
（**只装不加等于没装**），重启 DSH Desktop。

## 契约

皮肤侧只需要读这些，不需要知道 DOM 长什么样：

```css
/* 保护矩形 */
--dsh-safe-top / -right / -bottom / -left      /* 四条安全边 */
--dsh-safe-inset                               /* 上面四条的组合写法 */
--dsh-art-top / --dsh-art-bottom               /* 美术带上下沿（会话头下沿 / 输入区上沿） */
--dsh-protect-titlebar-height
--dsh-protect-header-height
--dsh-protect-header-right                     /* 会话头右上图标簇的最左边缘 */
--dsh-protect-composer-height
--dsh-protect-sidebar-width
--dsh-protect-details-width

/* 正文列与两侧空档（皮肤据此定立绘尺寸/位置，避免压住正文） */
--dsh-protect-content-left
--dsh-protect-content-right-inset
--dsh-content-center
--dsh-art-content-w
--dsh-art-zone-left / -right / -min            /* 可见美术带内的空档（已扣掉两侧面板） */

/* 输入框卡片四边（用来给输入框描九宫格画框） */
--dsh-composer-card-left / -right-inset / -bottom / -height

/* 其它 */
--dsh-viewport-w / -h
--dsh-substrate                                /* 顶部衬底色 */
```

```js
window.dshSafeArea.rects()        // 当前测到的全部几何
window.dshSafeArea.report()       // 自检：anchors 找到没找到 + 中心点命中测试
window.dshSafeArea.visualize()    // 画/收保护矩形（快捷键 Ctrl+Shift+S）
window.dshSafeArea.onRefresh(cb)  // 订阅"几何重算"时机（别再挂第二套 MutationObserver）
window.dshSafeArea.artRoot        // 美术槽：皮肤把自己的层挂进来，天然位于 UI 之下
window.dshSafeArea.send()         // 把自检报告 POST 给宿主落盘
```

`<html>` 上的状态属性：`data-dsh-safearea="on|off"`、`data-dsh-theme="dark|light"`。

## 宿主侧（开发期诊断通道）

引擎会把一份自检报告 POST 到 `/dsh-safe-area/report`，宿主侧**只写一个固定文件名**：
`run/safe-area-report.json`。里面含视口/DPR/主题、全部锚点的 found 状态、发布的变量真值、
关键控件的 `elementFromPoint` 结果，以及消费方（皮肤）挂上来的状态。

安全约束：只接受 POST + `application/json`、同源校验、体积上限 256 KB、
**不接受任何来自请求的路径**。它只是开发期取证用的，不是产品功能。

## 设计上的几条硬约束

- **美术层在 UI 之下**：引擎在 `<body>` 前插一个 `position:fixed; z-index:0` 的容器。
  官方 `frame` 是 `position:relative` 且在 DOM 中更靠后 —— 所以官方 UI 天然画在美术之上，
  **结构上不可能拦截点击**。
- **不改官方 z-index**。官方列宽拖拽手柄是 `z-index:11`、shell overlay 是 `20`；
  把列容器抬到 900 会把拖拽手柄压死。
- **不使用 `shell.overlay`**：它在所有列之上，美术放那儿必然盖住 UI。
- 皮肤不在岗时引擎只是空转；引擎不在岗时皮肤用兜底值照常显示 —— 这是双包零依赖的目的。

## 已知限制

- 只在 **DSH Desktop 2.0.15** 上实测过。官方 class 带哈希前缀、DOM 结构会变，
  所以测量走"语义锚点 → 类名后缀 → `frame.children` 索引"的降级链；全找不到时会显式降级
  （写 `data-dsh-skin-degraded`）而不是静默失效。
- 引擎**不会**去改官方面板的不透明度 —— 那是皮肤的事。引擎只提供衬底。

## 许可

MIT，见 [LICENSE](LICENSE)。本包不含任何美术素材。
