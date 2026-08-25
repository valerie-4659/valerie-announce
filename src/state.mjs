// What has already been announced.
//
// Keyed by repository, holding the tag last posted. The file is committed by
// the workflow after every run, which is also what keeps the scheduled trigger
// from being switched off for inactivity.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "state", "posted.json");

export async function readState() {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export async function writeState(state) {
  const sorted = Object.fromEntries(Object.entries(state).sort(([a], [b]) => (a < b ? -1 : 1)));
  await fs.writeFile(FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}

export { FILE as STATE_FILE };
