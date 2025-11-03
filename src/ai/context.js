export class AIContextBuilder {
  constructor(planManager) {
    this.manager = planManager;
  }

  async buildClaudeContext(task) {
    const context = await this.manager.getCurrentContext();
    
    return `
## Project Memory Context

You have access to the project's planning history via http://localhost:7632

### Active Plans
${context.activePlans.map(p => `- ${p.title} (${p.id})`).join('\n')}

### Recent Decisions
${context.recentDecisions.slice(0, 5).map(d => 
  `- ${d.description}\n  Rationale: ${d.rationale}`
).join('\n')}

### Established Patterns
${context.topPatterns.slice(0, 5).map(p => 
  `- ${p.pattern} (used ${p.total_usage} times)`
).join('\n')}

### Active Constraints
${context.activeConstraints.map(c => 
  `⚠️ ${c.description}`
).join('\n')}

### Suggested Approach
Based on project history, consider:
${this._generateSuggestions(context).join('\n')}

You can query more specific context using:
- curl http://localhost:7632/context?file=<path> - Get context for a specific file
- curl http://localhost:7632/search?q=<query> - Search project history
- curl http://localhost:7632/patterns - Get all established patterns
`;
  }

  async buildCopilotContext(task) {
    const context = await this.manager.getCurrentContext();
    
    return {
      system: "You have access to project planning memory",
      context: {
        plans: context.activePlans.map(p => ({
          id: p.id,
          title: p.title,
          status: p.status
        })),
        patterns: context.topPatterns,
        constraints: context.activeConstraints,
        server: "http://localhost:7632"
      }
    };
  }

  async buildCursorContext(task) {
    // Cursor-specific format
    const context = await this.manager.getCurrentContext();
    
    return {
      rules: [
        "Check http://localhost:7632/context for project memory",
        ...context.activeConstraints.map(c => c.description)
      ],
      patterns: context.topPatterns.map(p => p.pattern),
      activeTasks: context.activePlans.map(p => p.title)
    };
  }

  async buildFileContext(filePath) {
    const context = await this.manager.getFileContext(filePath);
    
    return `
## Context for ${filePath}

### Previous Modifications
${context.plans.map(p => 
  `- ${p.title} (${p.timestamp}): ${p.operation}`
).join('\n')}

### Decisions Affecting This File
${context.decisions.map(d => 
  `- ${d.description}`
).join('\n')}

### Patterns Used Here
${context.patterns.map(p => 
  `- ${p.pattern}`
).join('\n')}

### Constraints
${context.constraints.map(c => 
  `⚠️ ${c.description}`
).join('\n')}
`;
  }

  _generateSuggestions(context) {
    const suggestions = [];

    if (context.activePlans.length > 0) {
      suggestions.push(`1. Continue with: ${context.activePlans[0].title}`);
    }

    if (context.topPatterns.length > 0) {
      suggestions.push(`2. Follow pattern: ${context.topPatterns[0].pattern}`);
    }

    if (context.recentDecisions.length > 0) {
      suggestions.push(`3. Consider recent decision: ${context.recentDecisions[0].description}`);
    }

    return suggestions;
  }
}

export class PromptTemplates {
  static planCreation(title, description) {
    return `
Create a development plan for: ${title}

Description: ${description}

The plan should include:
1. Problem statement
2. Proposed approach
3. Key constraints to consider
4. Technical decisions with rationales
5. Files that will be affected
6. Relationships to other features

Format as YAML with the structure used in .plan/plans/
`;
  }

  static codeReview(files, plan) {
    return `
Review the following implementation against plan ${plan.id}:

Files: ${files.join(', ')}

Plan requirements:
- Approach: ${plan.planning.approach}
- Constraints: ${plan.planning.constraints.join(', ')}
- Patterns: ${plan.implementation.patterns_established.join(', ')}

Check for:
1. Adherence to planned approach
2. Constraint violations
3. Pattern consistency
4. Missing implementations
`;
  }

  static contextualSuggestion(currentCode, context) {
    return `
Given the current code and project context, suggest improvements:

Current Context:
${context}

Consider:
1. Established patterns in the project
2. Previous decisions and their rationales
3. Active constraints
4. Related implementations
`;
  }

  static documentPlan(implementation, planId) {
    return `
Document the implementation for plan ${planId}:

What was actually implemented:
${implementation}

Update the plan with:
1. Actual approach taken
2. Any deviations from the original plan
3. New patterns established
4. Lessons learned
`;
  }
}
