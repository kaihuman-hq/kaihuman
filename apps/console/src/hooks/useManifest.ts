import { useEffect } from 'preact/hooks';

/**
 * Temporarily swaps <link rel="manifest"> to point at a page-specific manifest
 * while the component is mounted. This lets iOS read the correct start_url when
 * the user taps "Add to Home Screen" from a quick page, ensuring each shortcut
 * launches to its own URL instead of the main app's start_url ("/").
 *
 * Restores the original manifest href on unmount.
 */
export function useManifest(href: string): void {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const original = link.href;
    link.href = href;
    return () => {
      link.href = original;
    };
  }, [href]);
}
