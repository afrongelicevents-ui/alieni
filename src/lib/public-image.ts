import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";

/** True when a file exists under /public — lets pages show generated marketing photos only once they are added. */
export function hasPublicImage(relativePath: string): boolean {
  return existsSync(path.join(process.cwd(), "public", relativePath));
}
