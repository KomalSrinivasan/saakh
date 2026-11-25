import { computeKcc } from "@/lib/kcc";
import { runRiskChecks } from "@/lib/risk";
import { baseInput } from "@/lib/agent/tools";
import { invalid } from "@/lib/agent/validate";
import type { AgentRequest } from "@/lib/agent/types";

const MAX_BYTES = 200 * 1024;
const fail = (error: string, status = 400) => Response.json({ error }, { status });

/** appraise_kcc: deterministic limit and rule risks for any caller, agent or system. No model calls. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return fail("Request too large");
  let body: { request?: Partial<AgentRequest> };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Invalid JSON body");
  }
  const r = { officerLang: "en-IN", farmerLang: "en-IN", ...body?.request } as AgentRequest;
  const bad = invalid(r);
  if (bad) return fail(bad);
  const result = computeKcc(baseInput(r));
  const risks = runRiskChecks(r.evidence, r.portfolio, r.sof);
  return Response.json({ tool: "appraise_kcc", result, risks });
}
