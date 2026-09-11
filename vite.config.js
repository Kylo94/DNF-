import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'

/** 版本号唯一数据源：package.json */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const isBeta = pkg.version.split('.')[0] === '0'
const stage = isBeta ? '内测版' : '正式版'

// mode === 'single' -> 打包成单文件 index.html（双击即可使用，无需服务器）
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_STAGE__: JSON.stringify(stage),
  },
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
}))
