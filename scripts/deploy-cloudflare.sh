#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="$ROOT_DIR/apps/server"
SERVER_CONFIG="$SERVER_DIR/wrangler.jsonc"
SERVER_DEPLOY_CONFIG="$SERVER_DIR/wrangler.deploy.jsonc"
STATE_FILE="$ROOT_DIR/.env.cloudflare-workers"
WRANGLER_BIN="$SERVER_DIR/node_modules/.bin/wrangler"

usage() {
  cat <<'EOF'
Usage: bash ./scripts/deploy-cloudflare.sh [--rotate-secrets]

Deploys the Rajio sync backend in apps/server to Cloudflare.

Options:
  --rotate-secrets  Generate a new API token and realtime signing secret instead of reusing saved values.
  -h, --help        Show this help text.
EOF
}

log_step() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

prompt_with_default() {
  local prompt="$1"
  local default_value="$2"
  local reply

  if [[ -n "$default_value" ]]; then
    read -r -p "$prompt [$default_value]: " reply
    printf '%s' "${reply:-$default_value}"
    return
  fi

  read -r -p "$prompt: " reply
  printf '%s' "$reply"
}

read_worker_name_from_config() {
  local config_path="$1"

  node --input-type=module - "$config_path" <<'NODE'
import fs from "node:fs";

const configPath = process.argv[2];
const source = fs.readFileSync(configPath, "utf8");
const match = source.match(/"name"\s*:\s*"([^"]+)"/);

if (!match) {
  process.exit(1);
}

process.stdout.write(match[1]);
NODE
}

generate_api_token() {
  node --input-type=module <<'NODE'
import { randomBytes } from "node:crypto";

process.stdout.write(`rajio_${randomBytes(24).toString("base64url")}`);
NODE
}

generate_realtime_secret() {
  node --input-type=module <<'NODE'
import { randomBytes } from "node:crypto";

process.stdout.write(randomBytes(32).toString("hex"));
NODE
}

write_state_file() {
  local server_worker_name="$1"
  local d1_database_name="$2"
  local d1_location="$3"
  local api_token="$4"
  local realtime_secret="$5"

  : >"$STATE_FILE"
  printf '%s=%q\n' "PGCAST_SERVER_WORKER_NAME" "$server_worker_name" >>"$STATE_FILE"
  printf '%s=%q\n' "PGCAST_D1_DATABASE_NAME" "$d1_database_name" >>"$STATE_FILE"
  printf '%s=%q\n' "PGCAST_D1_LOCATION" "$d1_location" >>"$STATE_FILE"
  printf '%s=%q\n' "PGCAST_API_TOKEN" "$api_token" >>"$STATE_FILE"
  printf '%s=%q\n' "PGCAST_REALTIME_TICKET_SECRET" "$realtime_secret" >>"$STATE_FILE"
  chmod 600 "$STATE_FILE"
}

lookup_d1_database_id() {
  local database_name="$1"
  local info_json

  if ! info_json="$(
    cd "$ROOT_DIR" &&
      "$WRANGLER_BIN" d1 info "$database_name" --json 2>/dev/null
  )"; then
    return 1
  fi

  D1_INFO_JSON="$info_json" node --input-type=module <<'NODE'
const raw = process.env.D1_INFO_JSON ?? "";
const data = JSON.parse(raw);
const entries = Array.isArray(data) ? data : [data];

for (const entry of entries) {
  const databaseId = entry.uuid ?? entry.database_id ?? entry.id;
  if (databaseId) {
    process.stdout.write(databaseId);
    process.exit(0);
  }
}

process.exit(1);
NODE
}

create_server_deploy_config() {
  local worker_name="$1"
  local database_name="$2"
  local database_id="$3"

  node --input-type=module - \
    "$SERVER_CONFIG" \
    "$SERVER_DEPLOY_CONFIG" \
    "$worker_name" \
    "$database_name" \
    "$database_id" <<'NODE'
import fs from "node:fs";

const [sourcePath, targetPath, workerName, databaseName, databaseId] = process.argv.slice(2);
let source = fs.readFileSync(sourcePath, "utf8");

const replacements = [
  [/"name"\s*:\s*"[^"]+"/, `"name": ${JSON.stringify(workerName)}`],
  [/"database_name"\s*:\s*"[^"]+"/, `"database_name": ${JSON.stringify(databaseName)}`],
  [/"database_id"\s*:\s*"[^"]+"/, `"database_id": ${JSON.stringify(databaseId)}`],
  [/"preview_database_id"\s*:\s*"[^"]+"/, `"preview_database_id": ${JSON.stringify(databaseId)}`],
];

for (const [pattern, replacement] of replacements) {
  if (!pattern.test(source)) {
    throw new Error(`Could not update ${pattern}`);
  }

  source = source.replace(pattern, replacement);
}

fs.writeFileSync(targetPath, source);
NODE
}

rotate_secrets=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      ;;
    --rotate-secrets)
      rotate_secrets=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

require_command bash
require_command node
require_command pnpm

