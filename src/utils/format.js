/**
 * 数值格式化与解析工具
 */

/** 面板数值 -> 千分位显示 */
export function formatPanel(value) {
  if (value === null || value === undefined || value === '') return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

/**
 * 解析用户输入的面板数值，支持：
 * - 千分位逗号：44,700
 * - 中文单位：5500万 / 1.2亿 / 3万5 (不支持)
 * 返回 number；无法解析返回 null
 */
export function parsePanel(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (raw === null || raw === undefined) return null

  let text = String(raw).trim()
  if (!text) return null

  text = text.replace(/[，,\s]/g, '')

  let multiplier = 1
  if (/亿/.test(text)) multiplier = 100000000
  else if (/万|w|W/.test(text)) multiplier = 10000

  const numText = text.replace(/[亿万元wW]/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(numText)) return null

  const num = Number(numText)
  if (!Number.isFinite(num)) return null
  return num * multiplier
}

/** 时间戳 -> 20240101_1830 */
export function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`
}

export function uid() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
