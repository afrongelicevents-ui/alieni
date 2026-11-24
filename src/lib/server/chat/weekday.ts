import "server-only";

/**
 * The app and the D1 schema both use weekdays 0–6 (0 = Monday), as on alieni-nl, so no conversion is needed.
 * Kept as one place to change if the storage convention ever differs.
 */
export const WEEKDAY_DB_OFFSET = 0;
export const weekdayToDb = (w: number) => w + WEEKDAY_DB_OFFSET;
export const weekdayFromDb = (w: number) => w - WEEKDAY_DB_OFFSET;
