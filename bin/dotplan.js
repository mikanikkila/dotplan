#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { PlanManager } from '../src/index.js';
import { GitIntegration } from '../src/git/hooks.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(await fs.readFile(join(__dirname, '../package.json'), 'utf8'));

const program = new Command();

program
  .name('dotplan')
  .description('Plan-based memory system for AI coding assistants')
  .version(pkg.version);

// Initialize command
program
  .command('init')
  .description('Initialize AI Planner in current project')
  .option('--no-git', 'Skip git hooks setup')
  .action(async (options) => {
    const spinner = ora('Initializing AI Planner...').start();
    
    try {
      // Create .plan directory
      await fs.mkdir('.plan', { recursive: true });
      await fs.mkdir('.plan/plans', { recursive: true });
      await fs.mkdir('.plan/.context', { recursive: true });
      
      // Initialize database
      const manager = new PlanManager(process.cwd());
      await manager.initialize();
      
      // Create config file
      const config = {
        version: pkg.version,
        created: new Date().toISOString(),
        settings: {
          autoIndex: true,
          gitIntegration: options.git,
          contextPort: 7632
        }
      };
      
      await fs.writeFile(
        '.plan/config.json',
        JSON.stringify(config, null, 2)
      );
      
      // Create .gitignore
      const gitignore = `# AI Planner generated files
.plan/index.db
.plan/index.db-shm
.plan/index.db-wal
.plan/.context/
.plan/sessions/
`;
      await fs.writeFile('.plan/.gitignore', gitignore);
      
      // Setup git hooks if requested
      if (options.git) {
        const git = new GitIntegration(process.cwd());
        await git.setupHooks();
      }
      
      spinner.succeed(chalk.green('✨ AI Planner initialized successfully!'));
      
      console.log('\n' + chalk.cyan('Next steps:'));
      console.log('  1. Create your first plan: ' + chalk.yellow('npx dotplan create'));
      console.log('  2. Start context server: ' + chalk.yellow('npx dotplan watch'));
      console.log('  3. View help: ' + chalk.yellow('npx dotplan --help'));
      
    } catch (error) {
      spinner.fail(chalk.red('Failed to initialize: ' + error.message));
      process.exit(1);
    }
  });

// Rebuild index command
program
  .command('rebuild-index')
  .description('Rebuild database index from YAML files')
  .action(async () => {
    const spinner = ora('Rebuilding database index...').start();

    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ forceRebuild: true, startWatcher: false });

      spinner.succeed(chalk.green('✅ Database index rebuilt successfully!'));

      console.log('\n' + chalk.cyan('Database is now in sync with YAML files.'));
      console.log(chalk.gray('The database can be safely deleted at any time - it will rebuild automatically.'));

      manager.close();

    } catch (error) {
      spinner.fail(chalk.red('Failed to rebuild index: ' + error.message));
      process.exit(1);
    }
  });

// Create plan command
program
  .command('create [title]')
  .description('Create a new plan')
  .option('-d, --description <desc>', 'Plan description')
  .option('-t, --template <name>', 'Use template', 'default')
  .action(async (title, options) => {
    try {
      const manager = new PlanManager(process.cwd());
      
      if (!title) {
        // Interactive mode
        console.log(chalk.cyan('Creating new plan interactively...'));
        // In real implementation, you'd use inquirer for prompts
        console.log(chalk.yellow('Interactive mode not yet implemented. Please provide a title.'));
        process.exit(1);
      }
      
      const plan = await manager.createPlan({
        title,
        description: options.description,
        template: options.template
      });

      // Auto-activate the new plan
      await manager.setActivePlan(plan.id);

      console.log(chalk.green(`✅ Created plan: ${plan.id}`));
      console.log(chalk.gray(`   File: .plan/plans/${plan.id}.yaml`));
      console.log(chalk.cyan(`   Active plan set to: ${plan.id}`));

    } catch (error) {
      console.error(chalk.red('Failed to create plan: ' + error.message));
      process.exit(1);
    }
  });

