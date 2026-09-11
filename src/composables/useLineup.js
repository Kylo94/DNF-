import { computed, reactive, watch } from 'vue'
import { STORAGE_KEY_LINEUP, TEAMS, TEAM_LAYOUTS } from '../constants.js'
import { useCharacters } from './useCharacters.js'
import {
  ROLE_LABEL,
  autoAssign,
  checkSlotRange,
  collectAssignments,
  computeBench,
  layoutSlots,
  normalizeRange,
  resolveLayout,
  suggestRanges,
  teamSummary,
  validateLineup,
} from '../utils/lineup.js'

function emptyRange() {
  return { min: null, max: null }
}

function makeTeam(id, layout = '1n3c') {
  return {
    id,
    layout: null, // null = 跟随全局配置
    cRange: emptyRange(),
    nRange: emptyRange(),
    slots: layoutSlots(layout).map((s) => ({ role: s.role, characterId: null, outOfRange: false })),
  }
}

function defaultState() {
  return {
    difficulty: '普通团',
    globalLayout: '1n3c',
    teams: {
      red: makeTeam('red'),
      yellow: makeTeam('yellow'),
      green: makeTeam('green'),
    },
    assignedAt: null,
    configDirty: false,
  }
}

function loadState() {
  try {
    const text = localStorage.getItem(STORAGE_KEY_LINEUP)
    if (!text) return defaultState()
    const parsed = JSON.parse(text)
    const base = defaultState()
    const merged = {
      ...base,
      ...parsed,
      teams: { ...base.teams },
    }
    for (const team of TEAMS) {
      const saved = parsed.teams?.[team.id]
      merged.teams[team.id] = saved
        ? {
            ...makeTeam(team.id),
            ...saved,
            cRange: { ...emptyRange(), ...(saved.cRange || {}) },
            nRange: { ...emptyRange(), ...(saved.nRange || {}) },
            slots: Array.isArray(saved.slots) && saved.slots.length
              ? saved.slots.map((s) => ({
                  role: s.role === 'N' ? 'N' : 'C',
                  characterId: s.characterId || null,
                  outOfRange: Boolean(s.outOfRange),
                }))
              : makeTeam(team.id).slots,
          }
        : makeTeam(team.id)
    }
    return merged
  } catch (err) {
    console.warn('编队数据读取失败：', err)
    return defaultState()
  }
}

const state = reactive(loadState())

