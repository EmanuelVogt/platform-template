CREATE SCHEMA "sample";
CREATE TABLE "sample"."things" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL
);
ALTER TYPE "identity"."access_profile" ADD VALUE IF NOT EXISTS 'receptionist';
