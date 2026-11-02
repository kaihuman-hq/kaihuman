/** `DELETE /api/account`: removes everything the worker holds for the caller. */

import { deleteUserRows, fileTokens } from './db.js';
import { type Env, objectKey } from './env.js';
import { empty } from './respond.js';

/** R2 deletes at most 1000 keys per call. */
const R2_BATCH = 1000;

export async function deleteAccount(env: Env, userId: number): Promise<Response> {
  const keys = (await fileTokens(env.DB, userId)).map((token) => objectKey(userId, token));
  // Objects first: if a later step fails, the rows still list them and a retry finds them.
  // Revoked files' objects are already gone; R2 treats a missing key as deleted.
  for (let i = 0; i < keys.length; i += R2_BATCH) {
    await env.FILES.delete(keys.slice(i, i + R2_BATCH));
  }
  await deleteUserRows(env.DB, userId);
  return empty(204);
}
