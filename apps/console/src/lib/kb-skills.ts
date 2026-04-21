export const KB_SKILL_VERSION = '1.5.0';

export const KB_INGEST_SKILL = `# /kb-ingest

Ingest raw markdown files into the knowledge base wiki.

## Process

1. Read \`.kh/schema.md\` to understand domain, page format, and index structure
2. Read existing wiki pages from \`.kh/wiki/\` to understand current state
3. List \`.kh/raw/\` — process only direct children (files), not \`.kh/raw/processed/\`
4. For each file in \`.kh/raw/\`:
   - Extract key concepts and entities
   - Create or update corresponding wiki pages in \`.kh/wiki/\`
   - Add backlinks between related pages
   - Update \`.kh/index.kb.md\` with new entries and maintain structure
   - Append processing notes to \`.kh/log.md\`
   - Update the file's frontmatter to \`processed: true\`
   - Move the file to \`.kh/raw/processed/\` (write updated content there, then delete from \`.kh/raw/\`)
5. Commit changes with a meaningful message

## Moving a processed file

For each \`.kh/raw/FILENAME.md\`, after updating its frontmatter:

~~~bash
REPO=owner/repo   # the repo being operated on
SHA=$(gh api repos/$REPO/contents/.kh/raw/FILENAME.md --jq '.sha')
CONTENT=$(printf '%s' "UPDATED_CONTENT_WITH_PROCESSED_TRUE" | base64 -w 0)
gh api repos/$REPO/contents/.kh/raw/processed/FILENAME.md \
  --method PUT \
  --field message="chore: ingest FILENAME" \
  --field "content=$CONTENT"
gh api repos/$REPO/contents/.kh/raw/FILENAME.md \
  --method DELETE \
  --field message="chore: move FILENAME to processed" \
  --field sha=$SHA
~~~

## Input

Files in \`.kh/raw/\` (direct children only — skip the \`processed/\` subdirectory).

## Output

- Updated wiki pages in \`.kh/wiki/\`
- Updated \`.kh/index.kb.md\` with new entries
- Updated \`.kh/log.md\` with processing notes
- Ingested files moved to \`.kh/raw/processed/\` with \`processed: true\` in frontmatter

## After ingestion

Run \`/kb-index\` to rebuild \`.kh/search.kb.json\` with the new wiki pages.
`;

export const KB_LINT_SKILL = `# /kb-lint

Audit and repair the knowledge base.

## Audits

Check for:
- **Contradictions**: Conflicting information in wiki pages about the same topic
- **Orphans**: Wiki pages not referenced in index.kb.md
- **Dead links**: Wiki pages linking to non-existent pages
- **Missing links**: Related pages that should be linked but aren't
- **Index drift**: Index structure not matching actual wiki organization

## Repairs

Fix automatically where possible:
- Add missing backlinks between related pages
- Remove dead links from pages
- Update index.kb.md to include orphaned pages
- Add missing cross-references

## Output

Append audit and repair summary to \`.kh/log.md\` with:
- Issues found
- Repairs made
- Recommendations for manual review
`;

export const KB_ASK_SKILL = `# /kb-ask

Answer questions using the knowledge base.

## Process

1. Check whether \`.kh/search.kb.json\` exists.

   **If it exists (fast path):**
   - Tokenize \`$ARGUMENTS\` into lowercase keywords (split on spaces and punctuation, drop stop words)
   - Look up each keyword in \`index\` — collect all matching page filenames
   - Rank candidates by number of keyword hits; take the top 5
   - If zero candidates, fall back to reading \`.kh/index.kb.md\` and selecting pages manually

   **If it does not exist (slow path):**
   - Read \`.kh/index.kb.md\` and identify relevant pages manually
   - Note: "Run \`/kb-index\` to build a search index for faster, more accurate answers."

2. Read the candidate wiki pages from \`.kh/wiki/\`
3. Synthesize a comprehensive answer from their content
4. Cite the specific wiki pages used

## Input

Question or query passed via \`$ARGUMENTS\`

## Output

Answer with citations. If the search index was missing or produced zero candidates, say so.
`;

