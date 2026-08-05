import { readFile } from "node:fs/promises";
import { assertValidAtif } from "@openagentsinc/atif/validate";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: tsx scripts/validate-openagents.ts <trajectory.json>...");
  process.exit(2);
}

for (const file of files) {
  const value = JSON.parse(await readFile(file, "utf8"));
  assertValidAtif(value);
  console.log(`openagents ok: ${file}`);
}
