/* Sales app: quotations, proforma invoices, product catalog, printable documents */

const QUOTE_ST = { draft: ['Draft', 'cat-todo'], sent: ['Sent', 'cat-progress'], accepted: ['Accepted', 'cat-done'], declined: ['Declined', 'cat-danger'], expired: ['Expired', 'cat-warn'] };
const INV_ST = { draft: ['Draft', 'cat-todo'], unpaid: ['Unpaid', 'cat-progress'], partial: ['Partly paid', 'cat-warn'], overdue: ['Overdue', 'cat-danger'], paid: ['Paid', 'cat-done'], cancelled: ['Cancelled', 'cat-todo'] };

function quoteStatus(q) { return q.status === 'sent' && q.validUntil && q.validUntil < todayStr() ? 'expired' : q.status; }
function quotePill(q) { const s = QUOTE_ST[quoteStatus(q)]; return pill(s[0], s[1]); }
function invoicePaid(i) { return (i.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0); }
function invoiceBalance(i) { return i.status === 'cancelled' || i.status === 'draft' ? 0 : Math.max(0, lineTotals(i).total - invoicePaid(i)); }
function invoiceStatus(i) {
  if (i.status === 'cancelled' || i.status === 'draft') return i.status;
  const total = lineTotals(i).total, paid = invoicePaid(i);
  if (total > 0 && paid >= total - 0.5) return 'paid';
  if (i.dueDate && i.dueDate < todayStr()) return 'overdue';
  return paid > 0 ? 'partial' : 'unpaid';
}
function invoicePill(i) { const s = INV_ST[invoiceStatus(i)]; return pill(s[0], s[1]); }
function nextDocNo(kind) {
  const s = erpSet('sales');
  const k = kind === 'quote' ? 'nextQuote' : 'nextInvoice';
  const n = s[k] || 1; s[k] = n + 1;
  return `${kind === 'quote' ? s.quotePrefix : s.invoicePrefix}${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
}

registerApp({
  id: 'sales', name: 'Sales', short: 'Quotes & invoices', desc: 'Build quotations from your catalog, turn them into proforma invoices and track payments', color: '#4BCE97', glyph: 'receipt',
  tabs: [
    { id: 'summary', name: 'Summary', icon: 'globe' },
    { id: 'quotes', name: 'Quotations', icon: 'quote', count: () => erp().quotes.filter(q => quoteStatus(q) === 'sent').length },
    { id: 'invoices', name: 'Invoices', icon: 'receipt', count: () => erp().invoices.filter(i => ['unpaid', 'partial', 'overdue'].includes(invoiceStatus(i))).length },
    { id: 'catalog', name: 'Catalog', icon: 'box' },
    { id: 'settings', name: 'Settings', icon: 'gear' },
  ],
  primary(r) {
    if (r.tab === 'invoices') return { label: 'New invoice', run: () => openInvoice(null) };
    if (r.tab === 'catalog') return { label: 'New item', run: () => openCatalogItem(null) };
    return { label: 'New quotation', run: () => openQuote(null) };
  },
  shortcuts() {
    const e = erp();
    return [
      { id: 'draft', label: 'Draft quotations', icon: 'edit', href: '#/app/sales/quotes?st=draft', count: e.quotes.filter(q => q.status === 'draft').length },
      { id: 'await', label: 'Awaiting response', icon: 'clock', href: '#/app/sales/quotes?st=sent', count: e.quotes.filter(q => quoteStatus(q) === 'sent').length },
      { id: 'unpaid', label: 'Unpaid invoices', icon: 'wallet', href: '#/app/sales/invoices?st=unpaid', count: e.invoices.filter(i => ['unpaid', 'partial'].includes(invoiceStatus(i))).length },
      { id: 'overdue', label: 'Overdue invoices', icon: 'bell', href: '#/app/sales/invoices?st=overdue', count: e.invoices.filter(i => invoiceStatus(i) === 'overdue').length },
    ];
  },
  stats() {
    const e = erp();
    return [{ label: 'Open quotes', value: e.quotes.filter(q => quoteStatus(q) === 'sent').length }, { label: 'To collect', value: moneyShort(e.invoices.reduce((s, i) => s + invoiceBalance(i), 0)) }, { label: 'Catalog items', value: e.catalog.length }];
  },
  create(anchor) { menu(anchor, [{ value: 'q', label: 'Quotation', icon: icon('quote') }, { value: 'i', label: 'Proforma invoice', icon: icon('receipt') }, { value: 'c', label: 'Catalog item', icon: icon('box') }], v => (v === 'q' ? openQuote(null) : v === 'i' ? openInvoice(null) : openCatalogItem(null))); },
  render(tab, root, r) {
    if (tab === 'summary') return salesSummary(root);
    if (tab === 'quotes') return salesQuotes(root, r);
    if (tab === 'invoices') return salesInvoices(root, r);
    if (tab === 'catalog') return salesCatalog(root);
    if (tab === 'settings') return salesSettings(root, r);
  },
});

/* ---------------- Summary ---------------- */
function salesSummary(root) {
  const e = erp(), t = todayStr(), mk = monthKey(t);
  const qsent = e.quotes.filter(q => q.status !== 'draft');
  const quotedMonth = qsent.filter(q => monthKey(q.date) === mk).reduce((s, q) => s + lineTotals(q).total, 0);
  const acceptedMonth = e.quotes.filter(q => q.status === 'accepted' && monthKey(q.updated) === mk).reduce((s, q) => s + lineTotals(q).total, 0);
  const live = e.invoices.filter(i => i.status !== 'draft' && i.status !== 'cancelled');
  const invoicedMonth = live.filter(i => monthKey(i.date) === mk).reduce((s, i) => s + lineTotals(i).total, 0);
  const outstanding = live.reduce((s, i) => s + invoiceBalance(i), 0);
  const overdue = live.filter(i => invoiceStatus(i) === 'overdue');
  const decided = e.quotes.filter(q => ['accepted', 'declined'].includes(q.status));
  const conv = decided.length ? Math.round(decided.filter(q => q.status === 'accepted').length / decided.length * 100) : 0;
  const stCounts = Object.keys(QUOTE_ST).map(k => ({ label: QUOTE_ST[k][0], value: e.quotes.filter(q => quoteStatus(q) === k).length, color: { draft: 'var(--cat-todo-mark)', sent: 'var(--cat-progress-mark)', accepted: 'var(--cat-done-mark)', declined: 'var(--danger)', expired: 'var(--warn)' }[k] }));
  const months = []; for (let k = 5; k >= 0; k--) months.push(shiftMonth(mk, -k));
  const inv = months.map(m => live.filter(i => monthKey(i.date) === m).reduce((s, i) => s + lineTotals(i).total, 0));
  const col = months.map(m => e.invoices.reduce((s, i) => s + (i.payments || []).filter(p => monthKey(p.date) === m).reduce((a, p) => a + (Number(p.amount) || 0), 0), 0));
  const byClient = e.clients.map(c => ({ c, v: live.filter(i => i.clientId === c.id).reduce((s, i) => s + lineTotals(i).total, 0) })).filter(x => x.v).sort((a, b) => b.v - a.v).slice(0, 6);
  const waiting = e.quotes.filter(q => quoteStatus(q) === 'sent').sort((a, b) => a.validUntil.localeCompare(b.validUntil)).slice(0, 6);
  const topItems = e.catalog.map(ci => ({ ci, n: e.quotes.reduce((s, q) => s + docLines(q).filter(l => l.itemId === ci.id).reduce((a, l) => a + (Number(l.qty) || 0), 0), 0) })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 5);

  root.innerHTML = `<div class="summary">
    <div class="stat-row">
      ${statCard('quote', moneyShort(quotedMonth), 'Quoted this month', `${qsent.filter(q => monthKey(q.date) === mk).length} quotation${qsent.filter(q => monthKey(q.date) === mk).length === 1 ? '' : 's'} sent`, { href: '#/app/sales/quotes' })}
      ${statCard('checkCircle', moneyShort(acceptedMonth), 'Accepted this month', `${conv}% of decided quotes accepted`, { tone: 'good' })}
      ${statCard('receipt', moneyShort(invoicedMonth), 'Invoiced this month', `${live.filter(i => monthKey(i.date) === mk).length} invoice(s)`, { href: '#/app/sales/invoices' })}
      ${statCard('wallet', moneyShort(outstanding), 'To collect', overdue.length ? `${overdue.length} overdue` : 'Nothing overdue', { tone: overdue.length ? 'bad' : '', href: '#/app/sales/invoices?st=unpaid' })}
    </div>
    <div class="sum-grid">
      ${panel('Revenue', 'Invoiced vs. collected, last 6 months.', `<div class="legend-inline"><span><span class="sw line" style="background:var(--series-1)"></span>Invoiced</span><span><span class="sw line" style="background:var(--series-2)"></span>Collected</span></div>
        ${groupedBars(months.map((m, i) => ({ label: MONTHS[Number(m.slice(5)) - 1], a: inv[i], b: col[i], tip: `${monthLabel(m)} — Invoiced ${money(inv[i])} · Collected ${money(col[i])}` })))}`)}
      ${panel('Quotation status', 'Every quotation by where it stands.', e.quotes.length ? `<div class="donut-wrap">${donut(stCounts, e.quotes.length, 180, 'Quotations')}<ul class="legend-list">${stCounts.map(x => `<li><span class="sw" style="background:${x.color}"></span>${x.label}: <b>${x.value}</b></li>`).join('')}</ul></div>` : miniEmpty('No quotations yet.'))}
      ${panel('Awaiting response', 'Sent quotations, soonest to expire first.', waiting.length ? `<div class="mini-list">${waiting.map(q => `<div class="mini-row" data-rec="quote:${q.id}">${icon('quote')}<span class="key">${esc(q.no)}</span><span class="ellip grow">${esc((client(q.clientId) || {}).name || '—')}</span><b class="small">${moneyShort(lineTotals(q).total, q.currency)}</b><span class="due-chip ${q.validUntil <= addDays(t, 3) ? 'soon' : ''}">Valid to ${fmtDate(q.validUntil)}</span></div>`).join('')}</div>` : miniEmpty('No quotations waiting on a client.'))}
      ${panel('Overdue invoices', 'Past their due date with money still owed.', overdue.length ? `<div class="mini-list">${overdue.map(i => `<div class="mini-row" data-rec="invoice:${i.id}">${icon('receipt')}<span class="key">${esc(i.no)}</span><span class="ellip grow">${esc((client(i.clientId) || {}).name || '—')}</span><b class="small">${money(invoiceBalance(i), i.currency)}</b><span class="due-chip overdue">Due ${fmtDate(i.dueDate)}</span></div>`).join('')}</div>` : miniEmpty('Nothing overdue. Nice work.'))}
      ${panel('Top clients', 'By invoiced value.', byClient.length ? hbars(byClient.map(x => ({ label: `${clientAvatar(x.c, 18)} <span class="ellip">${esc(x.c.name)}</span>`, value: x.v, display: moneyShort(x.v), tip: money(x.v) })), byClient[0].v) : miniEmpty('No invoices yet.'))}
      ${panel('Most quoted items', 'Quantity across all quotations.', topItems.length ? hbars(topItems.map(x => ({ label: `<span class="ellip">${esc(x.ci.name)}</span>`, value: x.n, tip: `${x.n} ${x.ci.unit || ''}` })), topItems[0].n) : miniEmpty('Add catalog items to quotations to see them here.'))}
    </div></div>`;
}

/* ---------------- Quotations list ---------------- */
function salesQuotes(root, r) {
  const e = erp(), st = (r.query && r.query.st) || 'all';
  const vs = ui('sales.quotes', { search: '' });
  let list = e.quotes.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const count = k => e.quotes.filter(q => quoteStatus(q) === k).length;
  if (st !== 'all') list = list.filter(q => quoteStatus(q) === st);
  if (vs.search) { const x = vs.search.toLowerCase(); list = list.filter(q => `${q.no} ${(client(q.clientId) || {}).name} ${(lead(q.leadId) || {}).title}`.toLowerCase().includes(x)); }
  root.innerHTML = `<div class="wide-page">
    ${subtabs([{ id: 'all', label: 'All', count: e.quotes.length, href: '#/app/sales/quotes' }, ...Object.keys(QUOTE_ST).map(k => ({ id: k, label: QUOTE_ST[k][0], count: count(k), href: `#/app/sales/quotes?st=${k}` }))], st)}
    <div class="toolbar tight"><div class="search-sm">${icon('search')}<input placeholder="Search quotations" value="${esc(vs.search)}" data-qv data-keep="q-search"></div><span class="grow"></span>
      <button class="btn subtle sm" data-q-csv>${icon('download', 14)} CSV</button></div>
    <div class="table-wrap"><table class="grid"><thead><tr><th style="width:140px">Number</th><th>Client</th><th style="width:220px">Lead</th><th style="width:110px">Date</th><th style="width:120px">Valid until</th><th style="width:140px" class="num">Amount</th><th style="width:120px">Status</th><th style="width:48px"></th></tr></thead>
    <tbody>${list.map(q => { const c = client(q.clientId), l = lead(q.leadId), rev = quoteRev(q); return `<tr class="row-link" data-rec="quote:${q.id}"><td><b>${esc(q.no || 'Draft')}</b></td><td><span class="cell-in">${c ? `${clientAvatar(c, 22)} <span class="ellip">${esc(c.name)}</span>` : '<span class="muted">No client</span>'}</span></td>
      <td>${l ? `<a class="ellip link-plain q-lead-link" data-rec="lead:${l.id}" title="Open the lead">LD-${l.no} ${esc(l.title)}</a>` : '<span class="muted">—</span>'}</td><td>${fmtDate(q.date)}</td><td class="${quoteStatus(q) === 'expired' ? 'warn-text' : ''}">${fmtDate(q.validUntil)}</td>
      <td class="num"><b>${money(lineTotals(q).total, q.currency)}</b>${rev > 1 ? `<button class="link small q-rev-link" data-q-revs="${q.id}" title="Show the revision history">Rev ${rev} ▾ history</button>` : ''}</td><td>${quotePill(q)}</td><td><button class="icon-btn xs" data-q-more="${q.id}" title="More actions">${icon('more', 14)}</button></td></tr>
      ${rev > 1 ? `<tr class="q-rev-row" data-q-revrow="${q.id}" hidden><td colspan="8"><div class="q-revs inline">${quoteRevListHTML(q)}</div></td></tr>` : ''}`; }).join('')}</tbody></table>
    ${!list.length ? emptyState({ title: 'No quotations here', text: 'Create a quotation from a lead, a client or right here.', art: 'quote', action: '<button class="btn primary" data-q-new>New quotation</button>' }) : ''}</div>
    <div class="list-foot"><span>${list.length} quotation${list.length === 1 ? '' : 's'} · ${money(list.reduce((s, q) => s + lineTotals(q).total, 0))}</span></div></div>`;
  root.addEventListener('input', ev => { if (ev.target.matches('[data-qv]')) { vs.search = ev.target.value; render(); } });
  root.addEventListener('click', ev => {
    const more = ev.target.closest('[data-q-more]');
    if (more) { ev.stopPropagation(); quoteMenu(more, quote(more.dataset.qMore)); return; }
    const rh = ev.target.closest('[data-q-revs]');
    if (rh) { ev.stopPropagation(); const row = root.querySelector(`[data-q-revrow="${rh.dataset.qRevs}"]`); row.hidden = !row.hidden; rh.classList.toggle('open', !row.hidden); return; }
    const rv = ev.target.closest('[data-rev-view]');
    if (rv) { ev.stopPropagation(); const [qid, r] = rv.dataset.revView.split('|'); viewQuoteRevision(quote(qid), r); return; }
    if (ev.target.closest('[data-q-new]')) openQuote(null);
    if (ev.target.closest('[data-q-csv]')) downloadCSV(`quotations-${todayStr()}.csv`, [['Number', 'Client', 'Lead', 'Date', 'Valid until', 'Status', 'Subtotal', 'Discount', 'GST', 'Total'], ...list.map(q => { const tt = lineTotals(q); return [q.no, (client(q.clientId) || {}).name, (lead(q.leadId) || {}).title, q.date, q.validUntil, QUOTE_ST[quoteStatus(q)][0], tt.sub.toFixed(2), tt.disc.toFixed(2), tt.tax.toFixed(2), tt.total.toFixed(2)]; })]);
  }, true);
}
function quoteMenu(anchor, q) {
  menu(anchor, [
    { value: 'open', label: 'Open', icon: icon('edit') },
    { value: 'print', label: 'Print / save as PDF', icon: icon('print') },
    ...(q.status === 'draft' ? [{ value: 'sent', label: 'Mark as sent', icon: icon('mail') }] : []),
    { value: 'dup', label: 'Duplicate as new draft', icon: icon('copy') },
    ...(q.status === 'accepted' ? [{ value: 'inv', label: 'Create proforma invoice', icon: icon('receipt') }] : []),
    '-', { value: 'del', label: 'Delete', icon: icon('trash'), danger: true },
  ], async v => {
    if (v === 'open') openQuote(q.id);
    if (v === 'print') printDoc('quote', q);
    if (v === 'sent') markQuoteSent(q);
    if (v === 'dup') duplicateQuote(q);
    if (v === 'inv') createInvoiceFromQuote(q);
    if (v === 'del') deleteQuote(q);
  }, { align: 'right' });
}
async function deleteQuote(q, after) {
  const invs = erp().invoices.filter(i => i.quoteId === q.id).length;
  if (!await confirmDialog({ title: `Delete ${q.no || 'this draft'}?`, message: invs ? `${invs} invoice(s) were made from it; they are kept.` : 'This quotation is permanently deleted.' })) return;
  erp().quotes = erp().quotes.filter(x => x !== q);
  erp().invoices.forEach(i => { if (i.quoteId === q.id) i.quoteId = null; });
  erpLog('sales', `deleted quotation ${q.no || ''}`);
  Store.save(); toast('Quotation deleted');
  if (after) after();
}
function duplicateQuote(q) {
  const s = erpSet('sales');
  const n = { ...JSON.parse(JSON.stringify(q)), id: uid('qt'), no: '', status: 'draft', date: todayStr(), validUntil: addDays(todayStr(), s.validityDays || 30), created: nowISO(), updated: nowISO(), sentAt: null, sample: false, revisionOf: q.id, revision: 0, revisions: [] };
  openQuote(null, n);
}

/* ---------------- Line items editor (quotes + invoices) ---------------- */
function lineAmount(l, w) { const g = (Number(l.qty) || 0) * (Number(l.price) || 0); const dp = w.discountMode === 'total' ? (Number(w.discount) || 0) : (Number(l.disc) || 0); return g - g * dp / 100; }
function blankLine() { return { itemId: null, item: '', description: '', hsn: '', qty: 1, price: 0, disc: 0, gst: erpSet('sales').gstDefault }; }
/* one line-items table. `grp` names which list it edits: '' is the document's own lines, anything else is
   resolved by bindLinesEditor's linesOf (a quotation's extra delivery locations) */
function linesEditorHTML(w, { hsn = false, readonly = false, grp = '', lines = w.lines, discCtrl = true, datalist = true } = {}) {
  const total = w.discountMode === 'total';
  const ro = readonly ? 'disabled' : '';
  const g = `data-grp="${grp}"`;
  const tax = w.gstType === 'IGST' ? 'IGST' : 'GST';
  return `<div class="lines-wrap"><table class="grid lines"><thead><tr><th style="width:30px">#</th><th>Item / service</th>${hsn ? '<th style="width:110px">HSN/SAC</th>' : ''}<th style="width:80px">Qty</th><th style="width:130px">Unit price</th>${total ? '' : '<th style="width:80px">Disc %</th>'}<th style="width:76px">${tax} %</th><th style="width:140px" class="num">Amount</th><th style="width:36px"></th></tr></thead>
    <tbody>${lines.map((l, i) => `<tr><td class="muted">${i + 1}</td>
      <td class="li-item"><input class="input cell" list="cat-list" ${g} data-li="${i}" data-lk="item" value="${esc(l.item)}" placeholder="Type or pick from catalog" ${ro}><input class="input cell desc" ${g} data-li="${i}" data-lk="description" value="${esc(l.description || '')}" placeholder="Description" ${ro}></td>
      ${hsn ? `<td><input class="input cell" ${g} data-li="${i}" data-lk="hsn" value="${esc(l.hsn || '')}" ${ro}></td>` : ''}
      <td><input class="input cell num" type="number" min="0" step="any" ${g} data-li="${i}" data-lk="qty" value="${esc(l.qty)}" ${ro}></td>
      <td><input class="input cell num" type="number" min="0" step="any" ${g} data-li="${i}" data-lk="price" value="${esc(l.price)}" ${ro}></td>
      ${total ? '' : `<td><input class="input cell num" type="number" min="0" max="100" step="any" ${g} data-li="${i}" data-lk="disc" value="${esc(l.disc || 0)}" ${ro}></td>`}
      <td><input class="input cell num" type="number" min="0" max="40" step="any" ${g} data-li="${i}" data-lk="gst" value="${esc(l.gst)}" ${ro}></td>
      <td class="num" data-amt="${grp}|${i}">${money(lineAmount(l, w), w.currency)}</td>
      <td>${readonly ? '' : `<button class="icon-btn xs" ${g} data-del-line="${i}" title="Remove line">${icon('trash', 14)}</button>`}</td></tr>`).join('')}</tbody></table>
    ${datalist ? `<datalist id="cat-list">${erp().catalog.map(c => `<option value="${esc(c.name)}">${esc(money(c.price))} · ${esc(c.category || '')}</option>`).join('')}</datalist>` : ''}
    ${readonly ? '' : `<div class="lines-actions"><button class="btn subtle sm" ${g} data-add-line>${icon('plus', 12)} Add line</button><button class="btn subtle sm" ${g} data-add-cat>${icon('box', 12)} Add from catalog</button><span class="grow"></span>
      ${discCtrl ? `<span class="muted small">Discount</span><div class="seg"><button class="${total ? '' : 'on'}" data-dmode="inline">Per line</button><button class="${total ? 'on' : ''}" data-dmode="total">Overall</button></div>
      ${total ? `<input class="input cell num" style="width:80px" type="number" min="0" max="100" step="any" data-overall value="${esc(w.discount || 0)}"><span class="muted small">%</span>` : ''}` : ''}</div>`}</div>`;
}
function totalsHTML(w, extra = '') {
  const t = lineTotals(w);
  return `<div class="totals"><div><span>Subtotal</span><b>${money(t.sub, w.currency)}</b></div>
    ${t.disc ? `<div><span>Discount</span><b>− ${money(t.disc, w.currency)}</b></div><div><span>Taxable value</span><b>${money(t.sub - t.disc, w.currency)}</b></div>` : ''}
    <div><span>GST</span><b>${money(t.tax, w.currency)}</b></div>
    <div class="grand"><span>Grand total</span><b>${money(t.total, w.currency)}</b></div>${extra}</div>`;
}
/* a menu of catalog items; pick(ci) gets the chosen one */
function catalogMenu(anchor, pick) {
  const cat = erp().catalog;
  menu(anchor, cat.length ? cat.map(c => ({ value: c.id, label: `${esc(c.name)} <span class="muted small">${esc(money(c.price))}</span>`, icon: icon('box') })) : [{ value: '', label: '<span class="muted">Catalog is empty — add items in Sales › Catalog</span>', disabled: true }], v => {
    const ci = cat.find(c => c.id === v); if (ci) pick(ci);
  }, { width: 360 });
}
function bindLinesEditor(el, w, { hsn = false, onTotals, linesOf = () => w.lines, redraw: redrawAll } = {}) {
  const box = el.querySelector('[data-lines]');
  const redraw = () => { if (redrawAll) redrawAll(); else box.innerHTML = linesEditorHTML(w, { hsn }); onTotals(); };
  const grpOf = t => t.dataset.grp || '';
  el.addEventListener('input', e => {
    const i = e.target.dataset.li, k = e.target.dataset.lk;
    if (i != null && k) {
      const g = grpOf(e.target), l = linesOf(g)[Number(i)];
      l[k] = e.target.value;
      const amt = box.querySelector(`[data-amt="${g}|${i}"]`); if (amt) amt.textContent = money(lineAmount(l, w), w.currency);
      onTotals();
    }
    if (e.target.matches('[data-overall]')) {
      w.discount = e.target.value;
      $$('[data-amt]', box).forEach(c => { const [g, i] = c.dataset.amt.split('|'); c.textContent = money(lineAmount(linesOf(g)[Number(i)], w), w.currency); });
      onTotals();
    }
  });
  el.addEventListener('change', e => {
    if (e.target.dataset.lk !== 'item') return;
    const l = linesOf(grpOf(e.target))[Number(e.target.dataset.li)];
    const ci = erp().catalog.find(c => c.name === e.target.value);
    if (ci) { Object.assign(l, { itemId: ci.id, item: ci.name, description: ci.description || '', hsn: ci.hsn || '', price: ci.price, gst: ci.gst }); redraw(); } else l.itemId = null;
  });
  el.addEventListener('click', e => {
    const d = e.target.closest('[data-del-line]');
    if (d) { const ls = linesOf(grpOf(d)); ls.splice(Number(d.dataset.delLine), 1); if (!ls.length) ls.push(blankLine()); redraw(); }
    const al = e.target.closest('[data-add-line]');
    if (al) { const g = grpOf(al); linesOf(g).push(blankLine()); redraw(); const ins = $$(`[data-lk="item"][data-grp="${g}"]`, box); ins[ins.length - 1].focus(); }
    const dm = e.target.closest('[data-dmode]');
    if (dm) { w.discountMode = dm.dataset.dmode; redraw(); }
    const ac = e.target.closest('[data-add-cat]');
    if (ac) {
      const ls = linesOf(grpOf(ac));
      catalogMenu(ac, ci => {
        const blank = ls.findIndex(l => !l.item);
        const nl = { itemId: ci.id, item: ci.name, description: ci.description || '', hsn: ci.hsn || '', qty: 1, price: ci.price, disc: 0, gst: ci.gst };
        if (blank >= 0) ls[blank] = nl; else ls.push(nl);
        redraw();
      });
    }
  });
}
function termsField(name, label, value, presets) {
  return `<label class="field"><span class="field-label row gap8">${label}${presets && presets.length ? `<select class="input preset-sel" data-preset="${name}"><option value="">Use a preset…</option>${presets.map(p => `<option>${esc(p)}</option>`).join('')}</select>` : ''}</span><textarea class="input" rows="2" name="${name}">${esc(value || '')}</textarea></label>`;
}

/* ---------------- Quotation numbers: QT/RSVP/<client code>/<financial year>/<serial>, as in the ERP ---------------- */
const QUOTE_NO_RE = /^QT\/RSVP\/([A-Z0-9]+)\/(\d{2}-\d{2})\/(\d+)$/;
// the ERP's series had already reached 071 in FY 26-27 before this app, so that year never numbers below 072
const QUOTE_NO_FLOOR = 72, QUOTE_NO_FLOOR_FY = '26-27';
function finYearCode(date) {
  const d = date ? new Date(date) : new Date(), x = isNaN(d) ? new Date() : d;
  const start = x.getMonth() >= 3 ? x.getFullYear() : x.getFullYear() - 1;
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`;
}
function clientInitials(name) {
  const words = String(name || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim().split(/\s+/).filter(Boolean);
  let s = words.length >= 3 ? words.slice(0, 3).map(x => x[0]).join('') : words.length === 2 ? words[0].slice(0, 2) + words[1][0] : words.length ? words[0].slice(0, 3) : '';
  while (s.length < 3) s += 'X';
  return s.slice(0, 3);
}
function nextQuoteNo(clientName, date, exceptId) {
  const fy = finYearCode(date);
  let max = 0, width = 3;
  erp().quotes.forEach(q => { if (q.id === exceptId) return; const m = QUOTE_NO_RE.exec(q.no || ''); if (m && m[2] === fy && Number(m[3]) > max) { max = Number(m[3]); width = m[3].length; } });
  if (fy === QUOTE_NO_FLOOR_FY && max < QUOTE_NO_FLOOR - 1) max = QUOTE_NO_FLOOR - 1;
  return `QT/RSVP/${clientInitials(clientName)}/${fy}/${String(max + 1).padStart(width, '0')}`;
}

/* ---------------- Quotation data ---------------- */
const QUOTE_CURRENCIES = [['INR', 'INR - Indian Rupee'], ['USD', 'USD - US Dollar'], ['EUR', 'EUR - Euro'], ['GBP', 'GBP - British Pound'], ['BHD', 'BHD - Bahraini Dinar']];
const quoteTax = q => (q.gstType === 'IGST' ? 'IGST' : 'GST');
/* Bill To details from the quotation's client, or from its lead while the lead has no client yet */
function quoteBillToFrom(q) {
  const l = lead(q.leadId), c = client(q.clientId) || (l && client(l.clientId));
  const ct = (c && c.contacts && c.contacts[0]) || {};
  return {
    name: c ? c.name : l ? l.company : '',
    address: c ? [c.address, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join('\n') : l ? leadCity(l) : '',
    phone: (l && l.contact.phone) || ct.phone || '',
    email: (l && l.contact.email) || ct.email || '',
    gst: (c && c.gst) || '',
  };
}
/* quotations saved before the ERP layout get its fields, filled in the way the ERP would */
function normalizeQuote(q) {
  const s = erpSet('sales'), co = erpSet('company');
  if (!q.from) q.from = { name: co.name, address: co.address, gst: co.gst };
  if (!q.billTo) q.billTo = quoteBillToFrom(q);
  if (!Array.isArray(q.locations)) q.locations = [];
  if (q.mainLocationLabel == null) q.mainLocationLabel = '';
  if (!q.optionalItem) q.optionalItem = { item: '', description: '', price: '' };
  if (!q.gstType) q.gstType = 'GST';
  if (q.bankDetails == null) q.bankDetails = s.bankOptions[0] || '';
  if (!Array.isArray(q.conditions)) q.conditions = [];
  if (q.signoff == null) q.signoff = s.signoff;
  if (q.preparedByContact == null) q.preparedByContact = (empRecord(q.preparedBy) || {}).phone || '';
  return q;
}
/* numbers typed into the form are strings until saved */
function tidyQuote(q) {
  docLines(q).forEach(l => ['qty', 'price', 'disc', 'gst'].forEach(k => { l[k] = Number(l[k]) || 0; }));
  q.discount = Number(q.discount) || 0;
  const p = q.optionalItem.price;
  q.optionalItem.price = p === '' || p == null ? '' : Number(p) || 0;
  q.conditions = q.conditions.filter(t => String(t).trim());
  return q;
}
/* Revisions: the first save is Rev 1 and every later save that changes the quotation is the next one.
   Each keeps a read-only copy, so earlier versions can be checked and printed. */
const QUOTE_REV_SKIP = ['revision', 'revisions', 'status', 'sentAt', 'updated', 'created', 'sample', 'revisionOf'];
function quoteSnap(q) { const c = JSON.parse(JSON.stringify(q)); delete c.revisions; return c; }
function quoteSig(q) { const c = quoteSnap(q); QUOTE_REV_SKIP.forEach(k => delete c[k]); return JSON.stringify(c); }
const quoteRev = q => q.revision || (q.no ? 1 : 0);
function quoteRevisions(q) {
  if (Array.isArray(q.revisions) && q.revisions.length) return q.revisions;
  // saved before revisions were kept: its history starts at Rev 1, as it is now
  return q.no ? [{ rev: quoteRev(q), at: q.updated || q.created, by: q.preparedBy, total: lineTotals(q).total, snap: quoteSnap(q) }] : [];
}
function quoteRevListHTML(q) {
  return quoteRevisions(q).slice().reverse().map(r => `<div class="q-rev"><b>Rev ${r.rev}</b><span class="muted small grow">${fmtDateTime(r.at)} · ${esc(personName(r.by, ''))}</span><span class="small num">${money(r.total, r.snap.currency)}</span><button class="icon-btn xs" data-rev-view="${q.id}|${r.rev}" title="View Rev ${r.rev}">${icon('eye', 14)}</button></div>`).join('');
}
function viewQuoteRevision(q, rev) {
  const r = quoteRevisions(q).find(x => x.rev === Number(rev));
  if (r) printQuote(r.snap, { revision: r.rev, preview: true });
}
/* a quotation's lines for a proforma invoice: extra delivery locations are named in each line's description */
function quoteInvoiceLines(q) {
  const tag = (l, name) => ({ ...l, description: [l.description, `Delivery: ${name}`].filter(Boolean).join(' · ') });
  if (!(q.locations || []).length) return q.lines.map(l => ({ ...l }));
  return [...q.lines.map(l => tag(l, q.mainLocationLabel || 'Delivery location 1')), ...q.locations.flatMap((x, i) => x.lines.map(l => tag(l, x.label || `Delivery location ${i + 2}`)))];
}

/* ---------------- Quotation editor ---------------- */
function openQuote(id, preset = {}) {
  const s = erpSet('sales'), co = erpSet('company');
  const existing = id && quote(id);
  if (id && !existing) return;
  if (existing) touchRecord('quote', id);
  let w;
  if (existing) w = JSON.parse(JSON.stringify(existing));
  else {
    w = Object.assign({
      id: uid('qt'), no: '', clientId: null, leadId: null, status: 'draft', date: todayStr(), validUntil: addDays(todayStr(), s.validityDays || 30), currency: s.currency,
      from: { name: co.name, address: co.address, gst: co.gst }, billTo: null, mainLocationLabel: '', locations: [],
      preparedBy: Store.state.me, preparedByContact: null,
      lines: [blankLine()], discountMode: 'inline', discount: 0, gstType: 'GST', optionalItem: { item: '', description: '', price: '' },
      paymentTerms: s.paymentTerms, deliveryTerms: s.deliveryTerms, warrantyTerms: s.warrantyTerms,
      bankDetails: s.bankOptions[0] || '', conditions: [], signoff: s.signoff,
      revision: 0, revisions: [], created: nowISO(), updated: nowISO(), sentAt: null,
    }, preset);
    if (w.leadId && !w.clientId) { const l = lead(w.leadId); if (l && l.clientId) w.clientId = l.clientId; }
    if (w.leadId && w.lines.length === 1 && !w.lines[0].item) { const l = lead(w.leadId); if (l) w.lines[0].item = l.title; }
  }
  normalizeQuote(w);
  if (!w.conditions.length) w.conditions = [''];
  const baseSig = existing ? quoteSig(tidyQuote(normalizeQuote(JSON.parse(JSON.stringify(existing))))) : null;
  const locked = existing && ['accepted', 'declined'].includes(existing.status);
  const dis = locked ? 'disabled' : '';
  // the number follows the client and date until it's typed over, like the ERP's auto-filled Quote No.
  let noTouched = !!existing || !!w.no;
  let autoBill = existing ? null : JSON.stringify(w.billTo);
  const billName = () => w.billTo.name || (client(w.clientId) || {}).name || (lead(w.leadId) || {}).company || '';
  if (!noTouched) w.no = nextQuoteNo(billName(), w.date, w.id);
  const leadOpts = () => erp().leads.filter(l => !w.clientId || l.clientId === w.clientId || l.id === w.leadId).map(l => ({ value: l.id, label: `LD-${l.no} · ${l.title}` }));
  const locById = lid => w.locations.find(x => x.id === lid);
  const linesOf = g => (g ? locById(g).lines : w.lines);
  const locTotal = ls => lineTotals({ ...w, lines: ls, locations: [] }).total;
  const get = p => p.split('.').reduce((o, k) => (o == null ? o : o[k]), w);
  const set = (p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((o, k) => o[k], w)[last] = v; };
  const fld = (p, label, { type = 'text', rows = 0, ph = '', req = false } = {}) => `<label class="field"><span class="field-label">${label}${req ? ' <span class="req">*</span>' : ''}</span>${rows
    ? `<textarea class="input" rows="${rows}" data-w="${p}" placeholder="${esc(ph)}" ${dis}>${esc(get(p) || '')}</textarea>`
    : `<input class="input" type="${type}" data-w="${p}" value="${esc(get(p) == null ? '' : get(p))}" placeholder="${esc(ph)}" ${dis}>`}</label>`;
  let api;
  const head = () => {
    const st = existing ? quoteStatus(existing) : 'draft', rev = existing ? quoteRev(existing) : 0;
    return `<div class="doc-head"><div>${icon('quote', 20)}</div><div class="grow"><h2>${existing ? esc(existing.no) : w.revisionOf ? 'New quotation (copy)' : 'New quotation'}</h2>
      <div class="muted small row gap8 wrap">${existing ? `Created ${fmtDate(w.created)} by ${esc(personName(w.preparedBy, ''))}` : 'Saved as Rev 1'}${lead(w.leadId) ? `<span>· For</span>${recordChip('lead', w.leadId)}` : ''}</div></div>
      ${rev ? `<span class="lozenge cat-todo" title="Revision">Rev ${rev}</span>` : ''}${pill(QUOTE_ST[st][0], QUOTE_ST[st][1])}</div>`;
  };
  const gateHTML = () => {
    const l = lead(w.leadId);
    if (!l) return `<div class="banner warn small">${icon('help', 14)} Every quotation belongs to a lead. Choose the lead it's for.</div>`;
    const b = lfQuoteBlockers(l);
    return b.length ? `<div class="banner warn small">${icon('lock', 14)} Saves as a draft only: LD-${l.no} is a System lead, and ${esc(lfList(b))} ${b.length === 1 ? 'isn’t' : 'aren’t'} marked Done in its tasks yet, so it can’t be marked as sent.</div>` : '';
  };
  // a System lead's quotation stays a draft until its design tasks are done
  const gateOk = async () => {
    const l = lead(w.leadId);
    if (!l) { const sel = api.el.querySelector('[name=leadId]'); sel.classList.add('invalid'); sel.focus(); toast('Choose the lead this quotation is for', 'error'); return false; }
    const why = quoteSendBlock(l);
    if (why) toast(why, 'error');
    return !why;
  };
  const infoHTML = () => {
    const l = lead(w.leadId);
    const curs = [...QUOTE_CURRENCIES.map(([v, n]) => ({ value: v, label: n })), ...(QUOTE_CURRENCIES.some(c => c[0] === w.currency) ? [] : [{ value: w.currency, label: w.currency }])];
    return `<div class="q-sec"><h3 class="q-sec-title">Document info</h3><div class="form-grid four">
      <label class="field"><span class="field-label">Lead <span class="req">*</span>${l ? `<button class="link small q-open-lead" data-rec="lead:${l.id}" title="Open the lead">${icon('external', 12)} Open LD-${l.no}</button>` : ''}</span>${selectHTML('leadId', leadOpts(), w.leadId, { blank: 'Choose the lead…', attrs: dis })}</label>
      <label class="field"><span class="field-label">Client <span class="req">*</span></span>${selectHTML('clientId', [...erp().clients.map(c => ({ value: c.id, label: c.name })), { value: '__new', label: '+ New client…' }], w.clientId, { blank: w.leadId && !w.clientId ? `Bill to ${(lead(w.leadId) || {}).company || 'the lead’s company'}` : 'Choose a client…', attrs: dis })}</label>
      ${fld('no', 'Quote No.', { req: true })}
      <label class="field"><span class="field-label">Currency</span>${selectHTML('currency', curs, w.currency, { attrs: dis })}</label>
      ${fld('date', 'Quote Date', { type: 'date' })}
      ${fld('validUntil', 'Valid Until', { type: 'date' })}
    </div>${locked ? '' : gateHTML()}</div>`;
  };
  const partiesHTML = () => `<div class="q-cards">
    <div class="q-card"><div class="q-card-head">Quote from</div>${fld('from.name', 'Company Name')}${fld('from.address', 'Company Address', { rows: 3 })}${fld('from.gst', 'GST No.')}</div>
    <div class="q-card"><div class="q-card-head">Bill to${locked ? '' : `<button class="link small" data-qa="autofill" title="Fill the empty fields from the lead and client">${icon('refresh', 12)} Autofill from client info</button>`}</div>
      ${fld('billTo.name', 'Client Name')}${fld('billTo.address', 'Client Address', { rows: 2 })}<div class="form-grid">${fld('billTo.phone', 'Phone')}${fld('billTo.email', 'E-mail', { type: 'email' })}</div>${fld('billTo.gst', 'GST No.')}</div>
    <div class="q-card"><div class="q-card-head">Prepared by</div><label class="field"><span class="field-label">Prepared By</span>${selectHTML('preparedBy', userOptions(), w.preparedBy, { attrs: dis })}</label>${fld('preparedByContact', 'Contact')}</div>
  </div>`;
  const itemsHTML = () => {
    const many = w.locations.length > 0;
    const locHead = (n, labelAttr, label, lid, del) => `<div class="q-loc-head"><span class="q-loc-no">${icon('pin', 14)} Delivery location ${n}</span><input class="input" ${labelAttr} value="${esc(label)}" placeholder="Location label, e.g. Site ${String.fromCharCode(64 + n)} Warehouse" ${dis}><b class="q-loc-total" data-loc-total="${lid}"></b>${del && !locked ? `<button class="icon-btn xs" data-loc-del="${lid}" title="Remove this delivery location">${icon('trash', 14)}</button>` : ''}</div>`;
    return `<div class="q-sec"><h3 class="q-sec-title">Line items</h3>
      ${many ? `<div class="q-loc">${locHead(1, 'data-w="mainLocationLabel"', w.mainLocationLabel, '__main', false)}` : ''}
      ${linesEditorHTML(w, { readonly: locked })}${many ? '</div>' : ''}
      ${w.locations.map((x, i) => `<div class="q-loc">${locHead(i + 2, `data-loc-label="${x.id}"`, x.label, x.id, true)}${linesEditorHTML(w, { readonly: locked, grp: x.id, lines: x.lines, discCtrl: false, datalist: false })}</div>`).join('')}
      ${locked ? '' : `<div class="row gap8"><button class="btn subtle sm" data-loc-add>${icon('plus', 12)} Add new delivery location</button><span class="muted small">Each location gets its own items and total, and the grand total adds them up.</span></div>`}
    </div>`;
  };
  const optHTML = () => {
    const o = w.optionalItem;
    return `<div class="q-sec q-optional"><div class="sec-head"><h3 class="q-sec-title">${icon('bulb', 14)} Optional suggested item</h3><span class="muted small">Shown to the client as a callout. Not added to the total.</span></div>
      <div class="q-opt-grid"><label class="field"><span class="field-label">System / Item</span><span class="row gap8"><input class="input grow" list="cat-list" data-w="optionalItem.item" value="${esc(o.item)}" placeholder="Type or pick from catalog" ${dis}>${locked ? '' : `<button class="btn subtle sm" data-opt-pick>${icon('box', 12)} Pick</button>`}</span></label>
        <label class="field"><span class="field-label">Price</span><input class="input" type="number" min="0" step="any" data-w="optionalItem.price" value="${esc(o.price)}" ${dis}></label></div>
      ${fld('optionalItem.description', 'Description', { rows: 2 })}</div>`;
  };
  const totalsBox = () => {
    const t = lineTotals(w), many = w.locations.length > 0;
    const locs = [[w.mainLocationLabel || 'Delivery location 1', w.lines], ...w.locations.map((x, i) => [x.label || `Delivery location ${i + 2}`, x.lines])];
    return `<div class="totals"><div><span>Subtotal</span><b>${money(t.sub, w.currency)}</b></div>
      ${t.disc ? `<div><span>Discount</span><b>− ${money(t.disc, w.currency)}</b></div>` : ''}
      <div><span>${quoteTax(w)}</span><b>${money(t.tax, w.currency)}</b></div>
      ${many ? locs.map(([n, ls]) => `<div class="sub"><span class="ellip">${esc(n)}</span><b>${money(locTotal(ls), w.currency)}</b></div>`).join('') : ''}
      <div class="grand"><span>${many ? 'Final grand total' : 'Grand total'}</span><b>${money(t.total, w.currency)}</b></div></div>`;
  };
  const presetField = (key, label, presets) => `<label class="field"><span class="field-label row gap8">${label}${locked || !presets.length ? '' : `<select class="input preset-sel" data-preset="${key}"><option value="">Use a standard term…</option>${presets.map((p, i) => `<option value="${i}">${i + 1}. ${esc(p)}</option>`).join('')}</select>`}</span><textarea class="input" rows="3" data-w="${key}" placeholder="Or type your own" ${dis}>${esc(w[key] || '')}</textarea></label>`;
  const condsHTML = () => w.conditions.map((t, i) => `<div class="q-cond" data-cond-row="${i}"><span class="q-cond-grip" draggable="${!locked}" title="Drag to reorder">${icon('drag', 14)}</span><span class="q-cond-no">${i + 1}.</span><textarea class="input" rows="${Math.min(8, Math.max(2, String(t).split('\n').length, Math.ceil(String(t).length / 95)))}" data-cond="${i}" placeholder="Condition ${i + 1}" ${dis}>${esc(t)}</textarea>${locked || w.conditions.length <= 1 ? '' : `<button class="icon-btn xs" data-cond-del="${i}" title="Remove">${icon('close', 14)}</button>`}</div>`).join('');
  const bankHTML = () => {
    const bi = s.bankOptions.indexOf(w.bankDetails);
    const opts = s.bankOptions.map((b, i) => ({ value: String(i), label: `${i + 1}. ${b.split('\n')[0]}` }));
    if (bi < 0 && w.bankDetails) opts.push({ value: 'keep', label: `${w.bankDetails.split('\n')[0]} (on this quotation)` });
    return `<label class="field grow"><span class="field-label">Bank details</span>${selectHTML('bankDetails', opts, bi >= 0 ? String(bi) : 'keep', { attrs: dis })}</label>`;
  };
  const revHTML = () => `<div class="q-revs"><div class="q-sec-title">${icon('clock', 14)} Revision history</div>${existing ? quoteRevListHTML(existing) : ''}
    <p class="muted small">${existing ? 'Every save that changes this quotation adds the next revision. Status changes don’t.' : 'Rev 1 is kept when you first save. Every later save that changes it adds the next revision.'}</p></div>`;
  const pendingRev = () => (!existing ? 1 : quoteSig(tidyQuote(JSON.parse(JSON.stringify(w)))) !== baseSig ? quoteRev(existing) + 1 : quoteRev(existing));
  const footer = () => {
    const st = existing ? existing.status : 'draft';
    return `${existing ? `<button class="btn subtle danger-text" data-qa="delete">${icon('trash', 14)}</button><button class="btn subtle" data-qa="dup">${icon('copy', 14)} Duplicate</button>` : ''}
      <span class="grow"></span>
      ${locked ? '' : `<button class="btn" data-qa="preview">${icon('eye', 14)} Preview quote</button>`}
      ${existing ? `<button class="btn" data-qa="print">${icon('print', 14)} Print / PDF</button>` : ''}
      ${locked ? '' : `<button class="btn ${st === 'draft' ? 'primary' : ''}" data-qa="save">Save</button>`}
      ${st === 'sent' ? '<button class="btn danger-text" data-qa="declined">Declined</button><button class="btn primary" data-qa="accepted">Mark accepted</button>' : ''}
      ${st === 'accepted' ? `<button class="btn primary" data-qa="invoice">${icon('receipt', 14)} Create proforma invoice</button>` : ''}
      ${st === 'declined' ? '<button class="btn" data-qa="reopen">Reopen as sent</button>' : ''}`;
  };
  const invs = existing ? erp().invoices.filter(i => i.quoteId === existing.id) : [];
  api = openModal({
    title: null, width: 1120, cls: 'doc-modal',
    body: `<div data-head>${head()}</div>${locked ? `<div class="banner info">${icon('lock', 16)} This quotation is ${existing.status}. Duplicate it to make changes.</div>` : ''}
      <div data-info>${infoHTML()}</div>
      <div data-parties>${partiesHTML()}</div>
      <div data-lines>${itemsHTML()}</div>
      <div data-opt>${optHTML()}</div>
      <div class="doc-bottom"><div class="doc-terms">
        <h3 class="q-sec-title">Terms</h3>
        ${presetField('paymentTerms', 'Payment terms', s.paymentPresets || [])}
        ${presetField('deliveryTerms', 'Delivery terms', s.deliveryPresets || [])}
        ${presetField('warrantyTerms', 'Warranty', s.warrantyPresets || [])}
        <h3 class="q-sec-title">Terms &amp; conditions</h3>
        <div class="row gap8 q-bank" data-bank>${bankHTML()}${locked ? '' : `<button class="btn" data-cond-std>${icon('docs', 14)} Load standard terms &amp; conditions</button>`}</div>
        <div class="q-conds" data-conds>${condsHTML()}</div>
        ${locked ? '' : `<button class="btn subtle sm" data-cond-add>${icon('plus', 12)} Add condition</button>`}
        ${fld('signoff', 'Sign-off <span class="muted small">(shown below the terms &amp; conditions)</span>', { rows: 6 })}
        ${invs.length ? `<div class="field"><span class="field-label">Invoices from this quotation</span><div class="row gap8 wrap">${invs.map(i => recordChip('invoice', i.id) + invoicePill(i)).join(' ')}</div></div>` : ''}
      </div><div class="q-side">
        <label class="field"><span class="field-label">Tax type</span>${selectHTML('gstType', ['GST', 'IGST'], w.gstType, { attrs: dis })}</label>
        <div data-totals>${totalsBox()}</div>
        <div data-revs>${revHTML()}</div>
      </div></div>`,
    footer: footer(),
    onMount(el, a) {
      api = a;
      const refreshTotals = () => {
        el.querySelector('[data-totals]').innerHTML = totalsBox();
        $$('[data-loc-total]', el).forEach(b => { const lid = b.dataset.locTotal; b.textContent = money(locTotal(lid === '__main' ? w.lines : locById(lid).lines), w.currency); });
      };
      const redrawItems = () => { el.querySelector('[data-lines]').innerHTML = itemsHTML(); refreshTotals(); };
      const redrawTop = () => { el.querySelector('[data-head]').innerHTML = head(); el.querySelector('[data-info]').innerHTML = infoHTML(); el.querySelector('[data-parties]').innerHTML = partiesHTML(); };
      const redrawConds = () => { el.querySelector('[data-conds]').innerHTML = condsHTML(); };
      const refreshNo = () => { if (noTouched) return; w.no = nextQuoteNo(billName(), w.date, w.id); const inp = el.querySelector('[data-w="no"]'); if (inp) inp.value = w.no; };
      // a new quotation's Bill To follows the lead/client picked, until it's edited by hand
      const followBillTo = () => {
        if (autoBill == null || JSON.stringify(w.billTo) !== autoBill) { const f = quoteBillToFrom(w); Object.keys(f).forEach(k => { if (!w.billTo[k]) w.billTo[k] = f[k]; }); return; }
        w.billTo = quoteBillToFrom(w); autoBill = JSON.stringify(w.billTo);
      };
      refreshTotals();
      if (!locked) bindLinesEditor(el, w, { onTotals: refreshTotals, linesOf, redraw: () => { el.querySelector('[data-lines]').innerHTML = itemsHTML(); } });
      el.addEventListener('input', e => {
        const t = e.target, p = t.dataset.w;
        if (p) {
          set(p, t.value);
          if (p === 'no') noTouched = true;
          if (p === 'billTo.name' || p === 'date') refreshNo();
          if (p === 'mainLocationLabel') refreshTotals();
          return;
        }
        if (t.dataset.locLabel) { locById(t.dataset.locLabel).label = t.value; refreshTotals(); return; }
        if (t.dataset.cond != null) w.conditions[Number(t.dataset.cond)] = t.value;
      });
      el.addEventListener('change', e => {
        const t = e.target, n = t.name;
        if (t.dataset.preset) { const v = (s[{ paymentTerms: 'paymentPresets', deliveryTerms: 'deliveryPresets', warrantyTerms: 'warrantyPresets' }[t.dataset.preset]] || [])[Number(t.value)]; if (t.value !== '' && v != null) { w[t.dataset.preset] = v; el.querySelector(`[data-w="${t.dataset.preset}"]`).value = v; } t.value = ''; return; }
        if (t.dataset.w === 'optionalItem.item') {
          // picking a catalog item fills the description and price only where they're still empty, as in the ERP
          const ci = erp().catalog.find(c => c.name === t.value), o = w.optionalItem;
          if (ci) { if (!o.description) o.description = ci.description || ''; if (o.price === '' || o.price == null || !Number(o.price)) o.price = ci.price; el.querySelector('[data-opt]').innerHTML = optHTML(); }
          return;
        }
        if (n === 'clientId') {
          if (t.value === '__new') { t.value = w.clientId || ''; openClientModal(null, c => { w.clientId = c.id; followBillTo(); refreshNo(); redrawTop(); }); return; }
          w.clientId = t.value || null;
          if (w.leadId && lead(w.leadId) && lead(w.leadId).clientId && lead(w.leadId).clientId !== w.clientId) w.leadId = null;
          followBillTo(); refreshNo(); redrawTop();
        }
        if (n === 'leadId') { w.leadId = t.value || null; const l = lead(w.leadId); if (l && l.clientId) w.clientId = l.clientId; followBillTo(); refreshNo(); redrawTop(); }
        if (n === 'preparedBy') {
          const was = (empRecord(w.preparedBy) || {}).phone || '';
          w.preparedBy = t.value;
          if (!w.preparedByContact || w.preparedByContact === was) { w.preparedByContact = (empRecord(w.preparedBy) || {}).phone || ''; el.querySelector('[data-w="preparedByContact"]').value = w.preparedByContact; }
        }
        if (n === 'currency') { w.currency = t.value; redrawItems(); }
        if (n === 'gstType') { w.gstType = t.value; redrawItems(); }
        if (n === 'bankDetails' && t.value !== 'keep') {
          // swaps the bank row already in the terms & conditions, and is what "Load standard terms" uses
          const nb = s.bankOptions[Number(t.value)], was = w.bankDetails;
          w.conditions = w.conditions.map(x => (x === was ? nb : x)); w.bankDetails = nb;
          redrawConds(); el.querySelector('[data-bank]').firstElementChild.outerHTML = bankHTML();
        }
      });
      // terms & conditions: drag the grip to reorder
      let dragIdx = null;
      el.addEventListener('dragstart', e => { const g = e.target.closest && e.target.closest('.q-cond-grip'); if (!g) return; dragIdx = Number(g.closest('[data-cond-row]').dataset.condRow); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(dragIdx)); g.closest('.q-cond').classList.add('dragging'); });
      el.addEventListener('dragend', () => { dragIdx = null; $$('.q-cond.dragging, .q-cond.drop-at', el).forEach(x => x.classList.remove('dragging', 'drop-at')); });
      el.addEventListener('dragover', e => { const r = dragIdx != null && e.target.closest && e.target.closest('[data-cond-row]'); if (!r) return; e.preventDefault(); $$('.q-cond.drop-at', el).forEach(x => x.classList.remove('drop-at')); r.classList.add('drop-at'); });
      el.addEventListener('drop', e => {
        const r = dragIdx != null && e.target.closest && e.target.closest('[data-cond-row]'); if (!r) return;
        e.preventDefault();
        const to = Number(r.dataset.condRow);
        if (to !== dragIdx) { const [m] = w.conditions.splice(dragIdx, 1); w.conditions.splice(to, 0, m); redrawConds(); }
        dragIdx = null;
      });
      el.addEventListener('click', async e => {
        const rv = e.target.closest('[data-rev-view]');
        if (rv) { viewQuoteRevision(existing, rv.dataset.revView.split('|')[1]); return; }
        if (e.target.closest('[data-loc-add]')) { w.locations.push({ id: uid('loc'), label: '', lines: [blankLine()] }); redrawItems(); const ins = $$('[data-loc-label]', el); ins[ins.length - 1].focus(); return; }
        const ld = e.target.closest('[data-loc-del]');
        if (ld) { const x = locById(ld.dataset.locDel); if (x.lines.some(l => l.item) && !await confirmDialog({ title: `Remove ${x.label || 'this delivery location'}?`, message: 'Its line items are removed from the quotation.', confirmLabel: 'Remove' })) return; w.locations = w.locations.filter(y => y !== x); redrawItems(); return; }
        const op = e.target.closest('[data-opt-pick]');
        if (op) { catalogMenu(op, ci => { const o = w.optionalItem; o.item = ci.name; if (!o.description) o.description = ci.description || ''; if (o.price === '' || o.price == null || !Number(o.price)) o.price = ci.price; el.querySelector('[data-opt]').innerHTML = optHTML(); }); return; }
        if (e.target.closest('[data-cond-std]')) {
          if (w.conditions.some(x => x.trim()) && !await confirmDialog({ title: 'Replace the terms & conditions?', message: 'The standard terms & conditions replace the ones on this quotation.', confirmLabel: 'Replace', danger: false })) return;
          w.conditions = (s.standardTerms || []).map(x => (x === QUOTE_BANK_TOKEN ? w.bankDetails : x));
          if (!w.conditions.length) w.conditions = [''];
          redrawConds(); return;
        }
        if (e.target.closest('[data-cond-add]')) { w.conditions.push(''); redrawConds(); const ts = $$('[data-cond]', el); ts[ts.length - 1].focus(); return; }
        const cd = e.target.closest('[data-cond-del]');
        if (cd) { w.conditions.splice(Number(cd.dataset.condDel), 1); if (!w.conditions.length) w.conditions.push(''); redrawConds(); return; }
        const b = e.target.closest('[data-qa]');
        if (!b) return;
        const act = b.dataset.qa;
        if (act === 'autofill') {
          const f = quoteBillToFrom(w); Object.keys(f).forEach(k => { if (!w.billTo[k]) w.billTo[k] = f[k]; });
          if (!w.preparedByContact) w.preparedByContact = (empRecord(w.preparedBy) || {}).phone || '';
          refreshNo(); el.querySelector('[data-parties]').innerHTML = partiesHTML(); return;
        }
        if (act === 'preview') { printQuote(w, { revision: pendingRev(), preview: true }); return; }
        if (act === 'print') { printDoc('quote', existing); return; }
        if (act === 'dup') { api.close(); duplicateQuote(existing); return; }
        if (act === 'delete') { deleteQuote(existing, () => api.close()); return; }
        if (act === 'invoice') { api.close(); createInvoiceFromQuote(existing); return; }
        if (act === 'reopen') { if (!await gateOk()) return; setQuoteStatus(existing, 'sent'); Store.save(); api.close(); openQuote(existing.id); return; }
        if (act === 'accepted' && !await gateOk()) return;
        if (act === 'accepted' || act === 'declined') {
          if (!locked && !commit()) return;
          setQuoteStatus(quote(w.id), act); Store.save(); api.close();
          if (act === 'accepted' && await confirmDialog({ title: 'Create a proforma invoice?', message: `${esc(w.no)} was accepted. Create a proforma invoice from it now?`, confirmLabel: 'Create invoice', danger: false })) createInvoiceFromQuote(quote(w.id));
          return;
        }
        if (act === 'save') {
          if (existing && existing.status !== 'draft' && !await gateOk()) return;
          const before = existing ? quoteRev(existing) : 0;
          if (!commit()) return;
          const q = quote(w.id), rev = quoteRev(q);
          Store.save(); api.close();
          toast(`${q.no} saved${rev !== before ? ` as Rev ${rev}` : ' · no changes, still Rev ' + rev}${quoteStatus(q) === 'draft' ? ' (draft)' : ''}`);
        }
      });
      function commit() {
        const bad = (sel, msg) => { const x = el.querySelector(sel); if (x) { x.classList.add('invalid'); x.focus(); } toast(msg, 'error'); return false; };
        if (!lead(w.leadId)) return bad('[name=leadId]', 'Choose the lead this quotation is for');
        const keep = l => l.item.trim() || Number(l.price);
        w.lines = w.lines.filter(keep);
        w.locations.forEach(x => { x.lines = x.lines.filter(keep); });
        w.locations = w.locations.filter(x => x.lines.length);
        if (!w.lines.length) { w.lines.push(blankLine()); redrawItems(); toast('Add at least one line item', 'error'); return false; }
        if (docLines(w).some(l => !(Number(l.qty) > 0))) { redrawItems(); toast('Every line needs a quantity above 0', 'error'); return false; }
        if (!w.clientId && w.leadId) { const l = lead(w.leadId); if (l && l.company) w.clientId = convertLeadToClient(l, true).id; }
        if (!w.clientId) return bad('[name=clientId]', 'Choose a client');
        w.no = (w.no || '').trim() || nextQuoteNo(billName(), w.date, w.id);
        if (erp().quotes.some(q => q.id !== w.id && q.no === w.no)) return bad('[data-w="no"]', `${w.no} is already used by another quotation`);
        tidyQuote(w);
        const now = nowISO(), me = Store.state.me;
        w.updated = now;
        const total = lineTotals(w).total;
        if (existing) {
          const revs = quoteRevisions(existing).map(r => ({ ...r }));
          let rev = quoteRev(existing);
          const changed = quoteSig(w) !== baseSig;
          if (changed) { rev += 1; w.revision = rev; revs.push({ rev, at: now, by: me, total, snap: null }); } else w.revision = rev;
          w.revisions = revs;
          if (changed) revs[revs.length - 1].snap = quoteSnap(w);
          Object.assign(existing, w);
          erpLog('sales', changed ? `revised quotation ${w.no} to Rev ${rev}` : `updated quotation ${w.no}`, { type: 'quote', id: w.id });
          const l = lead(w.leadId); if (l && changed) leadLog(l, `revised quotation ${w.no} to Rev ${rev}`);
        } else {
          w.created = now; delete w.revisionOf;
          w.revision = 1; w.revisions = [{ rev: 1, at: now, by: me, total, snap: null }];
          w.revisions[0].snap = quoteSnap(w);
          erp().quotes.push(w);
          erpLog('sales', `created quotation ${w.no}`, { type: 'quote', id: w.id });
          const l = lead(w.leadId); if (l) leadLog(l, `created quotation ${w.no}`);
        }
        return true;
      }
    },
  });
}
/* why a quote for this lead can't be marked sent yet (null = it can) */
function quoteSendBlock(l) {
  if (!l) return 'Link this quotation to a lead first';
  const b = lfQuoteBlockers(l);
  return b.length ? `Can’t mark as sent: LD-${l.no} is a System lead, and ${lfList(b)} must be marked Done in its tasks first` : null;
}
/* Mark as sent: from the quotation's menu, the lead space's Send quotation task, or the CRM's "Send a quotation first" */
function markQuoteSent(q) {
  if (!q || q.status !== 'draft') return false;
  const why = quoteSendBlock(lead(q.leadId));
  if (why) { toast(why, 'error'); return false; }
  setQuoteStatus(q, 'sent'); Store.save(); toast(`${q.no} marked as sent`);
  return true;
}
function setQuoteStatus(q, st) {
  if (!q || q.status === st) return;
  q.status = st; q.updated = nowISO();
  if (st === 'sent') q.sentAt = q.sentAt || nowISO();
  erpLog('sales', `marked quotation ${q.no} as ${QUOTE_ST[st][0].toLowerCase()}`, { type: 'quote', id: q.id });
  const l = lead(q.leadId), crm = erpSet('crm');
  if (l) {
    leadLog(l, `quotation ${q.no} ${QUOTE_ST[st][0].toLowerCase()}`);
    const target = st === 'sent' ? crm.quoteSentStage : st === 'accepted' ? crm.quoteAcceptedStage : '';
    const cur = stageOf(l), idx = s => crm.stages.findIndex(x => x.id === s);
    // only move forward (never pull a won lead back to "Quotation sent")
    if (target && cur && cur.cat !== 'won' && idx(target) > idx(l.stageId)) setLeadStage(l, target);
  }
}

/* ---------------- Invoices ---------------- */
function salesInvoices(root, r) {
  const e = erp(), st = (r.query && r.query.st) || 'all';
  const vs = ui('sales.invoices', { search: '' });
  let list = e.invoices.slice().sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  const count = k => e.invoices.filter(i => (k === 'unpaid' ? ['unpaid', 'partial'].includes(invoiceStatus(i)) : invoiceStatus(i) === k)).length;
  if (st === 'unpaid') list = list.filter(i => ['unpaid', 'partial', 'overdue'].includes(invoiceStatus(i)));
  else if (st !== 'all') list = list.filter(i => invoiceStatus(i) === st);
  if (vs.search) { const x = vs.search.toLowerCase(); list = list.filter(i => `${i.no} ${i.poNumber} ${(client(i.clientId) || {}).name}`.toLowerCase().includes(x)); }
  const tabs = [{ id: 'all', label: 'All', count: e.invoices.length }, { id: 'draft', label: 'Draft', count: count('draft') }, { id: 'unpaid', label: 'Unpaid', count: count('unpaid') + count('overdue') }, { id: 'overdue', label: 'Overdue', count: count('overdue') }, { id: 'paid', label: 'Paid', count: count('paid') }, { id: 'cancelled', label: 'Cancelled', count: count('cancelled') }];
  root.innerHTML = `<div class="wide-page">
    ${subtabs(tabs.map(t => ({ ...t, href: t.id === 'all' ? '#/app/sales/invoices' : `#/app/sales/invoices?st=${t.id}` })), st)}
    <div class="toolbar tight"><div class="search-sm">${icon('search')}<input placeholder="Search invoices or PO numbers" value="${esc(vs.search)}" data-iv data-keep="i-search"></div><span class="grow"></span>
      <button class="btn subtle sm" data-i-csv>${icon('download', 14)} CSV</button></div>
    <div class="table-wrap"><table class="grid"><thead><tr><th style="width:140px">Number</th><th>Client</th><th style="width:130px">Quotation</th><th style="width:110px">Date</th><th style="width:110px">Due</th><th style="width:130px" class="num">Total</th><th style="width:130px" class="num">Paid</th><th style="width:130px" class="num">Balance</th><th style="width:120px">Status</th></tr></thead>
    <tbody>${list.map(i => { const c = client(i.clientId), q = quote(i.quoteId), tt = lineTotals(i); return `<tr class="row-link" data-rec="invoice:${i.id}"><td><b>${esc(i.no || 'Draft')}</b></td><td><span class="cell-in">${c ? `${clientAvatar(c, 22)} <span class="ellip">${esc(c.name)}</span>` : '<span class="muted">No client</span>'}</span></td>
      <td class="muted">${q ? esc(q.no) : '—'}</td><td>${fmtDate(i.date)}</td><td class="${invoiceStatus(i) === 'overdue' ? 'danger-text' : ''}">${fmtDate(i.dueDate)}</td>
      <td class="num">${money(tt.total, i.currency)}</td><td class="num muted">${money(invoicePaid(i), i.currency)}</td><td class="num"><b>${money(invoiceBalance(i), i.currency)}</b></td><td>${invoicePill(i)}</td></tr>`; }).join('')}</tbody></table>
    ${!list.length ? emptyState({ title: 'No invoices here', text: 'Accept a quotation to turn it into a proforma invoice, or start a blank one.', art: 'receipt', action: '<button class="btn primary" data-i-new>New invoice</button>' }) : ''}</div>
    <div class="list-foot"><span>${list.length} invoice${list.length === 1 ? '' : 's'} · Balance ${money(list.reduce((s, i) => s + invoiceBalance(i), 0))}</span></div></div>`;
  root.addEventListener('input', ev => { if (ev.target.matches('[data-iv]')) { vs.search = ev.target.value; render(); } });
  root.addEventListener('click', ev => {
    if (ev.target.closest('[data-i-new]')) openInvoice(null);
    if (ev.target.closest('[data-i-csv]')) downloadCSV(`invoices-${todayStr()}.csv`, [['Number', 'Client', 'Quotation', 'PO number', 'Date', 'Due', 'Status', 'Total', 'Paid', 'Balance'], ...list.map(i => [i.no, (client(i.clientId) || {}).name, (quote(i.quoteId) || {}).no, i.poNumber, i.date, i.dueDate, INV_ST[invoiceStatus(i)][0], lineTotals(i).total.toFixed(2), invoicePaid(i).toFixed(2), invoiceBalance(i).toFixed(2)])]);
  });
}
function createInvoiceFromQuote(q) {
  const s = erpSet('sales');
  const c = client(q.clientId);
  openInvoice(null, {
    quoteId: q.id, clientId: q.clientId, currency: q.currency, discountMode: q.discountMode, discount: q.discount, paymentTerms: q.paymentTerms,
    lines: quoteInvoiceLines(q).map(l => ({ ...l, hsn: l.hsn || ((erp().catalog.find(x => x.id === l.itemId) || {}).hsn || '') })),
    shipTo: c ? [c.name, c.address, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join('\n') : '', toPayPercent: 50,
    dueDate: addDays(todayStr(), s.invoiceDueDays || 15),
  });
}
function openInvoice(id, preset = {}) {
  const s = erpSet('sales');
  const existing = id && invoice(id);
  if (id && !existing) return;
  if (existing) touchRecord('invoice', id);
  const w = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({
    id: uid('pi'), no: '', quoteId: null, clientId: null, status: 'draft', date: todayStr(), dueDate: addDays(todayStr(), s.invoiceDueDays || 15), poNumber: '', currency: s.currency,
    lines: [blankLine()], discountMode: 'inline', discount: 0, toPayPercent: 100, paymentTerms: s.paymentTerms, shipTo: '', payments: [], created: nowISO(), updated: nowISO(),
  }, preset);
  const locked = existing && existing.status === 'cancelled';
  const quoteOpts = () => erp().quotes.filter(q => (!w.clientId || q.clientId === w.clientId) && q.no).map(q => ({ value: q.id, label: `${q.no} · ${money(lineTotals(q).total, q.currency)}` }));
  let api;
  const st = () => (existing ? invoiceStatus(existing) : 'draft');
  const payHTML = () => {
    if (!existing || existing.status === 'draft') return '';
    const tt = lineTotals(existing), paid = invoicePaid(existing);
    return `<div class="pay-box"><div class="sec-head"><h3>${icon('wallet')} Payments</h3><span class="muted small">${money(paid, w.currency)} of ${money(tt.total, w.currency)} received</span></div>
      <div class="progress"><span style="width:${tt.total ? Math.min(100, paid / tt.total * 100) : 0}%"></span></div>
      ${(existing.payments || []).map(p => `<div class="pay-row">${icon('checkCircle', 14)}<span class="grow">${fmtDate(p.date)} <span class="muted small">${esc(p.note || '')}</span></span><b>${money(p.amount, w.currency)}</b>${locked ? '' : `<button class="icon-btn xs" data-pay-del="${p.id}" title="Remove">${icon('trash', 12)}</button>`}</div>`).join('') || '<p class="muted small">No payments recorded yet.</p>'}
      ${locked || invoiceStatus(existing) === 'paid' ? '' : `<div class="pay-add"><input class="input" type="date" data-pay="date" value="${todayStr()}"><input class="input" type="number" min="0" step="any" data-pay="amount" placeholder="Amount" value="${Math.round(invoiceBalance(existing))}"><input class="input" data-pay="note" placeholder="Mode / reference (NEFT, cheque no…)"><button class="btn primary" data-ia="pay">Record payment</button></div>`}</div>`;
  };
  const totalsExtra = () => {
    const tt = lineTotals(w), pct = Number(w.toPayPercent) || 0;
    return `${pct && pct < 100 ? `<div class="sub"><span>To pay now (${pct}%)</span><b>${money(tt.total * pct / 100, w.currency)}</b></div>` : ''}${existing && existing.status !== 'draft' ? `<div class="sub"><span>Paid</span><b>${money(invoicePaid(existing), w.currency)}</b></div><div class="sub strong"><span>Balance due</span><b>${money(invoiceBalance(existing), w.currency)}</b></div>` : ''}`;
  };
  const partiesHTML = () => `<div class="form-grid four">
      <label class="field"><span class="field-label">Bill to <span class="req">*</span></span>${selectHTML('clientId', [...erp().clients.map(c => ({ value: c.id, label: c.name })), { value: '__new', label: '+ New client…' }], w.clientId, { blank: 'Choose a client…', attrs: locked ? 'disabled' : '' })}</label>
      <label class="field"><span class="field-label">From quotation</span>${selectHTML('quoteId', quoteOpts(), w.quoteId, { blank: 'None', attrs: locked ? 'disabled' : '' })}</label>
      <label class="field"><span class="field-label">Invoice date</span><input class="input" type="date" name="date" value="${esc(w.date)}" ${locked ? 'disabled' : ''}></label>
      <label class="field"><span class="field-label">Due date</span><input class="input" type="date" name="dueDate" value="${esc(w.dueDate)}" ${locked ? 'disabled' : ''}></label>
      <label class="field"><span class="field-label">Client PO number</span><input class="input" name="poNumber" value="${esc(w.poNumber || '')}" ${locked ? 'disabled' : ''}></label>
      <label class="field"><span class="field-label">Currency</span>${selectHTML('currency', Object.keys(CUR_SYMBOL), w.currency, { attrs: locked ? 'disabled' : '' })}</label>
      <label class="field"><span class="field-label">Advance to pay now (%)</span><input class="input" type="number" min="0" max="100" name="toPayPercent" value="${esc(w.toPayPercent)}" ${locked ? 'disabled' : ''}></label>
    </div>`;
  const footer = () => {
    const s0 = existing ? existing.status : 'draft';
    return `${existing && s0 === 'draft' ? `<button class="btn subtle danger-text" data-ia="delete">${icon('trash', 14)}</button>` : ''}
      ${existing && s0 !== 'draft' && s0 !== 'cancelled' ? '<button class="btn subtle danger-text" data-ia="cancel">Cancel invoice</button>' : ''}
      <span class="grow"></span>
      ${existing ? `<button class="btn" data-ia="print">${icon('print', 14)} Print / PDF</button>` : ''}
      ${locked ? '' : `<button class="btn ${s0 === 'draft' ? '' : 'primary'}" data-ia="save">${existing ? 'Save' : 'Save draft'}</button>`}
      ${s0 === 'draft' ? '<button class="btn primary" data-ia="issue">Save &amp; issue</button>' : ''}`;
  };
  api = openModal({
    title: null, width: 1120, cls: 'doc-modal',
    body: `<div class="doc-head"><div>${icon('receipt', 20)}</div><div class="grow"><h2>${existing ? esc(w.no) : 'New proforma invoice'}</h2><div class="muted small">${existing ? `Created ${fmtDate(w.created)}` : 'The number is assigned when you save'}${w.quoteId && quote(w.quoteId) ? ` · from ${recordChip('quote', w.quoteId)}` : ''}</div></div>${pill(INV_ST[st()][0], INV_ST[st()][1])}</div>
      ${locked ? `<div class="banner info">${icon('lock', 16)} This invoice was cancelled.</div>` : ''}
      <div data-parties>${partiesHTML()}</div>
      <div data-lines>${linesEditorHTML(w, { hsn: true, readonly: locked })}</div>
      <div class="doc-bottom"><div class="doc-terms">
        <label class="field"><span class="field-label">Ship to</span><textarea class="input" rows="3" name="shipTo" ${locked ? 'disabled' : ''}>${esc(w.shipTo || '')}</textarea></label>
        ${termsField('paymentTerms', 'Payment terms', w.paymentTerms, locked ? [] : [s.paymentTerms, '100% advance payment against this Proforma Invoice.'])}
        <div data-pay>${payHTML()}</div>
      </div><div data-totals>${totalsHTML(w, totalsExtra())}</div></div>`,
    footer: footer(),
    onMount(el, a) {
      api = a;
      if (locked) $$('.doc-terms textarea', el).forEach(t => { t.disabled = true; });
      const refreshTotals = () => { el.querySelector('[data-totals]').innerHTML = totalsHTML(w, totalsExtra()); };
      if (!locked) bindLinesEditor(el, w, { hsn: true, onTotals: refreshTotals });
      el.addEventListener('input', e => { if (e.target.name === 'toPayPercent') { w.toPayPercent = e.target.value; refreshTotals(); } });
      el.addEventListener('change', e => {
        const n = e.target.name;
        if (e.target.dataset.preset) { if (e.target.value) { el.querySelector(`[name=${e.target.dataset.preset}]`).value = e.target.value; e.target.value = ''; } return; }
        if (n === 'clientId') {
          if (e.target.value === '__new') { e.target.value = w.clientId || ''; openClientModal(null, c => { w.clientId = c.id; el.querySelector('[data-parties]').innerHTML = partiesHTML(); }); return; }
          w.clientId = e.target.value || null;
          const c = client(w.clientId), ship = el.querySelector('[name=shipTo]');
          if (c && !ship.value.trim()) ship.value = [c.name, c.address, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join('\n');
          el.querySelector('[data-parties]').innerHTML = partiesHTML();
        }
        if (n === 'quoteId') {
          w.quoteId = e.target.value || null;
          const q = quote(w.quoteId);
          if (q && w.lines.every(l => !l.item)) { w.lines = quoteInvoiceLines(q); w.discountMode = q.discountMode; w.discount = q.discount; el.querySelector('[data-lines]').innerHTML = linesEditorHTML(w, { hsn: true }); refreshTotals(); }
          if (q && !w.clientId) { w.clientId = q.clientId; el.querySelector('[data-parties]').innerHTML = partiesHTML(); }
        }
        if (n === 'currency') { w.currency = e.target.value; el.querySelector('[data-lines]').innerHTML = linesEditorHTML(w, { hsn: true }); refreshTotals(); }
        if (['date', 'dueDate', 'poNumber'].includes(n)) w[n] = e.target.value;
      });
      el.addEventListener('click', async e => {
        const pd = e.target.closest('[data-pay-del]');
        if (pd) { existing.payments = existing.payments.filter(p => p.id !== pd.dataset.payDel); w.payments = existing.payments; Store.save(); el.querySelector('[data-pay]').innerHTML = payHTML(); refreshTotals(); return; }
        const b = e.target.closest('[data-ia]');
        if (!b) return;
        const act = b.dataset.ia;
        if (act === 'print') { printDoc('invoice', existing); return; }
        if (act === 'pay') {
          const v = k => el.querySelector(`[data-pay="${k}"]`).value;
          const amt = Number(v('amount'));
          if (!(amt > 0)) { toast('Enter the amount received', 'error'); return; }
          existing.payments = existing.payments || [];
          existing.payments.push({ id: uid('pay'), date: v('date') || todayStr(), amount: amt, note: v('note') });
          w.payments = existing.payments; existing.updated = nowISO();
          erpLog('sales', `recorded a payment of ${money(amt, w.currency)} on ${existing.no}`, { type: 'invoice', id: existing.id });
          Store.save(); toast(invoiceStatus(existing) === 'paid' ? `${existing.no} is fully paid` : 'Payment recorded');
          el.querySelector('[data-pay]').innerHTML = payHTML(); refreshTotals();
          return;
        }
        if (act === 'delete') {
          if (await confirmDialog({ title: `Delete ${existing.no}?`, message: 'This draft invoice is permanently deleted.' })) { erp().invoices = erp().invoices.filter(x => x !== existing); erpLog('sales', `deleted invoice ${existing.no}`); Store.save(); api.close(); }
          return;
        }
        if (act === 'cancel') {
          if (await confirmDialog({ title: `Cancel ${existing.no}?`, message: 'The invoice stays on record as cancelled and no longer counts towards amounts to collect.', confirmLabel: 'Cancel invoice' })) { existing.status = 'cancelled'; erpLog('sales', `cancelled invoice ${existing.no}`, { type: 'invoice', id: existing.id }); Store.save(); api.close(); }
          return;
        }
        if (act === 'save' || act === 'issue') {
          if (!commit()) return;
          if (act === 'issue') { const x = invoice(w.id); x.status = 'issued'; erpLog('sales', `issued invoice ${x.no}`, { type: 'invoice', id: x.id }); }
          Store.save(); api.close(); toast(act === 'issue' ? `${w.no} issued` : `${w.no} saved`);
        }
      });
      function commit() {
        ['shipTo', 'paymentTerms'].forEach(k => { w[k] = el.querySelector(`[name=${k}]`).value; });
        w.lines = w.lines.filter(l => l.item.trim() || Number(l.price));
        if (!w.lines.length) { w.lines.push(blankLine()); el.querySelector('[data-lines]').innerHTML = linesEditorHTML(w, { hsn: true }); toast('Add at least one line item', 'error'); return false; }
        if (!w.clientId) { const sel = el.querySelector('[name=clientId]'); sel.classList.add('invalid'); sel.focus(); toast('Choose who to bill', 'error'); return false; }
        w.lines.forEach(l => ['qty', 'price', 'disc', 'gst'].forEach(k => { l[k] = Number(l[k]) || 0; }));
        w.toPayPercent = Math.max(0, Math.min(100, Number(w.toPayPercent) || 0));
        w.updated = nowISO();
        if (existing) { Object.assign(existing, w); erpLog('sales', `updated invoice ${w.no}`, { type: 'invoice', id: w.id }); }
        else { w.no = nextDocNo('invoice'); w.created = nowISO(); erp().invoices.push(w); erpLog('sales', `created invoice ${w.no}`, { type: 'invoice', id: w.id }); }
        return true;
      }
    },
  });
}

/* ---------------- Catalog ---------------- */
function salesCatalog(root) {
  const vs = ui('sales.catalog', { search: '', cat: '' });
  const cats = [...new Set(erp().catalog.map(c => c.category).filter(Boolean))];
  let list = erp().catalog.slice();
  if (vs.search) { const x = vs.search.toLowerCase(); list = list.filter(c => `${c.name} ${c.hsn} ${c.description}`.toLowerCase().includes(x)); }
  if (vs.cat) list = list.filter(c => c.category === vs.cat);
  const used = id => erp().quotes.filter(q => docLines(q).some(l => l.itemId === id)).length;
  root.innerHTML = `<div class="wide-page">
    <div class="toolbar"><div class="search-sm">${icon('search')}<input placeholder="Search catalog" value="${esc(vs.search)}" data-cat-q data-keep="cat-search"></div>
      ${selectHTML('cat', cats, vs.cat, { blank: 'All categories', cls: 'sm-select', attrs: 'data-cat-f' })}<span class="grow"></span><span class="muted small">Click a cell to edit. Prices fill in automatically on quotations.</span></div>
    <div class="table-wrap"><table class="grid catalog"><thead><tr><th>Item</th><th style="width:130px">HSN/SAC</th><th style="width:130px">Category</th><th style="width:90px">Unit</th><th style="width:140px" class="num">Price</th><th style="width:90px" class="num">GST %</th><th style="width:100px">Quoted in</th><th style="width:48px"></th></tr></thead>
    <tbody>${list.map(c => `<tr><td><input class="input bare strong" data-ce="${c.id}" data-k="name" value="${esc(c.name)}"><input class="input bare small muted" data-ce="${c.id}" data-k="description" value="${esc(c.description || '')}" placeholder="Add a description"></td>
      <td><input class="input bare" data-ce="${c.id}" data-k="hsn" value="${esc(c.hsn || '')}"></td><td><input class="input bare" data-ce="${c.id}" data-k="category" value="${esc(c.category || '')}" list="cat-cats"></td>
      <td><input class="input bare" data-ce="${c.id}" data-k="unit" value="${esc(c.unit || '')}"></td><td><input class="input bare num" type="number" min="0" data-ce="${c.id}" data-k="price" value="${esc(c.price)}"></td>
      <td><input class="input bare num" type="number" min="0" max="40" data-ce="${c.id}" data-k="gst" value="${esc(c.gst)}"></td><td class="muted">${used(c.id)} quote(s)</td>
      <td><button class="icon-btn xs" data-cdel="${c.id}" title="Delete">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table>
    <datalist id="cat-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
    ${!list.length ? emptyState({ title: 'Your catalog is empty', text: 'Add the products and services you sell so quotations fill themselves in.', art: 'box', action: '<button class="btn primary" data-cnew>New item</button>' }) : ''}</div>
    <div class="list-foot"><span>${list.length} item${list.length === 1 ? '' : 's'}</span></div></div>`;
  root.addEventListener('input', e => { if (e.target.matches('[data-cat-q]')) { vs.search = e.target.value; render(); } });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-cat-f]')) { vs.cat = e.target.value; render(); return; }
    const id = e.target.dataset.ce; if (!id) return;
    const c = erp().catalog.find(x => x.id === id), k = e.target.dataset.k;
    let v = e.target.value;
    if (k === 'name' && !v.trim()) { e.target.value = c.name; return; }
    if (k === 'price' || k === 'gst') v = Number(v) || 0;
    c[k] = v; Store.save(true); toast('Saved');
  });
  root.addEventListener('click', async e => {
    if (e.target.closest('[data-cnew]')) openCatalogItem(null);
    const d = e.target.closest('[data-cdel]');
    if (d) { const c = erp().catalog.find(x => x.id === d.dataset.cdel); if (await confirmDialog({ title: `Delete ${c.name}?`, message: 'Existing quotations keep their lines; the item just stops appearing in the catalog.' })) { erp().catalog = erp().catalog.filter(x => x !== c); Store.save(); toast('Item deleted'); } }
  });
}
function openCatalogItem() {
  const s = erpSet('sales');
  openModal({
    title: 'New catalog item', width: 560,
    body: `<label class="field"><span class="field-label">Name <span class="req">*</span></span><input class="input" name="name" autofocus placeholder="e.g. Vacuum Regulator"></label>
      <label class="field"><span class="field-label">Description</span><input class="input" name="description"></label>
      <div class="form-grid"><label class="field"><span class="field-label">HSN/SAC</span><input class="input" name="hsn"></label>
        <label class="field"><span class="field-label">Category</span><input class="input" name="category" list="cat-cats-new" placeholder="System, Spare, Service…"><datalist id="cat-cats-new">${[...new Set(erp().catalog.map(c => c.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="field"><span class="field-label">Unit price (${esc(s.currency)}) <span class="req">*</span></span><input class="input" type="number" min="0" name="price"></label>
        <label class="field"><span class="field-label">GST %</span><input class="input" type="number" min="0" max="40" name="gst" value="${s.gstDefault}"></label>
        <label class="field"><span class="field-label">Unit</span><input class="input" name="unit" value="Nos"></label></div>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Add item</button>',
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el);
        if (!f.name.trim()) { el.querySelector('[name=name]').classList.add('invalid'); return; }
        erp().catalog.push({ id: uid('ci'), name: f.name.trim(), description: f.description, hsn: f.hsn, category: f.category, price: Number(f.price) || 0, gst: Number(f.gst) || 0, unit: f.unit });
        erpLog('sales', `added ${f.name.trim()} to the catalog`);
        Store.save(); api.close(); toast('Item added');
      });
    },
  });
}

/* ---------------- Print (opens a clean document you can save as PDF) ---------------- */
/* A quotation, laid out like the ERP's quotation PDF. `preview` opens it without the print dialog. */
function printQuote(q0, { revision, preview = false } = {}) {
  const q = normalizeQuote(JSON.parse(JSON.stringify(q0)));
  const co = erpSet('company'), cur = q.currency, tax = quoteTax(q);
  const rev = revision != null ? revision : quoteRev(q);
  const m = v => money(v, cur);
  const br = t => esc(t || '').split('\n').join('<br>');
  const dmy = d => (d ? String(d).slice(0, 10).split('-').reverse().join('-') : ''); // 25-09-2026, as on the ERP's quotations
  const all = lineTotals(q);
  const hasDisc = all.disc > 0; // no Disc % column full of 0% when nothing is discounted
  const dp = l => (q.discountMode === 'total' ? Number(q.discount) || 0 : Number(l.disc) || 0);
  const rows = ls => ls.map((l, i) => {
    const t = (Number(l.qty) || 0) * (Number(l.price) || 0) * (1 - dp(l) / 100) * (1 + (Number(l.gst) || 0) / 100);
    return `<tr><td class="center">${i + 1}</td><td><div class="item-title">${esc(l.item)}</div><div class="item-desc">${esc(l.description || '')}</div></td><td class="center">${esc(l.qty)}</td><td class="right">${m(l.price)}</td>${hasDisc ? `<td class="center">${dp(l)}%</td>` : ''}<td class="center">${Number(l.gst) || 0}%</td><td class="right total-bold">${m(t)}</td></tr>`;
  }).join('');
  const table = ls => `<table><thead><tr><th width="4%" class="center">#</th><th width="${hasDisc ? 38 : 47}%">System / Item</th><th width="8%" class="center">Qty</th><th width="14%" class="right">Unit Price</th>${hasDisc ? '<th width="9%" class="center">Disc %</th>' : ''}<th width="9%" class="center">${tax} %</th><th width="18%" class="right">Total</th></tr></thead><tbody>${rows(ls)}</tbody></table>`;
  const locs = [{ label: q.mainLocationLabel, lines: q.lines }, ...q.locations];
  const items = locs.length === 1
    ? `${table(q.lines)}<div class="summary"><div class="summary-row"><span>Subtotal</span><span>${m(all.sub)}</span></div>
      ${all.disc ? `<div class="summary-row"><span>Discount</span><span class="discount">- ${m(all.disc)}</span></div>` : ''}
      ${all.tax ? `<div class="summary-row"><span>${tax}</span><span>${m(all.tax)}</span></div>` : ''}
      <div class="grand-total"><span>Grand Total</span><span>${m(all.total)}</span></div></div>`
    : `${locs.map((x, i) => `<p class="card-title" style="margin:${i ? 20 : 0}px 0 6px">${esc(x.label || `Delivery Location ${i + 1}`)}</p>${table(x.lines)}
      <div class="summary"><div class="summary-row"><span>Total</span><span class="total-bold">${m(lineTotals({ ...q, lines: x.lines, locations: [] }).total)}</span></div></div>`).join('')}
      <div class="summary"><div class="grand-total"><span>Grand Total</span><span>${m(all.total)}</span></div></div>`;
  const o = q.optionalItem;
  const opt = o.item ? `<div class="optional-item-card"><div class="optional-item-title">Optional Suggested Item — Not Included in Total</div>
    <div class="optional-item-row"><span class="optional-item-name">${esc(o.item)}</span>${Number(o.price) ? `<span class="optional-item-price">${m(o.price)}</span>` : ''}</div>
    ${o.description ? `<div class="optional-item-desc">${br(o.description)}</div>` : ''}</div>` : '';
  const conds = [...q.conditions, q.notes].filter(t => t && String(t).trim()).map(t => `<li>${br(t)}</li>`).join('');
  const b = q.billTo;
  const reach = [b.phone, b.email].filter(Boolean).map(esc).join(' | ');
  const foot = [co.phone && `Mobile: ${esc(co.phone)}`, co.email && `Mail: ${esc(co.email)}`, co.website && `Website: ${esc(co.website)}`].filter(Boolean).join(' &nbsp;|&nbsp; ');
  const logo = new URL('assets/rsvp-logo.jpg', location.href).href;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Quotation ${esc((q.no || 'draft').replace(/\//g, '-'))}${rev ? ` Rev ${rev}` : ''}</title><style>
    *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif;background:#fff;color:#444;font-size:11px}
    .page{padding:16px 22px 20px;max-width:900px;margin:0 auto}
    .header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;margin-bottom:14px;gap:12px}
    .logo-box img{width:110px;height:auto;object-fit:contain}
    .quote-title{font-size:24px;font-weight:700;letter-spacing:1px;color:#233d67;text-align:center;white-space:nowrap}
    .quote-block{text-align:right;justify-self:end}.quote-info{font-size:11px;line-height:1.8}.quote-info strong{color:#222}
    .top-line{border-top:2px solid #2c4b78;margin:10px 0 16px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
    .info-card{background:#f2f4f7;border-radius:6px;padding:14px}
    .card-title{font-size:11px;font-weight:700;color:#233d67;margin-bottom:8px;text-transform:uppercase}
    .client-name{font-size:11px;font-weight:700;color:#333;margin-bottom:6px}.card-text{line-height:1.7;color:#666;font-size:10px}
    table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:6px}thead{background:#233d67;color:#fff}
    th{padding:9px 8px;font-size:11px;font-weight:600;text-align:left}
    td{padding:10px 8px;border-bottom:1px solid #dfe4ea;vertical-align:top;font-size:10px;overflow-wrap:break-word}
    .center{text-align:center}.right{text-align:right}
    .item-title{font-size:11px;font-weight:700;color:#233d67;margin-bottom:3px}.item-desc{font-size:10px;color:#777;line-height:1.4;white-space:pre-line}
    .total-bold{font-weight:700;color:#222}
    .summary{width:260px;margin-left:auto;margin-top:14px}
    .summary-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #dfe4ea;font-size:11px}.discount{color:#ef5350}
    .grand-total{background:#233d67;color:#fff;padding:12px 14px;border-radius:4px;margin-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700}
    .optional-item-card{margin-top:14px;background:#fffaf0;border:1px dashed #d8a83c;border-radius:6px;padding:8px 12px}
    .optional-item-title{font-size:10px;font-weight:700;color:#92660f;margin-bottom:4px;text-transform:uppercase}
    .optional-item-row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
    .optional-item-name{font-size:10.5px;font-weight:700;color:#233d67}.optional-item-price{font-size:10.5px;font-weight:700;color:#92660f;white-space:nowrap}
    .optional-item-desc{font-size:9.5px;color:#666;line-height:1.5;margin-top:2px}
    .terms-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:20px}
    .term-card{background:#f2f4f7;border-radius:6px;padding:12px}.term-title{font-size:11px;font-weight:700;color:#233d67;margin-bottom:8px;text-transform:uppercase}
    .term-text{font-size:10px;color:#666;line-height:1.6;white-space:pre-line}
    .conditions{margin-top:16px}.conditions-line{border-top:2px solid #2c4b78;margin-bottom:10px}
    .conditions-title{font-size:11px;font-weight:700;color:#233d67;margin-bottom:8px;text-transform:uppercase}
    .conditions ul{margin:0;padding-left:16px}.conditions li{margin-bottom:6px;color:#666;font-size:10px;line-height:1.5}
    .signoff{margin-top:18px;font-size:10.5px;line-height:1.7;color:#444}
    .quote-footer{border-top:1px solid #dfe4ea;margin-top:20px;padding-top:10px;text-align:center;color:#888;font-size:9px;line-height:1.6}
    .bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 22px;background:#f2f4f7;border-bottom:1px solid #dfe4ea;font-size:12px}
    .bar button{font:inherit;padding:6px 14px;border-radius:4px;border:1px solid #233d67;background:#233d67;color:#fff;cursor:pointer}
    @media print{.bar{display:none}.page{padding:0}thead{-webkit-print-color-adjust:exact;print-color-adjust:exact}.grand-total,.info-card,.term-card,.optional-item-card{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
    <div class="bar"><span>${preview ? `<b>Preview</b> — ${rev ? `shows as Rev ${rev}` : 'not saved yet'}` : ''}</span><button onclick="print()">Print / Save as PDF</button></div>
    <div class="page">
      <div class="header"><div class="logo-box"><img src="${logo}" alt="${esc(co.name)}"></div><div class="quote-title">QUOTATION</div>
        <div class="quote-block"><div class="quote-info">Quote No: <strong>${esc(q.no)}</strong><br>Date: <strong>${dmy(q.date)}</strong><br>Valid Until: <strong>${dmy(q.validUntil)}</strong>${rev ? `<br>Revision: <strong>Rev ${rev}</strong>` : ''}</div></div></div>
      <div class="top-line"></div>
      <div class="info-grid">
        <div class="info-card"><div class="card-title">Quote from</div><div class="card-text"><strong>${esc(q.from.name)}</strong><br>${br(q.from.address)}${q.from.gst ? `<br>GST: ${esc(q.from.gst)}` : ''}</div></div>
        <div class="info-card"><div class="card-title">Bill to</div><div class="client-name">${esc(b.name)}</div><div class="card-text">${br(b.address)}${reach ? `<br>${reach}` : ''}${b.gst ? `<br>GST No: ${esc(b.gst)}` : ''}</div></div>
      </div>
      ${items}${opt}
      <div class="terms-grid"><div class="term-card"><div class="term-title">Payment terms</div><div class="term-text">${esc(q.paymentTerms)}</div></div>
        <div class="term-card"><div class="term-title">Delivery terms</div><div class="term-text">${esc(q.deliveryTerms)}</div></div>
        <div class="term-card"><div class="term-title">Warranty</div><div class="term-text">${esc(q.warrantyTerms)}</div></div></div>
      <div class="conditions"><div class="conditions-line"></div><div class="conditions-title">Terms &amp; Conditions</div><ul>${conds}</ul>
        <div class="signoff">${br(q.signoff)}</div></div>
      <div class="quote-footer">${foot}${foot ? '<br>' : ''}This is a computer generated quotation.</div>
    </div>${preview ? '' : '<script>setTimeout(function(){print()},400)<\/script>'}</body></html>`;
  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to preview and print quotations', 'error'); return; }
  win.document.write(html); win.document.close();
}
function printDoc(kind, d) {
  if (kind === 'quote') return printQuote(d);
  const co = erpSet('company'), s = erpSet('sales');
  const c = client(d.clientId) || { name: (lead(d.leadId) || {}).company || '', address: '', city: '', state: '', gst: '', contacts: [] };
  const t = lineTotals(d), cur = d.currency;
  const isQ = kind === 'quote';
  const ct = c.contacts && c.contacts[0] || {};
  const fmt = v => money(v, cur);
  const rows = d.lines.map((l, i) => `<tr><td>${i + 1}</td><td><b>${esc(l.item)}</b>${l.description ? `<div class="desc">${esc(l.description)}</div>` : ''}</td>${isQ ? '' : `<td>${esc(l.hsn || '')}</td>`}<td class="r">${esc(l.qty)}</td><td class="r">${fmt(l.price)}</td>${d.discountMode === 'total' ? '' : `<td class="r">${Number(l.disc) || 0}%</td>`}<td class="r">${Number(l.gst) || 0}%</td><td class="r">${fmt(lineAmount(l, d))}</td></tr>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.no)}</title><style>
    *{box-sizing:border-box} body{font:13px/1.45 "Segoe UI",Arial,sans-serif;color:#1e1f21;margin:0;padding:32px 40px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #1868DB;padding-bottom:16px}
    .co b{font-size:20px;display:block;margin-bottom:4px}.co div{white-space:pre-line;color:#505258}
    h1{margin:0;font-size:26px;letter-spacing:.5px;color:#1868DB;text-align:right}.meta{text-align:right;margin-top:6px;color:#505258}.meta b{color:#1e1f21}
    .parties{display:flex;gap:24px;margin:20px 0}.party{flex:1;border:1px solid #dcdfe4;border-radius:6px;padding:12px}.party h4{margin:0 0 6px;font-size:11px;text-transform:uppercase;color:#6b6e76;letter-spacing:.4px}.party div{white-space:pre-line}
    table{width:100%;border-collapse:collapse}th{background:#f1f2f4;text-align:left;font-size:11px;text-transform:uppercase;color:#505258;padding:8px}td{padding:8px;border-bottom:1px solid #e6e7ea;vertical-align:top}.r{text-align:right}.desc{color:#6b6e76;font-size:12px}
    .tot{margin-left:auto;width:320px;margin-top:12px}.tot div{display:flex;justify-content:space-between;padding:4px 0}.tot .g{border-top:2px solid #1e1f21;margin-top:4px;padding-top:8px;font-size:16px;font-weight:700}
    .terms{margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:12px 24px}.terms h4{margin:0 0 4px;font-size:11px;text-transform:uppercase;color:#6b6e76}.terms div{white-space:pre-line}
    .foot{margin-top:32px;display:flex;justify-content:space-between;align-items:flex-end}.sign{text-align:center;border-top:1px solid #1e1f21;padding-top:4px;width:220px}.note{color:#6b6e76;font-size:11px;margin-top:24px;text-align:center}
    @media print{body{padding:16px}.noprint{display:none}}</style></head><body>
    <div class="noprint" style="text-align:right;margin-bottom:12px"><button onclick="print()">Print / Save as PDF</button></div>
    <div class="top"><div class="co"><b>${esc(co.name)}</b><div>${esc(co.address)}</div><div>${[co.phone, co.email].filter(Boolean).map(esc).join(' · ')}</div>${co.gst ? `<div>GSTIN: ${esc(co.gst)}</div>` : ''}</div>
      <div><h1>${isQ ? 'QUOTATION' : 'PROFORMA INVOICE'}</h1><div class="meta"><div>No: <b>${esc(d.no)}</b></div><div>Date: <b>${fmtDate(d.date)}</b></div>${isQ ? `<div>Valid until: <b>${fmtDate(d.validUntil)}</b></div>` : `<div>Due: <b>${fmtDate(d.dueDate)}</b></div>${d.poNumber ? `<div>PO: <b>${esc(d.poNumber)}</b></div>` : ''}`}</div></div></div>
    <div class="parties"><div class="party"><h4>${isQ ? 'Quotation for' : 'Bill to'}</h4><b>${esc(c.name)}</b><div>${esc([c.address, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join('\n'))}</div>${c.gst ? `<div>GSTIN: ${esc(c.gst)}</div>` : ''}${ct.name ? `<div>Attn: ${esc(ct.name)}${ct.phone ? ' · ' + esc(ct.phone) : ''}</div>` : ''}</div>
      ${isQ ? `<div class="party"><h4>Prepared by</h4><b>${esc(personName(d.preparedBy, ''))}</b><div>${esc(((empRecord(d.preparedBy) || {}).email) || co.email)}</div><div>${esc(((empRecord(d.preparedBy) || {}).phone) || co.phone)}</div></div>` : `<div class="party"><h4>Ship to</h4><div>${esc(d.shipTo || c.name)}</div></div>`}</div>
    <table><thead><tr><th style="width:32px">#</th><th>Description</th>${isQ ? '' : '<th>HSN/SAC</th>'}<th class="r">Qty</th><th class="r">Rate</th>${d.discountMode === 'total' ? '' : '<th class="r">Disc</th>'}<th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot"><div><span>Subtotal</span><span>${fmt(t.sub)}</span></div>${t.disc ? `<div><span>Discount${d.discountMode === 'total' ? ` (${d.discount}%)` : ''}</span><span>− ${fmt(t.disc)}</span></div>` : ''}<div><span>GST</span><span>${fmt(t.tax)}</span></div><div class="g"><span>Total</span><span>${fmt(t.total)}</span></div>
      ${!isQ && Number(d.toPayPercent) && Number(d.toPayPercent) < 100 ? `<div><span>To pay now (${d.toPayPercent}%)</span><b>${fmt(t.total * d.toPayPercent / 100)}</b></div>` : ''}${!isQ && invoicePaid(d) ? `<div><span>Received</span><span>${fmt(invoicePaid(d))}</span></div><div><span>Balance due</span><b>${fmt(invoiceBalance(d))}</b></div>` : ''}</div>
    <div class="terms">${d.paymentTerms ? `<div><h4>Payment terms</h4><div>${esc(d.paymentTerms)}</div></div>` : ''}${isQ && d.deliveryTerms ? `<div><h4>Delivery</h4><div>${esc(d.deliveryTerms)}</div></div>` : ''}${isQ && d.warrantyTerms ? `<div><h4>Warranty</h4><div>${esc(d.warrantyTerms)}</div></div>` : ''}${s.bank ? `<div><h4>Bank details</h4><div>${esc(s.bank)}</div></div>` : ''}${d.notes ? `<div><h4>Notes</h4><div>${esc(d.notes)}</div></div>` : ''}</div>
    ${isQ && s.signoff ? `<p style="margin-top:24px">${esc(s.signoff)}</p>` : ''}
    <div class="foot"><div></div><div class="sign">For ${esc(co.name)}<br><br><br>Authorised signatory</div></div>
    <div class="note">This is a computer generated ${isQ ? 'quotation' : 'invoice'}.</div>
    <script>setTimeout(function(){print()},300)<\/script></body></html>`;
  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to print documents', 'error'); return; }
  win.document.write(html); win.document.close();
}

/* ---------------- Settings ---------------- */
/* an editable list of longer texts (terms, bank accounts); bindTextLists saves each list by its key */
function textListHTML(key, arr, { rows = 2, add = 'Add' } = {}) {
  return `<div class="text-list" data-tl="${key}">${arr.map((t, i) => `<div class="tl-row"><span class="q-cond-no">${i + 1}.</span><textarea class="input" rows="${rows}" data-tl-i="${i}">${esc(t)}</textarea>
    <button class="icon-btn xs" data-tl-up="${i}" ${i ? '' : 'disabled'} title="Move up">${icon('chevronUp', 14)}</button><button class="icon-btn xs" data-tl-del="${i}" title="Remove">${icon('trash', 14)}</button></div>`).join('')}
    <button class="btn subtle sm" data-tl-add>${icon('plus', 12)} ${esc(add)}</button></div>`;
}
function bindTextLists(root, lists) {
  const arrOf = t => { const box = t.closest('[data-tl]'); return box && lists[box.dataset.tl] ? lists[box.dataset.tl]() : null; };
  root.addEventListener('change', e => {
    const i = e.target.dataset.tlI; if (i == null) return;
    const a = arrOf(e.target); if (!a) return;
    a[Number(i)] = e.target.value; Store.save(true); toast('Saved');
  });
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-tl-del], [data-tl-up], [data-tl-add]'); if (!b) return;
    const a = arrOf(b); if (!a) return;
    if (b.dataset.tlDel != null) { if (a[Number(b.dataset.tlDel)].trim() && !await confirmDialog({ title: 'Remove this entry?', message: 'Quotations that already use it keep their text.', confirmLabel: 'Remove' })) return; a.splice(Number(b.dataset.tlDel), 1); }
    else if (b.dataset.tlUp != null) { const i = Number(b.dataset.tlUp); [a[i - 1], a[i]] = [a[i], a[i - 1]]; }
    else a.push('');
    Store.save(true); render();
  });
}
function salesSettings(root, r) {
  const s = erpSet('sales');
  appSettingsPage(appById('sales'), root, r, [
    {
      id: 'defaults', name: 'Numbering & defaults', icon: 'sliders',
      html: () => `<h2>Numbering &amp; defaults</h2><p class="muted">How new quotations and invoices are numbered and filled in.</p>
        <div class="panel settings-panel"><h3>Numbering</h3><div class="form-grid">
          <div class="field span-2"><span class="field-label">Quotation numbers</span><div class="small">QT/RSVP/<i>client code</i>/<i>financial year</i>/<i>serial</i>, as in the ERP. The client code is the first three letters of the client's name, and the serial carries on through each financial year (April to March). You can change a number on the quotation before saving it.</div><span class="field-help">Next, for a client called “AquaPure Industries”: ${esc(nextQuoteNo('AquaPure Industries'))}</span></div>
          <label class="field"><span class="field-label">Invoice prefix</span><input class="input" data-setting="sales.invoicePrefix" value="${esc(s.invoicePrefix)}"><span class="field-help">Next: ${esc(s.invoicePrefix)}${new Date().getFullYear()}-${String(s.nextInvoice).padStart(3, '0')}</span></label>
          <label class="field"><span class="field-label">Next invoice number</span><input class="input" type="number" min="1" data-setting="sales.nextInvoice" value="${s.nextInvoice}"></label></div></div>
        <div class="panel settings-panel"><h3>Defaults</h3><div class="form-grid">
          <label class="field"><span class="field-label">Currency</span>${selectHTML('cur', Object.keys(CUR_SYMBOL), s.currency, { attrs: 'data-setting="sales.currency"' })}</label>
          <label class="field"><span class="field-label">Default GST %</span><input class="input" type="number" min="0" max="40" data-setting="sales.gstDefault" value="${s.gstDefault}"></label>
          <label class="field"><span class="field-label">Quotations valid for (days)</span><input class="input" type="number" min="1" data-setting="sales.validityDays" value="${s.validityDays}"></label>
          <label class="field"><span class="field-label">Invoices due after (days)</span><input class="input" type="number" min="0" data-setting="sales.invoiceDueDays" value="${s.invoiceDueDays}"></label></div></div>`,
      bind(el) { el.addEventListener('change', () => setTimeout(render, 0)); },
    },
    {
      id: 'terms', name: 'Quotation terms', icon: 'docs',
      html: () => `<h2>Quotation terms</h2><p class="muted">The wording quotations start with. Everything can still be changed on each quotation.</p>
        <div class="panel settings-panel">
          <h3>On every new quotation</h3>
          <label class="field"><span class="field-label">Payment terms</span><textarea class="input" rows="2" data-setting="sales.paymentTerms">${esc(s.paymentTerms)}</textarea></label>
          <label class="field"><span class="field-label">Delivery terms</span><textarea class="input" rows="2" data-setting="sales.deliveryTerms">${esc(s.deliveryTerms)}</textarea></label>
          <label class="field"><span class="field-label">Warranty</span><textarea class="input" rows="2" data-setting="sales.warrantyTerms">${esc(s.warrantyTerms)}</textarea></label>
          <label class="field"><span class="field-label">Sign-off</span><textarea class="input" rows="6" data-setting="sales.signoff">${esc(s.signoff)}</textarea><span class="field-help">Shown below the terms &amp; conditions. It can still be changed on each quotation.</span></label></div>
        <div class="panel settings-panel"><h3>Standard term choices</h3><p class="muted small">Offered in the dropdown next to each term on a quotation.</p>
          <div class="field"><span class="field-label">Payment terms</span>${textListHTML('payment', s.paymentPresets, { add: 'Add a payment term' })}</div>
          <div class="field"><span class="field-label">Delivery terms</span>${textListHTML('delivery', s.deliveryPresets, { add: 'Add a delivery term' })}</div>
          <div class="field"><span class="field-label">Warranty</span>${textListHTML('warranty', s.warrantyPresets, { add: 'Add a warranty term' })}</div></div>
        <div class="panel settings-panel"><h3>Bank accounts</h3><p class="muted small">Chosen under Bank details on a quotation, and added to its terms &amp; conditions.</p>
          ${textListHTML('banks', s.bankOptions, { rows: 5, add: 'Add a bank account' })}</div>
        <div class="panel settings-panel"><h3>Standard terms &amp; conditions</h3><p class="muted small">Filled in by <b>Load standard terms &amp; conditions</b> on a quotation. A row that says <code>${esc(QUOTE_BANK_TOKEN)}</code> becomes the bank chosen on the quotation.</p>
          ${textListHTML('std', s.standardTerms, { rows: 3, add: 'Add a condition' })}</div>
        <div class="panel settings-panel"><label class="field"><span class="field-label">Bank details on proforma invoices</span><textarea class="input" rows="5" data-setting="sales.bank">${esc(s.bank)}</textarea></label></div>`,
      bind: el => bindTextLists(el, { payment: () => s.paymentPresets, delivery: () => s.deliveryPresets, warranty: () => s.warrantyPresets, banks: () => s.bankOptions, std: () => s.standardTerms }),
    },
  ]);
}
