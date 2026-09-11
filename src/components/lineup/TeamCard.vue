<script setup>
import { computed } from 'vue'
import { HEAL_SLOT_LABELS } from '../../constants.js'
import { formatNumber } from '../../utils/lineup.js'
import { ROLE_COLORS, characterParts } from '../../utils/display.js'

const props = defineProps({
  team: { type: Object, required: true },
  slots: { type: Array, default: () => [] },
  stats: { type: Object, default: () => ({}) },
  byId: { type: Map, default: () => new Map() },
  difficulty: { type: String, default: '' },
  waveIndex: { type: Number, default: 0 },
  displayFormat: { type: String, default: 'player-name-value' },
  selected: { type: Object, default: null },
  dragActive: { type: Boolean, default: false },
})

const emit = defineEmits(['slot-click', 'slot-drop', 'drag-start', 'drag-end', 'swap-heals', 'remove-slot'])

const healCount = computed(() => props.slots.filter((s) => s.role === 'N').length)

const healIndexes = computed(() => {
  let n = 0
  return props.slots.map((s) => (s.role === 'N' ? n++ : -1))
})

const healOrderWarning = computed(() => {
  if (healCount.value < 2) return false
  const heals = props.slots.filter((s) => s.role === 'N')
  const [a, b] = heals
  if (!a?.characterId || !b?.characterId) return false
  const first = props.byId.get(a.characterId)
  const second = props.byId.get(b.characterId)
  return Boolean(first && second && Number(second.panel) > Number(first.panel))
})

const totalState = computed(() => {
  const s = props.stats || {}
  if (!s.cTargetReady) return { kind: 'none', text: '' }
  if (s.cUnder) return { kind: 'under', text: '低于合计下限' }
  if (s.cOver) return { kind: 'over', text: '超出上限（伤害过剩）' }
  return { kind: 'ok', text: '合计达标' }
})

function positionLabel(slot, index) {
  if (slot.role === 'C') return '输出C'
  if (healCount.value >= 2) return HEAL_SLOT_LABELS[healIndexes.value[index]] || '辅助奶'
  return '辅助奶'
}

function positionHint(slot, index) {
  if (slot.role === 'C') return '站街伤害'
  if (healCount.value >= 2 && healIndexes.value[index] === 1) return '能放觉醒即可'
  return healCount.value >= 2 ? '常驻 buff' : '增益'
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

function isSelected(teamId, index) {
  return (
    props.selected &&
    props.selected.kind === 'slot' &&
    (props.selected.waveIndex ?? 0) === props.waveIndex &&
    props.selected.teamId === teamId &&
    props.selected.index === index
  )
}

function onDragStart(event, slot, index) {
  if (!slot.characterId) {
    event.preventDefault()
    return
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', `${props.team.id}:${index}`)
  emit('drag-start', { kind: 'slot', teamId: props.team.id, index })
}
</script>

<template>
  <section class="team" :style="{ '--team-color': team.color, '--team-soft': team.soft }">
    <header class="team__head">
      <span class="dot" />
      <h3>{{ team.name }}</h3>
      <span class="layout">{{ team.layout === '2n2c' ? '双奶 2奶2C' : '单奶 1奶3C' }}</span>
      <span class="filled" :class="{ 'filled--bad': stats.empty }">{{ stats.filled || 0 }}/{{ stats.total || 4 }}</span>
    </header>

    <div class="slots">
      <div
        v-for="(slot, index) in slots"
        :key="index"
        class="slot"
        :data-testid="`slot-${team.id}-${index}`"
        :class="{
          'slot--empty': !slot.characterId,
          'slot--heal': slot.role === 'N',
          'slot--c': slot.role === 'C',
          'slot--out': slot.outOfRange,
          'slot--selected': isSelected(team.id, index),
          'slot--drop': dragActive,
        }"
        :draggable="Boolean(slot.characterId)"
        @dragstart="onDragStart($event, slot, index)"
        @dragend="emit('drag-end')"
        @dragover.prevent
        @drop.prevent="emit('slot-drop', team.id, index)"
        @click="emit('slot-click', team.id, index)"
      >
        <div class="slot__head">
          <span class="pos">{{ positionLabel(slot, index) }}</span>
          <span class="pos-hint">{{ positionHint(slot, index) }}</span>
          <button
            v-if="slot.characterId"
            class="slot__remove"
            title="移出该位置（回到候补区）"
            @click.stop="emit('remove-slot', team.id, index)"
          >
            ✕
          </button>
        </div>

        <template v-if="characterOf(slot)">
          <div class="slot__main">
            <span v-for="(part, i) in partsOf(slot)" :key="i" :style="partStyle(part, characterOf(slot))">
              {{ part.text }}
            </span>
          </div>
          <div class="slot__flags">
            <span v-if="slot.outOfRange" class="flag flag--out">区间外</span>
            <span v-if="characterOf(slot).difficulty !== difficulty" class="flag flag--warn">难度不符</span>
          </div>
        </template>
        <template v-else>
          <div class="slot__empty">空位</div>
          <div class="slot__hint">拖入候补角色，或点这里再点候补角色</div>
        </template>
      </div>
    </div>

    <footer class="team__foot">
      <span class="foot__total">
        C 合计 <strong :class="`is-${totalState.kind}`">{{ formatNumber(stats.cTotal || 0) }}</strong>
        <template v-if="stats.cTargetReady">
          <span class="foot__target">
            / 目标 {{ stats.cTarget.min === null ? '不限' : formatNumber(stats.cTarget.min) }} ~
            {{ stats.cTarget.max === null ? '不限' : formatNumber(stats.cTarget.max) }}
          </span>
          <span class="foot__state" :class="`is-${totalState.kind}`">{{ totalState.text }}</span>
        </template>
      </span>
      <span v-if="stats.cCount" class="foot__misc">C 均 {{ formatNumber(stats.cAverage) }}</span>
      <span v-if="stats.healCount" class="foot__misc">奶均 {{ formatNumber(stats.nAverage) }}</span>
      <span v-if="stats.outOfRange" class="foot__misc is-out">{{ stats.outOfRange }} 个区间外</span>
    </footer>

    <button v-if="healOrderWarning" class="heal-swap" @click="emit('swap-heals', team.id)">
      ⚠ 太阳奶面板高于常驻奶，点此互换两个奶位
    </button>
  </section>
</template>

<style scoped>
.team {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-top: 3px solid var(--team-color);
  border-radius: 14px;
  background: linear-gradient(180deg, var(--team-soft), transparent 42%), var(--bg-card);
}

.team__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.team__head h3 {
  margin: 0;
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--team-color);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--team-color);
  box-shadow: 0 0 10px var(--team-color);
}

