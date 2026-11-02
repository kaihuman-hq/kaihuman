/** The branch moved while a commit was being built; the caller may re-read and retry. */
export class ConflictError extends Error {
  readonly name = 'ConflictError';
}
