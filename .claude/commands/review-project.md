---
description: Perform a comprehensive code quality review of the project
---

You are performing a detailed code quality and maintainability review of this Payload CMS + Next.js project.

# Review Instructions

Follow this checklist systematically. For each section, identify specific issues with file paths and line numbers where applicable. Prioritize findings by severity (Critical, High, Medium, Low).

## 1. Payload CMS Collections Review

### Collection Structure
- [ ] Check all collections in `src/collections/` have proper TypeScript types
- [ ] Verify all collections use appropriate access control functions (`permissionBasedAccess()`, `adminOnlyAccess()`)
- [ ] Ensure localized fields are consistently marked with `localized: true`
- [ ] Check that relationships use correct collection slugs
- [ ] Verify hooks (`beforeChange`, `afterChange`, `beforeDelete`, `afterDelete`) are properly implemented
- [ ] Ensure soft delete is enabled where appropriate (`trash: true`)
- [ ] Check for proper admin UI configuration (labels, defaultColumns, useAsTitle)

### Field Validation
- [ ] Verify required fields are marked as `required: true`
- [ ] Check custom validation functions for edge cases
- [ ] Ensure unique constraints are properly enforced
- [ ] Review min/max constraints on arrays and numbers
- [ ] Check that upload fields have proper MIME type restrictions

### Access Control
- [ ] Verify permission-based access is implemented consistently across all collections
- [ ] Check that Managers and Clients collections are properly secured
- [ ] Ensure API clients cannot access restricted collections
- [ ] Verify locale-based filtering is applied where needed
- [ ] Check field-level access control for Translate permission

## 2. TypeScript & Type Safety

### Type Definitions
- [ ] Check for any `any` types that should be properly typed
- [ ] Verify `src/payload-types.ts` is up-to-date (run `pnpm generate:types`)
- [ ] Ensure custom types in components match Payload types
- [ ] Check for proper use of TypeScript generics
- [ ] Verify hook function signatures match Payload's types

### Type Imports
- [ ] Ensure types are imported from `@/payload-types` not manually defined
- [ ] Check for unused type imports
- [ ] Verify `import type` is used for type-only imports

## 3. Component Architecture

### Custom Payload Components
- [ ] Review components in `src/components/admin/` for proper Payload integration
- [ ] Check that custom fields use `useField` hook correctly
- [ ] Verify modal components use Payload's styling system
- [ ] Ensure components handle loading and error states
- [ ] Check for proper cleanup in useEffect hooks

### React Best Practices
- [ ] Check for unnecessary re-renders (missing dependencies, improper memoization)
- [ ] Verify proper key props in lists
- [ ] Ensure event handlers are not created inline unnecessarily
- [ ] Check for memory leaks in subscriptions/timers
- [ ] Verify accessibility attributes (ARIA labels, roles)

## 4. Data Management & Hooks

### Collection Hooks
- [ ] Review `beforeChange` hooks for data transformation logic
- [ ] Check `afterChange` hooks for side effects (relationship syncing)
- [ ] Verify `beforeDelete` hooks properly clean up related data
- [ ] Ensure hooks handle errors gracefully without breaking saves
- [ ] Check for potential infinite loops in hook chains

### Field Hooks
- [ ] Review field-level hooks in `src/lib/fieldUtils.ts`
- [ ] Verify file upload hooks (WebP conversion, thumbnail generation)
- [ ] Check that hooks properly handle missing data

## 5. Testing Coverage

### Integration Tests
- [ ] Check that all collections have integration tests in `tests/int/`
- [ ] Verify tests use `createTestEnvironment()` for proper isolation
- [ ] Ensure tests cover CRUD operations comprehensively
- [ ] Check that relationship tests validate bidirectional updates
- [ ] Verify validation tests cover edge cases

### Test Data
- [ ] Review test factories in `tests/utils/testData.ts`
- [ ] Ensure factory functions create valid test data
- [ ] Check that tests clean up properly in `afterAll` hooks
- [ ] Verify tests don't have hard dependencies on specific data

### E2E Tests
- [ ] Review Playwright tests for critical user flows
- [ ] Check that E2E tests cover admin UI interactions
- [ ] Verify tests handle async operations properly

## 6. Error Handling & Logging

### Error Boundaries
- [ ] Check that error boundaries are in place for critical components
- [ ] Verify Sentry integration is working correctly
- [ ] Ensure errors include sufficient context for debugging

