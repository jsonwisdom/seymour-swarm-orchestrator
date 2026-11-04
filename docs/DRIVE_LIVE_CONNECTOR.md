# Live Google Drive connector

## Status
Code is committed. Live sync requires a Worker secret and a deploy.

## What the Worker does
- If `GOOGLE_SERVICE_ACCOUNT` is set, `/recovery/index` calls the Drive API and returns live file metadata.
- If the secret is missing or the API fails, it falls back to the committed snapshot in `src/drive-snapshot.ts`.
- The response field `external.source` is `LIVE` or `SNAPSHOT`.

## Account-holder steps
1. In Google Cloud Console, enable the Google Drive API.
2. Create a service account.
3. Download its JSON key.
4. Share the Seymour Drive documents (or a folder) with the service account email (Viewer).
5. Set the secret (do not paste the key into chat):
   ```bash
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT --name seymour-swarm-orchestrator
   ```
   Paste the full JSON key when prompted.
6. Deploy:
   ```bash
   npx wrangler deploy
   ```
7. Open `/recovery/index` (signed in) and confirm `external.source` is `LIVE`.

## Security
- Private key stays in Cloudflare Secrets only.
- Scope is `drive.readonly`.
- Recovery routes remain behind Cloudflare Access + allowlist.
