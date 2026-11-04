#!/usr/bin/env bash
# Seymour — read-only Cloudflare Access preflight. Never accepts terms or creates tokens.
set -euo pipefail
WORKER_NAME="${WORKER_NAME:-seymour-swarm-orchestrator}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
API="https://api.cloudflare.com/client/v4"
if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "HIR: Local CLI credentials unavailable. Prefer the connected Cloudflare interface; never paste tokens in chat." >&2
  exit 1
fi
command -v curl >/dev/null || { echo "FAIL: curl unavailable" >&2; exit 8; }
command -v jq >/dev/null || { echo "FAIL: jq unavailable" >&2; exit 8; }
cf_get() {
  local raw
  if ! raw="$(curl -sS --connect-timeout 10 --max-time 30 -H "Authorization: Bearer $API_TOKEN" -H 'Accept: application/json' -w '\n%{http_code}' "$API$1")"; then
    echo "UNKNOWN: Cloudflare API transport failure; not evidence of missing resources." >&2
    exit 8
  fi
  HTTP="${raw##*$'\n'}"
  BODY="${raw%$'\n'*}"
  if ! jq -e . <<<"$BODY" >/dev/null 2>&1; then
    echo "UNKNOWN: non-JSON response, HTTP $HTTP" >&2
    exit 8
  fi
}
require_success() {
  if [[ "$HTTP" != 200 ]] || ! jq -e '.success == true' <<<"$BODY" >/dev/null; then
    echo "UNKNOWN: Cloudflare API HTTP $HTTP, code $(jq -r '.errors[0].code // "unknown"' <<<"$BODY"). This may be missing permissions, not an absent resource." >&2
    exit 8
  fi
}
echo "=== SEYMOUR ACCESS PREFLIGHT — READ ONLY ==="
cf_get "/accounts/$ACCOUNT_ID/access/organizations"
if [[ "$HTTP" == 403 ]] && jq -e '.errors[]?.message | contains("access.api.error.not_enabled")' <<<"$BODY" >/dev/null; then
  echo "HOLD: ACCESS_NOT_ENABLED (HTTP 403 / access.api.error.not_enabled)"
  echo "HIR: Account owner must review and approve account enrollment/terms in Zero Trust."
  echo "Do not treat a Drive design document as an activated Access organization."
  exit 2
fi
require_success
echo "PASS: Access organization exists"
cf_get "/accounts/$ACCOUNT_ID/workers/subdomain"
require_success
SUBDOMAIN="$(jq -r '.result.subdomain // empty' <<<"$BODY")"
if [[ -z "$SUBDOMAIN" ]]; then
  echo "UNKNOWN: Account subdomain missing; unable to check exact Seymour host"
  exit 8
fi
HOST="$WORKER_NAME.$SUBDOMAIN.workers.dev"
cf_get "/accounts/$ACCOUNT_ID/access/apps"
require_success
APP_ID="$(jq -r --arg h "$HOST" '.result[]? | select((.domain // "") == $h or any(.domain_list[]?; (.domain // "") == $h)) | .id' <<<"$BODY" | head -n1)"
if [[ -z "$APP_ID" ]]; then
  echo "HOLD: No Access application found for $HOST"
  echo "Next automated step after approval: create a carefully scoped Access application and policy; preserve /health and /comms/who."
  exit 3
fi
echo "PASS: Access application exists (ID $APP_ID)"
cf_get "/accounts/$ACCOUNT_ID/access/apps/$APP_ID/policies"
require_success
if ! jq -e '.result | length > 0' <<<"$BODY" >/dev/null; then
  echo "HOLD: Access application has no policies"
  exit 3
fi
echo "CONFIGURED: Access application has policies; test actual authorization separately."
cf_get "/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets"
require_success
if ! jq -e '.result | any(.[]; .name == "ACCESS_ALLOWLIST")' <<<"$BODY" >/dev/null; then
  echo "HOLD: ACCESS_ALLOWLIST Worker secret not configured"
  echo "Provision through Cloudflare Secrets only after a verified operator identity exists."
  exit 4
fi
echo "CONFIGURED: ACCESS_ALLOWLIST (secret value not fetched)"
if jq -e '.result | any(.[]; .name == "ACCESS_ORCHESTRATION_ALLOWLIST")' <<<"$BODY" >/dev/null; then
  echo "CONFIGURED: additional orchestration grant"
else
  echo "INFO: orchestration grant absent; this is the safe default."
fi
echo "CONFIGURATION CHECK PASS; authenticated recovery and live permissions still require end-to-end HTTP proof."
