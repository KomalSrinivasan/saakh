// Claude through the AI SDK Anthropic provider (no gateway); shared by the extractors and the agent.
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { h1Fetch } from "../h1-fetch.ts";

export const CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_FAST_MODEL = "claude-haiku-5-5";

let provider: ReturnType<typeof createAnthropic> | undefined;

/** Caller checks ANTHROPIC_API_KEY first (503 path). */
export function claudeModel(id: string = CLAUDE_MODEL): LanguageModel {
  const ws = process.env.ANTHROPIC_WORKSPACE_ID; // needed only for keys not scoped to a workspace
  provider ??= createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY, headers: ws ? { "anthropic-workspace-id": ws } : undefined, fetch: h1Fetch });
  return provider(id);
}
