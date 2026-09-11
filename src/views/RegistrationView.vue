<script setup>
import { computed, ref } from 'vue'
import CharacterForm from '../components/CharacterForm.vue'
import CharacterTable from '../components/CharacterTable.vue'
import StatsPanel from '../components/StatsPanel.vue'
import { DIFFICULTIES, SORT_OPTIONS, CHAR_TYPES } from '../constants.js'
import { useCharacters } from '../composables/useCharacters.js'
import { useToast } from '../composables/useToast.js'
import { exportCharactersToExcel, parseExcelFile } from '../utils/excel.js'

const {
  characters,
  players,
  stats,
  playerStats,
  findDuplicate,
  addCharacter,
  updateCharacter,
  removeCharacter,
  replaceAll,
  appendMany,
  clearAll,
} = useCharacters()
const { toast } = useToast()

const formRef = ref(null)
const editing = ref(null)
const keepContext = ref(true)

const filters = ref({ keyword: '', type: 'all', difficulty: 'all' })
const sortMode = ref('created')

const fileInput = ref(null)
const importModal = ref({ open: false, fileName: '', rows: [], skipped: 0, skipDuplicate: false })

/* ------------------------- 筛选 / 排序 ------------------------- */

const filtered = computed(() => {
  const { keyword, type, difficulty } = filters.value
  const kw = keyword.trim().toLowerCase()
  return characters.value.filter((c) => {
    if (type !== 'all' && c.type !== type) return false
    if (difficulty !== 'all' && c.difficulty !== difficulty) return false
    if (kw && !`${c.player} ${c.name}`.toLowerCase().includes(kw)) return false
    return true
  })
})

const hasFilter = computed(
  () => filters.value.keyword.trim() !== '' || filters.value.type !== 'all' || filters.value.difficulty !== 'all',
)

function sortRows(rows) {
  const list = [...rows]
  switch (sortMode.value) {
    case 'panel-desc':
      return list.sort((a, b) => (b.panel ?? -1) - (a.panel ?? -1))
    case 'panel-asc':
      return list.sort((a, b) => (a.panel ?? Number.MAX_SAFE_INTEGER) - (b.panel ?? Number.MAX_SAFE_INTEGER))
    case 'player':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    default:
      return list.sort((a, b) => a.createdAt - b.createdAt)
  }
}

const groups = computed(() => {
  const map = new Map()
  for (const row of filtered.value) {
    if (!map.has(row.player)) map.set(row.player, [])
    map.get(row.player).push(row)
  }
  let entries = [...map.entries()].map(([player, rows]) => ({ player, characters: sortRows(rows) }))

  if (sortMode.value === 'player') {
    entries.sort((a, b) => a.player.localeCompare(b.player, 'zh-CN'))
  } else if (sortMode.value === 'panel-desc') {
    entries.sort((a, b) => maxPanel(b.characters) - maxPanel(a.characters))
  } else if (sortMode.value === 'panel-asc') {
    entries.sort((a, b) => maxPanel(a.characters) - maxPanel(b.characters))
  } else {
    entries.sort((a, b) => firstCreated(a.characters) - firstCreated(b.characters))
  }
  return entries
})

function maxPanel(rows) {
  return rows.reduce((max, r) => Math.max(max, r.panel ?? -1), -1)
}

function firstCreated(rows) {
  return rows.reduce((min, r) => Math.min(min, r.createdAt), Number.MAX_SAFE_INTEGER)
}

/* ------------------------- 登记 ------------------------- */

function handleSubmit(payload, { isEdit, reset }) {
  if (isEdit && editing.value) {
    updateCharacter(editing.value.id, payload)
    editing.value = null
    toast(`已更新：${payload.player} · ${payload.name}`, 'success')
    return
  }

  const duplicate = findDuplicate(payload.player, payload.name)
  if (duplicate) {
    const overwrite = window.confirm(
      `玩家「${payload.player}」下已经登记过角色「${payload.name}」。\n\n· 如果是同一个角色重新填写 → 点「确定」覆盖原记录\n· 如果是另一个同名角色 → 点「取消」，把称呼改得更区分（如「${payload.name}2」）`,
    )
    if (!overwrite) {
      toast('已取消，未覆盖原记录', 'warn')
      return
    }
    updateCharacter(duplicate.id, payload)
    toast(`已覆盖：${payload.player} · ${payload.name}`, 'success')
    reset?.()
    return
  }

  addCharacter(payload)
  toast(`登记成功：${payload.player} · ${payload.name}`, 'success')
  reset?.()
}

