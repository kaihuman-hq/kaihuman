# Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full Karpathy-style LLM knowledge base to Lifosy — browser extension pins articles to `.kh/raw/`, the console scaffolds Claude Code slash commands into the repo, and auto-updates those commands when the console detects a version mismatch.

**Architecture:** The personal notes repo gets a `.kh/` folder (raw articles + compiled wiki + schema) and a `.claude/commands/` folder (three slash commands: `/kb-ingest`, `/kb-lint`, `/kb-ask`). The console scaffolds and auto-upgrades the commands via GitHub API. The browser extension writes articles as markdown with YAML frontmatter to `.kh/raw/`. Claude Code is the compilation engine — no CLI wrapper.

**Tech Stack:** TypeScript/Preact (console + extension), Vitest (tests), Octokit via `@lifosy/core`'s `githubService`, Chrome Extension MV3.

---

## File Map

### Created
| File | Responsibility |
|------|---------------|
| `apps/console/src/lib/kb-skills.ts` | Skill template strings, version constant, scaffold file map |
| `apps/console/src/lib/kb-skills.test.ts` | Tests for templates and scaffold map |
| `apps/console/src/lib/github-kb.ts` | GitHub API helpers: init check, scaffold, auto-update, list dirs |
| `apps/console/src/lib/github-kb.test.ts` | Tests for all github-kb functions |
| `apps/console/src/pages/KnowledgeBasePage.tsx` | KB UI: setup flow, inbox view, wiki view |
| `apps/browser-extension/src/content/extract.ts` | Pure `extractArticle(doc)` function — testable |
| `apps/browser-extension/src/content/extract.test.ts` | Tests for article extraction |

### Modified
| File | Change |
|------|--------|
| `apps/console/src/App.tsx` | Add `/knowledge` protected route |
| `apps/console/src/pages/ShortcutsPage.tsx` | Add Knowledge Base entry to `QUICK_ROUTES` |
| `apps/browser-extension/src/content/index.ts` | Add `EXTRACT_ARTICLE` message handler |
| `apps/browser-extension/src/background/service-worker.ts` | Add `PIN_ARTICLE` handler + `urlToSlug` helper |
| `apps/browser-extension/src/app.tsx` | Store `tabId` in state, wire "Read It Later" with real `executeScript` + `PIN_ARTICLE` |

---

## Task 1: Skill Templates + Version Constant

**Files:**
- Create: `apps/console/src/lib/kb-skills.ts`
- Create: `apps/console/src/lib/kb-skills.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/console/src/lib/kb-skills.test.ts
import { describe, it, expect } from 'vitest';
import {
  KB_SKILL_VERSION,
  KB_INGEST_SKILL,
  KB_LINT_SKILL,
  KB_ASK_SKILL,
  KB_SCHEMA_TEMPLATE,
  getScaffoldFiles,
  getSkillOnlyFiles,
} from './kb-skills';

describe('KB_SKILL_VERSION', () => {
  it('matches semver pattern', () => {
    expect(KB_SKILL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('skill templates', () => {
  it('KB_INGEST_SKILL is non-empty', () => {
    expect(KB_INGEST_SKILL.length).toBeGreaterThan(0);
  });

  it('KB_LINT_SKILL is non-empty', () => {
    expect(KB_LINT_SKILL.length).toBeGreaterThan(0);
  });

  it('KB_ASK_SKILL contains $ARGUMENTS placeholder', () => {
    expect(KB_ASK_SKILL).toContain('$ARGUMENTS');
  });

  it('KB_SCHEMA_TEMPLATE is non-empty', () => {
    expect(KB_SCHEMA_TEMPLATE.length).toBeGreaterThan(0);
  });
});

describe('getScaffoldFiles', () => {
  it('returns all required paths', () => {
    const files = getScaffoldFiles();
    expect(files).toHaveProperty('.kh/.skill-version', KB_SKILL_VERSION);
    expect(files).toHaveProperty('.kh/schema.md');
    expect(files).toHaveProperty('.kh/index.md');
    expect(files).toHaveProperty('.kh/log.md');
    expect(files).toHaveProperty('.kh/raw/.gitkeep');
    expect(files).toHaveProperty('.kh/wiki/.gitkeep');
    expect(files).toHaveProperty('.claude/commands/kb-ingest.md', KB_INGEST_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-lint.md', KB_LINT_SKILL);
    expect(files).toHaveProperty('.claude/commands/kb-ask.md', KB_ASK_SKILL);
  });
});

describe('getSkillOnlyFiles', () => {
  it('contains exactly the skill version file and three command files', () => {
    const files = getSkillOnlyFiles();
    expect(Object.keys(files)).toHaveLength(4);
    expect(files).toHaveProperty('.kh/.skill-version', KB_SKILL_VERSION);
    expect(files).toHaveProperty('.claude/commands/kb-ingest.md');
    expect(files).toHaveProperty('.claude/commands/kb-lint.md');
    expect(files).toHaveProperty('.claude/commands/kb-ask.md');
  });

  it('does not include data files like index.md or schema.md', () => {
    const files = getSkillOnlyFiles();
    expect(files).not.toHaveProperty('.kh/index.md');
    expect(files).not.toHaveProperty('.kh/schema.md');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/console && pnpm vitest run src/lib/kb-skills.test.ts
```

