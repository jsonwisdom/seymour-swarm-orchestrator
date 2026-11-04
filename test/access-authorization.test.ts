import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";
import { hasRoutePermission } from "../src/index";

describe("Seymour Access authorization", () => {
  const operator = { ACCESS_ALLOWLIST:"operator@example.test" };
  const full = { ...operator, ACCESS_ORCHESTRATION_ALLOWLIST:"operator@example.test" };

  it("rejects missing or non-allowlisted identities", () => {
    expect(hasRoutePermission("/recovery/unfinished", undefined, full)).toBe(false);
    expect(hasRoutePermission("/recovery/unfinished", "attacker@example.test", full)).toBe(false);
    expect(hasRoutePermission("/recovery/save", "operator@example.test", {})).toBe(false);
  });

  it("grants recovery without implying orchestration authority", () => {
    expect(hasRoutePermission("/recovery/save", "OPERATOR@EXAMPLE.TEST", operator)).toBe(true);
    expect(hasRoutePermission("/recovery/load/m1", "operator@example.test", operator)).toBe(true);
    expect(hasRoutePermission("/recovery/unfinished", "operator@example.test", operator)).toBe(true);
    for (const path of ["/investigate", "/control-desk", "/graph/r1", "/workflow/w1", "/bus/enqueue"]) {
      expect(hasRoutePermission(path, "operator@example.test", operator), path).toBe(false);
      expect(hasRoutePermission(path, "operator@example.test", full), path).toBe(true);
    }
  });

  it("unknown and lookalike paths fail closed", () => {
    for (const path of ["/", "/recovery/savex", "/recovery/load", "/bus", "/bus-not-a-route", "/graph", "/unknown"]) {
      expect(hasRoutePermission(path, "operator@example.test", full), path).toBe(false);
    }
  });

  it("forged Access headers do not grant private access", async () => {
    const response = await SELF.fetch("https://example.com/recovery/unfinished", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "operator@example.test",
        "Cf-Access-Jwt-Assertion": "forged-untrusted-string"
      }
    });
    expect(response.status).toBe(401);
  });
});
