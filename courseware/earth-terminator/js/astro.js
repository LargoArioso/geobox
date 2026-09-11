// 天文计算（纯函数，可在 Node 中单测）
// 约定：角度单位为度；doy 为一年中的第几天（1–365）

/** 太阳赤纬（Cooper 近似）：夏至 +23.45°，冬至 -23.45° */
export function sunDeclination(doy) {
  return 23.45 * Math.sin(((2 * Math.PI) / 365) * (284 + doy))
}

/** 平年 doy → 「M月D日」 */
export function dateLabel(doy) {
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  let d = Math.max(1, Math.min(365, Math.round(doy)))
  for (let m = 0; m < 12; m++) {
    if (d <= months[m]) return `${m + 1}月${d}日`
    d -= months[m]
  }
  return '12月31日'
}

/** 格式化纬度：40 → '40°N'；-23.5 → '23.5°S'；0 → '0°（赤道）' */
export function latLabel(lat) {
  const v = Math.abs(lat)
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1)
  if (v < 0.05) return '0°（赤道）'
  return `${s}°${lat > 0 ? 'N' : 'S'}`
}

/** 格式化小时数为「H 时 M 分」 */
export function hmLabel(hours) {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 60) return `${h + 1} 时 0 分`
  return `${h} 时 ${m} 分`
}

/** 地方时格式化：4.78 → '04:46' */
export function clockLabel(hours) {
  const t = ((hours % 24) + 24) % 24
  const h = Math.floor(t)
  const m = Math.round((t - h) * 60)
  if (m === 60) return `${String((h + 1) % 24).padStart(2, '0')}:00`
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 昼长计算：cos H = -tanφ · tanδ（H 为半昼长时角）
 * 返回 { state: 'normal'|'polar-day'|'polar-night', dayHours, sunrise, sunset }
 * sunrise/sunset 为当地地方时（小时），极昼极夜时为 null
 */
export function dayLength(latDeg, declDeg) {
  const phi = (latDeg * Math.PI) / 180
  const delta = (declDeg * Math.PI) / 180
  const x = -Math.tan(phi) * Math.tan(delta)
  if (x <= -1) return { state: 'polar-day', dayHours: 24, sunrise: null, sunset: null }
  if (x >= 1) return { state: 'polar-night', dayHours: 0, sunrise: null, sunset: null }
  const H = (Math.acos(x) * 180) / Math.PI // 半昼长时角（度）
  const dayHours = (2 * H) / 15
  return {
    state: 'normal',
    dayHours,
    sunrise: 12 - H / 15,
    sunset: 12 + H / 15
  }
}

/**
 * 极昼 / 极夜范围描述
 * δ > 0：北纬 (90-δ)° 以北极昼，南纬 (90-δ)° 以南极夜；δ < 0 反之；δ = 0 无极昼极夜
 */
export function polarRanges(declDeg) {
  const d = Math.abs(declDeg)
  if (d < 0.1) return { day: null, night: null }
  const limit = 90 - d
  const latTxt = `${limit.toFixed(1)}°`
  if (declDeg > 0) {
    return {
      day: `北极地区（${latTxt}N–90°N）`,
      night: `南极地区（${latTxt}S–90°S）`
    }
  }
  return {
    day: `南极地区（${latTxt}S–90°S）`,
    night: `北极地区（${latTxt}N–90°N）`
  }
}
