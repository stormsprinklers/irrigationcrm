import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));

function section(id, title, intro, cases) {
  const rows = cases
    .map(
      (c, i) => `
    <tr>
      <td class="id">${id}-${String(i + 1).padStart(2, "0")}</td>
      <td class="area">${c.area ?? ""}</td>
      <td class="case">${c.case}</td>
      <td class="steps">${c.steps}</td>
      <td class="expected">${c.expected}</td>
      <td class="status">☐</td>
      <td class="notes"></td>
    </tr>`
    )
    .join("");

  return `
<section class="module" id="${id}">
  <h2>${title}</h2>
  ${intro ? `<p class="intro">${intro}</p>` : ""}
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Area</th>
        <th>Test case</th>
        <th>Steps</th>
        <th>Expected result</th>
        <th>Pass</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

const t = (caseName, steps, expected, area) => ({ case: caseName, steps, expected, area });

const sections = [
  section(
    "auth",
    "1. Authentication, Roles & Global Navigation",
    "Verify login, role-based access, top navigation, and global shortcuts before testing feature modules. Test with at least one account per role: Admin, Manager, CSR, Tech, Installer, Sales.",
    [
      t(
        "Staff login with valid credentials",
        "Go to /login. Enter active employee email and password. Submit.",
        "Redirect to /home. Session shows correct name and role. Top nav visible.",
        "Auth"
      ),
      t(
        "Staff login rejects invalid credentials",
        "Enter wrong password for a valid user. Submit.",
        "Error shown. No session created.",
        "Auth"
      ),
      t(
        "Archived employee cannot log in",
        "Archive an employee in Settings → Employees. Attempt login as that user.",
        "Login fails. User cannot access CRM.",
        "Auth"
      ),
      t(
        "Primary navigation links work",
        "Click each top nav item: Home, Customers, Inbox, Schedule, Timesheets, Price Book, Maintenance Plans, Marketing, Reporting, Settings.",
        "Each module loads without error. Active state highlights correctly.",
        "Navigation"
      ),
      t(
        "Mobile navigation menu",
        "Resize to mobile width. Open hamburger menu. Navigate to 3 modules.",
        "Menu opens/closes. Links work. Overlay dismisses on selection.",
        "Navigation"
      ),
      t(
        "New menu — create customer",
        "Click + New → New customer. Fill name, phone, email. Save.",
        "Customer created. Redirect or confirmation. Customer appears in list.",
        "New menu"
      ),
      t(
        "New menu — create visit",
        "Click + New → New visit. Fill title, division, date/time, technician, service area. Save.",
        "Visit created on schedule. Opens visit detail or shows on board.",
        "New menu"
      ),
      t(
        "New menu — create estimate",
        "Click + New → New estimate. Select customer. Save.",
        "Estimate created in DRAFT. Opens estimate builder.",
        "New menu"
      ),
      t(
        "New visit blocks Do Not Service customer",
        "Flag a customer Do Not Service. Try to create visit for them via New menu.",
        "Booking blocked with clear error. No visit created.",
        "New menu"
      ),
      t(
        "Notification bell",
        "Trigger a test notification (e.g. website lead). Open notification bell.",
        "Unread badge increments. Item appears. Click marks read and navigates if linked.",
        "Notifications"
      ),
      t(
        "Phone dialer opens from top nav",
        "Click phone icon in top nav.",
        "Voice dialer dialog opens. Softphone status shown (ready/connecting/error).",
        "Voice"
      ),
      t(
        "Field role cannot access office-only settings writes",
        "Log in as TECH. Open Settings → Company. Attempt to save changes (or verify API 403).",
        "View may work; save blocked for unauthorized roles.",
        "Roles"
      ),
    ]
  ),

  section(
    "home",
    "2. Home Dashboard",
    "The home page is the daily starting point for office and field staff.",
    [
      t(
        "Home summary cards load",
        "Open /home as Admin.",
        "Greeting shows first name. Estimates, Jobs, Invoices, Maintenance cards show counts and link correctly.",
        "Home"
      ),
      t(
        "Clock in",
        "Click Clock In on home page.",
        "Status shows clocked in with live timer. POST /api/time-clock succeeds.",
        "Time clock"
      ),
      t(
        "Clock out",
        "While clocked in, click Clock Out.",
        "Timer stops. Today's hours displayed. Entry appears on /timesheets.",
        "Time clock"
      ),
      t(
        "Double clock-in prevented",
        "Clock in twice without clocking out.",
        "Second attempt shows error or is disabled.",
        "Time clock"
      ),
      t(
        "KPI strip date range",
        "Change KPI strip range: YTD, MTD, Last 30 days.",
        "Metrics update. Link to /reporting works.",
        "Home"
      ),
    ]
  ),

  section(
    "customers",
    "3. Customers Module",
    "Covers customer list, profile, properties, irrigation, Rachio, leads, jobs, estimates, and invoices sub-pages.",
    [
      t(
        "Customer list search and filters",
        "Go to /customers. Search by name. Filter by city, ZIP, lead source. Toggle Active/Archived.",
        "Results filter correctly. Count updates. Clear filters resets view.",
        "List"
      ),
      t(
        "Create customer from list",
        "Click Create customer. Enter name, phone, email. Submit.",
        "Customer created. Redirect to profile. Appears in active list.",
        "List"
      ),
      t(
        "Bulk archive customers",
        "Select 2+ customers. Bulk action → Archive. Confirm.",
        "Customers move to Archived tab. Restore works from Archived tab.",
        "List"
      ),
      t(
        "Bulk merge customers",
        "Select 2 customers as Admin/Manager. Merge into target.",
        "Records merged. Secondary customer data consolidated.",
        "List"
      ),
      t(
        "Bulk Do Not Service flag",
        "Select customer. Mark Do Not Service.",
        "Badge appears on customer. Scheduling blocked elsewhere.",
        "List"
      ),
      t(
        "Customer profile — edit contact",
        "Open customer. Edit name, address (autocomplete), phone, email, lead source. Save.",
        "Changes persist. Map embed updates if address changed.",
        "Profile"
      ),
      t(
        "Alternate phone numbers",
        "In edit mode, add alternate phone with note. Save. Delete one.",
        "Phones listed with call/SMS actions. CRUD works.",
        "Profile"
      ),
      t(
        "Customer tags",
        "Add tag. Remove tag. Save as Admin/Manager.",
        "Tags display on profile. Persist after reload.",
        "Profile"
      ),
      t(
        "Send portal link",
        "Click Send portal link for customer with email (portal enabled).",
        "Email sent or success toast. Customer can use magic link.",
        "Profile"
      ),
      t(
        "Customer notes and attachments",
        "Add text note. Upload JPEG and PDF attachment. Delete attachment.",
        "Note shows author/timestamp. Files upload, preview, and delete.",
        "Profile"
      ),
      t(
        "Payment methods on file",
        "As CSR/Manager, add card via Stripe Elements. Copy secure link. Email secure link.",
        "Card saved in Stripe. Links work for customer self-service.",
        "Payments"
      ),
      t(
        "Add property",
        "Properties tab → Add property with name and address (autocomplete).",
        "Property appears. Lat/lng captured. Map shows location.",
        "Properties"
      ),
      t(
        "Delete property",
        "Delete a property with no critical dependencies.",
        "Property removed from list.",
        "Properties"
      ),
      t(
        "Irrigation wizard — full publish",
        "Run 6-step wizard: aerial capture, system overview, zone map, conditions, irrigation, review. Publish.",
        "Draft saves at each step. Publish sets status Published. Portal shows guide.",
        "Irrigation"
      ),
      t(
        "Irrigation wizard — import from design",
        "On a property linked to design project, import from design in wizard.",
        "Zone data seeds correctly into wizard.",
        "Irrigation"
      ),
      t(
        "Legacy irrigation editor",
        "Set diagram URL and per-station run minutes. Save irrigation guide.",
        "Data persists. Displays alongside wizard map if both exist.",
        "Irrigation"
      ),
      t(
        "Rachio link and zone run",
        "Link Rachio device to property. View zones. Run zone for 5 minutes. Stop all.",
        "Device shows online. Zone run starts. Stop all works.",
        "Rachio"
      ),
      t(
        "Create visit from customer",
        "Visits tab → Add visit. Fill required fields. Save.",
        "Visit created. Redirect to visit detail. Appears on schedule.",
        "Visits"
      ),
      t(
        "Create estimate from customer",
        "Estimates tab → Create estimate.",
        "DRAFT estimate created. Opens builder.",
        "Estimates"
      ),
      t(
        "Enroll in maintenance plan",
        "Maintenance tab → Enroll in plan. Select template, property, billing frequency.",
        "DRAFT enrollment created. Appears in enrollment list.",
        "Maintenance"
      ),
      t(
        "Referral enrollment",
        "Enroll customer in referral program. Copy share link.",
        "Member created. Share URL works for public referral form.",
        "Referrals"
      ),
      t(
        "Jobs list",
        "Go to /customers/jobs. Search. Click a job.",
        "Jobs listed with status, date, total. Links to visit detail.",
        "Jobs"
      ),
      t(
        "Leads list and convert",
        "Go to /customers/leads. Create lead. Convert to customer.",
        "Lead appears. Convert creates customer. Status WON. View customer link works.",
        "Leads"
      ),
      t(
        "Invoices list actions",
        "Go to /customers/invoices. Send, Remind, Copy pay link, Refund (Admin).",
        "Each action succeeds or shows appropriate error. Pay link opens /pay/{token}.",
        "Invoices"
      ),
      t(
        "Website leads inbox",
        "Submit website form. Open /inbox/leads.",
        "Submission appears within 15s. Detail shows form content. Delete works for email leads.",
        "Leads inbox"
      ),
    ]
  ),

  section(
    "schedule",
    "4. Schedule & Team Management",
    "Covers schedule board, quick-add, needs-scheduling queue, and team schedules/time-off.",
    [
      t(
        "Schedule week view",
        "Open /schedule. View week. Navigate prev/next/today.",
        "Jobs display in correct time slots. Colors apply per color mode.",
        "Board"
      ),
      t(
        "Schedule day and month views",
        "Switch to Day view, then Month view. Click a day in month view.",
        "Day shows per-employee columns. Month shows counts. Click switches to day.",
        "Board"
      ),
      t(
        "Filter by service area and employee",
        "Toggle areas and hide/show employees in sidebar.",
        "Grid filters correctly. Unassigned column toggles.",
        "Filters"
      ),
      t(
        "Quick-add visit from slot",
        "Click empty time slot. Fill customer, technician, division. Save.",
        "Visit appears on board at correct time. Default 3-hour window applied.",
        "Quick-add"
      ),
      t(
        "Schedule revenue summary",
        "View week with completed/scheduled jobs.",
        "Daily/weekly revenue and hours metrics display.",
        "Metrics"
      ),
      t(
        "Needs scheduling queue",
        "Approve design estimate with deposit. Open /schedule/needs-scheduling.",
        "Estimate appears in queue with customer, total, duration. Links work.",
        "Needs scheduling"
      ),
      t(
        "Team schedule — set work days",
        "Team schedules → select employee. Set Mon–Fri 8am–5pm working. Save.",
        "Schedule persists. Non-working days block assignment server-side.",
        "Team"
      ),
      t(
        "Request time off (Tech)",
        "Log in as Tech. Submit PTO request for future dates.",
        "Request shows as PENDING. Appears in manager pending queue.",
        "Time off"
      ),
      t(
        "Approve time off (Manager)",
        "As Manager, approve pending time off request.",
        "Status APPROVED. Employee unavailable on those dates for scheduling.",
        "Time off"
      ),
      t(
        "Assignment blocked on approved time off",
        "Try scheduling visit for employee on approved time-off date.",
        "Server returns error. Assignment blocked.",
        "Time off"
      ),
      t(
        "Double-booking prevention",
        "Assign overlapping visits to same technician.",
        "Second assignment blocked with conflict error.",
        "Validation"
      ),
    ]
  ),

  section(
    "visits",
    "5. Visit Detail & Field Workflow",
    "Complete visit lifecycle from scheduled through payment.",
    [
      t(
        "Edit visit schedule",
        "As Manager, change date, time, assigned technician. Save.",
        "Schedule updates. Customer notification sent if configured.",
        "Schedule"
      ),
      t(
        "Tech cannot edit schedule",
        "Log in as Tech on assigned visit. Verify schedule fields read-only.",
        "No edit controls for date/technician.",
        "Roles"
      ),
      t(
        "On my way with ETA",
        "Start On my way. Allow geolocation. Verify ETA banner.",
        "Status EN_ROUTE. ETA shown. Customer SMS sent if configured.",
        "Time tracking"
      ),
      t(
        "Start, pause, resume work",
        "Start my time → Pause → Resume.",
        "Status transitions IN_PROGRESS/PAUSED. Timer runs correctly.",
        "Time tracking"
      ),
      t(
        "Finish visit — required checklists",
        "Leave required checklist incomplete. Try Finish visit.",
        "Blocked with message listing incomplete checklists.",
        "Checklists"
      ),
      t(
        "Complete all checklist item types",
        "Fill Pass/Flag/Fail, Number, Note, Photo, Multi-select, Select one, Checkbox items. Mark complete.",
        "Each type saves. Checklist marked COMPLETED.",
        "Checklists"
      ),
      t(
        "Callback flag",
        "Toggle Callback job checkbox. Verify callback-specific checklists excluded.",
        "Flag persists. Matching rules respect excludeCallbacks.",
        "Callback"
      ),
      t(
        "Add line items from price book",
        "Add service and material from ItemPicker. Adjust quantity.",
        "Line items appear. Totals recalculate. Subtotal/discount/total correct.",
        "Line items"
      ),
      t(
        "Add visit discount",
        "Add FIXED and PERCENT discounts.",
        "Totals update correctly. PERCENT applies to subtotal.",
        "Discounts"
      ),
      t(
        "Visit notes and attachments",
        "Add note. Upload photo and PDF.",
        "Note shows author/time. Attachments viewable and deletable.",
        "Notes"
      ),
      t(
        "Parts run",
        "Open Parts run. View nearest suppliers. Navigate (pauses timer if in progress).",
        "Suppliers listed. Google Maps opens. Timer pauses if applicable.",
        "Parts run"
      ),
      t(
        "Collect payment via Stripe",
        "Click Collect payment on visit with balance > 0.",
        "Stripe Checkout opens. On success, visit shows Paid. Invoice synced.",
        "Payments"
      ),
      t(
        "Profit section (Admin only)",
        "View visit as Admin. Verify profit section visible.",
        "Margin data loads. Hidden for Tech role.",
        "Profit"
      ),
      t(
        "Delete visit",
        "As Admin, delete visit with confirmation.",
        "Visit removed. No longer on schedule.",
        "Delete"
      ),
      t(
        "Install plan section",
        "On install visit with design, set install days. Save.",
        "Install days persist. Design zone viewer loads.",
        "Install"
      ),
      t(
        "Link maintenance plan visit",
        "On visit with enrolled customer, assign plan visit from dropdown.",
        "Plan visit linked. Plan discounts applied to line items.",
        "Maintenance"
      ),
      t(
        "Irrigation map editor on visit",
        "Edit map: place markers, draw zones, set zone attributes. Save draft.",
        "Map saves. Status shows Draft. Published map visible in portal.",
        "Irrigation"
      ),
    ]
  ),

  section(
    "inbox",
    "6. Inbox — Voice, SMS, Email, Social, Leads",
    "Test all communication channels and CSR workflows.",
    [
      t(
        "CSR Desk — live queue",
        "Place inbound test call. View CSR Desk queue.",
        "Caller appears in queue with lookup info (name, city, last visit).",
        "CSR Desk"
      ),
      t(
        "Accept queued call",
        "On Voice → Customers, click Accept on queue entry.",
        "Call connects to softphone. Active call bar appears.",
        "Voice"
      ),
      t(
        "Outbound dial — manual number",
        "Open dialer. Enter phone. Place call.",
        "Call connects. History logs outbound entry.",
        "Voice"
      ),
      t(
        "Outbound dial — customer search",
        "Dialer → Find customer. Search and select. Call.",
        "Customer phone populated. Call placed.",
        "Voice"
      ),
      t(
        "Book appointment during call",
        "During active call with known customer, Book appointment. Fill fields. Save.",
        "Visit created. Banner confirms. Disposition links on wrap-up.",
        "CSR Desk"
      ),
      t(
        "Call wrap-up disposition",
        "End call. Select disposition (Booked / Not booked / Non-opportunity). Add note. Save.",
        "Disposition saved. Appears in call history.",
        "Voice"
      ),
      t(
        "Warm transfer",
        "During call, Transfer → Warm → select available agent. Complete transfer.",
        "Consult connects. Complete transfer assigns new handler.",
        "Voice"
      ),
      t(
        "Cold transfer",
        "Transfer → Cold → select agent.",
        "Customer redirected. CSR disconnected.",
        "Voice"
      ),
      t(
        "Hold and mute",
        "During call, toggle Mute and Hold.",
        "Mute silences mic. Hold plays hold music to customer.",
        "Voice"
      ),
      t(
        "Call recording playback",
        "Complete a recorded call. Open call detail. Play recording.",
        "Recording plays. Transcript shown if enabled.",
        "Voice"
      ),
      t(
        "SMS — send to customer",
        "SMS → Customers. Select thread or compose. Send text message.",
        "Message delivered. Appears in thread. Customer receives SMS.",
        "SMS"
      ),
      t(
        "SMS — send MMS attachment",
        "Attach image to SMS. Send.",
        "MMS delivered. Media displays in thread.",
        "SMS"
      ),
      t(
        "SMS — block contact",
        "Block a customer contact. Attempt to send SMS.",
        "Send blocked with 403. Blocklist enforced.",
        "SMS"
      ),
      t(
        "SMS — contact info detection",
        "Receive inbound SMS with name/email. Apply contact info dialog.",
        "Fields parsed. Customer created/updated. Conversation linked.",
        "SMS"
      ),
      t(
        "SMS — team internal",
        "SMS → Team. Message another employee.",
        "Internal thread created. Message delivered.",
        "SMS"
      ),
      t(
        "Email compose and send",
        "Go to /inbox/compose. Add recipient, subject, body, attachment. Send.",
        "Email sent. Appears in sent folder (API).",
        "Email"
      ),
      t(
        "Facebook DM reply",
        "Open Facebook DMs thread. Reply with text.",
        "Message sent via Meta API. Appears in thread.",
        "Social"
      ),
      t(
        "Instagram DM reply",
        "Open Instagram DMs thread. Reply.",
        "Message sent. Within 24-hour window enforced.",
        "Social"
      ),
      t(
        "Team voice directory",
        "Voice → Team. Click-to-call team member.",
        "Internal call placed via softphone.",
        "Voice"
      ),
    ]
  ),

  section(
    "voice-settings",
    "7. Voice Settings",
    "Configure phone system before go-live.",
    [
      t(
        "Add phone number manually",
        "Settings → Voice → Numbers. Add E.164 number with friendly name.",
        "Number appears in list.",
        "Numbers"
      ),
      t(
        "Import numbers from Twilio",
        "Click Import from Twilio.",
        "Twilio numbers sync to list.",
        "Numbers"
      ),
      t(
        "Buy Twilio number",
        "Search by area code. Purchase number.",
        "Number purchased and added to account.",
        "Numbers"
      ),
      t(
        "Set primary number",
        "Mark a number as primary.",
        "Primary badge shown. Used as default caller ID.",
        "Numbers"
      ),
      t(
        "Create call flow with IVR",
        "Settings → Voice → Flows. Create flow with IVR node (digits → branches).",
        "Flow saves. Inbound calls route per digit selection.",
        "Flows"
      ),
      t(
        "Create agent group",
        "Settings → Voice → Groups. Create group with ring strategy and members.",
        "Group saves. DIAL_GROUP node rings members per strategy.",
        "Groups"
      ),
      t(
        "Upload audio clip",
        "Settings → Voice → Clips. Upload MP3/WAV.",
        "Clip available for IVR prompts.",
        "Clips"
      ),
      t(
        "Business hours",
        "Settings → Voice → Hours. Set Mon–Fri open, Sat–Sun closed. Save.",
        "After-hours routing uses afterHoursNodeId on inbound calls.",
        "Hours"
      ),
      t(
        "Record and transcribe toggles",
        "Settings → Voice. Toggle Record calls and Transcribe calls.",
        "New calls record/transcribe per settings.",
        "Overview"
      ),
      t(
        "Register Twilio webhooks",
        "Settings → Inbox → Register Twilio webhooks.",
        "Webhooks registered. SMS and voice inbound work.",
        "Inbox settings"
      ),
    ]
  ),

  section(
    "pricebook",
    "8. Price Book",
    "Catalog management for services, materials, pricing forms, templates, and discounts.",
    [
      t(
        "Create service category and item",
        "Price Book → Create category. Add service with name, price, description.",
        "Category and item appear. Searchable from ItemPicker.",
        "Services"
      ),
      t(
        "Flat-rate calculated service",
        "Enable flat rate in settings. Create service with labor rate + hours + bundled materials.",
        "Price auto-calculates. Breakdown shown. Manual override option works.",
        "Services"
      ),
      t(
        "Material with markup tiers",
        "Enable material markups. Create material with cost. Enable markup on item.",
        "Sell price = cost × (1 + tier %). Tier matched by cost range.",
        "Materials"
      ),
      t(
        "CSV import services",
        "Export CSV. Modify. Re-import with update existing toggle.",
        "Items created/updated. Toast shows counts.",
        "Import"
      ),
      t(
        "Labor rates CRUD",
        "Settings → Price Book → Labor rates. Create rate. Set as default.",
        "Rate saves. Calculated services recalculate on default change.",
        "Labor rates"
      ),
      t(
        "Material markup tiers",
        "Edit tier rows. Save.",
        "Materials with markupEnabled recalculate.",
        "Markups"
      ),
      t(
        "Bulk price adjust",
        "Bulk adjust +10% on all services. Preview then Apply.",
        "Prices update. Calculated services recalculate.",
        "Bulk adjust"
      ),
      t(
        "AI description generation",
        "On service item, click Generate description (requires OpenAI key).",
        "Description populated by AI.",
        "AI"
      ),
      t(
        "Create pricing form",
        "Pricing forms → Create form by name.",
        "Form created with default fields.",
        "Pricing forms"
      ),
      t(
        "Create estimate template",
        "Estimate Templates → Create with name and line item.",
        "Template appears in list.",
        "Templates"
      ),
      t(
        "Create catalog discount",
        "Discounts → Create PERCENT and FIXED discounts. Toggle active.",
        "Discounts listed with status.",
        "Discounts"
      ),
    ]
  ),

  section(
    "estimates",
    "9. Estimates",
    "Estimate builder, send, approve, convert, and portal flow.",
    [
      t(
        "Build estimate with line items",
        "Open estimate. Add items from price book. Add discount. Verify totals.",
        "Subtotal, discount, total correct. No tax line.",
        "Builder"
      ),
      t(
        "Add estimate note and attachment",
        "Add text note. Upload image attachment.",
        "Note and attachment appear.",
        "Builder"
      ),
      t(
        "Send estimate to customer",
        "Click Send. Verify customer has email or phone.",
        "Status SENT. Notification sent. Expiry date set.",
        "Send"
      ),
      t(
        "Staff signature approval",
        "Draw signature on canvas. Save.",
        "Status APPROVED. signedAt recorded.",
        "Signature"
      ),
      t(
        "Copy estimate to visit",
        "With linked visit, Copy to visit. Select this visit or new visit.",
        "Line items and discounts copied. Status CONVERTED.",
        "Convert"
      ),
      t(
        "Portal estimate approval",
        "Open /portal/{slug}/estimates/{token} as customer. Sign and approve.",
        "Status APPROVED. Deposit checkout if required.",
        "Portal"
      ),
      t(
        "Portal premium tier selection",
        "On design estimate with premium option, select Premium tier. Approve.",
        "Total updates to premiumOptionTotal.",
        "Portal"
      ),
      t(
        "Deposit payment flow",
        "Approve estimate requiring deposit. Complete Stripe checkout.",
        "Deposit paid. Install visit auto-created if configured.",
        "Payments"
      ),
      t(
        "Estimate expiry",
        "Send estimate. Wait past expiry or backdate expiresAt. Reload.",
        "Status auto-flips to EXPIRED.",
        "Expiry"
      ),
      t(
        "Delete estimate",
        "As Admin/Manager, delete DRAFT estimate.",
        "Estimate removed.",
        "Delete"
      ),
      t(
        "Design estimate — needs scheduling",
        "Approve design estimate with deposit. Check needs-scheduling queue.",
        "Estimate appears. Install visit created.",
        "Design"
      ),
    ]
  ),

  section(
    "checklists",
    "10. Checklists",
    "Template configuration and visit execution.",
    [
      t(
        "Create checklist template",
        "Settings → Checklists → New. Name, divisions, items of each type. Save.",
        "Template appears in list with rule summary.",
        "Templates"
      ),
      t(
        "Apply to all jobs rule",
        "Create template with Apply to all jobs. Schedule new visit.",
        "Checklist auto-assigned on visit create.",
        "Matching"
      ),
      t(
        "Division-specific rule",
        "Create SERVICE-only template. Schedule SERVICE and INSTALL visits.",
        "Checklist only on SERVICE visit.",
        "Matching"
      ),
      t(
        "Price book trigger rule",
        "Link template to specific service item. Add that item to visit.",
        "Checklist auto-syncs when line item added.",
        "Matching"
      ),
      t(
        "Exclude callbacks",
        "Create template excluding callbacks. Flag visit as callback.",
        "Template not applied to callback visit.",
        "Matching"
      ),
      t(
        "Mandatory for completion",
        "Mark template mandatory. Try completing visit without finishing checklist.",
        "Visit completion blocked.",
        "Completion"
      ),
      t(
        "Customer portal visibility",
        "Complete checklist with portal visibility enabled.",
        "Completed checklist visible in portal for that visit.",
        "Portal"
      ),
      t(
        "Duplicate template",
        "Duplicate existing template.",
        "Copy created as inactive with (copy) suffix.",
        "Templates"
      ),
    ]
  ),

  section(
    "maintenance",
    "11. Maintenance Plans",
    "Plan templates, enrollment, billing, and scheduling.",
    [
      t(
        "Create plan template (full wizard)",
        "Maintenance Plans → New template. Complete all wizard steps. Save.",
        "Template active with visits, pricing, discounts, add-ons.",
        "Templates"
      ),
      t(
        "Enroll customer in plan",
        "Enroll via customer profile or visit. Select property, template, billing frequency.",
        "DRAFT enrollment created.",
        "Enrollment"
      ),
      t(
        "Accept and activate enrollment",
        "Open enrollment. Click Accept & activate.",
        "Status ACTIVE. Plan visits generated. Stripe subscription if configured.",
        "Activation"
      ),
      t(
        "Schedule unscheduled plan visit",
        "Dashboard → Unscheduled visits. Schedule with technician.",
        "Visit created at due month. Linked to plan visit.",
        "Scheduling"
      ),
      t(
        "Cancel enrollment",
        "Cancel active enrollment with reason.",
        "Status CANCELLED. Stripe sub cancelled. Unscheduled visits skipped.",
        "Cancel"
      ),
      t(
        "Billing charge via API",
        "POST /api/maintenance-plans/billing/{id}/charge for due period.",
        "Stripe charge succeeds or stub-paid if no key.",
        "Billing"
      ),
      t(
        "Dashboard metrics",
        "View maintenance dashboard cards.",
        "Enrollments, revenue, due billing, unscheduled counts load.",
        "Dashboard"
      ),
      t(
        "Rachio smart irrigation panel",
        "View Smart irrigation card. Link Rachio in settings if needed.",
        "Connection status shown. Links to settings.",
        "Rachio"
      ),
    ]
  ),

  section(
    "timesheets",
    "12. Timesheets & Compensation",
    "Shift tracking and pay preview.",
    [
      t(
        "Timesheets list — own entries",
        "Log in as Tech. Open /timesheets. View own clock entries.",
        "Entries show date, in/out, duration.",
        "Timesheets"
      ),
      t(
        "Timesheets — manager view all",
        "Log in as Manager. Filter by employee and date range.",
        "All employee entries visible.",
        "Timesheets"
      ),
      t(
        "Pay period preview",
        "As Manager, view pay preview section.",
        "Per-employee: hours, OT, commission, projected payout.",
        "Compensation"
      ),
      t(
        "Compensation settings",
        "Settings → Compensation. Set pay type defaults, OT threshold, commission basis. Save.",
        "Settings persist. Affects pay preview calculations.",
        "Settings"
      ),
    ]
  ),

  section(
    "marketing",
    "13. Marketing",
    "Campaigns, social, SEO, ads, GBP, and referrals.",
    [
      t(
        "Email blast campaign",
        "Marketing → Campaigns → New. Setup → Audience (city filter) → Email content → Send now.",
        "Campaign sends. Recipients table shows delivered/opened.",
        "Campaigns"
      ),
      t(
        "SMS blast campaign",
        "Create SMS blast with message body. Send.",
        "SMS delivered. STOP opt-out appended.",
        "Campaigns"
      ),
      t(
        "Drip campaign activation",
        "Create DRIP with 3 steps. Activate.",
        "Enrollment count shown. Steps process on schedule.",
        "Campaigns"
      ),
      t(
        "AI email generation",
        "In email editor, enter prompt. Generate email.",
        "HTML content generated. Editable in GrapesJS.",
        "Campaigns"
      ),
      t(
        "Social post — submit for review",
        "Social → Review queue. Compose post with caption and image. Submit for review.",
        "Status PENDING_REVIEW. Appears in reviewer queue.",
        "Social"
      ),
      t(
        "Social post — approve and publish",
        "As Admin/Manager, approve submission. Publish now.",
        "Status PUBLISHED. Post appears on Meta.",
        "Social"
      ),
      t(
        "Social post — schedule",
        "As Admin, schedule approved post for future datetime.",
        "Status SCHEDULED. Auto-publishes at scheduled time.",
        "Social"
      ),
      t(
        "Social dashboard sync",
        "Click Refresh on social dashboard.",
        "Follower counts and recent posts update from Meta.",
        "Social"
      ),
      t(
        "SEO — organic ranking map",
        "Marketing → SEO. Select keyword. Refresh rankings.",
        "Map shows positions by city. SerpAPI quota respected.",
        "SEO"
      ),
      t(
        "SEO — AI recommendations",
        "Click Get recommendations.",
        "3 tasks generated. Toggle complete. Delete task.",
        "SEO"
      ),
      t(
        "Website analytics dashboard",
        "Select 7/28/30/90 day range. Refresh.",
        "Page views, sessions, form submits, bookings metrics load.",
        "SEO"
      ),
      t(
        "Search Console connect",
        "Connect Google Search Console OAuth. Select property.",
        "Metrics: clicks, impressions, CTR, top queries load.",
        "SEO"
      ),
      t(
        "Google Ads dashboard",
        "Marketing → Ads. Select date range. Refresh.",
        "PPC campaigns show spend, impressions, clicks, conversions.",
        "Ads"
      ),
      t(
        "Meta Ads dashboard",
        "View Meta ads tab with connected account.",
        "Campaign metrics load.",
        "Ads"
      ),
      t(
        "GBP reviews summary",
        "Marketing → Google Business. View review summary. Refresh.",
        "Star breakdown, average rating, new last 7 days shown.",
        "GBP"
      ),
      t(
        "GBP reply to review",
        "Reviews tab → Generate AI reply → Edit → Post reply.",
        "Reply posted to Google. Review removed from unreplied list.",
        "GBP"
      ),
      t(
        "GBP create post",
        "Posts tab → Generate post → Attach job photo → Publish.",
        "Post published to Google Business Profile.",
        "GBP"
      ),
      t(
        "GBP upload photos",
        "Photos tab → Select job photos → Upload to profile.",
        "Photos appear on GBP.",
        "GBP"
      ),
      t(
        "Send GBP reviews to Slack",
        "Click Send to Slack (Slack + channel configured).",
        "Review cards posted to Slack channel.",
        "Slack"
      ),
      t(
        "Referral program settings",
        "Marketing → Referrals. Enable program. Set install/service rewards. Save.",
        "Settings persist. Metrics grid loads.",
        "Referrals"
      ),
      t(
        "Referral pipeline and payout",
        "Submit referral via public form. Convert to customer. Verify reward queue.",
        "Pipeline shows submission. Reward queued. Retry works on FAILED.",
        "Referrals"
      ),
      t(
        "Stripe Connect for referrals",
        "Click Verify Stripe Connect.",
        "Connect onboarding completes. Payouts enabled.",
        "Referrals"
      ),
    ]
  ),

  section(
    "reporting",
    "14. Reporting",
    "All dashboards and reports with correct data.",
    [
      t(
        "KPI Dashboard — company overview",
        "Open /reporting. Select YTD range. Verify 8 company metrics.",
        "Service/install revenue, total, avg tickets, booking rate, conversion, active plans shown.",
        "KPI"
      ),
      t(
        "KPI Dashboard — technician cards",
        "Verify solo tech cards: revenue, rev/hour, avg ticket, conversion, 5-star, callback rate.",
        "Metrics match known test data for date range.",
        "KPI"
      ),
      t(
        "KPI Dashboard — CSR cards",
        "Verify CSR booking rate, avg duration, booked revenue, plans sold.",
        "Metrics calculated from call logs.",
        "KPI"
      ),
      t(
        "KPI Dashboard — crew cards",
        "Verify install crew cards include callback rate.",
        "Install crews show callback rate. Service crews do not.",
        "KPI"
      ),
      t(
        "KPI Dashboard — salespeople",
        "Assign Sales role. Verify conversion, avg ticket, revenue sold.",
        "Sales cards appear with correct metrics.",
        "KPI"
      ),
      t(
        "Business insights",
        "Open /reporting/insights.",
        "8 KPI cards: revenue MTD/YTD, pipeline, completion rate, etc.",
        "Insights"
      ),
      t(
        "Tech performance report",
        "Open /reporting/tech-performance.",
        "Per-tech table: visits, revenue, avg job size, hours.",
        "Tech"
      ),
      t(
        "Financial report",
        "Open /reporting/financial.",
        "Monthly invoiced vs collected for 12 months.",
        "Financial"
      ),
      t(
        "CSR report",
        "Open /reporting/csr.",
        "Call volume, book rate, disposition breakdown, per-agent table.",
        "CSR"
      ),
      t(
        "Estimates report",
        "Open /reporting/estimates.",
        "Conversion rate and status breakdown.",
        "Estimates"
      ),
      t(
        "Leads report",
        "Open /reporting/leads.",
        "Total leads, by status, by source.",
        "Leads"
      ),
      t(
        "Marketing report",
        "Open /reporting/marketing?days=30.",
        "Website event counts by type and top pages.",
        "Marketing"
      ),
      t(
        "Voice report",
        "Open /reporting/voice.",
        "Total calls, missed, avg duration (30 days).",
        "Voice"
      ),
      t(
        "Service plans report",
        "Open /reporting/service-plans.",
        "Enrollments, revenue, churn, due billing.",
        "Plans"
      ),
      t(
        "Invoices AR aging",
        "Open /reporting/invoices.",
        "Aging buckets 0-30, 31-60, 61-90, 90+ with counts and balances.",
        "Invoices"
      ),
      t(
        "Payments report",
        "Open /reporting/payments.",
        "Refund count and breakdown by payment method.",
        "Payments"
      ),
      t(
        "Date range control on KPI",
        "Switch presets and custom range on KPI dashboard.",
        "All sections refresh with new range data.",
        "KPI"
      ),
    ]
  ),

  section(
    "portal",
    "15. Customer Portal",
    "Public self-service portal for customers.",
    [
      t(
        "Portal magic link login",
        "Send portal link. Click link in email.",
        "Customer logged in. Dashboard shows welcome and property.",
        "Auth"
      ),
      t(
        "Portal — view visits",
        "Navigate to Visits. View upcoming and past.",
        "Visits listed with status, date, technician.",
        "Visits"
      ),
      t(
        "Portal — schedule visit",
        "Click Schedule a visit. Select property, reason, slot. Submit.",
        "Visit created. Confirmation shown.",
        "Scheduling"
      ),
      t(
        "Portal — reschedule visit",
        "On scheduled visit, pick new slot. Reschedule.",
        "Visit updated. Lead-time policy enforced.",
        "Reschedule"
      ),
      t(
        "Portal — cancel visit",
        "Cancel scheduled visit. Confirm.",
        "Status CANCELLED. Lead-time policy enforced.",
        "Cancel"
      ),
      t(
        "Portal — view and pay invoice",
        "Open Invoices. Click Pay on open invoice.",
        "Stripe Checkout opens. Payment succeeds. Balance updates.",
        "Invoices"
      ),
      t(
        "Portal — approve estimate",
        "Open estimate link. Sign and approve.",
        "Status APPROVED. Deposit flow if required.",
        "Estimates"
      ),
      t(
        "Portal — maintenance enrollments",
        "View maintenance tab.",
        "Active enrollments, upcoming visits, billing history shown.",
        "Maintenance"
      ),
      t(
        "Portal — Rachio zone run",
        "On property with Rachio, run zone for 5 minutes (if allowed).",
        "Zone run starts. Confirmation shown.",
        "Rachio"
      ),
      t(
        "Portal — irrigation guide",
        "View published irrigation map and zone runtimes.",
        "Map and programming guide display correctly.",
        "Irrigation"
      ),
      t(
        "Portal — offers",
        "View active offers. Click CTA button.",
        "Offers display. External link opens.",
        "Offers"
      ),
      t(
        "Portal — submit referral",
        "Referrals tab → Submit referral with friend details.",
        "Submission recorded. History shows status.",
        "Referrals"
      ),
      t(
        "Portal — feedback survey",
        "Open /portal/{slug}/feedback/{token}. Rate 1-5 stars. Submit comment.",
        "Survey saved. Thank you shown. Already-submitted on repeat.",
        "Feedback"
      ),
      t(
        "Portal feature gating",
        "Disable portal features in settings. Verify hidden in portal nav.",
        "Disabled sections not accessible.",
        "Settings"
      ),
    ]
  ),

  section(
    "booking",
    "16. Public Online Booking",
    "Customer-facing booking widget at /book/{slug}.",
    [
      t(
        "Booking flow — happy path",
        "Go to /book/{slug}. Enter contact, address with valid ZIP, pick slot. Book.",
        "Confirmation shown. Visit created. Customer matched/created.",
        "Booking"
      ),
      t(
        "Booking — invalid ZIP",
        "Enter ZIP outside service areas.",
        "Error: area not serviced. No slots shown.",
        "Validation"
      ),
      t(
        "Booking — slot race condition",
        "Select slot, delay submit until slot taken.",
        "409 error. User prompted to pick another slot.",
        "Validation"
      ),
      t(
        "Booking — Do Not Service block",
        "Book with phone/email of DNS customer.",
        "403 blocked. No visit created.",
        "Validation"
      ),
      t(
        "Booking disabled",
        "Disable online booking in settings. Visit /book/{slug}.",
        "404 or not available message.",
        "Settings"
      ),
      t(
        "Booking notification",
        "Complete booking. Verify visit-scheduled notification sent.",
        "Customer receives SMS/email per communication settings.",
        "Notifications"
      ),
    ]
  ),

  section(
    "payments",
    "17. Payments",
    "Invoice payment and card-on-file flows.",
    [
      t(
        "Public invoice payment",
        "Open /pay/{token}. Click Pay. Complete Stripe Checkout.",
        "Payment succeeds. Invoice balance updates. Receipt sent if configured.",
        "Invoice pay"
      ),
      t(
        "Already-paid invoice",
        "Open pay link for fully paid invoice.",
        "Thank you / already paid message. No pay button.",
        "Invoice pay"
      ),
      t(
        "Refunded invoice",
        "Open pay link for refunded invoice.",
        "Not payable message shown.",
        "Invoice pay"
      ),
      t(
        "Visit checkout payment",
        "From visit detail, Collect payment. Complete Stripe.",
        "Visit marked Paid. Invoice synced.",
        "Visit pay"
      ),
      t(
        "Estimate deposit payment",
        "Approve estimate with deposit via portal. Pay deposit.",
        "Deposit recorded. Install flow triggered if configured.",
        "Deposit"
      ),
      t(
        "Card setup success/cancel",
        "Use secure card-add link. Complete or cancel Stripe setup.",
        "Success page at /pay/card/success. Cancel at /pay/card/cancelled.",
        "Card on file"
      ),
      t(
        "Issue refund",
        "As Admin, refund payment on invoice from /customers/invoices.",
        "Refund processed in Stripe. Invoice status updated.",
        "Refunds"
      ),
    ]
  ),

  section(
    "settings",
    "18. Settings (Global & Feature Configuration)",
    "All company configuration before go-live.",
    [
      t(
        "Company profile",
        "Settings → Company. Edit name, address, timezone, support email, phone. Save.",
        "Profile persists. Timezone affects scheduling.",
        "Company"
      ),
      t(
        "Email branding",
        "Upload email logo. Set sender display name.",
        "Logo appears in outbound emails and portal header.",
        "Company"
      ),
      t(
        "Business hours (company)",
        "Set Mon–Fri open hours. Save.",
        "Hours persist. Used for voice after-hours routing.",
        "Company"
      ),
      t(
        "Appearance theme",
        "Settings → Appearance. Toggle Light/Dark/System.",
        "Theme applies immediately.",
        "Appearance"
      ),
      t(
        "Communications templates",
        "Settings → Communications. Edit visit-scheduled SMS template. Insert merge field. Save.",
        "Template saves. Test send delivers with merged data.",
        "Communications"
      ),
      t(
        "Review link tracking",
        "Enable review request notification. Send test. Click review link.",
        "Sent/clicked stats increment in tracking panel.",
        "Communications"
      ),
      t(
        "Create employee with role",
        "Settings → Employees → Create. Set role TECH, division, service areas, compensation. Save.",
        "Employee active. Can log in. Appears on schedule filters.",
        "Employees"
      ),
      t(
        "Archive and restore employee",
        "Archive employee. Verify hidden from active. Restore.",
        "Status toggles. Login blocked while archived.",
        "Employees"
      ),
      t(
        "Set employee password (Admin)",
        "As Admin, set password for employee.",
        "Employee can log in with new password.",
        "Employees"
      ),
      t(
        "Create and manage crew",
        "Create install crew with division INSTALL. Add members.",
        "Crew appears on schedule. KPI crew card shows callback rate.",
        "Crews"
      ),
      t(
        "Service areas and ZIPs",
        "Create area. Add ZIP codes. Use in scheduling and booking.",
        "ZIPs validate booking and quick-add.",
        "Service areas"
      ),
      t(
        "Parts suppliers",
        "Search Google Places. Add supplier. Activate.",
        "Supplier appears in Parts run on visits.",
        "Parts"
      ),
      t(
        "Booking settings",
        "Enable booking. Set slug and lead time. Save.",
        "Public /book/{slug} accessible.",
        "Booking"
      ),
      t(
        "Customer portal settings",
        "Enable portal. Toggle feature flags (visits, estimates, invoices, etc.). Set reschedule/cancel lead times.",
        "Portal reflects toggles. Policies enforced.",
        "Portal"
      ),
      t(
        "Portal offers CRUD",
        "Create offer with title, description, URL. Toggle active. Delete.",
        "Active offers appear in portal.",
        "Portal"
      ),
      t(
        "Lead settings",
        "Add lead source tags. Set default assignee. Enable notify on website lead.",
        "Sources available on lead forms. Notifications fire.",
        "Leads"
      ),
      t(
        "Inbox settings",
        "Set Twilio phone, from email. Send test email. Register webhooks.",
        "SMS and email outbound work. Webhooks registered.",
        "Inbox"
      ),
      t(
        "Estimate settings",
        "Set expiry days, deposit defaults, install duration, supplier email, auto-email parts.",
        "New estimates inherit defaults.",
        "Estimates"
      ),
      t(
        "Invoice settings",
        "Set prefix, payment terms, footer.",
        "New invoices use settings.",
        "Invoices"
      ),
      t(
        "Customer intake required fields",
        "Mark phone and address required. Create customer without them.",
        "Validation blocks incomplete create.",
        "Intake"
      ),
      t(
        "Integrations — API keys",
        "Generate WEBSITE API key. Copy raw key. Revoke.",
        "Key works for spoke integration. Revoked key fails.",
        "Integrations"
      ),
      t(
        "Google Business Profile connect",
        "Settings → Integrations → GBP. OAuth connect. Select location.",
        "Connected. Marketing GBP pages load data.",
        "GBP"
      ),
      t(
        "Google Ads connect",
        "OAuth connect. Enter developer token. Select customer account.",
        "Ads dashboard loads campaign data.",
        "Google Ads"
      ),
      t(
        "Meta Ads connect",
        "Enter token. Select ad account.",
        "Meta ads tab loads data.",
        "Meta Ads"
      ),
      t(
        "Slack GBP reviews",
        "Configure Slack channel. Send test card.",
        "Test card appears in Slack.",
        "Slack"
      ),
      t(
        "SERP rankings settings",
        "Add GBP and organic keywords. Add target cities. Save.",
        "SEO ranking maps use configured keywords/cities.",
        "SEO"
      ),
      t(
        "Rachio API key",
        "Settings → Maintenance. Enter Rachio API key. Test connection.",
        "Connection succeeds. Controllers listed.",
        "Rachio"
      ),
    ]
  ),

  section(
    "migration",
    "19. Data Migration (Housecall Pro)",
    "One-time import from Housecall Pro. Run in staging first.",
    [
      t(
        "HCP connect and preview",
        "Settings → Data migration. Enter HCP API key. Preview import counts.",
        "Preview shows expected record counts per step.",
        "Migration"
      ),
      t(
        "Run migration batches",
        "Start migration. Run batches for tags, zones, employees, materials, services, customers, jobs.",
        "Each step completes. Counts increment. Auto-continue works.",
        "Migration"
      ),
      t(
        "Skip and focus steps",
        "Skip a step. Focus on specific step. Reset step.",
        "Step state changes correctly.",
        "Migration"
      ),
      t(
        "Pause and resume",
        "Pause migration mid-batch. Resume.",
        "State preserved. Continues from pause point.",
        "Migration"
      ),
      t(
        "Rollback (destructive)",
        "In staging only: run rollback with confirmation.",
        "All HCP-imported records deleted.",
        "Migration"
      ),
    ]
  ),

  section(
    "integrations",
    "20. Cross-Integration End-to-End Scenarios",
    "Full workflows spanning multiple modules. Run these last.",
    [
      t(
        "Lead → customer → visit → complete → invoice → pay",
        "Create lead. Convert. Schedule visit. Complete with checklist. Generate invoice. Customer pays via portal.",
        "End-to-end data flows correctly. Balances zero.",
        "E2E"
      ),
      t(
        "Inbound call → book → dispatch → complete",
        "Receive call. Book appointment. Tech goes On my way. Completes visit.",
        "Call disposition BOOKED. Visit completed. KPIs update.",
        "E2E"
      ),
      t(
        "Online booking → notification → schedule board",
        "Customer books online. Verify notification. Find on schedule board.",
        "Visit on board. Customer and property created.",
        "E2E"
      ),
      t(
        "Estimate → send → portal approve → deposit → schedule install",
        "Create estimate. Send. Customer approves in portal. Pays deposit. Appears in needs-scheduling.",
        "Full sales-to-install pipeline works.",
        "E2E"
      ),
      t(
        "Maintenance plan enroll → activate → schedule visits → bill",
        "Enroll customer. Activate. Schedule plan visits. Verify billing period.",
        "Plan lifecycle complete.",
        "E2E"
      ),
      t(
        "Marketing campaign → track opens → reporting",
        "Send email campaign. Open email (click link). Check reporting/marketing events.",
        "Open tracked. Events appear in marketing report.",
        "E2E"
      ),
      t(
        "GBP review → Slack card → reply in CRM",
        "Receive new Google review. Send to Slack. Reply from Marketing GBP page.",
        "Slack card posted. Reply on Google.",
        "E2E"
      ),
      t(
        "Referral submit → convert → payout",
        "Customer submits referral. Referred becomes customer with paid visit. Verify reward payout.",
        "Reward queued and transferred via Stripe Connect.",
        "E2E"
      ),
      t(
        "Do Not Service enforcement everywhere",
        "Flag customer DNS. Attempt: book online, New visit, schedule plan visit, send notifications.",
        "All paths blocked. No notifications sent.",
        "E2E"
      ),
      t(
        "Role-based access sweep",
        "Log in as each role. Verify allowed modules accessible. Verify forbidden actions blocked.",
        "TECH cannot delete customers. INSTALLER cannot manage enrollments. CSR can schedule.",
        "E2E"
      ),
    ]
  ),

  section(
    "golive",
    "21. Pre-Go-Live Checklist",
    "Final verification before handing the CRM to your team for daily use.",
    [
      t(
        "Production environment variables",
        "Verify all required env vars set: DATABASE_URL, NEXTAUTH_SECRET, STRIPE keys, TWILIO, SENDGRID, GOOGLE_OAUTH, SLACK_BOT_TOKEN, BLOB, OPENAI (optional).",
        "No 503 errors on integration pages. Health checks pass.",
        "Env"
      ),
      t(
        "Twilio webhooks registered",
        "Settings → Inbox → Register webhooks. Verify in Twilio console.",
        "Inbound SMS and voice route to CRM.",
        "Twilio"
      ),
      t(
        "Stripe webhooks configured",
        "Verify Stripe webhook endpoint points to /api/stripe/webhook.",
        "Payment confirmations process automatically.",
        "Stripe"
      ),
      t(
        "Google OAuth redirect URIs",
        "Verify all callback URIs registered in Google Cloud Console.",
        "GBP, Ads, Search Console OAuth flows complete without error.",
        "Google"
      ),
      t(
        "Meta webhooks verified",
        "Settings → Meta webhooks. Verify webhook in Meta developer console.",
        "Social DMs and post insights flow in.",
        "Meta"
      ),
      t(
        "Service areas cover all ZIPs",
        "Review service area ZIP lists match your actual service territory.",
        "Booking and scheduling accept valid ZIPs only.",
        "Areas"
      ),
      t(
        "Price book populated",
        "Import or manually enter all services and materials used in the field.",
        "Techs can add line items from complete catalog.",
        "Price book"
      ),
      t(
        "Checklists configured",
        "Create and activate checklists for SERVICE and INSTALL divisions.",
        "Visits auto-receive correct checklists.",
        "Checklists"
      ),
      t(
        "Communication templates reviewed",
        "Review all 12 notification templates. Send test for each channel.",
        "Messages professional and merge fields correct.",
        "Communications"
      ),
      t(
        "Employee accounts created",
        "Create accounts for all team members with correct roles.",
        "Each person can log in and sees appropriate modules.",
        "Employees"
      ),
      t(
        "Customer portal tested",
        "Send portal link to test customer. Walk through all enabled features.",
        "Portal works on mobile and desktop.",
        "Portal"
      ),
      t(
        "Online booking tested",
        "Complete test booking from public URL on mobile.",
        "Booking works end-to-end.",
        "Booking"
      ),
      t(
        "Backup and rollback plan",
        "Document database backup procedure. Test restore in staging.",
        "Can recover from bad data entry or migration mistake.",
        "Ops"
      ),
    ]
  ),
];

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Storm Sprinklers CRM — Pre-Launch Test Plan</title>
  <style>
    @page { size: Letter; margin: 0.55in; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.35;
      color: #1a1a1a;
      margin: 0;
      padding: 0;
    }
    .cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 90vh;
      padding: 2in 1in 1in;
      background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%);
      color: #fff;
    }
    .cover h1 { font-size: 28pt; margin: 0 0 8px; font-weight: 700; }
    .cover .subtitle { font-size: 14pt; opacity: 0.9; margin-bottom: 32px; }
    .cover .meta { font-size: 10pt; opacity: 0.75; line-height: 1.8; }
    .cover .meta strong { opacity: 1; }
    h2 {
      font-size: 14pt;
      color: #0f172a;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 4px;
      margin: 24px 0 8px;
      page-break-after: avoid;
    }
    h3 { font-size: 11pt; margin: 16px 0 6px; page-break-after: avoid; }
    p.intro { font-size: 9pt; color: #444; margin: 0 0 8px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 8pt;
      page-break-inside: auto;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 5px;
      text-align: left;
      font-weight: 600;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    td {
      border: 1px solid #e2e8f0;
      padding: 4px 5px;
      vertical-align: top;
    }
    td.id { width: 52px; font-weight: 600; color: #2563eb; white-space: nowrap; }
    td.area { width: 72px; color: #64748b; font-size: 7.5pt; }
    td.case { width: 14%; font-weight: 600; }
    td.steps { width: 28%; }
    td.expected { width: 28%; }
    td.status { width: 28px; text-align: center; font-size: 12pt; }
    td.notes { width: 10%; min-height: 20px; }
    .toc { page-break-after: always; padding: 0.5in 0; }
    .toc h2 { border: none; font-size: 18pt; }
    .toc ol { columns: 2; font-size: 10pt; line-height: 1.7; }
    .toc a { color: #2563eb; text-decoration: none; }
    .howto { page-break-after: always; }
    .howto ul { margin: 4px 0; padding-left: 20px; }
    .howto li { margin-bottom: 4px; }
    .accounts table { font-size: 9pt; }
    .accounts th { background: #e0e7ff; }
    .badge { display: inline-block; background: #dbeafe; color: #1d4ed8; padding: 1px 6px; border-radius: 3px; font-size: 7pt; font-weight: 600; }
    .summary-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      margin: 12px 0;
      font-size: 9pt;
    }
    .module { page-break-before: auto; }
  </style>
</head>
<body>

<div class="cover">
  <h1>Storm Sprinklers CRM</h1>
  <div class="subtitle">Comprehensive Pre-Launch Test Plan</div>
  <div class="meta">
    <strong>Version:</strong> 1.0<br/>
    <strong>Date:</strong> July 2026<br/>
    <strong>Purpose:</strong> Verify every CRM feature before active team use<br/>
    <strong>Environment:</strong> Staging / Production (check each box for the environment tested)<br/>
    <br/>
  </div>
</div>

<div class="toc">
  <h2>Table of Contents</h2>
  <ol>
    <li><a href="#auth">Authentication, Roles &amp; Global Navigation</a></li>
    <li><a href="#home">Home Dashboard</a></li>
    <li><a href="#customers">Customers Module</a></li>
    <li><a href="#schedule">Schedule &amp; Team Management</a></li>
    <li><a href="#visits">Visit Detail &amp; Field Workflow</a></li>
    <li><a href="#inbox">Inbox — Voice, SMS, Email, Social</a></li>
    <li><a href="#voice-settings">Voice Settings</a></li>
    <li><a href="#pricebook">Price Book</a></li>
    <li><a href="#estimates">Estimates</a></li>
    <li><a href="#checklists">Checklists</a></li>
    <li><a href="#maintenance">Maintenance Plans</a></li>
    <li><a href="#timesheets">Timesheets &amp; Compensation</a></li>
    <li><a href="#marketing">Marketing</a></li>
    <li><a href="#reporting">Reporting</a></li>
    <li><a href="#portal">Customer Portal</a></li>
    <li><a href="#booking">Public Online Booking</a></li>
    <li><a href="#payments">Payments</a></li>
    <li><a href="#settings">Settings</a></li>
    <li><a href="#migration">Data Migration (Housecall Pro)</a></li>
    <li><a href="#integrations">Cross-Integration E2E Scenarios</a></li>
    <li><a href="#golive">Pre-Go-Live Checklist</a></li>
  </ol>
</div>

<div class="howto">
  <h2>How to Use This Document</h2>
  <div class="summary-box">
    This plan contains <strong>${sections.reduce((n, s) => n + (s.match(/<tr>/g)?.length ?? 0) - 1, 0)}</strong> manual test cases across <strong>21 modules</strong> covering every feature of the Storm Sprinklers CRM.
  </div>
  <h3>Instructions</h3>
  <ul>
    <li>Work through sections <strong>in order</strong> for first pass, or jump to specific modules for targeted retesting.</li>
    <li>Each row has a unique <strong>ID</strong> (e.g. AUTH-01) for referencing bugs and retests.</li>
    <li>Mark <strong>Pass</strong> column with ☑ when the expected result is confirmed.</li>
    <li>Use the <strong>Notes</strong> column for bug IDs, screenshots, or environment details.</li>
    <li>Section <strong>20 (E2E)</strong> should be run last after individual modules pass.</li>
    <li>Section <strong>21 (Pre-Go-Live)</strong> is the final gate before handing to your team.</li>
  </ul>
  <h3>Recommended test order</h3>
  <ol>
    <li>Settings &amp; configuration (Section 18) — set up the system first</li>
    <li>Price Book &amp; Checklists (Sections 8, 10) — catalog and field workflows</li>
    <li>Customers &amp; Schedule (Sections 3, 4) — core data entry</li>
    <li>Visits &amp; field workflow (Section 5) — the daily technician experience</li>
    <li>Inbox &amp; Voice (Sections 6, 7) — communication channels</li>
    <li>Estimates &amp; Payments (Sections 9, 17) — sales and money</li>
    <li>Maintenance Plans (Section 11) — recurring revenue</li>
    <li>Portal &amp; Booking (Sections 15, 16) — customer self-service</li>
    <li>Marketing &amp; Reporting (Sections 13, 14) — growth and analytics</li>
    <li>E2E scenarios &amp; Go-Live (Sections 20, 21) — final validation</li>
  </ol>

  <h3>Test accounts needed</h3>
  <div class="accounts">
    <table>
      <thead>
        <tr><th>Role</th><th>Purpose</th><th>Created?</th></tr>
      </thead>
      <tbody>
        <tr><td><span class="badge">ADMIN</span></td><td>Full access, settings, integrations, delete, refunds</td><td>☐</td></tr>
        <tr><td><span class="badge">MANAGER</span></td><td>Schedule, employees, customers, most settings</td><td>☐</td></tr>
        <tr><td><span class="badge">CSR</span></td><td>Inbox, scheduling, customer management, voice desk</td><td>☐</td></tr>
        <tr><td><span class="badge">TECH</span></td><td>Field service — assigned visits, time tracking, checklists</td><td>☐</td></tr>
        <tr><td><span class="badge">INSTALLER</span></td><td>Install crew member — crew visits only</td><td>☐</td></tr>
        <tr><td><span class="badge">SALES</span></td><td>Leads, estimates, pipeline</td><td>☐</td></tr>
        <tr><td><span class="badge">CUSTOMER</span></td><td>Portal login, booking, estimate approval, invoice pay</td><td>☐</td></tr>
      </tbody>
    </table>
  </div>

  <h3>External services to verify before testing</h3>
  <ul>
    <li><strong>Twilio</strong> — SMS, voice, MMS, email (phone number, webhooks registered)</li>
    <li><strong>Stripe</strong> — Invoice pay, visit checkout, deposits, card-on-file, Connect payouts</li>
    <li><strong>Google</strong> — Business Profile OAuth, Ads OAuth, Search Console OAuth</li>
    <li><strong>Meta</strong> — Page token, webhooks for DMs and social insights</li>
    <li><strong>Slack</strong> — Bot token, GBP review channel configured</li>
    <li><strong>Google Maps</strong> — Address autocomplete, map embeds, driving ETA</li>
    <li><strong>Rachio</strong> — API key, controller linked to test property</li>
    <li><strong>SerpAPI</strong> — Keyword ranking maps (optional; mock data without key)</li>
    <li><strong>OpenAI</strong> — AI descriptions, email generation, SEO recommendations (optional)</li>
    <li><strong>Blob storage</strong> — Attachments, photos, voice clips, email logos</li>
  </ul>
</div>

${sections.join("\n")}

<div style="page-break-before:always; padding-top:1in; text-align:center; color:#64748b; font-size:9pt;">
  <p>End of Storm Sprinklers CRM Pre-Launch Test Plan</p>
  <p>Generated ${new Date().toISOString().slice(0, 10)}</p>
</div>

</body>
</html>`;

const htmlPath = path.join(dir, "crm-pre-launch-test-plan.html");
writeFileSync(htmlPath, html, "utf8");

const caseCount = (html.match(/<td class="id">/g) ?? []).length;
console.log(`Wrote ${htmlPath}`);
console.log(`Total test cases: ${caseCount}`);
