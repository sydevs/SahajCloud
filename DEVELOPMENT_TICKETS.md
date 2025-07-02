# Development Tickets - Meditation App Rebuild

## Epic: Meditation App Payload CMS Implementation

### Sprint 1: Foundation (Tickets 1-6)

#### Ticket #1: Sentry Integration and Production Environment Setup
**Type:** Task  
**Priority:** High  
**Estimate:** 3 hours  
**Dependencies:** None  

**Description:**
Add Sentry error tracking and prepare environment configuration for production deployment to Railway.

**Acceptance Criteria:**
- [ ] Sentry SDK installed and configured
- [ ] Error tracking working in development
- [ ] Production environment variables documented
- [ ] Railway deployment configuration prepared
- [ ] Sentry DSN environment variable configured
- [ ] Error boundaries implemented for admin interface
- [ ] Integration tests updated to verify Sentry setup

**Technical Tasks:**
1. Install @sentry/nextjs package
2. Configure Sentry in next.config.mjs
3. Set up Sentry environment variables
4. Add error boundaries to admin interface
5. Test error tracking in development
6. Document production environment variables for Railway
7. Write integration test for Sentry configuration
8. Update .env.example with Sentry variables

---

#### Ticket #2: Narrator Collection Implementation
**Type:** Feature  
**Priority:** High  
**Estimate:** 4 hours  
**Dependencies:** Ticket #1  

**Description:**
Create the Narrator collection for managing meditation narrators.

**Acceptance Criteria:**
- [ ] Narrator collection created with required fields
- [ ] Slug auto-generation working
- [ ] Gender field properly configured
- [ ] Admin UI allows easy narrator management
- [ ] Unit tests for validation logic
- [ ] Integration tests for narrator operations

**Technical Tasks:**
1. Create src/collections/Narrators.ts
2. Define name, slug, and gender fields
3. Implement slug auto-generation hook
4. Configure collection permissions
5. Write unit tests for validation
6. Write integration tests for CRUD operations
7. Test admin UI functionality

**Schema Definition:**
```typescript
{
  name: { type: 'text', required: true },
  slug: { type: 'text', unique: true },
  gender: { type: 'select', options: ['male', 'female'] }
}
```

---

#### Ticket #3: Meditations Collection Implementation
**Type:** Feature  
**Priority:** High  
**Estimate:** 12 hours  
**Dependencies:** Ticket #2  

**Description:**
Create the core Meditations collection with all required fields, relationships, and admin filtering.

**Acceptance Criteria:**
- [ ] Meditations collection created with all specified fields
- [ ] Proper validation rules implemented
- [ ] Media relationships working correctly
- [ ] Tags array field supports multiple text entries
- [ ] Tags filtering working in admin interface
- [ ] Narrator relationship to Narrator collection working
- [ ] Admin UI shows custom field layouts
- [ ] Unit tests written for validation logic
- [ ] Integration tests for CRUD operations passing

**Technical Tasks:**
1. Create src/collections/Meditations.ts
2. Define all fields with proper types
3. Implement slug auto-generation
4. Set up media upload relationships
5. Configure tags array field with admin filtering
6. Configure relationship to Narrator collection
7. Add field validations and hooks
8. Write unit tests for validation logic
9. Write integration tests for CRUD operations
10. Test all operations in admin UI
11. Test tags filtering functionality

**Schema Definition:**
```typescript
{
  title: { type: 'text', required: true },
  slug: { type: 'text', unique: true },
  duration: { type: 'number', min: 1 },
  thumbnail: { type: 'upload', relationTo: 'media' },
  audioFile: { type: 'upload', relationTo: 'media' },
  narrator: { type: 'relationship', relationTo: 'narrators' },
  tags: { type: 'array', fields: [{ type: 'text' }] },
  musicTag: { type: 'text' },
  isPublished: { type: 'checkbox', defaultValue: false },
  publishedDate: { type: 'date' }
}
```

---

#### Ticket #4: Music Collection Implementation
**Type:** Feature  
**Priority:** High  
**Estimate:** 10 hours  
**Dependencies:** Ticket #1  

**Description:**
Create the Music collection for managing background music tracks with tags filtering.

