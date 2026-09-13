// 全球地震带·实时分布 — 2D 世界地图视图(等距圆柱投影,Canvas 2D)
// 渲染策略:静态层(底图/板块边界/地震带/地震点)离屏预渲染,每帧只叠最新地震涟漪,低配机友好
(function (root) {
  const MAG_COLORS = [
    { min: 6, color: '#dc2626' },
    { min: 4.5, color: '#ea580c' },
    { min: -99, color: '#d97706' }
  ]
  const magColor = (m) => MAG_COLORS.find((c) => m >= c.min).color
  const magRadius = (m, scale) => Math.max(3, (m - 1.5) * 2.2) * Math.sqrt(scale)

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  function createMap(canvas, hooks = {}) {
    const ctx = canvas.getContext('2d')
    const reduced = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches

    // ---------- 视图状态(scale=1 时世界地图恰好适配舞台) ----------
    const view = { scale: 1, ox: 0, oy: 0 }
    const target = { scale: 1, ox: 0, oy: 0 }
    let W = 0, H = 0, dpr = 1, baseW = 0 // baseW:scale=1 时图幅宽(高为其一半)

    // ---------- 数据状态 ----------
    let quakes = []        // 已按 time 升序
    let plates = null
    let chinaBelts = null
    let phase = 'observe'
    let revealT = 1        // 级联点亮进度 0→1
    let boundaryT = 1      // 板块边界绘出进度 0→1
    let pickHandler = null

    // ---------- 底图 ----------
    const earthImg = new Image()
    let earthReady = false
    earthImg.onload = () => { earthReady = true; staticDirty = true }
    earthImg.src = './data/earth.jpg'

    // ---------- 静态离屏层 ----------
    const staticCanvas = document.createElement('canvas')
    const sctx = staticCanvas.getContext('2d')
    let staticDirty = true

    function resize() {
      const r = canvas.getBoundingClientRect()
      dpr = root.devicePixelRatio || 1
      W = r.width; H = r.height
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      staticCanvas.width = canvas.width
      staticCanvas.height = canvas.height
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      baseW = Math.min(W, 2 * H)
      // 居中
      view.ox = (W - baseW * view.scale) / 2
      view.oy = (H - (baseW / 2) * view.scale) / 2
      Object.assign(target, view)
      staticDirty = true
    }

    function lonLatToXY(lon, lat, v = view) {
      return [
        ((lon + 180) / 360) * baseW * v.scale + v.ox,
        ((90 - lat) / 180) * (baseW / 2) * v.scale + v.oy
      ]
    }

    function clampView(v) {
      const mw = baseW * v.scale, mh = (baseW / 2) * v.scale
      v.ox = mw <= W ? (W - mw) / 2 : clamp(v.ox, W - mw, 0)
      v.oy = mh <= H ? (H - mh) / 2 : clamp(v.oy, H - mh, 0)
    }

    // ---------- 静态层绘制 ----------
    function drawBase() {
      sctx.fillStyle = '#fafaf8'
      sctx.fillRect(0, 0, W, H)
      if (!earthReady) return
      const [x1, y1] = lonLatToXY(-180, 90)
      const [x2, y2] = lonLatToXY(180, -90)
      sctx.drawImage(earthImg, x1, y1, x2 - x1, y2 - y1)
      // 纸感柔光罩,让叠加元素更清晰
      sctx.fillStyle = 'rgba(250,248,244,0.18)'
      sctx.fillRect(x1, y1, x2 - x1, y2 - y1)
    }

    /** 逐段画经纬折线;跳过跨 ±180° 经线的段(防横穿图幅) */
    function strokePath(c, coords) {
      let started = false
      for (const [lon, lat] of coords) {
        if (started && Math.abs(lon - started[0]) > 180) started = false // 跨日界线,抬笔
        const [x, y] = lonLatToXY(lon, lat)
        if (!started) { c.moveTo(x, y); started = [lon, lat] }
        else c.lineTo(x, y)
      }
    }

    function forEachLine(geojson, cb) {
      if (!geojson) return
      for (const f of geojson.features) {
        const g = f.geometry
        if (!g) continue
        if (g.type === 'LineString') cb(f, g.coordinates)
        else if (g.type === 'MultiLineString') for (const line of g.coordinates) cb(f, line)
      }
    }

    function drawPlates() {
      const show = phase === 'cause' || phase === 'safety' || boundaryT < 1
      if (!show || !plates) return
      const features = []
      forEachLine(plates, (f, coords) => features.push(coords))
      const N = features.length
      sctx.strokeStyle = '#2563eb'
      sctx.lineWidth = 1.6
      sctx.lineCap = 'round'
      for (let i = 0; i < N; i++) {
        // 流光扫过:各 feature 依次绘出
        const local = reduced ? 1 : clamp(boundaryT * (N * 0.7 + 1) - i * 0.7, 0, 1)
        if (local <= 0) continue
        sctx.beginPath()
        strokePath(sctx, features[i])
        if (local < 1) {
          // 估算长度用于 dash 偏移(粗估:段数 × 平均段长)
          const L = features[i].length * 14 * view.scale
          sctx.setLineDash([L])
          sctx.lineDashOffset = L * (1 - local)
          sctx.stroke()
          sctx.setLineDash([])
        } else {
          sctx.stroke()
        }
      }
    }

    function drawChinaBelts() {
      if (phase !== 'safety' || !chinaBelts) return
      sctx.strokeStyle = '#7c5cbf'
      sctx.lineWidth = 2.5
      sctx.setLineDash([8, 6])
      sctx.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif'
      sctx.fillStyle = '#7c5cbf'
      for (const belt of chinaBelts.belts) {
        sctx.beginPath()
        strokePath(sctx, belt.path)
        sctx.stroke()
        // 名称标在折线中点上方
        const mid = belt.path[Math.floor(belt.path.length / 2)]
        const [x, y] = lonLatToXY(mid[0], mid[1])
        sctx.fillText(belt.name, x + 6, y - 8)
      }
      sctx.setLineDash([])
      // 「示意」标注
      const [tx, ty] = lonLatToXY(105, 18)
      sctx.font = '12px "PingFang SC","Microsoft YaHei",sans-serif'
      sctx.fillStyle = '#a8a29e'
      sctx.fillText('中国地震带为示意图', tx - 40, ty)
    }

    function drawQuakes() {
      const n = revealT >= 1 ? quakes.length : Math.floor(quakes.length * revealT)
      for (let i = 0; i < n; i++) {
        const q = quakes[i]
        const [x, y] = lonLatToXY(q.lon, q.lat)
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue
        const r = magRadius(q.mag, view.scale)
        sctx.beginPath()
        sctx.arc(x, y, r, 0, Math.PI * 2)
        sctx.fillStyle = magColor(q.mag)
        sctx.fill()
        sctx.lineWidth = 1.5
        sctx.strokeStyle = '#ffffff'
        sctx.stroke()
      }
    }

    function renderStatic() {
      sctx.clearRect(0, 0, W, H)
      drawBase()
      drawPlates()
      drawChinaBelts()
      drawQuakes()
      staticDirty = false
    }

    // ---------- 涟漪(最新地震,每帧绘制) ----------
    let rippleT0 = performance.now()
    function drawRipple(now) {
      if (!quakes.length || phase === 'safety') return
      const newest = quakes[quakes.length - 1] // time 升序,最后一个最新
      const [x, y] = lonLatToXY(newest.lon, newest.lat)
      if (x < 0 || x > W || y < 0 || y > H) return
      const base = magRadius(newest.mag, view.scale)
      const elapsed = ((now - rippleT0) / 1000) % 2.4
      for (let k = 0; k < 3; k++) {
        const t = ((elapsed + k * 0.8) % 2.4) / 2.4
        ctx.beginPath()
        ctx.arc(x, y, base + t * 40 * Math.sqrt(view.scale), 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(220, 38, 38, ${(1 - t) * 0.55})`
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    // ---------- 动画主循环 ----------
    let flying = false
    function frame(now) {
      // 摄像机插值
      if (flying) {
        const lerp = reduced ? 1 : 0.12
        view.scale += (target.scale - view.scale) * lerp
        view.ox += (target.ox - view.ox) * lerp
        view.oy += (target.oy - view.oy) * lerp
        if (Math.abs(target.scale - view.scale) < 0.002
          && Math.abs(target.ox - view.ox) < 0.5
          && Math.abs(target.oy - view.oy) < 0.5) {
          Object.assign(view, target)
          flying = false
        }
        staticDirty = true
      }
      // 动画进度推进
      if (revealT < 1) { revealT = Math.min(1, revealT + 1 / 72); staticDirty = true }
      if (boundaryT < 1) { boundaryT = Math.min(1, boundaryT + 1 / 72); staticDirty = true }

      if (staticDirty) renderStatic()
      ctx.clearRect(0, 0, W, H)
      ctx.drawImage(staticCanvas, 0, 0, W, H)
      if (!reduced) drawRipple(now)
      requestAnimationFrame(frame)
    }

    // ---------- 交互:拖拽 / 捏合 / 滚轮 / 点选 ----------
    const pointers = new Map()
    let pinchDist = 0
    let dragMoved = 0

    function screenToCanvas(e) {
      const r = canvas.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top]
    }

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, screenToCanvas(e))
      dragMoved = 0
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1])
      }
    })

    canvas.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return
      const prev = pointers.get(e.pointerId)
      const cur = screenToCanvas(e)
      pointers.set(e.pointerId, cur)
      dragMoved += Math.hypot(cur[0] - prev[0], cur[1] - prev[1])

      if (pointers.size === 1) {
        view.ox += cur[0] - prev[0]
        view.oy += cur[1] - prev[1]
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1])
        if (pinchDist > 0) {
          const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2
          zoomAt(cx, cy, view.scale * (dist / pinchDist))
        }
        pinchDist = dist
      }
      clampView(view)
      Object.assign(target, view)
      staticDirty = true
    })

    function endPointer(e) {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinchDist = 0
      // 视为点选:几乎没拖动
      if (pointers.size === 0 && dragMoved < 6 && pickHandler) {
        const [x, y] = screenToCanvas(e)
        pickHandler(pick(x, y), x, y)
      }
    }
    canvas.addEventListener('pointerup', endPointer)
    canvas.addEventListener('pointercancel', endPointer)

    function zoomAt(cx, cy, newScale) {
      const s = clamp(newScale, 1, 8)
      const k = s / view.scale
      view.ox = cx - (cx - view.ox) * k
      view.oy = cy - (cy - view.oy) * k
      view.scale = s
      clampView(view)
      Object.assign(target, view)
      staticDirty = true
    }

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      const [x, y] = screenToCanvas(e)
      zoomAt(x, y, view.scale * Math.exp(-e.deltaY * 0.0012))
    }, { passive: false })

    // ---------- 命中检测:大震优先,触控容错 6px ----------
    function pick(x, y) {
      const sorted = [...quakes].sort((a, b) => b.mag - a.mag)
      for (const q of sorted) {
        const [qx, qy] = lonLatToXY(q.lon, q.lat)
        const r = magRadius(q.mag, view.scale)
        if (Math.hypot(x - qx, y - qy) < r + 6) return q
      }
      return null
    }

    // ---------- 摄像机动画 ----------
    function flyTo(lon, lat, scale) {
      const s = clamp(scale, 1, 8)
      target.scale = s
      target.ox = W / 2 - ((lon + 180) / 360) * baseW * s
      target.oy = H / 2 - ((90 - lat) / 180) * (baseW / 2) * s
      clampView(target)
      if (reduced) { Object.assign(view, target); staticDirty = true }
      else flying = true
    }

    const PHASE_CAM = {
      observe: [0, 10, 1.05],
      pattern: [0, 10, 1.05],
      cause: [0, 10, 1.05],
      safety: [105, 33, 2.2]
    }

    resize()
    requestAnimationFrame(frame)

    return {
      setData(d) {
        quakes = [...(d.quakes ?? [])].sort((a, b) => a.time - b.time)
        plates = d.plates ?? null
        chinaBelts = d.chinaBelts ?? null
        rippleT0 = performance.now()
        staticDirty = true
      },
      setPhase(p) {
        phase = p
        const cam = PHASE_CAM[p]
        if (cam) flyTo(cam[0], cam[1], cam[2])
        staticDirty = true
      },
      revealAnimated() {
        revealT = reduced ? 1 : 0
        staticDirty = true
      },
      drawBoundariesAnimated() {
        boundaryT = reduced ? 1 : 0
        staticDirty = true
      },
      onPick(cb) { pickHandler = cb },
      resize
    }
  }

  root.QuakeMap = { createMap, magColor }
})(window)
