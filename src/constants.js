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

/** 队伍配置：单奶（1奶3C）/ 双奶（2奶2C，一常驻 buff 奶 + 一太阳奶） */
export const TEAM_LAYOUTS = [
  {
    value: '1n3c',
    label: '单奶配置',
    short: '1奶3C',
    healSlots: 1,
    cSlots: 3,
    desc: '1 个辅助奶 + 3 个输出C',
  },
  {
    value: '2n2c',
    label: '双奶配置',
    short: '2奶2C',
    healSlots: 2,
    cSlots: 2,
    desc: '2 个辅助奶（常驻 buff 奶 + 太阳奶）+ 2 个输出C',
  },
]

/** 双奶时两个奶位的语义（顺序与槽位一致，面板高的自动放常驻位） */
export const HEAL_SLOT_LABELS = ['常驻奶', '太阳奶']

export const STORAGE_KEY_LINEUP = 'dnf-raid-lineup-v1'

/** 排序/视图选项：编队候选列表 */
export const BENCH_REASON_LABEL = {
  'player-conflict': '同玩家已上场',
  'not-selected': '未入选',
  'difficulty-mismatch': '难度不符',
}

export function typeMeta(value) {
  return CHAR_TYPES.find((t) => t.value === value) || CHAR_TYPES[0]
}

export function typeLabel(value) {
  const meta = CHAR_TYPES.find((t) => t.value === value)
  return meta ? meta.label : String(value ?? '')
}
