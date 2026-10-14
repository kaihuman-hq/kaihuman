import { useEffect, useState } from 'preact/hooks';
import { WORK_KEYS } from '../background/work/types.js';
import { send } from '../palette/port.js';
import { errorText, field, primary, quiet } from './controls.js';

/** The work token is write-only here: only whether one exists is ever read back. */
export function WorkSettings() {
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
    <section
      aria-label="Settings"
      class="flex flex-col gap-2 border-b border-nt-divider bg-nt-row-hover px-3 py-3 text-[12px]"
    >
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
    </section>
  );
}
