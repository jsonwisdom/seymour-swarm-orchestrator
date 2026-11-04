import { env } from "cloudflare:workers";
import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { saveCheckpoint, loadCheckpoint, listUnfinished } from "../src/recovery";

describe("MISSION_STATE recovery", () => {
  const make = (missionId: string, status: "STARTED" | "IN_PROGRESS" | "DELIVERED") => ({
    missionId, status, lastStep: "research", payload: {source:"local-test", count:3},
    timestamp: Date.now(), note: "test fixture"
  });
  it("persists checkpoints and increments revisions", async () => {
    const id = "test-" + crypto.randomUUID();
    const first = await saveCheckpoint(env, make(id, "STARTED"));
    expect(first.saved).toBe(true);
    expect(first.revision).toBe(1);
    const loaded = await loadCheckpoint(env, id);
    expect(loaded?.payload).toEqual({source:"local-test", count:3});
    expect(loaded?.revision).toBe(1);
    const second = await saveCheckpoint(env, make(id, "IN_PROGRESS"));
    expect(second.revision).toBe(2);
    expect((await loadCheckpoint(env, id))?.status).toBe("IN_PROGRESS");
  });
  it("finds unfinished missions and excludes delivered", async () => {
    const id = "test-" + crypto.randomUUID();
    await saveCheckpoint(env, make(id, "STARTED"));
    expect((await listUnfinished(env)).some(x => x.missionId === id)).toBe(true);
    await saveCheckpoint(env, make(id, "DELIVERED"));
    expect((await listUnfinished(env)).some(x => x.missionId === id)).toBe(false);
  });
  it("rejects invalid identifiers", async () => {
    await expect(saveCheckpoint(env, make("../oops", "STARTED"))).rejects.toThrow("INVALID_CHECKPOINT");
  });
  it("rejects oversized payloads", async () => {
    const checkpoint = {...make("test-" + crypto.randomUUID(), "STARTED"),
      payload:{text:"x".repeat(70000)}};
    await expect(saveCheckpoint(env, checkpoint)).rejects.toThrow("PAYLOAD_TOO_LARGE");
  });
  it("recovery HTTP endpoint fails closed without a token", async () => {
    const response = await SELF.fetch("https://example.com/recovery/unfinished");
    expect(response.status).toBe(401);
  });
  it("unknown mission resolves to null", async () => {
    expect(await loadCheckpoint(env, "missing-" + crypto.randomUUID())).toBeNull();
  });
  it("public health confirms transport only, not factual verification", async () => {
    const response = await SELF.fetch("https://example.com/health");
    expect(response.status).toBe(200);
    const data = await response.json() as {verified: string};
    expect(data.verified).toBe("transport-only");
  });
  it("protects all work-creating routes without authentication", async () => {
    for (const path of ["/investigate", "/control-desk", "/bus/enqueue", "/bus/direct", "/bus/state", "/recovery/save"]) {
      const response = await SELF.fetch("https://example.com" + path, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({question:"test",mission:"test",dryRun:true})
      });
      expect(response.status, path).toBe(401);
    }
    for (const path of ["/graph/example", "/workflow/example", "/recovery/load/example", "/recovery/unfinished"]) {
      const response = await SELF.fetch("https://example.com" + path);
      expect(response.status, path).toBe(401);
    }
  });
});
