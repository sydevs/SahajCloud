# Railway Deployment Guide

This guide covers deploying the Meditation CMS to Railway with Sentry integration.

## Prerequisites

1. Railway account and CLI installed
2. Sentry account and project created
3. MongoDB database (can be deployed on Railway)
4. MinIO instance for file storage (can be deployed on Railway)

## Environment Variables

Set the following environment variables in Railway:

### Required Variables
```bash
# Application
NODE_ENV=production
DATABASE_URI=mongodb://your-mongodb-connection-string
PAYLOAD_SECRET=your-super-secret-payload-key

# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ORG=your-sentry-organization
SENTRY_PROJECT=your-sentry-project-name

# Optional: For source map uploads (recommended for production)
SENTRY_AUTH_TOKEN=your-sentry-auth-token
```

## Deployment Steps

1. **Connect Repository**
   ```bash
   railway login
   railway link
   ```

2. **Configure Environment Variables**
   ```bash
   # Set variables via CLI
   railway variables set NODE_ENV=production
   railway variables set DATABASE_URI="your-mongodb-uri"
   railway variables set PAYLOAD_SECRET="your-secret"
   railway variables set SENTRY_DSN="your-sentry-dsn"
   railway variables set NEXT_PUBLIC_SENTRY_DSN="your-sentry-dsn"
   railway variables set SENTRY_ORG="your-org"
   railway variables set SENTRY_PROJECT="your-project"
   ```

3. **Deploy**
   ```bash
   railway up
   ```

## Health Monitoring

The application includes a health check endpoint at `/api/health` that Railway can use for monitoring:

- **Endpoint**: `https://your-app.railway.app/api/health`
- **Response**: JSON with status, timestamp, uptime, and environment info

## Error Monitoring

Sentry integration provides:

- **Error Tracking**: Automatic capture of server and client errors
- **Performance Monitoring**: Request timing and performance metrics
- **Admin Interface Protection**: Error boundaries around the admin interface
- **Test Endpoint**: `/api/test-sentry` for verifying integration

### Testing Sentry Integration

After deployment, test Sentry integration:

```bash
# Test error capture
curl "https://your-app.railway.app/api/test-sentry?type=error"

# Test message capture  
curl "https://your-app.railway.app/api/test-sentry?type=message"

# Test exception capture
curl "https://your-app.railway.app/api/test-sentry?type=exception"
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Ensure all environment variables are set
   - Check that `pnpm` is available in the build environment

2. **Database Connection**
   - Verify DATABASE_URI is correct
   - Ensure MongoDB instance is accessible from Railway

3. **Sentry Not Working**
   - Verify SENTRY_DSN is correct
   - Check that Sentry project exists and is configured
   - Review application logs for Sentry initialization errors

### Logs

View deployment logs:
```bash
railway logs
```

View specific service logs:
```bash
railway logs --service your-service-name
```

## Security Considerations

- Never commit environment variables to the repository
- Use Railway's encrypted environment variable storage
- Regularly rotate secrets (PAYLOAD_SECRET, SENTRY_AUTH_TOKEN)
- Monitor Sentry for suspicious error patterns

## Performance

- Sentry trace sampling is set to 10% in production to reduce overhead
- Source maps are uploaded to Sentry for better error tracking
- Health checks are lightweight and cached