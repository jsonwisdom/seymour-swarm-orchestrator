#!/usr/bin/env bash
# Seymour — Cloudflare Worker setup script
# Checks Worker status, lists bindings and secrets, and records
# Human Intervention Required (HIR) steps for deployment and secrets.
# Does not deploy or set secrets automatically.

set -euo pipefail

WORKER_NAME="${WORKER_NAME:-seymour-swarm-orchestrator}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "ERROR: Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
  echo "Create a token at https://dash.cloudflare.com/profile/api-tokens with:"
  echo "  - Account.Workers Scripts: Edit"
  echo "  - Account.Workers Routes: Edit"
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer $API_TOKEN"

echo "=== Seymour Cloudflare Worker Setup ==="
echo "Worker: $WORKER_NAME"
echo "Account: $ACCOUNT_ID"
echo

# 1. Check if Worker exists
echo "[1/4] Checking Worker status..."
WORKER_RESP=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME")
WORKER_SUCCESS=$(echo "$WORKER_RESP" | jq -r '.success // false')

if [[ "$WORKER_SUCCESS" != "true" ]]; then
  echo "WORKER STATUS: NOT FOUND"
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Deploy Worker"
  echo "Reason: No Worker named $WORKER_NAME exists on this account."
  echo "Minimum action: From the repository root, run:"
  echo "  npx wrangler deploy"
  echo "Or confirm the Worker name matches the deployed script."
  exit 2
fi

echo "WORKER STATUS: DEPLOYED"

# 2. List bindings
echo "[2/4] Listing bindings..."
BINDINGS=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/settings")
echo "$BINDINGS" | jq -r '.result.bindings[]? | "\(.name) (\(.type))"' 2>/dev/null || echo "(none or unable to parse)"

HAS_MISSION=$(echo "$BINDINGS" | jq -r '.result.bindings[]? | select(.name == "MISSION_STATE") | .name' 2>/dev/null || true)
HAS_LEDGER=$(echo "$BINDINGS" | jq -r '.result.bindings[]? | select(.name == "TASK_LEDGER") | .name' 2>/dev/null || true)

if [[ -z "$HAS_MISSION" || -z "$HAS_LEDGER" ]]; then
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Confirm Durable Object bindings"
  echo "Reason: MISSION_STATE or TASK_LEDGER binding is missing."
  echo "Minimum action: Verify wrangler.jsonc and redeploy:"
  echo "  npx wrangler deploy"
  exit 3
fi

echo "Required bindings present."

# 3. List secrets
echo "[3/4] Listing secrets..."
SECRETS=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets")
echo "$SECRETS" | jq -r '.result[]?.name // empty' 2>/dev/null || echo "(none)"

HAS_ALLOWLIST=$(echo "$SECRETS" | jq -r '.result[]?.name | select(. == "ACCESS_ALLOWLIST")' 2>/dev/null || true)
HAS_ORCH=$(echo "$SECRETS" | jq -r '.result[]?.name | select(. == "ACCESS_ORCHESTRATION_ALLOWLIST")' 2>/dev/null || true)
HAS_TOKEN=$(echo "$SECRETS" | jq -r '.result[]?.name | select(. == "CONTROL_DESK_TOKEN")' 2>/dev/null || true)

if [[ -z "$HAS_ALLOWLIST" || -z "$HAS_ORCH" ]]; then
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Set allowlist secrets"
  echo "Reason: ACCESS_ALLOWLIST or ACCESS_ORCHESTRATION_ALLOWLIST is not configured."
  echo "Minimum action: Provide authorized operator emails via a secure channel, then run:"
  echo "  echo '<comma-separated-emails>' | npx wrangler secret put ACCESS_ALLOWLIST --name $WORKER_NAME"
  echo "  echo '<comma-separated-emails>' | npx wrangler secret put ACCESS_ORCHESTRATION_ALLOWLIST --name $WORKER_NAME"
  echo "Do not paste secrets into chat."
  exit 4
fi

echo "Allowlist secrets present."

# 4. Check workers.dev subdomain
echo "[4/4] Checking workers.dev route..."
SUBDOMAIN=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/workers/subdomain")
SUBDOMAIN_NAME=$(echo "$SUBDOMAIN" | jq -r '.result.subdomain // empty')

if [[ -z "$SUBDOMAIN_NAME" ]]; then
  echo "workers.dev subdomain: not found or not enabled"
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Enable workers.dev route"
  echo "Reason: No workers.dev subdomain is configured for this account."
  echo "Minimum action: Enable the workers.dev route in the Cloudflare dashboard or via wrangler."
  exit 5
fi

echo "workers.dev subdomain: $SUBDOMAIN_NAME"
echo "Expected URL: https://$WORKER_NAME.$SUBDOMAIN_NAME.workers.dev"

echo
echo "=== WORKER SETUP COMPLETE ==="
echo "Worker is deployed, required bindings exist, and allowlist secrets are set."
echo "Next: run the authenticated recovery round-trip against the workers.dev URL."
