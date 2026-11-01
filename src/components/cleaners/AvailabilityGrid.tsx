import { useTranslations } from "next-intl";
import type { DayBlock, SampleCleaner, Weekday } from "@/lib/sample-data";

const BLOCKS: DayBlock[] = ["morning", "afternoon", "evening"];

export function AvailabilityGrid({ availability }: { availability: SampleCleaner["availability"] }) {
  const t = useTranslations("common");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-1 text-center text-xs">
        <thead>
          <tr>
            <th aria-hidden="true" className="w-20" />
            {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => (
              <th key={d} scope="col" className="pb-1 font-bold text-ink/70">
                {t(`day${d}` as "day0").slice(0, 2)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {BLOCKS.map((block) => (
            <tr key={block}>
              <th scope="row" className="pr-2 text-left font-semibold text-ink/70">
                {t(block)}
              </th>
              {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((d) => {
                const on = (availability[d] ?? []).includes(block);
                return (
                  <td key={d}>
                    <span
                      role="img"
                      aria-label={`${t(`day${d}` as "day0")} ${t(block)}: ${on ? "✓" : "–"}`}
                      className={`block h-8 rounded-lg ${on ? "bg-forest" : "bg-section"}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
