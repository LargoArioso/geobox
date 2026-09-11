// 晨昏线模拟器 — 主程序（真实地表纹理 + 自转/公转运动演示）
import * as THREE from 'three'
import { OrbitControls } from '../assets/OrbitControls.js'
import { sunDeclination, dateLabel, latLabel, hmLabel, clockLabel, dayLength, polarRanges } from './astro.js'

const R = 30 // 地球半径（场景单位）
const ORBIT = R * 4 // 公转轨道半径（公转视角）
const TILT = (23.44 * Math.PI) / 180 // 地轴倾角
const $ = (id) => document.getElementById(id)

const state = {
  doy: 172, // 夏至
  doyFloat: 172,
  lat: 40,
  playing: true,
  speed: 1,
  mode: 'closeup' // 'closeup' 特写视角 | 'orbit' 公转视角
}

// ---------- Three.js 场景 ----------
const view3d = $('view3d')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
view3d.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 4000)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08

function resetCamera() {
  if (state.mode === 'orbit') {
    camera.position.set(0, ORBIT * 1.35, ORBIT * 1.3)
    controls.target.set(0, 0, 0)
  } else {
    camera.position.set(70, 26, 55)
    controls.target.set(0, 0, 0)
  }
  controls.update()
}
resetCamera()

scene.add(new THREE.AmbientLight(0xffffff, 0.55))
const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.6)
scene.add(sunLight)

// ---------- 太阳赤纬 / 轨道角 ----------
function declRad() {
  return (sunDeclination(state.doy) * Math.PI) / 180
}
/** 轨道角：夏至 θ=0，沿公转方向递增（从北极上空看逆时针） */
function orbitTheta() {
  return ((2 * Math.PI) / 365) * (state.doyFloat - 172)
}
/** 地球中心世界坐标（θ=0 夏至在轨道远侧 -Z，横向居中构图） */
function earthWorldPos() {
  if (state.mode === 'orbit') {
    const t = orbitTheta()
    return new THREE.Vector3(ORBIT * Math.sin(t), 0, -ORBIT * Math.cos(t))
  }
  return new THREE.Vector3(0, 0, 0)
}
/** 世界系中「地心 → 太阳」方向 */
function worldSunDir() {
  if (state.mode === 'orbit') {
    return earthWorldPos().multiplyScalar(-1).normalize()
  }
  const d = declRad()
  return new THREE.Vector3(Math.cos(d), Math.sin(d), 0).normalize()
}
/** 太阳中心世界坐标 */
function sunWorldPos() {
  if (state.mode === 'orbit') return new THREE.Vector3(0, 0, 0)
  return worldSunDir().multiplyScalar(R * 3.4)
}

// ---------- 地球（真实纹理 + 昼夜着色 ShaderMaterial） ----------
const earthUniforms = {
  sunDir: { value: worldSunDir() },
  map: { value: null },
  useMap: { value: 0 }
}
const earthMat = new THREE.ShaderMaterial({
  uniforms: earthUniforms,
  vertexShader: /* glsl */ `
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    void main() {
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir;
    uniform sampler2D map;
    uniform float useMap;
    varying vec3 vWorldNormal;
    varying vec2 vUv;
    void main() {
      float d = dot(normalize(vWorldNormal), normalize(sunDir));
      float k = smoothstep(-0.06, 0.06, d);
      vec3 tex = texture2D(map, vUv).rgb;
      vec3 dayPlain = vec3(0.87, 0.91, 0.94);
      vec3 dayCol = mix(dayPlain, tex * 1.06, useMap);
      vec3 nightPlain = vec3(0.13, 0.18, 0.30);
      vec3 nightCol = mix(nightPlain, tex * vec3(0.16, 0.20, 0.34), useMap);
      vec3 glow = vec3(0.98, 0.62, 0.30);    // 晨昏线附近暖色过渡带
      vec3 col = mix(nightCol, dayCol, k);
      float band = 1.0 - smoothstep(0.0, 0.18, abs(d));
      col = mix(col, glow, band * 0.30);
      gl_FragColor = vec4(col, 1.0);
    }
  `
})

new THREE.TextureLoader().load('./assets/earth.jpg', (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace
  earthUniforms.map.value = tex
  earthUniforms.useMap.value = 1
})

