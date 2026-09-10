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

export function typeMeta(value) {
  return CHAR_TYPES.find((t) => t.value === value) || CHAR_TYPES[0]
}

export function typeLabel(value) {
  const meta = CHAR_TYPES.find((t) => t.value === value)
  return meta ? meta.label : String(value ?? '')
}
