-- Add the ADD_TAG campaign flow node (apply a customer tag, then continue).
ALTER TYPE "CampaignFlowNodeType" ADD VALUE IF NOT EXISTS 'ADD_TAG';