function handleEdit(row) {
  editing.value = row
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handlePrefill(row) {
  editing.value = null
  formRef.value?.prefill(row)
  toast(`已把「${row.name}」填入表单，可修改后提交`, 'info')
}

function handleRemove(row) {
  if (!window.confirm(`确定删除「${row.player} · ${row.name}」这条登记吗？`)) return
  removeCharacter(row.id)
  if (editing.value?.id === row.id) editing.value = null
  toast('已删除 1 条登记', 'info')
}

function handleRemovePlayer(player) {
  const count = characters.value.filter((c) => c.player === player).length
  if (!window.confirm(`确定删除玩家「${player}」的全部 ${count} 个角色登记吗？`)) return
  characters.value
    .filter((c) => c.player === player)
    .map((c) => c.id)
    .forEach((id) => removeCharacter(id))
  toast(`已删除「${player}」的 ${count} 条登记`, 'info')
}

function handleClear() {
  if (!characters.value.length) return
  if (!window.confirm(`确定清空全部 ${characters.value.length} 条登记数据吗？（不可撤销，建议先导出 Excel）`)) return
  clearAll()
  editing.value = null
  toast('已清空全部登记数据', 'warn')
}

function resetFilters() {
  filters.value = { keyword: '', type: 'all', difficulty: 'all' }
}

/* ------------------------- 导入 ------------------------- */

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    const parsed = await parseExcelFile(file)
    if (!parsed.characters.length) {
      toast('没有从文件中识别出角色数据，请确认表头包含「归属玩家」「角色称呼」', 'error')
      return
    }
    if (characters.value.length) {
      importModal.value = {
        open: true,
        fileName: file.name,
        rows: parsed.characters,
        skipped: parsed.skipped,
        skipDuplicate: false,
      }
    } else {
      replaceAll(parsed.characters)
      toast(`导入完成：${parsed.characters.length} 个角色`, 'success')
    }
  } catch (err) {
    console.error(err)
    toast(`导入失败：${err.message || err}`, 'error')
  }
}

function applyImport(mode) {
  const { rows } = importModal.value
  if (mode === 'replace') {
    replaceAll(rows)
    editing.value = null
    toast(`已覆盖导入 ${rows.length} 个角色`, 'success')
  } else {
    const { added, duplicated } = appendMany(rows, { skipDuplicate: importModal.value.skipDuplicate })
    toast(
      `追加导入 ${added} 个角色${duplicated ? `，按设置跳过重复 ${duplicated} 个` : ''}`,
      'success',
    )
  }
  importModal.value.open = false
}

/* ------------------------- 导出 ------------------------- */

function handleExport() {
  try {
    const name = exportCharactersToExcel(characters.value, playerStats.value)
    toast(`已保存并下载：${name}`, 'success', 3600)
  } catch (err) {
    toast(err.message || '导出失败', 'error')
  }
}

function handleExportFiltered() {
  try {
    const rows = filtered.value
    const byPlayer = new Map()
    for (const c of rows) {
      const row = byPlayer.get(c.player) || { player: c.player, total: 0, c: 0, n: 0, normal: 0, hard: 0 }
      row.total += 1
      if (c.type === 'C') row.c += 1
      else row.n += 1
      if (c.difficulty === '困难团') row.hard += 1
      else row.normal += 1
      byPlayer.set(c.player, row)
    }
    const name = exportCharactersToExcel(
      rows,
      [...byPlayer.values()].sort((a, b) => b.total - a.total),
    )
    toast(`已导出当前筛选结果（${rows.length} 条）：${name}`, 'success', 3600)
  } catch (err) {
    toast(err.message || '导出失败', 'error')
  }
}
</script>

