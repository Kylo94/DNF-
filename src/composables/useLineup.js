import { computed, reactive, watch } from 'vue'
import {
  DIFFICULTIES,
  MAX_WAVES,
  SLOT_KEYS,
  STORAGE_KEY_LINEUP,
  STORAGE_KEY_LINEUP_V1,
  STORAGE_KEY_LINEUP_V2,
  TEAMS,
  waveName,
} from '../constants.js'
import { useCharacters } from './useCharacters.js'
import { uid } from '../utils/format.js'
import { isKnownFormat } from '../utils/display.js'
import {
  autoAssign,
  checkSlotRange,
  computeBench,
  computeWavesNeeded,
  createSlots,
  slotDef,
  suggestRanges,
  teamSummary,
  validateLineup,
} from '../utils/lineup.js'

function emptyRange() {
  return { min: null, max: null }
}

function emptyRanges() {
  return Object.fromEntries(SLOT_KEYS.map((key) => [key, emptyRange()]))
}

/** v3 每队配置：5 个位置区间 + 伤害目标 + 双奶策略 */
function makeTeamConfig(healPolicy = 'auto') {
  return {
    healPolicy,
    ranges: emptyRanges(),
    total: emptyRange(),
  }
}

function defaultConfig() {
  return {
    red: makeTeamConfig('auto'),
    yellow: makeTeamConfig('auto'),
    green: makeTeamConfig('single'), // 绿队默认混子队：只用单奶带满
  }
}

function emptyTeams() {
  const teams = {}
  for (const team of TEAMS) teams[team.id] = createSlots('single')
  return teams
}

function makeWave(difficulty = DIFFICULTIES[0]) {
  return { id: uid(), difficulty, teams: emptyTeams(), notes: {} }
}

function defaultState() {
  return {
    version: 3,
    displayFormat: 'player-name-value',
    defaultDifficulty: DIFFICULTIES[0],
    config: defaultConfig(),
    waves: [makeWave()],
    activeWave: 0,
    assignedAt: null,
    configDirty: false,
  }
}

function normalizeRangeObject(value) {
  return { ...emptyRange(), ...(value || {}) }
}

/** 兼容 v2（队内配置 + 单角色区间/合计/奶区间）与更早的数据 */
function normalizeConfig(raw, legacy = {}) {
  const base = defaultConfig()
  if (!raw) return base
  for (const team of TEAMS) {
    const saved = raw[team.id]
    if (!saved) continue
    if (saved.ranges) {
      base[team.id] = {
        healPolicy: saved.healPolicy || base[team.id].healPolicy,
        ranges: Object.fromEntries(SLOT_KEYS.map((key) => [key, normalizeRangeObject(saved.ranges?.[key])])),
        total: normalizeRangeObject(saved.total),
      }
      continue
    }
    const isLast = team.id === TEAMS[TEAMS.length - 1].id
    const legacyLayout = saved.layout || legacy.globalLayout || 'auto'
    const policy =
      legacyLayout === '2n2c' ? 'double' : legacyLayout === '1n3c' ? 'single' : isLast ? 'single' : 'auto'
    base[team.id] = {
      healPolicy: policy,
      ranges: {
        heal1: normalizeRangeObject(saved.nRange),
        heal2: normalizeRangeObject(saved.nRange),
        c1: normalizeRangeObject(saved.cRange),
        c2: normalizeRangeObject(saved.cRange),
        c3: normalizeRangeObject(saved.cRange),
      },
      total: normalizeRangeObject(saved.cTotalRange),
    }
  }
  return base
}

/** 旧槽位（只有 role）补上位置 key */
function normalizeSlots(list) {
  if (!Array.isArray(list) || !list.length) return createSlots('single')
  let healIndex = 0
  let cIndex = 0
  const keys = list.map((slot) => {
    if (slot.key && SLOT_KEYS.includes(slot.key)) return slot.key
    if (slot.role === 'N') return healIndex++ === 0 ? 'heal1' : 'heal2'
    return ['c1', 'c2', 'c3'][cIndex++] || 'c3'
  })
  return list.map((slot, index) => ({
    key: keys[index],
    role: slotDef(keys[index]).role,
    characterId: slot.characterId || null,
    outOfRange: Boolean(slot.outOfRange),
  }))
}

function normalizeWaves(raw) {
  if (!Array.isArray(raw) || !raw.length) return [makeWave()]
  return raw.map((wave) => ({
    id: wave.id || uid(),
    difficulty: DIFFICULTIES.includes(wave.difficulty) ? wave.difficulty : DIFFICULTIES[0],
    teams: Object.fromEntries(TEAMS.map((t) => [t.id, normalizeSlots(wave.teams?.[t.id])])),
    notes: wave.notes && typeof wave.notes === 'object' ? { ...wave.notes } : {},
  }))
}