// Context command
program
  .command('context [query]')
  .description('Get context for current work')
  .option('-f, --file <path>', 'Get context for specific file')
  .option('--json', 'Output as JSON')
  .action(async (query, options) => {
    try {
      const manager = new PlanManager(process.cwd());
      
      let context;
      if (options.file) {
        context = await manager.getFileContext(options.file);
      } else if (query) {
        context = await manager.searchContext(query);
      } else {
        context = await manager.getCurrentContext();
      }
      
      if (options.json) {
        console.log(JSON.stringify(context, null, 2));
      } else {
        // Pretty print context
        console.log(chalk.cyan('\n📚 Relevant Context:\n'));
        
        if (context.plans && context.plans.length > 0) {
          console.log(chalk.yellow('Related Plans:'));
          context.plans.forEach(plan => {
            console.log(`  • ${chalk.white(plan.title)} (${chalk.gray(plan.id)})`);
            if (plan.relevance) {
              console.log(`    ${chalk.gray(plan.relevance)}`);
            }
          });
        }
        
        if (context.decisions && context.decisions.length > 0) {
          console.log(chalk.yellow('\nKey Decisions:'));
          context.decisions.forEach(decision => {
            console.log(`  • ${decision.description}`);
            console.log(`    ${chalk.gray('Rationale: ' + decision.rationale)}`);
          });
        }
        
        if (context.constraints && context.constraints.length > 0) {
          console.log(chalk.yellow('\nConstraints:'));
          context.constraints.forEach(constraint => {
            console.log(`  ⚠️  ${constraint.description}`);
          });
        }
        
        if (context.patterns && context.patterns.length > 0) {
          console.log(chalk.yellow('\nEstablished Patterns:'));
          context.patterns.forEach(pattern => {
            console.log(`  • ${pattern.pattern}`);
          });
        }
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to get context: ' + error.message));
      process.exit(1);
    }
  });

// Decisions command
program
  .command('decisions')
  .description('List all architectural decisions')
  .option('--type <type>', 'Filter by decision type')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      let query = 'SELECT * FROM decisions';
      const params = [];

      if (options.type) {
        query += ' WHERE decision_type = ?';
        params.push(options.type);
      }

      query += ' ORDER BY timestamp DESC LIMIT 50';

      const decisions = manager.db.prepare(query).all(...params);

      if (options.json) {
        console.log(JSON.stringify({ decisions }, null, 2));
      } else {
        if (decisions.length === 0) {
          console.log(chalk.gray('No decisions found'));
          return;
        }

        console.log(chalk.cyan(`\n📋 Decisions (${decisions.length}):\n`));

        decisions.forEach(decision => {
          console.log(chalk.yellow(`• ${decision.description}`));
          if (decision.rationale) {
            console.log(chalk.gray(`  Rationale: ${decision.rationale}`));
          }
          console.log(chalk.gray(`  Plan: ${decision.plan_id}`));
          console.log();
        });
      }

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to list decisions: ' + error.message));
      process.exit(1);
    }
  });

// Patterns command
program
  .command('patterns')
  .description('List established code patterns')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      const patterns = manager.db.prepare(`
        SELECT pattern, category, SUM(usage_count) as total_usage
        FROM patterns
        GROUP BY pattern, category
        ORDER BY total_usage DESC
        LIMIT 50
      `).all();

      if (options.json) {
        console.log(JSON.stringify({ patterns }, null, 2));
      } else {
        if (patterns.length === 0) {
          console.log(chalk.gray('No patterns found'));
          return;
        }

        console.log(chalk.cyan(`\n🎨 Patterns (${patterns.length}):\n`));

        patterns.forEach(pattern => {
          console.log(chalk.yellow(`• ${pattern.pattern}`));
          console.log(chalk.gray(`  Category: ${pattern.category}`));
          console.log(chalk.gray(`  Usage count: ${pattern.total_usage}`));
          console.log();
        });
      }

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to list patterns: ' + error.message));
      process.exit(1);
    }
  });

// Constraints command
program
  .command('constraints')
  .description('List active constraints')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      const constraints = manager.db.prepare(`
        SELECT DISTINCT c.*, p.title as plan_title
        FROM constraints c
        JOIN plans p ON c.plan_id = p.id
        WHERE p.status IN ('active', 'completed')
        ORDER BY c.severity DESC, c.id DESC
      `).all();

      if (options.json) {
        console.log(JSON.stringify({ constraints }, null, 2));
      } else {
        if (constraints.length === 0) {
          console.log(chalk.gray('No constraints found'));
          return;
        }

        console.log(chalk.cyan(`\n⚠️  Constraints (${constraints.length}):\n`));

        constraints.forEach(constraint => {
          const icon = constraint.severity === 'error' ? '🚫' : '⚠️';
          console.log(`${icon} ${chalk.yellow(constraint.description)}`);
          console.log(chalk.gray(`  Severity: ${constraint.severity}`));
          console.log(chalk.gray(`  From plan: ${constraint.plan_title}`));
          console.log();
        });
      }

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to list constraints: ' + error.message));
      process.exit(1);
    }
  });

