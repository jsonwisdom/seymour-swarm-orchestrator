// Seymour v0.4 Constitutional Rules skeleton
// Explicit capabilities, data boundaries, and automatic internal delegation rights.
// No credentials, no deployment performed.

export type Role = "source" | "audit" | "math" | "legal" | "replay" | "receipt" | "orchestrator" | "control-desk";

export interface RolePolicy {
  role: Role;
  canResearch: boolean;
  canDraft: boolean;
  canTest: boolean;
  canLog: boolean;
  canDelegateInternal: boolean;
  canDeploy: boolean;
  canSpend: boolean;
  canAccessCredentials: boolean;
  dataBoundary: string;
}

export const DEFAULT_POLICIES: Record<Role, RolePolicy> = {
  source: {
    role: "source",
    canResearch: true,
    canDraft: true,
    canTest: false,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "public sources and mission context only",
  },
  audit: {
    role: "audit",
    canResearch: true,
    canDraft: true,
    canTest: true,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "evidence graph and receipts only",
  },
  math: {
    role: "math",
    canResearch: true,
    canDraft: true,
    canTest: true,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "numeric inputs and computation results",
  },
  legal: {
    role: "legal",
    canResearch: true,
    canDraft: true,
    canTest: false,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "public legal sources and mission context",
  },
  replay: {
    role: "replay",
    canResearch: true,
    canDraft: true,
    canTest: true,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "prior receipts and evidence graph",
  },
  receipt: {
    role: "receipt",
    canResearch: false,
    canDraft: true,
    canTest: false,
    canLog: true,
    canDelegateInternal: false,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "mission receipts only",
  },
  orchestrator: {
    role: "orchestrator",
    canResearch: true,
    canDraft: true,
    canTest: true,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "mission scope and internal state",
  },
  "control-desk": {
    role: "control-desk",
    canResearch: false,
    canDraft: false,
    canTest: false,
    canLog: true,
    canDelegateInternal: true,
    canDeploy: false,
    canSpend: false,
    canAccessCredentials: false,
    dataBoundary: "user mission input and receipts",
  },
};

export function canPerform(role: Role, action: keyof Omit<RolePolicy, "role" | "dataBoundary">): boolean {
  const policy = DEFAULT_POLICIES[role];
  return policy ? Boolean(policy[action]) : false;
}
