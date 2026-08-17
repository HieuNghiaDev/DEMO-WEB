---
title: EmployeeManagement Technical Stack
description: Technology choices, architecture decisions, and development guidelines
inclusion: auto
---

# EmployeeManagement Technical Stack

## Technology Overview

### Backend: Laravel 12 (PHP 8.2+)

**Framework Choice Rationale:**
- Laravel provides robust MVC architecture with excellent ORM (Eloquent)
- Built-in authentication scaffolding with Sanctum
- Powerful query builder and migration system
- Rich ecosystem with packages for Excel, queues, caching
- Strong community support and documentation

**Key Laravel Features Used:**
- **Eloquent ORM** - Database models with relationships
- **Laravel Sanctum** - API token authentication
- **Migrations** - Database version control
- **Seeders** - Initial data population
- **Service Classes** - Business logic separation
- **Middleware** - Request/response processing
- **Validation** - Input data validation

**Core Dependencies:**
```json
{
  "laravel/framework": "^12.0",
  "laravel/sanctum": "^4.0",
  "phpoffice/phpspreadsheet": "^5.9"
}
```

### Frontend: React 19 + Vite + TypeScript

**Framework Choice Rationale:**
- React 19 provides modern component architecture with hooks
- TypeScript adds type safety and better IDE support
- Vite offers blazing-fast dev server and build times
- Large ecosystem with UI libraries and tooling

**Key React Features Used:**
- **Function Components** - Modern React approach
- **Hooks** - State management (useState, useEffect, useCallback, useContext)
- **Context API** - Global state (Auth, Theme)
- **React Router v7** - Client-side routing
- **TypeScript** - Type-safe component props and API responses

**Core Dependencies:**
```json
{
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "react-router-dom": "^7.18.2",
  "axios": "^1.19.0",
  "tailwindcss": "^4.3.3",
  "lucide-react": "^1.29.0",
  "typescript": "~6.0.2"
}
```

### Styling: Tailwind CSS 4

**CSS Framework Rationale:**
- Utility-first approach speeds up development
- Consistent design system
- Excellent mobile-responsive utilities
- Minimal CSS bundle size with purging
- Dark mode support built-in

**Tailwind Configuration:**
- Custom color palette for THEMIS brand
- Responsive breakpoints for mobile/tablet/desktop
- Custom animations for loading states
- Dark/light theme variables

### API Communication: Axios + REST

**Architecture:**
- RESTful API design principles
- JSON request/response format
- Bearer token authentication in headers
- Centralized API client configuration

**Axios Interceptors:**
```typescript
// Request interceptor - adds auth token
api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

**API Structure:**
- Base URL: `{BACKEND_URL}/api`
- All endpoints return consistent JSON structure
- Error responses include user-friendly messages in Japanese
- Rate limiting applied per IP and endpoint

### Authentication: Laravel Sanctum

**Token-Based Authentication:**
- Stateless API authentication (no sessions/cookies)
- Bearer token in Authorization header
- Per-request authentication via middleware

**Token Management:**
- Tokens stored in localStorage (remember me) or sessionStorage (temporary)
- Configurable expiration: 12 hours (default) or 30 days (remember)
- Token revocation on logout
- Multiple concurrent sessions supported

**Security Features:**
- CSRF not required for stateless API
- Rate limiting on login endpoint (5 attempts/minute)
- Security audit logging for authentication events
- Automatic token cleanup on user deletion

### Database Architecture

**Database: SQLite (Development) → PostgreSQL/MySQL (Production)**

**Schema Design Principles:**
- Normalized structure with foreign key constraints
- Soft deletes for employees (data retention)
- Timestamps on all tables (created_at, updated_at)
- Indexes on frequently queried columns

**Core Tables:**

```sql
-- Authentication
users (id, email, password, employee_id, role, is_active)
personal_access_tokens (Sanctum tokens)

-- Master Data
offices (id, office_code, name, address, status)
departments (id, code, name, office_id)
employees (id, employee_code, full_name, office_id, department_id, status)

