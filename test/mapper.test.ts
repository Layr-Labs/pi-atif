import { describe, expect, it } from "vitest";
import { PiAtifMapper, trajectoryFromPiJsonEvents } from "../src/mapper.ts";

describe("PiAtifMapper", () => {
  it("maps a Pi turn with a tool call and result into ATIF v1.7", () => {
    const mapper = new PiAtifMapper({
      sessionId: "sess-1",
      trajectoryId: "traj-1",
      agentName: "pi-test",
      agentVersion: "0.1.0",
    });

    mapper.handleBeforeAgentStart({
      prompt: "Create hello.txt",
      systemPrompt: "You are Pi.",
      systemPromptOptions: { cwd: "/tmp/pi-atif-test" } as any,
    });

    mapper.handleTurnEnd({
      turnIndex: 1,
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Need to write the file." },
          { type: "text", text: "I will create the file." },
          { type: "toolCall", id: "call-1", name: "write", arguments: { path: "hello.txt", content: "Hello, world!" } },
        ],
        api: "openai-responses",
        provider: "openai",
        model: "gpt-test",
        usage: {
          input: 100,
          output: 20,
          cacheRead: 10,
          cacheWrite: 5,
          totalTokens: 135,
          cost: { input: 0.01, output: 0.02, cacheRead: 0.001, cacheWrite: 0, total: 0.031 },
        },
        stopReason: "toolUse",
        timestamp: Date.parse("2026-08-05T12:00:00.000Z"),
      } as any,
      toolResults: [
        {
          role: "toolResult",
          toolCallId: "call-1",
          toolName: "write",
          content: [{ type: "text", text: "Wrote hello.txt" }],
          details: { bytes: 13 },
          isError: false,
          timestamp: Date.parse("2026-08-05T12:00:01.000Z"),
        } as any,
      ],
    });

    const trajectory = mapper.toTrajectory();
    expect(trajectory.schema_version).toBe("ATIF-v1.7");
    expect(trajectory.steps).toHaveLength(3);
    expect(trajectory.steps[2]?.tool_calls?.[0]?.function_name).toBe("write");
    expect(trajectory.steps[2]?.observation?.results[0]?.source_call_id).toBe("call-1");
    expect(trajectory.steps[2]?.metrics).toMatchObject({
      prompt_tokens: 115,
      cached_tokens: 10,
    });
    expect(trajectory.steps[2]?.metrics?.extra).toMatchObject({
      cache_write_tokens: 5,
      raw_usage: { input: 100, output: 20, cacheRead: 10 },
    });
    expect(trajectory.final_metrics).toMatchObject({
      total_prompt_tokens: 115,
      total_completion_tokens: 20,
      total_cached_tokens: 10,
      total_cost_usd: 0.031,
    });
  });

  it("captures every user prompt while emitting the system prompt only once", () => {
    const mapper = new PiAtifMapper({ sessionId: "sess-multi", trajectoryId: "traj-multi" });
    mapper.handleBeforeAgentStart({ prompt: "First", systemPrompt: "System", systemPromptOptions: {} as any });
    mapper.handleBeforeAgentStart({ prompt: "Second", systemPrompt: "Changed system", systemPromptOptions: {} as any });

    const trajectory = mapper.toTrajectory();
    expect(trajectory.steps.map(({ source, message }) => ({ source, message }))).toEqual([
      { source: "system", message: "System" },
      { source: "user", message: "First" },
      { source: "user", message: "Second" },
    ]);
  });

  it("counts cache reads and writes as prompt tokens and aggregates them", () => {
    const mapper = new PiAtifMapper({ sessionId: "sess-usage", trajectoryId: "traj-usage" });
    for (const [turnIndex, input, cacheRead, cacheWrite] of [[1, 10, 3, 2], [2, 20, 4, 5]] as const) {
      mapper.handleTurnEnd({
        turnIndex,
        message: { role: "assistant", content: [], usage: { input, output: turnIndex, cacheRead, cacheWrite } } as any,
        toolResults: [],
      });
    }

    expect(mapper.toTrajectory().final_metrics).toMatchObject({
      total_prompt_tokens: 44,
      total_completion_tokens: 3,
      total_cached_tokens: 7,
    });
  });

  it("marks compaction as an ATIF context-management system step", () => {
    const mapper = new PiAtifMapper({ sessionId: "sess-2", trajectoryId: "traj-2" });
    mapper.handleSessionCompact({
      type: "session_compact",
      reason: "threshold",
      fromExtension: false,
      willRetry: false,
      compactionEntry: {
        timestamp: "2026-08-05T12:00:00.000Z",
        summary: "Prior context was summarized.",
        tokensBefore: 1000,
      },
    } as any);
    const trajectory = mapper.toTrajectory();
    expect(trajectory.steps[0]?.extra?.context_management).toEqual({
      type: "compaction",
      boundary: "replace",
      reason: "threshold",
    });
  });

  it("can map Pi JSON mode events", () => {
    const trajectory = trajectoryFromPiJsonEvents(
      [
        { type: "session", cwd: "/tmp/project" },
        {
          type: "turn_end",
          turnIndex: 1,
          message: {
            role: "assistant",
            content: [{ type: "text", text: "Done." }],
            provider: "openai",
            model: "gpt-test",
            usage: { input: 5, output: 2, cacheRead: 0, totalTokens: 7, cost: { total: 0.01 } },
            stopReason: "stop",
            timestamp: Date.parse("2026-08-05T12:00:00.000Z"),
          },
          toolResults: [],
        },
      ],
      { sessionId: "sess-3", trajectoryId: "traj-3" },
    );

    expect(trajectory.steps).toHaveLength(1);
    expect(trajectory.steps[0]?.source).toBe("agent");
  });
});
