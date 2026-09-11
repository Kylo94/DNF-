/**
 * 编队（排表）核心算法 —— 纯函数，不依赖 Vue，方便单元测试
 *
 * 规则：
 *   1. 一波团本 12 人，红 / 黄 / 绿 三队，每队 4 个位置
 *   2. 单奶配置 = 1奶 + 3C；双奶配置 = 2奶 + 2C（面板高的奶当常驻 buff 奶，另一个当太阳奶）
 *   3. 每队可设「C 伤害区间」与「奶增益区间」，优先按区间取人
 *   4. 区间内没人时用剩余角色兜底补位（标记为区间外），尽量不留空位
 *   5. 同一个玩家在同一波团本里只能上场一个角色
 */
import { TEAM_LAYOUTS } from '../constants.js'

export const ROLE_LABEL = { C: '输出C', N: '辅助奶' }

/** 根据队伍配置生成槽位模板 */
export function layoutSlots(layout) {
  const meta = TEAM_LAYOUTS.find((l) => l.value === layout) || TEAM_LAYOUTS[0]
  const slots = []
  for (let i = 0; i < meta.healSlots; i += 1) slots.push({ role: 'N' })
  for (let i = 0; i < meta.cSlots; i += 1) slots.push({ role: 'C' })
  return slots
}

/** 队伍实际生效的配置：自身设置优先，否则跟随全局 */
export function resolveLayout(team, globalLayout) {
  return team.layout || globalLayout
}

export function normalizeRange(range) {
  const min = Number.isFinite(range?.min) ? Number(range.min) : null
  const max = Number.isFinite(range?.max) ? Number(range.max) : null
  return { min, max }
}

export function hasRange(range) {
  return Boolean(range) && (range.min !== null || range.max !== null)
}

export function inRange(value, range) {
  if (!Number.isFinite(value)) return false
  if (range.min !== null && value < range.min) return false
  if (range.max !== null && value > range.max) return false
  return true
}

/** 与区间的距离（0 = 命中区间），用于兜底补位时挑最接近的人 */
export function rangeDistance(value, range) {
  if (!Number.isFinite(value)) return Number.POSITIVE_INFINITY
  if (!hasRange(range) || inRange(value, range)) return 0
  if (range.min !== null && value < range.min) return range.min - value
  if (range.max !== null && value > range.max) return value - range.max
  return 0
}

export function formatRange(range) {
  if (!hasRange(range)) return '不限'
  const { min, max } = range
  const left = min === null ? '不限' : formatNumber(min)
  const right = max === null ? '不限' : formatNumber(max)
  return `${left} ~ ${right}`
}