// 层级：位置组（公转）→ 倾斜组（地轴方向固定）→ 自转组（每天转圈）
const earthPosGroup = new THREE.Group()
const earthTiltGroup = new THREE.Group()
const earthSpinGroup = new THREE.Group()
scene.add(earthPosGroup)
earthPosGroup.add(earthTiltGroup)
earthTiltGroup.add(earthSpinGroup)
earthSpinGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), earthMat))

// ---------- 经纬网（随地球自转） ----------
function circlePoints(radius, y, segments = 128) {
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    pts.push(new THREE.Vector3(radius * Math.cos(t), y, radius * Math.sin(t)))
  }
  return pts
}

function addParallel(latDeg, color, width = 1, scale = 1.002) {
  const phi = (latDeg * Math.PI) / 180
  const pts = circlePoints(R * Math.cos(phi) * scale, R * Math.sin(phi) * scale)
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: width > 1 ? 0.85 : 0.3 }))
  earthSpinGroup.add(line)
  return line
}

function addMeridian(lonDeg, color) {
  const lam = (lonDeg * Math.PI) / 180
  const pts = []
  for (let i = 0; i <= 128; i++) {
    const t = (i / 128) * Math.PI * 2
    const v = new THREE.Vector3(R * Math.sin(t), R * Math.cos(t), 0)
    v.applyAxisAngle(new THREE.Vector3(0, 1, 0), lam)
    pts.push(v.multiplyScalar(1.002))
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts)
  earthSpinGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 })))
}

for (let lon = 0; lon < 180; lon += 30) addMeridian(lon, 0x3a4a5a)
for (let lat = -60; lat <= 60; lat += 30) if (lat !== 0) addParallel(lat, 0x3a4a5a)
addParallel(0, 0x16324a, 2) // 赤道
addParallel(23.44, 0xc8963c, 2) // 北回归线
addParallel(-23.44, 0xc8963c, 2) // 南回归线
addParallel(66.56, 0x7a5aa0, 2) // 北极圈
addParallel(-66.56, 0x7a5aa0, 2) // 南极圈

// 地轴（随倾斜组，不随自转）
const axisLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -R * 1.35, 0),
    new THREE.Vector3(0, R * 1.35, 0)
  ]),
  new THREE.LineBasicMaterial({ color: 0x262626, transparent: true, opacity: 0.6 })
)
earthTiltGroup.add(axisLine)

// 观测纬度高亮环（红色，随滑杆更新）
let latRing = null
function updateLatRing() {
  if (latRing) {
    earthSpinGroup.remove(latRing)
    latRing.geometry.dispose()
    latRing.material.dispose()
  }
  const phi = (state.lat * Math.PI) / 180
  const pts = circlePoints(R * Math.cos(phi) * 1.006, R * Math.sin(phi) * 1.006)
  latRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xd42a1e })
  )
  earthSpinGroup.add(latRing)
}
updateLatRing()

// ---------- 世界系静态件：晨昏线环 / 直射点 / 太阳 / 光线 / 轨道 ----------
const worldGroup = new THREE.Group()
scene.add(worldGroup)

// 晨昏线圆管：在 XY 平面建好，用四元数对准阳光方向（避免每帧重建几何体）
const terminatorGroup = new THREE.Group()
{
  const pts = []
  for (let i = 0; i <= 180; i++) {
    const t = (i / 180) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(t) * R * 1.004, Math.sin(t) * R * 1.004, 0))
  }
  const curve = new THREE.CatmullRomCurve3(pts, true)
  terminatorGroup.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(curve, 180, R * 0.012, 8, true),
      new THREE.MeshBasicMaterial({ color: 0xd42a1e })
    )
  )
}
worldGroup.add(terminatorGroup)

const subsolarMarker = new THREE.Mesh(
  new THREE.SphereGeometry(R * 0.035, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xf2b01e })
)
worldGroup.add(subsolarMarker)

const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(1, 24, 24),
  new THREE.MeshBasicMaterial({ color: 0xf7c948 })
)
worldGroup.add(sunMesh)

const sunRayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)])
const sunRay = new THREE.Line(sunRayGeo, new THREE.LineBasicMaterial({ color: 0xf2b01e }))
worldGroup.add(sunRay)

// 公转轨道环 + 二分二至标记（仅公转视角可见）
const orbitGroup = new THREE.Group()
orbitGroup.visible = false
scene.add(orbitGroup)
{
  const pts = []
  for (let i = 0; i <= 180; i++) {
    const t = (i / 180) * Math.PI * 2
    pts.push(new THREE.Vector3(Math.cos(t) * ORBIT, 0, -Math.sin(t) * ORBIT))
  }
  orbitGroup.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x8a8a8a, transparent: true, opacity: 0.55 })
    )
  )
}

function makeTextSprite(text) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 96
  const g = c.getContext('2d')
  g.font = 'bold 44px "PingFang SC", "Microsoft YaHei", sans-serif'
  g.textAlign = 'center'
  g.fillStyle = '#262626'
  g.fillText(text, 128, 58)
  const tex = new THREE.CanvasTexture(c)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
  sp.scale.set(R * 0.9, R * 0.34, 1)
  return sp
}

// 二分二至标记：doy → 轨道位置 + 中文标签
for (const [doy, name] of [[172, '夏至'], [266, '秋分'], [355, '冬至'], [80, '春分']]) {
  const t = ((2 * Math.PI) / 365) * (doy - 172)
  const p = new THREE.Vector3(Math.sin(t) * ORBIT, 0, -Math.cos(t) * ORBIT)
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.05, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xc8963c })
  )
  dot.position.copy(p)
  orbitGroup.add(dot)
  const label = makeTextSprite(name)
  label.position.copy(p).add(new THREE.Vector3(0, R * 0.35, 0))
  orbitGroup.add(label)
}

// 公转方向箭头（轨道切线方向的小锥体，夏至点附近）
{
  const t0 = ((2 * Math.PI) / 365) * 40
  const p = new THREE.Vector3(Math.sin(t0) * ORBIT, 0, -Math.cos(t0) * ORBIT)
  const tangent = new THREE.Vector3(Math.cos(t0), 0, Math.sin(t0))
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(R * 0.09, R * 0.3, 12),
    new THREE.MeshBasicMaterial({ color: 0x8a8a8a })
  )
  cone.position.copy(p)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent)
  orbitGroup.add(cone)
  const label = makeTextSprite('公转方向')
  label.position.copy(p).add(new THREE.Vector3(0, R * 0.35, 0))
  orbitGroup.add(label)
}

/** 每帧更新世界系几何（廉价：只动位置/四元数/端点） */
const _q = new THREE.Quaternion()
const _zAxis = new THREE.Vector3(0, 0, 1)
function updateWorldGeometry() {
  const ePos = earthWorldPos()
  const sd = worldSunDir()
  const sPos = sunWorldPos()

  earthPosGroup.position.copy(ePos)
  // 地轴倾斜：特写视角轴竖直；公转视角轴固定指向 (0, cosTilt, sinTilt)，方向不随公转改变
  if (state.mode === 'orbit') {
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT)))
    earthTiltGroup.quaternion.copy(_q)
  } else {
    earthTiltGroup.quaternion.identity()
  }

  // 晨昏线环：圆面法线对准阳光方向
  terminatorGroup.position.copy(ePos)
  terminatorGroup.quaternion.copy(_q.setFromUnitVectors(_zAxis, sd))

  subsolarMarker.position.copy(ePos).addScaledVector(sd, R * 1.01)

  sunMesh.position.copy(sPos)
  const sunScale = state.mode === 'orbit' ? R * 0.55 : R * 0.22
  sunMesh.scale.setScalar(sunScale)

  // 光线：太阳边缘 → 地球边缘
  const p0 = sPos.clone().addScaledVector(sd, -sunScale * 1.05)
  const p1 = ePos.clone().addScaledVector(sd, R * 1.12)
  const attr = sunRayGeo.getAttribute('position')
  attr.setXYZ(0, p0.x, p0.y, p0.z)
  attr.setXYZ(1, p1.x, p1.y, p1.z)
  attr.needsUpdate = true

  sunLight.position.copy(sPos.clone().sub(ePos).normalize().multiplyScalar(300).add(ePos))
  earthUniforms.sunDir.value.copy(sd)
}

