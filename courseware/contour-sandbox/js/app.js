// 等高线 3D 沙盘 — 主程序
import * as THREE from 'three'
import { OrbitControls } from '../assets/OrbitControls.js'
import { GRID_N, WORLD_HALF, M_PER_UNIT, generateTerrain, sampleHeight, parseASC } from './terrain.js'
import { extractAllContours } from './contours.js'

// ---------- 全局状态 ----------
const state = {
  heights: null,
  terrainType: 'mountain',
  seed: Math.floor(Math.random() * 100000),
  interval: 50,
  contours: null, // { levels, min, max }
  showContours3d: true,
  profileMode: false,
  profileA: null, // {gx, gy} 网格浮点坐标
  profileB: null,
  demName: null
}

const $ = (id) => document.getElementById(id)

// ---------- 高程设色 ----------
function elevationColor(h, min, max) {
  const t = Math.max(0, Math.min(1, (h - min) / Math.max(1, max - min)))
  // 深绿 → 浅绿 → 黄 → 棕 → 灰白
  const stops = [
    [0.0, [84, 130, 82]],
    [0.25, [139, 166, 98]],
    [0.45, [203, 190, 123]],
    [0.65, [176, 141, 96]],
    [0.85, [150, 134, 122]],
    [1.0, [245, 245, 245]]
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / (t1 - t0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k)
      ]
    }
  }
  return stops[stops.length - 1][1]
}

// 网格坐标 ↔ 世界坐标
const g2w = (g) => (g / (GRID_N - 1)) * 2 * WORLD_HALF - WORLD_HALF
const w2g = (w) => ((w + WORLD_HALF) / (2 * WORLD_HALF)) * (GRID_N - 1)

// ---------- Three.js 场景 ----------
const view3d = $('view3d')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
view3d.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.maxPolarAngle = Math.PI * 0.49

function resetCamera() {
  camera.position.set(70, 60, 70)
  controls.target.set(0, 5, 0)
  controls.update()
}
resetCamera()

scene.add(new THREE.AmbientLight(0xffffff, 0.75))
const sun = new THREE.DirectionalLight(0xfff5e0, 1.6)
sun.position.set(60, 100, 40)
scene.add(sun)

let terrainMesh = null
let contourLines = null
let profileLine3d = null
let baseGrid = null

// 悬停标记
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(0.9, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xd42a1e })
)
marker.visible = false
scene.add(marker)

function buildTerrainMesh() {
  if (terrainMesh) {
    scene.remove(terrainMesh)
    terrainMesh.geometry.dispose()
    terrainMesh.material.dispose()
  }
  if (baseGrid) {
    scene.remove(baseGrid)
    baseGrid = null
  }
  const { min, max } = state.contours
  const geo = new THREE.PlaneGeometry(2 * WORLD_HALF, 2 * WORLD_HALF, GRID_N - 1, GRID_N - 1)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const vi = j * GRID_N + i
      const h = state.heights[vi]
      pos.setY(vi, h / M_PER_UNIT)
      const [r, g, b] = elevationColor(h, min, max)
      colors[vi * 3] = r / 255
      colors[vi * 3 + 1] = g / 255
      colors[vi * 3 + 2] = b / 255
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  terrainMesh = new THREE.Mesh(geo, mat)
  scene.add(terrainMesh)

  // 底部参考网格（海平面）
  baseGrid = new THREE.GridHelper(2 * WORLD_HALF, 20, 0x999999, 0xcccccc)
  baseGrid.position.y = 0
  ;(baseGrid.material).opacity = 0.35
  ;(baseGrid.material).transparent = true
  scene.add(baseGrid)
}

function buildContourLines3d() {
  if (contourLines) {
    scene.remove(contourLines)
    contourLines.geometry.dispose()
    contourLines.material.dispose()
    contourLines = null
  }
  if (!state.showContours3d) return
  const positions = []
  const colors = []
  for (const lv of state.contours.levels) {
    const y = lv.value / M_PER_UNIT + 0.12
    const c = lv.isIndex ? [0.25, 0.12, 0.05] : [0.55, 0.35, 0.2]
    for (const s of lv.segments) {
      positions.push(g2w(s.x1), y, g2w(s.y1), g2w(s.x2), y, g2w(s.y2))
      colors.push(...c, ...c)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  contourLines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ vertexColors: true })
  )
  scene.add(contourLines)
}

