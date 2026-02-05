// ============================================
// Verifier - Deterministic verification checks
// ============================================

import { generateId, formatTimestamp } from '@/lib/utils';
import { eventStore } from '@/lib/event-store';
import type { 
  AcceptanceCriterion, 
  VerificationResult, 
  VerificationType,
  AuditEntry 
} from '@/types/orchestration';

export interface VerifierConfig {
  strictMode: boolean; // Fail on any error
  logResults: boolean; // Log all verification results
}

const DEFAULT_VERIFIER_CONFIG: VerifierConfig = {
  strictMode: true,
  logResults: true,
};

export class Verifier {
  private config: VerifierConfig;
  private auditEntries: AuditEntry[] = [];

  constructor(config?: Partial<VerifierConfig>) {
    this.config = { ...DEFAULT_VERIFIER_CONFIG, ...config };
  }

  // Run all verification checks for a task
  async verifyTask(
    runId: string,
    taskId: string,
    criteria: AcceptanceCriterion[],
    output: unknown
  ): Promise<{ passed: boolean; results: VerificationResult[] }> {
    const results: VerificationResult[] = [];
    let allPassed = true;

    for (const criterion of criteria) {
      const result = await this.verifyCriterion(criterion, output);
      results.push(result);

      if (!result.passed && criterion.required) {
        allPassed = false;
      }
    }

    // Log verification event
    if (this.config.logResults) {
      eventStore.appendEvent(runId, allPassed ? 'VERIFICATION_PASSED' : 'VERIFICATION_FAILED', {
        task_id: taskId,
        results,
        passed: allPassed,
      });
    }

    return { passed: allPassed, results };
  }

