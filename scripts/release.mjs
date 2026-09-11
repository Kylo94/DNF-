#!/usr/bin/env node
/**
 * 内测版发版脚本：改版本号 -> 写 CHANGELOG -> 提交 -> 打 git 标签（可选推送）
 *
 * 用法：
 *   npm run release                      # 查看当前版本与用法
 *   npm run release -- patch "修复 xxx"   # 0.1.1 -> 0.1.2（内测版，最常用）
 *   npm run release -- minor "新增排表"   # 0.1.2 -> 0.2.0（内测版）
 *   npm run release -- 0.3.0 "自定义号"   # 指定版本号
 *   npm run release -- patch "说明" --push    # 发版后自动 push（含标签）
 *   npm run release -- major "首个正式版" --stable   # 1.x 起为正式版，必须显式加 --stable
 *
 * 说明：
 *   - 版本号唯一数据源是 package.json，脚本会同步更新 package-lock.json
 *   - 1.0 之前全部是内测版，标签信息里会写明「内测版」
 *   - 发版会把当前工作区的全部改动一起提交（发布提交：chore(release): vX.Y.Z）
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = path.join(ROOT, 'package.json')
const LOCK = path.join(ROOT, 'package-lock.json')
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md')

const argv = process.argv.slice(2)
const flags = argv.filter((a) => a.startsWith('--'))
const positional = argv.filter((a) => !a.startsWith('--'))
const wantPush = flags.includes('--push')
const allowStable = flags.includes('--stable')

const pkg = JSON.parse(readFileSync(PKG, 'utf-8'))
const current = pkg.version
const [curMajor, curMinor, curPatch] = current.split('.').map(Number)

function usage(exitCode = 0) {
  console.log(`
当前版本：v${current}${curMajor === 0 ? '（内测版）' : '（正式版）'}

用法：
  npm run release -- <patch|minor|major|版本号> "改动说明" [--push] [--stable]

示例：
  npm run release -- patch "修复导入表头识别"
  npm run release -- minor "新增排表试算"
  npm run release -- 0.2.0 "第二个内测里程碑"
  npm run release -- patch "说明" --push

规则：1.0 之前全部为内测版；升到 1.x 需要显式加 --stable。
`)
  process.exit(exitCode)
}

if (!positional.length) usage(0)

const bump = positional[0]
const message = positional.slice(1).join(' ').trim() || '内测版迭代'

function nextVersion() {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump
  if (bump === 'patch') return `${curMajor}.${curMinor}.${curPatch + 1}`
  if (bump === 'minor') return `${curMajor}.${curMinor + 1}.0`
  if (bump === 'major') return `${curMajor + 1}.0.0`
  return null
}

const next = nextVersion()
if (!next) {
  console.error(`✗ 无法识别的版本参数：${bump}`)
  usage(1)
}

const nextMajor = Number(next.split('.')[0])
if (nextMajor >= 1 && !allowStable) {
  console.error(
    `✗ ${next} 属于正式版（1.0 起）。\n  1.0 之前请使用 0.x.y 内测版本号；如果确实要发布正式版，请加 --stable。`,
  )
  process.exit(1)
}
if (nextMajor === 0 && allowStable) {
  console.warn('! 仍处于 0.x 内测阶段，--stable 已忽略。')
}

const stage = nextMajor === 0 ? '内测版' : '正式版'
const today = new Date().toISOString().slice(0, 10)
const tag = `v${next}`

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8' }).trim()
}

try {
  git(['rev-parse', '--is-inside-work-tree'])
} catch {
  console.error('✗ 当前目录不是 git 仓库')
  process.exit(1)
}

/* 1. 同步版本号 */
pkg.version = next
writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n')

if (existsSync(LOCK)) {
  const lock = JSON.parse(readFileSync(LOCK, 'utf-8'))
  lock.version = next
  if (lock.packages && lock.packages['']) lock.packages[''].version = next
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n')
}

/* 2. 写 CHANGELOG */
const section = `## [${next}] - ${today} · ${stage}

### 变更

- ${message}

`
const changelog = readFileSync(CHANGELOG, 'utf-8')
const lines = changelog.split('\n')
const firstVersion = lines.findIndex((line) => /^## \[/.test(line))
const merged =
  firstVersion === -1
    ? changelog.trimEnd() + '\n\n' + section
    : [...lines.slice(0, firstVersion), ...section.split('\n'), ...lines.slice(firstVersion)].join('\n')
writeFileSync(CHANGELOG, merged)

/* 3. 提交 + 打标签 */
git(['add', '-A'])
const staged = git(['diff', '--cached', '--name-only'])
if (!staged) {
  console.error('✗ 没有需要提交的改动，已回滚版本号请手动检查')
  process.exit(1)
}

const commitMessage = `chore(release): ${tag} ${stage}\n\n${message}`
execFileSync('git', ['commit', '-q', '-m', commitMessage], { cwd: ROOT })
execFileSync('git', ['tag', '-a', tag, '-m', `${tag} ${stage}\n\n${message}`], { cwd: ROOT })

if (wantPush) {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  execFileSync('git', ['push', 'origin', branch], { cwd: ROOT, stdio: 'inherit' })
  execFileSync('git', ['push', 'origin', tag], { cwd: ROOT, stdio: 'inherit' })
}

console.log(`
✓ 已发布 ${tag}（${stage}）
  版本号：${current} → ${next}
  提交：  ${git(['log', '-1', '--oneline'])}
  标签：  ${tag}
  改动文件：
${staged.split('\n').map((f) => `    - ${f}`).join('\n')}
${wantPush ? '✓ 已推送到 origin' : `下一步推送：git push origin HEAD --follow-tags`}
`)
