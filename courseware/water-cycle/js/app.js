// 水循环动态示意图 — 主程序（纯 Canvas 2D 矢量场景 + 粒子流）
const $ = (id) => document.getElementById(id)

// ---------- 环节定义（依据人教版必修一《水循环》） ----------
const PROCESSES = {
  evap: {
    name: '蒸发',
    color: '#7a7a7a',
    kind: 'vapor',
    baseRate: 5,
    path: [[0.16, 0.76], [0.14, 0.55], [0.15, 0.3]],
    labelAt: [0.07, 0.52],
    info: '液态水吸收太阳辐射能量变为水汽进入大气。太阳辐射是水循环的根本能量来源，海洋是大气水汽最主要的来源。'
  },
  transp: {
    name: '植物蒸腾',
    color: '#7a7a7a',
    kind: 'vapor',
    baseRate: 2.5,
    path: [[0.58, 0.58], [0.6, 0.42], [0.66, 0.28]],
    labelAt: [0.47, 0.38],
    info: '植物通过叶片气孔将体内水分以水汽形式释放到大气中。森林蒸腾量大，是陆地内循环的重要水汽来源。'
  },
  landEvap: {
    name: '陆地蒸发',
    color: '#7a7a7a',
    kind: 'vapor',
    baseRate: 2,
    path: [[0.9, 0.55], [0.88, 0.38], [0.8, 0.26]],
    labelAt: [0.9, 0.4],
    info: '陆地水面、土壤和冰雪表面的水分蒸发，与植物蒸腾一起为陆地内循环提供水汽。'
  },
  transport: {
    name: '水汽输送',
    color: '#7a7a7a',
    kind: 'vapor',
    baseRate: 4,
    path: [[0.16, 0.2], [0.45, 0.15], [0.72, 0.18]],
    labelAt: [0.42, 0.1],
    info: '水汽随大气运动由海洋上空输送到陆地上空，是海陆间循环的关键纽带。'
  },
  precipLand: {
    name: '降水',
    color: '#2b6cb0',
    kind: 'rain',
    baseRate: 7,
    path: [[0.72, 0.24], [0.74, 0.45]],
    labelAt: [0.81, 0.32],
    info: '水汽在上升冷却过程中凝结，以雨、雪、雹等形式降落到地表，是陆地淡水的主要来源。'
  },
  precipOcean: {
    name: '海上降水',
    color: '#2b6cb0',
    kind: 'rain',
    baseRate: 7,
    path: [[0.15, 0.26], [0.15, 0.74]],
    labelAt: [0.22, 0.5],
    info: '水汽在海洋上空凝结后直接降回海面，构成海上内循环——参与水量最大的水循环类型。'
  },
  runoff: {
    name: '地表径流',
    color: '#2b6cb0',
    kind: 'liquid',
    baseRate: 5,
    path: [[0.74, 0.45], [0.65, 0.62], [0.5, 0.71], [0.4, 0.78]],
    labelAt: [0.5, 0.8],
    info: '降落到地表的水沿坡面汇入河流，最终注入海洋或内陆湖泊。是人类活动影响最深的环节（修水库、跨流域调水）。'
  },
  infil: {
    name: '下渗',
    color: '#2b6cb0',
    kind: 'liquid',
    baseRate: 3,
    path: [[0.74, 0.45], [0.73, 0.58], [0.7, 0.68]],
    labelAt: [0.79, 0.58],
    info: '水渗入土壤和岩石空隙，补给地下水。植被覆盖好、降水强度小，下渗量就大。'
  },
  gflow: {
    name: '地下径流',
    color: '#2b6cb0',
    kind: 'liquid',
    baseRate: 3,
    path: [[0.7, 0.68], [0.55, 0.84], [0.4, 0.86]],
    labelAt: [0.56, 0.93],
    info: '地下水沿含水层缓慢流动，最终回归海洋或出露地表成为泉。流动缓慢但稳定，是河流枯水期的重要补给。'
  }
}

const CYCLES = {
  海陆间循环: ['evap', 'transport', 'precipLand', 'runoff', 'infil', 'gflow', 'transp'],
  海上内循环: ['evap', 'precipOcean'],
  陆地内循环: ['transp', 'landEvap', 'precipLand']
}

