/**
 * 预渲染（SSG）脚本：在客户端 `vite build` 之后运行。
 *
 * 1. 以 SSR 模式构建 src/entry-server.tsx；
 * 2. 渲染 `/` 与 `/developers` 为 HTML 字符串；
 * 3. 把字符串注入到客户端构建产物 dist/index.html 的 <div id="root"> 中，
 *    分别写出 dist/index.html 与 dist/developers/index.html。
 *
 * 客户端入口仍是 render()（非 hydrate）：首屏可见静态内容，JS 加载后再接管为 SPA。
 */
import { build } from 'vite';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const ssrDir = join(root, 'dist-ssr');
const PLACEHOLDER = '<div id="root"></div>';

// 1) 构建 SSR 包（用专门的 SSR 配置，强制 Solid 以 SSR 模式编译）
await build({
  root,
  configFile: join(root, 'vite.ssr.config.ts'),
  logLevel: 'warn',
  build: {
    ssr: 'src/entry-server.tsx',
    outDir: 'dist-ssr',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'entry-server.js' } },
  },
});

const { renderPage, ROUTES } = await import(join(ssrDir, 'entry-server.js'));

// 2) 以客户端构建好的 dist/index.html 作为模板（已含 Vite 注入的 script/css 标签）
let template = await readFile(join(dist, 'index.html'), 'utf8');
if (!template.includes(PLACEHOLDER)) {
  throw new Error(`dist/index.html 中找不到 ${PLACEHOLDER}，无法注入预渲染内容`);
}

// 2.1) 修正图标离线注册脚本的执行顺序。
// vite-plugin-iconify-offline 在 build 模式把注册脚本注入到 </head> 前（晚于应用入口），
// 于是应用先创建 iconify-icon 元素、图标注册晚到，刷新时偶发「图标加载失败」
// （Service Worker 改变了资源加载时序后更易触发）。这里把它前移到第一个 module 脚本
// （应用入口）之前——与该插件 dev 模式的 head-prepend 行为一致，保证注册先于渲染。
const iconifyScript = template.match(/[ \t]*<script\b[^>]*_iconify-offline_icons[^>]*><\/script>\n?/);
if (iconifyScript) {
  template = template.replace(iconifyScript[0], '');
  template = template.replace(
    /(<script type="module")/,
    `${iconifyScript[0].trim()}\n    $1`,
  );
}

// 3) 渲染并写出每个路由
for (const route of ROUTES) {
  const appHtml = await renderPage(route);
  const html = template.replace(PLACEHOLDER, `<div id="root">${appHtml}</div>`);
  const outFile = route === '/' ? join(dist, 'index.html') : join(dist, route.slice(1), 'index.html');
  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, html, 'utf8');
  console.log(`[prerender] ${route} -> ${outFile.replace(root + '/', '')}`);
}

// 清理 SSR 临时产物
await rm(ssrDir, { recursive: true, force: true });
