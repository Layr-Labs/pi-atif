import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertValidAtif } from "@openagentsinc/atif/validate";
import { afterEach, describe, expect, it } from "vitest";
import piAtif from "../src/extension.ts";

type Handler = (event: any, ctx: any) => unknown | Promise<unknown>;

class FakePi {
  handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler): void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  async emit(event: string, payload: any, ctx: any = defaultCtx()): Promise<void> {
    for (const handler of this.handlers.get(event) ?? []) {
      await handler(payload, ctx);
    }
  }
}

let outputDir: string | undefined;

afterEach(async () => {
  delete process.env.PI_ATIF_OUTPUT_DIR;
  if (outputDir) await rm(outputDir, { recursive: true, force: true });
  outputDir = undefined;
});

describe("pi-atif extension", () => {
  it("writes an externally valid ATIF trajectory from Pi-style events", async () => {
    outputDir = await mkdtemp(join(tmpdir(), "pi-atif-"));
    process.env.PI_ATIF_OUTPUT_DIR = outputDir;

    const fakePi = new FakePi();
    piAtif(fakePi as any);

    await fakePi.emit("session_start", { type: "session_start", reason: "startup" });
    await fakePi.emit("before_agent_start", {
      type: "before_agent_start",
      prompt: "Create hello.txt",
      systemPrompt: "You are Pi.",
      systemPromptOptions: { cwd: "/tmp/pi-atif-test" },
    });
    await fakePi.emit("turn_end", {
      type: "turn_end",
      turnIndex: 1,
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "I will write the file." },
          { type: "toolCall", id: "call-write", name: "write", arguments: { path: "hello.txt", content: "Hello" } },
        ],
        provider: "openai",
        model: "gpt-test",
        usage: { input: 50, output: 10, cacheRead: 0, totalTokens: 60, cost: { total: 0.01 } },
        stopReason: "toolUse",
        timestamp: Date.parse("2026-08-05T12:00:00.000Z"),
      },
      toolResults: [
        {
          role: "toolResult",
          toolCallId: "call-write",
          toolName: "write",
          content: [{ type: "text", text: "Wrote hello.txt" }],
          isError: false,
        },
      ],
    });
    await fakePi.emit("agent_settled", { type: "agent_settled" });
    await fakePi.emit("session_shutdown", { type: "session_shutdown", reason: "quit" });

    const trajectory = JSON.parse(await readFile(join(outputDir, "trajectory.json"), "utf8"));
    expect(trajectory.steps).toHaveLength(3);
    assertValidAtif(trajectory);
  });
});

function defaultCtx(): any {
  return {
    cwd: "/tmp/pi-atif-test",
    mode: "json",
    model: { id: "gpt-test", name: "GPT Test" },
  };
}
