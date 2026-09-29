# Whale Girl · DSH 深海皮肤

给 DSH Desktop 换一身会呼吸的深海皮肤：**左右各一张镜像立绘**、
**昼夜两套背景**、蕾丝花边框住正文列、Q 版吉祥物在侧栏随机换表情 ——
并且**任何一块文字都有底**：美术再花也压不住字，也挡不住按钮。

![亮色](docs/preview-light.png)
![暗色](docs/preview-dark.png)

<sub>最难的一种情况：**右栏展开**时正文列被挤到很窄，两侧立绘必然与正文重叠 ——
这时候靠的就是"分层文字底"（[预览](docs/preview-light-rightbar.png)）。</sub>

| | |
| --- | --- |
| 实测环境 | DSH Desktop **2.0.15**（Windows / x64） |
| 运行依赖 | **零** —— 无 peerDependencies、无 install 钩子、无原生模块、无构建步骤 |
| 素材体积 | **1.01 MB / 8 个文件** |
| 代码许可 | MIT（**素材另附条款，见下**） |

---

## 特性

- **左右镜像双立绘**：同一张素材，左侧 `scaleX(-1)`。尺寸随窗口连续变化
  —— 高度约视口的 **2/3**，下限是上限的一半（不再是"档位跳变"）。
- **昼夜背景**：默认跟随 DSH 主题（深色 = 夜色 / 浅色 = 白昼）；
  按 **`Ctrl+Alt+N`** 可手动循环「跟随主题 → 夜 → 昼」，选择会记住。
  也可以在控制台用 `dshSkinWhaleGirl.setBackdrop('night')`。
- **文字永远有底**（三层，可见即可读）：
  1. 正文列一层**浅底**（地板），任何"跑出卡片"的内容至少落在它上面；
  2. 非正文行（思考 / 调用工具 / 已编辑文件）再抬一档浅底，和正文输出区分得开；
  3. 正文块、代码块、**表格**、卡片各自一层**实底** —— 关键在这：
     比容器宽的元素（例如单元格不换行的对照表）**自己的底会跟着它一起变宽**，
     所以最右一列也不会挂在背景上。
- **Q 版**：贴在侧栏、坐在底色之上；三张表情每 5–11 秒随机交叉淡入（不会连续重复同一张）。
- **花边**：顶部蕾丝带 + 角花 + **输入框九宫格描金画框**
  （内联 SVG，零字节、任意高度都不变形）。
- **按钮永远点得到**：美术层坐在官方 UI **之下**，结构上不可能拦截点击；
  引擎另外做"控件中心点命中测试"断言。
- **可完整卸载**：改动都记在还原账本里，卸载后官方样式逐元素还原。

## 安装

`dsh plugin` 是直接转发给 **pnpm** 的，所以第 ① 步接受任何 pnpm 能懂的来源（registry / git / 本地路径）。
但**只做第 ① 步会"装了像没装"** —— 还必须把它写进 profile 的 `dsh.profile.bundles`，插件才会真的被加载。

```sh
# ① 装进 profile（= 在 profile 目录里跑 pnpm add）
dsh plugin --profile desktop add github:Neo65536-engineer/dsh-skin-whale-girl

# 本地开发就按路径装
git clone https://github.com/Neo65536-engineer/dsh-skin-whale-girl
dsh plugin --profile desktop add ./dsh-skin-whale-girl
```

```jsonc
// ② 编辑 <DSH_HOME>/profiles/desktop/package.json，把包名加进 bundles
{
  "dependencies": { "dsh-skin-whale-girl": "github:Neo65536-engineer/dsh-skin-whale-girl" },
  "dsh": { "profile": { "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "dsh-skin-whale-girl"        // ← 这一行最容易漏
  ] } }
}
```

> **装完要重启一次 DSH Desktop。** 宿主侧（素材路由）只在启动时加载一次。
> 之后如果只改了 `lib/client.js`（浏览器侧），**刷新页面（`Ctrl+R`）就生效**，不用重启。

卸载：`dsh plugin --profile desktop remove dsh-skin-whale-girl`，并删掉 bundles 里那一行。