const state = {
  cycle: '海陆间循环',
  sun: 2, // 0弱 1中 2强
  playing: true,
  speed: 1,
  selected: null, // 高亮的环节 key
  particles: []
}

const SUN_NAMES = ['弱', '中', '强']
const SUN_MULT = [0.4, 0.7, 1.2]
const SPEED_VALUES = [0.5, 1, 2, 3.5]
const SPEED_NAMES = ['0.5×', '1×', '2×', '3.5×']

// ---------- 画布 ----------
const canvas = $('scene')
const ctx = canvas.getContext('2d')
let W = 0
let H = 0

const X = (x) => x * W
const Y = (y) => y * H

// 路径预计算：折线累计长度
const pathCache = new Map()
function pathMetrics(key) {
  if (pathCache.has(key)) return pathCache.get(key)
  const pts = PROCESSES[key].path
  const segs = []
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
    segs.push({ from: pts[i], to: pts[i + 1], len, start: total })
    total += len
  }
  const m = { segs, total }
  pathCache.set(key, m)
  return m
}

function pointAt(key, t) {
  const { segs, total } = pathMetrics(key)
  const d = t * total
  for (const s of segs) {
    if (d <= s.start + s.len) {
      const k = s.len === 0 ? 0 : (d - s.start) / s.len
      return [
        s.from[0] + (s.to[0] - s.from[0]) * k,
        s.from[1] + (s.to[1] - s.from[1]) * k
      ]
    }
  }
  return segs[segs.length - 1].to
}

// ---------- 粒子系统 ----------
let spawnAcc = new Map()

function stepParticles(dt) {
  const active = CYCLES[state.cycle]
  const sunMult = SUN_MULT[state.sun]
  for (const key of active) {
    const p = PROCESSES[key]
    // 蒸发类环节受太阳辐射直接驱动
    const driven = key === 'evap' || key === 'transp' || key === 'landEvap'
    const rate = p.baseRate * (driven ? sunMult : 1) * state.speed
    const acc = (spawnAcc.get(key) ?? 0) + rate * dt
    const n = Math.floor(acc)
    spawnAcc.set(key, acc - n)
    const count = state.particles.filter((x) => x.key === key).length
    for (let i = 0; i < n && count + i < 40; i++) {
      state.particles.push({ key, t: -Math.random() * 0.15, jitter: (Math.random() - 0.5) * 0.012 })
    }
  }
  for (const pt of state.particles) {
    pt.t += dt * 0.14 * state.speed
  }
  state.particles = state.particles.filter((pt) => pt.t < 1.02 && CYCLES[state.cycle].includes(pt.key))
}

function drawParticles() {
  for (const pt of state.particles) {
    if (pt.t < 0) continue
    const p = PROCESSES[pt.key]
    const [nx, ny] = pointAt(pt.key, pt.t)
    const x = X(nx + pt.jitter)
    const y = Y(ny)
    const dim = state.selected && state.selected !== pt.key
    // 生命周期淡入淡出
    const life = Math.sin(Math.min(Math.max(pt.t, 0), 1) * Math.PI)
    if (p.kind === 'rain') {
      ctx.strokeStyle = dim ? 'rgba(43,108,176,0.25)' : `rgba(43,108,176,${0.35 + life * 0.5})`
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 2, y + 9)
      ctx.stroke()
      // 落地溅落小水花
      if (pt.t > 0.9 && !dim) {
        const [ex, ey] = pointAt(pt.key, 1)
        const r = ((pt.t - 0.9) / 0.12) * 7
        ctx.beginPath()
        ctx.arc(X(ex), Y(ey), r, Math.PI, Math.PI * 2)
        ctx.strokeStyle = `rgba(43,108,176,${0.5 * (1 - (pt.t - 0.9) / 0.12)})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
    } else if (p.kind === 'vapor') {
      const a = dim ? 0.25 : 0.3 + life * 0.6
      ctx.beginPath()
      ctx.arc(x, y, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${a})`
      ctx.fill()
      ctx.strokeStyle = dim ? 'rgba(120,120,120,0.2)' : `rgba(120,120,120,${0.2 + life * 0.35})`
      ctx.lineWidth = 0.8
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = dim ? 'rgba(43,108,176,0.25)' : `rgba(43,108,176,${0.35 + life * 0.55})`
      ctx.fill()
    }
  }
}