Expected: `Cannot find module './kb-skills'`

- [ ] **Step 3: Implement kb-skills.ts**

```typescript
// apps/console/src/lib/kb-skills.ts
export const KB_SKILL_VERSION = '1.0.0';

export const KB_INGEST_SKILL = `# Knowledge Base Ingest

Process all unread articles in \`.kh/raw/\` and compile them into the wiki.

## Steps

1. Read \`.kh/schema.md\` to understand the wiki domain, page structure, and tag vocabulary
2. Read \`.kh/index.md\` and scan existing \`.kh/wiki/\` pages to understand current state
3. Find all \`.kh/raw/*.md\` files where frontmatter has \`processed: false\`
4. For each unprocessed file:
   a. Read the full article content
   b. Identify key concepts, entities, claims, and relationships relevant to the domain
   c. For each key concept: create or update \`.kh/wiki/<concept-slug>.md\`
   d. Add backlinks between related wiki pages using \`[[Page Name]]\` syntax
   e. Update \`.kh/index.md\`: add new rows, update summaries and dates for modified pages
   f. Append to \`.kh/log.md\`: \`## [YYYY-MM-DD] ingest | <article title>\`
   g. Set \`processed: true\` in the raw file's frontmatter
5. Report: X articles ingested, Y wiki pages created, Z updated
`;

export const KB_LINT_SKILL = `# Knowledge Base Lint

Audit the wiki for quality issues and fix what can be fixed automatically.

## Steps

1. Read all \`.kh/wiki/*.md\` files and \`.kh/index.md\`
2. Check for:
   - **Contradictions**: conflicting claims between pages — flag with \`> ⚠️ NEEDS REVIEW: <reason>\`
   - **Orphans**: wiki pages not in \`index.md\` — add missing entries
   - **Dead links**: \`[[Page Name]]\` references to non-existent pages — remove or create stub
   - **Missing links**: pages about related topics without cross-references — add them
   - **Index drift**: summaries in \`index.md\` that no longer match page content — update them
3. Append to \`.kh/log.md\`: \`## [YYYY-MM-DD] lint | X issues found, Y fixed\`
4. Report all findings with file references
`;

export const KB_ASK_SKILL = `# Knowledge Base Ask

Answer a question using the knowledge base.

Question: $ARGUMENTS

## Steps

1. Read \`.kh/index.md\` to identify the most relevant wiki pages
2. Read those wiki pages in full
3. Synthesize a comprehensive answer with citations linking to specific pages
4. If the answer reveals a gap worth preserving, create \`.kh/wiki/<new-topic>.md\`
`;

