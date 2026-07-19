export const KB_SKILL_VERSION = '2.1.0';

export const KB_INGEST_SKILL = `# /kb-ingest

Compile raw captures in \`.kh/raw/\` into the wiki, and append them to the monthly journal.

## Principles

- **Raw notes are immutable.** Never rewrite a capture's prose. Only its \`processed\` flag changes, and its body is copied verbatim into the journal. A bad run is always recoverable by re-ingesting.
- **The wiki is derived.** Prefer updating an existing page over creating a new one. Consult the **Canonical Topics** list in \`.kh/schema.md\` and reuse those page slugs so knowledge does not fragment into near-duplicate pages.
- **Everything is cited.** Every claim added to a wiki page links back to its source — the journal entry or the raw file it came from — so the synthesized wiki stays auditable.

## Process

1. Read \`.kh/schema.md\` — domain, page format, index structure, and the Canonical Topics list.
2. Read existing wiki pages in \`.kh/wiki/\` to understand current state.
3. List \`.kh/raw/\` — process only direct children (files), not \`.kh/raw/processed/\`. Sort oldest-first by the numeric timestamp prefix.
4. For each file in \`.kh/raw/\`:
   a. Read the full capture and its frontmatter.
   b. **Append to the journal.** Take the month \`YYYY-MM\` from the frontmatter \`date\` (fallback: today). Open or create \`.kh/journal/YYYY-MM.md\`; if new, start it with a single \`# YYYY-MM\` heading. Append, keeping entries in chronological order:

      ~~~markdown
      ## [YYYY-MM-DD HH:MM] <Title>

      <the capture body, verbatim>
      ~~~

      Use the frontmatter \`title\` if it is meaningful; otherwise derive a short title from the first line.
   c. **Update the wiki.** For each concept in the capture, create or update \`.kh/wiki/<topic-slug>.md\`, preferring an existing canonical page over a new one. Add \`[[wikilink]]\` backlinks between related pages. Under the page's \`## Sources\` section, add a link to the journal entry (\`../journal/YYYY-MM.md\`) or the raw file — this is the provenance for what you synthesized.
   d. Update \`.kh/index.kb.md\` with new or changed entries.
   e. Append a one-line note to \`.kh/log.md\`.
   f. Set \`processed: true\` in the raw file's frontmatter and move it to \`.kh/raw/processed/\` (write the updated content there, then delete from \`.kh/raw/\`).
5. If a genuinely new durable topic appeared, add its slug to the **Canonical Topics** list in \`.kh/schema.md\`.
6. Commit changes with a meaningful message.

## Moving a processed file

For each \`.kh/raw/FILENAME.md\`, after updating its frontmatter:

~~~bash
REPO=owner/repo   # the repo being operated on
SHA=$(gh api repos/$REPO/contents/.kh/raw/FILENAME.md --jq '.sha')
CONTENT=$(printf '%s' "UPDATED_CONTENT_WITH_PROCESSED_TRUE" | base64 -w 0)
gh api repos/$REPO/contents/.kh/raw/processed/FILENAME.md \\
  --method PUT \\
  --field message="chore: ingest FILENAME" \\
  --field "content=$CONTENT"
gh api repos/$REPO/contents/.kh/raw/FILENAME.md \\
  --method DELETE \\
  --field message="chore: move FILENAME to processed" \\
  --field sha=$SHA
~~~

## Input

Files in \`.kh/raw/\` (direct children only — skip the \`processed/\` subdirectory).

## Output

- Chronological entries appended to \`.kh/journal/YYYY-MM.md\` (verbatim capture bodies)
- Updated wiki pages in \`.kh/wiki/\` with \`## Sources\` provenance links
- Updated \`.kh/index.kb.md\` and \`.kh/log.md\`
- Ingested files moved to \`.kh/raw/processed/\` with \`processed: true\`

## After ingestion

Run \`/kb-index\` to rebuild \`.kh/search.kb.json\` so the new wiki pages are searchable.

## Running on a schedule

This skill is safe to run manually or from a routine (e.g. a nightly cron). When running unattended, prefer committing to a branch or at least writing a clear summary to \`.kh/log.md\` so the changes can be reviewed. Because raw captures are immutable and the wiki is derived, git history is always the undo.
`;

