import type { Slug } from '../ids.js';
import type { TextChanges } from '../issue.js';
import { clientDir } from '../paths.js';
import { type ClientStage, KEY_ORDER } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateClient } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

/** Moves a client to another pipeline stage by rewriting `client.yaml` in `KEY_ORDER`. */
export const setClientStage = (
  repo: BusinessRepo,
  slug: Slug,
  stage: ClientStage,
): Result<{ changes: TextChanges; message: string }> => {
  const client = repo.clients.find((c) => c.slug === slug);
  if (!client)
    return { ok: false, issues: [{ path: 'client', message: `unknown client "${slug}"` }] };
  if (client.stage === stage) {
    return { ok: false, issues: [{ path: 'stage', message: `${slug} is already ${stage}.` }] };
  }
  // The slug is the folder name, not a key in the file.
  const { slug: _slug, ...body } = { ...client, stage };
  const checked = validateClient(body, slug);
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: { [`${clientDir(slug)}/client.yaml`]: stringifyYaml(body, KEY_ORDER.client) },
      message: `business: ${slug} → ${stage}`,
    },
  };
};
