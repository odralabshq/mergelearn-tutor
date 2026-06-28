export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmClientConfig = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

export type LlmClient = {
  completeJson<T>(input: { messages: LlmMessage[]; schemaHint: string }): Promise<T>;
};

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export function createLlmClient(config: LlmClientConfig): LlmClient {
  const baseUrl = (config.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = config.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  return {
    async completeJson<T>(input: { messages: LlmMessage[]; schemaHint: string }): Promise<T> {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            ...input.messages,
            { role: 'system', content: `Respond with valid JSON only. ${input.schemaHint}` },
          ],
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`LLM request failed (${response.status}): ${text.slice(0, 240)}`);
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM response missing content');
      return JSON.parse(content) as T;
    },
  };
}

export function resolveLlmClientFromEnv(): LlmClient | undefined {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return undefined;
  return createLlmClient({ apiKey });
}
