import { describe, expect, it } from 'vitest';

import {
  resolveEndpoint,
  isCloudEndpoint,
  extractFirstJson,
  DEFAULT_LOCAL_BASE_URL,
} from '../../src/core/endpoint.js';

describe('endpoint resolution (local-first)', () => {
  it('defaults to a local endpoint, usable without a key', () => {
    const e = resolveEndpoint({});
    expect(e.baseUrl).toBe(DEFAULT_LOCAL_BASE_URL);
    expect(e.isCloud).toBe(false);
    expect(e.usable).toBe(true);
  });

  it('treats loopback base URLs as local', () => {
    expect(isCloudEndpoint('http://localhost:1234/v1')).toBe(false);
    expect(isCloudEndpoint('http://127.0.0.1:11434/v1')).toBe(false);
    expect(isCloudEndpoint('https://api.openai.com/v1')).toBe(true);
  });

  it('blocks a cloud endpoint without explicit consent', () => {
    const e = resolveEndpoint({ OPENAI_BASE_URL: 'https://api.openai.com/v1', OPENAI_API_KEY: 'sk-x' });
    expect(e.isCloud).toBe(true);
    expect(e.usable).toBe(false);
    expect(e.reason).toMatch(/consent/i);
  });

  it('allows a cloud endpoint with consent + key', () => {
    const e = resolveEndpoint({
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_API_KEY: 'sk-x',
      MERGELEARN_ALLOW_CLOUD: '1',
    });
    expect(e.usable).toBe(true);
  });

  it('blocks a consented cloud endpoint that is missing a key', () => {
    const e = resolveEndpoint({ OPENAI_BASE_URL: 'https://api.openai.com/v1', MERGELEARN_ALLOW_CLOUD: '1' });
    expect(e.usable).toBe(false);
    expect(e.reason).toMatch(/key/i);
  });
});

describe('tolerant JSON extraction', () => {
  it('parses strict JSON', () => {
    expect(extractFirstJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses JSON inside a fenced code block', () => {
    expect(extractFirstJson('sure:\n```json\n{"a":2}\n```\n')).toEqual({ a: 2 });
  });

  it('extracts the first balanced object from surrounding prose', () => {
    expect(extractFirstJson('Here you go: {"a":{"b":3}} hope that helps')).toEqual({ a: { b: 3 } });
  });

  it('returns undefined when nothing parses', () => {
    expect(extractFirstJson('no json here')).toBeUndefined();
  });
});
