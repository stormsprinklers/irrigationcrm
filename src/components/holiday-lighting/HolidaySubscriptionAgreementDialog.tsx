import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HolidaySubscriptionAgreementData } from "@/lib/holiday-lighting/subscription-agreement";

function currency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function AgreementSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">{title}</h3>
      <div className="space-y-2 text-sm leading-6 text-slate-700">{children}</div>
    </section>
  );
}

function ExhibitRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid border-b border-slate-300 last:border-b-0 sm:grid-cols-[240px_1fr]">
      <div className="bg-slate-100 px-3 py-2 font-semibold text-slate-900">{label}</div>
      <div className="px-3 py-2 text-slate-700">{value}</div>
    </div>
  );
}

export function HolidaySubscriptionAgreementDialog({
  open,
  onClose,
  agreement,
  companyName,
}: {
  open: boolean;
  onClose: () => void;
  agreement: HolidaySubscriptionAgreementData;
  companyName: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[350] flex items-center justify-center bg-black/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="holiday-agreement-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              {companyName}
            </p>
            <h2 id="holiday-agreement-title" className="mt-1 text-xl font-bold text-slate-950">
              Seasonal Holiday Lighting Subscription Agreement
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Estimate {agreement.estimateNumber} · Agreement version {agreement.version}
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" aria-label="Close agreement" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="overflow-y-auto px-5 py-6 sm:px-8">
          <article className="mx-auto max-w-4xl space-y-7">
            <div className="space-y-3 text-sm leading-6 text-slate-700">
              <p className="text-center italic">Storm Sprinklers LLC, doing business as Chestnut &amp; Cheer</p>
              <p>
                This Seasonal Holiday Lighting Subscription Agreement (this “Agreement”) is between
                Storm Sprinklers LLC, doing business as Chestnut &amp; Cheer (“Company,” “we,” or “us”),
                and the customer identified at checkout or on the signature page (“Customer,” “you,”
                or “your”). This Agreement is effective on the date Customer accepts it (the “Effective Date”).
              </p>
              <p className="font-bold uppercase text-slate-950">
                Please read carefully. This is a recurring, annually renewing subscription. It includes
                a cancellation fee equal to the manufacturer’s suggested retail price of the lights,
                materials, and decorations installed at your property (Section 6), an annual price
                adjustment right (Section 3.4), and a limitation of liability (Section 10).
              </p>
            </div>

            <AgreementSection title="1. Services and Materials">
              <p><strong>1.1 Services.</strong> Each Season, Company will provide design and installation of seasonal holiday lighting and decorations in accordance with the accepted scope; maintenance during the Display Period; takedown at the end of the Display Period; and off-season storage, inventory, and testing.</p>
              <p><strong>1.2 Season; Display Period.</strong> A Season is each annual cycle beginning on the Effective Date (or each Renewal Date) and ending the day before the next Renewal Date. The Display Period runs from the scheduled installation date through approximately January 15, subject to Section 9.</p>
              <p><strong>1.3 Service Area.</strong> Services are available only within Company’s then-current service area, currently Utah County, Salt Lake County, Summit County, Wasatch County, Davis County, Weber County, and some portions of Juab County, Utah. Company may modify the Service Area; a modification does not affect a Property already under this Agreement except as provided in Section 8.</p>
              <p><strong>1.4 Materials.</strong> Company selects, supplies, and maintains the lights, cords, clips, timers, decorations, and related materials used at the Property. Company will maintain an itemized list of installed Materials with the manufacturer’s suggested retail price (“MSRP”) of each item in Exhibit B, updated as the Scope changes and available on request.</p>
            </AgreementSection>

            <AgreementSection title="2. Term and Automatic Renewal">
              <p><strong>2.1 Automatic Renewal.</strong> This is a recurring subscription. It begins on the Effective Date and automatically renews for successive one-Season terms on each anniversary unless Customer cancels under Section 6 or Company declines to renew under Section 8. Customer will be charged the then-current Annual Subscription Fee for each renewed Season.</p>
              <p><strong>2.2 Renewal Notice.</strong> At least 30 days before each Renewal Date, Company will send written notice of the upcoming renewal, the Annual Subscription Fee for the coming Season, any adjustment under Section 3.4, and how to cancel.</p>
            </AgreementSection>

            <AgreementSection title="3. Pricing and Payment">
              <p><strong>3.1 Annual Subscription Fee.</strong> The annual price for the Services is the amount stated at checkout. It covers installation, maintenance, takedown, and storage for one Season; it does not include the cost of the Materials, which remain Company property under Section 4, or applicable taxes.</p>
              <p><strong>3.2 Payment Schedule.</strong> For each Season, 50% of the Annual Subscription Fee is due at checkout (first Season) or on or before the Renewal Date (each later Season), and the remaining 50% is due upon completion of installation.</p>
              <p><strong>3.3 Authorization to Charge.</strong> Customer authorizes Company to charge the payment method on file for the Booking Deposit, Installation Payment, approved Change Orders, applicable taxes, any Cancellation Fee, and other amounts due under this Agreement. Customer will keep a valid payment method on file.</p>
              <p><strong>3.4 Annual Price Adjustment.</strong> Company may increase the Annual Subscription Fee for a renewed Season by up to 5% over the prior Season’s fee by written notice at least 30 days before the Renewal Date. Customer may cancel before renewal under Section 6.</p>
              <p><strong>3.5 Late Payment; Refunds.</strong> Past-due amounts accrue a late charge of 10% per month, not to exceed the maximum permitted by law, and Company may suspend Services while any amount is past due. Except as expressly provided, payments are non-refundable once Services for a Season have begun. If Company cannot perform installation for reasons within its control, Company will refund the Booking Deposit for that Season as Customer’s sole remedy.</p>
            </AgreementSection>

            <AgreementSection title="4. Ownership and Care of Materials">
              <p><strong>4.1 Company Property.</strong> The Materials remain Company’s sole property at all times, whether installed or in storage, unless and until title transfers to Customer under Section 6.3. The Annual Subscription Fee is a fee for Services and does not purchase the Materials.</p>
              <p><strong>4.2 Customer Care; Access.</strong> Customer will not remove, relocate, alter, or tamper with the Materials or installation and is responsible at replacement cost for loss or damage caused by Customer, household members, guests, contractors, or pets, or by vandalism or theft while installed. Ordinary wear and weather-related failures are covered by Maintenance at no charge. Customer grants Company reasonable exterior access to install, maintain, and remove the Materials.</p>
            </AgreementSection>

            <AgreementSection title="5. Change Orders and Scope Changes">
              <p><strong>5.1 Change Orders.</strong> Either party may propose changes to the Scope. A change is effective only when documented in a written or electronic Change Order describing the change and any adjustment to the Annual Subscription Fee, accepted by both parties. Scope reductions take effect at the start of the next Season unless Company agrees otherwise and do not entitle Customer to a refund for the current Season.</p>
              <p><strong>5.2 Effect; Site Conditions.</strong> A Change Order that adds or removes Materials updates the Materials List and therefore the Cancellation Fee. If Company discovers conditions not apparent at booking that materially increase difficulty, time, or Materials required, Company may propose a Change Order or decline the affected Services under Section 8.</p>
            </AgreementSection>

            <AgreementSection title="6. Cancellation by Customer; Cancellation Fee">
              <p><strong>6.1 How to Cancel.</strong> Customer may cancel at any time by written notice to Company at <a className="text-sky-700 underline" href="mailto:hello@utah.christmas">hello@utah.christmas</a> or through any cancellation mechanism Company makes available. Cancellation is effective when Company receives the notice.</p>
              <p><strong>6.2 Cancellation Fee.</strong> Because the Materials are selected, purchased, and configured for the Property and their cost is not included in the Annual Subscription Fee, upon cancellation Customer agrees to purchase the Materials from Company for the total MSRP of all Materials then on the Materials List, plus applicable sales tax. The Cancellation Fee is due within 15 days after cancellation and may be charged under Section 3.3. It is a purchase price for the Materials, not a penalty.</p>
              <p><strong>6.3 Transfer of Materials.</strong> Upon payment of the Cancellation Fee in full, title transfers to Customer “AS IS,” with no Company warranty other than any transferable manufacturer warranty. Company will deliver the Materials at the Property or, if installed, leave them in place, and has no further obligation to remove, store, maintain, or reinstall them.</p>
              <p><strong>6.4 Timing; Amounts Owed.</strong> If Customer cancels after paying the Booking Deposit but before installation, the Booking Deposit is non-refundable and will be applied against the Cancellation Fee. If Customer cancels after installation, all amounts for that Season remain due in addition to the Cancellation Fee. The fee is waived or credited only as provided in Sections 7 and 8.3.</p>
            </AgreementSection>

            <AgreementSection title="7. Relocation; Permanent Lighting Credit">
              <p><strong>7.1 Relocation Within the Service Area.</strong> Customer may transfer this Agreement to a new property within the Service Area on at least 30 days’ written notice before the desired installation date, and the Cancellation Fee is waived. Company may adjust the Annual Subscription Fee and Materials List for the new property.</p>
              <p><strong>7.2 Moves Outside the Service Area.</strong> Customer may cancel under Section 6, request a waiver under Section 8.3, or Company may allow assignment to a subsequent owner or occupant who accepts this Agreement.</p>
              <p><strong>7.3 Permanent Lighting Credit.</strong> If Customer cancels and, within 12 months, purchases a permanent lighting system from Company for the Property, Company will credit the full Cancellation Fee paid against the permanent-system purchase price. If contracted before cancellation, Company may terminate this Agreement upon permanent-system installation, waive the Cancellation Fee, and remove and retain the seasonal Materials.</p>
            </AgreementSection>

            <AgreementSection title="8. Company’s Right to Decline Service; Waiver">
              <p><strong>8.1 Right to Decline or Discontinue.</strong> Company may decline to provide or renew Services, or discontinue Services at the Property, including for safety, access, structural or electrical concerns, a Property outside the Service Area, Customer breach, or changes to Company’s service offerings, by written notice.</p>
              <p><strong>8.2 Effect.</strong> If Company declines or discontinues other than for Customer breach, Company will refund any portion of the Annual Subscription Fee paid for Services not yet performed in the current Season, waive the Cancellation Fee, and remove and retain the Materials. If Company discontinues for Customer breach, Customer remains responsible for accrued amounts and Company may retain the Materials or require their purchase.</p>
              <p><strong>8.3 Waiver.</strong> Company may, in its sole discretion and case by case, waive or reduce the Cancellation Fee. A waiver is effective only in a writing from Company and applies only to the instance described.</p>
            </AgreementSection>

            <AgreementSection title="9. Customer Responsibilities; Scheduling and Weather">
              <p><strong>9.1 Customer Responsibilities.</strong> Customer represents that Customer owns the Property or has authority to permit the Services and will provide safe and reasonable exterior access and secure pets; provide functioning exterior outlets with sufficient capacity and pay for electricity consumed; obtain required approvals; comply with restrictions; and inform Company of known hazards or sensitive conditions.</p>
              <p><strong>9.2 Scheduling and Weather.</strong> Company schedules installations and takedowns in the order bookings and deposits are received and will provide a target date or window. Company may reschedule or postpone for weather, daylight, crew availability, or unsafe conditions, and takedown may extend beyond the Display Period where weather or safety requires. Customer may report outages to 385-999-6887 or <a className="text-sky-700 underline" href="mailto:hello@utah.christmas">hello@utah.christmas</a>.</p>
            </AgreementSection>

            <AgreementSection title="10. Warranty; Limitation of Liability; Indemnity">
              <p><strong>10.1 Workmanship; Disclaimer.</strong> Company warrants that Services will be performed professionally and in a workmanlike manner. Customer’s sole remedy for breach is correction of deficient Services, provided Customer notifies Company within 10 days after discovery. Except as expressly stated, Company makes no warranties, express or implied, including merchantability or fitness for a particular purpose, with respect to Services or Materials.</p>
              <p><strong>10.2 Limitation of Liability.</strong> To the fullest extent permitted by law, Company’s total liability arising out of this Agreement or the Services in any Season will not exceed the Annual Subscription Fee paid for that Season, and Company will not be liable for indirect, incidental, consequential, special, or punitive damages. This does not apply to gross negligence or willful misconduct or to the extent prohibited by law.</p>
              <p><strong>10.3 Property Damage; Indemnity; Insurance.</strong> Company will repair, or pay the reasonable cost to repair, physical damage caused by Company’s negligence if timely reported and inspection is allowed. Company is not responsible for pre-existing conditions, normal wear from attachment clips and fasteners, or undisclosed conditions. Customer will indemnify Company against third-party claims arising from Customer’s breach or tampering.</p>
            </AgreementSection>

            <AgreementSection title="11. Force Majeure; Default">
              <p><strong>11.1 Force Majeure.</strong> Neither party is liable for failure or delay caused by events beyond its reasonable control, including severe weather, natural disaster, epidemic, labor or supply shortage, utility failure, or governmental action. Company may reschedule or refund amounts paid for Services not performed in that Season as Customer’s sole remedy.</p>
              <p><strong>11.2 Default.</strong> If Customer fails to pay within 10 days after written notice that an amount is past due, or otherwise materially breaches and fails to cure within 10 days after written notice, Company may terminate this Agreement; all amounts for the current Season become immediately due; Company may recover the Materials or require their purchase; and Customer is responsible for reasonable collection costs, including attorneys’ fees, to the extent permitted by law.</p>
            </AgreementSection>

            <AgreementSection title="12. Governing Law and Disputes">
              <p>This Agreement is governed by Utah law. Before formal proceedings, the parties will attempt in good faith to resolve any dispute through direct discussion for at least 30 days after written notice. Any action will be brought exclusively in the state or federal courts located in Utah County, Utah, except that either party may bring a qualifying claim in small claims court.</p>
            </AgreementSection>

            <AgreementSection title="13. General">
              <p><strong>13.1 Entire Agreement; Amendments.</strong> This Agreement, including the checkout summary, Exhibit A, Exhibit B, and Change Orders, is the entire agreement between the parties on its subject matter. Company may update these terms for future Seasons by written notice at least 30 days before the Renewal Date; continued subscription after renewal constitutes acceptance, and Customer may otherwise cancel under Section 6.</p>
              <p><strong>13.2 Assignment; Notices.</strong> Customer may not assign this Agreement without Company’s written consent except as provided in Section 7.2; Company may assign it to a successor to its business. Notices to Customer may be sent to the email or mailing address provided at checkout; notices to Company must be sent to 1372 W Center St., Orem, UT 84057 or <a className="text-sky-700 underline" href="mailto:hello@utah.christmas">hello@utah.christmas</a>.</p>
              <p><strong>13.3 Severability; Waiver; Survival.</strong> If any provision is unenforceable, the remainder remains in effect and the provision will be modified to the minimum extent necessary. Failure to enforce is not a waiver. Sections 4, 6, 7.3, 8.2, 10, 11.2, 12, and 13 survive cancellation, expiration, or termination.</p>
              <p><strong>13.4 Electronic Acceptance.</strong> Clicking “I agree” or otherwise electronically indicating acceptance constitutes Customer’s electronic signature and creates a binding agreement. Company may provide the Agreement, notices, and records electronically; Customer may request a paper copy at any time.</p>
              <p><strong>13.5 Promotional Use.</strong> Customer consents to Company photographing the exterior display for Company’s portfolio and marketing without identifying Customer or the Property address. Customer may withdraw consent by written notice.</p>
            </AgreementSection>

            <AgreementSection title="14. Customer Acknowledgments">
              <ul className="space-y-2 pl-5">
                <li className="list-disc"><strong>Recurring subscription.</strong> This annual subscription automatically renews each year until cancelled.</li>
                <li className="list-disc"><strong>Payments.</strong> 50% is charged at booking and on each Renewal Date, and 50% upon installation, with authorization to charge the payment method on file.</li>
                <li className="list-disc"><strong>Price adjustments.</strong> The Annual Subscription Fee may increase by up to 5% per year with advance notice.</li>
                <li className="list-disc"><strong>Cancellation Fee.</strong> If Customer cancels, Customer purchases the installed Materials at MSRP and they become Customer property. The fee is waived for an eligible transfer and credited toward an eligible permanent-lighting purchase.</li>
                <li className="list-disc"><strong>Company’s rights; liability.</strong> Company may decline or discontinue service and may waive the Cancellation Fee in its discretion; Company’s liability is limited as described in Section 10.</li>
              </ul>
            </AgreementSection>

            <section className="space-y-3">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-950">Exhibit A</p>
                <p className="font-semibold uppercase tracking-wide text-slate-700">Property and Pricing Summary</p>
              </div>
              <div className="overflow-hidden rounded-md border border-slate-300 text-sm">
                <ExhibitRow label="Customer Name" value={agreement.customerName} />
                <ExhibitRow label="Property Address" value={agreement.propertyAddress} />
                <ExhibitRow label="Email / Phone" value={agreement.emailPhone} />
                <ExhibitRow label="Effective Date" value={agreement.effectiveDate} />
                <ExhibitRow label="Scope / Design Package" value={agreement.scopeDesignPackage} />
                <ExhibitRow label="Target Installation Window" value={agreement.targetInstallationWindow} />
                <ExhibitRow label="Target Takedown Window" value={agreement.targetTakedownWindow} />
                <ExhibitRow label="Annual Subscription Fee (Season 1)" value={currency(agreement.annualSubscriptionFee)} />
                <ExhibitRow label="Booking Deposit (50%) — due at checkout" value={currency(agreement.bookingDeposit)} />
                <ExhibitRow label="Installation Payment (50%) — due upon installation" value={currency(agreement.installationPayment)} />
                <ExhibitRow label="Payment Method on File" value={agreement.paymentMethodOnFile} />
                <ExhibitRow label="Promotional Photo Consent (§13.5)" value={agreement.promotionalPhotoConsent ? "Yes" : "No"} />
              </div>
            </section>

            <section className="space-y-3">
              <div className="text-center">
                <p className="text-lg font-bold text-slate-950">Exhibit B</p>
                <p className="font-semibold uppercase tracking-wide text-slate-700">Materials List</p>
              </div>
              <p className="text-sm italic leading-6 text-slate-600">
                Company will maintain and update this list for the Property. The Cancellation Fee
                under Section 6.2 equals the total MSRP below, plus applicable tax, as of the
                Cancellation Date. Updated lists are available to Customer on request.
              </p>
              <div className="overflow-x-auto rounded-md border border-slate-300">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Item Description</th>
                      <th className="px-3 py-2">Manufacturer / Model</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">MSRP (each)</th>
                      <th className="px-3 py-2 text-right">MSRP (total)</th>
                      <th className="px-3 py-2">Date Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agreement.materials.map((material) => (
                      <tr key={material.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-medium text-slate-900">{material.itemDescription}</td>
                        <td className="px-3 py-2 text-slate-600">{material.manufacturerModel || "—"}</td>
                        <td className="px-3 py-2 text-right">{material.quantity}</td>
                        <td className="px-3 py-2 text-right">{currency(material.unitMsrp)}</td>
                        <td className="px-3 py-2 text-right">{currency(material.totalMsrp)}</td>
                        <td className="px-3 py-2 text-slate-600">{material.dateAdded}</td>
                      </tr>
                    ))}
                    {!agreement.materials.length ? (
                      <tr className="border-t border-slate-200">
                        <td colSpan={6} className="px-3 py-5 text-center text-slate-500">No Materials have been added to this option.</td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-400 bg-slate-100 font-bold text-slate-950">
                    <tr>
                      <td colSpan={4} className="px-3 py-2">Total (Cancellation Fee basis, before tax)</td>
                      <td className="px-3 py-2 text-right">{currency(agreement.cancellationFee)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <p className="rounded-md bg-slate-100 p-4 text-sm leading-6 text-slate-700">
              <strong>Electronic acceptance:</strong> Customer accepts this Agreement by signing the
              estimate. The signature, selected option, agreement version, Exhibit A, and Exhibit B
              are stored with the estimate.
            </p>
          </article>
        </div>

        <footer className="border-t bg-slate-50 px-5 py-3 text-right sm:px-7">
          <Button type="button" onClick={onClose}>Return to estimate</Button>
        </footer>
      </div>
    </div>
  );
}

