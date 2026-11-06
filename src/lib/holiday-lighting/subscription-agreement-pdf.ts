import sharp from "sharp";
import { SimplePdf, money } from "@/lib/pdf/layout-pdf";
import type { HolidaySubscriptionAgreementData } from "@/lib/holiday-lighting/subscription-agreement";

const sections: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: "1. Services and Materials",
    paragraphs: [
      "1.1 Services. Each Season, Company will provide design and installation of seasonal holiday lighting and decorations in accordance with the accepted scope; maintenance during the Display Period; takedown at the end of the Display Period; and off-season storage, inventory, and testing.",
      "1.2 Season; Display Period. A Season is each annual cycle beginning on the Effective Date (or each Renewal Date) and ending the day before the next Renewal Date. The Display Period runs from the scheduled installation date through approximately January 15, subject to Section 9.",
      "1.3 Service Area. Services are available only within Company's then-current service area, currently Utah County, Salt Lake County, Summit County, Wasatch County, Davis County, Weber County, and some portions of Juab County, Utah. Company may modify the Service Area; a modification does not affect a Property already under this Agreement except as provided in Section 8.",
      "1.4 Materials. Company selects, supplies, and maintains the lights, cords, clips, timers, decorations, and related materials used at the Property. Company will maintain an itemized list of installed Materials with the manufacturer's suggested retail price (MSRP) of each item in Exhibit B, updated as the Scope changes and available on request.",
    ],
  },
  {
    title: "2. Term and Automatic Renewal",
    paragraphs: [
      "2.1 Automatic Renewal. This is a recurring subscription. It begins on the Effective Date and automatically renews for successive one-Season terms on each anniversary unless Customer cancels under Section 6 or Company declines to renew under Section 8. Customer will be charged the then-current Annual Subscription Fee for each renewed Season.",
      "2.2 Renewal Notice. At least 30 days before each Renewal Date, Company will send written notice of the upcoming renewal, the Annual Subscription Fee for the coming Season, any adjustment under Section 3.4, and how to cancel.",
    ],
  },
  {
    title: "3. Pricing and Payment",
    paragraphs: [
      "3.1 Annual Subscription Fee. The annual price for the Services is the amount stated at checkout. It covers installation, maintenance, takedown, and storage for one Season; it does not include the cost of the Materials, which remain Company property under Section 4, or applicable taxes.",
      "3.2 Payment Schedule. For each Season, 50% of the Annual Subscription Fee is due at checkout (first Season) or on or before the Renewal Date (each later Season), and the remaining 50% is due upon completion of installation.",
      "3.3 Authorization to Charge. Customer authorizes Company to charge the payment method on file for the Booking Deposit, Installation Payment, approved Change Orders, applicable taxes, any Cancellation Fee, and other amounts due under this Agreement. Customer will keep a valid payment method on file.",
      "3.4 Annual Price Adjustment. Company may increase the Annual Subscription Fee for a renewed Season by up to 5% over the prior Season's fee by written notice at least 30 days before the Renewal Date. Customer may cancel before renewal under Section 6.",
      "3.5 Late Payment; Refunds. Past-due amounts accrue a late charge of 10% per month, not to exceed the maximum permitted by law, and Company may suspend Services while any amount is past due. Except as expressly provided, payments are non-refundable once Services for a Season have begun. If Company cannot perform installation for reasons within its control, Company will refund the Booking Deposit for that Season as Customer's sole remedy.",
    ],
  },
  {
    title: "4. Ownership and Care of Materials",
    paragraphs: [
      "4.1 Company Property. The Materials remain Company's sole property at all times, whether installed or in storage, unless and until title transfers to Customer under Section 6.3. The Annual Subscription Fee is a fee for Services and does not purchase the Materials.",
      "4.2 Customer Care; Access. Customer will not remove, relocate, alter, or tamper with the Materials or installation and is responsible at replacement cost for loss or damage caused by Customer, household members, guests, contractors, or pets, or by vandalism or theft while installed. Ordinary wear and weather-related failures are covered by Maintenance at no charge. Customer grants Company reasonable exterior access to install, maintain, and remove the Materials.",
    ],
  },
  {
    title: "5. Change Orders and Scope Changes",
    paragraphs: [
      "5.1 Change Orders. Either party may propose changes to the Scope. A change is effective only when documented in a written or electronic Change Order describing the change and any adjustment to the Annual Subscription Fee, accepted by both parties. Scope reductions take effect at the start of the next Season unless Company agrees otherwise and do not entitle Customer to a refund for the current Season.",
      "5.2 Effect; Site Conditions. A Change Order that adds or removes Materials updates the Materials List and therefore the Cancellation Fee. If Company discovers conditions not apparent at booking that materially increase difficulty, time, or Materials required, Company may propose a Change Order or decline the affected Services under Section 8.",
    ],
  },
  {
    title: "6. Cancellation by Customer; Cancellation Fee",
    paragraphs: [
      "6.1 How to Cancel. Customer may cancel at any time by written notice to Company at hello@utah.christmas or through any cancellation mechanism Company makes available. Cancellation is effective when Company receives the notice.",
      "6.2 Cancellation Fee. Because the Materials are selected, purchased, and configured for the Property and their cost is not included in the Annual Subscription Fee, upon cancellation Customer agrees to purchase the Materials from Company for the total MSRP of all Materials then on the Materials List, plus applicable sales tax. The Cancellation Fee is due within 15 days after cancellation and may be charged under Section 3.3. It is a purchase price for the Materials, not a penalty.",
      "6.3 Transfer of Materials. Upon payment of the Cancellation Fee in full, title transfers to Customer AS IS, with no Company warranty other than any transferable manufacturer warranty. Company will deliver the Materials at the Property or, if installed, leave them in place, and has no further obligation to remove, store, maintain, or reinstall them.",
      "6.4 Timing; Amounts Owed. If Customer cancels after paying the Booking Deposit but before installation, the Booking Deposit is non-refundable and will be applied against the Cancellation Fee. If Customer cancels after installation, all amounts for that Season remain due in addition to the Cancellation Fee. The fee is waived or credited only as provided in Sections 7 and 8.3.",
    ],
  },
  {
    title: "7. Relocation; Permanent Lighting Credit",
    paragraphs: [
      "7.1 Relocation Within the Service Area. Customer may transfer this Agreement to a new property within the Service Area on at least 30 days' written notice before the desired installation date, and the Cancellation Fee is waived. Company may adjust the Annual Subscription Fee and Materials List for the new property.",
      "7.2 Moves Outside the Service Area. Customer may cancel under Section 6, request a waiver under Section 8.3, or Company may allow assignment to a subsequent owner or occupant who accepts this Agreement.",
      "7.3 Permanent Lighting Credit. If Customer cancels and, within 12 months, purchases a permanent lighting system from Company for the Property, Company will credit the full Cancellation Fee paid against the permanent-system purchase price. If contracted before cancellation, Company may terminate this Agreement upon permanent-system installation, waive the Cancellation Fee, and remove and retain the seasonal Materials.",
    ],
  },
  {
    title: "8. Company's Right to Decline Service; Waiver",
    paragraphs: [
      "8.1 Right to Decline or Discontinue. Company may decline to provide or renew Services, or discontinue Services at the Property, including for safety, access, structural or electrical concerns, a Property outside the Service Area, Customer breach, or changes to Company's service offerings, by written notice.",
      "8.2 Effect. If Company declines or discontinues other than for Customer breach, Company will refund any portion of the Annual Subscription Fee paid for Services not yet performed in the current Season, waive the Cancellation Fee, and remove and retain the Materials. If Company discontinues for Customer breach, Customer remains responsible for accrued amounts and Company may retain the Materials or require their purchase.",
      "8.3 Waiver. Company may, in its sole discretion and case by case, waive or reduce the Cancellation Fee. A waiver is effective only in a writing from Company and applies only to the instance described.",
    ],
  },
  {
    title: "9. Customer Responsibilities; Scheduling and Weather",
    paragraphs: [
      "9.1 Customer Responsibilities. Customer represents that Customer owns the Property or has authority to permit the Services and will provide safe and reasonable exterior access and secure pets; provide functioning exterior outlets with sufficient capacity and pay for electricity consumed; obtain required approvals; comply with restrictions; and inform Company of known hazards or sensitive conditions.",
      "9.2 Scheduling and Weather. Company schedules installations and takedowns in the order bookings and deposits are received and will provide a target date or window. Company may reschedule or postpone for weather, daylight, crew availability, or unsafe conditions, and takedown may extend beyond the Display Period where weather or safety requires. Customer may report outages to 385-999-6887 or hello@utah.christmas.",
    ],
  },
  {
    title: "10. Warranty; Limitation of Liability; Indemnity",
    paragraphs: [
      "10.1 Workmanship; Disclaimer. Company warrants that Services will be performed professionally and in a workmanlike manner. Customer's sole remedy for breach is correction of deficient Services, provided Customer notifies Company within 10 days after discovery. Except as expressly stated, Company makes no warranties, express or implied, including merchantability or fitness for a particular purpose, with respect to Services or Materials.",
      "10.2 Limitation of Liability. To the fullest extent permitted by law, Company's total liability arising out of this Agreement or the Services in any Season will not exceed the Annual Subscription Fee paid for that Season, and Company will not be liable for indirect, incidental, consequential, special, or punitive damages. This does not apply to gross negligence or willful misconduct or to the extent prohibited by law.",
      "10.3 Property Damage; Indemnity; Insurance. Company will repair, or pay the reasonable cost to repair, physical damage caused by Company's negligence if timely reported and inspection is allowed. Company is not responsible for pre-existing conditions, normal wear from attachment clips and fasteners, or undisclosed conditions. Customer will indemnify Company against third-party claims arising from Customer's breach or tampering.",
    ],
  },
  {
    title: "11. Force Majeure; Default",
    paragraphs: [
      "11.1 Force Majeure. Neither party is liable for failure or delay caused by events beyond its reasonable control, including severe weather, natural disaster, epidemic, labor or supply shortage, utility failure, or governmental action. Company may reschedule or refund amounts paid for Services not performed in that Season as Customer's sole remedy.",
      "11.2 Default. If Customer fails to pay within 10 days after written notice that an amount is past due, or otherwise materially breaches and fails to cure within 10 days after written notice, Company may terminate this Agreement; all amounts for the current Season become immediately due; Company may recover the Materials or require their purchase; and Customer is responsible for reasonable collection costs, including attorneys' fees, to the extent permitted by law.",
    ],
  },
  {
    title: "12. Governing Law and Disputes",
    paragraphs: [
      "This Agreement is governed by Utah law. Before formal proceedings, the parties will attempt in good faith to resolve any dispute through direct discussion for at least 30 days after written notice. Any action will be brought exclusively in the state or federal courts located in Utah County, Utah, except that either party may bring a qualifying claim in small claims court.",
    ],
  },
  {
    title: "13. General",
    paragraphs: [
      "13.1 Entire Agreement; Amendments. This Agreement, including the checkout summary, Exhibit A, Exhibit B, and Change Orders, is the entire agreement between the parties on its subject matter. Company may update these terms for future Seasons by written notice at least 30 days before the Renewal Date; continued subscription after renewal constitutes acceptance, and Customer may otherwise cancel under Section 6.",
      "13.2 Assignment; Notices. Customer may not assign this Agreement without Company's written consent except as provided in Section 7.2; Company may assign it to a successor to its business. Notices to Customer may be sent to the email or mailing address provided at checkout; notices to Company must be sent to 1372 W Center St., Orem, UT 84057 or hello@utah.christmas.",
      "13.3 Severability; Waiver; Survival. If any provision is unenforceable, the remainder remains in effect and the provision will be modified to the minimum extent necessary. Failure to enforce is not a waiver. Sections 4, 6, 7.3, 8.2, 10, 11.2, 12, and 13 survive cancellation, expiration, or termination.",
      "13.4 Electronic Acceptance. Clicking I agree or otherwise electronically indicating acceptance constitutes Customer's electronic signature and creates a binding agreement. Company may provide the Agreement, notices, and records electronically; Customer may request a paper copy at any time.",
      "13.5 Promotional Use. Customer consents to Company photographing the exterior display for Company's portfolio and marketing without identifying Customer or the Property address. Customer may withdraw consent by written notice.",
    ],
  },
  {
    title: "14. Customer Acknowledgments",
    paragraphs: [
      "Recurring subscription. This annual subscription automatically renews each year until cancelled.",
      "Payments. 50% is charged at booking and on each Renewal Date, and 50% upon installation, with authorization to charge the payment method on file.",
      "Price adjustments. The Annual Subscription Fee may increase by up to 5% per year with advance notice.",
      "Cancellation Fee. If Customer cancels, Customer purchases the installed Materials at MSRP and they become Customer property. The fee is waived for an eligible transfer and credited toward an eligible permanent-lighting purchase.",
      "Company's rights; liability. Company may decline or discontinue service and may waive the Cancellation Fee in its discretion; Company's liability is limited as described in Section 10.",
    ],
  },
];

