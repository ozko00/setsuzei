/**
 * 入力を、この端末のこのブラウザの中（localStorage）に保存する。
 * 利用者が「入力をこの端末に保存する」を自分でオンにしたときだけ使う。既定では何も保存しない。
 * 外には送信しない。保存先に触るのは、このファイルだけ。
 */
const KEY = "setsuzei:input:v1";

export type Saved = Record<string, string | boolean>;

/** 保存してある入力を読む。なければ（または読めなければ）null。 */
export function loadSaved(): Saved | null {
  try {
    const text = window.localStorage.getItem(KEY);
    if (text === null) return null;
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const saved: Saved = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string" || typeof value === "boolean") saved[name] = value;
    }
    return saved;
  } catch {
    return null;
  }
}

/** 入力を保存する。保存できなかったら false（プライベートブラウズなど）。 */
export function save(values: Saved): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

/** 保存した入力を消す。 */
export function clearSaved(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 保存先を使えない環境では、消すものもない
  }
}
