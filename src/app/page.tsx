"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { append } from "@/lib/audit";
import { DEFAULT_SOF } from "@/lib/sof";
import type { LangCode } from "@/lib/i18n";
import { clearDemo, ensureDemo, type DemoKind } from "@/lib/demo";
import { deleteCase, listCases, newCase, saveCase, type Case, type CaseStatus } from "@/lib/store";
import { HowItWorks, type CaseStepKey } from "@/components/how-it-works";
import { InstallButton } from "@/components/install";
import { Drawer, Icon, LanguageSelect, drawerBody, drawerFooter } from "@/components/shell";
import { Badge, Card, EmptyState, PageHeader, Stat, cx, inr } from "@/components/ui";
import { useUi } from "@/components/ui-provider";

// shortcut: default-table districts only (hydration safe); uploaded new districts need a client effect.
const DISTRICTS = [...new Set(DEFAULT_SOF.map((r) => r.district))];

const I = {
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M19 6l-1 14H6L5 6M8 6V4h8v2M10 11v6M14 11v6",
  x: "M18 6 6 18M6 6l12 12",
  play: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM10 8l6 4-6 4z",
  chevron: "m6 9 6 6 6-6",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM21 21l-4.3-4.3",
  folder: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  download: "M12 15V3M7 10l5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
  rotate: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
};

const TONE: Record<CaseStatus, "neutral" | "info" | "success" | "danger"> = {
  draft: "neutral",
  computed: "info",
  approved: "success",
  edited_approved: "success",
  rejected: "danger",
};

type Filter = "all" | "draft" | "computed" | "approved" | "rejected";
const FILTERS: Filter[] = ["all", "draft", "computed", "approved", "rejected"];
const inFilter = (s: CaseStatus, f: Filter) => f === "all" || s === f || (f === "approved" && s === "edited_approved");
const isApproved = (c: Case) => c.status === "approved" || c.status === "edited_approved";
const limitOf = (c: Case) => c.decision?.finalLimit ?? c.result?.kccLimit;

function NewCaseDrawer({ onClose }: { onClose: () => void }) {
  const { t, lang, profile, mode } = useUi();
  const router = useRouter();
  const [district, setDistrict] = useState("");
  const [name, setName] = useState("");
  const [village, setVillage] = useState("");
  const [farmerLang, setFarmerLang] = useState<LangCode>("hi-IN");
  const [officerLang, setOfficerLang] = useState<LangCode>(lang);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!district) errs.district = t("common.required");
    if (!name.trim()) errs.name = t("common.required");
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const c = saveCase({ ...newCase({ district, farmerLang, officerLang, farmer: { name: name.trim(), village: village.trim() } }), ...(mode === "demo" && { demo: true }) });
      await append({ caseId: c.id, type: "created", actor: profile?.name ?? "", data: { district, farmerLang, officerLang } });
      router.push(`/case/${c.id}`);
    } catch {
      setErrors({ form: t("error.storage") });
      setBusy(false);
    }
  };

  const err = (k: string) =>
    errors[k] && (
      <p id={`${k}-error`} className="mt-1.5 text-[13px] text-danger">
        {errors[k]}
      </p>
    );
  const opt = <span className="font-normal text-muted">({t("common.optional")})</span>;

  return (
    <Drawer title={t("new.title")} description={t("new.description")} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className={drawerBody}>
          <div>
            <label htmlFor="nc-name" className="label">
              {t("new.farmerName")} <span className="text-danger">*</span>
            </label>
            <input id="nc-name" className={cx("field", errors.name && "border-danger")} value={name} maxLength={80} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-error" : undefined} onChange={(e) => setName(e.target.value)} />
            {err("name")}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="nc-district" className="label">
                {t("new.district")} <span className="text-danger">*</span>
              </label>
              <select id="nc-district" className={cx("field", errors.district && "border-danger")} value={district} aria-invalid={!!errors.district} aria-describedby={errors.district ? "district-error" : undefined} onChange={(e) => setDistrict(e.target.value)}>
                <option value="">{t("new.districtPick")}</option>
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {err("district")}
            </div>
            <div>
              <label htmlFor="nc-village" className="label">
                {t("new.village")} {opt}
              </label>
              <input id="nc-village" className="field" value={village} maxLength={80} onChange={(e) => setVillage(e.target.value)} />
            </div>
          </div>
          <div className="border-t border-line" />
          <div>
            <label htmlFor="nc-flang" className="label">
              {t("lang.farmer")}
            </label>
            <LanguageSelect id="nc-flang" value={farmerLang} onChange={setFarmerLang} />
          </div>
          <div>
            <label htmlFor="nc-olang" className="label">
              {t("lang.officer")}
            </label>
            <LanguageSelect id="nc-olang" value={officerLang} onChange={setOfficerLang} />
          </div>
          {err("form")}
        </div>
        <div className={drawerFooter}>
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {t("new.create")}
          </button>
        </div>
      </form>
    </Drawer>
  );
}

