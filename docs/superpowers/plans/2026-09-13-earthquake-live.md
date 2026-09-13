# earthquake-live 全球地震带实时分布课件 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 GeoBox 新增第 5 个预置课件「全球地震带实时分布」——USGS 真实数据 + 2D/3D 双视图 + 四环节教学引导,离线可降级。

**Architecture:** 标准课件包 `courseware/earthquake-live/`(manifest + index.html + css + js),沿用现有课件约定:Canvas 2D 主视图复用时区换算器模式,3D 视图复用晨昏线的 three.js 模式。数据三层回退:USGS 实时 → `window.geobox.storage` 缓存 → 包内快照。主程序 `src/` 零改动(播种与打包自动覆盖新目录)。

**Tech Stack:** 原生 HTML/Canvas 2D、three.js 0.160(postinstall 复制运行时)、node:test(数据层单测)、USGS GeoJSON feed、PB2002 板块边界。

**Spec:** `docs/superpowers/specs/2026-09-13-earthquake-live-design.md`(必须遵守)

## Global Constraints

- 白色主题;中文字体栈 `"PingFang SC","Microsoft YaHei",sans-serif`;禁止中文斜体
- 触控优先:可点目标 ≥ 44px;同时支持鼠标与触摸(用 Pointer Events)
- 地震点语义色:小震(<4.5)琥珀 `#d97706`、中强震(4.5–6)橙红 `#ea580c`、强震(≥6)红 `#dc2626`(由参考琥珀 #fbbf24 / 红 #f87171 派生,白底加深保证投影可读)
- 尊重 `prefers-reduced-motion`:开启时跳过大动画,直接呈现终态
- three.js 运行时文件(`assets/three.module.min.js`、`assets/OrbitControls.js`)由 `scripts/copy-three.js` 生成,**不入库、不手写**
- manifest 版本 `1.0.0`,`permissions: []`;不改 `src/` 下任何文件
- 中国地震带为手绘示意折线,UI 上必须标注「示意」
- 所有 fetch 必须有超时(8s)与回退,绝不弹窗打断授课

---

### Task 1: 数据准备脚本与内置数据

**Files:**
- Create: `scripts/fetch-data.js`
- Create: `scripts/fetch-data.test.mjs`
- Create: `courseware/earthquake-live/data/china-belts.json`
- Generate(脚本产出,入库): `courseware/earthquake-live/data/quakes-snapshot.json`、`courseware/earthquake-live/data/plates.min.geojson`

**Interfaces:**
- Produces: `quakes-snapshot.json` = `{ fetchedAt: number, quakes: Quake[] }`;`Quake = { id:string, mag:number, place:string, time:number, lon:number, lat:number, depth:number, tsunami:number }`
- Produces: `plates.min.geojson` = FeatureCollection(LineString),properties 至少保留 `LAYER`(边界类型,如 subduction zone / mid-ocean ridge / transform)
- Produces: `china-belts.json` = `{ note:"示意", belts: [{ name:string, path: [ [lon,lat], ... ] }] }`(5 条)

- [ ] **Step 1: 写失败测试**

`scripts/fetch-data.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { slimQuake, validateSnapshot, validatePlates, validateChinaBelts } from './fetch-data.js'

test('slimQuake 精简 USGS feature 并丢弃无效记录', () => {
  const f = {
    id: 'us7000abcd',
    properties: { mag: 5.2, place: '10km S of X', time: 1757000000000, tsunami: 0, extra: 'drop-me' },
    geometry: { coordinates: [130.5, 32.1, 40.2] }
  }
  assert.deepEqual(slimQuake(f), {
    id: 'us7000abcd', mag: 5.2, place: '10km S of X',
    time: 1757000000000, lon: 130.5, lat: 32.1, depth: 40.2, tsunami: 0
  })
  assert.equal(slimQuake({ properties: { mag: null }, geometry: { coordinates: [1, 2, 3] } }), null)
  assert.equal(slimQuake({ properties: { mag: 4 }, geometry: { coordinates: [999, 2, 3] } }), null) // 经度越界
})

test('validateSnapshot 校验快照结构', () => {
  const good = { fetchedAt: 1757000000000, quakes: [{ id: 'a', mag: 3, place: 'p', time: 1, lon: 100, lat: 30, depth: 10, tsunami: 0 }] }
  assert.equal(validateSnapshot(good), true)
  assert.equal(validateSnapshot({ fetchedAt: 1, quakes: [] }), false)
  assert.equal(validateSnapshot({ quakes: good.quakes }), false)
})

test('validatePlates / validateChinaBelts', () => {
  assert.equal(validatePlates({ type: 'FeatureCollection', features: new Array(60).fill(0).map((_, i) => ({ type: 'Feature', properties: { LAYER: 'subduction zone' }, geometry: { type: 'LineString', coordinates: [[i, 0], [i + 1, 1]] } })) }), true)
  assert.equal(validatePlates({ type: 'FeatureCollection', features: [] }), false)
  assert.equal(validateChinaBelts({ note: '示意', belts: [{ name: '南北地震带', path: [[100, 30], [101, 31]] }] }), true)
  assert.equal(validateChinaBelts({ belts: [] }), false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/fetch-data.test.mjs`
Expected: FAIL(`Cannot find module './fetch-data.js'`)

- [ ] **Step 3: 实现 fetch-data.js**

`scripts/fetch-data.js`(CommonJS/ESM 双兼容,顶部判断;核心代码):

```js
// 开发期数据准备:抓取 USGS 近30天地震快照 + PB2002 板块边界,精简后写入课件 data/
// 用法:node scripts/fetch-data.js
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'courseware', 'earthquake-live', 'data')
const USGS_MONTH = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'
const PB2002 = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'

function slimQuake(f) {
  const p = f?.properties ?? {}
  const c = f?.geometry?.coordinates
  if (typeof p.mag !== 'number' || !Array.isArray(c) || c.length < 3) return null
  const [lon, lat, depth] = c
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null
  return { id: String(f.id ?? ''), mag: p.mag, place: String(p.place ?? ''), time: p.time ?? 0, lon, lat, depth, tsunami: p.tsunami ?? 0 }
}

function validateSnapshot(s) {
  return !!s && typeof s.fetchedAt === 'number' && Array.isArray(s.quakes) && s.quakes.length > 0
    && s.quakes.every((q) => typeof q.lon === 'number' && typeof q.lat === 'number' && typeof q.mag === 'number')
}
function validatePlates(g) {
  return !!g && g.type === 'FeatureCollection' && Array.isArray(g.features) && g.features.length > 0
    && g.features.every((f) => f.geometry && Array.isArray(f.geometry.coordinates))
}
function validateChinaBelts(d) {
  return !!d && Array.isArray(d.belts) && d.belts.length > 0
    && d.belts.every((b) => b.name && Array.isArray(b.path) && b.path.length >= 2)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  // 1) 地震快照(近 30 天,M≥2.5)
  const res = await fetch(USGS_MONTH)
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`)
  const feed = await res.json()
  const quakes = feed.features.map(slimQuake).filter(Boolean)
  const snapshot = { fetchedAt: Date.now(), quakes }
  if (!validateSnapshot(snapshot)) throw new Error('快照校验失败')
  writeFileSync(join(OUT, 'quakes-snapshot.json'), JSON.stringify(snapshot))
  console.log(`[fetch-data] 快照 ${quakes.length} 条`)

  // 2) PB2002 板块边界:保留 geometry + LAYER 属性
  const res2 = await fetch(PB2002)
  if (!res2.ok) throw new Error(`PB2002 HTTP ${res2.status}`)
  const raw = await res2.json()
  const plates = {
    type: 'FeatureCollection',
    features: raw.features.map((f) => ({
      type: 'Feature',
      properties: { LAYER: f.properties?.LAYER ?? f.properties?.Name ?? 'boundary' },
      geometry: f.geometry
    }))
  }
  if (!validatePlates(plates)) throw new Error('板块边界校验失败')
  writeFileSync(join(OUT, 'plates.min.geojson'), JSON.stringify(plates))
  console.log(`[fetch-data] 板块边界 ${plates.features.length} 条`)
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1) })
module.exports = { slimQuake, validateSnapshot, validatePlates, validateChinaBelts }
```

注意:`scripts/fetch-data.test.mjs` 是 ESM,import CJS 时 named import 依赖 cjs-module-lexer;若 named import 失败,测试文件改为 `import pkg from './fetch-data.js'; const { slimQuake, ... } = pkg`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test scripts/fetch-data.test.mjs`
Expected: 3 tests PASS

