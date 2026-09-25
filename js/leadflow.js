/* Lead spaces: the ERP's Sales tasks (Requirement Engineering, Proposal, Follow Ups, Spares) as Taskspace
 * tasks you finish from the task itself.
 *   item.lf    = { id, values, link, autoKey }    id points into LF_TASKS ('group:re' for a stage's parent task)
 *   folder.lead = { kind, templateId, spareTemplateId, stageId }   kind 'System' | 'Spare': the lead type whose spaces go there
 *                 every space created in the folder starts from the template; a lead reaching stageId
 *                 gets its own space there automatically
 *   leadFlowSync() runs on every save: an open task whose record now exists in another app (a quotation
 *   in Sales, a saved sizing in Calculators, a finished site visit in Meetings…) is finished for you.
 */

const LF_SYSTEMS = ['Gas Chlorinator', 'Evaporator (steam)', 'Evaporator (electrical)', 'Evaporator (heater)', 'Clo2 (1 chem)', 'Clo2 (2 chem)', 'Clo2 (3 chem)', 'Sodium Hypo', 'Absorption System', 'Neutralization System', 'E-Chloro (Batch)', 'E-Chloro (Contin.)'];
const LF_GROUPS = { re: 'Requirement Engineering', pr: 'Proposal', fu: 'Follow Ups', sp: 'Spares', pc: 'Procurement', pd: 'Production', lg: 'Logistics/Dispatch', in: 'Installation' };
const LF_RESELL = ['vendor-selection', 'vendor-quotation', 'vendor-po'];
const LF_TPL_SYSTEM = 'ttpl_sales_system', LF_TPL_SPARE = 'ttpl_sales_spare';

/* how: form (fill in here) · doc (attach / paste here) · review (project-team approval) · quote · send · invoice · calc · meeting (done in another app, finished automatically)
   lock: part of the Requirement Engineering lock (ERP: those tasks can't be worked until every one of them is assigned)
   sys: asks which system (from System Requirement) it is for · reviewLock: locked once the project team approves the documents */
const lfDoc = (group, name, desc, extra = {}) => ({ group, name, how: 'doc', desc, ...extra });
const LF_TASKS = {
  /* ---- Requirement Engineering (each task is locked until someone is assigned to it) ---- */
  'system-requirement': { group: 're', name: 'System Requirement', how: 'form', priority: 'high', lock: true, desc: 'Pick the systems this lead needs, with capacity. Tick PRE/POST when the system needs separate PRE and POST design calculations. Every other Requirement Engineering task asks which of these systems it is for.',
    fields: [{ k: 'rows', label: 'Systems', type: 'table', req: true, cols: [{ k: 'system', label: 'System', type: 'select', options: LF_SYSTEMS, w: 230 }, { k: 'capacity', label: 'Capacity', w: 160 }, { k: 'prepost', label: 'PRE/POST', type: 'check', w: 90 }] }, { k: 'notes', label: 'Notes', type: 'textarea' }] },
  'questionnaires': { group: 're', name: 'Questionnaires', how: 'form', lock: true, sys: true, desc: 'Fill the system questionnaire here, or attach a form the client already filled.', after: ['system-requirement'], attach: true,
    fields: [
      { k: 'flow', label: 'Flow rate to treat (m³/h)', type: 'number' }, { k: 'dose', label: 'Dose (ppm)', type: 'number' },
      { k: 'water', label: 'Water to treat', type: 'select', options: ['Raw water', 'Treated water', 'Drinking water', 'Sea water', 'Effluent / STP', 'Cooling water'] },
      { k: 'residual', label: 'Residual required (ppm)', type: 'number' }, { k: 'hours', label: 'Operating hours per day', type: 'number' },
      { k: 'power', label: 'Power available', type: 'text', ph: 'e.g. 415 V, 3 phase' },
      { k: 'site', label: 'Site conditions', type: 'textarea', ph: 'Indoor / outdoor, space available, access, hazardous area…' },
    ] },
  'design-calculation': { group: 're', name: 'Design Calculation', how: 'calc', priority: 'high', lock: true, reviewLock: true, desc: 'Size the system in Calculators and save it against this lead. BOQ and Process Data Sheet are built from this output.', after: ['system-requirement'] },
  'design-calculation-post': { group: 're', name: 'POST Design Calculation', how: 'calc', priority: 'high', lock: true, reviewLock: true, desc: 'The POST calculation for systems marked PRE/POST in System Requirement. Save it against this lead in Calculators.', after: ['system-requirement'] },
  'boq': { group: 're', name: 'BOQ', how: 'form', priority: 'high', lock: true, sys: true, reviewLock: true, desc: 'Bill of Quantities, built from the Design Calculation output. Rows prefill the quotation. Locked once the project team approves the documents.', after: ['design-calculation'],
    fields: [{ k: 'rows', label: 'Bill of Quantities', type: 'table', req: true, catalog: true, cols: [{ k: 'item', label: 'Item', w: 240 }, { k: 'spec', label: 'Specification' }, { k: 'qty', label: 'Qty', type: 'number', w: 80 }, { k: 'unit', label: 'Unit', w: 80 }, { k: 'make', label: 'Make', w: 120 }] }] },
  'process-data-sheet': { group: 're', name: 'Process Data Sheet', how: 'form', lock: true, sys: true, desc: 'Equipment process data (pumps, tanks, reactor…), built from the Design Calculation output.', after: ['design-calculation'],
    fields: [{ k: 'rows', label: 'Equipment data', type: 'table', req: true, cols: [{ k: 'equip', label: 'Equipment', w: 200 }, { k: 'param', label: 'Parameter' }, { k: 'value', label: 'Value', w: 120 }, { k: 'unit', label: 'Unit', w: 90 }] }] },
  'scope-matrix': { group: 're', name: 'Scope Matrix', how: 'form', lock: true, sys: true, reviewLock: true, desc: 'Who does what: tick RSVP or Client for every scope item. Locked once the project team approves the documents.', after: ['system-requirement'],
    fields: [{ k: 'rows', label: 'Scope of supply', type: 'table', req: true, cols: [{ k: 'item', label: 'Scope item' }, { k: 'rsvp', label: 'RSVP', type: 'check', w: 70 }, { k: 'client', label: 'Client', type: 'check', w: 70 }, { k: 'remarks', label: 'Remarks', w: 200 }],
      def: [['Supply of equipment as per BOQ', 1, 0], ['Unloading and storage at site', 0, 1], ['Civil works and foundations', 0, 1], ['Power supply up to the control panel', 0, 1], ['Chlorine cylinders / tonners / salt', 0, 1], ['Motive water for the injector', 0, 1], ['Installation', 1, 0], ['Piping beyond battery limit', 0, 1], ['Testing and commissioning', 1, 0], ['Operator training', 1, 0]].map(([item, rsvp, client]) => ({ item, rsvp: !!rsvp, client: !!client, remarks: '' })) }] },
  'pid': lfDoc('re', 'P&ID', 'Attach the P&ID for the selected system. Locked once the project team approves the documents.', { lock: true, sys: true, reviewLock: true, after: ['system-requirement'] }),
  'gad': lfDoc('re', 'GAD', 'Attach the General Arrangement Drawing for the selected system.', { lock: true, sys: true, after: ['system-requirement'] }),
  'datasheets': lfDoc('re', 'Technical Datasheets', 'Attach the technical datasheets for the selected system.', { lock: true, sys: true, after: ['system-requirement'] }),
  'foundation-load': { group: 're', name: 'Foundation Load', how: 'form', attach: true, lock: true, sys: true, desc: 'Request the foundation load from an employee (they are notified), then record their answer here.', after: ['system-requirement'],
    fields: [{ k: 'from', label: 'Request from', type: 'user', req: true }, { k: 'load', label: 'Static load (kN)', type: 'number' }, { k: 'dynamic', label: 'Dynamic load (kN)', type: 'number' }, { k: 'notes', label: 'Notes', type: 'textarea' }] },
  'maintenance-plan': { group: 're', name: 'Maintenance Plan (QAP)', how: 'form', lock: true, desc: 'Quality Assurance Plan: what is tested at which stage and who witnesses it.',
    fields: [{ k: 'rows', label: 'Quality Assurance Plan', type: 'table', req: true, cols: [{ k: 'test', label: 'Test / inspection' }, { k: 'stage', label: 'Stage', w: 150 }, { k: 'rsvp', label: 'RSVP', type: 'check', w: 64 }, { k: 'client', label: 'Client', type: 'check', w: 64 }, { k: 'tpi', label: 'TPI', type: 'check', w: 56 }],
      def: [['Material test certificates', 'Raw material'], ['Dimensional inspection', 'In process'], ['Hydro test', 'In process'], ['Vacuum leak test', 'Final'], ['Performance test at works', 'Final'], ['Painting / finish inspection', 'Final']].map(([test, stage]) => ({ test, stage, rsvp: true, client: false, tpi: false })) }] },
  'control-philosophy': lfDoc('re', 'Control philosophy', 'Write or paste the control philosophy for the selected systems, or attach it.', { lock: true }),
  'performance-guarantee': lfDoc('re', 'Performance Guarantee', 'Write or attach the performance guarantee for this offer.', { lock: true }),
  'operating-cost': { group: 're', name: 'Operating Cost', how: 'form', lock: true, desc: 'Daily consumables and power, rolled up into a monthly running cost.',
    fields: [{ k: 'rows', label: 'Consumables', type: 'table', req: true, cols: [{ k: 'item', label: 'Consumable' }, { k: 'qty', label: 'Qty per day', type: 'number', w: 110 }, { k: 'unit', label: 'Unit', w: 80 }, { k: 'rate', label: 'Rate (₹)', type: 'number', w: 110 }],
      def: [{ item: 'Power', qty: '', unit: 'kWh', rate: '' }, { item: 'Salt / chemical', qty: '', unit: 'kg', rate: '' }],
      total: rows => rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0) * 30, totalLabel: 'Monthly running cost (30 days)', money: true }] },
  'om-manual': lfDoc('re', 'O & M Manual', 'Attach the Operation & Maintenance manual.', { lock: true }),
  /* ---- Proposal ---- */
  'client-documents': lfDoc('pr', 'Client Documents', 'Upload what the client sent: tender specification, drawings, enquiry mail. This is the "Client Input" the project team reviews against.'),
  'company-profile': lfDoc('pr', 'Company Profile', 'Attach the company profile to send with the offer.'),
  'product-brochure': lfDoc('pr', 'Product Brochure', 'Attach the product brochure / catalogue for the offered system.'),
  'budget-list': { group: 'pr', name: 'Budget List', how: 'form', desc: 'Internal cost budget for the offer.',
    fields: [{ k: 'rows', label: 'Budget', type: 'table', req: true, catalog: true, cols: [{ k: 'item', label: 'Item', w: 240 }, { k: 'qty', label: 'Qty', type: 'number', w: 80 }, { k: 'cost', label: 'Unit cost (₹)', type: 'number', w: 130 }, { k: 'supplier', label: 'Supplier / make', w: 160 }],
      total: rows => rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.cost) || 0), 0), totalLabel: 'Total budget', money: true }] },
  'quotation': { group: 'pr', name: 'Quotation', how: 'quote', priority: 'high', desc: 'Create the quotation from here; lines are prefilled from the BOQ. Finished as soon as a quotation for this lead is saved in Sales.' },
  'doc-review': { group: 'pr', name: 'Project team review', how: 'review', approval: true, priority: 'high', desc: 'The project team checks the BOQ, Scope Matrix and P&ID (plus Design Calculation, GAD and PDS when done) against the Client Input. Approving locks those documents. To correct something, decline, fix it in its task, and submit again.',
    after: ['client-documents', 'boq', 'scope-matrix', 'pid', 'quotation'] },
  'send-quotation': { group: 'pr', name: 'Send quotation to client', how: 'send', desc: 'Email the approved quotation to the client. Finished when a quotation for this lead is marked Sent in Sales.' },
  /* ---- Follow Ups ---- */
  'production-clearance': lfDoc('fu', 'Production Clearance / Project Approval', 'Upload the production clearance / project approval document.'),
  'purchase-order': { group: 'fu', name: 'Purchase Order', how: 'form', attach: true, priority: 'high', desc: 'Upload the client\'s PO and cross-check it with the quotation. Finishing it moves the lead to PO received; winning the lead in CRM finishes it too.',
    fields: [{ k: 'poNumber', label: 'PO number', type: 'text', req: true }, { k: 'poDate', label: 'PO date', type: 'date' }, { k: 'poValue', label: 'PO value (₹, before tax)', type: 'number' }, { k: 'check', label: 'Cross-checked with the quotation', type: 'checks', options: ['Items and quantities', 'Prices', 'Payment terms', 'Delivery terms'] }] },
  'proforma-invoice': { group: 'fu', name: 'Proforma Invoice', how: 'invoice', desc: 'Create the proforma invoice (split it into 2–3 payment invoices if needed). Finished as soon as it is saved in Sales.' },
  'confirmation-status': { group: 'fu', name: 'Confirmation Status', how: 'form', desc: 'Proceed for procurement, which turns this into a project and adds the Procurement, Production, Logistics and Installation stages. Or record why the client is not proceeding.',
    fields: [{ k: 'proceed', label: 'Decision', type: 'select', options: ['Proceed for procurement', 'Not proceeding'], req: true }, { k: 'reason', label: 'Reason / remarks', type: 'textarea' }],
    check: v => (v.proceed === 'Not proceeding' && !String(v.reason || '').trim() ? 'Add the reason the client is not proceeding' : null) },
  /* ---- Spares ---- */
  'spare-category': { group: 'sp', name: 'Spare Category', how: 'form', priority: 'high', desc: 'Own Make or Resell. For Own Make the vendor tasks are marked Not Needed.',
    fields: [{ k: 'category', label: 'Category', type: 'select', options: ['Own Make', 'Resell'], req: true }] },
  'spare-client-requirement': { group: 'sp', name: 'Client Requirement', how: 'form', desc: 'The items the client needs. Rows are used to prefill the quotation.',
    fields: [{ k: 'rows', label: 'Items', type: 'table', req: true, catalog: true, cols: [{ k: 'item', label: 'Item', w: 240 }, { k: 'qty', label: 'Qty', type: 'number', w: 80 }, { k: 'spec', label: 'Description' }, { k: 'remarks', label: 'Remarks', w: 160 }] }] },
  'spare-gad': lfDoc('sp', 'GAD', 'Attach the GAD for this item. Required for Own Make, optional for Resell.'),
  'spare-production-clearance': lfDoc('sp', 'Production Clearance', 'Attach the client\'s production clearance. Required for Own Make, optional for Resell.'),
  'vendor-selection': { group: 'sp', name: 'Vendor Selection', how: 'form', desc: 'Resell only: the vendor you buy from (existing / new / risky).',
    fields: [{ k: 'vendor', label: 'Vendor name', type: 'text', req: true }, { k: 'type', label: 'Vendor type', type: 'select', options: ['Existing', 'New', 'Risky'] }, { k: 'contact', label: 'Contact', type: 'text' }] },
  'vendor-quotation': lfDoc('sp', 'Upload Vendor\'s Final Quotation', 'Resell only: attach the vendor\'s final quotation.'),
  'vendor-po': { group: 'sp', name: 'Raise PO', how: 'form', attach: true, desc: 'Resell only: raise the purchase order on the vendor.',
    fields: [{ k: 'poNumber', label: 'Vendor PO number', type: 'text', req: true }, { k: 'amount', label: 'PO amount (₹)', type: 'number' }] },
  /* ---- added when Confirmation Status is "Proceed for procurement" (ERP: the sales record becomes a project) ---- */
  ...lfSimpleStage('pc', [
    ['priority-list', 'Get Priority List from Production Team', [{ k: 'priorities', label: 'Priority List', type: 'textarea', req: true }]],
    ['vendor-details', 'Vendor Details (Existing/New/Risky, contact, type)', [{ k: 'vendorName', label: 'Vendor Name', type: 'text', req: true }, { k: 'vendorType', label: 'Type', type: 'select', options: ['Existing', 'New', 'Risky'] }, { k: 'vendorContact', label: 'Contact', type: 'text' }]],
    ['enquiry-track', 'Enquiry Tracking (set Reminders)', [{ k: 'reminder', label: 'Reminder', type: 'textarea', req: true }]],
    ['vendor-docs', 'Upload Quotes, Datasheet, images from vendor', null],
    ['comparison', 'Comparison Sheet', [{ k: 'comparison', label: 'Comparison Sheet', type: 'textarea', req: true }]],
    ['requirement-check', 'Confirm requirement match with datasheets', [{ k: 'confirmed', label: 'Requirement Match', type: 'select', options: ['Confirmed', 'Mismatch'], req: true }]],
    ['vendor-visit', 'Vendor Visit Needed?', [{ k: 'visitRequired', label: 'Vendor Visit Needed?', type: 'select', options: ['Yes', 'No'], req: true }]],
    ['payment-review', 'Review Payment Terms, Price, Advance Budgeting', [{ k: 'reviewed', label: 'Review Notes', type: 'textarea', req: true }]],
    ['raise-po', 'Raise PO', [{ k: 'poNumber', label: 'PO Number', type: 'text', req: true }]],
    ['payment-request', 'Raise Payment Requests to Accounts', [{ k: 'requestNumber', label: 'Request Number', type: 'text', req: true }]],
  ]),
  ...lfSimpleStage('pd', [['production-notes', 'Production', [{ k: 'notes', label: 'Notes', type: 'textarea', req: true }]]]),
  ...lfSimpleStage('lg', [
    ['packing-list', 'Packing List (BOQ)', [{ k: 'packingList', label: 'Packing List', type: 'textarea', req: true }]],
    ['delivery-challan', 'Delivery Challan', [{ k: 'challanNumber', label: 'Delivery Challan', type: 'text', req: true }]],
    ['eway-bill', 'E-Way Bill', [{ k: 'ewayNumber', label: 'E-Way Bill', type: 'text', req: true }]],
    ['dispatch-datasheet', 'Datasheet', null],
    ['test-cert', 'Test Certificate', [{ k: 'certNumber', label: 'Certificate', type: 'text', req: true }]],
    ['dispatch-proforma', 'Proforma Invoice', [{ k: 'invoiceNumber', label: 'Invoice Number', type: 'text', req: true }]],
    ['transport-details', 'Driver/Transport Details', [{ k: 'driverName', label: 'Driver Name', type: 'text', req: true }, { k: 'vehicle', label: 'Vehicle', type: 'text' }]],
    ['einvoice', 'E-Invoice', [{ k: 'invoiceNumber', label: 'E-Invoice', type: 'text', req: true }]],
    ['receiver-copy', 'Receiver Copy', [{ k: 'received', label: 'Receiver Copy', type: 'select', options: ['Pending', 'Received'], req: true }]],
    ['balance-payment', 'Check Balance Payment', [{ k: 'balanceAmount', label: 'Balance Amount', type: 'text', req: true }]],
  ]),
  ...lfSimpleStage('in', [['installation-notes', 'Installation & Commissioning', [{ k: 'notes', label: 'Notes', type: 'textarea', req: true }]]]),
};
/* ERP "simpleSubtask" stages: a form (or a document upload when fields is null) per task */
function lfSimpleStage(group, list) {
  return Object.fromEntries(list.map(([id, name, fields]) => [id, fields ? { group, name, how: 'form', desc: '', fields } : lfDoc(group, name, 'Attach the documents.')]));
}

