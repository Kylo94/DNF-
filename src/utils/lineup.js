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
import { TEAM_LAYOUTS } from '../constants.js'

export const ROLE_LABEL = { C: '输出C', N: '辅助奶' }

/** 组合搜索时每个队伍最多参与枚举的候选人数（控制计算量） */
const MAX_CANDIDATES = 42

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

export function formatNumber(n) {
  return Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

function sortByPanelDesc(list) {
  return [...list].sort((a, b) => (b.panel ?? Number.NEGATIVE_INFINITY) - (a.panel ?? Number.NEGATIVE_INFINITY))
}

/** 候选人数过多时等距抽样，保留最强与最弱的，控制枚举规模 */
function limitCandidates(list, limit = MAX_CANDIDATES) {
  const sorted = sortByPanelDesc(list)
  if (sorted.length <= limit) return sorted
  const step = (sorted.length - 1) / (limit - 1)
  const sampled = []
  for (let i = 0; i < limit; i += 1) sampled.push(sorted[Math.round(i * step)])
  return [...new Set(sampled)]
}

/**
 * 从候选里挑 k 个角色：
 *   - 设了「合计伤害区间」时，优先让总和落在区间内，并且贴住下限（刚好达标，避免伤害过剩）
 *   - 没设合计区间时，取数值最高的组合（沿用「越强越好」）
 *   - 一组里不能出现同一个玩家的两个角色
 */
export function chooseCombination(candidates, k, totalRange = { min: null, max: null }) {
  const list = limitCandidates(candidates)
  if (!list.length || k <= 0) return null
  if (list.length <= k) {
    // 候选不足：按玩家去重后全部上
    const seen = new Set()
    return list.filter((c) => (seen.has(c.player) ? false : seen.add(c.player)))
  }

  const hasTarget = hasRange(totalRange)
  const tightness = (sum) => {
    if (totalRange.min !== null) return sum - totalRange.min
    if (totalRange.max !== null) return totalRange.max - sum
    return 0
  }

  let best = null
  const consider = (combo) => {
    const players = new Set()
    let sum = 0
    for (const character of combo) {
      if (players.has(character.player)) return
      players.add(character.player)
      sum += Number.isFinite(character.panel) ? character.panel : 0
    }
    if (!best) {
      best = { combo, sum }
      return
    }
    if (hasTarget) {
      const inside = inRange(sum, totalRange)
      const bestInside = inRange(best.sum, totalRange)
      if (inside !== bestInside) {
        if (inside) best = { combo, sum }
        return
      }
      if (inside) {
        // 都达标：贴住下限（不过剩）
        const a = tightness(sum)
        const b = tightness(best.sum)
        if (a < b || (a === b && sum > best.sum)) best = { combo, sum }
        return
      }
      // 都不达标：离区间越近越好，其次数值更高
      const a = rangeDistance(sum, totalRange)
      const b = rangeDistance(best.sum, totalRange)
      if (a < b || (a === b && sum > best.sum)) best = { combo, sum }
      return
    }
    if (sum > best.sum) best = { combo, sum }
  }

  const n = list.length
  if (k === 1) {
    for (let i = 0; i < n; i += 1) consider([list[i]])
  } else if (k === 2) {
    for (let i = 0; i < n - 1; i += 1) {
      for (let j = i + 1; j < n; j += 1) consider([list[i], list[j]])
    }
  } else {
    for (let i = 0; i < n - 2; i += 1) {
      for (let j = i + 1; j < n - 1; j += 1) {
        for (let l = j + 1; l < n; l += 1) consider([list[i], list[j], list[l]])
      }
    }
  }

  if (!best) {
    // 所有组合都被「同玩家」过滤掉了：退化成按人取最强的 k 个
    const pickedPlayers = new Set()
    const picked = []
    for (const character of list) {
      if (pickedPlayers.has(character.player)) continue
      pickedPlayers.add(character.player)
      picked.push(character)
      if (picked.length === k) break
    }
    return picked.length ? picked : null
  }
  return best.combo
}

/**
 * 智能分配一波团本
 * @param {Array} pool 本波可用的角色
 * @param {{globalLayout: string, teams: Array<{id:string, layout:string|null, cRange:object, cTotalRange:object, nRange:object}>}} config
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

  const rangeOf = (team, role) => normalizeRange(role === 'N' ? team.nRange : team.cRange)
  const candidates = (role) =>
    pool.filter((c) => c.type === role && !assigned.has(c.id) && !usedPlayers.has(c.player))

  const mark = (character, slot, range, loose) => {
    slot.characterId = character.id
    slot.outOfRange = Boolean(loose && hasRange(range) && !inRange(character.panel, range))
    assigned.add(character.id)
    usedPlayers.add(character.player)
  }

  /* ---- 奶位优先：先保证每队都有奶 ---- */
  const strictHeal = () => {
    for (const team of teams) {
      const range = rangeOf(team, 'N')
      for (const slot of slots[team.id]) {
        if (slot.role !== 'N' || slot.characterId) continue
        const list = candidates('N').filter((c) => inRange(c.panel, range))
        if (!list.length) continue
        mark(sortByPanelDesc(list)[0], slot, range, false)
      }
    }
  }
  const looseHeal = () => {
    for (const team of teams) {
      const range = rangeOf(team, 'N')
      for (const slot of slots[team.id]) {
        if (slot.role !== 'N' || slot.characterId) continue
        const list = candidates('N')
        if (!list.length) continue
        list.sort((a, b) => {
          const diff = rangeDistance(a.panel, range) - rangeDistance(b.panel, range)
          if (diff !== 0) return diff
          return (b.panel ?? Number.NEGATIVE_INFINITY) - (a.panel ?? Number.NEGATIVE_INFINITY)
        })
        mark(list[0], slot, range, true)
      }
    }
  }

  /** C 位：整队一起挑，凑「合计伤害区间」 */
  const fillC = (strict) => {
    for (const team of teams) {
      const charRange = rangeOf(team, 'C')
      const totalRange = normalizeRange(team.cTotalRange)
      const cSlots = slots[team.id].filter((s) => s.role === 'C' && !s.characterId)
      if (!cSlots.length) continue

      let list = candidates('C')
      if (strict) {
        list = list.filter((c) => inRange(c.panel, charRange))
        if (!list.length) continue
      } else if (!list.length) {
        continue
      }

      const combo = chooseCombination(list, cSlots.length, totalRange)
      if (!combo || !combo.length) continue
      const sortedCombo = sortByPanelDesc(combo)
      cSlots.forEach((slot, index) => {
        const character = sortedCombo[index]
        if (character) mark(character, slot, charRange, !strict)
      })
    }
  }

  strictHeal()
  looseHeal()
  fillC(true)
  fillC(false)

  return { slots }
}

