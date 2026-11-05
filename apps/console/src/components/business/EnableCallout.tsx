export function EnableCallout() {
  return (
    <div class="border border-[var(--los-border)] p-4 max-w-xl text-xs space-y-3">
      <p>
        Business tracking keeps clients, time, invoices and offers as plain files in your
        repository. Nothing is stored anywhere else.
      </p>
      <p>Enabling it adds one setup commit; after that these pages only read your data.</p>
      <a
        href="/business/enable"
        class="inline-block px-3 py-1.5 bg-[var(--los-accent)] text-black font-bold hover:opacity-90"
      >
        Enable business
      </a>
    </div>
  );
}
