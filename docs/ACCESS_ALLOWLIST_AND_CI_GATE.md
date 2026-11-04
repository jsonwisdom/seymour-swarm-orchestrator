# Seymour Access authorization — implementation and deployment gates

## Current verified state (2026-11-04)

- GitHub recovery CI run 41802225036: TypeScript typecheck PASS; Vitest 12/12 PASS.
- GitHub bundle CI run 41802224924: PASS.
- Source authorization: Cloudflare's verified `ctx.access.getIdentity()` (not untrusted HTTP headers) plus explicit allowlists. Bearer-token fallback is preserved as legacy and only active if `CONTROL_DESK_TOKEN` is configured.
- Cloudflare Access organization: account API returned `access.api.error.not_enabled` (403). Access is not active.
- Worker `/secrets` returned []; no Access allowlist or bearer secret provisioned.
- **Deployed Worker is intentionally unchanged.** CI PASS is not authenticated recovery PASS.

## Allowlist contract

- `ACCESS_ALLOWLIST`: comma-separated human operator emails who may call `/recovery/save`, `/recovery/load/{missionId}`, and `/recovery/unfinished` after an actual Cloudflare Access login. Missing list or identity => denied.
- `ACCESS_ORCHESTRATION_ALLOWLIST`: additional and independent explicit grant required for `/investigate`, `/control-desk`, `/graph/{id}`, `/workflow/{id}`, and `/bus/*`. Also requires membership in `ACCESS_ALLOWLIST`. No automatic privilege escalation.
- Access service-token clients have no implied operator email permission. They need separately designed service identities and narrowly scoped roles rather than pretending to be a human.
- The presence of `Cf-Access-*` request headers is **not authentication**. Never trust unauthenticated header values.
- The bearer fallback is a high-privilege shared secret, not an identity system. Retain only as temporary compatibility; keep absent in production until secure channel and rotation exist.
- Unknown paths and lookalike routes are denied for Access identities.

## Activation gate

1. Enable Cloudflare Zero Trust / Access for the account. An account-level activation or plan/terms decision may be required, and the user must approve any financial terms.
2. Confirm `GET /access/organizations` works; inspect existing applications and policies before modifying.
3. Create the Access application and validate signed-in identity from `ctx.access.getIdentity()`; select exact authorized human operator email(s).
4. Provision `ACCESS_ALLOWLIST` as a Cloudflare Worker secret, not in Git/Drive/chat/HTML. Only provision the optional orchestration list after distinct authorization. Do not create placeholder emails.
5. Stage and deploy the reviewed artifact; verify public discovery, unauthenticated 401/403 and actual allowlisted Access access. Do not deploy solely because CI passed.
6. Save synthetic STARTED mission; read revision 1; save IN_PROGRESS; read revision 2; confirm unfinished and fresh-session persistence. Log sanitized receipt.

## CI evidence

- 12 tests across two suites, including unauthorized ingress, forged Access headers, route-level permission separation, and Durable Object recovery.
- `npx tsc --noEmit` is now a required CI gate; `wrangler deploy --dry-run` builds the Worker artifact separately.
- Neither local test nor dry-run establishes that Cloudflare Access is configured or that a live authenticated operation succeeded.
