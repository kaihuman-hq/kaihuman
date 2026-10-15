/** Which on-device AI features may run, one switch per surface, plus the user's inbox labels. */
export const AI_SETTINGS_KEY = 'aiSettings';

const MAX_INBOX_LABELS = 6;

export interface InboxLabel {
  name: string;
  hint: string;
  mute: boolean;
}

export interface AiSettings {
  newTab: boolean;
  enrichment: boolean;
  sidePanel: boolean;
  palette: boolean;
  tabs: boolean;
  inboxLabels: InboxLabel[];
}

const DEFAULTS: AiSettings = {
  newTab: true,
  enrichment: true,
  sidePanel: true,
  palette: true,
  tabs: true,
  inboxLabels: [],
};

export async function readAiSettings(): Promise<AiSettings> {
  const data = await chrome.storage.local.get(AI_SETTINGS_KEY);
  const stored = data[AI_SETTINGS_KEY];
  const merged: AiSettings = {
    ...DEFAULTS,
    ...(typeof stored === 'object' && stored !== null ? (stored as Partial<AiSettings>) : {}),
  };
  const labels = Array.isArray(merged.inboxLabels) ? merged.inboxLabels : [];
  return { ...merged, inboxLabels: labels.slice(0, MAX_INBOX_LABELS) };
}

// Read-modify-write on one storage key: writes are chained so two quick toggles both land.
let writing: Promise<void> = Promise.resolve();

export function writeAiSettings(patch: Partial<AiSettings>): Promise<void> {
  const write = writing.then(async () => {
    const next = { ...(await readAiSettings()), ...patch };
    next.inboxLabels = next.inboxLabels.slice(0, MAX_INBOX_LABELS);
    await chrome.storage.local.set({ [AI_SETTINGS_KEY]: next });
  });
  writing = write.catch(() => {});
  return write;
}
