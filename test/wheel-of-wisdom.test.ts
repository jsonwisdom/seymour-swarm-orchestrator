import { describe, expect, it } from "vitest";
import { WHEEL_OF_WISDOM, wheelCoverage } from "../src/wheel-of-wisdom";
import { buildProjectIndex } from "../src/project-index";
import { env } from "cloudflare:workers";

describe("CWaaS / Flywheel evidence gate",()=>{
  it("never manufactures a full-history coverage denominator",()=>{
    const m=wheelCoverage(7,13);
    expect(m.indexedCount).toBe(20);
    expect(m.historicalUniverseCount).toBeNull();
    expect(m.historicalCoveragePercent).toBeNull();
    expect(m.coverageVerdict).toBe("UNKNOWN");
    expect(m.deduplicatedCount).toBeNull();
  });
  it("keeps x402 settlement unverified and no spending authority",()=>{
    expect(WHEEL_OF_WISDOM.services.x402.settlement).toBe("NOT_VERIFIED");
    expect(WHEEL_OF_WISDOM.guardrails.autoSpending).toBe("DISABLED");
    expect(WHEEL_OF_WISDOM.guardrails.authorityCreated).toBe(false);
  });
  it("returns CWaaS evidence alongside a project index without promoting snapshots to live",async()=>{
    const x=await buildProjectIndex(env);
    expect(x.wheelOfWisdom.schema).toBe("CWaaS_WHEEL_OF_WISDOM_V1");
    expect(x.math.coverageVerdict).toBe("UNKNOWN");
    expect(x.math.indexedCount).toBe(x.summary.total);
  });
});