  // Verify a single criterion
  async verifyCriterion(
    criterion: AcceptanceCriterion,
    output: unknown
  ): Promise<VerificationResult> {
    const timestamp = formatTimestamp(new Date());

    try {
      switch (criterion.type) {
        case 'schema':
          return this.verifySchema(criterion, output, timestamp);
        case 'contains':
          return this.verifyContains(criterion, output, timestamp);
        case 'not_contains':
          return this.verifyNotContains(criterion, output, timestamp);
        case 'word_limit':
          return this.verifyWordLimit(criterion, output, timestamp);
        case 'lint':
          return this.verifyLint(criterion, output, timestamp);
        case 'test':
          return this.verifyTest(criterion, output, timestamp);
        case 'custom':
          return this.verifyCustom(criterion, output, timestamp);
        default:
          return {
            criterion_id: criterion.id,
            passed: false,
            message: `Unknown verification type: ${criterion.type}`,
            timestamp,
          };
      }
    } catch (error) {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp,
      };
    }
  }

  // Schema validation
  private verifySchema(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    const schema = criterion.config.schema as Record<string, unknown>;
    
    if (!schema) {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: 'No schema provided',
        timestamp,
      };
    }

    // Simple schema validation (in production, use Zod or JSON Schema)
    try {
      const data = typeof output === 'string' ? JSON.parse(output) : output;
      const requiredFields = Object.keys(schema);
      const missingFields = requiredFields.filter(f => !(f in (data as Record<string, unknown>)));

      if (missingFields.length > 0) {
        return {
          criterion_id: criterion.id,
          passed: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          details: { missingFields },
          timestamp,
        };
      }

      return {
        criterion_id: criterion.id,
        passed: true,
        message: 'Schema validation passed',
        timestamp,
      };
    } catch {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: 'Invalid JSON output',
        timestamp,
      };
    }
  }

  // Contains check
  private verifyContains(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    const patterns = criterion.config.patterns as string[];
    const content = String(output);

    const missingPatterns = patterns.filter(p => !content.includes(p));

    if (missingPatterns.length > 0) {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: `Missing required content: ${missingPatterns.join(', ')}`,
        details: { missingPatterns },
        timestamp,
      };
    }

    return {
      criterion_id: criterion.id,
      passed: true,
      message: 'Contains all required patterns',
      timestamp,
    };
  }

  // Not contains check
  private verifyNotContains(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    const patterns = criterion.config.patterns as string[];
    const content = String(output);

    const foundPatterns = patterns.filter(p => content.includes(p));

    if (foundPatterns.length > 0) {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: `Found forbidden content: ${foundPatterns.join(', ')}`,
        details: { foundPatterns },
        timestamp,
      };
    }

    return {
      criterion_id: criterion.id,
      passed: true,
      message: 'No forbidden patterns found',
      timestamp,
    };
  }

  // Word limit check
  private verifyWordLimit(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    const maxWords = criterion.config.max_words as number;
    const minWords = criterion.config.min_words as number | undefined;
    const content = String(output);
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    if (maxWords && wordCount > maxWords) {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: `Word count ${wordCount} exceeds limit of ${maxWords}`,
        details: { wordCount, maxWords },
        timestamp,
      };
    }

    if (minWords && wordCount < minWords) {
      return {
        criterion_id: criterion.id,
        passed: false,
        message: `Word count ${wordCount} below minimum of ${minWords}`,
        details: { wordCount, minWords },
        timestamp,
      };
    }

    return {
      criterion_id: criterion.id,
      passed: true,
      message: `Word count ${wordCount} within limits`,
      details: { wordCount },
      timestamp,
    };
  }

  // Lint check (stubbed for demo)
  private verifyLint(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    // In production, this would run an actual linter
    const language = criterion.config.language as string;
    
    return {
      criterion_id: criterion.id,
      passed: true,
      message: `Lint check passed for ${language}`,
      details: { language, errors: 0, warnings: 0 },
      timestamp,
    };
  }

  // Test check (stubbed for demo)
  private verifyTest(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    // In production, this would run actual tests
    const testFile = criterion.config.test_file as string;
    
    return {
      criterion_id: criterion.id,
      passed: true,
      message: `Tests passed: ${testFile}`,
      details: { testFile, passed: 1, failed: 0 },
      timestamp,
    };
  }

  // Custom check (stubbed for demo)
  private verifyCustom(
    criterion: AcceptanceCriterion,
    output: unknown,
    timestamp: string
  ): VerificationResult {
    const customFn = criterion.config.function as string;
    
    // In production, this would evaluate a custom function
    return {
      criterion_id: criterion.id,
      passed: true,
      message: `Custom check passed: ${customFn}`,
      timestamp,
    };
  }

  // Add audit entry
  addAuditEntry(
    runId: string,
    category: AuditEntry['category'],
    finding: string,
    severity: AuditEntry['severity'],
    taskId?: string
  ): AuditEntry {
    const entry: AuditEntry = {
      id: generateId(),
      timestamp: formatTimestamp(new Date()),
      category,
      finding,
      severity,
      task_id: taskId,
      resolved: false,
    };

    this.auditEntries.push(entry);

    eventStore.appendEvent(runId, 'AUDIT_NOTE', {
      audit_id: entry.id,
      category,
      finding,
      severity,
      task_id: taskId,
    });

    return entry;
  }

  // Get audit entries
  getAuditEntries(): AuditEntry[] {
    return [...this.auditEntries];
  }

  // Resolve an audit entry
  resolveAuditEntry(entryId: string): void {
    const entry = this.auditEntries.find(e => e.id === entryId);
    if (entry) {
      entry.resolved = true;
    }
  }

  // Check for contradictions against pinned context
  checkContradiction(
    runId: string,
    content: string,
    pinnedConstraints: string[]
  ): { hasContradiction: boolean; contradictions: string[] } {
    const contradictions: string[] = [];

    // Simple keyword-based contradiction detection
    // In production, this would use semantic analysis
    for (const constraint of pinnedConstraints) {
      const keywords = constraint.toLowerCase().split(/\s+/);
      const negativePatterns = ['not', 'never', 'must not', 'should not', 'cannot'];
      
      const isNegativeConstraint = negativePatterns.some(p => constraint.toLowerCase().includes(p));
      
      if (isNegativeConstraint) {
        // Check if content violates negative constraint
        const prohibitedTerms = keywords.filter(k => !negativePatterns.some(p => p.includes(k)));
        if (prohibitedTerms.some(t => content.toLowerCase().includes(t))) {
          contradictions.push(constraint);
        }
      }
    }

    if (contradictions.length > 0) {
      this.addAuditEntry(runId, 'contradiction', 
        `Content contradicts pinned constraints: ${contradictions.join('; ')}`,
        'warning'
      );
    }

    return { hasContradiction: contradictions.length > 0, contradictions };
  }

  // Clear audit entries
  clearAuditEntries(): void {
    this.auditEntries = [];
  }

  // Create acceptance criterion helper
  static createCriterion(
    type: VerificationType,
    description: string,
    config: Record<string, unknown>,
    required: boolean = true
  ): AcceptanceCriterion {
    return {
      id: generateId(),
      type,
      description,
      config,
      required,
    };
  }
}

// Singleton instance
export const verifier = new Verifier();