export const KB_LINT_SKILL = `# /kb-lint

Audit and repair the knowledge base.

## Audits

Check for:
- **Contradictions**: Conflicting information in wiki pages about the same topic
- **Orphans**: Wiki pages not referenced in index.kb.md
- **Dead links**: Wiki pages linking to non-existent pages
- **Missing links**: Related pages that should be linked but aren't
- **Missing sources**: Wiki pages without a \`## Sources\` section citing provenance
- **Topic drift**: Near-duplicate pages that should be merged into a Canonical Topic
- **Index drift**: Index structure not matching actual wiki organization

## Repairs

Fix automatically where possible:
- Add missing backlinks between related pages
- Remove dead links from pages
- Update index.kb.md to include orphaned pages
- Add missing cross-references
- Flag contradictions and un-cited claims with \`> ⚠️ NEEDS REVIEW: <reason>\`

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
4. Cite the specific wiki pages used. When a page's claim matters, follow its \`## Sources\` links back to the journal or raw capture so the answer is grounded in what was actually written.

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
CONTENT=$(printf -- '---\\ntype: session\\ntitle: "Session: %s – %s"\\nurl: '"''"'\\ndate: %s\\nprocessed: false\\ntags: [session]\\n---\\n\\n%s' "$PROJECT" "ONE_LINE_SUMMARY" "$DATE" "FULL_SUMMARY" | base64 -w 0)
gh api "repos/$REPO/contents/.kh/raw/$TIMESTAMP-$SLUG.md" \\
  --method PUT \\
  --field message="note: add session summary for $PROJECT" \\
  --field "content=$CONTENT"
~~~

Confirm with the path that was written.
`;

export const KB_AGENT_CAPTURE_SKILL = `# /kb-agent-capture

Capture a note into \`.kh/raw/\` by **driving the \`kh-capture\` native window**
(native-sdk automation server) as an agent action — open it, type the note,
submit, and assert success. The same flow serves as the native app's end-to-end
acceptance test: it is how an agent both operates and verifies the GUI.

> For plain, reliable capture that doesn't need the GUI, prefer
> \`cli capture "<text>"\` — simpler and offline-safe. Use this when the point is
> to exercise or verify the native app through automation.

## Status

Experimental. Requires the \`kh-capture\` native app (native-sdk) to be built with
automation enabled. Steps marked VERIFY need confirming against
\`native automate --help\` — the exact input-dispatch subcommand isn't pinned in
the public docs. If any step is uncertain or fails, fall back to \`cli capture\`.

## Prerequisites

1. \`cli\` logged in once — the app reuses \`~/.config/cli/auth.json\`
   (run \`cli\`, press \`l\` then \`s\`).
2. Build with automation: \`native build -Dautomation=true\` → \`zig-out/bin/kh-capture\`.

## Steps

All \`native automate\` commands run from the native app's directory.

1. Launch \`zig-out/bin/kh-capture &\` if no window is up.
2. \`native automate wait\` — block until the window is ready.
3. \`native automate snapshot\` — confirm the text input and Save button:
   \`native automate assert 'role=button name="Save"'\`.
4. Type the note into the autofocused input.
   **VERIFY**: confirm the subcommand via \`native automate --help\`
   (assumed \`native automate type "<text>"\`).
5. Submit: \`native automate widget-click canvas <n>\` on the Save button (index
   from the snapshot), or dispatch Enter.
6. Verify: on a good push the app sets status \`captured ✓\` and auto-closes.
   \`native automate assert 'name~="captured"'\`, or re-snapshot and confirm the
   window closed.
7. (Optional) Confirm \`.kh/raw/<ts>-<slug>.md\` landed on GitHub.

## Fallback — always works

\`\`\`bash
cli capture "the note text"
\`\`\`

Offline-safe: spools locally and pushes with retry. If the automation drive
fails for any reason, use this and report that automation was unavailable. The
native app also spools into the CLI's spool dir on failure, so a note captured
by either path is never lost.
`;