-- Attendance Tracking
attendances (id, employee_id, work_date, clock_in, clock_out, status)
work_sessions (id, attendance_id, task_description, started_at, ended_at, status)

-- Audit & Security
security_audit_logs (id, event, outcome, user_id, employee_id, ip_address, metadata)
```

**Relationships:**
- `User` belongsTo `Employee`
- `Employee` belongsTo `Office`, `Department`
- `Employee` hasMany `Attendances`
- `Attendance` hasMany `WorkSessions`
- `Attendance` belongsTo `Employee`

**Migration Strategy:**
- All schema changes via migrations (no manual SQL)
- Migrations are sequential with timestamp prefixes
- Rollback capability for all migrations
- Seeder classes for initial data

### Excel Export: PhpSpreadsheet

**Library Choice:**
- PhpSpreadsheet is the successor to PHPExcel
- Pure PHP (no external dependencies)
- Supports XLSX format with full styling
- Memory efficient for large datasets

**Implementation:**
- **AttendanceExcelService** - Master attendance sheet synchronization
- **PersonalAttendanceReportService** - Individual employee reports
- Real-time sync on every attendance/work session change
- Non-blocking (failures logged, don't break user flow)

**Excel Features:**
- Professional dashboard design with metrics
- Color-coded status cells
- Auto-calculated work hours
- Separate sheets for attendance and work sessions
- Data validation dropdowns
- Auto-filter enabled
- Print-ready formatting (A4 landscape)

**Performance Considerations:**
- Incremental updates (only modified rows)
- File locking needed for concurrent writes (TODO)
- Consider moving to queue system for production

## Architecture Patterns

### Backend Architecture

**MVC + Service Layer:**
```
Request → Middleware → Controller → Service → Model → Database
                  ↓
              Response
```

**Responsibilities:**
- **Controllers** - HTTP request/response handling, validation
- **Services** - Business logic, complex operations, external integrations
- **Models** - Data representation, relationships, accessors/mutators
- **Middleware** - Cross-cutting concerns (auth, logging, headers)

**Service Pattern Examples:**
```php
// Services handle complex business logic
class AttendanceExcelService {
    public function sync(Attendance $attendance): void
    public function syncWorkSession(WorkSession $workSession): void
}

class SecurityAuditLogger {
    public function record(Request $request, string $event, ...): void
}
```

### Frontend Architecture

**Component-Based + Context API:**
```
App
├── Context Providers (Auth, Theme)
├── Router (React Router)
│   ├── Public Routes (Login)
│   └── Protected Routes
│       └── MainLayout (Sidebar + Outlet)
│           └── Page Components
│               └── Sub-components
```

**State Management Strategy:**
- **Local State (useState)** - Component-specific state
- **Context API** - Global state (user, theme)
- **No Redux** - Context API sufficient for current scope
- **Future**: Consider Zustand or Recoil if state complexity grows

**API Layer Separation:**
```typescript
// services/api.ts - Centralized API client
export const api = axios.create({ baseURL: apiUrl })

// Components call API directly (no separate service layer yet)
const response = await api.post('/attendances/start')
```

### Security Architecture

**Defense in Depth:**

1. **Network Layer:**
   - CORS configuration limiting origins
   - HTTPS enforced in production (HSTS headers)
   - Rate limiting per IP and endpoint

2. **Application Layer:**
   - Input validation on all endpoints
   - SQL injection prevention via Eloquent ORM
   - XSS prevention via React (escaped by default)
   - CSRF not applicable (stateless API)

3. **Authentication Layer:**
   - Token-based auth (Sanctum)
   - Password hashing (Bcrypt, 12 rounds)
   - Account status validation
   - Token expiration enforcement

4. **Authorization Layer:**
   - Employee can only access own attendance records
   - Role-based access (future enhancement)

5. **Audit Layer:**
   - Security event logging (SecurityAuditLogger)
   - Sensitive data filtering in logs
   - Immutable audit trail

**Security Headers:**
```php
'X-Frame-Options' => 'DENY'
'X-Content-Type-Options' => 'nosniff'
'Referrer-Policy' => 'no-referrer'
'Content-Security-Policy' => "default-src 'none'; ..."
'Strict-Transport-Security' => 'max-age=31536000; includeSubDomains'
```

## Development Workflow

### Local Development Setup

**Prerequisites:**
- PHP 8.2+
- Composer 2.x
- Node.js 18+
- npm or pnpm

**Backend Setup:**
```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
touch database/database.sqlite
php artisan migrate --seed
php artisan serve
```

**Frontend Setup:**
```bash
cd frontend
npm install
npm run dev
```

**Development URLs:**
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000/api`

