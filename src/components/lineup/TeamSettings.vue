<script setup>
import { computed } from 'vue'
import { HEAL_POLICIES, SLOT_DEFS } from '../../constants.js'

defineProps({
  teamConfigs: { type: Array, default: () => [] },
  poolStats: { type: Object, default: () => ({ total: 0, c: 0, n: 0 }) },
  difficulty: { type: String, default: '' },
})

const emit = defineEmits(['heal-policy', 'range', 'auto-band', 'reset-ranges'])

const policyOptions = computed(() => HEAL_POLICIES)
const slotLabel = (key) => SLOT_DEFS.find((d) => d.key === key)?.label || key

function onRangeInput(teamId, key, bound, event) {
  emit('range', teamId, key, bound, event.target.value)
}

function onPolicyChange(teamId, event) {
  emit('heal-policy', teamId, event.target.value)
}

function rangeOf(team, key) {
  return team.ranges?.[key] || { min: null, max: null }
}
</script>

<template>
  <section class="card settings">
    <header class="settings__head">
      <div>
        <h2>队伍统一配置（按位置填写）</h2>
        <p class="muted">
          每个位置单独设面板区间，算法<strong>严格按区间匹配</strong>：区间内没角色就留空，不会硬塞区间外的角色（要补人手动拖即可）。
          <strong>伤害目标</strong>用来判断「伤害够了」：C位1 + C位2 合计达到目标时，第 4 位自动补<strong>太阳奶</strong>（双奶），否则放 C位3。
        </p>
      </div>
      <div class="settings__actions">
        <button class="btn btn--tiny" data-testid="btn-auto-band" @click="emit('auto-band')">按角色池填一版门槛</button>
        <button class="btn btn--tiny btn--ghost" @click="emit('reset-ranges')">清空区间</button>
      </div>
    </header>

    <div class="rows">
      <div
        v-for="team in teamConfigs"
        :key="team.id"
        class="team-config"
        :style="{ '--team-color': team.color }"
        :data-testid="`config-${team.id}`"
      >
        <div class="team-config__name">
          <span class="dot" />
          <strong>{{ team.name }}</strong>
          <select
            class="policy"
            :data-testid="`policy-${team.id}`"
            :value="team.healPolicy"
            @change="onPolicyChange(team.id, $event)"
          >
            <option v-for="p in policyOptions" :key="p.value" :value="p.value" :title="p.desc">
              {{ p.short }}
            </option>
          </select>
        </div>

        <label v-for="key in ['heal1', 'heal2']" :key="key" class="cell cell--heal">
          <span class="cell__label">{{ slotLabel(key) }}</span>
          <span class="range">
            <input
              type="number"
              placeholder="最低"
              :data-testid="`range-${team.id}-${key}-min`"
              :value="rangeOf(team, key).min ?? ''"
              @input="onRangeInput(team.id, key, 'min', $event)"
            />
            <em>~</em>
            <input
              type="number"
              placeholder="不限"
              :data-testid="`range-${team.id}-${key}-max`"
              :value="rangeOf(team, key).max ?? ''"
              @input="onRangeInput(team.id, key, 'max', $event)"
            />
          </span>
        </label>

        <label class="cell cell--total">
          <span class="cell__label">伤害目标（C1+C2 达标就补太阳奶）</span>
          <span class="range">
            <input
              type="number"
              placeholder="最低"
              :data-testid="`range-${team.id}-total-min`"
              :value="team.total.min ?? ''"
              @input="onRangeInput(team.id, 'total', 'min', $event)"
            />
            <em>~</em>
            <input
              type="number"
              placeholder="不限"
              :data-testid="`range-${team.id}-total-max`"
              :value="team.total.max ?? ''"
              @input="onRangeInput(team.id, 'total', 'max', $event)"
            />
          </span>
        </label>

        <label v-for="key in ['c1', 'c2', 'c3']" :key="key" class="cell cell--c">
          <span class="cell__label">{{ slotLabel(key) }}</span>
          <span class="range">
            <input
              type="number"
              placeholder="最低"
              :data-testid="`range-${team.id}-${key}-min`"
              :value="rangeOf(team, key).min ?? ''"
              @input="onRangeInput(team.id, key, 'min', $event)"
            />
            <em>~</em>
            <input
              type="number"
              placeholder="不限"
              :data-testid="`range-${team.id}-${key}-max`"
              :value="rangeOf(team, key).max ?? ''"
              @input="onRangeInput(team.id, key, 'max', $event)"
            />
          </span>
        </label>
      </div>
    </div>

    <p class="settings__foot">
      当前角色池（{{ difficulty }}）：输出C {{ poolStats.c }} 个 · 辅助奶 {{ poolStats.n }} 个。
      「最低」填数字、「不限」留空即为上不封顶；伤害目标一般只填最低值。改完点「一键排完全部波次」重新分配。
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
  max-width: 900px;
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
  gap: 10px;
}

.team-config {
  display: grid;
  grid-template-columns: 108px repeat(2, minmax(150px, 1fr)) minmax(180px, 1.15fr);
  gap: 10px 12px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--team-color);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.015);
}

.team-config__name {
  grid-row: span 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.team-config__name strong {
  color: var(--team-color);
  letter-spacing: 1px;
  font-size: 14px;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--team-color);
}

.policy {
  padding: 5px 7px;
  font-size: 12px;
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cell__label {
  font-size: 11.5px;
  color: var(--text-dim);
}

.cell--heal .cell__label {
  color: #34d399;
}

.cell--c .cell__label {
  color: #60a5fa;
}

.cell--total .cell__label {
  color: var(--accent);
}

select,
input {
  padding: 6px 8px;
  border-radius: 8px;
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

@media (max-width: 1200px) {
  .team-config {
    grid-template-columns: 1fr 1fr;
  }

  .team-config__name {
    grid-row: span 1;
    flex-direction: row;
    align-items: center;
  }
}
</style>
