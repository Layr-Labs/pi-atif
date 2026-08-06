import type {
  AgentEndEvent,
  BeforeAgentStartEvent,
  SessionCompactEvent,
  SessionStartEvent,
  TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { contentToAtif, extractText, extractThinking, extractToolCalls, normalizeJsonObject, stringifyUnknown } from "./content.ts";
import { ATIF_SCHEMA_VERSION, type AtifAgent, type AtifFinalMetrics, type AtifStep, type AtifTrajectory } from "./schema.ts";

type PiAgentMessage = { role: string; [key: string]: unknown };

export interface PiAtifMapperOptions {
  agentName?: string;
  agentVersion?: string;
  modelName?: string;
  sessionId?: string;
  trajectoryId?: string;
  notes?: string;
  extra?: Record<string, unknown>;
  evalMetadata?: PiAtifEvalMetadata;
  includeReasoningContent?: boolean;
  includeRawProviderFields?: boolean;
}

export interface PiAtifEvalMetadata {
  benchmarkId?: string;
  taskId?: string;
  runId?: string;
  attemptIndex?: number;
  suiteId?: string;
  split?: string;
  reward?: number;
  score?: number;
  verifierOutcome?: string;
}

export class PiAtifMapper {
  private readonly agent: AtifAgent;
  private readonly sessionId: string;
  private readonly trajectoryId: string;
  private readonly notes?: string;
  private readonly extra: Record<string, unknown>;
  private readonly includeReasoningContent: boolean;
  private readonly includeRawProviderFields: boolean;
  private steps: AtifStep[] = [];
  private emittedInitialSystem = false;

  constructor(options: PiAtifMapperOptions = {}) {
    this.sessionId = options.sessionId ?? process.env.PI_ATIF_RUN_ID ?? `pi-${randomUUID()}`;
    this.trajectoryId = options.trajectoryId ?? process.env.PI_ATIF_TRAJECTORY_ID ?? `${this.sessionId}-trajectory`;
    this.agent = {
      name: options.agentName ?? process.env.PI_ATIF_AGENT_NAME ?? "pi",
      version: options.agentVersion ?? process.env.PI_ATIF_AGENT_VERSION ?? "unknown",
      ...(options.modelName ? { model_name: options.modelName } : {}),
    };
    this.notes = options.notes;
    this.includeReasoningContent = options.includeReasoningContent ?? envBoolean("PI_ATIF_INCLUDE_REASONING_CONTENT", false);
    this.includeRawProviderFields = options.includeRawProviderFields ?? envBoolean("PI_ATIF_INCLUDE_RAW_PROVIDER_FIELDS", false);
    const evalMetadata = normalizeEvalMetadata(options.evalMetadata ?? evalMetadataFromEnv());
    this.extra = {
      ...(options.extra ?? {}),
      pi_atif: {
        eval: evalMetadata,
        capture: {
          reasoning_content: this.includeReasoningContent,
          raw_provider_fields: this.includeRawProviderFields,
        },
      },
    };
  }

  handleSessionStart(event: Pick<SessionStartEvent, "reason" | "previousSessionFile">, cwd?: string): void {
    this.extra.session_start = normalizeJsonObject({
      reason: event.reason,
      previousSessionFile: event.previousSessionFile,
      cwd,
    });
  }

  handleBeforeAgentStart(event: Pick<BeforeAgentStartEvent, "prompt" | "images" | "systemPrompt" | "systemPromptOptions">): void {
    if (!this.emittedInitialSystem && event.systemPrompt) {
      this.addStep({
        source: "system",
        message: event.systemPrompt,
        extra: {
          pi_event: "before_agent_start",
          system_prompt_options: normalizeJsonObject(event.systemPromptOptions),
        },
      });
      this.emittedInitialSystem = true;
    }

    this.addStep({
      source: "user",
      message: event.images && event.images.length > 0 ? contentToAtif([{ type: "text", text: event.prompt }, ...event.images]) : event.prompt,
      extra: {
        pi_event: "before_agent_start",
        image_count: event.images?.length ?? 0,
      },
    });
  }

  handleTurnEnd(event: Pick<TurnEndEvent, "turnIndex" | "message" | "toolResults">): void {
    const message = event.message as unknown as PiAgentMessage;
    if (!isAssistantMessage(message)) {
      this.addMessageAsStep(message, { turnIndex: event.turnIndex });
      return;
    }

    const usage = normalizeUsage(message.usage);
    const toolCalls = extractToolCalls(message.content);
    const toolResults = event.toolResults ?? [];
    const observationResults = toolResults.map((result) => ({
      source_call_id: result.toolCallId,
      content: contentToAtif(result.content),
      extra: {
        tool_name: result.toolName,
        is_error: Boolean(result.isError),
        details: normalizeJsonObject(result.details),
        usage: normalizeJsonObject(result.usage),
      },
    }));

    this.addStep({
      source: "agent",
      timestamp: toIso(message.timestamp),
      model_name: typeof message.model === "string" ? message.model : undefined,
      message: contentToAtif(message.content),
      reasoning_content: this.includeReasoningContent ? extractThinking(message.content) : undefined,
      tool_calls: toolCalls.map((call) => ({
        tool_call_id: call.id,
        function_name: call.name,
        arguments: call.arguments,
      })),
      observation: observationResults.length > 0 ? { results: observationResults } : undefined,
      metrics: usage,
      llm_call_count: 1,
      extra: normalizeJsonObject({
        pi_event: "turn_end",
        turn_index: event.turnIndex,
        raw_provider_fields: this.includeRawProviderFields
          ? { provider: message.provider, api: message.api, stop_reason: message.stopReason, error_message: message.errorMessage }
          : undefined,
      }),
    });
  }

  handleSessionCompact(event: Pick<SessionCompactEvent, "reason" | "willRetry" | "fromExtension" | "compactionEntry">): void {
    const entry = event.compactionEntry as { timestamp?: string; summary?: string; tokensBefore?: number };
    this.addStep({
      source: "system",
      timestamp: entry.timestamp,
      message: "Context compaction performed",
      observation: {
        results: [
          {
            content: entry.summary ?? "",
            extra: {
              tokens_before: entry.tokensBefore ?? null,
            },
          },
        ],
      },
      extra: {
        pi_event: "session_compact",
        from_extension: event.fromExtension,
        will_retry: event.willRetry,
        context_management: {
          type: "compaction",
          boundary: "replace",
          reason: event.reason,
        },
      },
    });
  }

  handleAgentEnd(event: Pick<AgentEndEvent, "messages">): void {
    this.extra.agent_end = normalizeJsonObject({
      message_count: event.messages.length,
    });
  }

  toTrajectory(): AtifTrajectory {
    return {
      schema_version: ATIF_SCHEMA_VERSION,
      session_id: this.sessionId,
      trajectory_id: this.trajectoryId,
      agent: {
        ...this.agent,
        model_name: this.agent.model_name ?? this.inferModelName(),
      },
      steps: this.steps.map((step, index) => ({ ...step, step_id: index + 1 })),
      ...(this.notes ? { notes: this.notes } : {}),
      final_metrics: this.finalMetrics(),
      extra: normalizeJsonObject({
        ...this.extra,
        producer: "pi-atif",
      }),
    };
  }

  private addMessageAsStep(message: PiAgentMessage, extra: Record<string, unknown> = {}): void {
    if (message.role === "toolResult") return;
    const source = message.role === "assistant" ? "agent" : message.role === "user" ? "user" : "system";
    this.addStep({
      source,
      timestamp: toIso(message.timestamp),
      message: messageToContent(message),
      extra: {
        ...extra,
        pi_role: message.role,
      },
    });
  }

  private addStep(step: Omit<AtifStep, "step_id">): void {
    const cleaned = stripUndefined({
      ...step,
      step_id: this.steps.length + 1,
      timestamp: step.timestamp ?? new Date().toISOString(),
    }) as AtifStep;
    this.steps.push(cleaned);
  }

  private inferModelName(): string | undefined {
    return this.steps.find((step) => step.model_name)?.model_name;
  }

  private finalMetrics(): AtifFinalMetrics {
    const totals = this.steps.reduce(
      (acc, step) => {
        acc.total_prompt_tokens += step.metrics?.prompt_tokens ?? 0;
        acc.total_completion_tokens += step.metrics?.completion_tokens ?? 0;
        acc.total_cached_tokens += step.metrics?.cached_tokens ?? 0;
        acc.total_cost_usd += step.metrics?.cost_usd ?? 0;
        return acc;
      },
      {
        total_prompt_tokens: 0,
        total_completion_tokens: 0,
        total_cached_tokens: 0,
        total_cost_usd: 0,
      },
    );
    return {
      ...totals,
      total_steps: this.steps.length,
    };
  }
}

function evalMetadataFromEnv(): PiAtifEvalMetadata {
  return {
    benchmarkId: process.env.PI_ATIF_BENCHMARK_ID,
    taskId: process.env.PI_ATIF_TASK_ID,
    runId: process.env.PI_ATIF_EVAL_RUN_ID ?? process.env.PI_ATIF_RUN_ID,
    attemptIndex: envNumber("PI_ATIF_ATTEMPT_INDEX"),
    suiteId: process.env.PI_ATIF_SUITE_ID,
    split: process.env.PI_ATIF_SPLIT,
    reward: envNumber("PI_ATIF_REWARD"),
    score: envNumber("PI_ATIF_SCORE"),
    verifierOutcome: process.env.PI_ATIF_VERIFIER_OUTCOME,
  };
}

function normalizeEvalMetadata(metadata: PiAtifEvalMetadata): Record<string, unknown> {
  return stripUndefined({
    benchmark_id: metadata.benchmarkId,
    task_id: metadata.taskId,
    run_id: metadata.runId,
    attempt_index: metadata.attemptIndex,
    suite_id: metadata.suiteId,
    split: metadata.split,
    reward: metadata.reward,
    score: metadata.score,
    verifier_outcome: metadata.verifierOutcome,
  }) as Record<string, unknown>;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (value === undefined || value === "") return fallback;
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function envNumber(name: string): number | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function trajectoryFromPiJsonEvents(events: Iterable<Record<string, unknown>>, options: PiAtifMapperOptions = {}): AtifTrajectory {
  const mapper = new PiAtifMapper(options);
  for (const event of events) {
    if (event.type === "session") {
      mapper.handleSessionStart({ reason: "startup" }, typeof event.cwd === "string" ? event.cwd : undefined);
    } else if (event.type === "before_agent_start") {
      mapper.handleBeforeAgentStart(event as unknown as BeforeAgentStartEvent);
    } else if (event.type === "turn_end") {
      mapper.handleTurnEnd(event as unknown as TurnEndEvent);
    } else if (event.type === "session_compact") {
      mapper.handleSessionCompact(event as unknown as SessionCompactEvent);
    } else if (event.type === "agent_end") {
      mapper.handleAgentEnd(event as unknown as AgentEndEvent);
    }
  }
  return mapper.toTrajectory();
}

function isAssistantMessage(message: PiAgentMessage): message is PiAgentMessage & {
  role: "assistant";
  content: unknown;
  api?: string;
  provider?: string;
  model?: string;
  usage?: unknown;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
} {
  return message.role === "assistant";
}

function messageToContent(message: PiAgentMessage): string {
  if ("content" in message) return typeof message.content === "string" ? message.content : extractText(message.content);
  if (message.role === "bashExecution") return `${stringifyUnknown(message.command)}\n${stringifyUnknown(message.output)}`;
  if (message.role === "branchSummary") return stringifyUnknown(message.summary);
  if (message.role === "compactionSummary") return stringifyUnknown(message.summary);
  return stringifyUnknown(message);
}

function normalizeUsage(usage: unknown) {
  if (!usage || typeof usage !== "object") return undefined;
  const u = usage as {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number; input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
  };
  const input = asNumber(u.input);
  const cacheRead = asNumber(u.cacheRead);
  const cacheWrite = asNumber(u.cacheWrite);
  const promptTokens = [input, cacheRead, cacheWrite].some((value) => value !== undefined)
    ? (input ?? 0) + (cacheRead ?? 0) + (cacheWrite ?? 0)
    : undefined;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: asNumber(u.output),
    cached_tokens: cacheRead,
    cost_usd: asNumber(u.cost?.total),
    extra: normalizeJsonObject({
      total_tokens: u.totalTokens,
      cache_write_tokens: cacheWrite,
      raw_usage: normalizeJsonObject(usage),
      cost_breakdown: u.cost,
    }),
  };
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toIso(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return undefined;
}

function stripUndefined(value: unknown): unknown {
  return stripUndefinedValue(value, new WeakSet<object>());
}

function stripUndefinedValue(value: unknown, ancestors: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return null;
    ancestors.add(value);
    try {
      return value.map((item) => stripUndefinedValue(item, ancestors));
    } finally {
      ancestors.delete(value);
    }
  }
  if (!value || typeof value !== "object") return value;
  if (ancestors.has(value)) return null;
  ancestors.add(value);
  const out: Record<string, unknown> = {};
  try {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      Object.defineProperty(out, key, {
        value: stripUndefinedValue(item, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}
