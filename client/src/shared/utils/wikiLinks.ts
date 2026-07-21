const WIKI_LINK_PROTOCOL = 'mint-wiki:';

/**
 * 解析 Chat 中的 Mint Wiki 协议链接。
 *
 * @param href Markdown 链接地址
 * @returns Wiki 根目录下的相对路径；协议不匹配或路径不安全时返回 null
 */
export function parseMintWikiLink(href: string): string | null {
  if (!href.startsWith(WIKI_LINK_PROTOCOL)) return null;

  try {
    const url = new URL(href);
    let filePath = url.searchParams.get('path');
    if (url.protocol !== WIKI_LINK_PROTOCOL || url.hostname !== 'open' || !filePath) return null;
    // URLSearchParams 通常已经解码一层；兼容 Markdown 链路中被二次编码的 path。
    try {
      const decodedPath = decodeURIComponent(filePath);
      if (decodedPath !== filePath) filePath = decodedPath;
    } catch {
      return null;
    }
    if (filePath.startsWith('/') || filePath.split('/').some((part) => part === '..')) return null;
    return filePath;
  } catch {
    return null;
  }
}
