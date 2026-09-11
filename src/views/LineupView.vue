<script setup>
import { computed, onMounted, ref } from 'vue'
import TeamCard from '../components/lineup/TeamCard.vue'
import TeamSettings from '../components/lineup/TeamSettings.vue'
import BenchPanel from '../components/lineup/BenchPanel.vue'
import { DIFFICULTIES, MAX_WAVES, RAID_SIZE, TEAM_LAYOUTS } from '../constants.js'
import { useLineup } from '../composables/useLineup.js'
import { useToast } from '../composables/useToast.js'
import { DISPLAY_FORMATS, characterText } from '../utils/display.js'
import { exportLineupToExcel } from '../utils/excel.js'

const emit = defineEmits(['go-registration'])

const {
  state,
  byId,
  teamConfigs,
  activeIndex,
  activeWave,
  activePoolStats,
  activeSlots,
  activeAssignedCount,
  bench,
  activeWarnings,
  otherWarnings,
  teamStats,
  waveSummaries,
  overallStats,
  assignAll,
  assignWave,
  addWave,
  removeWave,
  clearWave,
  clearAllWaves,
  setActiveWave,
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

const dragSource = ref(null)
const selected = ref(null)

const warnings = computed(() => activeWarnings.value)
const sortedWarnings = computed(() => {
  const rank = { error: 0, warn: 1, info: 2 }
  return [...warnings.value].sort((a, b) => rank[a.level] - rank[b.level])
})

const layoutMeta = computed(() => TEAM_LAYOUTS.find((l) => l.value === state.globalLayout))
const activeSummary = computed(() => waveSummaries.value[activeIndex.value])

const overallLabel = computed(
  () => `已将 ${overallStats.value.used} / ${overallStats.value.totalCharacters} 个角色排入 ${overallStats.value.waves} 波`,
)

const assignedAtLabel = computed(() => {
  if (!state.assignedAt) return '尚未分配'
  const d = new Date(state.assignedAt)
  const p = (n) => String(n).padStart(2, '0')
  return `上次分配 ${p(d.getHours())}:${p(d.getMinutes())}`
})

onMounted(() => {
  if (!state.assignedAt && overallStats.value.used === 0 && state.waves.length <= 1 && activePoolStats.value.total) {
    assignAll()
  }
})

function runAssignAll() {
  if (!overallStats.value.totalCharacters) {
    toast('还没有登记任何角色，先去登记吧', 'error')
    return
  }
  selected.value = null
  const result = assignAll()
  toast(`已按难度排完 ${result.waves} 波，共上场 ${result.assigned} 个角色`, 'success', 3600)
}

function runAssignWave() {
  if (!activePoolStats.value.total) {
    toast(`${activeWave.value.difficulty}还没有登记任何角色`, 'error')
    return
  }
  selected.value = null
  const result = assignWave(activeIndex.value)
  toast(`已重新分配${activeSummary.value.name}（上场 ${result.assigned} 人）`, 'success')
}

function handleAddWave() {
  const result = addWave()
  toast(result.message, result.ok ? 'success' : 'warn')
}

function handleRemoveWave() {
  if (state.waves.length === 1) {
    if (!window.confirm('这是最后一波，确定清空这一波的角色吗？')) return
    clearWave(activeIndex.value)
    toast('已清空当前波次', 'info')
    return
  }
  if (!window.confirm(`确定删除${activeSummary.value.name}吗？`)) return
  const result = removeWave(activeIndex.value)
  toast(result.message, 'info')
}

function handleClearAll() {
  if (!overallStats.value.used) return
  if (!window.confirm('确定清空所有波次的上场角色吗？（波次与区间配置会保留）')) return
  clearAllWaves()
  selected.value = null
  toast('已清空全部波次', 'warn')
}

function handleDifficulty(value) {
  if (activeWave.value.difficulty === value) return
  setWaveDifficulty(activeIndex.value, value)
  selected.value = null
  toast(`${activeSummary.value.name}已切换为${value}，建议点「重新分配本波」`, 'info')
}

function handleGlobalLayout(value) {
  if (state.globalLayout === value) return
  setGlobalLayout(value)
  toast(`全局配置切换为 ${TEAM_LAYOUTS.find((l) => l.value === value)?.short}`, 'info')
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

function onSlotDrop(teamId, index) {
  if (!dragSource.value) return
  doTransfer(dragSource.value, { kind: 'slot', waveIndex: activeIndex.value, teamId, index })
  dragSource.value = null
}

function onDropBench() {
  if (!dragSource.value) return
  if (dragSource.value.kind === 'slot') {
    doTransfer(dragSource.value, { kind: 'bench' })
  }
  dragSource.value = null
}

function onSlotClick(teamId, index) {
  const slot = activeSlots.value[teamId][index]
  const current = selected.value
  if (current) {
    const same =
      current.kind === 'slot' &&
      (current.waveIndex ?? activeIndex.value) === activeIndex.value &&
      current.teamId === teamId &&
      current.index === index
    if (same) {
      selected.value = null
      return
    }
    doTransfer(
      current.kind === 'slot' ? { ...current, waveIndex: current.waveIndex ?? activeIndex.value } : current,
      { kind: 'slot', waveIndex: activeIndex.value, teamId, index },
    )
    selected.value = null
    return
  }
  if (!slot.characterId) return
  selected.value = { kind: 'slot', waveIndex: activeIndex.value, teamId, index }
}

function onBenchSelect(characterId) {
  const current = selected.value
  if (current) {
    if (current.kind === 'slot') {
      doTransfer({ ...current, waveIndex: current.waveIndex ?? activeIndex.value }, { kind: 'bench' })
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

function onRemoveSlot(teamId, index) {
  selected.value = null
  const result = transfer({ kind: 'slot', waveIndex: activeIndex.value, teamId, index }, { kind: 'bench' })
  if (result.message) toast(result.message, result.ok ? 'success' : 'error')
}

function handleSwapHeals(teamId) {
  const result = swapHealSlots(activeIndex.value, teamId)
  if (result.message) toast(result.message, result.ok ? 'success' : 'warn')
}

function handleExport() {
  if (!overallStats.value.used) {
    toast('还没有分配角色，无法导出编队', 'error')
    return
  }
  try {
    const name = exportLineupToExcel({
      waves: state.waves,
      teamConfigs: teamConfigs.value,
      byId: byId.value,
      bench: bench.value,
      difficulty: state.defaultDifficulty,
    })
    toast(`已导出编队：${name}`, 'success', 3600)
  } catch (err) {
    toast(err.message || '导出失败', 'error')
  }
}

const formatSample = computed(() => {
  const sample = activeSlots.value.red?.find((s) => s.characterId)
  const character = sample ? byId.value.get(sample.characterId) : null
  return character ? characterText(character, state.displayFormat) : DISPLAY_FORMATS.find((f) => f.value === state.displayFormat)?.sample
})
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
          <option v-for="l in TEAM_LAYOUTS" :key="l.value" :value="l.value">
            {{ l.label }}（{{ l.short }}）
          </option>
        </select>
      </div>

      <div class="bar__group bar__group--actions">
        <button class="btn btn--primary" data-testid="btn-assign" @click="runAssignAll">一键排完全部波次</button>
        <button class="btn" data-testid="btn-export-lineup" @click="handleExport">导出编队 Excel</button>
        <button class="btn btn--danger-ghost" data-testid="btn-clear-lineup" :disabled="!overallStats.used" @click="handleClearAll">
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
        <span class="format-sample">
          示例：<span class="sample-name">龙神</span> → {{ formatSample }}
        </span>
        <span class="format-legend">
          <span class="legend legend--n">辅助奶 绿色</span>
          <span class="legend legend--c">输出C 蓝色</span>
        </span>
      </div>
    </section>

    <!-- 波次页签 -->
    <section class="card waves">
      <div class="waves__head">
        <h2>波次</h2>
        <span class="muted">按难度依次把角色排进第一波、第二波……排不下的留在候补区，空位可手动补人</span>
        <button class="btn btn--tiny" data-testid="btn-add-wave" :disabled="state.waves.length >= MAX_WAVES" @click="handleAddWave">
          + 添加波次
        </button>
      </div>
      <div class="waves__tabs" data-testid="wave-tabs">
        <button
          v-for="w in waveSummaries"
          :key="w.index"
          class="wave-tab"
          :class="{ 'wave-tab--active': w.index === activeIndex }"
          :data-testid="`wave-tab-${w.index}`"
          @click="setActiveWave(w.index)"
        >
          <span class="wave-tab__name">{{ w.name }}</span>
          <span class="wave-tab__count" :class="{ 'is-bad': w.assigned < w.total }">{{ w.assigned }}/{{ w.total }}</span>
          <span class="wave-tab__diff">{{ w.difficulty === '困难团' ? '困难' : '普通' }}</span>
          <span v-if="w.missingHeal" class="wave-tab__warn" title="有队伍缺奶">缺奶</span>
        </button>
      </div>
    </section>

    <section class="card wave-bar">
      <div class="wave-bar__group">
        <span class="bar__label">{{ activeSummary?.name }}难度</span>
        <div class="segment">
          <button
            v-for="d in DIFFICULTIES"
            :key="d"
            class="segment__btn"
            :class="{ 'segment__btn--active': activeWave.difficulty === d }"
            :data-testid="`btn-wave-difficulty-${d}`"
            @click="handleDifficulty(d)"
          >
            {{ d }}
          </button>
        </div>
      </div>
      <div class="wave-bar__group">
        <span class="status" data-testid="assigned-count">本波上场 {{ activeAssignedCount }}/{{ RAID_SIZE }}</span>
        <span class="muted">角色池：输出C {{ activePoolStats.c }} · 辅助奶 {{ activePoolStats.n }}</span>
      </div>
      <div class="wave-bar__actions">
        <button class="btn btn--tiny" data-testid="btn-assign-wave" @click="runAssignWave">重新分配本波</button>
        <button class="btn btn--tiny btn--danger-ghost" data-testid="btn-remove-wave" @click="handleRemoveWave">
          删除本波
        </button>
      </div>
    </section>

    <TeamSettings
      :team-configs="teamConfigs"
      :global-layout="state.globalLayout"
      :pool-stats="activePoolStats"
      :difficulty="activeWave.difficulty"
      @team-layout="setTeamLayout"
      @range="setRange"
      @auto-band="applySuggestedRanges(); toast('已按当前难度角色池自动分档（含合计伤害目标），可手动微调', 'success')"
      @reset-ranges="resetRanges(); toast('已清空区间配置', 'info')"
    />

    <section v-if="sortedWarnings.length || otherWarnings.length" class="card warns" data-testid="lineup-warnings">
      <div class="warns__head">
        <h3>{{ activeSummary?.name }}编队检查</h3>
        <span class="muted">{{ sortedWarnings.length }} 条提示</span>
        <span v-if="otherWarnings.length" class="muted other">
          其他波次还有 {{ otherWarnings.length }} 条提示
        </span>
      </div>
      <ul>
        <li v-for="(w, i) in sortedWarnings.slice(0, 8)" :key="i" :class="`lv-${w.level}`">
          <span class="lv-tag">{{ w.level === 'error' ? '必须处理' : w.level === 'warn' ? '注意' : '提示' }}</span>
          {{ w.message }}
        </li>
      </ul>
      <p v-if="sortedWarnings.length > 8" class="muted">还有 {{ sortedWarnings.length - 8 }} 条…</p>
    </section>

    <div v-if="!activePoolStats.total" class="card empty-state">
      <p>{{ activeWave.difficulty }}还没有登记任何角色。</p>
      <button class="btn btn--primary" @click="emit('go-registration')">去登记角色</button>
    </div>

    <div v-else class="teams-grid">
      <TeamCard
        v-for="team in teamConfigs"
        :key="team.id"
        :team="team"
        :slots="activeSlots[team.id]"
        :stats="teamStats[team.id]"
        :by-id="byId"
        :difficulty="activeWave.difficulty"
        :wave-index="activeIndex"
        :display-format="state.displayFormat"
        :selected="selected"
        :drag-active="Boolean(dragSource)"
        @slot-click="onSlotClick"
        @slot-drop="onSlotDrop"
        @drag-start="onDragStart"
        @drag-end="onDragEnd"
        @swap-heals="handleSwapHeals"
        @remove-slot="onRemoveSlot"
      />
    </div>

    <BenchPanel
      v-if="activePoolStats.total"
      :bench="bench"
      :pool-stats="activePoolStats"
      :assigned-count="activeAssignedCount"
      :raid-size="RAID_SIZE"
      :difficulty="activeWave.difficulty"
      :wave-name="activeSummary?.name"
      @drag-start="onDragStart"
      @drag-end="onDragEnd"
      @drop-bench="onDropBench"
      @select="onBenchSelect"
    />
  </div>
</template>

<style scoped>
.lineup {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  padding-top: 10px;
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

.sample-name {
  color: #60a5fa;
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

/* ---- 波次 ---- */
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

.waves__tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.wave-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-dim);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.wave-tab:hover {
  border-color: rgba(240, 198, 116, 0.5);
  color: var(--accent);
}

.wave-tab--active {
  border-color: rgba(240, 198, 116, 0.65);
  background: rgba(240, 198, 116, 0.12);
  color: var(--accent);
}

.wave-tab__count {
  font-size: 11.5px;
  color: #86efac;
  font-variant-numeric: tabular-nums;
}

.wave-tab__count.is-bad {
  color: #fca5a5;
}

.wave-tab__diff {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid var(--border);
}

.wave-tab__warn {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  color: #fca5a5;
  border: 1px solid rgba(248, 113, 113, 0.45);
}

/* ---- 当前波工具条 ---- */
.wave-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}

.wave-bar__group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wave-bar__actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

/* ---- 检查 ---- */
.warns__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.warns__head h3 {
  margin: 0;
  font-size: 15px;
}

.warns__head .other {
  margin-left: auto;
}

.warns ul {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.warns li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
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

.teams-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .teams-grid {
    grid-template-columns: 1fr;
  }

  .bar__group--actions {
    margin-left: 0;
  }
}
</style>
