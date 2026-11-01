"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Frequency, SpaceType } from "./jobs";

/**
 * Local demo store for posted jobs and cleaner responses, mirroring the
 * `jobs` and `job_responses` tables (migration 0006) until Supabase is live.
 */

export type LocalJob = {
  id: string;
  companyName: string;
  spaceType: SpaceType;
  sizeM2: number | null;
  postcode: string;
  city: string;
  frequency: Frequency;
  scheduleNote: string | null;
  description: string;
  budgetCents: number;
  createdAt: string;
};

type State = {
  postedJobs: LocalJob[];
  responses: Record<string, { rateCents: number; message: string; at: string }>;
};

const KEY = "alieni.jobs";
const EMPTY: State = { postedJobs: [], responses: {} };

let cacheRaw: string | null | undefined;
let cache: State = EMPTY;
const listeners = new Set<() => void>();

function parse(raw: string | null): State {
  if (!raw) return EMPTY;
  try {
    const parsed = JSON.parse(raw);
    return {
      postedJobs: Array.isArray(parsed.postedJobs) ? parsed.postedJobs : [],
      responses: parsed.responses && typeof parsed.responses === "object" ? parsed.responses : {},
    };
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): State {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}

function write(next: State) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    cacheRaw = undefined;
    cache = next;
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useJobsStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const postJob = useCallback((job: Omit<LocalJob, "id" | "createdAt">) => {
    const current = getSnapshot();
    const entry: LocalJob = { ...job, id: `local-job-${Date.now()}`, createdAt: new Date().toISOString() };
    write({ ...current, postedJobs: [entry, ...current.postedJobs] });
    return entry.id;
  }, []);

  const respond = useCallback((jobId: string, rateCents: number, message: string) => {
    const current = getSnapshot();
    write({
      ...current,
      responses: {
        ...current.responses,
        [jobId]: { rateCents, message: message.slice(0, 1000), at: new Date().toISOString() },
      },
    });
  }, []);

  return { ...state, hydrated, postJob, respond };
}
