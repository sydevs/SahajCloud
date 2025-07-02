# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Next.js 15** application integrated with **Payload CMS 3.0**, providing a headless content management system. The project uses TypeScript, MongoDB, and is configured for both development and production deployment.

## Essential Commands

### Development
- `pnpm dev` - Start development server (runs on http://localhost:3000)
- `pnpm devsafe` - Clean development start (removes .next directory first)
- `pnpm build` - Production build
- `pnpm start` - Start production server

### Code Quality & Types
- `pnpm lint` - Run ESLint
- `pnpm generate:types` - Generate TypeScript types from Payload schema (run after schema changes)
- `pnpm generate:importmap` - Generate import map for admin panel

### Testing
- `pnpm test` - Run all tests (integration + E2E)
- `pnpm test:int` - Run integration tests (Vitest)
- `pnpm test:e2e` - Run E2E tests (Playwright)

## Environment Setup

Required environment variables (copy from `.env.example`):
- `DATABASE_URI` - MongoDB connection string
- `PAYLOAD_SECRET` - Secret key for authentication

## Architecture Overview

### Route Structure
- `src/app/(frontend)/` - Public-facing Next.js pages
- `src/app/(payload)/` - Payload CMS admin interface and API routes
- `src/app/(payload)/api/` - Auto-generated API endpoints including GraphQL

### Collections
- **Users** (`src/collections/Users.ts`) - Authentication-enabled admin users
- **Media** (`src/collections/Media.ts`) - File uploads with required alt text

All

### Key Configuration Files
- `src/payload.config.ts` - Main Payload CMS configuration
- `next.config.mjs` - Next.js config with Payload integration
- `payload-types.ts` - Auto-generated TypeScript types (do not edit manually)

## Development Workflow

1. **Schema Changes**: When modifying collections, always run `pnpm generate:types` to update TypeScript definitions
2. **Database**: Uses MongoDB with auto-generated collections based on Payload schema
3. **Admin Access**: Available at `/admin` route with user authentication
4. **API Access**: REST API at `/api/*` and GraphQL at `/api/graphql`

## Testing Strategy

- **Integration Tests**: Located in `tests/` directory using Vitest and React Testing Library
- **E2E Tests**: Playwright tests for full application workflows
- **Database**: Tests use isolated test databases

## Deployment

- Configured for Payload Cloud deployment
- Docker Compose setup available for local development with MongoDB
- Production builds require MongoDB connection and proper environment variables