- [ ] **Step 5: 手写 china-belts.json**

`courseware/earthquake-live/data/china-belts.json`——5 条中国主要地震带的**示意折线**(依据公开出版的中国地震带分布图手工描绘,注明示意):

```json
{
  "note": "示意:依据公开出版的中国地震带分布图手工描绘,仅用于教学演示",
  "belts": [
    { "name": "南北地震带", "path": [[104, 38.5], [103.5, 36], [102.5, 33.5], [101.5, 31], [102, 28.5], [103, 26], [103.5, 24]] },
    { "name": "天山地震带", "path": [[75, 41.5], [80, 42.5], [85, 43.5], [90, 44], [95, 43.8]] },
    { "name": "青藏高原地震区", "path": [[78, 35], [82, 33], [87, 31.5], [92, 30], [97, 29.5], [100, 30]] },
    { "name": "华北地震带", "path": [[106, 40.5], [111, 40], [114.5, 39], [117.5, 38.5], [120, 37]] },
    { "name": "东南沿海地震带", "path": [[110, 21], [113, 22.5], [116, 23.5], [119, 25], [120.5, 27]] }
  ]
}
```

- [ ] **Step 6: 运行脚本生成真实数据并校验**

Run: `node scripts/fetch-data.js && node -e "const s=require('./courseware/earthquake-live/data/quakes-snapshot.json');const p=require('./courseware/earthquake-live/data/plates.min.geojson');console.log('quakes',s.quakes.length,'plates',p.features.length)"`
Expected: 输出抓取条数;quakes 约 1000–6000 条,plates 约 50–60 条
(网络失败时重试;PB2002 源若失效,fallback:在仓库检索其他 PB2002 GeoJSON 镜像,并在本计划记录实际使用的 URL)