function buildProfileLine3d() {
  if (profileLine3d) {
    scene.remove(profileLine3d)
    profileLine3d.geometry.dispose()
    profileLine3d = null
  }
  if (!state.profileA || !state.profileB) return
  const pts = []
  const M = 120
  for (let k = 0; k <= M; k++) {
    const t = k / M
    const gx = state.profileA.gx + (state.profileB.gx - state.profileA.gx) * t
    const gy = state.profileA.gy + (state.profileB.gy - state.profileA.gy) * t
    const h = sampleHeight(state.heights, gx, gy)
    pts.push(new THREE.Vector3(g2w(gx), h / M_PER_UNIT + 0.3, g2w(gy)))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  profileLine3d = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xd42a1e, linewidth: 2 }))
  scene.add(profileLine3d)
}

// ---------- 2D 等高线图 ----------
const map2d = $('map2d')
const ctx2d = map2d.getContext('2d')
let hoverCell = null
// 静态层缓存：底图+等高线+标注只在数据/尺寸变化时重绘，悬停时直接贴图
const staticMap = document.createElement('canvas')
let staticKey = ''

function renderStaticMap(w, hgt, dpr) {
  staticMap.width = w * dpr
  staticMap.height = hgt * dpr
  const c = staticMap.getContext('2d')
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  c.clearRect(0, 0, w, hgt)

  const pad = 26
  const iw = w - pad * 2
  const ih = hgt - pad * 2
  const toPx = (gx, gy) => [pad + (gx / (GRID_N - 1)) * iw, pad + (gy / (GRID_N - 1)) * ih]

  // 高程设色底图（低分辨率像素块）
  const { min, max } = state.contours
  const cellW = iw / (GRID_N - 1)
  const cellH = ih / (GRID_N - 1)
  for (let j = 0; j < GRID_N - 1; j += 2) {
    for (let i = 0; i < GRID_N - 1; i += 2) {
      const h = state.heights[j * GRID_N + i]
      const [r, g, b] = elevationColor(h, min, max)
      c.fillStyle = `rgba(${r},${g},${b},0.45)`
      const [px, py] = toPx(i, j)
      c.fillRect(px, py, cellW * 2 + 0.5, cellH * 2 + 0.5)
    }
  }

  // 等高线
  for (const lv of state.contours.levels) {
    c.strokeStyle = lv.isIndex ? '#5a2d0c' : '#8a6a45'
    c.lineWidth = lv.isIndex ? 1.8 : 0.8
    c.beginPath()
    for (const s of lv.segments) {
      const [x1, y1] = toPx(s.x1, s.y1)
      const [x2, y2] = toPx(s.x2, s.y2)
      c.moveTo(x1, y1)
      c.lineTo(x2, y2)
    }
    c.stroke()
  }

  // 计曲线海拔标注（取每级最长线段的中点）
  c.fillStyle = '#5a2d0c'
  c.font = '11px Consolas, monospace'
  c.textAlign = 'center'
  for (const lv of state.contours.levels) {
    if (!lv.isIndex || lv.segments.length === 0) continue
    const sorted = [...lv.segments].sort(
      (a, b) => Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1)
    )
    for (const s of sorted.slice(0, 2)) {
      const [x1, y1] = toPx(s.x1, s.y1)
      const [x2, y2] = toPx(s.x2, s.y2)
      c.fillText(String(lv.value), (x1 + x2) / 2, (y1 + y2) / 2 - 3)
    }
  }

  // 边框与比例尺
  c.strokeStyle = 'rgba(38,38,38,0.25)'
  c.lineWidth = 1
  c.strokeRect(pad, pad, iw, ih)
  const barKm = 2
  const barPx = ((barKm * 1000) / M_PER_UNIT) * (iw / (2 * WORLD_HALF))
  c.beginPath()
  c.moveTo(pad + 8, hgt - 12)
  c.lineTo(pad + 8 + barPx, hgt - 12)
  c.stroke()
  c.fillStyle = 'rgba(38,38,38,0.5)'
  c.fillText(`${barKm} km`, pad + 8 + barPx / 2, hgt - 16)
}

