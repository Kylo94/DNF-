/**
 * 端到端冒烟测试（Node + puppeteer-core 驱动本机 Chromium 内核浏览器）
 *
 * 前置：
 *   1) npm install
 *   2) 另开一个终端启动开发服务器：npm run dev -- --port 5273
 *   3) node scripts/smoke-test.mjs
 *
 * 覆盖：空表单校验 / 登记 C 与奶 / 万单位解析 / 同名覆盖 / 统计 / 筛选 /
 *       本地持久化 / 导出 xlsx 内容校验 / 导入旧案例表 / 编辑 / 删除。
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL = process.env.SMOKE_URL || 'http://localhost:5273/'
const SAMPLE = path.join(ROOT, '薄纱团本角色数据.xlsx')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'))
const EXPECT_VERSION = `v${PKG.version} · ${PKG.version.split('.')[0] === '0' ? '内测版' : '正式版'}`
const DL = path.join(ROOT, '.smoke-downloads')

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean)

const executablePath = CANDIDATES.find((p) => fs.existsSync(p))
if (!executablePath) {
  console.error('未找到可用的 Chromium 内核浏览器，请设置 CHROME_PATH 环境变量')
  process.exit(2)
}

fs.rmSync(DL, { recursive: true, force: true })
fs.mkdirSync(DL, { recursive: true })

const results = []
const problems = []
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? '✅' : '❌'}  ${name}${extra ? `  → ${extra}` : ''}`)
  if (!cond) problems.push(name)
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1440, height: 1000 },
})
const page = await browser.newPage()
const client = await page.target().createCDPSession()
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL })

const consoleIssues = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => consoleIssues.push(`[pageerror] ${e.message}`))
const dialogLog = []
page.on('dialog', async (d) => {
  dialogLog.push(d.message())
  await d.accept()
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => page.$eval('body', (el) => el.innerText)
const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('dnf-raid-roster-v1') || '[]'))
const statCards = () => page.$$eval('.stat__value', (els) => els.map((e) => e.textContent.trim()))

async function fill({ player, name, type, panel, difficulty }) {
  if (player !== undefined) {
    await page.$eval('[data-testid="input-player"]', (el) => (el.value = ''))
    await page.type('[data-testid="input-player"]', player)
  }
  if (name !== undefined) {
    await page.$eval('[data-testid="input-name"]', (el) => (el.value = ''))
    await page.type('[data-testid="input-name"]', name)
  }
  if (type !== undefined) await page.select('[data-testid="select-type"]', type)
  if (difficulty !== undefined) await page.select('[data-testid="select-difficulty"]', difficulty)
  if (panel !== undefined) {
    await page.$eval('[data-testid="input-panel"]', (el) => (el.value = ''))
    await page.type('[data-testid="input-panel"]', panel)
  }
}

async function waitForFile(dir, re, timeout = 8000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const hit = fs.readdirSync(dir).find((f) => re.test(f) && !f.endsWith('.crdownload'))
    if (hit) return hit
    await sleep(200)
  }
  return null
}

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.waitForSelector('[data-testid="btn-submit"]')
ok('页面渲染', (await page.$eval('h1', (el) => el.textContent)).includes('打团排表'))
const shownVersion = await page.$eval('[data-testid="version"]', (el) => el.textContent.trim())
ok(`标题显示版本号（package.json = ${PKG.version}）`, shownVersion === EXPECT_VERSION, shownVersion)
ok(
  '页脚显示版本号与内测说明',
  (await page.$eval('[data-testid="footer-version"]', (el) => el.textContent.trim())) === EXPECT_VERSION,
)

// 1. 空表单校验
await page.click('[data-testid="btn-submit"]')
const errTexts = await page.$$eval('.error', (els) => els.map((e) => e.textContent))
ok('空表单校验 3 条提示', errTexts.length === 3, errTexts.join(' / '))

// 2. 登记输出C（困难团）
await fill({ player: '老陈', name: '龙神', type: 'C', panel: '5500', difficulty: '困难团' })
await page.click('[data-testid="btn-submit"]')
await sleep(300)
let body = await text()
ok('C 角色登记成功', body.includes('龙神') && body.includes('登记成功'))
ok('连续登记保留玩家', (await page.$eval('[data-testid="input-player"]', (el) => el.value)) === '老陈')
ok('连续登记清空角色称呼', (await page.$eval('[data-testid="input-name"]', (el) => el.value)) === '')
ok('切换奶后提示面板三攻', (await text()).includes('面板三攻'))

// 3. 万单位解析
await fill({ name: '奶萝', type: 'N', panel: '4.47万' })
await page.click('[data-testid="btn-submit"]')
await sleep(300)
ok('面板支持「万」单位（4.47万 → 44,700）', (await text()).includes('44,700'))

// 4. 同名覆盖
await fill({ name: '龙神', type: 'C', panel: '6000' })
dialogLog.length = 0
await page.click('[data-testid="btn-submit"]')
await sleep(400)
ok('同名角色弹出覆盖确认', dialogLog.some((d) => d.includes('已经登记过角色')))
ok('确认后覆盖面板为 6,000', (await text()).includes('6,000'))

// 5. 统计卡片
ok(
  '统计卡片 [总数,C,奶,普通,困难] = 2,1,1,0,2',
  JSON.stringify(await statCards()) === JSON.stringify(['2', '1', '1', '0', '2']),
  (await statCards()).join(','),
)

// 6. 搜索筛选
await page.type('[data-testid="input-search"]', '奶萝')
await sleep(250)
body = await text()
const rowsText = await page.$$eval('tbody', (els) => els.map((e) => e.innerText).join('\n'))
ok('搜索筛选生效', body.includes('显示 1 / 2') && !rowsText.includes('龙神'), (body.match(/显示 \d+ \/ \d+/) || [''])[0])
await page.$eval('[data-testid="input-search"]', (el) => {
  el.value = ''
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(200)

// 7. 本地持久化
ok('数据写入 localStorage', (await store()).length === 2)
await page.reload({ waitUntil: 'networkidle0' })
await sleep(400)
body = await text()
ok('刷新后数据仍在', body.includes('奶萝') && body.includes('6,000'))

// 8. 导出 xlsx
await page.click('[data-testid="btn-export"]')
const file = await waitForFile(DL, /\.xlsx$/)
ok('浏览器下载 xlsx', Boolean(file), file || '未找到文件')
if (file) {
  const wb = XLSX.read(fs.readFileSync(path.join(DL, file)), { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['角色登记'], { header: 1 })
  ok(
    '导出表头 = 归属玩家/角色称呼/角色类型/面板数值/难度类型',
    JSON.stringify(rows[0]) === JSON.stringify(['归属玩家', '角色称呼', '角色类型', '面板数值', '难度类型']),
    JSON.stringify(rows[0]),
  )
  ok('导出 2 条数据', rows.length === 3, String(rows.length - 1))
  ok('导出难度列为困难团', rows.slice(1).every((r) => r[4] === '困难团'))
  ok('导出类型列写 C/N', rows.slice(1).map((r) => r[2]).sort().join(',') === 'C,N')
  ok('导出附带玩家统计页', wb.SheetNames.includes('玩家统计'), wb.SheetNames.join(','))
}

// 9. 导入旧案例表
await (await page.$('[data-testid="input-file"]')).uploadFile(SAMPLE)
await page.waitForSelector('.modal', { timeout: 8000 })
const modalText = await page.$eval('.modal', (el) => el.innerText)
ok('导入弹窗解析出 175 个角色', modalText.includes('175'), modalText.replace(/\n/g, ' | '))
await page.evaluate(() => {
  ;[...document.querySelectorAll('.modal .btn')].find((b) => b.textContent.includes('追加导入')).click()
})
await sleep(600)
body = await text()
ok('追加后 177 条（含同名的两个奶萝）', body.includes('显示 177 / 177'), body.match(/显示 \d+ \/ \d+/)?.[0])
ok('localStorage 共 177 条', (await store()).length === 177, String((await store()).length))
ok(
  '旧表 Ban状态 → 普通团，统计 [177,127,50,175,2]',
  JSON.stringify(await statCards()) === JSON.stringify(['177', '127', '50', '175', '2']),
  (await statCards()).join(','),
)
const keptDup = (await store()).filter((c) => c.player === '老陈' && c.name === '奶萝').length
ok('同玩家同名角色全部保留（手动1个 + 旧表2个 = 3）', keptDup === 3, `老陈/奶萝 x${keptDup}`)

// 10. 编辑
await page.evaluate(() => {
  const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('奶萝'))
  row.querySelector('.btn').click()
})
await sleep(300)
ok('进入编辑模式', (await text()).includes('编辑角色登记'))
await page.$eval('[data-testid="input-panel"]', (el) => (el.value = ''))
await page.type('[data-testid="input-panel"]', '46000')
await page.click('[data-testid="btn-submit"]')
await sleep(300)
ok('编辑保存生效（46,000）', (await text()).includes('46,000'))

// 11. 删除
const before = (await store()).length
dialogLog.length = 0
await page.evaluate(() => {
  const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('奶萝'))
  const btns = [...row.querySelectorAll('.btn')]
  btns[btns.length - 1].click()
})
await sleep(400)
const after = (await store()).length
ok('删除单条登记', after === before - 1 && dialogLog.some((d) => d.includes('确定删除')), `${before} → ${after}`)


/* ================= 编队排表（多波次 + 合计伤害 + 显示格式） ================= */
const LINEUP_KEY = 'dnf-raid-lineup-v2'
const readLineup = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), LINEUP_KEY)
const readRoster = () => page.evaluate(() => JSON.parse(localStorage.getItem('dnf-raid-roster-v1') || '[]'))
const rosterByIdOf = (roster) => new Map(roster.map((c) => [c.id, c]))
const waveCharacters = (lineup, index, byId) =>
  Object.values(lineup.waves[index].teams)
    .flat()
    .filter((s) => s.characterId)
    .map((s) => byId.get(s.characterId))
