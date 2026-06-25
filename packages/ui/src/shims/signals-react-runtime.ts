// Preact bridge for @preact/signals-react/runtime.
//
// Cascivo's compiled output calls `useSignals()` from the React signals adapter
// to opt components into signal tracking. Under Preact, `@preact/signals`
// installs auto-tracking into Preact's option hooks, so no per-component opt-in
// is needed — `useSignals` becomes a no-op returning the effect-store shape the
// adapter's callers expect (`.f()` finalizer).
export function useSignals(): { f: () => void } {
  return { f: () => {} };
}
