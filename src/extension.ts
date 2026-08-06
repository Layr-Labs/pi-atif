import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PiAtifMapper } from "./mapper.ts";
import { writeAtifTrajectory, type AtifWriterOptions } from "./writer.ts";

export interface PiAtifExtensionOptions {
  writer?: AtifWriterOptions;
}

export function createPiAtifExtension(options: PiAtifExtensionOptions = {}): (pi: ExtensionAPI) => void {
  return (pi) => registerPiAtif(pi, options);
}

export default function piAtif(pi: ExtensionAPI): void {
  registerPiAtif(pi);
}

function registerPiAtif(pi: ExtensionAPI, options: PiAtifExtensionOptions = {}): void {
  let mapper = new PiAtifMapper();
  let lastWrite: Promise<unknown> = Promise.resolve();

  async function flush(trajectory: ReturnType<PiAtifMapper["toTrajectory"]>): Promise<void> {
    await writeAtifTrajectory(trajectory, options.writer);
  }

  function queueFlush(): void {
    const trajectory = mapper.toTrajectory();
    const writeSnapshot = () => flush(trajectory);
    lastWrite = lastWrite.then(writeSnapshot, writeSnapshot).catch((error) => {
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
