// 地形生成（值噪声 fBm）与 ESRI ASC 高程数据解析
// 高度单位：米；世界坐标：x/z ∈ [-50, 50]，1 单位 = 100 m

export const GRID_N = 160
export const WORLD_HALF = 50 // 世界半径（单位）
export const M_PER_UNIT = 100 // 1 世界单位 = 100 米

// ---------- 确定性随机 ----------
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 值噪声 ----------
function makeNoise2D(seed) {
  const rand = mulberry32(seed)
  const perm = new Uint8Array(512)
  const p = [...Array(256).keys()]
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  const fade = (t) => t * t * (3 - 2 * t)
  const grad = (h, x, y) => ((h & 1) === 0 ? x : -x) + ((h & 2) === 0 ? y : -y)

  return function noise(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    x -= Math.floor(x)
    y -= Math.floor(y)
    const u = fade(x)
    const v = fade(y)
    const a = perm[X] + Y
    const b = perm[X + 1] + Y
    return (
      (1 - v) * ((1 - u) * grad(perm[a], x, y) + u * grad(perm[b], x - 1, y)) +
      v * ((1 - u) * grad(perm[a + 1], x, y - 1) + u * grad(perm[b + 1], x - 1, y - 1))
    )
  }
}

function fbm(noise, x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

// ---------- 地形类型生成器 ----------
// 返回 Float32Array(GRID_N * GRID_N)，值单位：米
export function generateTerrain(type, seed = 1) {
  const noise = makeNoise2D(seed)
  const h = new Float32Array(GRID_N * GRID_N)
  const S = 3.2 // 噪声空间缩放

  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const nx = (i / (GRID_N - 1)) * S
      const ny = (j / (GRID_N - 1)) * S
      // 归一化坐标 [-1, 1]，用于径向 shaping
      const cx = (i / (GRID_N - 1)) * 2 - 1
      const cy = (j / (GRID_N - 1)) * 2 - 1
      const r = Math.sqrt(cx * cx + cy * cy)
      let v = 0

      switch (type) {
        case 'mountain': {
          // 高中山：中心抬升 + 山脊状 |noise|
          const ridge = 1 - Math.abs(fbm(noise, nx, ny, 6))
          const base = Math.max(0, 1 - r * 0.9)
          v = 400 + 2600 * base * (0.45 + 0.55 * ridge * ridge)
          break
        }
        case 'hills': {
          v = 120 + 380 * (fbm(noise, nx, ny, 5) * 0.5 + 0.5)
          break
        }
        case 'basin': {
          // 四周高中间低
          const rim = Math.min(1, r * 1.15)
          v = 300 + 1400 * rim * rim + 250 * (fbm(noise, nx, ny, 5) * 0.5 + 0.5)
          break
        }
        case 'valley': {
          // 沿对角线切出的 V 形河谷
          const d = Math.abs(cx * 0.7 + cy * 0.7 + 0.25 * fbm(noise, nx * 1.5, ny * 1.5, 4))
          v = 200 + 1600 * Math.min(1, d * 1.6) + 300 * (fbm(noise, nx * 2, ny * 2, 4) * 0.5 + 0.5)
          break
        }
        case 'ridge': {
          // 平行山脊与山谷：教学山脊/山谷判读
          const w = Math.sin((cx * 2.2 + 0.6 * fbm(noise, nx, ny, 4)) * Math.PI)
          v = 500 + 1100 * (w * 0.5 + 0.5) + 180 * (fbm(noise, nx * 3, ny * 3, 4) * 0.5 + 0.5)
          break
        }
        default:
          v = 500 * (fbm(noise, nx, ny, 5) * 0.5 + 0.5)
      }
      h[j * GRID_N + i] = Math.max(0, v)
    }
  }
  return h
}

// ---------- 双线性采样 ----------
export function sampleHeight(h, fx, fy) {
  // fx, fy ∈ [0, GRID_N-1] 浮点网格坐标
  const x = Math.max(0, Math.min(GRID_N - 1.001, fx))
  const y = Math.max(0, Math.min(GRID_N - 1.001, fy))
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const tx = x - x0
  const ty = y - y0
  const h00 = h[y0 * GRID_N + x0]
  const h10 = h[y0 * GRID_N + x0 + 1]
  const h01 = h[(y0 + 1) * GRID_N + x0]
  const h11 = h[(y0 + 1) * GRID_N + x0 + 1]
  return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty
}

// ---------- ESRI ASC 解析 ----------
// 支持 ncols/nrows/xllcorner/yllcorner/cellsize/NODATA_value 头
export function parseASC(text) {
  const lines = text.split(/\r?\n/)
  const header = {}
  let dataStart = 0
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const m = lines[i].trim().match(/^([a-zA-Z_]+)\s+(-?[\d.]+)/)
    if (m) {
      header[m[1].toLowerCase()] = parseFloat(m[2])
      dataStart = i + 1
    } else break
  }
  const ncols = header.ncols | 0
  const nrows = header.nrows | 0
  if (!ncols || !nrows) throw new Error('不是有效的 ASC 高程文件（缺少 ncols/nrows）')
  const nodata = header.nodata_value ?? -9999

  const values = []
  for (let i = dataStart; i < lines.length && values.length < ncols * nrows; i++) {
    const parts = lines[i].trim().split(/\s+/)
    for (const p of parts) {
      if (p !== '') values.push(parseFloat(p))
    }
  }
  if (values.length < ncols * nrows) throw new Error('ASC 数据长度不足')

  // 重采样到 GRID_N × GRID_N
  const h = new Float32Array(GRID_N * GRID_N)
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v !== nodata && !Number.isNaN(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  for (let j = 0; j < GRID_N; j++) {
    for (let i = 0; i < GRID_N; i++) {
      const sx = (i / (GRID_N - 1)) * (ncols - 1)
      const sy = (j / (GRID_N - 1)) * (nrows - 1)
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(ncols - 1, x0 + 1)
      const y1 = Math.min(nrows - 1, y0 + 1)
      const tx = sx - x0
      const ty = sy - y0
      const pick = (x, y) => {
        const v = values[y * ncols + x]
        return v === nodata || Number.isNaN(v) ? min : v
      }
      h[j * GRID_N + i] =
        (pick(x0, y0) * (1 - tx) + pick(x1, y0) * tx) * (1 - ty) +
        (pick(x0, y1) * (1 - tx) + pick(x1, y1) * tx) * ty
    }
  }
  return { heights: h, min, max, ncols, nrows }
}
