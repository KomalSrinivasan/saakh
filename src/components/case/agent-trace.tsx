"use client";

import { useState } from "react";
import type { AgentReport, Check, Question } from "@/lib/agent/types";
import { useUi } from "@/components/ui-provider";
import { Badge, cx, Spinner } from "@/components/ui";
import { Ico, ICONS } from "./shared";

type LoosePart = { type: string; toolCallId?: string; state?: string; input?: unknown; output?: unknown; errorText?: string; text?: string; data?: unknown };
export type ToolItem = { kind: "tool"; id: string; tool: string; state: "running" | "done" | "failed"; input: unknown; output: unknown; summary?: string };
type Item = ToolItem | { kind: "thought"; text: string } | { kind: "note"; text: string } | { kind: "question"; q: Question };

export const TOOL_ICON: Record<string, string> = {
  lookup_sof: "M4 5h16v14H4zM4 10h16M10 5v14",
  compute_kcc: "M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM8.5 7h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01",
  run_risk_checks: ICONS.shield,
  check_crop_plan: "M12 21v-9M12 12c0-4.4 3-7 8-7 0 5-3 7-8 7zM12 14.5c0-3.3-2.2-5.5-6.5-5.5 0 4 2.2 5.5 6.5 5.5",
  what_if: "M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9",
  ask_officer: ICONS.help,
  finish: ICONS.file,
};

// Plan steps are free text; tick one when a finished tool's keywords appear in it.
const PLAN_MATCH: Record<string, RegExp> = {
  lookup_sof: /lookup_sof|scale of finance|\bsof\b/i,
  compute_kcc: /compute_kcc|engine|limit|compute/i,
  run_risk_checks: /run_risk_checks|risk|identity|double|fraud|mismatch/i,
  check_crop_plan: /check_crop_plan|crop|season|plausib/i,
  what_if: /what_if|what-if|what if|threshold|scenario/i,
  ask_officer: /ask_officer|question|clarif/i,
  finish: /finish|recommend|summar|report/i,
};

export const secs = (ms: number) => (ms < 100 ? "<0.1 s" : `${(ms / 1000).toFixed(1)} s`);

const toolOf = (p: LoosePart): ToolItem => {
  const out = p.output as { ok?: boolean; summary?: string } | undefined;
  const done = p.state === "output-available" || p.state === "output-error" || p.state === "output-denied";
  const failed = p.state === "output-error" || p.state === "output-denied" || out?.ok === false;
  return {
    kind: "tool",
    id: p.toolCallId ?? "",
    tool: p.type.slice(5),
    state: !done ? "running" : failed ? "failed" : "done",
    input: p.input,
    output: p.output,
    summary: p.errorText ?? (typeof out?.summary === "string" ? out.summary : undefined),
  };
};

/** Folds UI message parts into plan, ordered rows, harness checks and the final report. */
export function traceModel(parts: readonly unknown[]) {
  let plan: string[] = [];
  let report: AgentReport | undefined;
  const items: Item[] = [];
  const checks: Check[] = [];
  for (const raw of parts as LoosePart[]) {
    if (!raw || typeof raw.type !== "string") continue;
    if (raw.type.startsWith("tool-")) items.push(toolOf(raw));
    else if (raw.type === "text" && raw.text?.trim()) items.push({ kind: "thought", text: raw.text.trim() });
    else if (raw.type === "data-plan") {
      plan = (raw.data as { steps?: string[] }).steps ?? [];
      if (items.at(-1)?.kind === "thought") items.pop(); // the model's plan text, already shown as the checklist
    }
    else if (raw.type === "data-note") items.push({ kind: "note", text: (raw.data as { text: string }).text });
    else if (raw.type === "data-question") items.push({ kind: "question", q: raw.data as Question });
    else if (raw.type === "data-check") checks.push(raw.data as Check);
    else if (raw.type === "data-report") report = raw.data as AgentReport;
  }
  const tools = items.filter((i): i is ToolItem => i.kind === "tool");
  const doneTools = tools.filter((x) => x.state === "done").map((x) => x.tool);
  const ticks = plan.map((p) => !!report || doneTools.some((tool) => PLAN_MATCH[tool]?.test(p) || p.includes(tool)));
  return { plan, ticks, items, checks, report, tools, steps: tools.length };
}

