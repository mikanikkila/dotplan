import Database from 'better-sqlite3';
import { join, relative } from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import crypto from 'crypto';
import { glob } from 'glob';
import { watch } from 'chokidar';

export class PlanManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.dbPath = join(projectRoot, '.plan', 'index.db');
    this.plansPath = join(projectRoot, '.plan', 'plans');
    this.contextPath = join(projectRoot, '.plan', '.context');
    this.db = null;
    this.watcher = null;
  }

  async initialize(options = {}) {
    const { forceRebuild = false, startWatcher = true } = options;

    // Create database with better-sqlite3
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    this._initializeSchema();

    // Validate database or rebuild if needed
    const needsRebuild = forceRebuild || await this._validateDatabase();

    if (needsRebuild) {
      console.log('Rebuilding database index from YAML files...');
      await this.reindexPlans();
      console.log('Database rebuild complete.');
    } else {
      console.log('Database index is up to date.');
    }

    // Start file watcher if requested
    if (startWatcher) {
      this.startWatcher();
    }
  }

  async _validateDatabase() {
    // Check if database needs rebuilding
    try {
      // Get count of plans in database
      const dbCount = this.db.prepare('SELECT COUNT(*) as count FROM plans').get();

      // Get count of YAML files
      const planFiles = await glob('*.yaml', {
        cwd: this.plansPath,
        absolute: false
      });

      // If counts don't match, rebuild needed
      if (dbCount.count !== planFiles.length) {
        console.log(`Database has ${dbCount.count} plans but found ${planFiles.length} YAML files.`);
        return true;
      }

      // Database looks valid
      return false;
    } catch (error) {
      // If any error occurs during validation, rebuild
      console.log(`Database validation error: ${error.message}`);
      return true;
    }
  }

  _initializeSchema() {
    this.db.exec(`
      -- Core plans table
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT CHECK(status IN ('draft', 'active', 'completed', 'deprecated')),
        title TEXT NOT NULL,
        description TEXT,
        content JSON NOT NULL
      );

      -- Plan relationships
      CREATE TABLE IF NOT EXISTS plan_edges (
        from_plan TEXT NOT NULL,
        to_plan TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        metadata JSON,
        PRIMARY KEY (from_plan, to_plan, edge_type),
        FOREIGN KEY (from_plan) REFERENCES plans(id),
        FOREIGN KEY (to_plan) REFERENCES plans(id)
      );

      -- File-to-plan mapping
      CREATE TABLE IF NOT EXISTS file_plans (
        file_path TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        operation TEXT,
        line_ranges JSON,
        PRIMARY KEY (file_path, plan_id),
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      );

      -- Decisions tracking
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id TEXT NOT NULL,
        decision_type TEXT,
        description TEXT,
        rationale TEXT,
        alternatives JSON,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      );

      -- Patterns established
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id TEXT NOT NULL,
        pattern TEXT,
        category TEXT,
        usage_count INTEGER DEFAULT 1,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      );

      -- Constraints
      CREATE TABLE IF NOT EXISTS constraints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id TEXT NOT NULL,
        constraint_type TEXT,
        description TEXT,
        severity TEXT DEFAULT 'warning',
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      );

      -- Full-text search virtual table
      CREATE VIRTUAL TABLE IF NOT EXISTS plan_search USING fts5(
        plan_id UNINDEXED,
        title,
        description,
        content,
        content=plans,
        content_rowid=rowid
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_plans_timestamp ON plans(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
      CREATE INDEX IF NOT EXISTS idx_file_plans_file ON file_plans(file_path);
      CREATE INDEX IF NOT EXISTS idx_decisions_plan ON decisions(plan_id);
      CREATE INDEX IF NOT EXISTS idx_patterns_plan ON patterns(plan_id);
      CREATE INDEX IF NOT EXISTS idx_constraints_plan ON constraints(plan_id);

      -- Triggers to keep FTS index updated
      CREATE TRIGGER IF NOT EXISTS plans_ai AFTER INSERT ON plans BEGIN
        INSERT INTO plan_search(plan_id, title, description, content) 
        VALUES (new.id, new.title, new.description, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS plans_ad AFTER DELETE ON plans BEGIN
        DELETE FROM plan_search WHERE plan_id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS plans_au AFTER UPDATE ON plans BEGIN
        UPDATE plan_search 
        SET title = new.title, description = new.description, content = new.content
        WHERE plan_id = new.id;
      END;
    `);
  }

  async createPlan({ title, description, template = 'default' }) {
    const planId = this._generatePlanId(title);
    const timestamp = new Date().toISOString();
    
    // Create plan object
    const plan = {
      id: planId,
      timestamp,
      status: 'draft',
      title,
      description: description || '',
      planning: {
        problem: description || '',
        approach: '',
        constraints: [],
        decisions: []
      },
      implementation: {
        actual_approach: '',
        deviations: [],
        patterns_established: []
      },
      relationships: {
        enables: [],
        blocks: [],
        modifies: []
      },
      affected_files: []
    };

    // Save to database
    const stmt = this.db.prepare(`
      INSERT INTO plans (id, timestamp, status, title, description, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      plan.id,
      plan.timestamp,
      plan.status,
      plan.title,
      plan.description,
      JSON.stringify(plan)
    );

    // Save to YAML file
    const yamlContent = yaml.dump(plan, { indent: 2 });
    const filePath = join(this.plansPath, `${planId}.yaml`);
    await fs.writeFile(filePath, yamlContent);

    return plan;
  }

  async updatePlan(planId, updates) {
    // Read current plan from YAML file
    const filePath = join(this.plansPath, `${planId}.yaml`);
    const content = await fs.readFile(filePath, 'utf8');
    const plan = yaml.load(content);

    // Apply updates to plan object (deep merge)
    const updatedPlan = this._deepMerge(plan, updates);

    // Write updated plan back to YAML file
    const yamlContent = yaml.dump(updatedPlan, { indent: 2 });
    await fs.writeFile(filePath, yamlContent);

    // Re-index the plan in database
    this._indexPlan(updatedPlan);

    return updatedPlan;
  }

  async completePlan(planId, summary) {
    // Read current plan from YAML file
    const filePath = join(this.plansPath, `${planId}.yaml`);
    const content = await fs.readFile(filePath, 'utf8');
    const plan = yaml.load(content);

    // Update status to completed
    plan.status = 'completed';
    plan.timestamp = new Date().toISOString();

    if (summary) {
      if (!plan.implementation) {
        plan.implementation = {};
      }
      plan.implementation.summary = summary;
    }

    // Write updated plan back to YAML file
    const yamlContent = yaml.dump(plan, { indent: 2 });
    await fs.writeFile(filePath, yamlContent);

    // Re-index the plan in database
    this._indexPlan(plan);

    return plan;
  }

  async setActivePlan(planId) {
    // Store active plan ID in file
    const activePlanFile = join(this.contextPath, 'active-plan');
    await fs.writeFile(activePlanFile, planId, 'utf8');
  }

  async getActivePlan() {
    // Read active plan ID from file
    const activePlanFile = join(this.contextPath, 'active-plan');
    try {
      const planId = await fs.readFile(activePlanFile, 'utf8');
      return planId.trim();
    } catch (error) {
      // File doesn't exist or can't be read
      return null;
    }
  }

  async clearActivePlan() {
    // Remove active plan file
    const activePlanFile = join(this.contextPath, 'active-plan');
    try {
      await fs.unlink(activePlanFile);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  async getFileContext(filePath) {
    // Normalize path relative to project root
    const relativePath = relative(this.projectRoot, filePath);
    
    // Get plans that touched this file
    const plans = this.db.prepare(`
      SELECT p.*, fp.operation, fp.line_ranges
      FROM plans p
      JOIN file_plans fp ON p.id = fp.plan_id
      WHERE fp.file_path = ?
      ORDER BY p.timestamp DESC
    `).all(relativePath);

    // Get related decisions
    const decisions = this.db.prepare(`
      SELECT d.*
      FROM decisions d
      JOIN file_plans fp ON d.plan_id = fp.plan_id
      WHERE fp.file_path = ?
      ORDER BY d.timestamp DESC
      LIMIT 10
    `).all(relativePath);

    // Get patterns used in this file
    const patterns = this.db.prepare(`
      SELECT DISTINCT pat.*
      FROM patterns pat
      JOIN file_plans fp ON pat.plan_id = fp.plan_id
      WHERE fp.file_path = ?
      ORDER BY pat.usage_count DESC
    `).all(relativePath);

    // Get applicable constraints
    const constraints = this.db.prepare(`
      SELECT DISTINCT c.*
      FROM constraints c
      JOIN file_plans fp ON c.plan_id = fp.plan_id
      WHERE fp.file_path = ?
      AND c.severity IN ('error', 'warning')
    `).all(relativePath);

    return {
      file: relativePath,
      plans: plans.map(p => ({
        ...JSON.parse(p.content),
        operation: p.operation,
        line_ranges: p.line_ranges ? JSON.parse(p.line_ranges) : null
      })),
      decisions,
      patterns,
      constraints,
      summary: this._generateContextSummary(plans, decisions, patterns)
    };
  }

  async searchContext(query) {
    // Full-text search across plans
    const searchResults = this.db.prepare(`
      SELECT p.*, rank
      FROM plans p
      JOIN plan_search ps ON p.id = ps.plan_id
      WHERE plan_search MATCH ?
      ORDER BY rank
      LIMIT 20
    `).all(query);

    // Also search decisions
    const decisionResults = this.db.prepare(`
      SELECT * FROM decisions
      WHERE description LIKE ? OR rationale LIKE ?
      LIMIT 10
    `).all(`%${query}%`, `%${query}%`);

    // Search patterns
    const patternResults = this.db.prepare(`
      SELECT * FROM patterns
      WHERE pattern LIKE ?
      ORDER BY usage_count DESC
      LIMIT 10
    `).all(`%${query}%`);

    return {
      query,
      plans: searchResults.map(p => JSON.parse(p.content)),
      decisions: decisionResults,
      patterns: patternResults,
      timestamp: new Date().toISOString()
    };
  }

  async getCurrentContext() {
    // Get active plans
    const activePlans = this.db.prepare(`
      SELECT * FROM plans
      WHERE status = 'active'
      ORDER BY timestamp DESC
    `).all();

    // Get recent decisions (last 7 days)
    const recentDecisions = this.db.prepare(`
      SELECT * FROM decisions
      WHERE timestamp > datetime('now', '-7 days')
      ORDER BY timestamp DESC
      LIMIT 20
    `).all();

    // Get frequently used patterns
    const topPatterns = this.db.prepare(`
      SELECT pattern, category, SUM(usage_count) as total_usage
      FROM patterns
      GROUP BY pattern, category
      ORDER BY total_usage DESC
      LIMIT 10
    `).all();

    // Get active constraints
    const activeConstraints = this.db.prepare(`
      SELECT DISTINCT c.*
      FROM constraints c
      JOIN plans p ON c.plan_id = p.id
      WHERE p.status IN ('active', 'completed')
      AND c.severity = 'error'
    `).all();

    return {
      activePlans: activePlans.map(p => JSON.parse(p.content)),
      recentDecisions,
      topPatterns,
      activeConstraints,
      sessionStart: new Date().toISOString()
    };
  }

  async verifyImplementation(files) {
    const violations = [];
    
    for (const file of files) {
      const relativePath = relative(this.projectRoot, file);
      
      // Get constraints for this file
      const constraints = this.db.prepare(`
        SELECT c.*, p.title as plan_title
        FROM constraints c
        JOIN file_plans fp ON c.plan_id = fp.plan_id
        JOIN plans p ON c.plan_id = p.id
        WHERE fp.file_path = ?
        AND c.severity = 'error'
      `).all(relativePath);

      // Read file content
      try {
        const content = await fs.readFile(file, 'utf8');
        
        // Check each constraint
        for (const constraint of constraints) {
          // Simple validation - in real implementation, would be more sophisticated
          if (constraint.description.includes('no direct database access')) {
            if (content.includes('SELECT') || content.includes('INSERT')) {
              violations.push({
                file: relativePath,
                constraint: constraint.description,
                plan: constraint.plan_title,
                message: 'Direct database access detected'
              });
            }
          }
          // Add more constraint checks here
        }
      } catch (error) {
        console.error(`Could not read file ${file}: ${error.message}`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      timestamp: new Date().toISOString()
    };
  }

  async listPlans({ status, limit = 20 }) {
    let query = 'SELECT * FROM plans';
    const params = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const plans = this.db.prepare(query).all(...params);
    
    return plans.map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      timestamp: p.timestamp,
      description: p.description
    }));
  }

  async getProjectBrief() {
    // Get statistics
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft
      FROM plans
    `).get();

    // Get recent activity
    const recentActivity = this.db.prepare(`
      SELECT id, title, timestamp, status
      FROM plans
      ORDER BY timestamp DESC
      LIMIT 5
    `).all();

    // Get active plans with details
    const activePlans = this.db.prepare(`
      SELECT * FROM plans
      WHERE status = 'active'
      ORDER BY timestamp DESC
    `).all().map(p => {
      const content = JSON.parse(p.content);
      return {
        id: p.id,
        title: p.title,
        nextSteps: content.planning?.approach || 'No next steps defined'
      };
    });

    // Generate suggestions based on patterns
    const suggestions = this._generateSuggestions();

    return {
      stats,
      recentActivity,
      activePlans,
      suggestions,
      timestamp: new Date().toISOString()
    };
  }

  async reindexPlans() {
    // Clear existing database entries for a clean rebuild
    this.db.prepare('DELETE FROM constraints').run();
    this.db.prepare('DELETE FROM patterns').run();
    this.db.prepare('DELETE FROM decisions').run();
    this.db.prepare('DELETE FROM file_plans').run();
    this.db.prepare('DELETE FROM plan_edges').run();
    this.db.prepare('DELETE FROM plans').run();

    // Find all YAML files in plans directory
    const planFiles = await glob('*.yaml', {
      cwd: this.plansPath,
      absolute: true
    });

    for (const file of planFiles) {
      try {
        const content = await fs.readFile(file, 'utf8');
        const plan = yaml.load(content);

        // Index plan to database
        this._indexPlan(plan);
      } catch (error) {
        console.error(`Failed to index plan ${file}: ${error.message}`);
      }
    }
  }

  _indexPlan(plan) {
    // Upsert main plan
    const upsertPlan = this.db.prepare(`
      INSERT OR REPLACE INTO plans (id, timestamp, status, title, description, content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    upsertPlan.run(
      plan.id,
      plan.timestamp,
      plan.status,
      plan.title,
      plan.description || '',
      JSON.stringify(plan)
    );

    // Clear existing related data for this plan before re-indexing
    this.db.prepare('DELETE FROM file_plans WHERE plan_id = ?').run(plan.id);
    this.db.prepare('DELETE FROM decisions WHERE plan_id = ?').run(plan.id);
    this.db.prepare('DELETE FROM patterns WHERE plan_id = ?').run(plan.id);
    this.db.prepare('DELETE FROM constraints WHERE plan_id = ?').run(plan.id);

    // Index affected files
    if (plan.affected_files && plan.affected_files.length > 0) {
      const insertFile = this.db.prepare(`
        INSERT INTO file_plans (file_path, plan_id, operation)
        VALUES (?, ?, ?)
      `);

      for (const file of plan.affected_files) {
        insertFile.run(file, plan.id, 'modified');
      }
    }

    // Index decisions
    if (plan.planning?.decisions && plan.planning.decisions.length > 0) {
      const insertDecision = this.db.prepare(`
        INSERT INTO decisions (plan_id, description, rationale, alternatives)
        VALUES (?, ?, ?, ?)
      `);

      for (const decision of plan.planning.decisions) {
        insertDecision.run(
          plan.id,
          decision.description || decision.why,
          decision.rationale || '',
          JSON.stringify(decision.alternatives_considered || [])
        );
      }
    }

    // Index patterns
    if (plan.implementation?.patterns_established && plan.implementation.patterns_established.length > 0) {
      const insertPattern = this.db.prepare(`
        INSERT INTO patterns (plan_id, pattern, category)
        VALUES (?, ?, ?)
      `);

      for (const pattern of plan.implementation.patterns_established) {
        insertPattern.run(plan.id, pattern, 'implementation');
      }
    }

    // Index constraints
    if (plan.planning?.constraints && plan.planning.constraints.length > 0) {
      const insertConstraint = this.db.prepare(`
        INSERT INTO constraints (plan_id, description, constraint_type, severity)
        VALUES (?, ?, ?, ?)
      `);

      for (const constraint of plan.planning.constraints) {
        insertConstraint.run(
          plan.id,
          constraint,
          'planning',
          'warning'
        );
      }
    }
  }

  _generatePlanId(title) {
    const date = new Date().toISOString().split('T')[0];
    const hash = crypto.createHash('md5').update(title).digest('hex').substring(0, 6);
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
    return `${date}-${slug}-${hash}`;
  }

  _generateContextSummary(plans, decisions, patterns) {
    // Generate a human-readable summary of the context
    const summary = {
      planCount: plans.length,
      lastModified: plans[0]?.timestamp,
      keyDecisions: decisions.slice(0, 3).map(d => d.description),
      dominantPatterns: patterns.slice(0, 3).map(p => p.pattern)
    };

    return summary;
  }

  _generateSuggestions() {
    const suggestions = [];

    // Check for plans without completion
    const incompletePlans = this.db.prepare(`
      SELECT COUNT(*) as count FROM plans WHERE status = 'active'
    `).get();

    if (incompletePlans.count > 3) {
      suggestions.push(`You have ${incompletePlans.count} active plans. Consider completing some before starting new ones.`);
    }

    // Check for files with many plans
    const hotspots = this.db.prepare(`
      SELECT file_path, COUNT(*) as plan_count
      FROM file_plans
      GROUP BY file_path
      HAVING plan_count > 5
      LIMIT 3
    `).all();

    for (const hotspot of hotspots) {
      suggestions.push(`File ${hotspot.file_path} has been modified by ${hotspot.plan_count} plans. Consider refactoring.`);
    }

    return suggestions;
  }

  _deepMerge(target, source) {
    // Deep merge utility for updating plan objects
    const output = { ...target };

    if (this._isObject(target) && this._isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this._isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this._deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  _isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  startWatcher() {
    if (this.watcher) {
      console.log('File watcher already running');
      return;
    }

    // Watch for external changes to plan YAML files
    this.watcher = watch(this.plansPath, {
      ignored: /(^|[\/\\])\../,  // ignore dotfiles
      persistent: true,
      ignoreInitial: true
    });

    this.watcher
      .on('add', path => this._handlePlanChange(path, 'added'))
      .on('change', path => this._handlePlanChange(path, 'changed'))
      .on('unlink', path => this._handlePlanChange(path, 'removed'));

    console.log('File watcher started');
  }

  stopWatcher() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('File watcher stopped');
    }
  }

  async _handlePlanChange(path, event) {
    console.log(`Plan ${event}: ${path}`);

    if (event !== 'removed') {
      // Re-index the changed plan
      try {
        const content = await fs.readFile(path, 'utf8');
        const plan = yaml.load(content);
        this._indexPlan(plan);
      } catch (error) {
        console.error(`Failed to re-index plan ${path}: ${error.message}`);
      }
    }
    // Note: Deletion handling could be added here if needed
  }

  close() {
    // Stop file watcher
    this.stopWatcher();

    // Close database
    if (this.db) {
      this.db.close();
    }
  }
}
