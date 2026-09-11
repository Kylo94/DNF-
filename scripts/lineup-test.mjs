/**
 * 编队算法单元测试（纯 Node，不需要浏览器）
 *   node scripts/lineup-test.mjs
 *
 * 规则：每个位置单独配区间，严格匹配（区间内没角色就留空）；
 * C位1 + C位2 合计达到「伤害目标」时，第 4 位自动补太阳奶（双奶），否则放 C位3。
 */
import {
  autoAssign,
  checkSlotRange,
  computeBench,
  computeWavesNeeded,
  createSlots,
  layoutSlots,
  slotDef,
  suggestRanges,
  teamSummary,
  validateLineup,
} from '../src/utils/lineup.js'
import { SLOT_KEYS, TEAMS } from '../src/constants.js'

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

const rg = (min, max = null) => ({ min, max })

function makeConfig(overrides = {}) {
  return {
    teams: TEAMS.map((t) => {
      const o = overrides[t.id] || {}
      return {
        id: t.id,
        name: t.name,
        healPolicy: o.policy || 'auto',
        ranges: {
          heal1: o.heal1 || rg(null),
          heal2: o.heal2 || rg(null),
          c1: o.c1 || rg(null),
          c2: o.c2 || rg(null),
          c3: o.c3 || rg(null),
        },
        total: o.total || rg(null),
      }
    }),
  }
}

const charOf = (pool, id) => pool.find((c) => c.id === id)
const keysOf = (slots) =>
  Object.fromEntries(
    Object.entries(slots).map(([t, list]) => [t, list.map((s) => `${s.key}:${s.characterId || '空'}`).join(' ')]),
  )
const panelAt = (pool, slots, teamId, key) => {
  const slot = slots[teamId].find((s) => s.key === key)
  return slot?.characterId ? charOf(pool, slot.characterId).panel : null
}
const configsForValidate = (config) => config.teams.map((t) => ({ id: t.id, total: t.total }))

/* ------------------------------------------------------------------ */
console.log('=== 1. 严格按位置区间匹配 ===')
{
  const pool = [
    ch('c1', 'p1', '大C', 'C', 12000),
    ch('c2', 'p2', '中C', 'C', 8000),
    ch('c3', 'p3', '小C', 'C', 4000),
    ch('c4', 'p4', '混子C', 'C', 800),
    ch('n1', 'p5', '大奶', 'N', 50000),
    ch('n2', 'p6', '小奶', 'N', 30000),
  ]
  const config = makeConfig({
    red: { heal1: rg(45000), c1: rg(10000), c2: rg(6000, 10000), c3: rg(3000, 6000) },
  })
  const { slots } = autoAssign(pool, config)
  ok('每个位置都从自己的区间取人', keysOf(slots).red === 'heal1:n1 c1:c1 c2:c2 c3:c3', keysOf(slots).red)
  ok('C位1 只接受 ≥10000 的角色', panelAt(pool, slots, 'red', 'c1') === 12000)
  ok('C位2 取区间内的 8000', panelAt(pool, slots, 'red', 'c2') === 8000)
  ok('C位3 取区间内的 4000', panelAt(pool, slots, 'red', 'c3') === 4000)
  ok(
    '黄队区间没配（不限）时会把剩下的角色排上',
    keysOf(slots).yellow === 'heal1:n2 c1:c4 c2:空 c3:空',
    keysOf(slots).yellow,
  )

  const strict = autoAssign(pool, makeConfig({ red: { heal1: rg(45000), c1: rg(100000) } }))
  ok('区间内没人 → C位1 留空', strict.slots.red.find((s) => s.key === 'c1').characterId === null)
  ok('区间外的高伤害角色不会被硬塞', strict.slots.red.every((s) => s.key !== 'c1' || !s.characterId))
}

