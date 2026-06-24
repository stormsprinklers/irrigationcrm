export type EstimateDTO = {
  id: string;
  status: string;
  expiresAt: string | null;
  depositRequired: boolean;
  depositType: string | null;
  depositAmount: number | null;
  signatureBlobUrl: string | null;
  signedAt: string | null;
  approvedAt: string | null;
  subtotal: number;
  discountTotal: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    doNotService: boolean;
  };
  property: { id: string; name: string; address: string | null } | null;
  visit: { id: string; title: string; startAt: string } | null;
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
    sortOrder: number;
    priceBookItemId: string | null;
  }>;
  discounts: Array<{
    id: string;
    label: string | null;
    type: "PERCENT" | "FIXED";
    amount: number;
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { id: string; name: string } | null;
  }>;
  attachments: Array<{
    id: string;
    blobUrl: string;
    fileName: string;
    mimeType: string;
    createdAt: string;
  }>;
  designProjectId?: string | null;
  designVersionId?: string | null;
  designExportMetadata?: Record<string, unknown> | null;
  estimatedManHours?: number | null;
  installDurationDays?: number | null;
  needsScheduling?: boolean;
  designInternalBom?: unknown;
  premiumOptionTotal?: number | null;
  selectedQuoteTier?: string | null;
};

export type EstimateListItem = Pick<
  EstimateDTO,
  "id" | "status" | "total" | "createdAt" | "expiresAt" | "customer" | "visit"
>;
