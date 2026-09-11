import * as XLSX from 'xlsx'
import { EXPORT_HEADERS, DIFFICULTIES, HEAL_SLOT_LABELS, BENCH_REASON_LABEL, waveName } from '../constants.js'
import { parsePanel, stamp } from './format.js'
import { teamSummary } from './lineup.js'

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

const EXPORT_TYPE_TEXT = { C: 'C', N: 'N' }

function buildRosterSheet(characters) {
  const aoa = [
    EXPORT_HEADERS,
    ...characters.map((c) => [
      c.player,
      c.name,
      EXPORT_TYPE_TEXT[c.type] || 'C',
      c.panel === null || c.panel === undefined ? '' : Number(c.panel),
      c.difficulty,
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 14 }, { wch: 12 }]
  return ws
}

function buildStatsSheet(playerStats) {
  const aoa = [
    ['归属玩家', '角色总数', '输出C', '辅助奶', '普通团', '困难团'],
    ...playerStats.map((p) => [p.player, p.total, p.c, p.n, p.normal, p.hard]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }]
  return ws
}

/**
 * 导出角色登记表并触发浏览器下载
 * @returns {string} 下载的文件名
 */
export function exportCharactersToExcel(characters, playerStats = []) {
  if (!characters.length) {
    throw new Error('还没有登记任何角色，无法导出')
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildRosterSheet(characters), '角色登记')
  if (playerStats.length) {
    XLSX.utils.book_append_sheet(wb, buildStatsSheet(playerStats), '玩家统计')
  }
  const filename = `DNF打团角色登记_${stamp()}.xlsx`
  XLSX.writeFile(wb, filename, { compression: true })
  return filename
}

/* ------------------------------------------------------------------ *
 * 编队（排表）导出
 * ------------------------------------------------------------------ */

function slotPositionLabel(slot, index, layout) {
  if (slot.role === 'C') return '输出C'
  const healCount = layout === '2n2c' ? 2 : 1
  if (healCount >= 2) return HEAL_SLOT_LABELS[index] || '辅助奶'
  return '辅助奶'
}

/**
 * 导出全部波次的编队
 * @param {{waves:Array, teamConfigs:Array, byId:Map, bench:Array, difficulty:string}} payload
 */
export function exportLineupToExcel({ waves, teamConfigs, byId, bench = [], difficulty = '' }) {
  const rows = [['波次', '团本难度', '队伍', '位置', '角色类型', '归属玩家', '角色称呼', '面板数值', '区间状态']]
  const summaryRows = [['波次', '队伍', '上场人数', 'C 合计伤害', 'C 目标下限', 'C 目标上限', '合计状态', '奶均面板', '区间外人数']]

  waves.forEach((wave, waveIndex) => {
    for (const team of teamConfigs) {
      const slots = wave.teams?.[team.id] || []
      slots.forEach((slot, index) => {
        const character = slot.characterId ? byId.get(slot.characterId) : null
        rows.push([
          waveName(waveIndex),
          wave.difficulty,
          team.name,
          slotPositionLabel(slot, index, team.layout),
          character ? character.type : slot.role,
          character ? character.player : '',
          character ? character.name : '（空位）',
          character && character.panel !== null ? Number(character.panel) : '',
          character ? (slot.outOfRange ? '区间外' : '正常') : '空位',
        ])
      })

      const summary = teamSummary(slots, byId, team.cTotalRange)
      summaryRows.push([
        waveName(waveIndex),
        team.name,
        `${summary.filled}/${summary.total}`,
        summary.cTotal,
        summary.cTarget.min === null ? '' : summary.cTarget.min,
        summary.cTarget.max === null ? '' : summary.cTarget.max,
        summary.cTargetReady ? (summary.cUnder ? '低于合计下限' : summary.cOver ? '超出上限（伤害过剩）' : '合计达标') : '未设合计目标',
        summary.nAverage || '',
        summary.outOfRange,
      ])
    }
  })

  const benchRows = [['归属玩家', '角色称呼', '角色类型', '面板数值', '难度类型', '未上场原因']]
  for (const item of bench) {
    benchRows.push([
      item.character.player,
      item.character.name,
      item.character.type,
      item.character.panel === null ? '' : Number(item.character.panel),
      item.character.difficulty,
      BENCH_REASON_LABEL[item.reason] || item.reason,
    ])
  }

  const wb = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = [
    { wch: 8 },
    { wch: 10 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
  ]
  XLSX.utils.book_append_sheet(wb, sheet, '编队')

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, summarySheet, '各队合计')

  if (benchRows.length > 1) {
    const benchSheet = XLSX.utils.aoa_to_sheet(benchRows)
    benchSheet['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, benchSheet, '未上场')
  }

  const filename = `DNF打团编队_${difficulty || '全部'}_${waves.length}波_${stamp()}.xlsx`
  XLSX.writeFile(wb, filename, { compression: true })
  return filename
}

/* ------------------------------------------------------------------ *
 * 导入（兼容旧表头：归属玩家 / 角色名称 / 战力数值 / 类型 / Ban状态）
 * ------------------------------------------------------------------ */

const HEADER_ALIASES = {
  player: ['归属玩家', '玩家id', '玩家', '归属', '所属玩家', '团长', 'id'],
  name: ['角色称呼', '角色名称', '角色名', '角色', '称呼'],
  type: ['角色类型', '类型', '位置', '职业类型'],
  panel: ['面板数值', '面板数据', '战力数值', '面板', '数值', '伤害', '三攻'],
  difficulty: ['难度类型', '难度', '团本难度', '团本类型', 'ban状态', 'ban', 'ban位'],
}

function normalizeHeaderCell(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-()（）:：]/g, '')
}

