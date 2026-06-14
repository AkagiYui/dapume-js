import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import iconifyOffline from 'vite-plugin-iconify-offline';

/**
 * Vite 配置。
 *
 * - `base: './'`：使用相对路径，配合哈希路由，可部署在任意子目录（含 Cloudflare Pages）。
 * - 构建产物为纯静态文件，输出至 `dist/`。
 * - iconifyOffline：将用到的 Iconify 图标离线化，运行时不再请求网络。
 */
export default defineConfig({
  base: './',
  plugins: [solid(), tailwindcss(), iconifyOffline()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
});