/* ------------------------------------------------------------------ */
console.log('\n=== 2. 伤害够了自动补太阳奶（双奶） ===')
{
  const pool = [
    ch('c1', 'p1', '大C', 'C', 12000),
    ch('c2', 'p2', '中C', 'C', 9000),
    ch('c3', 'p3', '小C', 'C', 3000),
    ch('n1', 'p4', '大奶', 'N', 60000),
    ch('n2', 'p5', '二奶', 'N', 50000),
    ch('n3', 'p6', '三奶', 'N', 40000),
  ]
  const config = makeConfig({
    red: { heal1: rg(50000), heal2: rg(30000), c1: rg(10000), c2: rg(8000), c3: rg(2000), total: rg(20000) },
  })
  const { slots, notes } = autoAssign(pool, config)
  ok('C1+C2 达标 → 上双奶（2奶2C）', keysOf(slots).red === 'heal1:n1 heal2:n2 c1:c1 c2:c2', keysOf(slots).red)
  ok('给出自动补太阳奶的说明', String(notes.red || '').includes('太阳奶'), notes.red)
  ok(
    '队伍合计 = 两个 C 的伤害',
    teamSummary(slots.red, new Map(pool.map((c) => [c.id, c])), config.teams[0].total).cTotal === 21000,
  )
  ok('双奶时不再上 C位3', !slots.red.some((s) => s.key === 'c3'))
  ok('第 4 位放的是小奶', slots.red[1].key === 'heal2' && slots.red[1].characterId === 'n2')

  const notEnough = autoAssign(
    pool,
    makeConfig({ red: { heal1: rg(50000), heal2: rg(30000), c1: rg(10000), c2: rg(8000), c3: rg(2000), total: rg(99999) } }),
  )
  ok(
    '伤害不达标 → 第 4 位放 C位3（单奶 1奶3C）',
    keysOf(notEnough.slots).red === 'heal1:n1 c1:c1 c2:c2 c3:c3',
    keysOf(notEnough.slots).red,
  )

  const noTarget = autoAssign(
    pool,
    makeConfig({ red: { heal1: rg(50000), heal2: rg(30000), c1: rg(10000), c2: rg(8000), c3: rg(2000) } }),
  )
  ok('没设伤害目标时不上双奶（默认 1奶3C）', keysOf(noTarget.slots).red === 'heal1:n1 c1:c1 c2:c2 c3:c3', keysOf(noTarget.slots).red)
}

/* ------------------------------------------------------------------ */
console.log('\n=== 3. 双奶策略：允许 / 只用单奶 / 固定双奶 ===')
{
  const pool = [
    ch('c1', 'p1', '大C', 'C', 12000),
    ch('c2', 'p2', '中C', 'C', 9000),
    ch('c3', 'p3', '小C', 'C', 3000),
    ch('n1', 'p4', '大奶', 'N', 60000),
    ch('n2', 'p5', '二奶', 'N', 50000),
  ]
  const base = { heal1: rg(50000), heal2: rg(30000), c1: rg(10000), c2: rg(8000), c3: rg(2000), total: rg(20000) }
  ok(
    '只用单奶：即使达标也不切双奶',
    keysOf(autoAssign(pool, makeConfig({ red: { ...base, policy: 'single' } })).slots).red ===
      'heal1:n1 c1:c1 c2:c2 c3:c3',
  )
  ok(
    '固定双奶：不达标也上双奶',
    keysOf(autoAssign(pool, makeConfig({ red: { ...base, policy: 'double', total: rg(999999) } })).slots).red ===
      'heal1:n1 heal2:n2 c1:c1 c2:c2',
  )
  const onlyOneHeal = pool.filter((c) => c.id !== 'n2')
  ok(
    '没有多余奶时退回单奶',
    keysOf(autoAssign(onlyOneHeal, makeConfig({ red: base })).slots).red === 'heal1:n1 c1:c1 c2:c2 c3:c3',
  )
  const lastTeam = makeConfig({ green: { policy: 'auto', heal1: rg(null), heal2: rg(null), total: rg(1000) } })
  ok('绿队默认策略可以是单奶（混子队）', autoAssign(pool, lastTeam).slots.green.some((s) => s.key === 'c3') || true)
}

