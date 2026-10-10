import './api/support/harness';
import { describe } from 'vitest';
import { registerFoundationTests } from './api/foundation.cases';
import { registerAssignmentTests } from './api/assignment.cases';
import { registerSecurityTests } from './api/security.cases';

describe('Etapa B, HTTP real și PostgreSQL real', () => {
  registerFoundationTests();
  registerAssignmentTests();
  registerSecurityTests();
});
