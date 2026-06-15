/**
 * 多乐谱管理存储。
 *
 * 乐谱文档用 IndexedDB（idb-keyval）持久化——多记录、容量大、异步，是客户端文档存储的最佳实践；
 * 偏好（上次打开的乐谱、是否自动打开）用 localStorage。所有访问均做 SSR 守卫（路由模块会进入预渲染图）。
 */
import { createSignal } from 'solid-js';
import { isServer } from 'solid-js/web';
import { createStore as createIdbStore, del, entries, get, set } from 'idb-keyval';
import { DEFAULT_SCORE } from '~/data/examples';

export interface ScoreDoc {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

/** 乐谱专用的 IndexedDB store（SSR 下为 null）。 */
const store = isServer ? null : createIdbStore('dapume', 'scores');

// ===== 偏好（localStorage）=====
const KEY_LAST = 'dapume.lastScoreId';
const KEY_AUTO = 'dapume.autoOpenLast';

function lsGet(key: string, fallback: string): string {
  if (isServer) return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: string): void {
  if (isServer) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略 */
  }
}

export function getLastScoreId(): string | null {
  if (isServer) return null;
  try {
    return localStorage.getItem(KEY_LAST);
  } catch {
    return null;
  }
}
export function setLastScoreId(id: string): void {
  lsSet(KEY_LAST, id);
}

const [autoOpenLast, setAutoOpenSignal] = createSignal(lsGet(KEY_AUTO, 'true') === 'true');
export { autoOpenLast };
export function setAutoOpenLast(v: boolean): void {
  setAutoOpenSignal(v);
  lsSet(KEY_AUTO, String(v));
}

// ===== 「直接访问管理页才自动打开」的判定 =====
/** 应用加载时的初始路径——用于区分「直接访问 /workbench」与「应用内导航过去」。 */
export const INITIAL_PATH = isServer ? '/' : window.location.pathname;
let autoOpenChecked = false;
/**
 * 仅在「本次页面加载、第一次进入管理页」时返回 true。
 * 配合 INITIAL_PATH === '/workbench' 即可只在「直接访问管理页」时自动打开，
 * 而从编辑器返回、或应用内导航过来时不会再触发（第二次进入返回 false）。
 */
export function consumeAutoOpenCheck(): boolean {
  if (autoOpenChecked) return false;
  autoOpenChecked = true;
  return true;
}

// ===== 反应式乐谱列表 + CRUD =====
const [scores, setScores] = createSignal<ScoreDoc[]>([]);
export { scores };

/** 从 IndexedDB 重新读取乐谱列表（按更新时间倒序）并刷新信号。 */
export async function refreshScores(): Promise<ScoreDoc[]> {
  if (!store) return [];
  const all = await entries<string, ScoreDoc>(store);
  const list = all.map(([, v]) => v).sort((a, b) => b.updatedAt - a.updatedAt);
  setScores(list);
  return list;
}

export async function getScore(id: string): Promise<ScoreDoc | undefined> {
  if (!store) return undefined;
  return get<ScoreDoc>(id, store);
}

export async function createScore(title: string, content = ''): Promise<ScoreDoc> {
  const now = Date.now();
  const doc: ScoreDoc = {
    id: crypto.randomUUID(),
    title: title.trim() || 'Untitled',
    content,
    createdAt: now,
    updatedAt: now,
  };
  if (store) await set(doc.id, doc, store);
  await refreshScores();
  return doc;
}

/** 保存乐谱正文（编辑器自动保存调用）。仅写库，不刷新列表信号（管理页下次进入时再读）。 */
export async function saveScoreContent(id: string, content: string): Promise<void> {
  if (!store) return;
  const doc = await get<ScoreDoc>(id, store);
  if (!doc) return;
  doc.content = content;
  doc.updatedAt = Date.now();
  await set(id, doc, store);
}

export async function renameScore(id: string, title: string): Promise<void> {
  if (!store) return;
  const doc = await get<ScoreDoc>(id, store);
  if (!doc) return;
  doc.title = title.trim() || doc.title;
  doc.updatedAt = Date.now();
  await set(id, doc, store);
  await refreshScores();
}

export async function deleteScore(id: string): Promise<void> {
  if (!store) return;
  await del(id, store);
  await refreshScores();
}

/**
 * 一次性迁移：若库中尚无任何乐谱，则把旧版单乐谱（localStorage 'dapume.score'）
 * 或默认示例导入为第一个乐谱。返回当前乐谱列表。
 */
export async function ensureSeeded(defaultTitle: string): Promise<ScoreDoc[]> {
  if (!store) return [];
  const list = await refreshScores();
  if (list.length > 0) return list;
  let content = DEFAULT_SCORE;
  try {
    const old = localStorage.getItem('dapume.score');
    if (old && old.trim()) content = old;
  } catch {
    /* 忽略 */
  }
  await createScore(defaultTitle, content);
  return refreshScores();
}
