// 时区换算器 — 主程序（纯 Canvas 2D，数据：Natural Earth 实测时区边界）
const $ = (id) => document.getElementById(id)

// ---------- 主要城市（标准时，不含夏令时） ----------
const CITIES = [
  { name: '北京', offset: 8, lon: 116.41, lat: 39.9 },
  { name: '东京', offset: 9, lon: 139.69, lat: 35.69 },
  { name: '首尔', offset: 9, lon: 126.98, lat: 37.57 },
  { name: '新加坡', offset: 8, lon: 103.85, lat: 1.29 },
  { name: '曼谷', offset: 7, lon: 100.5, lat: 13.76 },
  { name: '孟买', offset: 5.5, lon: 72.88, lat: 19.08 },
  { name: '迪拜', offset: 4, lon: 55.27, lat: 25.2 },
  { name: '莫斯科', offset: 3, lon: 37.62, lat: 55.76 },
  { name: '开罗', offset: 2, lon: 31.24, lat: 30.04 },
  { name: '巴黎', offset: 1, lon: 2.35, lat: 48.86 },
  { name: '伦敦', offset: 0, lon: -0.13, lat: 51.51 },
  { name: '圣保罗', offset: -3, lon: -46.63, lat: -23.55 },
  { name: '纽约', offset: -5, lon: -74.01, lat: 40.71 },
  { name: '洛杉矶', offset: -8, lon: -118.24, lat: 34.05 },
  { name: '悉尼', offset: 10, lon: 151.21, lat: -33.87 },
  { name: '奥克兰', offset: 12, lon: 174.76, lat: -36.85 }
]

const state = {
  features: [],
  from: { ...CITIES[0] }, // 北京
  to: { ...CITIES[10] }, // 伦敦
  fromMinutes: 720, // 出发地当地时刻（分钟）
  pickTo: true, // 点图选目的地（false 则选出发地）
  hover: null
}

// ---------- 时区配色：西经蓝、东经橙，偏移越大越深（半透明，透出真实地图） ----------
function zoneColor(offset, strong = false) {
  const a = Math.min(Math.abs(offset), 14) / 14
  const h = offset >= 0 ? 32 : 212
  const s = 40 + a * 25
  const l = strong ? 100 - (18 + a * 40) : 100 - (6 + a * 22)
  return `hsla(${h}, ${s}%, ${l}%, ${strong ? 0.72 : 0.42})`
}

// ---------- 真实世界地图底图（Natural Earth II，等距圆柱投影） ----------
const earthImg = new Image()
let earthReady = false
earthImg.onload = () => {
  earthReady = true
  draw()
}
earthImg.src = './data/earth.jpg'

function drawEarthBase(w, h) {
  if (!earthReady) return
  const [x1, y1] = lonLatToXY(-180, 90)
  const [x2, y2] = lonLatToXY(180, -90)
  ctx.drawImage(earthImg, x1, y1, x2 - x1, y2 - y1)
  // 纸感柔光罩，让叠加的文字与边界更清晰
  ctx.fillStyle = 'rgba(250,248,244,0.18)'
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
}

function fmtOffset(offset) {
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return `UTC${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtClock(minutes) {
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

function fmtDate(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日 周${'日一二三四五六'[date.getDay()]}`
}

// ---------- 投影：等距圆柱 ----------
let proj = { scale: 1, ox: 0, oy: 0 }
function lonLatToXY(lon, lat) {
  return [proj.ox + lon * proj.scale, proj.oy - lat * proj.scale]
}
function xyToLonLat(x, y) {
  return [(x - proj.ox) / proj.scale, -(y - proj.oy) / proj.scale]
}

const map = $('map')
const ctx = map.getContext('2d')

function fitProjection(w, h) {
  const pad = 12
  const s = Math.min((w - pad * 2) / 360, (h - pad * 2) / 180)
  proj = { scale: s, ox: w / 2, oy: h / 2 }
}

// ---------- 命中测试：射线法 ----------
function pointInRing(lon, lat, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function featureAt(lon, lat) {
  for (const f of state.features) {
    const b = f.bbox
    if (lon < b[0] || lat < b[1] || lon > b[2] || lat > b[3]) continue
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
    for (const poly of polys) {
      if (pointInRing(lon, lat, poly[0])) {
        let inHole = false
        for (let k = 1; k < poly.length; k++) {
          if (pointInRing(lon, lat, poly[k])) { inHole = true; break }
        }
        if (!inHole) return f
      }
    }
  }
  return null
}

// ---------- 绘制 ----------
function drawFeature(f, fill, stroke, lw) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
  ctx.beginPath()
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const [x, y] = lonLatToXY(ring[i][0], ring[i][1])
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
  }
  ctx.fillStyle = fill
  ctx.fill('evenodd')
  ctx.strokeStyle = stroke
  ctx.lineWidth = lw
  ctx.stroke()
}

