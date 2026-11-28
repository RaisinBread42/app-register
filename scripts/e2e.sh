#!/usr/bin/env bash
# End-to-end run: migrate → seed demo data → build → start the app → Playwright (journeys, axe, screenshots).
#   DATABASE_URL=postgres://... npm run e2e              # all e2e tests
#   DATABASE_URL=postgres://... npm run e2e -- journeys   # pass-through filter for Playwright
# Use a throwaway local or CI database: the seed refuses a workspace that holds real apps.
# Outside sources are blocked in the app server (e2e/block-network.cjs). E2E_SKIP_BUILD=1 reuses .next/.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

: "${DATABASE_URL:?DATABASE_URL must point at a throwaway Postgres database}"
PORT="${E2E_PORT:-3100}"
export E2E_BASE_URL="http://localhost:${PORT}"
export UI_PASSWORD="${UI_PASSWORD:-e2e-$(node -e 'console.log(require("node:crypto").randomBytes(9).toString("hex"))')}"

npm run --silent db:migrate
npm run --silent db:seed
APP_REGISTER_API_KEY="$(npx tsx scripts/api-key.ts create "e2e $(date -u +%Y%m%dT%H%M%S)" | tail -n 1)"
export APP_REGISTER_API_KEY

if [ "${E2E_SKIP_BUILD:-}" != "1" ]; then
  npm run --silent build
fi

mkdir -p e2e-artifacts/screenshots
# Any HTTP answer (even 401 from a leftover app server) means the port is taken.
if curl -s -o /dev/null "$E2E_BASE_URL" 2>/dev/null; then
  echo "e2e: something already answers on port $PORT; stop it or set E2E_PORT"; exit 1
fi
# Own process group where setsid exists (Linux, CI), so the cleanup stops the server and every child.
group=""
command -v setsid >/dev/null && group="setsid"
APP_URL="$E2E_BASE_URL" NODE_OPTIONS="--require ./e2e/block-network.cjs" \
  $group node node_modules/next/dist/bin/next start -p "$PORT" > e2e-artifacts/server.log 2>&1 &
server_pid=$!
trap 'kill -- -"$server_pid" 2>/dev/null || kill "$server_pid" 2>/dev/null || true' EXIT

for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null "$E2E_BASE_URL/api/openapi.json"; then break; fi
  sleep 1
done
curl -fsS -o /dev/null "$E2E_BASE_URL/api/openapi.json" || { echo "e2e: app did not start; see e2e-artifacts/server.log"; exit 1; }

npx playwright test "$@"
echo "e2e: screenshots in e2e-artifacts/screenshots, report in e2e-artifacts/report.json"
