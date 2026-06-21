# dapume-web

The workbench provides two synchronized score visualizations: a piano roll and a live 4/4 numbered-musical-notation (简谱) score. The numbered score renders notes, rests, accidentals, octave marks, durations, dots, ties across barlines, simultaneous notes, multiple voices, chord names, key/tempo changes, playback highlighting, and editor-line selection highlighting.

The bundled `x-Vacle` numbered-notation font is distributed under the SIL Open Font License 1.1; its license is included with the shared UI package at `../dapume-web-ui/src/assets/fonts/OFL-x-Vacle.txt`.

> 打谱么 Web —— 基于 [`dapume-js`](../dapume-js) 的纯前端线性乐谱编辑与播放应用。

一个用 **SolidJS + Vite 8** 构建的单页应用，构建产物为**纯静态文件**，可部署到任意静态托管（如 Cloudflare Pages）。

## 功能

- 📖 **规则与语法页**：逐节讲解 dapume 语法，每个示例都能一键播放。
- 🛠️ **工作台**：实时编辑 dapume 文本、实时渲染钢琴卷帘、播放、导出。
  - 自实现的 **CodeMirror 6** 编辑器（非 input/textarea），支持 dapume 语法高亮。
  - 上下两区、上区再分左右，区块之间**可拖动**改变大小；无 header 栏。
  - **钢琴卷帘**：多轨音符可视化、播放指针、可开关「跟随播放进度」。
  - 播放时**锁定编辑**并**高亮当前发声的音符/和弦字符**。
  - 一键**下载 MIDI**、一键**下载 .dpm**（编辑器原文）。
- 🎹 **真实音色**：使用 [smplr](https://github.com/danigb/smplr) 的预采样钢琴（自 CDN 加载），而非 Web Audio 振荡器合成。
- 🌐 **国际化**：中 / 英文切换，localStorage 持久化。
- 🌗 **深浅色**：浅色 / 深色 / 跟随系统，localStorage 持久化。
- 🎨 **主题色**：多个预设主题色（不支持自定义），localStorage 持久化。
- 💾 谱面与开关状态持久化到 localStorage。

## 技术栈

| 用途 | 选型 |
| :-- | :-- |
| 框架 | SolidJS + @solidjs/router（哈希路由） |
| 构建 | Vite 8（Rolldown） |
| UI | [solid-ui](https://github.com/stefan-karger/solid-ui)（Kobalte + Tailwind CSS v4） |
| 可拖动分栏 | @corvu/resizable |
| 编辑器 | CodeMirror 6 |
| 音频 | smplr（SplendidGrandPiano） |
| 图标 | Iconify + [vite-plugin-iconify-offline](https://github.com/AkagiYui/vite-plugin-iconify-offline)（离线化） |
| i18n | @solid-primitives/i18n |
| 乐谱核心 | dapume-js（本仓库） |

## 开发

> 本项目是 monorepo 的一部分，请在**仓库根目录**安装依赖。

```bash
pnpm install                 # 在仓库根目录
pnpm --filter dapume-js build  # 先构建依赖库 dapume-js
pnpm --filter dapume-web dev   # 启动开发服务器
```

或在根目录直接：

```bash
pnpm dev:web     # 启动 dapume-web 开发服务器
pnpm build       # 构建所有包（dapume-js → dapume-web）
```

## 构建

```bash
# 在仓库根目录（会按依赖顺序先构建 dapume-js）
pnpm -r build
```

静态产物输出至 `dapume-web/dist/`。

## 部署到 Cloudflare Pages

本应用使用**哈希路由**且资源使用**相对路径**（`base: './'`），因此无需任何重写规则即可在子目录下运行。

在 Cloudflare Pages 的「构建配置」中填写：

| 项 | 值 |
| :-- | :-- |
| 框架预设（Framework preset） | `None`（或 `Vite`） |
| 构建命令（Build command） | `pnpm run build` |
| 构建输出目录（Build output directory） | `dapume-web/dist` |
| 根目录（Root directory） | 留空 / `/`（仓库根目录） |

并设置 Node 版本（二选一）：
- 仓库已包含 `.node-version`（`22.18.0`），Cloudflare 会自动读取；或
- 在环境变量中设置 `NODE_VERSION=22`。

> 说明：构建命令需在仓库根目录执行，因为 `dapume-web` 依赖工作区内的 `dapume-js`，`pnpm run build` 会按依赖顺序先构建 `dapume-js` 再构建 `dapume-web`。Node ≥ 22.18 是 tsdown 的构建要求。

## 目录结构

```
src/
  pages/        Guide（规则与语法）、Workbench（工作台）
  components/   CodeEditor、PianoRoll、SettingsPanel、Icon、ui/（solid-ui 组件）
  stores/       settings（主题/语言）、player（smplr 播放器）
  i18n/         中英词条与翻译器
  data/         示例曲目、指南内容、模板文本
  lib/          工具函数（cn、下载、tokenClass）
  app.css       Tailwind v4 + 设计令牌 + 主题色预设 + 编辑器高亮样式
```