/* [task, due in days from the space's start], in the ERP's order */
const LF_SYSTEM_TASKS = [
  ['system-requirement', 1], ['questionnaires', 3], ['design-calculation', 6], ['boq', 8], ['process-data-sheet', 8], ['scope-matrix', 8],
  ['pid', 9], ['gad', 9], ['datasheets', 9], ['foundation-load', 10],
  ['maintenance-plan', 10], ['control-philosophy', 10], ['performance-guarantee', 10], ['operating-cost', 10], ['om-manual', 10],
  ['client-documents', 2], ['company-profile', 11], ['product-brochure', 11], ['budget-list', 11], ['quotation', 12], ['doc-review', 13], ['send-quotation', 14],
  ['production-clearance', 30], ['purchase-order', 30], ['proforma-invoice', 32], ['confirmation-status', 35],
];
const LF_SPARE_TASKS = [
  ['spare-category', 1], ['spare-client-requirement', 1], ['spare-gad', 3], ['spare-production-clearance', 4], ['company-profile', 4], ['product-brochure', 4], ['quotation', 5], ['send-quotation', 6],
  ['vendor-selection', 6], ['vendor-quotation', 7], ['vendor-po', 8], // Resell only (ERP adds these after Quotation)
  ['purchase-order', 20], ['proforma-invoice', 22],
];
/* stages added when the client confirms (Confirmation Status: Proceed) */
const LF_DELIVERY_GROUPS = ['pc', 'pd', 'lg', 'in'];
const LF_VERSION = 3; // bump to rebuild the built-in templates (and the TEST space)

