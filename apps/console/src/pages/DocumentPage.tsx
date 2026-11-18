import { githubFileStore, githubService } from '@kaihuman/core';
import type { BusinessRepo, Finding } from '@kaihuman/formats/business';
import { useEffect, useState } from 'preact/hooks';
import { PRIMARY } from '../components/business/buttons';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import type { KBRepo } from '../lib/github-kb';

/** The print chunk (narro, remark, zod) loads only when a document is opened. */
const loadPrint = () => import('../lib/business/print');

type View =
  | { status: 'rendering' }
  | { status: 'ready'; html: string; title: string }
  | { status: 'problems'; findings: Finding[] }
  | { status: 'error'; message: string };

/** Repo files as bytes for images and the logo; only paths in the tree are fetched. */
const bytesReader = (target: KBRepo) => {
  const [owner = '', name = ''] = target.full_name.split('/');
  const cache = new Map<string, Promise<Uint8Array | null>>();
  return (path: string) => {
    let hit = cache.get(path);
    if (!hit) {
      const listed = githubFileStore.tree.peek().some((t) => t.type === 'blob' && t.path === path);
      hit = listed ? githubService.getFileBytes(owner, name, path) : Promise.resolve(null);
      cache.set(path, hit);
    }
    return hit;
  };
};

function DocumentView(props: {
  target: KBRepo;
  data: BusinessRepo;
  path: string;
  text: string | undefined;
}) {
  const { target, data, path, text } = props;
  const [view, setView] = useState<View>({ status: 'rendering' });
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    if (text === undefined || !data.profile) return;
    const profile = data.profile;
    let cancelled = false;
    setView({ status: 'rendering' });
    loadPrint()
      .then((m) => m.renderBusinessDocument(text, profile, data.clients, bytesReader(target)))
      .then((r) => {
        if (cancelled) return;
        setView(
          r.ok
            ? { status: 'ready', html: r.value.html, title: r.value.title }
            : {
                status: 'problems',
                findings: r.issues.map((i) => ({ ...i, file: path, level: 'error' as const })),
              },
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setView({ status: 'error', message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [text, data, path, target.full_name]);

  if (!data.profile) {
    return (
      <p class="text-xs text-[var(--los-warning)]">
        business.yaml has problems; documents take the sender from it.
      </p>
    );
  }
  if (text === undefined) {
    return <p class="text-xs text-[var(--los-warning)]">{path} could not be loaded.</p>;
  }
  if (view.status === 'rendering') {
    return <p class="text-xs text-[var(--los-muted)] animate-pulse">Rendering...</p>;
  }
  if (view.status === 'error') {
    return (
      <p role="alert" class="text-xs text-[var(--los-warning)]">
        Rendering failed: {view.message}
      </p>
    );
  }
  if (view.status === 'problems') {
    return <ProblemsList findings={view.findings} loadErrors={[]} />;
  }
  const html = view.html;
  return (
    <>
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class={PRIMARY}
          disabled={printing}
          onClick={() => {
            setPrinting(true);
            setPrintError(null);
            loadPrint()
              .then((m) => m.printHtml(html))
              .catch((e: unknown) => setPrintError(`Printing failed: ${String(e)}`))
              .finally(() => setPrinting(false));
          }}
        >
          Print / Save as PDF
        </button>
        <p class="text-[10px] text-[var(--los-fg-dim)]">
          In the print dialog choose “Save as PDF” and turn off the browser's headers and footers.
          Chromium browsers give the exact layout.
        </p>
        {printError && (
          <p role="alert" class="text-xs text-[var(--los-warning)]">
            {printError}
          </p>
        )}
      </div>
      <iframe
        title={`Preview: ${view.title}`}
        srcdoc={html}
        sandbox="allow-same-origin"
        class="w-full h-[80vh] border border-[var(--los-border)] bg-white"
      />
    </>
  );
}

export function DocumentPage({ slug }: { slug?: string }) {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title={`Document ${slug ?? ''}`} section="/business/documents">
      {({ data, contents, repo: target }) => {
        const doc = data.documents.find((d) => d.slug === slug);
        return (
          <>
            <p class="text-xs">
              <a href="/business/documents" class="text-[var(--los-accent)] hover:underline">
                Back to documents
              </a>
            </p>
            {doc ? (
              <>
                <p class="text-xs text-[var(--los-fg-dim)]">
                  <a href={`/files/${doc.path}`} class="text-[var(--los-accent)] hover:underline">
                    Edit {doc.path}
                  </a>
                  ; the preview follows each saved change.
                </p>
                <DocumentView
                  target={target}
                  data={data}
                  path={doc.path}
                  text={contents[doc.path]}
                />
              </>
            ) : (
              <p class="text-xs text-[var(--los-warning)]">No document "{slug}".</p>
            )}
          </>
        );
      }}
    </PageShell>
  );
}
