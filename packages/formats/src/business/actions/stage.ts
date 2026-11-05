import type { Slug } from '../ids.js';
import type { TextChanges } from '../issue.js';
import { clientDir } from '../paths.js';
import type { ClientStage } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateClient } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { editYaml, parseYaml } from '../yaml.js';

/**
 * Moves a client to another pipeline stage. `text` is the current `client.yaml`; only its `stage`
 * value changes, so comments and hand-made order survive.
 */
export const setClientStage = (
  repo: BusinessRepo,
  slug: Slug,
  stage: ClientStage,
  text: string,
): Result<{ changes: TextChanges; message: string }> => {
  const client = repo.clients.find((c) => c.slug === slug);
  if (!client)
    return { ok: false, issues: [{ path: 'client', message: `unknown client "${slug}"` }] };
  if (client.stage === stage) {
    return { ok: false, issues: [{ path: 'stage', message: `${slug} is already ${stage}.` }] };
  }
  const edited = editYaml(text, [{ path: ['stage'], value: stage }]);
  if (!edited.ok) return edited;
  const parsed = parseYaml(edited.value);
  const checked = parsed.ok ? validateClient(parsed.value, slug) : parsed;
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: { [`${clientDir(slug)}/client.yaml`]: edited.value },
      message: `business: ${slug} → ${stage}`,
    },
  };
};
