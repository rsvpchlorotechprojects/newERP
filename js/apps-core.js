/* Apps: the 9-dot switcher, the app shell (header, sidebar, router), shared business data + helpers, and the Apps home */

const APPS = [];
const APP_UI = {}; // per-view UI state that doesn't need saving (filters, sort, selected month)
function registerApp(def) { APPS.push(def); }
function appById(id) { return APPS.find(a => a.id === id) || null; }
function appEnabled(a) { return a.id === 'taskspace' || !Store.state.erp.apps.disabled.includes(a.id); }
function enabledApps() {
  const order = Store.state.erp.apps.order || [];
  const idx = a => { const i = order.indexOf(a.id); return i < 0 ? 99 : i; };
  return APPS.filter(appEnabled).sort((a, b) => idx(a) - idx(b));
}
function currentAppId() { const r = App.route || parseRoute(); return r.kind === 'app' ? r.app : 'taskspace'; }
function ui(key, defaults) { APP_UI[key] = APP_UI[key] || JSON.parse(JSON.stringify(defaults)); return APP_UI[key]; }

/* ---------------- App avatars ---------------- */
function appIcon(app, size = 20) {
  const c = app.color;
  const g = {
    logo: `<path d="M10 3.5l6.5 6.5-6.5 6.5L3.5 10z" fill="#fff"/><path d="M10 7.5l2.5 2.5-2.5 2.5-2.5-2.5z" fill="${c}"/>`,
    target: `<circle cx="10" cy="10" r="6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="10" cy="10" r="2.6" fill="#fff"/>`,
    receipt: `<path d="M5.5 3.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" fill="#fff"/><path d="M7.5 7h5M7.5 9.5h5M7.5 12h3" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>`,
    people: `<circle cx="7.5" cy="7.5" r="2.4" fill="#fff"/><circle cx="13.2" cy="8.2" r="1.9" fill="#fff" opacity=".85"/><path d="M3.5 15.5c.4-2.6 2-4 4-4s3.6 1.4 4 4z" fill="#fff"/><path d="M12 15.5c-.1-1.3-.5-2.4-1.2-3.2.7-.5 1.5-.7 2.4-.7 1.7 0 3 1.2 3.3 3.9z" fill="#fff" opacity=".85"/>`,
    video: `<rect x="3.5" y="6" width="9" height="8" rx="1.6" fill="#fff"/><path d="M13.5 9l3.5-2.2v6.4L13.5 11z" fill="#fff"/>`,
    calc: `<rect x="5" y="3.5" width="10" height="13" rx="1.6" fill="#fff"/><rect x="7" y="5.5" width="6" height="2.6" rx=".5" fill="${c}"/>${[0, 1, 2].map(x => [0, 1].map(y => `<circle cx="${7.6 + x * 2.4}" cy="${11 + y * 2.6}" r=".9" fill="${c}"/>`).join('')).join('')}`,
  };
  return `<svg class="app-av" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true"><rect width="20" height="20" rx="5" fill="${c}"/>${g[app.glyph] || g.logo}</svg>`;
}

/* ---------------- Business data (Store.state.erp) ---------------- */
function erp() { return Store.state.erp; }
function erpSet(group) { return Store.state.erp.settings[group]; }

/* Quotation wording, the same as the ERP's quotation form */
const QUOTE_PAYMENT_PRESETS = [
  '50% advance along with the Purchase Order. Balance 50% before dispatch.',
  '30% advance, 60% against dispatch, and 10% after successful commissioning.',
  '100% advance payment against Proforma Invoice.',
];
const QUOTE_DELIVERY_PRESETS = [
  'Delivery shall be completed within 10–12 weeks from the date of Manufacturing Clearance, technically and commercially clear Purchase Order.',
  'Delivery shall be completed within 3–4 weeks from the date of Manufacturing Clearance, technically and commercially clear Purchase Order.',
  'Delivery shall be completed within 4–5 weeks from the date of Manufacturing Clearance, technically and commercially clear Purchase Order.',
];
const QUOTE_WARRANTY_PRESETS = ['18 months from the date of dispatch or 12 months from the date of commissioning, whichever is earlier.'];
const QUOTE_BANK_OPTIONS = [
  'Our Banker Details: SBI Bank.\nAccount Name - RSVP CHLOROTECH\nBranch: HVF AVADI\nCurrent Account Number: 00000040829541554\nIFSC: SBIN0014160',
  'Our Banker Details: Canara Bank, Sholavaram.\nAccount Name - RSVP CHLORO TECH\nBranch: SHOLAVARAM\nCurrent Account Number: 3505201000062\nIFSC: CNRB0003505',
];
const QUOTE_BANK_TOKEN = '[Bank details]'; // where the chosen bank goes in the standard terms
const QUOTE_STANDARD_TERMS = [
  'Prices Quoted are in Indian Rupees. Ex-Works, packed, Chennai, India.',
  '@ 2.5% for Road worthy Packing.',
  'Freight and Insurance: on client/purchaser scope. Please indicate your preferred mode of transport and transporter, if any. Or Freight and Insurance will be as actual. Unloading, Storage/Security of materials at site under buyer scope. Erection and commissioning supervision charges will be applicable considering the location of the work site and value of the project.',
  "18% GST Applicable on Basic Price applicable, Duties and Taxes are indicative only. Actual Rate prevailing at the time of Dispatch/as on billing date will be applicable. All Statutory/Classification Variations are a/c to Purchaser's/client. GST Reg. No - 33HAUPS8837L1ZH",
  'Guarantee and Warranty: 18 months from the date of dispatch or 12 months from the date of commissioning, whichever is earlier.',
  'Dispatch Instruction: Purchase Order should intimate clear dispatch Instructions and details of destination, Mode of Transport, GST Registered Number. If Purchase Order does not carry any Dispatch Instruction, it will be assumed that the address given in the Purchase Order is the destination and all Invoices/documents will be directed to the same address.',
  'All disputes and differences arising out of or connected with this Order, failing amicable settlement, shall be referred to Arbitration under the Indian Arbitration Act 1940 or any Statutory modification for the time being in force, and such arbitration shall take place in Chennai, Tamil Nadu, India.',
  'M/s. RSVP CHLOROTECH is not responsible for any substantial losses at site/during transit after inspection.',
  'Order cancellation, risk purchase, LD Charges, stop-payment or penalty is not acceptable to us, unless agreed-to/accepted by us in writing.',
  'Payment Mode: Currency of Payments accepted as Indian Rupees (INR) by Cash payments/Current dated at par Cheque or payable at Chennai/Demand draft Payments/RTGS/NEFT Transfer/online Transfer in favor of RSVP CHLORO TECH.',
  QUOTE_BANK_TOKEN,
  'Amendments: Order Amendment is applicable on any change in specification and other terms, and needs revision of Delivery time and revision of Prices.',
  'We shall be much grateful and thankful if you could please accept our proposals and help us in converting to a Purchase/Work Order for us to serve you better. Our Technical team and service team are available round the clock for all kinds of technical support and documentation support. We are ready to serve our client with the utmost sincerity and priority. Note: please call the undersigned for further requirements/clarification, if any.',
];
const QUOTE_SIGNOFF = 'Thanking you in Advance,\nYours sincerely,\nROSHAN S\nSALES MANAGER\nMob: +91-7550249998\nE-Mail: sales1rsvpchlorotech@gmail.com / svpchlorination@gmail.com / info@rsvptech.in';

