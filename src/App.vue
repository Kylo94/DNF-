<script setup>
import { ref } from 'vue'
import RegistrationView from './views/RegistrationView.vue'
import LineupView from './views/LineupView.vue'
import ToastHost from './components/ToastHost.vue'
import { IS_BETA, VERSION_LABEL } from './version.js'

/** 当前页签：registration（角色登记）/ lineup（编队排表），用 hash 记住，刷新不丢 */
const view = ref(window.location.hash === '#lineup' ? 'lineup' : 'registration')

function switchView(next) {
  view.value = next
  const hash = next === 'lineup' ? '#lineup' : '#registration'
  if (window.location.hash !== hash) window.history.replaceState(null, '', hash)
}
</script>

<template>
  <div class="page">
    <ToastHost />

    <header class="hero">
      <div class="hero__left">
        <div class="hero__title">
          <h1>DNF 打团排表</h1>
          <span class="ver" data-testid="version">{{ VERSION_LABEL }}</span>
        </div>
        <p>
          登记每位玩家的输出C与辅助奶角色，并按普通团 / 困难团自动排出红黄绿三队。
          数据保存在本机浏览器，可随时导出 Excel 存档。
        </p>
      </div>

      <nav class="tabs">
        <button
          class="tabs__btn"
          :class="{ 'tabs__btn--active': view === 'registration' }"
          data-testid="tab-registration"
          @click="switchView('registration')"
        >
          角色登记
        </button>
        <button
          class="tabs__btn"
          :class="{ 'tabs__btn--active': view === 'lineup' }"
          data-testid="tab-lineup"
          @click="switchView('lineup')"
        >
          编队排表
        </button>
      </nav>
    </header>

    <RegistrationView v-if="view === 'registration'" @go-lineup="switchView('lineup')" />
    <LineupView v-else @go-registration="switchView('registration')" />

    <footer class="foot">
      <p class="foot__meta">
        <span data-testid="footer-version">{{ VERSION_LABEL }}</span>
        <template v-if="IS_BETA">
          · 1.0 之前的版本均为<strong>内测版</strong>，功能与数据结构可能调整，重要数据请及时导出 Excel 备份。
        </template>
      </p>
      <p>
        登记导出的表头：归属玩家 / 角色称呼 / 角色类型（C=输出C，N=辅助奶）/ 面板数值（C=站街模拟伤害，奶=面板三攻）/
        难度类型（普通团 / 困难团）；编队导出的表头：队伍 / 位置 / 角色类型 / 归属玩家 / 角色称呼 / 面板数值 / 区间状态。
        旧表里的「Ban状态」列会在导入时自动忽略。
      </p>
    </footer>
  </div>
</template>

<style scoped>
.page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 28px 26px 40px;
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
  margin-bottom: 22px;
}

.hero__title {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.ver {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: var(--accent);
  border: 1px solid rgba(240, 198, 116, 0.45);
  background: rgba(240, 198, 116, 0.1);
}

.hero__left h1 {
  margin: 0;
  font-size: 25px;
  letter-spacing: 1px;
  background: linear-gradient(90deg, #f7e0a3, #f0c674 55%, #d8a13a);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__left p {
  margin: 8px 0 0;
  max-width: 660px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-dim);
}

.tabs {
  display: inline-flex;
  padding: 3px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--bg-card);
}

.tabs__btn {
  padding: 9px 20px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-dim);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.16s ease;
}

.tabs__btn:hover {
  color: var(--accent);
}

.tabs__btn--active {
  background: linear-gradient(180deg, #f4d28b, #dda63f);
  color: #241a05;
  font-weight: 600;
}

.foot {
  margin-top: 26px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-dim);
}

.foot p {
  margin: 0;
}

.foot__meta {
  margin-bottom: 6px !important;
  color: var(--text-soft);
}

.foot__meta strong {
  color: var(--accent);
  font-weight: 600;
}
</style>
