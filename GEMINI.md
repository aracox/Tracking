# GEMINI.md

This file provides guidance to Gemini / Antigravity when working with code in this repository.

<!-- The behavioral guidelines below are kept identical in CLAUDE.md and AGENTS.md. Edit all three together. -->

---

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

Tradeoff: These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

# Repository Guidelines

This is a blank starter template. There is **no application code, tests, build system, package manager, or git history yet**. Do not invent build, lint, or test commands — none are configured.

## Project Structure & Module Organization

As the project grows, keep the layout predictable:

- `src/` — application code
- `tests/` — automated tests, mirroring `src/` paths when practical
- `assets/` — static files; `docs/` — project documentation
- Keep generated output, dependencies, credentials, and local environment files out of version control.

Document any intentional deviation from this structure in `README.md`.

## Build, Test, and Development Commands

No build system or package manager is configured yet. When the first source code lands, add the project's canonical commands to `README.md` and keep them reproducible from a clean checkout — for example:

```sh
npm run dev    # run the local development server
npm test       # run the automated test suite
npm run build  # create a production build
```

Prefer package-manager scripts, Make targets, or equivalent checked-in task definitions over undocumented manual steps.

## Coding Style & Naming Conventions

Commit only formatted code, following the formatter and linter chosen for the language. Use 2-space indentation unless the adopted formatter specifies otherwise. Naming:

- `kebab-case` for files and directories
- `camelCase` for variables and functions
- `PascalCase` for classes, types, and UI components

Add formatting and linting configuration alongside the first source code changes.

## Testing Guidelines

Add tests with new behavior and bug fixes. Name test files after the unit under test (e.g. `tests/user-service.test.ts`) and make descriptions state observable outcomes. Run the full test command before opening a pull request. Add coverage requirements only after a test framework is chosen.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects (e.g. `Add user validation`). Keep commits focused; don't mix formatting-only changes with functional ones. Pull requests should explain the change, note validation performed, link relevant issues, and include screenshots for user-visible changes.

## Security & Configuration

Never commit secrets, API keys, or local `.env` files. Provide safe placeholders in `.env.example` and document required configuration without real values.

## Cross-assistant consultation skills

The template ships read-only consultation skills that let each assistant get an independent second opinion from another. All shell out to locally installed, authenticated CLIs and stay **read-only** (no editing, commits, or secrets in prompts).

For **Antigravity / Gemini** (under `.gemini/skills/`) and **Claude Code** (under `.claude/skills/`):

- `.gemini/skills/consult-codex/scripts/consult-codex.sh "<request>"` — asks the OpenAI **Codex** CLI (`codex exec`, read-only sandbox, high reasoning). Prints Codex's final answer on stdout. See `.gemini/skills/consult-codex/SKILL.md`.
- `.gemini/skills/consult-claude/scripts/consult-claude.sh "<request>"` — asks the **Claude Code** CLI (`claude -p`, read-only plan mode, high effort). Prints Claude's answer on stdout. See `.gemini/skills/consult-claude/SKILL.md`.

For the **Codex CLI** (under `.codex/skills/`, not read by Gemini) — an orchestration system that routes tasks to other models:

- `.codex/skills/consult-claude/scripts/consult-claude.sh "<request>"` — runs `claude -p` in plan mode (`--model sonnet --effort high --max-turns 30`, JSON output).
- `.codex/skills/consult-antigravity/scripts/consult-antigravity.sh "<request>"` — runs the `agy` CLI in plan/print mode.

## Orchestration skills (Gemini / Antigravity)

`.gemini/skills/` also ships two skills that route work between Antigravity and the consult-* CLIs above. Antigravity should invoke them proactively when the trigger applies, not wait to be told:

- **`orchestrator`** — invoke when the user says the literal phrase "do think". Classifies the task, then routes: very complex/ambiguous/cross-cutting work stays with Antigravity itself; bounded complex work (focused review, implementation plan) goes to `consult-codex` for advice first; generic/simple work goes to `consult-claude` for advice first. Antigravity always does the actual implementation. See `.gemini/skills/orchestrator/SKILL.md`.
- **`looping-engineer`** — invoke when the user asks to complete a goal end to end (or explicitly names the skill). Runs a full define-done → route-work → execute-until-verified → deliver loop, delegating only analysis/review to `consult-codex` or `consult-claude` while Antigravity remains the implementation owner. See `.gemini/skills/looping-engineer/SKILL.md`.

Mirrors of both exist under `.claude/skills/` (Claude as owner) and `.codex/skills/` (Codex as owner) for their respective CLIs.