function defaultErpSettings() {
  return {
    company: { name: 'RSVP Chloro Tech', address: 'Plot T-139, SIPCOT Womens Industrial Estate,\nKattur Village, Thirumullaivoyal\nChennai - 600062, Tamil Nadu, India', gst: '33HAUPS8837L1ZH', phone: '+91 75502 49998', email: 'sales@rsvpchlorotech.com', website: '' },
    crm: {
      stages: [
        { id: 'stg_new', name: 'New lead', cat: 'new' },
        { id: 'stg_contacted', name: 'Contacted', cat: 'open' },
        { id: 'stg_qualified', name: 'Qualified', cat: 'open' },
        { id: 'stg_req', name: 'Requirement gathering', cat: 'open' },
        { id: 'stg_quoted', name: 'Quotation sent', cat: 'open' },
        { id: 'stg_nego', name: 'Negotiation', cat: 'open' },
        { id: 'stg_won', name: 'PO received', cat: 'won' },
        { id: 'stg_lost', name: 'Lost', cat: 'lost' },
      ],
      sources: ['Website', 'Email', 'Phone call', 'IndiaMART', 'Referral', 'Exhibition', 'Existing client'],
      industries: ['Municipal', 'Drinking Water', 'Power Plants', 'Pharma', 'Chemical', 'WTP', 'ETP', 'STP', 'Hotels', 'Hospitals', 'Infrastructure', 'Other'],
      quoteSentStage: 'stg_quoted', quoteAcceptedStage: 'stg_won', convertOnWin: true, staleDays: 14,
      tags: ['Tender', 'Hot', 'Repeat buyer', 'Export'], views: [], enforceStages: true, leadCols: ['company', 'stage', 'value', 'priority', 'source', 'owner', 'expected', 'created'],
    },
    sales: {
      currency: 'INR', quotePrefix: 'QT-', invoicePrefix: 'PI-', nextQuote: 1, nextInvoice: 1, validityDays: 30, invoiceDueDays: 15, gstDefault: 18,
      paymentTerms: QUOTE_PAYMENT_PRESETS[0],
      deliveryTerms: QUOTE_DELIVERY_PRESETS[2],
      warrantyTerms: QUOTE_WARRANTY_PRESETS[0],
      paymentPresets: QUOTE_PAYMENT_PRESETS.slice(), deliveryPresets: QUOTE_DELIVERY_PRESETS.slice(), warrantyPresets: QUOTE_WARRANTY_PRESETS.slice(),
      bankOptions: QUOTE_BANK_OPTIONS.slice(),
      bank: QUOTE_BANK_OPTIONS[0], // printed on proforma invoices
      standardTerms: QUOTE_STANDARD_TERMS.slice(),
      signoff: QUOTE_SIGNOFF,
      quoteFormat: 1,
    },
    people: { workStart: '09:00', lateCutoff: '09:30', workEnd: '18:00', weekOff: [0], leaveQuota: 3, designations: ['Sales', 'Project', 'Draftsman', 'Production', 'Purchase', 'Accounts', 'Administrator', 'Digital Marketing'], offices: ['Thirumullaivoyal', 'Pattabiram'] },
    meet: { platforms: ['Google Meet', 'Zoom', 'Microsoft Teams', 'Phone call', 'In person'], defaultDuration: 30, remindDays: 1 },
    tools: { defaultDose: 4, cylinderKg: 100, tonnerKg: 900, naoclConc: 6, flowUnit: 'm3/hr' },
  };
}

/* The RSVP Chloro Tech team, from the ERP's employee list (its setup and test logins left out).
   Dharshini A is the signed-in user (u_me). Salaries aren't copied: set them in People. */
const COMPANY_PEOPLE = [
  // [user id, employee id, name, designation, office, email]
  ['u_rsvp001', 'RSVP001', 'Dhinesh Kumar C', 'Administrator', 'Thirumullaivoyal', ''],
  ['u_rsvp101', 'RSVP101', 'Yuvaraj', 'Administrator', 'Thirumullaivoyal', ''],
  ['u_rsvp105', 'RSVP105', 'Roshan S', 'Sales', 'Thirumullaivoyal', ''],
  ['u_rsvp127', 'RSVP127', 'Sarmili T', 'Sales', 'Pattabiram', ''],
  ['u_rsvp139', 'RSVP139', 'Gokul R', 'Sales', 'Thirumullaivoyal', ''],
  ['u_rsvp129', 'RSVP129', 'Gokula Varshini G', 'Project', 'Thirumullaivoyal', ''],
  ['u_rsvp131', 'RSVP131', 'Sakthivel L', 'Project', 'Thirumullaivoyal', ''],
  ['u_rsvp130', 'RSVP130', 'Rajkamal J', 'Project', 'Thirumullaivoyal', 'process2@rsvptech.in'],
  ['u_rsvp133', 'RSVP133', 'Dhanush M', 'Draftsman', 'Thirumullaivoyal', ''],
  ['u_rsvp146', 'RSVP146', 'Dhakshana Moorthi', 'Draftsman', 'Thirumullaivoyal', ''],
  ['u_rsvp138', 'RSVP138', 'Seetharaman', 'Production', 'Thirumullaivoyal', ''],
  ['u_rsvp137', 'RSVP137', 'Karpagam S', 'Purchase', 'Thirumullaivoyal', ''],
  ['u_rsvp145', 'RSVP145', 'Janani M', 'Accounts', 'Pattabiram', ''],
  ['u_crx0011', 'CRX0011', 'Mythili', 'Accounts', 'Thirumullaivoyal', ''],
  ['u_me', 'RSVP128', 'Dharshini A', 'Digital Marketing', 'Pattabiram', ''],
  ['u_rsvp144', 'RSVP144', 'Subhashini B', 'Digital Marketing', 'Pattabiram', ''],
  ['u_crx017', 'CRX017', 'Shanmugapriya', 'Digital Marketing', 'Thirumullaivoyal', ''],
];
/* the three example people from the first version, and who took over their records */
const SAMPLE_PEOPLE_MAP = { u_arun: 'u_rsvp105', u_priya: 'u_rsvp129', u_karthik: 'u_rsvp145' };
const PEOPLE_COLORS = ['#4BCE97', '#C97CF4', '#42B2D7', '#F87168', '#669DF1', '#E774BB', '#94C748', '#FCA700', '#8FB8F6', '#FD9891'];
function personInitials(name) { const w = name.split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase(); }
/* add or update every team member as a user and an employee record */
function applyCompanyPeople(st, e) {
  COMPANY_PEOPLE.forEach(([id, empId, name, designation, office, email], i) => {
    let u = st.users.find(x => x.id === id);
    if (!u) { u = { id, color: PEOPLE_COLORS[i % PEOPLE_COLORS.length] }; st.users.push(u); }
    Object.assign(u, { name, initials: personInitials(name) });
    delete u.sample;
    let r = e.employees.find(x => x.userId === id);
    const seeded = !r || r.sample || r.empId === 'EMP001'; // made-up contact details and salary from the example data
    if (!r) { r = { userId: id, joined: '' }; e.employees.push(r); }
    Object.assign(r, { empId, designation, office });
    if (seeded) Object.assign(r, { email, phone: '', salary: 0 });
    else if (email && !r.email) r.email = email;
    delete r.sample;
  });
}
/* existing data: the example people become the team members who took their place, then the rest of the team is added */
function ensureCompanyPeople(st) {
  const e = st.erp;
  if (e.peopleVersion >= 1) return;
  if (st.users.some(u => SAMPLE_PEOPLE_MAP[u.id])) {
    let raw = JSON.stringify(st);
    Object.entries(SAMPLE_PEOPLE_MAP).forEach(([from, to]) => { raw = raw.split(`"${from}"`).join(`"${to}"`); });
    const fresh = JSON.parse(raw);
    Object.keys(fresh).forEach(k => { st[k] = fresh[k]; });
  }
  applyCompanyPeople(st, st.erp);
  st.erp.peopleVersion = 1;
}