.layout {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--text-dim);
  border: 1px solid var(--border);
}

.filled {
  margin-left: auto;
  font-size: 12.5px;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
}

.filled--bad {
  color: #fca5a5;
}

.slots {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.slot {
  padding: 9px 11px;
  border-radius: 11px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  cursor: grab;
  transition: border-color 0.15s, background 0.15s;
}

.slot:active {
  cursor: grabbing;
}

.slot--heal {
  border-left: 3px solid #34d399;
}

.slot--c {
  border-left: 3px solid #60a5fa;
}

.slot--empty {
  border-style: dashed;
  background: rgba(255, 255, 255, 0.015);
  cursor: default;
}

.slot--out {
  border-color: rgba(251, 146, 60, 0.55);
}

.slot--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(240, 198, 116, 0.25);
}

.slot--drop:hover {
  border-color: var(--team-color);
  background: rgba(255, 255, 255, 0.04);
}

.slot__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.pos {
  font-size: 11.5px;
  color: var(--text-dim);
}

.pos-hint {
  font-size: 11px;
  color: rgba(139, 151, 172, 0.7);
}

.slot__remove {
  margin-left: auto;
  padding: 0 5px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.slot:hover .slot__remove {
  opacity: 1;
}

.slot__remove:hover {
  color: #fca5a5;
}

.slot__main {
  font-size: 14px;
  line-height: 1.45;
  word-break: break-all;
}

.slot__empty {
  font-size: 13px;
  color: var(--text-dim);
}

.slot__hint {
  font-size: 11.5px;
  color: rgba(139, 151, 172, 0.75);
}

.slot__flags {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.flag {
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  border: 1px solid transparent;
}

.flag--out {
  color: #fdba74;
  border-color: rgba(251, 146, 60, 0.45);
  background: rgba(251, 146, 60, 0.12);
}

.flag--warn {
  color: #fca5a5;
  border-color: rgba(248, 113, 113, 0.45);
  background: rgba(248, 113, 113, 0.12);
}

.team__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--text-dim);
}

.team__foot strong {
  font-variant-numeric: tabular-nums;
  color: var(--text-soft);
}

.foot__target {
  font-variant-numeric: tabular-nums;
}

.foot__state {
  margin-left: 4px;
}

.is-ok {
  color: #34d399 !important;
}

.is-under {
  color: #fde68a !important;
}

.is-over {
  color: #fca5a5 !important;
}

.is-none {
  color: var(--text-soft) !important;
}

.foot__misc.is-out {
  color: #fdba74;
}

.heal-swap {
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid rgba(251, 191, 36, 0.5);
  background: rgba(251, 191, 36, 0.1);
  color: #fde68a;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}
</style>