function formatNumber(n) {
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function sortByPanelDesc(list) {
  return [...list].sort((a, b) => (b.panel ?? Number.NEGATIVE_INFINITY) - (a.panel ?? Number.NEGATIVE_INFINITY))
}

/**
 * 智能分配
 * @param {Array} pool 本波可用的角色（已按难度过滤）
 * @param {{globalLayout: string, teams: Array<{id:string, layout:string|null, cRange:object, nRange:object}>}} config
 * @returns {{slots: Record<string, Array<{role:string, characterId:string|null, outOfRange:boolean}>>}}
 */
export function autoAssign(pool, config) {
  const teams = config.teams.map((t) => ({ ...t, layout: resolveLayout(t, config.globalLayout) }))
  const slots = {}
  for (const t of teams) {
    slots[t.id] = layoutSlots(t.layout).map((s) => ({ role: s.role, characterId: null, outOfRange: false }))
  }

  const assigned = new Set()
  const usedPlayers = new Set()

  const candidates = (role) =>
    pool.filter((c) => c.type === role && !assigned.has(c.id) && !usedPlayers.has(c.player))

  const take = (character, teamId, slot, range, loose) => {
    slot.characterId = character.id
    slot.outOfRange = Boolean(loose && hasRange(range) && !inRange(character.panel, range))
    assigned.add(character.id)
    usedPlayers.add(character.player)
  }

  const rangeOf = (team, role) => normalizeRange(role === 'N' ? team.nRange : team.cRange)

  /** 第一轮：只从区间内取人，取区间内数值最高的 */
  const strictFill = (role) => {
    for (const team of teams) {
      const range = rangeOf(team, role)
      for (const slot of slots[team.id]) {
        if (slot.role !== role || slot.characterId) continue
        const list = candidates(role).filter((c) => inRange(c.panel, range))
        if (!list.length) continue
        take(sortByPanelDesc(list)[0], team.id, slot, range, false)
      }
    }
  }

  /** 第二轮：兜底补位，取距离区间最近的角色（宁可有角色上场，也不留空位） */
  const looseFill = (role) => {
    for (const team of teams) {
      const range = rangeOf(team, role)
      for (const slot of slots[team.id]) {
        if (slot.role !== role || slot.characterId) continue
        const list = candidates(role)
        if (!list.length) continue
        list.sort((a, b) => {
          const diff = rangeDistance(a.panel, range) - rangeDistance(b.panel, range)
          if (diff !== 0) return diff
          return (b.panel ?? Number.NEGATIVE_INFINITY) - (a.panel ?? Number.NEGATIVE_INFINITY)
        })
        take(list[0], team.id, slot, range, true)
      }
    }
  }

  // 奶位优先分配：保证每队先有奶，再考虑 C
  strictFill('N')
  looseFill('N')
  strictFill('C')
  looseFill('C')

  return { slots }
}

/** 是否命中区间（未设区间视为命中），用于手动调整后刷新标记 */
export function checkSlotRange(character, slot, team) {
  if (!character) return false
  const range = normalizeRange(slot.role === 'N' ? team.nRange : team.cRange)
  if (!hasRange(range)) return false
  return !inRange(character.panel, range)
}

/** 已上场的角色 id -> 位置 */
export function collectAssignments(slots) {
  const map = new Map()
  for (const [teamId, list] of Object.entries(slots || {})) {
    list.forEach((slot, index) => {
      if (slot.characterId) map.set(slot.characterId, { teamId, index })
    })
  }
  return map
}

/** 未上场候选：本波可用但没进编队的角色，并标明原因 */
export function computeBench(pool, slots) {
  const assignments = collectAssignments(slots)
  const usedPlayers = new Set()
  const byId = new Map(pool.map((c) => [c.id, c]))
  for (const characterId of assignments.keys()) {
    const character = byId.get(characterId)
    if (character) usedPlayers.add(character.player)
  }
  return pool
    .filter((c) => !assignments.has(c.id))
    .map((c) => ({
      character: c,
      reason: usedPlayers.has(c.player) ? 'player-conflict' : 'not-selected',
    }))
    .sort((a, b) => (b.character.panel ?? -1) - (a.character.panel ?? -1))
}

/** 单个队伍的统计（合计伤害等） */
export function teamSummary(slots, byId) {
  const filled = slots.filter((s) => s.characterId)
  const cs = filled.filter((s) => s.role === 'C').map((s) => byId.get(s.characterId)).filter(Boolean)
  const ns = filled.filter((s) => s.role === 'N').map((s) => byId.get(s.characterId)).filter(Boolean)
  const cTotal = cs.reduce((sum, c) => sum + (Number.isFinite(c.panel) ? c.panel : 0), 0)
  return {
    filled: filled.length,
    total: slots.length,
    healCount: ns.length,
    cCount: cs.length,
    cTotal,
    cAverage: cs.length ? Math.round(cTotal / cs.length) : 0,
    nAverage: ns.length ? Math.round(ns.reduce((s, c) => s + (Number.isFinite(c.panel) ? c.panel : 0), 0) / ns.length) : 0,
    empty: slots.length - filled.length,
    outOfRange: filled.filter((s) => s.outOfRange).length,
  }
}

/**
 * 编队校验：返回告警列表
 * @returns {Array<{level:'error'|'warn'|'info', teamId?:string, message:string}>}
 */
export function validateLineup({ slots, teams, byId, difficulty }) {
  const warnings = []
  for (const team of teams) {
    const list = slots[team.id] || []
    const healSlots = list.filter((s) => s.role === 'N')
    const filledHeals = healSlots.filter((s) => s.characterId)
    if (filledHeals.length < healSlots.length) {
      warnings.push({
        level: 'error',
        teamId: team.id,
        message: `${team.name}缺 ${healSlots.length - filledHeals.length} 个辅助奶`,
      })
    }
    const empty = list.filter((s) => !s.characterId)
    if (empty.length) {
      warnings.push({ level: 'warn', teamId: team.id, message: `${team.name}还有 ${empty.length} 个空位` })
    }
    const outOfRange = list.filter((s) => s.characterId && s.outOfRange)
    if (outOfRange.length) {
      warnings.push({
        level: 'info',
        teamId: team.id,
        message: `${team.name}有 ${outOfRange.length} 个角色在设定区间之外（兜底补位）`,
      })
    }
    // 双奶：太阳奶面板不应高于常驻奶
    if (healSlots.length === 2 && healSlots.every((s) => s.characterId)) {
      const first = byId.get(healSlots[0].characterId)
      const second = byId.get(healSlots[1].characterId)
      if (first && second && Number(second.panel) > Number(first.panel)) {
        warnings.push({
          level: 'warn',
          teamId: team.id,
          message: `${team.name}的太阳奶面板高于常驻奶，建议互换两个奶位`,
        })
      }
    }
  }

  // C 合计与队伍优先级不符（红 ≥ 黄 ≥ 绿），常见于区间内角色被「同玩家只能上一个」挤掉
  const cTotals = teams.map((team) => {
    const list = (slots[team.id] || []).filter((s) => s.role === 'C')
    const filled = list.filter((s) => s.characterId)
    return {
      id: team.id,
      name: team.name,
      total: filled.reduce((sum, s) => sum + (byId.get(s.characterId)?.panel ?? 0), 0),
      full: filled.length === list.length && list.length > 0,
    }
  })
  for (let i = 1; i < cTotals.length; i += 1) {
    const prev = cTotals[i - 1]
    const cur = cTotals[i]
    if (prev.full && cur.full && cur.total > prev.total) {
      warnings.push({
        level: 'warn',
        teamId: prev.id,
        message: `${cur.name}的 C 合计（${formatNumber(cur.total)}）高于${prev.name}（${formatNumber(prev.total)}），建议检查区间设置或手动调整`,
      })
    }
  }

  // 同一个玩家一波只能上一个角色
  const seenPlayers = new Map()
  for (const team of teams) {
    for (const slot of slots[team.id] || []) {
      if (!slot.characterId) continue
      const character = byId.get(slot.characterId)
      if (!character) continue
      if (seenPlayers.has(character.player)) {
        warnings.push({
          level: 'error',
          teamId: team.id,
          message: `玩家「${character.player}」在同一波里上场了多个角色`,
        })
      } else {
        seenPlayers.set(character.player, character.id)
      }
      if (difficulty && character.difficulty !== difficulty) {
        warnings.push({
          level: 'warn',
          teamId: team.id,
          message: `${character.player}·${character.name} 登记的是${character.difficulty}，与本波${difficulty}不符`,
        })
      }
    }
  }
  return warnings
}

/**
 * 按当前角色池自动分档，给出三队的建议区间
 * 红队取最强档、黄队中间、绿队最弱，区间首尾相接避免空档
 */
export function suggestRanges(pool, globalLayout = '1n3c') {
  const layoutMeta = TEAM_LAYOUTS.find((l) => l.value === globalLayout) || TEAM_LAYOUTS[0]
  const result = {
    red: { cRange: { min: null, max: null }, nRange: { min: null, max: null } },
    yellow: { cRange: { min: null, max: null }, nRange: { min: null, max: null } },
    green: { cRange: { min: null, max: null }, nRange: { min: null, max: null } },
  }

  const bands = (role, perTeam) => {
    const values = sortByPanelDesc(pool.filter((c) => c.type === role && Number.isFinite(c.panel))).map((c) => c.panel)
    const bandMin = (index) => {
      const start = index * perTeam
      const slice = values.slice(start, start + perTeam)
      return slice.length ? Math.min(...slice) : null
    }
    return { red: bandMin(0), yellow: bandMin(1), green: bandMin(2) }
  }

  const apply = (role, perTeam, key) => {
    const { red, yellow, green } = bands(role, perTeam)
    result.red[key] = { min: red, max: null }
    result.yellow[key] = { min: yellow, max: red }
    result.green[key] = { min: green, max: yellow }
  }

  apply('C', layoutMeta.cSlots, 'cRange')
  apply('N', layoutMeta.healSlots, 'nRange')
  return result
}
