import KH_IDEAS_SKILL_SOURCE from '@kaihuman/formats/skills/kh-ideas/SKILL.md?raw';

export const KB_SKILL_VERSION = '1.8.0';

/** The kh-ideas Agent Skill, as shipped in `@kaihuman/formats`. */
export const KH_IDEAS_SKILL = KH_IDEAS_SKILL_SOURCE;

// Agent Skills live in `.agents/skills/` (Gemini, Codex, Copilot, Cursor) and `.claude/skills/`.
const KH_IDEAS_SKILL_FILES = {
  '.agents/skills/kh-ideas/SKILL.md': KH_IDEAS_SKILL,
  '.claude/skills/kh-ideas/SKILL.md': KH_IDEAS_SKILL,
};

// One heading per operation keeps the log greppable: `grep '^## \[' .kh/log.md | tail -5`.
export const KB_LOG_FORMAT = '## [YYYY-MM-DD] <op> | <title>';

export const KB_INGEST_SKILL = `# /kb-ingest

Ingest raw sources into the knowledge base wiki.

## Arguments

- (no args) — interactive: go through \`.kh/raw/\` one source at a time and discuss each with the user before writing
- \`FILENAME\` — ingest only \`.kh/raw/FILENAME\`, interactively
- \`--batch\` — ingest every source without stopping to discuss (for unattended runs)

## Process

1. Read \`.kh/schema.md\` and the conventions in \`CLAUDE.md\` (page types, frontmatter, log format)
2. Read \`.kh/index.kb.md\` to learn which pages already exist
3. List \`.kh/raw/\` — process only direct children (files), not \`.kh/raw/processed/\`
4. For each source, oldest first:
   1. Read it fully, including any images it links under \`/.kh/assets/\`
   2. Read the existing wiki pages it touches (use the index and \`.kh/search.kb.json\` if present)
   3. **Discuss (skip with \`--batch\`)**: tell the user
      - 3–7 key takeaways
      - the pages you plan to create or update, with one line each on what changes
      - any claim that contradicts an existing page, naming both sources
      Then ask what to emphasise, correct or skip, and wait for the answer before writing.
   4. Write a \`type: source\` page summarising the source, with \`sources: [FILENAME]\`
   5. Create or update the \`entity\`, \`concept\` and \`topic\` pages it informs — a single source
      often touches 10–15 pages. Add the source to each page's \`sources\` list and bump \`updated\`
   6. Where the source contradicts a page, keep both claims and mark them:
      \`> [!warning] Contradiction — [[Source A]] says X, [[Source B]] says Y\`
   7. Add \`[[wikilinks]]\` both ways between related pages
   8. Add new pages to \`.kh/index.kb.md\` under the section for their type
   9. Append to \`.kh/log.md\`: \`## [YYYY-MM-DD] ingest | SOURCE TITLE\`, followed by a bullet list of
      the pages created and updated
   10. Update the source's frontmatter to \`processed: true\` and move it to \`.kh/raw/processed/\`
   11. Append the source to the monthly journal \`.kh/journal/YYYY-MM.md\` (month from its \`date\`,
       fallback today). If the file is new, start it with a single \`# YYYY-MM\` heading. Append, in
       chronological order, a \`## [YYYY-MM-DD HH:MM] <source title>\` section with the source body
       verbatim. The journal is the human-readable log of what came in; the wiki is the synthesis.
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
Apart from the \`processed\` flag, never change a source's content: it is the ground truth the
wiki is checked against.

## Output

- A \`source\` page per ingested file, plus updated entity, concept and topic pages in \`.kh/wiki/\`
- Updated \`.kh/index.kb.md\` with new entries
- One \`ingest\` entry per source in \`.kh/log.md\`
- Each source appended verbatim to the monthly journal \`.kh/journal/YYYY-MM.md\`
- Ingested files moved to \`.kh/raw/processed/\` with \`processed: true\` in frontmatter

## After ingestion

Run \`/kb-index\` to rebuild \`.kh/search.kb.json\` with the new wiki pages.
`;

