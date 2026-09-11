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

// ---------- 场景绘制 ----------
function drawScene(time) {
  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, Y(0.78))
  sky.addColorStop(0, '#dcebf5')
  sky.addColorStop(1, '#f4f8fa')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  // 太阳（辐射强度决定大小与光芒）
  const sunR = [26, 36, 48][state.sun]
  const sx = X(0.16)
  const sy = Y(0.11)
  const rayN = [6, 8, 12][state.sun]
  ctx.strokeStyle = 'rgba(242,176,30,0.7)'
  ctx.lineWidth = 2
  for (let i = 0; i < rayN; i++) {
    const a = (i / rayN) * Math.PI * 2 + time * 0.0002
    ctx.beginPath()
    ctx.moveTo(sx + Math.cos(a) * (sunR + 6), sy + Math.sin(a) * (sunR + 6))
    ctx.lineTo(sx + Math.cos(a) * (sunR + 16), sy + Math.sin(a) * (sunR + 16))
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(sx, sy, sunR, 0, Math.PI * 2)
  ctx.fillStyle = '#f7c948'
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,38,38,0.4)'
  ctx.lineWidth = 1.2
  ctx.stroke()

  // 陆地（山体）
  ctx.beginPath()
  ctx.moveTo(X(0.4), Y(0.78))
  ctx.lineTo(X(0.5), Y(0.7))
  ctx.lineTo(X(0.62), Y(0.55))
  ctx.lineTo(X(0.72), Y(0.42))
  ctx.lineTo(X(0.82), Y(0.6))
  ctx.lineTo(X(1), Y(0.58))
  ctx.lineTo(X(1), Y(1))
  ctx.lineTo(X(0.4), Y(1))
  ctx.closePath()
  const land = ctx.createLinearGradient(0, Y(0.42), 0, Y(1))
  land.addColorStop(0, '#a8c69f')
  land.addColorStop(0.5, '#c3b98a')
  land.addColorStop(1, '#b09a72')
  ctx.fillStyle = land
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,38,38,0.35)'
  ctx.lineWidth = 1.2
  ctx.stroke()

  // 雪顶
  ctx.beginPath()
  ctx.moveTo(X(0.672), Y(0.49))
  ctx.lineTo(X(0.72), Y(0.42))
  ctx.lineTo(X(0.762), Y(0.505))
  ctx.lineTo(X(0.735), Y(0.49))
  ctx.lineTo(X(0.71), Y(0.51))
  ctx.lineTo(X(0.69), Y(0.485))
  ctx.closePath()
  ctx.fillStyle = '#f4f6f7'
  ctx.fill()

  // 地下水位线（虚线）
  ctx.strokeStyle = 'rgba(43,108,176,0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(X(0.42), Y(0.86))
  ctx.lineTo(X(0.55), Y(0.8))
  ctx.lineTo(X(0.7), Y(0.68))
  ctx.lineTo(X(0.85), Y(0.7))
  ctx.lineTo(X(1), Y(0.68))
  ctx.stroke()
  ctx.setLineDash([])

  // 河流
  ctx.beginPath()
  ctx.moveTo(X(0.78), Y(0.55))
  ctx.quadraticCurveTo(X(0.66), Y(0.64), X(0.55), Y(0.69))
  ctx.quadraticCurveTo(X(0.46), Y(0.73), X(0.4), Y(0.78))
  ctx.strokeStyle = 'rgba(43,108,176,0.75)'
  ctx.lineWidth = 5
  ctx.lineCap = 'round'
  ctx.stroke()

  // 树
  for (const [tx, ty, s] of [[0.58, 0.615, 1], [0.86, 0.575, 0.85], [0.93, 0.565, 0.7]]) {
    ctx.strokeStyle = '#6b4f2e'
    ctx.lineWidth = 3 * s
    ctx.beginPath()
    ctx.moveTo(X(tx), Y(ty))
    ctx.lineTo(X(tx), Y(ty - 0.035 * s))
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(X(tx), Y(ty - 0.055 * s), 14 * s, 0, Math.PI * 2)
    ctx.fillStyle = '#5d8a54'
    ctx.fill()
  }

  // 海洋
  ctx.beginPath()
  ctx.moveTo(0, Y(0.78))
  ctx.lineTo(X(0.4), Y(0.78))
  ctx.lineTo(X(0.4), Y(1))
  ctx.lineTo(0, Y(1))
  ctx.closePath()
  const sea = ctx.createLinearGradient(0, Y(0.78), 0, Y(1))
  sea.addColorStop(0, '#7fb3d9')
  sea.addColorStop(1, '#3d74a6')
  ctx.fillStyle = sea
  ctx.fill()
  // 波浪
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'
  ctx.lineWidth = 1.5
  for (let r = 0; r < 3; r++) {
    ctx.beginPath()
    for (let i = 0; i <= 40; i++) {
      const wx = (i / 40) * X(0.38)
      const wy = Y(0.8 + r * 0.05) + Math.sin(i * 0.9 + time * 0.0012 + r * 2) * 3
      if (i === 0) ctx.moveTo(wx, wy)
      else ctx.lineTo(wx, wy)
    }
    ctx.stroke()
  }

  // 云（水汽输送的云会往返漂移）
  const drift = (Math.sin(time * 0.00035) + 1) / 2 // 0..1
  drawCloud(X(0.15), Y(0.19), 1)
  drawCloud(X(0.2 + drift * 0.45), Y(0.14), 0.8)
  drawCloud(X(0.72), Y(0.17), 1.1)

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

function drawCloud(cx, cy, s) {
  ctx.beginPath()
  ctx.arc(cx - 26 * s, cy + 6 * s, 16 * s, 0, Math.PI * 2)
  ctx.arc(cx, cy - 6 * s, 22 * s, 0, Math.PI * 2)
  ctx.arc(cx + 26 * s, cy + 6 * s, 16 * s, 0, Math.PI * 2)
  ctx.arc(cx, cy + 10 * s, 20 * s, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(38,38,38,0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
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