export default function Home() {
  const { t, lang, profile, mode } = useUi();
  const router = useRouter();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState(false);
  const demo = mode === "demo";
  const actor = profile?.name ?? "";

  useEffect(() => {
    let live = true;
    const load = async () => {
      let list: Case[] = [];
      try {
        if (demo) await ensureDemo(lang, actor); // demo mode always has its sample cases
        list = listCases();
      } catch {}
      if (live) setCases(list);
    };
    load();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on mode switch only
  }, [demo]);

  const openDemo = async (kind: DemoKind, step?: CaseStepKey) => {
    setBusy(true);
    try {
      const ids = await ensureDemo(lang, actor);
      router.push(`/case/${ids[kind]}${step ? `?step=${step}` : ""}`);
    } catch {
      setBusy(false);
      alert(t("error.storage"));
    }
  };

  const resetDemo = async () => {
    if (!confirm(t("demo.resetConfirm"))) return;
    setBusy(true);
    try {
      clearDemo();
      await ensureDemo(lang, actor);
      setCases(listCases());
    } catch {
      alert(t("error.storage"));
    }
    setBusy(false);
  };

  const remove = (c: Case) => {
    if (!confirm(t("cases.deleteConfirm"))) return;
    deleteCase(c.id);
    setCases((cs) => cs?.filter((x) => x.id !== c.id) ?? null);
  };

  const all = useMemo(() => cases ?? [], [cases]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((c) => inFilter(c.status, filter) && (!q || `${c.farmer.name} ${c.farmer.village} ${c.district}`.toLowerCase().includes(q)));
  }, [all, query, filter]);
  const kpi = useMemo(() => {
    const n = (s: CaseStatus) => all.filter((c) => c.status === s).length;
    const approved = all.filter(isApproved);
    return { drafts: n("draft"), awaiting: n("computed"), rejected: n("rejected"), approved: approved.length, sanctioned: approved.reduce((s, c) => s + (c.decision?.finalLimit ?? 0), 0) };
  }, [all]);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  const name = (c: Case) => c.farmer.name || t("cases.unnamed");
  const limitCell = (c: Case) => {
    const v = limitOf(c);
    return v == null ? <span className="text-muted">–</span> : inr(v);
  };
  const demoBadge = (c: Case) => c.demo && <Badge tone="accent">{t("demo.label")}</Badge>;
  const delBtn = (c: Case, cls: string) =>
    c.status === "draft" && (
      <button type="button" onClick={() => remove(c)} aria-label={`${t("cases.delete")}: ${name(c)}`} title={t("cases.delete")} className={cx("z-10 grid shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger", cls)}>
        <Icon d={I.trash} className="h-4 w-4" />
      </button>
    );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={profile?.institution || t("app.caption")}
        title={t("cases.title")}
        description={t(demo ? "home.demoDescription" : "home.description")}
        actions={
          <>
            {demo && (
              <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={resetDemo} disabled={busy}>
                <Icon d={I.rotate} className="h-4 w-4" />
                {t("demo.reset")}
              </button>
            )}
            <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={() => setCreating(true)}>
              <Icon d={I.plus} className="h-4 w-4" />
              {t("cases.new")}
            </button>
          </>
        }
      />

      {demo && <HowItWorks onOpen={openDemo} busy={busy} />}
      <InstallButton variant="card" />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[
          { label: t("kpi.total"), value: cases ? all.length : "–", hint: t("kpi.drafts", { n: kpi.drafts }) },
          { label: t("kpi.awaiting"), value: cases ? kpi.awaiting : "–", hint: t("kpi.awaitingHint") },
          { label: t("kpi.approved"), value: cases ? kpi.approved : "–", hint: t("kpi.rejected", { n: kpi.rejected }) },
          { label: t("kpi.sanctioned"), value: cases ? inr(kpi.sanctioned) : "–", hint: t("kpi.sanctionedHint") },
        ].map((s) => (
          <Stat key={s.label} {...s} className="card px-4 py-4 lg:px-5" />
        ))}
      </div>

      <Card
        flush
        title={
          <span className="flex items-center gap-2">
            {t("cases.all")}
            {cases && <Badge>{all.length}</Badge>}
          </span>
        }
      >
        {all.length > 3 && (
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="relative sm:w-72">
              <label htmlFor="case-search" className="sr-only">
                {t("cases.search")}
              </label>
              <Icon d={I.search} className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <input id="case-search" type="search" className="field h-9 pl-9 text-[14px]" placeholder={t("cases.search")} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div role="group" aria-label={t("cases.filter")} className="-mx-1 flex overflow-x-auto px-1">
              <div className="inline-flex shrink-0 rounded-lg border border-line bg-subtle p-0.5">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cx("h-8 cursor-pointer rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors", filter === f ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-muted hover:text-ink")}
                  >
                    {f === "all" ? t("cases.filterAll") : t(`status.${f}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {!cases ? (
          <ul aria-busy="true" className="divide-y divide-line">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-40 animate-pulse rounded bg-line" />
                <div className="ml-auto h-4 w-20 animate-pulse rounded bg-line" />
              </li>
            ))}
          </ul>
        ) : all.length === 0 ? (
          <EmptyState
            icon={<Icon d={I.folder} className="h-5 w-5" />}
            title={t("cases.emptyTitle")}
            description={t("cases.emptyReal")}
            action={
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                <Icon d={I.plus} className="h-4 w-4" />
                {t("cases.new")}
              </button>
            }
          />
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-muted">{t("cases.noMatch")}</p>
        ) : (
          <>
            <table className="hidden w-full text-left text-[14px] md:table">
              <thead className="bg-subtle text-[12px] font-medium tracking-wide text-muted uppercase">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-medium">{t("cases.colFarmer")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("cases.colDistrict")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("cases.colStatus")}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t("cases.colLimit")}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t("cases.colUpdated")}</th>
                  <th scope="col" className="w-14 px-3 py-2.5">
                    <span className="sr-only">{t("cases.delete")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="relative border-t border-line transition-colors hover:bg-subtle">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/case/${c.id}`} className="font-medium text-ink after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-primary">
                          {name(c)}
                        </Link>
                        {demoBadge(c)}
                      </div>
                      {c.farmer.village && <div className="text-[13px] text-muted">{c.farmer.village}</div>}
                    </td>
                    <td className="px-4 py-3 text-ink-2">{c.district}</td>
                    <td className="px-4 py-3">
                      <Badge tone={TONE[c.status]} dot>
                        {t(`status.${c.status}`)}
                      </Badge>
                    </td>
                    <td className="num px-4 py-3 text-right font-medium text-ink">{limitCell(c)}</td>
                    <td className="num px-4 py-3 text-[13px] text-muted">{fmtDate(c.decision?.at ?? c.createdAt)}</td>
                    <td className="px-3 py-3 text-right">{delBtn(c, "relative ml-auto h-9 w-9")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-line md:hidden">
              {shown.map((c) => (
                <li key={c.id} className="relative active:bg-subtle">
                  <Link href={`/case/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3.5">
                    <span className={cx("flex items-center gap-2", c.status === "draft" && "pr-10")}>
                      <span className="truncate text-[15px] font-medium text-ink">{name(c)}</span>
                      {demoBadge(c)}
                    </span>
                    <span className="truncate text-[13px] text-muted">{[c.farmer.village, c.district].filter(Boolean).join(", ")}</span>
                    <span className="flex items-center justify-between gap-3">
                      <Badge tone={TONE[c.status]} dot>
                        {t(`status.${c.status}`)}
                      </Badge>
                      {limitOf(c) != null && <span className="num text-[14px] font-medium text-ink">{limitCell(c)}</span>}
                    </span>
                  </Link>
                  {delBtn(c, "absolute top-1.5 right-1.5 h-11 w-11")}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {creating && <NewCaseDrawer onClose={() => setCreating(false)} />}
    </div>
  );
}