// ---------- 2D 光照侧视图 ----------
const map2d = $('map2d')
const ctx2d = map2d.getContext('2d')

function draw2d() {
  const dpr = Math.min(devicePixelRatio, 2)
  const w = map2d.clientWidth
  const hgt = map2d.clientHeight
  if (!w || !hgt) return
  if (map2d.width !== w * dpr) {
    map2d.width = w * dpr
    map2d.height = hgt * dpr
    // canvas 是被替换元素，width 属性会改变固有尺寸撑破 absolute 布局，必须显式锁回 CSS 尺寸
    map2d.style.width = `${w}px`
    map2d.style.height = `${hgt}px`
  }
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx2d.clearRect(0, 0, w, hgt)

  const cx = w / 2
  const cy = hgt / 2
  const r = Math.min(w, hgt) * 0.36
  const decl = sunDeclination(state.doy)
  const dRad = (decl * Math.PI) / 180
  // 太阳在右侧，赤纬 δ 决定直射点高度；晨昏线过圆心、垂直于阳光
  const sd = { x: Math.cos(dRad), y: -Math.sin(dRad) } // 画布 y 向下
  const td = { x: -sd.y, y: sd.x } // 晨昏线方向（垂直于阳光）

  // 夜半球阴影（背阳一侧）
  ctx2d.beginPath()
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2)
  ctx2d.fillStyle = '#eef2f5'
  ctx2d.fill()
  ctx2d.save()
  ctx2d.beginPath()
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2)
  ctx2d.clip()
  ctx2d.beginPath()
  const big = r * 2.5
  ctx2d.moveTo(cx + td.x * big, cy + td.y * big)
  ctx2d.lineTo(cx - td.x * big, cy - td.y * big)
  ctx2d.lineTo(cx - td.x * big - sd.x * big, cy - td.y * big - sd.y * big)
  ctx2d.lineTo(cx + td.x * big - sd.x * big, cy + td.y * big - sd.y * big)
  ctx2d.closePath()
  ctx2d.fillStyle = 'rgba(28, 40, 66, 0.82)'
  ctx2d.fill()

  // 纬线：赤道 / 回归线 / 极圈 / 观测纬度
  const parallels = [
    { lat: 0, color: 'rgba(38,38,38,0.55)', lw: 1.2, label: '赤道' },
    { lat: 23.44, color: 'rgba(200,150,60,0.8)', lw: 0.9, label: '北回归线' },
    { lat: -23.44, color: 'rgba(200,150,60,0.8)', lw: 0.9, label: '南回归线' },
    { lat: 66.56, color: 'rgba(122,90,160,0.8)', lw: 0.9, label: '北极圈' },
    { lat: -66.56, color: 'rgba(122,90,160,0.8)', lw: 0.9, label: '南极圈' }
  ]
  ctx2d.textAlign = 'left'
  for (const p of parallels) {
    const y = cy - r * Math.sin((p.lat * Math.PI) / 180)
    const half = r * Math.cos((p.lat * Math.PI) / 180)
    ctx2d.strokeStyle = p.color
    ctx2d.lineWidth = p.lw
    ctx2d.beginPath()
    ctx2d.moveTo(cx - half, y)
    ctx2d.lineTo(cx + half, y)
    ctx2d.stroke()
    ctx2d.fillStyle = p.color
    ctx2d.font = '10px Consolas, monospace'
    ctx2d.fillText(p.label, cx + half + 5, y + 3)
  }
  // 观测纬度（红）
  const obsY = cy - r * Math.sin((state.lat * Math.PI) / 180)
  const obsHalf = r * Math.cos((state.lat * Math.PI) / 180)
  ctx2d.strokeStyle = '#d42a1e'
  ctx2d.lineWidth = 1.6
  ctx2d.beginPath()
  ctx2d.moveTo(cx - obsHalf, obsY)
  ctx2d.lineTo(cx + obsHalf, obsY)
  ctx2d.stroke()
  ctx2d.fillStyle = '#d42a1e'
  ctx2d.font = 'bold 11px Consolas, monospace'
  ctx2d.fillText(`观测 ${latLabel(state.lat)}`, cx - obsHalf - 4, obsY - 5)

  // 晨昏线（过圆心）
  ctx2d.strokeStyle = '#d42a1e'
  ctx2d.lineWidth = 2.2
  ctx2d.beginPath()
  ctx2d.moveTo(cx + td.x * r, cy + td.y * r)
  ctx2d.lineTo(cx - td.x * r, cy - td.y * r)
  ctx2d.stroke()
  ctx2d.font = '11px Consolas, monospace'
  ctx2d.fillStyle = '#d42a1e'
  ctx2d.fillText('晨线(近)/昏线(远)', cx + td.x * r * 0.55 + 6, cy + td.y * r * 0.55)

  // 自转方向箭头（左下弧）
  ctx2d.strokeStyle = 'rgba(38,38,38,0.5)'
  ctx2d.lineWidth = 1
  ctx2d.beginPath()
  ctx2d.arc(cx, cy, r * 1.18, Math.PI * 0.65, Math.PI * 0.95)
  ctx2d.stroke()
  const aEnd = Math.PI * 0.95
  const ax = cx + r * 1.18 * Math.cos(aEnd)
  const ay = cy + r * 1.18 * Math.sin(aEnd)
  ctx2d.beginPath()
  ctx2d.moveTo(ax, ay)
  ctx2d.lineTo(ax - 7, ay - 2)
  ctx2d.lineTo(ax - 2, ay - 8)
  ctx2d.closePath()
  ctx2d.fillStyle = 'rgba(38,38,38,0.5)'
  ctx2d.fill()
  ctx2d.fillStyle = 'rgba(38,38,38,0.5)'
  ctx2d.fillText('自转方向', ax - 46, ay + 16)

  // 地球轮廓
  ctx2d.beginPath()
  ctx2d.arc(cx, cy, r, 0, Math.PI * 2)
  ctx2d.strokeStyle = 'rgba(38,38,38,0.6)'
  ctx2d.lineWidth = 1.2
  ctx2d.stroke()
  ctx2d.restore()

  // 太阳光线（右侧平行箭头）
  ctx2d.strokeStyle = '#f2b01e'
  ctx2d.fillStyle = '#f2b01e'
  ctx2d.lineWidth = 1.6
  for (const off of [-0.45, 0, 0.45]) {
    const sx = cx + sd.x * (r + 58) - td.x * off * r * 1.6
    const sy = cy + sd.y * (r + 58) - td.y * off * r * 1.6
    const ex = sx - sd.x * 42
    const ey = sy - sd.y * 42
    ctx2d.beginPath()
    ctx2d.moveTo(sx, sy)
    ctx2d.lineTo(ex, ey)
    ctx2d.stroke()
    ctx2d.beginPath()
    ctx2d.moveTo(ex, ey)
    ctx2d.lineTo(ex + sd.x * 9 - td.x * 4, ey + sd.y * 9 - td.y * 4)
    ctx2d.lineTo(ex + sd.x * 9 + td.x * 4, ey + sd.y * 9 + td.y * 4)
    ctx2d.closePath()
    ctx2d.fill()
  }
  ctx2d.font = '11px Consolas, monospace'
  ctx2d.fillText('太阳光线', cx + sd.x * (r + 44) - 10, cy + sd.y * (r + 44) - 12)

  // 直射点标记
  const px = cx + sd.x * r
  const py = cy + sd.y * r
  ctx2d.beginPath()
  ctx2d.arc(px, py, 4.5, 0, Math.PI * 2)
  ctx2d.fillStyle = '#f2b01e'
  ctx2d.fill()
  ctx2d.strokeStyle = '#262626'
  ctx2d.lineWidth = 1
  ctx2d.stroke()
  ctx2d.fillStyle = '#262626'
  ctx2d.fillText(`直射点 ${latLabel(decl)}`, px - 30, py - 10)
}

