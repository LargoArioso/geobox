import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { slimQuake, slimStep, validateSnapshot, validatePlates, validatePlateSteps, validateChinaBelts } = require('./fetch-data.js')

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

test('slimStep 取 PB2002 分段中点与类型码', () => {
  const f = {
    properties: {
      STARTLONG: -0.438, STARTLAT: -54.852, FINALLONG: -0.039, FINALLAT: -54.677,
      STEPCLASS: 'OTF', VELOCITYLE: 13.2, OROGEN: 'FALSE'
    }
  }
  assert.deepEqual(slimStep(f), { lon: -0.238, lat: -54.764, c: 'OTF' })
  assert.equal(slimStep({ properties: { STEPCLASS: 'SUB' } }), null) // 缺坐标
  assert.equal(slimStep({ properties: { STARTLONG: 1, STARTLAT: 2, FINALLONG: 3, FINALLAT: 4 } }), null) // 缺类型
  assert.equal(slimStep({ properties: { STARTLONG: 1, STARTLAT: 2, FINALLONG: 3, FINALLAT: 4, STEPCLASS: 'XXX' } }), null) // 未知类型
})

test('validatePlateSteps 校验分段类型数据', () => {
  const good = { steps: new Array(500).fill(0).map((_, i) => ({ lon: i % 180, lat: 10, c: 'SUB' })) }
  assert.equal(validatePlateSteps(good), true)
  assert.equal(validatePlateSteps({ steps: [{ lon: 1, lat: 2, c: 'SUB' }] }), false) // 条数过少,多半抓漏了
  assert.equal(validatePlateSteps({ steps: [] }), false)
  assert.equal(validatePlateSteps(null), false)
})
