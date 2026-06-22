export type CustomerDTO = {
  id: string;
  name: string;
  companyName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  leadSource: string | null;
  status: "ACTIVE" | "ARCHIVED";
  doNotService: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  propertyCount?: number;
  visitCount?: number;
  estimateCount?: number;
  invoiceCount?: number;
};

export type CustomerPropertyDTO = {
  id: string;
  customerId: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isPrimary: boolean;
  createdAt: string;
};

export type CustomerListFilters = {
  search?: string;
  city?: string;
  zip?: string;
  leadSource?: string;
  company?: string;
  status?: "ACTIVE" | "ARCHIVED" | "ALL";
};

export type CustomerPhoneDTO = {
  id: string;
  phone: string;
  note: string | null;
  createdAt: string;
};