// ---------- 数据面板 ----------
function fmtClock(h) {
  return clockLabel(h)
}

function updatePanel() {
  const decl = sunDeclination(state.doy)
  $('dDecl').textContent = latLabel(decl)
  const dl = dayLength(state.lat, decl)
  if (dl.state === 'polar-day') {
    $('dDayLen').textContent = '24 时（极昼）'
    $('dRise').textContent = '太阳终日不落'
  } else if (dl.state === 'polar-night') {
    $('dDayLen').textContent = '0 时（极夜）'
    $('dRise').textContent = '太阳终日不升'
  } else {
    $('dDayLen').textContent = hmLabel(dl.dayHours)
    $('dRise').textContent = `${fmtClock(dl.sunrise)} / ${fmtClock(dl.sunset)}`
  }
  const pr = polarRanges(decl)
  $('dPolarDay').textContent = pr.day ?? '无（全球昼夜平分）'
  $('dPolarNight').textContent = pr.night ?? '无（全球昼夜平分）'
}

// ---------- UI 事件 ----------
function setDoy(doy) {
  state.doy = Math.max(1, Math.min(365, Math.round(doy)))
  state.doyFloat = state.doy
  $('doy').value = String(state.doy)
  $('dateVal').textContent = dateLabel(state.doy)
  document.querySelectorAll('#dateQuick .btn').forEach((b) => {
    b.classList.toggle('on', parseInt(b.dataset.doy, 10) === state.doy)
  })
  draw2d()
  updatePanel()
}