export const KB_INDEX_SKILL = `# /kb-index

Build or rebuild the search index for the knowledge base.

## Process

1. List all wiki pages in \`.kh/wiki/\`
2. For each page:
   - Read title and tags from frontmatter
   - Extract 10–20 key terms and noun phrases from the content (concepts, names, technologies, topics)
   - All index terms must be lowercase
3. Build the output structure (see format below)
4. Write to \`.kh/search.kb.json\`
5. Append a one-line note to \`.kh/log.md\`: "index rebuilt: N pages, M terms (DATE)"

## Output format

\`\`\`json
{
  "version": "1",
  "built": "YYYY-MM-DD",
  "pages": {
    "react-hooks.md": {
      "title": "React Hooks",
      "tags": ["react", "hooks", "frontend"],
      "keywords": ["usestate", "useeffect", "custom hook", "rules of hooks"]
    }
  },
  "index": {
    "react": ["react-hooks.md", "react-context.md"],
    "hooks": ["react-hooks.md"],
    "usestate": ["react-hooks.md"]
  }
}
\`\`\`

\`pages\` is a flat map of wiki filename → metadata + extracted keywords.
\`index\` is an inverted map of term → list of filenames that contain it.
Include title words, tags, and extracted concepts in the index — not stop words.

## Notes

- A full rebuild is safe to run at any time; it overwrites the previous index
- Run after every \`/kb-ingest\` to keep the index current
- For large wikis (100+ pages), process in batches of 20 and merge results before writing
`;

export const KB_SESSION_SKILL = `# /kb-session

Summarize this Claude Code session and save it to the knowledge base.

## Arguments

- (no args) — save session summary to KB
- \`set-default owner/repo\` — set the default KB repo for all projects
- \`set owner/repo\` — map the current project (basename of $PWD) to a specific KB repo

## Config

Read \`~/.claude/kb.json\`. Format:

\`\`\`json
{
  "default": "owner/kb-repo",
  "projects": {
    "my-project": "owner/other-repo"
  }
}
\`\`\`

Backward-compat: if the file has a top-level \`"repo"\` field and no \`"default"\`, treat \`"repo"\` as \`"default"\`.

### Resolving the target repo

1. \`PROJECT=$(basename "$PWD")\`
2. Check \`projects[$PROJECT]\` — use it if set
3. Fall back to \`default\`
4. If neither exists, ask once: "What is your default KB repo? (e.g. adam/notes)"
   Then write: \`echo '{"default":"OWNER/REPO","projects":{}}' > ~/.claude/kb.json\`

### Changing config

**\`/kb-session set-default owner/repo\`**

\`\`\`bash
if [ -f ~/.claude/kb.json ]; then
  jq --arg r "OWNER/REPO" '.default = $r' ~/.claude/kb.json > /tmp/kb.json && mv /tmp/kb.json ~/.claude/kb.json
else
  echo '{"default":"OWNER/REPO","projects":{}}' > ~/.claude/kb.json
fi
\`\`\`

Confirm: "Default KB repo set to OWNER/REPO."

**\`/kb-session set owner/repo\`**

\`\`\`bash
PROJECT=$(basename "$PWD")
if [ -f ~/.claude/kb.json ]; then
  jq --arg p "$PROJECT" --arg r "OWNER/REPO" '.projects[$p] = $r' ~/.claude/kb.json > /tmp/kb.json && mv /tmp/kb.json ~/.claude/kb.json
else
  jq -n --arg p "$PROJECT" --arg r "OWNER/REPO" '{"default":"","projects":{($p):$r}}' > ~/.claude/kb.json
fi
\`\`\`

Confirm: "Project \\"$PROJECT\\" mapped to OWNER/REPO."

## Write the summary

(When saving a session — no args)

Summarize this session concisely (under 300 words):
- What project/repo was worked on
- What was built or changed — name specific files, functions, decisions
- Problems encountered and how they were resolved
- Anything worth remembering for future sessions

## Save to KB

Resolve the target repo (see above), then write via \`gh\` CLI:

~~~bash
REPO=<resolved-repo>
TIMESTAMP=$(date +%s)
DATE=$(date +%Y-%m-%d)
PROJECT=$(basename "$PWD")
SLUG="$PROJECT-session"
CONTENT=$(printf -- '---\ntitle: "Session: %s – %s"\nurl: '"''"'\ndate: %s\nprocessed: false\ntags: [session]\n---\n\n%s' "$PROJECT" "ONE_LINE_SUMMARY" "$DATE" "FULL_SUMMARY" | base64 -w 0)
gh api "repos/$REPO/contents/.kh/raw/$TIMESTAMP-$SLUG.md" \
  --method PUT \
  --field message="note: add session summary for $PROJECT" \
  --field "content=$CONTENT"
~~~

Confirm with the path that was written.
`;