- [ ] **Step 7: Commit**

```bash
git add scripts/fetch-data.js scripts/fetch-data.test.mjs courseware/earthquake-live/data/
git commit -m "feat(earthquake): 数据准备脚本 + 真实地震快照/PB2002板块边界/中国地震带示意"
```

---

### Task 2: 课件骨架(manifest + index.html + css)

**Files:**
- Create: `courseware/earthquake-live/manifest.json`
- Create: `courseware/earthquake-live/index.html`
- Create: `courseware/earthquake-live/css/style.css`

**Interfaces:**
- Produces: DOM id 契约供 js 使用——`#phaseTabs`(内含 4 个 `button[data-phase="observe|pattern|cause|safety"]`)、`#rangeBtns`(3 个 `button[data-range="day|week|month"]`)、`#viewToggle`、`#mapCanvas`、`#globeBox`(初始 hidden)、`#detail`、`#ticker`、`#badge`、`#legend`、`#caption`
- Produces: manifest id `earthquake-live`,供播种自动识别

- [ ] **Step 1: 写 manifest.json**

```json
{
  "id": "earthquake-live",
  "name": "全球地震带·实时分布",
  "author": "GeoBox 官方",
  "version": "1.0.0",
  "subject": "地理",
  "tags": ["地震", "板块构造", "自然灾害", "实时数据", "预置", "高中"],
  "entry": "index.html",
  "permissions": []
}
```

- [ ] **Step 2: 写 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>全球地震带·实时分布</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header id="topbar">
    <h1>全球地震带·实时分布</h1>
    <nav id="phaseTabs" aria-label="教学环节">
      <button data-phase="observe" class="active">① 观察</button>
      <button data-phase="pattern">② 规律</button>
      <button data-phase="cause">③ 成因</button>
      <button data-phase="safety">④ 防震</button>
    </nav>
    <div id="controls">
      <div id="rangeBtns" role="group" aria-label="时间范围">
        <button data-range="day">24小时</button>
        <button data-range="week" class="active">7天</button>
        <button data-range="month">30天</button>
      </div>
      <button id="viewToggle" aria-label="切换三维地球">🌐 3D</button>
    </div>
  </header>

  <div id="ticker" aria-live="off"><span id="tickerText"></span></div>

  <main id="stage">
    <canvas id="mapCanvas"></canvas>
    <div id="globeBox" hidden></div>
    <div id="detail" hidden></div>
    <div id="caption"></div>
    <div id="legend">
      <span><i class="dot" style="background:#d97706"></i>&lt;4.5级</span>
      <span><i class="dot" style="background:#ea580c"></i>4.5–6级</span>
      <span><i class="dot" style="background:#dc2626"></i>≥6级</span>
      <span class="ripple-hint"><i class="ring"></i>最新地震</span>
    </div>
    <div id="badge">数据来源 …</div>
  </main>

  <script src="js/data.js"></script>
  <script src="js/map.js"></script>
  <script src="js/phases.js"></script>
  <script type="module" src="js/globe.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: 写 css/style.css**