function draw2d() {
  const dpr = Math.min(devicePixelRatio, 2)
  const w = map2d.clientWidth
  const hgt = map2d.clientHeight
  if (!w || !hgt) return
  if (map2d.width !== w * dpr) {
    map2d.width = w * dpr
    map2d.height = hgt * dpr
  }
  const key = `${w}x${hgt}x${dpr}`
  if (key !== staticKey) {
    staticKey = key
    renderStaticMap(w, hgt, dpr)
  }
  ctx2d.setTransform(1, 0, 0, 1, 0, 0)
  ctx2d.clearRect(0, 0, map2d.width, map2d.height)
  ctx2d.drawImage(staticMap, 0, 0)
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)

  const pad = 26
  const iw = w - pad * 2
  const ih = hgt - pad * 2
  const toPx = (gx, gy) => [pad + (gx / (GRID_N - 1)) * iw, pad + (gy / (GRID_N - 1)) * ih]

  // 剖面线
  if (state.profileA) {
    const [ax, ay] = toPx(state.profileA.gx, state.profileA.gy)
    ctx2d.fillStyle = '#d42a1e'
    ctx2d.beginPath()
    ctx2d.arc(ax, ay, 5, 0, Math.PI * 2)
    ctx2d.fill()
    ctx2d.font = 'bold 12px Consolas, monospace'
    ctx2d.fillText('A', ax + 9, ay + 4)
    if (state.profileB) {
      const [bx, by] = toPx(state.profileB.gx, state.profileB.gy)
      ctx2d.strokeStyle = '#d42a1e'
      ctx2d.lineWidth = 1.6
      ctx2d.setLineDash([6, 4])
      ctx2d.beginPath()
      ctx2d.moveTo(ax, ay)
      ctx2d.lineTo(bx, by)
      ctx2d.stroke()
      ctx2d.setLineDash([])
      ctx2d.beginPath()
      ctx2d.arc(bx, by, 5, 0, Math.PI * 2)
      ctx2d.fill()
      ctx2d.fillText('B', bx + 9, by + 4)
    }
  }

  // 悬停十字线
  if (hoverCell) {
    const [hx, hy] = toPx(hoverCell.gx, hoverCell.gy)
    ctx2d.strokeStyle = 'rgba(38,38,38,0.35)'
    ctx2d.lineWidth = 0.8
    ctx2d.setLineDash([3, 3])
    ctx2d.beginPath()
    ctx2d.moveTo(pad, hy); ctx2d.lineTo(pad + iw, hy)
    ctx2d.moveTo(hx, pad); ctx2d.lineTo(hx, pad + ih)
    ctx2d.stroke()
    ctx2d.setLineDash([])
  }
}

// ---------- 剖面图 ----------
const profileCanvas = $('profileCanvas')
const pctx = profileCanvas.getContext('2d')

