export type StormAiPageContext = {
  pathname?: string;
  customerId?: string;
  visitId?: string;
  invoiceId?: string;
  employeeId?: string;
};

export type StormAiToolResult =
  | { ok: true; data: unknown }
  | { ok: false; code: "NOT_FOUND" | "FORBIDDEN" | "UNAVAILABLE" | "INVALID"; error: string };

export type StormAiOpenAiTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
