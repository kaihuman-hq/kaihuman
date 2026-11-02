import type { Slug, Ulid } from '../ids.js';
import type { FileChanges, TextChanges } from '../issue.js';
import {
  ATTACHMENT_MAX_BYTES,
  CONTRACT_EXTENSIONS,
  contractFilePath,
  contractPath,
} from '../paths.js';
import { type Contract, KEY_ORDER } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateContract } from '../validate.js';
import type { Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

const refuse = (path: string, message: string) => ({
  ok: false as const,
  issues: [{ path, message }],
});

/**
 * Creates or replaces a contract; with `file`, the PDF goes into the same commit as
 * `clients/<slug>/contracts/<id>.pdf`. A file the contract no longer names is deleted.
 */
export const saveContract = (
  repo: BusinessRepo,
  contract: Contract,
  file?: Uint8Array,
): Result<{ changes: FileChanges; message: string }> => {
  let record = contract;
  if (contract.file !== undefined) {
    const dot = contract.file.lastIndexOf('.');
    const ext = dot < 0 ? '' : contract.file.slice(dot + 1).toLowerCase();
    if (!(CONTRACT_EXTENSIONS as readonly string[]).includes(ext)) {
      return refuse('file', 'Contract files must be PDF.');
    }
    record = { ...contract, file: `${contract.file.slice(0, dot)}.${ext}` };
  }
  if (file) {
    if (file.length > ATTACHMENT_MAX_BYTES)
      return refuse('file', 'Contract files can be up to 10 MB.');
    if (record.file !== `${record.id}.pdf`) {
      return refuse('file', `The contract file must be named ${record.id}.pdf.`);
    }
  }
  if (!repo.clients.some((c) => c.slug === record.client)) {
    return refuse('client', `unknown client "${record.client}"`);
  }
  const checked = validateContract(record);
  if (!checked.ok) return checked;
  const value = checked.value;

  const changes: FileChanges = {};
  const old = repo.contracts.find((c) => c.id === value.id);
  // A name with no bytes must be the file already stored, or the contract would point at nothing.
  if (!file && value.file !== undefined && old?.file !== value.file) {
    return refuse('file', 'Upload the contract file.');
  }
  if (old) {
    if (old.file !== undefined) {
      // Same name and no new bytes: the stored file stays. A re-upload overwrites it below.
      const kept = !file && old.file === value.file;
      // The file's bytes are not at hand here, so it cannot follow the contract to another client.
      if (kept && old.client !== value.client) {
        return refuse('client', 'Upload the contract file again to move it to another client.');
      }
      if (!kept) changes[contractFilePath(old.client, old.id)] = null;
    }
    if (old.client !== value.client) changes[contractPath(old.client, old.id)] = null;
  }
  changes[contractPath(value.client, value.id)] = stringifyYaml(value, KEY_ORDER.contract);
  if (file) changes[contractFilePath(value.client, value.id)] = file;
  return {
    ok: true,
    value: { changes, message: `business: contract ${value.title} for ${value.client}` },
  };
};

/** Removes the contract and its file in one commit. The retention warning is the caller's (see `retentionEnd`). */
export const deleteContract = (
  repo: BusinessRepo,
  client: Slug,
  id: Ulid,
): Result<{ changes: TextChanges; message: string }> => {
  const contract = repo.contracts.find((c) => c.client === client && c.id === id);
  if (!contract) return refuse('id', 'This contract does not exist any more.');
  const changes: TextChanges = { [contractPath(client, id)]: null };
  if (contract.file !== undefined) changes[contractFilePath(client, id)] = null;
  return {
    ok: true,
    value: { changes, message: `business: delete contract ${contract.title} for ${client}` },
  };
};
