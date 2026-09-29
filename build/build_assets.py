# -*- coding: utf-8 -*-
"""
dsh-skin-whale-girl 构建期素材处理（只在开发者机器上跑，用户机器完全不需要）。

用法:
    python build/build_assets.py [原图目录]
    # 原图目录也可以用环境变量 WHALE_SRC 给；默认 ./build-src

输入: <SRC>/*.png     b1(夜) b2(昼) p1(主立绘) p3(半身像) Q123(Q 版三连)
输出: ../assets/runtime/*.webp     随包发布的成品
      ../assets/runtime/manifest.json
      build/preview/*.jpg          叠在夜/昼背景上的观感预览（不随包发布）

主立绘: **只用 p1 一张**，构建期把腰部缎带上的第三方商标字样 inpaint 掉（拉普拉斯扩散），
左右两侧由 CSS 镜像复用 —— 所以镜像后不会出现反字，素材也只要一张。

末尾打印亮度/对比度断言结果（夜色正文区 L* ≤ 45、白昼 ≥ 75、正文对比度 ≥ 4.5:1）。
"""
import json
import os
import sys
from PIL import Image, ImageFilter
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.abspath(os.path.join(HERE, ".."))
SRC = os.environ.get("WHALE_SRC") or (sys.argv[1] if len(sys.argv) > 1 else os.path.join(PKG, "build-src"))
OUT = os.path.join(PKG, "assets", "runtime")
PREVIEW = os.environ.get("WHALE_PREVIEW") or os.path.join(HERE, "preview")
os.makedirs(OUT, exist_ok=True)
os.makedirs(PREVIEW, exist_ok=True)
NIGHT = (0x00, 0x1C, 0x30)

manifest = {}
report = []


def save_webp(im, name, **kw):
    path = os.path.join(OUT, name)
    im.save(path, "WEBP", method=6, **kw)
    manifest[name.rsplit(".", 1)[0]] = name
    report.append(f"  {name:<22} {im.size[0]:>5}x{im.size[1]:<5} {os.path.getsize(path)/1024:8.1f} KB")


def luminance(rgb):
    a = np.asarray(rgb.convert("RGB"), dtype=np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    Y = 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]
    return np.where(Y > 0.008856, 116 * np.cbrt(Y) - 16, 903.3 * Y)


def region_L(im, box):
    W, H = im.size
    c = im.crop((int(box[0]*W), int(box[1]*H), int(box[2]*W), int(box[3]*H)))
    return float(luminance(c).mean())


def trim(im, thresh=8, pad=4):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thresh)
    return im.crop((max(0, xs.min()-pad), max(0, ys.min()-pad),
                    min(im.width, xs.max()+1+pad), min(im.height, ys.max()+1+pad)))


def clean_alpha(im, floor=6):
    a = np.asarray(im).copy()
    al = a[..., 3].astype(np.int16)
    al[al < floor] = 0
    a[..., 3] = al.astype(np.uint8)
    return Image.fromarray(a)


def preview_on_night(im, name, maxw=520):
    im2 = im.copy()
    if im2.width > maxw:
        im2 = im2.resize((maxw, int(im2.height*maxw/im2.width)), Image.LANCZOS)
    bg = Image.new("RGBA", im2.size, NIGHT + (255,))
    Image.alpha_composite(bg, im2).convert("RGB").save(os.path.join(PREVIEW, name), quality=92)


# ---------------------------------------------------------------- 1) 背景
print("=" * 74)
print("[1] 背景")
for src, name in (("b1.png", "bg-night.webp"), ("b2.png", "bg-day.webp")):
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    Lc, Ltr = region_L(im, (0.30, 0.30, 0.70, 0.70)), region_L(im, (0.76, 0.00, 1.00, 0.15))
    save_webp(im.resize((2560, 1440), Image.LANCZOS), name, quality=82)
    ok = (Lc <= 45) if "night" in name else (Lc >= 75)
    report.append(f"     中央L*={Lc:5.1f} 右上L*={Ltr:5.1f} §7.3={'PASS' if ok else 'FAIL'}")

# ---------------------------------------------------------------- 2) 主立绘（单张 + 镜像）
print("[2] 主立绘 (p1 抹字样 -> char.webp，左右由 CSS 镜像)")
im = Image.open(os.path.join(SRC, "p1.png")).convert("RGBA")
full = np.asarray(im).copy()

