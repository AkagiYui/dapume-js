import { defineConfig } from 'vitest/config';

/**
 * vitest 配置。本库为纯逻辑库，使用默认的 node 测试环境即可。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
