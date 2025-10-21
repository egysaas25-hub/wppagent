## Testing Guide

This document provides comprehensive information about testing the WhatsApp Agent application.

## Table of Contents

1. [Overview](#overview)
2. [Testing Stack](#testing-stack)
3. [Running Tests](#running-tests)
4. [Test Structure](#test-structure)
5. [Writing Tests](#writing-tests)
6. [Code Coverage](#code-coverage)
7. [CI/CD Integration](#cicd-integration)
8. [Best Practices](#best-practices)

---

## Overview

The application uses **Jest** as the primary testing framework with comprehensive unit, integration, and end-to-end tests covering:

- Models and data access layer
- Services and business logic
- Utilities and helper functions
- API routes and endpoints
- WebSocket connections and events
- Middleware and authentication
- Database operations and migrations

**Code Coverage Target:** 70% minimum for branches, functions, lines, and statements

---

## Testing Stack

- **Jest**: Testing framework
- **ts-jest**: TypeScript preprocessor for Jest
- **Supertest**: HTTP assertions for API testing
- **socket.io-client**: WebSocket client for testing
- **Better-SQLite3**: In-memory database for tests

---

## Running Tests

### All Tests with Coverage
```bash
npm test
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### End-to-End Tests
```bash
npm run test:e2e
```

### CI Mode (for GitHub Actions)
```bash
npm run test:ci
```

---

## Test Structure

```
src/
├── tests/
│   ├── setup.ts                    # Global test setup
│   ├── helpers/
│   │   ├── test-database.ts        # Database test utilities
│   │   └── test-server.ts          # Server and request helpers
│   ├── unit/
│   │   ├── models/
│   │   │   └── tenant.model.test.ts
│   │   ├── services/
│   │   │   └── analytics.service.test.ts
│   │   └── utils/
│   │       ├── retry.utils.test.ts
│   │       └── memory.utils.test.ts
│   ├── integration/
│   │   ├── routes/
│   │   │   ├── tenant.routes.test.ts
│   │   │   └── analytics.routes.test.ts
│   │   └── websocket.test.ts
│   └── e2e/
│       └── complete-flow.test.ts
```

---

## Writing Tests

### Unit Test Example

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { TenantModel } from '../../../models/tenant.model';
import { createTestDatabase, cleanTestDatabase } from '../../helpers/test-database';

describe('TenantModel', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
    cleanTestDatabase(db);
  });

  describe('create', () => {
    it('should create a tenant with default values', () => {
      const tenant = TenantModel.create({
        name: 'Test Company',
        slug: 'test-company',
        email: 'test@company.com',
      });

      expect(tenant).toBeDefined();
      expect(tenant.id).toBeValidUUID();
      expect(tenant.name).toBe('Test Company');
      expect(tenant.plan).toBe('free');
    });
  });
});
```

### Integration Test Example

```typescript
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../../../app';
import { generateTestToken } from '../../helpers/test-server';

describe('Tenant Routes', () => {
  const token = generateTestToken({ role: 'admin' });

  it('should create a tenant', async () => {
    const response = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Company',
        slug: 'new-company',
        email: 'new@company.com',
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

### WebSocket Test Example

```typescript
import { io as ioClient, Socket } from 'socket.io-client';
import { generateTestToken } from '../helpers/test-server';

describe('WebSocket', () => {
  let socket: Socket;
  const token = generateTestToken();

  beforeAll((done) => {
    socket = ioClient('http://localhost:3000', {
      auth: { token },
    });
    socket.on('connect', done);
  });

  it('should join session room', (done) => {
    socket.emit('join-session', 'test-session');

    socket.on('session-status', (data) => {
      expect(data.sessionName).toBe('test-session');
      done();
    });
  });
});
```

---

## Test Utilities

### Global Test Utilities

Available in all tests via `global.testUtils`:

```typescript
// Create test user
const user = global.testUtils.createTestUser({
  email: 'custom@test.com',
  role: 'admin',
});

// Create test tenant
const tenant = global.testUtils.createTestTenant({
  plan: 'enterprise',
});

// Create test session
const session = global.testUtils.createTestSession({
  phone_number: '+1234567890',
});

// Sleep utility
await global.testUtils.sleep(1000); // Wait 1 second
```

### Custom Matchers

```typescript
// Check if string is valid UUID
expect(tenant.id).toBeValidUUID();

// Check if string is valid ISO 8601 date
expect(tenant.created_at).toBeISO8601();
```

### Test Database Helpers

```typescript
import { createTestDatabase, cleanTestDatabase, seedTestDatabase } from './helpers/test-database';

// Create in-memory database
const db = createTestDatabase();

// Clean all data
cleanTestDatabase(db);

// Seed with test data
seedTestDatabase(db);
```

### Test Server Helpers

```typescript
import {
  generateTestToken,
  authenticatedRequest,
  expectErrorResponse,
  expectSuccessResponse
} from './helpers/test-server';

// Generate JWT token
const token = generateTestToken({ role: 'admin' });

// Make authenticated requests
const req = authenticatedRequest(app, token);
const response = await req.get('/api/v1/tenants');

// Expect error response
expectErrorResponse(response, 404, 'Not found');

// Expect success response
expectSuccessResponse(response, 200);
```

---

## Code Coverage

### View Coverage Report

After running tests with coverage:

```bash
npm test
```

Open the HTML report:

```bash
open coverage/index.html
```

### Coverage Thresholds

Configured in `package.json`:

```json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 70,
        "lines": 70,
        "statements": 70
      }
    }
  }
}
```

### Improving Coverage

1. **Identify uncovered code:**
   ```bash
   npm test
   # Check coverage/index.html for details
   ```

2. **Write missing tests:**
   - Focus on red (uncovered) lines in the coverage report
   - Add tests for edge cases and error scenarios
   - Test both success and failure paths

3. **Verify improvement:**
   ```bash
   npm test
   # Coverage should increase
   ```

---

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests targeting `main` or `develop`

Workflow file: `.github/workflows/test.yml`

### Test Matrix

Tests run on multiple Node.js versions:
- Node.js 18.x
- Node.js 20.x
- Node.js 22.x

### CI Test Steps

1. Checkout code
2. Setup Node.js
3. Install dependencies
4. Run linter
5. Run type check
6. Run unit tests
7. Run integration tests
8. Run all tests with coverage
9. Upload coverage to Codecov
10. Security audit

### Local CI Simulation

Run the same tests as CI:

```bash
npm run test:ci
```

---

## Best Practices

### 1. Test Isolation

Each test should be independent:

```typescript
beforeEach(() => {
  cleanTestDatabase(db);
  seedTestDatabase(db);
});
```

### 2. Use Descriptive Names

```typescript
describe('TenantModel', () => {
  describe('create', () => {
    it('should create a tenant with default values', () => {
      // Test code
    });

    it('should throw error for duplicate slug', () => {
      // Test code
    });
  });
});
```

### 3. Test Both Success and Failure

```typescript
it('should create tenant successfully', () => {
  // Happy path
});

it('should throw error for invalid data', () => {
  // Error path
});
```

### 4. Mock External Dependencies

```typescript
import { jest } from '@jest/globals';

const mockFn = jest.fn().mockResolvedValue('mocked');
```

### 5. Clean Up Resources

```typescript
afterEach(() => {
  // Clean up
  jest.clearAllMocks();
});

afterAll(() => {
  // Close connections
  db.close();
  server.close();
});
```

### 6. Use Test Factories

```typescript
// Instead of repeating data
const user = global.testUtils.createTestUser();

// Or with overrides
const admin = global.testUtils.createTestUser({ role: 'admin' });
```

### 7. Test Edge Cases

```typescript
it('should handle empty array', () => {
  // Test with []
});

it('should handle null values', () => {
  // Test with null
});

it('should handle concurrent requests', async () => {
  // Test race conditions
});
```

### 8. Keep Tests Fast

- Use in-memory database (`:memory:`)
- Mock slow operations
- Avoid unnecessary delays
- Run tests in parallel

### 9. Maintain Test Data

```typescript
// Use constants for test data
const TEST_EMAIL = 'test@example.com';
const TEST_TENANT_ID = 'test-tenant-id';
```

### 10. Document Complex Tests

```typescript
it('should calculate correct analytics for multi-tenant scenario', () => {
  // Given: Multiple tenants with different message counts
  // When: Requesting dashboard metrics
  // Then: Each tenant should see only their data
});
```

---

## Debugging Tests

### Run Single Test File

```bash
npm test -- tenant.model.test.ts
```

### Run Single Test Suite

```bash
npm test -- --testNamePattern="TenantModel"
```

### Run Single Test

```bash
npm test -- --testNamePattern="should create a tenant"
```

### Enable Debug Output

```bash
DEBUG=* npm test
```

### VSCode Debugging

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Current File",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": [
    "${fileBasenameNoExtension}",
    "--config",
    "jest.config.js"
  ],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

---

## Common Issues

### Issue: Tests failing with database errors

**Solution:** Ensure database is cleaned between tests:

```typescript
beforeEach(() => {
  cleanTestDatabase(db);
});
```

### Issue: Timeout errors

**Solution:** Increase test timeout:

```typescript
it('slow test', async () => {
  // Test code
}, 10000); // 10 second timeout
```

Or globally in `jest.config.js`:

```json
{
  "testTimeout": 30000
}
```

### Issue: Tests pass locally but fail in CI

**Solution:** Check environment variables:

```typescript
beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = ':memory:';
});
```

### Issue: Coverage not reaching threshold

**Solution:** Add more tests for uncovered code:

1. Check `coverage/index.html`
2. Find uncovered lines (highlighted in red)
3. Add tests for those scenarios

---

## Testing Checklist

Before merging code, ensure:

- [ ] All tests pass locally
- [ ] Code coverage meets 70% threshold
- [ ] New features have corresponding tests
- [ ] Edge cases are tested
- [ ] Error scenarios are tested
- [ ] Integration tests cover main user flows
- [ ] Tests are independent and isolated
- [ ] No console.log or debugging code left
- [ ] Tests have descriptive names
- [ ] CI pipeline passes

---

## Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://testingjavascript.com/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Socket.io Testing](https://socket.io/docs/v4/testing/)

---

## Contributing

When adding new features:

1. Write tests first (TDD approach)
2. Ensure tests cover all code paths
3. Run full test suite before committing
4. Update this documentation if needed

## Support

For testing questions or issues:
1. Check this documentation
2. Review existing test examples
3. Check CI logs for failures
4. Open an issue on GitHub

---

## License

This project is licensed under the terms specified in the LICENSE file.
