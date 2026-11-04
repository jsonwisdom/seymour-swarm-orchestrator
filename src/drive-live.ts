/**
 * Live Google Drive connector for Seymour.
 * Uses a service-account JWT (Web Crypto) stored as Worker secret
 * GOOGLE_SERVICE_ACCOUNT. Falls back to the committed snapshot if
 * the secret is absent or the API call fails.
 *
 * Setup (account holder):
 * 1. Create a Google Cloud service account with Drive API enabled.
 * 2. Share the Seymour Drive files (or folder) with the service account email.
 * 3. npx wrangler secret put GOOGLE_SERVICE_ACCOUNT --name seymour-swarm-orchestrator
 *    (paste the full JSON key)
 */
import { DRIVE_POINTERS, DRIVE_SNAPSHOT_DATE, type DrivePointer } from "./drive-snapshot";

export interface DriveLiveEnv {
  GOOGLE_SERVICE_ACCOUNT?: string;
}

export interface DriveLiveResult {
  source: "LIVE" | "SNAPSHOT";
  pointers: DrivePointer[];
  fetchedAt: string;
  error?: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function b64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string"
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat,
    exp,
    scope: "https://www.googleapis.com/auth/drive.readonly"
  }));
  const unsigned = `${header}.${payload}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!res.ok) throw new Error(`TOKEN_EXCHANGE_FAILED:${res.status}`);
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error("NO_ACCESS_TOKEN");
  return data.access_token;
}

function inferStatus(name: string): string {
  const n = name.toUpperCase();
  if (n.includes("DESIGN_HOLD") || n.includes("HOLD")) return "DESIGN_HOLD";
  if (n.includes("AUDIT")) return "AUDIT_CHECKPOINT";
  if (n.includes("PROTOCOL")) return "PROTOCOL";
  if (n.includes("SPEC")) return "SPEC";
  if (n.includes("REPLAY")) return "REPLAY";
  if (n.includes("MANUAL")) return "MANUAL";
  if (n.includes("CONSTITUTIONAL")) return "SYSTEM";
  return "DRIVE";
}

export async function fetchLiveDrivePointers(env: DriveLiveEnv): Promise<DriveLiveResult> {
  const now = new Date().toISOString();
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    return {
      source: "SNAPSHOT",
      pointers: DRIVE_POINTERS,
      fetchedAt: DRIVE_SNAPSHOT_DATE,
      error: "GOOGLE_SERVICE_ACCOUNT_NOT_SET"
    };
  }
  try {
    const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as ServiceAccount;
    if (!sa.client_email || !sa.private_key) throw new Error("INVALID_SERVICE_ACCOUNT");
    const token = await getAccessToken(sa);
    const q = encodeURIComponent("name contains 'Seymour' or name contains 'SEYMOUR'");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,webViewLink)&pageSize=25&orderBy=modifiedTime desc`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`DRIVE_LIST_FAILED:${res.status}`);
    const data = await res.json() as {
      files?: Array<{ id: string; name: string; modifiedTime: string; webViewLink?: string }>
    };
    const files = data.files || [];
    const pointers: DrivePointer[] = files.map(f => ({
      id: f.id,
      title: f.name,
      modified: f.modifiedTime,
      href: f.webViewLink || `https://docs.google.com/document/d/${f.id}`,
      status: inferStatus(f.name),
      excerpt: "Live Drive listing — excerpt not fetched"
    }));
    return {
      source: "LIVE",
      pointers,
      fetchedAt: now
    };
  } catch (e) {
    return {
      source: "SNAPSHOT",
      pointers: DRIVE_POINTERS,
      fetchedAt: DRIVE_SNAPSHOT_DATE,
      error: e instanceof Error ? e.message : "DRIVE_LIVE_FAILED"
    };
  }
}
