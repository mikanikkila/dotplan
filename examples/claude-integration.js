#!/usr/bin/env node

/**
 * Example integration script for Claude Code
 * Shows how Claude can interact with AI Planner
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

class ClaudeIntegration {
  constructor() {
    this.serverProcess = null;
    this.serverUrl = 'http://localhost:7632';
  }

  /**
   * Start the AI Planner context server
   */
  async startServer() {
    console.log('Starting AI Planner context server...');
    
    this.serverProcess = spawn('npx', ['dotplan', 'watch'], {
      detached: false,
      stdio: 'inherit'
    });

    // Wait for server to be ready
    await this.waitForServer();
    console.log('✅ Context server ready at', this.serverUrl);
  }

  /**
   * Wait for server to be responsive
   */
  async waitForServer(maxAttempts = 20) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${this.serverUrl}/health`);
        if (response.ok) return true;
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Server failed to start');
  }

  /**
   * Get context for current work
   */
  async getContext(query = null) {
    const url = query 
      ? `${this.serverUrl}/search?q=${encodeURIComponent(query)}`
      : `${this.serverUrl}/context`;
    
    const response = await fetch(url);
    return response.json();
  }

  /**
   * Get context for a specific file
   */
  async getFileContext(filePath) {
    const response = await fetch(
      `${this.serverUrl}/context?file=${encodeURIComponent(filePath)}`
    );
    return response.json();
  }

  /**
   * Create a new plan
   */
  async createPlan(title, description) {
    const response = await fetch(`${this.serverUrl}/plan/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description })
    });
    return response.json();
  }

  /**
   * Update the current plan
   */
  async updatePlan(updates) {
    const response = await fetch(`${this.serverUrl}/plan/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    return response.json();
  }

  /**
   * Complete the current plan
   */
  async completePlan(summary) {
    const response = await fetch(`${this.serverUrl}/plan/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary })
    });
    return response.json();
  }

  /**
   * Get established patterns
   */
  async getPatterns() {
    const response = await fetch(`${this.serverUrl}/patterns`);
    return response.json();
  }

  /**
   * Get active constraints
   */
  async getConstraints() {
    const response = await fetch(`${this.serverUrl}/constraints`);
    return response.json();
  }

  /**
   * Example workflow for Claude Code
   */
  async exampleWorkflow() {
    console.log('\n🤖 Claude Code Integration Example\n');

    // 1. Get current context
    console.log('1. Getting current context...');
    const context = await this.getContext();
    console.log(`   Found ${context.context.relevant_plans.length} relevant plans`);
    console.log(`   Found ${context.context.established_patterns.length} patterns`);

    // 2. Search for specific context
    console.log('\n2. Searching for authentication context...');
    const authContext = await this.getContext('authentication');
    console.log(`   Found ${authContext.plans?.length || 0} auth-related plans`);

    // 3. Create a new plan
    console.log('\n3. Creating new plan...');
    const plan = await this.createPlan(
      'Add user profile feature',
      'Allow users to customize their profile with avatar and bio'
    );
    console.log(`   Created plan: ${plan.plan.id}`);

    // 4. Get patterns to follow
    console.log('\n4. Getting established patterns...');
    const patterns = await this.getPatterns();
    console.log(`   Should follow: ${patterns.patterns[0]?.pattern}`);

    // 5. Check constraints
    console.log('\n5. Checking constraints...');
    const constraints = await this.getConstraints();
    if (constraints.constraints.length > 0) {
      console.log(`   Must respect: ${constraints.constraints[0]?.description}`);
    }

    // 6. Complete the plan
    console.log('\n6. Completing plan...');
    await this.completePlan('Successfully implemented user profiles');
    console.log('   ✅ Plan completed');

    console.log('\n✨ Workflow complete!\n');
  }

  /**
   * Generate code following project patterns
   */
  async generateCode(task) {
    // Get relevant context
    const context = await this.getContext(task);
    
    // Build prompt with context
    const prompt = `
Task: ${task}

Project Context:
${JSON.stringify(context.context, null, 2)}

Please generate code that:
1. Follows the established patterns
2. Respects all constraints
3. Aligns with previous decisions
`;

    console.log('Generated context-aware prompt:');
    console.log(prompt);
    
    return prompt;
  }

  /**
   * Stop the server
   */
  stopServer() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('Context server stopped');
    }
  }
}

// Example usage
async function main() {
  const integration = new ClaudeIntegration();
  
  try {
    // Start server
    await integration.startServer();
    
    // Run example workflow
    await integration.exampleWorkflow();
    
    // Generate context-aware code
    await integration.generateCode('implement user search functionality');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    integration.stopServer();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ClaudeIntegration };
