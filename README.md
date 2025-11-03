# dotplan - CONCEPT RELEASE 🧠

> Persistent memory and decision tracking for AI coding assistants

**dotplan** gives AI assistants a memory that persists across sessions. It tracks your architectural decisions, established patterns, and project constraints so you never have to re-explain context to your AI assistant again.

## Table of Contents

- [Why dotplan?](#why-dotplan)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Complete Command Reference](#complete-command-reference)
- [Workflow Examples](#workflow-examples)
- [Using with AI Assistants](#using-with-ai-assistants)
- [How It Works](#how-it-works)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

---

## Why dotplan?

### The Problem

AI coding assistants forget everything between sessions. Every time you start a new conversation, you have to:
- Re-explain your architecture
- Repeat past decisions and why they were made
- Remind the AI about established patterns
- Warn about constraints it should respect

**This wastes 2-3 hours per developer per day.**

### The Solution

dotplan creates a persistent memory system:
- ✅ **Plans** document what you're building and why
- ✅ **Decisions** track architectural choices with rationale
- ✅ **Patterns** record established code conventions
- ✅ **Constraints** define rules that must be followed
- ✅ **Context** provides AI with relevant history for any file

All stored in human-readable YAML files and indexed for instant querying.

---

## Installation

### Option 1: Use with npx (Recommended)

No installation required! Run commands directly:

```bash
npx dotplan init
npx dotplan create "My first plan"
```

### Option 2: Install Globally

Install once, use anywhere:

```bash
npm install -g dotplan

# Now you can use without npx
dotplan init
dotplan create "My first plan"
```

### Option 3: Install as Dev Dependency

Add to your project:

```bash
npm install --save-dev dotplan

# Use via npm scripts or npx
npx dotplan init
```

### Claude Code Integration

If you're using Claude Code, initialize with the `--claude` flag to get a dedicated memory agent:

```bash
npx dotplan init --claude
```

This creates a `.claude/` directory **in your project** with slash commands (`/memory`, `/plan`) and a sub-agent that automatically manages your project's architectural memory. [See full Claude Code integration docs](#claude-code-integration).

**Note:** The `.claude/` directory is project-specific and should not be committed to git (it's auto-added to `.gitignore`).

---

## Getting Started

### 1. Initialize in Your Project

Navigate to your project directory and run:

```bash
npx dotplan init
```

This creates:
```
your-project/
├── .plan/
│   ├── plans/           # Your plan YAML files (commit to Git)
│   ├── .context/        # Active plan tracking (gitignored)
│   ├── index.db         # SQLite query cache (gitignored)
│   ├── config.json      # Configuration
│   └── .gitignore       # Auto-configured
```

**What gets committed to Git?**
- ✅ `.plan/plans/*.yaml` - Your plan files (version controlled)
- ✅ `.plan/config.json` - Configuration
- ❌ `.plan/index.db*` - Database cache (auto-rebuilt)
- ❌ `.plan/.context/` - Temporary state

### 2. Create Your First Plan

```bash
npx dotplan create "Add user authentication"
```

This creates a plan file at `.plan/plans/2025-11-03-add-user-authentication-abc123.yaml`:

```yaml
id: 2025-11-03-add-user-authentication-abc123
timestamp: 2025-11-03T10:30:00.000Z
status: draft
title: Add user authentication
description: ""
planning:
  problem: ""
  approach: ""
  constraints: []
  decisions: []
implementation:
  actual_approach: ""
  deviations: []
  patterns_established: []
relationships:
  enables: []
  blocks: []
  modifies: []
affected_files: []
```

**The plan is automatically set as your active plan.**

### 3. Edit the Plan

Open the YAML file in your editor and fill in the details:

```yaml
planning:
  problem: "Users need secure authentication to access the application"
  approach: "Implement JWT-based authentication with refresh tokens"
  constraints:
    - "Must support OAuth2 providers (Google, GitHub)"
    - "Session tokens must expire after 24 hours"
  decisions:
    - description: "Use JWT instead of session cookies"
      rationale: "Stateless authentication scales better for microservices"
      alternatives:
        - "Express sessions with Redis"
        - "Passport.js with sessions"
```

**The file watcher automatically detects your changes and updates the database.**

### 4. Query Context

At any point, check what's relevant:

```bash
# See current context
npx dotplan context

# Get context for a specific file
npx dotplan context --file src/auth/login.js

# Search for specific topics
npx dotplan context "authentication"

# View all decisions
npx dotplan decisions

# See established patterns
npx dotplan patterns
```

### 5. Complete the Plan

When you're done implementing:

```bash
npx dotplan complete --summary "JWT auth implemented with Google OAuth"
```

This marks the plan as completed and clears it as the active plan.

---

## Complete Command Reference

### Core Commands

#### `init`

Initialize dotplan in your project.

```bash
npx dotplan init [options]

Options:
  --no-git    Skip git hooks setup
  --claude    Setup Claude Code integration (adds memory agent and slash commands)
```

**Examples:**
```bash
cd my-project
npx dotplan init

# With Claude Code integration
npx dotplan init --claude

# Skip git hooks
npx dotplan init --no-git
```

#### `create [title]`

Create a new plan and set it as active.

```bash
npx dotplan create [title] [options]

Options:
  -d, --description <desc>    Plan description
  -t, --template <name>       Use template (default: 'default')

Examples:
  npx dotplan create "Add payment processing"
  npx dotplan create "Refactor database layer" -d "Move from SQL to MongoDB"
```

#### `activate <planId>`

Set a plan as the currently active plan.

```bash
npx dotplan activate <planId>

Example:
  npx dotplan activate 2025-11-03-add-auth-abc123
```

#### `complete [planId]`

Mark a plan as completed. Uses active plan if no ID provided.

```bash
npx dotplan complete [planId] [options]

Options:
  --summary <text>    Completion summary

Examples:
  npx dotplan complete --summary "Auth implemented successfully"
  npx dotplan complete 2025-11-03-add-auth-abc123 --summary "Done"
```

#### `update <planId>`

Update plan fields.

```bash
npx dotplan update <planId> --set <json>

Examples:
  # Change status
  npx dotplan update plan-id --set '{"status":"active"}'

  # Update approach
  npx dotplan update plan-id --set '{"planning":{"approach":"New approach"}}'
```

#### `list`

List all plans.

```bash
npx dotplan list [options]

Options:
  -s, --status <status>    Filter by status (draft|active|completed|deprecated)
  --limit <n>              Limit results (default: 20)

Examples:
  npx dotplan list
  npx dotplan list --status active
  npx dotplan list --limit 50
```

#### `brief`

Get a project summary with statistics and active plans.

```bash
npx dotplan brief

Output:
  📊 Project Brief

  Statistics:
    Total Plans: 15
    Active: 2
    Completed: 12

  Recent Activity:
    • Add payment processing (2025-11-03)
    • Refactor auth system (2025-11-02)
```

### Query Commands

#### `context [query]`

Get relevant context for current work or search for specific topics.

```bash
npx dotplan context [query] [options]

Options:
  -f, --file <path>    Get context for specific file
  --json               Output as JSON (for AI consumption)

Examples:
  npx dotplan context
  npx dotplan context "authentication"
  npx dotplan context --file src/auth/login.js
  npx dotplan context --json
```

#### `decisions`

List all architectural decisions.

```bash
npx dotplan decisions [options]

Options:
  --type <type>    Filter by decision type
  --json           Output as JSON

Example:
  npx dotplan decisions
  npx dotplan decisions --type architecture
  npx dotplan decisions --json
```

#### `patterns`

List established code patterns.

```bash
npx dotplan patterns [options]

Options:
  --json    Output as JSON

Example:
  npx dotplan patterns
```

#### `constraints`

List active constraints.

```bash
npx dotplan constraints [options]

Options:
  --json    Output as JSON

Example:
  npx dotplan constraints
```

#### `file-history <path>`

Show modification history for a file.

```bash
npx dotplan file-history <path> [options]

Options:
  --json    Output as JSON

Example:
  npx dotplan file-history src/auth/login.js
```

#### `related <planId>`

Show plans related to a specific plan.

```bash
npx dotplan related <planId> [options]

Options:
  --json    Output as JSON

Example:
  npx dotplan related 2025-11-03-add-auth-abc123
```

### Maintenance Commands

#### `rebuild-index`

Rebuild the database index from YAML files.

```bash
npx dotplan rebuild-index

# Useful when:
# - Database gets corrupted
# - You manually edited YAML files while system was off
# - You pulled changes from Git
```

#### `verify <files...>`

Verify implementation matches plan constraints.

```bash
npx dotplan verify <files...>

Example:
  npx dotplan verify src/auth/*.js
```

---

## Workflow Examples

### Workflow 1: Starting a New Feature

```bash
# 1. Create a plan
npx dotplan create "Add dark mode support"

# 2. Edit the plan file in .plan/plans/
# Add problem, approach, constraints, decisions

# 3. Start coding with AI assistant
# AI runs: npx dotplan context --json
# AI gets all relevant history

# 4. Mark as complete when done
npx dotplan complete --summary "Dark mode implemented with system preference detection"
```

### Workflow 2: Working on Legacy Code

```bash
# 1. Check file history
npx dotplan file-history src/legacy/old-module.js

# 2. See what decisions were made
npx dotplan decisions

# 3. Check constraints before modifying
npx dotplan constraints

# 4. Create refactoring plan
npx dotplan create "Refactor legacy module"

# 5. Document new patterns
# Edit plan YAML to add patterns_established
```

### Workflow 3: Team Collaboration

```bash
# 1. Pull latest changes
git pull

# 2. Rebuild index (in case plans changed)
npx dotplan rebuild-index

# 3. Check what team is working on
npx dotplan list --status active

# 4. Check project status
npx dotplan brief

# 5. Create your plan
npx dotplan create "Your feature"

# 6. Commit plan with code
git add .plan/plans/
git commit -m "feat: add feature with plan"
```

### Workflow 4: Code Review

```bash
# 1. Get context for changed files
npx dotplan file-history src/component.js

# 2. Check if implementation follows patterns
npx dotplan patterns

# 3. Verify constraints are met
npx dotplan verify src/component.js

# 4. Review related plans
npx dotplan related plan-id
```

---

## Using with AI Assistants

### General Integration

Tell your AI assistant to use dotplan commands:

```
"Before you start coding, run: npx dotplan context --json

This will give you the project history, decisions, patterns, and constraints.
Always check this before making changes."
```

### Claude Code Integration

dotplan includes built-in Claude Code integration with a dedicated memory agent.

#### Setup

Initialize with Claude integration:

```bash
npx dotplan init --claude
```

This creates:
- `.claude/agents/dotplan-memory.json` - Memory management agent
- `.claude/commands/memory.md` - `/memory` slash command
- `.claude/commands/plan.md` - `/plan` slash command
- `.claude/README.md` - Integration documentation

**Restart Claude Code to load the agent.**

#### Usage

**Slash Commands:**

```bash
# Get project context and memory
/memory

# Create a new plan
/plan
```

**The memory agent automatically:**
1. Checks context before making changes
2. Creates plans for new features
3. Documents decisions with rationale
4. Updates plans as work progresses
5. Maintains architectural consistency

**Example conversation:**

```
You: "Add user authentication to the app"

Claude Code:
1. Runs: npx dotplan context --json
2. Reviews: past decisions, patterns, constraints
3. Creates plan: npx dotplan create "Add JWT authentication"
4. Implements following established patterns
5. Documents decisions in plan YAML
6. Completes: npx dotplan complete --summary "Auth added"
```

#### Agent Configuration

The dotplan-memory agent is defined in `.claude/agents/dotplan-memory.json`:

```json
{
  "name": "dotplan-memory",
  "description": "Manages architectural memory and context",
  "instructions": "... detailed instructions ...",
  "interactionPatterns": [
    "Proactively checks context before making changes",
    "Creates plans for new features",
    "Documents decisions with clear rationale"
  ]
}
```

You can customize the agent instructions to match your workflow.

### GitHub Copilot / Cursor

In your project's instructions (`.github/copilot-instructions.md` or `.cursorrules`):

```markdown
# Project Memory

Before making changes, always check project context:

```bash
npx dotplan context --json
npx dotplan patterns --json
npx dotplan constraints --json
```

This provides the architectural history and rules you must follow.
```

### Custom AI Workflows

```bash
# Get context as JSON for AI processing
CONTEXT=$(npx dotplan context --json)
echo $CONTEXT | jq '.context.relevant_plans'

# Check decisions before making changes
DECISIONS=$(npx dotplan decisions --json)

# Verify constraints are met
npx dotplan verify src/**/*.js
```

---

## How It Works

### Architecture Overview

dotplan uses a **YAML-as-source-of-truth** architecture:

1. **YAML files** (`.plan/plans/*.yaml`) are the **authoritative source**
   - Human-readable and editable
   - Version controlled in Git
   - Can be manually edited anytime

2. **SQLite database** (`.plan/index.db`) is a **disposable query cache**
   - Built automatically from YAML files
   - Enables fast full-text search
   - Safe to delete (rebuilds automatically)
   - NOT committed to Git

3. **File watcher** monitors YAML files
   - Detects external edits
   - Auto-reindexes changes
   - Keeps database in sync

### Data Flow

```
Create/Update → YAML File → File Watcher → Database Index
     ↓                            ↓              ↓
  Git Commit               Auto Re-index    Fast Queries
```

### Key Principles

✅ **Single Source of Truth**: YAML files are authoritative
✅ **Auto-Sync**: File watcher keeps database updated
✅ **Disposable Cache**: Database can be deleted/rebuilt anytime
✅ **Git-Friendly**: YAML files version control perfectly
✅ **No Network**: Everything stays local

---

## Best Practices

### 1. Commit Plans with Code

```bash
# Good: Commit plan and implementation together
git add .plan/plans/2025-11-03-add-feature.yaml
git add src/feature.js
git commit -m "feat: add feature (plan:2025-11-03-add-feature)"
```

### 2. Document Decisions as You Go

Don't wait until the end. Update your plan YAML file as you make decisions:

```yaml
decisions:
  - description: "Use Redis for caching instead of Memcached"
    rationale: "Better persistence and data structure support"
    alternatives:
      - "Memcached"
      - "In-memory cache"
```

### 3. Record Patterns When Established

When you establish a new pattern:

```yaml
implementation:
  patterns_established:
    - "All API endpoints use async/await"
    - "Error handling with try/catch and custom error classes"
    - "Database queries use repository pattern"
```

### 4. Set Clear Constraints

Define rules that must be followed:

```yaml
constraints:
  - "No direct database access outside repository layer"
  - "All user inputs must be validated with Zod schemas"
  - "API responses must follow JSON:API spec"
```

### 5. Keep Active Plan Current

Only have one active plan at a time:

```bash
# Complete old plan before starting new
npx dotplan complete old-plan-id
npx dotplan create "New feature"
```

### 6. Use Descriptive Plan Titles

```bash
# Good
npx dotplan create "Add JWT authentication with refresh tokens"
npx dotplan create "Refactor user service to use repository pattern"

# Bad
npx dotplan create "Fix stuff"
npx dotplan create "Update"
```

### 7. Regular Maintenance

```bash
# Weekly: Review and complete old plans
npx dotplan list --status active

# After git pull: Rebuild index
npx dotplan rebuild-index

# Monthly: Review deprecated plans
npx dotplan list --status deprecated
```

---

## Troubleshooting

### Database Out of Sync

**Problem**: Database doesn't reflect recent YAML changes.

**Solution**:
```bash
npx dotplan rebuild-index
```

### File Watcher Not Working

**Problem**: Manual YAML edits not being indexed.

**Solution**: The file watcher runs during `init` and `context` commands. If you edited YAML manually:
```bash
npx dotplan rebuild-index
```

### Cannot Find Plan

**Problem**: `npx dotplan complete` says "No active plan"

**Solution**: Either specify plan ID or activate a plan:
```bash
# Option 1: Specify plan ID
npx dotplan complete 2025-11-03-plan-id

# Option 2: Activate a plan first
npx dotplan activate 2025-11-03-plan-id
npx dotplan complete
```

### Database Corruption

**Problem**: Database errors or weird behavior.

**Solution**: Delete and rebuild:
```bash
rm .plan/index.db*
npx dotplan rebuild-index
```

The database is disposable - all data is in YAML files!

### Git Conflicts in Plan Files

**Problem**: Merge conflicts in YAML files.

**Solution**:
1. Resolve conflicts in the YAML file (they're human-readable)
2. Rebuild index after resolving:
```bash
npx dotplan rebuild-index
```

### Command Not Found

**Problem**: `dotplan: command not found`

**Solution**: Use `npx`:
```bash
npx dotplan init
```

Or install globally:
```bash
npm install -g dotplan
```

---

## FAQ

### Do I need to install dotplan in every project?

No! Use `npx dotplan` to run without installing:
```bash
npx dotplan init
```

### Should I commit the database to Git?

No. The `.gitignore` is auto-configured to exclude `.plan/index.db`. Only commit YAML files.

### Can I manually edit plan YAML files?

Yes! That's encouraged. The file watcher will detect changes and update the database automatically.

### What happens if I delete the database?

Nothing bad! Just run `npx dotplan rebuild-index` and it rebuilds from YAML files.

### Can multiple people work on the same plan?

Yes. Since plans are YAML files in Git, they merge like any other file. Use Git's conflict resolution if needed.

### How do I share plans with my team?

Commit `.plan/plans/*.yaml` to Git. Everyone gets the same plans.

### Can I use this without AI assistants?

Yes! It's a great documentation system even without AI. Use it to track decisions and patterns manually.

### How much disk space does it use?

Minimal. YAML files are text (few KB each). Database is also small (usually < 1MB).

### Does it work with monorepos?

Yes. Run `npx dotplan init` in each package or at the root.

### Can I export plans?

Plans are already exported as YAML! Just copy `.plan/plans/*.yaml` files.

### What Node.js version do I need?

Node.js 18 or higher.

### Is it safe for private projects?

Yes. All data stays local. No network calls. No external services.

---

## Configuration

The `.plan/config.json` file controls behavior:

```json
{
  "version": "0.1.0",
  "settings": {
    "autoIndex": true,        // Auto-rebuild index on startup
    "gitIntegration": true    // Setup git hooks (if available)
  }
}
```

---

## Database Schema

For reference, the database structure:

- **plans** - Core plan information with full content as JSON
- **decisions** - Architectural decisions extracted from plans
- **patterns** - Code patterns established in implementations
- **constraints** - Rules and constraints from planning phase
- **file_plans** - Mapping of files to plans that touched them
- **plan_edges** - Relationships between plans (enables, blocks, modifies)
- **plan_search** - FTS5 full-text search index

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

---

## License

MIT License - see LICENSE file for details

---

## Support

- **Issues**: [GitHub Issues](https://github.com/mikanikkila/dotplan/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mikanikkila/dotplan/discussions)

---

**Built to give AI coding assistants the persistent memory they need.**