function ensureErp(st) {
  if (!st.erp) st.erp = seedErp(st);
  const e = st.erp;
  const d = defaultErpSettings();
  e.settings = e.settings || {};
  const hadQuoteFormat = e.settings.sales && e.settings.sales.quoteFormat;
  Object.keys(d).forEach(k => { e.settings[k] = Object.assign({}, d[k], e.settings[k] || {}); });
  if (!hadQuoteFormat) {
    // saved before quotations matched the ERP: swap the old built-in wording for the ERP's (anything typed by hand stays)
    const sd = e.settings.sales;
    if (/^We trust our offer/.test(sd.signoff || '')) sd.signoff = QUOTE_SIGNOFF;
    if (/^Delivery within 4–5 weeks/.test(sd.deliveryTerms || '')) sd.deliveryTerms = QUOTE_DELIVERY_PRESETS[2];
    if (/HDFC0001234/.test(sd.bank || '')) sd.bank = QUOTE_BANK_OPTIONS[0];
    sd.quoteFormat = 1;
  }
  ['clients', 'leads', 'catalog', 'quotes', 'invoices', 'employees', 'attendance', 'leaves', 'holidays', 'meetings', 'announcements', 'calcs', 'log', 'recent'].forEach(k => { e[k] = e[k] || []; });
  e.apps = Object.assign({ disabled: [], order: [] }, e.apps || {});
  e.counters = Object.assign({ lead: e.leads.length, client: e.clients.length }, e.counters || {});
  e.leads.forEach(l => { if (!Array.isArray(l.tags)) l.tags = []; if (!l.contact) l.contact = { name: '', phone: '', email: '' }; });
  ensureCompanyPeople(st);
}

/* Sample business so every app has something to show; everything seeded carries sample:true */
function seedErp(st) {
  const t = todayStr();
  const d = n => addDays(t, n);
  const iso = n => new Date(Date.now() + n * 864e5).toISOString();
  const me = st.me;
  const e = { settings: defaultErpSettings(), apps: { disabled: [], order: [] }, sample: true, peopleVersion: 1 };
  e.employees = [];
  applyCompanyPeople(st, e);
  const c = (id, name, industry, city, state, contact, phone, email, gst) => ({ id, name, industry, type: 'Direct user', gst, website: '', address: '', city, state, country: 'India', contacts: [{ name: contact, phone, email }], notes: '', owner: 'u_rsvp105', created: iso(-120), sample: true });
  e.clients = [
    c('cl_aqua', 'AquaPure Industries', 'WTP', 'Coimbatore', 'Tamil Nadu', 'Ramesh V', '+91 94430 12345', 'ramesh@aquapure.in', '33AAACA1234F1Z5'),
    c('cl_green', 'GreenFlow Pharma', 'Pharma', 'Hyderabad', 'Telangana', 'Sneha Rao', '+91 99000 54321', 'purchase@greenflow.com', '36AABCG5678K1Z2'),
    c('cl_metro', 'Metro Utilities', 'Municipal', 'Chennai', 'Tamil Nadu', 'S. Balaji', '+91 90030 77889', 'ee.water@metroutilities.gov.in', ''),
  ];
  const L = (no, title, company, clientId, stageId, value, priority, source, industry, owner, created, expected, contact) => ({
    id: 'ld_' + no, no, title, company, clientId, stageId, value, priority, source, industry, owner, type: 'System',
    contact: contact || { name: '', phone: '', email: '' }, requirement: '', remarks: '', spaceId: null,
    created: iso(created), updated: iso(Math.min(0, created + 3)), expected: expected == null ? null : d(expected), log: [], sample: true,
  });
  e.leads = [
    L(1, 'Gas chlorination system 10 kg/h', 'Metro Utilities', 'cl_metro', 'stg_nego', 1850000, 'high', 'Existing client', 'Municipal', 'u_rsvp105', -40, 12),
    L(2, 'Electrochlorinator 5 kg/day', 'AquaPure Industries', 'cl_aqua', 'stg_won', 920000, 'high', 'Referral', 'WTP', 'u_rsvp105', -60, -5),
    L(3, 'Chlorine dioxide generator', 'GreenFlow Pharma', 'cl_green', 'stg_quoted', 640000, 'medium', 'Email', 'Pharma', me, -20, 18),
    L(4, 'Chlorine leak detectors (4 nos)', 'Sunrise Hotels', null, 'stg_contacted', 180000, 'low', 'IndiaMART', 'Hotels', 'u_rsvp105', -6, 30, { name: 'Vikram', phone: '+91 98844 12121', email: 'engg@sunrisehotels.in' }),
    L(5, 'STP disinfection upgrade', 'Coastal Builders', null, 'stg_new', 450000, 'medium', 'Website', 'Infrastructure', null, -2, 45, { name: 'Anita George', phone: '+91 97890 45454', email: 'anita@coastalbuilders.in' }),
    L(6, 'Vacuum regulator spares', 'Metro Utilities', 'cl_metro', 'stg_qualified', 95000, 'medium', 'Phone call', 'Municipal', 'u_rsvp105', -9, 10),
    L(7, 'Hospital water disinfection', 'CityCare Hospitals', null, 'stg_req', 520000, 'high', 'Exhibition', 'Hospitals', me, -14, 25, { name: 'Dr. Meera', phone: '+91 90000 78787', email: 'facility@citycare.in' }),
    L(8, 'Cooling tower dosing', 'Delta Power', null, 'stg_lost', 380000, 'low', 'Website', 'Power Plants', 'u_rsvp105', -75, -30, { name: 'Harish', phone: '', email: '' }),
  ];
  Object.assign(e.leads[0], { tags: ['Tender'], followUp: d(1) });
  Object.assign(e.leads[2], { tags: ['Hot'], followUp: t });
  Object.assign(e.leads[3], { followUp: d(-1) });
  Object.assign(e.leads[6], { tags: ['Hot', 'Tender'] });
  e.counters = { lead: 8, client: 3 };
  e.catalog = [
    { id: 'ci_gc', name: 'Gas Chlorinator 10 kg/h (vacuum type)', hsn: '84212190', category: 'System', unit: 'Nos', price: 385000, gst: 18, description: 'Wall-mounted vacuum chlorinator with rotameter and V-notch' },
    { id: 'ci_vr', name: 'Vacuum Regulator', hsn: '84818090', category: 'Spare', unit: 'Nos', price: 42000, gst: 18, description: 'Cylinder-mounted vacuum regulator with yoke' },
    { id: 'ci_ec', name: 'Electrochlorinator 5 kg/day', hsn: '85433000', category: 'System', unit: 'Set', price: 780000, gst: 18, description: 'On-site NaOCl generation with cell, rectifier and brine tank' },
    { id: 'ci_ld', name: 'Chlorine Leak Detector', hsn: '90271000', category: 'System', unit: 'Nos', price: 38500, gst: 18, description: 'Electrochemical sensor, 0–10 ppm, relay output' },
    { id: 'ci_dp', name: 'Dosing Pump 0–60 LPH', hsn: '84137010', category: 'System', unit: 'Nos', price: 36000, gst: 18, description: 'Electronic diaphragm dosing pump' },
    { id: 'ci_ic', name: 'Installation & Commissioning', hsn: '998719', category: 'Service', unit: 'Lot', price: 65000, gst: 18, description: 'Site installation, testing and commissioning' },
  ];
  const line = (ci, qty, disc = 0) => { const it = e.catalog.find(x => x.id === ci); return { itemId: ci, item: it.name, description: it.description, hsn: it.hsn, qty, price: it.price, disc, gst: it.gst }; };
  const q = (no, clientId, leadId, status, date, lines) => ({
    id: 'qt_' + no, no: `QT-${new Date().getFullYear()}-${String(no).padStart(3, '0')}`, clientId, leadId, status, date: d(date), validUntil: d(date + 30), currency: 'INR',
    lines, discountMode: 'inline', discount: 0, paymentTerms: e.settings.sales.paymentTerms, deliveryTerms: e.settings.sales.deliveryTerms, warrantyTerms: e.settings.sales.warrantyTerms,
    notes: '', preparedBy: 'u_rsvp105', created: iso(date), updated: iso(date + 1), sentAt: status !== 'draft' ? iso(date + 1) : null, sample: true,
  });
  e.quotes = [
    q(1, 'cl_aqua', 'ld_2', 'accepted', -30, [line('ci_ec', 1, 5), line('ci_ic', 1)]),
    q(2, 'cl_green', 'ld_3', 'sent', -8, [line('ci_dp', 2), line('ci_ld', 2), line('ci_ic', 1)]),
    q(3, 'cl_metro', 'ld_1', 'draft', -1, [line('ci_gc', 4, 3), line('ci_vr', 4), line('ci_ic', 1)]),
  ];
  e.settings.sales.nextQuote = 4;
  const q1 = e.quotes[0];
  e.invoices = [{
    id: 'pi_1', no: `PI-${new Date().getFullYear()}-001`, quoteId: q1.id, clientId: 'cl_aqua', date: d(-22), dueDate: d(-7), poNumber: 'AQP/PO/2291', currency: 'INR', status: 'issued',
    lines: q1.lines.map(l => ({ ...l })), discountMode: 'inline', discount: 0, toPayPercent: 50, paymentTerms: q1.paymentTerms,
    shipTo: 'AquaPure Industries, SIDCO Estate, Coimbatore', payments: [{ id: uid('pay'), date: d(-18), amount: 450000, note: 'Advance – NEFT' }],
    created: iso(-22), updated: iso(-18), sample: true,
  }];
  e.settings.sales.nextInvoice = 2;
  // attendance for the last ~6 weeks (skipping Sundays), plus two people already in today
  e.attendance = [];
  const ids = e.employees.map(x => x.userId);
  for (let k = 45; k >= 1; k--) {
    const day = d(-k);
    if (parseYmd(day).getDay() === 0) continue;
    ids.forEach((u, j) => {
      if ((k * 7 + j * 3) % 23 === 5) return; // the odd absence
      if (u === 'u_rsvp105' && k === 10) return; // on sick leave that day (see leaves below)
      const late = (k * 3 + j) % 7 === 0;
      e.attendance.push({ id: uid('at'), userId: u, date: day, in: late ? '09:4' + j : '09:0' + ((k + j) % 6), out: '18:' + String(10 + ((k * j) % 40)).padStart(2, '0'), mode: (k + j) % 5 === 0 ? 'site' : 'office', sample: true });
    });
  }
  if (parseYmd(t).getDay() !== 0) {
    e.attendance.push({ id: uid('at'), userId: 'u_rsvp105', date: t, in: '09:07', out: '', mode: 'office', sample: true });
    e.attendance.push({ id: uid('at'), userId: 'u_rsvp145', date: t, in: '09:41', out: '', mode: 'office', sample: true });
  }
  e.leaves = [
    { id: 'lv_1', userId: 'u_rsvp129', type: 'casual', from: d(3), to: d(4), half: false, reason: 'Family function', status: 'pending', created: iso(-1), sample: true },
    { id: 'lv_2', userId: 'u_rsvp105', type: 'sick', from: d(-10), to: d(-10), half: false, reason: 'Fever', status: 'approved', decidedBy: me, created: iso(-11), sample: true },
  ];
  e.holidays = [{ date: `${new Date().getFullYear()}-01-26`, name: 'Republic Day' }, { date: `${new Date().getFullYear()}-08-15`, name: 'Independence Day' }, { date: `${new Date().getFullYear()}-10-02`, name: 'Gandhi Jayanti' }];
  e.meetings = [
    { id: 'mt_1', kind: 'meeting', title: 'Technical clarification – GreenFlow', date: t, time: '15:00', duration: 45, platform: 'Google Meet', link: '', location: '', attendees: [me, 'u_rsvp105'], clientId: 'cl_green', leadId: 'ld_3', spaceId: null, purpose: 'Walk through ClO2 generator sizing and scope matrix', notes: '', actions: [], status: 'scheduled', created: iso(-3), sample: true },
    { id: 'mt_2', kind: 'visit', title: 'Site survey – Metro Utilities pumping station', date: d(2), time: '10:30', duration: 180, platform: 'In person', link: '', location: 'Kilpauk Water Works, Chennai', attendees: ['u_rsvp105', 'u_rsvp129'], clientId: 'cl_metro', leadId: 'ld_1', spaceId: null, purpose: 'Chlorine room layout and cylinder handling', notes: '', actions: [], fund: 2500, status: 'scheduled', created: iso(-2), sample: true },
    { id: 'mt_3', kind: 'meeting', title: 'Kick-off – AquaPure electrochlorinator', date: d(-4), time: '11:00', duration: 60, platform: 'Microsoft Teams', link: '', location: '', attendees: [me, 'u_rsvp129', 'u_rsvp105'], clientId: 'cl_aqua', leadId: 'ld_2', spaceId: null, purpose: 'Project kick-off after PO', notes: 'Client confirmed brine tank location. Power supply 415V available near the chlorine room. Delivery expected within 5 weeks.', actions: [
      { id: 'ac_1', text: 'Share GAD for client approval', owner: 'u_rsvp129', due: d(2), done: false, itemId: null },
      { id: 'ac_2', text: 'Confirm rectifier rating with vendor', owner: me, due: d(5), done: false, itemId: null },
      { id: 'ac_3', text: 'Send kick-off MoM to client', owner: 'u_rsvp105', due: d(-3), done: true, itemId: null },
    ], status: 'done', created: iso(-6), sample: true },
  ];
  e.announcements = [{ id: 'an_1', title: 'Welcome to your business apps', message: 'CRM, Sales, People, Meetings and Calculators now live next to Taskspace. Open the 9-dot menu at the top left to switch between them.', audience: 'all', pinned: true, at: iso(-1), by: me, sample: true }];
  e.calcs = [];
  e.log = [];
  e.recent = [];
  return e;
}