export const KB_SCHEMA_TEMPLATE = `# Knowledge Base Schema

**Domain:** [Describe what this knowledge base covers — e.g., "AI/ML research", "competitive analysis", "personal finance"]

## Wiki page format

\`\`\`markdown
# [Concept Name]

[2-3 sentence summary]

## Key Points
- ...

## Details

...

## Related
- [[Other Concept]]

## Sources
- [Article Title](../raw/filename.md)
\`\`\`

## Index format

| Page | Summary | Updated |
|------|---------|---------|
| [[Concept]] | One-line summary | YYYY-MM-DD |

## Tags

[List tags used in raw article frontmatter — e.g., research, tools, people, concepts]

## Scope

**Include:** [What belongs here]

**Exclude:** [What does not belong here]
`;

const KB_INDEX_TEMPLATE = `# Knowledge Base Index

| Page | Summary | Updated |
|------|---------|---------|
`;

const KB_LOG_TEMPLATE = `# Knowledge Base Log

`;

export function getScaffoldFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.kh/schema.md': KB_SCHEMA_TEMPLATE,
    '.kh/index.md': KB_INDEX_TEMPLATE,
    '.kh/log.md': KB_LOG_TEMPLATE,
    '.kh/raw/.gitkeep': '',
    '.kh/wiki/.gitkeep': '',
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
  };
}

export function getSkillOnlyFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/console && pnpm vitest run src/lib/kb-skills.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/lib/kb-skills.ts apps/console/src/lib/kb-skills.test.ts
git commit -m "feat: add KB skill templates and version constant"
```

---

## Task 2: GitHub KB Helpers

**Files:**
- Create: `apps/console/src/lib/github-kb.ts`
- Create: `apps/console/src/lib/github-kb.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/console/src/lib/github-kb.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getInstalledSkillVersion,
  isKBInitialized,
  listKBDir,
  updateSkillsIfNeeded,
} from './github-kb';
import { KB_SKILL_VERSION } from './kb-skills';

vi.mock('@lifosy/core', () => ({
  authStore: { token: { value: 'test-token' } },
  githubService: {
    getFileContent: vi.fn(),
    upsertRepoFile: vi.fn(),
  },
}));

import { githubService } from '@lifosy/core';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getInstalledSkillVersion', () => {
  it('returns null when the version file does not exist', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('Not Found'));
    expect(await getInstalledSkillVersion('owner/repo')).toBeNull();
  });

  it('returns trimmed version string when file exists', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({ content: '1.0.0\n', sha: 'abc' });
    const result = await getInstalledSkillVersion('owner/repo');
    expect(result).toBe('1.0.0');
    expect(githubService.getFileContent).toHaveBeenCalledWith('owner', 'repo', '.kh/.skill-version');
  });
});

describe('isKBInitialized', () => {
  it('returns false when version file is missing', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('Not Found'));
    expect(await isKBInitialized('owner/repo')).toBe(false);
  });

  it('returns true when version file exists', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({ content: '1.0.0', sha: 'abc' });
    expect(await isKBInitialized('owner/repo')).toBe(true);
  });
});

