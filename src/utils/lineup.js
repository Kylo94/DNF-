/**
 * 编队（排表）核心算法 —— 纯函数，不依赖 Vue，方便单元测试
 *
 * 规则：
 *   1. 一波团本 12 人，红 / 黄 / 绿 三队，每队 4 个位置
 *   2. 单奶配置 = 1奶 + 3C；双奶配置 = 2奶 + 2C（面板高的奶当常驻 buff 奶，另一个当太阳奶）
 *   3. 每队可设「C 单角色区间」「C 合计伤害区间」「奶增益区间」
 *      - 单角色区间：角色准入门槛
 *      - 合计伤害区间：整队 C 的伤害总和只要达标即可，避免把强 C 堆在一起造成伤害过剩
 *   4. 区间内没人时用剩余角色兜底补位（标记为区间外），尽量不留空位
 *   5. 同一个玩家在同一波团本里只能上场一个角色
 */
import { SLOT_DEFS, SLOT_KEYS, SLOT_TEMPLATES } from '../constants.js'

export const ROLE_LABEL = { C: '输出C', N: '辅助奶' }

/** 组合搜索时每个队伍最多参与枚举的候选人数（控制计算量） */
const MAX_CANDIDATES = 42

/** 位置定义 */
export function slotDef(key) {
  return SLOT_DEFS.find((d) => d.key === key) || SLOT_DEFS[0]
}

export function slotLabel(key) {
  return slotDef(key).label
}

/** 兼容旧写法：1n3c = 单奶，2n2c = 双奶 */
const LAYOUT_ALIASES = { '1n3c': 'single', single: 'single', '2n2c': 'double', double: 'double' }

export function normalizeLayoutName(layout) {
  return LAYOUT_ALIASES[layout] || 'single'
}

/** 按配置生成槽位模板（single = 1奶3C，double = 2奶2C） */
export function layoutSlots(layout) {
  const keys = SLOT_TEMPLATES[normalizeLayoutName(layout)]
  return keys.map((key) => ({ key, role: slotDef(key).role }))
}