function addField(pdf: SimplePdf, label: string, value: string) {
  pdf.addBoldBody(label);
  pdf.addBody(value || "Not provided");
}

export async function buildHolidaySubscriptionAgreementPdf(params: {
  agreement: HolidaySubscriptionAgreementData;
  signatureImage: Buffer;
  signedAt: Date;
  companyName?: string;
}) {
  const { agreement, signatureImage, signedAt } = params;
  const pdf = new SimplePdf("#166534");

  pdf.addHeading("Seasonal Holiday Lighting Subscription Agreement");
  pdf.addMuted("Storm Sprinklers LLC, doing business as Chestnut & Cheer");
  pdf.addMuted(`Estimate ${agreement.estimateNumber} | Agreement version ${agreement.version}`);
  pdf.addRule();
  pdf.addBody(
    "This Seasonal Holiday Lighting Subscription Agreement (this Agreement) is between Storm Sprinklers LLC, doing business as Chestnut & Cheer (Company, we, or us), and the customer identified at checkout or on the signature page (Customer, you, or your). This Agreement is effective on the date Customer accepts it (the Effective Date)."
  );
  pdf.addBoldBody(
    "PLEASE READ CAREFULLY. THIS IS A RECURRING, ANNUALLY RENEWING SUBSCRIPTION. IT INCLUDES A CANCELLATION FEE EQUAL TO THE MANUFACTURER'S SUGGESTED RETAIL PRICE OF THE LIGHTS, MATERIALS, AND DECORATIONS INSTALLED AT YOUR PROPERTY (SECTION 6), AN ANNUAL PRICE ADJUSTMENT RIGHT (SECTION 3.4), AND A LIMITATION OF LIABILITY (SECTION 10)."
  );

  for (const section of sections) {
    pdf.addSubheading(section.title);
    for (const paragraph of section.paragraphs) pdf.addBody(paragraph);
  }

  pdf.addHeading("Exhibit A");
  pdf.addSubheading("Property and Pricing Summary");
  addField(pdf, "Customer Name", agreement.customerName);
  addField(pdf, "Property Address", agreement.propertyAddress);
  addField(pdf, "Email / Phone", agreement.emailPhone);
  addField(pdf, "Effective Date", agreement.effectiveDate);
  addField(pdf, "Scope / Design Package", agreement.scopeDesignPackage);
  addField(pdf, "Target Installation Window", agreement.targetInstallationWindow);
  addField(pdf, "Target Takedown Window", agreement.targetTakedownWindow);
  addField(pdf, "Annual Subscription Fee (Season 1)", money(agreement.annualSubscriptionFee));
  addField(pdf, "Booking Deposit (50%) - due at checkout", money(agreement.bookingDeposit));
  addField(pdf, "Installation Payment (50%) - due upon installation", money(agreement.installationPayment));
  addField(pdf, "Payment Method on File", agreement.paymentMethodOnFile);
  addField(pdf, "Promotional Photo Consent (Section 13.5)", agreement.promotionalPhotoConsent ? "Yes" : "No");

  pdf.addHeading("Exhibit B");
  pdf.addSubheading("Materials List");
  pdf.addBody(
    "Company will maintain and update this list for the Property. The Cancellation Fee under Section 6.2 equals the total MSRP below, plus applicable tax, as of the Cancellation Date. Updated lists are available to Customer on request."
  );
  if (!agreement.materials.length) {
    pdf.addMuted("No Materials have been added to this option.");
  } else {
    agreement.materials.forEach((material, index) => {
      pdf.addBoldBody(`${index + 1}. ${material.itemDescription}`);
      pdf.addBody(
        `Manufacturer / model: ${material.manufacturerModel || "Not specified"}\nQuantity: ${material.quantity}\nMSRP each: ${money(material.unitMsrp)}\nMSRP total: ${money(material.totalMsrp)}\nDate added: ${material.dateAdded}`
      );
    });
  }
  pdf.addRow("Total cancellation fee basis (before tax)", money(agreement.cancellationFee), true);

  pdf.addPageBreak();
  pdf.addHeading("Electronic Signature");
  pdf.addBody(
    "Customer accepts this Agreement by signing the estimate. The signature below is the electronic signature associated with this accepted Agreement."
  );
  const signatureJpeg = await sharp(signatureImage)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();
  pdf.addJpeg(signatureJpeg, "Customer signature", { width: 260, height: 100 });
  addField(pdf, "Signed by", agreement.customerName);
  addField(
    pdf,
    "Signed at",
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeStyle: "long",
      timeZone: "America/Denver",
    }).format(signedAt)
  );
  addField(pdf, "Estimate", agreement.estimateNumber);
  addField(pdf, "Selected option ID", agreement.selectedOptionId);

  return pdf.toBuffer();
}