export const KB_LINT_SKILL = `# /kb-lint

Audit and repair the knowledge base, then suggest where it should grow.

## Audits

Check for:
- **Contradictions**: Conflicting information in wiki pages about the same topic, including
  unresolved \`> [!warning] Contradiction\` callouts
- **Stale claims**: Claims superseded by a newer source — compare each page's \`sources\` and
  \`updated\` date with later sources on the same subject
- **Orphans**: Wiki pages not referenced in index.kb.md or without any inbound \`[[link]]\`
- **Dead links**: Wiki pages linking to non-existent pages
- **Missing links**: Related pages that should be linked but aren't
- **Missing pages**: Entities or concepts mentioned on two or more pages that have no page of their own
- **Frontmatter**: Pages without a valid \`type\` (source, entity, concept, topic, question),
  \`sources\`, \`created\` or \`updated\`
- **Index drift**: Index structure not matching actual wiki organization
- **Data gaps**: Topics with a single source, or questions the wiki cannot answer yet

## Repairs

Fix automatically where possible:
- Add missing backlinks between related pages
- Remove dead links from pages
- Update index.kb.md to include orphaned pages
- Add missing cross-references
- Create stub pages for missing entities and concepts, citing the pages that mention them
- Rewrite stale claims when a newer source clearly supersedes them, keeping the old claim with its
  date and source

Leave genuine contradictions for the user; list them instead of picking a side.

## Suggestions

Finish with:
- 3–5 questions worth investigating next, based on the gaps found
- Kinds of sources that would fill them (articles, papers, data to start tracking)

## Output

Append to \`.kh/log.md\` under \`## [YYYY-MM-DD] lint | N issues, M repairs\`:
- Issues found
- Repairs made
- Recommendations for manual review
- Suggested questions and sources
`;

export const KB_ASK_SKILL = `# /kb-ask

Answer questions using the knowledge base, and file good answers back into it.

## Arguments

\`$ARGUMENTS\` — the question. Add \`--save\` to file the answer as a wiki page without asking.

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

2. Read the candidate wiki pages from \`.kh/wiki/\`, following \`[[links]]\` one hop when they look relevant
3. Synthesize a comprehensive answer from their content — as prose, a table, or a list, whichever fits
4. Cite the specific wiki pages used as \`[[Page Title]]\`

## Filing the answer

An answer that compares, analyses or connects pages is new knowledge; keep it so it compounds.
With \`--save\` — or when the user agrees after you offer, which you should do for any such answer:

1. Write \`.kh/wiki/<kebab-case-question>.md\` with frontmatter \`type: question\`, \`tags\`,
   \`sources\` (the cited pages), \`created\` and \`updated\`, and sections
   \`## Question\`, \`## Answer\`, \`## Related Topics\` (the cited pages as \`[[links]]\`)
2. Add a \`[[link]]\` to the new page from each cited page's Related Topics
3. Add it to \`.kh/index.kb.md\` under "Questions"
4. Append to \`.kh/log.md\`: \`## [YYYY-MM-DD] query | THE QUESTION\` with the page filename
5. Commit changes

## Output

Answer with citations. If the search index was missing or produced zero candidates, say so.
Say whether the answer was filed, and where.
`;

export const KB_DIGEST_SKILL = `# /kb-digest

Turn the personal data tracked in this repo into a raw source, so the knowledge base learns about
the user and not only about the articles they read.

## Arguments

- (no args) — from the day after the last \`digest\` entry in \`.kh/log.md\` until today; the last 7 days
  if there is none
- \`YYYY-MM-DD..YYYY-MM-DD\` — an explicit period
- \`YYYY-Www\` — an ISO week, e.g. \`2026-W38\`

## Sources

Look in the app folder \`.kh/\` (or \`.lifeos/\` in older repos) and read what changed in the period.
\`git log --since=START --until=END -p -- PATH\` shows the lines added in the period for files
whose rows carry no date.

| File | What to take |
|---|---|
| \`*.actionlog.md\` | What was done, grouped by \`#tag\`, with counts |
| \`dump.md\`, \`quicknotes/\` | Ideas and notes worth keeping |
| \`*.todos.md\` | Tasks completed (\`- [x]\`) and tasks added |
| \`*.habit.csv\` | Completion rate and streak per habit |
| \`*.data-collection.csv\` | Measurements, with min / max / average and the trend |
| \`*.consumption.csv\` | Totals per category |
| \`*.events.csv\` | Events that happened or were planned |
| \`*.readitlater.json\`, \`*.bookmarks.json\` | New items, as leads for future sources |

Skip the knowledge base itself: \`.kh/raw/\`, \`.kh/wiki/\`, \`.kh/assets/\`, \`log.md\`,
\`index.kb.md\`, \`search.kb.json\`, \`schema.md\`. Never modify the files you read.
Leave out anything that looks like a secret (passwords, tokens, account numbers).

## Write the digest

Write \`.kh/raw/END-digest-LABEL.md\`, where LABEL is the ISO week or \`START_END\`:

\`\`\`markdown
---
title: "Personal digest: START – END"
url: ''
date: END
period: START..END
processed: false
tags: [digest, personal]
---

## Highlights
## Activities
## Habits
## Measurements
## Consumption
## Events
## Tasks
## Notes and ideas
## Leads
\`\`\`

Keep the numbers exact and say which file each section comes from. Drop empty sections.

## Finish

1. Append to \`.kh/log.md\`: \`## [YYYY-MM-DD] digest | START..END\`
2. Commit changes
3. Suggest running \`/kb-ingest\` so the digest updates the wiki pages about the user
   (goals, health, habits, projects)
`;