### Environment Configuration

**Backend `.env`:**
```env
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173

DB_CONNECTION=sqlite
SESSION_DRIVER=database
QUEUE_CONNECTION=database
```

**Frontend `.env.development`:**
```env
VITE_BACKEND_URL=http://localhost:8000
VITE_API_URL=http://localhost:8000/api
```

### Code Style & Conventions

**PHP (Laravel):**
- Follow PSR-12 coding standard
- Use Laravel Pint for automatic formatting
- Type hints on all method parameters and returns
- Doc blocks for complex methods
- Use strict types: `declare(strict_types=1);`

**TypeScript/React:**
- Follow React + TypeScript best practices
- Use ESLint for linting
- PascalCase for components, camelCase for functions
- Explicit return types on functions
- Proper typing for props and state

**Database:**
- Snake_case for table and column names
- Singular model names, plural table names
- Foreign keys: `{table}_id` pattern
- Timestamps on all tables

## Production Considerations

### Database Migration

**From SQLite to PostgreSQL/MySQL:**
1. Export data from SQLite
2. Create production database
3. Run migrations on production DB
4. Import data
5. Update `.env` with production credentials

**Backup Strategy:**
- Daily automated backups
- Point-in-time recovery capability
- Backup retention: 30 days
- Backup testing monthly

### Performance Optimization

**Backend:**
- Enable OPcache for PHP
- Use Redis for cache and sessions
- Database query optimization with indexes
- Eager loading to avoid N+1 queries
- Queue Excel generation (move to background jobs)

**Frontend:**
- Code splitting and lazy loading
- Image optimization
- Bundle size optimization
- CDN for static assets

**Database:**
```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_attendances_employee_date ON attendances(employee_id, work_date);
CREATE INDEX idx_work_sessions_attendance_status ON work_sessions(attendance_id, status);
CREATE INDEX idx_employees_status ON employees(status);
```

### Deployment Strategy

**Backend Deployment:**
- Use Laravel Forge, Envoyer, or Docker
- Environment-specific `.env` files
- Run migrations automatically: `php artisan migrate --force`
- Clear caches: `php artisan config:clear && php artisan cache:clear`
- Restart queue workers after deployment

**Frontend Deployment:**
- Build production bundle: `npm run build`
- Deploy `dist/` folder to web server or CDN
- Set production environment variables
- Configure web server for SPA routing (fallback to index.html)

**CI/CD Pipeline (Recommended):**
```yaml
# Example GitHub Actions workflow
- Run tests (PHPUnit, Vitest)
- Run linters (Pint, ESLint)
- Build frontend
- Deploy to staging
- Run smoke tests
- Deploy to production (manual approval)
```

### Monitoring & Logging

**Application Monitoring:**
- Error tracking: Sentry, Bugsnag, or Flare
- Performance monitoring: New Relic or Laravel Telescope
- Uptime monitoring: UptimeRobot or Pingdom

**Logging Strategy:**
```php
// Laravel logging channels
'stack' => ['daily', 'slack'] // Production
'daily' => ['days' => 14]      // Rotation

// Security audit logs retention
// Implement cleanup job: delete logs older than 1 year
```

**Health Checks:**
- `/up` endpoint for load balancer health checks
- Database connectivity check
- Cache connectivity check
- Queue worker status

### Scaling Considerations

**Horizontal Scaling:**
- Stateless API (no session affinity needed)
- Load balancer with multiple app servers
- Shared database (primary/replica setup)
- Shared cache (Redis cluster)
- Shared file storage for uploads

**Vertical Scaling:**
- Increase PHP memory limit for large Excel exports
- More database connections in pool
- Larger Redis cache size

