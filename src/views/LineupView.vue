<script setup>
import { computed, onMounted, ref } from 'vue'
import WaveRow from '../components/lineup/WaveRow.vue'
import TeamSettings from '../components/lineup/TeamSettings.vue'
import BenchPanel from '../components/lineup/BenchPanel.vue'
import ImportModal from '../components/ImportModal.vue'
import { DIFFICULTIES, MAX_WAVES, RAID_SIZE, TEAM_LAYOUTS, TEAMS, waveName } from '../constants.js'
import { useLineup } from '../composables/useLineup.js'
import { useDataTransfer } from '../composables/useDataTransfer.js'
import { useToast } from '../composables/useToast.js'
import { DISPLAY_FORMATS, characterText } from '../utils/display.js'
import { teamSummary } from '../utils/lineup.js'

const emit = defineEmits(['go-registration'])

const {
  state,
  byId,
  teamConfigs,
  defaultPoolStats,
  bench,
  warnings,
  overallStats,
  assignAll,
  assignWave,
  addWave,
  removeWave,
  clearAllWaves,
  setWaveDifficulty,
  setDefaultDifficulty,
  setDisplayFormat,
  setGlobalLayout,
  setTeamLayout,
  setRange,
  applySuggestedRanges,
  resetRanges,
  transfer,
  swapHealSlots,
} = useLineup()
const { toast } = useToast()
const dataTransfer = useDataTransfer()

const fileInput = ref(null)
const dragSource = ref(null)
const selected = ref(null)
const showWarnings = ref(false)

/** 每波每队的统计（合计伤害 / 目标 / 空位） */
const waveStats = computed(() =>
  state.waves.map((wave) => {
    const map = {}
    for (const team of TEAMS) {
      const config = teamConfigs.value.find((t) => t.id === team.id)
      map[team.id] = teamSummary(wave.teams[team.id] || [], byId.value, config?.cTotalRange)
    }
    return map
  }),
)

const waveAssigned = computed(() =>
  state.waves.map((wave) =>
    TEAMS.reduce((sum, t) => sum + (wave.teams[t.id] || []).filter((s) => s.characterId).length, 0),
  ),
)

const waveWarnCount = computed(() => {
  const counts = state.waves.map(() => 0)
  for (const w of warnings.value) {
    if (typeof w.waveIndex === 'number' && counts[w.waveIndex] !== undefined) counts[w.waveIndex] += 1
  }
  return counts
})

const sortedWarnings = computed(() => {
  const rank = { error: 0, warn: 1, info: 2 }
  return [...warnings.value].sort((a, b) => rank[a.level] - rank[b.level])
})

const errorCount = computed(() => warnings.value.filter((w) => w.level === 'error').length)
const layoutMeta = computed(() => TEAM_LAYOUTS.find((l) => l.value === state.globalLayout))
const overallLabel = computed(
  () => `已排 ${overallStats.value.used} / ${overallStats.value.totalCharacters} 人 · 共 ${overallStats.value.waves} 波`,
)

const assignedAtLabel = computed(() => {
  if (!state.assignedAt) return '尚未排表'
  const d = new Date(state.assignedAt)
  const p = (n) => String(n).padStart(2, '0')
  return `上次排表 ${p(d.getHours())}:${p(d.getMinutes())}`
})

const formatSample = computed(() => {
  for (const wave of state.waves) {
    for (const list of Object.values(wave.teams)) {
      const slot = list.find((s) => s.characterId)
      if (slot) return characterText(byId.value.get(slot.characterId), state.displayFormat)
    }
  }
  return DISPLAY_FORMATS.find((f) => f.value === state.displayFormat)?.sample
})

onMounted(() => {
  if (
    !state.assignedAt &&
    overallStats.value.used === 0 &&
    state.waves.length <= 1 &&
    overallStats.value.totalCharacters
  ) {
    assignAll()
  }
})

/* ------------------------- 顶部操作 ------------------------- */

function runAssignAll() {
  if (!overallStats.value.totalCharacters) {
    toast('还没有登记任何角色，先去登记吧', 'error')
    return
  }
  selected.value = null
  const result = assignAll()
  toast(`已按难度排完 ${result.waves} 波，共上场 ${result.assigned} 个角色`, 'success', 3600)
}

function handleAddWave() {
  const result = addWave()
  toast(result.message, result.ok ? 'success' : 'warn')
}