function draw() {
  const dpr = Math.min(devicePixelRatio, 2)
  const w = map.clientWidth
  const h = map.clientHeight
  if (!w || !h) return
  if (map.width !== Math.round(w * dpr)) {
    map.width = Math.round(w * dpr)
    map.height = Math.round(h * dpr)
    // canvas 是被替换元素，width 属性会改变固有尺寸撑破 absolute 布局，必须显式锁回 CSS 尺寸
    map.style.width = `${w}px`
    map.style.height = `${h}px`
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  fitProjection(w, h)

  // 真实世界地图底图
  drawEarthBase(w, h)

  // 理论时区界（每 15° 虚线）+ 纬线
  ctx.strokeStyle = 'rgba(38,38,38,0.14)'
  ctx.lineWidth = 0.7
  ctx.setLineDash([4, 4])
  for (let lon = -165; lon <= 165; lon += 15) {
    const [x1, y1] = lonLatToXY(lon, 90)
    const [x2, y2] = lonLatToXY(lon, -90)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [x1, y1] = lonLatToXY(-180, lat)
    const [x2, y2] = lonLatToXY(180, lat)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }
  ctx.setLineDash([])

  // 本初子午线强调
  const [gx1, gy1] = lonLatToXY(0, 90)
  const [gx2, gy2] = lonLatToXY(0, -90)
  ctx.strokeStyle = 'rgba(38,38,38,0.45)'
  ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(gx1, gy1); ctx.lineTo(gx2, gy2); ctx.stroke()
  ctx.fillStyle = 'rgba(38,38,38,0.55)'
  ctx.font = '11px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText('本初子午线 0°', gx1, gy2 - 6)

  // 时区多边形
  for (const f of state.features) {
    drawFeature(f, zoneColor(f.properties.zone), 'rgba(38,38,38,0.35)', 0.6)
  }

  // 悬停高亮
  if (state.hover) {
    drawFeature(state.hover, zoneColor(state.hover.properties.zone, true), '#262626', 1.6)
  }

  // 国际日期变更线（±180°，两侧边缘红虚线）
  ctx.strokeStyle = '#c0392b'
  ctx.lineWidth = 2
  ctx.setLineDash([8, 5])
  for (const lon of [180, -180]) {
    const [x1, y1] = lonLatToXY(lon, 90)
    const [x2, y2] = lonLatToXY(lon, -90)
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  }
  ctx.setLineDash([])
  const [dlx, dly] = lonLatToXY(180, 78)
  ctx.fillStyle = '#c0392b'
  ctx.font = 'bold 11px Consolas, monospace'
  ctx.textAlign = 'right'
  ctx.fillText('国际日期变更线', dlx - 6, dly)

  // 城市点
  ctx.textAlign = 'left'
  for (const c of CITIES) {
    const [x, y] = lonLatToXY(c.lon, c.lat)
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#262626'
    ctx.fill()
    ctx.fillStyle = 'rgba(38,38,38,0.75)'
    ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.fillText(c.name, x + 6, y + 4)
  }

  // 出发地 / 目的地标记
  drawMarker(state.from, '#262626', 'A')
  drawMarker(state.to, '#c8963c', 'B')
}

function drawMarker(loc, color, label) {
  const [x, y] = lonLatToXY(loc.lon, loc.lat)
  ctx.beginPath()
  ctx.arc(x, y, 9, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#faf8f4'
  ctx.stroke()
  ctx.fillStyle = '#faf8f4'
  ctx.font = 'bold 11px Consolas, monospace'
  ctx.textAlign = 'center'
  ctx.fillText(label, x, y + 4)
}

// ---------- 面板更新 ----------
function updatePanel() {
  $('fromName').textContent = state.from.name
  $('fromOffset').textContent = fmtOffset(state.from.offset)
  $('toName').textContent = state.to.name
  $('toOffset').textContent = fmtOffset(state.to.offset)

  const fromMin = state.fromMinutes
  const utcMin = fromMin - state.from.offset * 60
  const toMinRaw = utcMin + state.to.offset * 60
  const dayShift = Math.floor(toMinRaw / 1440)
  const toMin = ((toMinRaw % 1440) + 1440) % 1440

  $('fromClock').textContent = fmtClock(fromMin)
  $('toClock').textContent = fmtClock(toMin)

  const today = new Date()
  $('fromDate').textContent = fmtDate(today)
  const toDate = new Date(today)
  toDate.setDate(toDate.getDate() + dayShift)
  $('toDate').textContent = dayShift === 0 ? fmtDate(today) : `${fmtDate(toDate)}（${dayShift > 0 ? '+' : ''}${dayShift} 天）`

  const diff = state.to.offset - state.from.offset
  const abs = Math.abs(diff)
  const diffTxt = Number.isInteger(abs) ? `${abs} 小时` : `${abs} 小时`
  if (diff === 0) {
    $('diffValue').textContent = '两地无时差'
  } else {
    $('diffValue').textContent = `${state.to.name}比${state.from.name}${diff > 0 ? '早' : '晚'} ${diffTxt}`
  }
  const note = $('diffNote')
  if (dayShift === 0) {
    note.textContent = '同一日期'
    note.classList.add('same')
  } else {
    note.textContent = dayShift > 0 ? '目的地日期 +1 天（时刻累加跨过 24:00）' : '目的地日期 -1 天（时刻回退跨过 0:00）'
    note.classList.remove('same')
  }
}

// ---------- 交互 ----------
let hoverRaf = 0
map.addEventListener('pointermove', (e) => {
  if (hoverRaf) return
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0
    const rect = map.getBoundingClientRect()
    const [lon, lat] = xyToLonLat(e.clientX - rect.left, e.clientY - rect.top)
    const f = featureAt(lon, lat)
    const changed = f !== state.hover
    state.hover = f
    const tt = $('tooltip')
    if (f) {
      tt.hidden = false
      tt.innerHTML = `${fmtOffset(f.properties.zone)}<br><span class="tt-places">${f.properties.places || '（无常住人口地区）'}</span>`
      const tx = Math.min(e.clientX - rect.left + 14, rect.width - 240)
      const ty = Math.min(e.clientY - rect.top + 14, rect.height - 70)
      tt.style.left = `${tx}px`
      tt.style.top = `${ty}px`
    } else {
      tt.hidden = true
    }
    if (changed) draw()
  })
})

