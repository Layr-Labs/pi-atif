import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { AtifTrajectory } from "./schema.ts";

export interface AtifWriterOptions {
  outputDir?: string;
  fileName?: string;
  pretty?: boolean;
  fileMode?: number;
  directoryMode?: number;
  transformTrajectory?: (trajectory: AtifTrajectory) => AtifTrajectory | Promise<AtifTrajectory>;
}

export async function writeAtifTrajectory(trajectory: AtifTrajectory, options: AtifWriterOptions = {}): Promise<string> {
  const outputDir = options.outputDir ?? process.env.PI_ATIF_OUTPUT_DIR ?? join(process.cwd(), "atif-output");
  const fileName = options.fileName ?? process.env.PI_ATIF_FILE_NAME ?? defaultFileName(trajectory);
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true, mode: options.directoryMode ?? 0o700 });
  const extension = extname(outputPath);
  const tempPath = join(dirname(outputPath), `.${basename(outputPath, extension)}.${randomUUID()}.tmp${extension}`);
  const outputTrajectory = options.transformTrajectory ? await options.transformTrajectory(trajectory) : trajectory;
  await writeFile(tempPath, JSON.stringify(outputTrajectory, null, options.pretty === false ? 0 : 2), {
    mode: options.fileMode ?? 0o600,
  });
  await rename(tempPath, outputPath);
  return outputPath;
}

function defaultFileName(trajectory: AtifTrajectory): string {
  const id = trajectory.trajectory_id ?? trajectory.session_id ?? randomUUID();
  const safeId = id.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safeId || randomUUID()}.json`;
}