// Update plan command
program
  .command('update <planId>')
  .description('Update a plan')
  .option('--set <json>', 'JSON object with updates')
  .action(async (planId, options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      if (!options.set) {
        console.error(chalk.red('Error: --set <json> is required'));
        process.exit(1);
      }

      const updates = JSON.parse(options.set);
      const updatedPlan = await manager.updatePlan(planId, updates);

      console.log(chalk.green(`✅ Updated plan: ${planId}`));
      console.log(chalk.gray(`   Status: ${updatedPlan.status}`));

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to update plan: ' + error.message));
      process.exit(1);
    }
  });

// Complete plan command
program
  .command('complete [planId]')
  .description('Mark a plan as completed')
  .option('--summary <text>', 'Completion summary')
  .action(async (planId, options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      // Use provided planId or get active plan
      let id = planId;
      if (!id) {
        id = await manager.getActivePlan();
        if (!id) {
          console.error(chalk.red('Error: No active plan. Specify plan ID or activate a plan first.'));
          process.exit(1);
        }
      }

      const completedPlan = await manager.completePlan(id, options.summary);

      // Clear active plan if it was the one completed
      const activePlan = await manager.getActivePlan();
      if (activePlan === id) {
        await manager.clearActivePlan();
      }

      console.log(chalk.green(`✅ Plan completed: ${id}`));
      if (options.summary) {
        console.log(chalk.gray(`   Summary: ${options.summary}`));
      }

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to complete plan: ' + error.message));
      process.exit(1);
    }
  });

// File history command
program
  .command('file-history <path>')
  .description('Show modification history for a file')
  .option('--json', 'Output as JSON')
  .action(async (path, options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      const history = manager.db.prepare(`
        SELECT p.id, p.title, p.timestamp, p.status, fp.operation
        FROM plans p
        JOIN file_plans fp ON p.id = fp.plan_id
        WHERE fp.file_path = ?
        ORDER BY p.timestamp DESC
      `).all(path);

      if (options.json) {
        console.log(JSON.stringify({ file: path, history }, null, 2));
      } else {
        if (history.length === 0) {
          console.log(chalk.gray(`No history found for ${path}`));
          return;
        }

        console.log(chalk.cyan(`\n📜 History for ${path} (${history.length} plans):\n`));

        history.forEach(item => {
          console.log(chalk.yellow(`• ${item.title}`));
          console.log(chalk.gray(`  Plan ID: ${item.id}`));
          console.log(chalk.gray(`  Operation: ${item.operation}`));
          console.log(chalk.gray(`  Date: ${item.timestamp}`));
          console.log();
        });
      }

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to get file history: ' + error.message));
      process.exit(1);
    }
  });

// Related plans command
program
  .command('related <planId>')
  .description('Show plans related to a specific plan')
  .option('--json', 'Output as JSON')
  .action(async (planId, options) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      // Get relationships
      const relationships = manager.db.prepare(`
        SELECT * FROM plan_edges
        WHERE from_plan = ? OR to_plan = ?
      `).all(planId, planId);

      if (relationships.length === 0) {
        console.log(chalk.gray(`No related plans found for ${planId}`));
        manager.close();
        return;
      }

      // Get related plan details
      const relatedIds = [
        ...relationships.filter(r => r.from_plan === planId).map(r => r.to_plan),
        ...relationships.filter(r => r.to_plan === planId).map(r => r.from_plan)
      ];

      const relatedPlans = manager.db.prepare(`
        SELECT id, title, status, timestamp
        FROM plans
        WHERE id IN (${relatedIds.map(() => '?').join(',')})
      `).all(...relatedIds);

      if (options.json) {
        console.log(JSON.stringify({ planId, relationships, relatedPlans }, null, 2));
      } else {
        console.log(chalk.cyan(`\n🔗 Related plans for ${planId}:\n`));

        relatedPlans.forEach(plan => {
          const rel = relationships.find(r =>
            (r.from_plan === planId && r.to_plan === plan.id) ||
            (r.to_plan === planId && r.from_plan === plan.id)
          );

          console.log(chalk.yellow(`• ${plan.title}`));
          console.log(chalk.gray(`  ID: ${plan.id}`));
          console.log(chalk.gray(`  Relationship: ${rel.edge_type}`));
          console.log(chalk.gray(`  Status: ${plan.status}`));
          console.log();
        });
      }

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to get related plans: ' + error.message));
      process.exit(1);
    }
  });

