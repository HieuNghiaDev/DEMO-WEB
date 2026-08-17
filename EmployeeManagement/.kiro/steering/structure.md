---
title: EmployeeManagement Project Structure
description: Directory structure, file organization, and conventions for adding new features
inclusion: auto
---

# EmployeeManagement Project Structure

## Project Root Structure

```
EmployeeManagement/
├── backend/              # Laravel PHP API
│   ├── app/
│   ├── bootstrap/
│   ├── config/
│   ├── database/
│   ├── public/
│   ├── resources/
│   ├── routes/
│   ├── storage/
│   ├── tests/
│   ├── .env.example
│   ├── composer.json
│   └── artisan
│
├── frontend/             # React TypeScript SPA
│   ├── public/
│   ├── src/
│   ├── .env.development
│   ├── .env.production
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
│
└── .kiro/               # Kiro AI steering documentation
    └── steering/
```

## Backend Structure (Laravel)

### Core Application Directory (`backend/app/`)

```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Api/                    # API controllers (our main controllers)
│   │   │   ├── AttendanceController.php
│   │   │   ├── AuthController.php
│   │   │   └── WorkSessionController.php
│   │   └── Controller.php          # Base controller
│   │
│   └── Middleware/
│       ├── SecurityEventAudit.php  # Logs security events
│       └── SecurityHeaders.php     # Adds security headers
│
├── Models/                          # Eloquent models
│   ├── Attendance.php
│   ├── Department.php
│   ├── Employee.php
│   ├── Office.php
│   ├── SecurityAuditLog.php
│   ├── User.php
│   └── WorkSession.php
│
├── Services/                        # Business logic services
│   ├── AttendanceExcelService.php
│   ├── PersonalAttendanceReportService.php
│   └── SecurityAuditLogger.php
│
└── Providers/
    └── AppServiceProvider.php
```

### Controllers (`backend/app/Http/Controllers/Api/`)

**Purpose:** Handle HTTP requests, validate input, call services, return responses

**Structure:**
```php
<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SomeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ExampleController extends Controller
{
    public function __construct(
        private readonly SomeService $someService
    ) {}

    public function index(Request $request): JsonResponse
    {
        // 1. Validate input
        $validated = $request->validate([...]);
        
        // 2. Call service for business logic
        $result = $this->someService->process($validated);
        
        // 3. Return JSON response
        return response()->json([
            'message' => 'Success message',
            'data' => $result,
        ]);
    }
}
```

**Current Controllers:**
- `AuthController` - Login, logout, get authenticated user
- `AttendanceController` - Start work, update status, get active attendances, download personal report
- `WorkSessionController` - Start task, complete task

**Conventions:**
- Controller methods should be thin - delegate to services
- Always validate input with `$request->validate()`
- Return consistent JSON structure: `{ message, data }`
- Use dependency injection for services in constructor
- Type hint all parameters and return types
- Use `JsonResponse` return type

### Models (`backend/app/Models/`)

**Purpose:** Represent database tables, define relationships, handle data casting

**Structure:**
```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Example extends Model
{
    use SoftDeletes; // If applicable

    protected $fillable = [
        'field1',
        'field2',
    ];

    protected function casts(): array
    {
        return [
            'date_field' => 'date',
            'datetime_field' => 'datetime',
            'boolean_field' => 'boolean',
        ];
    }

    public function relatedModel(): BelongsTo
    {
        return $this->belongsTo(RelatedModel::class);
    }
}
```

**Current Models:**
- `User` - Authentication account (hasApiTokens via Sanctum)
- `Employee` - Employee master data (soft deletes)
- `Office` - Office/branch location
- `Department` - Department organization
- `Attendance` - Daily attendance record
- `WorkSession` - Task tracking within attendance
- `SecurityAuditLog` - Security event logging

**Model Relationships:**
```
User ──belongsTo──> Employee
Employee ──belongsTo──> Office
Employee ──belongsTo──> Department
Employee ──hasMany──> Attendance
Attendance ──belongsTo──> Employee
Attendance ──hasMany──> WorkSession
WorkSession ──belongsTo──> Attendance
```

**Conventions:**
- Use `$fillable` for mass-assignable fields (never use `$guarded = []`)
- Define casts for dates, booleans, and JSON fields
- Always type-hint relationship return types
- Use soft deletes for master data (employees, offices)
- Never soft delete transactional data (attendances, work sessions)

