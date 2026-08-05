export const ATIF_SCHEMA_VERSION = "ATIF-v1.7" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ContentTextPart {
  type: "text";
  text: string;
}

export interface ContentImagePart {
  type: "image";
  source: {
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    path: string;
  };
}

export type ContentPart = ContentTextPart | ContentImagePart;
export type AtifMessageContent = string | ContentPart[];

export interface AtifToolCall {
  tool_call_id: string;
  function_name: string;
  arguments: JsonObject;
  extra?: JsonObject;
}

export interface AtifSubagentTrajectoryRef {
  trajectory_id?: string;
  trajectory_path?: string;
  session_id?: string;
  extra?: JsonObject;
}

export interface AtifObservationResult {
  source_call_id?: string;
  content?: AtifMessageContent;
  subagent_trajectory_ref?: AtifSubagentTrajectoryRef[];
  extra?: JsonObject;
}

export interface AtifObservation {
  results: AtifObservationResult[];
}

export interface AtifMetrics {
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_tokens?: number;
  cost_usd?: number;
  prompt_token_ids?: number[];
  completion_token_ids?: number[];
  logprobs?: number[];
  extra?: JsonObject;
}

export interface AtifStep {
  step_id: number;
  timestamp?: string;
  source: "system" | "user" | "agent";
  model_name?: string;
  reasoning_effort?: string | number;
  message: AtifMessageContent;
  reasoning_content?: string;
  tool_calls?: AtifToolCall[];
  observation?: AtifObservation;
  metrics?: AtifMetrics;
  extra?: JsonObject;
  llm_call_count?: number;
  is_copied_context?: boolean;
}

export interface AtifAgent {
  name: string;
  version: string;
  model_name?: string;
  tool_definitions?: JsonValue[];
  extra?: JsonObject;
}

export interface AtifFinalMetrics {
  total_prompt_tokens?: number;
  total_completion_tokens?: number;
  total_cached_tokens?: number;
  total_cost_usd?: number;
  total_steps?: number;
  extra?: JsonObject;
}

export interface AtifTrajectory {
  schema_version: typeof ATIF_SCHEMA_VERSION;
  session_id?: string;
  trajectory_id?: string;
  agent: AtifAgent;
  steps: AtifStep[];
  notes?: string;
  final_metrics?: AtifFinalMetrics;
  continued_trajectory_ref?: string;
  extra?: JsonObject;
  subagent_trajectories?: AtifTrajectory[];
}
