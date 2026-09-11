<script setup>
import { computed } from 'vue'
import { HEAL_SLOT_LABELS } from '../../constants.js'
import { formatNumber } from '../../utils/lineup.js'
import { ROLE_COLORS, characterParts } from '../../utils/display.js'

const props = defineProps({
  wave: { type: Object, required: true },
  index: { type: Number, required: true },
  name: { type: String, default: '' },
  teams: { type: Array, default: () => [] },
  stats: { type: Object, default: () => ({}) },
  byId: { type: Map, default: () => new Map() },
  displayFormat: { type: String, default: 'player-name-value' },
  selected: { type: Object, default: null },
  dragActive: { type: Boolean, default: false },
  difficultyOptions: { type: Array, default: () => [] },
  assigned: { type: Number, default: 0 },
  total: { type: Number, default: 12 },
  warnCount: { type: Number, default: 0 },
  /** 算法自动改配置的说明：{ teamId: '原因' } */
  notes: { type: Object, default: () => ({}) },
  globalLayout: { type: String, default: 'auto' },
})

const emit = defineEmits([
  'slot-click',
  'slot-drop',
  'drag-start',
  'drag-end',
  'remove-slot',
  'swap-heals',
  'change-difficulty',
  'reassign',
  'remove-wave',
])

const healOrderWarning = computed(() => {
  for (const team of props.teams) {
    const heals = (props.wave.teams[team.id] || []).filter((s) => s.role === 'N')
    if (heals.length < 2 || !heals.every((s) => s.characterId)) continue
    const first = props.byId.get(heals[0].characterId)
    const second = props.byId.get(heals[1].characterId)
    if (first && second && Number(second.panel) > Number(first.panel)) return team
  }
  return null
})

/** 该队实际用了几个奶位（自动配置下每波可能不同） */
function actualLayout(teamId) {
  const list = props.wave.teams[teamId] || []
  return list.filter((s) => s.role === 'N').length >= 2 ? '2n2c' : '1n3c'
}

function layoutText(teamId) {
  return actualLayout(teamId) === '2n2c' ? '2奶2C' : '1奶3C'
}

function isAutoPicked(teamId) {
  return actualLayout(teamId) === '2n2c' && props.notes?.[teamId]
}

function noteOf(teamId) {
  return props.notes?.[teamId] || ''
}

function characterOf(slot) {
  return slot.characterId ? props.byId.get(slot.characterId) : null
}

function partsOf(slot) {
  return characterParts(characterOf(slot), props.displayFormat)
}

function partStyle(part, character) {
  if (!character || !character.type) return {}
  const color = ROLE_COLORS[character.type] || 'inherit'
  if (part.kind === 'name') return { color, fontWeight: 600 }
  if (part.kind === 'value') return { color, opacity: 0.9 }
  return {}
}

/** 紧凑位标：奶 / 常 / 太 / C */
function slotBadge(slot, index, teamId) {
  if (slot.role === 'C') return 'C'
  const list = props.wave.teams[teamId] || []
  const heals = list.filter((s) => s.role === 'N')
  if (heals.length >= 2) {
    const healIndex = list.slice(0, index).filter((s) => s.role === 'N').length
    return healIndex === 0 ? '常' : '太'
  }
  return '奶'
}

function slotBadgeTitle(slot, index, teamId) {
  if (slot.role === 'C') return '输出C（站街伤害）'
  const list = props.wave.teams[teamId] || []
  const heals = list.filter((s) => s.role === 'N')
  if (heals.length >= 2) {
    const healIndex = list.slice(0, index).filter((s) => s.role === 'N').length
    return HEAL_SLOT_LABELS[healIndex] || '辅助奶'
  }
  return '辅助奶'
}

function isSelected(teamId, slotIndex) {
  const current = props.selected
  return (
    current &&
    current.kind === 'slot' &&
    current.waveIndex === props.index &&
    current.teamId === teamId &&
    current.index === slotIndex
  )
}

