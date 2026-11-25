/**
 * 検索語ごとの静的ページ・sitemap.xml・robots.txt を docs/ に書き出す（npm run build:site から実行）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderSite } from "./pages.js";

// コンパイル後は .test-dist/site/ にあるので、リポジトリのルートは 2 つ上
const docs = join(fileURLToPath(new URL("../../", import.meta.url)), "docs");
for (const [path, content] of renderSite()) {
  const file = join(docs, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