### Services (`backend/app/Services/`)

**Purpose:** Contain complex business logic, external integrations, reusable operations

**Structure:**
```php
<?php

namespace App\Services;

use App\Models\SomeModel;

class ExampleService
{
    public function performComplexOperation(SomeModel $model, array $data): mixed
    {
        // Complex business logic here
        // Database operations
        // External API calls
        // File operations
        
        return $result;
    }
    
    private function helperMethod(): void
    {
        // Private methods for internal logic
    }
}
```

**Current Services:**
- `AttendanceExcelService` - Sync attendance to Excel file, generate master sheet
- `PersonalAttendanceReportService` - Build individual employee Excel reports
- `SecurityAuditLogger` - Record security events to database

**When to Create a Service:**
- ✅ Complex business logic that would bloat controllers
- ✅ Logic reused across multiple controllers
- ✅ External API integrations
- ✅ File generation (Excel, PDF)
- ✅ Data transformations
- ❌ Simple CRUD operations (use controllers directly)
- ❌ Database queries only (use models/query scopes)

**Conventions:**
- Inject services into controllers via constructor
- Make services final if not meant to be extended
- Use readonly properties for injected dependencies
- Type hint all parameters and return types
- Handle exceptions gracefully, log errors
- Keep methods focused (single responsibility)

### Database (`backend/database/`)

```
database/
├── factories/
│   └── UserFactory.php              # Model factories for testing
│
├── migrations/
│   ├── 0001_01_01_000000_create_users_table.php
│   ├── 2026_08_07_083031_create_attendances_table.php
│   ├── 2026_08_10_100210_create_offices_table.php
│   ├── 2026_08_10_101034_create_departments_table.php
│   ├── 2026_08_10_101236_create_employees_table.php
│   ├── 2026_08_13_140000_create_work_sessions_table.php
│   └── ...
│
└── seeders/
    ├── DatabaseSeeder.php           # Main seeder orchestrator
    ├── OfficeSeeder.php             # Seed offices
    ├── EmployeeUserSeeder.php       # Seed employees and users
    └── AdditionalEmployeeUserSeeder.php
```

**Migration Conventions:**
- Timestamp prefix: `YYYY_MM_DD_HHMMSS_description.php`
- One table per migration
- Use `up()` and `down()` methods for rollback support
- Foreign keys with `constrained()`, `cascadeOnUpdate()`, appropriate onDelete
- Add indexes for frequently queried columns
- Never modify existing migrations after deployment

**Migration Example:**
```php
public function up(): void
{
    Schema::create('examples', function (Blueprint $table) {
        $table->id();
        $table->foreignId('parent_id')
            ->constrained('parents')
            ->cascadeOnUpdate()
            ->restrictOnDelete();
        $table->string('name');
        $table->string('status', 20)->default('active')->index();
        $table->timestamps();
        $table->softDeletes();
    });
}
```

**Seeder Conventions:**
- Use `updateOrCreate()` for idempotent seeding
- Seed in dependency order (offices → departments → employees → users)
- Use realistic test data
- Never seed production data in code

### Routes (`backend/routes/`)

```
routes/
├── api.php          # API routes (prefixed with /api)
├── web.php          # Web routes (not used in this SPA)
└── console.php      # Artisan commands
```

**API Routes Structure:**
```php
// Public routes
Route::post('/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1');

// Protected routes
Route::middleware(['auth:sanctum', 'throttle:60,1'])
    ->group(function () {
        Route::get('/me', [AuthController::class, 'me']);
        Route::post('/logout', [AuthController::class, 'logout']);
        
        // Resource grouping
        Route::prefix('attendances')->group(function () {
            Route::get('/active', [AttendanceController::class, 'active']);
            Route::post('/start', [AttendanceController::class, 'start']);
            Route::patch('/{attendance}/status', [AttendanceController::class, 'updateStatus']);
        });
    });
```

**Routing Conventions:**
- All API routes in `api.php` (auto-prefixed with `/api`)
- Use route model binding: `Route::get('/users/{user}', ...)`
- Group related routes with `prefix()`
- Apply middleware to groups, not individual routes
- Use rate limiting: `throttle:requests,minutes`
- RESTful naming when possible

### Configuration (`backend/config/`)

```
config/
├── app.php          # Application configuration
├── auth.php         # Authentication guards
├── cors.php         # CORS configuration
├── database.php     # Database connections
├── sanctum.php      # Sanctum configuration
└── ...
```