map.addEventListener('pointerleave', () => {
  state.hover = null
  $('tooltip').hidden = true
  draw()
})

map.addEventListener('pointerdown', (e) => {
  const rect = map.getBoundingClientRect()
  const [lon, lat] = xyToLonLat(e.clientX - rect.left, e.clientY - rect.top)
  const f = featureAt(lon, lat)
  if (!f) return
  const place = (f.properties.places || '').split(',')[0].trim()
  const loc = {
    name: place || fmtOffset(f.properties.zone),
    offset: f.properties.zone,
    lon,
    lat
  }
  if (state.pickTo) state.to = loc
  else state.from = loc
  draw()
  updatePanel()
})

$('pickMode').addEventListener('click', (e) => {
  state.pickTo = !state.pickTo
  e.target.textContent = state.pickTo ? '点图选目的地' : '点图选出发地'
  e.target.classList.toggle('on', state.pickTo)
})

document.querySelectorAll('#cityQuick .btn').forEach((b) => {
  b.addEventListener('click', () => {
    const c = CITIES.find((x) => x.name === b.dataset.city)
    if (!c) return
    if (state.pickTo) state.to = { ...c }
    else state.from = { ...c }
    document.querySelectorAll('#cityQuick .btn').forEach((x) => x.classList.toggle('on', x === b))
    draw()
    updatePanel()
  })
})

$('timeSlider').addEventListener('input', (e) => {
  state.fromMinutes = parseInt(e.target.value, 10)
  updatePanel()
})

$('useNow').addEventListener('click', () => {
  const now = new Date()
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  state.fromMinutes = ((Math.round(utcMin + state.from.offset * 60) % 1440) + 1440) % 1440
  $('timeSlider').value = String(state.fromMinutes)
  updatePanel()
})

if (window.geobox) {
  $('exitBtn').hidden = false
  $('exitBtn').addEventListener('click', () => window.geobox.exit())
}

// ---------- 尺寸自适应 ----------
function onResize() { draw() }
window.addEventListener('resize', onResize)
new ResizeObserver(() => draw()).observe($('mapWrap'))

// ---------- 启动：加载真实时区数据 ----------
function computeBBox(geometry) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (coords) => {
    if (typeof coords[0] === 'number') {
      if (coords[0] < bbox[0]) bbox[0] = coords[0]
      if (coords[1] < bbox[1]) bbox[1] = coords[1]
      if (coords[0] > bbox[2]) bbox[2] = coords[0]
      if (coords[1] > bbox[3]) bbox[3] = coords[1]
      return
    }
    coords.forEach(walk)
  }
  walk(geometry.coordinates)
  return bbox
}

fetch('./data/timezones.min.geojson')
  .then((r) => r.json())
  .then((geo) => {
    state.features = geo.features.map((f) => ({ ...f, bbox: computeBBox(f.geometry) }))
    draw()
    updatePanel()
    $('useNow').click() // 默认展示当前真实时间
  })
  .catch((err) => {
    $('mapHint').textContent = `时区数据加载失败：${err.message}`
  })
