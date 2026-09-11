<script setup>
import { computed, onMounted, ref } from 'vue'
import TeamCard from '../components/lineup/TeamCard.vue'
import TeamSettings from '../components/lineup/TeamSettings.vue'
import BenchPanel from '../components/lineup/BenchPanel.vue'
import { DIFFICULTIES, RAID_SIZE, TEAM_LAYOUTS } from '../constants.js'
import { useLineup } from '../composables/useLineup.js'
import { useToast } from '../composables/useToast.js'
import { exportLineupToExcel } from '../utils/excel.js'

const emit = defineEmits(['go-registration'])

const {
  state,
  byId,
  pool,
  poolStats,
  slotsMap,
  teamConfigs,
  bench,
  warnings,
  teamStats,
  assignedCount,
  assign,
  clearSlots,
  setDifficulty,
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

const errors = computed(() => warnings.value.filter((w) => w.level === 'error'))
const others = computed(() => warnings.value.filter((w) => w.level !== 'error'))
const layoutMeta = computed(() => TEAM_LAYOUTS.find((l) => l.value === state.globalLayout))

const assignedLabel = computed(() => `${assignedCount.value}/${RAID_SIZE}`)

const assignedAtLabel = computed(() => {
  if (!state.assignedAt) return '尚未分配'
  const d = new Date(state.assignedAt)
  const p = (n) => String(n).padStart(2, '0')
  return `上次分配 ${p(d.getHours())}:${p(d.getMinutes())}`
})

onMounted(() => {
  // 首次进入且还没排过：自动按当前配置分配一次
  if (!state.assignedAt && assignedCount.value === 0 && pool.value.length) {
    assign()
  }
})

function runAssign() {
  if (!pool.value.length) {
    toast(`${state.difficulty}还没有登记任何角色，先去登记吧`, 'error')
    return
  }
  assign()
  selected.value = null
  toast(`已按当前配置完成分配（上场 ${assignedCount.value} 人）`, 'success')
}

function handleClear() {
  if (!assignedCount.value) return
  if (!window.confirm('确定清空当前编队吗？（区间配置会保留）')) return
  clearSlots()
  selected.value = null
  toast('已清空编队', 'info')
}

function handleDifficulty(value) {
  if (state.difficulty === value) return
  setDifficulty(value)
  selected.value = null
  toast(`本波切换为${value}，建议点「一键智能分配」重新分配`, 'info')
}

function handleGlobalLayout(value) {
  if (state.globalLayout === value) return
  setGlobalLayout(value)
  toast(`全局配置切换为 ${TEAM_LAYOUTS.find((l) => l.value === value)?.short}`, 'info')
}

/* ------------------------- 拖拽 / 点击移动 ------------------------- */

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
  doTransfer(dragSource.value, { kind: 'slot', teamId, index })
  dragSource.value = null
}

function onDropBench() {
  if (!dragSource.value) return
  if (dragSource.value.kind === 'slot') doTransfer(dragSource.value, { kind: 'bench' })
  dragSource.value = null
}

function onSlotClick(teamId, index) {
  const slot = state.teams[teamId].slots[index]
  if (selected.value) {
    const same =
      selected.value.kind === 'slot' && selected.value.teamId === teamId && selected.value.index === index
    if (same) {
      selected.value = null
      return
    }
    doTransfer(selected.value, { kind: 'slot', teamId, index })
    selected.value = null
    return
  }
  if (!slot.characterId) return
  selected.value = { kind: 'slot', teamId, index }
}

function onBenchSelect(characterId) {
  if (selected.value) {
    if (selected.value.kind === 'slot') {
      // 选中场上角色后点候补 = 下场
      doTransfer(selected.value, { kind: 'bench' })
      selected.value = null
      return
    }
    if (selected.value.characterId === characterId) {
      selected.value = null
      return
    }
  }
  selected.value = { kind: 'bench', characterId }
}

function handleSwapHeals(teamId) {
  const result = swapHealSlots(teamId)
  if (result.message) toast(result.message, result.ok ? 'success' : 'warn')
}

