/** The business sub-pages. The main console nav links to `/business`; this row links onward. */
export const BUSINESS_SECTIONS = [
  { href: '/business', label: 'Overview' },
  { href: '/clients', label: 'Clients' },
  { href: '/business/pipeline', label: 'Pipeline' },
  { href: '/business/invoices', label: 'Invoices' },
  { href: '/business/expenses', label: 'Expenses' },
  { href: '/business/shared', label: 'Shared files' },
] as const;

export type BusinessSection = (typeof BUSINESS_SECTIONS)[number]['href'];

export function BusinessNav({ current }: { current: BusinessSection }) {
  return (
    <nav aria-label="Business sections" class="border-b border-[var(--los-border)] -mt-2">
      <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {BUSINESS_SECTIONS.map((s) => (
          <li key={s.href}>
            <a
              href={s.href}
              aria-current={s.href === current ? 'page' : undefined}
              class={`inline-block py-2 border-b-2 -mb-px ${
                s.href === current
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)] font-bold'
                  : 'border-transparent text-[var(--los-fg-dim)] hover:text-[var(--los-fg)]'
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
