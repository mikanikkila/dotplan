import fs from 'fs/promises';
import { join } from 'path';
import { generateClaudeConfig, AGENT_INSTRUCTIONS } from './agent-config.js';

/**
 * Setup Claude Code integration for dotplan
 */
export async function setupClaudeAgent(projectRoot) {
  const claudeDir = join(projectRoot, '.claude');
  const agentsDir = join(claudeDir, 'agents');

  // Create .claude directory structure
  await fs.mkdir(claudeDir, { recursive: true });
  await fs.mkdir(agentsDir, { recursive: true });

  // Create agent configuration
  const agentConfig = generateClaudeConfig();

  // Write agent configuration file
  const agentConfigPath = join(agentsDir, 'dotplan-memory.json');
  await fs.writeFile(
    agentConfigPath,
    JSON.stringify(agentConfig, null, 2)
  );

  // Create agent instructions file
  const agentInstructionsPath = join(agentsDir, 'dotplan-memory-instructions.md');
  await fs.writeFile(agentInstructionsPath, AGENT_INSTRUCTIONS);

  // Create slash command for easy invocation
  const commandsDir = join(claudeDir, 'commands');
  await fs.mkdir(commandsDir, { recursive: true });

  const memoryCommandPath = join(commandsDir, 'memory.md');
  const memoryCommand = `# Memory Command

Get current project context and memory from dotplan.

Run this before making changes to understand:
- Past architectural decisions
- Established patterns
- Active constraints
- Related plans

\`\`\`bash
npx dotplan context --json
npx dotplan decisions --json
npx dotplan patterns --json
npx dotplan constraints --json
\`\`\`
`;

  await fs.writeFile(memoryCommandPath, memoryCommand);

  // Create a plan command
  const planCommandPath = join(commandsDir, 'plan.md');
  const planCommand = `# Plan Command

Create a new architectural plan for the current work.

\`\`\`bash
# Get the task description from the user
read -p "Plan title: " TITLE
read -p "Description: " DESC

# Create the plan
npx dotplan create "$TITLE" -d "$DESC"

# Show next steps
echo "✓ Plan created. Edit .plan/plans/<plan-id>.yaml to add:"
echo "  - planning.problem"
echo "  - planning.approach"
echo "  - planning.constraints"
echo "  - planning.decisions"
\`\`\`
`;

  await fs.writeFile(planCommandPath, planCommand);

  // Create .claudeignore to prevent processing .plan database
  const claudeIgnorePath = join(claudeDir, '.claudeignore');
  const claudeIgnore = `.plan/index.db
.plan/index.db-shm
.plan/index.db-wal
.plan/.context/
`;

  await fs.writeFile(claudeIgnorePath, claudeIgnore);

  // Create README for Claude integration
  const readmePath = join(claudeDir, 'README.md');
  const readme = `# dotplan Claude Integration

This directory contains Claude Code configuration for the dotplan memory system.

## What's Included

### Agent: dotplan-memory

A specialized agent that manages architectural memory and context.

**Location:** \`.claude/agents/dotplan-memory.json\`

**Purpose:**
- Maintains project memory via dotplan
- Provides context before changes
- Documents decisions and patterns
- Ensures architectural consistency

### Slash Commands

#### /memory
Get current project context from dotplan.

\`\`\`bash
/memory
\`\`\`

Shows:
- Active plans
- Recent decisions
- Established patterns
- Active constraints

#### /plan
Create a new architectural plan.

\`\`\`bash
/plan
\`\`\`

## How It Works

When you use Claude Code:

1. **Before making changes:**
   - Run \`/memory\` to get context
   - Review past decisions and patterns
   - Check constraints

2. **When starting new work:**
   - Run \`/plan\` to create a plan
   - Document your approach
   - Add decisions as you make them

3. **While working:**
   - Update plan YAML files in \`.plan/plans/\`
   - Document patterns as you establish them
   - Add constraints if new rules emerge

4. **When done:**
   - Complete the plan: \`npx dotplan complete\`
   - Document what was built

## Manual Usage

You can also use dotplan commands directly:

\`\`\`bash
# Get context
npx dotplan context --json

# Create plan
npx dotplan create "Add user authentication"

# View decisions
npx dotplan decisions

# Complete plan
npx dotplan complete --summary "Auth implemented"
\`\`\`

## Benefits

✅ **Persistent Memory** - Context survives across sessions
✅ **Architectural Consistency** - Follow established patterns
✅ **Decision History** - Understand why choices were made
✅ **Automatic Documentation** - Plans serve as living docs
✅ **Better Collaboration** - Team shares same context

## Files Structure

\`\`\`
.claude/
├── agents/
│   ├── dotplan-memory.json              # Agent configuration
│   └── dotplan-memory-instructions.md   # Agent instructions
├── commands/
│   ├── memory.md                        # /memory command
│   └── plan.md                          # /plan command
├── .claudeignore                        # Ignore database files
└── README.md                            # This file

.plan/
├── plans/                               # Plan YAML files (commit these)
│   └── *.yaml
├── index.db                             # Database (don't commit)
├── .context/                            # Active plan tracking
└── config.json                          # Configuration
\`\`\`

## Configuration

The agent is configured in \`.claude/agents/dotplan-memory.json\`.

You can customize:
- Agent name
- Instructions
- Interaction patterns

## Troubleshooting

### Agent not showing up

Restart Claude Code to load the new agent configuration.

### Commands not working

Ensure dotplan is initialized:
\`\`\`bash
npx dotplan init
\`\`\`

### Database errors

Rebuild the index:
\`\`\`bash
npx dotplan rebuild-index
\`\`\`

## Learn More

- dotplan docs: \`npx dotplan --help\`
- Create plan: \`npx dotplan create "Title"\`
- Get context: \`npx dotplan context\`
`;

  await fs.writeFile(readmePath, readme);

  // Add .claude to project's .gitignore
  const gitignorePath = join(projectRoot, '.gitignore');
  try {
    let gitignoreContent = '';
    try {
      gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
    } catch (err) {
      // .gitignore doesn't exist, create it
    }

    // Only add if not already present
    if (!gitignoreContent.includes('.claude')) {
      const claudeIgnoreEntry = '\n# Claude Code integration (project-specific)\n.claude/\n';
      await fs.writeFile(gitignorePath, gitignoreContent + claudeIgnoreEntry);
    }
  } catch (err) {
    // Ignore errors - not critical
  }

  return {
    claudeDir,
    agentConfigPath,
    commandsCreated: ['memory', 'plan']
  };
}