完整样式要点(直接写入文件,约 200 行):
- `body`:白底 `#fafaf8`,字体栈 `"PingFang SC","Microsoft YaHei",sans-serif`,全屏 flex 纵向布局,禁止用户选中文本
- `#topbar`:56px 高,白底 + 底部 1px 发线 `#e5e2db`;标题 20px/600;环节页签按钮 ≥44px 高,激活态为深灰底白字圆角胶囊(不用彩色药丸)
- `#rangeBtns button`、`#viewToggle`:≥44px 触控目标,激活态黑色描边加粗
- `#ticker`:34px 高,米白 `#f4f2ec`,内文横向滚动动画(`@keyframes tickerScroll`,`animation: tickerScroll 60s linear infinite`,`:hover`/`:active` 时 `animation-play-state: paused`)
- `#stage`:`flex:1; position:relative; min-height:0`(防止 canvas 不撑开的老坑)
- `#mapCanvas`:`position:absolute; inset:0; width:100%; height:100%; touch-action:none`
- `#globeBox`:同 `#mapCanvas` 定位,白底
- `#detail`:绝对定位卡片,白底、1px 发线边框、12px 圆角、柔和投影,内含震级大字 + 字段行
- `#legend`:左下角,白底 90% 透明,`.dot` 为 12px 圆点,`.ring` 为空心圆环示意
- `#badge`:右下角,12px 灰字
- `#caption`:顶部居中教学提示条(如"地震分布均匀吗?找找它们集中在哪里"),米白底圆角
- `@media (prefers-reduced-motion: reduce)` 下 `#tickerText` 动画关闭

- [ ] **Step 4: 验证骨架可打开**

Run: `npm run dev` 启动后,在 GeoBox 课件库中应能看到新课件卡片(播种自动识别);此时 JS 还未写,点开为空白属正常,只要**库列表出现卡片且控制台无 manifest 报错**即通过。

- [ ] **Step 5: Commit**

```bash
git add courseware/earthquake-live/manifest.json courseware/earthquake-live/index.html courseware/earthquake-live/css/
git commit -m "feat(earthquake): 课件骨架 — manifest/四环节页签/图例/滚动条布局"
```

---

### Task 3: js/data.js 数据层 + 单测(TDD)

**Files:**
- Create: `courseware/earthquake-live/js/data.js`
- Create: `courseware/earthquake-live/dev/data.test.mjs`

**Interfaces:**
- Consumes: `Quake` 结构(Task 1)
- Produces: `window.QuakeData = { loadQuakes(range, deps?), normalizeFeature(f), FEEDS }`
  - `range`: `'day' | 'week' | 'month'`
  - `deps`: `{ fetchImpl?, storageGet?, storageSet?, snapshotLoader? }`(测试注入用,缺省走浏览器实现)
  - 返回 `Promise<{ list: Quake[], source: 'live'|'cache'|'snapshot', fetchedAt: number }>`

- [ ] **Step 1: 写失败测试**

`courseware/earthquake-live/dev/data.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadQuakes, normalizeFeature } = require('../js/data.js')

const okFeature = { id: 'x1', properties: { mag: 5.1, place: 'Test', time: 1000, tsunami: 0 }, geometry: { coordinates: [120, 30, 15] } }
const snapshot = { fetchedAt: 900, quakes: [normalizeFeature(okFeature)] }

test('normalizeFeature 与快照 slim 结构一致', () => {
  assert.deepEqual(normalizeFeature(okFeature), { id: 'x1', mag: 5.1, place: 'Test', time: 1000, lon: 120, lat: 30, depth: 15, tsunami: 0 })
})

test('网络成功 → source=live 且写入缓存', async () => {
  let saved = null
  const r = await loadQuakes('day', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ features: [okFeature] }) }),
    storageGet: async () => null,
    storageSet: async (k, v) => { saved = v },
    snapshotLoader: async () => snapshot
  })
  assert.equal(r.source, 'live')
  assert.equal(r.list.length, 1)
  assert.ok(saved && saved.includes('x1'))
})

test('网络失败且有缓存 → source=cache', async () => {
  const r = await loadQuakes('day', {
    fetchImpl: async () => { throw new Error('offline') },
    storageGet: async () => JSON.stringify({ fetchedAt: 800, quakes: [normalizeFeature(okFeature)] }),
    storageSet: async () => {},
    snapshotLoader: async () => snapshot
  })
  assert.equal(r.source, 'cache')
  assert.equal(r.fetchedAt, 800)
})

test('网络与缓存都失败 → source=snapshot 兜底', async () => {
  const r = await loadQuakes('day', {
    fetchImpl: async () => { throw new Error('offline') },
    storageGet: async () => null,
    storageSet: async () => {},
    snapshotLoader: async () => snapshot
  })
  assert.equal(r.source, 'snapshot')
  assert.equal(r.fetchedAt, 900)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test courseware/earthquake-live/dev/data.test.mjs`
