import { reactive, computed, watch } from 'vue'
import { STORAGE_KEY, typeLabel } from '../constants.js'
import { uid } from '../utils/format.js'

/** 一个角色登记的规范化结构 */
export function normalizeCharacter(raw) {
  return {
    id: raw.id || uid(),
    player: String(raw.player ?? '').trim(),
    name: String(raw.name ?? '').trim(),
    type: raw.type === 'N' ? 'N' : 'C',
    panel: Number.isFinite(Number(raw.panel)) ? Number(raw.panel) : null,
    difficulty: raw.difficulty === '困难团' ? '困难团' : '普通团',
    createdAt: Number(raw.createdAt) || Date.now(),
  }
}

function loadFromStorage() {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (!text) return []
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeCharacter)
  } catch (err) {
    console.warn('本地数据读取失败，已忽略：', err)
    return []
  }
}

const state = reactive({
  characters: loadFromStorage(),
})

/** 全局单例 store：登记数据 + 常用派生数据 */
export function useCharacters() {
  const characters = computed(() => state.characters)

  /** 已登记的玩家名（用于下拉联想），按角色数从多到少 */
  const players = computed(() => {
    const counter = new Map()
    for (const c of state.characters) {
      counter.set(c.player, (counter.get(c.player) || 0) + 1)
    }
    return [...counter.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([name, count]) => ({ name, count }))
  })

  /** 总览统计 */
  const stats = computed(() => {
    const list = state.characters
    return {
      total: list.length,
      cCount: list.filter((c) => c.type === 'C').length,
      nCount: list.filter((c) => c.type === 'N').length,
      normal: list.filter((c) => c.difficulty === '普通团').length,
      hard: list.filter((c) => c.difficulty === '困难团').length,
      playerCount: new Set(list.map((c) => c.player)).size,
    }
  })

  /** 按玩家维度的统计（导出统计页 / 面板展示共用） */
  const playerStats = computed(() => {
    const map = new Map()
    for (const c of state.characters) {
      if (!map.has(c.player)) {
        map.set(c.player, {
          player: c.player,
          total: 0,
          c: 0,
          n: 0,
          normal: 0,
          hard: 0,
        })
      }
      const row = map.get(c.player)
      row.total += 1
      if (c.type === 'C') row.c += 1
      else row.n += 1
      if (c.difficulty === '困难团') row.hard += 1
      else row.normal += 1
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.player.localeCompare(b.player, 'zh-CN'))
  })

  /** 同名角色（同一玩家下的角色称呼）查找 */
  function findDuplicate(player, name, exceptId = null) {
    const key = `${player}|${name}`.toLowerCase()
    return state.characters.find(
      (c) => c.id !== exceptId && `${c.player}|${c.name}`.toLowerCase() === key,
    )
  }

  function addCharacter(payload) {
    const row = normalizeCharacter({ ...payload, createdAt: Date.now() })
    state.characters.push(row)
    return row
  }

  function updateCharacter(id, payload) {
    const index = state.characters.findIndex((c) => c.id === id)
    if (index === -1) return null
    const merged = normalizeCharacter({ ...state.characters[index], ...payload, id })
    state.characters.splice(index, 1, merged)
    return merged
  }

  function removeCharacter(id) {
    const index = state.characters.findIndex((c) => c.id === id)
    if (index === -1) return false
    state.characters.splice(index, 1)
    return true
  }

  function replaceAll(list) {
    state.characters.splice(0, state.characters.length, ...list.map(normalizeCharacter))
  }

  function clearAll() {
    state.characters.splice(0, state.characters.length)
  }

  /** 导入时追加，返回实际新增数量 */
  function appendMany(list, { skipDuplicate = true } = {}) {
    let added = 0
    let duplicated = 0
    for (const raw of list) {
      const row = normalizeCharacter(raw)
      if (!row.player || !row.name) continue
      if (skipDuplicate && findDuplicate(row.player, row.name)) {
        duplicated += 1
        continue
      }
      state.characters.push(row)
      added += 1
    }
    return { added, duplicated }
  }

  /** 供后续排表功能使用的分组视图：难度 -> 类型 -> 角色列表 */
  const grouped = computed(() => {
    const result = { 普通团: { C: [], N: [] }, 困难团: { C: [], N: [] } }
    for (const c of state.characters) {
      result[c.difficulty][c.type].push(c)
    }
    return result
  })

  return {
    characters,
    players,
    stats,
    playerStats,
    grouped,
    findDuplicate,
    addCharacter,
    updateCharacter,
    removeCharacter,
    replaceAll,
    appendMany,
    clearAll,
  }
}

/** 自动持久化到 localStorage（任何改动都会写入） */
watch(
  () => state.characters,
  (list) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    } catch (err) {
      console.warn('本地保存失败：', err)
    }
  },
  { deep: true },
)

export { typeLabel }
