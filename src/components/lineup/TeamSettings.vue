<script setup>
import { computed } from 'vue'
import { LAYOUT_OPTIONS } from '../../constants.js'

const props = defineProps({
  teamConfigs: { type: Array, default: () => [] },
  globalLayout: { type: String, default: '1n3c' },
  poolStats: { type: Object, default: () => ({ total: 0, c: 0, n: 0 }) },
  difficulty: { type: String, default: '' },
})

const emit = defineEmits(['team-layout', 'range', 'auto-band', 'reset-ranges'])

const globalLabel = computed(() => {
  const meta = LAYOUT_OPTIONS.find((l) => l.value === props.globalLayout)
  return meta ? meta.short : ''
})

function onRangeInput(teamId, role, bound, event) {
  emit('range', teamId, role, bound, event.target.value)
}

function layoutSelectValue(team) {
  return team.ownLayout === null || team.ownLayout === undefined ? 'global' : team.ownLayout
}

function onLayoutChange(teamId, event) {
  const value = event.target.value
  emit('team-layout', teamId, value === 'global' ? null : value)
}
</script>

<template>
  <section class="card settings">
    <header class="settings__head">
      <div>
        <h2>队伍统一配置</h2>
        <p class="muted">
          三队统一生效、所有波次共用。<strong>C 单角色区间</strong>是准入档位，<strong>C 合计伤害</strong>是整队目标：
          总和达标即可，优先挑「刚好凑够」的角色，避免强 C 堆在一队造成伤害过剩。区间内没人时用剩余角色兜底补位并标记区间外。
        </p>
      </div>
      <div class="settings__actions">
        <button class="btn btn--tiny" data-testid="btn-auto-band" @click="emit('auto-band')">按当前角色自动分档</button>
        <button class="btn btn--tiny btn--ghost" @click="emit('reset-ranges')">清空区间</button>
      </div>
    </header>

    <div class="rows">
      <div v-for="team in teamConfigs" :key="team.id" class="row" :style="{ '--team-color': team.color }">
        <div class="row__team">
          <span class="dot" />
          <strong>{{ team.name }}</strong>
        </div>

        <label class="cell">
          <span class="cell__label">队内配置</span>
          <select
            :data-testid="`layout-${team.id}`"
            :value="layoutSelectValue(team)"
            @change="onLayoutChange(team.id, $event)"
          >
            <option value="global">跟随全局（{{ globalLabel }}）</option>
            <option v-for="l in LAYOUT_OPTIONS" :key="l.value" :value="l.value" :title="l.desc">
              {{ l.short }}（{{ l.label }}）
            </option>
          </select>
        </label>

        <label class="cell">
          <span class="cell__label">C 单角色区间</span>
          <span class="range">
            <input
              type="number"
              placeholder="最低"
              :data-testid="`range-${team.id}-C-min`"
              :value="team.cRange.min ?? ''"
              @input="onRangeInput(team.id, 'C', 'min', $event)"
            />
            <em>~</em>
            <input
              type="number"
              placeholder="不限"
              :data-testid="`range-${team.id}-C-max`"
              :value="team.cRange.max ?? ''"
              @input="onRangeInput(team.id, 'C', 'max', $event)"
            />
          </span>
        </label>

        <label class="cell cell--total">
          <span class="cell__label">C 合计伤害（总和目标）</span>
          <span class="range">
            <input
              type="number"
              placeholder="最低"
              :data-testid="`range-${team.id}-TOTAL-min`"
              :value="team.cTotalRange.min ?? ''"
              @input="onRangeInput(team.id, 'TOTAL', 'min', $event)"
            />
            <em>~</em>
            <input
              type="number"
              placeholder="不限"
              :data-testid="`range-${team.id}-TOTAL-max`"
              :value="team.cTotalRange.max ?? ''"
              @input="onRangeInput(team.id, 'TOTAL', 'max', $event)"
            />
          </span>
        </label>

        <label class="cell">
          <span class="cell__label">奶增益区间</span>
          <span class="range">
            <input
              type="number"
              placeholder="最低"
              :data-testid="`range-${team.id}-N-min`"
              :value="team.nRange.min ?? ''"
              @input="onRangeInput(team.id, 'N', 'min', $event)"
            />
            <em>~</em>
            <input
              type="number"
              placeholder="不限"
              :data-testid="`range-${team.id}-N-max`"
              :value="team.nRange.max ?? ''"
              @input="onRangeInput(team.id, 'N', 'max', $event)"
            />
          </span>
        </label>
      </div>
    </div>

    <p class="settings__foot">
      当前波次角色池（{{ difficulty }}）：输出C {{ poolStats.c }} 个 · 辅助奶 {{ poolStats.n }} 个。填「最低」不填「最高」表示上不封顶；
      两个都空表示不限。合计伤害只统计该队 C 的伤害总和。
    </p>
  </section>
</template>

<style scoped>
.settings__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.settings__head h2 {
  margin: 0 0 4px;
  font-size: 17px;
}

.muted {
  margin: 0;
  max-width: 880px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-dim);
}

.muted strong {
  color: var(--text-soft);
}

.settings__actions {
  display: flex;
  gap: 8px;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: grid;
  grid-template-columns: 92px minmax(168px, 0.9fr) minmax(178px, 1.1fr) minmax(196px, 1.2fr) minmax(178px, 1.1fr);
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--team-color);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.015);
}

.row__team {
  display: flex;
  align-items: center;
  gap: 8px;
}

.row__team strong {
  color: var(--team-color);
  letter-spacing: 1px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--team-color);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.cell__label {
  font-size: 11.5px;
  color: var(--text-dim);
}

.cell--total .cell__label {
  color: var(--accent);
}

select,
input {
  padding: 7px 9px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--bg-input);
  color: var(--text);
  font-size: 13px;
  outline: none;
  width: 100%;
}

.cell--total input {
  border-color: rgba(240, 198, 116, 0.35);
}

select:focus,
input:focus {
  border-color: var(--accent);
}

.range {
  display: flex;
  align-items: center;
  gap: 6px;
}

.range em {
  color: var(--text-dim);
  font-style: normal;
}

.settings__foot {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--text-dim);
}

@media (max-width: 1300px) {
  .row {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
