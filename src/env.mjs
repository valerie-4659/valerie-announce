// A .env loader, for running this by hand. On the runner the values arrive as
// real environment variables and this finds nothing, which is correct.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!match) continue;
    const value = match[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}
