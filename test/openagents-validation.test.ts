import { assertValidAtif } from "@openagentsinc/atif/validate";
import { describe, expect, it } from "vitest";
import { PiAtifMapper } from "../src/mapper.ts";

describe("OpenAgents ATIF validator", () => {
  it("accepts generated trajectories", () => {
    const mapper = new PiAtifMapper({ sessionId: "sess-validator", trajectoryId: "traj-validator" });
    mapper.handleBeforeAgentStart({
      prompt: "Say hello",
      systemPrompt: "You are Pi.",
      systemPromptOptions: { cwd: "/tmp/pi-atif-test" } as any,
    });
    const trajectory = mapper.toTrajectory();
    expect(() => assertValidAtif(trajectory)).not.toThrow();
  });
});