Expected: FAIL(`Cannot find module '../js/data.js'`)

- [ ] **Step 3: 实现 data.js**

```js
// 全球地震带·实时分布 — 数据层:USGS 实时 → geobox.storage 缓存 → 包内快照,三级回退
(function (root) {
  const FEEDS = {
    day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'
  }

  function normalizeFeature(f) {
    const p = f?.properties ?? {}
    const c = f?.geometry?.coordinates
    if (typeof p.mag !== 'number' || !Array.isArray(c) || c.length < 3) return null
    const [lon, lat, depth] = c
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null
    return { id: String(f.id ?? ''), mag: p.mag, place: String(p.place ?? ''), time: p.time ?? 0, lon, lat, depth, tsunami: p.tsunami ?? 0 }
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
  }

  async function defaultSnapshotLoader() {
    const res = await fetch('./data/quakes-snapshot.json')
    if (!res.ok) throw new Error('snapshot http ' + res.status)
    return res.json()
  }

  async function loadQuakes(range, deps = {}) {
    const fetchImpl = deps.fetchImpl ?? ((u) => withTimeout(fetch(u), 8000))
    const storageGet = deps.storageGet ?? (async (k) => (root.geobox ? root.geobox.storage.get(k) : null))
    const storageSet = deps.storageSet ?? (async (k, v) => { if (root.geobox) await root.geobox.storage.set(k, v) })
    const snapshotLoader = deps.snapshotLoader ?? defaultSnapshotLoader
    const cacheKey = `quake-cache-${range}`

    try {
      const res = await fetchImpl(FEEDS[range])
      if (!res.ok) throw new Error('http ' + res.status)
      const feed = await res.json()
      const list = feed.features.map(normalizeFeature).filter(Boolean)
      if (!list.length) throw new Error('empty feed')
      const payload = { fetchedAt: Date.now(), quakes: list }
      try { await storageSet(cacheKey, JSON.stringify(payload)) } catch { /* 缓存失败不阻断 */ }
      return { list, source: 'live', fetchedAt: payload.fetchedAt }
    } catch { /* 落入下一级 */ }

    try {
      const cached = await storageGet(cacheKey)
      if (cached) {
        const payload = JSON.parse(cached)
        if (Array.isArray(payload.quakes) && payload.quakes.length) {
          return { list: payload.quakes, source: 'cache', fetchedAt: payload.fetchedAt }
        }
      }
    } catch { /* 落入下一级 */ }

    const snap = await snapshotLoader()
    return { list: snap.quakes, source: 'snapshot', fetchedAt: snap.fetchedAt }
  }

  const api = { FEEDS, normalizeFeature, loadQuakes }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.QuakeData = api
})(typeof window !== 'undefined' ? window : globalThis)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test courseware/earthquake-live/dev/data.test.mjs`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add courseware/earthquake-live/js/data.js courseware/earthquake-live/dev/
git commit -m "feat(earthquake): 数据层 — USGS实时/缓存/快照三级回退 + 单测"
```

---

### Task 4: js/map.js 2D 地图视图

**Files:**
- Create: `courseware/earthquake-live/js/map.js`
- Copy: `courseware/timezone-converter/data/earth.jpg` → `courseware/earthquake-live/data/earth.jpg`

**Interfaces:**
- Consumes: `Quake`(Task 1)、DOM `#mapCanvas`(Task 2)
- Produces: `window.QuakeMap = { createMap(canvas, hooks) }`,返回:
  - `setData({ quakes, plates, chinaBelts })`
  - `setPhase(phase)` — `'observe'|'pattern'|'cause'|'safety'`,控制图层可见性与摄像机
  - `revealAnimated()` — 地震点按时间级联点亮(reduced-motion 时直接全量)
  - `drawBoundariesAnimated()` — 板块边界流光绘出(reduced-motion 时直接全绘)
  - `onPick(cb)` — 点击命中地震时回调 `cb(quake|null)`
  - `resize()`

- [ ] **Step 1: 复制底图**

Run: `cp courseware/timezone-converter/data/earth.jpg courseware/earthquake-live/data/earth.jpg`

- [ ] **Step 2: 实现 map.js**

结构(完整实现,约 380 行;关键算法如下,不得简化):