/**
 * 需要多少波才能把角色都排上（按 C / 奶 各自的需求取较大者）
 */
export function computeWavesNeeded(pool, config, maxWaves = 30) {
  let cPerWave = 0
  let nPerWave = 0
  for (const team of config.teams) {
    const meta = layoutSlots(resolveLayout(team, config.globalLayout))
    cPerWave += meta.filter((s) => s.role === 'C').length
    nPerWave += meta.filter((s) => s.role === 'N').length
  }
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
  const range = normalizeRange(slot.role === 'N' ? team.nRange : team.cRange)
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
 * 未上场候选：所有波次都没排上的角色
 * 原因：同玩家在这一波已经上场 / 未入选
 */
export function computeBench(pool, waves, activeIndex, byId) {
  const usedAnywhere = new Set()
  const activePlayers = new Set()
  waves.forEach((wave, waveIndex) => {
    for (const list of Object.values(wave.teams || {})) {
      for (const slot of list) {
        if (!slot.characterId) continue
        usedAnywhere.add(slot.characterId)
        if (waveIndex === activeIndex) {
          const character = byId.get(slot.characterId)
          if (character) activePlayers.add(character.player)
        }
      }
    }
  })
  return pool
    .filter((c) => !usedAnywhere.has(c.id))
    .map((c) => ({
      character: c,
      reason: activePlayers.has(c.player) ? 'player-conflict' : 'not-selected',
    }))
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
export function validateLineup({ waves, slots, teams, byId, difficulty }) {
  const warnings = []
  const waveList = waves || [{ teams: slots, difficulty }]

  waveList.forEach((wave, waveIndex) => {
    const waveLabel = waveList.length > 1 ? `第${waveIndex + 1}波 ` : ''
    for (const team of teams) {
      const list = wave.teams[team.id] || []
      const healSlots = list.filter((s) => s.role === 'N')
      const filledHeals = healSlots.filter((s) => s.characterId)
      if (filledHeals.length < healSlots.length) {
        warnings.push({
          level: 'error',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name}缺 ${healSlots.length - filledHeals.length} 个辅助奶`,
        })
      }
      const empty = list.filter((s) => !s.characterId)
      if (empty.length) {
        warnings.push({ level: 'warn', teamId: team.id, waveIndex, message: `${waveLabel}${team.name}还有 ${empty.length} 个空位` })
      }
      const outOfRange = list.filter((s) => s.characterId && s.outOfRange)
      if (outOfRange.length) {
        warnings.push({
          level: 'info',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name}有 ${outOfRange.length} 个角色在单角色区间之外（兜底补位）`,
        })
      }

      // 合计伤害是否达标
      const summary = teamSummary(list, byId, wave.teamConfig?.[team.id]?.cTotalRange)
      if (summary.cUnder) {
        warnings.push({
          level: 'warn',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name} C 合计 ${formatNumber(summary.cTotal)}，低于合计下限 ${formatNumber(summary.cTarget.min)}`,
        })
      } else if (summary.cOver) {
        warnings.push({
          level: 'warn',
          teamId: team.id,
          waveIndex,
          message: `${waveLabel}${team.name} C 合计 ${formatNumber(summary.cTotal)}，超出合计上限 ${formatNumber(summary.cTarget.max)}（伤害过剩）`,
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
            waveIndex,
            message: `${waveLabel}${team.name}的太阳奶面板高于常驻奶，建议互换两个奶位`,
          })
        }
      }
    }

    // C 合计与队伍优先级不符（红 ≥ 黄 ≥ 绿）
    const cTotals = teams.map((team) => {
      const list = (wave.teams[team.id] || []).filter((s) => s.role === 'C')
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
          waveIndex,
          message: `${waveLabel}${cur.name}的 C 合计（${formatNumber(cur.total)}）高于${prev.name}（${formatNumber(prev.total)}），建议检查区间设置`,
        })
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
export function suggestRanges(pool, globalLayout = '1n3c') {
  const layoutMeta = TEAM_LAYOUTS.find((l) => l.value === globalLayout) || TEAM_LAYOUTS[0]
  const result = {
    red: { cRange: { min: null, max: null }, nRange: { min: null, max: null }, cTotalRange: { min: null, max: null } },
    yellow: { cRange: { min: null, max: null }, nRange: { min: null, max: null }, cTotalRange: { min: null, max: null } },
    green: { cRange: { min: null, max: null }, nRange: { min: null, max: null }, cTotalRange: { min: null, max: null } },
  }

  const bands = (role, perTeam) => {
    // 同一个玩家一波只能上一个角色，所以按「每位玩家只取最强的一个」来分档，
    // 否则算出来的建议区间会高到排不出来
    const sorted = sortByPanelDesc(pool.filter((c) => c.type === role && Number.isFinite(c.panel)))
    const seenPlayers = new Set()
    const bestPerPlayer = []
    for (const character of sorted) {
      if (seenPlayers.has(character.player)) continue
      seenPlayers.add(character.player)
      bestPerPlayer.push(character)
    }
    const values = bestPerPlayer.map((c) => c.panel)
    const slice = (index) => values.slice(index * perTeam, index * perTeam + perTeam)
    return {
      red: slice(0),
      yellow: slice(1),
      green: slice(2),
    }
  }

  const apply = (role, perTeam, key, withTotal = false) => {
    const band = bands(role, perTeam)
    const min = (list) => (list.length ? Math.min(...list) : null)
    result.red[key] = { min: min(band.red), max: null }
    result.yellow[key] = { min: min(band.yellow), max: min(band.red) }
    result.green[key] = { min: min(band.green), max: min(band.yellow) }

    if (withTotal) {
      // 合计伤害：以该档位实际总和为下限，留 20% 余量作为上限（避免伤害过剩）
      const total = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0)) : null)
      const set = (teamId, list) => {
        const value = total(list)
        result[teamId].cTotalRange = { min: value, max: value === null ? null : Math.round(value * 1.2) }
      }
      set('red', band.red)
      set('yellow', band.yellow)
      set('green', band.green)
    }
  }

  apply('C', layoutMeta.cSlots, 'cRange', true)
  apply('N', layoutMeta.healSlots, 'nRange', false)
  return result
}
