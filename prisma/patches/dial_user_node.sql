-- Add the DIAL_USER call-flow node type (ring a specific user's apps: web + iOS).
-- Postgres requires enum values to be added outside a transaction; run standalone.
ALTER TYPE "CallFlowNodeType" ADD VALUE IF NOT EXISTS 'DIAL_USER';