/* ---------------- lookups ---------------- */
function lfDef(it) { return it && it.lf && LF_TASKS[it.lf.id] || null; }
function lfLeadOf(it) { const sp = Store.space(it.spaceId); return sp && sp.leadId ? lead(sp.leadId) : null; }
function lfDoneStatus(sp) {
  const sts = sp.workflow.statuses;
  return Store.status(sp, sp.approvals.approveTo) || sts.find(s => s.cat === 'done' && !/not needed/i.test(s.name)) || sts.find(s => s.cat === 'done');
}
function lfSkipStatus(sp) { return sp.workflow.statuses.find(s => s.cat === 'done' && /not needed/i.test(s.name)) || lfDoneStatus(sp); }
function lfTarget(sp, d) { return (d.approval && sp.approvals.enabled && Store.status(sp, sp.approvals.statusId)) || lfDoneStatus(sp); }
const lfPending = it => it.approval && it.approval.state === 'pending';
function lfValues(it) {
  it.lf.values = it.lf.values || {};
  const v = it.lf.values, d = lfDef(it);
  ((d && d.fields) || []).forEach(f => {
    if (v[f.k] !== undefined) return;
    v[f.k] = f.type === 'table' ? JSON.parse(JSON.stringify(f.def || [])) : f.type === 'checks' ? [] : '';
    if (f.type === 'table' && !v[f.k].length) v[f.k].push(lfBlankRow(f));
  });
  return v;
}
const lfBlankRow = f => Object.fromEntries(f.cols.map(c => [c.k, c.type === 'check' ? false : '']));
function lfTask(sp, id) { return Store.itemsOf(sp.id).find(i => i.lf && i.lf.id === id) || null; }
/* A System lead's quotation can only go beyond draft once these tasks are Done in its space. Spare (and other) leads: no gate. */
const LF_QUOTE_NEEDS = [['design-calculation', 'Design Calculation'], ['design-calculation-post', 'POST Design Calculation'], ['boq', 'BOQ'], ['scope-matrix', 'Scope Matrix'], ['pid', 'P&ID']];
function lfQuoteBlockers(l) {
  if (!l || l.type !== 'System') return [];
  const sp = l.spaceId && Store.space(l.spaceId);
  if (!sp) return ['a project space — qualify the lead first'];
  return LF_QUOTE_NEEDS.filter(([id]) => { const t = lfTask(sp, id); return t && !Store.isDone(t); }).map(x => x[1]);
}
const lfList = xs => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] || '');
/* the systems picked in this space's System Requirement task, as "System (capacity)" */
function lfSystemRows(sp) {
  const t = lfTask(sp, 'system-requirement');
  return ((t && t.lf.values && t.lf.values.rows) || []).filter(r => r.system).map(r => ({ ...r, label: r.capacity ? `${r.system} (${r.capacity})` : r.system }));
}
function lfSystems(it) { return lfSystemRows(Store.space(it.spaceId)).map(r => r.label); }
/* the project-team review task, and whether it has approved (ERP: approval locks BOQ, Scope Matrix, Design Calculation and P&ID) */
function lfReview(sp) { return lfTask(sp, 'doc-review'); }
function lfLockedByReview(it) {
  const d = lfDef(it), r = d && d.reviewLock && lfReview(Store.space(it.spaceId));
  return !!(r && Store.isDone(r) && r.approval && r.approval.state === 'approved');
}
/* Requirement Engineering lock: every task in the stage needs an assignee first */

/* ---------------- records in other apps that finish a task ---------------- */
function lfLeadQuotes(l) { return erp().quotes.filter(q => q.leadId === l.id && q.no); }
function lfLeadInvoices(l) { const qs = new Set(lfLeadQuotes(l).map(q => q.id)); return erp().invoices.filter(i => i.no && (i.leadId === l.id || qs.has(i.quoteId))); }
function lfRecords(d, l) {
  if (!l) return [];
  switch (d.how) {
    case 'quote': case 'send': return lfLeadQuotes(l).map(q => ({ type: 'quote', id: q.id, ok: d.how === 'quote' || ['sent', 'accepted'].includes(q.status) }));
    case 'invoice': return lfLeadInvoices(l).map(i => ({ type: 'invoice', id: i.id, ok: i.status !== 'cancelled' }));
    case 'calc': return erp().calcs.filter(c => c.leadId === l.id).map(c => ({ type: 'calc', id: c.id, ok: true }));
    case 'meeting': return erp().meetings.filter(m => m.leadId === l.id).map(m => ({ type: 'meeting', id: m.id, ok: m.status === 'done' }));
  }
  return [];
}
/* the record that finishes this task now, if any: { type, id, text } */
function lfAutoHit(it, d, l) {
  if (!l) return null;
  if (it.lf.id === 'purchase-order') {
    const inv = lfLeadInvoices(l).find(i => i.poNumber);
    if ((stageOf(l) || {}).cat === 'won' || inv) return { type: 'lead', id: l.id, key: 'won:' + l.id, text: `LD-${l.no} reached ${stageOf(l).name} in CRM`, values: inv ? { poNumber: inv.poNumber } : null };
    return null;
  }
  // a saved sizing finishes one calculation task: PRE takes the first, POST the next one
  const taken = d.how === 'calc' ? new Set(Store.itemsOf(it.spaceId).filter(x => x !== it && x.lf && x.lf.link && x.lf.link.type === 'calc').map(x => x.lf.link.id)) : new Set();
  const r = lfRecords(d, l).find(x => x.ok && !taken.has(x.id));
  if (!r) return null;
  const label = { quote: () => `quotation ${quote(r.id).no} ${d.how === 'send' ? `was ${quote(r.id).status}` : 'was saved'} in Sales`, invoice: () => `proforma invoice ${invoice(r.id).no} was saved in Sales`, calc: () => `sizing “${erp().calcs.find(c => c.id === r.id).name}” was saved in Calculators`, meeting: () => `“${meeting(r.id).title}” was marked done in Meetings` }[r.type]();
  return { ...r, key: `${d.how}:${r.id}`, text: label };
}

/* ---------------- finishing a task ---------------- */
function lfMissing(it) {
  const d = lfDef(it), v = lfValues(it);
  if (lfLockedByReview(it)) return 'Locked: the project team approved this document';
  if (d.sys && lfSystems(it).length && !v.system) return 'Choose which system this is for';
  if (d.how === 'doc' && !it.attachments.length && !String(v.note || '').trim()) return 'Attach the document, or paste it / a link in the box';
  if (d.how === 'review') {
    const sp = Store.space(it.spaceId);
    const open = (d.after || []).map(id => lfTask(sp, id)).filter(t => t && !Store.isDone(t));
    if (open.length) return `Finish the compulsory documents first: ${open.map(t => t.summary).join(', ')}`;
  }
  for (const f of d.fields || []) {
    if (!f.req) continue;
    const x = v[f.k];
    const empty = f.type === 'table' ? !(x || []).some(r => String(r[f.cols[0].k] || '').trim()) : Array.isArray(x) ? !x.length : !String(x == null ? '' : x).trim();
    if (empty) return `Fill in ${f.label}`;
  }
  return d.check ? d.check(v) : null;
}
/**
 * Move a task to Done (or to the approval stage for tasks that need sign-off).
 * auto: the record that finished it (from leadFlowSync); those moves skip the Restrict/Validate rules
 * because the work is already done in the other app. Returns true when it moved.
 */
function lfFinish(it, { auto = null, quiet = false } = {}) {
  const sp = Store.space(it.spaceId), d = lfDef(it);
  if (!d || Store.isDone(it) || lfPending(it)) return false;
  const to = lfTarget(sp, d);
  if (auto) {
    it.lf.autoKey = auto.key;
    it.lf.link = { type: auto.type, id: auto.id };
    if (auto.values) Object.assign(lfValues(it), auto.values);
    Store.log(it, `completed automatically: ${auto.text}`);
  }
  const ok = Store.updateItem(it.id, { statusId: to.id }, true, auto ? { force: true, runActions: true } : { quiet });
  if (!ok || it.statusId !== to.id) return false;
  if (!auto) Store.log(it, to.cat === 'done' ? 'finished the task' : 'submitted the task for approval');
  lfAfterFinish(it, d);
  return true;
}
/* side effects in CRM / other tasks */
function lfAfterFinish(it, d) {
  const l = lfLeadOf(it), sp = Store.space(it.spaceId), v = lfValues(it);
  if (it.lf.id === 'purchase-order' && l && (stageOf(l) || {}).cat !== 'won') {
    const won = erpSet('crm').stages.find(s => s.cat === 'won');
    if (won) { leadLog(l, `PO ${v.poNumber} recorded in ${it.key}`); setLeadStage(l, won.id, { quiet: true }); }
  }
  if (it.lf.id === 'confirmation-status') {
    if (l) leadLog(l, `Confirmation: ${v.proceed}${v.reason ? ` — ${v.reason}` : ''}`, true);
    // ERP: "Proceed for procurement" turns the sales record into a project with the delivery stages
    if (v.proceed === 'Proceed for procurement') lfAddDelivery(sp);
  }
  if (it.lf.id === 'system-requirement') lfSyncPrePost(sp);
  if (it.lf.id === 'spare-category') {
    const own = v.category === 'Own Make';
    LF_RESELL.map(id => lfTask(sp, id)).filter(Boolean).forEach(t => {
      if (own && !Store.isDone(t)) { Store.updateItem(t.id, { statusId: lfSkipStatus(sp).id }, true, { force: true }); Store.log(t, 'not needed: the spare is Own Make'); }
      if (!own && t.statusId === lfSkipStatus(sp).id && lfSkipStatus(sp) !== lfDoneStatus(sp)) Store.updateItem(t.id, { statusId: sp.workflow.statuses[0].id }, true, { force: true });
    });
  }
}

/* ---------------- keeping tasks in step with the other apps ---------------- */
let lfSyncing = false;
function leadFlowSync() {
  if (lfSyncing || !Store.state || !Store.state.erp) return;
  lfSyncing = true;
  const done = [];
  try {
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      Store.state.spaces.forEach(sp => {
        const items = Store.itemsOf(sp.id).filter(i => i.lf);
        if (!items.length) return;
        const l = sp.leadId && lead(sp.leadId);
        const hadPost = !!lfTask(sp, 'design-calculation-post');
        lfSyncPrePost(sp); // PRE/POST ticked or unticked in System Requirement
        if (hadPost !== !!lfTask(sp, 'design-calculation-post')) changed = true;
        items.forEach(it => {
          const d = lfDef(it);
          if (!d || Store.isDone(it) || lfPending(it)) return;
          const hit = lfAutoHit(it, d, l);
          if (!hit || it.lf.autoKey === hit.key) return; // each record finishes a task once (a declined approval stays declined)
          if (lfFinish(it, { auto: hit })) { changed = true; done.push(it.key); }
        });
        // work on Requirement Engineering has started: the CRM lead is in requirement gathering
        const crm = erpSet('crm'), req = crm.stages.find(x => x.id === 'stg_req') || crm.stages.find(x => /requirement/i.test(x.name));
        if (l && req && isOpenLead(l) && lfStageIdx(l.stageId) < lfStageIdx(req.id) && items.some(i => (lfDef(i) || {}).lock && ((Store.statusOf(i) || {}).cat !== 'todo'))) {
          setLeadStage(l, req.id, { quiet: true }); changed = true;
        }
        // a stage's parent task follows its tasks
        items.filter(i => i.lf.group).forEach(g => {
          const kids = Store.state.items.filter(c => c.parentId === g.id);
          if (!kids.length) return;
          const cat = (Store.statusOf(g) || {}).cat;
          const allDone = kids.every(c => Store.isDone(c));
          const started = kids.some(c => Store.isDone(c) || (Store.statusOf(c) || {}).cat === 'progress');
          const prog = sp.workflow.statuses.find(s => s.cat === 'progress');
          let to = null;
          if (allDone && cat !== 'done') to = lfDoneStatus(sp);
          else if (!allDone && cat === 'done') to = prog;
          else if (!allDone && started && cat === 'todo') to = prog;
          if (to && to.id !== g.statusId) { Store.updateItem(g.id, { statusId: to.id }, true, { force: true }); changed = true; }
        });
      });
      if (!changed) break;
    }
  } finally { lfSyncing = false; }
  if (done.length) setTimeout(() => toast(`${done.join(', ')} finished automatically`), 80);
}