```js
// 全球地震带·实时分布 — 2D 世界地图视图(等距圆柱投影,Canvas 2D)
(function (root) {
  const MAG_COLORS = [
    { min: 6, color: '#dc2626' },
    { min: 4.5, color: '#ea580c' },
    { min: -99, color: '#d97706' }
  ]
  const magColor = (m) => MAG_COLORS.find((c) => m >= c.min).color
  const magRadius = (m, scale) => Math.max(3, (m - 1.5) * 2.2) * Math.sqrt(scale)

  function createMap(canvas, hooks = {}) {
    const ctx = canvas.getContext('2d')
    // 视图状态:等距圆柱投影 x=(lon+180)/360*W*scale+ox, y=(90-lat)/180*H*scale+oy
    const view = { scale: 1, ox: 0, oy: 0, tScale: 1, tOx: 0, tOy: 0 } // t* 为动画目标
    let W = 0, H = 0, dpr = 1
    let quakes = [], plates = null, chinaBelts = null
    let phase = 'observe'
    let revealT = 1 // 0→1 级联点亮进度
    let boundaryT = 1 // 0→1 板块边界绘出进度
    let pickHandler = null
    let earthImg = new Image(), earthReady = false
    earthImg.onload = () => { earthReady = true }
    earthImg.src = './data/earth.jpg'

    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches

    function resize() {
      const r = canvas.getBoundingClientRect()
      dpr = root.devicePixelRatio || 1
      W = r.width; H = r.height
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function lonLatToXY(lon, lat) {
      return [ (lon + 180) / 360 * W * view.scale + view.ox,
               (90 - lat) / 180 * H * view.scale + view.oy ]
    }

    // 平移缩放:Pointer Events,单指拖动,双指捏合,wheel 缩放
    // (实现要点:pointerdown 缓存 active pointers;两指时按间距比缩放并以中点为锚;
    //  scale 限制 [1, 8];缩放后调用 clampView 保证图幅不拖出窗口)

    // 绘制顺序:底图(含米白柔光罩 rgba(250,248,244,0.18)) → 板块边界(phase==='cause' 或 boundaryT<1 时)
    //   → 中国地震带示意(phase==='safety',虚线 strokeStyle '#7c5cbf',setLineDash([6,4]),旁边标名称+「示意」)
    //   → 地震点(半径 magRadius,fillStyle magColor,白描边 1.5px;最新一条:同心圆涟漪,圆环半径随时间扩散、透明度衰减,3 环)
    //   → revealT<1 时只绘制时间排序后前 revealT*length 个点

    // drawBoundariesAnimated:boundaryT 从 0→1(约 1.2s),按 feature 索引顺序,
    //   每条 LineString 用 ctx.setLineDash([len]) + lineDashOffset = len*(1-t) 做流光扫过;完成后 setLineDash([])

    // setPhase:safety 时摄像机动画 flyTo(105, 33, 2.2)(中国区域);observe/pattern 回到 (0,10,1.05)
    //   动画 = 每帧 view 向 t* 插值(lerp 0.12);reduced 时直接赋值

    // pick(x,y):按半径从大到小遍历,命中距离 < r+6 即返回该 quake(触控容错)

    // 主循环:requestAnimationFrame;只在 dirty 或动画进行中重绘;无动画时停帧省电

    return { setData(d){ quakes = d.quakes ?? []; plates = d.plates ?? null; chinaBelts = d.chinaBelts ?? null },
             setPhase(p){ phase = p /* + flyTo 目标 */ },
             revealAnimated(){ revealT = reduced ? 1 : 0 },
             drawBoundariesAnimated(){ boundaryT = reduced ? 1 : 0 },
             onPick(cb){ pickHandler = cb },
             resize }
  }

  root.QuakeMap = { createMap }
})(window)
```

注意:上面是**带完整算法要点的结构稿**,实现时必须补全注释处的事件与绘制代码;投影公式、配色、涟漪、流光、级联点亮、flyTo 参数均为验收项,不得删减。

- [ ] **Step 3: 浏览器验证**

在 `npm run dev` 中打开课件(app.js 未写完前,可在 index.html 临时加内联脚本:new 一个 map,setData 用 snapshot 前 200 条)。用 `_shot.js` 模式截图,人工确认:白底地图、三色点、图例、页签都在。

- [ ] **Step 4: Commit**

```bash
git add courseware/earthquake-live/js/map.js courseware/earthquake-live/data/earth.jpg
git commit -m "feat(earthquake): 2D世界地图视图 — 三色震级点/涟漪/板块边界流光/捏合缩放"
```

---

### Task 5: js/phases.js 环节状态机 + 滚动条