function drawProfile() {
  const panel = $('profilePanel')
  if (!state.profileA || !state.profileB) {
    panel.hidden = true
    return
  }
  panel.hidden = false
  const dpr = Math.min(devicePixelRatio, 2)
  const w = profileCanvas.clientWidth
  const hgt = profileCanvas.clientHeight
  if (!w || !hgt) return
  profileCanvas.width = w * dpr
  profileCanvas.height = hgt * dpr
  pctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  pctx.clearRect(0, 0, w, hgt)

  // 采样
  const M = 240
  const samples = []
  const dgx = state.profileB.gx - state.profileA.gx
  const dgy = state.profileB.gy - state.profileA.gy
  const distUnits = Math.hypot(g2w(dgx + GRID_N - 1) - 0, 0) // 占位，下面直接算
  const totalM = Math.hypot(dgx, dgy) / (GRID_N - 1) * 2 * WORLD_HALF * M_PER_UNIT
  for (let k = 0; k <= M; k++) {
    const t = k / M
    samples.push(sampleHeight(state.heights, state.profileA.gx + dgx * t, state.profileA.gy + dgy * t))
  }
  let minH = Infinity, maxH = -Infinity
  for (const v of samples) { if (v < minH) minH = v; if (v > maxH) maxH = v }
  const range = Math.max(10, maxH - minH)
  minH = Math.floor(minH / 50) * 50
  maxH = Math.ceil((minH + range) / 50) * 50 + 50

  const padL = 52, padR = 16, padT = 12, padB = 26
  const iw = w - padL - padR
  const ih = hgt - padT - padB
  const toX = (t) => padL + t * iw
  const toY = (h) => padT + (1 - (h - minH) / (maxH - minH)) * ih

  // 网格与坐标轴
  pctx.strokeStyle = 'rgba(38,38,38,0.12)'
  pctx.fillStyle = 'rgba(38,38,38,0.55)'
  pctx.font = '11px Consolas, monospace'
  pctx.textAlign = 'right'
  pctx.lineWidth = 0.8
  const step = range > 1000 ? 200 : range > 400 ? 100 : 50
  for (let h = minH; h <= maxH; h += step) {
    const y = toY(h)
    pctx.beginPath(); pctx.moveTo(padL, y); pctx.lineTo(padL + iw, y); pctx.stroke()
    pctx.fillText(`${h} m`, padL - 6, y + 4)
  }
  pctx.textAlign = 'center'
  const kmTotal = totalM / 1000
  for (let km = 0; km <= Math.ceil(kmTotal); km++) {
    const x = toX(km / kmTotal)
    if (x > padL + iw + 1) break
    pctx.fillText(`${km}`, x, hgt - 8)
  }
  pctx.fillText('距离 / km', padL + iw / 2, hgt - 8 + 0)

  // 剖面线（按坡度着色：绿 <15°，黄 15–30°，红 >30°）
  const segLen = totalM / M
  for (let k = 0; k < M; k++) {
    const slope = Math.atan(Math.abs(samples[k + 1] - samples[k]) / segLen) * 180 / Math.PI
    pctx.strokeStyle = slope < 15 ? '#4a7c43' : slope < 30 ? '#c8963c' : '#c0392b'
    pctx.lineWidth = 2
    pctx.beginPath()
    pctx.moveTo(toX(k / M), toY(samples[k]))
    pctx.lineTo(toX((k + 1) / M), toY(samples[k + 1]))
    pctx.stroke()
  }
  // 填充
  pctx.fillStyle = 'rgba(120,100,70,0.12)'
  pctx.beginPath()
  pctx.moveTo(toX(0), toY(samples[0]))
  for (let k = 1; k <= M; k++) pctx.lineTo(toX(k / M), toY(samples[k]))
  pctx.lineTo(toX(1), toY(minH))
  pctx.lineTo(toX(0), toY(minH))
  pctx.closePath()
  pctx.fill()

  // 信息
  let maxSlope = 0
  for (let k = 0; k < M; k++) {
    const s = Math.atan(Math.abs(samples[k + 1] - samples[k]) / segLen) * 180 / Math.PI
    if (s > maxSlope) maxSlope = s
  }
  $('profileInfo').textContent =
    `水平距离 ${kmTotal.toFixed(2)} km · 落差 ${(Math.max(...samples) - Math.min(...samples)).toFixed(0)} m · 最大坡度 ${maxSlope.toFixed(1)}° · 绿<15° 黄15–30° 红>30°`
}

// ---------- 数据重建 ----------
function rebuildAll() {
  state.contours = extractAllContours(state.heights, state.interval)
  staticKey = '' // 静态底图缓存失效
  buildTerrainMesh()
  buildContourLines3d()
  buildProfileLine3d()
  draw2d()
  drawProfile()
}

function regenerate() {
  state.heights = generateTerrain(state.terrainType, state.seed)
  state.profileA = null
  state.profileB = null
  state.demName = null
  rebuildAll()
}

// ---------- 2D 交互 ----------
function canvasToGrid(e) {
  const rect = map2d.getBoundingClientRect()
  const pad = 26
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const gx = ((px - pad) / (rect.width - pad * 2)) * (GRID_N - 1)
  const gy = ((py - pad) / (rect.height - pad * 2)) * (GRID_N - 1)
  if (gx < 0 || gy < 0 || gx > GRID_N - 1 || gy > GRID_N - 1) return null
  return { gx, gy }
}

map2d.addEventListener('pointermove', (e) => {
  const cell = canvasToGrid(e)
  hoverCell = cell
  const readout = $('readout')
  if (cell) {
    const h = sampleHeight(state.heights, cell.gx, cell.gy)
    readout.style.display = 'block'
    readout.textContent = `海拔 ${h.toFixed(0)} m · 格网 (${cell.gx.toFixed(0)}, ${cell.gy.toFixed(0)})`
    marker.position.set(g2w(cell.gx), h / M_PER_UNIT + 0.8, g2w(cell.gy))
    marker.visible = true
  } else {
    readout.style.display = 'none'
    marker.visible = false
  }
  draw2d()
})

