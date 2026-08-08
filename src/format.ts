/** 汎用のHTMLエスケープ */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
// URLの直後によく付く日本語の句読点などは、URLの一部ではないので除外する
const TRAILING_PUNCTUATION = /[)\]）」』、。,.!?！？]+$/;

/**
 * プレーンテキストをエスケープしつつ、文中の http(s):// で始まるURLだけ
 * <a> タグに変換する。説明文はHTMLを書かない前提（migration時にも変換済み）なので、
 * これだけで十分安全にリンクを表示できる。
 */
export function linkifyText(text: string): string {
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_PATTERN.exec(text))) {
    result += escapeHtml(text.slice(lastIndex, match.index));

    let url = match[0];
    let trailing = '';
    const trailingMatch = url.match(TRAILING_PUNCTUATION);
    if (trailingMatch) {
      trailing = trailingMatch[0];
      url = url.slice(0, url.length - trailing.length);
    }

    result += `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>${escapeHtml(trailing)}`;
    lastIndex = match.index + match[0].length;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}