$('doy').addEventListener('input', (e) => setDoy(parseInt(e.target.value, 10)))
document.querySelectorAll('#dateQuick .btn').forEach((b) => {
  b.addEventListener('click', () => setDoy(parseInt(b.dataset.doy, 10)))
})

$('lat').addEventListener('input', (e) => {
  state.lat = parseInt(e.target.value, 10)
  $('latVal').textContent = latLabel(state.lat)
  updateLatRing()
  draw2d()
  updatePanel()
})

$('play').addEventListener('click', (e) => {
  state.playing = !state.playing
  e.target.classList.toggle('on', state.playing)
})

const speedNames = ['静止', '1×', '2×', '4×', '8×', '16×']
const speedValues = [0, 0.25, 0.5, 1, 2, 4]
$('speed').addEventListener('input', (e) => {
  const i = parseInt(e.target.value, 10)
  state.speed = speedValues[i]
  $('speedVal').textContent = speedNames[i]
})

// 视角切换：特写 / 公转
function setMode(mode) {
  state.mode = mode
  orbitGroup.visible = mode === 'orbit'
  document.querySelectorAll('#viewMode .btn').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === mode)
  })
  $('hint3d').textContent =
    mode === 'orbit'
      ? '公转演示：地轴倾斜方向保持不变，直射点随公转移动 · 拖动旋转 · 滚轮缩放'
      : '拖动旋转 · 滚轮缩放 · 建议转到极点上方观察极昼极夜'
  resetCamera()
}
document.querySelectorAll('#viewMode .btn').forEach((b) => {
  b.addEventListener('click', () => setMode(b.dataset.mode))
})

$('resetView').addEventListener('click', resetCamera)

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
}
window.addEventListener('resize', onResize)
new ResizeObserver(() => onResize()).observe(view3d)
new ResizeObserver(() => draw2d()).observe($('view2d'))

// ---------- 启动 ----------
setDoy(state.doy)
setMode('closeup')
onResize()
requestAnimationFrame(() => onResize())
setTimeout(() => onResize(), 300)

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta()
  if (state.playing) {
    // 自转：两种视角都在转
    earthSpinGroup.rotation.y += dt * state.speed * 0.35
    // 公转：公转视角下日期自动推进（1× 约 6 天/秒，一年约 1 分钟）
    if (state.mode === 'orbit' && state.speed > 0) {
      state.doyFloat += dt * state.speed * 6
      if (state.doyFloat > 365) state.doyFloat -= 365
      const d = Math.round(state.doyFloat)
      if (d !== state.doy) {
        state.doy = d
        $('doy').value = String(d)
        $('dateVal').textContent = dateLabel(d)
        document.querySelectorAll('#dateQuick .btn').forEach((b) => {
          b.classList.toggle('on', parseInt(b.dataset.doy, 10) === d)
        })
        draw2d()
        updatePanel()
      }
    }
  }
  updateWorldGeometry()
  controls.update()
  renderer.render(scene, camera)
})
