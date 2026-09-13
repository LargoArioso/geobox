// 全球地震带·实时分布 — 四环节状态机 + 最近地震滚动条
(function (root) {
  const PHASES = {
    observe: {
      caption: '这是刚刚过去、真实发生的地震。它们分布均匀吗?'
    },
    pattern: {
      caption: '切换到30天——地震集中在什么地方?像不像几条带子?',
      autoRange: 'month'
    },
    cause: {
      caption: '叠加板块边界——你发现了什么?(注意:板块边界不等于海岸线)'
    },
    safety: {
      caption: '我国地处两大地震带交汇处。中国地震带(示意)在哪里?震级≠烈度,如何应对?'
    }
  }

  function ago(timeMs, now) {
    const s = Math.max(0, Math.floor((now - timeMs) / 1000))
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}分钟前`
    if (s < 86400) return `${Math.floor(s / 3600)}小时前`
    return `${Math.floor(s / 86400)}天前`
  }

  function fmtMag(m) {
    return `M${m.toFixed(1)}`
  }

  /** 滚动条:最近 10 条地震简报,内容重复两遍支撑无缝滚动 */
  function updateTicker(tickerText, quakes) {
    if (!quakes.length) { tickerText.textContent = ''; return }
    const now = Date.now()
    const latest = [...quakes].sort((a, b) => b.time - a.time).slice(0, 10)
    const seg = latest.map((q) => `${fmtMag(q.mag)} · ${q.place} · ${ago(q.time, now)}`).join('　·　')
    tickerText.textContent = `${seg}　·　${seg}`
  }

  /**
   * @param {{ map: object, dom: { tabs: HTMLElement, caption: HTMLElement }, onAutoRange?: (range:string)=>void }} opts
   */
  function createPhases({ map, dom, onAutoRange }) {
    let current = 'observe'

    function go(id) {
      const cfg = PHASES[id]
      if (!cfg) return
      current = id
      // 页签激活态
      for (const btn of dom.tabs.querySelectorAll('button')) {
        btn.classList.toggle('active', btn.dataset.phase === id)
      }
      dom.caption.textContent = cfg.caption
      map.setPhase(id)
      if (id === 'cause' || id === 'safety') map.drawBoundariesAnimated()
      if (id === 'observe' || id === 'pattern') map.revealAnimated()
      if (cfg.autoRange && onAutoRange) onAutoRange(cfg.autoRange)
    }

    // 页签点击
    dom.tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-phase]')
      if (btn) go(btn.dataset.phase)
    })

    return { go, current: () => current }
  }

  root.QuakePhases = { createPhases, updateTicker, PHASES }
})(window)
