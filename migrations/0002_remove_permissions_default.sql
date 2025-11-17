-- Migration: Remove default value from permissions column
-- This ensures permissions are always explicitly set based on role defaults in the application code

-- Remove the default value from the permissions column
ALTER TABLE "users" ALTER COLUMN "permissions" DROP DEFAULT;
