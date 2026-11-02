import type { Finding } from '@kaihuman/formats/business';
import { parseLoadError } from '../../lib/business/load';

/** Files that failed validation or could not be fetched. Cross-file checks are not included. */
export function ProblemsList(props: {
  findings: readonly Finding[];
  loadErrors: readonly string[];
}) {
  const loadErrors = props.loadErrors.map(parseLoadError);
  const files = new Set([...props.findings.map((f) => f.file), ...loadErrors.map((e) => e.path)]);
  if (files.size === 0) return null;
  return (
    <details class="border border-[var(--los-border)] p-3 text-xs">
      <summary class="cursor-pointer font-bold text-[var(--los-warning)]">
        {files.size === 1 ? '1 file has problems' : `${files.size} files have problems`}
      </summary>
      <ul class="mt-2 space-y-1">
        {props.findings.map((f) => (
          <li key={`${f.file}:${f.path}:${f.message}`} class="break-words">
            <span class="text-[var(--los-accent)]">{f.file}</span>
            {f.line !== undefined && `:${f.line}`} {f.path && `${f.path}: `}
            {f.message}
          </li>
        ))}
        {loadErrors.map(({ path, message }) => (
          <li key={`load:${path}:${message}`} class="break-words">
            <span class="text-[var(--los-accent)]">{path}</span>
            {message ? `: ${message}` : ' could not be loaded.'}
          </li>
        ))}
      </ul>
    </details>
  );
}
