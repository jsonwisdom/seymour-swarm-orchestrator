// Seymour v0.4 Control Desk Gateway
// Minimal authenticated entry point for the HTML control desk.
// No credentials, no deployment performed.

export interface MissionRequest {
  mission: string;
  scope?: string;
  roles?: string[];
  dryRun?: boolean;
}

export interface MissionReceipt {
  missionId: string;
  status: "ACCEPTED" | "HOLD" | "REJECTED";
  timestamp: number;
  note: string;
  next: string;
}

export async function handleControlDesk(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("POST /control-desk with { mission, scope?, roles?, dryRun? }", { status: 405 });
  }

  const body = await request.json() as MissionRequest;
  if (!body.mission || body.mission.trim().length === 0) {
    return Response.json({
      status: "REJECTED",
      note: "Mission text required",
    }, { status: 400 });
  }

  const missionId = crypto.randomUUID();
  const receipt: MissionReceipt = {
    missionId,
    status: body.dryRun === false ? "HOLD" : "ACCEPTED",
    timestamp: Date.now(),
    note: body.dryRun === false
      ? "Live execution requires explicit human authorization. Defaulting to dry-run acceptance."
      : "Mission accepted under constitutional autonomy (research / draft / test / log). Production and credentials remain gated.",
    next: "Internal delegation and drafting may proceed. Review output in control desk.",
  };

  return Response.json(receipt);
}
