import { defineConfig } from 'vitest/config';

/** vitest 配置：纯逻辑测试在 node 环境运行（迁移自 dapume-web，导入已改为相对路径，无需别名）。 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
