import * as XLSX from 'xlsx'
import {
  BENCH_REASON_LABEL,
  DIFFICULTIES,
  EXPORT_HEADERS,
  HEAL_SLOT_LABELS,
  TEAMS,
  TEAM_LAYOUTS,
  waveName,
} from '../constants.js'
import { parsePanel, stamp } from './format.js'
import { layoutSlots, teamSummary } from './lineup.js'

/** 一个文件里两个 sheet：角色登记 + 排表 */
export const SHEET_ROSTER = '角色登记'
export const SHEET_LINEUP = '排表'

const LINEUP_HEADERS = [
  '波次',
  '团本难度',
  '队伍',
  '位置',
  '角色类型',
  '归属玩家',
  '角色称呼',
  '面板数值',
  '区间状态',
  '备注',
  '队内配置',
  'C单角色下限',
  'C单角色上限',
  'C合计下限',
  'C合计上限',
  '奶下限',
  '奶上限',
]

const UNDEPLOYED_LABEL = '未上场'

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

export function buildRosterSheet(characters) {
  const aoa = [
    EXPORT_HEADERS,
    ...characters.map((c) => [
      c.player,
      c.name,
      c.type || 'C',
      c.panel === null || c.panel === undefined ? '' : Number(c.panel),
      c.difficulty,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 12 }]
  return ws
}

function rangeCell(value) {
  return value === null || value === undefined ? '' : Number(value)
}

export function buildLineupSheet({ waves, teamConfigs, byId, bench = [] }) {
  const aoa = [LINEUP_HEADERS]
  const configOf = (teamId) => teamConfigs.find((t) => t.id === teamId) || {}

  waves.forEach((wave, waveIndex) => {
    for (const team of TEAMS) {
      const config = configOf(team.id)
      const slots = wave.teams?.[team.id] || []
      slots.forEach((slot, index) => {
        const character = slot.characterId ? byId.get(slot.characterId) : null
        const position = slotPositionLabel(slot, index, config.layout)
        // 区间配置只在每队第一行写一次，避免整张表都是重复数值
        const first = index === 0
        aoa.push([
          waveName(waveIndex),
          wave.difficulty,
          team.name,
          position,
          character ? character.type : slot.role,
          character ? character.player : '',
          character ? character.name : '（空位）',
          character && character.panel !== null ? Number(character.panel) : '',
          character ? (slot.outOfRange ? '区间外' : '正常') : '空位',
          '',
          first ? layoutLabel(config.layout) : '',
          first ? rangeCell(config.cRange?.min) : '',
          first ? rangeCell(config.cRange?.max) : '',
          first ? rangeCell(config.cTotalRange?.min) : '',
          first ? rangeCell(config.cTotalRange?.max) : '',
          first ? rangeCell(config.nRange?.min) : '',
          first ? rangeCell(config.nRange?.max) : '',
        ])
      })
    }
  })

  // 未上场的角色也列在同一个 sheet 末尾，方便对照
  if (bench.length) {
    aoa.push([])
    for (const item of bench) {
      aoa.push([
        UNDEPLOYED_LABEL,
        item.character.difficulty,
        '',
        '',
        item.character.type,
        item.character.player,
        item.character.name,
        item.character.panel === null ? '' : Number(item.character.panel),
        UNDEPLOYED_LABEL,
        BENCH_REASON_LABEL[item.reason] || item.reason,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
      ])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
  ]
  return ws
}

function slotPositionLabel(slot, index, layout) {
  if (slot.role === 'C') return '输出C'
  const meta = TEAM_LAYOUTS.find((l) => l.value === layout) || TEAM_LAYOUTS[0]
  if (meta.healSlots >= 2) return HEAL_SLOT_LABELS[index] || '辅助奶'
  return '辅助奶'
}

function layoutLabel(layout) {
  const meta = TEAM_LAYOUTS.find((l) => l.value === layout) || TEAM_LAYOUTS[0]
  return `${meta.label}（${meta.short}）`
}

/**
 * 导出「角色登记 + 排表」到同一个 Excel 文件（两个 sheet）并触发下载
 * @returns {string} 文件名
 */
export function exportAllToExcel({ characters, waves = [], teamConfigs = [], byId = new Map(), bench = [] }) {
  if (!characters.length && !waves.length) {
    throw new Error('还没有任何数据，无法导出')
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildRosterSheet(characters), SHEET_ROSTER)
  XLSX.utils.book_append_sheet(
    wb,
    buildLineupSheet({ waves, teamConfigs, byId, bench }),
    SHEET_LINEUP,
  )
  const filename = `DNF打团排表_${stamp()}.xlsx`
  XLSX.writeFile(wb, filename, { compression: true })
  return filename
}

/* ------------------------------------------------------------------ *
 * 导入
 * ------------------------------------------------------------------ */

const HEADER_ALIASES = {
  player: ['归属玩家', '玩家id', '玩家', '归属', '所属玩家', '团长', 'id'],
  name: ['角色称呼', '角色名称', '角色名', '角色', '称呼'],
  type: ['角色类型', '类型', '位置', '职业类型'],
  panel: ['面板数值', '面板数据', '战力数值', '面板', '数值', '伤害', '三攻'],
  difficulty: ['难度类型', '难度', '团本难度', '团本类型', 'ban状态', 'ban', 'ban位'],
}

const LINEUP_ALIASES = {
  wave: ['波次', '波', '场次'],
  difficulty: ['团本难度', '难度', '难度类型'],
  team: ['队伍', '队'],
  position: ['位置', '位'],
  type: ['角色类型', '类型'],
  player: ['归属玩家', '玩家'],
  name: ['角色称呼', '角色名称', '角色'],
  panel: ['面板数值', '面板数据', '数值'],
  state: ['区间状态', '状态'],
  remark: ['备注', '原因', '未上场原因'],
  layout: ['队内配置', '配置'],
  cMin: ['c单角色下限', 'C单角色下限'],
  cMax: ['c单角色上限', 'C单角色上限'],
  totalMin: ['c合计下限', 'C合计下限'],
  totalMax: ['c合计上限', 'C合计上限'],
  nMin: ['奶下限'],
  nMax: ['奶上限'],
}

function normalizeHeaderCell(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）:：]/g, '')
}