**Bottlenecks to Watch:**
- Excel file generation (move to queue)
- Concurrent Excel file writes (implement locking)
- Database queries without indexes
- N+1 query problems

### Security Hardening

**Production Checklist:**
- [ ] Enable HTTPS only (HSTS)
- [ ] Set strong password policy
- [ ] Limit failed login attempts
- [ ] Enable two-factor authentication (future)
- [ ] Restrict database access to app servers only
- [ ] Use environment-specific secrets
- [ ] Enable audit logging
- [ ] Regular security updates
- [ ] Penetration testing
- [ ] GDPR/compliance review

**Environment Variables:**
```env
# Never commit these to version control
APP_KEY=base64:...
DB_PASSWORD=...
SESSION_ENCRYPT=true
SANCTUM_STATEFUL_DOMAINS=production-domain.com
```

### Backup & Disaster Recovery

**Backup Types:**
1. **Database Backups** - Daily full, hourly incremental
2. **File Backups** - Excel files, uploads (if any)
3. **Configuration Backups** - `.env` files (encrypted)
4. **Code Backups** - Git repository

**Recovery Procedures:**
- Document restore procedures
- Test restores quarterly
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 1 hour

### Maintenance Windows

**Planned Maintenance:**
- Schedule during off-hours (e.g., Sunday 2-4 AM JST)
- Notify users 48 hours in advance
- Database maintenance: VACUUM, ANALYZE, index rebuild
- Log file rotation and cleanup
- Dependency updates

**Zero-Downtime Deployments:**
- Use blue-green deployment
- Database migrations compatible with old code
- Feature flags for gradual rollouts

## Testing Strategy

**Backend Testing (PHPUnit):**
```php
// Unit tests for services
tests/Unit/Services/AttendanceExcelServiceTest.php

// Feature tests for API endpoints
tests/Feature/Api/AttendanceControllerTest.php

// Database tests with RefreshDatabase trait
```

**Frontend Testing (Vitest + React Testing Library):**
```typescript
// Component tests
src/components/__tests__/Sidebar.test.tsx

// Integration tests
src/pages/__tests__/EmployeeRoom.test.tsx

// API mocking with MSW
```

**E2E Testing (Playwright or Cypress):**
```typescript
// Critical user flows
e2e/attendance-flow.spec.ts
e2e/login.spec.ts
```

**Test Coverage Goals:**
- Backend: > 80% coverage
- Frontend: > 70% coverage
- All critical paths: 100% coverage

## Technology Decisions Log

**Why SQLite for Development?**
- Zero configuration
- Fast for single-user dev
- File-based (easy to reset)
- ⚠️ Not for production (use PostgreSQL/MySQL)

**Why Sanctum over Passport?**
- Simpler for SPA authentication
- No OAuth complexity needed
- Better performance for API tokens
- Sufficient for current requirements

**Why Context API over Redux?**
- Simpler mental model
- Less boilerplate
- Sufficient for current state complexity
- Can migrate to Zustand/Recoil if needed

**Why PhpSpreadsheet over API-only?**
- Client requirement: real-time Excel sync
- Provides downloadable professional reports
- No external service dependencies
- ⚠️ Consider queue system for production

**Why Tailwind over CSS Modules?**
- Faster development
- Consistent design system
- Smaller bundle size
- Excellent responsive utilities

## Future Technical Enhancements

**Backend:**
- [ ] Implement queue system for Excel generation
- [ ] Add Redis caching layer
- [ ] Implement file locking for Excel writes
- [ ] Add comprehensive test suite
- [ ] API versioning (v1, v2)
- [ ] GraphQL endpoint (optional)

**Frontend:**
- [ ] Migrate to state management library (Zustand)
- [ ] Add React Query for API caching
- [ ] Implement PWA features
- [ ] Add Storybook for component documentation
- [ ] Optimize bundle size (lazy loading)
- [ ] Add E2E tests

**Infrastructure:**
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Kubernetes deployment (optional)
- [ ] CDN integration
- [ ] Monitoring and alerting
- [ ] Automated backups
