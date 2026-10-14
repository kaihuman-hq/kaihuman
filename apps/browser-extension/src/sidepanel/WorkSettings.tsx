import { useEffect, useState } from 'preact/hooks';
import { WORK_KEYS } from '../background/work/types.js';
import { send } from '../palette/port.js';

/** The work token is write-only here: only whether one exists is ever read back. */
export function WorkSettings() {
  const [open, setOpen] = useState(false);
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
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <section class="flex flex-col gap-2 border-t border-[#222] pt-2">
      <button
        type="button"
        class="text-left text-[13px] font-bold"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Settings
      </button>
      {open && (
        <div class="flex flex-col gap-2 text-[13px]">
          <p class="text-[#999]">{set ? 'A work token is set.' : 'No work token is set.'}</p>
          <input
            type="password"
            class="bg-[#111] px-2 py-1"
            aria-label="Work token"
            autocomplete="off"
            value={key}
            onInput={(event) => setKey(event.currentTarget.value)}
          />
          <p class="text-[12px] text-[#999]">
            A classic token with repo and notifications, for orgs that block the kaihuman app.
          </p>
          <div class="flex gap-2">
            <button
              type="button"
              class="border border-[#333] px-2"
              disabled={key.trim() === ''}
              onClick={() => void store(key.trim())}
            >
              Save
            </button>
            <button
              type="button"
              class="border border-[#333] px-2 disabled:opacity-40"
              disabled={!set}
              onClick={() => void store('')}
            >
              Remove
            </button>
          </div>
          {error && <p class="text-red-400 text-[12px] break-words">{error}</p>}
        </div>
      )}
    </section>
  );
}
