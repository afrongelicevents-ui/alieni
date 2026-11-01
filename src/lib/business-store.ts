"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { BusinessType } from "./business";

/**
 * Local demo store for the business account, mirroring business_profiles +
 * business_units (migration 0008) until the write-side Supabase wiring lands.
 */

export type BusinessUnit = {
  id: string;
  name: string;
  addressLine: string;
  postcode: string;
  city: string;
};

export type BusinessAccount = {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  kvkNumber: string;
  btwNumber: string;
  businessType: BusinessType;
  unitCount: number;
  units: BusinessUnit[];
  createdAt: string;
  billingStartedAt: string | null;
  pendingUnitCount?: number | null;
  billingEndedAt?: string | null;
};

const KEY = "alieni.business";

let cacheRaw: string | null | undefined;
let cache: BusinessAccount | null = null;
const listeners = new Set<() => void>();

function parse(raw: string | null): BusinessAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && parsed.companyName ? parsed : null;
  } catch {
    return null;
  }
}

function getSnapshot(): BusinessAccount | null {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    cache = parse(raw);
  }
  return cache;
}

function write(next: BusinessAccount | null) {
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    cacheRaw = undefined;
    cache = next;
  }
  for (const l of listeners) l();
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

export function useBusinessAccount() {
  const account = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const save = useCallback((next: BusinessAccount) => write(next), []);
  const update = useCallback((partial: Partial<BusinessAccount>) => {
    const current = getSnapshot();
    if (current) write({ ...current, ...partial });
  }, []);
  const clear = useCallback(() => write(null), []);

  return { account, hydrated, save, update, clear };
}
