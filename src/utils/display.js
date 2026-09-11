/**
 * 角色显示格式：队伍卡片上的文字风格由「标签」决定
 * 角色名按职业着色：辅助奶绿色、输出C蓝色（避开红/黄/绿三个队色）
 */
import { formatPanel } from './format.js'

export const ROLE_COLORS = {
  C: '#60a5fa',
  N: '#34d399',
}

export const DISPLAY_FORMATS = [
  { value: 'player-name-value', label: '玩家·角色·属性', sample: '老陈 · 龙神 · 5,500' },
  { value: 'name-value', label: '角色·属性', sample: '龙神 · 5,500' },
  { value: 'player-name', label: '玩家·角色', sample: '老陈 · 龙神' },
  { value: 'name-player', label: '角色（玩家）', sample: '龙神（老陈）' },
  { value: 'name', label: '仅角色', sample: '龙神' },
]

export function isKnownFormat(format) {
  return DISPLAY_FORMATS.some((f) => f.value === format)
}

/**
 * 把角色拆成可着色的片段
 * @returns {Array<{kind:'player'|'name'|'value'|'sep', text:string}>}
 */
export function characterParts(character, format = 'player-name-value') {
  if (!character) return []
  const sep = { kind: 'sep', text: ' · ' }
  const player = { kind: 'player', text: character.player }
  const name = { kind: 'name', text: character.name }
  const value = { kind: 'value', text: formatPanel(character.panel) }

  switch (format) {
    case 'name-value':
      return [name, sep, value]
    case 'player-name':
      return [player, sep, name]
    case 'name-player':
      return [name, { kind: 'sep', text: '（' }, player, { kind: 'sep', text: '）' }]
    case 'name':
      return [name]
    case 'player-name-value':
    default:
      return [player, sep, name, sep, value]
  }
}

export function characterText(character, format = 'player-name-value') {
  return characterParts(character, format)
    .map((p) => p.text)
    .join('')
}
