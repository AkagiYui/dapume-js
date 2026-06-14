import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import iconifyOffline, { SKIP_PREFIXES } from 'vite-plugin-iconify-offline';

// 避免把开发者文档示例代码中的 `node:fs` 等字符串误判为图标引用
SKIP_PREFIXES.add('node');

/**
 * Vite 配置。
 *
 * - 使用 TanStack Router 的文件式路由（history 模式）；`tanstackRouter` 必须排在 `solid()` 之前。
 * - `base: '/'`：history 路由部署在站点根目录；配合 public/_redirects 实现 SPA 回退。
 * - 构建产物为纯静态文件，输出至 `dist/`。
 * - iconifyOffline：将用到的 Iconify 图标离线化，运行时不再请求网络。
 */
export default defineConfig({
  base: '/',
  plugins: [
    tanstackRouter({ target: 'solid', autoCodeSplitting: true }),
    solid(),
    tailwindcss(),
    iconifyOffline(),
  ],
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
