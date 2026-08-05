import type { AtifMessageContent, ContentPart, JsonObject } from "./schema.ts";

interface TextBlock {
  type: "text";
  text: string;
}

interface ImageBlock {
  type: "image";
  data?: string;
  mimeType?: string;
  source?: { media_type?: string; path?: string };
}

interface ThinkingBlock {
  type: "thinking";
  thinking?: string;
}

interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments?: unknown;
}

type PiContentBlock = TextBlock | ImageBlock | ThinkingBlock | ToolCallBlock | Record<string, unknown>;

export function stringifyUnknown(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function normalizeJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return sanitizeJson(value) as JsonObject;
  return {};
}

export function sanitizeJson(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJson(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (typeof item === "function" || typeof item === "symbol" || item === undefined) continue;
      out[key] = sanitizeJson(item);
    }
    return out;
  }
  return String(value);
}

export function contentToAtif(content: unknown): AtifMessageContent {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return stringifyUnknown(content);

  const parts: ContentPart[] = [];
  const textChunks: string[] = [];

  for (const block of content as PiContentBlock[]) {
    if (block && typeof block === "object" && "type" in block) {
      if (block.type === "text") {
        textChunks.push((block as TextBlock).text ?? "");
        continue;
      }
      if (block.type === "thinking") {
        continue;
      }
      if (block.type === "image") {
        const image = block as ImageBlock;
        const mediaType = image.mimeType ?? image.source?.media_type;
        const path = image.source?.path;
        if (isAtifMediaType(mediaType) && path) {
          parts.push({ type: "image", source: { media_type: mediaType, path } });
        } else {
          textChunks.push("[image]");
        }
        continue;
      }
      if (block.type === "toolCall") {
        continue;
      }
    }
    textChunks.push(stringifyUnknown(block));
  }

  const text = textChunks.filter(Boolean).join("\n");
  if (parts.length === 0) return text;
  if (text) parts.unshift({ type: "text", text });
  return parts;
}

export function extractText(content: unknown): string {
  const normalized = contentToAtif(content);
  if (typeof normalized === "string") return normalized;
  return normalized
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function extractThinking(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const chunks = (content as PiContentBlock[])
    .filter((block): block is ThinkingBlock => Boolean(block && typeof block === "object" && block.type === "thinking"))
    .map((block) => block.thinking ?? "")
    .filter(Boolean);
  return chunks.length > 0 ? chunks.join("\n") : undefined;
}

export function extractToolCalls(content: unknown): Array<{ id: string; name: string; arguments: JsonObject }> {
  if (!Array.isArray(content)) return [];
  return (content as PiContentBlock[])
    .filter((block): block is ToolCallBlock => Boolean(block && typeof block === "object" && block.type === "toolCall"))
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: normalizeJsonObject(block.arguments),
    }))
    .filter((call) => Boolean(call.id && call.name));
}

function isAtifMediaType(value: unknown): value is "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  return value === "image/jpeg" || value === "image/png" || value === "image/gif" || value === "image/webp";
}