/* ---------------- lead → space ---------------- */
function lfFolderTemplate(f, l) {
  const c = f && f.lead;
  if (!c) return null;
  const id = l && l.type === 'Spare' && c.spareTemplateId ? c.spareTemplateId : c.templateId;
  return Store.state.taskTemplates.find(t => t.id === id) || null;
}
/* the folder a lead's space goes to: Leads: System or Leads: Spare by its type, else any lead folder */
function lfLeadFolder(l) {
  const fs = Store.state.folders, kind = l && l.type === 'Spare' ? 'Spare' : 'System';
  return fs.find(f => f.lead && f.lead.kind === kind) || fs.find(f => f.lead && f.lead.stageId) || fs.find(f => /^leads\b/i.test(f.name.trim())) || null;
}
const lfKindMatches = (f, l) => !f.lead.kind || (f.lead.kind === 'Spare') === (l.type === 'Spare');
/* lead space key: 3+ words → first letter of each word; otherwise the first 3 letters.
   Taken → first, middle and last letter; taken → numbered */
function lfLeadSpaceKey(company) {
  const words = String(company || '').toUpperCase().split(/\s+/).map(w => w.replace(/[^A-Z]/g, '')).filter(Boolean);
  const c = words.join('') || 'LEAD';
  if (words.length >= 3) { const ini = words.map(w => w[0]).join('').slice(0, 10); if (!Store.spaceByKey(ini)) return ini; }
  const a = c.slice(0, 3);
  if (!Store.spaceByKey(a)) return a;
  const b = c[0] + c[Math.floor((c.length - 1) / 2)] + c[c.length - 1];
  if (!Store.spaceByKey(b)) return b;
  return uniqueSpaceKey(a);
}
const lfLeadSpaceName = l => `${l.company || 'Lead'} LD-${l.no}`;
const lfSpaceOverride = {}; // lead id → { name, key } picked in the qualify dialog, used once by createLeadSpace
/* Link a space to a lead and fill it from the template. Sales tasks go to the lead owner; Requirement Engineering
   tasks stay unassigned for the project head to hand out (each one is locked until it is assigned). */
function lfSetupLeadSpace(sp, l, tpl) {
  sp.leadId = l ? l.id : null;
  if (l) { sp.clientId = l.clientId || sp.clientId || null; l.spaceId = sp.id; }
  if (tpl) applyTaskTemplate(sp, tpl, { startDate: todayStr() });
  const owner = l && (l.owner || Store.state.me);
  if (owner) Store.itemsOf(sp.id).forEach(i => { const d = lfDef(i); if (!i.assignee && !(d && d.lock)) i.assignee = owner; });
}
/* People who can be project head: employees with the Project designation (everyone, if there are none) */
function lfProjectPeople() {
  const ids = erp().employees.filter(e => e.designation === 'Project').map(e => e.userId).filter(u => Store.user(u));
  return ids.length ? ids : Store.state.users.map(u => u.id);
}
const lfDesignation = u => (erp().employees.find(e => e.userId === u) || {}).designation || '';
/* Set the project head and who does each Requirement Engineering task (ERP: "Assign Team Head" on qualifying,
   then the head assigns every task, which unlocks the stage). The project head also approves the project-team review. */
function lfAssignTeam(sp, head, assignees = {}) {
  sp.projectHead = head || null;
  Object.entries(assignees).forEach(([id, u]) => { const t = Store.item(id); if (t && t.spaceId === sp.id && t.assignee !== (u || null)) Store.updateItem(t.id, { assignee: u || null }, true); });
  const g = lfTask(sp, 'group:re');
  if (g && head) Store.updateItem(g.id, { assignee: head }, true);
  const rv = lfReview(sp);
  if (rv && head && !(rv.approvalChain && rv.approvalChain.length)) rv.approvalChain = [{ user: head, step: 1 }];
}
function openLeadTeamDialog(sp) {
  const g = lfTask(sp, 'group:re');
  const kids = g ? Store.itemsOf(sp.id).filter(i => i.parentId === g.id).sort(byRank) : [];
  const people = lfProjectPeople();
  const l = sp.leadId && lead(sp.leadId);
  let head = sp.projectHead || '';
  const draftsman = Store.state.users.find(u => lfDesignation(u.id) === 'Draftsman');
  const suggest = t => t.assignee || (draftsman && ['pid', 'gad', 'foundation-load'].includes(t.lf.id) ? draftsman.id : head) || '';
  const m = openModal({
    title: l ? `LD-${l.no} qualified: assign the team` : `Assign the team for ${sp.name}`, width: 640,
    body: `<p class="muted">Each Requirement Engineering task stays locked until someone is assigned to it. The project head also approves the project-team review of the quotation documents.</p>
      <label class="field"><span class="field-label">Project head <span class="req">*</span></span>${selectHTML('head', people.map(u => ({ value: u, label: `${personName(u)}${lfDesignation(u) ? ` · ${lfDesignation(u)}` : ''}` })), head, { blank: 'Choose the project head…' })}</label>
      <div class="field"><span class="field-label row gap8">Requirement Engineering tasks <span class="grow"></span><button class="btn subtle sm" data-lt-all>Give all unassigned to the project head</button></span>
        <div class="lt-list">${kids.map(t => `<div class="lt-row"><span class="grow ellip">${esc(t.summary)}</span>${selectHTML('t_' + t.id, Store.state.users.map(u => ({ value: u.id, label: `${u.name}${lfDesignation(u.id) ? ` · ${lfDesignation(u.id)}` : ''}` })), suggest(t), { blank: 'Unassigned', cls: 'sm-select', attrs: `data-lt="${t.id}"` })}</div>`).join('')}</div></div>`,
    footer: '<button class="btn subtle" data-close>Later</button><span class="grow"></span><button class="btn primary" data-lt-ok>Save</button>',
  });
  m.el.addEventListener('change', e => {
    if (e.target.name === 'head') { head = e.target.value; $$('[data-lt]', m.el).forEach(s => { if (!s.value) s.value = head; }); }
  });
  m.el.addEventListener('click', e => {
    if (e.target.closest('[data-lt-all]')) { if (!head) { toast('Choose the project head first', 'error'); return; } $$('[data-lt]', m.el).forEach(s => { if (!s.value) s.value = head; }); }
    if (!e.target.closest('[data-lt-ok]')) return;
    if (!head) { m.el.querySelector('[name=head]').classList.add('invalid'); toast('Choose the project head', 'error'); return; }
    const as = {}; $$('[data-lt]', m.el).forEach(s => { as[s.dataset.lt] = s.value || null; });
    lfAssignTeam(sp, head, as);
    Store.save(); m.close();
    const left = kids.filter(t => !Store.item(t.id).assignee).length;
    toast(left ? `Team saved. ${left} Requirement Engineering task${left === 1 ? ' is' : 's are'} still unassigned and stay${left === 1 ? 's' : ''} locked until assigned` : 'Team saved. Every Requirement Engineering task is unlocked');
  });
  return m;
}
function createLeadSpace(l, folder) {
  const o = lfSpaceOverride[l.id] || {};
  delete lfSpaceOverride[l.id];
  const sp = Store.createSpace({ name: (o.name || lfLeadSpaceName(l)).slice(0, 60), key: o.key && !Store.spaceByKey(o.key) ? o.key : lfLeadSpaceKey(l.company || l.title), color: SPACE_COLORS[l.no % SPACE_COLORS.length], glyph: 'rocket' });
  sp.folderId = folder ? folder.id : null;
  lfSetupLeadSpace(sp, l, lfFolderTemplate(folder, l));
  leadLog(l, `space ${sp.name} was created${folder ? ` in ${folder.name}` : ''}`);
  erpLog('crm', `created space ${sp.name} for LD-${l.no}`, { type: 'lead', id: l.id });
  return sp;
}
const lfStageIdx = id => erpSet('crm').stages.findIndex(s => s.id === id);
/* leads at or past the folder's stage that have no space yet */
function lfLeadsWithoutSpace(f) {
  const at = lfStageIdx(f.lead && f.lead.stageId);
  if (at < 0) return [];
  return erp().leads.filter(l => !(l.spaceId && Store.space(l.spaceId)) && isOpenLead(l) && lfStageIdx(l.stageId) >= at && lfKindMatches(f, l));
}
/* called when a lead is created or changes stage */
function leadFlowOnStage(l) {
  if (!l || (l.spaceId && Store.space(l.spaceId)) || !isOpenLead(l)) return null;
  const f = lfLeadFolder(l);
  if (!f || !f.lead || !f.lead.stageId || lfStageIdx(f.lead.stageId) < 0 || lfStageIdx(l.stageId) < lfStageIdx(f.lead.stageId)) return null;
  const sp = createLeadSpace(l, f);
  setTimeout(() => toast(`Space "${sp.name}" created in ${f.name} for LD-${l.no}`), 60);
  // the project head and Requirement Engineering assignees are set later from the space (Assign team)
  return sp;
}

