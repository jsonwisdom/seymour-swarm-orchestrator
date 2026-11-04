#!/usr/bin/env bash
# Seymour — read-only Cloudflare Worker preflight. No deployments or secret writes.
set -euo pipefail
WORKER_NAME="${WORKER_NAME:-seymour-swarm-orchestrator}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
API="https://api.cloudflare.com/client/v4"
if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "HIR: CLI credential not supplied. Use connected Cloudflare account checks instead of asking the operator to copy tokens." >&2
  exit 1
fi
command -v curl >/dev/null || { echo "FAIL: curl unavailable" >&2; exit 8; }
command -v jq >/dev/null || { echo "FAIL: jq unavailable" >&2; exit 8; }
cf_get() {
  local raw
  if ! raw="$(curl -sS --connect-timeout 10 --max-time 30 -H "Authorization: Bearer $API_TOKEN" -H 'Accept: application/json' -w '\n%{http_code}' "$API$1")"; then
    echo "UNKNOWN: Cloudflare API transport failed (not evidence of a missing Worker)." >&2
    exit 8
  fi
  HTTP="${raw##*$'\n'}"
  BODY="${raw%$'\n'*}"
  if ! jq -e . <<<"$BODY" >/dev/null 2>&1; then
    echo "UNKNOWN: Cloudflare returned non-JSON; HTTP $HTTP" >&2
    exit 8
  fi
}
require_success() {
  if [[ "$HTTP" != 200 ]] || ! jq -e '.success == true' <<<"$BODY" >/dev/null; then
    echo "UNKNOWN: Cloudflare API returned HTTP $HTTP (error code $(jq -r '.errors[0].code // "unknown"' <<<"$BODY")). Do not assume resource missing." >&2
    exit 8
  fi
}
echo "=== SEYMOUR WORKER PREFLIGHT — READ ONLY ==="
echo "Worker: $WORKER_NAME"
cf_get "/accounts/$ACCOUNT_ID/workers/scripts"
require_success
if ! jq -e --arg n "$WORKER_NAME" '.result | any(.[]; .id == $n)' <<<"$BODY" >/dev/null; then
  echo "FAIL: Worker not listed under this account. Confirm account and deployment."
  exit 2
fi
echo "PASS: Worker exists"
cf_get "/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/settings"
require_success
for spec in "MISSION_STATE:MissionState" "TASK_LEDGER:TaskLedger"; do
  binding="${spec%%:*}"
  class="${spec#*:}"
  if ! jq -e --arg n "$binding" --arg c "$class" '.result.bindings | any(.[]; .name == $n and .type == "durable_object_namespace" and .class_name == $c)' <<<"$BODY" >/dev/null; then
    echo "FAIL: Required Durable Object $binding -> $class not verified"
    exit 3
  fi
  echo "PASS: Durable Object $binding -> $class"
done
cf_get "/accounts/$ACCOUNT_ID/workers/subdomain"
require_success
SUBDOMAIN="$(jq -r '.result.subdomain // empty' <<<"$BODY")"
if [[ -z "$SUBDOMAIN" ]]; then
  echo "HOLD: Account workers.dev subdomain absent"
  exit 5
fi
cf_get "/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/subdomain"
require_success
if ! jq -e '.result.enabled == true' <<<"$BODY" >/dev/null; then
  echo "HOLD: Worker workers.dev route disabled"
  exit 5
fi
echo "PASS: https://$WORKER_NAME.$SUBDOMAIN.workers.dev"
cf_get "/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets"
require_success
if jq -e '.result | any(.[]; .name == "ACCESS_ALLOWLIST" and .type == "secret_text")' <<<"$BODY" >/dev/null; then
  echo "CONFIGURED: ACCESS_ALLOWLIST (value never retrieved)"
else
  echo "HOLD: ACCESS_ALLOWLIST absent; authenticated recovery not ready"
  echo "Provision only after an authorized human identity and Access policy are established."
  exit 4
fi
if jq -e '.result | any(.[]; .name == "ACCESS_ORCHESTRATION_ALLOWLIST")' <<<"$BODY" >/dev/null; then
  echo "CONFIGURED: optional orchestration allowlist"
else
  echo "INFO: orchestration allowlist absent; no orchestration grant by default"
fi
echo "CONFIGURATION CHECK PASS. This does not prove Access policies or authenticated HTTP."
