import { X } from 'lucide-preact';

interface KBCommandsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const COMMANDS = [
  {
    name: '/kb-ingest',
    description: 'Compile raw articles into wiki pages.',
    detail:
      'Reads files from .kh/raw/, extracts key concepts, creates or updates .kh/wiki/ pages with backlinks, updates .kh/index.kb.md, appends notes to .kh/log.md, then moves each file to .kh/raw/processed/. Run /kb-index afterwards.',
  },
  {
    name: '/kb-index',
    description: 'Build or rebuild the search index from all wiki pages.',
    detail:
      'Reads every page in .kh/wiki/, extracts title, tags, and key terms, then writes .kh/search.kb.json — an inverted index used by /kb-ask for fast, accurate retrieval. Run after every /kb-ingest. Safe to re-run at any time.',
  },
  {
    name: '/kb-lint',
    description: 'Audit and repair the knowledge base.',
    detail:
      'Checks for contradictions, orphaned pages, dead links, missing cross-references, and index drift. Auto-repairs where possible. Appends an audit/repair summary to .kh/log.md.',
  },
  {
    name: '/kb-ask <question>',
    description: 'Answer a question using the knowledge base.',
    detail:
      'If .kh/search.kb.json exists, tokenizes the question and ranks wiki pages by keyword match count, then reads the top 5. Falls back to .kh/index.kb.md if the index is missing. Returns an answer with citations.',
  },
  {
    name: '/kb-session',
    description: 'Summarize this Claude Code session and save it to the knowledge base.',
    detail:
      'Supports multiple repos: resolves target from ~/.claude/kb.json by matching current project name, falling back to a default. Use "/kb-session set-default owner/repo" to set the default, or "/kb-session set owner/repo" to map the current project to a specific repo. Install with the "Install /kb-session" button on the Knowledge Base page.',
  },
  {
    name: '/kb-agent-capture',
    description: 'Capture a note by driving the native kh-capture app via its automation server.',
    detail:
      'Experimental. Opens the kh-capture native window, types the note, submits, and asserts success — capture as an agent action, doubling as the app’s end-to-end acceptance test. Requires the app built with `native build -Dautomation=true`. Falls back to `cli capture` when automation is unavailable.',
  },
];

export function KBCommandsModal({ isOpen, onClose }: KBCommandsModalProps) {
  if (!isOpen) return null;

  return (
    <div class="fixed inset-0 z-[300] flex items-start justify-center pt-[10vh] px-4">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop dismiss */}
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div class="relative w-full max-w-2xl bg-[var(--los-bg)] border border-[var(--los-accent)] shadow-2xl rounded-md overflow-hidden flex flex-col max-h-[75vh]">
        <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--los-border)] shrink-0">
          <span class="text-sm font-bold text-[var(--los-fg)] font-mono">
            Knowledge Base Commands
          </span>
          <button
            type="button"
            onClick={onClose}
            class="text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div class="overflow-y-auto flex-1 p-4 flex flex-col gap-5">
          <div class="text-xs text-[var(--los-fg-dim)] font-mono leading-relaxed">
            <p class="font-bold text-[var(--los-fg)] mb-1">General flow</p>
            <ol class="list-decimal list-inside space-y-1">
              <li>
                Articles land in <code class="text-[var(--los-accent)]">.kh/raw/</code> via the
                browser extension or the "Add note" button.
              </li>
              <li>
                Run <code class="text-[var(--los-accent)]">/kb-ingest</code> to compile inbox
                articles into wiki pages and move them to processed.
              </li>
              <li>
                Run <code class="text-[var(--los-accent)]">/kb-index</code> to rebuild the search
                index from all wiki pages.
              </li>
              <li>
                Run <code class="text-[var(--los-accent)]">/kb-lint</code> periodically to fix
                orphans, dead links, and contradictions.
              </li>
              <li>
                Run <code class="text-[var(--los-accent)]">/kb-ask</code> to query the knowledge
                base by question.
              </li>
              <li>
                Run <code class="text-[var(--los-accent)]">/kb-session</code> at end of session to
                capture what was built.
              </li>
            </ol>
          </div>

          <div class="flex flex-col gap-3">
            {COMMANDS.map((cmd) => (
              <div
                key={cmd.name}
                class="p-3 border border-[var(--los-border)] rounded bg-[var(--los-bg-hover)]"
              >
                <p class="text-xs font-bold text-[var(--los-accent)] font-mono mb-1">{cmd.name}</p>
                <p class="text-xs text-[var(--los-fg)] font-mono mb-1">{cmd.description}</p>
                <p class="text-[11px] text-[var(--los-fg-dim)] font-mono">{cmd.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
