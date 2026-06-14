import { defineConfig } from 'tsdown';

/**
 * tsdown 构建配置。
 *
 * - 同时输出 ESM(.mjs) 与 CJS(.cjs)，并生成类型声明 .d.ts。
 * - platform 设为 'neutral'：本库不依赖任何 Node/浏览器特有 API，
 *   既能在 Node 中使用，也能打包进浏览器项目。
 */
export default defineConfig({
  entry: ['./src/index.ts'],
  format: ['esm', 'cjs'],
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  minify: false,
  clean: true,
  target: 'es2022',
});
