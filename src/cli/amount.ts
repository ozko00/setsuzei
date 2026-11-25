/**
 * 金額の文字列を円の整数にする。
 * "6000000" / "6,000,000" / "600万" / "62.5万" / "1億" / "1億2000万" / "6000000円" を受け付ける。
 * 全角の数字も読む。
 * 解釈できなければ null。
 */
export function parseAmount(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,_\s]/g, "")
    .replace(/円$/, "");
  const match = /^(?:(\d+(?:\.\d+)?)億)?(?:(\d+(?:\.\d+)?)(万)?)?$/.exec(normalized);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  // 「1億2000」のように億の後ろが万でない書き方は、読み違いを避けるため受け付けない
  if (match[1] !== undefined && match[2] !== undefined && !match[3]) return null;
  const value = Number(match[1] ?? 0) * 100_000_000 + Number(match[2] ?? 0) * (match[3] ? 10_000 : 1);
  // 62.5万 のような指定で生じる浮動小数の誤差を丸める
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || Math.abs(value - rounded) > 1e-6) return null;
  return rounded;
}
