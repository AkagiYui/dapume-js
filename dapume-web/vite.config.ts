import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import iconifyOffline, { SKIP_PREFIXES } from 'vite-plugin-iconify-offline';
import { VitePWA } from 'vite-plugin-pwa';

// 避免把开发者文档示例代码中的 `node:fs` 等字符串误判为图标引用
SKIP_PREFIXES.add('node');

/**
 * 开发期 /api 中间件：用 dapume-js 在本地模拟 Cloudflare Pages Functions，
 * 让开发者页的「在线测试」在 `pnpm dev` 下也能工作（生产由 repo 根 functions/ 提供）。
 */
function devApi(): Plugin {
  return {
    name: 'dapume-dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (req.method !== 'POST' || !url?.startsWith('/api/')) return next();
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', async () => {
          try {
            const { parse, toMidi } = await import('dapume-js');
            if (url === '/api/parse') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(parse(body)));
            } else if (url === '/api/to-midi') {
              res.setHeader('Content-Type', 'audio/midi');
              res.end(Buffer.from(toMidi(JSON.parse(body))));
            } else if (url === '/api/render') {
              const score = parse(body);
              res.setHeader('Content-Type', 'audio/midi');
              res.setHeader('X-Note-Count', String(score.notes.length));
              res.setHeader('X-Track-Count', String(score.trackCount));
              res.setHeader('X-Duration-Ms', String(score.durationMs));
              res.setHeader('Access-Control-Expose-Headers', 'X-Note-Count, X-Track-Count, X-Duration-Ms');
              res.end(Buffer.from(toMidi(score)));
            } else {
              next();
            }
          } catch (e) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: String(e) }));
          }
        });
      });
    },
  };
}

/**
 * Vite 配置。
 *
 * - 使用 TanStack Router 的文件式路由（history 模式）；`tanstackRouter` 必须排在 `solid()` 之前。
 * - `base: '/'`：history 路由部署在站点根目录；配合 public/_redirects 实现 SPA 回退。
 * - 构建产物为纯静态文件，输出至 `dist/`。
 * - iconifyOffline：将用到的 Iconify 图标离线化，运行时不再请求网络。
 * - VitePWA：生成 Web App Manifest 与 Service Worker，支持安装与离线访问。
 */
export default defineConfig({
  base: '/',
  plugins: [
    devApi(),
    tanstackRouter({ target: 'solid', autoCodeSplitting: true }),
    solid(),
    tailwindcss(),
    iconifyOffline(),
    VitePWA({
      // 部署后自动更新 Service Worker（无需用户手动刷新即可拿到新版本）
      registerType: 'autoUpdate',
      manifest: {
        name: '打谱么 · dapume',
        short_name: '打谱么',
        description: '线性乐谱（dapume）在线编辑与播放工具',
        lang: 'zh-CN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#6366f1',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 预缓存哈希命名的构建产物；prerender.mjs 会在构建后改写 index.html，
        // SW 在 install 阶段以网络拉取实际（已预渲染）的 HTML，故缓存内容正确。
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2,ttf}'],
        // SPA 回退：未预缓存的路由（如 /developers）离线时回退到应用外壳
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/_/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
      // 开发期不注册 SW，避免干扰 HMR 与 /api 中间件
      devOptions: { enabled: false },
    }),
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
