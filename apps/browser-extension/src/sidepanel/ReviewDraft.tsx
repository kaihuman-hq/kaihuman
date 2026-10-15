import { useEffect, useState } from 'preact/hooks';
import type { ReviewRange } from '../background/ai/review.js';
import { send } from '../palette/port.js';
import { errorText, field, primary, quiet } from './controls.js';

const TITLES: Record<ReviewRange, string> = { standup: 'Standup', week: 'Week review' };

/** An action log entry is one line in the file; a second line would be lost on the next parse. */
const oneLine = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line !== '')
    .join('; ');

/** The draft under the header: editable, and written to the action log only on Save. */
export function ReviewDraft({ range, onClose }: { range: ReviewRange; onClose: () => void }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    setText(undefined);
    setError(undefined);
    setSaved(false);
    send({ type: 'REVIEW_DRAFT', range }).then(
      (response) => {
        if (live) setText(String(response?.text ?? ''));
      },
      (failure) => {
        if (live) setError(errorText(failure));
      },
    );
    return () => {
      live = false;
    };
  }, [range]);

  const save = () => {
    if (text === undefined) return;
    setSaving(true);
    setError(undefined);
    send({
      type: 'ADD_ACTION_LOG',
      description: oneLine(text),
      tags: [range === 'standup' ? 'standup' : 'review'],
    }).then(
      () => {
        setSaving(false);
        setSaved(true);
      },
      (failure) => {
        setSaving(false);
        setError(errorText(failure));
      },
    );
  };

  return (
    <section class="flex flex-col gap-2 border-b border-nt-divider px-3 py-3">
      <div class="flex items-center gap-2">
        <h2 class="flex-1 text-[12px] font-bold">{TITLES[range]}</h2>
        <button type="button" class={quiet} onClick={onClose}>
          Close
        </button>
      </div>
      {error && <p class="text-[12px] text-nt-prod">{error}</p>}
      {text === undefined && !error ? (
        <p class="text-[12px] text-nt-faint">Drafting…</p>
      ) : (
        text !== undefined && (
          <>
            <textarea
              class={`${field} min-h-32 w-full resize-y leading-5`}
              aria-label={`${TITLES[range]} draft`}
              value={text}
              onInput={(event) => {
                setText((event.currentTarget as HTMLTextAreaElement).value);
                setSaved(false);
              }}
            />
            <div class="flex items-center gap-2">
              <button
                type="button"
                class={primary}
                disabled={saving || saved || text.trim() === ''}
                onClick={save}
              >
                Save to action log
              </button>
              {saved && <span class="text-[12px] text-nt-muted">Saved</span>}
            </div>
          </>
        )
      )}
    </section>
  );
}
