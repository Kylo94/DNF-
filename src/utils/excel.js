import * as XLSX from 'xlsx'
import { BENCH_REASON_LABEL, DIFFICULTIES, EXPORT_HEADERS, SLOT_DEFS, TEAMS, waveName } from '../constants.js'
import { parsePanel, stamp } from './format.js'
import { layoutSlots, slotLabel, teamSummary } from './lineup.js'

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
  '双奶策略',
  ...SLOT_DEFS.map((d) => d.label),
  '伤害目标',
]

/** 区间 -> "下限~上限"，空表示不限 */
function rangeText(range) {
  if (!range || (range.min === null && range.max === null)) return '不限'
  const left = range.min === null || range.min === undefined ? '' : Number(range.min)
  const right = range.max === null || range.max === undefined ? '' : Number(range.max)
  return `${left}~${right}`
}

/** "下限~上限" -> { min, max } */
function parseRangeText(text) {
  const value = String(text ?? '').trim()
  if (!value || value === '不限' || value === '-') return { min: null, max: null }
  const [left, right] = value.split('~')
  const toNumber = (t) => {
    const text2 = String(t ?? '').trim()
    if (!text2) return null
    const num = Number(text2)
    return Number.isFinite(num) ? num : null
  }
  return { min: toNumber(left), max: right === undefined ? null : toNumber(right) }
}

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

export function buildLineupSheet({ waves, teamConfigs, byId, bench = [] }) {
  const aoa = [LINEUP_HEADERS]
  const configOf = (teamId) => teamConfigs.find((t) => t.id === teamId) || {}

  waves.forEach((wave, waveIndex) => {
    for (const team of TEAMS) {
      const config = configOf(team.id)
      const slots = wave.teams?.[team.id] || []
      slots.forEach((slot, index) => {
        const character = slot.characterId ? byId.get(slot.characterId) : null
        // 区间配置只在每队第一行写一次，避免整张表都是重复数值
        const first = index === 0
        const configCells = first
          ? [
              policyLabel(config.healPolicy),
              ...SLOT_DEFS.map((d) => rangeText(config.ranges?.[d.key])),
              rangeText(config.total),
            ]
          : new Array(SLOT_DEFS.length + 2).fill('')
        aoa.push([
          waveName(waveIndex),
          wave.difficulty,
          team.name,
          slotLabel(slot.key),
          character ? character.type : slot.role,
          character ? character.player : '',
          character ? character.name : '（空位）',
          character && character.panel !== null ? Number(character.panel) : '',
          character ? (slot.outOfRange ? '区间外' : '正常') : '空位',
          '',
          ...configCells,
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
    ...SLOT_DEFS.map(() => ({ wch: 16 })),
    { wch: 16 },
  ]
  return ws
}

function policyLabel(policy) {
  if (policy === 'single') return '只用单奶'
  if (policy === 'double') return '固定双奶'
  return '允许双奶'
}

function parsePolicy(text) {
  const value = String(text ?? '')
  if (value.includes('只用单奶') || value.includes('单奶')) return 'single'
  if (value.includes('固定双奶')) return 'double'
  if (value.includes('允许双奶') || value.includes('自动')) return 'auto'
  return undefined
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
  policy: ['双奶策略', '队内配置', '配置'],
  heal1: ['常驻奶'],
  heal2: ['太阳奶'],
  c1: ['c位1', 'C位1'],
  c2: ['c位2', 'C位2'],
  c3: ['c位3', 'C位3'],
  total: ['伤害目标', 'c合计伤害', 'C合计伤害'],
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
  if (!text) return undefined
  if (text.includes('跟随全局') || text.includes('全局')) return null
  if (text.includes('自动')) return 'auto'
  if (text.includes('双奶') || normalizeHeaderCell(text).includes('2n2c') || text.includes('2奶')) return '2n2c'
  if (text.includes('单奶') || normalizeHeaderCell(text).includes('1n3c') || text.includes('1奶')) return '1n3c'
  return undefined
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
  const emptyRange = () => ({ min: null, max: null })
  const config = Object.fromEntries(
    TEAMS.map((t) => [
      t.id,
      {
        healPolicy: undefined,
        ranges: Object.fromEntries(['heal1', 'heal2', 'c1', 'c2', 'c3'].map((k) => [k, emptyRange()])),
        total: emptyRange(),
      },
    ]),
  )
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

    // 位置区间配置（每队第一行才有值）
    const policyValue = parsePolicy(cellAt('policy'))
    const target = config[teamId]
    if (policyValue) target.healPolicy = policyValue
    for (const key of ['heal1', 'heal2', 'c1', 'c2', 'c3']) {
      const cell = cellAt(key)
      if (cell === null || cell === undefined || String(cell).trim() === '') continue
      target.ranges[key] = parseRangeText(cell)
    }
    const totalCell = cellAt('total')
    if (totalCell !== null && totalCell !== undefined && String(totalCell).trim() !== '') {
      target.total = parseRangeText(totalCell)
    }
  }

  const result = [...waves.values()]
    .sort((a, b) => a.key - b.key)
    .map((wave) => {
      const teams = {}
      for (const team of TEAMS) {
        const entries = wave.teams[team.id] || []
        const healRows = entries.filter((e) => e.role === 'N').length
        // 槽位模板按表里实际写出的位置还原（自动双奶的波次也是 2奶2C，不会丢人）
        const rowLayout = healRows >= 2 ? 'double' : healRows === 1 ? 'single' : null
        const configured = config[team.id].healPolicy
        const layout = rowLayout || (configured === 'double' ? 'double' : 'single')
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
  const hasConfig = TEAMS.some(
    (t) =>
      Boolean(config[t.id].healPolicy) ||
      ['heal1', 'heal2', 'c1', 'c2', 'c3'].some(
        (k) => config[t.id].ranges[k].min !== null || config[t.id].ranges[k].max !== null,
      ) ||
      config[t.id].total.min !== null ||
      config[t.id].total.max !== null,
  )
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
    reader.onerror = () => {
      console.warn('读取文件失败：', reader.error, file?.name, file?.size)
      reject(new Error('文件读取失败，请重试'))
    }
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

