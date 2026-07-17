export const AI_RECEPTIONIST_TAG = "ai-receptionist";
export const AI_RECEPTIONIST_SYSTEM_KIND = "AI_RECEPTIONIST";
export const APPOINTMENT_HOLD_MINUTES = 8;

export type AiReceptionistNodeConfig = {
  voice?: string;
  transferNodeId?: string;
  voicemailNodeId?: string;
  allowedTools?: string[];
  maxCallMinutes?: number;
  discloseScript?: string;
  branch?: "open" | "closed";
};

export const V1_RECEPTIONIST_TOOLS = [
  "lookup_customer_by_phone",
  "lookup_customer_by_address",
  "get_customer_jobs",
  "get_job_details",
  "check_service_area",
  "get_available_appointments",
  "create_customer",
  "create_service_address",
  "reserve_appointment",
  "create_job",
  "reschedule_job",
  "cancel_job",
  "add_job_note",
  "send_confirmation_text",
  "transfer_to_human",
  "fallback_voicemail",
] as const;

export type ReceptionistToolName = (typeof V1_RECEPTIONIST_TOOLS)[number];

export type ReceptionistConversationState = {
  customerId?: string | null;
  propertyId?: string | null;
  holdId?: string | null;
  visitId?: string | null;
  detailsConfirmed?: boolean;
  issue?: string | null;
  preferredStartAt?: string | null;
  serviceZip?: string | null;
};
