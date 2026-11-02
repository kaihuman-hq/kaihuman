import type { ComponentChildren } from 'preact';
import { clientLinkSlug, WIKILINK_SCHEME } from './wiki-links';

interface WikiAnchorProps {
  href?: string;
  /** Page path a wikilink target points at, or null when there is none. */
  resolve: (target: string) => string | null;
  onOpenPage: (path: string) => void;
  onClientLink?: (slug: string) => void;
  children?: ComponentChildren;
}

const LINK = 'text-[#58a6ff] hover:underline';

/** The `a` of rendered wiki Markdown: plain links, `wiki:` links to pages and to client pages. */
export const WikiAnchor = ({
  href,
  resolve,
  onOpenPage,
  onClientLink,
  children,
}: WikiAnchorProps) => {
  if (!href?.startsWith(WIKILINK_SCHEME)) return <a href={href}>{children}</a>;

  const target = decodeURIComponent(href.slice(WIKILINK_SCHEME.length));
  if (target.startsWith('client:')) {
    const slug = clientLinkSlug(target);
    if (slug) {
      return (
        <a
          href={`/clients/${encodeURIComponent(slug)}`}
          className={LINK}
          onClick={(e: MouseEvent) => {
            // New-tab and middle clicks keep their browser meaning.
            if (
              !onClientLink ||
              e.defaultPrevented ||
              e.button !== 0 ||
              e.metaKey ||
              e.ctrlKey ||
              e.shiftKey ||
              e.altKey
            ) {
              return;
            }
            e.preventDefault();
            onClientLink(slug);
          }}
        >
          {children}
        </a>
      );
    }
  } else {
    const path = resolve(target);
    if (path) {
      return (
        <a
          href={`#${path}`}
          className={LINK}
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            onOpenPage(path);
          }}
        >
          {children}
        </a>
      );
    }
  }
  return (
    <span className="text-[#f85149] cursor-help" title={`No page for "${target}" yet`}>
      {children}
    </span>
  );
};