map2d.addEventListener('pointerleave', () => {
  hoverCell = null
  marker.visible = false
  $('readout').style.display = 'none'
  draw2d()
})

map2d.addEventListener('pointerdown', (e) => {
  if (!state.profileMode) return
  const cell = canvasToGrid(e)
  if (!cell) return
  if (!state.profileA || (state.profileA && state.profileB)) {
    state.profileA = cell
    state.profileB = null
  } else {
    state.profileB = cell
  }
  buildProfileLine3d()
  draw2d()
  drawProfile()
})

// ---------- UI 事件 ----------
$('terrainType').addEventListener('change', (e) => {
  state.terrainType = e.target.value
  regenerate()
})

$('interval').addEventListener('input', (e) => {
  state.interval = parseInt(e.target.value, 10)
  $('intervalVal').textContent = `${state.interval} m`
  state.contours = extractAllContours(state.heights, state.interval)
  staticKey = '' // 静态底图缓存失效
  buildContourLines3d()
  draw2d()
})

$('regen').addEventListener('click', () => {
  state.seed = Math.floor(Math.random() * 100000)
  regenerate()
})

$('profileMode').addEventListener('click', (e) => {
  state.profileMode = !state.profileMode
  e.target.classList.toggle('on', state.profileMode)
  if (!state.profileMode) {
    state.profileA = null
    state.profileB = null
    buildProfileLine3d()
    draw2d()
    drawProfile()
  }
})

$('clearProfile').addEventListener('click', () => {
  state.profileA = null
  state.profileB = null
  buildProfileLine3d()
  draw2d()
  drawProfile()
})

$('toggleContours').addEventListener('click', (e) => {
  state.showContours3d = !state.showContours3d
  e.target.classList.toggle('on', state.showContours3d)
  buildContourLines3d()
})

$('resetView').addEventListener('click', resetCamera)

// DEM 导入（优先 GeoBox 桥接，降级为文件选择框）
async function importDemData(buf, name) {
  try {
    const text = new TextDecoder('utf-8').decode(buf)
    const { heights, min, max, ncols, nrows } = parseASC(text)
    state.heights = heights
    state.demName = name
    state.profileA = null
    state.profileB = null
    rebuildAll()
    $('hint3d').textContent = `已载入真实 DEM：${name}（${ncols}×${nrows}，${min.toFixed(0)}–${max.toFixed(0)} m）`
  } catch (err) {
    $('hint3d').textContent = `DEM 导入失败：${err.message}`
  }
}

$('importDem').addEventListener('click', async () => {
  if (window.geobox?.importFile) {
    const f = await window.geobox.importFile({ accept: ['.asc', '.txt'] })
    if (f) importDemData(f.data, f.name)
  } else {
    $('fileFallback').click()
  }
})

$('fileFallback').addEventListener('change', async (e) => {
  const file = e.target.files[0]
  if (file) importDemData(await file.arrayBuffer(), file.name)
  e.target.value = ''
})

// 退出（仅 GeoBox 运行时显示）
if (window.geobox) {
  $('exitBtn').hidden = false
  $('exitBtn').addEventListener('click', () => window.geobox.exit())
}

// ---------- 尺寸自适应 ----------
function onResize() {
  const w = view3d.clientWidth
  const h = view3d.clientHeight
  if (w > 0 && h > 0) {
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  draw2d()
  drawProfile()
}
window.addEventListener('resize', onResize)
// 用 ResizeObserver 监听容器（窗口最大化、面板伸缩、布局晚定型都能覆盖）
new ResizeObserver(() => onResize()).observe(view3d)
new ResizeObserver(() => { draw2d() }).observe($('view2d'))

// ---------- 启动 ----------
state.heights = generateTerrain(state.terrainType, state.seed)
rebuildAll()
onResize()
// 部分环境下布局晚于脚本完成，补一次延迟校准
requestAnimationFrame(() => onResize())
setTimeout(() => onResize(), 300)

renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
