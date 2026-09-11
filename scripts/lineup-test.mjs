/**
 * 编队算法单元测试（纯 Node，不需要浏览器）
 *   node scripts/lineup-test.mjs
 */
import {
  autoAssign,
  computeBench,
  layoutSlots,
  suggestRanges,
  teamSummary,
  validateLineup,
} from '../src/utils/lineup.js'
import { TEAMS } from '../src/constants.js'

let pass = 0
const failures = []

function ok(name, condition, extra = '') {
  if (condition) {
    pass += 1
    console.log(`✅  ${name}${extra ? `  → ${extra}` : ''}`)
  } else {
    failures.push(name)
    console.log(`❌  ${name}${extra ? `  → ${extra}` : ''}`)
  }
}

const ch = (id, player, name, type, panel, difficulty = '普通团') => ({
  id,
  player,
  name,
  type,
  panel,
  difficulty,
  createdAt: 0,
})

const range = (min, max = null) => ({ min, max })

function makeConfig({ globalLayout = '1n3c', ranges = {}, layouts = {} } = {}) {
  return {
    globalLayout,
    teams: TEAMS.map((t) => ({
      id: t.id,
      layout: layouts[t.id] ?? null,
      cRange: ranges[t.id]?.c ?? range(null),
      nRange: ranges[t.id]?.n ?? range(null),
    })),
  }
}

function assignedCharacters(slots, pool) {
  const byId = new Map(pool.map((c) => [c.id, c]))
  const list = []
  for (const [teamId, teamSlots] of Object.entries(slots)) {
    teamSlots.forEach((slot, index) => {
      if (slot.characterId) list.push({ teamId, index, slot, character: byId.get(slot.characterId) })
    })
  }
  return list
}

