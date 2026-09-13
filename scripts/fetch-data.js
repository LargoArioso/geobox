// 开发期数据准备:抓取 USGS 近30天地震快照 + PB2002 板块边界,精简后写入课件 data/
// 用法:node scripts/fetch-data.js
const { writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')

const OUT = join(__dirname, '..', 'courseware', 'earthquake-live', 'data')
const USGS_MONTH = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson'
// PB2002 板块边界(Bird 2003)的 GeoJSON 镜像,公有领域
const PB2002 = 'https://raw.githubusercontent.com/fraxen/tectonicplates/master/GeoJSON/PB2002_boundaries.json'

function slimQuake(f) {
  const p = f?.properties ?? {}
  const c = f?.geometry?.coordinates
  if (typeof p.mag !== 'number' || !Array.isArray(c) || c.length < 3) return null
  const [lon, lat, depth] = c
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null
  return { id: String(f.id ?? ''), mag: p.mag, place: String(p.place ?? ''), time: p.time ?? 0, lon, lat, depth, tsunami: p.tsunami ?? 0 }
}

function validateSnapshot(s) {
  return !!s && typeof s.fetchedAt === 'number' && Array.isArray(s.quakes) && s.quakes.length > 0
    && s.quakes.every((q) => typeof q.lon === 'number' && typeof q.lat === 'number' && typeof q.mag === 'number')
}
function validatePlates(g) {
  return !!g && g.type === 'FeatureCollection' && Array.isArray(g.features) && g.features.length > 0
    && g.features.every((f) => f.geometry && Array.isArray(f.geometry.coordinates))
}
function validateChinaBelts(d) {
  return !!d && Array.isArray(d.belts) && d.belts.length > 0
    && d.belts.every((b) => b.name && Array.isArray(b.path) && b.path.length >= 2)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  // 1) 地震快照(近 30 天,M≥2.5)
  const res = await fetch(USGS_MONTH)
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`)
  const feed = await res.json()
  const quakes = feed.features.map(slimQuake).filter(Boolean)
  const snapshot = { fetchedAt: Date.now(), quakes }
  if (!validateSnapshot(snapshot)) throw new Error('快照校验失败')
  writeFileSync(join(OUT, 'quakes-snapshot.json'), JSON.stringify(snapshot))
  console.log(`[fetch-data] 快照 ${quakes.length} 条`)

  // 2) PB2002 板块边界:保留 geometry + LAYER 属性
  const res2 = await fetch(PB2002)
  if (!res2.ok) throw new Error(`PB2002 HTTP ${res2.status}`)
  const raw = await res2.json()
  const plates = {
    type: 'FeatureCollection',
    features: raw.features.map((f) => ({
      type: 'Feature',
      properties: { LAYER: f.properties?.LAYER ?? f.properties?.Name ?? 'boundary' },
      geometry: f.geometry
    }))
  }
  if (!validatePlates(plates)) throw new Error('板块边界校验失败')
  writeFileSync(join(OUT, 'plates.min.geojson'), JSON.stringify(plates))
  console.log(`[fetch-data] 板块边界 ${plates.features.length} 条`)
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1) })
module.exports = { slimQuake, validateSnapshot, validatePlates, validateChinaBelts }
