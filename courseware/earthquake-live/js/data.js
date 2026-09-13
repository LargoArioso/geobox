// 全球地震带·实时分布 — 数据层:USGS 实时 → geobox.storage 缓存 → 包内快照,三级回退
(function (root) {
  const FEEDS = {
    day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
    month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'
  }

  function normalizeFeature(f) {
    const p = (f && f.properties) || {}
    const c = f && f.geometry && f.geometry.coordinates
    if (typeof p.mag !== 'number' || !Array.isArray(c) || c.length < 3) return null
    const lon = c[0], lat = c[1], depth = c[2]
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null
    return {
      id: String(f.id ?? ''),
      mag: p.mag,
      place: String(p.place ?? ''),
      time: p.time ?? 0,
      lon, lat, depth,
      tsunami: p.tsunami ?? 0
    }
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
    ])
  }

  async function defaultSnapshotLoader() {
    const res = await fetch('./data/quakes-snapshot.json')
    if (!res.ok) throw new Error('snapshot http ' + res.status)
    return res.json()
  }

  /**
   * 加载地震数据,三级回退:USGS 实时 → geobox.storage 缓存 → 包内快照
   * @param {'day'|'week'|'month'} range
   * @param {{ fetchImpl?, storageGet?, storageSet?, snapshotLoader? }} deps 测试注入用
   * @returns {Promise<{ list: object[], source: 'live'|'cache'|'snapshot', fetchedAt: number }>}
   */
  async function loadQuakes(range, deps = {}) {
    const fetchImpl = deps.fetchImpl ?? ((u) => withTimeout(fetch(u), 8000))
    const storageGet = deps.storageGet ?? (async (k) => (root.geobox ? root.geobox.storage.get(k) : null))
    const storageSet = deps.storageSet ?? (async (k, v) => { if (root.geobox) await root.geobox.storage.set(k, v) })
    const snapshotLoader = deps.snapshotLoader ?? defaultSnapshotLoader
    const cacheKey = `quake-cache-${range}`

    try {
      const res = await fetchImpl(FEEDS[range])
      if (!res.ok) throw new Error('http ' + res.status)
      const feed = await res.json()
      const list = feed.features.map(normalizeFeature).filter(Boolean)
      if (!list.length) throw new Error('empty feed')
      const payload = { fetchedAt: Date.now(), quakes: list }
      try { await storageSet(cacheKey, JSON.stringify(payload)) } catch { /* 缓存失败不阻断 */ }
      return { list, source: 'live', fetchedAt: payload.fetchedAt }
    } catch { /* 落入下一级 */ }

    try {
      const cached = await storageGet(cacheKey)
      if (cached) {
        const payload = JSON.parse(cached)
        if (Array.isArray(payload.quakes) && payload.quakes.length) {
          return { list: payload.quakes, source: 'cache', fetchedAt: payload.fetchedAt }
        }
      }
    } catch { /* 落入下一级 */ }

    const snap = await snapshotLoader()
    return { list: snap.quakes, source: 'snapshot', fetchedAt: snap.fetchedAt }
  }

  const api = { FEEDS, normalizeFeature, loadQuakes }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.QuakeData = api
})(typeof window !== 'undefined' ? window : globalThis)
