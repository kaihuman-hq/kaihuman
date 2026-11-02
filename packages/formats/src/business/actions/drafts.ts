import type { FileChanges } from '../issue.js';
import { draftPath } from '../paths.js';
import { type Draft, KEY_ORDER } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateDraft } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

/**
 * The one draft writer. It creates `drafts/<id>.yaml` or replaces that draft; a draft that was
 * already issued is refused, so an issued document is never touched from here.
 */
export const saveDraft = (
  repo: BusinessRepo,
  draft: Draft,
): Result<{ changes: FileChanges; message: string }> => {
  if (!repo.clients.some((c) => c.slug === draft.client)) {
    return { ok: false, issues: [{ path: 'client', message: `unknown client "${draft.client}"` }] };
  }
  if (repo.issued.some((i) => i.doc.draft_id === draft.id)) {
    return { ok: false, issues: [{ path: 'id', message: 'This draft was already issued.' }] };
  }
  const checked = validateDraft(draft);
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: { [draftPath(draft.id)]: stringifyYaml(checked.value, KEY_ORDER.draft) },
      message: `business: save draft ${draft.id} for ${draft.client}`,
    },
  };
};
