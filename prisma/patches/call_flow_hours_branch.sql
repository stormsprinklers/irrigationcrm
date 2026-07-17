-- Schedule / hours branch node for call flows (day + time windows → next step).
ALTER TYPE "CallFlowNodeType" ADD VALUE IF NOT EXISTS 'HOURS_BRANCH';
