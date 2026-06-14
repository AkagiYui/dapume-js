import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** vitest 配置：解析 `~` 别名，使用 node 环境运行纯逻辑测试。 */
export default defineConfig({
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