/* ---------------- the task panel on a work item ---------------- */
const LF_HOW = {
  form: ['forms', 'Fill it in here'], doc: ['attach', 'Attach or paste the document here'], quote: ['quote', 'Create the quotation from here'],
  send: ['mail', 'Send the quotation from here'], invoice: ['receipt', 'Create the proforma invoice from here'], calc: ['calc', 'Size it in Calculators'], meeting: ['video', 'Schedule and record it from here'],
  review: ['approvals', 'Get the documents approved by the project team'],
};
/* A stage's parent task: Requirement Engineering shows the project head and the assignment lock */
function lfGroupPanelHTML(it) {
  if (it.lf.id !== 'group:re') return '';
  const sp = Store.space(it.spaceId);
  const kids = Store.state.items.filter(c => c.parentId === it.id);
  const open = kids.filter(c => !c.assignee);
  return `<section class="iv-section lf-panel ${open.length ? '' : 'is-done'}" data-lf-panel>
    <div class="lf-head"><span class="lf-ic">${icon(open.length ? 'lock' : 'people', 18)}</span><div class="grow"><b>${open.length ? `Locked: ${open.length} of ${kids.length} tasks unassigned` : 'Unlocked: every task is assigned'}</b>
      <div class="muted small">Requirement Engineering can't be worked until every task in it has someone assigned. The project head hands them out.</div></div></div>
    <div class="lf-lead small">Project head: ${sp.projectHead ? `${avatar(sp.projectHead, 20)} <b>${esc(personName(sp.projectHead))}</b>` : '<span class="muted">not set</span>'}</div>
    ${open.length ? `<div class="muted small">Unassigned: ${open.map(c => esc(c.summary)).join(', ')}</div>` : ''}
    <div class="lf-actions"><span class="grow"></span><button class="btn ${open.length ? 'primary' : ''}" data-lf-act="team">${icon('people', 14)} ${sp.projectHead ? 'Change team' : 'Assign project head & tasks'}</button></div></section>`;
}
/* The review task: which documents the project team checks, and whether they're ready */
function lfReviewHTML(it, d) {
  const sp = Store.space(it.spaceId);
  const row = (id, must) => {
    const t = lfTask(sp, id);
    if (!t) return '';
    return `<div class="child-row" data-lf-open="${t.id}">${icon(Store.isDone(t) ? 'checkCircle' : 'clock', 14)}<span class="key">${esc(t.key)}</span><span class="grow ellip">${esc(t.summary)}${must ? ' <span class="req">*</span>' : ''}</span>${itemAvatar(t, 20)}${lozenge(Store.statusOf(t))}</div>`;
  };
  const opt = ['design-calculation', 'design-calculation-post', 'gad', 'process-data-sheet'];
  return `<div class="lf-records"><div class="field-label">Compulsory before it can be submitted <span class="req">*</span></div><div class="child-list">${(d.after || []).map(id => row(id, true)).join('')}</div>
    <div class="field-label" style="margin-top:10px">Also reviewed when done</div><div class="child-list">${opt.map(id => row(id, false)).join('')}</div>
    <p class="muted small">Approving locks the BOQ, Scope Matrix, Design Calculation and P&amp;ID. If something needs correcting: decline, fix it in its task, then submit again.</p></div>`;
}
function lfPanelHTML(it) {
  if (!it.lf) return '';
  if (it.lf.group) return lfGroupPanelHTML(it);
  const d = lfDef(it);
  if (!d) return '';
  const sp = Store.space(it.spaceId), l = lfLeadOf(it), v = lfValues(it);
  const done = Store.isDone(it), pend = lfPending(it);
  const to = lfTarget(sp, d);
  const reviewLocked = lfLockedByReview(it);
  const reLocked = !done && d.lock && !it.assignee;
  const blocked = !done && !pend && !reLocked && (restrictReason(it, to.id) || null);
  const [ic, how] = LF_HOW[d.how];
  const lk = it.lf.link;
  const calc = lk && lk.type === 'calc' && erp().calcs.find(c => c.id === lk.id);
  const from = !lk ? '' : calc ? `<a class="rec-chip" href="#/app/tools/${calc.type}?load=${calc.id}" data-close>${icon('calc', 12)}<span class="ellip">${esc(calc.name)}</span></a>` : recordChip(lk.type, lk.id);
  const state = reviewLocked ? `<span class="lozenge cat-done">${icon('lock', 10)} Approved</span>` : done ? `<span class="lozenge cat-done">${esc((Store.statusOf(it) || {}).name)}</span>` : pend ? '<span class="lozenge cat-progress">Waiting for approval</span>' : d.approval ? '<span class="lozenge cat-todo">Needs approval</span>' : '';
  const systems = d.sys ? lfSystems(it) : [];
  let body = '';
  if (d.sys) body += systems.length ? `<div class="lf-fields"><label class="field half"><span class="field-label">System <span class="req">*</span></span>${selectHTML('system', systems, v.system, { blank: 'Which system is this for?', attrs: 'data-lfk="system"' })}</label></div>` : '<p class="muted small">Fill in System Requirement first. This task asks which of those systems it is for.</p>';
  if (d.fields) body += `<div class="lf-fields">${d.fields.map(f => lfFieldHTML(it, f, v[f.k])).join('')}</div>`;
  if (d.how === 'doc') body += `<label class="field"><span class="field-label">Paste the content or a link (or attach files below)</span><textarea class="input" rows="4" data-lfk="note" placeholder="Paste text, or a link to the file">${esc(v.note || '')}</textarea></label>`;
  if (d.how === 'review') body += lfReviewHTML(it, d);
  if (['quote', 'send', 'invoice', 'calc', 'meeting'].includes(d.how)) body += lfRecordsHTML(it, d, l);
  const attach = d.how === 'doc' || d.attach;
  if (attach) body += `<div class="lf-attach"><label class="btn sm">${icon('attach', 14)} Attach files<input type="file" multiple hidden data-attach></label><span class="muted small">${it.attachments.length ? `${it.attachments.length} file${it.attachments.length === 1 ? '' : 's'} attached (see Attachments below)` : 'Up to 2 MB each'}</span></div>`;
  const acts = {
    quote: `<button class="btn primary" data-lf-act="quote">${icon('quote', 14)} Create quotation</button>`,
    send: lfSendButton(l),
    invoice: `<button class="btn primary" data-lf-act="invoice">${icon('receipt', 14)} Create proforma invoice</button>`,
    calc: `<button class="btn primary" data-lf-act="calc">${icon('calc', 14)} Open calculator</button>`,
    meeting: `<button class="btn primary" data-lf-act="visit">${icon('pin', 14)} Plan site visit</button><button class="btn" data-lf-act="meet">${icon('video', 14)} Schedule meeting</button>`,
  }[d.how] || '';
  const auto = ['quote', 'send', 'invoice', 'calc', 'meeting'].includes(d.how);
  const finishLabel = to.cat === 'done' ? 'Finish task' : 'Submit for approval';
  const frozen = reviewLocked || reLocked;
  const review = lfReview(sp);
  return `<section class="iv-section lf-panel ${done ? 'is-done' : ''}" data-lf-panel>
    <div class="lf-head"><span class="lf-ic">${icon(ic, 18)}</span><div class="grow"><b>${how}</b><div class="muted small">${esc(d.desc)}</div></div>${state}</div>
    ${l ? `<div class="lf-lead muted small">For ${recordChip('lead', l.id)} <span>${esc(l.company)}</span></div>` : auto ? `<div class="banner warn small">${icon('help', 14)} This space isn't linked to a lead, so it can't finish on its own. Use the buttons, then mark it done.</div>` : ''}
    ${reLocked ? `<div class="banner warn small">${icon('lock', 14)} Locked until someone is assigned to this task. <button class="link small" data-lf-act="assign">Assign it</button> · <button class="link small" data-lf-act="team">Assign the team</button></div>` : ''}
    ${reviewLocked ? `<div class="banner info small">${icon('lock', 14)} Locked: the project team approved it in <a class="link" data-lf-open="${review.id}">${esc(review.key)}</a>. To change it, move that review back to In Progress.</div>` : ''}
    ${done && it.lf.autoKey && !reviewLocked ? `<div class="banner info small">${icon('checkCircle', 14)} Finished automatically${from ? ` from ${from}` : ''}.</div>` : ''}
    ${pend ? `<div class="banner info small">${icon('approvals', 14)} Submitted. It moves to ${esc((Store.status(sp, sp.approvals.approveTo) || {}).name || 'Done')} once approved.</div>` : ''}
    <fieldset class="lf-body" ${frozen ? 'disabled' : ''}>${body}</fieldset>
    <div class="lf-actions">${done || frozen ? '' : acts}<span class="grow"></span>
      ${blocked ? `<span class="lf-blocked small" title="${esc(blocked)}">${icon('lock', 12)} ${esc(blocked)}</span>` : ''}
      ${done || pend || frozen ? '' : auto
        ? `<button class="btn subtle sm" data-lf-act="finish" title="Finish it without a record in the other app">Mark done anyway</button>`
        : `<button class="btn ${acts ? '' : 'primary'}" data-lf-act="finish" ${blocked ? 'disabled' : ''}>${icon('check', 14)} ${finishLabel}</button>`}
    </div></section>`;
}
function lfSendButton(l) {
  const qs = l ? lfLeadQuotes(l) : [];
  const q = qs.find(x => x.status === 'draft') || qs[qs.length - 1];
  return q ? (q.status === 'draft' ? `<button class="btn primary" data-lf-act="mark-sent" data-q="${q.id}">${icon('mail', 14)} Mark ${esc(q.no)} as sent</button><button class="btn" data-lf-act="open-quote" data-q="${q.id}">Open ${esc(q.no)}</button>` : `<button class="btn" data-lf-act="open-quote" data-q="${q.id}">Open ${esc(q.no)}</button>`) : `<button class="btn primary" data-lf-act="quote">${icon('quote', 14)} Create quotation</button>`;
}
function lfRecordsHTML(it, d, l) {
  const rs = lfRecords(d, l);
  const type = d.how === 'send' ? 'quote' : d.how;
  const empty = { quote: 'No quotation for this lead yet.', send: 'No quotation for this lead yet.', invoice: 'No proforma invoice for this lead yet.', calc: 'No sizing saved against this lead yet.', meeting: 'No meeting or site visit linked to this lead yet.' }[d.how];
  const row = r => {
    if (r.type === 'quote') { const q = quote(r.id); return `<div class="child-row" data-rec="quote:${q.id}">${icon('quote', 14)}<span class="key">${esc(q.no)}</span><span class="grow muted small">${fmtDate(q.date)}</span><b class="small">${money(lineTotals(q).total, q.currency)}</b>${quotePill(q)}</div>`; }
    if (r.type === 'invoice') { const i = invoice(r.id); return `<div class="child-row" data-rec="invoice:${i.id}">${icon('receipt', 14)}<span class="key">${esc(i.no)}</span><span class="grow muted small">${fmtDate(i.date)}</span><b class="small">${money(lineTotals(i).total, i.currency)}</b>${invoicePill(i)}</div>`; }
    if (r.type === 'calc') { const c = erp().calcs.find(x => x.id === r.id); return `<a class="child-row" href="#/app/tools/${c.type}?load=${c.id}" data-close>${icon('calc', 14)}<span class="grow ellip">${esc(c.name)}</span><span class="muted small">${esc(c.headline || '')}</span></a>`; }
    const m = meeting(r.id); return `<div class="child-row" data-rec="meeting:${m.id}">${icon(m.kind === 'visit' ? 'pin' : 'video', 14)}<span class="grow ellip">${esc(m.title)}</span><span class="muted small">${fmtDate(m.date)}</span>${meetPill(m)}</div>`;
  };
  return `<div class="lf-records"><div class="field-label">${{ quote: 'Quotations', invoice: 'Proforma invoices', calc: 'Saved sizing', meeting: 'Meetings & site visits' }[type]} for this lead</div>
    ${rs.length ? `<div class="child-list">${rs.map(row).join('')}</div>` : `<p class="muted small">${empty}</p>`}
    ${d.how === 'meeting' && rs.some(r => !r.ok) ? '<p class="muted small">Open the meeting and choose <b>Mark done</b> after it happens to finish this task.</p>' : ''}</div>`;
}
function lfOptions(it, f) { return f.options === '@systems' ? lfSystems(it) : f.options; }
function lfFieldHTML(it, f, v) {
  const at = `data-lfk="${f.k}"`;
  const lab = `<span class="field-label">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ''}</span>`;
  switch (f.type) {
    case 'textarea': return `<label class="field">${lab}<textarea class="input" rows="${f.rows || 3}" ${at} placeholder="${esc(f.ph || '')}">${esc(v || '')}</textarea></label>`;
    case 'select': return `<label class="field half">${lab}${selectHTML(f.k, lfOptions(it, f), v, { blank: 'Choose…', attrs: at })}</label>`;
    case 'user': return `<label class="field half">${lab}${selectHTML(f.k, userOptions(), v, { blank: 'Choose someone…', attrs: at })}</label>`;
    case 'checks': return `<div class="field">${lab}<div class="lf-checks">${lfOptions(it, f).map(o => `<label class="chk-row"><input type="checkbox" ${at} data-lfv="${esc(o)}" ${(v || []).includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div></div>`;
    case 'table': return `<div class="field">${lab}${lfTableHTML(f, v || [])}</div>`;
    default: return `<label class="field half">${lab}<input class="input" type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" ${f.type === 'number' ? 'step="any"' : ''} ${at} value="${esc(v == null ? '' : v)}" placeholder="${esc(f.ph || '')}"></label>`;
  }
}
function lfTotalHTML(f, rows) { return f.total ? `<span class="lf-total" data-lf-total="${f.k}">${esc(f.totalLabel)}: <b>${f.money ? money(f.total(rows)) : fmtN(f.total(rows))}</b></span>` : ''; }
function lfTableHTML(f, rows) {
  const cell = (c, r, i) => {
    const at = `data-lft="${f.k}" data-lfr="${i}" data-lfc="${c.k}"`;
    if (c.type === 'check') return `<td class="center"><input type="checkbox" ${at} ${r[c.k] ? 'checked' : ''}></td>`;
    if (c.type === 'select') return `<td>${selectHTML(c.k, c.options, r[c.k], { blank: 'Choose…', cls: 'cell', attrs: at })}</td>`;
    return `<td><input class="input cell ${c.type === 'number' ? 'num' : ''}" ${c.type === 'number' ? 'type="number" step="any"' : ''} ${at} value="${esc(r[c.k] == null ? '' : r[c.k])}" ${c.k === 'item' && f.catalog ? 'list="lf-cat"' : ''}></td>`;
  };
  return `<div class="lf-table-wrap"><table class="grid compact lf-table"><thead><tr>${f.cols.map(c => `<th ${c.w ? `style="width:${c.w}px"` : ''} class="${c.type === 'check' ? 'center' : ''}">${esc(c.label)}</th>`).join('')}<th style="width:36px"></th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr>${f.cols.map(c => cell(c, r, i)).join('')}<td><button class="icon-btn xs" data-lf-delrow="${f.k}:${i}" title="Remove row">${icon('trash', 12)}</button></td></tr>`).join('')}</tbody></table>
    ${f.catalog ? `<datalist id="lf-cat">${erp().catalog.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist>` : ''}
    <div class="lf-table-foot"><button class="btn subtle sm" data-lf-addrow="${f.k}">${icon('plus', 12)} Add row</button>${f.catalog ? `<button class="btn subtle sm" data-lf-cat="${f.k}">${icon('box', 12)} Add from catalog</button>` : ''}<span class="grow"></span>${lfTotalHTML(f, rows)}</div></div>`;
}

/* Quotation lines from the space's BOQ / Client Requirement rows, priced from the catalog */
function lfQuoteLines(sp) {
  const src = ['boq', 'spare-client-requirement'].map(id => lfTask(sp, id)).find(t => t && t.lf.values && (t.lf.values.rows || []).some(r => String(r.item || '').trim()));
  if (!src) return null;
  const cat = erp().catalog;
  return src.lf.values.rows.filter(r => String(r.item || '').trim()).map(r => {
    const n = r.item.trim().toLowerCase();
    const ci = cat.find(c => c.name.toLowerCase() === n) || cat.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()));
    return { itemId: ci ? ci.id : null, item: ci ? ci.name : r.item.trim(), description: r.spec || (ci ? ci.description : '') || '', hsn: ci ? ci.hsn : '', qty: Number(r.qty) || 1, price: ci ? ci.price : 0, disc: 0, gst: ci ? ci.gst : erpSet('sales').gstDefault };
  });
}

/* events for the panel, bound once per open work item */
function lfBindPanel(root, id) {
  const it = () => Store.item(id);
  const redraw = () => { const p = root.querySelector('[data-lf-panel]'); if (p) p.outerHTML = lfPanelHTML(it()); };
  const field = k => (lfDef(it()).fields || []).find(f => f.k === k);
  const onEdit = e => {
    const t = e.target, x = it();
    if (!x || !x.lf) return;
    if (t.dataset.lfk) {
      const v = lfValues(x);
      if (t.dataset.lfv != null) { const s = new Set(v[t.dataset.lfk] || []); if (t.checked) s.add(t.dataset.lfv); else s.delete(t.dataset.lfv); v[t.dataset.lfk] = [...s]; }
      else v[t.dataset.lfk] = t.value;
      // Foundation Load: the person it's requested from is told (ERP: it shows up in their Requests)
      if (x.lf.id === 'foundation-load' && t.dataset.lfk === 'from' && t.value && e.type === 'change') {
        Store.notify(t.value, x, `Foundation load requested from you: ${x.key} "${x.summary}"${v.system ? ` (${v.system})` : ''}`);
        Store.log(x, `requested the foundation load from ${personName(t.value)}`);
      }
      x.updated = nowISO(); Store.save(true);
    }
    if (t.dataset.lft) {
      const rows = lfValues(x)[t.dataset.lft];
      rows[Number(t.dataset.lfr)][t.dataset.lfc] = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.lfc === 'item' && e.type === 'change') {
        const ci = erp().catalog.find(c => c.name === t.value);
        const r = rows[Number(t.dataset.lfr)];
        if (ci) { if ('spec' in r && !r.spec) r.spec = ci.description || ''; if ('unit' in r && !r.unit) r.unit = ci.unit || ''; if ('cost' in r && !r.cost) r.cost = ci.price; if (!r.qty && 'qty' in r) r.qty = 1; redraw(); }
      }
      const f = field(t.dataset.lft), tot = root.querySelector(`[data-lf-total="${t.dataset.lft}"]`);
      if (f && tot) tot.outerHTML = lfTotalHTML(f, rows);
      x.updated = nowISO(); Store.save(true);
    }
  };
  root.addEventListener('input', onEdit);
  root.addEventListener('change', e => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT' || e.target.dataset.lfc === 'item') onEdit(e); });
  root.addEventListener('click', e => {
    const x = it();
    if (!x || !x.lf || !e.target.closest('[data-lf-panel]')) return;
    const add = e.target.closest('[data-lf-addrow]'), del = e.target.closest('[data-lf-delrow]'), cat = e.target.closest('[data-lf-cat]'), b = e.target.closest('[data-lf-act]');
    if (add) { const f = field(add.dataset.lfAddrow); lfValues(x)[f.k].push(lfBlankRow(f)); Store.save(true); redraw(); const ins = root.querySelectorAll(`[data-lft="${f.k}"]`); if (ins.length) ins[ins.length - f.cols.length].focus(); return; }
    if (del) { const [k, i] = del.dataset.lfDelrow.split(':'); const rows = lfValues(x)[k]; rows.splice(Number(i), 1); if (!rows.length) rows.push(lfBlankRow(field(k))); Store.save(true); redraw(); return; }
    if (cat) {
      const f = field(cat.dataset.lfCat), c = erp().catalog;
      menu(cat, c.length ? c.map(ci => ({ value: ci.id, label: `${esc(ci.name)} <span class="muted small">${esc(money(ci.price))}</span>`, icon: icon('box') })) : [{ value: '', label: '<span class="muted">The Sales catalog is empty</span>', disabled: true }], v => {
        const ci = c.find(y => y.id === v); if (!ci) return;
        const rows = lfValues(x)[f.k];
        const r = Object.assign(lfBlankRow(f), { item: ci.name }, 'spec' in lfBlankRow(f) ? { spec: ci.description || '' } : {}, 'qty' in lfBlankRow(f) ? { qty: 1 } : {}, 'unit' in lfBlankRow(f) ? { unit: ci.unit || '' } : {}, 'cost' in lfBlankRow(f) ? { cost: ci.price } : {});
        const blank = rows.findIndex(y => !String(y.item || '').trim());
        if (blank >= 0) rows[blank] = r; else rows.push(r);
        Store.save(true); redraw();
      }, { width: 360 });
      return;
    }
    const op = e.target.closest('[data-lf-open]');
    if (op) { openItem(op.dataset.lfOpen); return; }
    if (!b) return;
    const sp = Store.space(x.spaceId), l = lfLeadOf(x);
    switch (b.dataset.lfAct) {
      case 'team': openLeadTeamDialog(sp); break;
      case 'assign': userPicker(b, x.assignee, v => { if (v) Store.updateItem(x.id, { assignee: v }); }, { allowUnassigned: false }); break;
      case 'finish': {
        const d = lfDef(x);
        const miss = ['quote', 'send', 'invoice', 'calc', 'meeting'].includes(d.how) ? null : lfMissing(x);
        if (miss) { toast(miss, 'error'); return; }
        if (lfFinish(x)) { Store.save(); toast(Store.isDone(x) ? `${x.key} done` : `${x.key} submitted for approval`); }
        else Store.save();
        break;
      }
      case 'quote': openQuote(null, { leadId: l ? l.id : null, clientId: l ? l.clientId : sp.clientId || null, ...(lfQuoteLines(sp) ? { lines: lfQuoteLines(sp) } : {}) }); break;
      case 'open-quote': openQuote(b.dataset.q); break;
      case 'mark-sent': markQuoteSent(quote(b.dataset.q)); break;
      case 'invoice': {
        const qs = l ? lfLeadQuotes(l) : [];
        const q = qs.find(y => y.status === 'accepted') || qs.find(y => y.status === 'sent') || qs[qs.length - 1];
        if (q) createInvoiceFromQuote(q); else openInvoice(null, { clientId: l ? l.clientId : sp.clientId || null, leadId: l ? l.id : null });
        break;
      }
      case 'calc': menu(b, Object.entries(CALCS).map(([k, c]) => ({ value: k, label: c.name, icon: icon(c.icon) })), v => { closeAllModals(); location.hash = `#/app/tools/${v}${l ? `?lead=${l.id}` : ''}`; }); break;
      case 'visit': openMeeting(null, { kind: 'visit', leadId: l ? l.id : null, title: `Site visit – ${l ? l.company : sp.name}`, spaceId: sp.id }); break;
      case 'meet': openMeeting(null, { leadId: l ? l.id : null, title: `Discussion – ${l ? l.company : sp.name}`, spaceId: sp.id }); break;
    }
  });
}

