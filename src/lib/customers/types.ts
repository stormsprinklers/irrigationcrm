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