**Important Config Files:**
- `cors.php` - Controls allowed origins for frontend
- `sanctum.php` - Token expiration, stateful domains
- `app.php` - Timezone (Asia/Tokyo), locale, debug mode

### Storage (`backend/storage/`)

```
storage/
├── app/
│   ├── attendance/
│   │   └── attendance.xlsx     # Master attendance Excel file
│   ├── private/
│   └── public/
│
├── framework/
│   ├── cache/
│   ├── sessions/
│   └── views/
│
└── logs/
    └── laravel.log
```

**Storage Conventions:**
- `app/attendance/` - Excel files
- `app/public/` - Publicly accessible files (linked to public/storage)
- Never commit files in storage/ (use .gitignore)

## Frontend Structure (React)

### Source Directory (`frontend/src/`)

```
src/
├── components/              # Reusable components
│   ├── auth/
│   │   └── ProtectedRoute.tsx
│   ├── layout/
│   │   └── Sidebar.tsx
│   └── ui/                  # Future: generic UI components
│
├── contexts/                # React Context providers
│   ├── AuthContext.tsx
│   └── ThemeContext.tsx
│
├── layouts/                 # Layout components
│   └── MainLayout.tsx
│
├── pages/                   # Page components (routes)
│   ├── Login.tsx
│   ├── EmployeeRoom.tsx
│   ├── OrganizationDesign.tsx
│   ├── BusinessQuest.tsx
│   ├── ManualWorkshop.tsx
│   ├── AI.tsx
│   ├── ApprovalRoom.tsx
│   └── ComingSoon.tsx
│
├── services/                # API and external services
│   └── api.ts
│
├── types/                   # TypeScript type definitions
│   └── (future types)
│
├── utils/                   # Utility functions
│   └── theme.ts
│
├── App.tsx                  # Main app component
├── main.tsx                 # Entry point
└── index.css                # Global styles
```

### Pages (`frontend/src/pages/`)

**Purpose:** Top-level components that represent routes

**Structure:**
```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'

export default function ExamplePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<DataType[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    // Fetch data on mount
    void loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const response = await api.get<ResponseType>('/endpoint')
      setData(response.data.data)
    } catch (error) {
      // Handle error
    } finally {
      setIsLoading(false)
    }
  }

  const handleAction = async () => {
    // Handle user action
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Page content */}
    </div>
  )
}
```

**Current Pages:**
- `Login.tsx` - Authentication page (public route)
- `EmployeeRoom.tsx` - Main attendance dashboard (protected, default route)
- `OrganizationDesign.tsx` - Coming soon placeholder
- `BusinessQuest.tsx` - Coming soon placeholder
- `ManualWorkshop.tsx` - Coming soon placeholder
- `AI.tsx` - Coming soon placeholder
- `ApprovalRoom.tsx` - Coming soon placeholder
- `ComingSoon.tsx` - Reusable placeholder component

**Page Conventions:**
- One page per route
- Pages are default exports
- Page component name matches filename
- Fetch data in `useEffect` on mount
- Handle loading and error states
- Use Tailwind classes for styling
- Keep pages focused - extract complex logic to components or hooks

### Components (`frontend/src/components/`)

**Purpose:** Reusable UI components used across multiple pages

**Structure:**
```tsx
type ComponentProps = {
  title: string
  onAction: () => void
  isDisabled?: boolean
}

export default function ExampleComponent({
  title,
  onAction,
  isDisabled = false,
}: ComponentProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="font-bold text-gray-800">{title}</h3>
      <button
        onClick={onAction}
        disabled={isDisabled}
        className="mt-2 rounded bg-indigo-600 px-4 py-2 text-white"
      >
        Action
      </button>
    </div>
  )
}
```

**Component Organization:**
```
components/
├── auth/              # Authentication-related components
│   └── ProtectedRoute.tsx
│
├── layout/            # Layout components
│   └── Sidebar.tsx
│
└── ui/                # Generic UI components (future)
    ├── Button.tsx
    ├── Modal.tsx
    ├── Input.tsx
    └── ...
```

**Component Conventions:**
- Named exports for utility components, default for main component
- Props type defined above component
- Optional props with default values
- Use TypeScript for all props
- Pure components when possible (no side effects)
- Extract repeated UI patterns into components

### Contexts (`frontend/src/contexts/`)