**Files:**
- Create: `courseware/earthquake-live/js/phases.js`

**Interfaces:**
- Consumes: `QuakeMap.createMap` 返回值(Task 4)、DOM(Task 2)
- Produces: `window.QuakePhases = { createPhases({ map, dom, onAutoRange }) }` → `{ go(id), current() }`
  - `dom` = `{ tabs, rangeBtns, caption, tickerText, detail }` 元素引用
  - `onAutoRange(range)` — 环节要求切换时间范围时回调(由 app.js 注入)

- [ ] **Step 1: 实现 phases.js**

环节配置(内容与视觉编排,写入代码):

```js
const PHASES = {
  observe: { caption: '这是刚刚过去、真实发生的地震。它们分布均匀吗?',
             layers: { boundaries: false, chinaBelts: false } },
  pattern: { caption: '切换到30天——地震集中在什么地方?像不像几条带子?',
             layers: { boundaries: false, chinaBelts: false }, autoRange: 'month' },
  cause:   { caption: '叠加板块边界——你发现了什么?(注意:板块边界不等于海岸线)',
             layers: { boundaries: true, chinaBelts: false } },
  safety:  { caption: '我国地处两大地震带交汇处。中国地震带(示意)在哪里?震级≠烈度,如何应对?',
             layers: { boundaries: true, chinaBelts: true } }
}
```

`go(id)`:切换页签激活态 → 写入 caption → `map.setPhase(id)` → `cause` 时调用 `map.drawBoundariesAnimated()`;`observe/pattern` 时调用 `map.revealAnimated()`;`autoRange` 时调用注入的 `onAutoRange(range)`。

滚动条:`updateTicker(quakes)` 取时间最新 10 条,格式 `M4.6 · 日本本州东南近海 · 12分钟前`,用 ` · ` 连接;`tickerText` 内容重复两遍以支撑无缝滚动。

- [ ] **Step 2: Commit**

```bash
git add courseware/earthquake-live/js/phases.js
git commit -m "feat(earthquake): 四环节状态机 + 最近地震滚动条"
```

---

### Task 6: js/globe.js 3D 地球视图

**Files:**
- Create: `courseware/earthquake-live/js/globe.js`
- Modify: `scripts/copy-three.js`(coursewares 列表加 `'earthquake-live'`)
- Copy: `courseware/earth-terminator/assets/earth.jpg` → `courseware/earthquake-live/assets/earth.jpg`
- Run: `node scripts/copy-three.js` 生成 three 运行时

**Interfaces:**
- Consumes: `Quake`(Task 1)
- Produces: ES module 默认导出 `createGlobe(container)` → `{ setQuakes(list), show(), hide(), enabled }`;WebGL 不可用时 `enabled=false`,app.js 据此隐藏 `#viewToggle`

- [ ] **Step 1: 复制贴图 + 更新 copy-three.js + 生成运行时**

```bash
cp courseware/earth-terminator/assets/earth.jpg courseware/earthquake-live/assets/earth.jpg
# 编辑 scripts/copy-three.js:const coursewares = ['contour-sandbox', 'earth-terminator', 'earthquake-live']
node scripts/copy-three.js
```

- [ ] **Step 2: 实现 globe.js**

要点(完整实现,约 200 行):
- `import * as THREE from '../assets/three.module.min.js'` + OrbitControls
- 球体:半径 1,`assets/earth.jpg` 贴图,MeshPhongMaterial;环境光 + 平行光
- 地震点:`THREE.Points`(BufferGeometry,顶点色用 Task 4 同款三色,`sizeAttenuation:true`),经纬→球面坐标:`phi=(90-lat)*π/180, theta=(lon+180)*π/180; x=-r sinφ cosθ, z=r sinφ sinθ, y=r cosφ`,r=1.01
- 自转:空闲时 `earth.rotation.y += 0.0006`;OrbitControls `enableDamping=true, dampingFactor=0.1, enablePan=false, minDistance=1.3, maxDistance=5`;每帧按相机距离缩放 `rotateSpeed = altitude*0.2, zoomSpeed = (altitude+1)*0.1`
- 拾取:Raycaster `params.Points.threshold = 0.02`,命中回调由 app.js 注入 `onPick`
- 切换:`show()` 恢复渲染循环,`hide()` 停止循环省电;2D↔3D 切换时容器 400ms 淡入淡出
- WebGL 检测:`try{ new THREE.WebGLRenderer() }catch{ enabled=false }`

- [ ] **Step 3: 截图验证(软件渲染)**

