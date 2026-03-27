# Plan: Deep Claude + kaihuman Integration

## Current State

kaihuman already has AI integration, but it's shallow — it calls `claude -p "<prompt>"` as a subprocess with no context about your actual life OS data. Claude gets a raw prompt with no knowledge of your todos, habits, notes, or file structure.

The gap: **Claude can't see your data.** It's answering in the dark.

---

## Integration Layers (Priority Order)

---

### Layer 1 — CLAUDE.md in Your Data Repo (highest ROI, zero code)

**What:** Add a `CLAUDE.md` to your personal kaihuman data repository (the GitHub repo you store your life OS files in). This gives Claude permanent, automatic context whenever you open that repo.

**Why:** Every time you use `claude` in that repo, it reads this file. Claude will know your exact file structure, naming conventions, data formats, and what you care about — without you having to re-explain it.

**What to include:**
```markdown
# My Life OS — kaihuman

## Repository Structure
- `inbox.md` — capture buffer, process weekly
- `todo/` — daily todos: `YYYY-MM-DD.md`
- `habits/` — habit tracking: one file per week `YYYY-WXX.md`
- `time/` — time logs: `YYYY-MM-DD.md`
- `notes/` — permanent notes and knowledge
- `daily/` — daily reviews and reflections
- `dashboard.config.json` — kaihuman dashboard config

## Formats
- Todos: `- [ ] [P1] Task title [1h] @project #tag`
- Habits: `- [x] Habit name` with date headers
- Time: `## Project | start–end | duration | notes`

## How Claude Should Help
- When I ask for a review: read today's files, synthesize, suggest priorities
- When I add a note: help structure it into the right file
- Never modify historical entries — only append or create new files
- Commit message format: `kaihuman: brief description`
```

**Action:** Create this file once in your data repo. Done. Instant improvement.

---

### Layer 2 — Context-Rich AI Prompts in the CLI (small code change, big impact)

**Current behavior (`app.rs`):** The AI prompt screen takes your text, runs `claude -p "<your text>"`, and shows the output. Claude sees only what you typed.

**Improved behavior:** Before sending to Claude, automatically inject relevant context from your currently-open repo files.

**How:** Modify the AI prompt handler in `app.rs` to build a richer prompt:

```rust
// Instead of: claude -p "{user_prompt}"
// Build:
let context_prompt = format!(
    "Context from my life OS repo ({}):\n\n{}\n\n---\n\nUser request: {}",
    repo_name,
    read_context_files(repo_path), // inbox.md, today's todo, dashboard config
    user_prompt
);
```

The `read_context_files` function reads:
1. `inbox.md` (always — it's the capture buffer)
2. `todo/YYYY-MM-DD.md` for today
3. `dashboard.config.json` (to know the structure)
4. The currently-open file in the editor (if any)

This keeps prompts focused and cheap (Haiku-level) while giving Claude real signal.

---

### Layer 3 — MCP Server for kaihuman Data (medium effort, highest capability)

**What:** Build a TypeScript MCP server in `packages/` that exposes your life OS data as tools Claude can call natively. This is the difference between "Claude guesses" and "Claude queries your actual data."

**Architecture:**

```
packages/
  mcp-server/          # new package
    src/
      index.ts         # MCP server entry point
      tools/
        todos.ts       # read_todos(date), create_todo(text, project)
        habits.ts      # read_habits(week), log_habit(name, date)
        notes.ts       # search_notes(query), create_note(title, body)
        files.ts       # list_files(dir), read_file(path)
