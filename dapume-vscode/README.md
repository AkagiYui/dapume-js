# Dapume — VSCode 扩展

为 **dapume 线性乐谱**文件（`.dapume`，兼容旧的 `.dpm`）提供：

- 🎨 **语法高亮**：调号、速度、音符、休止符、音高/时值修饰符、多轨括号、和弦记号。
- 📝 **Markdown 代码块高亮**：在 Markdown 中用 ` ```dapume `（或 ` ```dpm `，也支持 `~~~` 围栏）标注的代码块，块内同样按 dapume 高亮——写文档/教程时直接可用，无需新建 `.dapume` 文件。
- 🎹 **渲染为 MIDI**：命令 `Dapume: 渲染为 MIDI`，把当前文件解析并渲染为同名 `.mid`。
- 🔘 **编辑器标题栏按钮**：打开 `.dapume` 文件时，编辑器右上角会出现「渲染为 MIDI」按钮。
- 🗂️ **文件关联**：`.dapume` / `.dpm` 关联到名为 **Dapume** 的语言。

渲染逻辑由 monorepo 内的 [`dapume-js`](../dapume-js) 提供（已打包进扩展，无需额外安装）。

## 开发

```bash
pnpm install                      # 在仓库根目录
pnpm --filter dapume-js build     # 先构建依赖库
pnpm --filter dapume-vscode build # 构建扩展（输出 dist/extension.cjs）
```

在 VSCode 中按 F5（需配置 launch）或用 `vsce package` 打包为 `.vsix` 后安装：

```bash
pnpm --filter dapume-vscode package
```

## 用法

1. 打开或新建一个 `.dapume` 文件，例如：

   ```
   1=C 120bpm
   [1]1234[5]567
   ```

2. 点击编辑器标题栏右端的「渲染为 MIDI」按钮（或在命令面板执行 `Dapume: 渲染为 MIDI`）。
3. 同目录下会生成同名 `.mid` 文件。

### 在 Markdown 中

在任意 `.md` 文档里，用 `dapume`（或 `dpm`）作为代码块语言标注，块内即按 dapume 高亮：

````markdown
```dapume
1=C 120bpm
[1]1234[5]567 // 和弦 + 旋律
```
````

> 实现方式：注入式 TextMate 语法（`injectTo: text.html.markdown`），不依赖扩展激活，打开
> Markdown 即生效；块内复用 `source.dapume` 文法，与 `.dapume` 文件高亮完全一致。

## 许可证

MIT
