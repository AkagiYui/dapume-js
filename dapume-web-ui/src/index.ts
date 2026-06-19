/**
 * dapume-web-ui 套件总出口。
 *
 * 以「源码」方式被 dapume-web（开源参考站）与社区站复用：消费方的 vite-plugin-solid
 * 直接编译这里的 .tsx；样式经 `dapume-web-ui/styles.css` 引入，UI 原语另有 `dapume-web-ui/ui` 子路径。
 */

// ===== 5 个页面（默认导出 → 具名重导出）=====
export { default as Guide } from './pages/Guide';
export { default as Developers } from './pages/Developers';
export { default as Tutorial } from './pages/Tutorial';
export { default as ScoreManager } from './pages/ScoreManager';
export { default as Workbench } from './pages/Workbench';

// ===== 外壳与高层组件 =====
export {
  SiteHeader,
  TopNav,
  NavA,
  HeaderConfigProvider,
  useTitleTo,
  type HeaderConfig,
} from './components/SiteHeader';
export { Icon } from './components/Icon';
export { PianoRoll, type PianoRollProps } from './components/PianoRoll';
export { CodeEditor, type CodeEditorProps, type HighlightRange } from './components/CodeEditor';
export { SettingsPanel, SettingsButton, SettingsModalButton } from './components/SettingsPanel';
export { ShareDialog, ImportDialog } from './components/QrDialogs';
export { CodeBlock } from './components/CodeBlock';
export { HighlightedCode } from './components/HighlightedCode';
export { SyntaxSections } from './components/SyntaxSections';
export { ApiTester } from './components/ApiTester';

// ===== UI 原语 =====
export * from './components/ui';

// ===== 状态 =====
export * from './stores/player';
export * from './stores/settings';
export * from './stores/scores';

// ===== 工具库 =====
export * from './lib/utils';
export * from './lib/download';
export * from './lib/measures';
export * from './lib/qrShare';
export * from './lib/viewTransition';
export * from './lib/highlight';
export * from './lib/tokenClass';
export * from './lib/pwa';

// ===== i18n =====
export { t } from './i18n';

// ===== 数据 =====
export * from './data/examples';
export * from './data/guide';
export * from './data/tutorial';