### 配套引擎 `dsh-safe-area`（可选，但强烈建议）

皮肤消费的是引擎发布的一套**运行时契约**（CSS 变量 + 状态属性）：
每个保护区的真实矩形、正文列宽、输入框卡片四边、可用美术带……

**不装引擎也能显示** —— 皮肤所有变量都有兜底值，只是几何会退回保守估计
（立绘位置、衬底范围、画框贴合度都会差一截）。两个包**刻意互不写入依赖**，
就是为了让"引擎缺席"成为可用的降级态，而不是崩溃。

引擎源码就在本仓的 [`engine/`](engine/)（它是个独立包，将来也可能单独开源）：

```sh
git clone https://github.com/Neo65536-engineer/dsh-skin-whale-girl
dsh plugin --profile desktop add ./dsh-skin-whale-girl
dsh plugin --profile desktop add ./dsh-skin-whale-girl/engine
# 然后把 dsh-safe-area 也加进 dsh.profile.bundles，重启
```

> 注意：`engine/` **不在 npm 包里**（这是有意的，它自己要单独发布）。
> 所以上面的 `github:` 简写只能装皮肤那一个 —— 要装引擎必须 `git clone`。

## 控制台自检

引擎在 `window` 上留了接口，出问题时不用开 DevTools 翻 DOM：

```js
dshSafeArea.rects()      // 当前测到的全部几何
dshSafeArea.report()     // 关键控件中心点是否还命中它自己（violations 应为空数组）
dshSafeArea.visualize()  // 快捷键 Ctrl+Shift+S：把所有保护矩形画出来
dshSkinWhaleGirl.backdrop          // 'auto' | 'night' | 'day'
dshSkinWhaleGirl.setBackdrop('day')
```

## 已知限制（诚实说）

- **只在 DSH Desktop 2.0.15 上实测过。** 官方 class 名带哈希前缀、DOM 结构也可能变，
  皮肤里有一部分钩子是 `[class*=...]` 片段和 `data-*` 属性 ——
  DSH 升级后有失效的可能。真失效了请开 issue，附上 `dshSafeArea.report()` 的输出。
- **手动切夜（`Ctrl+Alt+N`）属于"错配"场景**：界面还在亮色档时官方文字是深色，
  而夜色背景很暗，地板那层浅底挡不住深色字。想要夜景请优先**直接把 DSH 切到深色主题**。
- 皮肤不改官方 z-index、不接管官方浮层，因此官方对话框 / 菜单永远是**不透明**的
  —— 这是有意的，浮层上盖美术只会让文字更难读。
- 立绘素材本身尺度偏性感（露背 / 吊带袜），自用无碍；若你要基于本仓二次发布，
  请先自行评估目标平台的内容政策。

## 素材与商标

- **素材是 AI 生成图**，角色为同人形象「鲸鱼娘」，原型作者为 **上善**。
  素材**不在 MIT 范围内**：请勿商用、请勿移除署名；二次分发请同时保留本节的署名信息。
  详见 [NOTICE](NOTICE)。
- 主立绘原图腰部缎带上原有的第三方商标字样，已在**构建期用 inpaint 抹除**
  （脚本见 `build/build_assets.py`），因此镜像后也不会出现反字。
- 本项目是**第三方作品，与 DeepSeek 官方无关**，不包含任何官方素材或代码。

## 开发

```sh
# 素材重建（需要原图；产物已随仓提交，普通用户不需要跑）
python build/build_assets.py <原图目录>
```

预览图不是手绘模拟图：它们是在**真 CSS + 真素材**上用无头 Chromium 渲染出来的
（早期的预览是 Python 合成的，几何假设有误，"看着完美、真机却不行" —— 已废弃）。
渲染脚本目前没随仓提供；如果你要改布局并想复现同样的预览，开个 issue 我把它整理进来。

## 许可

- 代码：MIT，见 [LICENSE](LICENSE)
- 美术素材：见 [NOTICE](NOTICE)（非 MIT，保留署名、禁止商用）
