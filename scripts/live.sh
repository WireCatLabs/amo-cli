#!/usr/bin/env bash
# The release's live check against the real service (WC-TEST-18, WC-REL-17): a person runs it with a real token on
# stdin, then records it with `pnpm exec cli-dev live record --script scripts/live.sh`. Every folder is a temporary
# one and the keyring is out of reach, so nothing touches the owner's store, keyring or settings.
#   AMO_LIVE_HOST=https://example.amocrm.ru scripts/live.sh < token-file
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

export AMO_CONFIG_DIR="$work/config" AMO_STATE_DIR="$work/state" AMO_CACHE_DIR="$work/cache"
export MESSAGING_STORE="$work/wirecat.db"
export DBUS_SESSION_BUS_ADDRESS="disabled:"
unset AMO_TOKEN AMO_HOST
host=${AMO_LIVE_HOST:?set AMO_LIVE_HOST to the account address}
cli=(node "$root/dist/bin/amo.js")

pnpm --dir "$root" -s build >/dev/null
# Set after the build, which needs the owner's pnpm store: a CLI that moves its folders on start must not see the
# owner's home.
export HOME="$work/home" XDG_CONFIG_HOME="$work/xdg/config" XDG_DATA_HOME="$work/xdg/data"
export XDG_STATE_HOME="$work/xdg/state" XDG_CACHE_HOME="$work/xdg/cache"
mkdir -p "$HOME"

"${cli[@]}" --wcat-describe | node -e '
  const answer = JSON.parse(require("fs").readFileSync(0, "utf8"))
  if (answer.wcat_describe !== 2 || !/^[0-9a-f]{64}$/.test(answer.manifest_sha256)) throw new Error("not format 2")'

"${cli[@]}" live session start --host "$host" --credential-storage file --json >/dev/null
trap '"${cli[@]}" live session end --json >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

"${cli[@]}" live session status --check --json >"$work/status.json"
"${cli[@]}" live api call "GET /api/v4/leads/pipelines" --json >"$work/pipelines.json"
node -e '
  const fs = require("fs")
  const status = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).item
  if (status.verified !== true || !status.account.id) throw new Error("the token was not verified")
  const pipelines = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).item.result._embedded.pipelines
  if (!pipelines.every((one) => one._embedded.statuses.some((stage) => stage.id === 142)))
    throw new Error("a pipeline has no won status 142")' "$work/status.json" "$work/pipelines.json"
"${cli[@]}" live doctor --json >/dev/null

"${cli[@]}" live session end --json >/dev/null
echo "live check passed: describe format 2, sign-in, status --check, pipelines, doctor, sign-out"