```

**The 5 essential tools:**

| Tool | What it does |
|------|-------------|
| `read_today` | Returns todos + habits + inbox for today — the "daily briefing" |
| `search_notes(query)` | Full-text search across all your markdown notes |
| `create_note(title, content, category)` | Adds a properly-formatted note to the right place |
| `log_habit(name)` | Marks a habit done today |
| `read_week_summary` | Aggregates the week's todos, habits, time |

**Integrate with Claude Code:**

```json
// ~/.claude/settings.json
{
  "mcpServers": {
    "kaihuman": {
      "command": "node",
      "args": ["/path/to/kaihuman/mcp-server/dist/index.js"],
      "env": {
        "KAIHUMAN_REPO_PATH": "~/.config/com/lifosy/cli/repos/your-user/your-repo"
      }
    }
  }
}
```

Once registered, Claude can call these tools automatically when you ask questions about your life OS. You get natural-language queries over your entire history.

---

### Layer 4 — Custom Slash Commands (Claude Code skills)

Create `~/.claude/commands/` with skills tailored to your workflow:

**`/kh-review`** — Morning or evening review
```markdown
Read today's todos, habits, and inbox from the kaihuman repo at
~/.config/com/lifosy/cli/repos/. Summarize: what's done, what's pending,
any habit streaks at risk. Keep it under 200 words, actionable tone.
```

**`/kh-capture $ARGUMENTS`** — Capture anything to inbox
```markdown
Append the following to inbox.md in the active kaihuman repo, formatted
as a bullet with today's date: $ARGUMENTS
Then commit with message "kaihuman: capture note"
```

**`/kh-plan`** — Plan tomorrow
```markdown
Read pending todos, recent habits, and any notes from the last 3 days.
Suggest a focused plan for tomorrow: 3 priority tasks, habits to reinforce,
and one thing to let go of. Output as a new file todo/YYYY-MM-DD.md
```

These live in `~/.claude/commands/` and are available in any Claude Code session via `/kh-*`.

---

### Layer 5 — Claude Code Hooks for Auto-Capture

**What:** Configure hooks in `~/.claude/settings.json` to automatically log Claude Code work sessions into your life OS.

**Session end hook** — captures what you did:
```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "echo \"- $(date +%H:%M) Claude session in $(basename $PWD)\" >> ~/.config/com/lifosy/cli/repos/<owner>/<repo>/daily/$(date +%Y-%m-%d).md"
      }]
    }]
  }
}
```

**Git commit hook** — logs commits to daily work log:
```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "bash ~/.claude/hooks/log-commits-to-kaihuman.sh"
      }]
    }]
  }
}
```

The script checks if the Bash command was a `git commit`, extracts the message, and appends it to today's daily file. Gives you automatic git commit history in your life OS without thinking about it.

---

### Layer 6 — AI Chat History in CLI (roadmap item)

This is already on your roadmap. The architecture:

1. Add a `chat_history` table to the existing SQLite cache in `db.rs`:
   ```sql
   CREATE TABLE chat_history (
     id TEXT PRIMARY KEY,
     repo TEXT NOT NULL,
     role TEXT NOT NULL,  -- 'user' | 'assistant'
     content TEXT NOT NULL,
     timestamp INTEGER NOT NULL
   );
   ```

2. Persist messages in the `AiPrompt`/`AiResponse` state in `app.rs`
3. Display last N messages as context in the prompt screen
4. On send, include last 5 turns as context when calling `claude -p`

This gives kaihuman conversational memory across sessions, scoped per repo.

---

### Layer 7 — Structured Context Injection via Local Server

**Current:** The local server at port 4000 just proxies chat messages with minimal context.

**Enhanced:** Before forwarding to Claude, the server reads the current repo state and builds a system prompt:

```typescript
// apps/cli/src/server.rs → enhanced /chat handler
async fn chat_handler(msg: ChatMessage, state: AppState) -> Response {
    let repo_path = state.active_repo_path();
    let context = build_context(repo_path).await; // reads key files

    let enriched = EnrichedMessage {
        system: context.to_system_prompt(),
        message: msg.message,
        provider: msg.provider,
    };

    forward_to_claude(enriched).await
}
```

This makes the browser extension and web console just as context-aware as the CLI without any changes to those apps.

---

## Implementation Priority

| # | Layer | Effort | Impact | Do When |
|---|-------|--------|--------|---------|
| 1 | CLAUDE.md in data repo | 30 min | High | Now |
| 2 | Context-rich CLI prompts | 2–3h | High | Next sprint |
| 4 | Custom slash commands | 1h | High | Now |
| 5 | Hooks for auto-capture | 1h | Medium | Now |
| 6 | AI chat history (SQLite) | 3–4h | Medium | Next sprint |
| 3 | MCP server | 1–2 days | Very high | After above |
| 7 | Enriched local server | 2–3h | Medium | After MCP |

---

## Quick Wins You Can Do Today

1. **CLAUDE.md in your data repo** — 30 minutes, immediate improvement to every Claude session
2. **Custom `/kh-review` command** — create `~/.claude/commands/kh-review.md`, use it daily
3. **Session log hook** — one JSON edit in `~/.claude/settings.json`, automatic journaling forever

The MCP server (Layer 3) is the biggest long-term investment — it's what makes Claude a true life OS partner rather than a smart search box. But the quick wins above give you 80% of the value in a fraction of the time.
