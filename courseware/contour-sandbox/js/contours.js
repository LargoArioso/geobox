//  marching squares 等高线提取
// 输入：高度场 h（GRID_N×GRID_N，米）、等值面值 level
// 输出：线段数组 [{x1,y1,x2,y2}]，坐标为网格浮点坐标 [0, GRID_N-1]

import { GRID_N } from './terrain.js'

export function extractContour(h, level) {
  const segs = []
  const idx = (i, j) => j * GRID_N + i

  for (let j = 0; j < GRID_N - 1; j++) {
    for (let i = 0; i < GRID_N - 1; i++) {
      const h0 = h[idx(i, j)] // 左下
      const h1 = h[idx(i + 1, j)] // 右下
      const h2 = h[idx(i + 1, j + 1)] // 右上
      const h3 = h[idx(i, j + 1)] // 左上

      let caseIdx = 0
      if (h0 > level) caseIdx |= 1
      if (h1 > level) caseIdx |= 2
      if (h2 > level) caseIdx |= 4
      if (h3 > level) caseIdx |= 8
      if (caseIdx === 0 || caseIdx === 15) continue

      // 各边插值点
      const lerp = (a, b, va, vb) => a + ((level - va) / (vb - va)) * (b - a)
      const bottom = { x: lerp(i, i + 1, h0, h1), y: j }
      const right = { x: i + 1, y: lerp(j, j + 1, h1, h2) }
      const top = { x: lerp(i, i + 1, h3, h2), y: j + 1 }
      const left = { x: i, y: lerp(j, j + 1, h0, h3) }

      const seg = (p, q) => segs.push({ x1: p.x, y1: p.y, x2: q.x, y2: q.y })

      switch (caseIdx) {
        case 1: seg(left, bottom); break
        case 2: seg(bottom, right); break
        case 3: seg(left, right); break
        case 4: seg(right, top); break
        case 5: seg(left, top); seg(bottom, right); break // 鞍部
        case 6: seg(bottom, top); break
        case 7: seg(left, top); break
        case 8: seg(left, top); break
        case 9: seg(bottom, top); break
        case 10: seg(left, bottom); seg(right, top); break // 鞍部
        case 11: seg(right, top); break
        case 12: seg(left, right); break
        case 13: seg(bottom, right); break
        case 14: seg(left, bottom); break
      }
    }
  }
  return segs
}

/** 计算某高度场在给定等高距下的全部等高线，按是否计曲线分组 */
export function extractAllContours(h, interval) {
  let min = Infinity
  let max = -Infinity
  for (const v of h) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const start = Math.ceil(min / interval) * interval
  const levels = []
  for (let l = start; l <= max; l += interval) {
    levels.push({
      value: l,
      isIndex: Math.round(l / interval) % 5 === 0, // 每 5 条一根计曲线
      segments: extractContour(h, l)
    })
  }
  return { levels, min, max }
}