describe('updateSkillsIfNeeded', () => {
  it('returns false and writes nothing when installed version matches', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({ content: KB_SKILL_VERSION, sha: 'abc' });
    const updated = await updateSkillsIfNeeded('owner/repo');
    expect(updated).toBe(false);
    expect(githubService.upsertRepoFile).not.toHaveBeenCalled();
  });

  it('writes skill files and returns true when version is outdated', async () => {
    vi.mocked(githubService.getFileContent).mockResolvedValue({ content: '0.0.1', sha: 'abc' });
    vi.mocked(githubService.upsertRepoFile).mockResolvedValue({} as any);
    const updated = await updateSkillsIfNeeded('owner/repo');
    expect(updated).toBe(true);
    const writtenPaths = vi.mocked(githubService.upsertRepoFile).mock.calls.map((c) => c[2]);
    expect(writtenPaths).toContain('.kh/.skill-version');
    expect(writtenPaths).toContain('.claude/commands/kb-ingest.md');
    expect(writtenPaths).toContain('.claude/commands/kb-lint.md');
    expect(writtenPaths).toContain('.claude/commands/kb-ask.md');
  });

  it('writes skill files and returns true when KB is not yet initialized', async () => {
    vi.mocked(githubService.getFileContent).mockRejectedValue(new Error('Not Found'));
    vi.mocked(githubService.upsertRepoFile).mockResolvedValue({} as any);
    const updated = await updateSkillsIfNeeded('owner/repo');
    expect(updated).toBe(true);
  });
});

