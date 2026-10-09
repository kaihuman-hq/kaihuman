/**
 * What a built extension must look like before it goes to a store. Kept apart from the packaging
 * script so the checks are testable without a build.
 */

/** Files in `dist/` that are build bookkeeping, not part of the extension. */
export const EXCLUDED_FROM_PACKAGE = ['.vite/*'];

/**
 * Everything wrong with `manifest` (the built `dist/manifest.json`) for a release of `version`.
 * Empty when it is fine to ship.
 *
 * @param {Record<string, any>} manifest
 * @param {string} version
 * @returns {string[]}
 */
export function releaseProblems(manifest, version) {
  const problems = [];
  if (manifest.version !== version) {
    problems.push(`manifest version ${manifest.version} is not package.json's ${version}`);
  }
  if (!/^\d+(\.\d+){0,3}$/.test(version)) {
    problems.push(`${version} is not a version Chrome accepts (1 to 4 dot-separated integers)`);
  }
  // The store review treats standing access to every site as a broad permission; the extension
  // only asks for it optionally (see the README's Permissions section).
  if ((manifest.host_permissions ?? []).includes('<all_urls>')) {
    problems.push('host_permissions include <all_urls>');
  }
  for (const script of manifest.content_scripts ?? []) {
    if (
      (script.matches ?? []).some((match) => match === '<all_urls>' || match.startsWith('*://*/'))
    ) {
      problems.push(`a content script runs on every site: ${script.matches.join(', ')}`);
    }
  }
  if (manifest.key) problems.push('the manifest carries a "key", which the store rejects');
  return problems;
}
