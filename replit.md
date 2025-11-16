# Politicall Platform

## Overview

Politicall is a comprehensive political management platform designed for Brazilian politicians and their teams. It provides integrated tools for constituent relationship management (CRM), political alliance tracking, demand management, event scheduling, AI-powered social media attendance, and marketing campaign automation. The platform follows Material Design principles adapted for enterprise use, emphasizing data-dense dashboards and professional productivity workflows.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **Framework:** React with TypeScript, using Wouter for client-side routing
- **UI Framework:** Shadcn UI component library (New York variant) built on Radix UI primitives
- **Styling:** Tailwind CSS with custom design system based on Material Design principles
- **State Management:** TanStack Query (React Query) for server state management
- **Form Handling:** React Hook Form with Zod validation

**Design System:**
- Custom color palette featuring turquoise/pool blue (#40E0D0, #48D1CC) as primary brand colors
- Typography hierarchy using Inter font family from Google Fonts
- Standardized spacing system using Tailwind primitives (2, 4, 6, 8, 12, 16)
- Responsive 12-column grid layout with breakpoints at 640px, 768px, 1024px, and 1280px
- Fixed sidebar navigation (256px width, collapsible to 16px icon-only mode)
- Material Design-inspired elevation system for cards and interactive elements

**Component Architecture:**
- Page-level components in `/client/src/pages/` for each major feature module
- Reusable UI components in `/client/src/components/ui/` following Shadcn patterns
- Shared application components (sidebar, theme provider, route protection) in `/client/src/components/`
- Custom hooks in `/client/src/hooks/` for cross-cutting concerns

### Backend Architecture

**Technology Stack:**
- **Runtime:** Node.js with Express.js server framework
- **Database:** PostgreSQL via Neon serverless with WebSocket support
- **ORM:** Drizzle ORM with TypeScript-first schema definitions
- **Authentication:** Custom JWT-based authentication with bcrypt password hashing
- **API Design:** RESTful endpoints with JSON payloads

**Authentication & Authorization:**
- JWT tokens stored in localStorage on client (30-day expiration)
- Session secret required via environment variable
- Token verification middleware for protected routes
- Custom password hashing using bcrypt (cost factor 10)
- No third-party authentication providers (custom implementation)
- **Role-Based Access Control (RBAC):**
  - Three role levels: admin (full access), coordenador (team coordination), assessor (basic access)
  - Role hierarchy enforced via middleware (requireRole)
  - Database-authoritative role verification on each request (prevents stale permission bypass)
  - Admin-only endpoints: GET/PATCH /api/users for user management
  - Frontend role-based routing via AdminRoute component

**Database Schema Design:**
- User accounts with email/password credentials and role field (admin/coordenador/assessor)
- Contacts CRM with full contact information and notes
- Political parties reference table (29 Brazilian parties seeded)
- Political alliances linking users to party contacts
- Demands (issue tracking) with status, priority, and comment threads
- Events calendar with categories and date ranges
- AI configuration for social media platform integrations
- AI conversations log for attendance tracking
- Marketing campaigns with recipient lists and scheduling

**API Structure:**
- Authentication endpoints: `/api/auth/login`, `/api/auth/register`
- CRUD endpoints for each entity following RESTful conventions
- Dashboard analytics endpoint: `/api/dashboard/stats`
- Specialized endpoints for AI response generation and conversation management
- Consistent error handling with appropriate HTTP status codes

### Data Storage Solutions

**Database:**
- PostgreSQL database via Neon serverless infrastructure
- Connection pooling using `@neondatabase/serverless` with WebSocket constructor
- Schema migrations managed through Drizzle Kit in `/migrations/` directory
- UUID primary keys generated via `gen_random_uuid()`
- Cascading deletes for foreign key relationships
- Timestamp tracking for created records

**Client-Side Storage:**
- JWT authentication tokens in localStorage
- User profile data cached in localStorage
- TanStack Query cache for server state with infinite stale time by default

### External Dependencies

**AI Integration:**
- OpenAI GPT-5 model for AI-powered social media attendance
- Two operational modes: "compliance" (TSE regulation-focused) and standard (professional tone)
- Environment variables required: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`
- Graceful degradation when AI credentials not configured
- Context-aware responses using post content and user messages

**Third-Party Services:**
- Neon Database (serverless PostgreSQL hosting)
- Google Fonts CDN (Inter font family)
- Social media platform APIs (Facebook, Instagram, Twitter/X, WhatsApp) via token-based authentication stored in database

**Development Tools:**
- Vite for development server and production builds
- Replit-specific plugins for error overlay and development banner
- ESBuild for server-side bundling in production
- Drizzle Kit for database schema management and migrations

**UI Component Libraries:**
- Radix UI primitives for accessible, unstyled components
- Recharts for data visualization (pie charts, bar charts)
- date-fns for date manipulation and formatting (Portuguese locale)
- react-icons for social media platform icons
- cmdk for command palette functionality
- vaul for drawer/bottom sheet components

**Validation & Type Safety:**
- Zod schemas for runtime validation
- Drizzle-Zod integration for schema-to-validator generation
- TypeScript strict mode enabled throughout project
- Shared schema definitions in `/shared/schema.ts` used by both client and server

## Recent Changes (November 16, 2025)

### Role-Based Permission System
Implemented complete multi-user role-based access control:
- Added role field to users schema with three levels (admin/coordenador/assessor)
- Created authorization middleware (requireRole) with role hierarchy enforcement
- Database-authoritative role verification: authenticateToken fetches role from database on each request to prevent stale JWT permission bypass
- Admin-only user management: GET /api/users, PATCH /api/users/:id with Zod validation
- Frontend AdminRoute component redirects non-admins attempting to access admin pages
- Automatic localStorage sync when user's own role changes, with page reload
- Sidebar visibility controls based on user role

**Security Considerations:**
- Current implementation prioritizes immediate role changes over token revocation
- Database lookup per authenticated request ensures roles update instantly without re-login
- Trade-off: Slight performance overhead acceptable for MVP with small team usage

**Future Enhancements (Post-MVP):**
- Token versioning or revocation store for compromised token mitigation
- Role caching (60s TTL) to reduce database load under high concurrency
- Refresh token pattern to shorten access token lifetime
- Audit logging for permission changes and admin actions

### Notifications System
Implemented comprehensive in-app notifications system for real-time user alerts:

**Database Schema:**
- Notifications table with fields: id, userId, type, title, message, priority, read, link, createdAt
- Eight notification types: info, success, warning, error, demand, event, comment, system
- Four priority levels: low, normal, high, urgent
- Foreign key relationship to users table with cascading deletes

**Backend API (server/routes.ts):**
- POST /api/notifications - Create notification (authenticated users)
- GET /api/notifications - List user's notifications (filtered by userId)
- GET /api/notifications/unread-count - Count unread notifications for badge
- PATCH /api/notifications/:id/read - Mark single notification as read
- PATCH /api/notifications/mark-all-read - Mark all user notifications as read
- DELETE /api/notifications/:id - Delete single notification
- **Security:** All mutation endpoints verify ownership (id AND userId) before execution to prevent cross-user access

**Frontend Components (client/src/components/notification-bell.tsx):**
- NotificationBell component in header next to theme toggle
- Bell icon with destructive badge showing unread count (99+ cap)
- Auto-refresh every 30 seconds via TanStack Query polling
- Popover panel displaying full notification list with:
  - Color-coded priority borders (urgent=red, high=orange, normal=primary, low=muted)
  - Type badges and "Nova" indicators for unread items
  - Timestamp formatting in Portuguese (date-fns with ptBR locale)
  - Individual action buttons: mark-as-read (Check icon), delete (X icon)
  - Bulk action: "Marcar todas como lidas" button
- Loading, error, and empty states
- Full accessibility: aria-labels, data-testid attributes for testing
- Cache invalidation after mutations keeps UI synchronized

**Automatic Notification Triggers (Non-blocking):**
All triggers wrapped in try/catch to ensure notification failures don't block primary operations:

1. **Urgent Demands (POST /api/demands):**
   - Triggered when demand.priority === "urgent"
   - Self-notification to track high-priority tasks
   - Priority: urgent, Type: demand

2. **Demand Comments (POST /api/demands/:id/comments):**
   - Triggered when comment added to demand
   - Notifies demand owner (excludes self-comments)
   - Priority: normal, Type: comment

3. **Upcoming Events (POST /api/events):**
   - Triggered when event created within 24 hours
   - Priority escalates to "high" if event within 2 hours
   - Message shows calculated hours until event
   - Type: event

**Error Handling Architecture:**
- All notification creation calls isolated in dedicated try/catch blocks
- Errors logged to console without affecting primary API responses
- Users always receive successful response even if notification creation fails
- Transparent degradation for notification subsystem failures

**Data Flow:**
- Notification queries use hierarchical cache keys: ["/api/notifications"], ["/api/notifications/unread-count"]
- All mutations invalidate both queries to maintain consistency
- 30-second polling interval balances freshness vs server load
- Badge updates automatically reflect mark-as-read/delete operations

**Future Enhancements:**
- WebSocket integration for real-time push notifications (eliminate polling)
- Notification preferences page (enable/disable categories, frequency)
- Cron job for time-based notifications (event reminders 1 hour before, overdue demands)
- Email/SMS notification delivery via external services
- Notification history/archive page with search and filtering

### Modal Standardization
Standardized all modal dialogs system-wide for consistent UX and improved accessibility:

**Standard Modal Structure:**
```tsx
<DialogContent className="max-w-md max-h-[90vh] flex flex-col p-0">
  <DialogHeader className="px-6 pt-6 pb-4 border-b">
    {/* Fixed header with title */}
  </DialogHeader>
  <Form>
    <form className="flex flex-col flex-1 overflow-hidden">
      <div className="overflow-y-auto px-6 py-4 space-y-4">
        {/* Scrollable content area */}
      </div>
      <DialogFooter className="px-6 py-4 border-t">
        {/* Fixed footer with action buttons */}
      </DialogFooter>
    </form>
  </Form>
</DialogContent>
```

**Standardized Pages:**
- Demands modal (create/edit demand with collaborators field)
- Contacts modal (create/edit contact)
- Alliances modals (add party, create contact, create alliance)
- Agenda modal (create/edit event)
- Marketing modal (create campaign)
- AI Attendance modal (platform configuration)

**Benefits:**
- Consistent padding and spacing (px-6 pt-6 pb-4 for header, px-6 py-4 for footer)
- Scrollable content area prevents modal overflow on small screens
- Fixed header and footer remain visible during scroll for better UX
- max-h-[90vh] ensures modal never exceeds viewport height
- Visual separation via borders between sections

### Event Recurrence System
Implemented full event recurrence functionality in agenda module:

**Database Schema:**
- Added recurrence field to events table (none/daily/weekly/monthly)
- Migration successfully applied to support recurring events

**Backend Logic (server/storage.ts):**
- Modified getEvents() to expand recurring events dynamically
- Generates occurrences up to 3 months in future based on recurrence pattern
- Each occurrence has unique ID format: `${originalId}_recurrence_${index}`
- Maintains all original event properties in generated occurrences

**Frontend Implementation (client/src/pages/agenda.tsx):**
- Added recurrence field to event creation/edit form
- Positioned after location field in form layout
- Smart handling of recurring event editing: extracts original event ID
- Delete confirmation warns about removing all recurrences
- Calendar, list, and timeline views display all generated occurrences

**Technical Approach:**
- Server-side expansion of recurring events (more efficient than storing duplicates)
- Original event remains source of truth for all recurrences
- Edit/delete operations target original event, affecting all future occurrences
- Maximum 90 occurrences per event to prevent performance issues