function onDragStart(event, slot, teamId, slotIndex) {
  if (!slot.characterId) {
    event.preventDefault()
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', `${props.index}:${teamId}:${slotIndex}`)
  emit('drag-start', { kind: 'slot', waveIndex: props.index, teamId, index: slotIndex })
}

function teamTotal(teamId) {
  return props.stats[teamId] || {}
}
</script>

<template>
  <div class="wave-row" :data-testid="`wave-row-${index}`">
    <div class="wave-meta">
      <div class="wave-meta__top">
        <span class="wave-name">{{ name }}</span>
        <span class="wave-count" :class="{ 'is-bad': assigned < total }" :data-testid="`wave-count-${index}`">
          {{ assigned }}/{{ total }}
        </span>
        <span v-if="warnCount" class="wave-warn" :title="`${warnCount} 条检查提示`">⚠ {{ warnCount }}</span>
      </div>
      <select
        class="wave-diff"
        :data-testid="`wave-difficulty-${index}`"
        :value="wave.difficulty"
        @change="emit('change-difficulty', index, $event.target.value)"
      >
        <option v-for="d in difficultyOptions" :key="d" :value="d">{{ d }}</option>
      </select>
      <div class="wave-actions">
        <button class="btn btn--tiny btn--ghost" :data-testid="`btn-assign-wave-${index}`" @click="emit('reassign', index)">
          重排
        </button>
        <button class="btn btn--tiny btn--danger-ghost" :data-testid="`btn-remove-wave-${index}`" @click="emit('remove-wave', index)">
          删
        </button>
      </div>
    </div>

    <div
      v-for="team in teams"
      :key="team.id"
      class="team-group"
      :style="{ '--team-color': team.color, '--team-soft': team.soft }"
    >
      <header class="team-group__head">
        <span class="dot" />
        <strong>{{ team.name }}</strong>
        <span class="team-group__layout" :class="{ 'is-auto': isAutoPicked(team.id) }" :title="noteOf(team.id)">
          {{ layoutText(team.id) }}<template v-if="isAutoPicked(team.id)">·自动</template>
        </span>
        <span class="team-group__count" :class="{ 'is-bad': teamTotal(team.id).empty }">
          {{ teamTotal(team.id).filled || 0 }}/{{ teamTotal(team.id).total || 4 }}
        </span>
        <span
          class="team-group__sum"
          :class="`is-${teamTotal(team.id).cTargetReady ? (teamTotal(team.id).cUnder ? 'under' : teamTotal(team.id).cOver ? 'over' : 'ok') : 'none'}`"
          :title="`C 合计伤害 / 目标区间${actualLayout(team.id) === '2n2c' ? '（双奶按 2/3 折算）' : ''}`"
        >
          合计 {{ formatNumber(teamTotal(team.id).cTotal || 0) }}
          <template v-if="teamTotal(team.id).cTargetReady">
            /{{ teamTotal(team.id).cTarget.min === null ? '不限' : formatNumber(teamTotal(team.id).cTarget.min) }}~{{
              teamTotal(team.id).cTarget.max === null ? '不限' : formatNumber(teamTotal(team.id).cTarget.max)
            }}
          </template>
        </span>
      </header>

      <div class="slots">
        <div
          v-for="(slot, slotIndex) in wave.teams[team.id]"
          :key="slotIndex"
          class="mini-slot"
          :data-testid="`slot-${index}-${team.id}-${slotIndex}`"
          :class="{
            'mini-slot--empty': !slot.characterId,
            'mini-slot--out': slot.outOfRange,
            'mini-slot--selected': isSelected(team.id, slotIndex),
            'mini-slot--drop': dragActive,
          }"
          :draggable="Boolean(slot.characterId)"
          @dragstart="onDragStart($event, slot, team.id, slotIndex)"
          @dragend="emit('drag-end')"
          @dragover.prevent
          @drop.prevent="emit('slot-drop', index, team.id, slotIndex)"
          @click="emit('slot-click', index, team.id, slotIndex)"
        >
          <span class="badge" :class="slot.role === 'N' ? 'badge--n' : 'badge--c'" :title="slotBadgeTitle(slot, slotIndex, team.id)">
            {{ slotBadge(slot, slotIndex, team.id) }}
          </span>
          <span v-if="characterOf(slot)" class="mini-slot__text">
            <span v-for="(part, i) in partsOf(slot)" :key="i" :style="partStyle(part, characterOf(slot))">{{ part.text }}</span>
          </span>
          <span v-else class="mini-slot__empty">空位</span>
          <span v-if="slot.outOfRange" class="flag flag--out">区间外</span>
          <button
            v-if="slot.characterId"
            class="mini-slot__remove"
            title="移出该位置（回到未登场）"
            @click.stop="emit('remove-slot', index, team.id, slotIndex)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="healOrderWarning" class="wave-tip">
    ⚠ {{ name }}{{ healOrderWarning.name }}的太阳奶面板高于常驻奶，
    <button class="link" @click="emit('swap-heals', healOrderWarning.id)">点此互换两个奶位</button>
  </div>