**Purpose:** Global state management with React Context API

**Structure:**
```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

type ContextValue = {
  data: SomeData | null
  isLoading: boolean
  updateData: (newData: SomeData) => void
}

const ExampleContext = createContext<ContextValue | undefined>(undefined)

type ProviderProps = {
  children: ReactNode
}

export function ExampleProvider({ children }: ProviderProps) {
  const [data, setData] = useState<SomeData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const updateData = (newData: SomeData) => {
    setData(newData)
  }

  return (
    <ExampleContext.Provider value={{ data, isLoading, updateData }}>
      {children}
    </ExampleContext.Provider>
  )
}

export function useExample() {
  const context = useContext(ExampleContext)
  if (!context) {
    throw new Error('useExample must be used inside ExampleProvider')
  }
  return context
}
```

**Current Contexts:**
- `AuthContext` - User authentication state, login/logout functions
- `ThemeContext` - Dark/light theme state and toggle

**Context Conventions:**
- One context per file
- Export both Provider and custom hook
- Throw error in hook if used outside provider
- Keep context focused (single responsibility)
- Use `localStorage`/`sessionStorage` for persistence

### Services (`frontend/src/services/`)

**Purpose:** API client configuration and external service integrations

**Structure:**
```typescript
// api.ts - Main API client
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
```

**Service Conventions:**
- Centralized API client (don't create multiple axios instances)
- Use interceptors for auth tokens, error handling
- Export helper functions for token management
- Type API responses with TypeScript

### Layouts (`frontend/src/layouts/`)

**Purpose:** Wrap page content with common layout elements

**Structure:**
```tsx
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'

export default function MainLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
```

**Current Layouts:**
- `MainLayout` - Sidebar + content area for authenticated pages

**Layout Conventions:**
- Use `<Outlet />` from React Router for nested routes
- Keep layouts simple - delegate to components
- Apply common styling (bg colors, padding) in layouts

### Routing (`frontend/src/App.tsx`)

**Structure:**
```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/auth/ProtectedRoute'
import MainLayout from './layouts/MainLayout'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<EmployeeRoom />} />
              <Route path="/organization" element={<OrganizationDesign />} />
              {/* ... */}
            </Route>
          </Route>
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

**Routing Conventions:**
- Wrap entire app in `BrowserRouter`
- Wrap protected routes in `ProtectedRoute` component
- Use nested routes with `<Outlet />` for layouts
- Redirect unknown paths to home
- Keep route definitions flat (avoid deep nesting)

### Styling (`frontend/src/index.css`)

**Tailwind Configuration:**
```css
@import 'tailwindcss';

/* Custom animations */
@keyframes themis-loading-progress {
  /* ... */
}

/* Custom component styles (minimal) */
.themis-login {
  /* ... */
}
```

**Styling Conventions:**
- Use Tailwind utility classes for 99% of styling
- Only use custom CSS for complex animations
- Prefix custom classes with `themis-`
- Avoid inline styles unless absolutely necessary
- Use Tailwind's responsive classes (`sm:`, `md:`, `lg:`)

## Conventions for Adding New Features

### Adding a New Backend Feature

**1. Database Migration:**
```bash
php artisan make:migration create_new_table
```

Edit the migration file, then run:
```bash
php artisan migrate
```

**2. Create Model:**
```bash
php artisan make:model NewModel
```

Add fillable fields, casts, and relationships.

**3. Create Service (if complex logic):**
```bash
# No artisan command, create manually
touch app/Services/NewFeatureService.php
```

**4. Create Controller:**
```bash
php artisan make:controller Api/NewFeatureController
```

Inject service in constructor, create methods.

**5. Add Routes:**
Edit `routes/api.php`:
```php
Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('new-features')->group(function () {
        Route::get('/', [NewFeatureController::class, 'index']);
        Route::post('/', [NewFeatureController::class, 'store']);
        // ...
    });
});
```

**6. Test:**
```bash
php artisan test
```

### Adding a New Frontend Feature

**1. Create Page Component (if new route):**
```bash
# Create manually
touch src/pages/NewFeature.tsx
```

**2. Add Route:**
Edit `src/App.tsx`:
```tsx
<Route path="/new-feature" element={<NewFeature />} />
```

**3. Add to Sidebar Navigation:**
Edit `src/components/layout/Sidebar.tsx`:
```tsx
const menuItems = [
  // ...
  { path: '/new-feature', name: '新機能', icon: IconComponent },
]
```

**4. Create API Calls:**
In page component:
```tsx
const loadData = async () => {
  const response = await api.get('/new-features')
  // ...
}
```

**5. Create Reusable Components (if needed):**
```bash
touch src/components/new-feature/FeatureComponent.tsx
```

**6. Add Types (if needed):**
```bash
touch src/types/newFeature.ts
```

### File Naming Conventions

**Backend (PHP):**
- Classes: `PascalCase.php` (e.g., `AttendanceController.php`)
- Migrations: `YYYY_MM_DD_HHMMSS_snake_case.php`
- Configs: `lowercase.php` (e.g., `sanctum.php`)

**Frontend (TypeScript/React):**
- Components: `PascalCase.tsx` (e.g., `EmployeeRoom.tsx`)
- Utilities: `camelCase.ts` (e.g., `api.ts`, `theme.ts`)
- Types: `camelCase.ts` (e.g., `attendance.ts`)

### Code Organization Best Practices

**Keep Controllers Thin:**
```php
// ❌ Bad - business logic in controller
public function store(Request $request) {
    $validated = $request->validate([...]);
    $result = ComplexModel::where(...)->get();
    // 50 lines of logic
    return response()->json($result);
}