/* ---------------- the Sales templates ---------------- */
/**
 * The rules a task gets, as in the ERP:
 *   after    - it needs another task's output first (BOQ needs the Design Calculation; the review needs the compulsory documents)
 *   lock     - a Requirement Engineering task can't be worked until it is assigned to someone
 *   approval - it only reaches Done through the approval (the project-team review)
 * refOf(taskId) gives the id to use for another task (a template ref or a work item id), or null when it isn't there.
 * st = { prog, fin, review, done } status ids (fin: Finished, the work is done and waiting to go for approval). Returns [{ to, rules }].
 */
function lfFlowRules(x, refOf, st) {
  const after = (x.after || []).map(refOf).filter(Boolean);
  const wait = after.length ? [{ type: 'r_task', cfg: { tasks: after, status: 'cat:done', mode: 'all' } }] : [];
  const lock = x.lock ? [{ type: 'r_self_assigned', cfg: {} }] : [];
  const out = [{ to: st.prog, rules: lock }, ...(st.fin ? [{ to: st.fin, rules: lock }] : [])];
  if (x.approval) out.push({ to: st.review, rules: [...lock, ...wait] }, { to: st.done, rules: [{ type: 'r_been', cfg: { status: st.review } }] });
  else out.push({ to: st.done, rules: [...lock, ...wait] });
  return out.filter(f => f.rules.length);
}
/* A task added to an existing space later (POST Design Calculation, the delivery stages), with the same rules as a template task */
function lfAddTask(sp, id, { parentId = null, rank, assignee = null, due = null, summary } = {}) {
  const x = LF_TASKS[id];
  const it = Store.createItem({ spaceId: sp.id, summary: summary || x.name, description: x.desc, type: parentId ? 'subtask' : 'task', priority: x.priority || 'medium', parentId, rank, assignee, due, lf: { id } }, true);
  const prog = sp.workflow.statuses.find(s => s.cat === 'progress');
  const st = { prog: prog && prog.id, fin: (sp.workflow.statuses.find(s => s.name === LF_FINISHED) || {}).id, review: sp.approvals.statusId, done: lfDoneStatus(sp).id };
  lfFlowRules(x, a => (lfTask(sp, a) || {}).id || null, st).forEach(f => {
    if (!f.to) return;
    const fl = ensureFlow(sp, it.id, ['any'], f.to);
    f.rules.forEach(r => fl.rules.push({ id: uid('rl'), ...r }));
  });
  return it;
}
/* System Requirement rows with PRE/POST ticked split Design Calculation into PRE and POST (ERP: syncDesignCalculationTasks) */
function lfSyncPrePost(sp) {
  const pre = lfTask(sp, 'design-calculation');
  if (!pre) return;
  const wants = lfSystemRows(sp).some(r => r.prepost);
  let post = lfTask(sp, 'design-calculation-post');
  if (wants && !post) {
    Store.updateItem(pre.id, { summary: 'PRE Design Calculation' }, true, { force: true });
    post = lfAddTask(sp, 'design-calculation-post', { parentId: pre.parentId, rank: rankOf(pre) + 0.5, assignee: pre.assignee, due: pre.due });
    Store.log(post, 'added because a system needs PRE and POST design calculations');
  } else if (!wants && post && !Store.isDone(post)) {
    Store.state.items = Store.state.items.filter(i => i !== post);
    Store.cleanFlows(sp);
    Store.updateItem(pre.id, { summary: 'Design Calculation' }, true, { force: true });
  }
}
/* Confirmation Status "Proceed for procurement": the delivery stages get added (ERP: convertProjectToFull) */
function lfAddDelivery(sp) {
  if (sp.delivery) return;
  sp.delivery = true;
  const l = sp.leadId && lead(sp.leadId);
  const who = (l && l.owner) || Store.state.me;
  let rank = Math.max(0, ...Store.itemsOf(sp.id).map(i => (i.rank != null && i.rank < 1e6 ? i.rank : 0))) + 1;
  let day = 7;
  LF_DELIVERY_GROUPS.forEach(g => {
    const ids = Object.keys(LF_TASKS).filter(k => LF_TASKS[k].group === g);
    const due = addDays(todayStr(), day + ids.length * 2);
    const grp = Store.createItem({ spaceId: sp.id, summary: LF_GROUPS[g], description: `${LF_GROUPS[g]} stage. Finishes by itself when all of its tasks are done.`, type: 'task', priority: 'high', labels: ['project'], rank: rank++, assignee: who, due, lf: { id: 'group:' + g, group: true } }, true);
    ensureFlow(sp, grp.id, ['any'], lfDoneStatus(sp).id).rules.push({ id: uid('rl'), type: 'r_subtasks', cfg: { status: 'cat:done' } });
    ids.forEach((id, i) => lfAddTask(sp, id, { parentId: grp.id, rank: rank++, assignee: who, due: addDays(todayStr(), day + i * 2) }));
    day += ids.length * 2;
  });
  if (l) leadLog(l, 'converted to a project: Procurement, Production, Logistics and Installation added');
  setTimeout(() => toast(`${sp.name} is now a project: Procurement, Production, Logistics and Installation added`), 80);
}