</template>

<style scoped>
.wave-row {
  display: grid;
  grid-template-columns: 132px repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.012);
}

.wave-row + .wave-row {
  margin-top: 8px;
}

.wave-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 8px;
  border-right: 1px dashed var(--border);
}

.wave-meta__top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.wave-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  letter-spacing: 0.5px;
}

.wave-count {
  font-size: 11.5px;
  color: #86efac;
  font-variant-numeric: tabular-nums;
}

.wave-count.is-bad {
  color: #fca5a5;
}

.wave-warn {
  font-size: 11px;
  color: #fde68a;
}

.wave-diff {
  padding: 4px 6px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text-soft);
  font-size: 12px;
  outline: none;
}

.wave-actions {
  display: flex;
  gap: 5px;
}

.team-group {
  min-width: 0;
  padding-left: 8px;
  border-left: 2px solid var(--team-color);
}

.team-group__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 11.5px;
}

.team-group__head strong {
  color: var(--team-color);
  font-size: 12.5px;
  letter-spacing: 0.5px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--team-color);
}

.team-group__layout {
  padding: 0 6px;
  border-radius: 999px;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 10.5px;
}

.team-group__layout.is-auto {
  color: var(--accent);
  border-color: rgba(240, 198, 116, 0.5);
  background: rgba(240, 198, 116, 0.1);
  cursor: help;
}

.team-group__count {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.team-group__count.is-bad {
  color: #fca5a5;
}

.team-group__sum {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.team-group__sum.is-ok {
  color: #34d399;
}

.team-group__sum.is-under {
  color: #fde68a;
}

.team-group__sum.is-over {
  color: #fca5a5;
}

.slots {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mini-slot {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.022);
  font-size: 12.5px;
  cursor: grab;
  min-width: 0;
}

.mini-slot:active {
  cursor: grabbing;
}

.mini-slot--empty {
  border-style: dashed;
  border-color: var(--border);
  color: var(--text-dim);
  cursor: default;
}

.mini-slot--out {
  background: rgba(251, 146, 60, 0.1);
}

.mini-slot--selected {
  border-color: var(--accent);
  background: rgba(240, 198, 116, 0.12);
}

.mini-slot--drop:hover {
  border-color: var(--team-color);
}

.mini-slot__text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-slot__empty {
  font-size: 11.5px;
}

.mini-slot__remove {
  margin-left: auto;
  padding: 0 4px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  opacity: 0;
}

.mini-slot:hover .mini-slot__remove {
  opacity: 1;
}

.mini-slot__remove:hover {
  color: #fca5a5;
}

.badge {
  flex: none;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 5px;
  font-size: 10.5px;
  border: 1px solid transparent;
}

.badge--n {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.45);
  background: rgba(52, 211, 153, 0.12);
}

.badge--c {
  color: #60a5fa;
  border-color: rgba(96, 165, 250, 0.45);
  background: rgba(96, 165, 250, 0.12);
}

.flag {
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 10px;
}

.flag--out {
  color: #fdba74;
  border: 1px solid rgba(251, 146, 60, 0.45);
}

.wave-tip {
  margin-top: 4px;
  font-size: 11.5px;
  color: #fde68a;
}

.link {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 11.5px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}

@media (max-width: 1000px) {
  .wave-row {
    grid-template-columns: 1fr;
  }

  .wave-meta {
    border-right: none;
    border-bottom: 1px dashed var(--border);
    padding-bottom: 6px;
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
  }
}
</style>