/** 旧版本数据迁移 */
function migrateLegacy() {
  const sources = [
    [STORAGE_KEY_LINEUP_V2, 2],
    [STORAGE_KEY_LINEUP_V1, 1],
  ]
  for (const [key, version] of sources) {
    try {
      const text = localStorage.getItem(key)
      if (!text) continue
      const old = JSON.parse(text)
      const state = defaultState()
      state.defaultDifficulty = DIFFICULTIES.includes(old.difficulty) ? old.difficulty : DIFFICULTIES[0]
      state.displayFormat = isKnownFormat(old.displayFormat) ? old.displayFormat : state.displayFormat
      state.config = normalizeConfig(old.config || old.teams, { globalLayout: old.globalLayout })
      state.waves =
        version === 1 && old.teams
          ? [
              {
                id: uid(),
                difficulty: state.defaultDifficulty,
                teams: Object.fromEntries(
                  TEAMS.map((t) => [t.id, normalizeSlots(old.teams?.[t.id]?.slots)]),
                ),
                notes: {},
              },
            ]
          : normalizeWaves(old.waves)
      state.assignedAt = old.assignedAt || null
      console.info(`已把旧版（v${version}）编队数据迁移为「按位置配置」`)
      return state
    } catch (err) {
      console.warn('旧版编队数据迁移失败：', err)
    }
  }
  return null
}

