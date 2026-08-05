import { readdir, readFile } from "node:fs/promises";
import { assertValidAtif } from "@openagentsinc/atif/validate";

const requestedFiles = process.argv.slice(2);
const files = requestedFiles.length > 0
  ? requestedFiles
  : await findDefaultTrajectories();

if (files.length === 0) {
  console.error("No trajectories found in fixtures/ or atif-output/.");
  process.exit(2);
}

for (const file of files) {
  const value = JSON.parse(await readFile(file, "utf8"));
  assertValidAtif(value);
  console.log(`openagents ok: ${file}`);
}

async function findDefaultTrajectories(): Promise<string[]> {
  const files: string[] = [];
  for (const directory of ["fixtures", "atif-output"]) {
    try {
      const entries = await readdir(directory);
      files.push(...entries
        .filter((entry) => entry.endsWith(".json"))
        .sort()
        .map((entry) => `${directory}/${entry}`));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return files;
}