function matchColumn(headerText, aliases) {
  const cell = normalizeHeaderCell(headerText)
  if (!cell) return null
  for (const [field, list] of Object.entries(aliases)) {
    if (list.some((alias) => normalizeHeaderCell(alias) === cell)) return field
  }
  for (const [field, list] of Object.entries(aliases)) {
    if (list.some((alias) => alias.length >= 2 && cell.includes(normalizeHeaderCell(alias)))) return field
  }
  return null
}

function mapType(value) {
  const text = normalizeHeaderCell(value)
  if (!text) return 'C'
  if (/^(n|奶|辅助|辅助奶|奶妈|奶爸|buff|buf)/.test(text)) return 'N'
  if (/(奶|辅助)/.test(text) && !/输出/.test(text)) return 'N'
  return 'C'
}

function mapDifficulty(value) {
  const text = String(value ?? '').trim()
  if (!text) return DIFFICULTIES[0]
  if (text.includes('困难') || /^(hard|h)$/i.test(text)) return '困难团'
  return '普通团'
}

function mapTeamId(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const found = TEAMS.find((t) => text.includes(t.name))
  return found ? found.id : null
}

function mapLayout(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  if (text.includes('双奶') || normalizeHeaderCell(text).includes('2n2c') || text.includes('2奶')) return '2n2c'
  if (text.includes('单奶') || normalizeHeaderCell(text).includes('1n3c') || text.includes('1奶')) return '1n3c'
  return null
}

/** 字符串里的波次序号（第一波 / 第1波 / 1） */
function waveSortKey(label) {
  const text = String(label ?? '').trim()
  const digits = text.match(/\d+/)
  if (digits) return Number(digits[0])
  const cn = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
  const m = text.match(/十([一二三四五六七八九])?/)
  if (m) return 10 + (m[1] ? cn[m[1]] : 0)
  const single = text.match(/[一二三四五六七八九]/)
  if (single) return cn[single[0]]
  return Number.MAX_SAFE_INTEGER
}

/**
 * 解析 sheet1「角色登记」（兼容旧案例表头）
 */