export const KB_CLAUDE_MD = `# Knowledge Base

This repo is a personal AI knowledge base managed with Claude Code.

## Structure

\`\`\`
.kh/
  raw/        # Captures awaiting processing (frontmatter: processed: false → true)
    processed/  # Captures after ingestion (immutable archive)
  journal/    # Human-readable monthly log — one YYYY-MM.md per month
  wiki/       # Compiled, deduplicated knowledge pages with backlinks + sources
  schema.md   # Domain definition, page format, and Canonical Topics list
  index.kb.md # Master index of all wiki pages
  log.md      # Processing and audit history
.claude/commands/
  kb-ingest.md  # /kb-ingest — compile raw captures into journal + wiki
  kb-index.md   # /kb-index  — build search index from wiki pages
  kb-lint.md    # /kb-lint   — audit and repair wiki
  kb-ask.md     # /kb-ask    — answer questions from wiki
  kb-agent-capture.md  # /kb-agent-capture — capture via the native app's automation server
\`\`\`

## Capture → knowledge flow

1. Captures land in \`.kh/raw/\` with \`processed: false\`, via the browser extension, the console
   ("Add note" / \`/quick-knowledge\`), or the CLI (\`k\` — new knowledge note).
2. Run \`/kb-ingest\` to:
   - append each capture verbatim to \`.kh/journal/YYYY-MM.md\` (the monthly log you can read),
   - synthesize its concepts into \`.kh/wiki/\` pages (the deduplicated view), and
   - move the capture to \`.kh/raw/processed/\`.
3. Run \`/kb-index\` to rebuild \`.kh/search.kb.json\` from all wiki pages.
4. Run \`/kb-lint\` periodically to fix orphans, dead links, missing sources, and topic drift.
5. Run \`/kb-ask <question>\` to query the knowledge base.

## Guidelines

- **Raw captures are immutable.** Ingestion only flips their \`processed\` flag and copies the body
  verbatim into the journal. Never rewrite a capture's prose.
- **The wiki is derived and re-buildable.** Prefer updating an existing Canonical Topic page over
  creating a near-duplicate. Git history is the undo for any bad ingest.
- Always read \`.kh/schema.md\` before creating or editing wiki pages.
- Wiki pages use \`[[wikilink]]\` syntax for cross-references and carry a \`## Sources\` section that
  links each claim back to its journal entry or raw capture (provenance).
- The index in \`.kh/index.kb.md\` is the canonical entry point for navigation.
- \`/kb-ingest\` + \`/kb-index\` can be run on a schedule (routine/cron) for hands-off upkeep.
`;

export const KB_SCHEMA_TEMPLATE = `# Knowledge Base Schema

## Domain

**Domain**: [Domain name or topic area]

## Capture frontmatter (\`.kh/raw/\`)

Every raw capture carries YAML frontmatter. Aligned with the Open Knowledge Format (OKF) —
\`type\` is the only strictly required field; the rest are recommended:

\`\`\`markdown
---
type: note        # note | article | session
title: "Short title"
url: ''            # source URL if the capture came from a page
date: YYYY-MM-DD
processed: false
tags: [tag1, tag2]
---

Free-form body — anything you learned. No structure required at capture time.
\`\`\`

## Wiki page format (\`.kh/wiki/\`)

\`\`\`markdown
---
type: concept
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

## Sources
- [Journal YYYY-MM](../journal/YYYY-MM.md) — [YYYY-MM-DD HH:MM] entry
- [Raw capture](../raw/processed/<file>.md)
\`\`\`

Every wiki page must carry a \`## Sources\` section citing where its content came from. This
provenance is what lets you trust the synthesized wiki over time — you can always check what you
actually wrote versus what was summarized.

## Journal (\`.kh/journal/\`)

One file per month, \`YYYY-MM.md\`. A single \`# YYYY-MM\` heading, then one section per capture in
chronological order, body copied verbatim:

\`\`\`markdown
# 2026-07

## [2026-07-17 14:32] Zustand selectors avoid re-renders

Selecting a slice with a selector function only re-renders when that slice changes...
\`\`\`

The journal is the human-readable record of everything captured; the wiki is the synthesized,
deduplicated view built from it.

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

## Canonical Topics

Maintain the list of durable wiki page slugs here so \`/kb-ingest\` merges captures into existing
pages instead of fragmenting knowledge into near-duplicates. Add a slug only when a genuinely new
topic appears.

- (none yet)

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
    '.kh/journal/.gitkeep': '',
    '.kh/wiki/.gitkeep': '',
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-index.md': KB_INDEX_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
    '.claude/commands/kb-session.md': KB_SESSION_SKILL,
    '.claude/commands/kb-agent-capture.md': KB_AGENT_CAPTURE_SKILL,
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
    '.claude/commands/kb-agent-capture.md': KB_AGENT_CAPTURE_SKILL,
    'CLAUDE.md': KB_CLAUDE_MD,
  };
}
