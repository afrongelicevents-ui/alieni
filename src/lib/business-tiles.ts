import "server-only";
import type { BusinessBundle } from "./business-data";
import { jobServiceKey, type Frequency } from "./jobs";
import { enabledFor, type CatalogRow, type ServiceKey } from "./services";
import type { Tile } from "@/components/business/ServiceTiles";

const HREF: Record<ServiceKey, string> = {
  connect: "/search",
  cover: "/emergency",
  turnover: "/business/calendar",
  oneoff: "/jobs/new?kind=oneoff",
  contract: "/jobs/new?kind=contract",
};

/** Dashboard tiles for a business: enabled per catalogue + type, with a live count where useful. */
export function tilesFor(catalog: CatalogRow[], bundle: BusinessBundle): Tile[] {
  const type = bundle.profile.business_type;
  const order: ServiceKey[] = ["cover", "turnover", "oneoff", "contract", "connect"];
  return order.map((key) => {
    const row = catalog.find((c) => c.service_key === key);
    const enabled = enabledFor(catalog, key, type);
    const offForType = Boolean(row?.enabled) && !enabled; // on in general, but not for this sector
    let count: number | undefined;
    if (key === "cover") count = bundle.emergencies.filter((e) => e.status === "searching" || e.status === "accepted").length || undefined;
    if (key === "turnover") count = bundle.slots.filter((s) => s.status === "open" || s.status === "reserved").length || undefined;
    if (key === "oneoff" || key === "contract") count = bundle.jobs.filter((j) => jobServiceKey(j.frequency as Frequency) === key && j.status === "published").length || undefined;
    if (key === "connect") count = bundle.connectedCleaners.length || undefined;
    return { key, enabled, offForType, href: HREF[key], count };
  });
}
