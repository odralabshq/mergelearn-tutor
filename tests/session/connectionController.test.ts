import { describe, expect, it } from 'vitest';

import { createConnectionController } from '../../src/session/connectionController.js';

type FakeStatus = {
  hidden: boolean;
  textContent: string;
  dataset: Record<string, string>;
};

function harness(responses: Array<unknown | Error>) {
  const status: FakeStatus = { hidden: true, textContent: '', dataset: {} };
  const controls = [{ disabled: false }, { disabled: false }];
  const listeners = new Map<string, () => void>();
  const stored = new Map<string, string>();
  const doc = {
    visibilityState: 'visible',
    getElementById: (id: string) => id === 'connection-status' ? status : null,
    querySelectorAll: () => controls,
    addEventListener: (name: string, fn: () => void) => { listeners.set(name, fn); },
  };
  const fetch = async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { ok: true, json: async () => next };
  };
  const storage = {
    get length() { return stored.size; },
    key: (index: number) => [...stored.keys()].sort()[index] ?? null,
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  };
  const controller = createConnectionController({ fetch, doc, storage, instanceId: 'expected' });
  return { controller, status, controls, listeners, stored };
}

describe('connection controller', () => {
  it('recovers only after matching identity and disconnects on mismatch or transport failure', async () => {
    const h = harness([
      { ok: true, instanceId: 'expected' },
      { ok: true, instanceId: 'other' },
      new Error('offline'),
      { ok: true, instanceId: 'expected' },
    ]);

    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('connected');
    expect(h.status.hidden).toBe(true);
    expect(h.controls.every((control) => !control.disabled)).toBe(true);

    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('disconnected');
    expect(h.status.hidden).toBe(false);
    expect(h.status.textContent).toContain('different local server');
    expect(h.controls.every((control) => control.disabled)).toBe(true);
    h.controls.push({ disabled: false });
    h.controller.refreshControls();
    expect(h.controls.every((control) => control.disabled)).toBe(true);

    await h.controller.checkHealth();
    expect(h.status.textContent).toContain('cannot be reached');

    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('connected');
    expect(h.status.hidden).toBe(true);
  });

  it('fails closed when a page identity cannot be verified by health', async () => {
    const h = harness([{ ok: true }]);
    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('disconnected');
    expect(h.status.hidden).toBe(false);
    expect(h.status.textContent).toContain('cannot verify');
    expect(h.controls.every((control) => control.disabled)).toBe(true);
  });

  it('keeps a verified read-only server visible and disables mutations', async () => {
    const h = harness([{
      ok: true, instanceId: 'expected', sessionWriter: 'read_only',
      sessionWriterReason: 'session_writer_lost',
    }]);
    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('disconnected');
    expect(h.status.hidden).toBe(false);
    expect(h.status.textContent).toContain('read-only');
    expect(h.status.textContent).toContain('Close the other server');
    expect(h.controls.every((control) => control.disabled)).toBe(true);
  });

  it('gives recovery guidance when writer ownership cannot be verified', async () => {
    const h = harness([{
      ok: true, instanceId: 'expected', sessionWriter: 'read_only',
      sessionWriterReason: 'session_writer_unavailable',
    }]);
    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('disconnected');
    expect(h.status.textContent).toContain('cannot be verified');
    expect(h.status.textContent).toContain('profile/session-writer.json');
    expect(h.controls.every((control) => control.disabled)).toBe(true);
  });

  it('checks health when a hidden page becomes visible', async () => {
    const h = harness([{ ok: true, instanceId: 'expected' }]);
    h.listeners.get('visibilitychange')?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.controller.state()).toBe('connected');
  });

  it('disconnects only for rejected mutation transport, not HTTP responses or read failures', async () => {
    const rejected = harness([new Error('offline'), new Error('offline')]);
    await expect(rejected.controller.guardedFetch('/api/cards', { method: 'POST', body: '{"query":"x"}' })).rejects.toThrow('offline');
    expect(rejected.controller.state()).toBe('disconnected');
    expect([...rejected.stored.values()][0]).toContain('"url":"/api/cards"');
    expect(rejected.status.textContent).toContain('were not replayed');
    expect(rejected.status.textContent).toContain('{"query":"x"}');

    const read = harness([new Error('offline')]);
    await expect(read.controller.guardedFetch('/api/cards')).rejects.toThrow('offline');
    expect(read.controller.state()).toBe('unverified');

    const response = harness([{ ok: false, error: 'validation' }]);
    await expect(response.controller.guardedFetch('/api/card/edit', { method: 'POST' })).resolves.toBeTruthy();
    expect(response.controller.state()).toBe('unverified');
    expect(response.stored.size).toBe(0);
  });

  it('retains an unknown payload after health recovery without replaying it', async () => {
    const h = harness([new Error('offline'), { ok: true, instanceId: 'expected' }]);
    await expect(h.controller.guardedFetch('/api/session/grade', { method: 'POST', body: '{"rating":3}' })).rejects.toThrow();
    expect(h.stored.size).toBe(1);
    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('connected');
    expect(h.status.hidden).toBe(false);
    expect(h.status.textContent).toContain('were not replayed');
    expect(h.status.textContent).toContain('{"rating":3}');
    expect(h.stored.size).toBe(1);
  });

  it('never sends a mutation while disconnected from an unreachable or mismatched server', async () => {
    const h = harness([{ ok: true, instanceId: 'other' }, { ok: true, instanceId: 'expected' }]);
    await h.controller.checkHealth();
    const original = '{"body":"original unknown request"}';
    h.stored.set('mergelearn:pending-mutation:v1:POST:/api/session/grade', original);
    await expect(h.controller.guardedFetch('/api/session/grade', { method: 'POST' })).rejects.toThrow('disconnected');
    expect(h.stored.size).toBe(1);
    expect(h.stored.get('mergelearn:pending-mutation:v1:POST:/api/session/grade')).toBe(original);
    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('connected');
  });

  it('rediscovers a persisted unknown payload after page reload', async () => {
    const stored = new Map([['mergelearn:pending-mutation:v1:POST:/api/card/edit', '{"body":"kept"}']]);
    const status: FakeStatus = { hidden: true, textContent: '', dataset: {} };
    const storage = {
      get length() { return stored.size; },
      key: (index: number) => [...stored.keys()][index] ?? null,
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
    };
    const controller = createConnectionController({
      fetch: async () => ({ ok: true, json: async () => ({ ok: true, instanceId: 'expected' }) }),
      doc: { visibilityState: 'visible', getElementById: () => status, querySelectorAll: () => [], addEventListener: () => undefined },
      storage,
      instanceId: 'expected',
    });
    await controller.checkHealth();
    expect(controller.state()).toBe('connected');
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain('kept');
    expect(stored.size).toBe(1);
  });

  it('keeps mismatch guidance and pre-disabled controls across refreshes', async () => {
    const h = harness([{ ok: true, instanceId: 'other' }]);
    h.controls[0]!.disabled = true;
    await h.controller.checkHealth();
    h.controller.refreshControls();
    expect(h.status.textContent).toContain('different local server');
    expect(h.controls.every((control) => control.disabled)).toBe(true);

    h.controls.push({ disabled: false });
    h.controller.refreshControls();
    expect(h.controls.every((control) => control.disabled)).toBe(true);
  });

  it('does not re-enable mutation controls while a mutation is in flight', async () => {
    let resolveMutation!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const status: FakeStatus = { hidden: true, textContent: '', dataset: {} };
    const controls = [{ disabled: true }];
    const controller = createConnectionController({
      fetch: async (input) => {
        if (input === '/health') return { ok: true, json: async () => ({ ok: true, instanceId: 'expected' }) };
        return new Promise((resolve) => { resolveMutation = resolve; });
      },
      doc: {
        visibilityState: 'visible',
        getElementById: () => status,
        querySelectorAll: () => controls,
        addEventListener: () => undefined,
      },
      storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
      instanceId: 'expected',
    });

    const mutation = controller.guardedFetch('/api/card/edit', { method: 'POST', body: '{}' });
    await controller.checkHealth();
    expect(controls[0]!.disabled).toBe(true);

    resolveMutation({ ok: true, json: async () => ({ ok: true }) });
    await mutation;
    controller.refreshControls();
    expect(controls[0]!.disabled).toBe(false);
  });

  it('surfaces every pending mutation path and clears only the responding path', async () => {
    const h = harness([new Error('offline'), new Error('offline'), { ok: false }]);
    await expect(h.controller.guardedFetch('/api/card/edit', { method: 'POST', body: 'edit-body' })).rejects.toThrow();
    h.controller.transportFailed();
    await h.controller.checkHealth();
    expect(h.controller.state()).toBe('disconnected');
    h.controls.forEach((control) => { control.disabled = false; });
    const second = harness([new Error('offline')]);
    await expect(second.controller.guardedFetch('/api/session/grade', { method: 'POST', body: 'grade-body' })).rejects.toThrow();
    second.stored.forEach((value, key) => h.stored.set(key, value));

    const status: FakeStatus = { hidden: true, textContent: '', dataset: {} };
    const storage = {
      get length() { return h.stored.size; },
      key: (index: number) => [...h.stored.keys()].sort()[index] ?? null,
      getItem: (key: string) => h.stored.get(key) ?? null,
      setItem: (key: string, value: string) => { h.stored.set(key, value); },
      removeItem: (key: string) => { h.stored.delete(key); },
    };
    const controller = createConnectionController({
      fetch: async () => ({ ok: true, json: async () => ({ ok: true, instanceId: 'expected' }) }),
      doc: { visibilityState: 'visible', getElementById: () => status, querySelectorAll: () => [], addEventListener: () => undefined },
      storage,
      instanceId: 'expected',
    });
    await controller.checkHealth();
    expect(status.textContent).toContain('edit-body');
    expect(status.textContent).toContain('grade-body');
  });
});