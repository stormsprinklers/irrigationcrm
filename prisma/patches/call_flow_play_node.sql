-- Add the PLAY call-flow node type (play a greeting / audio clip, then continue).
-- Postgres requires ADD VALUE to run outside a transaction; IF NOT EXISTS makes it idempotent.
ALTER TYPE "CallFlowNodeType" ADD VALUE IF NOT EXISTS 'PLAY';