[[ -x "$WRANGLER_BIN" ]] || fail "Wrangler was not found at $WRANGLER_BIN. Run 'pnpm install' first."

if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

default_server_worker_name="${PGCAST_SERVER_WORKER_NAME:-$(read_worker_name_from_config "$SERVER_CONFIG")}"
default_d1_database_name="${PGCAST_D1_DATABASE_NAME:-$default_server_worker_name}"
default_d1_location="${PGCAST_D1_LOCATION:-}"

server_worker_name="$(prompt_with_default "Server Worker name" "$default_server_worker_name")"
d1_database_name="$(prompt_with_default "D1 database name" "$default_d1_database_name")"
d1_location="$(prompt_with_default "D1 location hint (blank for automatic placement)" "$default_d1_location")"

api_token="${PGCAST_API_TOKEN:-}"
realtime_secret="${PGCAST_REALTIME_TICKET_SECRET:-}"

if [[ $rotate_secrets -eq 1 ]]; then
  log_step "Generating fresh server secrets"
  api_token="$(generate_api_token)"
  realtime_secret="$(generate_realtime_secret)"
elif [[ -n "$api_token" && -n "$realtime_secret" ]]; then
  log_step "Reusing saved server secrets from $STATE_FILE"
else
  log_step "Generating server secrets"
  api_token="$(generate_api_token)"
  realtime_secret="$(generate_realtime_secret)"
fi

write_state_file \
  "$server_worker_name" \
  "$d1_database_name" \
  "$d1_location" \
  "$api_token" \
  "$realtime_secret"

log_step "Checking Wrangler authentication"
if ! (
  cd "$ROOT_DIR" &&
    "$WRANGLER_BIN" whoami --json >/dev/null
); then
  fail "Wrangler is not authenticated. Run 'apps/server/node_modules/.bin/wrangler login' and rerun the script."
fi

log_step "Resolving the D1 database"
if d1_database_id="$(lookup_d1_database_id "$d1_database_name")"; then
  printf 'Reusing D1 database %s (%s)\n' "$d1_database_name" "$d1_database_id"
else
  printf 'Creating D1 database %s\n' "$d1_database_name"
  if [[ -n "$d1_location" ]]; then
    (
      cd "$ROOT_DIR" &&
        "$WRANGLER_BIN" d1 create "$d1_database_name" --location "$d1_location"
    )
  else
    (
      cd "$ROOT_DIR" &&
        "$WRANGLER_BIN" d1 create "$d1_database_name"
    )
  fi

  d1_database_id="$(lookup_d1_database_id "$d1_database_name")" ||
    fail "The D1 database was created, but its database ID could not be resolved."
fi

log_step "Preparing deploy-only Wrangler config"
create_server_deploy_config "$server_worker_name" "$d1_database_name" "$d1_database_id"

log_step "Building the server Worker"
(
  cd "$ROOT_DIR" &&
    pnpm --filter @rajio-app/server build
)

log_step "Uploading server secrets"
printf '%s' "$api_token" | (
  cd "$SERVER_DIR" &&
    "$WRANGLER_BIN" secret put PGCAST_API_TOKEN --config "$SERVER_DEPLOY_CONFIG"
)
printf '%s' "$realtime_secret" | (
  cd "$SERVER_DIR" &&
    "$WRANGLER_BIN" secret put PGCAST_REALTIME_TICKET_SECRET --config "$SERVER_DEPLOY_CONFIG"
)

log_step "Applying remote D1 migrations"
(
  cd "$SERVER_DIR" &&
    "$WRANGLER_BIN" d1 migrations apply DB --remote --config "$SERVER_DEPLOY_CONFIG"
)

log_step "Deploying the server Worker"
deploy_output="$(mktemp)"
trap 'rm -f "$deploy_output"' EXIT
(
  cd "$SERVER_DIR" &&
    WRANGLER_OUTPUT_FILE_PATH="$deploy_output" "$WRANGLER_BIN" deploy --config "$SERVER_DEPLOY_CONFIG"
)

server_url="$(node --input-type=module - "$deploy_output" "$server_worker_name" <<'NODE'
import { readFileSync } from "node:fs";

const [outputPath, workerName] = process.argv.slice(2);
const deployment = readFileSync(outputPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .find((entry) => entry.type === "deploy" && entry.worker_name === workerName);
const endpoint = deployment?.targets?.find((target) =>
  /^https:\/\/[^./]+\.[^./]+\.workers\.dev$/.test(target),
);
if (!endpoint) {
  process.exit(1);
}
process.stdout.write(endpoint);
NODE
)" || fail "The Worker deployed, but Wrangler did not report a workers.dev endpoint. Check the deploy output above."

cat <<EOF

Cloudflare deployment complete.

Server URL: $server_url
Personal token: $api_token

Saved local deployment values to:
  $STATE_FILE

Next step in Rajio desktop:
  Settings -> Sync Backend
  Endpoint: $server_url
  Token: $api_token

If you need to rotate the saved secrets later, rerun:
  pnpm cf:deploy -- --rotate-secrets
EOF
