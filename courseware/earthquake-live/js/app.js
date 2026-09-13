// 全球地震带·实时分布 — 装配层:数据加载 / 环节联动 / 详情卡 / 2D↔3D 切换
// 原则:所有异步失败都静默降级,绝不弹窗打断授课
(function () {
  const $ = (id) => document.getElementById(id)

  const dom = {
    stage: $('stage'),
    canvas: $('mapCanvas'),
    globeBox: $('globeBox'),
    tabs: $('phaseTabs'),
    rangeBtns: $('rangeBtns'),
    viewToggle: $('viewToggle'),
    caption: $('caption'),
    tickerText: $('tickerText'),
    detail: $('detail'),
    badge: $('badge')
  }

  const map = window.QuakeMap.createMap(dom.canvas)
  window.addEventListener('resize', () => map.resize())
  new ResizeObserver(() => map.resize()).observe(dom.stage)

  let quakes = []
  let range = 'week'
  let globe = null // 懒加载后的 3D 视图
  let is3D = false

  // ---------- 静态数据(板块边界 / 中国地震带示意) ----------
  async function loadJSON(url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`)
    return res.json()
  }

  const staticData = Promise.all([
    loadJSON('./data/plates.min.geojson').catch(() => null),
    loadJSON('./data/china-belts.json').catch(() => null)
  ])

  // 边界类型只在详情卡里用到,等老师第一次点地震再拉
  let stepsPromise = null
  function loadSteps() {
    if (!stepsPromise) stepsPromise = loadJSON('./data/plate-steps.json').catch(() => null)
    return stepsPromise
  }

  // ---------- 数据来源角标 ----------
  const SOURCE_LABEL = { live: 'USGS 实时', cache: 'USGS(本机缓存)', snapshot: 'USGS(离线快照)' }

  function ago(ms) {
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} 分钟前`
    if (s < 86400) return `${Math.floor(s / 3600)} 小时前`
    return `${Math.floor(s / 86400)} 天前`
  }

  function updateBadge(source, fetchedAt, count) {
    dom.badge.textContent = `数据来源:${SOURCE_LABEL[source] ?? 'USGS'} · ${count} 条 · 更新于 ${ago(fetchedAt)}`
  }

  // ---------- 加载某个时间范围的地震 ----------
  let lastFetchedAt = Date.now()
  let lastSource = 'live'
  let loadSeq = 0
  async function setRange(next, { animate = true } = {}) {
    range = next
    for (const btn of dom.rangeBtns.querySelectorAll('button')) {
      btn.classList.toggle('active', btn.dataset.range === next)
    }
    const seq = ++loadSeq
    let result
    try {
      result = await window.QuakeData.loadQuakes(next)
    } catch {
      return // 三级回退都失败(快照文件缺失):保持上一次的画面
    }
    if (seq !== loadSeq) return // 已有更新的请求,丢弃这次结果

    const [plates, belts] = await staticData
    quakes = result.list
    map.setData({ quakes, plates, chinaBelts: belts })
    if (animate) map.revealAnimated()
    if (globe) globe.setQuakes(quakes)
    window.QuakePhases.updateTicker(dom.tickerText, quakes)
    updateBadge(result.source, result.fetchedAt, quakes.length)
    lastFetchedAt = result.fetchedAt
    lastSource = result.source
  }

  dom.rangeBtns.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-range]')
    if (btn && btn.dataset.range !== range) setRange(btn.dataset.range)
  })

  // ---------- 环节状态机 ----------
  const phases = window.QuakePhases.createPhases({
    map,
    dom: { tabs: dom.tabs, caption: dom.caption },
    onAutoRange: (r) => { if (r !== range) setRange(r) }
  })

  // ---------- 详情卡 ----------
  const NEAR_DEG = 4.5 // 约 500km:再远就不好说这次地震跟那条边界有关

  /** 找出离震中最近的板块边界分段类型码;太远则返回 null */
  function nearestStepClass(steps, q) {
    if (!steps) return null
    const cosLat = Math.cos((q.lat * Math.PI) / 180)
    let best = Infinity
    let cls = null
    for (const s of steps.steps) {
      let dlon = Math.abs(s.lon - q.lon)
      if (dlon > 180) dlon = 360 - dlon
      // 经度差按纬度收缩,近似球面距离(单位:度)
      const d = Math.hypot(dlon * cosLat, s.lat - q.lat)
      if (d < best) { best = d; cls = s.c }
    }
    return best <= NEAR_DEG ? cls : null
  }

  // Bird 2003 的边界类型码 → 教学用中文。三大类(消亡/生长/转换)先行,括号里补细节
  const BOUNDARY_CN = {
    SUB: '俯冲带 · 消亡边界(大洋板块俯冲)',
    OCB: '大洋汇聚边界 · 消亡边界',
    CCB: '大陆碰撞带 · 消亡边界',
    OSR: '洋中脊 · 生长边界(海底扩张)',
    CRB: '大陆裂谷 · 生长边界',
    OTF: '大洋转换断层 · 转换边界(水平错动)',
    CTF: '大陆转换断层 · 转换边界(水平错动)'
  }

  function fmtTime(ms) {
    const d = new Date(ms)
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }

  let detailSeq = 0

  function showDetail(q, x, y) {
    if (!q) { dom.detail.hidden = true; return }
    const seq = ++detailSeq
    const color = window.QuakeMap.magColor(q.mag)
    // 成因/防震环节才谈边界类型 —— 前两个环节的任务是先看出「带」,不该先给答案
    const wantBoundary = phases.current() === 'cause' || phases.current() === 'safety'

    dom.detail.innerHTML = `
      <div class="mag" style="color:${color}">M${q.mag.toFixed(1)} <small>级</small></div>
      <div class="place">${q.place || '未知地点'}</div>
      <div class="row"><span>发震时刻</span><b>${fmtTime(q.time)}</b></div>
      <div class="row"><span>震源深度</span><b>${Math.round(q.depth)} km</b></div>
      ${wantBoundary ? '<div class="row" id="boundaryRow"><span>邻近板块边界</span><b>查询中…</b></div>' : ''}
      ${q.tsunami ? '<div class="tsunami">⚠ 曾发布海啸预警</div>' : ''}
    `
    dom.detail.hidden = false
    place()

    if (wantBoundary) {
      loadSteps().then((steps) => {
        if (seq !== detailSeq) return // 已经点了别的地震
        const row = document.getElementById('boundaryRow')
        if (!row) return
        const cls = nearestStepClass(steps, q)
        row.querySelector('b').textContent = cls
          ? (BOUNDARY_CN[cls] || cls)
          : (steps ? '—(远离板块边界)' : '—')
        place() // 文案变长可能换行,重新夹一次位置
      })
    }

    // 贴着点击处摆放,并夹在舞台内
    function place() {
      const s = dom.stage.getBoundingClientRect()
      const w = dom.detail.offsetWidth
      const h = dom.detail.offsetHeight
      dom.detail.style.left = `${Math.min(Math.max(8, x + 16), s.width - w - 8)}px`
      dom.detail.style.top = `${Math.min(Math.max(8, y - h / 2), s.height - h - 8)}px`
    }
  }

  map.onPick((q, x, y) => showDetail(q, x, y))

  // ---------- 2D ↔ 3D ----------
  async function ensureGlobe() {
    if (globe) return globe
    try {
      const mod = await import('./globe.js')
      globe = mod.default(dom.globeBox)
    } catch {
      globe = { enabled: false, setQuakes() {}, onPick() {}, show() {}, hide() {}, resize() {} }
    }
    if (!globe.enabled) {
      dom.viewToggle.hidden = true // WebGL 不可用:退回纯 2D,不给老师留一个按了没反应的按钮
      return globe
    }
    globe.setQuakes(quakes)
    globe.onPick((q, cx, cy) => {
      const s = dom.stage.getBoundingClientRect()
      showDetail(q, cx - s.left, cy - s.top)
    })
    return globe
  }

  async function setView3D(on) {
    const g = await ensureGlobe()
    if (!g.enabled) return
    is3D = on
    dom.viewToggle.classList.toggle('on', on)
    dom.viewToggle.textContent = on ? '🗺 2D' : '🌐 3D'
    dom.detail.hidden = true
    if (on) {
      dom.globeBox.classList.add('fading')
      dom.globeBox.hidden = false
      g.show()
      requestAnimationFrame(() => dom.globeBox.classList.remove('fading'))
    } else {
      dom.globeBox.classList.add('fading')
      setTimeout(() => {
        if (is3D) return // 400ms 内又切回来了
        dom.globeBox.hidden = true
        g.hide()
      }, 400)
    }
  }

  dom.viewToggle.addEventListener('click', () => setView3D(!is3D))

  // ---------- 启动 ----------
  setRange('week', { animate: true })
  phases.go('observe')

  // 「X 分钟前」会随时间过期,每分钟刷一次文案(不重新请求网络)
  setInterval(() => {
    if (quakes.length) {
      window.QuakePhases.updateTicker(dom.tickerText, quakes)
      updateBadge(lastSource, lastFetchedAt, quakes.length)
    }
  }, 60000)
})()