// ✅ Good - delegate to service
public function store(Request $request) {
    $validated = $request->validate([...]);
    $result = $this->service->process($validated);
    return response()->json($result);
}
```

**Avoid Massive Page Components:**
```tsx
// ❌ Bad - 1500 line component
export default function EmployeeRoom() {
  // Too much state, logic, JSX
}

// ✅ Good - extract components
export default function EmployeeRoom() {
  return (
    <>
      <EmployeeMap />
      <TaskModal />
      <NotificationPanel />
    </>
  )
}
```

**Use TypeScript Properly:**
```tsx
// ❌ Bad - any types
const handleSubmit = (data: any) => { }

// ✅ Good - explicit types
type FormData = { name: string; email: string }
const handleSubmit = (data: FormData) => { }
```

### Testing New Features

**Backend Tests:**
```php
// tests/Feature/Api/NewFeatureControllerTest.php
public function test_can_create_new_feature(): void
{
    $user = User::factory()->create();
    
    $response = $this->actingAs($user, 'sanctum')
        ->postJson('/api/new-features', [...]);
    
    $response->assertStatus(201)
        ->assertJsonStructure([...]);
}
```

**Frontend Tests:**
```tsx
// src/pages/__tests__/NewFeature.test.tsx
import { render, screen } from '@testing-library/react'
import NewFeature from '../NewFeature'

test('renders new feature page', () => {
  render(<NewFeature />)
  expect(screen.getByText('Title')).toBeInTheDocument()
})
```

## Common Patterns

### API Response Format

**Success:**
```json
{
  "message": "Operation successful",
  "data": { /* response data */ }
}
```

**Error:**
```json
{
  "message": "Error description",
  "errors": {
    "field": ["Validation error"]
  }
}
```

### Loading States

```tsx
const [isLoading, setIsLoading] = useState(false)
const [data, setData] = useState<DataType[]>([])
const [error, setError] = useState('')

const loadData = async () => {
  try {
    setIsLoading(true)
    setError('')
    const response = await api.get('/endpoint')
    setData(response.data.data)
  } catch (err) {
    setError('Failed to load data')
  } finally {
    setIsLoading(false)
  }
}
```

### Form Submissions

```tsx
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async (event: FormEvent) => {
  event.preventDefault()
  
  try {
    setIsSubmitting(true)
    await api.post('/endpoint', formData)
    // Success handling
  } catch (error) {
    // Error handling
  } finally {
    setIsSubmitting(false)
  }
}
```

### Modal Management

```tsx
const [isOpen, setIsOpen] = useState(false)

const openModal = () => setIsOpen(true)
const closeModal = () => setIsOpen(false)

return (
  <>
    <button onClick={openModal}>Open</button>
    {isOpen && <Modal onClose={closeModal} />}
  </>
)
```

## Directory Ownership

**Backend:**
- Controllers: API endpoint logic
- Services: Complex business logic
- Models: Database representation
- Migrations: Database schema

**Frontend:**
- Pages: Route components
- Components: Reusable UI elements
- Contexts: Global state
- Services: API client

When in doubt, follow existing patterns in the codebase.