function loadState() {
  try {
    const text = localStorage.getItem(STORAGE_KEY_LINEUP)
    if (!text) return migrateLegacy() || defaultState()
    const parsed = JSON.parse(text)
    const base = defaultState()
    return {
      ...base,
      ...parsed,
      displayFormat: isKnownFormat(parsed.displayFormat) ? parsed.displayFormat : base.displayFormat,
      defaultDifficulty: DIFFICULTIES.includes(parsed.defaultDifficulty)
        ? parsed.defaultDifficulty
        : base.defaultDifficulty,
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

/** 编队（排表）状态与操作：严格按位置区间匹配，双奶是可选方案 */
export function useLineup() {
  const { characters } = useCharacters()

  const byId = computed(() => new Map(characters.value.map((c) => [c.id, c])))

  const teamConfigs = computed(() =>
    TEAMS.map((t) => ({
      ...t,
      ...state.config[t.id],
      ranges: state.config[t.id].ranges,
      total: state.config[t.id].total,
    })),
  )

  const teamsPayload = computed(() =>
    teamConfigs.value.map((t) => ({
      id: t.id,
      name: t.name,
      healPolicy: t.healPolicy,
      ranges: t.ranges,
      total: t.total,
    })),
  )

  const poolsByDifficulty = computed(() => {
    const map = {}
    for (const difficulty of DIFFICULTIES) {
      map[difficulty] = characters.value.filter((c) => c.difficulty === difficulty)
    }
    return map
  })

  const activeIndex = computed(() => Math.min(Math.max(state.activeWave, 0), state.waves.length - 1))
  const activeWave = computed(() => state.waves[activeIndex.value] || state.waves[0])
  const activePool = computed(() => poolsByDifficulty.value[activeWave.value?.difficulty] || [])
  const activeSlots = computed(() => activeWave.value?.teams || emptyTeams())

  const bench = computed(() => computeBench(characters.value, state.waves, byId.value))

  const warnings = computed(() =>
    validateLineup({ waves: state.waves, teams: TEAMS, byId: byId.value, teamConfigs: teamConfigs.value }),
  )

  const activeWarnings = computed(() => warnings.value.filter((w) => w.waveIndex === activeIndex.value))

  const teamStats = computed(() => {
    const map = {}
    for (const team of TEAMS) {
      map[team.id] = teamSummary(activeSlots.value[team.id] || [], byId.value, state.config[team.id].total)
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

  const defaultPoolStats = computed(() => {
    const pool = poolsByDifficulty.value[state.defaultDifficulty] || []
    return {
      total: pool.length,
      c: pool.filter((c) => c.type === 'C').length,
      n: pool.filter((c) => c.type === 'N').length,
    }
  })

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
        missingHeal: TEAMS.some((t) => (wave.teams[t.id] || []).some((s) => s.role === 'N' && !s.characterId)),
      }
    }),
  )

  const overallStats = computed(() => ({
    used: new Set(
      state.waves.flatMap((w) =>
        Object.values(w.teams)
          .flat()
          .filter((s) => s.characterId)
          .map((s) => s.characterId),
      ),
    ).size,
    totalCharacters: characters.value.length,
    waves: state.waves.length,
  }))

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

  /** 切换单/双奶时按位置 key 保留成员，落选的回未登场 */
  function rebuildSlots(wave, teamId, layout) {
    const carry = Object.fromEntries(
      (wave.teams[teamId] || []).map((s) => [s.key, { id: s.characterId, out: s.outOfRange }]),
    )
    wave.teams[teamId] = createSlots(layout).map((s) => ({
      ...s,
      characterId: carry[s.key]?.id || null,
      outOfRange: carry[s.key]?.out || false,
    }))
    refreshFlags(wave, teamId)
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

  /* ------------------------- 操作 ------------------------- */

  /** 一键排完：严格匹配，排不出来就停（不再硬凑出空波） */
  function assignAll() {
    const waves = []
    for (const difficulty of DIFFICULTIES) {
      const pool = poolsByDifficulty.value[difficulty] || []
      if (!pool.length) continue
      const maxWaves = computeWavesNeeded(pool, { teams: teamsPayload.value }, MAX_WAVES)
      const used = new Set()
      for (let i = 0; i < maxWaves; i += 1) {
        const available = pool.filter((c) => !used.has(c.id))
        const result = autoAssign(available, { teams: teamsPayload.value })
        const count = Object.values(result.slots).flat().filter((s) => s.characterId).length
        if (!count) break // 这一波一个都排不出来 → 后面更排不出来
        waves.push({ id: uid(), difficulty, teams: result.slots, notes: result.notes || {} })
        for (const list of Object.values(result.slots)) {
          for (const slot of list) if (slot.characterId) used.add(slot.characterId)
        }
      }
    }
    if (!waves.length) {
      state.waves = [makeWave(state.defaultDifficulty)]
      state.activeWave = 0
      state.assignedAt = Date.now()
      state.configDirty = false
      return { waves: 1, assigned: 0 }
    }
    state.waves = waves
    state.activeWave = 0
    state.assignedAt = Date.now()
    state.configDirty = false
    return { waves: waves.length, assigned: overallStats.value.used }
  }

  /** 只重排当前这一波（其他波已上场的角色不会重复上场） */
  function assignWave(index = activeIndex.value) {
    const wave = state.waves[index]
    if (!wave) return { assigned: 0 }
    const used = charactersUsedExcept(index)
    const pool = (poolsByDifficulty.value[wave.difficulty] || []).filter((c) => !used.has(c.id))
    const result = autoAssign(pool, { teams: teamsPayload.value })
    wave.teams = result.slots
    wave.notes = result.notes || {}
    state.assignedAt = Date.now()
    state.configDirty = false
    return {
      assigned: TEAMS.reduce((sum, t) => sum + wave.teams[t.id].filter((s) => s.characterId).length, 0),
    }
  }

  function addWave() {
    if (state.waves.length >= MAX_WAVES) return { ok: false, message: `最多 ${MAX_WAVES} 波` }
    state.waves.push(makeWave(state.defaultDifficulty))
    const at = state.waves.length - 1
    state.activeWave = at
    return { ok: true, message: `已添加${waveName(at)}` }
  }

  function removeWave(index = activeIndex.value) {
    if (state.waves.length <= 1) {
      state.waves = [makeWave(state.defaultDifficulty)]
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
      for (const slot of wave.teams[team.id]) {
        slot.characterId = null
        slot.outOfRange = false
      }
    }
    wave.notes = {}
    state.assignedAt = null
  }

  function clearAllWaves() {
    for (const wave of state.waves) {
      for (const team of TEAMS) {
        for (const slot of wave.teams[team.id]) {
          slot.characterId = null
          slot.outOfRange = false
        }
      }
      wave.notes = {}
    }
    state.assignedAt = null
  }

  /** 导入时整体替换波次与配置 */
  function replaceAll({ waves, config } = {}) {
    if (Array.isArray(waves) && waves.length) {
      state.waves = normalizeWaves(waves)
      if (config) state.config = normalizeConfig(config)
      state.activeWave = 0
      state.assignedAt = Date.now()
      state.configDirty = false
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
    if (DIFFICULTIES.includes(value)) state.defaultDifficulty = value
  }

  function setDisplayFormat(value) {
    if (isKnownFormat(value)) state.displayFormat = value
  }

  function setHealPolicy(teamId, policy) {
    const config = state.config[teamId]
    if (!config || config.healPolicy === policy) return
    config.healPolicy = policy
    state.configDirty = true
  }

  /** key: heal1 / heal2 / c1 / c2 / c3 / total */
  function setRange(teamId, key, bound, rawValue) {
    const config = state.config[teamId]
    if (!config) return
    const target = key === 'total' ? config.total : config.ranges[key]
    if (!target) return
    const text = String(rawValue ?? '').trim()
    const value = text === '' ? null : Number(text)
    target[bound] = Number.isFinite(value) ? value : null
    for (const wave of state.waves) refreshFlags(wave, teamId)
    state.configDirty = true
  }

  function applySuggestedRanges() {
    const pool = poolsByDifficulty.value[state.defaultDifficulty] || characters.value
    const suggested = suggestRanges(pool)
    for (const team of TEAMS) {
      const item = suggested[team.id]
      if (!item) continue
      state.config[team.id].ranges = Object.fromEntries(
        SLOT_KEYS.map((key) => [key, normalizeRangeObject(item.ranges?.[key])]),
      )
      state.config[team.id].total = normalizeRangeObject(item.total)
      for (const wave of state.waves) refreshFlags(wave, team.id)
    }
    state.configDirty = true
  }

  function resetRanges() {
    for (const team of TEAMS) {
      state.config[team.id].ranges = emptyRanges()
      state.config[team.id].total = emptyRange()
      for (const wave of state.waves) refreshFlags(wave, team.id)
    }
    state.configDirty = true
  }

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

  function findWaveSlot(waveIndex, teamId, index) {
    const wave = state.waves[waveIndex]
    if (!wave) return null
    return wave.teams[teamId]?.[index] || null
  }

  /** 拖拽 / 点击移动（支持跨波次） */
  function transfer(from, to) {
    if (!from || !to) return { ok: false, message: '' }

    if (to.kind === 'bench') {
      if (from.kind !== 'slot') return { ok: false, message: '未登场列表里的角色已经在场下' }
      const slot = findWaveSlot(from.waveIndex, from.teamId, from.index)
      if (!slot?.characterId) return { ok: false, message: '该位置没有角色' }
      slot.characterId = null
      slot.outOfRange = false
      return { ok: true, message: '已移到未登场' }
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
      const label = targetSlot.role === 'N' ? '奶位' : 'C 位'
      return { ok: false, message: `${label}只能放${targetSlot.role === 'N' ? '辅助奶' : '输出C'}` }
    }

    const displacedId = targetSlot.characterId
    const isAuto = !state.config[to.teamId] || Boolean(state.config[to.teamId])

    if (from.kind === 'slot') {
      const sourceWave = state.waves[from.waveIndex]
      const movingOut = sourceSlot.characterId
      const isSwap = Boolean(displacedId)
      sourceSlot.characterId = displacedId || null
      targetSlot.characterId = movingOut
      if (from.waveIndex !== to.waveIndex) {
        const conflictSource = duplicatePlayerInWave(sourceWave)
        const conflictTarget = duplicatePlayerInWave(targetWave)
        if (conflictSource || conflictTarget) {
          sourceSlot.characterId = movingOut
          targetSlot.characterId = displacedId || null
          return { ok: false, message: `玩家「${conflictSource || conflictTarget}」在同一波里已经上场了一个角色` }
        }
        refreshWaveFlags(sourceWave)
      }
      refreshWaveFlags(targetWave)
      void isAuto
      return { ok: true, message: isSwap ? '已互换位置' : '已移动' }
    }

    const conflict = duplicatePlayerInWave(targetWave, new Set(displacedId ? [displacedId] : []))
    if (conflict) return { ok: false, message: `玩家「${conflict}」本波已经上场了一个角色` }
    targetSlot.characterId = sourceCharacter.id
    refreshWaveFlags(targetWave)
    return { ok: true, message: `${sourceCharacter.name} 已上场（${waveName(to.waveIndex)}）` }
  }

  /** 手动切换某队单奶 / 双奶 */
  function toggleTeamLayout(waveIndex, teamId) {
    const wave = state.waves[waveIndex]
    if (!wave) return { ok: false, message: '' }
    const isDouble = wave.teams[teamId].filter((s) => s.role === 'N').length >= 2
    rebuildSlots(wave, teamId, isDouble ? 'single' : 'double')
    if (wave.notes) delete wave.notes[teamId]
    return {
      ok: true,
      message: `${TEAMS.find((t) => t.id === teamId)?.name}已切换为${isDouble ? '单奶 1奶3C' : '双奶 2奶2C'}`,
    }
  }

  /** 双奶队里两个奶位互换（常驻 <-> 太阳） */
  function swapHealSlots(waveIndex, teamId) {
    const wave = state.waves[waveIndex]
    if (!wave) return { ok: false, message: '' }
    const heals = wave.teams[teamId].filter((s) => s.role === 'N')
    if (heals.length < 2) return { ok: false, message: '当前不是双奶配置' }
    const [a, b] = heals
    const id = a.characterId
    const out = a.outOfRange
    a.characterId = b.characterId
    a.outOfRange = b.outOfRange
    b.characterId = id
    b.outOfRange = out
    refreshFlags(wave, teamId)
    return { ok: true, message: `${TEAMS.find((t) => t.id === teamId)?.name}两个奶位已互换` }
  }

  return {
    state,
    teams: TEAMS,
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
    bench,
    warnings,
    activeWarnings,
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
    setHealPolicy,
    setRange,
    applySuggestedRanges,
    resetRanges,
    transfer,
    toggleTeamLayout,
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
