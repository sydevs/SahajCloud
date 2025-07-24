# API Examples

This directory contains example scripts demonstrating how to interact with the Payload CMS API from external clients.

## Prerequisites

1. Ensure the development server is running:
   ```bash
   pnpm dev
   ```

2. Make sure you have a valid user account. The default credentials are:
   - Email: `contact@sydevelopers.com`
   - Password: `evk1VTH5dxz_nhg-mzk`

## REST API Example

The REST API example demonstrates:
- Authentication
- CRUD operations (Create, Read, Update, Delete)
- Pagination
- Filtering
- Sorting

### Running the REST API Example

```bash
pnpm tsx src/scripts/api-examples/rest-api-example.ts
```

### Environment Variables (Optional)

```bash
API_BASE_URL=http://localhost:3000/api
API_EMAIL=contact@sydevelopers.com
API_PASSWORD=evk1VTH5dxz_nhg-mzk
```

## GraphQL API Example

The GraphQL API example demonstrates:
- Authentication via GraphQL
- Query operations
- Mutations
- Filtering with where clauses
- Complex queries with relationships
- Using GraphQL fragments

### Running the GraphQL API Example

```bash
pnpm tsx src/scripts/api-examples/graphql-api-example.ts
```

### Environment Variables (Optional)

```bash
GRAPHQL_ENDPOINT=http://localhost:3000/api/graphql
API_EMAIL=contact@sydevelopers.com
API_PASSWORD=evk1VTH5dxz_nhg-mzk
```

## API Authentication

Both examples demonstrate how to authenticate with the API:

1. **REST API**: POST to `/api/users/login` with email and password
2. **GraphQL**: Use the `loginUser` mutation

The authentication response includes a JWT token that must be included in subsequent requests:
- REST: `Authorization: JWT <token>`
- GraphQL: Same header format

## CORS Configuration

For external clients, ensure CORS is properly configured in the Payload config:

```typescript
cors: process.env.PAYLOAD_PUBLIC_CORS_ORIGINS?.split(',') || '*'
```

Set the `PAYLOAD_PUBLIC_CORS_ORIGINS` environment variable to specify allowed origins:
```
PAYLOAD_PUBLIC_CORS_ORIGINS=http://localhost:3001,https://myapp.com
```

## Rate Limiting

The API includes rate limiting to prevent abuse:
- Development: 10,000 requests per 15 minutes
- Production: 100 requests per 15 minutes

## Error Handling

Both examples include error handling for:
- Authentication failures
- Network errors
- API validation errors
- Rate limiting

## Additional Resources

- [Payload REST API Documentation](https://payloadcms.com/docs/rest-api/overview)
- [Payload GraphQL Documentation](https://payloadcms.com/docs/graphql/overview)
- [Payload Authentication](https://payloadcms.com/docs/authentication/overview)