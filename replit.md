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
- **Database Schema:** User accounts, Contacts CRM, Political parties, Political alliances, Demands, Events calendar, AI configuration, AI conversations log, and Marketing campaigns.
- **API Structure:** Authentication endpoints, CRUD for entities, dashboard analytics, AI response generation, and consistent error handling.

### Data Storage

- **Database:** PostgreSQL via Neon serverless, Drizzle Kit for migrations, UUID primary keys, cascading deletes, and timestamp tracking.
- **Client-Side Storage:** JWT tokens and user profile data in localStorage, TanStack Query cache.

### Core Features & Implementations

- **Role-Based Permission System:** Implemented multi-user RBAC with 'admin', 'coordenador', 'assessor' roles, authorization middleware, and database-authoritative role verification.
- **Notifications System:** In-app notifications with various types and priority levels, stored in a database. Backend API for creation, retrieval, and management. Frontend NotificationBell component with real-time updates and bulk actions. Automatic triggers for urgent demands, demand comments, upcoming events, and survey campaign approval/rejection notifications.
- **Event Recurrence System:** Events table includes a `recurrence` field (none/daily/weekly/monthly). Backend expands recurring events dynamically for up to 3 months, creating unique occurrences while maintaining the original event as the source of truth. Frontend supports recurrence in forms and displays generated occurrences across views.
- **Admin Campaign Management:** Admin panel with a tab system ("Todas", "Pendentes", "Aprovadas", "Rejeitadas") for organizing campaigns. Campaign cards display status with color-coded badges. Campaigns remain visible after approval/rejection. User panel synchronizes with admin actions, showing updated campaign statuses.
- **Public Survey Landing Pages:** Public-facing survey response collection at /survey/:slug. Completely isolated from authenticated system (no sidebar, header, or admin UI). Supports 4 question types (open_text, single_choice, multiple_choice, rating). All surveys include mandatory demographic fields (gender, age range, employment type, housing type, children, political ideology) collected before main question. Anonymous response submission to survey_responses table with demographic data stored in dedicated columns. GET /api/survey/:slug and POST /api/survey/:slug/submit public endpoints. Only approved/active campaigns accessible. Responsive design with SEO optimization.
- **Survey Campaign Notifications:** Automatic high-priority notifications sent to users when their survey campaigns are approved or rejected by admin. Approved campaigns notify that the survey is live for 7 days. Rejected campaigns include the admin's rejection reason.

## External Dependencies

- **AI Integration:** OpenAI GPT-5 model for AI-powered social media attendance (requires `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`).
- **Third-Party Services:** Neon Database (serverless PostgreSQL), Google Fonts CDN (Inter font), Social media platform APIs (Facebook, Instagram, Twitter/X, WhatsApp).
- **Development Tools:** Vite, Replit plugins, ESBuild, Drizzle Kit.
- **UI Component Libraries:** Radix UI, Recharts, date-fns, react-icons, cmdk, vaul.
- **Validation & Type Safety:** Zod schemas, Drizzle-Zod integration, TypeScript.