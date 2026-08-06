import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AtifTrajectory } from "../src/schema.ts";
import { writeAtifTrajectory } from "../src/writer.ts";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("writeAtifTrajectory", () => {
  it("writes private files and supports a pre-write transform", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "pi-atif-writer-"));
    temporaryDirectories.push(outputDir);
    const trajectory = exampleTrajectory("secret-token-value");

    const outputPath = await writeAtifTrajectory(trajectory, {
      outputDir,
      fileName: "trajectory.json",
      transformTrajectory: (value) => ({ ...value, notes: "[REDACTED]" }),
    });

    const output = await readFile(outputPath, "utf8");
    expect(output).not.toContain("secret-token-value");
    expect(JSON.parse(output).notes).toBe("[REDACTED]");
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
  });
});

function exampleTrajectory(notes: string): AtifTrajectory {
  return {
    schema_version: "ATIF-v1.7",
    session_id: "session-1",
    trajectory_id: "trajectory-1",
    agent: { name: "pi", version: "test" },
    steps: [],
    notes,
    final_metrics: {
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_cached_tokens: 0,
      total_cost_usd: 0,
      total_steps: 0,
    },
  };
}
