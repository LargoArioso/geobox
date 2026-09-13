import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { loadQuakes, normalizeFeature } = require('../js/data.js')

const okFeature = { id: 'x1', properties: { mag: 5.1, place: 'Test', time: 1000, tsunami: 0 }, geometry: { coordinates: [120, 30, 15] } }
const snapshot = { fetchedAt: 900, quakes: [normalizeFeature(okFeature)] }

test('normalizeFeature 与快照 slim 结构一致', () => {
  assert.deepEqual(normalizeFeature(okFeature), { id: 'x1', mag: 5.1, place: 'Test', time: 1000, lon: 120, lat: 30, depth: 15, tsunami: 0 })
})

test('网络成功 → source=live 且写入缓存', async () => {
  let saved = null
  const r = await loadQuakes('day', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ features: [okFeature] }) }),
    storageGet: async () => null,
    storageSet: async (k, v) => { saved = v },
    snapshotLoader: async () => snapshot
  })
  assert.equal(r.source, 'live')
  assert.equal(r.list.length, 1)
  assert.ok(saved && saved.includes('x1'))
})

test('网络失败且有缓存 → source=cache', async () => {
  const r = await loadQuakes('day', {
    fetchImpl: async () => { throw new Error('offline') },
    storageGet: async () => JSON.stringify({ fetchedAt: 800, quakes: [normalizeFeature(okFeature)] }),
    storageSet: async () => {},
    snapshotLoader: async () => snapshot
  })
  assert.equal(r.source, 'cache')
  assert.equal(r.fetchedAt, 800)
})

test('网络与缓存都失败 → source=snapshot 兜底', async () => {
  const r = await loadQuakes('day', {
    fetchImpl: async () => { throw new Error('offline') },
    storageGet: async () => null,
    storageSet: async () => {},
    snapshotLoader: async () => snapshot
  })
  assert.equal(r.source, 'snapshot')
  assert.equal(r.fetchedAt, 900)
})
