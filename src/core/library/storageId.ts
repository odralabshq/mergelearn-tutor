const STORAGE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function storageIdError(value: unknown): string | undefined {
  if (typeof value !== 'string' || !STORAGE_ID.test(value)) return 'must be 1-128 ASCII letters, digits, underscores, or hyphens';
  if (WINDOWS_RESERVED.test(value)) return 'is reserved on Windows';
  return undefined;
}

export function assertStorageId(value: unknown, label = 'storage id'): asserts value is string {
  const error = storageIdError(value);
  if (error) throw new Error(`${label} ${error}`);
}
