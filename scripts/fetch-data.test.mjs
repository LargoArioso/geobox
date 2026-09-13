import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { slimQuake, validateSnapshot, validatePlates, validateChinaBelts } = require('./fetch-data.js')

test('slimQuake 精简 USGS feature 并丢弃无效记录', () => {
  const f = {
    id: 'us7000abcd',
    properties: { mag: 5.2, place: '10km S of X', time: 1757000000000, tsunami: 0, extra: 'drop-me' },
    geometry: { coordinates: [130.5, 32.1, 40.2] }
  }
  assert.deepEqual(slimQuake(f), {
    id: 'us7000abcd', mag: 5.2, place: '10km S of X',
    time: 1757000000000, lon: 130.5, lat: 32.1, depth: 40.2, tsunami: 0
  })
  assert.equal(slimQuake({ properties: { mag: null }, geometry: { coordinates: [1, 2, 3] } }), null)
  assert.equal(slimQuake({ properties: { mag: 4 }, geometry: { coordinates: [999, 2, 3] } }), null) // 经度越界
})

test('validateSnapshot 校验快照结构', () => {
  const good = { fetchedAt: 1757000000000, quakes: [{ id: 'a', mag: 3, place: 'p', time: 1, lon: 100, lat: 30, depth: 10, tsunami: 0 }] }
  assert.equal(validateSnapshot(good), true)
  assert.equal(validateSnapshot({ fetchedAt: 1, quakes: [] }), false)
  assert.equal(validateSnapshot({ quakes: good.quakes }), false)
})

test('validatePlates / validateChinaBelts', () => {
  assert.equal(validatePlates({ type: 'FeatureCollection', features: new Array(60).fill(0).map((_, i) => ({ type: 'Feature', properties: { LAYER: 'subduction zone' }, geometry: { type: 'LineString', coordinates: [[i, 0], [i + 1, 1]] } })) }), true)
  assert.equal(validatePlates({ type: 'FeatureCollection', features: [] }), false)
  assert.equal(validateChinaBelts({ note: '示意', belts: [{ name: '南北地震带', path: [[100, 30], [101, 31]] }] }), true)
  assert.equal(validateChinaBelts({ belts: [] }), false)
})
