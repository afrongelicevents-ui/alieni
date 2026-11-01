"use client";

import { useCallback, useSyncExternalStore } from "react";
import { computeCleaningSlots, parseIcal } from "./ical";

/**
 * Local demo store for calendar sync: iCal links per unit, cleaning slots,
 * reservations and completions. Mirrors `cleaning_slots` (migration 0011).
 * In the demo, linking a feed generates slots from a bundled sample feed
 * (browsers cannot fetch Airbnb feeds directly; the server cron does).
 */

export type LocalSlot = {
  id: string;
  unitId: string;
  source: "ical" | "manual";
  date: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "reserved" | "done" | "cancelled";
  reservedBy: string | null; // "me" in the demo
  doneAt: string | null;
  donePhotoName: string | null;
};

type State = {
  icalUrls: Record<string, string>; // unitId → url
  slots: LocalSlot[];
};

const KEY = "alieni.slots";
const EMPTY: State = { icalUrls: {}, slots: [] };

const SAMPLE_ICS = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:{d0}
DTEND;VALUE=DATE:{d3}
UID:demo-1
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:{d3}
DTEND;VALUE=DATE:{d6}
UID:demo-2
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:{d9}
DTEND;VALUE=DATE:{d12}
UID:demo-3
SUMMARY:Reserved
END:VEVENT
END:VCALENDAR`;

function sampleIcs(): string {
  const day = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };
  return SAMPLE_ICS.replace("{d0}", day(0)).replace("{d3}", day(3)).replace("{d3}", day(3)).replace("{d6}", day(6)).replace("{d9}", day(9)).replace("{d12}", day(12));
}

let cacheRaw: string | null | undefined;
let cache: State = EMPTY;
const listeners = new Set<() => void>();

function parse(raw: string | null): State {
  if (!raw) return EMPTY;
  try {
    const p = JSON.parse(raw);
    return { icalUrls: p.icalUrls ?? {}, slots: Array.isArray(p.slots) ? p.slots : [] };
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
  for (const l of listeners) l();
}
function subscribe(listener: () => void) {
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

export function useSlots() {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);

  const linkIcal = useCallback((unitId: string, url: string) => {
    const current = getSnapshot();
    const generated = computeCleaningSlots(parseIcal(sampleIcs())).map<LocalSlot>((s) => ({
      id: `${unitId}-${s.externalUid}`,
      unitId,
      source: "ical",
      date: s.date,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      status: "open",
      reservedBy: null,
      doneAt: null,
      donePhotoName: null,
    }));
    const others = current.slots.filter((s) => s.unitId !== unitId || s.source !== "ical");
    write({ icalUrls: { ...current.icalUrls, [unitId]: url.trim() }, slots: [...others, ...generated] });
  }, []);

  const addManual = useCallback((unitId: string, date: string, count: number) => {
    const current = getSnapshot();
    const added: LocalSlot[] = Array.from({ length: Math.max(1, Math.min(50, count)) }, (_, i) => ({
      id: `${unitId}-manual-${date}-${Date.now()}-${i}`,
      unitId,
      source: "manual",
      date,
      startsAt: `${date}T11:00:00`,
      endsAt: `${date}T15:00:00`,
      status: "open",
      reservedBy: null,
      doneAt: null,
      donePhotoName: null,
    }));
    write({ ...current, slots: [...current.slots, ...added] });
  }, []);

  const reserve = useCallback((slotId: string) => {
    const current = getSnapshot();
    write({ ...current, slots: current.slots.map((s) => (s.id === slotId && s.status === "open" ? { ...s, status: "reserved", reservedBy: "me" } : s)) });
  }, []);

  const markDone = useCallback((slotId: string, photoName: string | null) => {
    const current = getSnapshot();
    write({ ...current, slots: current.slots.map((s) => (s.id === slotId && s.reservedBy === "me" ? { ...s, status: "done", doneAt: new Date().toISOString(), donePhotoName: photoName } : s)) });
  }, []);

  return { ...state, hydrated, linkIcal, addManual, reserve, markDone };
}
