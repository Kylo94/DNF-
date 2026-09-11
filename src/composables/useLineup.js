import { computed, reactive, watch } from 'vue'
import {
  DIFFICULTIES,
  MAX_WAVES,
  STORAGE_KEY_LINEUP,
  STORAGE_KEY_LINEUP_V1,
  TEAMS,
  TEAM_LAYOUTS,
  waveName,
} from '../constants.js'
import { useCharacters } from './useCharacters.js'
import { uid } from '../utils/format.js'
import { isKnownFormat } from '../utils/display.js'
import {
  ROLE_LABEL,
  autoAssign,
  checkSlotRange,
  computeBench,
  computeWavesNeeded,
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

function makeConfig(layout = '1n3c') {
  return {
    red: { layout: null, cRange: emptyRange(), cTotalRange: emptyRange(), nRange: emptyRange() },
    yellow: { layout: null, cRange: emptyRange(), cTotalRange: emptyRange(), nRange: emptyRange() },
    green: { layout: null, cRange: emptyRange(), cTotalRange: emptyRange(), nRange: emptyRange() },
  }
}

function emptyTeams(layout = '1n3c') {
  const teams = {}
  for (const team of TEAMS) {
    teams[team.id] = layoutSlots(layout).map((s) => ({ role: s.role, characterId: null, outOfRange: false }))
  }
  return teams
}

function makeWave(difficulty = DIFFICULTIES[0], layout = '1n3c') {
  return { id: uid(), difficulty, teams: emptyTeams(layout) }
}

function defaultState() {
  return {
    version: 2,
    displayFormat: 'player-name-value',
    defaultDifficulty: DIFFICULTIES[0],
    globalLayout: '1n3c',
    config: makeConfig(),
    waves: [makeWave()],
    activeWave: 0,
    assignedAt: null,
    configDirty: false,
  }
}

function normalizeRangeObject(value) {
  return { ...emptyRange(), ...(value || {}) }
}

/** 逐队配置做一次兼容处理 */
function normalizeConfig(raw) {
  const base = makeConfig()
  if (!raw) return base
  for (const team of TEAMS) {
    const saved = raw[team.id]
    if (!saved) continue
    base[team.id] = {
      layout: saved.layout ?? null,
      cRange: normalizeRangeObject(saved.cRange),
      cTotalRange: normalizeRangeObject(saved.cTotalRange),
      nRange: normalizeRangeObject(saved.nRange),
    }
  }
  return base
}

function normalizeSlots(list, fallbackLayout = '1n3c') {
  if (!Array.isArray(list) || !list.length) {
    return layoutSlots(fallbackLayout).map((s) => ({ role: s.role, characterId: null, outOfRange: false }))
  }
  return list.map((s) => ({
    role: s.role === 'N' ? 'N' : 'C',
    characterId: s.characterId || null,
    outOfRange: Boolean(s.outOfRange),
  }))
}

function normalizeWaves(raw) {
  if (!Array.isArray(raw) || !raw.length) return [makeWave()]
  return raw.map((wave) => ({
    id: wave.id || uid(),
    difficulty: DIFFICULTIES.includes(wave.difficulty) ? wave.difficulty : DIFFICULTIES[0],
    teams: Object.fromEntries(TEAMS.map((t) => [t.id, normalizeSlots(wave.teams?.[t.id])])),
  }))
}

/** 旧版单波次数据迁移成 v2 */
function migrateFromV1() {
  try {
    const text = localStorage.getItem(STORAGE_KEY_LINEUP_V1)
    if (!text) return null
    const old = JSON.parse(text)
    const state = defaultState()
    state.defaultDifficulty = DIFFICULTIES.includes(old.difficulty) ? old.difficulty : DIFFICULTIES[0]
    state.globalLayout = old.globalLayout || '1n3c'
    state.config = normalizeConfig(old.teams)
    state.waves = [
      {
        id: uid(),
        difficulty: state.defaultDifficulty,
        teams: Object.fromEntries(TEAMS.map((t) => [t.id, normalizeSlots(old.teams?.[t.id]?.slots)])),
      },
    ]
    state.assignedAt = old.assignedAt || null
    console.info('已把旧版单波次编队数据迁移为多波次结构')
    return state
  } catch (err) {
    console.warn('旧版编队数据迁移失败：', err)
    return null
  }
}

function loadState() {
  try {
    const text = localStorage.getItem(STORAGE_KEY_LINEUP)
    if (!text) return migrateFromV1() || defaultState()
    const parsed = JSON.parse(text)
    const base = defaultState()
    return {
      ...base,
      ...parsed,
      displayFormat: isKnownFormat(parsed.displayFormat) ? parsed.displayFormat : base.displayFormat,
      defaultDifficulty: DIFFICULTIES.includes(parsed.defaultDifficulty)
        ? parsed.defaultDifficulty
        : base.defaultDifficulty,
      globalLayout: parsed.globalLayout || base.globalLayout,
      config: normalizeConfig(parsed.config),
      waves: normalizeWaves(parsed.waves),
      activeWave: Number.isInteger(parsed.activeWave) ? parsed.activeWave : 0,
    }
  } catch (err) {
    console.warn('编队数据读取失败：', err)
    return defaultState()
  }
}

const state = reactive(loadState())

/** 编队（排表）状态与操作：多波次 + 逐队区间 + 合计伤害目标 */
export function useLineup() {
  const { characters } = useCharacters()

  const byId = computed(() => new Map(characters.value.map((c) => [c.id, c])))

  /** 队伍配置（含生效的队内配置） */
  const teamConfigs = computed(() =>
    TEAMS.map((t) => {
      const config = state.config[t.id]
      return {
        ...t,
        ...config,
        ownLayout: config.layout,
        layout: resolveLayout(config, state.globalLayout),
        cTotalRange: normalizeRange(config.cTotalRange),
      }
    }),
  )

  const teamsPayload = computed(() =>
    TEAMS.map((t) => {
      const config = state.config[t.id]
      return {
        id: t.id,
        layout: config.layout,
        cRange: normalizeRange(config.cRange),
        cTotalRange: normalizeRange(config.cTotalRange),
        nRange: normalizeRange(config.nRange),
      }
    }),
  )

  /** 每个难度已登记的角色 */
  const poolsByDifficulty = computed(() => {
    const map = {}
    for (const difficulty of DIFFICULTIES) {
      map[difficulty] = characters.value.filter((c) => c.difficulty === difficulty)
    }
    return map
  })

  const activeIndex = computed(() => Math.min(Math.max(state.activeWave, 0), state.waves.length - 1))
  const activeWave = computed(() => state.waves[activeIndex.value] || state.waves[0])

  /** 本波可用角色（该难度） */
  const activePool = computed(() => poolsByDifficulty.value[activeWave.value?.difficulty] || [])

  const activeSlots = computed(() => activeWave.value?.teams || emptyTeams())

  /** 已上场角色 id -> 位置（全部波次） */
  const assignments = computed(() => {
    const map = new Map()
    state.waves.forEach((wave, waveIndex) => {
      for (const list of Object.values(wave.teams)) {
        list.forEach((slot, index) => {
          if (slot.characterId) map.set(slot.characterId, { waveIndex, index })
        })
      }
    })
    return map
  })

  /** 未上场：全部难度里都没排上的角色 */
  const bench = computed(() => computeBench(characters.value, state.waves, byId.value))

  const warnings = computed(() =>
    validateLineup({
      waves: state.waves.map((wave) => ({
        ...wave,
        teamConfig: Object.fromEntries(TEAMS.map((t) => [t.id, { cTotalRange: normalizeRange(state.config[t.id].cTotalRange) }])),
      })),
      teams: TEAMS,
      byId: byId.value,
    }),
  )

  const activeWarnings = computed(() => warnings.value.filter((w) => w.waveIndex === activeIndex.value))
  const otherWarnings = computed(() => warnings.value.filter((w) => w.waveIndex !== activeIndex.value))

  const teamStats = computed(() => {
    const map = {}
    for (const team of TEAMS) {
      map[team.id] = teamSummary(
        activeSlots.value[team.id] || [],
        byId.value,
        normalizeRange(state.config[team.id].cTotalRange),
      )
    }
    return map
  })

  const activeAssignedCount = computed(
    () => TEAMS.reduce((sum, t) => sum + (activeSlots.value[t.id] || []).filter((s) => s.characterId).length, 0),
  )

  const activePoolStats = computed(() => ({
    total: activePool.value.length,
    c: activePool.value.filter((c) => c.type === 'C').length,
    n: activePool.value.filter((c) => c.type === 'N').length,
  }))

  /** 新波次默认难度下的角色池（自动分档用） */
  const defaultPoolStats = computed(() => {
    const pool = poolsByDifficulty.value[state.defaultDifficulty] || []
    return {
      total: pool.length,
      c: pool.filter((c) => c.type === 'C').length,
      n: pool.filter((c) => c.type === 'N').length,
    }
  })

  /** 波次概览（页签上显示人数） */
  const waveSummaries = computed(() =>
    state.waves.map((wave, index) => {
      const assigned = TEAMS.reduce(
        (sum, t) => sum + (wave.teams[t.id] || []).filter((s) => s.characterId).length,
        0,
      )
      const total = TEAMS.reduce((sum, t) => sum + (wave.teams[t.id] || []).length, 0)
      return {
        index,
        name: waveName(index),
        difficulty: wave.difficulty,
        assigned,
        total,
        missingHeal: TEAMS.some((t) => {
          const list = wave.teams[t.id] || []
          return list.some((s) => s.role === 'N' && !s.characterId)
        }),
      }
    }),
  )

  const overallStats = computed(() => {
    const used = assignments.value.size
    const totalCharacters = characters.value.length
    return {
      used,
      totalCharacters,
      left: totalCharacters - used,
      waves: state.waves.length,
    }
  })

  /* ------------------------- 内部工具 ------------------------- */

  function refreshFlags(wave, teamId) {
    const config = state.config[teamId]
    for (const slot of wave.teams[teamId]) {
      const character = slot.characterId ? byId.value.get(slot.characterId) : null
      slot.outOfRange = character ? checkSlotRange(character, slot, config) : false
    }
  }

  function refreshWaveFlags(wave) {
    for (const team of TEAMS) refreshFlags(wave, team.id)
  }

  /** 队伍配置变化时重建槽位（保留成员，多出来的回到候补） */
  function rebuildSlots(wave, teamId, layout) {
    const target = layoutSlots(layout)
    const current = wave.teams[teamId]
    const carryN = current.filter((s) => s.role === 'N' && s.characterId).map((s) => s.characterId)
    const carryC = current.filter((s) => s.role === 'C' && s.characterId).map((s) => s.characterId)
    let ni = 0
    let ci = 0
    wave.teams[teamId] = target.map((s) => {
      let characterId = null
      if (s.role === 'N' && ni < carryN.length) characterId = carryN[ni++]
      if (s.role === 'C' && ci < carryC.length) characterId = carryC[ci++]
      return { role: s.role, characterId, outOfRange: false }
    })
    refreshFlags(wave, teamId)
  }

  function syncLayouts() {
    for (const wave of state.waves) {
      for (const team of TEAMS) {
        const config = state.config[team.id]
        const effective = resolveLayout(config, state.globalLayout)
        const currentRoles = wave.teams[team.id].map((s) => s.role).join('')
        const targetRoles = layoutSlots(effective).map((s) => s.role).join('')
        if (currentRoles !== targetRoles) rebuildSlots(wave, team.id, effective)
      }
    }
  }

  function charactersUsedExcept(waveIndex) {
    const used = new Set()
    state.waves.forEach((wave, index) => {
      if (index === waveIndex) return
      for (const list of Object.values(wave.teams)) {
        for (const slot of list) if (slot.characterId) used.add(slot.characterId)
      }
    })
    return used
  }

  function fillWave(wave, usedElsewhere) {
    const pool = (poolsByDifficulty.value[wave.difficulty] || []).filter((c) => !usedElsewhere.has(c.id))
    const { slots } = autoAssign(pool, { globalLayout: state.globalLayout, teams: teamsPayload.value })
    for (const team of TEAMS) wave.teams[team.id] = slots[team.id]
    refreshWaveFlags(wave)
    return wave
  }

  /* ------------------------- 操作 ------------------------- */

  /** 一键把所有角色按难度排进各波（第一波、第二波……排完为止） */
  function assignAll() {
    const waves = []
    for (const difficulty of DIFFICULTIES) {
      const pool = poolsByDifficulty.value[difficulty] || []
      if (!pool.length) continue
      const count = computeWavesNeeded(pool, { globalLayout: state.globalLayout, teams: teamsPayload.value }, MAX_WAVES)
      for (let i = 0; i < count; i += 1) waves.push(makeWave(difficulty, state.globalLayout))
    }
    if (!waves.length) {
      state.waves = [makeWave(state.defaultDifficulty, state.globalLayout)]
      state.activeWave = 0
      state.assignedAt = Date.now()
      return { waves: state.waves.length, assigned: 0 }
    }

    const used = new Set()
    for (const wave of waves) {
      const pool = (poolsByDifficulty.value[wave.difficulty] || []).filter((c) => !used.has(c.id))
      const { slots } = autoAssign(pool, { globalLayout: state.globalLayout, teams: teamsPayload.value })
      for (const team of TEAMS) wave.teams[team.id] = slots[team.id]
      refreshWaveFlags(wave)
      for (const list of Object.values(wave.teams)) {
        for (const slot of list) if (slot.characterId) used.add(slot.characterId)
      }
    }

    state.waves = waves
    state.activeWave = 0
    state.assignedAt = Date.now()
    state.configDirty = false
    return { waves: waves.length, assigned: used.size }
  }

  /** 只重排当前这一波（其他波已上场的角色不会重复上场） */
  function assignWave(index = activeIndex.value) {
    const wave = state.waves[index]
    if (!wave) return { assigned: 0 }
    fillWave(wave, charactersUsedExcept(index))
    state.assignedAt = Date.now()
    state.configDirty = false
    return { assigned: TEAMS.reduce((sum, t) => sum + wave.teams[t.id].filter((s) => s.characterId).length, 0) }
  }

  function addWave() {
    if (state.waves.length >= MAX_WAVES) return { ok: false, message: `最多 ${MAX_WAVES} 波` }
    const wave = makeWave(state.defaultDifficulty, state.globalLayout)
    state.waves.push(wave)
    const at = state.waves.length - 1
    state.activeWave = at
    return { ok: true, message: `已添加${waveName(at)}` }
  }

  function removeWave(index = activeIndex.value) {
    if (state.waves.length <= 1) {
      state.waves = [makeWave(state.defaultDifficulty, state.globalLayout)]
      state.activeWave = 0
      return { ok: true, message: '已清空当前波次' }
    }
    state.waves.splice(index, 1)
    state.activeWave = Math.max(0, Math.min(state.activeWave, state.waves.length - 1))
    return { ok: true, message: '已删除该波次' }
  }

  function clearWave(index = activeIndex.value) {
    const wave = state.waves[index]
    if (!wave) return
    for (const team of TEAMS) {
      wave.teams[team.id] = wave.teams[team.id].map((s) => ({ role: s.role, characterId: null, outOfRange: false }))
    }
    state.assignedAt = null
  }

  function clearAllWaves() {
    state.waves = state.waves.map((wave) => ({
      ...wave,
      teams: Object.fromEntries(
        TEAMS.map((t) => [t.id, wave.teams[t.id].map((s) => ({ role: s.role, characterId: null, outOfRange: false }))]),
      ),
    }))
    state.assignedAt = null
  }

  /** 导入时整体替换波次与区间配置 */
  function replaceAll({ waves, config } = {}) {
    if (Array.isArray(waves) && waves.length) {
      state.waves = normalizeWaves(waves)
      if (config) state.config = normalizeConfig(config)
      state.activeWave = 0
      state.assignedAt = Date.now()
      state.configDirty = false
      syncLayouts()
    }
  }

  function setActiveWave(index) {
    state.activeWave = Math.max(0, Math.min(index, state.waves.length - 1))
  }

  function setWaveDifficulty(index, difficulty) {
    const wave = state.waves[index]
    if (!wave || !DIFFICULTIES.includes(difficulty)) return
    wave.difficulty = difficulty
    state.configDirty = true
  }

  function setDefaultDifficulty(value) {
    if (!DIFFICULTIES.includes(value)) return
    state.defaultDifficulty = value
  }

  function setDisplayFormat(value) {
    if (isKnownFormat(value)) state.displayFormat = value
  }

  function setGlobalLayout(value) {
    if (state.globalLayout === value) return
    state.globalLayout = value
    syncLayouts()
    state.configDirty = true
  }

  function setTeamLayout(teamId, layout) {
    const config = state.config[teamId]
    if (config.layout === layout) return
    config.layout = layout
    const effective = resolveLayout(config, state.globalLayout)
    for (const wave of state.waves) {
      const currentRoles = wave.teams[teamId].map((s) => s.role).join('')
      const targetRoles = layoutSlots(effective).map((s) => s.role).join('')
      if (currentRoles !== targetRoles) rebuildSlots(wave, teamId, effective)
    }
    state.configDirty = true
  }

  function setRange(teamId, role, bound, rawValue) {
    const config = state.config[teamId]
    const key = role === 'TOTAL' ? 'cTotalRange' : role === 'N' ? 'nRange' : 'cRange'
    const range = config[key]
    const text = String(rawValue ?? '').trim()
    const value = text === '' ? null : Number(text)
    range[bound] = Number.isFinite(value) ? value : null
    for (const wave of state.waves) refreshFlags(wave, teamId)
    state.configDirty = true
  }

  function applySuggestedRanges() {
    const pool = poolsByDifficulty.value[state.defaultDifficulty] || characters.value
    const suggested = suggestRanges(pool, state.globalLayout)
    for (const team of TEAMS) {
      const item = suggested[team.id]
      if (!item) continue
      state.config[team.id] = {
        ...state.config[team.id],
        cRange: { ...item.cRange },
        cTotalRange: { ...item.cTotalRange },
        nRange: { ...item.nRange },
      }
      for (const wave of state.waves) refreshFlags(wave, team.id)
    }
    state.configDirty = true
  }

  function resetRanges() {
    for (const team of TEAMS) {
      state.config[team.id] = {
        ...state.config[team.id],
        cRange: emptyRange(),
        cTotalRange: emptyRange(),
        nRange: emptyRange(),
      }
      for (const wave of state.waves) refreshFlags(wave, team.id)
    }
    state.configDirty = true
  }

  function teamName(teamId) {
    return TEAMS.find((t) => t.id === teamId)?.name || teamId
  }

  function findWaveSlot(waveIndex, teamId, index) {
    const wave = state.waves[waveIndex]
    if (!wave) return null
    return wave.teams[teamId]?.[index] || null
  }

  /** 校验某一波里同一个玩家是否重复上场 */
  function duplicatePlayerInWave(wave, ignoreIds = new Set()) {
    const seen = new Map()
    for (const team of TEAMS) {
      for (const slot of wave.teams[team.id] || []) {
        if (!slot.characterId || ignoreIds.has(slot.characterId)) continue
        const character = byId.value.get(slot.characterId)
        if (!character) continue
        if (seen.has(character.player)) return character.player
        seen.set(character.player, character.id)
      }
    }
    return null
  }

  /**
   * 拖拽 / 点击移动（支持跨波次）
   * from: { kind:'slot', waveIndex, teamId, index } | { kind:'bench', characterId }
   * to:   { kind:'slot', waveIndex, teamId, index } | { kind:'bench' }
   */
  function transfer(from, to) {
    if (!from || !to) return { ok: false, message: '' }

    if (to.kind === 'bench') {
      if (from.kind !== 'slot') return { ok: false, message: '候补区里的角色已经在场下' }
      const slot = findWaveSlot(from.waveIndex, from.teamId, from.index)
      if (!slot?.characterId) return { ok: false, message: '该位置没有角色' }
      slot.characterId = null
      slot.outOfRange = false
      return { ok: true, message: '已移到候补区' }
    }

    const targetWave = state.waves[to.waveIndex]
    const targetSlot = findWaveSlot(to.waveIndex, to.teamId, to.index)
    if (!targetSlot || !targetWave) return { ok: false, message: '目标位置不存在' }

    let sourceCharacter = null
    let sourceSlot = null
    if (from.kind === 'slot') {
      if (from.waveIndex === to.waveIndex && from.teamId === to.teamId && from.index === to.index) {
        return { ok: false, message: '' }
      }
      sourceSlot = findWaveSlot(from.waveIndex, from.teamId, from.index)
      sourceCharacter = sourceSlot?.characterId ? byId.value.get(sourceSlot.characterId) : null
      if (!sourceCharacter) return { ok: false, message: '该位置没有角色' }
    } else {
      sourceCharacter = byId.value.get(from.characterId)
      if (!sourceCharacter) return { ok: false, message: '找不到该角色' }
    }

    if (sourceCharacter.type !== targetSlot.role) {
      return { ok: false, message: `${ROLE_LABEL[targetSlot.role]}位只能放${ROLE_LABEL[targetSlot.role]}` }
    }

    const displacedId = targetSlot.characterId
    const ignore = new Set(displacedId ? [displacedId] : [])

    if (from.kind === 'slot') {
      const sourceWave = state.waves[from.waveIndex]
      const movingOut = sourceSlot.characterId
      const isSwap = Boolean(displacedId)
      // 交换（目标可能为空）
      sourceSlot.characterId = displacedId || null
      targetSlot.characterId = movingOut
      if (from.waveIndex !== to.waveIndex) {
        const conflictSource = duplicatePlayerInWave(sourceWave)
        const conflictTarget = duplicatePlayerInWave(targetWave)
        if (conflictSource || conflictTarget) {
          // 回滚
          sourceSlot.characterId = movingOut
          targetSlot.characterId = displacedId || null
          return { ok: false, message: `玩家「${conflictSource || conflictTarget}」在同一波里已经上场了一个角色` }
        }
        refreshWaveFlags(sourceWave)
      }
      refreshWaveFlags(targetWave)
      return { ok: true, message: isSwap ? '已互换位置' : '已移动' }
    }

    // 候补区 -> 场上
    const conflict = duplicatePlayerInWave(targetWave, ignore)
    if (conflict) {
      return { ok: false, message: `玩家「${conflict}」本波已经上场了一个角色` }
    }
    targetSlot.characterId = sourceCharacter.id
    if (targetSlot.characterId) refreshWaveFlags(targetWave)
    return { ok: true, message: `${sourceCharacter.name} 已上场（${waveName(to.waveIndex)}）` }
  }

  /** 双奶队里两个奶位互换（常驻 <-> 太阳） */
  function swapHealSlots(waveIndex, teamId) {
    const wave = state.waves[waveIndex]
    if (!wave) return { ok: false, message: '' }
    const heals = wave.teams[teamId].filter((s) => s.role === 'N')
    if (heals.length < 2) return { ok: false, message: '当前不是双奶配置' }
    const [a, b] = heals
    const temp = a.characterId
    a.characterId = b.characterId
    b.characterId = temp
    refreshFlags(wave, teamId)
    return { ok: true, message: `${teamName(teamId)}两个奶位已互换` }
  }

  return {
    state,
    teams: TEAMS,
    layouts: TEAM_LAYOUTS,
    byId,
    teamConfigs,
    poolsByDifficulty,
    activeIndex,
    activeWave,
    activePool,
    activeSlots,
    activePoolStats,
    defaultPoolStats,
    activeAssignedCount,
    assignments,
    bench,
    warnings,
    activeWarnings,
    otherWarnings,
    teamStats,
    waveSummaries,
    overallStats,
    assignAll,
    assignWave,
    addWave,
    removeWave,
    clearWave,
    clearAllWaves,
    replaceAll,
    setActiveWave,
    setWaveDifficulty,
    setDefaultDifficulty,
    setDisplayFormat,
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