### Validation Errors
- [ ] Review custom validation error messages for clarity
- [ ] Check that API errors return appropriate status codes
- [ ] Verify hook errors are logged properly

### Logging
- [ ] Check for console.log statements that should be removed
- [ ] Verify production logging uses appropriate levels
- [ ] Ensure sensitive data is not logged

## 7. Performance Optimization

### Database Queries
- [ ] Check for N+1 query patterns in relationships
- [ ] Verify proper use of `depth` parameter in queries
- [ ] Ensure indexes are defined for frequently queried fields
- [ ] Review collection hooks for expensive operations

### Asset Optimization
- [ ] Verify images are converted to WebP format
- [ ] Check that video thumbnails are generated efficiently
- [ ] Ensure file uploads have size limits
- [ ] Review media storage configuration (S3 vs local)

### API Performance
- [ ] Check for overly large API responses
- [ ] Verify pagination is implemented where needed
- [ ] Ensure proper use of select/populate in queries

## 8. Security Review

### Authentication & Authorization
- [ ] Verify API key authentication is implemented correctly
- [ ] Check that admin-only operations are properly protected
- [ ] Ensure password fields use proper encryption
- [ ] Review email verification flow

### Input Validation
- [ ] Check for SQL/NoSQL injection vulnerabilities in queries
- [ ] Verify file upload MIME type validation
- [ ] Ensure rich text fields sanitize HTML input
- [ ] Check for XSS vulnerabilities in rendered content

### Environment Variables
- [ ] Verify `.env.example` includes all required variables
- [ ] Check that secrets are not hardcoded
- [ ] Ensure sensitive env vars are not logged

## 9. Code Organization & Maintainability

### File Structure
- [ ] Check that files are organized according to project conventions
- [ ] Verify proper separation of concerns (collections, components, lib)
- [ ] Ensure naming conventions are consistent
- [ ] Check for dead code or unused files

### Code Duplication
- [ ] Look for repeated logic that could be extracted to utilities
- [ ] Check for similar validation functions across collections
- [ ] Verify consistent access control patterns

### Documentation
- [ ] Ensure CLAUDE.md accurately reflects current implementation
- [ ] Check that complex functions have JSDoc comments
- [ ] Verify migration scripts have README documentation
- [ ] Ensure architectural decisions are documented

## 10. Import/Migration Scripts

### Script Quality
- [ ] Review scripts in `migration/` for error handling
- [ ] Verify scripts use shared libraries from `migration/lib/`
- [ ] Check that dry-run mode works correctly
- [ ] Ensure scripts provide comprehensive summary output

### Data Integrity
- [ ] Verify scripts validate data before import
- [ ] Check that relationships are properly maintained
- [ ] Ensure cascade deletion works for FileAttachments
- [ ] Review tag management and deduplication

## 11. Configuration Files

### Payload Configuration
- [ ] Review `src/payload.config.ts` for correct plugin setup
- [ ] Verify locale configuration matches requirements
- [ ] Check storage adapter configuration (local/S3)
- [ ] Ensure email configuration is properly set

### Build Configuration
- [ ] Review `next.config.mjs` for proper Payload integration
- [ ] Check TypeScript configuration in `tsconfig.json`
- [ ] Verify ESLint rules in `eslint.config.mjs`
- [ ] Review test configurations (Vitest, Playwright)

## 12. Dependency Management

### Package Audit
- [ ] Run `pnpm audit` and review vulnerabilities
- [ ] Check for outdated dependencies with `pnpm outdated`
- [ ] Verify all dependencies are actually used
- [ ] Ensure peer dependencies are satisfied

### Version Management
- [ ] Check that critical dependencies have version constraints
- [ ] Verify Payload CMS version is consistent across packages
- [ ] Ensure React/Next.js versions are compatible

# Output Format

Provide your review in the following format:

## Executive Summary
- Total issues found: X
- Critical: X, High: X, Medium: X, Low: X
- Overall code quality rating: [Excellent/Good/Fair/Needs Improvement]

## Critical Issues (Must Fix)
[List with file paths and line numbers]

## High Priority Issues (Should Fix Soon)
[List with file paths and line numbers]

## Medium Priority Issues (Should Fix Eventually)
[List with file paths and line numbers]

## Low Priority Issues (Nice to Have)
[List with file paths and line numbers]

## Positive Findings
[List aspects of the code that are well-implemented]

## Recommendations
[Strategic recommendations for improving code quality]

---

Begin your comprehensive review now, focusing on areas most critical to maintainability and reliability.