function erpLog(app, text, ref = null) {
  const e = erp();
  e.log.unshift({ id: uid('lg'), at: nowISO(), user: Store.state.me, app, text, ref });
  e.log = e.log.slice(0, 400);
}
function offChange(fn) { Store.listeners = Store.listeners.filter(f => f !== fn); }
function touchRecord(type, id) {
  const e = erp();
  e.recent = [{ type, id }, ...e.recent.filter(r => !(r.type === type && r.id === id))].slice(0, 30);
  Store.save(true);
}

/* lookups */
const client = id => erp().clients.find(x => x.id === id) || null;
const lead = id => erp().leads.find(x => x.id === id) || null;
const quote = id => erp().quotes.find(x => x.id === id) || null;
const invoice = id => erp().invoices.find(x => x.id === id) || null;
const meeting = id => erp().meetings.find(x => x.id === id) || null;
function personName(id, fallback = 'Unassigned') { const u = Store.user(id); return u ? u.name : fallback; }

/* money */
const CUR_SYMBOL = { INR: '₹', USD: '$', EUR: '€', GBP: '£', BHD: 'BD ', AED: 'AED ' };
function money(n, cur) {
  cur = cur || erpSet('sales').currency || 'INR';
  const v = Number(n) || 0;
  try { return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: Math.abs(v) < 100 && v % 1 ? 2 : 0 }).format(v); } catch (e) { return `${cur} ${Math.round(v)}`; }
}
function moneyShort(n, cur) {
  cur = cur || erpSet('sales').currency || 'INR';
  const v = Number(n) || 0, a = Math.abs(v), s = CUR_SYMBOL[cur] || cur + ' ';
  const f = x => (x >= 100 ? Math.round(x) : Math.round(x * 10) / 10).toString();
  if (cur === 'INR') { if (a >= 1e7) return `${s}${f(v / 1e7)} Cr`; if (a >= 1e5) return `${s}${f(v / 1e5)} L`; if (a >= 1e3) return `${s}${f(v / 1e3)} K`; return `${s}${Math.round(v)}`; }
  if (a >= 1e6) return `${s}${f(v / 1e6)}M`; if (a >= 1e3) return `${s}${f(v / 1e3)}K`; return `${s}${Math.round(v)}`;
}
/* every line on a document: a quotation's extra delivery locations count towards its grand total */
function docLines(doc) { return [...(doc.lines || []), ...(doc.locations || []).flatMap(x => x.lines || [])]; }
function lineTotals(doc) {
  let sub = 0, disc = 0, tax = 0;
  docLines(doc).forEach(l => {
    const g = (Number(l.qty) || 0) * (Number(l.price) || 0);
    const dp = doc.discountMode === 'total' ? (Number(doc.discount) || 0) : (Number(l.disc) || 0);
    const dv = g * dp / 100;
    sub += g; disc += dv; tax += (g - dv) * (Number(l.gst) || 0) / 100;
  });
  return { sub, disc, tax, total: sub - disc + tax };
}