/** 编队（排表）状态与操作 */
export function useLineup() {
  const { characters } = useCharacters()

  const byId = computed(() => new Map(characters.value.map((c) => [c.id, c])))

  /** 本波可用角色：难度一致 */
  const pool = computed(() => characters.value.filter((c) => c.difficulty === state.difficulty))

  const slotsMap = computed(() => {
    const map = {}
    for (const team of TEAMS) map[team.id] = state.teams[team.id].slots
    return map
  })

  const teamConfigs = computed(() =>
    TEAMS.map((t) => ({
      ...t,
      ...state.teams[t.id],
      ownLayout: state.teams[t.id].layout,
      layout: resolveLayout(state.teams[t.id], state.globalLayout),
    })),
  )

  const bench = computed(() => computeBench(pool.value, slotsMap.value))

  const warnings = computed(() =>
    validateLineup({
      slots: slotsMap.value,
      teams: TEAMS,
      byId: byId.value,
      difficulty: state.difficulty,
    }),
  )

  const teamStats = computed(() => {
    const map = {}
    for (const team of TEAMS) {
      const slots = state.teams[team.id].slots
      map[team.id] = teamSummary(slots, byId.value)
    }
    return map
  })

  const assignedCount = computed(() => collectAssignments(slotsMap.value).size)

  const poolStats = computed(() => ({
    total: pool.value.length,
    c: pool.value.filter((c) => c.type === 'C').length,
    n: pool.value.filter((c) => c.type === 'N').length,
  }))

  /* ------------------------- 内部工具 ------------------------- */

  function refreshFlags(team) {
    for (const slot of team.slots) {
      const character = slot.characterId ? byId.value.get(slot.characterId) : null
      slot.outOfRange = character ? checkSlotRange(character, slot, team) : false
    }
  }

  /** 切换队伍配置时保留原有成员（多出来的角色回到候补区） */
  function rebuildSlots(team, layout) {
    const target = layoutSlots(layout)
    const carryN = team.slots.filter((s) => s.role === 'N' && s.characterId).map((s) => s.characterId)
    const carryC = team.slots.filter((s) => s.role === 'C' && s.characterId).map((s) => s.characterId)
    let ni = 0
    let ci = 0
    team.slots = target.map((s) => {
      let characterId = null
      if (s.role === 'N' && ni < carryN.length) characterId = carryN[ni++]
      if (s.role === 'C' && ci < carryC.length) characterId = carryC[ci++]
      return { role: s.role, characterId, outOfRange: false }
    })
    refreshFlags(team)
  }

  function syncLayouts() {
    for (const team of TEAMS) {
      const config = state.teams[team.id]
      const effective = resolveLayout(config, state.globalLayout)
      const current = config.slots.map((s) => s.role).join('')
      const target = layoutSlots(effective).map((s) => s.role).join('')
      if (current !== target) rebuildSlots(config, effective)
    }
  }

  /* ------------------------- 操作 ------------------------- */

  /** 一键智能分配 */
  function assign() {
    const result = autoAssign(pool.value, {
      globalLayout: state.globalLayout,
      teams: TEAMS.map((t) => ({
        id: t.id,
        layout: state.teams[t.id].layout,
        cRange: normalizeRange(state.teams[t.id].cRange),
        nRange: normalizeRange(state.teams[t.id].nRange),
      })),
    })
    for (const team of TEAMS) {
      state.teams[team.id].slots = result.slots[team.id]
    }
    state.assignedAt = Date.now()
    state.configDirty = false
  }

  /** 清空编队（保留区间配置） */
  function clearSlots() {
    for (const team of TEAMS) {
      state.teams[team.id].slots = state.teams[team.id].slots.map((s) => ({
        role: s.role,
        characterId: null,
        outOfRange: false,
      }))
    }
    state.assignedAt = null
    state.configDirty = false
  }

  function setDifficulty(value) {
    if (state.difficulty === value) return
    state.difficulty = value
    state.configDirty = true
  }

  function setGlobalLayout(value) {
    if (state.globalLayout === value) return
    state.globalLayout = value
    syncLayouts()
    state.configDirty = true
  }

  /** layout 传 null 表示跟随全局 */
  function setTeamLayout(teamId, layout) {
    const team = state.teams[teamId]
    if (team.layout === layout) return
    team.layout = layout
    const effective = resolveLayout(team, state.globalLayout)
    const current = team.slots.map((s) => s.role).join('')
    const target = layoutSlots(effective).map((s) => s.role).join('')
    if (current !== target) rebuildSlots(team, effective)
    state.configDirty = true
  }

  function setRange(teamId, role, bound, rawValue) {
    const team = state.teams[teamId]
    const range = role === 'N' ? team.nRange : team.cRange
    const text = String(rawValue ?? '').trim()
    const value = text === '' ? null : Number(text)
    range[bound] = Number.isFinite(value) ? value : null
    refreshFlags(team)
    state.configDirty = true
  }

  function applySuggestedRanges() {
    const suggested = suggestRanges(pool.value, state.globalLayout)
    for (const team of TEAMS) {
      const item = suggested[team.id]
      if (!item) continue
      state.teams[team.id].cRange = { ...item.cRange }
      state.teams[team.id].nRange = { ...item.nRange }
      refreshFlags(state.teams[team.id])
    }
    state.configDirty = true
  }

  function resetRanges() {
    for (const team of TEAMS) {
      state.teams[team.id].cRange = emptyRange()
      state.teams[team.id].nRange = emptyRange()
      refreshFlags(state.teams[team.id])
    }
    state.configDirty = true
  }

  /**
   * 拖拽 / 点击移动
   * from: { kind:'slot', teamId, index } | { kind:'bench', characterId }
   * to:   { kind:'slot', teamId, index } | { kind:'bench' }
   */
  function transfer(from, to) {
    if (!from || !to) return { ok: false, message: '' }

    if (to.kind === 'bench') {
      if (from.kind !== 'slot') return { ok: false, message: '候补区里的角色已经在场下' }
      const slot = state.teams[from.teamId]?.slots[from.index]
      if (!slot?.characterId) return { ok: false, message: '该位置没有角色' }
      slot.characterId = null
      slot.outOfRange = false
      state.configDirty = false
      return { ok: true, message: '已移到候补区' }
    }

    const targetTeam = state.teams[to.teamId]
    const targetSlot = targetTeam?.slots[to.index]
    if (!targetSlot) return { ok: false, message: '目标位置不存在' }

    let sourceCharacter = null
    let sourceSlot = null
    if (from.kind === 'slot') {
      if (from.teamId === to.teamId && from.index === to.index) return { ok: false, message: '' }
      sourceSlot = state.teams[from.teamId]?.slots[from.index]
      sourceCharacter = sourceSlot?.characterId ? byId.value.get(sourceSlot.characterId) : null
      if (!sourceCharacter) return { ok: false, message: '该位置没有角色' }
    } else {
      sourceCharacter = byId.value.get(from.characterId)
      if (!sourceCharacter) return { ok: false, message: '找不到该角色' }
    }

    if (sourceCharacter.type !== targetSlot.role) {
      return { ok: false, message: `${ROLE_LABEL[targetSlot.role]}位只能放${ROLE_LABEL[targetSlot.role]}` }
    }

    if (from.kind === 'bench') {
      const displacedId = targetSlot.characterId
      const conflict = Object.values(slotsMap.value).some((list) =>
        list.some((s) => {
          if (!s.characterId) return false
          if (displacedId && s.characterId === displacedId) return false // 会被替换下场
          const character = byId.value.get(s.characterId)
          return character && character.player === sourceCharacter.player
        }),
      )
      if (conflict) {
        return { ok: false, message: `玩家「${sourceCharacter.player}」本波已经上场了一个角色` }
      }
      targetSlot.characterId = sourceCharacter.id
      refreshFlags(targetTeam)
      state.configDirty = false
      return { ok: true, message: `${sourceCharacter.name} 已上场` }
    }

    const temp = sourceSlot.characterId
    sourceSlot.characterId = targetSlot.characterId
    targetSlot.characterId = temp
    refreshFlags(state.teams[from.teamId])
    if (from.teamId !== to.teamId) refreshFlags(targetTeam)
    state.configDirty = false
    return { ok: true, message: targetSlot.characterId ? '已互换位置' : '已移动' }
  }

  /** 双奶队里两个奶位互换（常驻 <-> 太阳） */
  function swapHealSlots(teamId) {
    const team = state.teams[teamId]
    const heals = team.slots.filter((s) => s.role === 'N')
    if (heals.length < 2) return { ok: false, message: '当前不是双奶配置' }
    const [a, b] = heals
    const temp = a.characterId
    a.characterId = b.characterId
    b.characterId = temp
    refreshFlags(team)
    return { ok: true, message: `${TEAMS.find((t) => t.id === teamId)?.name} 两个奶位已互换` }
  }

  return {
    state,
    teams: TEAMS,
    layouts: TEAM_LAYOUTS,
    byId,
    pool,
    poolStats,
    slotsMap,
    teamConfigs,
    bench,
    warnings,
    teamStats,
    assignedCount,
    assign,
    clearSlots,
    setDifficulty,
    setGlobalLayout,
    setTeamLayout,
    setRange,
    applySuggestedRanges,
    resetRanges,
    transfer,
    swapHealSlots,
  }
}

watch(
  state,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY_LINEUP, JSON.stringify(value))
    } catch (err) {
      console.warn('编队数据保存失败：', err)
    }
  },
  { deep: true },
)