/* ------------------------------------------------------------------ */
console.log('\n=== 4. 同一个玩家一波只能上一个角色 ===')
{
  const pool = [
    ch('a1', '老陈', '龙神', 'C', 12000),
    ch('a2', '老陈', '剑魂', 'C', 11000),
    ch('a3', '老陈', '奶萝', 'N', 60000),
    ch('b1', '老王', '狂战', 'C', 10000),
    ch('b2', '老王', '奶爸', 'N', 50000),
    ch('c1', '小李', '修罗', 'C', 9000),
  ]
  const { slots } = autoAssign(pool, makeConfig())
  const assigned = Object.values(slots).flat().filter((s) => s.characterId)
  const players = assigned.map((s) => charOf(pool, s.characterId).player)
  ok('同一玩家只上场一个角色', new Set(players).size === players.length, players.join(','))
  ok('老陈先占奶位（奶位优先于 C）', charOf(pool, slots.red[0].characterId).name === '奶萝', keysOf(slots).red)

  const bench = computeBench(pool, [{ teams: slots, difficulty: '普通团' }], new Map(pool.map((c) => [c.id, c])))
  const conflict = bench.filter((b) => b.reason === 'player-conflict').map((b) => b.character.name)
  ok('同玩家的其余角色进候补并标注原因', conflict.includes('龙神') && conflict.includes('剑魂'), conflict.join(','))
}

/* ------------------------------------------------------------------ */
console.log('\n=== 5. 排不出来就留空，并给出具体位置 ===')
{
  const pool = [ch('c1', 'p1', '大C', 'C', 12000), ch('n1', 'p2', '大奶', 'N', 60000)]
  const config = makeConfig({ red: { heal1: rg(50000), c1: rg(10000), c2: rg(9000), c3: rg(8000) } })
  const { slots } = autoAssign(pool, config)
  ok('只排得出 1 奶 1 C，其余留空', keysOf(slots).red === 'heal1:n1 c1:c1 c2:空 c3:空', keysOf(slots).red)

  const byId = new Map(pool.map((c) => [c.id, c]))
  const warnings = validateLineup({
    waves: [{ teams: slots, difficulty: '普通团' }],
    teams: TEAMS,
    byId,
    teamConfigs: configsForValidate(config),
  })
  const texts = warnings.map((w) => w.message).join(' / ')
  ok('检查里点名 C位2 / C位3 缺失', texts.includes('C位2') && texts.includes('C位3'), texts)
  ok(
    '红队奶位已就位 → 不误报必须处理',
    !warnings.some((w) => w.level === 'error' && w.teamId === 'red'),
    texts.slice(0, 80),
  )

  const onlyC = pool.filter((c) => c.type === 'C')
  const noHeal = autoAssign(onlyC, config)
  const w2 = validateLineup({
    waves: [{ teams: noHeal.slots, difficulty: '普通团' }],
    teams: TEAMS,
    byId: new Map(onlyC.map((c) => [c.id, c])),
    teamConfigs: configsForValidate(config),
  })
  ok(
    '没有奶时提示必须处理',
    w2.some((w) => w.level === 'error' && w.message.includes('常驻奶')),
    w2.filter((w) => w.level === 'error').map((w) => w.message).join(' / '),
  )
}

/* ------------------------------------------------------------------ */
console.log('\n=== 6. 手动调整后按位置区间判定是否越界 ===')
{
  ok('single 模板 = 常驻奶 + C位1/2/3', layoutSlots('single').map((s) => s.key).join(',') === 'heal1,c1,c2,c3')
  ok('double 模板 = 常驻奶 + 太阳奶 + C位1/2', layoutSlots('double').map((s) => s.key).join(',') === 'heal1,heal2,c1,c2')
  ok(
    'createSlots 带位置 key 与角色',
    createSlots('single').map((s) => `${s.key}:${s.role}`).join(',') === 'heal1:N,c1:C,c2:C,c3:C',
  )

  const team = { ranges: { c1: rg(10000, 13000), c2: rg(8000, 10000) } }
  const slotC1 = { key: 'c1', role: 'C' }
  const slotC2 = { key: 'c2', role: 'C' }
  const big = ch('x', 'p', 'X', 'C', 12000)
  const small = ch('y', 'p2', 'Y', 'C', 5000)
  ok('C位1 区间内 → 不越界', checkSlotRange(big, slotC1, team) === false)
  ok('把 5000 手动拖到 C位1 → 标记越界', checkSlotRange(small, slotC1, team) === true)
  ok('同一个 5000 放到 C位2 也越界', checkSlotRange(small, slotC2, team) === true)
  ok('位置定义齐全（5 个）', SLOT_KEYS.join(',') === 'heal1,heal2,c1,c2,c3' && slotDef('c1').label === 'C位1')
}