用 `_shot.js` 模式 + `SHOT_DISABLE_GPU=1` 截图,确认地球贴图、地震点、自转首帧正常。

- [ ] **Step 4: Commit**

```bash
git add courseware/earthquake-live/js/globe.js courseware/earthquake-live/assets/earth.jpg scripts/copy-three.js
git commit -m "feat(earthquake): 3D地球视图 — 惯性自转/阻尼交互/Points震点"
```

---

### Task 7: js/app.js 装配

**Files:**
- Create: `courseware/earthquake-live/js/app.js`

**Interfaces:**
- Consumes: `QuakeData.loadQuakes`、`QuakeMap.createMap`、`QuakePhases.createPhases`、`globe.js` 默认导出
- Produces: 无(顶层装配)

- [ ] **Step 1: 实现 app.js**

装配顺序:
1. 取 DOM 引用(Task 2 契约)
2. `QuakeMap.createMap(mapCanvas)`;`resize` 监听 window resize
3. 初始 `loadQuakes('week')` → `map.setData({ quakes, plates, chinaBelts })`(plates/chinaBelts 用 `fetch('./data/plates.min.geojson')`、`fetch('./data/china-belts.json')` 与 quakes 并行加载)
4. `#badge` 写入:`数据来源:USGS · 更新于 X 分钟前`(source=cache/snapshot 时注明「缓存/离线快照」)
5. 环节页签点击 → `phases.go(id)`;时间范围点击 → 重新 `loadQuakes(range)` + `revealAnimated()`;`onAutoRange` 注入
6. `#viewToggle` → 懒加载 globe(动态 `import('./js/globe.js')`),2D/3D 互切
7. `map.onPick` / globe `onPick` → 渲染 `#detail` 卡:震级大字(按三色)、地点、发震时刻(本地时区)、震源深度 km、距参考点距离(选做,若复杂则省略)、所在板块边界类型(cause 环节时显示,从最近 boundary feature 的 LAYER 推断,允许显示"—");点击空白处隐藏
8. 全部异步失败路径静默降级,不弹窗

- [ ] **Step 2: Commit**

```bash
git add courseware/earthquake-live/js/app.js
git commit -m "feat(earthquake): 装配层 — 数据加载/环节联动/详情卡/双视图切换"
```

---

### Task 8: 集成验证 + 播种 + 文档收尾

**Files:**
- Modify: `README.md`(内置课件表 + 致谢表)
- Modify: `docs/superpowers/specs/2026-09-13-earthquake-live-design.md`(如有实现偏差,回写)

- [ ] **Step 1: 全量截图走查(`_shot.js` 模式,逐场景)**

覆盖清单(对应设计文档 §八 验收):
1. observe 环节(week,有网)→ 快照
2. pattern 环节(month 级联点亮中)→ 快照
3. cause 环节(板块边界流光后)→ 快照
4. safety 环节(中国视图 + 地震带示意)→ 快照
5. 3D 视图(`SHOT_DISABLE_GPU=1`)→ 快照
6. **断网降级**:截图脚本 eval 中 `window.fetch = () => Promise.reject(new Error('offline'))` 后刷新,确认快照数据渲染 + badge 显示「离线快照」
7. 触控模拟:点击已知地震坐标,确认详情卡弹出
8. `prefers-reduced-motion` 模拟:确认无动画直接终态

- [ ] **Step 2: README 更新**

内置课件表加一行:`| 全球地震带·实时分布 | USGS 实时地震数据(离线快照兜底) · 2D/3D 双视图 · 板块边界叠加 · 四环节教学引导 |`
致谢表加两行:USGS Earthquake Hazards Program(地震数据,公有领域)、PB2002 板块边界(Bird 2003 / fraxen GeoJSON 镜像,公有领域)。

- [ ] **Step 3: 最终 Commit**

```bash
git add README.md docs/ courseware/earthquake-live/
git commit -m "feat(earthquake): 预置课件「全球地震带·实时分布」完成 — 四环节/双视图/三级数据回退"
```

- [ ] **Step 4: 推送**

```bash
git push origin main   # 网络抖动时重试数次
```

---

## 风险记录

| 风险 | 对策 |
|---|---|
| PB2002 镜像 URL 失效 | Task 1 Step 6 已写明 fallback;实现时先 curl HEAD 验证 |
| USGS 在教室网络被墙 | 三级回退保证可用;badge 诚实标注数据时间 |
| 希沃低配机 3D 掉帧 | WebGL 检测 + 2D 完整可用 + reduced-motion 降级 |
| 中国地震带手绘精度争议 | UI 与数据文件双层「示意」标注 |
