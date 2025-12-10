# Politicall Platform

## Overview

Politicall is a comprehensive political management platform designed for Brazilian politicians and their teams. It provides integrated tools for constituent relationship management (CRM), political alliance tracking, demand management, event scheduling, AI-powered social media interaction, and marketing campaign automation. The platform aims to enhance professional productivity through data-rich dashboards and enterprise-grade workflows, adhering to Material Design principles.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

- **Technology Stack:** React with TypeScript, Wouter, Shadcn UI (New York variant) on Radix UI, Tailwind CSS, TanStack Query, React Hook Form with Zod.
- **Design System:** Custom Material Design-inspired with turquoise/pool blue primary colors, Inter font, responsive 12-column grid, fixed collapsible sidebar, and Material Design elevation.
- **Component Architecture:** Page-level components, reusable UI components, shared application components, and custom hooks.
- **UI/UX Decisions:** Standardized modal dialogs for consistent user experience.

### Backend

- **Technology Stack:** Node.js with Express.js, PostgreSQL (Neon serverless) with WebSocket support, Drizzle ORM, custom JWT authentication with bcrypt.
- **API Design:** RESTful endpoints with JSON payloads.
- **Authentication & Authorization:** JWT tokens, bcrypt hashing, and Role-Based Access Control (RBAC) for 'admin', 'coordenador', and 'assessor' roles, enforced via middleware.
- **Multi-Tenant Architecture:** Complete tenant isolation per account (gabinete) via `accountId` in JWT and all data operations.
- **Database Schema:** Includes Accounts, User accounts, Contacts CRM, Political parties, Political alliances, Demands, Events calendar, AI configuration, AI conversations log, and Marketing campaigns.
- **API Structure:** Authentication, CRUD operations, dashboard analytics, AI response generation, and consistent error handling.

### Data Storage

- **Database:** PostgreSQL via Neon serverless, Drizzle Kit for migrations, UUID primary keys, cascading deletes, and timestamp tracking.
- **Client-Side Storage:** JWT tokens and user profile data in localStorage, TanStack Query cache.

### Core Features & Implementations

- **External API Integration System:** Complete REST API for third-party integrations with API key management, Bearer token authentication, rate limiting, and UI for key management.
- **Multi-Tenant System:** Ensures complete data isolation for each political office (gabinete) with a secure registration flow, user creation, and JWT-based data access control.
- **Role-Based Permission System:** Multi-user RBAC with 'admin', 'coordenador', 'assessor', 'voluntario' roles and authorization middleware.
- **Volunteer Tracking System:** Generates unique 4-digit alphanumeric volunteer codes, personalized landing page URLs, and tracks supporter referrals attributed to specific volunteers.
- **Notifications System:** In-app notifications with various types, priorities, and automatic triggers for urgent demands, comments, events, and campaign approvals.
- **Event Recurrence System:** Supports recurring events (daily, weekly, monthly) by dynamically expanding occurrences up to 3 months, while maintaining a single source of truth.
- **Admin Campaign Management:** Provides an admin panel for organizing and managing marketing campaigns with status tracking and synchronized user views.
- **Public Survey Landing Pages:** Public-facing pages for collecting survey responses, isolated from the authenticated system, supporting various question types, mandatory demographic data collection, and IP-based duplicate prevention.
- **Public Supporter Registration System:** Automatic QR code generation and sharing for public supporter registration via unique `adminSlug` URLs, comprehensive sharing options, and a dedicated public landing page.
- **Field Operatives System:** Management system for campaign field workers (Cabos Eleitorais) with unique public URLs, contact attribution, statistics tracking, and role-based access.
- **AI Social Media Attendance:** Unified webhook integration for automated AI responses on Facebook Messenger and Instagram Direct, with platform detection, credential configuration, conversation storage, and public privacy policies for Meta compliance.

## External Dependencies

- **AI Integration:** OpenAI GPT-5 model.
- **Third-Party Services:** Neon Database (serverless PostgreSQL), Google Fonts CDN, Social media platform APIs (Facebook, Instagram, Twitter/X, WhatsApp).
- **UI Component Libraries:** Radix UI, Recharts, date-fns, react-icons, cmdk, vaul.
- **Validation & Type Safety:** Zod schemas, Drizzle-Zod integration, TypeScript.