<script setup>
import { ref } from 'vue'

defineProps({
  stats: { type: Object, required: true },
  playerStats: { type: Array, default: () => [] },
})

const showDetail = ref(false)
</script>

<template>
  <section class="stats">
    <div class="cards">
      <div class="stat">
        <span class="stat__label">登记角色</span>
        <strong class="stat__value">{{ stats.total }}</strong>
        <span class="stat__sub">{{ stats.playerCount }} 位玩家</span>
      </div>
      <div class="stat stat--c">
        <span class="stat__label">输出C</span>
        <strong class="stat__value">{{ stats.cCount }}</strong>
        <span class="stat__sub">站街模拟伤害</span>
      </div>
      <div class="stat stat--n">
        <span class="stat__label">辅助奶</span>
        <strong class="stat__value">{{ stats.nCount }}</strong>
        <span class="stat__sub">面板三攻</span>
      </div>
      <div class="stat stat--normal">
        <span class="stat__label">普通团</span>
        <strong class="stat__value">{{ stats.normal }}</strong>
        <span class="stat__sub">已登记角色</span>
      </div>
      <div class="stat stat--hard">
        <span class="stat__label">困难团</span>
        <strong class="stat__value">{{ stats.hard }}</strong>
        <span class="stat__sub">已登记角色</span>
      </div>
    </div>

    <button class="toggle" @click="showDetail = !showDetail">
      {{ showDetail ? '收起玩家明细 ▲' : '展开玩家明细 ▼' }}
    </button>

    <div v-if="showDetail" class="detail">
      <table>
        <thead>
          <tr>
            <th>归属玩家</th>
            <th>角色总数</th>
            <th>输出C</th>
            <th>辅助奶</th>
            <th>普通团</th>
            <th>困难团</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in playerStats" :key="row.player">
            <td class="player">{{ row.player }}</td>
            <td>{{ row.total }}</td>
            <td>{{ row.c }}</td>
            <td>{{ row.n }}</td>
            <td>{{ row.normal }}</td>
            <td>{{ row.hard }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.stats {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-card);
}

.stat__label {
  font-size: 12px;
  color: var(--text-dim);
}

.stat__value {
  font-size: 22px;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat__sub {
  font-size: 11.5px;
  color: var(--text-dim);
}

.stat--c .stat__value {
  color: #93c5fd;
}

.stat--n .stat__value {
  color: #86efac;
}

.stat--hard .stat__value {
  color: #fca5a5;
}

.toggle {
  align-self: flex-start;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  font-size: 12.5px;
  cursor: pointer;
}

.toggle:hover {
  color: var(--accent);
  border-color: rgba(240, 198, 116, 0.5);
}

.detail {
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--bg-card);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 8px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  font-variant-numeric: tabular-nums;
}

thead th {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.02);
}

tbody tr:last-child td {
  border-bottom: none;
}

.player {
  color: var(--accent);
}
</style>