function handleClearAll() {
  if (!overallStats.value.used) return
  if (!window.confirm('确定清空所有波次的上场角色吗？（波次与区间配置会保留）')) return
  clearAllWaves()
  selected.value = null
  toast('已清空全部波次', 'warn')
}

function handleGlobalLayout(value) {
  if (state.globalLayout === value) return
  setGlobalLayout(value)
  toast(`全局配置切换为 ${TEAM_LAYOUTS.find((l) => l.value === value)?.short}`, 'info')
}

/* ------------------------- 单波操作 ------------------------- */

function handleWaveDifficulty(index, difficulty) {
  setWaveDifficulty(index, difficulty)
  selected.value = null
  toast(`${waveName(index)}已切换为${difficulty}，点该行「重排」重新分配`, 'info')
}

function handleReassign(index) {
  selected.value = null
  const result = assignWave(index)
  toast(`${waveName(index)}已重新分配（上场 ${result.assigned} 人）`, 'success')
}

function handleRemoveWave(index) {
  if (!window.confirm(`确定删除${waveName(index)}吗？该波角色会回到未登场列表。`)) return
  const result = removeWave(index)
  selected.value = null
  toast(result.message, 'info')
}

/* ------------------------- 拖拽 / 点击 ------------------------- */

function doTransfer(from, to) {
  const result = transfer(from, to)
  if (result.message) toast(result.message, result.ok ? 'success' : 'error')
  return result.ok
}

function onDragStart(payload) {
  dragSource.value = payload
  selected.value = null
}

function onDragEnd() {
  dragSource.value = null
}

function onSlotDrop(waveIndex, teamId, index) {
  if (!dragSource.value) return
  doTransfer(dragSource.value, { kind: 'slot', waveIndex, teamId, index })
  dragSource.value = null
}

function onDropBench() {
  if (!dragSource.value) return
  if (dragSource.value.kind === 'slot') doTransfer(dragSource.value, { kind: 'bench' })
  dragSource.value = null
}

function onSlotClick(waveIndex, teamId, index) {
  const slot = state.waves[waveIndex]?.teams[teamId]?.[index]
  if (!slot) return
  const current = selected.value
  if (current) {
    const same =
      current.kind === 'slot' &&
      current.waveIndex === waveIndex &&
      current.teamId === teamId &&
      current.index === index
    if (same) {
      selected.value = null
      return
    }
    doTransfer(current, { kind: 'slot', waveIndex, teamId, index })
    selected.value = null
    return
  }
  if (!slot.characterId) return
  selected.value = { kind: 'slot', waveIndex, teamId, index }
}

function onBenchSelect(characterId) {
  const current = selected.value
  if (current) {
    if (current.kind === 'slot') {
      doTransfer(current, { kind: 'bench' })
      selected.value = null
      return
    }
    if (current.characterId === characterId) {
      selected.value = null
      return
    }
  }
  selected.value = { kind: 'bench', characterId }
}

function removeSlotAt(waveIndex, teamId, index) {
  selected.value = null
  const result = transfer({ kind: 'slot', waveIndex, teamId, index }, { kind: 'bench' })
  if (result.message) toast(result.message, result.ok ? 'success' : 'error')
}

function handleSwapHeals(teamId) {
  const waveIndex = state.waves.findIndex((wave) => {
    const heals = (wave.teams[teamId] || []).filter((s) => s.role === 'N')
    if (heals.length < 2 || !heals.every((s) => s.characterId)) return false
    const first = byId.value.get(heals[0].characterId)
    const second = byId.value.get(heals[1].characterId)
    return first && second && Number(second.panel) > Number(first.panel)
  })
  if (waveIndex === -1) return
  const result = swapHealSlots(waveIndex, teamId)
  if (result.message) toast(result.message, result.ok ? 'success' : 'warn')
}

/* ------------------------- 导入 / 导出 ------------------------- */

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (file) await dataTransfer.pickAndParse(file)
}

function handleExport() {
  dataTransfer.download()
}
</script>

