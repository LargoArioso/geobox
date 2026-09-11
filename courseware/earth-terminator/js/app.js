// 晨昏线模拟器 — 主程序
import * as THREE from 'three'
import { OrbitControls } from '../assets/OrbitControls.js'
import { sunDeclination, dateLabel, latLabel, hmLabel, clockLabel, dayLength, polarRanges } from './astro.js'

const R = 30 // 地球半径（场景单位）
const $ = (id) => document.getElementById(id)

const state = {
  doy: 172, // 夏至
  lat: 40,
  playing: true,
  speed: 1
}

// ---------- Three.js 场景 ----------
const view3d = $('view3d')
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
view3d.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08

function resetCamera() {
  camera.position.set(70, 26, 55)
  controls.target.set(0, 0, 0)
  controls.update()
}
resetCamera()

scene.add(new THREE.AmbientLight(0xffffff, 0.9))
const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.4)
scene.add(sunLight)

// ---------- 太阳方向 ----------
function sunDir() {
  const d = (sunDeclination(state.doy) * Math.PI) / 180
  return new THREE.Vector3(Math.cos(d), Math.sin(d), 0).normalize()
}

// ---------- 地球（昼夜着色 ShaderMaterial） ----------
const earthUniforms = {
  sunDir: { value: sunDir() }
}
const earthMat = new THREE.ShaderMaterial({
  uniforms: earthUniforms,
  vertexShader: /* glsl */ `
    varying vec3 vWorldNormal;
    void main() {
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 sunDir;
    varying vec3 vWorldNormal;
    void main() {
      float d = dot(normalize(vWorldNormal), normalize(sunDir));
      float k = smoothstep(-0.06, 0.06, d);
      vec3 day = vec3(0.87, 0.91, 0.94);     // 昼半球：淡蓝白
      vec3 night = vec3(0.13, 0.18, 0.30);   // 夜半球：深靛蓝
      vec3 glow = vec3(0.98, 0.62, 0.30);    // 晨昏线附近暖色过渡带
      vec3 col = mix(night, day, k);
      float band = 1.0 - smoothstep(0.0, 0.18, abs(d));
      col = mix(col, glow, band * 0.35);
      gl_FragColor = vec4(col, 1.0);
    }
  `
})
const earthGroup = new THREE.Group() // 随自转旋转的部分
scene.add(earthGroup)
earthGroup.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), earthMat))

// ---------- 经纬网（随地球旋转） ----------
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
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: width > 1 ? 0.9 : 0.45 }))
  earthGroup.add(line)
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
  earthGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 })))
}

for (let lon = 0; lon < 180; lon += 30) addMeridian(lon, 0x5a6a7a)
for (let lat = -60; lat <= 60; lat += 30) if (lat !== 0) addParallel(lat, 0x5a6a7a)
addParallel(0, 0x2e4a5e, 2) // 赤道
addParallel(23.44, 0xc8963c, 2) // 北回归线
addParallel(-23.44, 0xc8963c, 2) // 南回归线
addParallel(66.56, 0x7a5aa0, 2) // 北极圈
addParallel(-66.56, 0x7a5aa0, 2) // 南极圈

// 地轴
{
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -R * 1.35, 0),
    new THREE.Vector3(0, R * 1.35, 0)
  ])
  earthGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x262626, transparent: true, opacity: 0.6 })))
}

// 观测纬度高亮环（红色，随滑杆更新）
let latRing = null
function updateLatRing() {
  if (latRing) {
    earthGroup.remove(latRing)
    latRing.geometry.dispose()
    latRing.material.dispose()
  }
  const phi = (state.lat * Math.PI) / 180
  const pts = circlePoints(R * Math.cos(phi) * 1.006, R * Math.sin(phi) * 1.006)
  latRing = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0xd42a1e })
  )
  earthGroup.add(latRing)
}
updateLatRing()

// ---------- 不随自转的部分：晨昏线环 / 太阳 / 直射点 ----------
const staticGroup = new THREE.Group()
scene.add(staticGroup)

let terminatorTube = null
let subsolarMarker = null
let sunMesh = null
let sunRay = null

function rebuildSunGeometry() {
  for (const obj of [terminatorTube, subsolarMarker, sunMesh, sunRay]) {
    if (obj) {
      staticGroup.remove(obj)
      obj.geometry?.dispose()
      obj.material?.dispose()
    }
  }
  const sd = sunDir()

  // 晨昏线：过地心、垂直于太阳光线的大圆（红色圆管，大屏可见）
  const u = new THREE.Vector3(0, 1, 0).cross(sd).normalize()
  const v = sd.clone().cross(u).normalize()
  const pts = []
  for (let i = 0; i <= 180; i++) {
    const t = (i / 180) * Math.PI * 2
    pts.push(
      u.clone().multiplyScalar(Math.cos(t) * R * 1.004).add(v.clone().multiplyScalar(Math.sin(t) * R * 1.004))
    )
  }
  const curve = new THREE.CatmullRomCurve3(pts, true)
  terminatorTube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 180, R * 0.012, 8, true),
    new THREE.MeshBasicMaterial({ color: 0xd42a1e })
  )
  staticGroup.add(terminatorTube)

  // 太阳直射点标记
  subsolarMarker = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.035, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xf2b01e })
  )
  subsolarMarker.position.copy(sd.clone().multiplyScalar(R * 1.01))
  staticGroup.add(subsolarMarker)

  // 太阳本体与光线方向线
  sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.22, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xf7c948 })
  )
  sunMesh.position.copy(sd.clone().multiplyScalar(R * 3.4))
  staticGroup.add(sunMesh)

  sunRay = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      sd.clone().multiplyScalar(R * 3.1),
      sd.clone().multiplyScalar(R * 1.15)
    ]),
    new THREE.LineBasicMaterial({ color: 0xf2b01e })
  )
  staticGroup.add(sunRay)

  sunLight.position.copy(sd.clone().multiplyScalar(200))
  earthUniforms.sunDir.value = sd
}
rebuildSunGeometry()

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
  $('doy').value = String(state.doy)
  $('dateVal').textContent = dateLabel(state.doy)
  document.querySelectorAll('.quick .btn').forEach((b) => {
    b.classList.toggle('on', parseInt(b.dataset.doy, 10) === state.doy)
  })
  rebuildSunGeometry()
  draw2d()
  updatePanel()
}

$('doy').addEventListener('input', (e) => setDoy(parseInt(e.target.value, 10)))
document.querySelectorAll('.quick .btn').forEach((b) => {
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
onResize()
requestAnimationFrame(() => onResize())
setTimeout(() => onResize(), 300)

const clock = new THREE.Clock()
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta()
  if (state.playing) earthGroup.rotation.y += dt * state.speed * 0.35
  controls.update()
  renderer.render(scene, camera)
})
