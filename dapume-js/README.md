# dapume-js

[![npm version](https://img.shields.io/npm/v/dapume-js?logo=npm&color=%23cb3837)](https://npmx.dev/package/dapume-js)
[![npm downloads](https://img.shields.io/npm/dm/dapume-js?color=%2334d399)](https://npmx.dev/package/dapume-js)
[![license](https://img.shields.io/npm/l/dapume-js?color=%236366f1)](https://npmx.dev/package/dapume-js)
[![bundle size](https://img.shields.io/bundlephobia/minzip/dapume-js?label=minzip)](https://npmx.dev/package/dapume-js)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-dapume--vscode-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=AkagiYui.dapume-vscode)

> 打谱么 —— 将**线性乐谱（dapume）**解析为乐谱对象，并渲染为 MIDI 文件。

`dapume-js` 是 Python 项目 [`dapume`](https://github.com/ScarlettRinko/dapume)（dapume-py）的 TypeScript 移植：解析行为与原版一致，并把乐谱渲染为**标准 MIDI 文件**（format 1，写入真实 tempo 与按拍对齐的 tick，便于 DAW 使用）。它不依赖任何运行时库，可在 **Node** 与**浏览器**环境中运行，并额外提供「源字符位置追踪」与「语法分词」以支撑编辑器类应用（如在线谱面编辑、播放高亮）。

> 本库只负责「文本 → 乐谱对象 → MIDI」。把 MIDI 转换为音频是另外的事情（例如用音源/采样器播放），不在本库职责范围内。

## 特性

- 🎼 解析线性乐谱文本为结构化乐谱对象（音轨、音符、时间、音高）
- 🎹 渲染标准 MIDI 文件（format 1；指挥轨写入真实 tempo、按拍对齐的 tick，支持多段变速）
- 🧩 支持简谱记号、音高/时值修饰、多轨嵌套、和弦演奏、调号与 BPM 参数
- 🔦 追踪每个音符对应的源文本字符范围，便于做播放高亮
- 🖍️ 内置语法分词器，便于实现语法高亮编辑器
- 📦 零运行时依赖，ESM + CJS 双格式，自带类型声明

## 安装

```bash
pnpm add dapume-js
# 或 npm install dapume-js / yarn add dapume-js
```

## 快速开始

本库对外暴露两个**核心函数**：

1. `parse(text)` —— 输入一段 dapume 语法文本，输出解析好的乐谱对象。
2. `toMidi(score)` —— 输入一个乐谱对象，输出 MIDI 文件的 `Uint8Array`，开发者自行保存为文件。

```ts
import { parse, toMidi } from 'dapume-js';

const score = parse(`1=C 120bpm
1234567`);

console.log(score.notes.length); // 7
console.log(score.notes[0]);     // { trackNo: 0, pitch: 60, startTime: 0, duration: 250, ... }

const midiBytes: Uint8Array = toMidi(score);
```

### Node：保存为文件

```ts
import { writeFileSync } from 'node:fs';
import { render } from 'dapume-js';

// render(text) 等价于 toMidi(parse(text))
writeFileSync('output.mid', render('1=C 120bpm\n1234567'));
```

### 浏览器：触发下载

```ts
import { render } from 'dapume-js';

const bytes = render(scoreText);
const blob = new Blob([bytes], { type: 'audio/midi' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'score.mid';
a.click();
URL.revokeObjectURL(url);
```

## API

### `parse(text: string): DapumeScore`

将 dapume 文本解析为乐谱对象。

```ts
interface DapumeScore {
  tracks: DapumeNote[][];     // 按音轨分组的音符（其内部顺序用于渲染 MIDI）
  notes: DapumeNote[];        // 所有音符的扁平列表，已按开始时刻升序排序
  events: DapumeEvent[];      // 所有时间轴事件（含休止符），已按开始时刻排序
  trackCount: number;         // 音轨数量
  durationMs: number;         // 总时长（毫秒）
  sections: DapumeSection[];  // 各参数段（调号/速度随时间的变化），按开始时刻升序
}

interface DapumeNote {
  trackNo: number;    // 音轨编号
  pitch: number;      // MIDI 音高（中央 C = 60）
  startTime: number;  // 开始时刻（毫秒）
  duration: number;   // 持续时长（毫秒）
  srcStart: number;   // 触发该音符的源字符起始下标（含）
  srcEnd: number;     // 触发该音符的源字符结束下标（不含）
  isChord: boolean;   // 是否来自和弦记号 [...]
}
```

### `toMidi(score: DapumeScore): Uint8Array`

将乐谱对象渲染为 MIDI 文件字节。MIDI 为 format 1、每分音符 480 ticks、默认速度 120 BPM，时序与原 Python 版完全一致。

### `render(text: string): Uint8Array`

便捷函数，等价于 `toMidi(parse(text))`。

### `tokenize(text: string): Token[]`

将文本切分为语法高亮用的词法单元（按源位置升序、互不重叠）。类型见 `TokenType`：`key`（调号）、`bpm`、`note`、`rest`、`pitch-mod`、`duration-mod`、`bracket`、`chord`、`comment`。

```ts
interface Token {
  type: TokenType;
  start: number;  // 源字符起始下标（含）
  end: number;    // 源字符结束下标（不含）
  value: string;
}
```

### `activeNotesAt(score: DapumeScore, timeMs: number): DapumeNote[]`

返回在给定时刻正在发声的所有音符，常用于播放时高亮当前音符/和弦。

### `activeEventsAt(score: DapumeScore, timeMs: number): DapumeEvent[]`

返回给定时刻的全部时间轴事件，包含休止符，适合驱动编辑器高亮和播放导航。

### `paramsAt(score: DapumeScore, timeMs: number): DapumeSection`

返回在给定时刻生效的调号与速度（`{ startTime, tonic, bpm, key }`），常用于播放时实时显示「1=? 与 bpm」。

---

## 线性乐谱（dapume）语法

线性乐谱用 ASCII 字符书写简单乐谱。每一行要么是**参数行**，要么是**音符行**。

### 参数行

参数行修改演奏参数，**下一行起**生效。所有参数**大小写敏感**，不同参数间用空格连接、无顺序。

| 参数 | 格式 | 示例 |
| :--: | :-- | :--: |
| 调号 | 以 `1=` 开头，后接 `CDEFGAB` 之一，可再接 `#b.,` 的组合表示半音与八度 | `1=C`、`1=Bb.` |
| BPM | 数字开头、以 `bpm` 结尾 | `120bpm` |

- 若首行未指定参数，默认为 `1=C 120bpm`。
- 参数行未指定某项时，继承之前的该项值。

### 音符行

与简谱相同，用 `1`~`7` 表示七个音符，`0` 表示休止符。音符后可叠加后缀（**可叠加、无顺序**）：

| 音高后缀 | 含义 | 时值后缀 | 含义 |
| :--: | :--: | :--: | :--: |
| `#` | 升半音 | `-` | 1 拍 |
| `b` | 降半音 | `~` | 1.5 拍 |
| `.` | 升八度 | `=` | 2 拍 |
| `,` | 降八度 | `+` | 4 拍 |
|  |  | `*` | 0.5 拍 |
|  |  | `^` | 0.25 拍 |
|  |  | `'` | 0.125 拍 |

- 无时值后缀时，默认 **0.5 拍**。
- 时值后缀可组合，如 3 拍写作 `~~` 或 `=-`。

示例：`1`（0.5 拍 do）、`5-`（1 拍 sol）、`1.-`（1 拍高八度 do）、`1=*`（2.5 拍 do）。

### 注释

双斜杠 `//` 后直到当前行末尾的内容都是注释，解析与播放时会被忽略。注释可写在参数行或音符行末尾：

```text
1=C 120bpm // C 大调
1234       // 第一乐句
```

### 多轨演奏

在音符后用圆括号 `()` 写入其它音符表示同时演奏，时值与主轨**右对齐**。两条以上轨道写作 `1-(3-)(5-)`，支持嵌套 `1+(3+(5+))`。

### 和弦演奏

在音符行写入方括号 `[]`，其中填入和弦记号，将自动演奏该和弦并**持续到下一个和弦**。和弦记号由「级数 + 类型 + 后缀 + 转位 + 八度」组成，例如：

- `[4]`：四级大三和弦
- `[57]`：五级属七和弦
- `[4#m7b5]`：升四级半减七和弦
- `[1add9]`：一级加九和弦
- `[1/5]`：一级大三和弦第二转位
- `[5/7,]`：低两个八度演奏

> 和弦默认比旋律低八度，可在末尾追加 `,`/`.` 调整八度。完整的级数 / 类型 / 后缀 / 转位规则与 dapume-py 一致，详见 [dapume-py 的说明](https://github.com/ScarlettRinko/dapume)。

---

## 开发

```bash
pnpm install      # 安装依赖
pnpm test         # 运行 vitest 测试
pnpm build        # 用 tsdown 构建（输出 dist/）
pnpm typecheck    # 类型检查
```

测试覆盖：解析、和弦、MIDI 字节级一致性，以及 4 首模板曲目（卡农、兰亭序、鸟之诗、花之舞）与原 Python 版**逐音符**比对。

## 许可证

MIT