export const KB_CLAUDE_MD = `# Knowledge Base

This repo is a personal AI knowledge base managed with Claude Code.

## Structure

\`\`\`
.kh/
  raw/        # Pinned articles (frontmatter: processed: false → true)
  wiki/       # Compiled knowledge pages with backlinks
  schema.md   # Domain definition and page format rules
  index.kb.md    # Master index of all wiki pages
  log.md      # Processing and audit history
.claude/commands/
  kb-ingest.md  # /kb-ingest — compile raw articles into wiki
  kb-index.md   # /kb-index  — build search index from wiki pages
  kb-lint.md    # /kb-lint   — audit and repair wiki
  kb-ask.md     # /kb-ask    — answer questions from wiki
\`\`\`

## Workflow

1. Articles are pinned via the browser extension → land in \`.kh/raw/\` with \`processed: false\`
2. Run \`/kb-ingest\` to compile them into \`.kh/wiki/\` pages and move them to \`.kh/raw/processed/\`
3. Run \`/kb-index\` to rebuild \`.kh/search.kb.json\` from all wiki pages
4. Run \`/kb-lint\` periodically to fix orphans, dead links, and contradictions
5. Run \`/kb-ask <question>\` to query the knowledge base

## Guidelines

- Always read \`.kh/schema.md\` before creating or editing wiki pages
- Wiki pages use \`[[wikilink]]\` syntax for cross-references
- Keep raw files intact after processing — only the frontmatter changes
- The index in \`.kh/index.kb.md\` is the canonical entry point for navigation
`;

export const KB_SCHEMA_TEMPLATE = `# Knowledge Base Schema

## Domain

**Domain**: [Domain name or topic area]

## Wiki Page Format

Each wiki page uses the following structure:

\`\`\`markdown
---
title: Page Title
tags: [tag1, tag2, tag3]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Overview
[Brief summary of the topic]

## Key Concepts
[Main ideas and definitions]

## Details
[In-depth information]

## Related Topics
- [[Link to related page 1]]
- [[Link to related page 2]]
\`\`\`

## Index Format

The \`.kh/index.kb.md\` file maintains the structure:

\`\`\`markdown
# Knowledge Base Index

## Category 1
- [[Page Title 1]]
- [[Page Title 2]]

## Category 2
- [[Page Title 3]]
- [[Page Title 4]]
\`\`\`

## Tags

Standard tags for categorization:

- \`concept\`: Fundamental ideas
- \`definition\`: Terminology and definitions
- \`procedure\`: Step-by-step processes
- \`reference\`: Reference materials
- \`example\`: Examples and case studies

## Scope

This knowledge base covers:
- [Scope item 1]
- [Scope item 2]
- [Scope item 3]
`;

export function getScaffoldFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.kh/schema.md': KB_SCHEMA_TEMPLATE,
    '.kh/index.kb.md':
      '# Knowledge Base Index\n\n## Getting Started\n\nWelcome to your knowledge base. Start by reading the schema in `.kh/schema.md` to understand the structure.\n',
    '.kh/log.md': '# Knowledge Base Log\n\nProcessing and audit history.\n',
    '.kh/raw/.gitkeep': '',
    '.kh/wiki/.gitkeep': '',
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-index.md': KB_INDEX_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
    '.claude/commands/kb-session.md': KB_SESSION_SKILL,
    'CLAUDE.md': KB_CLAUDE_MD,
  };
}

export function getSkillOnlyFiles(): Record<string, string> {
  return {
    '.kh/.skill-version': KB_SKILL_VERSION,
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-index.md': KB_INDEX_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
    '.claude/commands/kb-session.md': KB_SESSION_SKILL,
    'CLAUDE.md': KB_CLAUDE_MD,
  };
}