export function extractCharacters(rows, sheetName = '') {
  const result = { characters: [], totalRows: 0, skipped: 0, headerRow: null, sheetName }
  if (!rows.length) return result

  let headerRowIndex = -1
  let columnMap = null
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i] || []
    const map = {}
    row.forEach((cell, colIndex) => {
      const field = matchColumn(cell, HEADER_ALIASES)
      if (field && map[field] === undefined) map[field] = colIndex
    })
    if (map.player !== undefined && map.name !== undefined) {
      headerRowIndex = i
      columnMap = map
      break
    }
  }

  if (headerRowIndex === -1) {
    headerRowIndex = -1
    columnMap = { player: 0, name: 1, panel: 2, type: 3, difficulty: 4 }
  }
  result.headerRow = headerRowIndex === -1 ? null : headerRowIndex + 1

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || []
    const cellAt = (field) => (columnMap[field] === undefined ? null : row[columnMap[field]])
    const player = String(cellAt('player') ?? '').trim()
    const name = String(cellAt('name') ?? '').trim()
    if (!player || !name) {
      if (row.some((v) => v !== null && String(v).trim() !== '')) result.skipped += 1
      continue
    }
    result.totalRows += 1
    result.characters.push({
      player,
      name,
      type: mapType(cellAt('type')),
      panel: parsePanel(cellAt('panel')),
      difficulty: mapDifficulty(cellAt('difficulty')),
      createdAt: Date.now() + result.characters.length,
    })
  }
  return result
}

/**
 * 解析 sheet2「排表」
 * @returns {{waves: Array, config: Object|null, unmatched: number, undeployed: number}}
 */
export function extractLineup(rows, teamLayouts = {}) {
  const empty = { waves: [], config: null, unmatched: 0, undeployed: 0 }
  if (!rows.length) return empty

  let headerRowIndex = -1
  let columnMap = null
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i] || []
    const map = {}
    row.forEach((cell, colIndex) => {
      const field = matchColumn(cell, LINEUP_ALIASES)
      if (field && map[field] === undefined) map[field] = colIndex
    })
    if (map.wave !== undefined && (map.team !== undefined || map.name !== undefined)) {
      headerRowIndex = i
      columnMap = map
      break
    }
  }
  if (headerRowIndex === -1) return empty

  const waves = new Map()
  const config = {
    red: { layout: null, cRange: { min: null, max: null }, cTotalRange: { min: null, max: null }, nRange: { min: null, max: null } },
    yellow: { layout: null, cRange: { min: null, max: null }, cTotalRange: { min: null, max: null }, nRange: { min: null, max: null } },
    green: { layout: null, cRange: { min: null, max: null }, cTotalRange: { min: null, max: null }, nRange: { min: null, max: null } },
  }
  let unmatched = 0
  let undeployed = 0

  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || []
    if (!row.some((v) => v !== null && String(v).trim() !== '')) continue
    const cellAt = (field) => (columnMap[field] === undefined ? null : row[columnMap[field]])
    const waveLabel = String(cellAt('wave') ?? '').trim()
    if (!waveLabel) continue
    if (waveLabel.includes(UNDEPLOYED_LABEL) || waveLabel.includes('未登场')) {
      undeployed += 1
      continue
    }
    const teamId = mapTeamId(cellAt('team'))
    if (!teamId) continue

    const key = waveSortKey(waveLabel)
    if (!waves.has(key)) {
      waves.set(key, { key, difficulty: mapDifficulty(cellAt('difficulty')), teams: {} })
    }
    const wave = waves.get(key)
    const difficultyText = String(cellAt('difficulty') ?? '').trim()
    if (difficultyText) wave.difficulty = mapDifficulty(difficultyText)

    if (!wave.teams[teamId]) wave.teams[teamId] = []
    const typeText = `${cellAt('position') ?? ''}${cellAt('type') ?? ''}`
    const role = /奶|辅助|^n$/i.test(String(typeText).replace(/\s/g, '')) ? 'N' : 'C'
    const player = String(cellAt('player') ?? '').trim()
    const name = String(cellAt('name') ?? '').trim()
    wave.teams[teamId].push({ role, player, name })

    // 区间配置（每队第一行才有值）
    const layoutValue = mapLayout(cellAt('layout'))
    const target = config[teamId]
    if (layoutValue) target.layout = layoutValue
    const setRange = (field, bound, key2) => {
      const raw = cellAt(field)
      if (raw === null || raw === undefined || String(raw).trim() === '') return
      const num = Number(raw)
      if (Number.isFinite(num)) target[key2][bound] = num
    }
    setRange('cMin', 'min', 'cRange')
    setRange('cMax', 'max', 'cRange')
    setRange('totalMin', 'min', 'cTotalRange')
    setRange('totalMax', 'max', 'cTotalRange')
    setRange('nMin', 'min', 'nRange')
    setRange('nMax', 'max', 'nRange')
  }

  const result = [...waves.values()]
    .sort((a, b) => a.key - b.key)
    .map((wave) => {
      const teams = {}
      for (const team of TEAMS) {
        const entries = wave.teams[team.id] || []
        const healCount = entries.filter((e) => e.role === 'N').length
        // 槽位模板优先用配置里的队内配置，其次按实际奶位数推断
        const layout = config[team.id].layout || (healCount >= 2 ? '2n2c' : teamLayouts[team.id] || '1n3c')
        if (!config[team.id].layout) config[team.id].layout = layout
        const template = layoutSlots(layout)
        const slots = template.map((s, index) => {
          const sameRole = entries.filter((e) => e.role === s.role)
          const roleIndex = template.slice(0, index).filter((x) => x.role === s.role).length
          const entry = sameRole[roleIndex]
          return { role: s.role, characterId: null, outOfRange: false, player: entry?.player || '', name: entry?.name || '' }
        })
        teams[team.id] = slots
      }
      return { difficulty: wave.difficulty, teams }
    })

  // 完全没有配置信息就不用覆盖现有配置
  const hasConfig = TEAMS.some((t) => config[t.id].layout || config[t.id].cRange.min !== null || config[t.id].nRange.min !== null || config[t.id].cTotalRange.min !== null)
  return { waves: result, config: hasConfig ? config : null, unmatched, undeployed }
}

