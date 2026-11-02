import { CLIENT_STAGES, type ClientStage } from '@kaihuman/formats/business';
import { useState } from 'preact/hooks';
import { hours, money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { todayLocal } from '../lib/business/dates';
import { clientSummaries } from '../lib/business/overview';
import { useBusinessRepo } from '../lib/business/use-business-repo';

const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';

export function ClientsPage() {
  const state = useBusinessRepo();
  const [stage, setStage] = useState<ClientStage | 'all'>('all');
  return (
    <PageShell state={state} title="Clients">
      {({ data, loadErrors }) => {
        const all = clientSummaries(data, todayLocal());
        const shown = stage === 'all' ? all : all.filter((c) => c.stage === stage);
        return (
          <>
            {all.length === 0 ? (
              <p class="text-xs italic text-[var(--los-muted)]">
                No clients yet. Ask the agent to add one, or create{' '}
                <code>.kh/business/clients/&lt;slug&gt;/client.yaml</code>.
              </p>
            ) : (
              <>
                <fieldset class="flex flex-wrap gap-2 min-w-0">
                  <legend class="sr-only">Filter by stage</legend>
                  {(['all', ...CLIENT_STAGES] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={stage === s}
                      onClick={() => setStage(s)}
                      class={`px-2 py-1 border text-xs ${
                        stage === s
                          ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                          : 'border-[var(--los-border)] text-[var(--los-muted)]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </fieldset>
                {shown.length === 0 ? (
                  <p class="text-xs italic text-[var(--los-muted)]">No clients in this stage.</p>
                ) : (
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr>
                          <th class={th}>Name</th>
                          <th class={th}>Stage</th>
                          <th class={`${th} text-right`}>Billed this year</th>
                          <th class={`${th} text-right`}>Open</th>
                          <th class={`${th} text-right`}>Unbilled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((c) => (
                          <tr key={c.slug}>
                            <td class={td}>
                              <a
                                href={`/clients/${c.slug}`}
                                class="text-[var(--los-accent)] hover:underline"
                              >
                                {c.name}
                              </a>
                            </td>
                            <td class={td}>{c.stage}</td>
                            <td class={`${td} text-right whitespace-nowrap`}>
                              {money(c.billedThisYear, c.currency)}
                            </td>
                            <td class={`${td} text-right whitespace-nowrap`}>
                              {money(c.open, c.currency)}
                            </td>
                            <td class={`${td} text-right whitespace-nowrap`}>
                              {hours(c.unbilledMinutes)} h
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
            <ProblemsList findings={data.findings} loadErrors={loadErrors} />
          </>
        );
      }}
    </PageShell>
  );
}
