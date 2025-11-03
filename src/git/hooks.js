import { execSync } from 'child_process';
import fs from 'fs/promises';
import { join } from 'path';

export class GitIntegration {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.gitDir = join(projectRoot, '.git');
    this.hooksDir = join(this.gitDir, 'hooks');
  }

  async setupHooks() {
    // Check if this is a git repository
    try {
      await fs.access(this.gitDir);
    } catch {
      throw new Error('Not a git repository');
    }

    // Create hooks directory if it doesn't exist
    await fs.mkdir(this.hooksDir, { recursive: true });

    // Install commit-msg hook
    await this._installCommitMsgHook();

    // Install post-commit hook
    await this._installPostCommitHook();

    // Install pre-push hook
    await this._installPrePushHook();
  }

  async _installCommitMsgHook() {
    const hookPath = join(this.hooksDir, 'commit-msg');
    
    const hookContent = `#!/bin/sh
# AI Planner commit-msg hook
# Extracts plan references from commit messages

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat $COMMIT_MSG_FILE)

# Check for plan references (e.g., "plan:auth-system-v1")
if echo "$COMMIT_MSG" | grep -q "plan:"; then
  PLAN_ID=$(echo "$COMMIT_MSG" | grep -o "plan:[a-z0-9-]*" | cut -d: -f2)
  
  # Update plan with commit info
  npx dotplan update-plan $PLAN_ID --commit "$(git rev-parse HEAD)"
fi

exit 0
`;

    await fs.writeFile(hookPath, hookContent);
    await fs.chmod(hookPath, '755');
  }

  async _installPostCommitHook() {
    const hookPath = join(this.hooksDir, 'post-commit');
    
    const hookContent = `#!/bin/sh
# AI Planner post-commit hook
# Tracks files changed in relation to plans

# Get changed files
CHANGED_FILES=$(git diff --name-only HEAD~1 HEAD)

# If there's an active plan, associate these files
if [ -f .plan/.context/active-plan ]; then
  ACTIVE_PLAN=$(cat .plan/.context/active-plan)
  
  for FILE in $CHANGED_FILES; do
    npx dotplan associate-file $ACTIVE_PLAN "$FILE"
  done
fi

exit 0
`;

    await fs.writeFile(hookPath, hookContent);
    await fs.chmod(hookPath, '755');
  }

  async _installPrePushHook() {
    const hookPath = join(this.hooksDir, 'pre-push');
    
    const hookContent = `#!/bin/sh
# AI Planner pre-push hook
# Verifies implementation matches plans

# Get files being pushed
CHANGED_FILES=$(git diff --name-only @{u}..HEAD)

if [ -n "$CHANGED_FILES" ]; then
  echo "Verifying implementation against plans..."
  
  # Run verification
  npx dotplan verify $CHANGED_FILES
  
  if [ $? -ne 0 ]; then
    echo "❌ Implementation violates plan constraints"
    echo "Run 'npx dotplan verify --details' for more information"
    echo "Use 'git push --no-verify' to skip this check"
    exit 1
  fi
fi

exit 0
`;

    await fs.writeFile(hookPath, hookContent);
    await fs.chmod(hookPath, '755');
  }

  async extractPlanFromCommit(commitHash) {
    try {
      const message = execSync(`git log -1 --format=%B ${commitHash}`, {
        cwd: this.projectRoot
      }).toString();

      // Extract plan references
      const planMatch = message.match(/plan:([a-z0-9-]+)/);
      if (planMatch) {
        return planMatch[1];
      }

      // Extract from conventional commits
      const typeMatch = message.match(/^(feat|fix|refactor|docs)\(([^)]+)\)/);
      if (typeMatch) {
        return this._generatePlanFromCommit(typeMatch[1], typeMatch[2], message);
      }

      return null;
    } catch (error) {
      console.error(`Failed to extract plan from commit ${commitHash}: ${error.message}`);
      return null;
    }
  }

  async associateCommitWithPlan(commitHash, planId) {
    // Store commit-plan association in database
    const stmt = this.db.prepare(`
      INSERT INTO commit_plans (commit_hash, plan_id, timestamp)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `);
    
    stmt.run(commitHash, planId);
  }

  _generatePlanFromCommit(type, scope, message) {
    // Auto-generate a plan ID from commit info
    const date = new Date().toISOString().split('T')[0];
    const hash = require('crypto').createHash('md5').update(message).digest('hex').substring(0, 6);
    return `${date}-${type}-${scope}-${hash}`;
  }

  async getCommitHistory(planId) {
    try {
      // Search git log for commits mentioning this plan
      const log = execSync(
        `git log --grep="plan:${planId}" --format="%H|%ai|%s"`,
        { cwd: this.projectRoot }
      ).toString();

      const commits = log.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, date, message] = line.split('|');
          return { hash, date, message };
        });

      return commits;
    } catch (error) {
      console.error(`Failed to get commit history for plan ${planId}: ${error.message}`);
      return [];
    }
  }

  async getCurrentBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectRoot
      }).toString().trim();
    } catch {
      return 'main';
    }
  }

  async getModifiedFiles() {
    try {
      const staged = execSync('git diff --cached --name-only', {
        cwd: this.projectRoot
      }).toString().split('\n').filter(f => f);

      const unstaged = execSync('git diff --name-only', {
        cwd: this.projectRoot
      }).toString().split('\n').filter(f => f);

      return {
        staged,
        unstaged,
        all: [...new Set([...staged, ...unstaged])]
      };
    } catch {
      return { staged: [], unstaged: [], all: [] };
    }
  }
}