// Activate plan command
program
  .command('activate <planId>')
  .description('Set a plan as the active plan')
  .action(async (planId) => {
    try {
      const manager = new PlanManager(process.cwd());
      await manager.initialize({ startWatcher: false });

      // Verify plan exists
      const plan = manager.db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);

      if (!plan) {
        console.error(chalk.red(`Error: Plan ${planId} not found`));
        process.exit(1);
      }

      await manager.setActivePlan(planId);

      console.log(chalk.green(`✅ Active plan set to: ${planId}`));
      console.log(chalk.gray(`   Title: ${plan.title}`));
      console.log(chalk.gray(`   Status: ${plan.status}`));

      manager.close();

    } catch (error) {
      console.error(chalk.red('Failed to activate plan: ' + error.message));
      process.exit(1);
    }
  });

// Verify command
program
  .command('verify <files...>')
  .description('Verify implementation matches plans')
  .action(async (files) => {
    const spinner = ora('Verifying implementation...').start();
    
    try {
      const manager = new PlanManager(process.cwd());
      const results = await manager.verifyImplementation(files);
      
      if (results.valid) {
        spinner.succeed(chalk.green('✅ Implementation matches plans'));
      } else {
        spinner.fail(chalk.red('❌ Implementation deviates from plans'));
        
        if (results.violations.length > 0) {
          console.log(chalk.yellow('\nViolations:'));
          results.violations.forEach(v => {
            console.log(`  • ${v.file}: ${v.message}`);
          });
        }
        
        process.exit(1);
      }
      
    } catch (error) {
      spinner.fail(chalk.red('Verification failed: ' + error.message));
      process.exit(1);
    }
  });

// List command
program
  .command('list')
  .description('List all plans')
  .option('-s, --status <status>', 'Filter by status')
  .option('--limit <n>', 'Limit results', '20')
  .action(async (options) => {
    try {
      const manager = new PlanManager(process.cwd());
      const plans = await manager.listPlans({
        status: options.status,
        limit: parseInt(options.limit)
      });
      
      if (plans.length === 0) {
        console.log(chalk.gray('No plans found'));
        return;
      }
      
      console.log(chalk.cyan(`\n📋 Plans (${plans.length}):\n`));
      
      plans.forEach(plan => {
        const statusColor = {
          'draft': chalk.gray,
          'active': chalk.yellow,
          'completed': chalk.green,
          'deprecated': chalk.red
        }[plan.status] || chalk.white;
        
        console.log(`${statusColor('●')} ${plan.title}`);
        console.log(`  ${chalk.gray(plan.id)} - ${plan.timestamp}`);
        if (plan.description) {
          console.log(`  ${chalk.gray(plan.description.substring(0, 80) + '...')}`);
        }
        console.log();
      });
      
    } catch (error) {
      console.error(chalk.red('Failed to list plans: ' + error.message));
      process.exit(1);
    }
  });

// Brief command
program
  .command('brief')
  .description('Get a brief summary of project state')
  .action(async () => {
    try {
      const manager = new PlanManager(process.cwd());
      const brief = await manager.getProjectBrief();
      
      console.log(chalk.cyan('\n📊 Project Brief\n'));
      
      console.log(chalk.yellow('Statistics:'));
      console.log(`  Total Plans: ${brief.stats.total}`);
      console.log(`  Active: ${brief.stats.active}`);
      console.log(`  Completed: ${brief.stats.completed}`);
      
      if (brief.recentActivity.length > 0) {
        console.log(chalk.yellow('\nRecent Activity:'));
        brief.recentActivity.forEach(activity => {
          console.log(`  • ${activity.title} (${chalk.gray(activity.timestamp)})`);
        });
      }
      
      if (brief.activePlans.length > 0) {
        console.log(chalk.yellow('\nActive Plans:'));
        brief.activePlans.forEach(plan => {
          console.log(`  • ${plan.title}`);
          if (plan.nextSteps) {
            console.log(`    Next: ${chalk.gray(plan.nextSteps)}`);
          }
        });
      }
      
      if (brief.suggestions.length > 0) {
        console.log(chalk.yellow('\n💡 Suggestions:'));
        brief.suggestions.forEach(suggestion => {
          console.log(`  • ${suggestion}`);
        });
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to generate brief: ' + error.message));
      process.exit(1);
    }
  });

program.parse();
