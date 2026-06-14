# 打谱么 · dapume monorepo

线性乐谱（dapume）工具链。本仓库是一个 **pnpm workspace** monorepo，包含两个包：

| 包 | 说明 |
| :-- | :-- |
| [`dapume-js`](./dapume-js) | TypeScript 库：将 dapume 文本解析为乐谱对象并渲染为 MIDI。Python 项目 `dapume`（dapume-py）的完美复刻，可在 Node 与浏览器运行。 |
| [`dapume-web`](./dapume-web) | 基于 `dapume-js` 的 SolidJS 纯前端应用：在线编辑、播放与导出 dapume 谱面。构建为纯静态文件。 |

> `dapume-py/`（Python 原项目）仅作为复刻参考，已在 `.gitignore` 中忽略，不纳入本仓库版本管理。

## 快速开始

```bash
pnpm install      # 安装所有依赖（需 Node ≥ 22.18）
pnpm build        # 构建所有包（先 dapume-js，再 dapume-web）
pnpm test         # 运行所有测试（vitest）
pnpm dev:web      # 启动 dapume-web 开发服务器
```

## 常用脚本（仓库根目录）

| 脚本 | 作用 |
| :-- | :-- |
| `pnpm build` | 递归构建所有包（拓扑顺序） |
| `pnpm test` | 递归运行所有包测试 |
| `pnpm typecheck` | 递归类型检查 |
| `pnpm build:js` / `pnpm build:web` | 单独构建某个包 |
| `pnpm dev:web` | 启动 web 开发服务器 |

## 部署

`dapume-web` 构建为纯静态文件，详见 [dapume-web 的部署说明](./dapume-web/README.md#部署到-cloudflare-pages)。

## 许可证

MIT