function lfBuildTemplate(id, name, list, me, oneGroup = null) {
  const groupOf = t => oneGroup || LF_TASKS[t].group; // the Spares track is a single stage in the ERP
  const st = { todo: uid('st'), prog: uid('st'), fin: uid('st'), review: uid('st'), done: uid('st'), skip: uid('st') };
  const statuses = [{ id: st.todo, name: 'To Do', cat: 'todo' }, { id: st.prog, name: 'In Progress', cat: 'progress' }, { id: st.fin, name: LF_FINISHED, cat: 'progress' }, { id: st.review, name: 'In Review', cat: 'progress' }, { id: st.done, name: 'Done', cat: 'done' }, { id: st.skip, name: 'Not Needed', cat: 'done' }];
  const workflow = {
    statuses,
    transitions: [{ id: uid('tr'), name: 'Create', from: ['start'], to: st.todo }, ...statuses.map(s => ({ id: uid('tr'), name: s.name, from: ['any'], to: s.id })),
      { id: uid('tr'), name: 'approval', from: [st.review], to: st.done, approval: true, rules: 1 }],
  };
  const approvals = { enabled: true, statusId: st.review, approvers: [me], fieldName: 'Approvers', approveTo: st.done, declineTo: st.prog };
  const ids = new Set(list.map(x => x[0]));
  const groups = [...new Set(list.map(([t]) => groupOf(t)))];
  const tasks = [], flows = [];
  let rank = 1;
  groups.forEach(g => {
    const kids = list.filter(([t]) => groupOf(t) === g);
    const due = Math.max(...kids.map(k => k[1]));
    tasks.push({ ref: 'g_' + g, summary: LF_GROUPS[g], description: `${LF_GROUPS[g]} stage. Finishes by itself when all of its tasks are done.`, type: 'task', priority: 'high', labels: ['sales'], assignee: null, statusId: st.todo, parentRef: null, rank: rank++, startOff: 0, dueOff: due, lf: { id: 'group:' + g, group: true } });
    kids.forEach(([t, d]) => {
      const x = LF_TASKS[t];
      tasks.push({ ref: t, summary: x.name, description: x.desc, type: 'subtask', priority: x.priority || 'medium', labels: [g === 're' ? 'requirement' : g === 'pr' ? 'proposal' : g === 'fu' ? 'follow-up' : 'spares'], assignee: null, statusId: st.todo, parentRef: 'g_' + g, rank: rank++, startOff: Math.max(0, d - 2), dueOff: d, lf: { id: t } });
    });
  });
  const flow = (ref, to, rules) => flows.push({ id: uid('tf'), taskId: ref, name: `Move to ${statuses.find(s => s.id === to).name}`, from: ['any'], to, rules: rules.map(r => ({ id: uid('rl'), ...r })) });
  list.forEach(([t]) => lfFlowRules(LF_TASKS[t], a => (ids.has(a) ? a : null), st).forEach(f => flow(t, f.to, f.rules)));
  groups.forEach(g => flow('g_' + g, st.done, [{ type: 'r_subtasks', cfg: { status: 'cat:done' } }]));
  return { id, name, created: nowISO(), updated: nowISO(), resetStatus: true, workflow, approvals, tasks, flows, canvas: [], pos: {}, builtin: 'leadflow' };
}

/* One-time setup: the two Sales templates, the Leads folder, and a test space that walks through the flow */
function ensureLeadFlow(st) {
  const e = st.erp;
  if (!e) return;
  if (e.leadFlow >= LF_VERSION) { lfEnsureLeadFolders(st); lfEnsureFinished(st); return; }
  const me = st.me, from = e.leadFlow || 0;
  // (re)build the built-in templates; one the user re-saved over is theirs now and stays as it is
  [[LF_TPL_SYSTEM, 'Sales – System lead', LF_SYSTEM_TASKS, null], [LF_TPL_SPARE, 'Sales – Spare lead', LF_SPARE_TASKS, 'sp']].forEach(([id, name, list, g]) => {
    const i = st.taskTemplates.findIndex(t => t.id === id), old = st.taskTemplates[i];
    if (i < 0) st.taskTemplates.push(lfBuildTemplate(id, name, list, me, g));
    else if (old.builtin === 'leadflow') st.taskTemplates[i] = Object.assign(lfBuildTemplate(id, old.name, list, me, g), { created: old.created });
  });
  e.leadFlow = LF_VERSION;
  let f = st.folders.find(x => x.lead) || st.folders.find(x => x.name.trim().toLowerCase() === 'leads');
  if (!f) { f = { id: uid('fd'), name: 'Leads', collapsed: false }; st.folders.push(f); }
  const qualified = e.settings.crm.stages.find(s => s.id === 'stg_qualified') || e.settings.crm.stages.find(s => /qualif/i.test(s.name));
  f.lead = Object.assign({ templateId: LF_TPL_SYSTEM, spareTemplateId: LF_TPL_SPARE, stageId: qualified ? qualified.id : '' }, f.lead || {});
  if (from && from < 3) lfRemoveTest(); // the TEST space was built on the old workflow: build it again
  st.spaces.forEach(lfReorderSpace);
  lfSimulate(f);
  lfEnsureLeadFolders(st);
  lfEnsureFinished(st);
}
/* "Finished" sits before In Review in lead workflows: the task's work is done and it is ready to go for approval.
   It counts as in progress. Spaces and templates made before it existed get it added (with the same assignment lock as In Progress). */
const LF_FINISHED = 'Finished';
function lfAddFinished(wf, flows) {
  const sts = wf && wf.statuses, rv = sts && sts.find(x => x.name === 'In Review');
  if (!rv || sts.some(x => x.name === LF_FINISHED)) return;
  const prog = sts.find(x => x.cat === 'progress');
  const fin = { id: uid('st'), name: LF_FINISHED, cat: 'progress' };
  sts.splice(sts.indexOf(rv), 0, fin);
  (wf.transitions = wf.transitions || []).push({ id: uid('tr'), name: LF_FINISHED, from: ['any'], to: fin.id });
  (flows || []).filter(f => prog && f.to === prog.id && (f.rules || []).some(r => r.type === 'r_assigned' || r.type === 'r_self_assigned'))
    .forEach(f => flows.push({ ...JSON.parse(JSON.stringify(f)), id: uid('tf'), name: `Move to ${LF_FINISHED}`, to: fin.id, rules: f.rules.map(r => ({ ...JSON.parse(JSON.stringify(r)), id: uid('rl') })) }));
}
function lfEnsureFinished(st) {
  st.spaces.forEach(sp => lfAddFinished(sp.workflow, sp.taskFlows));
  st.taskTemplates.forEach(t => lfAddFinished(t.workflow, t.flows));
  // lead tasks used to lock until every task in the stage was assigned; now each task locks until it is assigned
  const lfItems = new Set(st.items.filter(i => i.lf).map(i => i.id));
  const perTask = (flows, isLead) => (flows || []).forEach(f => { if (isLead(f)) (f.rules || []).forEach(r => { if (r.type === 'r_assigned') r.type = 'r_self_assigned'; }); });
  st.spaces.forEach(sp => perTask(sp.taskFlows, f => lfItems.has(f.taskId)));
  st.taskTemplates.forEach(t => { const refs = new Set((t.tasks || []).filter(x => x.lf).map(x => x.ref)); perTask(t.flows, f => refs.has(f.taskId)); });
}
/* One lead folder per lead type: the original becomes "Leads: System" and "Leads: Spare" is added next to it,
   starting from the Sales – Spare lead template (the ERP's Spares tasks). Spare-lead spaces move across. */