**Acceptance Criteria:**
- [ ] Music collection created with simplified fields
- [ ] Audio file upload and validation working
- [ ] Tags array field working
- [ ] Tags filtering working in admin interface
- [ ] Credit field for attribution
- [ ] Duration automatically calculated from audio file
- [ ] Admin can preview audio files
- [ ] Unit tests for metadata extraction
- [ ] Integration tests for collection operations

**Technical Tasks:**
1. Create src/collections/Music.ts
2. Implement audio file validation
3. Add metadata extraction for duration
4. Configure tags array field with admin filtering
5. Add credit text field
6. Add audio preview in admin UI
7. Write unit tests for metadata extraction
8. Write integration tests for CRUD operations
9. Test tags filtering functionality

**Schema Definition:**
```typescript
{
  title: { type: 'text', required: true },
  slug: { type: 'text', unique: true },
  audioFile: { type: 'upload', relationTo: 'media', required: true },
  duration: { type: 'number' },
  tags: { type: 'array', fields: [{ type: 'text' }] },
  credit: { type: 'text' }
}
```

---

#### Ticket #5: Frames Collection Implementation
**Type:** Feature  
**Priority:** High  
**Estimate:** 10 hours  
**Dependencies:** Ticket #1  

**Description:**
Create the Frames collection for meditation pose files with tags filtering.

**Acceptance Criteria:**
- [ ] Frames collection created with simplified fields
- [ ] Male and female file uploads working
- [ ] Tags array field working
- [ ] Tags filtering working in admin interface
- [ ] Both media uploads properly validated
- [ ] Admin UI shows both file previews
- [ ] Unit tests for dual file validation
- [ ] Integration tests for frame operations

**Technical Tasks:**
1. Create src/collections/Frames.ts
2. Configure male and female media upload fields
3. Configure tags array field with admin filtering
4. Add file validation for both uploads
5. Implement preview functionality
6. Write unit tests for dual file validation
7. Write integration tests for frame management
8. Test tags filtering functionality

**Schema Definition:**
```typescript
{
  name: { type: 'text', required: true },
  slug: { type: 'text', unique: true },
  tags: { type: 'array', fields: [{ type: 'text' }] },
  maleFile: { type: 'upload', relationTo: 'media' },
  femaleFile: { type: 'upload', relationTo: 'media' }
}
```

---

#### Ticket #6: Meditation-Frame Relationships
**Type:** Feature  
**Priority:** High  
**Estimate:** 8 hours  
**Dependencies:** Tickets #3, #5  

**Description:**
Create Meditation-Frame relationships with timestamps, configured as part of each Meditation record and hidden from the admin panel.

**Acceptance Criteria:**
- [ ] MeditationFrames collection created for timestamp relationships
- [ ] Collection hidden from admin panel navigation
- [ ] Frame relationships managed within Meditation collection interface
- [ ] Timestamps automatically order the frames
- [ ] Validation ensures timestamp uniqueness per meditation
- [ ] Unit tests for timestamp validation
- [ ] Integration tests for meditation-frame relationships

**Technical Tasks:**
1. Create src/collections/MeditationFrames.ts with hidden admin access
2. Configure collection to be hidden from admin panel
3. Add frame relationship field to Meditations collection
4. Implement timestamp validation and ordering
5. Create custom admin component for managing frames within meditation
6. Write unit tests for timestamp validation
7. Write integration tests for meditation-frame relationships
8. Test frame management within meditation admin interface

**MeditationFrames Schema:**
```typescript
{
  meditation: { type: 'relationship', relationTo: 'meditations', required: true },
  frame: { type: 'relationship', relationTo: 'frames', required: true },
  timestamp: { type: 'number', min: 0, required: true } // seconds - used for ordering
}
```

---

#### Ticket #7: Enhanced Media Management
**Type:** Feature  
**Priority:** High  
**Estimate:** 12 hours  
**Dependencies:** Tickets #3, #4, #5  

**Description:**
Enhance Media collection with strict file type validation, format conversion, and MinIO storage integration.

**Acceptance Criteria:**
- [ ] Media collection supports images, audio, and video with strict validation
- [ ] Audio files validated as MP3 format only
- [ ] Video files validated as WebM format only
- [ ] Image files (JPG/PNG) automatically converted to WebP
- [ ] MinIO (S3-compatible) storage integration working
- [ ] Automatic thumbnail generation for videos
- [ ] File size limits enforced per file type
- [ ] Alt text required for accessibility
- [ ] Unit tests for file validation and conversion
- [ ] Integration tests for storage operations
- [ ] Performance tests for large file uploads

