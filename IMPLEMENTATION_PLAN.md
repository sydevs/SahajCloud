# Meditation App Implementation Plan with Payload CMS

## Overview
Backend implementation using Next.js 15 and Payload CMS 3.0, providing a headless content management system for meditation content with video, audio, and visual frame management capabilities. The frontend will be handled entirely through Payload CMS's admin panel.

## Core Collections

### 1. Meditations Collection
**Fields:**
- `title` (Text, required)
- `slug` (Text, unique, auto-generated)
- `duration` (Number, in minutes)
- `thumbnail` (Upload, relationship to Media)
- `audioFile` (Upload, relationship to Media)
- `narrator` (Relationship to Narrator collection)
- `tags` (Array of Text)
- `musicTag` (Text, for selecting background music)
- `isPublished` (Boolean, default false)
- `publishedDate` (Date)

### 2. Music Collection
**Fields:**
- `title` (Text, required)
- `slug` (Text, unique, auto-generated)
- `audioFile` (Upload, relationship to Media, required)
- `duration` (Number, in minutes)
- `tags` (Array of Text)
- `credit` (Text)

### 3. Frames Collection
**Fields:**
- `name` (Text, required)
- `slug` (Text, unique, auto-generated)
- `tags` (Array of Text)
- `maleFile` (Upload, relationship to Media)
- `femaleFile` (Upload, relationship to Media)

### 4. Narrator Collection
**Fields:**
- `name` (Text, required)
- `slug` (Text, unique, auto-generated)
- `gender` (Select: male/female)

### 5. Settings Global
**Fields:**
- `defaultMeditationThumbnail` (Upload, relationship to Media)
- `defaultNarrator` (Relationship to Narrator collection)

## Technical Implementation Plan

### Phase 1: Core Setup (Tickets 1-5)
1. **Initial Project Setup**
   - Set up Payload CMS with existing Next.js project
   - Configure MongoDB collections
   - Set up authentication with Users collection
   - Configure Media collection with enhanced fields

2. **Create Base Collections**
   - Implement Meditations collection with all fields
   - Implement Music collection
   - Implement Frames collection
   - Implement Narrator collection
   - Create Settings global

3. **Media Management Enhancement**
   - Extend Media collection for audio/video support
   - Add file type validation
   - Implement thumbnail generation for videos
   - Configure MinIO (S3-compatible) storage on Railway

4. **Admin UI Customization & Error Tracking**
   - Custom field components for tag selection
   - Duration input with minutes/seconds
   - Preview components for media files
   - Bulk operations UI
   - Integrate Sentry for error tracking and monitoring

5. **Data Migration Scripts**
   - Script to import existing meditations
   - Script to import music tracks
   - Script to import frames
   - Import existing narrator data

### Phase 2: API & Content Management (Tickets 6-8)
6. **API Development**
   - Configure Payload's built-in REST API
   - Configure Payload's built-in GraphQL endpoint
   - Set up API authentication using Payload's auth
   - Configure CORS and API access controls

7. **Content Management Tools**
   - Configure Payload's built-in batch operations
   - Set up content publishing workflows
   - Configure admin roles and permissions
   - Implement custom admin hooks for content validation

8. **Production Deployment**
   - Configure Railway deployment
   - Set up MinIO for media storage
   - Configure environment variables and secrets
   - Set up database backups and monitoring

## Development Tickets Breakdown

### Ticket 1: Initial Setup and Configuration
- Install and configure Payload CMS with Next.js
- Set up MongoDB connection
- Configure authentication
- Create basic project structure
- Set up development environment
- Install and configure Sentry for error tracking
- Write initial setup tests

### Ticket 2: Meditations Collection
- Create Meditation collection schema
- Implement all meditation fields
- Add validation rules
- Create admin UI customizations
- Write unit tests for collection validation
- Write integration tests for CRUD operations

### Ticket 3: Music Collection
- Create Music collection schema
- Implement simplified audio file handling
- Configure tags array field
- Add credit field
- Write tests for audio metadata extraction
- Write integration tests for collection operations

### Ticket 4: Frames Collection
- Create Frames collection schema
- Configure male/female file uploads
- Configure tags array field
- Write tests for dual file upload validation
- Write integration tests for frame management

### Ticket 5: Narrator Collection
- Create Narrator collection schema
- Configure name, slug, and gender fields
- Write validation tests
- Write integration tests for narrator relationships

### Ticket 6: Media Management System
- Enhance Media collection
- Implement file type validation
- Configure MinIO storage on Railway
- Create thumbnail generation
- Write tests for file upload and storage
- Write performance tests for large file uploads

### Ticket 7: API Configuration
- Configure Payload's built-in REST API
- Configure Payload's built-in GraphQL endpoint
- Set up API authentication using Payload's auth system
- Configure CORS and API access controls
- Write API endpoint tests
- Write integration tests for authentication

### Ticket 8: Production Deployment
- Configure Railway deployment environment
- Set up MinIO for S3-compatible media storage
- Configure environment variables and secrets
- Set up database backups
- Configure Sentry monitoring in production
- Write deployment validation tests
- Set up CI/CD pipeline with automated testing

## Technical Considerations

### Performance Requirements
- Admin panel load time < 2 seconds
- Media upload/streaming without interruption
- Support for 10,000+ content entries
- Efficient database queries with proper indexing

### Security Requirements
- Secure admin authentication system
- HTTPS everywhere
- Input validation and sanitization
- File upload security controls
- Sentry error monitoring and alerting

### Scalability Considerations
- Railway deployment with auto-scaling
- MinIO for scalable media storage
- Database indexing strategy
- Payload CMS built-in caching
- API rate limiting for external access

### Deployment Architecture
- Railway for application hosting
- MinIO for S3-compatible object storage
- MongoDB for database
- Sentry for error tracking and monitoring
- Automated testing in CI/CD pipeline

## Success Metrics
- Content management efficiency
- Media upload/processing speed
- Admin user productivity
- API response times
- System uptime and reliability
- Error rate tracking via Sentry