function handleExport() {
  if (!assignedCount.value) {
    toast('还没有分配角色，无法导出编队', 'error')
    return
  }
  try {
    const name = exportLineupToExcel({
      difficulty: state.difficulty,
      teamConfigs: teamConfigs.value,
      slotsMap: slotsMap.value,
      byId: byId.value,
      bench: bench.value,
    })
    toast(`已导出编队：${name}`, 'success', 3600)
  } catch (err) {
    toast(err.message || '导出失败', 'error')
  }
}
</script>

<template>
  <div class="lineup">
    <section class="card bar">
      <div class="bar__group">
        <span class="bar__label">本波团本</span>
        <div class="segment" data-testid="segment-difficulty">
          <button
            v-for="d in DIFFICULTIES"
            :key="d"
            class="segment__btn"
            :class="{ 'segment__btn--active': state.difficulty === d }"
            :data-testid="`btn-difficulty-${d}`"
            @click="handleDifficulty(d)"
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
        <button class="btn btn--primary" data-testid="btn-assign" @click="runAssign">一键智能分配</button>
        <button class="btn" data-testid="btn-export-lineup" @click="handleExport">导出编队 Excel</button>
        <button class="btn btn--danger-ghost" data-testid="btn-clear-lineup" :disabled="!assignedCount" @click="handleClear">
          清空编队
        </button>
      </div>

      <div class="bar__status">
        <span class="status" data-testid="assigned-count">上场 {{ assignedLabel }}</span>
        <span class="muted">{{ assignedAtLabel }}</span>
        <span v-if="state.configDirty" class="status status--warn" data-testid="config-dirty">
          配置已变更，建议重新分配
        </span>
        <span v-if="layoutMeta" class="muted">每队 {{ layoutMeta.short }}</span>
      </div>
    </section>

    <TeamSettings
      :team-configs="teamConfigs"
      :global-layout="state.globalLayout"
      :pool-stats="poolStats"
      @team-layout="setTeamLayout"
      @range="setRange"
      @auto-band="applySuggestedRanges(); toast('已按当前角色池自动分档，可手动微调', 'success')"
      @reset-ranges="resetRanges(); toast('已清空区间配置', 'info')"
    />

    <section v-if="warnings.length" class="card warns" data-testid="lineup-warnings">
      <div class="warns__head">
        <h3>编队检查</h3>
        <span class="muted">{{ warnings.length }} 条提示</span>
      </div>
      <ul>
        <li v-for="(w, i) in [...errors, ...others].slice(0, 8)" :key="i" :class="`lv-${w.level}`">
          <span class="lv-tag">{{ w.level === 'error' ? '必须处理' : w.level === 'warn' ? '注意' : '提示' }}</span>
          {{ w.message }}
        </li>
      </ul>
      <p v-if="warnings.length > 8" class="muted">还有 {{ warnings.length - 8 }} 条…</p>
    </section>

    <div v-if="!poolStats.total" class="card empty-state">
      <p>{{ state.difficulty }}还没有登记任何角色。</p>
      <button class="btn btn--primary" @click="emit('go-registration')">去登记角色</button>
    </div>

    <div v-else class="teams-grid">
      <TeamCard
        v-for="team in teamConfigs"
        :key="team.id"
        :team="team"
        :slots="slotsMap[team.id]"
        :stats="teamStats[team.id]"
        :by-id="byId"
        :difficulty="state.difficulty"
        :selected="selected"
        :drag-active="Boolean(dragSource)"
        @slot-click="onSlotClick"
        @slot-drop="onSlotDrop"
        @drag-start="onDragStart"
        @drag-end="onDragEnd"
        @swap-heals="handleSwapHeals"
      />
    </div>

    <BenchPanel
      v-if="poolStats.total"
      :bench="bench"
      :pool-stats="poolStats"
      :assigned-count="assignedCount"
      :raid-size="RAID_SIZE"
      :difficulty="state.difficulty"
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
  gap: 20px;
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

.warns__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.warns__head h3 {
  margin: 0;
  font-size: 15px;
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
