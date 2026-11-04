import { describe,expect,it } from "vitest";
import { env } from "cloudflare:workers";
import { readLiveRecoveryStatus, LIVE_DESK_HTML, LIVE_DESK_JS } from "../src/live-desk";

describe("Seymour live recovery desk", () => {
  it("ships readable browser code and a no-credentials operator shell", () => {
    expect(LIVE_DESK_HTML).toContain("Recovery, without starting over.");
    expect(LIVE_DESK_JS).toContain('"/recovery/live/status"');
    expect(LIVE_DESK_JS).not.toContain("CF-Access-Client-Secret");
    expect(LIVE_DESK_HTML).not.toContain("CF-Access-Client-Secret");
  });

  it("exposes only evidence-based JSON status and explicitly unresolved source-sync", async () => {
    const status = await readLiveRecoveryStatus(env);
    expect(status.schema).toBe("SEYMOUR_LIVE_STATUS_V1");
    expect(["UNKNOWN","STALE","BASELINE_ONLY","PASS","FAIL"]).toContain(status.persistence.verdict);
    expect(status.boundaries.autonomousProjectRecovery).toBe("NOT_VERIFIED");
    expect(status.boundaries.externalSourceSync).toBe("NOT_IMPLEMENTED");
    expect(status.recovery.sample.every(x=>!x.missionId.startsWith("seymour-proof-"))).toBe(true);
  });
});