export function AgentTrace({ parts, toolMs, live }: { parts: readonly unknown[]; toolMs?: Record<string, number>; live?: boolean }) {
  const { t } = useUi();
  const { plan, ticks, items, checks } = traceModel(parts);
  const passed = checks.filter((c) => c.ok).length;
  return (
    <div className="space-y-4">
      {plan.length > 0 && (
        <div className="rounded-lg border border-line bg-subtle px-4 py-3">
          <div className="eyebrow mb-2 flex items-center justify-between">
            <span>{t("agent.plan")}</span>
            <span className="num font-medium tracking-normal normal-case">
              {ticks.filter(Boolean).length}/{plan.length}
            </span>
          </div>
          <ol className="space-y-1.5">
            {plan.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13px]">
                <span className={cx("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full transition-colors", ticks[i] ? "bg-success text-on-primary" : "bg-surface ring-1 ring-line-strong ring-inset")}>
                  {ticks[i] && <Ico d={ICONS.check} className="h-3 w-3" />}
                </span>
                <span className={cx("min-w-0", ticks[i] ? "text-ink-2" : "text-muted")}>{p}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(items.length > 0 || live) && (
        <ol className="divide-y divide-line rounded-lg border border-line" aria-live={live ? "polite" : undefined}>
          {items.map((it, i) => (
            <li key={it.kind === "tool" ? it.id || i : i} className="transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0">
              {it.kind === "tool" ? (
                <ToolRow it={it} ms={toolMs?.[it.id]} />
              ) : it.kind === "thought" ? (
                <p className="py-2 pr-3 pl-13 text-[13px] text-muted">
                  <span className="block border-l-2 border-line pl-3 break-words">{it.text}</span>
                </p>
              ) : it.kind === "question" ? (
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <RowIcon d={ICONS.help} />
                  <p className="min-w-0 pt-1 text-[13px] text-ink-2">
                    <span className="font-medium text-ink">{t("agent.tool.ask_officer")}: </span>
                    {it.q.text}
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 px-3 py-2 text-[13px] text-muted">
                  <span className="grid h-7 w-7 shrink-0 place-items-center">
                    <Ico d={ICONS.shield} className="h-3.5 w-3.5" />
                  </span>
                  <p className="min-w-0 pt-1 break-words">
                    <span className="font-medium text-ink-2">{t("agent.harness")}: </span>
                    {it.text}
                  </p>
                </div>
              )}
            </li>
          ))}
          {live && (
            <li className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-muted">
              <span className="grid h-7 w-7 shrink-0 place-items-center">
                <Spinner className="h-3.5 w-3.5 text-primary" />
              </span>
              {t("agent.thinking")}
            </li>
          )}
        </ol>
      )}

      {checks.length > 0 && (
        <div className="rounded-lg border border-line">
          <div className="flex items-center justify-between gap-2 border-b border-line bg-subtle px-3 py-2">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Ico d={ICONS.shield} className="h-4 w-4 text-ink-2" />
              {t("agent.harness")}
            </span>
            <Badge tone={passed === checks.length ? "success" : "warn"} className="num">
              {t("agent.checksPassed", { n: passed, total: checks.length })}
            </Badge>
          </div>
          <ul className="divide-y divide-line">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2.5 px-3 py-2 text-[13px]">
                <Ico d={c.ok ? ICONS.check : ICONS.x} className={cx("mt-0.5 h-4 w-4 shrink-0", c.ok ? "text-success" : "text-danger")} />
                <div className="min-w-0">
                  <span className="font-mono text-[12px] text-ink">{c.verifier}</span>
                  <p className="break-words text-muted">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RowIcon({ d }: { d: string }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-surface text-ink-2">
      <Ico d={d} className="h-3.5 w-3.5" />
    </span>
  );
}

function ToolRow({ it, ms }: { it: ToolItem; ms?: number }) {
  const { t } = useUi();
  const [open, setOpen] = useState(false);
  const label = t(`agent.tool.${it.tool}`);
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <RowIcon d={TOOL_ICON[it.tool] ?? ICONS.file} />
        <div className="min-w-0 flex-1">
          <div className="flex min-h-7 items-center gap-2">
            <span className="min-w-0 truncate text-[14px] font-medium text-ink">{label.startsWith("agent.tool.") ? it.tool : label}</span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {ms != null && <span className="num font-mono text-[12px] text-muted">{secs(ms)}</span>}
              {it.state === "running" ? <Spinner className="h-3.5 w-3.5 text-primary" /> : <Ico d={it.state === "done" ? ICONS.check : ICONS.x} className={cx("h-4 w-4", it.state === "done" ? "text-success" : "text-danger")} />}
            </span>
          </div>
          {it.summary && <p className={cx("text-[13px] break-words", it.state === "failed" ? "text-danger" : "text-ink-2")}>{it.summary}</p>}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 -ml-1 inline-flex h-7 items-center gap-1 rounded px-1 text-[12px] font-medium text-muted hover:text-ink">
            <Ico d={ICONS.chevron} className={cx("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
            {t("agent.details")}
            <span className="font-mono text-[11px] text-muted/80">{it.tool}</span>
          </button>
          {open && (
            <pre className="mt-1 max-h-72 overflow-auto rounded-md border border-line bg-subtle p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
              {JSON.stringify({ input: it.input, output: it.output }, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
