# Politicall Platform

## Overview

Politicall is a comprehensive political management platform designed for Brazilian politicians and their teams. It integrates constituent relationship management (CRM), political alliance tracking, demand management, event scheduling, AI-powered social media interaction, and marketing campaign automation. The platform aims to enhance productivity through data-dense dashboards and professional workflows, adhering to Material Design principles for enterprise applications.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

- **Technology Stack:** React with TypeScript, Wouter for routing, Shadcn UI (New York variant) on Radix UI, Tailwind CSS, TanStack Query, React Hook Form with Zod.
- **Design System:** Custom Material Design-inspired with turquoise/pool blue primary colors, Inter font, responsive 12-column grid, fixed collapsible sidebar, and Material Design elevation.
- **UI/UX Decisions:** Standardized modal dialogs, consistent user experience across the platform.

### Backend

- **Technology Stack:** Node.js with Express.js, PostgreSQL (Neon serverless) with WebSocket support, Drizzle ORM, custom JWT authentication with bcrypt.
- **API Design:** RESTful endpoints with JSON payloads.
- **Authentication & Authorization:** JWT tokens (30-day expiration), bcrypt hashing, and Role-Based Access Control (RBAC) with 'admin', 'coordenador', and 'assessor' roles, enforced via middleware.
- **Multi-Tenant Architecture:** Complete data isolation per account (gabinete) using `accountId` in JWT for filtering and validation across all data operations.
- **Database Schema:** Includes tables for accounts, user accounts, contacts CRM, political parties, alliances, demands, events, AI configurations, AI conversation logs, and marketing campaigns.
- **Core Features:**
    - **External API Integration System:** Provides a REST API for third-party integrations with API key management, bearer token authentication, rate limiting, and UI for key management.
    - **Multi-Tenant System:** Ensures complete data isolation for each account, including unique slug generation for accounts and secure resource access.
    - **Role-Based Permission System:** Implements RBAC with various roles, authorization middleware, and database-authoritative role verification.
    - **Volunteer Tracking System:** Generates unique 4-digit codes for volunteers, provides personalized URLs for supporter registration, and tracks referrals.
    - **Notifications System:** In-app notifications with various types and priority levels, real-time updates, and automatic triggers for key events.
    - **Event Recurrence System:** Supports recurring events (daily/weekly/monthly) with dynamic expansion for display.
    - **Admin Campaign Management:** Provides an admin panel for managing marketing campaigns with status tracking and approval workflows.
    - **Public Survey Landing Pages:** Public-facing survey collection with demographic fields, IP-based duplicate prevention, and support for various question types.
    - **AI Social Media Attendance (Facebook & Instagram):** Unified webhook integration for automated AI responses on Facebook Messenger and Instagram Direct, with separate configuration for each platform and conversation storage.
    - **Public Supporter Registration System:** Automatic QR code generation and sharing for public registration via a personalized landing page, with automated contact creation.

## External Dependencies

- **AI Integration:** OpenAI GPT-5 model.
- **Third-Party Services:** Neon Database (serverless PostgreSQL), Google Fonts CDN (Inter font), Social media platform APIs (Facebook, Instagram, Twitter/X, WhatsApp).
- **UI Component Libraries:** Radix UI, Recharts, date-fns, react-icons, cmdk, vaul.
- **Validation & Type Safety:** Zod schemas, Drizzle-Zod integration, TypeScript.