import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AtifTrajectory } from "./schema.ts";

export interface AtifWriterOptions {
  outputDir?: string;
  fileName?: string;
  pretty?: boolean;
}

export async function writeAtifTrajectory(trajectory: AtifTrajectory, options: AtifWriterOptions = {}): Promise<string> {
  const outputDir = options.outputDir ?? process.env.PI_ATIF_OUTPUT_DIR ?? join(process.cwd(), "atif-output");
  const fileName = options.fileName ?? process.env.PI_ATIF_FILE_NAME ?? "trajectory.json";
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(trajectory, null, options.pretty === false ? 0 : 2));
  return outputPath;
}
