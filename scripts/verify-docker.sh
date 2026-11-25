#!/usr/bin/env bash
# CI（.github/workflows/ci.yml）と同じ手順を、Docker の Node 20 / 22 / 24 で実行する。
# コミット済みの HEAD を対象にする（作業ツリーの未コミットの変更は含まない）。
#
#   scripts/verify-docker.sh          # 20 22 24
#   scripts/verify-docker.sh 22       # 指定したバージョンだけ
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
versions=("$@")
if [ ${#versions[@]} -eq 0 ]; then versions=(20 22 24); fi
status=0
for v in "${versions[@]}"; do
  if git archive HEAD | docker run --rm -i "node:${v}-slim" bash -euo pipefail -c '
      mkdir /work && cd /work && tar -x
      npm ci --silent >/dev/null 2>&1
      # README の「ソースを手元に置いて使う」手順: npm ci だけで dist/ ができる（prepare でビルド）
      node dist/cli.js --version >/dev/null
      npm run --silent typecheck
      npm test --silent >/tmp/test.log 2>&1 || { cat /tmp/test.log; exit 1; }
      npm run --silent build
      node dist/cli.js --input examples/freelancer.json >/dev/null
      node dist/cli.js --input examples/side-job.json --json >/dev/null
      summary=$(grep -E "^[^a-z]*(tests|pass|fail) [0-9]+$" /tmp/test.log | sed -E "s/^[^a-z]*//" | xargs)
      echo "node $(node -v): typecheck ok / ${summary} / build ok / cli ok"
    '; then :; else
    echo "node ${v}: FAILED"
    status=1
  fi
done
exit $status
