import { defineConfig } from 'tsdown';

/**
 * 构建 VSCode 扩展：输出 CommonJS（扩展宿主为 CJS），把 dapume-js 一并打包，
 * 仅将宿主提供的 `vscode` 模块标记为外部。
 */
export default defineConfig({
  entry: ['./src/extension.ts'],
  format: ['cjs'],
  platform: 'node',
  deps: {
    neverBundle: ['vscode'], // 宿主提供
    alwaysBundle: ['dapume-js'], // 打包进扩展，使 .vsix 自包含
  },
  dts: false,
  sourcemap: true,
  clean: true,
  target: 'node18',
});
