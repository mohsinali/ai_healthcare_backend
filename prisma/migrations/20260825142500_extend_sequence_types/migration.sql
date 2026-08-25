-- PostgreSQL requires newly added enum values to be committed before they can
-- be used. Keep this migration separate from the entity backfill migration.
ALTER TYPE "SequenceType" ADD VALUE 'LOCATION';
ALTER TYPE "SequenceType" ADD VALUE 'SERVICE';
ALTER TYPE "SequenceType" ADD VALUE 'PROVIDER';
ALTER TYPE "SequenceType" ADD VALUE 'PATIENT';