/** 生成带 id、空角色的槽位数组 */
export function createSlots(layout) {
  return layoutSlots(layout).map((s) => ({ key: s.key, role: s.role, characterId: null, outOfRange: false }))
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

/**
 * C 合计伤害目标：就是这一队的伤害线，用来判断「伤害够不够」以及编队检查
 */
export function normalizeTotal(range) {
  return normalizeRange(range)
}

export function formatRange(range) {
  if (!hasRange(range)) return '不限'
  const { min, max } = range
  const left = min === null ? '不限' : formatNumber(min)
  const right = max === null ? '不限' : formatNumber(max)
  return `${left} ~ ${right}`
}

export function formatNumber(n) {
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function sortByPanelDesc(list) {
  return [...list].sort((a, b) => (b.panel ?? Number.NEGATIVE_INFINITY) - (a.panel ?? Number.NEGATIVE_INFINITY))
}

/** 同一波里一个玩家只能上一个角色，所以候选里每位玩家只保留最强的那个 */
function bestPerPlayer(list) {
  const seen = new Set()
  return sortByPanelDesc(list).filter((c) => {
    if (seen.has(c.player)) return false
    seen.add(c.player)
    return true
  })
}

/**
 * 从候选里挑 k 个角色：
 *   - 设了「合计伤害区间」时，优先让总和落在区间内，并且贴住下限（刚好达标，避免伤害过剩）
 *   - 没设合计区间时，取数值最高的组合（沿用「越强越好」）
 *   - 一组里不能出现同一个玩家的两个角色
 */
/**
 * 智能分配一波团本
 * @param {Array} pool 本波可用的角色
 * @param {{globalLayout: string, teams: Array<{id:string, layout:string|null, cRange:object, cTotalRange:object, nRange:object}>}} config
 * @returns {{slots: Record<string, Array<{role:string, characterId:string|null, outOfRange:boolean}>>}}
 */
export function autoAssign(pool, config) {
  const teams = config.teams.map((t, index) => ({
    id: t.id,
    name: t.name || t.id,
    index,
    healPolicy: t.healPolicy || 'auto',
    ranges: t.ranges || {},
    total: normalizeRange(t.total),
  }))

  const assigned = new Set()
  const usedPlayers = new Set()
  const slots = {}
  const notes = {}
  const missing = {}

  const candidates = (role) =>
    pool.filter((c) => c.type === role && !assigned.has(c.id) && !usedPlayers.has(c.player))

  /** 从某个位置的区间里挑面板最高的（严格：不在区间内就不要） */
  const pick = (team, key) => {
    const def = slotDef(key)
    const range = normalizeRange(team.ranges[key])
    const list = candidates(def.role).filter((c) => inRange(c.panel, range))
    if (!list.length) {
      missing[team.id] = missing[team.id] || []
      missing[team.id].push(key)
      return null
    }
    return sortByPanelDesc(list)[0]
  }

  for (const team of teams) {
    const placed = {}
    const place = (key) => {
      const character = pick(team, key)
      if (!character) return false
      placed[key] = character
      assigned.add(character.id)
      usedPlayers.add(character.player)
      return true
    }

    // 1) 常驻奶
    place('heal1')
    // 2) 两个输出位
    place('c1')
    place('c2')

    // 3) 第 4 个位置：伤害够了就补太阳奶，否则放 C位3
    const total = team.total
    const c1 = placed.c1
    const c2 = placed.c2
    const sum = (c1?.panel ?? 0) + (c2?.panel ?? 0)
    const damageEnough = Boolean(c1 && c2) && hasRange(total) && total.min !== null && sum >= total.min

    let layout = 'single'
    if (team.healPolicy === 'double') {
      layout = 'double'
    } else if (team.healPolicy === 'auto' && damageEnough) {
      const heal2 = pick(team, 'heal2')
      if (heal2) {
        placed.heal2 = heal2
        assigned.add(heal2.id)
        usedPlayers.add(heal2.player)
        layout = 'double'
        notes[team.id] = `${team.name}：C位1+C位2 合计 ${formatNumber(sum)} 已达到目标 ${formatNumber(total.min)}，第 4 位补太阳奶（${heal2.name}）`
      }
    }
    if (layout === 'double') {
      if (!placed.heal2) place('heal2') // 固定双奶时在这里补太阳奶
    } else {
      place('c3')
    }

    slots[team.id] = layoutSlots(layout).map((s) => ({
      key: s.key,
      role: s.role,
      characterId: placed[s.key]?.id || null,
      outOfRange: false,
    }))
  }

  return { slots, notes, missing }
}

/**
 * 需要多少波才能把角色都排上（按 C / 奶 各自的需求取较大者）
 */
export function computeWavesNeeded(pool, config, maxWaves = 30) {
  // 按单奶模板（每队 1 奶 3C）估算上限即可：真正排的时候排不出来会提前停
  const teamCount = config?.teams?.length || 3
  const cPerWave = teamCount * 3
  const nPerWave = teamCount
  const cCount = pool.filter((c) => c.type === 'C').length
  const nCount = pool.filter((c) => c.type === 'N').length
  const waves = Math.max(
    cPerWave ? Math.ceil(cCount / cPerWave) : 0,
    nPerWave ? Math.ceil(nCount / nPerWave) : 0,
  )
  return Math.max(1, Math.min(waves, maxWaves))
}

/** 是否命中区间（未设区间视为命中），用于手动调整后刷新标记 */
export function checkSlotRange(character, slot, team) {
  if (!character) return false
  const range = normalizeRange(team?.ranges?.[slot.key])
  if (!hasRange(range)) return false
  return !inRange(character.panel, range)
}

/** 已上场的角色 id -> 位置（可只统计某一波） */
export function collectAssignments(slots, waveIndex = null) {
  const map = new Map()
  for (const [teamId, list] of Object.entries(slots || {})) {
    list.forEach((slot, index) => {
      if (slot.characterId) map.set(slot.characterId, { teamId, index, waveIndex })
    })
  }
  return map
}

/**
 * 未上场候选：所有波次都没排上的角色（不分难度）
 * 原因：
 *   player-conflict —— 该难度每一波都已经有这个玩家的角色了，实在排不进
 *   not-selected    —— 还有位置，只是这轮没排到他
 */
export function computeBench(pool, waves, byId) {
  const usedAnywhere = new Set()
  const playersPerWave = waves.map((wave) => {
    const players = new Set()
    for (const list of Object.values(wave.teams || {})) {
      for (const slot of list) {
        if (!slot.characterId) continue
        usedAnywhere.add(slot.characterId)
        const character = byId.get(slot.characterId)
        if (character) players.add(character.player)
      }
    }
    return players
  })

  return pool
    .filter((c) => !usedAnywhere.has(c.id))
    .map((c) => {
      const indexes = waves.map((w, i) => (w.difficulty === c.difficulty ? i : -1)).filter((i) => i >= 0)
      const blocked = indexes.length > 0 && indexes.every((i) => playersPerWave[i].has(c.player))
      return { character: c, reason: blocked ? 'player-conflict' : 'not-selected' }
    })
    .sort((a, b) => (b.character.panel ?? -1) - (a.character.panel ?? -1))
}

/** 单个队伍的统计（合计伤害等） */
export function teamSummary(slots, byId, cTotalRange = { min: null, max: null }) {
  const filled = slots.filter((s) => s.characterId)
  const cs = filled.filter((s) => s.role === 'C').map((s) => byId.get(s.characterId)).filter(Boolean)
  const ns = filled.filter((s) => s.role === 'N').map((s) => byId.get(s.characterId)).filter(Boolean)
  const cSlots = slots.filter((s) => s.role === 'C').length
  const cTotal = cs.reduce((sum, c) => sum + (Number.isFinite(c.panel) ? c.panel : 0), 0)
  const target = normalizeRange(cTotalRange)
  const targetReady = hasRange(target) && cs.length === cSlots && cSlots > 0
  return {
    filled: filled.length,
    total: slots.length,
    healCount: ns.length,
    cCount: cs.length,
    cSlots,
    cTotal,
    cAverage: cs.length ? Math.round(cTotal / cs.length) : 0,
    nAverage: ns.length ? Math.round(ns.reduce((s, c) => s + (Number.isFinite(c.panel) ? c.panel : 0), 0) / ns.length) : 0,
    empty: slots.length - filled.length,
    outOfRange: filled.filter((s) => s.outOfRange).length,
    cTarget: target,
    cTargetReady: targetReady,
    cUnder: targetReady && target.min !== null && cTotal < target.min,
    cOver: targetReady && target.max !== null && cTotal > target.max,
  }
}

/**
 * 编队校验：返回告警列表
 * 传入 waves（每一波的结构）或单波 slots 都可以
 */
export function validateLineup({ waves, slots, teams, byId, difficulty, teamConfigs = [] }) {
  const warnings = []
  const waveList = waves || [{ teams: slots, difficulty }]
  const configOf = (teamId) => teamConfigs.find((t) => t.id === teamId) || {}

  waveList.forEach((wave, waveIndex) => {
    const waveLabel = waveList.length > 1 ? `第${waveIndex + 1}波 ` : ''
    for (const team of teams) {
      const list = wave.teams[team.id] || []
      const config = configOf(team.id)

      // 缺口按位置报告（严格匹配下，区间内没人就会留空）
      const empty = list.filter((s) => !s.characterId)
      const emptyHeals = empty.filter((s) => s.role === 'N')
      if (emptyHeals.length) {
        warnings.push({
          level: 'error',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name}缺 ${emptyHeals.map((s) => slotLabel(s.key)).join('、')}（区间内没有可用的奶）`,
        })
      }
      const emptyCs = empty.filter((s) => s.role === 'C')
      if (emptyCs.length) {
        warnings.push({
          level: 'warn',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name}的 ${emptyCs.map((s) => slotLabel(s.key)).join('、')} 没有符合区间的角色，留空（可放宽区间或手动补人）`,
        })
      }

      const outOfRange = list.filter((s) => s.characterId && s.outOfRange)
      if (outOfRange.length) {
        warnings.push({
          level: 'info',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name}有 ${outOfRange.length} 个手动补入的位置不在区间内`,
        })
      }

      // 合计伤害检查
      const summary = teamSummary(list, byId, config.total)
      if (summary.cTargetReady) {
        if (summary.cUnder) {
          warnings.push({
            level: 'warn',
            teamId: team.id,
            waveIndex,
            message: `${waveLabel}${team.name} C 合计 ${formatNumber(summary.cTotal)}，低于伤害目标 ${formatNumber(summary.cTarget.min)}`,
          })
        } else if (summary.cOver) {
          warnings.push({
            level: 'warn',
            teamId: team.id,
            waveIndex,
            message: `${waveLabel}${team.name} C 合计 ${formatNumber(summary.cTotal)}，超出伤害上限 ${formatNumber(summary.cTarget.max)}（伤害过剩）`,
          })
        }
      }

      // 双奶时提醒：太阳奶别比常驻奶大
      const heals = list.filter((s) => s.role === 'N')
      if (heals.length === 2 && heals.every((s) => s.characterId)) {
        const first = byId.get(heals[0].characterId)
        const second = byId.get(heals[1].characterId)
        if (first && second && Number(second.panel) > Number(first.panel)) {
          warnings.push({
            level: 'warn',
            teamId: team.id,
            waveIndex,
            message: `${waveLabel}${team.name}的太阳奶面板高于常驻奶，建议互换两个奶位`,
          })
        }
      }
    }

    // 同一个玩家一波只能上一个角色
    const seenPlayers = new Map()
    for (const team of teams) {
      for (const slot of wave.teams[team.id] || []) {
        if (!slot.characterId) continue
        const character = byId.get(slot.characterId)
        if (!character) continue
        if (seenPlayers.has(character.player)) {
          warnings.push({
            level: 'error',
            teamId: team.id,
            waveIndex,
            message: `${waveLabel}玩家「${character.player}」在同一波里上场了多个角色`,
          })
        } else {
          seenPlayers.set(character.player, character.id)
        }
        if (wave.difficulty && character.difficulty !== wave.difficulty) {
          warnings.push({
            level: 'warn',
            teamId: team.id,
            waveIndex,
            message: `${waveLabel}${character.player}·${character.name} 登记的是${character.difficulty}，与本波${wave.difficulty}不符`,
          })
        }
      }
    }
  })

  return warnings
}

/**
 * 按当前角色池自动分档，给出三队的建议区间（单角色区间 + 合计伤害区间）
 * 红队取最强档、黄队中间、绿队最弱，区间首尾相接避免空档
 */
export function suggestRanges(pool) {
  const byPanel = (role) =>
    pool
      .filter((c) => c.type === role && Number.isFinite(c.panel))
      .map((c) => c.panel)
      .sort((a, b) => b - a)

  const cValues = byPanel('C')
  const nValues = byPanel('N')

  // 把角色池按位置数等分档：第 i 个位置取第 i 档的起点当门槛，
  // 这样越靠前的位置要求越高，同时整池角色都还有位置可去（不会只排得出一波）
  const ladder = (values, positionIndex, positionCount) => {
    if (!values.length) return null
    const index = Math.floor((values.length * positionIndex) / positionCount)
    return values[Math.min(index, values.length - 1)]
  }

  const cKeys = ['c1', 'c2', 'c3']
  const makeTeam = (teamIndex) => {
    const ranges = {}
    for (const key of ['heal1', 'heal2']) {
      const position = teamIndex * 2 + (key === 'heal2' ? 1 : 0)
      ranges[key] = { min: ladder(nValues, position, 6), max: null }
    }
    cKeys.forEach((key, index) => {
      const position = teamIndex * 3 + index
      ranges[key] = { min: ladder(cValues, position, 9), max: null }
    })
    const min1 = ranges.c1.min
    const min2 = ranges.c2.min
    // 伤害目标 = C位1 + C位2 的门槛：两个 C 到位就算「伤害够了」，第 4 位自动补太阳奶
    const total =
      min1 === null && min2 === null ? { min: null, max: null } : { min: (min1 ?? 0) + (min2 ?? 0), max: null }
    return { ranges, total }
  }

  return { red: makeTeam(0), yellow: makeTeam(1), green: makeTeam(2) }
}
