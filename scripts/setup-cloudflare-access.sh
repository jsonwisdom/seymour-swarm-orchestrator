#!/usr/bin/env bash
# Seymour — Cloudflare Access setup script
# Checks Access status, attempts API-supported configuration,
# and records Human Intervention Required (HIR) steps.
# Does not accept billing terms or activate Access automatically.

set -euo pipefail

WORKER_NAME="${WORKER_NAME:-seymour-swarm-orchestrator}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"

if [[ -z "$ACCOUNT_ID" || -z "$API_TOKEN" ]]; then
  echo "ERROR: Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN."
  echo "Create a token at https://dash.cloudflare.com/profile/api-tokens with:"
  echo "  - Account.Access: Organizations, Identity Providers, and Groups: Edit"
  echo "  - Account.Access: Apps and Policies: Edit"
  echo "  - Account.Workers Scripts: Edit"
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
AUTH="Authorization: Bearer $API_TOKEN"

echo "=== Seymour Cloudflare Access Setup ==="
echo "Worker: $WORKER_NAME"
echo "Account: $ACCOUNT_ID"
echo

# 1. Check Access status
echo "[1/4] Checking Cloudflare Access status..."
ACCESS_RESP=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/access/organizations")
ACCESS_SUCCESS=$(echo "$ACCESS_RESP" | jq -r '.success // false')
ACCESS_ERROR=$(echo "$ACCESS_RESP" | jq -r '.errors[0].code // empty')

if [[ "$ACCESS_SUCCESS" != "true" ]]; then
  echo "ACCESS STATUS: NOT ENABLED"
  echo "Error: $ACCESS_ERROR"
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Enable Cloudflare Access"
  echo "Reason: Access is not activated on this account."
  echo "Minimum action: Open https://one.dash.cloudflare.com and select Enable Access."
  echo "Review Free plan terms before accepting."
  echo "After activation, re-run this script."
  exit 2
fi

echo "ACCESS STATUS: ENABLED"

# 2. List existing Access applications
echo "[2/4] Listing Access applications..."
APPS=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/access/apps")
echo "$APPS" | jq -r '.result[] | "\(.name) \(.domain)"' 2>/dev/null || echo "(none or unable to parse)"

# 3. Check for Seymour application
SEYMOUR_APP=$(echo "$APPS" | jq -r --arg d "seymour-swarm-orchestrator.jaywisdom44.workers.dev" '.result[] | select(.domain == $d) | .id' 2>/dev/null || true)
if [[ -z "$SEYMOUR_APP" ]]; then
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Create Access application for Seymour"
  echo "Reason: No application found for seymour-swarm-orchestrator.jaywisdom44.workers.dev"
  echo "Minimum action: Create a Self-hosted application in Zero Trust → Access → Applications."
  echo "  Domain: seymour-swarm-orchestrator.jaywisdom44.workers.dev"
  echo "  Protect: /recovery/*, /investigate, /graph/*, /workflow/*, /bus/*, /control-desk"
  echo "  Leave public: /health, /comms/who, /simulator/status"
  echo "After creation, re-run this script to continue."
  exit 3
fi

echo "Seymour Access application found: $SEYMOUR_APP"

# 4. Check Worker secrets
echo "[3/4] Checking Worker secrets..."
SECRETS=$(curl -s -H "$AUTH" "$API/accounts/$ACCOUNT_ID/workers/scripts/$WORKER_NAME/secrets")
echo "$SECRETS" | jq -r '.result[]?.name // empty' 2>/dev/null || echo "(none)"

HAS_ALLOWLIST=$(echo "$SECRETS" | jq -r '.result[]?.name | select(. == "ACCESS_ALLOWLIST")' 2>/dev/null || true)
HAS_ORCH=$(echo "$SECRETS" | jq -r '.result[]?.name | select(. == "ACCESS_ORCHESTRATION_ALLOWLIST")' 2>/dev/null || true)

if [[ -z "$HAS_ALLOWLIST" || -z "$HAS_ORCH" ]]; then
  echo
  echo "=== HUMAN INTERVENTION REQUIRED ==="
  echo "Blocked operation: Set ACCESS_ALLOWLIST and ACCESS_ORCHESTRATION_ALLOWLIST"
  echo "Reason: Secrets are not configured on the Worker."
  echo "Minimum action: Provide the authorized operator email(s) via a secure channel, then run:"
  echo "  echo '<comma-separated-emails>' | npx wrangler secret put ACCESS_ALLOWLIST --name $WORKER_NAME"
  echo "  echo '<comma-separated-emails>' | npx wrangler secret put ACCESS_ORCHESTRATION_ALLOWLIST --name $WORKER_NAME"
  echo "Do not paste secrets into chat."
  exit 4
fi

echo "[4/4] Secrets present."
echo
echo "=== SETUP COMPLETE ==="
echo "Access is enabled, Seymour application exists, and allowlist secrets are set."
echo "Next: run the authenticated recovery round-trip against:"
echo "  https://seymour-swarm-orchestrator.jaywisdom44.workers.dev"