function lfEnsureLeadFolders(st) {
  const fs = st.folders;
  let sys = fs.find(f => f.lead && f.lead.kind === 'System');
  if (!sys) {
    sys = fs.find(f => f.lead && !f.lead.kind);
    if (!sys) return;
    sys.name = 'Leads: System';
    sys.lead.kind = 'System';
    if (!sys.lead.templateId) sys.lead.templateId = LF_TPL_SYSTEM;
  }
  if (fs.some(f => f.lead && f.lead.kind === 'Spare')) return;
  const spare = { id: uid('fd'), name: 'Leads: Spare', collapsed: false, lead: { kind: 'Spare', templateId: sys.lead.spareTemplateId || LF_TPL_SPARE, stageId: sys.lead.stageId || '' } };
  fs.splice(fs.indexOf(sys) + 1, 0, spare);
  delete sys.lead.spareTemplateId;
  st.spaces.forEach(sp => { const l = sp.leadId && st.erp.leads.find(x => x.id === sp.leadId); if (sp.folderId === sys.id && l && l.type === 'Spare') sp.folderId = spare.id; });
}
/* Remove the TEST lead, its space and everything made for it */
function lfRemoveTest() {
  const e = erp(), st = Store.state;
  const leads = new Set(e.leads.filter(l => l.test).map(l => l.id));
  const sps = new Set(st.spaces.filter(s => s.test || leads.has(s.leadId)).map(s => s.id));
  const quotes = new Set(e.quotes.filter(q => leads.has(q.leadId)).map(q => q.id));
  st.items = st.items.filter(i => !sps.has(i.spaceId));
  st.spaces = st.spaces.filter(s => !sps.has(s.id));
  st.recent = st.recent.filter(r => !sps.has(r));
  e.invoices = e.invoices.filter(i => !quotes.has(i.quoteId) && !leads.has(i.leadId));
  e.quotes = e.quotes.filter(q => !quotes.has(q.id));
  e.meetings = e.meetings.filter(m => !m.test && !leads.has(m.leadId));
  e.calcs = e.calcs.filter(c => !c.test && !leads.has(c.leadId));
  e.clients = e.clients.filter(c => c.name !== 'Test Client (workflow simulation)');
  e.leads = e.leads.filter(l => !leads.has(l.id));
}

/* Put a lead space's tasks in workflow order (stage, then its tasks). Tasks people added keep their place after them.
   The test space also gets its keys renumbered so TEST-1, 2, 3… read in workflow order. */
function lfReorderSpace(sp) {
  const items = Store.itemsOf(sp.id), lfs = items.filter(i => i.lf);
  if (!lfs.length) return;
  const spare = lfs.some(i => i.lf.id === 'spare-category');
  const list = spare ? LF_SPARE_TASKS : LF_SYSTEM_TASKS;
  const groupOf = id => (spare ? 'sp' : (LF_TASKS[id] || {}).group);
  const order = [];
  [...new Set(list.map(([id]) => groupOf(id)))].forEach(g => { order.push('group:' + g); list.forEach(([id]) => { if (groupOf(id) === g) order.push(id); if (id === 'design-calculation') order.push('design-calculation-post'); }); });
  LF_DELIVERY_GROUPS.forEach(g => { order.push('group:' + g); Object.keys(LF_TASKS).forEach(id => { if (LF_TASKS[id].group === g) order.push(id); }); });
  const pos = id => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const sorted = lfs.slice().sort((a, b) => pos(a.lf.id) - pos(b.lf.id));
  sorted.forEach((it, i) => { it.rank = i + 1; });
  if (!sp.test) return;
  const rest = items.filter(i => !i.lf).sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  const map = {};
  [...sorted, ...rest].forEach((it, i) => { map[it.key] = `${sp.key}-${i + 1}`; });
  const re = new RegExp(`\\b${sp.key}-\\d+\\b`, 'g');
  const fix = s => (typeof s === 'string' ? s.replace(re, k => map[k] || k) : s);
  items.forEach(it => { it.key = map[it.key] || it.key; it.history.forEach(h => { h.text = fix(h.text); }); });
  (Store.state.activity || []).forEach(a => { a.text = fix(a.text); });
  (Store.state.notifications || []).forEach(n => { n.text = fix(n.text); });
}

/* The test space, worked the way the ERP does it: the lead is qualified and its space is created from the folder
   template, the project head hands out the Requirement Engineering tasks (unlocking the stage), and the first tasks
   are done: systems picked, questionnaire filled, sizing saved in Calculators, BOQ and Scope Matrix filled in.
   P&ID and the quotation are still open, so the project-team review is waiting on them. */
function lfSimulate(f) {
  const e = erp(), me = Store.state.me;
  const qualified = erpSet('crm').stages.find(s => s.id === f.lead.stageId);
  if (!qualified || e.leads.some(l => l.test)) return;
  const l = newLead({ title: 'TEST – Electrochlorinator 2 kg/day', company: 'Test Client (workflow simulation)', value: 750000, priority: 'high', source: 'Website', industry: 'WTP', type: 'System', owner: me, stageId: erpSet('crm').stages[0].id, expected: addDays(todayStr(), 40), requirement: 'Simulation lead for the Leads folder workflow. Safe to delete.', contact: { name: 'Test Contact', phone: '', email: '' }, test: true });
  setLeadStage(l, qualified.id, { quiet: true }); // the folder rule creates the space
  const sp = (l.spaceId && Store.space(l.spaceId)) || createLeadSpace(l, f);
  sp.name = 'TEST · Sales workflow simulation';
  sp.test = true;
  const t = id => lfTask(sp, id);
  const head = lfProjectPeople()[0];
  const as = {};
  Store.itemsOf(sp.id).filter(i => (lfDef(i) || {}).lock).forEach(i => { as[i.id] = ['pid', 'gad', 'foundation-load'].includes(i.lf.id) ? head : me; });
  lfAssignTeam(sp, head, as);
  const fill = (id, values) => { const x = t(id); Object.assign(lfValues(x), values); return x; };
  const sys = 'E-Chloro (Contin.) (2 kg/day)';
  lfFinish(fill('system-requirement', { rows: [{ system: 'E-Chloro (Contin.)', capacity: '2 kg/day', prepost: false }], notes: 'Client wants on-site hypo generation instead of gas.' }), { quiet: true });
  const docs = t('client-documents'); lfValues(docs).note = 'Tender specification TS-114 received by email (simulation).'; lfFinish(docs, { quiet: true });
  lfFinish(fill('questionnaires', { system: sys, flow: '120', dose: '3', water: 'Treated water', residual: '0.5', hours: '24', power: '415 V, 3 phase', site: 'Indoor room 6 × 4 m next to the clear-water sump.' }), { quiet: true });
  e.calcs.push({ id: uid('calc'), type: 'electro', name: 'Test Client – 2 kg/day', leadId: l.id, inputs: {}, headline: '2 kg/day NaOCl generator', at: nowISO(), by: me, test: true });
  leadFlowSync(); // the saved sizing finishes Design Calculation
  lfFinish(fill('boq', { system: sys, rows: [{ item: 'Electrochlorinator 5 kg/day', spec: 'On-site NaOCl generation with cell, rectifier and brine tank', qty: '1', unit: 'Set', make: 'RSVP' }, { item: 'Dosing Pump 0–60 LPH', spec: 'Electronic diaphragm dosing pump', qty: '2', unit: 'Nos', make: '' }, { item: 'Installation & Commissioning', spec: '', qty: '1', unit: 'Lot', make: 'RSVP' }] }), { quiet: true });
  lfFinish(fill('scope-matrix', { system: sys }), { quiet: true });
  fill('process-data-sheet', { system: sys });
  Store.updateItem(t('process-data-sheet').id, { statusId: sp.workflow.statuses.find(s => s.cat === 'progress').id }, true, { quiet: true });
  leadFlowSync();
}

/* ---------------- folder settings ---------------- */
function lfFolderFieldsHTML(folder) {
  const c = (folder && folder.lead) || {};
  const tpls = Store.state.taskTemplates.map(t => ({ value: t.id, label: t.name }));
  return `<div class="sep"></div><h4>Tasks for spaces in this folder</h4>
    <label class="field"><span class="field-label">Every new space in this folder starts from</span>${selectHTML('ftpl', tpls, c.templateId, { blank: 'No template' })}<span class="field-help">Stages, approvals, tasks and rules are copied into each space created here.</span></label>
    <label class="field"><span class="field-label">Spaces for Spare leads start from</span>${selectHTML('fspare', tpls, c.spareTemplateId, { blank: 'Same as above' })}</label>
    <label class="field"><span class="field-label">Create a space here for every lead that reaches</span>${selectHTML('fstage', erpSet('crm').stages.filter(s => s.cat !== 'lost').map(s => ({ value: s.id, label: s.name })), c.stageId, { blank: 'Don’t create spaces automatically' })}<span class="field-help">Leads further down the pipeline count too. Won and lost leads are skipped.</span></label>`;
}
async function lfSaveFolderFields(el, f) {
  const v = n => el.querySelector(`[name=${n}]`).value || '';
  const before = f.lead && f.lead.stageId;
  const kind = f.lead && f.lead.kind;
  f.lead = { templateId: v('ftpl'), spareTemplateId: v('fspare'), stageId: v('fstage') };
  if (kind) f.lead.kind = kind;
  if (!f.lead.templateId && !f.lead.spareTemplateId && !f.lead.stageId && !kind) delete f.lead;
  const waiting = f.lead && f.lead.stageId ? lfLeadsWithoutSpace(f) : [];
  if (waiting.length && (before !== f.lead.stageId || !before)) {
    if (await confirmDialog({ title: `Create spaces for ${waiting.length} lead${waiting.length === 1 ? '' : 's'}?`, message: `${waiting.map(l => `LD-${l.no} ${esc(l.title)}`).join(', ')} ${waiting.length === 1 ? 'is' : 'are'} already at or past this stage and ${waiting.length === 1 ? 'has' : 'have'} no space yet.`, confirmLabel: 'Create spaces', danger: false })) {
      waiting.forEach(l => createLeadSpace(l, f));
      Store.save(); toast(`${waiting.length} space${waiting.length === 1 ? '' : 's'} created in ${f.name}`);
    }
  }
}
