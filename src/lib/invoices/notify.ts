import { isEmailConfigured } from "@/lib/inbox/email";
import { sendCompanyEmail, resolveFromAddress, type EmailBranding } from "@/lib/inbox/email-branding";
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
  emailSenderName?: string | null;
  emailLogoUrl?: string | null;
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

  const branding: EmailBranding = {
    companyName: params.companyName,
    sendgridFrom: params.sendgridFrom,
    emailSenderName: params.emailSenderName,
    emailLogoUrl: params.emailLogoUrl,
  };

  if (params.customerEmail && isEmailConfigured() && resolveFromAddress(branding)) {
    try {
      await sendCompanyEmail(branding, {
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

type InvoiceReceiptParams = {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  companyName: string;
  sendgridFrom: string | null;
  emailSenderName?: string | null;
  emailLogoUrl?: string | null;
  twilioPhone: string | null;
  invoiceNumber: string;
  amount: number;
  publicToken: string;
};

export async function notifyInvoiceReceipt(params: InvoiceReceiptParams) {
  const payUrl = getInvoicePayUrl(params.publicToken);
  const amountFormatted = formatCurrency(params.amount);

  const subject = `Receipt — Invoice ${params.invoiceNumber}`;
  const intro = `Thank you for your payment of ${amountFormatted} for invoice ${params.invoiceNumber}.`;

  let emailSent = false;
  let smsSent = false;

  const branding: EmailBranding = {
    companyName: params.companyName,
    sendgridFrom: params.sendgridFrom,
    emailSenderName: params.emailSenderName,
    emailLogoUrl: params.emailLogoUrl,
  };

  if (params.customerEmail && isEmailConfigured() && resolveFromAddress(branding)) {
    try {
      await sendCompanyEmail(branding, {
        to: [params.customerEmail],
        subject,
        text: `Hi ${params.customerName},\n\n${intro}\n\nView your invoice: ${payUrl}\n\n— ${params.companyName}`,
        html: `<p>Hi ${params.customerName},</p><p>${intro}</p><p><a href="${payUrl}">View your invoice</a></p><p>— ${params.companyName}</p>`,
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
        body: `Payment received for invoice ${params.invoiceNumber}: ${amountFormatted}. View receipt: ${payUrl}`,
      });
      smsSent = true;
    } catch {
      // best-effort
    }
  }

  return { emailSent, smsSent, payUrl };
}