/* ------------------------------------------------------------------ */
console.log('=== 1. 单奶配置：区间分档 ===')
{
  // 12 个 C（伤害 1000~12000）+ 3 个奶（面板 30000/45000/60000）
  const pool = [
    ch('c1', 'p1', 'C1', 'C', 12000),
    ch('c2', 'p2', 'C2', 'C', 11000),
    ch('c3', 'p3', 'C3', 'C', 10000),
    ch('c4', 'p4', 'C4', 'C', 9000),
    ch('c5', 'p5', 'C5', 'C', 8000),
    ch('c6', 'p6', 'C6', 'C', 7000),
    ch('c7', 'p7', 'C7', 'C', 6000),
    ch('c8', 'p8', 'C8', 'C', 5000),
    ch('c9', 'p9', 'C9', 'C', 4000),
    ch('c10', 'p13', 'C10', 'C', 3000),
    ch('c11', 'p14', 'C11', 'C', 2000),
    ch('c12', 'p15', 'C12', 'C', 1000),
    ch('n1', 'p10', 'N1', 'N', 60000),
    ch('n2', 'p11', 'N2', 'N', 45000),
    ch('n3', 'p12', 'N3', 'N', 30000),
  ]
  const config = makeConfig({
    ranges: {
      red: { c: range(9000), n: range(50000) },
      yellow: { c: range(6000, 9000), n: range(40000, 50000) },
      green: { c: range(null, 6000), n: range(null, 40000) },
    },
  })
  const { slots } = autoAssign(pool, config)
  const assigned = assignedCharacters(slots, pool)
  ok('12 个位置全部填满', assigned.length === 12, `${assigned.length}/12`)
  ok('没有区间外补位', assigned.every((a) => !a.slot.outOfRange))

  const redC = slots.red.filter((s) => s.role === 'C').map((s) => pool.find((c) => c.id === s.characterId).panel)
  const yellowC = slots.yellow.filter((s) => s.role === 'C').map((s) => pool.find((c) => c.id === s.characterId).panel)
  const greenC = slots.green.filter((s) => s.role === 'C').map((s) => pool.find((c) => c.id === s.characterId).panel)
  ok('红队 C 都 ≥ 9000', redC.every((v) => v >= 9000), redC.join(','))
  ok('黄队 C 都在 6000~9000', yellowC.every((v) => v >= 6000 && v <= 9000), yellowC.join(','))
  ok('绿队 C 都 ≤ 6000', greenC.every((v) => v <= 6000), greenC.join(','))
  ok('红队拿到最大奶（60000）', pool.find((c) => c.id === slots.red[0].characterId).panel === 60000)
  const healPanels = TEAMS.map((t) => pool.find((c) => c.id === slots[t.id][0].characterId).panel)
  ok('三个奶按分档落位：红60000 / 黄45000 / 绿30000', JSON.stringify(healPanels) === JSON.stringify([60000, 45000, 30000]), healPanels.join(','))
  ok('每队 1 奶 3C', TEAMS.every((t) => slots[t.id].filter((s) => s.role === 'N').length === 1))

  const bench = computeBench(pool, slots)
  ok('未上场 3 人（多余的 C）', bench.length === 3, bench.map((b) => b.character.name).join(','))
  ok('未上场原因标记为未入选', bench.every((b) => b.reason === 'not-selected'))
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2. 双奶配置：常驻奶 + 太阳奶 ===')
{
  const pool = [
    ...Array.from({ length: 6 }, (_, i) => ch(`c${i}`, `pc${i}`, `C${i}`, 'C', 9000 - i * 500)),
    ch('n1', 'pn1', '大奶', 'N', 60000),
    ch('n2', 'pn2', '二奶', 'N', 50000),
    ch('n3', 'pn3', '三奶', 'N', 45000),
    ch('n4', 'pn4', '四奶', 'N', 40000),
    ch('n5', 'pn5', '五奶', 'N', 35000),
    ch('n6', 'pn6', '小奶', 'N', 30000),
  ]
  const { slots } = autoAssign(pool, makeConfig({ globalLayout: '2n2c' }))
  const assigned = assignedCharacters(slots, pool)
  ok('双奶配置每队 2 奶 2C', TEAMS.every((t) => {
    const list = slots[t.id]
    return list.filter((s) => s.role === 'N').length === 2 && list.filter((s) => s.role === 'C').length === 2
  }))
  ok('12 个位置全部填满', assigned.length === 12, `${assigned.length}/12`)
  const heals = TEAMS.map((t) => slots[t.id].filter((s) => s.role === 'N').map((s) => pool.find((c) => c.id === s.characterId).panel))
  ok('每队常驻奶面板 ≥ 太阳奶', heals.every(([a, b]) => a >= b), heals.map((h) => h.join('>=')).join(' | '))
  ok(
    '奶按队成对分配：红(60000,50000) / 黄(45000,40000) / 绿(35000,30000)',
    JSON.stringify(heals) === JSON.stringify([[60000, 50000], [45000, 40000], [35000, 30000]]),
    heals.map((h) => h.join('+')).join(' | '),
  )
}

/* ------------------------------------------------------------------ */
console.log('\n=== 3. 同一个玩家只能上场一个角色 ===')
{
  const pool = [
    ch('a1', '老陈', '龙神', 'C', 12000),
    ch('a2', '老陈', '剑魂', 'C', 11000),
    ch('a3', '老陈', '奶萝', 'N', 60000),
    ch('b1', '老王', '狂战', 'C', 10000),
    ch('b2', '老王', '奶爸', 'N', 50000),
    ch('c1', '小李', '修罗', 'C', 9000),
    ch('c2', '小张', '气功', 'C', 8000),
    ch('c3', '小赵', '鬼泣', 'C', 7000),
  ]
  const { slots } = autoAssign(pool, makeConfig())
  const assigned = assignedCharacters(slots, pool)
  const players = assigned.map((a) => a.character.player)
  ok('同一玩家只上场一个角色', new Set(players).size === players.length, players.join(','))
  ok(
    '老陈只上场 1 个角色（奶位优先，先上大奶萝）',
    assigned.filter((a) => a.character.player === '老陈').map((a) => a.character.name).join(',') === '奶萝',
    assigned.filter((a) => a.character.player === '老陈').map((a) => a.character.name).join(','),
  )
  const bench = computeBench(pool, slots)
  const conflict = bench.filter((b) => b.reason === 'player-conflict')
  ok(
    '同玩家的其余角色进入候补并标注原因',
    conflict.length === 3 && conflict.some((b) => b.character.name === '龙神') && conflict.some((b) => b.character.name === '剑魂'),
    conflict.map((b) => b.character.name).join(','),
  )
  ok('角色不足时允许留空（上场 5 人 = 2奶 + 3C）', assigned.length === 5, `${assigned.length}/12`)
  const warnings = validateLineup({ slots, teams: TEAMS, byId: new Map(pool.map((c) => [c.id, c])), difficulty: '普通团' })
  ok('缺奶被标记为必须处理', warnings.some((w) => w.level === 'error' && w.message.includes('缺')), warnings.filter((w) => w.level === 'error').map((w) => w.message).join(' / '))
}

/* ------------------------------------------------------------------ */
console.log('\n=== 4. 区间内没人时兜底补位 ===')
{
  // 所有队伍区间都够不着 -> 严格匹配失败，靠兜底补位（按 红→黄→绿 顺序取剩余角色）
  const pool = [
    ch('c1', 'p1', 'C1', 'C', 800),
    ch('c2', 'p2', 'C2', 'C', 700),
    ch('c3', 'p3', 'C3', 'C', 600),
    ch('n1', 'p4', 'N1', 'N', 20000),
    ch('n2', 'p5', 'N2', 'N', 19000),
    ch('n3', 'p6', 'N3', 'N', 18000),
  ]
  const ranges = {}
  for (const t of TEAMS) ranges[t.id] = { c: range(10000, 20000), n: range(50000, 60000) }
  const { slots } = autoAssign(pool, makeConfig({ ranges }))
  const assigned = assignedCharacters(slots, pool)
  ok('区间内没人时仍然补位（6 个角色全部上场）', assigned.length === 6, `${assigned.length}/6`)
  ok('补位的角色被标记为区间外', assigned.length > 0 && assigned.every((a) => a.slot.outOfRange))
  const filledCount = (id) => slots[id].filter((s) => s.characterId).length
  ok(
    '奶位优先：三队各先补 1 个奶，剩余 C 再按 红 -> 黄 -> 绿 补满',
    filledCount('red') === 4 && filledCount('yellow') === 1 && filledCount('green') === 1,
    `红${filledCount('red')} 黄${filledCount('yellow')} 绿${filledCount('green')}`,
  )
  ok(
    '每队都分到了奶（不会出现有队没奶）',
    TEAMS.every((t) => slots[t.id].some((s) => s.role === 'N' && s.characterId)),
  )
  const warnings = validateLineup({ slots, teams: TEAMS, byId: new Map(pool.map((c) => [c.id, c])), difficulty: '普通团' })
  ok('区间外会给出提示', warnings.some((w) => w.level === 'info' && w.message.includes('区间之外')))
}

console.log('\n=== 5. 双奶时太阳奶面板更高 ===')
{
  const pool = [
    ch('c1', 'p1', 'C1', 'C', 5000),
    ch('c2', 'p2', 'C2', 'C', 4000),
    ch('n1', 'p3', '小奶', 'N', 30000),
    ch('n2', 'p4', '大奶', 'N', 60000),
  ]
  // 手动把大奶放太阳位、小奶放常驻位
  const slots = {
    red: [
      { role: 'N', characterId: 'n1', outOfRange: false },
      { role: 'N', characterId: 'n2', outOfRange: false },
      { role: 'C', characterId: 'c1', outOfRange: false },
      { role: 'C', characterId: 'c2', outOfRange: false },
    ],
    yellow: layoutSlots('2n2c').map((s) => ({ role: s.role, characterId: null, outOfRange: false })),
    green: layoutSlots('2n2c').map((s) => ({ role: s.role, characterId: null, outOfRange: false })),
  }
  const warnings = validateLineup({ slots, teams: TEAMS, byId: new Map(pool.map((c) => [c.id, c])), difficulty: '普通团' })
  ok('提示太阳奶面板高于常驻奶', warnings.some((w) => w.message.includes('太阳奶面板高于常驻奶')))
}

/* ------------------------------------------------------------------ */
console.log('\n=== 6. 自动分档与统计 ===')
{
  const pool = [
    ...Array.from({ length: 9 }, (_, i) => ch(`c${i}`, `pc${i}`, `C${i}`, 'C', 9000 - i * 1000)),
    ...Array.from({ length: 3 }, (_, i) => ch(`n${i}`, `pn${i}`, `N${i}`, 'N', 60000 - i * 10000)),
  ]
  const suggested = suggestRanges(pool, '1n3c')
  ok('红队 C 下限最高', suggested.red.cRange.min > suggested.yellow.cRange.min)
  ok('黄队 C 下限高于绿队', suggested.yellow.cRange.min > suggested.green.cRange.min)
  ok('红队不设上限', suggested.red.cRange.max === null)
  const { slots } = autoAssign(pool, {
    globalLayout: '1n3c',
    teams: TEAMS.map((t) => ({ id: t.id, layout: null, ...suggested[t.id] })),
  })
  const byId = new Map(pool.map((c) => [c.id, c]))
  const assigned = assignedCharacters(slots, pool)
  ok('自动分档后 12 个位置填满且无区间外', assigned.length === 12 && assigned.every((a) => !a.slot.outOfRange))
  const summary = teamSummary(slots.red, byId)
  ok('红队合计伤害 = 各 C 之和', summary.cTotal === 9000 + 8000 + 7000, String(summary.cTotal))
  ok('红队奶均 = 60000', summary.nAverage === 60000, String(summary.nAverage))
}

console.log(`\n结果：${pass}/${pass + failures.length} 通过`)
if (failures.length) {
  console.log('失败项：\n - ' + failures.join('\n - '))
  process.exit(1)
}