export const KB_INDEX_SKILL = `# /kb-index

Build or rebuild the search index for the knowledge base.

## Process

1. List all wiki pages in \`.kh/wiki/\`
2. For each page:
   - Read title, type and tags from frontmatter
   - Extract 10–20 key terms and noun phrases from the content (concepts, names, technologies, topics)
   - All index terms must be lowercase
3. Build the output structure (see format below)
4. Write to \`.kh/search.kb.json\`
5. Append to \`.kh/log.md\`: \`## [YYYY-MM-DD] index | N pages, M terms\`

## Output format

\`\`\`json
{
  "version": "1",
  "built": "YYYY-MM-DD",
  "pages": {
    "react-hooks.md": {
      "title": "React Hooks",
      "type": "concept",
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

export const KB_AGENT_CAPTURE_SKILL = `# /kb-agent-capture

Capture a note into \`.kh/raw/\` by **driving the \`kh-capture\` native window**
(native-sdk automation server) as an agent action — open it, type the note,
submit, and assert success. The same flow serves as the native app's end-to-end
acceptance test: it is how an agent both operates and verifies the GUI.

> For plain, reliable capture that doesn't need the GUI, prefer
> \`cli capture "<text>"\` — simpler and offline-safe. Use this when the point is
> to exercise or verify the native app through automation.

## Status

Experimental. Requires the \`kh-capture\` native app (native-sdk) built with
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

This repo is a personal knowledge base. Claude maintains the wiki; the user curates sources and
asks questions.

## Structure

\`\`\`
.kh/
  raw/          # Sources: pinned articles, clippings, notes, digests (frontmatter: processed: false → true)
  raw/processed # Sources already ingested
  journal/      # Human-readable monthly log — one YYYY-MM.md, each source verbatim
  assets/       # Images downloaded with sources, linked as /.kh/assets/...
  wiki/         # Compiled knowledge pages with backlinks
  schema.md     # Domain definition and page format rules
  index.kb.md   # Master index of all wiki pages
  log.md        # Append-only history of every operation
.claude/commands/
  kb-ingest.md  # /kb-ingest — compile raw sources into wiki pages + journal
  kb-index.md   # /kb-index  — build search index from wiki pages
  kb-lint.md    # /kb-lint   — audit, repair and suggest what to research next
  kb-ask.md     # /kb-ask    — answer questions from wiki, filing good answers back
  kb-digest.md  # /kb-digest — summarise tracked personal data into a raw source
  kb-agent-capture.md  # /kb-agent-capture — capture via the native app's automation server
.agents/skills/kh-ideas/  # Ideas skill for every agent (a copy lives in .claude/skills/)
\`\`\`

## Workflow

1. Sources land in \`.kh/raw/\` with \`processed: false\` — from the browser extension, the console's
   "Add note", \`/kb-session\`, or \`/kb-digest\`
2. Run \`/kb-ingest\` to compile them into \`.kh/wiki/\` pages, append each verbatim to the monthly
   journal \`.kh/journal/YYYY-MM.md\`, and move them to \`.kh/raw/processed/\`
3. Run \`/kb-index\` to rebuild \`.kh/search.kb.json\` from all wiki pages
4. Run \`/kb-ask <question>\` to query the knowledge base; file useful answers with \`--save\`
5. Run \`/kb-lint\` periodically to fix contradictions, stale claims, orphans and gaps
6. Run \`/kb-digest\` weekly so the wiki keeps up with the user's own data

## Page types

Every wiki page has a \`type\` in its frontmatter:

| Type | Holds |
|---|---|
| \`source\` | Summary of one raw source |
| \`entity\` | A person, organisation, product, place or project |
| \`concept\` | An idea, method or term |
| \`topic\` | An overview that ties entities and concepts together |
| \`question\` | A filed answer or analysis from \`/kb-ask\` |

Frontmatter: \`title\`, \`type\`, \`tags\`, \`sources\` (raw filenames or page titles), \`created\`, \`updated\`.
Filenames are the title in kebab-case, e.g. \`.kh/wiki/spaced-repetition.md\`.

## Log

\`.kh/log.md\` is append-only. Every operation adds one heading, followed by details:

\`\`\`
${KB_LOG_FORMAT}
\`\`\`

\`<op>\` is one of \`ingest\`, \`query\`, \`lint\`, \`index\`, \`digest\`.

## Ideas

Product and feature ideas live in \`.kh/ideas/<slug>.md\`, one file per idea, with a \`status\`
(\`seed\`, \`exploring\`, \`committed\`, \`shipped\`, \`parked\`, \`dropped\`) in the frontmatter and
the sections \`## Log\` (newest first, never edited), \`## Challenges\` (checked off, never removed)
and \`## Braindump\` (only grows). Follow the \`kh-ideas\` skill (\`.agents/skills/kh-ideas/SKILL.md\`)
before you create or change an idea; it says what goes where and how little to write.

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
type: concept
tags: [tag1, tag2, tag3]
sources: [1714000000000-article.md]
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

## Page Types

- \`source\`: Summary of one raw source
- \`entity\`: A person, organisation, product, place or project
- \`concept\`: An idea, method or term
- \`topic\`: An overview that ties entities and concepts together
- \`question\`: A filed answer or analysis

## Index Format

The \`.kh/index.kb.md\` file lists every page under the section for its type, with a one-line summary:

\`\`\`markdown
# Knowledge Base Index

## Topics
- [[Page Title 1]] — one-line summary

## Entities
- [[Page Title 2]] — one-line summary
\`\`\`

## Tags

Standard tags for categorization:

- \`concept\`: Fundamental ideas
- \`definition\`: Terminology and definitions
- \`procedure\`: Step-by-step processes
- \`reference\`: Reference materials
- \`example\`: Examples and case studies
- \`personal\`: Knowledge about the user, e.g. from \`/kb-digest\`

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
      '# Knowledge Base Index\n\nStart by reading the schema in `.kh/schema.md` to understand the structure.\n\n## Topics\n\n## Entities\n\n## Concepts\n\n## Sources\n\n## Questions\n',
    '.kh/log.md': '# Knowledge Base Log\n\nProcessing and audit history.\n',
    '.kh/raw/.gitkeep': '',
    '.kh/journal/.gitkeep': '',
    '.kh/wiki/.gitkeep': '',
    '.kh/ideas/.gitkeep': '',
    '.claude/commands/kb-ingest.md': KB_INGEST_SKILL,
    '.claude/commands/kb-index.md': KB_INDEX_SKILL,
    '.claude/commands/kb-lint.md': KB_LINT_SKILL,
    '.claude/commands/kb-ask.md': KB_ASK_SKILL,
    '.claude/commands/kb-session.md': KB_SESSION_SKILL,
    '.claude/commands/kb-digest.md': KB_DIGEST_SKILL,
    '.claude/commands/kb-agent-capture.md': KB_AGENT_CAPTURE_SKILL,
    ...KH_IDEAS_SKILL_FILES,
    'CLAUDE.md': KB_CLAUDE_MD,
    // The same instructions for agents that read AGENTS.md instead of CLAUDE.md.
    'AGENTS.md': KB_CLAUDE_MD,
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
    '.claude/commands/kb-digest.md': KB_DIGEST_SKILL,
    '.claude/commands/kb-agent-capture.md': KB_AGENT_CAPTURE_SKILL,
    ...KH_IDEAS_SKILL_FILES,
    'CLAUDE.md': KB_CLAUDE_MD,
    // The same instructions for agents that read AGENTS.md instead of CLAUDE.md.
    'AGENTS.md': KB_CLAUDE_MD,
  };
}