<template>
  <div class="lineup">
    <section class="card bar">
      <div class="bar__group">
        <span class="bar__label">新波次默认难度</span>
        <div class="segment">
          <button
            v-for="d in DIFFICULTIES"
            :key="d"
            class="segment__btn"
            :class="{ 'segment__btn--active': state.defaultDifficulty === d }"
            :data-testid="`btn-default-difficulty-${d}`"
            @click="setDefaultDifficulty(d)"
          >
            {{ d }}
          </button>
        </div>
      </div>

      <div class="bar__group">
        <span class="bar__label">全局队伍配置</span>
        <select
          class="bar__select"
          data-testid="select-global-layout"
          :value="state.globalLayout"
          @change="handleGlobalLayout($event.target.value)"
        >
          <option v-for="l in TEAM_LAYOUTS" :key="l.value" :value="l.value">{{ l.label }}（{{ l.short }}）</option>
        </select>
      </div>

      <div class="bar__group bar__group--actions">
        <button class="btn btn--primary" data-testid="btn-assign" @click="runAssignAll">一键排完全部波次</button>
        <button class="btn" data-testid="btn-add-wave" :disabled="state.waves.length >= MAX_WAVES" @click="handleAddWave">
          + 添加波次
        </button>
        <input
          ref="fileInput"
          data-testid="input-file-lineup"
          type="file"
          accept=".xlsx,.xls,.csv"
          hidden
          @change="onFileChange"
        />
        <button class="btn" data-testid="btn-import-lineup" @click="pickFile">导入 Excel</button>
        <button class="btn" data-testid="btn-export-lineup" @click="handleExport">导出 Excel</button>
        <button
          class="btn btn--danger-ghost"
          data-testid="btn-clear-lineup"
          :disabled="!overallStats.used"
          @click="handleClearAll"
        >
          清空全部
        </button>
      </div>

      <div class="bar__status">
        <span class="status" data-testid="overall-count">{{ overallLabel }}</span>
        <span class="muted">{{ assignedAtLabel }}</span>
        <span v-if="state.configDirty" class="status status--warn" data-testid="config-dirty">配置已变更，建议重新排波</span>
        <span v-if="layoutMeta" class="muted">每队 {{ layoutMeta.short }}</span>
      </div>

      <div class="bar__format">
        <span class="bar__label">显示格式</span>
        <div class="tags" data-testid="format-tags">
          <button
            v-for="f in DISPLAY_FORMATS"
            :key="f.value"
            class="tag-btn"
            :class="{ 'tag-btn--active': state.displayFormat === f.value }"
            :data-testid="`format-${f.value}`"
            @click="setDisplayFormat(f.value)"
          >
            {{ f.label }}
          </button>
        </div>
        <span class="format-sample">示例：{{ formatSample }}</span>
        <span class="format-legend">
          <span class="legend legend--n">辅助奶 绿色</span>
          <span class="legend legend--c">输出C 蓝色</span>
        </span>
      </div>
    </section>

    <TeamSettings
      :team-configs="teamConfigs"
      :global-layout="state.globalLayout"
      :pool-stats="defaultPoolStats"
      :difficulty="state.defaultDifficulty"
      @team-layout="setTeamLayout"
      @range="setRange"
      @auto-band="applySuggestedRanges(); toast('已按当前难度角色池自动分档（含合计伤害目标），可手动微调', 'success')"
      @reset-ranges="resetRanges(); toast('已清空区间配置', 'info')"
    />

    <section class="card waves">
      <header class="waves__head">
        <h2>全部波次</h2>
        <span class="muted">
          每行一波：红 / 黄 / 绿三组人员一屏看全。拖拽或「先点一个位置、再点目标位置」都能换人，跨波次也可以。
        </span>
        <button
          class="btn btn--tiny"
          :class="{ 'btn--warn': errorCount }"
          data-testid="btn-toggle-warnings"
          @click="showWarnings = !showWarnings"
        >
          编队检查 {{ warnings.length ? `(${warnings.length})` : '通过' }} {{ showWarnings ? '▲' : '▼' }}
        </button>
      </header>

      <div v-if="showWarnings" class="warns" data-testid="lineup-warnings">
        <ul v-if="sortedWarnings.length">
          <li v-for="(w, i) in sortedWarnings.slice(0, 20)" :key="i" :class="`lv-${w.level}`">
            <span class="lv-tag">{{ w.level === 'error' ? '必须处理' : w.level === 'warn' ? '注意' : '提示' }}</span>
            {{ w.message }}
          </li>
        </ul>
        <p v-else class="muted">没有发现问题：每队都有奶、没有空位、合计伤害在目标范围内。</p>
        <p v-if="sortedWarnings.length > 20" class="muted">还有 {{ sortedWarnings.length - 20 }} 条…</p>
      </div>

      <div v-if="!overallStats.totalCharacters" class="empty-state">
        <p>还没有登记任何角色。</p>
        <button class="btn btn--primary" @click="emit('go-registration')">去登记角色</button>
      </div>

      <div v-else class="waves__list" data-testid="waves-list">
        <WaveRow
          v-for="(wave, index) in state.waves"
          :key="wave.id"
          :wave="wave"
          :index="index"
          :name="waveName(index)"
          :teams="teamConfigs"
          :stats="waveStats[index]"
          :by-id="byId"
          :display-format="state.displayFormat"
          :selected="selected"
          :drag-active="Boolean(dragSource)"
          :difficulty-options="DIFFICULTIES"
          :assigned="waveAssigned[index]"
          :total="RAID_SIZE"
          :warn-count="waveWarnCount[index]"
          @slot-click="onSlotClick"
          @slot-drop="onSlotDrop"
          @drag-start="onDragStart"
          @drag-end="onDragEnd"
          @remove-slot="removeSlotAt"
          @swap-heals="handleSwapHeals"
          @change-difficulty="handleWaveDifficulty"
          @reassign="handleReassign"
          @remove-wave="handleRemoveWave"
        />
      </div>
    </section>

    <BenchPanel
      :bench="bench"
      :total-characters="overallStats.totalCharacters"
      :assigned-count="overallStats.used"
      :capacity="overallStats.waves * RAID_SIZE"
      @drag-start="onDragStart"
      @drag-end="onDragEnd"
      @drop-bench="onDropBench"
      @select="onBenchSelect"
    />

    <ImportModal />
  </div>