describe('listKBDir', () => {
  it('returns empty array when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await listKBDir('owner/repo', 'raw')).toEqual([]);
    vi.unstubAllGlobals();
  });

  it('filters out .gitkeep and non-md files', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            { type: 'file', name: 'article.md', path: '.kh/raw/article.md', sha: 'abc' },
            { type: 'file', name: '.gitkeep', path: '.kh/raw/.gitkeep', sha: 'def' },
            { type: 'file', name: 'notes.txt', path: '.kh/raw/notes.txt', sha: 'ghi' },
          ]),
      }),
    );
    const result = await listKBDir('owner/repo', 'raw');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: 'article.md', path: '.kh/raw/article.md', sha: 'abc' });
    vi.unstubAllGlobals();
  });

  it('uses Authorization header with stored token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    await listKBDir('owner/repo', 'wiki');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/contents/.kh/wiki',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/console && pnpm vitest run src/lib/github-kb.test.ts
```

Expected: `Cannot find module './github-kb'`

- [ ] **Step 3: Implement github-kb.ts**

```typescript
// apps/console/src/lib/github-kb.ts
import { authStore, githubService } from '@lifosy/core';
import { KB_SKILL_VERSION, getScaffoldFiles, getSkillOnlyFiles } from './kb-skills';

export type KBFile = { name: string; path: string; sha: string };

function parseRepo(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split('/');
  return { owner, repo };
}

export async function getInstalledSkillVersion(fullName: string): Promise<string | null> {
  const { owner, repo } = parseRepo(fullName);
  try {
    const { content } = await githubService.getFileContent(owner, repo, '.kh/.skill-version');
    return content.trim();
  } catch {
    return null;
  }
}

export async function isKBInitialized(fullName: string): Promise<boolean> {
  return (await getInstalledSkillVersion(fullName)) !== null;
}

export async function scaffoldKB(fullName: string): Promise<void> {
  const { owner, repo } = parseRepo(fullName);
  for (const [path, content] of Object.entries(getScaffoldFiles())) {
    await githubService.upsertRepoFile(owner, repo, path, content, 'chore: scaffold knowledge base');
  }
}

export async function updateSkillsIfNeeded(fullName: string): Promise<boolean> {
  const installed = await getInstalledSkillVersion(fullName);
  if (installed === KB_SKILL_VERSION) return false;
  const { owner, repo } = parseRepo(fullName);
  for (const [path, content] of Object.entries(getSkillOnlyFiles())) {
    await githubService.upsertRepoFile(
      owner,
      repo,
      path,
      content,
      `chore: update KB skills to v${KB_SKILL_VERSION}`,
    );
  }
  return true;
}

export async function listKBDir(fullName: string, dir: 'raw' | 'wiki'): Promise<KBFile[]> {
  const token = authStore.token.value;
  if (!token) return [];
  const res = await fetch(`https://api.github.com/repos/${fullName}/contents/.kh/${dir}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((f: any) => f.type === 'file' && f.name.endsWith('.md') && f.name !== '.gitkeep')
    .map((f: any) => ({ name: f.name as string, path: f.path as string, sha: f.sha as string }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/console && pnpm vitest run src/lib/github-kb.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/console/src/lib/github-kb.ts apps/console/src/lib/github-kb.test.ts
git commit -m "feat: add GitHub KB helpers with init check, scaffold, and auto-update"
```

---

## Task 3: Article Extraction (Browser Extension)

**Files:**
- Create: `apps/browser-extension/src/content/extract.ts`
- Create: `apps/browser-extension/src/content/extract.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/browser-extension/src/content/extract.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractArticle } from './extract';

function makeDoc(title: string, canonical: string | null, bodyText: string): Document {
  const doc = document.implementation.createHTMLDocument(title);
  if (canonical) {
    const link = doc.createElement('link');
    link.rel = 'canonical';
    link.href = canonical;
    doc.head.appendChild(link);
  }
  doc.body.innerText = bodyText;
  return doc;
}

describe('extractArticle', () => {
  it('returns title, canonical url, and trimmed body text', () => {
    const doc = makeDoc('My Article', 'https://example.com/article', '  Article body  ');
    const result = extractArticle(doc);
    expect(result.title).toBe('My Article');
    expect(result.url).toBe('https://example.com/article');
    expect(result.text).toBe('Article body');
  });

  it('falls back to empty string when no canonical link', () => {
    const doc = makeDoc('No Canonical', null, 'Some text');
    const result = extractArticle(doc);
    expect(result.url).toBe('');
  });

  it('returns empty string for missing body', () => {
    const doc = document.implementation.createHTMLDocument('Empty');
    doc.body.remove();
    expect(extractArticle(doc).text).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/browser-extension && pnpm vitest run src/content/extract.test.ts
```

Expected: `Cannot find module './extract'`

- [ ] **Step 3: Implement extract.ts**

```typescript
// apps/browser-extension/src/content/extract.ts
export type ArticleData = { title: string; url: string; text: string };

export function extractArticle(doc: Document = document): ArticleData {
  const title = doc.title;
  const canonical = (doc.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href;
  const url = canonical ?? (typeof window !== 'undefined' ? window.location.href : '');
  const text = doc.body?.innerText?.trim() ?? '';
  return { title, url, text };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/browser-extension && pnpm vitest run src/content/extract.test.ts
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/content/extract.ts apps/browser-extension/src/content/extract.test.ts
git commit -m "feat: add pure extractArticle function for KB article pinning"
```

---

## Task 4: Extension Service Worker — PIN_ARTICLE Handler

**Files:**
- Modify: `apps/browser-extension/src/background/service-worker.ts`
- Modify: `apps/browser-extension/src/content/index.ts`

- [ ] **Step 1: Add EXTRACT_ARTICLE handler to content script**

Read `apps/browser-extension/src/content/index.ts` first. It is likely empty or minimal. Replace the entire file with:

```typescript
// apps/browser-extension/src/content/index.ts
import { extractArticle } from './extract';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'EXTRACT_ARTICLE') {
    sendResponse(extractArticle());
    return false;
  }
});
```

- [ ] **Step 2: Add urlToSlug helper to service worker**

Read `apps/browser-extension/src/background/service-worker.ts`. Add `urlToSlug` just before the closing of the file (after `saveToKnowledgeBase`):

```typescript
function urlToSlug(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const last = pathname.replace(/\/$/, '').split('/').pop() || '';
    const base = last || hostname.replace(/^www\./, '');
    return base.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
  } catch {
    return 'article';
  }
}
```

- [ ] **Step 3: Add PIN_ARTICLE message handler to service worker**

In `service-worker.ts`, inside the `chrome.runtime.onMessage.addListener` callback, add the following block after the `FETCH_QUICK_NOTES` handler (before the closing `}`):

```typescript
  if (message.type === 'PIN_ARTICLE') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const { title, url, text } = message as { title: string; url: string; text: string };
        const date = new Date().toISOString().slice(0, 10);
        const slug = urlToSlug(url);
        const path = `.kh/raw/${Date.now()}-${slug}.md`;
        const escapedTitle = title.replace(/"/g, '\\"');
        const content = `---\ntitle: "${escapedTitle}"\nurl: ${url}\ndate: ${date}\nprocessed: false\n---\n\n${text}`;
        await githubUpsertFile(token, repo, path, content);
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true;
  }
```

- [ ] **Step 4: Build extension to verify no type errors**

```bash
cd apps/browser-extension && pnpm build
```

Expected: build completes with zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/browser-extension/src/content/index.ts apps/browser-extension/src/background/service-worker.ts
git commit -m "feat: add PIN_ARTICLE handler to write raw KB articles to .kh/raw/"
```

---

## Task 5: Extension Popup — Wire Read It Later Button

**Files:**
- Modify: `apps/browser-extension/src/app.tsx`

- [ ] **Step 1: Read the current app.tsx**

Read `apps/browser-extension/src/app.tsx`. Identify:
- The `activeTab` state declaration (line ~8)
- The `setActiveTab` call inside the `useEffect` (line ~59-66)
- The `handleReadItLater` function (line ~86-95)

- [ ] **Step 2: Update activeTab type to include tabId**

Change the `activeTab` state declaration from:

```typescript
const [activeTab, setActiveTab] = useState<{ title: string; url: string } | null>(null);
```

to:

```typescript
const [activeTab, setActiveTab] = useState<{ title: string; url: string; tabId: number } | null>(null);
```

- [ ] **Step 3: Store tabId when querying tabs**

Change `setActiveTab` call inside `useEffect`:

```typescript
setActiveTab({
  title: tabs[0].title || '',
  url: tabs[0].url || '',
});
```

to:

```typescript
setActiveTab({
  title: tabs[0].title || '',
  url: tabs[0].url || '',
  tabId: tabs[0].id ?? 0,
});
```

- [ ] **Step 4: Replace the stub handleReadItLater with real implementation**

Replace the existing `handleReadItLater` function:

```typescript
const handleReadItLater = async () => {
  if (!token || !activeTab) return;
  setStatus('saving');
  setErrorMessage(null);
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.tabId },
      func: () => ({
        title: document.title,
        url:
          (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href ||
          window.location.href,
        text: (document.body?.innerText ?? '').trim(),
      }),
    });
    chrome.runtime.sendMessage({ type: 'PIN_ARTICLE', ...result.result }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        const err = chrome.runtime.lastError?.message || response?.error || 'Unknown error';
        setErrorMessage(err);
        setStatus('error');
      } else {
        setStatus('success');
        setTimeout(() => setStatus('idle'), 2000);
      }
    });
  } catch (e: any) {
    setErrorMessage(e.message || 'Unknown error');
    setStatus('error');
  }
};
```

- [ ] **Step 5: Update the "Save Page" button label**

Find the button text in the JSX. Change `'Save Page'` to `'Pin to Knowledge Base'` so the intent is clear.

- [ ] **Step 6: Build extension to verify no type errors**

```bash
cd apps/browser-extension && pnpm build
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add apps/browser-extension/src/app.tsx
git commit -m "feat: wire Read It Later button to pin articles to .kh/raw/"
```

---

## Task 6: Console — KnowledgeBasePage

**Files:**
- Create: `apps/console/src/pages/KnowledgeBasePage.tsx`

- [ ] **Step 1: Implement KnowledgeBasePage.tsx**

```tsx
// apps/console/src/pages/KnowledgeBasePage.tsx
import { githubProfileStore } from '@lifosy/core';
import { useEffect, useState } from 'preact/hooks';
import {
  type KBFile,
  getInstalledSkillVersion,
  isKBInitialized,
  listKBDir,
  scaffoldKB,
  updateSkillsIfNeeded,
} from '../lib/github-kb';
import { KB_SKILL_VERSION } from '../lib/kb-skills';

