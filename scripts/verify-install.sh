#!/usr/bin/env bash
# README と SKILL.md の「タグを指定して取得する」手順（git clone → npm ci）を、まっさらな Docker コンテナで
# くり返し実行して、失敗の回数と、そのときの出力を残す。公開済みのタグが対象。
#
#   scripts/verify-install.sh                 # いまの版のタグを、Node 20 / 22 / 24 / 26 で 10 回ずつ
#   scripts/verify-install.sh 3 22            # Node 22 で 3 回
#   DOCKER_ARGS="--network host" scripts/verify-install.sh   # docker run に引数を足す
#
# 1 回ごとに新しいコンテナを使い、出力はすべてログに残す（捨てない）。ログの場所は最後に表示する。
# 取得はネットワーク（github.com と registry.npmjs.org）に依存するので、失敗したらまずログの
# CLONE_EXIT / CI_EXIT と、その直前のエラーの文面を見る。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
count="${1:-10}"
shift || true
versions=("$@")
if [ ${#versions[@]} -eq 0 ]; then versions=(20 22 24 26); fi
tag="v$(node -p 'require("./package.json").version')"
out="$(mktemp -d "${TMPDIR:-/tmp}/setsuzei-verify-install.XXXXXX")"
# shellcheck disable=SC2206
extra=(${DOCKER_ARGS:-})
failed=0
total=0
for v in "${versions[@]}"; do
  for i in $(seq 1 "$count"); do
    log="$out/node$v-run$i.log"
    total=$((total + 1))
    docker run --rm "${extra[@]}" -e TAG="$tag" "node:$v" sh -c '
      echo "node $(node -v) / npm $(npm -v) / $(date -u +%H:%M:%S)"
      git clone --depth 1 --branch "$TAG" https://github.com/ozko00/setsuzei.git ~/.cache/setsuzei; echo "CLONE_EXIT=$?"
      npm ci --prefix ~/.cache/setsuzei; echo "CI_EXIT=$?"
      echo "VERSION=$(node ~/.cache/setsuzei/dist/cli.js --version 2>&1 | head -1)"
    ' > "$log" 2>&1 || true
    if grep -q "^VERSION=${tag#v}\$" "$log"; then
      echo "ok   node $v #$i"
    else
      failed=$((failed + 1))
      echo "FAIL node $v #$i: $(grep -E "^(CLONE_EXIT|CI_EXIT)=" "$log" | tr "\n" " ")（$log）"
      grep -m 3 -i -E "fatal|error" "$log" | sed "s/^/       /" || true
    fi
  done
done
echo
echo "$tag: $total 回のうち失敗 $failed 回。ログ: $out"
[ "$failed" -eq 0 ]
