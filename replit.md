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