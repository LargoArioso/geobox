// 全球地震带·实时分布 — 3D 地球视图(three.js,懒加载)
// 2D 地图看「带」,3D 地球看「环」——环太平洋火山地震带只有在球面上才闭得起来
import * as THREE from 'three'
import { OrbitControls } from '../assets/OrbitControls.js'

const R = 1 // 地球半径(场景单位)
const R_QUAKE = 1.01 // 地震点略浮于地表,避免 z-fighting
const SPIN = 0.0006 // 空闲自转角速度(弧度/帧)
const IDLE_DELAY = 2500 // 交互结束后多久恢复自转(ms)

// 与 js/map.js 同款三色语义;globe 总是由 app.js 在 map.js 之后加载,兜底仅防御
const magColor = (window.QuakeMap && window.QuakeMap.magColor)
  || ((m) => (m >= 6 ? '#dc2626' : m >= 4.5 ? '#ea580c' : '#d97706'))

const magSize = (m) => Math.max(0.006, (m - 1.5) * 0.0045)

/** 经纬度 → 球面直角坐标(与等距圆柱贴图的默认 UV 对齐) */
function lonLatToVec3(lon, lat, r) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  ]
}

// 按震级缩放的圆点:three 内置 PointsMaterial 只有统一 size,这里用最小着色器换取逐点大小
const POINT_VERT = `
  attribute float aSize;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const POINT_FRAG = `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, 1.0 - smoothstep(0.42, 0.5, d));
  }
`

/**
 * @param {HTMLElement} container 承载画布的容器(#globeBox)
 * @returns {{ enabled: boolean, setQuakes: Function, onPick: Function, show: Function, hide: Function, resize: Function, dispose: Function }}
 */
export default function createGlobe(container) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  } catch {
    // 希沃低配机可能没有可用的 WebGL:交由 app.js 隐藏 3D 按钮,2D 视图完整可用
    return {
      enabled: false,
      setQuakes() {}, onPick() {}, show() {}, hide() {}, resize() {}, dispose() {}
    }
  }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setClearColor(0xffffff, 1)
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100)
  camera.position.set(0.6, 0.55, 2.6)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.1
  controls.enablePan = false
  controls.minDistance = 1.3
  controls.maxDistance = 5

  scene.add(new THREE.AmbientLight(0xffffff, 0.85))
  const sun = new THREE.DirectionalLight(0xfff6e6, 0.9)
  sun.position.set(3, 2, 4)
  scene.add(sun)

  // 自转组:地球与地震点同属一组,自转时保持贴合
  const world = new THREE.Group()
  scene.add(world)

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 48),
    new THREE.MeshPhongMaterial({ color: 0xf2efe8, shininess: 4 })
  )
  world.add(earth)

  new THREE.TextureLoader().load('./assets/earth.jpg', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace
    earth.material.map = tex
    earth.material.color.set(0xffffff)
    earth.material.needsUpdate = true
  })

  // ---------- 地震点 ----------
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    vertexColors: true,
    transparent: true
  })
  let points = null
  let quakes = []

  function setQuakes(list) {
    quakes = list ?? []
    if (points) {
      world.remove(points)
      points.geometry.dispose()
      points = null
    }
    if (!quakes.length) return

    const pos = new Float32Array(quakes.length * 3)
    const col = new Float32Array(quakes.length * 3)
    const size = new Float32Array(quakes.length)
    const c = new THREE.Color()
    for (let i = 0; i < quakes.length; i++) {
      const q = quakes[i]
      const [x, y, z] = lonLatToVec3(q.lon, q.lat, R_QUAKE)
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
      c.set(magColor(q.mag))
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
      size[i] = magSize(q.mag)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    points = new THREE.Points(geo, pointMaterial)
    world.add(points)
  }

  // ---------- 拾取:射线命中最近的地震点,且不能被地球挡住 ----------
  const raycaster = new THREE.Raycaster()
  raycaster.params.Points.threshold = 0.02
  const ndc = new THREE.Vector2()
  let pickHandler = null
  let downAt = null

  function pick(clientX, clientY) {
    if (!points) return null
    const r = renderer.domElement.getBoundingClientRect()
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    const hits = raycaster.intersectObject(points, false)
    if (!hits.length) return null
    const near = hits.reduce((a, b) => (a.distance <= b.distance ? a : b))
    // 背面的点会被地球遮住,不该被点中
    const earthHit = raycaster.intersectObject(earth, false)[0]
    if (earthHit && earthHit.distance < near.distance - 0.005) return null
    return quakes[near.index] ?? null
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY }
  })
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!pickHandler || !downAt) return
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
    downAt = null
    if (moved < 6) pickHandler(pick(e.clientX, e.clientY), e.clientX, e.clientY)
  })

  // ---------- 交互速度随视距自适应:贴近地面时转得慢、缩得细 ----------
  let idleAt = 0
  controls.addEventListener('start', () => { idleAt = Infinity })
  controls.addEventListener('end', () => { idleAt = performance.now() + IDLE_DELAY })

  function tuneSpeeds() {
    const altitude = Math.max(0, camera.position.length() - R)
    controls.rotateSpeed = altitude * 0.2
    controls.zoomSpeed = (altitude + 1) * 0.1
  }

  function resize() {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w <= 0 || h <= 0) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    // 着色器里的透视点径换算基准 = 绘图缓冲高度的一半
    pointMaterial.uniforms.uScale.value = renderer.domElement.height / 2
  }
  new ResizeObserver(resize).observe(container)

  let running = false
  function frame() {
    tuneSpeeds()
    controls.update()
    if (!reduced && performance.now() > idleAt) world.rotation.y += SPIN
    renderer.render(scene, camera)
  }

  function show() {
    if (running) return
    running = true
    resize() // 容器此前是 hidden,尺寸要到显示后才量得到
    renderer.setAnimationLoop(frame)
  }

  function hide() {
    if (!running) return
    running = false
    renderer.setAnimationLoop(null) // 停帧省电,低配机切回 2D 后不再吃 GPU
  }

  function dispose() {
    hide()
    renderer.dispose()
    if (points) points.geometry.dispose()
    earth.geometry.dispose()
    if (earth.material.map) earth.material.map.dispose()
    earth.material.dispose()
    pointMaterial.dispose()
  }

  return {
    enabled: true,
    setQuakes,
    onPick(cb) { pickHandler = cb },
    show,
    hide,
    resize,
    dispose
  }
}
