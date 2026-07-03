/**
 * Endpoint resolution for the LLM author (S2 of the core redesign).
 *
 * Design rule (doc 04, refined by doc 05): MergeLearn is local-first. The DEFAULT
 * endpoint is a local OpenAI-compatible server (Ollama / LM Studio). A cloud
 * endpoint is explicit opt-in behind a one-time consent, because authoring ships
 * code snippets + diffs to the model and that must never happen silently.
 */

export interface EndpointConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  isCloud: boolean;
  /** True when the endpoint is usable now (local, or cloud with consent + key). */
  usable: boolean;
  /** Human-readable reason when not usable (for a CLI consent prompt). */
  reason?: string;
}

/** Default local endpoint: Ollama's OpenAI-compatible server. */
export const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:11434/v1';
export const DEFAULT_LOCAL_MODEL = 'qwen2.5-coder';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/** A base URL is "cloud" when its host is not a loopback/local address. */
export function isCloudEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return !LOCAL_HOSTS.has(host);
  } catch {
    return false;
  }
}

export interface ResolveEndpointEnv {
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
  /** Explicit opt-in for a cloud endpoint. Any truthy value = consent given. */
  MERGELEARN_ALLOW_CLOUD?: string;
}

/**
 * Resolve the author endpoint from environment, local-first.
 * - No config -> local default (usable without a key; local servers rarely need one).
 * - Cloud base URL -> usable ONLY with MERGELEARN_ALLOW_CLOUD set AND an API key.
 *   Otherwise usable=false with a reason a CLI can turn into a consent prompt.
 */
export function resolveEndpoint(env: ResolveEndpointEnv = process.env as unknown as ResolveEndpointEnv): EndpointConfig {
  const baseUrl = (env.OPENAI_BASE_URL?.trim() || DEFAULT_LOCAL_BASE_URL).replace(/\/$/, '');
  const model = env.OPENAI_MODEL?.trim() || DEFAULT_LOCAL_MODEL;
  const apiKey = env.OPENAI_API_KEY?.trim();
  const cloud = isCloudEndpoint(baseUrl);
  if (!cloud) {
    return { baseUrl, model, apiKey, isCloud: false, usable: true };
  }
  const consented = Boolean(env.MERGELEARN_ALLOW_CLOUD?.trim());
  if (!consented) {
    return { baseUrl, model, apiKey, isCloud: true, usable: false,
      reason: `Cloud endpoint ${baseUrl} requires consent: authoring sends code snippets and diffs to it. Set MERGELEARN_ALLOW_CLOUD=1 to allow.` };
  }
  if (!apiKey) {
    return { baseUrl, model, apiKey, isCloud: true, usable: false,
      reason: `Cloud endpoint ${baseUrl} needs OPENAI_API_KEY.` };
  }
  return { baseUrl, model, apiKey, isCloud: true, usable: true };
}

/**
 * Tolerant JSON extraction (doc 05: "any LLM collides with strict JSON").
 * Weak local models wrap JSON in prose or ```json fences. Try strict parse
 * first, then strip fences, then extract the first balanced {...} object.
 * Returns undefined if nothing parses - caller then regenerates or skips.
 */
export function extractFirstJson<T = unknown>(raw: string): T | undefined {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // fall through to repair strategies
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf('{');
  if (start === -1) return undefined;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') inStr = !inStr;
    else if (!inStr && ch === '{') depth += 1;
    else if (!inStr && ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1)) as T;
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}
