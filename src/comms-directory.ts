/** Historical roles and intended communication routes.
 * Presence in this registry MUST NOT be interpreted as connectivity or authorization.
 */
export const COMMS_DIRECTORY = {
  schema: "SEYMOUR_COMMS_DIRECTORY_V1",
  mode: "DESIGN_ONLY",
  connectedGrokAgents: 0,
  connectedServiceBindings: 0,
  historicalSeats: { total: 27, bound: 0, named: [
    {seat:"01",role:"Librarian"},
    {seat:"02",role:"Receipt Clerk"},
    {seat:"03",role:"Family Continuity"},
    {seat:"04",role:"Story Weaver"},
    {seat:"05",role:"Ops/Deploy"},
    {seat:"06",role:"Operator Mirror"}], unnamed:21 },
  federation: [
    {name:"Julie Powers", responsibility:"Federation coordination"},
    {name:"Sentinel",responsibility:"Permission and safety review"},
    {name:"Auditor",responsibility:"Receipts and accountability"},
    {name:"Historian",responsibility:"Timeline and evidence recovery"},
    {name:"Recon",responsibility:"Source exploration"},
    {name:"Engineer",responsibility:"Code and runtime verification"},
    {name:"Press",responsibility:"Drafting; publication gated"},
    {name:"Colonel Jessup",responsibility:"Handoff gate coordination"},
    {name:"Gambit Zero x402 Bot",responsibility:"Payment research; spending gated"},
    {name:"Grok Bot",responsibility:"Historical Grok role (distinct from legacy Grok Bot)"}
  ].map(agent=>({...agent,connected:false,endpointVerified:false})),
  transports: {
    internal:"Cloudflare Service Bindings RPC — NOT CONFIGURED",
    asynchronous:"Cloudflare Queues — BUS_QUEUE NOT CONFIGURED",
    grok:"Authenticated adapter — NOT CONFIGURED"
  },
  next:"Verify bot endpoints, authenticate, test messages, record delivery receipts; do not interpret acknowledgments as completion."
} as const;
