import { useEffect, useState } from 'preact/hooks';
import { availability as capability, downloadTranslationPacks } from '../background/ai/model.js';
import {
  type AiSettings,
  type InboxLabel,
  readAiSettings,
  writeAiSettings,
} from '../background/ai/settings.js';
import {
  downloadModel,
  type ModelAvailability,
  modelAvailability,
} from '../background/work/suggest.js';
import { WORK_KEYS, type WorkUi } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { errorText, field, primary, quiet } from './controls.js';
import { updateWorkUi } from './useWorkState.js';

const STATUS: Record<ModelAvailability, string> = {
  available: "Chrome's on-device model suggests a stream and labels for each item.",
  downloadable:
    "Chrome's on-device model is not downloaded yet. Until it is, suggestions only follow the repositories already in your streams.",
  downloading: 'Chrome is downloading its on-device model.',
  unavailable:
    "Chrome's on-device model is not available on this device, so suggestions only follow the repositories already in your streams.",
};

function Toggle({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label class="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        class="mt-0.5 accent-nt-primary"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span class="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint && <span class="text-nt-faint">{hint}</span>}
      </span>
    </label>
  );
}

/** The model's state, its download, and what suggestions may do on their own. */
function SuggestionSettings({ ui }: { ui: WorkUi }) {
  const [availability, setAvailability] = useState<ModelAvailability>();
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    void modelAvailability().then((state) => {
      if (live) setAvailability(state);
    });
    return () => {
      live = false;
    };
  }, []);

  const [packs, setPacks] = useState<ModelAvailability>();
  const [packsBusy, setPacksBusy] = useState(false);

  useEffect(() => {
    let live = true;
    void capability('translator').then((state) => {
      if (live) setPacks(state);
    });
    return () => {
      live = false;
    };
  }, []);

  const downloadPacks = () => {
    setError(undefined);
    setPacksBusy(true);
    // Called straight from the click: Translator.create needs its user activation.
    downloadTranslationPacks().then(
      () => {
        setPacksBusy(false);
        setPacks('available');
      },
      (failure) => {
        setPacksBusy(false);
        setError(errorText(failure));
      },
    );
  };

  const download = () => {
    setError(undefined);
    setProgress(0);
    // Called straight from the click: Chrome only starts the download from one.
    downloadModel(setProgress).then(
      () => {
        setProgress(undefined);
        setAvailability('available');
      },
      (failure) => {
        setProgress(undefined);
        setError(errorText(failure));
      },
    );
  };

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-[12px] font-bold">On-device AI</h2>
      {availability && <p class="text-nt-muted">{STATUS[availability]}</p>}
      {progress !== undefined ? (
        <output class="text-nt-muted">Downloading the model… {Math.round(progress * 100)}%</output>
      ) : (
        (availability === 'downloadable' || availability === 'downloading') && (
          <button type="button" class={`${quiet} self-start`} onClick={download}>
            Download the model
          </button>
        )
      )}
      {packs && packs !== 'unavailable' && packs !== 'available' && (
        <button
          type="button"
          class={`${quiet} self-start`}
          disabled={packsBusy}
          onClick={downloadPacks}
        >
          {packsBusy ? 'Downloading English ↔ German…' : 'Download English ↔ German'}
        </button>
      )}
      {error && <p class="text-nt-prod [overflow-wrap:anywhere]">{error}</p>}
      <Toggle
        checked={ui.autoFile !== false}
        label="File pins from the shortcut and the right-click menu into the suggested stream"
        hint="Off: they go to the last stream used."
        onChange={(on) => void updateWorkUi({ autoFile: on })}
      />
      <Toggle
        checked={ui.autoFileInbox === true}
        label="File new Waiting-on-you items into their suggested streams"
        hint="Filed items leave the inbox and the badge count; their status shows in the stream."
        onChange={(on) => void updateWorkUi({ autoFileInbox: on })}
      />
      <AiGroupSettings />
    </div>
  );
}

type AiGroup = keyof Omit<AiSettings, 'inboxLabels'>;

const AI_GROUPS: [AiGroup, string][] = [
  ['newTab', 'Rank and summarize on the new tab page'],
  ['enrichment', 'Suggest when saving'],
  ['sidePanel', 'Triage in the side panel'],
  ['palette', 'Palette actions'],
  ['tabs', 'Tidy tabs'],
];