export function KnowledgeBasePage() {
  const repo = githubProfileStore.currentRepo.value;
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [rawFiles, setRawFiles] = useState<KBFile[]>([]);
  const [wikiFiles, setWikiFiles] = useState<KBFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [scaffolding, setScaffolding] = useState(false);
  const [skillsUpdated, setSkillsUpdated] = useState(false);
  const [view, setView] = useState<'inbox' | 'wiki'>('inbox');

  useEffect(() => {
    if (!repo) return;
    load(repo.full_name);
  }, [repo?.full_name]);

  async function load(fullName: string) {
    setLoading(true);
    const init = await isKBInitialized(fullName);
    setInitialized(init);
    if (init) {
      const updated = await updateSkillsIfNeeded(fullName);
      setSkillsUpdated(updated);
      const [raw, wiki] = await Promise.all([
        listKBDir(fullName, 'raw'),
        listKBDir(fullName, 'wiki'),
      ]);
      setRawFiles(raw);
      setWikiFiles(wiki);
    }
    setLoading(false);
  }

  async function handleSetup() {
    if (!repo) return;
    setScaffolding(true);
    await scaffoldKB(repo.full_name);
    setScaffolding(false);
    await load(repo.full_name);
  }

  if (!repo) {
    return (
      <div class="p-6 text-[var(--los-fg-dim)] text-sm font-mono">No repository selected.</div>
    );
  }

  if (loading) {
    return (
      <div class="p-6 text-[var(--los-fg-dim)] text-sm font-mono animate-pulse">Loading...</div>
    );
  }

  if (!initialized) {
    return (
      <div class="p-6 font-mono space-y-4 max-w-lg">
        <h1 class="text-lg font-bold text-[var(--los-fg)]">Knowledge Base</h1>
        <p class="text-sm text-[var(--los-fg-dim)]">
          Not set up in{' '}
          <span class="text-[var(--los-accent)]">{repo.full_name}</span>. This creates{' '}
          <code class="text-xs">.kh/</code> and{' '}
          <code class="text-xs">.claude/commands/</code> in your repo.
        </p>
        <button
          onClick={handleSetup}
          disabled={scaffolding}
          class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
        >
          {scaffolding ? 'Setting up...' : 'Set Up Knowledge Base'}
        </button>
      </div>
    );
  }

  return (
    <div class="p-4 font-mono flex flex-col gap-4 h-full overflow-hidden">
      <header class="flex items-center justify-between shrink-0">
        <h1 class="text-base font-bold text-[var(--los-fg)]">Knowledge Base</h1>
        <div class="flex items-center gap-3">
          {skillsUpdated && (
            <span class="text-[10px] text-[var(--los-success)]">
              skills updated to v{KB_SKILL_VERSION}
            </span>
          )}
          <span class="text-[10px] text-[var(--los-fg-dim)]">{repo.full_name}</span>
        </div>
      </header>

      <nav class="flex gap-2 text-xs shrink-0">
        <button
          onClick={() => setView('inbox')}
          class={`px-3 py-1 rounded border transition-colors ${
            view === 'inbox'
              ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
              : 'border-[var(--los-border)] text-[var(--los-fg-dim)] hover:border-[var(--los-accent)]'
          }`}
        >
          Inbox ({rawFiles.length})
        </button>
        <button
          onClick={() => setView('wiki')}
          class={`px-3 py-1 rounded border transition-colors ${
            view === 'wiki'
              ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
              : 'border-[var(--los-border)] text-[var(--los-fg-dim)] hover:border-[var(--los-accent)]'
          }`}
        >
          Wiki ({wikiFiles.length})
        </button>
      </nav>

      <div class="flex-1 overflow-y-auto space-y-1 min-h-0">
        {view === 'inbox' ? (
          rawFiles.length === 0 ? (
            <p class="text-xs text-[var(--los-fg-dim)]">
              No articles pinned yet. Use the browser extension to pin pages.
            </p>
          ) : (
            rawFiles.map((f) => (
              <div
                key={f.sha}
                class="px-3 py-2 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] text-xs text-[var(--los-fg)] truncate"
              >
                {f.name.replace(/^\d+-/, '').replace(/\.md$/, '')}
              </div>
            ))
          )
        ) : wikiFiles.length === 0 ? (
          <p class="text-xs text-[var(--los-fg-dim)]">
            No wiki pages yet. Run <code>/kb-ingest</code> in Claude Code to compile articles.
          </p>
        ) : (
          wikiFiles.map((f) => (
            <div
              key={f.sha}
              class="px-3 py-2 bg-[var(--los-bg-hover)] rounded border border-[var(--los-border)] text-xs text-[var(--los-fg)] truncate"
            >
              {f.name.replace(/\.md$/, '')}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck to verify no errors**

```bash
cd apps/console && pnpm tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/console/src/pages/KnowledgeBasePage.tsx
git commit -m "feat: add KnowledgeBasePage with setup flow, inbox, and wiki views"
```

---

## Task 7: Route + Navigation Entry

**Files:**
- Modify: `apps/console/src/App.tsx`
- Modify: `apps/console/src/pages/ShortcutsPage.tsx`

- [ ] **Step 1: Add /knowledge route to App.tsx**

Read `apps/console/src/App.tsx`. Add the import and route:

Add to imports (after the last page import):

```typescript
import { KnowledgeBasePage } from './pages/KnowledgeBasePage';
```

Add route inside `<Router>` after the `/shortcuts` route:

```tsx
<ProtectedRoute path="/knowledge" component={KnowledgeBasePage} />
```

- [ ] **Step 2: Add Knowledge Base to QUICK_ROUTES in ShortcutsPage.tsx**

Read `apps/console/src/pages/ShortcutsPage.tsx`. Find the `QUICK_ROUTES` array. Add the following entry after the last existing entry:

```typescript
  {
    name: 'Knowledge Base',
    path: '/knowledge',
    suggestedName: 'KH Knowledge',
    description: 'Pin, browse, and query your AI knowledge base',
  },
```

- [ ] **Step 3: Build console to verify no errors**

```bash
pnpm turbo build --filter=@lifosy/app-console
```

Expected: build completes with zero errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm turbo test
```

Expected: all tests pass.

- [ ] **Step 5: Run linter**

```bash
pnpm biome check .
```

Expected: zero warnings, zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/console/src/App.tsx apps/console/src/pages/ShortcutsPage.tsx
git commit -m "feat: add /knowledge route and shortcuts entry for knowledge base"
```

---

## Self-Review

### Spec coverage

| Requirement | Task |
|---|---|
| Pin articles via browser extension | Tasks 3, 4, 5 |
| Article saved to `.kh/raw/` with frontmatter | Task 4 |
| Console scaffolds `.claude/commands/` + `.kh/` | Task 2 |
| Skill versioning — auto-update on console load | Tasks 1, 2, 6 |
| `/kb-ingest`, `/kb-lint`, `/kb-ask` slash commands | Task 1 |
| Console KB page — setup, inbox, wiki views | Task 6 |
| KB accessible from navigation | Task 7 |

### Type consistency check

- `KBFile` defined in `github-kb.ts:3`, used in `KnowledgeBasePage.tsx` — consistent
- `getScaffoldFiles()` returns `Record<string, string>` — matches `getSkillOnlyFiles()` — consistent
- `githubService.upsertRepoFile(owner, repo, path, content, message)` — 5 args — used correctly in all calls
- `githubProfileStore.currentRepo.value` typed as `GithubRepo | null` — guarded with `if (!repo)` check — consistent
- `ArticleData` type defined in `extract.ts`, inlined in `executeScript` func — not shared (by design, executeScript can't import) — no inconsistency

### Placeholder scan

None found. All code blocks contain complete implementations.