/** 判断一行是不是表头（用于挑选 sheet） */
function sheetLooksLikeLineup(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i] || []
    const map = {}
    row.forEach((cell) => {
      const field = matchColumn(cell, LINEUP_ALIASES)
      if (field) map[field] = true
    })
    if (map.wave && (map.team || map.position)) return true
  }
  return false
}

function sheetLooksLikeRoster(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i] || []
    const map = {}
    row.forEach((cell) => {
      const field = matchColumn(cell, HEADER_ALIASES)
      if (field) map[field] = true
    })
    if (map.player && map.name) return true
  }
  return false
}

/**
 * 解析上传的 Excel：自动识别「角色登记」与「排表」两个 sheet
 * @returns {Promise<{roster: object|null, lineup: object|null, sheetNames: string[]}>}
 */
export function parseWorkbookFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败，请重试'))
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const sheets = wb.SheetNames.map((sheetName) => {
          const sheet = wb.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false })
          return { sheetName, rows }
        })
        if (!sheets.length) throw new Error('Excel 中没有可用的工作表')

        let rosterSheet = sheets.find((s) => s.sheetName.includes('角色') || s.sheetName.includes('登记'))
        let lineupSheet = sheets.find((s) => s.sheetName.includes('排表') || s.sheetName.includes('编队'))

        if (!rosterSheet) rosterSheet = sheets.find((s) => sheetLooksLikeRoster(s.rows) && !sheetLooksLikeLineup(s.rows))
        if (!lineupSheet) lineupSheet = sheets.find((s) => sheetLooksLikeLineup(s.rows))
        if (!rosterSheet && sheets[0]) rosterSheet = sheets[0]
        if (!lineupSheet && sheets[1]) lineupSheet = sheets[1]

        const roster = rosterSheet ? extractCharacters(rosterSheet.rows, rosterSheet.sheetName) : null
        const lineup = lineupSheet ? extractLineup(lineupSheet.rows) : null
        resolve({
          roster: roster && roster.characters.length ? roster : null,
          lineup: lineup && lineup.waves.length ? lineup : null,
          sheetNames: wb.SheetNames,
        })
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export { teamSummary }

