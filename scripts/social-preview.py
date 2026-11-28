"""GitHub のソーシャルプレビュー画像（1280×640）を作る: docs/img/social-preview.png

使い方: python3 scripts/social-preview.py
必要なもの: Pillow と Noto Sans CJK JP（Debian/Ubuntu なら fonts-noto-cjk）。
GitHub への設定は、リポジトリの Settings → General → Social preview から画面で行う（API では設定できない）。
見た目は docs/img/ogp.png（ブラウザ版の共有用）にそろえ、こちらは開発者向けの文面にしている。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "img" / "social-preview.png"
W, H = 1280, 640
GREEN = "#0b6b57"
INK = "#1e2530"
MUTED = "#5b6470"
BG = "#f6f7f8"
FONT_DIR = Path("/usr/share/fonts/opentype/noto")


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    # Noto Sans CJK の .ttc は、0 番が JP
    return ImageFont.truetype(str(FONT_DIR / f"NotoSansCJK-{weight}.ttc"), size, index=0)


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 24, H], fill=GREEN)
    x = 104
    d.text((x, 92), "setsuzei", font=font("Bold", 52), fill=GREEN)
    d.text((x, 178), "Japanese tax engine for LLM agents", font=font("Bold", 58), fill=INK)
    d.text((x, 272), "LLM に日本の税額を暗算させない計算エンジン", font=font("Bold", 46), fill=INK)
    d.text((x, 372), "MCP server · CLI · Agent Skill · browser", font=font("Medium", 34), fill=MUTED)
    d.text((x, 424), "ふるさと納税 · iDeCo · 青色申告 · 確定申告書の欄", font=font("Medium", 34), fill=MUTED)
    d.text((x, 520), "npm: setsuzei   ·   cited from primary sources   ·   tested   ·   local-only   ·   MIT", font=font("Medium", 26), fill=GREEN)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)} {img.size[0]}x{img.size[1]}")


if __name__ == "__main__":
    main()