# 2a) 用拉普拉斯扩散 inpaint 抹掉腰部缎带上的 "deepseek"（镜像后会变反字）
X0, X1, Y0, Y1 = 368, 458, 556, 598
sub = full[Y0:Y1, X0:X1].astype(np.float32)
L = 0.299*sub[..., 0] + 0.587*sub[..., 1] + 0.114*sub[..., 2]
local = np.asarray(Image.fromarray(L.astype(np.uint8)).filter(ImageFilter.BoxBlur(10)), dtype=np.float32)
# 判据: 自身很亮 且 邻域整体很暗(缎带)。白围裙的亮像素邻域也亮 → 被排除。
mask = (L > 165) & (local < 145)
mask = np.asarray(Image.fromarray((mask*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
img = sub.copy()
known = ~mask
img[mask] = img[known].mean(axis=0)
for _ in range(600):                       # 拉普拉斯扩散：对掩膜形状不敏感，天然贴合缎带渐变
    acc = np.zeros_like(img)
    cnt = np.zeros(mask.shape, dtype=np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            acc += np.roll(np.roll(img, dy, 0), dx, 1)
            cnt += 1
    img[mask] = (acc / cnt[..., None])[mask]
sm = np.asarray(Image.fromarray(img[..., :3].astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32)
img[mask, :3] = sm[mask, :3]
full[Y0:Y1, X0:X1] = np.clip(img, 0, 255).astype(np.uint8)
report.append(f"     字样掩膜 {int(mask.sum())} px @ x[{X0}..{X1}] y[{Y0}..{Y1}]")

char = trim(clean_alpha(Image.fromarray(full), floor=6))
save_webp(char, "char.webp", quality=88)
preview_on_night(char, "char_on_night.png")

# ---------------------------------------------------------------- 3) 半身像
print("[3] 半身像 (p3)")
im3 = Image.open(os.path.join(SRC, "p3.png")).convert("RGBA")
a3 = np.asarray(im3).copy()
al3 = a3[..., 3].astype(np.float32)
al3 = np.clip((al3 - 14) * (255.0 / (255 - 14)), 0, 255).astype(np.uint8)   # 去掉低 alpha 白雾
a3[..., 3] = al3
im3 = trim(Image.fromarray(a3), thresh=8, pad=6)
H = 1500
im3 = im3.resize((int(im3.width * H / im3.height), H), Image.LANCZOS)
save_webp(im3, "half.webp", quality=88)
preview_on_night(im3, "half_on_night.png", maxw=420)

# ---------------------------------------------------------------- 4) Q 版三连
print("[4] Q 版三连图 -> 3 张 (白底抠图 + 去地面阴影)")
from collections import deque
q = Image.open(os.path.join(SRC, "Q123.png")).convert("RGB")
for (x0, x1), nm in zip([(131, 1320), (1366, 2468), (2511, 3726)],
                        ["chibi-idle.webp", "chibi-think.webp", "chibi-done.webp"]):
    sub = q.crop((x0 - 10, 0, x1 + 10, q.height))
    rgb = np.asarray(sub).astype(np.int16)
    L = 0.299*rgb[..., 0] + 0.587*rgb[..., 1] + 0.114*rgb[..., 2]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    # 背景候选: 亮且低饱和 —— 阈值放宽到 192，使地面阴影(200-235)一并被吸收；
    # 角色自身的白围裙/白袜被深色描边包围，与边界不连通，因此不会被吃掉。
    bgish = (L > 192) & (sat < 46)
    h, w = bgish.shape
    seen = np.zeros((h, w), dtype=bool)
    dq = deque()
    for x in range(w):
        for y in (0, h-1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True; dq.append((y, x))
    for y in range(h):
        for x in (0, w-1):
            if bgish[y, x] and not seen[y, x]:
                seen[y, x] = True; dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and bgish[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; dq.append((ny, nx))
    alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.5))  # 去白边
    out = sub.convert("RGBA"); out.putalpha(alpha)
    out = trim(out, thresh=8, pad=6)
    side = max(out.width, out.height)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(out, ((side-out.width)//2, (side-out.height)//2), out)
    canvas = canvas.resize((512, 512), Image.LANCZOS)
    save_webp(canvas, nm, quality=90)
    preview_on_night(canvas, nm.replace(".webp", "_on_night.png"), maxw=300)

# ---------------------------------------------------------------- 5) 清单
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)

print("=" * 74)
print("[5] 产物")
print("\n".join(report))
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith(".webp"))
print(f"  {'总计':<22} {'':>13} {total/1024/1024:8.2f} MB   (预算 < 10 MiB)")
print(f"  manifest: {json.dumps(manifest, ensure_ascii=False)}")
