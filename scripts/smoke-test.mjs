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
ok('页面渲染', (await page.$eval('h1', (el) => el.textContent)).includes('角色登记'))
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

const realIssues = consoleIssues.filter((t) => !t.includes('favicon') && !t.includes('Vue Devtools'))
ok('无控制台报错 / Vue 警告', realIssues.length === 0, realIssues.join(' || ').slice(0, 400))

console.log('\n' + results.join('\n'))
console.log(`\n结果：${results.length - problems.length}/${results.length} 通过`)
if (problems.length) console.log('失败项：\n - ' + problems.join('\n - '))

await browser.close()
fs.rmSync(DL, { recursive: true, force: true })
process.exit(problems.length ? 1 : 0)
