export type ConnectionState = 'unverified' | 'connected' | 'disconnected';

type HealthResponse = { ok: boolean; json: () => Promise<unknown> };
type StatusNode = { hidden: boolean; textContent: string | null; dataset?: Record<string, string> };
type MutationControl = { disabled: boolean };
type ConnectionStorage = {
  readonly length?: number;
  key?: (index: number) => string | null;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};
type ConnectionDocument = {
  visibilityState?: string;
  getElementById: (id: string) => StatusNode | null;
  querySelectorAll: (selector: string) => ArrayLike<MutationControl>;
  addEventListener: (name: string, listener: () => void) => void;
};

export type ConnectionController = {
  state: () => ConnectionState;
  checkHealth: () => Promise<ConnectionState>;
  transportFailed: () => void;
  guardedFetch: (input: string, init?: { cache?: string; method?: string; body?: unknown }) => Promise<HealthResponse>;
  refreshControls: () => void;
};

/**
 * Self-contained so the server can serialize this exact factory into the page
 * shell. Keep all runtime helpers and copy inside the function body.
 */
export function createConnectionController(deps: {
  fetch: (input: string, init?: { cache?: string }) => Promise<HealthResponse>;
  doc: ConnectionDocument;
  storage: ConnectionStorage;
  instanceId: string;
}): ConnectionController {
  var current: ConnectionState = 'unverified';
  var pendingTexts: string[] = [];
  var currentMessage = '';
  var activeMutations = 0;

  function restorePending(): void {
    pendingTexts = [];
    if (!deps.storage.key || !deps.storage.length) return;
    var keys: string[] = [];
    for (var index = 0; index < deps.storage.length; index++) {
      var key = deps.storage.key(index);
      if (key && key.indexOf('mergelearn:pending-mutation:v1:') === 0) keys.push(key);
    }
    keys.sort();
    keys.forEach(function (key) {
      try { var text = deps.storage.getItem(key); if (text) pendingTexts.push(text); } catch { /* storage is advisory */ }
    });
  }

  function mutationKey(input: string, method: string): string {
    var path = input;
    try { path = new URL(input, 'http://local').pathname; } catch { /* retain input */ }
    return 'mergelearn:pending-mutation:v1:' + method + ':' + path;
  }

  function recoveryCopy(): string {
    if (!pendingTexts.length) return '';
    var payloads = pendingTexts.map(function (text) {
      try { var parsed = JSON.parse(text) as { body?: unknown }; return typeof parsed.body === 'string' ? parsed.body : text; } catch { return text; }
    });
    return ' Previous requests were not replayed. Copy saved payloads before retrying: ' + payloads.join('\n');
  }

  function controls(): MutationControl[] {
    return Array.prototype.slice.call(deps.doc.querySelectorAll('[data-server-mutation]')) as MutationControl[];
  }

  function render(next: ConnectionState, message?: string): ConnectionState {
    current = next;
    if (message) currentMessage = message;
    var status = deps.doc.getElementById('connection-status');
    var disconnected = next === 'disconnected';
    controls().forEach(function (control) {
      if (disconnected) {
        control.disabled = true;
      } else if (activeMutations === 0) {
        control.disabled = false;
      }
    });
    if (status) {
      status.hidden = !disconnected;
      status.textContent = disconnected
        ? (message || currentMessage || 'The local server cannot be reached. Your unsent work is still available.') + recoveryCopy()
        : recoveryCopy().trim();
      status.hidden = !disconnected && !pendingTexts.length;
      if (status.dataset) status.dataset.state = next;
    }
    return current;
  }

  async function checkHealth(): Promise<ConnectionState> {
    try {
      var response = await deps.fetch('/health', { cache: 'no-store' });
      var body = await response.json() as {
        ok?: boolean; instanceId?: string; sessionWriter?: string; sessionWriterReason?: string;
      };
      if (!response.ok || body.ok !== true) {
        return render('disconnected', 'The local server cannot be reached. Your unsent work is still available.');
      }
      if (!deps.instanceId) return render('unverified');
      if (!body.instanceId) return render('disconnected', 'This tab cannot verify the current local server. Reload it from the current MergeLearn URL.');
      if (body.instanceId !== deps.instanceId) {
        return render('disconnected', 'This tab belongs to a different local server. Reload it from the current MergeLearn URL.');
      }
      if (body.sessionWriter === 'read_only') {
        if (body.sessionWriterReason === 'session_writer_unavailable') {
          return render('disconnected', 'MergeLearn is read-only because writer ownership cannot be verified. Inspect profile/session-writer.json, stop any stale process, then restart MergeLearn. Your saved work remains on disk.');
        }
        return render('disconnected', 'MergeLearn is read-only because another local server owns session writes. Close the other server, then reload this page. Your saved work remains on disk.');
      }
      return render('connected');
    } catch {
      return render('disconnected', 'The local server cannot be reached. Your unsent work is still available.');
    }
  }

  function transportFailed(): void {
    render('disconnected', 'The local server cannot be reached. Your unsent work is still available.');
  }

  async function guardedFetch(input: string, init?: { cache?: string; method?: string; body?: unknown }): Promise<HealthResponse> {
    var method = String(init?.method || 'GET').toUpperCase();
    var mutating = method !== 'GET' && method !== 'HEAD';
    var key = mutating ? mutationKey(input, method) : null;
    if (mutating && current === 'disconnected') {
      render('disconnected');
      throw new Error('local server is disconnected');
    }
    if (key) {
      var payload = JSON.stringify({ version: 1, method: method, url: input, body: init?.body ?? null });
      try { deps.storage.setItem(key, payload); } catch { /* storage is advisory */ }
      restorePending();
      if (!pendingTexts.includes(payload)) pendingTexts.push(payload);
    }
    if (mutating) activeMutations++;
    try {
      var response = await deps.fetch(input, init);
      if (mutating) activeMutations--;
      if (key) {
        try { deps.storage.removeItem(key); } catch { /* storage is advisory */ }
        restorePending();
      }
      return response;
    } catch (error) {
      if (mutating) activeMutations--;
      if (mutating) transportFailed();
      throw error;
    }
  }

  function refreshControls(): void {
    render(current);
  }

  deps.doc.addEventListener('visibilitychange', function () {
    if (deps.doc.visibilityState === 'visible') void checkHealth();
  });
  restorePending();

  return {
    state: function () { return current; }, checkHealth: checkHealth,
    transportFailed: transportFailed, guardedFetch: guardedFetch, refreshControls: refreshControls,
  };
}