// ---------- 手绘素材（Kenney Scribble Platformer, CC0） ----------
const IMGS = {}
{
  const list = {
    cloudA: 'cloud_a.png',
    cloudB: 'cloud_b.png',
    treeRound: 'tree_round.png',
    treePine: 'tree_pine.png',
    bush: 'bush.png',
    water: 'water_tile.png'
  }
  for (const [k, f] of Object.entries(list)) {
    const im = new Image()
    im.onload = () => (IMGS[k] = im)
    im.src = './assets/' + f
  }
}

// 确定性伪随机（每帧结果一致，画面不抖动）
function rnd(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// 手绘抖动折线路径：细分后加垂直扰动，端点不偏移保证接缝
function wobblePath(pts, { closed = false, amp = 3, seg = 7, seed = 0 } = {}) {
  const P = pts.map(([x, y]) => [X(x), Y(y)])
  const n = P.length
  const count = closed ? n : n - 1
  ctx.beginPath()
  let first = true
  for (let s = 0; s < count; s++) {
    const a = P[s]
    const b = P[(s + 1) % n]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    for (let i = 0; i <= seg; i++) {
      if (!first && i === 0) continue
      const t = i / seg
      const w = (rnd(seed + s * 31 + i * 7) - 0.5) * 2 * amp * Math.sin(t * Math.PI)
      const px = a[0] + dx * t + nx * w
      const py = a[1] + dy * t + ny * w
      if (first) {
        ctx.moveTo(px, py)
        first = false
      } else ctx.lineTo(px, py)
    }
  }
  if (closed) ctx.closePath()
}

// 手绘抖动圆
function wobbleCircle(cx, cy, r, seed) {
  ctx.beginPath()
  const N = 26
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2
    const rr = r + (rnd(seed + i * 13) - 0.5) * r * 0.14
    const px = cx + Math.cos(a) * rr
    const py = cy + Math.sin(a) * rr
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
}

function drawImageAt(img, nx, nyBottom, hNorm) {
  const h = hNorm * H
  const w = (h * img.width) / img.height
  ctx.drawImage(img, X(nx) - w / 2, Y(nyBottom) - h, w, h)
}

// ---------- 场景绘制 ----------
function drawScene(time) {
  // 纸面天空（淡蓝洗）
  const sky = ctx.createLinearGradient(0, 0, 0, Y(0.78))
  sky.addColorStop(0, '#dcebf5')
  sky.addColorStop(1, '#f7f5ef')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // 太阳（手绘：抖动圆盘 + 抖动光芒，辐射强度决定大小）
  const sunR = [26, 36, 48][state.sun]
  const sx = X(0.16)
  const sy = Y(0.11)
  const rayN = [6, 8, 12][state.sun]
  // 光晕（随辐射强度呼吸）
  const pulse = 1 + Math.sin(time * 0.001) * 0.06
  const halo = ctx.createRadialGradient(sx, sy, sunR * 0.6, sx, sy, sunR * 2.6 * pulse)
  halo.addColorStop(0, 'rgba(247,201,72,0.35)')
  halo.addColorStop(1, 'rgba(247,201,72,0)')
  ctx.fillStyle = halo
  ctx.fillRect(sx - sunR * 3, sy - sunR * 3, sunR * 6, sunR * 6)
  ctx.strokeStyle = '#e8a020'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (let i = 0; i < rayN; i++) {
    const a = (i / rayN) * Math.PI * 2 + time * 0.0002
    const r1 = sunR + 9
    const r2 = sunR + 24
    ctx.beginPath()
    const mx = sx + Math.cos(a) * ((r1 + r2) / 2)
    const my = sy + Math.sin(a) * ((r1 + r2) / 2)
    const off = (rnd(i * 17) - 0.5) * 6
    ctx.moveTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1)
    ctx.quadraticCurveTo(
      mx + Math.cos(a + Math.PI / 2) * off,
      my + Math.sin(a + Math.PI / 2) * off,
      sx + Math.cos(a) * r2,
      sy + Math.sin(a) * r2
    )
    ctx.stroke()
  }
  wobbleCircle(sx, sy, sunR, 99)
  ctx.fillStyle = '#f7c948'
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,38,38,0.75)'
  ctx.lineWidth = 3
  ctx.stroke()

  // 陆地（土黄平涂 + 手绘描边）
  const landTop = [[0.4, 0.78], [0.5, 0.7], [0.62, 0.55], [0.72, 0.42], [0.82, 0.6], [1, 0.58]]
  wobblePath([...landTop, [1, 1], [0.4, 1]], { closed: true, amp: 4, seed: 1 })
  ctx.fillStyle = '#e6d7b8'
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,38,38,0.7)'
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.stroke()

  // 地表草皮（沿地表线的粗绿描边）
  wobblePath(landTop, { amp: 3.5, seed: 5 })
  ctx.strokeStyle = '#8fae6e'
  ctx.lineWidth = 11
  ctx.lineCap = 'round'
  ctx.stroke()
  wobblePath(landTop, { amp: 3.5, seed: 5 })
  ctx.strokeStyle = 'rgba(38,38,38,0.35)'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 雪顶（白色抖动块）
  wobblePath(
    [[0.672, 0.49], [0.72, 0.42], [0.762, 0.505], [0.735, 0.49], [0.71, 0.51], [0.69, 0.485]],
    { closed: true, amp: 2.5, seed: 9 }
  )
  ctx.fillStyle = '#f7f9fa'
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,38,38,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 地下水位线（蓝色抖动虚线，缓慢流动）
  wobblePath([[0.42, 0.86], [0.55, 0.8], [0.7, 0.68], [0.85, 0.7], [1, 0.68]], { amp: 2.5, seed: 13 })
  ctx.strokeStyle = 'rgba(43,108,176,0.55)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([7, 5])
  ctx.lineDashOffset = -time * 0.008
  ctx.stroke()
  ctx.setLineDash([])

  // 河流（蓝色粗抖动线 + 白色高光 + 流动虚线）
  const river = [[0.78, 0.55], [0.66, 0.64], [0.55, 0.69], [0.46, 0.73], [0.4, 0.78]]
  wobblePath(river, { amp: 2.5, seed: 17 })
  ctx.strokeStyle = '#4a90c4'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  ctx.stroke()
  wobblePath(river, { amp: 2, seed: 18 })
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 2
  ctx.stroke()
  wobblePath(river, { amp: 2.5, seed: 17 })
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = 2.5
  ctx.setLineDash([10, 16])
  ctx.lineDashOffset = -time * 0.045
  ctx.stroke()
  ctx.setLineDash([])

  // 山体纹理（手绘短线条，增加细节）
  ctx.strokeStyle = 'rgba(38,38,38,0.18)'
  ctx.lineWidth = 1.4
  for (const [tx1, ty1, tx2, ty2, sd] of [
    [0.56, 0.63, 0.6, 0.6, 31],
    [0.64, 0.56, 0.68, 0.53, 32],
    [0.86, 0.62, 0.9, 0.61, 33],
    [0.5, 0.72, 0.54, 0.7, 34]
  ]) {
    wobblePath([[tx1, ty1], [tx2, ty2]], { amp: 1.5, seed: sd })
    ctx.stroke()
  }

  // 树与灌木（手绘素材，锚定底部）
  if (IMGS.treeRound) drawImageAt(IMGS.treeRound, 0.585, 0.645, 0.115)
  if (IMGS.treePine) drawImageAt(IMGS.treePine, 0.865, 0.6, 0.085)
  if (IMGS.bush) drawImageAt(IMGS.bush, 0.935, 0.585, 0.05)
  if (IMGS.treePine) drawImageAt(IMGS.treePine, 0.47, 0.735, 0.065)

  // 海洋（平涂蓝 + 手绘水纹图案 + 岸线）
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, Y(0.78), X(0.4), H - Y(0.78))
  ctx.clip()
  ctx.fillStyle = '#7fb3d9'
  ctx.fillRect(0, Y(0.78), X(0.4), H - Y(0.78))
  if (IMGS.water) {
    const pat = ctx.createPattern(IMGS.water, 'repeat')
    ctx.globalAlpha = 0.5
    ctx.fillStyle = pat
    ctx.fillRect(0, Y(0.78), X(0.4), H - Y(0.78))
    ctx.globalAlpha = 1
  }
  ctx.restore()
  // 海面动态波浪（两层不同相位缓慢漂移）
  for (const [wy, ph, alpha] of [[0.84, 0, 0.5], [0.92, 2.1, 0.35]]) {
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const wx = (i / 40) * X(0.38)
      const yy = Y(wy) + Math.sin(i * 0.7 + time * 0.0011 + ph) * 3.5
      if (i === 0) ctx.moveTo(wx, yy)
      else ctx.lineTo(wx, yy)
    }
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`
    ctx.lineWidth = 2
    ctx.stroke()
  }
  wobblePath([[0, 0.78], [0.4, 0.78]], { amp: 2.5, seed: 23 })
  ctx.strokeStyle = 'rgba(38,38,38,0.6)'
  ctx.lineWidth = 2.5
  ctx.stroke()

  // 飞鸟（手绘小弧线，缓慢横过天空）
  ctx.strokeStyle = 'rgba(38,38,38,0.5)'
  ctx.lineWidth = 1.6
  for (const [spd, by, bs, ph] of [[0.000008, 0.16, 1, 0], [0.000011, 0.24, 0.7, 2.4], [0.000006, 0.1, 0.85, 4.2]]) {
    const bx = (((time * spd + ph * 0.13) % 1.25) - 0.08) * W
    const byy = Y(by) + Math.sin(time * 0.001 + ph) * 4
    const flap = Math.sin(time * 0.008 + ph) * 3 * bs
    ctx.beginPath()
    ctx.moveTo(bx - 7 * bs, byy)
    ctx.quadraticCurveTo(bx - 2 * bs, byy - 5 * bs - flap, bx, byy)
    ctx.quadraticCurveTo(bx + 2 * bs, byy - 5 * bs - flap, bx + 7 * bs, byy)
    ctx.stroke()
  }

  // 云（手绘素材，水汽输送的云往返漂移）
  const drift = (Math.sin(time * 0.00035) + 1) / 2 // 0..1
  if (IMGS.cloudA) drawImageAt(IMGS.cloudA, 0.15, 0.26, 0.1)
  if (IMGS.cloudB) drawImageAt(IMGS.cloudB, 0.2 + drift * 0.45, 0.22, 0.085)
  if (IMGS.cloudA) drawImageAt(IMGS.cloudA, 0.72, 0.24, 0.12)

  // 环节标签
  const active = CYCLES[state.cycle]
  ctx.textAlign = 'left'
  for (const [key, p] of Object.entries(PROCESSES)) {
    if (!active.includes(key)) continue
    const [lx, ly] = p.labelAt
    const hl = state.selected === key
    ctx.font = `${hl ? 'bold ' : ''}12px "PingFang SC", "Microsoft YaHei", sans-serif`
    const tw = ctx.measureText(p.name).width
    ctx.fillStyle = hl ? '#262626' : 'rgba(250,248,244,0.85)'
    ctx.strokeStyle = hl ? '#262626' : 'rgba(38,38,38,0.3)'
    ctx.lineWidth = 1
    roundRect(X(lx) - 5, Y(ly) - 13, tw + 10, 20, 6)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = hl ? '#f2e297' : '#262626'
    ctx.fillText(p.name, X(lx), Y(ly) + 2)
  }

  // 选中环节的路径高亮
  if (state.selected && active.includes(state.selected)) {
    const p = PROCESSES[state.selected]
    ctx.beginPath()
    p.path.forEach(([nx, ny], i) => (i === 0 ? ctx.moveTo(X(nx), Y(ny)) : ctx.lineTo(X(nx), Y(ny))))
    ctx.strokeStyle = 'rgba(212,42,30,0.85)'
    ctx.lineWidth = 3
    ctx.setLineDash([8, 6])
    ctx.lineDashOffset = -time * 0.02
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ---------- 环节逻辑关系图（右侧小图，与场景同步高亮） ----------
const flowCanvas = $('flowChart')
const fctx = flowCanvas.getContext('2d')
const FW = 300
const FH = 260
let fw = 0
let fh = 0
let fScale = 1
let fOffX = 0
let fOffY = 0

const FNODES = {
  atmO: { x: 72, y: 34, label: '大气·海上' },
  atmL: { x: 228, y: 34, label: '大气·陆上' },
  ocean: { x: 72, y: 226, label: '海洋' },
  land: { x: 228, y: 130, label: '陆地水' },
  ground: { x: 228, y: 226, label: '地下水' }
}
const NODE_W = 76
const NODE_H = 30

// 箭头：from/to 为逻辑坐标，bow 为控制点沿法线的外推距离，lx/ly 为标签相对曲线中点的偏移
const FARROWS = [
  { keys: ['evap'], label: '蒸发', n: ['ocean', 'atmO'], from: [50, 208], to: [50, 52], bow: 0, lx: -16, ly: 0, kind: 'vapor' },
  { keys: ['precipOcean'], label: '海上降水', n: ['atmO', 'ocean'], from: [94, 52], to: [94, 208], bow: 30, lx: 32, ly: 0, kind: 'rain' },
  { keys: ['transport'], label: '水汽输送', n: ['atmO', 'atmL'], from: [112, 28], to: [188, 28], bow: -12, lx: 0, ly: 16, kind: 'vapor' },
  { keys: ['precipLand'], label: '降水', n: ['atmL', 'land'], from: [206, 52], to: [206, 112], bow: 0, lx: -16, ly: 0, kind: 'rain' },
  { keys: ['transp', 'landEvap'], label: '蒸腾·蒸发', n: ['land', 'atmL'], from: [250, 112], to: [250, 52], bow: 26, lx: 6, ly: 18, kind: 'vapor' },
  { keys: ['runoff'], label: '地表径流', n: ['land', 'ocean'], from: [188, 138], to: [112, 214], bow: 12, lx: 0, ly: 16, kind: 'liquid' },
  { keys: ['infil'], label: '下渗', n: ['land', 'ground'], from: [228, 148], to: [228, 208], bow: 0, lx: 16, ly: 0, kind: 'liquid' },
  { keys: ['gflow'], label: '地下径流', n: ['ground', 'ocean'], from: [188, 226], to: [112, 226], bow: 12, lx: 0, ly: 15, kind: 'liquid' }
]

function fArrowGeom(a) {
  const [x0, y0] = a.from
  const [x1, y1] = a.to
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const cx = (x0 + x1) / 2 + (-dy / len) * a.bow
  const cy = (y0 + y1) / 2 + (dx / len) * a.bow
  // 二次贝塞尔 t=0.5 处即视觉中点
  const mx = 0.25 * x0 + 0.5 * cx + 0.25 * x1
  const my = 0.25 * y0 + 0.5 * cy + 0.25 * y1
  return { x0, y0, x1, y1, cx, cy, mx, my }
}

// 手绘抖动描边一条二次曲线
function fStrokeCurve(g, seed) {
  fctx.beginPath()
  const SEG = 16
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG
    const u = 1 - t
    let px = u * u * g.x0 + 2 * u * t * g.cx + t * t * g.x1
    let py = u * u * g.y0 + 2 * u * t * g.cy + t * t * g.y1
    if (i > 0 && i < SEG) {
      const j = (rnd(seed * 31 + i) - 0.5) * 2.2
      // 切线法线方向抖动
      const tx = 2 * u * (g.cx - g.x0) + 2 * t * (g.x1 - g.cx)
      const ty = 2 * u * (g.cy - g.y0) + 2 * t * (g.y1 - g.cy)
      const tl = Math.hypot(tx, ty) || 1
      px += (-ty / tl) * j
      py += (tx / tl) * j
    }
    if (i === 0) fctx.moveTo(px, py)
    else fctx.lineTo(px, py)
  }
  fctx.stroke()
}

function fArrowHead(g) {
  // 终点切线方向
  const tx = g.x1 - g.cx
  const ty = g.y1 - g.cy
  const tl = Math.hypot(tx, ty) || 1
  const ux = tx / tl
  const uy = ty / tl
  const L = 8
  const spread = 0.45
  fctx.beginPath()
  fctx.moveTo(g.x1, g.y1)
  fctx.lineTo(g.x1 - ux * L - uy * L * spread, g.y1 - uy * L + ux * L * spread)
  fctx.moveTo(g.x1, g.y1)
  fctx.lineTo(g.x1 - ux * L + uy * L * spread, g.y1 - uy * L - ux * L * spread)
  fctx.stroke()
}

// 手绘抖动圆角矩形（近似：四边细分加抖动）
function fWobbleRect(cx, cy, w, h, seed) {
  const corners = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2]
  ]
  fctx.beginPath()
  let first = true
  for (let s = 0; s < 4; s++) {
    const a = corners[s]
    const b = corners[(s + 1) % 4]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const SEG = 4
    for (let i = 0; i < SEG; i++) {
      const t = i / SEG
      const j = (rnd(seed * 13 + s * 5 + i) - 0.5) * 2.4
      const px = a[0] + dx * t + (-dy / len) * j
      const py = a[1] + dy * t + (dx / len) * j
      if (first) {
        fctx.moveTo(cx + px, cy + py)
        first = false
      } else fctx.lineTo(cx + px, cy + py)
    }
  }
  fctx.closePath()
}

function drawFlow(time) {
  const active = CYCLES[state.cycle]
  fctx.clearRect(0, 0, FW, FH)
  fctx.lineCap = 'round'
  fctx.lineJoin = 'round'

  const litNodes = new Set()
  for (const a of FARROWS) {
    if (a.keys.some((k) => active.includes(k))) a.n.forEach((n) => litNodes.add(n))
  }

  // 箭头（画在节点下层）
  FARROWS.forEach((a, ai) => {
    const isActive = a.keys.some((k) => active.includes(k))
    const isSel = !!(state.selected && a.keys.includes(state.selected))
    const g = fArrowGeom(a)
    const base = a.kind === 'vapor' ? '122,122,122' : '43,108,176'
    if (isSel) {
      fctx.strokeStyle = 'rgba(212,42,30,0.9)'
      fctx.lineWidth = 2.4
      fctx.setLineDash([7, 5])
      fctx.lineDashOffset = -time * 0.03
    } else if (isActive) {
      fctx.strokeStyle = `rgba(${base},0.85)`
      fctx.lineWidth = 2
      fctx.setLineDash([])
    } else {
      fctx.strokeStyle = 'rgba(38,38,38,0.15)'
      fctx.lineWidth = 1.5
      fctx.setLineDash([])
    }
    fStrokeCurve(g, ai + 1)
    fArrowHead(g)
    fctx.setLineDash([])

    // 环节名标签（白底小胶囊，避免与线重叠）
    const lxp = g.mx + a.lx
    const lyp = g.my + a.ly
    fctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif'
    const tw = fctx.measureText(a.label).width
    fctx.fillStyle = 'rgba(255,255,255,0.92)'
    fctx.strokeStyle = isSel ? 'rgba(212,42,30,0.6)' : 'rgba(38,38,38,0.18)'
    fctx.lineWidth = 1
    fctx.beginPath()
    fctx.roundRect(lxp - tw / 2 - 4, lyp - 8, tw + 8, 16, 8)
    fctx.fill()
    fctx.stroke()
    fctx.fillStyle = isSel ? '#d42a1e' : isActive ? '#262626' : 'rgba(38,38,38,0.35)'
    fctx.textAlign = 'center'
    fctx.textBaseline = 'middle'
    fctx.fillText(a.label, lxp, lyp + 0.5)
  })

  // 节点（手绘纸感方框）
  for (const [key, nd] of Object.entries(FNODES)) {
    const lit = litNodes.has(key)
    fWobbleRect(nd.x, nd.y, NODE_W, NODE_H, key.length * 7 + nd.x)
    fctx.fillStyle = lit ? '#faf8f4' : 'rgba(250,248,244,0.55)'
    fctx.fill()
    fctx.strokeStyle = lit ? 'rgba(38,38,38,0.85)' : 'rgba(38,38,38,0.25)'
    fctx.lineWidth = lit ? 1.8 : 1.2
    fctx.stroke()
    fctx.font = `${lit ? 'bold ' : ''}12px "PingFang SC", "Microsoft YaHei", sans-serif`
    fctx.fillStyle = lit ? '#262626' : 'rgba(38,38,38,0.35)'
    fctx.textAlign = 'center'
    fctx.textBaseline = 'middle'
    fctx.fillText(nd.label, nd.x, nd.y + 0.5)
  }
}

// 点击箭头 ≈ 点击环节按钮
flowCanvas.addEventListener('click', (e) => {
  const r = flowCanvas.getBoundingClientRect()
  const lx = (e.clientX - r.left - fOffX) / fScale
  const ly = (e.clientY - r.top - fOffY) / fScale
  for (const a of FARROWS) {
    const g = fArrowGeom(a)
    const nearLabel = Math.hypot(lx - (g.mx + a.lx), ly - (g.my + a.ly)) < 20
    const nearMid = Math.hypot(lx - g.mx, ly - g.my) < 14
    if (nearLabel || nearMid) {
      if (state.selected && a.keys.includes(state.selected)) selectProcess(state.selected)
      else selectProcess(a.keys[0])
      return
    }
  }
})

// ---------- 主循环 ----------
let last = 0
function frame(time) {
  const dt = Math.min(0.05, (time - last) / 1000 || 0)
  last = time
  const dpr = Math.min(devicePixelRatio, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (w > 0 && h > 0) {
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      // canvas 是被替换元素，width 属性会改变固有尺寸撑破 absolute 布局，必须显式锁回 CSS 尺寸
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    W = w
    H = h
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (state.playing) stepParticles(dt)
    drawScene(time)
    drawParticles()
  }
  // 逻辑关系图：等比缩放居中。CSS 已完全约束显示尺寸（width:100%; height:260px），
  // 只调 backing store，绝不写 inline style（否则会冻结住加载早期的瞬时错误尺寸）
  const cw = flowCanvas.clientWidth
  const ch = flowCanvas.clientHeight
  if (cw > 0 && ch > 0) {
    if (flowCanvas.width !== Math.round(cw * dpr) || flowCanvas.height !== Math.round(ch * dpr)) {
      flowCanvas.width = Math.round(cw * dpr)
      flowCanvas.height = Math.round(ch * dpr)
    }
    fw = cw
    fh = ch
    fScale = Math.min(fw / FW, fh / FH)
    fOffX = (fw - FW * fScale) / 2
    fOffY = (fh - FH * fScale) / 2
    fctx.setTransform(dpr * fScale, 0, 0, dpr * fScale, fOffX * dpr, fOffY * dpr)
    drawFlow(time)
  }
  requestAnimationFrame(frame)
}

// ---------- 面板 ----------
function selectProcess(key) {
  state.selected = state.selected === key ? null : key
  if (state.selected) {
    $('infoName').textContent = PROCESSES[state.selected].name
    $('infoText').textContent = PROCESSES[state.selected].info
  } else {
    resetInfo()
  }
  buildProcessList()
}

function buildProcessList() {
  const list = $('processList')
  list.innerHTML = ''
  const active = CYCLES[state.cycle]
  for (const [key, p] of Object.entries(PROCESSES)) {
    const b = document.createElement('button')
    b.className = 'proc-btn'
    b.textContent = p.name
    if (!active.includes(key)) b.classList.add('inactive')
    if (state.selected === key) b.classList.add('on')
    b.addEventListener('click', () => selectProcess(key))
    list.appendChild(b)
  }
}

function resetInfo() {
  $('infoName').textContent = state.cycle
  const desc = {
    海陆间循环: '海洋水蒸发 → 水汽输送 → 陆地降水 → 地表/地下径流回归海洋。环节最多、最复杂，使陆地淡水不断得到补充，是最重要的水循环类型。',
    海上内循环: '海洋水蒸发后直接以降水形式落回海面。环节最简单，但参与的水量最大。',
    陆地内循环: '陆地蒸发与植物蒸腾的水汽在陆地上空凝结，以降水形式落回陆地。对干旱内陆地区意义重大。'
  }
  $('infoText').textContent = desc[state.cycle]
}

// ---------- UI 事件 ----------
document.querySelectorAll('#cycleType .btn').forEach((b) => {
  b.addEventListener('click', () => {
    state.cycle = b.dataset.type
    state.selected = null
    document.querySelectorAll('#cycleType .btn').forEach((x) => x.classList.toggle('on', x === b))
    resetInfo()
    buildProcessList()
  })
})

$('sun').addEventListener('input', (e) => {
  state.sun = parseInt(e.target.value, 10)
  $('sunVal').textContent = SUN_NAMES[state.sun]
})

$('play').addEventListener('click', (e) => {
  state.playing = !state.playing
  e.target.classList.toggle('on', state.playing)
  e.target.textContent = state.playing ? '播放' : '暂停'
})

$('speed').addEventListener('input', (e) => {
  state.speed = SPEED_VALUES[parseInt(e.target.value, 10)]
  $('speedVal').textContent = SPEED_NAMES[parseInt(e.target.value, 10)]
})

if (window.geobox) {
  $('exitBtn').hidden = false
  $('exitBtn').addEventListener('click', () => window.geobox.exit())
}

new ResizeObserver(() => {}).observe($('sceneWrap'))

// ---------- 启动 ----------
resetInfo()
buildProcessList()
requestAnimationFrame(frame)