**Technical Tasks:**
1. Extend Media collection with strict file type validation
2. Implement MP3-only validation for audio files
3. Implement WebM-only validation for video files
4. Implement JPG/PNG to WebP automatic conversion
5. Set up MinIO adapter (S3-compatible)
6. Create video thumbnail generator
7. Add file size validation per type
8. Configure MinIO bucket policies
9. Write unit tests for file validation and conversion
10. Write integration tests for storage operations
11. Write performance tests for large uploads

---

### Sprint 2: API & Deployment (Tickets 8-9)

#### Ticket #8: API Configuration & Content Import
**Type:** Feature  
**Priority:** High  
**Estimate:** 12 hours  
**Dependencies:** Tickets #1-7  

**Description:**
Configure Payload's built-in APIs and implement content import tools.

**Acceptance Criteria:**
- [ ] Payload's REST API properly configured
- [ ] Payload's GraphQL endpoint working
- [ ] API authentication configured
- [ ] CORS settings properly configured
- [ ] Content import scripts functional
- [ ] Data validation for imports working
- [ ] Unit tests for import logic
- [ ] Integration tests for API endpoints

**Technical Tasks:**
1. Configure Payload's REST API settings
2. Configure GraphQL endpoint
3. Set up API authentication
4. Configure CORS for external access
5. Create content import scripts for existing data
6. Implement data validation for imports
7. Write unit tests for import validation
8. Write integration tests for API endpoints
9. Test API with sample external requests

---

#### Ticket #9: Production Deployment
**Type:** Task  
**Priority:** High  
**Estimate:** 16 hours  
**Dependencies:** Ticket #8  

**Description:**
Deploy the application to Railway with MinIO storage and proper monitoring.

**Acceptance Criteria:**
- [ ] Application deployed to Railway
- [ ] MinIO configured for media storage
- [ ] Environment variables properly set
- [ ] Database connection working in production
- [ ] Sentry monitoring active in production
- [ ] Backup strategy implemented
- [ ] CI/CD pipeline configured
- [ ] Deployment tests passing

**Technical Tasks:**
1. Configure Railway deployment environment
2. Set up MinIO service on Railway
3. Configure environment variables and secrets
4. Set up production database
5. Configure Sentry for production monitoring
6. Implement database backup strategy
7. Set up CI/CD pipeline with automated testing
8. Write deployment validation tests
9. Document deployment procedures
10. Test full deployment process

---

### Sprint 3: Final Polish & Documentation (Ticket 10)

#### Ticket #10: Documentation & Final Testing
**Type:** Task  
**Priority:** Medium  
**Estimate:** 8 hours  
**Dependencies:** Ticket #9  

**Description:**
Complete project documentation and perform final system testing.

**Acceptance Criteria:**
- [ ] API documentation complete and up-to-date
- [ ] Admin user guide created
- [ ] Deployment procedures documented
- [ ] Content management workflows documented
- [ ] Final system integration tests passing
- [ ] Performance benchmarks documented
- [ ] Sentry monitoring confirmed working
- [ ] Backup and recovery procedures tested

**Technical Tasks:**
1. Create comprehensive API documentation
2. Write admin user guide for content management
3. Document deployment and maintenance procedures
4. Create content management workflow guides
5. Run final integration test suite
6. Document performance benchmarks
7. Verify Sentry monitoring and alerting
8. Test backup and recovery procedures
9. Conduct final system review

## Additional Considerations

### Technical Debt Items
- Refactor any prototype code
- Optimize database queries and indexing
- Improve error handling and logging
- Regular dependency updates
- Monitor and optimize MinIO storage usage

### Future Enhancement Ideas
- API rate limiting and analytics
- Advanced content scheduling features
- Automated content validation
- Integration with external CDNs
- Multi-language content support
- Advanced admin reporting features

### Risk Mitigation
- Regular automated backups of database and media
- Disaster recovery plan for Railway deployment
- Sentry monitoring and alerting
- MinIO backup and replication strategy
- API security monitoring