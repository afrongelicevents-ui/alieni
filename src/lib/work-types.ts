/** Kinds of work a cleaner can take on (cleaner_profiles.work_types). Shared by the wizard, the save action and the Work page. */
export const WORK_TYPES = ["household_regular", "move_in_out", "deep", "commercial_contract"] as const;
export type WorkType = (typeof WORK_TYPES)[number];
export const HOUSEHOLD_WORK_TYPES: WorkType[] = ["household_regular", "move_in_out", "deep"];
export const COMMERCIAL_WORK_TYPES: WorkType[] = ["commercial_contract"];
