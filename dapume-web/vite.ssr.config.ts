import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import solid from 'vite-plugin-solid';

/**
 * 仅用于预渲染（SSG）的 Vite 配置。
 * 关键：`solid({ ssr: true })` 强制 vite-plugin-solid 以 SSR 模式编译所有 Solid 组件
 * （包括 @tanstack/solid-router 的 .jsx），否则会在服务端调用客户端专用的 template()。
 * `ssr.noExternal: true` 把全部依赖纳入打包/转换管线。
 */
export default defineConfig({
  plugins: [tanstackRouter({ target: 'solid', autoCodeSplitting: false }), solid({ ssr: true })],
  resolve: {
    alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  ssr: {
    noExternal: true,
  },
});
