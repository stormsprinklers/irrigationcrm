export function getInvoicePayUrl(publicToken: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/pay/${publicToken}`;
}
