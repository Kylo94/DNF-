/**
 * 全局常量 / 枚举定义
 * 与 Excel 表头保持一致，改这里即可全站生效
 */

/** 角色类型：Excel 内写 C / N，界面显示中文 */
export const CHAR_TYPES = [
  {
    value: 'C',
    label: '输出C',
    short: 'C',
    panelLabel: '站街模拟伤害',
    panelUnit: '',
    panelPlaceholder: '例如 5500',
    panelTip: '填写修炼道场/站街模拟伤害数值',
  },
  {
    value: 'N',
    label: '辅助奶',
    short: 'N',
    panelLabel: '面板三攻',
    panelUnit: '',
    panelPlaceholder: '例如 44700',
    panelTip: '填写奶的面板三攻数值（力智/三攻面板）',
  },
]

/** 团本难度 */
export const DIFFICULTIES = ['普通团', '困难团']

/** 导出 Excel 的表头顺序 */
export const EXPORT_HEADERS = ['归属玩家', '角色称呼', '角色类型', '面板数值', '难度类型']

/** 登记表可选列（后续排表功能会用到，先预留） */
export const SORT_OPTIONS = [
  { value: 'created', label: '按登记顺序' },
  { value: 'player', label: '按玩家归组' },
  { value: 'panel-desc', label: '按面板从高到低' },
  { value: 'panel-asc', label: '按面板从低到高' },
]

export const STORAGE_KEY = 'dnf-raid-roster-v1'

/* ------------------------------------------------------------------ *
 * 编队（排表）
 * ------------------------------------------------------------------ */

/** 一波团本固定 12 人，分三个队伍 */
export const RAID_SIZE = 12

/** 三个队伍：红 / 黄 / 绿 */
export const TEAMS = [
  { id: 'red', name: '红队', color: '#f87171', soft: 'rgba(248, 113, 113, 0.14)' },
  { id: 'yellow', name: '黄队', color: '#f0c674', soft: 'rgba(240, 198, 116, 0.14)' },
  { id: 'green', name: '绿队', color: '#4ade80', soft: 'rgba(74, 222, 128, 0.14)' },
]

/** 队伍里的位置定义：每队 5 个可配置位置，实际每波上 4 人 */
export const SLOT_DEFS = [
  { key: 'heal1', role: 'N', label: '常驻奶', short: '常', desc: '常驻 buff 奶：增益量要大' },
  { key: 'heal2', role: 'N', label: '太阳奶', short: '太', desc: '小奶：能放太阳（觉醒）即可，伤害够了才会自动补上' },
  { key: 'c1', role: 'C', label: 'C位1', short: 'C1', desc: '主力输出位' },
  { key: 'c2', role: 'C', label: 'C位2', short: 'C2', desc: '次主力输出位' },
  { key: 'c3', role: 'C', label: 'C位3', short: 'C3', desc: '第三输出位（伤害已经够了时会被太阳奶顶替）' },
]

export const SLOT_KEYS = SLOT_DEFS.map((d) => d.key)

/** 每波的槽位模板 */
export const SLOT_TEMPLATES = {
  single: ['heal1', 'c1', 'c2', 'c3'],
  double: ['heal1', 'heal2', 'c1', 'c2'],
}

/** 双奶策略 */
export const HEAL_POLICIES = [
  { value: 'auto', label: '允许双奶', short: '允许双奶', desc: 'C位1+C位2 已到位且合计达到目标时，第 4 位自动补太阳奶' },
  { value: 'single', label: '只用单奶', short: '只用单奶', desc: '固定 1奶3C，第 4 位永远放 C位3' },
  { value: 'double', label: '固定双奶', short: '固定双奶', desc: '固定 2奶2C，不上 C位3' },
]

export const STORAGE_KEY_LINEUP = 'dnf-raid-lineup-v3'
/** 旧版编队数据结构，用于自动迁移 */
export const STORAGE_KEY_LINEUP_V1 = 'dnf-raid-lineup-v1'
export const STORAGE_KEY_LINEUP_V2 = 'dnf-raid-lineup-v2'

/** 一波最多排多少波（防止数据异常时爆掉） */
export const MAX_WAVES = 30

/** 波次名称：第一波、第二波…… */
export function waveName(index) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  const n = index + 1
  if (n <= 10) return `第${n === 10 ? '十' : digits[n]}波`
  if (n < 20) return `第十${digits[n - 10]}波`
  if (n === 20) return '第二十波'
  return `第${digits[Math.floor(n / 10)]}十${n % 10 ? digits[n % 10] : ''}波`
}

/** 排序/视图选项：编队候选列表 */
export const BENCH_REASON_LABEL = {
  'player-conflict': '该玩家每波都已上场',
  'not-selected': '未入选',
  'used-other-wave': '已在其他波上场',
  'difficulty-mismatch': '难度不符',
}

export function typeMeta(value) {
  return CHAR_TYPES.find((t) => t.value === value) || CHAR_TYPES[0]
}

export function typeLabel(value) {
  const meta = CHAR_TYPES.find((t) => t.value === value)
  return meta ? meta.label : String(value ?? '')
}