</template>

<style scoped>
.lineup {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bar {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.bar__group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar__group--actions {
  margin-left: auto;
}

.bar__label {
  font-size: 12.5px;
  color: var(--text-dim);
}

.bar__select {
  padding: 8px 10px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-size: 13px;
  outline: none;
}

.segment {
  display: inline-flex;
  padding: 2px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-input);
}

.segment__btn {
  padding: 6px 14px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.segment__btn--active {
  background: linear-gradient(180deg, #f4d28b, #dda63f);
  color: #241a05;
  font-weight: 600;
}

.bar__status {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  flex-wrap: wrap;
  width: 100%;
  border-top: 1px dashed var(--border);
  padding-top: 9px;
}

.bar__format {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}

.tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag-btn {
  padding: 4px 11px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}

.tag-btn:hover {
  color: var(--accent);
  border-color: rgba(240, 198, 116, 0.5);
}

.tag-btn--active {
  color: #241a05;
  border-color: rgba(240, 198, 116, 0.6);
  background: linear-gradient(180deg, #f4d28b, #dda63f);
  font-weight: 600;
}

.format-sample {
  font-size: 12px;
  color: var(--text-dim);
}

.format-legend {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.legend {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  border: 1px solid transparent;
}

.legend--n {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.1);
}

.legend--c {
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(96, 165, 250, 0.1);
}

.status {
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid rgba(74, 222, 128, 0.4);
  background: rgba(34, 197, 94, 0.1);
  color: #86efac;
  font-variant-numeric: tabular-nums;
}

.status--warn {
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.1);
  color: #fde68a;
}

.muted {
  color: var(--text-dim);
}

.waves__head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.waves__head h2 {
  margin: 0;
  font-size: 16px;
}

.waves__head .btn {
  margin-left: auto;
}

.btn--warn {
  border-color: rgba(251, 191, 36, 0.5);
  color: #fde68a;
}

.waves__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.warns {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.015);
}

.warns ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.warns li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-soft);
}

.lv-tag {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border);
  color: var(--text-dim);
}

.lv-error .lv-tag {
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.5);
  background: rgba(239, 68, 68, 0.12);
}

.lv-warn .lv-tag {
  color: #fde68a;
  border-color: rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.1);
}

.lv-info .lv-tag {
  color: #93c5fd;
  border-color: rgba(96, 165, 250, 0.4);
  background: rgba(59, 130, 246, 0.1);
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.empty-state p {
  margin: 0;
  color: var(--text-dim);
}
</style>
