import { StatusBar } from '@kaihuman/ui';
import type { ComponentChildren } from 'preact';
import { route } from 'preact-router';
import { enableErrorMessage } from '../../lib/business/enable-form';
import { PublicRepoError } from '../../lib/business/errors';
import { businessNotice } from '../../lib/business/notice';
import type { BusinessState } from '../../lib/business/use-business-repo';
import { BusinessNav, type BusinessSection } from './BusinessNav';
import { EnableCallout } from './EnableCallout';

const note = 'p-6 text-[var(--los-muted)] text-sm font-mono';

/** Page frame and the non-ready states shared by the business pages. */
export function PageShell(props: {
  state: BusinessState;
  title: string;
  /** Show the business section nav with this section current. */
  section?: BusinessSection;
  children: (state: Extract<BusinessState, { status: 'ready' }>) => ComponentChildren;
}) {
  const { state } = props;
  return (
    <>
      <div class="h-[calc(100vh-2rem)] overflow-y-auto p-4 pb-24 font-mono text-[var(--los-fg)]">
        <div class="max-w-5xl mx-auto space-y-4">
          <h1 class="text-base font-bold">{props.title}</h1>
          {props.section && state.status === 'ready' && <BusinessNav current={props.section} />}
          {businessNotice.value && (
            <output class="flex flex-wrap items-start gap-2 border border-[var(--los-accent)] rounded p-2 text-xs">
              <p class="min-w-0 flex-1 break-words">{businessNotice.value.text}</p>
              <button
                type="button"
                class="text-[var(--los-accent)] hover:underline"
                onClick={() => {
                  businessNotice.value = null;
                }}
              >
                Dismiss
              </button>
            </output>
          )}
          {state.status === 'no-repo' && <p class={note}>Select a repository</p>}
          {state.status === 'loading' && (
            <p class={`${note} animate-pulse`}>Loading business data...</p>
          )}
          {state.status === 'disabled' && <EnableCallout />}
          {state.status === 'error' && (
            <p role="alert" class="text-xs text-[var(--los-warning)]">
              {state.message}
            </p>
          )}
          {state.status === 'ready' && state.repo.private !== true && (
            <p role="alert" class="text-xs text-[var(--los-warning)]">
              {enableErrorMessage(new PublicRepoError(state.repo.full_name))}
            </p>
          )}
          {state.status === 'ready' && props.children(state)}
        </div>
      </div>
      <StatusBar
        mode="BUSINESS"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/stream')}
        onWikiClick={() => route('/wiki')}
      />
    </>
  );
}
