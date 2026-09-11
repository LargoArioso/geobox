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
    if (p.kind === 'rain') {
      ctx.strokeStyle = dim ? 'rgba(43,108,176,0.25)' : 'rgba(43,108,176,0.85)'
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x - 2, y + 9)
      ctx.stroke()
    } else if (p.kind === 'vapor') {
      ctx.beginPath()
      ctx.arc(x, y, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = dim ? 'rgba(150,150,150,0.25)' : 'rgba(255,255,255,0.9)'
      ctx.fill()
      ctx.strokeStyle = dim ? 'rgba(120,120,120,0.2)' : 'rgba(120,120,120,0.55)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = dim ? 'rgba(43,108,176,0.25)' : 'rgba(43,108,176,0.9)'
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

  // 地下水位线（蓝色抖动虚线）
  wobblePath([[0.42, 0.86], [0.55, 0.8], [0.7, 0.68], [0.85, 0.7], [1, 0.68]], { amp: 2.5, seed: 13 })
  ctx.strokeStyle = 'rgba(43,108,176,0.55)'
  ctx.lineWidth = 1.6
  ctx.setLineDash([7, 5])
  ctx.stroke()
  ctx.setLineDash([])

  // 河流（蓝色粗抖动线 + 白色高光）
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
  wobblePath([[0, 0.78], [0.4, 0.78]], { amp: 2.5, seed: 23 })
  ctx.strokeStyle = 'rgba(38,38,38,0.6)'
  ctx.lineWidth = 2.5
  ctx.stroke()

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
  requestAnimationFrame(frame)
}

// ---------- 面板 ----------
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
    b.addEventListener('click', () => {
      state.selected = state.selected === key ? null : key
      if (state.selected) {
        $('infoName').textContent = p.name
        $('infoText').textContent = p.info
      } else {
        resetInfo()
      }
      buildProcessList()
    })
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