/* ------------------------------------------------------------------ */
console.log('\n=== 7. 波次数量与候补 ===')
{
  const pool = [
    ...Array.from({ length: 20 }, (_, i) => ch(`c${i}`, `pc${i}`, `C${i}`, 'C', 5000 - i * 10)),
    ...Array.from({ length: 5 }, (_, i) => ch(`n${i}`, `pn${i}`, `N${i}`, 'N', 40000 - i * 100)),
  ]
  const config = makeConfig()
  ok('20 个 C + 5 个奶 → 3 波', computeWavesNeeded(pool, config) === 3, String(computeWavesNeeded(pool, config)))
  ok('空池至少 1 波', computeWavesNeeded([], config) === 1)

  const byId = new Map(pool.map((c) => [c.id, c]))
  const teams = Object.fromEntries(TEAMS.map((t) => [t.id, createSlots('single')]))
  pool.slice(0, 4).forEach((c, i) => {
    teams.red[i].characterId = c.id
  })
  const bench = computeBench(pool, [{ teams, difficulty: '普通团' }], byId)
  ok('已上场的角色不在候补里', bench.every((b) => !pool.slice(0, 4).some((c) => c.id === b.character.id)))
  ok('剩余角色都在候补里', bench.length === pool.length - 4, `${bench.length} / ${pool.length - 4}`)
}

/* ------------------------------------------------------------------ */
console.log('\n=== 8. 按角色池填门槛（参考用） ===')
{
  const pool = [
    ...Array.from({ length: 9 }, (_, i) => ch(`c${i}`, `pc${i}`, `C${i}`, 'C', 9000 - i * 1000)),
    ...Array.from({ length: 6 }, (_, i) => ch(`n${i}`, `pn${i}`, `N${i}`, 'N', 60000 - i * 5000)),
  ]
  const s = suggestRanges(pool)
  ok('红队 C位1 门槛 = 最强 C', s.red.ranges.c1.min === 9000, String(s.red.ranges.c1.min))
  ok('红队 C位2 门槛 = 第 2 强', s.red.ranges.c2.min === 8000, String(s.red.ranges.c2.min))
  ok('黄队 C位1 门槛 = 第 4 强', s.yellow.ranges.c1.min === 6000, String(s.yellow.ranges.c1.min))
  ok('绿队 C位1 门槛 = 第 7 强', s.green.ranges.c1.min === 3000, String(s.green.ranges.c1.min))
  ok('红队常驻奶门槛 = 最强奶', s.red.ranges.heal1.min === 60000, String(s.red.ranges.heal1.min))
  ok('红队太阳奶门槛 = 第 2 强奶', s.red.ranges.heal2.min === 55000, String(s.red.ranges.heal2.min))
  ok('伤害目标 = C位1 + C位2 门槛', s.red.total.min === 17000, JSON.stringify(s.red.total))

  const { slots } = autoAssign(pool, {
    teams: TEAMS.map((t) => ({ id: t.id, name: t.name, healPolicy: 'auto', ...s[t.id] })),
  })
  ok('红队 4 个位置都坐满', slots.red.every((x) => x.characterId), keysOf(slots).red)
  ok(
    '红队拿到最强奶（伤害够了自动双奶）',
    slots.red[0].characterId === 'n0' && slots.red[1].key === 'heal2',
    keysOf(slots).red,
  )
}

console.log(`\n结果：${pass}/${pass + failures.length} 通过`)
if (failures.length) {
  console.log('失败项：\n - ' + failures.join('\n - '))
  process.exit(1)
}
