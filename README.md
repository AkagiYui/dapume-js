# 打谱么 · dapume monorepo

线性乐谱（dapume）工具链。本仓库是一个 **pnpm workspace** monorepo，包含三个包：

| 包 | 说明 |
| :-- | :-- |
| [`dapume-js`](./dapume-js) | TypeScript 库：将 dapume 文本解析为乐谱对象（`parse`）、渲染为 MIDI（`toMidi`），另有 `render` / `tokenize` / `activeNotesAt` / `activeEventsAt` / `paramsAt`。Python 项目 `dapume`（dapume-py）的 TypeScript 实现，零依赖，可在 Node 与浏览器运行。已发布到 npm。 |
| [`dapume-web`](./dapume-web) | 基于 `dapume-js` 的 **SolidJS + Vite 8** 纯前端应用：指南 / 工作台 / 开发者三个页面，在线编辑、播放（smplr 真实音色）与导出。TanStack Router（history 路由），首页与开发者页 **SSG 预渲染**，构建为纯静态文件。 |
| [`dapume-vscode`](./dapume-vscode) | VSCode 扩展：`.dapume` 文件语法高亮 + 编辑器标题栏「渲染为 MIDI」按钮（内部调用 dapume-js）。 |

> `dapume-py/`（Python 原项目）仅作为复刻参考，已在 `.gitignore` 中忽略，不纳入本仓库版本管理。

## 快速开始

```bash
pnpm install      # 安装所有依赖（需 Node ≥ 22.18）
pnpm build        # 拓扑顺序构建所有包（dapume-js → dapume-web / dapume-vscode）
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

## CI / 自动化（`.github/workflows`）

| 工作流 | 触发 | 作用 |
| :-- | :-- | :-- |
| `ci.yaml` | push / PR | 构建 + 类型检查 + 测试整个工作区 |
| `package-publish.yaml` | 推送 `v[0-9]*` tag | 经 npm OIDC 可信发布 dapume-js，并创建 GitHub Release |
| `vscode-extension.yaml` | 扩展相关内容变动 | 打包 `.vsix` 并上传为构建产物 |
| `vscode-publish.yaml` | 推送 `vscode-v*` tag | 用 PAT 发布扩展到 VS Code Marketplace |

> 发布 dapume-js：在 `dapume-js/package.json` 升级 `version` → 提交 → 推送匹配的 `vX.Y.Z` tag。
>
> 发布扩展：在 `dapume-vscode/package.json` 升级 `version` → 提交 → 推送匹配的 `vscode-vX.Y.Z` tag。
> 首次需在 [dev.azure.com](https://dev.azure.com) 创建带「Marketplace → Manage」权限的 PAT，
> 并在 GitHub 仓库加 `VSCE_PAT` 机密（详见 `.github/workflows/vscode-publish.yaml` 顶部注释）。

## 部署

`dapume-web` 构建为纯静态文件，部署在 Cloudflare Pages（[https://docs.dapu.me](https://docs.dapu.me)；根域 [dapu.me](https://dapu.me) 现由独立的闭源社区仓库提供）。构建命令 `pnpm run build`，输出目录 `dapume-web/dist`，根目录为仓库根。另在 `functions/` 下提供 Cloudflare Pages Functions（`/api/parse`、`/api/to-midi`、`/api/render`）。详见 [dapume-web 部署说明](./dapume-web/README.md#部署到-cloudflare-pages)。

## 许可证

MIT
