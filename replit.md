# Politicall Platform

## Overview

Politicall is a comprehensive political management platform for Brazilian politicians and their teams. It offers integrated tools for constituent relationship management (CRM), political alliance tracking, demand management, event scheduling, AI-powered social media attendance, and marketing campaign automation. The platform emphasizes data-dense dashboards and professional productivity workflows, following Material Design principles adapted for enterprise use.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

- **Technology Stack:** React with TypeScript, Wouter for routing, Shadcn UI (New York variant) on Radix UI, Tailwind CSS for styling, TanStack Query for server state, React Hook Form with Zod for forms.
- **Design System:** Custom Material Design-inspired with turquoise/pool blue (#40E0D0, #48D1CC) as primary colors, Inter font, standardized spacing, responsive 12-column grid, fixed collapsible sidebar, and Material Design elevation.
- **Component Architecture:** Page-level components for features, reusable UI components following Shadcn, shared application components, and custom hooks.
- **UI/UX Decisions:** Standardized modal dialogs for consistent UX, including fixed headers/footers and scrollable content.

### Backend

- **Technology Stack:** Node.js with Express.js, PostgreSQL (Neon serverless) with WebSocket support, Drizzle ORM, custom JWT authentication with bcrypt.
- **API Design:** RESTful endpoints with JSON payloads.
- **Authentication & Authorization:** JWT tokens (30-day expiration), custom bcrypt hashing, and Role-Based Access Control (RBAC) with 'admin', 'coordenador', and 'assessor' roles. Roles are database-authoritative and enforced via middleware.
- **Multi-Tenant Architecture:** Complete tenant isolation via accounts table. Each account (gabinete) has isolated data. JWT includes accountId. All storage methods and endpoints filter/validate by accountId. Zero cross-tenant data access possible.
- **Database Schema:** Accounts (tenants), User accounts, Contacts CRM, Political parties, Political alliances, Demands, Events calendar, AI configuration, AI conversations log, and Marketing campaigns.
- **API Structure:** Authentication endpoints, CRUD for entities, dashboard analytics, AI response generation, and consistent error handling.

### Data Storage

- **Database:** PostgreSQL via Neon serverless, Drizzle Kit for migrations, UUID primary keys, cascading deletes, and timestamp tracking.
- **Client-Side Storage:** JWT tokens and user profile data in localStorage, TanStack Query cache.

### Core Features & Implementations

- **External API Integration System (NEW):** Complete REST API for third-party integrations. Implementation details:
  - **API Keys Management:** Secure API key generation with bcrypt hashing, one-time display, expiration dates. Keys stored as hashed values only.
  - **Authentication:** Bearer token authentication middleware validates API keys for external access.
  - **API Endpoints:** REST API v1 with endpoints for contacts, political alliances, demands, events, and parties. Rate-limited at 100 requests/minute per key.
  - **UI Management:** Settings page includes API keys tab with creation, listing, revocation, and full documentation with curl examples.
  - **Security:** Keys prefixed with "pk_", bcrypt hashed storage, usage tracking, automatic expiration, rate limiting.
  - **Known Issue:** POST /api/v1/contacts requires userId field - needs system user creation or schema adjustment for full functionality.

- **Multi-Tenant System (Complete):** Every account (gabinete) has completely isolated data. Implementation details:
  - **Registration Flow:** POST /register creates new account + first user (admin) with partyId: null, avatar: null, and auto-generated slug from admin name. Optional fields (phone, planValue, etc) preserved. Slug generation removes accents, spaces, special characters and converts to lowercase (e.g., "Carlos Nedel" → "carlosnedel").
  - **User Creation:** POST /users/create adds users to existing account (inherits accountId from admin).
  - **JWT Authentication:** Tokens include userId, accountId, and role. Middleware extracts accountId from every request.
  - **Data Isolation:** ALL storage methods filter by accountId on read (getContacts, getDemands, etc). ALL update/delete methods validate BOTH id AND accountId before allowing modification. Zero cross-tenant access possible.
  - **Secure Resources:** Integrations, survey landing pages, notifications, AI config, demand comments all validate accountId. Methods throw "not found or access denied" if accountId doesn't match.
  - **Global Resources:** politicalParties and surveyTemplates tables remain global (accessible to all accounts). getUser/getUserByEmail remain global for authentication but all data access requires accountId.
  - **Fresh Start:** New accounts start with zero data, no party, default logo, and only Dashboard/Users/Settings visible until modules are enabled.
- **Role-Based Permission System:** Implemented multi-user RBAC with 'admin', 'coordenador', 'assessor' roles, authorization middleware, and database-authoritative role verification.
- **Notifications System:** In-app notifications with various types and priority levels, stored in a database. Backend API for creation, retrieval, and management. Frontend NotificationBell component with real-time updates and bulk actions. Automatic triggers for urgent demands, demand comments, upcoming events, and survey campaign approval/rejection notifications.
- **Event Recurrence System:** Events table includes a `recurrence` field (none/daily/weekly/monthly). Backend expands recurring events dynamically for up to 3 months, creating unique occurrences while maintaining the original event as the source of truth. Frontend supports recurrence in forms and displays generated occurrences across views.
- **Admin Campaign Management:** Admin panel with a tab system ("Todas", "Pendentes", "Aprovadas", "Rejeitadas") for organizing campaigns. Campaign cards display status with color-coded badges. Campaigns remain visible after approval/rejection. User panel synchronizes with admin actions, showing updated campaign statuses.
- **Public Survey Landing Pages:** Public-facing survey response collection at /pesquisa/:slug. Completely isolated from authenticated system (no sidebar, header, or admin UI). Supports 4 question types (open_text, single_choice, multiple_choice, rating). All surveys include mandatory demographic fields (gender, age range, employment type, housing type, children, political ideology) collected before main question. Anonymous response submission to survey_responses table with demographic data stored in dedicated columns. GET /api/pesquisa/:slug and POST /api/pesquisa/:slug/submit public endpoints. Only approved/active campaigns accessible. Responsive design with SEO optimization. **IP-Based Duplicate Prevention:** Each survey can only be answered once per IP address. The system captures the respondent's IP (handling proxies via X-Forwarded-For header) and validates against existing responses before accepting submissions, returning a user-friendly error if the IP has already responded to that specific campaign.
- **Survey Campaign Notifications:** Automatic high-priority notifications sent to users when their survey campaigns are approved or rejected by admin. Approved campaigns notify that the survey is live for 7 days. Rejected campaigns include the admin's rejection reason.
- **Public Supporter Registration System:** Automatic QR Code generation and sharing system for public supporter registration. Implementation details:
  - **Automatic Slug Generation with Uniqueness:** During account creation, admin's name is automatically converted to a unique URL slug (e.g., "Carlos Nedel" → "carlosnedel"). If the slug already exists, the system automatically appends numbers in ascending order (carlosnedel2, carlosnedel3, etc). Helper function `generateSlugFromName()` removes accents, spaces, special characters, and converts to lowercase. The `findAvailableSlug()` method ensures uniqueness.
  - **QR Code Modal:** In Contacts page, admin can access QR Code modal showing QR code linking to public registration page at www.politicall.com.br/apoio/{slug}.
  - **Comprehensive Sharing Options:** Modal includes 6 sharing methods: WhatsApp (with pre-filled message), Facebook, X/Twitter, Email (with subject and body), Copy URL, and Download QR Code as PNG.
  - **Public Landing Page:** /apoio/:slug displays admin's photo and professional registration form with party-colored gradient background. Submitted data automatically creates contact with source "Politicall" and isSupporter: true flag.
  - **User Experience:** No manual slug configuration needed - system generates unique slugs automatically during registration. QR Code is immediately available after account creation.

## External Dependencies

- **AI Integration:** OpenAI GPT-5 model for AI-powered social media attendance (requires `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`).
- **Third-Party Services:** Neon Database (serverless PostgreSQL), Google Fonts CDN (Inter font), Social media platform APIs (Facebook, Instagram, Twitter/X, WhatsApp).
- **Development Tools:** Vite, Replit plugins, ESBuild, Drizzle Kit.
- **UI Component Libraries:** Radix UI, Recharts, date-fns, react-icons, cmdk, vaul.
- **Validation & Type Safety:** Zod schemas, Drizzle-Zod integration, TypeScript.

## Production & Deployment

- **Demo Admin Account:** Automatically created on server startup with email `adm@politicall.com.br` and password `admin123`. This account is linked to a demo gabinete account ("Gabinete Politicall Demo") with fixed IDs for consistency across deployments.
- **Admin Credentials:** Email: adm@politicall.com.br | Password: admin123 (password is ALWAYS reset to this value on every server startup)
- **Server Startup Seeding:** On every server restart, the system automatically seeds political parties, survey templates, and the demo admin account. Password is always reset to `admin123` for the demo account.