/** One switch per surface the model may work on. */
function AiGroupSettings() {
  const [settings, setSettings] = useState<AiSettings>();

  useEffect(() => {
    let live = true;
    void readAiSettings().then((stored) => {
      if (live) setSettings(stored);
    });
    return () => {
      live = false;
    };
  }, []);

  // Shown once read, so a switch never flips from its default to the stored value under the user.
  if (!settings) return null;
  return (
    <>
      {AI_GROUPS.map(([group, label]) => (
        <Toggle
          key={group}
          checked={settings[group]}
          label={label}
          onChange={(on) => {
            setSettings((current) => current && { ...current, [group]: on });
            void writeAiSettings({ [group]: on });
          }}
        />
      ))}
      <LabelSettings initial={settings.inboxLabels} />
    </>
  );
}

const MAX_LABELS = 6;

/**
 * The user's own inbox labels. Drafts stay here while typed; only those with a name are saved, so
 * the worker never labels with an empty name.
 */
function LabelSettings({ initial }: { initial: InboxLabel[] }) {
  const [drafts, setDrafts] = useState<InboxLabel[]>(initial);
  const change = (next: InboxLabel[]) => {
    setDrafts(next);
    const named = next.map((l) => ({ ...l, name: l.name.trim() })).filter((l) => l.name !== '');
    void writeAiSettings({ inboxLabels: named });
  };
  const edit = (index: number, patch: Partial<InboxLabel>) =>
    change(drafts.map((label, i) => (i === index ? { ...label, ...patch } : label)));
  return (
    <div class="flex flex-col gap-2">
      <h3 class="text-[12px] font-bold">Inbox labels</h3>
      <p class="text-nt-faint">
        Name a label and say what belongs in it. The model sorts the inbox into your labels.
      </p>
      {drafts.map((label, index) => (
        <div key={index} class="flex flex-col gap-1">
          <div class="flex gap-1.5">
            <input
              class={`${field} w-28`}
              aria-label={`Label ${index + 1} name`}
              placeholder="Name"
              value={label.name}
              onInput={(event) => edit(index, { name: event.currentTarget.value })}
            />
            <input
              class={`${field} min-w-0 flex-1`}
              aria-label={`Label ${index + 1} hint`}
              placeholder="What goes in it"
              value={label.hint}
              onInput={(event) => edit(index, { hint: event.currentTarget.value })}
            />
            <button
              type="button"
              class={quiet}
              aria-label={`Remove label ${index + 1}`}
              onClick={() => change(drafts.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </div>
          <Toggle
            checked={label.mute}
            label="Mute: hide from the inbox and the badge count"
            onChange={(on) => edit(index, { mute: on })}
          />
        </div>
      ))}
      {drafts.length < MAX_LABELS && (
        <button
          type="button"
          class={`${quiet} self-start`}
          onClick={() => setDrafts([...drafts, { name: '', hint: '', mute: false }])}
        >
          Add a label
        </button>
      )}
    </div>
  );
}

export function WorkSettings({ ui }: { ui: WorkUi }) {
  return (
    <section
      aria-label="Settings"
      class="flex flex-col gap-4 border-b border-nt-divider bg-nt-row-hover px-3 py-3 text-[12px]"
    >
      <SuggestionSettings ui={ui} />
      <TokenSettings />
    </section>
  );
}

/** The work token is write-only here: only whether one exists is ever read back. */
function TokenSettings() {
  const [set, setSet] = useState(false);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    let live = true;
    void chrome.storage.local.get(WORK_KEYS.workToken).then((data) => {
      if (live) setSet(Boolean(data[WORK_KEYS.workToken]));
    });
    return () => {
      live = false;
    };
  }, []);

  const store = async (value: string) => {
    setError(undefined);
    try {
      await send({ type: 'WORK_SET_TOKEN', key: value });
      setSet(value !== '');
      setKey('');
    } catch (failure) {
      setError(errorText(failure));
    }
  };

  return (
    <div class="flex flex-col gap-2">
      <h2 class="text-[12px] font-bold">Work token</h2>
      <p class="text-nt-muted">
        {set ? 'A work token is set.' : 'No work token is set.'} A classic token with repo and
        notifications, for orgs that block the kaihuman app.
      </p>
      <form
        class="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (key.trim() !== '') void store(key.trim());
        }}
      >
        <input
          type="password"
          class={`${field} flex-1`}
          aria-label="Work token"
          placeholder="ghp_…"
          autocomplete="off"
          value={key}
          onInput={(event) => setKey(event.currentTarget.value)}
        />
        <button type="submit" class={primary} disabled={key.trim() === ''}>
          Save
        </button>
        <button type="button" class={quiet} disabled={!set} onClick={() => void store('')}>
          Remove
        </button>
      </form>
      {error && <p class="text-nt-prod [overflow-wrap:anywhere]">{error}</p>}
    </div>
  );
}