/* statuses */
const pill = (name, cls) => `<span class="lozenge ${cls}">${esc(name)}</span>`;
const STAGE_CLS = { new: 'cat-todo', open: 'cat-progress', won: 'cat-done', lost: 'cat-danger' };
function stageOf(l) { const sts = erpSet('crm').stages; return sts.find(s => s.id === l.stageId) || sts[0]; }
function stagePill(l) { const s = stageOf(l); return s ? pill(s.name, STAGE_CLS[s.cat]) : ''; }
const isOpenLead = l => { if (l.junk) return false; const s = stageOf(l); return s && (s.cat === 'new' || s.cat === 'open'); }; // junk leads never count as pipeline

/* dates */
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function monthKey(s) { return (s || todayStr()).slice(0, 7); }
function monthLabel(k) { const [y, m] = k.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; }
function shiftMonth(k, n) { const [y, m] = k.split('-').map(Number); const dt = new Date(y, m - 1 + n, 1); return ymd(dt).slice(0, 7); }
function daysInMonth(k) { const [y, m] = k.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function fmtTime(hm) { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
function nowHM() { const n = new Date(); return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; }
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

/* ---------------- Records: open / label / search ---------------- */
function recordInfo(type, id) {
  switch (type) {
    case 'client': { const x = client(id); return x && { label: x.name, sub: x.industry || 'Client', icon: 'building', app: 'crm', href: `#/app/crm/clients/${x.id}` }; }
    case 'lead': { const x = lead(id); return x && { label: x.title, sub: `LD-${x.no} · ${x.company}`, icon: 'funnel', app: 'crm' }; }
    case 'quote': { const x = quote(id); return x && { label: x.no, sub: (client(x.clientId) || {}).name || 'Quotation', icon: 'quote', app: 'sales' }; }
    case 'invoice': { const x = invoice(id); return x && { label: x.no, sub: (client(x.clientId) || {}).name || 'Invoice', icon: 'receipt', app: 'sales' }; }
    case 'meeting': { const x = meeting(id); return x && { label: x.title, sub: `${fmtDate(x.date)} · ${x.kind === 'visit' ? 'Site visit' : 'Meeting'}`, icon: x.kind === 'visit' ? 'pin' : 'video', app: 'meet' }; }
    case 'employee': { const u = Store.user(id); return u && { label: u.name, sub: (empRecord(id) || {}).designation || 'Employee', icon: 'people', app: 'people', href: `#/app/people/employees/${id}` }; }
  }
  return null;
}
function openRecord(type, id) {
  const info = recordInfo(type, id);
  if (!info) { toast('That record no longer exists', 'error'); return; }
  if (info.href) { location.hash = info.href; return; }
  if (type === 'lead') openLead(id);
  if (type === 'quote') openQuote(id);
  if (type === 'invoice') openInvoice(id);
  if (type === 'meeting') openMeeting(id);
}
function recordChip(type, id) {
  const info = id && recordInfo(type, id);
  return info ? `<button class="rec-chip" data-rec="${type}:${id}" title="${esc(info.sub)}">${icon(info.icon, 12)}<span class="ellip">${esc(info.label)}</span></button>` : '';
}
/* one delegated handler so any [data-rec] anywhere opens its record */
document.addEventListener('click', e => {
  const r = e.target.closest && e.target.closest('[data-rec]');
  if (!r || r.closest('.popover')) return;
  const inner = e.target.closest('button, a, input, select, textarea, label');
  if (inner && inner !== r && r.contains(inner)) return; // let buttons inside a clickable row do their own thing
  e.preventDefault(); e.stopPropagation();
  const [type, id] = r.dataset.rec.split(':');
  closeAllModalsIfNeeded(type);
  openRecord(type, id);
}, true);
function closeAllModalsIfNeeded(type) { if (type === 'client' || type === 'employee') closeAllModals(); }

function erpSearch(q) {
  q = q.toLowerCase();
  const e = erp(), out = [];
  const has = (...xs) => xs.some(x => (x || '').toString().toLowerCase().includes(q));
  e.clients.filter(x => has(x.name, x.city, x.gst)).slice(0, 3).forEach(x => out.push(['client', x.id]));
  e.leads.filter(x => has(x.title, x.company, 'LD-' + x.no)).slice(0, 3).forEach(x => out.push(['lead', x.id]));
  e.quotes.filter(x => has(x.no, (client(x.clientId) || {}).name)).slice(0, 2).forEach(x => out.push(['quote', x.id]));
  e.invoices.filter(x => has(x.no, x.poNumber, (client(x.clientId) || {}).name)).slice(0, 2).forEach(x => out.push(['invoice', x.id]));
  e.meetings.filter(x => has(x.title, x.location)).slice(0, 2).forEach(x => out.push(['meeting', x.id]));
  return out.map(([type, id]) => ({ type, id, ...recordInfo(type, id) })).filter(x => x.label);
}

/* ---------------- 9-dot switcher ---------------- */
function openAppSwitcher(anchor) {
  const cur = currentAppId();
  const html = `<div class="app-switch">
    <div class="as-head"><span class="menu-heading">Switch to</span><button class="link small" data-value="__home">View all apps</button></div>
    <div class="as-grid">${enabledApps().map(a => `<button class="as-tile ${a.id === cur ? 'on' : ''}" data-value="${a.id}">${appIcon(a, 36)}<span class="as-name">${esc(a.name)}</span><span class="as-desc">${esc(a.short)}</span></button>`).join('')}</div>
    <div class="menu-sep"></div>
    <div class="menu"><button class="menu-item" data-value="__manage"><span class="mi-icon">${icon('gear')}</span><span class="mi-label">Manage apps</span></button></div></div>`;
  popover(anchor, html, {
    width: 420,
    onSelect(v) {
      if (v === '__home') location.hash = '#/apps';
      else if (v === '__manage') openManageApps();
      else location.hash = appHome(appById(v));
    },
  });
}
function appHome(a) {
  if (a.id === 'taskspace') {
    const sp = Store.space(Store.state.recent[0]) || Store.state.spaces[0];
    return sp ? `#/space/${encodeURIComponent(sp.key)}/board` : '#/for-you';
  }
  return `#/app/${a.id}/${a.tabs[0].id}`;
}

function openManageApps() {
  const e = erp();
  const rows = () => enabledOrder().map((a, i, arr) => `<div class="ma-row">${appIcon(a, 32)}<div class="grow"><b>${esc(a.name)}</b><div class="muted small">${esc(a.desc)}</div></div>
      <button class="icon-btn xs" data-ma-up="${a.id}" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('chevronUp', 14)}</button><button class="icon-btn xs" data-ma-down="${a.id}" ${i === arr.length - 1 ? 'disabled' : ''} title="Move down">${icon('chevronDown', 14)}</button>
      ${a.id === 'taskspace' ? '<span class="muted small ma-lock">Always on</span>' : `<label class="toggle-row inline"><input type="checkbox" data-ma="${a.id}" ${appEnabled(a) ? 'checked' : ''}><span class="toggle"></span></label>`}</div>`).join('');
  function enabledOrder() { const order = e.apps.order; const idx = a => { const i = order.indexOf(a.id); return i < 0 ? 99 : i; }; return APPS.slice().sort((a, b) => idx(a) - idx(b)); }
  openModal({
    title: 'Manage apps', width: 560,
    body: `<p class="muted">Turn apps on or off and choose their order in the 9-dot menu. Turning an app off hides it but keeps its data.</p><div class="ma-list">${rows()}</div>
      <div class="sep"></div><h4>Sample data</h4><p class="muted small">The apps started with a small sample business (clients, leads, quotes, people and meetings) so you could see how everything connects.</p>
      <button class="btn danger-text" data-ma-clear>${icon('trash', 14)} Remove sample data</button>`,
    footer: '<button class="btn primary" data-close>Done</button>',
    onMount(el) {
      const list = el.querySelector('.ma-list');
      const move = (id, dir) => {
        const ids = enabledOrder().map(a => a.id); const i = ids.indexOf(id); const j = i + dir;
        [ids[i], ids[j]] = [ids[j], ids[i]]; e.apps.order = ids; Store.save(); list.innerHTML = rows();
      };
      el.addEventListener('change', ev => {
        const id = ev.target.dataset.ma; if (!id) return;
        e.apps.disabled = ev.target.checked ? e.apps.disabled.filter(x => x !== id) : [...e.apps.disabled, id];
        Store.save(); toast(`${appById(id).name} turned ${ev.target.checked ? 'on' : 'off'}`);
      });
      el.addEventListener('click', async ev => {
        const up = ev.target.closest('[data-ma-up]'), dn = ev.target.closest('[data-ma-down]');
        if (up) move(up.dataset.maUp, -1);
        if (dn) move(dn.dataset.maDown, 1);
        if (ev.target.closest('[data-ma-clear]') && await confirmDialog({ title: 'Remove sample data?', message: 'Sample clients, leads, quotations, invoices, meetings, attendance and the three sample people are deleted. Anything you created stays.', confirmLabel: 'Remove' })) {
          removeSampleData(); toast('Sample data removed');
        }
      });
    },
  });
}
function removeSampleData() {
  const e = erp(), st = Store.state;
  ['clients', 'leads', 'catalog', 'quotes', 'invoices', 'attendance', 'leaves', 'meetings', 'announcements'].forEach(k => { e[k] = e[k].filter(x => !x.sample); });
  const gone = new Set(st.users.filter(u => u.sample).map(u => u.id));
  st.items.forEach(i => { if (gone.has(i.assignee)) i.assignee = null; if (gone.has(i.reporter)) i.reporter = st.me; });
  st.spaces.forEach(sp => { sp.approvals.approvers = sp.approvals.approvers.filter(x => !gone.has(x)); });
  st.users = st.users.filter(u => !u.sample);
  e.employees = e.employees.filter(x => !gone.has(x.userId) && !x.sample);
  e.recent = e.recent.filter(r => recordInfo(r.type, r.id));
  e.sample = false;
  Store.save();
}

/* ---------------- App shell ---------------- */
function renderAppHeader(app, r) {
  const tab = r.tab;
  const act = app.primary ? app.primary(r) : null;
  return `<div class="space-head app-head">
    <div class="sh-top">
      <div><a class="crumb" href="#/apps">Apps</a>
        <div class="sh-title">${appIcon(app, 24)}<h1>${esc(app.name)}</h1></div></div>
      <div class="sh-actions">${act ? `<button class="btn primary" data-app-act="primary">${icon('plus', 14)} ${esc(act.label)}</button>` : ''}
        <button class="icon-btn bordered" data-app-act="share" title="Copy link">${icon('share')}</button>
        <a class="icon-btn bordered" href="#/app/${app.id}/settings" title="${esc(app.name)} settings">${icon('gear')}</a></div>
    </div>
    <nav class="tabs">${app.tabs.map(t => { const n = t.count ? t.count() : 0; return `<a class="tab ${tab === t.id ? 'active' : ''}" href="#/app/${app.id}/${t.id}">${icon(t.icon)}<span>${t.name}</span>${n ? `<span class="count">${n}</span>` : ''}</a>`; }).join('')}</nav>
  </div>`;
}

function renderAppSidebar(app, r) {
  const shortcuts = app.shortcuts ? app.shortcuts() : [];
  const recent = erp().recent.map(x => ({ ...x, info: recordInfo(x.type, x.id) })).filter(x => x.info && x.info.app === app.id).slice(0, 5);
  const others = enabledApps().filter(a => a.id !== app.id);
  const hrefNow = location.hash;
  return `<div class="nav-scroll">
    <a class="nav-item" href="#/apps">${icon('arrowLeft')}<span class="label">All apps</span></a>
    <div class="app-side-head">${appIcon(app, 36)}<div class="ellip"><b>${esc(app.name)}</b><div class="muted small ellip">${esc(app.short)}</div></div></div>
    <div class="nav-heading">Views</div>
    ${app.tabs.map(t => `<a class="nav-item ${r.tab === t.id ? 'active' : ''}" href="#/app/${app.id}/${t.id}">${icon(t.icon)}<span class="label">${t.name}</span></a>`).join('')}
    ${shortcuts.length ? `<div class="nav-heading">Shortcuts</div>${shortcuts.map(s => s.href
      ? `<a class="nav-item ${hrefNow === s.href ? 'active' : ''}" href="${s.href}">${icon(s.icon)}<span class="label">${esc(s.label)}</span>${s.count ? `<span class="count">${s.count}</span>` : ''}</a>`
      : `<button class="nav-item" data-app-short="${s.id}">${icon(s.icon)}<span class="label">${esc(s.label)}</span>${s.count ? `<span class="count">${s.count}</span>` : ''}</button>`).join('')}` : ''}
    ${recent.length ? `<div class="nav-heading">Recent</div>${recent.map(x => `<button class="nav-item" data-rec="${x.type}:${x.id}">${icon(x.info.icon)}<span class="label">${esc(x.info.label)}</span></button>`).join('')}` : ''}
    <div class="nav-heading">Other apps</div>
    ${others.map(a => `<a class="nav-item" href="${appHome(a)}">${appIcon(a, 20)}<span class="label">${esc(a.name)}</span></a>`).join('')}
  </div>`;
}

function renderAppView(app, r, page) {
  if (!app.tabs.some(t => t.id === r.tab)) r.tab = app.tabs[0].id;
  page.className = `page app-page app-${app.id} tab-${r.tab}`;
  page.innerHTML = renderAppHeader(app, r) + '<div class="view" id="view"></div>';
  app.render(r.tab, $('#view'), r);
}

/* header + sidebar events for apps (bound once) */
function bindAppShell() {
  $('#page').addEventListener('click', e => {
    const b = e.target.closest('[data-app-act]');
    if (!b) return;
    const r = App.route; const app = appById(r.app);
    if (b.dataset.appAct === 'primary' && app.primary) app.primary(r).run(b);
    if (b.dataset.appAct === 'share') (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(() => toast('Link copied to clipboard'), () => toast('Could not copy link', 'error'));
  });
  $('#sidebar').addEventListener('click', e => {
    const b = e.target.closest('[data-app-short]');
    if (!b) return;
    const app = appById(App.route.app);
    const s = (app.shortcuts() || []).find(x => x.id === b.dataset.appShort);
    if (s && s.run) s.run(b);
  });
}

/* ---------------- Shared view helpers ---------------- */
function statCard(ic, value, label, sub = '', { tone = '', href = '' } = {}) {
  const tag = href ? 'a' : 'div';
  return `<${tag} class="stat-card kpi ${tone ? 'tone-' + tone : ''}" ${href ? `href="${href}"` : ''}><div class="stat-ic">${icon(ic, 20)}</div><div class="grow"><div class="kpi-val">${value}</div><div class="kpi-label">${label}</div>${sub ? `<div class="muted small">${sub}</div>` : ''}</div></${tag}>`;
}
function panel(title, sub, body, { wide = false, action = '' } = {}) {
  return `<section class="panel ${wide ? 'wide' : ''}"><div class="panel-head"><div><h3>${title}</h3>${sub ? `<p class="muted small">${sub}</p>` : ''}</div>${action}</div>${body}</section>`;
}
function miniEmpty(text) { return `<p class="muted small panel-empty">${text}</p>`; }
function subtabs(items, active) {
  return `<div class="subtabs">${items.map(t => `<a class="${active === t.id ? 'on' : ''}" href="${t.href}">${t.label}${t.count != null ? ` <span class="count">${t.count}</span>` : ''}</a>`).join('')}</div>`;
}
function selectHTML(name, options, value, { blank = null, cls = '', attrs = '' } = {}) {
  return `<select class="input ${cls}" name="${name}" ${attrs}>${blank != null ? `<option value="">${esc(blank)}</option>` : ''}${options.map(o => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return `<option value="${esc(v)}" ${String(v) === String(value == null ? '' : value) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
}
function userOptions() { return Store.state.users.map(u => ({ value: u.id, label: u.name + (u.id === Store.state.me ? ' (you)' : '') })); }
function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
/* read form fields [name] into an object */
function formData(el) {
  const o = {};
  $$('[name]', el).forEach(f => { if (f.type === 'checkbox') o[f.name] = f.checked; else if (f.type === 'radio') { if (f.checked) o[f.name] = f.value; } else o[f.name] = f.value; });
  return o;
}

/* ---------------- Settings page helpers ---------------- */
/* sections: [{ id, name, icon, html(), bind?(el) }] */
function appSettingsPage(app, root, r, sections) {
  const sub = sections.some(s => s.id === r.sub) ? r.sub : sections[0].id;
  const sec = sections.find(s => s.id === sub);
  root.innerHTML = `<div class="app-settings">
    <aside class="aps-nav"><div class="nav-heading">${esc(app.name)} settings</div>
      ${sections.map(s => `<a class="nav-item ${s.id === sub ? 'active' : ''}" href="#/app/${app.id}/settings/${s.id}">${icon(s.icon)}<span class="label">${s.name}</span></a>`).join('')}
      <div class="nav-heading">Everywhere</div>
      <a class="nav-item ${sub === 'company' ? 'active' : ''}" href="#/app/${app.id}/settings/company">${icon('building')}<span class="label">Company details</span></a>
      <button class="nav-item" data-open-manage>${icon('apps')}<span class="label">Manage apps</span></button>
    </aside>
    <div class="aps-main">${sub === 'company' ? companySettingsHTML() : sec.html()}</div></div>`;
  const main = root.querySelector('.aps-main');
  bindSettingsInputs(main);
  if (sub !== 'company' && sec.bind) sec.bind(main);
  root.querySelector('[data-open-manage]').addEventListener('click', openManageApps);
}
function companySettingsHTML() {
  const c = erpSet('company');
  return `<h2>Company details</h2><p class="muted">Used on quotations, invoices and printed documents in every app.</p>
    <div class="panel settings-panel"><div class="form-grid">
      <label class="field"><span class="field-label">Company name</span><input class="input" data-setting="company.name" value="${esc(c.name)}"></label>
      <label class="field"><span class="field-label">GSTIN</span><input class="input" data-setting="company.gst" value="${esc(c.gst)}"></label>
      <label class="field"><span class="field-label">Phone</span><input class="input" data-setting="company.phone" value="${esc(c.phone)}"></label>
      <label class="field"><span class="field-label">Email</span><input class="input" data-setting="company.email" value="${esc(c.email)}"></label>
    </div>
    <label class="field"><span class="field-label">Address</span><textarea class="input" rows="3" data-setting="company.address">${esc(c.address)}</textarea></label>
    <label class="field"><span class="field-label">Website</span><input class="input" data-setting="company.website" value="${esc(c.website)}" placeholder="https://"></label></div>`;
}
function bindSettingsInputs(root) {
  root.addEventListener('change', e => {
    const k = e.target.dataset.setting;
    if (!k) return;
    const [a, b] = k.split('.');
    const t = e.target;
    erp().settings[a][b] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) : t.value;
    Store.save(true); toast('Saved');
  });
}
/* an editable list of names (sources, industries, platforms…) */
function listEditorHTML(key, values, placeholder = 'Add an option') {
  return `<div class="list-editor" data-list="${key}">${values.map((v, i) => `<div class="le-row"><span class="le-grip">${icon('drag', 14)}</span><input class="input le-input" value="${esc(v)}" data-le-i="${i}">
      <button class="icon-btn xs" data-le-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('chevronUp', 14)}</button><button class="icon-btn xs" data-le-del="${i}" title="Remove">${icon('trash', 14)}</button></div>`).join('')}
    <div class="le-add"><input class="input" placeholder="${esc(placeholder)}" data-le-new><button class="btn" data-le-add>${icon('plus', 14)} Add</button></div></div>`;
}
function bindListEditor(root, getArr, redraw) {
  const arr = getArr();
  const commit = msg => { Store.save(true); toast(msg); redraw(); };
  root.addEventListener('change', e => { const i = e.target.dataset.leI; if (i == null) return; const v = e.target.value.trim(); if (!v) { e.target.value = arr[i]; return; } arr[i] = v; commit('Saved'); });
  root.addEventListener('click', e => {
    const d = e.target.closest('[data-le-del]'), u = e.target.closest('[data-le-up]'), a = e.target.closest('[data-le-add]');
    if (d) { arr.splice(Number(d.dataset.leDel), 1); commit('Removed'); }
    if (u) { const i = Number(u.dataset.leUp); [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; commit('Reordered'); }
    if (a) add();
  });
  root.addEventListener('keydown', e => { if (e.target.matches('[data-le-new]') && e.key === 'Enter') add(); });
  function add() { const inp = root.querySelector('[data-le-new]'); const v = inp.value.trim(); if (!v) return; if (arr.includes(v)) { toast('Already in the list', 'error'); return; } arr.push(v); commit('Added'); }
}

/* ---------------- Apps home ---------------- */
function renderAppsHome(root) {
  const e = erp(), st = Store.state, t = todayStr(), me = st.me;
  const apps = enabledApps();
  const on = id => apps.some(a => a.id === id);
  const openLeads = e.leads.filter(isOpenLead);
  const pipeline = openLeads.reduce((s, l) => s + (Number(l.value) || 0), 0);
  const outstanding = e.invoices.filter(i => i.status !== 'cancelled' && i.status !== 'draft').reduce((s, i) => s + invoiceBalance(i), 0);
  const presentToday = e.attendance.filter(a => a.date === t && a.in).length;
  const meetingsToday = e.meetings.filter(m => m.date === t && m.status !== 'cancelled');
  const myOpen = st.items.filter(i => i.assignee === me && !Store.isDone(i));
  const dueToday = st.items.filter(i => i.due === t && !Store.isDone(i));
  const onLeave = e.leaves.filter(l => l.status === 'approved' && l.from <= t && l.to >= t);
  const myAtt = e.attendance.find(a => a.userId === me && a.date === t);
  // revenue: invoiced vs collected, last 6 months
  const months = []; for (let k = 5; k >= 0; k--) months.push(shiftMonth(monthKey(t), -k));
  const invoiced = months.map(m => e.invoices.filter(i => i.status !== 'draft' && i.status !== 'cancelled' && monthKey(i.date) === m).reduce((s, i) => s + lineTotals(i).total, 0));
  const collected = months.map(m => e.invoices.reduce((s, i) => s + (i.payments || []).filter(p => monthKey(p.date) === m).reduce((a, p) => a + Number(p.amount || 0), 0), 0));
  const stages = erpSet('crm').stages.filter(s => s.cat === 'new' || s.cat === 'open');
  const byStage = stages.map(s => ({ s, v: openLeads.filter(l => l.stageId === s.id).reduce((a, l) => a + (Number(l.value) || 0), 0), n: openLeads.filter(l => l.stageId === s.id).length }));
  const anns = e.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at)).slice(0, 3);
  const acts = [...e.log.map(x => ({ at: x.at, user: x.user, text: x.text, app: appById(x.app), ref: x.ref })),
    ...st.activity.slice(0, 30).map(x => ({ at: x.at, user: x.user, text: x.text, app: appById('taskspace'), item: x.itemId && Store.item(x.itemId) }))]
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  const tiles = apps.map(a => {
    const stats = a.stats ? a.stats() : [];
    return `<a class="app-card" href="${appHome(a)}" style="--ac:${a.color}">
      <div class="app-card-top">${appIcon(a, 40)}<div class="grow"><b>${esc(a.name)}</b><div class="muted small">${esc(a.desc)}</div></div>${icon('chevronRight', 16)}</div>
      <div class="app-card-stats">${stats.map(s => `<div><div class="acs-val">${s.value}</div><div class="muted small">${esc(s.label)}</div></div>`).join('')}</div></a>`;
  }).join('');
  const agenda = [
    ...meetingsToday.map(m => ({ time: m.time || '', html: `<div class="ag-row" data-rec="meeting:${m.id}"><span class="ag-time">${fmtTime(m.time) || 'All day'}</span>${icon(m.kind === 'visit' ? 'pin' : 'video', 14)}<span class="ellip grow">${esc(m.title)}</span>${m.clientId ? `<span class="muted small ellip">${esc((client(m.clientId) || {}).name || '')}</span>` : ''}</div>` })),
    ...dueToday.map(i => ({ time: '23:59', html: `<div class="ag-row" data-open-item="${i.id}"><span class="ag-time">Due</span>${typeIcon(i.type, 14)}<span class="ellip grow">${esc(i.summary)}</span><span class="muted small">${esc(i.key)}</span></div>` })),
    ...e.quotes.filter(q => q.status === 'sent' && q.validUntil === t).map(q => ({ time: '23:58', html: `<div class="ag-row" data-rec="quote:${q.id}"><span class="ag-time">Expires</span>${icon('quote', 14)}<span class="ellip grow">${esc(q.no)} · ${esc((client(q.clientId) || {}).name || '')}</span></div>` })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  root.innerHTML = `<div class="apps-home">
    <div class="ah-hero">
      <div><div class="muted small">${DOW_LONG[new Date().getDay()]}, ${fmtDate(t)}</div><h1>${greeting()}, ${esc(Store.me().name.split(' ')[0])}</h1>
        <p class="muted">Here's how the business is doing across your apps today.</p></div>
      <div class="row gap8">
        ${on('people') ? (myAtt && !myAtt.out ? `<button class="btn" data-ah="checkout">${icon('logout', 14)} Check out <span class="muted small">in since ${fmtTime(myAtt.in)}</span></button>` : myAtt ? `<span class="done-chip">${icon('checkCircle', 14)} Checked out at ${fmtTime(myAtt.out)}</span>` : `<button class="btn" data-ah="checkin">${icon('login', 14)} Check in</button>`) : ''}
        <button class="btn" data-ah="manage">${icon('gear', 14)} Manage apps</button>
      </div>
    </div>
    <div class="stat-row five">
      ${on('crm') ? statCard('funnel', moneyShort(pipeline), 'Open pipeline', `${openLeads.length} open lead${openLeads.length === 1 ? '' : 's'}`, { href: '#/app/crm/leads' }) : ''}
      ${on('sales') ? statCard('receipt', moneyShort(outstanding), 'To collect', 'Outstanding on invoices', { tone: outstanding ? 'warn' : '', href: '#/app/sales/invoices' }) : ''}
      ${on('people') ? statCard('people', `${presentToday}<span class="unit">/${peopleList().length}</span>`, 'Present today', onLeave.length ? `${onLeave.length} on leave` : 'Nobody on leave', { href: '#/app/people/attendance?view=day' }) : ''}
      ${on('meet') ? statCard('video', meetingsToday.length, 'Meetings today', meetingsToday[0] ? `Next: ${fmtTime(meetingsToday[0].time)}` : 'Your day is clear', { href: '#/app/meet/schedule' }) : ''}
      ${statCard('checkCircle', myOpen.length, 'My open work', `${dueToday.length} due today`, { href: '#/for-you?tab=assigned' })}
    </div>
    <div class="sec-head"><h3>Your apps</h3><span class="muted small">${apps.length} apps · all connected</span></div>
    <div class="app-cards">${tiles}</div>
    <div class="sum-grid">
      ${on('crm') ? panel('Sales pipeline', 'Value of open leads by stage.', openLeads.length ? hbars(byStage.map(x => ({ label: `<span class="ellip">${esc(x.s.name)}</span>`, value: x.v, display: moneyShort(x.v), tip: `${x.n} lead${x.n === 1 ? '' : 's'} · ${money(x.v)}` })), Math.max(1, ...byStage.map(x => x.v))) : miniEmpty('No open leads.'), { action: '<a class="link small" href="#/app/crm/summary">Open CRM</a>' }) : ''}
      ${on('sales') ? panel('Revenue', 'Invoiced vs. collected over the last 6 months.', `<div class="legend-inline"><span><span class="sw line" style="background:var(--series-1)"></span>Invoiced</span><span><span class="sw line" style="background:var(--series-2)"></span>Collected</span></div>
        ${groupedBars(months.map((m, i) => ({ label: MONTHS[Number(m.slice(5)) - 1], a: invoiced[i], b: collected[i], tip: `${monthLabel(m)} — Invoiced ${money(invoiced[i])} · Collected ${money(collected[i])}` })))}`, { action: '<a class="link small" href="#/app/sales/summary">Open Sales</a>' }) : ''}
      ${panel('Today', 'Meetings, work due and expiring quotes.', agenda.length ? `<div class="agenda">${agenda.map(a => a.html).join('')}</div>` : miniEmpty('Nothing scheduled for today.'))}
      ${on('people') ? panel('Announcements', 'Latest news for the team.', anns.length ? anns.map(a => `<div class="ann-mini">${a.pinned ? `<span class="pin-tag">${icon('pin', 12)} Pinned</span>` : ''}<b>${esc(a.title)}</b><div class="muted small clamp2">${esc(a.message)}</div><div class="muted small">${esc(personName(a.by, ''))} · ${timeAgo(a.at)}</div></div>`).join('') : miniEmpty('No announcements yet.'), { action: '<a class="link small" href="#/app/people/announcements">View all</a>' }) : ''}
      ${panel('Recent activity', 'What changed across every app.', acts.length ? `<div class="activity">${acts.map(a => `<div class="act-row">${avatar(a.user, 28)}<div class="grow"><b>${esc(personName(a.user, ''))}</b> ${esc(a.text)}
        ${a.ref ? recordChip(a.ref.type, a.ref.id) : ''}${a.item ? `<a class="link" data-open-item="${a.item.id}">${esc(a.item.key)}</a>` : ''}
        <div class="muted small">${a.app ? `${appIcon(a.app, 12)} ${esc(a.app.name)} · ` : ''}${timeAgo(a.at)}</div></div></div>`).join('')}</div>` : miniEmpty('No activity yet.'), { wide: true })}
    </div></div>`;
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-ah]');
    const oi = ev.target.closest('[data-open-item]');
    if (oi) openItem(oi.dataset.openItem);
    if (!b) return;
    if (b.dataset.ah === 'manage') openManageApps();
    if (b.dataset.ah === 'checkin') checkIn();
    if (b.dataset.ah === 'checkout') checkOut();
  });
}

/* two bars per group (e.g. invoiced vs collected), money on hover */
function groupedBars(rows, height = 180) {
  const max = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
  return `<div class="gbars" style="height:${height + 24}px">${rows.map(r => `<div class="gb-col" data-tip="${esc(r.tip)}"><div class="gb-bars" style="height:${height}px">
      <span class="gb-bar a" style="height:${(r.a / max) * 100}%"></span><span class="gb-bar b" style="height:${(r.b / max) * 100}%"></span></div><div class="gb-x">${r.label}</div></div>`).join('')}</div>`;
}

/* ---------------- Taskspace, registered as an app ---------------- */
registerApp({
  id: 'taskspace', name: 'Taskspace', short: 'Projects & work', desc: 'Spaces, boards, timelines, approvals and docs', color: '#669DF1', glyph: 'logo', builtin: true, tabs: [],
  stats() {
    const st = Store.state;
    return [{ label: 'Spaces', value: st.spaces.length }, { label: 'Open work', value: st.items.filter(i => !Store.isDone(i)).length }, { label: 'Overdue', value: st.items.filter(i => i.due && i.due < todayStr() && !Store.isDone(i)).length }];
  },
});
