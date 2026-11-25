/**
 * 金額の文字列を円の整数にする。
 * "6000000" / "6,000,000" / "600万" / "62.5万" / "6000000円" を受け付ける。
 * 解釈できなければ null。
 */
export function parseAmount(text: string): number | null {
  const normalized = text
    .trim()
    .replace(/[０-９．，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,_\s]/g, "")
    .replace(/円$/, "");
  const match = /^(\d+(?:\.\d+)?)(万)?$/.exec(normalized);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 10_000 : 1);
  // 62.5万 のような指定で生じる浮動小数の誤差を丸める
  const rounded = Math.round(value);
  if (!Number.isSafeInteger(rounded) || Math.abs(value - rounded) > 1e-6) return null;
  return rounded;
}
