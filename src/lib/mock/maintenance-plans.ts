export type PlanStatus = {
  label: string;
  count: number;
  color: string;
};

export type BillingRow = {
  id: string;
  customer: string;
  phone: string;
  dueDate: string;
  status: string;
  amount: string;
};

export const planSummary = {
  totalPlans: 25,
  revenueAllTime: "$9,100.76",
};

export const planStatuses: PlanStatus[] = [
  { label: "Draft", count: 1, color: "bg-gray-400" },
  { label: "Sent", count: 0, color: "bg-blue-400" },
  { label: "Pending renewal", count: 0, color: "bg-sky-400" },
  { label: "Active", count: 24, color: "bg-green-500" },
  { label: "Renewed", count: 0, color: "bg-green-700" },
  { label: "Expiring soon", count: 0, color: "bg-yellow-400" },
  { label: "Expired", count: 0, color: "bg-pink-400" },
];

export const recurringRevenue = [
  { month: "June", amount: "$373.23" },
  { month: "July", amount: "$1,483.13" },
  { month: "August", amount: "$892.50" },
  { month: "September", amount: "$1,120.00" },
];

export const revenueCollected = {
  amount: "$50.89 in June",
  trend: "-97.98%",
};

export const billingDueRows: BillingRow[] = [
  {
    id: "1",
    customer: "Mary Boyack",
    phone: "(801) 555-0123",
    dueDate: "Jun 15, 2026",
    status: "Due soon",
    amount: "$49.99",
  },
  {
    id: "2",
    customer: "John Smith",
    phone: "(801) 555-0456",
    dueDate: "Jun 18, 2026",
    status: "Due soon",
    amount: "$74.99",
  },
  {
    id: "3",
    customer: "Susan Lee",
    phone: "(801) 555-0789",
    dueDate: "Jun 20, 2026",
    status: "Due soon",
    amount: "$99.99",
  },
];