function matchColumn(headerText) {
  const text = normalizeHeaderCell(headerText)
  if (!text) return null
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizeHeaderCell(alias) === text)) return field
  }
  // 模糊匹配：包含关键字
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.some((alias) => alias.length >= 2 && text.includes(normalizeHeaderCell(alias)))) return field
  }
  return null
}

function mapType(value) {
  const text = normalizeHeaderCell(value)
  if (!text) return 'C'
  if (/^(n|奶|辅助|辅助奶|奶妈|奶爸|buff|buf)/.test(text)) return 'N'
  if (/(奶|辅助|^n$)/.test(text) && !/输出/.test(text)) return 'N'
  return 'C'
}

function mapDifficulty(value) {
  const text = String(value ?? '').trim()
  if (!text) return DIFFICULTIES[0]
  if (text.includes('困难') || /^(hard|h)$/i.test(text)) return '困难团'
  return '普通团'
}

/**
 * 解析本地 xlsx/xls 文件
 * @param {File} file
 * @returns {Promise<{characters: Array, totalRows: number, skipped: number, headerRow: number|null, sheetName: string}>}
 */
export function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('文件读取失败，请重试'))
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const sheetName = wb.SheetNames[0]
        if (!sheetName) throw new Error('Excel 中没有可用的工作表')
        const sheet = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: false })
        resolve(extractCharacters(rows, sheetName))
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export function extractCharacters(rows, sheetName = '') {
  const result = { characters: [], totalRows: 0, skipped: 0, headerRow: null, sheetName }
  if (!rows.length) return result

  // 1) 在前 10 行里找表头
  let headerRowIndex = -1
  let columnMap = null
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const row = rows[i] || []
    const map = {}
    row.forEach((cell, colIndex) => {
      const field = matchColumn(cell)
      if (field && map[field] === undefined) map[field] = colIndex
    })
    if (map.player !== undefined && map.name !== undefined) {
      headerRowIndex = i
      columnMap = map
      break
    }
  }

  // 2) 没识别到表头则按列位置兜底：A 玩家 / B 角色 / C 面板 / D 类型 / E 难度
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

    // 旧文件里 C 列下面还有一堆孤立数字（无玩家/角色），直接跳过
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
