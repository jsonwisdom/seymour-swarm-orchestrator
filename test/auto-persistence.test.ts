import { env } from "cloudflare:workers";
import { describe,expect,it } from "vitest";
import { runAutomatedPersistenceProbe,AUTO_PROBE_ID } from "../src/auto-persistence";
import { loadCheckpoint } from "../src/recovery";

describe("Seymour scheduled persistence verification", () => {
  it("fails closed on unbound state", async () => {
    const result = await runAutomatedPersistenceProbe({MISSION_STATE:undefined} as typeof env);
    expect(result.result).toBe("FAIL");
    expect(result.error).toBe("MISSION_STATE_NOT_BOUND");
  });

  it("tests a write/read, then verifies durability across separate runs", async () => {
    const first = await runAutomatedPersistenceProbe(env);
    // The shared registry may carry a prior run. Either result is possible,
    // but the current two-stage save/read must succeed.
    expect(first.currentRoundtripVerified).toBe(true);
    expect(first.revision).toBeGreaterThanOrEqual(2);
    const persisted = await loadCheckpoint(env,AUTO_PROBE_ID);
    expect(persisted?.status).toBe("DELIVERED");
    expect(persisted?.revision).toBe(first.revision);
    const second = await runAutomatedPersistenceProbe(env);
    expect(second.result).toBe("PASS");
    expect(second.priorRunVerified).toBe(true);
    expect(second.currentRoundtripVerified).toBe(true);
    expect(second.revision).toBe(first.revision! + 2);
  });
});
