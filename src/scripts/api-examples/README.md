# API Examples

This directory contains example scripts demonstrating how to interact with the Payload CMS REST API from external clients.

## Prerequisites

1. Ensure the development server is running:
   ```bash
   pnpm dev
   ```

2. Obtain an API key from your administrator:
   - API keys are generated through the Payload admin panel
   - Navigate to the Clients collection and create/manage API clients
   - Each client can generate their own API key

## REST API Example

The REST API example demonstrates:
- API Key authentication
- Read operations (GET requests)
- Pagination
- Filtering
- Sorting
- Read-only access restrictions

### Running the REST API Example

```bash
API_KEY="your-api-key-here" pnpm tsx src/scripts/api-examples/rest-api-example.ts
```

### Environment Variables

```bash
API_BASE_URL=http://localhost:3000/api  # Optional, defaults to localhost
API_KEY=your-api-key-here               # Required
```

## API Authentication

The REST API uses API Key authentication for third-party clients:

1. **API Key**: Obtained from the admin panel for each client
2. **Headers**: Include the key in requests as `Authorization: clients API-Key <YOUR_KEY>`
3. **Access**: All API clients have read-only access to non-restricted collections

## Access Control

- **Read-Only Access**: API clients can only perform GET requests
- **Restricted Collections**: Clients cannot access Users or Clients collections
- **Allowed Collections**: Tags, Narrators, Music, Meditations, Frames, Media

## API Usage Tracking

API usage is automatically tracked for each client:
- Total requests and daily request counts
- Last usage timestamp
- High usage alerts in the admin panel (>1000 requests/day)

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