import { reactive, computed } from 'vue'
import { useCharacters } from './useCharacters.js'
import { useLineup } from './useLineup.js'
import { useToast } from './useToast.js'
import { exportAllToExcel, parseWorkbookFile } from '../utils/excel.js'

/**
 * 统一的 Excel 导入 / 导出：
 *   一个文件两个 sheet —— 「角色登记」+「排表」，导入时两个都读，导出时两个都写
 */
const modal = reactive({
  open: false,
  fileName: '',
  roster: [],
  lineup: null,
  skipped: 0,
  unmatched: 0,
  skipDuplicate: false,
})

export function useDataTransfer() {
  const { characters, playerStats, appendMany, replaceAll: replaceCharacters } = useCharacters()
  const lineup = useLineup()
  const { toast } = useToast()

  const hasExistingData = computed(
    () => characters.value.length > 0 || lineup.overallStats.value.used > 0,
  )

  /** 把排表里的「玩家+角色称呼」对应回已登记的角色 id */
  function bindLineup(parsed) {
    if (!parsed?.waves) return null
    // 同一个玩家可能有多个同名角色，所以每个 key 存一组 id，按出现顺序依次绑定
    const byKey = new Map()
    for (const character of characters.value) {
      const key = `${character.player}|${character.name}`.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, [])
      byKey.get(key).push(character.id)
    }
    const takeId = (key) => {
      const list = byKey.get(key)
      if (!list || !list.length) return null
      return list.shift()
    }
    let unmatched = 0
    const waves = parsed.waves.map((wave) => {
      const teams = {}
      for (const [teamId, slots] of Object.entries(wave.teams)) {
        teams[teamId] = slots.map((slot) => {
          if (!slot.player || !slot.name) return { role: slot.role, characterId: null, outOfRange: false }
          const id = takeId(`${slot.player}|${slot.name}`.toLowerCase())
          if (!id) {
            unmatched += 1
            return { role: slot.role, characterId: null, outOfRange: false, missing: `${slot.player}·${slot.name}` }
          }
          return { role: slot.role, characterId: id, outOfRange: false }
        })
      }
      return { difficulty: wave.difficulty, teams }
    })
    return { waves, unmatched }
  }

  async function pickAndParse(file) {
    try {
      const parsed = await parseWorkbookFile(file)
      if (!parsed.roster && !parsed.lineup) {
        toast('没有识别到「角色登记」或「排表」工作表，请确认文件格式', 'error')
        return
      }
      if (!hasExistingData.value) {
        // 空库直接导入，不用问
        applyParsed(parsed, 'replace')
        return
      }
      modal.open = true
      modal.fileName = file.name
      modal.roster = parsed.roster?.characters || []
      modal.lineup = parsed.lineup || null
      modal.skipped = parsed.roster?.skipped || 0
      modal.skipDuplicate = false
      modal.unmatched = 0
    } catch (err) {
      console.error(err)
      toast(`导入失败：${err.message || err}`, 'error')
    }
  }

  function applyParsed(parsed, mode) {
    const rosterRows = parsed.roster?.characters || []
    const lineupParsed = parsed.lineup || null
    let added = 0
    let duplicated = 0

    if (rosterRows.length) {
      if (mode === 'replace') {
        replaceCharacters(rosterRows)
        added = rosterRows.length
      } else {
        const result = appendMany(rosterRows, { skipDuplicate: modal.skipDuplicate })
        added = result.added
        duplicated = result.duplicated
      }
    }

    let waves = 0
    let unmatched = 0
    if (lineupParsed) {
      const bound = bindLineup(lineupParsed)
      if (bound) {
        lineup.replaceAll({ waves: bound.waves, config: lineupParsed.config })
        waves = bound.waves.length
        unmatched = bound.unmatched
      }
    }

    toast(
      `导入完成：角色 ${added} 个${duplicated ? `（跳过重复 ${duplicated}）` : ''}` +
        (waves ? ` · 排表 ${waves} 波` : '') +
        (unmatched ? ` · ${unmatched} 个角色在登记表里找不到` : ''),
      unmatched ? 'warn' : 'success',
      4200,
    )
  }

  function apply(mode) {
    const parsed = { roster: { characters: modal.roster }, lineup: modal.lineup }
    applyParsed(parsed, mode)
    modal.open = false
  }

  function cancel() {
    modal.open = false
  }

  /** 导出「角色登记 + 排表」同一个文件 */
  function exportFile(override = {}) {
    return exportAllToExcel({
      characters: characters.value,
      waves: lineup.state.waves,
      teamConfigs: lineup.teamConfigs.value,
      byId: lineup.byId.value,
      bench: lineup.bench.value,
      ...override,
    })
  }

  function download(override = {}) {
    try {
      const name = exportFile(override)
      toast(`已导出 Excel（角色登记 + 排表）：${name}`, 'success', 3600)
      return name
    } catch (err) {
      toast(err.message || '导出失败', 'error')
      return null
    }
  }

  return {
    modal,
    characters,
    playerStats,
    hasExistingData,
    pickAndParse,
    apply,
    cancel,
    exportFile,
    download,
  }
}
