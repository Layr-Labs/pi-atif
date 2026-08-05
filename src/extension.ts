import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PiAtifMapper } from "./mapper.ts";
import { writeAtifTrajectory } from "./writer.ts";

export default function piAtif(pi: ExtensionAPI): void {
  let mapper = new PiAtifMapper();
  let lastWrite: Promise<unknown> = Promise.resolve();

  async function flush(): Promise<void> {
    const trajectory = mapper.toTrajectory();
    await writeAtifTrajectory(trajectory);
  }

  function queueFlush(): void {
    lastWrite = lastWrite.then(flush, flush).catch((error) => {
      console.error("[pi-atif] failed to write trajectory", error);
    });
  }

  pi.on("session_start", (event, ctx) => {
    mapper = new PiAtifMapper({
      modelName: ctx.model?.id ?? ctx.model?.name,
      extra: {
        cwd: ctx.cwd,
        mode: ctx.mode,
      },
    });
    mapper.handleSessionStart(event, ctx.cwd);
  });

  pi.on("before_agent_start", (event) => {
    mapper.handleBeforeAgentStart(event);
    queueFlush();
  });

  pi.on("turn_end", (event) => {
    mapper.handleTurnEnd(event);
    queueFlush();
  });

  pi.on("session_compact", (event) => {
    mapper.handleSessionCompact(event);
    queueFlush();
  });

  pi.on("agent_end", (event) => {
    mapper.handleAgentEnd(event);
    queueFlush();
  });

  pi.on("agent_settled", () => {
    queueFlush();
  });

  pi.on("session_shutdown", async () => {
    queueFlush();
    await lastWrite;
  });
}
