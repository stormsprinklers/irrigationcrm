import { getDefaultFromEmail, isEmailConfigured, sendEmail } from "@/lib/inbox/email";
import { sendSms } from "@/lib/inbox/twilio";
import { getInvoicePayUrl } from "@/lib/invoices/pay-url";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

type InvoiceNotifyParams = {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  companyName: string;
  sendgridFrom: string | null;
  twilioPhone: string | null;
  invoiceNumber: string;
  balanceDue: number;
  publicToken: string;
  kind: "send" | "remind";
};

export async function notifyInvoicePayment(params: InvoiceNotifyParams) {
  const payUrl = getInvoicePayUrl(params.publicToken);
  const amount = formatCurrency(params.balanceDue);

  const subject =
    params.kind === "send"
      ? `Invoice ${params.invoiceNumber} from ${params.companyName}`
      : `Payment reminder — Invoice ${params.invoiceNumber}`;

  const intro =
    params.kind === "send"
      ? `Please find invoice ${params.invoiceNumber} for ${amount} from ${params.companyName}.`
      : `This is a reminder that invoice ${params.invoiceNumber} for ${amount} is outstanding.`;

  const smsBody =
    params.kind === "send"
      ? `Invoice ${params.invoiceNumber} for ${amount} from ${params.companyName}. Pay here: ${payUrl}`
      : `Reminder: Invoice ${params.invoiceNumber} for ${amount} is due. Pay here: ${payUrl}`;

  let emailSent = false;
  let smsSent = false;

  const fromEmail = params.sendgridFrom ?? getDefaultFromEmail();
  if (params.customerEmail && fromEmail && isEmailConfigured()) {
    try {
      await sendEmail({
        from: fromEmail,
        to: [params.customerEmail],
        subject,
        text: `Hi ${params.customerName},\n\n${intro}\n\nPay online: ${payUrl}\n\n— ${params.companyName}`,
        html: `<p>Hi ${params.customerName},</p><p>${intro}</p><p><a href="${payUrl}">Pay online</a></p><p>— ${params.companyName}</p>`,
      });
      emailSent = true;
    } catch {
      // best-effort
    }
  }

  if (params.customerPhone && params.twilioPhone && process.env.TWILIO_ACCOUNT_SID) {
    try {
      await sendSms({
        from: params.twilioPhone,
        to: params.customerPhone,
        body: smsBody,
      });
      smsSent = true;
    } catch {
      // best-effort
    }
  }

  return { emailSent, smsSent, payUrl };
}
