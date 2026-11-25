"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { t as translate, type LangCode, type UiKey } from "@/lib/i18n";
import { getMode, getProfile, saveMode, saveProfile, type AppMode, type OfficerProfile } from "@/lib/store";

export interface UiContext {
  lang: LangCode;
  setLang: (lang: LangCode) => void;
  t: (key: UiKey | (string & {}), vars?: Record<string, string | number>) => string;
  profile: OfficerProfile | null;
  /** Validates and persists via saveProfile; throws on an invalid name. */
  setProfile: (p: OfficerProfile) => void;
  /** Null until the officer picks demo or real on first run. */
  mode: AppMode | null;
  setMode: (m: AppMode) => void;
  /** False until localStorage has been read on the client. */
  ready: boolean;
}

const Ctx = createContext<UiContext | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<OfficerProfile | null>(null);
  const [lang, setLangState] = useState<LangCode>("en-IN");
  const [mode, setModeState] = useState<AppMode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let p: OfficerProfile | null = null;
    let m: AppMode | null = null;
    try {
      p = getProfile();
      m = getMode();
      // ?judge skips sign-in straight into demo mode for evaluators
      if (new URLSearchParams(location.search).has("judge")) {
        p = p ?? saveProfile({ name: "Judge", institution: "BUILD 2036", uiLang: "en-IN" });
        saveMode("demo");
        m = "demo";
      }
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setProfileState(p);
    setModeState(m);
    if (p) setLangState(p.uiLang);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang.split("-")[0];
  }, [lang]);

  const setProfile = useCallback((p: OfficerProfile) => {
    const saved = saveProfile({ ...p, name: p.name.trim(), institution: p.institution.trim() });
    setProfileState(saved);
    setLangState(saved.uiLang);
  }, []);

  const setMode = useCallback((m: AppMode) => {
    saveMode(m);
    setModeState(m);
  }, []);

  const setLang = useCallback(
    (l: LangCode) => {
      setLangState(l);
      if (profile) setProfile({ ...profile, uiLang: l });
    },
    [profile, setProfile],
  );

  const value = useMemo<UiContext>(
    () => ({ lang, setLang, t: (key, vars) => translate(key, lang, vars), profile, setProfile, mode, setMode, ready }),
    [lang, setLang, profile, setProfile, mode, setMode, ready],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}
