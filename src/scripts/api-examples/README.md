# API Examples

This directory contains example scripts demonstrating how to interact with the Payload CMS REST API from external clients.

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

## API Authentication

The REST API uses JWT-based authentication:

1. **Login**: POST to `/api/users/login` with email and password
2. **Token**: The response includes a JWT token
3. **Headers**: Include the token in subsequent requests as `Authorization: JWT <token>`

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