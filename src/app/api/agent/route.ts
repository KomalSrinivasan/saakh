import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { AiError, toAiError, translate } from "@/lib/ai";
import { claudeModel } from "@/lib/agent/model";
import { runAgent } from "@/lib/agent/run";
import type { AgentRequest, SaakhAgentUIMessage } from "@/lib/agent/types";
import { invalid } from "@/lib/agent/validate";

export const maxDuration = 60;

const MAX_BYTES = 200 * 1024;
export async function POST(req: Request) {
  let request: AgentRequest;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) throw new AiError("Request too large", 400, false);
    const raw = await req.text();
    if (raw.length > MAX_BYTES) throw new AiError("Request too large", 400, false);
    let body: { request?: AgentRequest };
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AiError("Invalid JSON body", 400, false);
    }
    const bad = invalid(body?.request);
    if (bad) throw new AiError(bad, 400, false);
    if (!process.env.ANTHROPIC_API_KEY) throw new AiError("AI not configured", 503, false);
    request = body.request!;
  } catch (e) {
    const err = toAiError(e);
    return Response.json({ error: err.message, retryable: err.retryable }, { status: err.status });
  }

  const stream = createUIMessageStream<SaakhAgentUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start" });
      const report = await runAgent(request, writer, { model: claudeModel(), translate });
      writer.write({ type: "data-report", data: report });
      writer.write({ type: "finish" });
    },
    onError: (e) => {
      const err = toAiError(e);
      return JSON.stringify({ error: err.message, retryable: err.retryable });
    },
  });
  return createUIMessageStreamResponse({ stream });
}