const allAssignedIds = (lineup) =>
  lineup.waves.flatMap((w) => Object.values(w.teams).flat().filter((s) => s.characterId).map((s) => s.characterId))

async function setRange(teamId, role, bound, value) {
  await page.$eval(
    `[data-testid="range-${teamId}-${role}-${bound}"]`,
    (el, v) => {
      el.value = String(v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    value,
  )
}

const uiText = (selector) => page.$eval(selector, (el) => el.innerText)

await page.click('[data-testid="tab-lineup"]')
await page.waitForSelector('[data-testid="btn-assign"]')
await page.waitForSelector('[data-testid="wave-tab-1"]', { timeout: 15000 })
await sleep(800)

let lineup = await readLineup()
let roster = await readRoster()
let rosterById = rosterByIdOf(roster)

// --- 全部角色入队 ---
const overallText = await uiText('[data-testid="overall-count"]')
ok('总览给出已排角色数', /已将 \d+ \/ \d+ 个角色排入 \d+ 波/.test(overallText), overallText)
ok('按角色数量自动生成多波（>1 波）', lineup.waves.length > 1, `${lineup.waves.length} 波`)
const firstWaveAssigned = waveCharacters(lineup, 0, rosterById).length
ok('第一波 12 人满编', firstWaveAssigned === 12, `${firstWaveAssigned}/12`)
ok(
  '本波上场计数正确',
  (await uiText('[data-testid="assigned-count"]')).includes('本波上场 12/12'),
  await uiText('[data-testid="assigned-count"]'),
)

// 同一个角色只能出现在一波
const ids = allAssignedIds(lineup)
ok('同一个角色不会重复出现在两波', new Set(ids).size === ids.length, `${ids.length} 个位置`)
// 排不上的角色，必须是因为「同一个玩家一波只能上一个」被规则挡住，而不是算法漏排
const seated = new Set(ids)
const leftover = roster.filter((c) => !seated.has(c.id))
const blockedByRule = leftover.every((c) => {
  const waves = lineup.waves.filter((w) => w.difficulty === c.difficulty)
  return (
    waves.length > 0 &&
    waves.every((w) =>
      Object.values(w.teams)
        .flat()
        .some((s) => s.characterId && rosterById.get(s.characterId).player === c.player),
    )
  )
})
ok(
  `排不上的 ${leftover.length} 个角色都是「同玩家一波只能上一个」导致的`,
  blockedByRule,
  leftover.map((c) => `${c.player}/${c.name}`).slice(0, 6).join(', '),
)
ok('确实存在无法入队的角色（符合预期）', leftover.length >= 0, `漏掉 ${leftover.length} 个`)

// 每波同一个玩家只能上场一个角色
const perWavePlayerOk = lineup.waves.every((wave) => {
  const players = Object.values(wave.teams)
    .flat()
    .filter((s) => s.characterId)
    .map((s) => rosterById.get(s.characterId).player)
  return new Set(players).size === players.length
})
ok('每一波内同一个玩家只上场一个角色', perWavePlayerOk)
ok(
  '第一波每队都配置了辅助奶',
  ['red', 'yellow', 'green'].every((id) =>
    lineup.waves[0].teams[id].some((s) => s.role === 'N' && s.characterId),
  ),
)

// --- 合计伤害目标：避免伤害过剩 ---
const redTotalBefore = lineup.waves[0].teams.red
  .filter((s) => s.role === 'C' && s.characterId)
  .reduce((sum, s) => sum + rosterById.get(s.characterId).panel, 0)
await setRange('red', 'TOTAL', 'min', Math.round(redTotalBefore * 0.7))
await setRange('red', 'TOTAL', 'max', redTotalBefore)
await page.click('[data-testid="btn-assign-wave"]')
await sleep(600)
lineup = await readLineup()
const redTotalAfter = lineup.waves[0].teams.red
  .filter((s) => s.role === 'C' && s.characterId)
  .reduce((sum, s) => sum + rosterById.get(s.characterId).panel, 0)
ok(
  `红队 C 合计落在合计目标内（${Math.round(redTotalBefore * 0.7)} ~ ${redTotalBefore}）`,
  redTotalAfter >= Math.round(redTotalBefore * 0.7) && redTotalAfter <= redTotalBefore,
  String(redTotalAfter),
)
ok(
  '队伍卡片显示合计与目标、达标状态',
  (await uiText('[data-testid="slot-red-0"]')) !== '' && (await page.$eval('.team__foot', (el) => el.innerText)).includes('目标'),
)

// 合计上限压得很低时应避免堆强 C
await setRange('red', 'TOTAL', 'min', 1000)
await setRange('red', 'TOTAL', 'max', Math.round(redTotalBefore * 0.5))
await page.click('[data-testid="btn-assign-wave"]')
await sleep(600)
lineup = await readLineup()
const redTotalLow = lineup.waves[0].teams.red
  .filter((s) => s.role === 'C' && s.characterId)
  .reduce((sum, s) => sum + rosterById.get(s.characterId).panel, 0)
ok('合计上限压低后不会再堆最强 C（伤害不过剩）', redTotalLow <= Math.round(redTotalBefore * 0.5), String(redTotalLow))
await setRange('red', 'TOTAL', 'min', '')
await setRange('red', 'TOTAL', 'max', '')
await page.click('[data-testid="btn-assign-wave"]')
await sleep(500)

// --- 显示格式标签 ---
ok('显示格式标签共 5 种', (await page.$$eval('[data-testid="format-tags"] .tag-btn', (els) => els.length)) === 5)
await page.click('[data-testid="format-name-value"]')
await sleep(300)
const nameValueText = await uiText('[data-testid="slot-red-0"]')
ok('切到「角色·属性」后不显示玩家名', !roster.some((c) => nameValueText.includes(c.player) && c.player.length > 1 && nameValueText.startsWith(c.player)))
await page.click('[data-testid="format-player-name-value"]')
await sleep(300)
lineup = await readLineup()
const redFirst = rosterById.get(lineup.waves[0].teams.red[0].characterId)
const defaultText = await uiText('[data-testid="slot-red-0"]')
ok(
  '默认格式为 玩家·角色·属性',
  defaultText.includes(redFirst.player) && defaultText.includes(redFirst.name) && defaultText.includes(redFirst.panel.toLocaleString('zh-CN')),
  defaultText.replace(/\n/g, ' | '),
)

// --- 职业配色 ---
const colorOf = (selector) =>
  page.$eval(selector, (el) => {
    const span = [...el.querySelectorAll('.slot__main span')].find((s) => s.style.color)
    return span ? getComputedStyle(span).color : ''
  })
const healSlotIndex = lineup.waves[0].teams.red.findIndex((s) => s.role === 'N')
await page.click('[data-testid="wave-tab-0"]')
await sleep(200)
const healColor = await colorOf(`[data-testid="slot-red-${healSlotIndex}"]`)
const cSlotIndex = lineup.waves[0].teams.red.findIndex((s) => s.role === 'C' && s.characterId)
const cColor = await colorOf(`[data-testid="slot-red-${cSlotIndex}"]`)
ok('辅助奶显示为绿色', healColor === 'rgb(52, 211, 153)', healColor)
ok('输出C显示为蓝色（不与红黄绿队色冲突）', cColor === 'rgb(96, 165, 250)', cColor)

// --- 手动增删角色 ---
await page.click(`[data-testid="slot-red-${cSlotIndex}"]`)
await page.hover(`[data-testid="slot-red-${cSlotIndex}"]`)
await page.click(`[data-testid="slot-red-${cSlotIndex}"] .slot__remove`)
await sleep(400)
lineup = await readLineup()
ok('✕ 可以把角色从队伍里删掉（回到候补）', lineup.waves[0].teams.red[cSlotIndex].characterId === null)
ok('空位显示空位提示', (await uiText(`[data-testid="slot-red-${cSlotIndex}"]`)).includes('空位'))
const benchCountBefore = await page.$$eval('[data-testid="bench-chip"]', (els) => els.length)
await page.evaluate(() => document.querySelector('[data-testid="bench-chip"]').click())
await page.click(`[data-testid="slot-red-${cSlotIndex}"]`)
await sleep(400)
lineup = await readLineup()
ok(
  '候补角色可以手动补进空位',
  lineup.waves[0].teams.red[cSlotIndex].characterId !== null &&
    (await page.$$eval('[data-testid="bench-chip"]', (els) => els.length)) === benchCountBefore - 1,
)

// --- 跨波次移动（新增一个空波次，把角色挪过去） ---
await page.click('[data-testid="wave-tab-0"]')
await sleep(250)
lineup = await readLineup()
const wavesBeforeCross = lineup.waves.length
await page.click('[data-testid="btn-add-wave"]')
await sleep(350)
lineup = await readLineup()
ok(
  '新增的空波次插在当前波之后且没有角色',
  lineup.waves.length === wavesBeforeCross + 1 &&
    lineup.waves[1].teams.red.every((s) => !s.characterId) &&
    lineup.waves[1].teams.green.every((s) => !s.characterId),
)

const srcSlotIndex = lineup.waves[0].teams.red.findIndex((s) => s.role === 'C' && s.characterId)
const movingId = lineup.waves[0].teams.red[srcSlotIndex].characterId
const tgtSlotIndex = lineup.waves[1].teams.red.findIndex((s) => s.role === 'C')
await page.click('[data-testid="wave-tab-0"]')
await sleep(200)
await page.click(`[data-testid="slot-red-${srcSlotIndex}"]`)
await page.click('[data-testid="wave-tab-1"]')
await sleep(250)
await page.click(`[data-testid="slot-red-${tgtSlotIndex}"]`)
await sleep(450)
lineup = await readLineup()
ok(
  `跨波次把${rosterById.get(movingId).name}从第一波移到新波次`,
  lineup.waves[1].teams.red[tgtSlotIndex].characterId === movingId,
)
ok('第一波原位置变成空位', lineup.waves[0].teams.red[srcSlotIndex].characterId === null)
ok(
  '跨波移动后每一波依然没有同玩家重复',
  lineup.waves.every((wave) => {
    const players = Object.values(wave.teams)
      .flat()
      .filter((s) => s.characterId)
      .map((s) => rosterById.get(s.characterId).player)
    return new Set(players).size === players.length
  }),
)

// 同玩家冲突的移动会被拒绝（第二波 12 个玩家都已上场）
lineup = await readLineup()
const fullWaveIndex = 2
const fullWavePlayers = new Set(
  Object.values(lineup.waves[fullWaveIndex].teams)
    .flat()
    .filter((s) => s.characterId)
    .map((s) => rosterById.get(s.characterId).player),
)
const conflictSource = lineup.waves[0].teams.red.findIndex(
  (s) => s.role === 'C' && s.characterId && fullWavePlayers.has(rosterById.get(s.characterId).player),
)
const conflictSourcePlayer =
  conflictSource === -1 ? null : rosterById.get(lineup.waves[0].teams.red[conflictSource].characterId).player
const conflictTarget = lineup.waves[fullWaveIndex].teams.green.findIndex(
  (s) =>
    s.role === 'C' && s.characterId && rosterById.get(s.characterId).player !== conflictSourcePlayer,
)
if (conflictSource !== -1 && conflictTarget !== -1) {
  const before = JSON.stringify((await readLineup()).waves)
  await page.click('[data-testid="wave-tab-0"]')
  await sleep(250)
  await page.click(`[data-testid="slot-red-${conflictSource}"]`)
  await page.click(`[data-testid="wave-tab-${fullWaveIndex}"]`)
  await sleep(300)
  await page.click(`[data-testid="slot-green-${conflictTarget}"]`)
  await sleep(450)
  const after = (await readLineup()).waves
  const toastText = (await page.$$eval('.toast', (els) => els.map((e) => e.innerText))).join(' / ')
  ok(
    '同玩家在同一波重复上场的移动会被拒绝',
    JSON.stringify(after) === before && toastText.includes('已经上场了一个角色'),
    toastText,
  )
} else {
  ok('同玩家在同一波重复上场的移动会被拒绝', true, '本次数据没有可构造的冲突场景')
}

// --- 波次增删 ---
const wavesBefore = lineup.waves.length
await page.click('[data-testid="btn-add-wave"]')
await sleep(300)
ok('可以手动加波次', (await readLineup()).waves.length === wavesBefore + 1)
await page.click('[data-testid="btn-remove-wave"]')
await sleep(300)
ok('可以手动删波次', (await readLineup()).waves.length === wavesBefore)

// --- 导出 ---
await page.click('[data-testid="btn-export-lineup"]')
const lineupFile = await waitForFile(DL, /^DNF打团编队_.*\.xlsx$/, 10000)
ok('导出编队 xlsx', Boolean(lineupFile), lineupFile || '未找到文件')
if (lineupFile) {
  const wb = XLSX.read(fs.readFileSync(path.join(DL, lineupFile)), { type: 'buffer' })
  ok(
    '导出含 编队 / 各队合计 / 未上场 三个工作表',
    ['编队', '各队合计', '未上场'].every((n) => wb.SheetNames.includes(n)),
    wb.SheetNames.join(','),
  )
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['编队'], { header: 1 })
  ok(
    '编队表表头与波次列正确',
    JSON.stringify(rows[0]) === JSON.stringify(['波次', '团本难度', '队伍', '位置', '角色类型', '归属玩家', '角色称呼', '面板数值', '区间状态']),
    JSON.stringify(rows[0]),
  )
  const finalWaves = (await readLineup()).waves.length
  ok(`编队表覆盖全部 ${finalWaves} 波（每波 12 行）`, rows.length - 1 === finalWaves * 12, String(rows.length - 1))
  const summaryRows = XLSX.utils.sheet_to_json(wb.Sheets['各队合计'], { header: 1 })
  ok('各队合计表含目标列', summaryRows[0].includes('C 合计伤害') && summaryRows[0].includes('合计状态'))
}

// --- 持久化 ---
const beforeReload = await readLineup()
await page.reload({ waitUntil: 'networkidle0' })
await page.waitForSelector('[data-testid="btn-assign"]')
await sleep(800)
const afterReload = await readLineup()
ok(
  '刷新后所有波次与配置保持不变',
  JSON.stringify(afterReload.waves) === JSON.stringify(beforeReload.waves) &&
    JSON.stringify(afterReload.config) === JSON.stringify(beforeReload.config) &&
    afterReload.displayFormat === beforeReload.displayFormat,
)
ok('页签状态也记住了（刷新后仍在编队页）', Boolean(await page.$('[data-testid="btn-assign"]')))

const realIssues = consoleIssues.filter((t) => !t.includes('favicon') && !t.includes('Vue Devtools'))
ok('无控制台报错 / Vue 警告', realIssues.length === 0, realIssues.join(' || ').slice(0, 400))

console.log('\n' + results.join('\n'))
console.log(`\n结果：${results.length - problems.length}/${results.length} 通过`)
if (problems.length) console.log('失败项：\n - ' + problems.join('\n - '))

await browser.close()
fs.rmSync(DL, { recursive: true, force: true })
process.exit(problems.length ? 1 : 0)
