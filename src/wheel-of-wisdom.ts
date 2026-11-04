/**
 * CWaaS × Flywheel of Wisdom: evidence-backed, read-only registry.
 *
 * All values marked as "REPOSITORY_REPORTED" reflect source declarations,
 * not execution against Coinbase or a live Flywheel service. No wallet writes.
 * The registry is intentionally separate from MISSION_STATE recovery records.
 */
export const WHEEL_OF_WISDOM = {
  schema:"CWaaS_WHEEL_OF_WISDOM_V1",
  mode:"READ_ONLY_EVIDENCE_REGISTRY",
  provenance:{
    source:"GITHUB_REPOSITORY",
    repo:"jsonwisdom/flywheel-of-wisdom",
    url:"https://github.com/jsonwisdom/flywheel-of-wisdom",
    statusUrl:"https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/STATUS.json",
    maintenanceUrl:"https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/docs/maintenance/CWAAS-DISPATCH-001-2026-11-01.md",
    observedAs:"REPOSITORY_REPORTED",
    checkedAt:"2026-11-04"
  },
  services:{
    cwaas:{label:"Computer Wisdom as a Service",status:"SOURCE_REFERENCED",
      integration:"NOT_CONNECTED_TO_WORKER",
      evidence:"https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/docs/maintenance/CWAAS-DISPATCH-001-2026-11-01.md"},
    flywheel:{label:"Flywheel of Wisdom",status:"REPOSITORY_VERIFIED",
      runtime:"NOT_INDEPENDENTLY_VERIFIED",
      evidence:"https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/README.md"},
    x402:{network:"eip155:8453",asset:"USDC",
      advertisedPriceUsd:1,settlement:"NOT_VERIFIED",revenueUsd:"REPOSITORY_REPORTED_0",
      evidence:"https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/STATUS.json"},
    googleDrive:{status:"SNAPSHOT_OR_CONNECTOR_DEPENDENT",
      note:"ChatGPT-side Google Drive access does not grant the Cloudflare Worker a runtime token"},
    chatgpt:{status:"INTERACTIVE_CONNECTOR_ONLY",
      note:"No autonomous ChatGPT runtime is attached to Seymour"},
    wolfram:{status:"INTERACTIVE_RESEARCH_ONLY",
      note:"Calculations require actual input records; no recurring runtime attached"}
  },
  cycle:[
    {id:"J",name:"Jurisdiction",check:"Scope, authority, time and jurisdiction"},
    {id:"A",name:"Artifacts",check:"Original records, hashes and timestamps"},
    {id:"S",name:"Sources",check:"First-party, independent and reported evidence"},
    {id:"O",name:"Observations",check:"Measured results separate from assumptions"},
    {id:"N",name:"Next Test",check:"Falsifiable next action with owner and result"}
  ],
  guardrails:{
    authorityCreated:false,publication:"HOLD",walletActions:"DISABLED",
    credentialExposure:"FORBIDDEN",autoSpending:"DISABLED"
  }
} as const;

export function wheelCoverage(workerCount:number,externalCount:number) {
  const observed=workerCount+externalCount;
  return {
    indexedCount:observed,
    deduplicatedCount:null as number | null,
    historicalUniverseCount:null as number | null,
    historicalCoveragePercent:null as number | null,
    coverageVerdict:"UNKNOWN" as const,
    reason:"No evidence-based denominator for all historical projects. Sources may overlap; indexed count is not unique verified project count."
  };
}
