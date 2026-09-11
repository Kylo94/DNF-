/**
 * 版本信息（构建时由 vite.config.js 从 package.json 注入，单一数据源）
 *
 * 版本规则：
 *   0.x.y  —— 内测版（1.0 之前的全部版本，均为团队内部测试使用）
 *   1.0.0+ —— 正式版
 */
const injectedVersion = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
const injectedStage = typeof __APP_STAGE__ === 'string' ? __APP_STAGE__ : '开发中'

export const APP_VERSION = injectedVersion
export const APP_STAGE = injectedStage
export const VERSION_LABEL = `v${APP_VERSION} · ${APP_STAGE}`

/** 是否为 1.0 之前的内测版本 */
export const IS_BETA = APP_VERSION.split('.')[0] === '0'
