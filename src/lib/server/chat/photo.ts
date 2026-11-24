import "server-only";
import { signedFileUrl } from "@/lib/server/files";

/**
 * Signed link to a cleaner's photo for someone who may see it: a chat partner, or anyone for a published ad.
 * Callers have checked that relationship before calling.
 */
export async function cleanerPhotoUrl(key: string | null | undefined): Promise<string | null> {
  try {
    return await signedFileUrl(key);
  } catch {
    return null;
  }
}
