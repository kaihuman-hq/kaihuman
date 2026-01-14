# Preparation Guide for Life OS v2

Before asking the Agent to start coding in the new repository, perform these file operations.

## 1. Setup New Repository
1.  Create a new directory for the project.
2.  Initialize git: `git init`.
3.  Initialize pnpm: `pnpm init`.
4.  Install Turbo: `npx create-turbo@latest` (select `pnpm`).

## 2. Agent Configuration (Crucial)
Select the files from your research repository and copy them to the locations in the new repository:

| Source File (Research Repo) | Destination (New Repo) | Purpose |
| :--- | :--- | :--- |
| `docs/agent/CURSORRULES.md` | **`.cursorrules`** | Defines strict coding rules & stack. |
| `docs/agent/PROJECT_CONTEXT.md` | **`.agent/PROJECT_CONTEXT.md`** | Explains the "Life OS" concept. |

## 3. Context & Roadmap (The Brain)
Copy the research artifacts into a reference folder so the Agent knows *what* to build.

| Source File (Research Repo) | Destination (New Repo) | Purpose |
| :--- | :--- | :--- |
| `docs/lifosy-roadmap.md` | **`.agent/research/roadmap.md`** | **The Master Plan**. |
| `docs/lifosy-tech-stack.md` | **`.agent/research/tech-stack.md`** | Architecture decisions. |
| `docs/lifosy-features.md` | **`.agent/research/features.md`** | v1 Feature specs (for porting). |

## 4. The First Prompt
Once files are in place, your first prompt to the Agent should be:

> "I have prepared the repository with context in `.agent/` and rules in `.cursorrules`. Please read `.agent/research/roadmap.md` and start executing **Part 1: Foundation**."
