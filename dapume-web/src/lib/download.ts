/** 浏览器下载工具。 */

/** 触发浏览器下载给定字节内容。 */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  // 复制到独立的 ArrayBuffer，避免 SharedArrayBuffer 类型问题
  const buffer = bytes.slice().buffer;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 触发浏览器下载文本内容。 */
export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBytes(new TextEncoder().encode(text), filename, mime);
}