<template>
  <div class="reg">
    <header class="card reg-head">
      <div class="reg-head__text">
        <h2>角色登记</h2>
        <p>
          登记每位玩家的输出C与辅助奶角色，标注普通团 / 困难团，一键保存为 Excel 存档。
          数据同时保存在本机浏览器中，关闭页面不会丢失。
        </p>
      </div>
      <div class="reg-head__actions">
        <input ref="fileInput" data-testid="input-file" type="file" accept=".xlsx,.xls,.csv" hidden @change="onFileChange" />
        <button class="btn btn--ghost" @click="pickFile">导入 Excel</button>
        <button class="btn btn--primary" data-testid="btn-export" @click="handleExport">保存到 Excel（下载）</button>
        <button class="btn btn--danger-ghost" :disabled="!characters.length" @click="handleClear">清空</button>
      </div>
    </header>

    <main class="layout">
      <CharacterForm
        ref="formRef"
        :editing="editing"
        :players="players"
        :keep-context="keepContext"
        @update:keep-context="keepContext = $event"
        @submit="handleSubmit"
        @cancel="editing = null"
      />

      <div class="content">
        <StatsPanel :stats="stats" :player-stats="playerStats" />

        <section class="card">
          <header class="toolbar">
            <div class="toolbar__filters">
              <input
                v-model="filters.keyword"
                data-testid="input-search"
                class="search"
                type="search"
                placeholder="搜索玩家或角色称呼…"
              />
              <select v-model="filters.type">
                <option value="all">全部类型</option>
                <option v-for="t in CHAR_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
              <select v-model="filters.difficulty">
                <option value="all">全部难度</option>
                <option v-for="d in DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
              </select>
              <select v-model="sortMode">
                <option v-for="s in SORT_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
              <button v-if="hasFilter" class="btn btn--tiny btn--ghost" @click="resetFilters">重置筛选</button>
            </div>
            <div class="toolbar__info">
              <span class="muted">
                显示 {{ filtered.length }} / {{ characters.length }} 条
              </span>
              <button
                v-if="hasFilter"
                class="btn btn--tiny btn--ghost"
                @click="handleExportFiltered"
              >
                导出筛选结果
              </button>
            </div>
          </header>

          <CharacterTable
            :groups="groups"
            :visible-count="filtered.length"
            @edit="handleEdit"
            @prefill="handlePrefill"
            @remove="handleRemove"
            @remove-player="handleRemovePlayer"
          />
        </section>
      </div>
    </main>

    <!-- 导入方式选择 -->
    <div v-if="importModal.open" class="modal-mask" @click.self="importModal.open = false">
      <div class="modal">
        <h3>导入 Excel</h3>
        <p class="modal__file">{{ importModal.fileName }}</p>
        <p class="modal__text">
          已解析出 <strong>{{ importModal.rows.length }}</strong> 个角色，
          当前已有 <strong>{{ characters.length }}</strong> 条登记数据。
          <template v-if="importModal.skipped">（另有 {{ importModal.skipped }} 行无效数据已跳过）</template>
        </p>
        <label class="modal__check">
          <input v-model="importModal.skipDuplicate" type="checkbox" data-testid="check-skip-dup" />
          <span>跳过与现有数据重复的记录（同一玩家+同一角色称呼）</span>
        </label>
        <p class="modal__text muted">
          默认全部保留：同一位玩家可能有多个同名角色（例如两个「奶萝」）。
          「覆盖导入」会先清空现有数据。
        </p>
        <div class="modal__actions">
          <button class="btn btn--primary" @click="applyImport('append')">追加导入</button>
          <button class="btn btn--danger-ghost" @click="applyImport('replace')">覆盖导入</button>
          <button class="btn btn--ghost" @click="importModal.open = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reg {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reg-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.reg-head__text h2 {
  margin: 0 0 6px;
  font-size: 19px;
  letter-spacing: 0.5px;
}

.reg-head__text p {
  margin: 0;
  max-width: 660px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-dim);
}

.reg-head__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.layout {
  display: grid;
  grid-template-columns: minmax(320px, 380px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.toolbar__filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar__filters select,
.toolbar__filters input {
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.toolbar__filters select:focus,
.toolbar__filters input:focus {
  border-color: var(--accent);
}

.search {
  min-width: 200px;
}

.toolbar__info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.muted {
  color: var(--text-dim);
}

.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 8, 14, 0.7);
  backdrop-filter: blur(3px);
  padding: 20px;
}

.modal {
  width: min(460px, 100%);
  padding: 22px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
}

.modal h3 {
  margin: 0 0 6px;
  font-size: 17px;
}

.modal__file {
  margin: 0 0 12px;
  font-size: 12.5px;
  color: var(--accent);
  word-break: break-all;
}

.modal__text {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-soft);
}

.modal__check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0 6px;
  font-size: 13px;
  color: var(--text-soft);
  cursor: pointer;
}

.modal__check input {
  width: 16px;
  height: 16px;
  flex: none;
  accent-color: var(--accent);
}

.modal__actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
  flex-wrap: wrap;
}

@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .form-card {
    position: static;
  }
}
</style>
