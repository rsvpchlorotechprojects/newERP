/* CRM app: leads pipeline, client accounts, lead → client → project space */

const LEAD_PRIORITIES = PRIORITIES.filter(p => ['high', 'medium', 'low'].includes(p.id));
const CLIENT_TYPES = ['Direct user', 'Consultant', 'Contractor', 'Dealer', 'Government'];

registerApp({
  id: 'crm', name: 'CRM', short: 'Leads & clients', desc: 'Move leads through your pipeline and keep every client account in one place', color: '#F87168', glyph: 'target',
  tabs: [
    { id: 'summary', name: 'Summary', icon: 'globe' },
    { id: 'leads', name: 'Leads', icon: 'funnel', count: () => erp().leads.filter(isOpenLead).length },
    { id: 'clients', name: 'Clients', icon: 'building' },
    { id: 'settings', name: 'Settings', icon: 'gear' },
  ],
  primary(r) { return r.tab === 'clients' ? { label: 'New client', run: () => openClientModal() } : { label: 'New lead', run: () => openLeadCreate() }; },
  shortcuts() {
    const me = Store.state.me, t = todayStr();
    const open = erp().leads.filter(isOpenLead);
    return [
      { id: 'hot', label: 'High priority', icon: 'bolt', href: '#/app/crm/leads?priority=high', count: open.filter(l => l.priority === 'high').length },
      { id: 'due', label: 'Closing this month', icon: 'calendar', href: '#/app/crm/leads?closing=1', count: open.filter(l => l.expected && monthKey(l.expected) === monthKey(t)).length },
      { id: 'won', label: 'Won deals', icon: 'checkCircle', href: '#/app/crm/leads?cat=won&view=list' },
      { id: 'follow', label: 'Follow-ups due', icon: 'bell', href: '#/app/crm/leads?cv=followups', count: open.filter(l => l.followUp).length },
      { id: 'unread', label: 'My unread leads', icon: 'eye', href: '#/app/crm/leads?cv=unread', count: open.filter(l => l.owner === me && leadUnread(l)).length },
      ...erpSet('crm').views.map(v => ({ id: 'cv-' + v.id, label: v.name, icon: 'star', href: `#/app/crm/leads?cv=${v.id}` })),
    ];
  },
  stats() {
    const open = erp().leads.filter(isOpenLead);
    return [{ label: 'Open leads', value: open.length }, { label: 'Pipeline', value: moneyShort(open.reduce((s, l) => s + (Number(l.value) || 0), 0)) }, { label: 'Clients', value: erp().clients.length }];
  },
  create(anchor) { menu(anchor, [{ value: 'lead', label: 'Lead', icon: icon('funnel') }, { value: 'client', label: 'Client', icon: icon('building') }], v => (v === 'lead' ? openLeadCreate() : openClientModal())); },
  render(tab, root, r) {
    if (tab === 'summary') return crmSummary(root);
    if (tab === 'leads') return crmLeads(root, r);
    if (tab === 'clients') return r.sub ? clientPage(root, r.sub) : crmClients(root, r);
    if (tab === 'settings') return crmSettings(root, r);
  },
});

/* ---------------- data ops ---------------- */
function newLead(data) {
  const e = erp();
  e.counters.lead = (e.counters.lead || e.leads.length) + 1;
  const l = Object.assign({
    id: uid('ld'), no: e.counters.lead, title: '', company: '', clientId: null, stageId: erpSet('crm').stages[0].id, value: 0, priority: 'medium', source: '', industry: '',
    owner: Store.state.me, type: 'System', contact: { name: '', phone: '', email: '' }, requirement: '', remarks: '', spaceId: null, expected: null,
    city: '', tags: [], followUp: null, followUpTime: null, junk: false,
    created: nowISO(), updated: nowISO(), log: [],
  }, data);
  e.leads.push(l);
  leadLog(l, 'created this lead');
  erpLog('crm', `created lead LD-${l.no}`, { type: 'lead', id: l.id });
  leadFlowOnStage(l); // created straight into a stage that gets a space
  return l;
}
function leadLog(l, text, note = false) { l.log.unshift({ id: uid('ll'), at: nowISO(), user: Store.state.me, text, note }); l.updated = nowISO(); }
function setLeadStage(l, stageId, { quiet = false } = {}) {
  if (!stageId || l.stageId === stageId) return;
  const from = stageOf(l), to = erpSet('crm').stages.find(s => s.id === stageId);
  if (!to) return;
  l.stageId = stageId;
  l.stageAt = nowISO();
  leadLog(l, `moved from ${from ? from.name : '—'} to ${to.name}`);
  erpLog('crm', `moved LD-${l.no} to ${to.name}`, { type: 'lead', id: l.id });
  if (to.cat === 'won' && erpSet('crm').convertOnWin && !l.clientId && l.company) convertLeadToClient(l, true);
  leadFlowOnStage(l); // a folder may create a space for leads reaching this stage
  if (to.cat === 'won' && !quiet) setTimeout(() => toast(`LD-${l.no} won 🎉${l.clientId ? ` — ${(client(l.clientId) || {}).name} is a client` : ''}`), 40);
}
function newClient(data) {
  const e = erp();
  const c = Object.assign({ id: uid('cl'), name: '', industry: '', type: 'Direct user', gst: '', website: '', address: '', city: '', state: '', country: 'India', contacts: [], notes: '', owner: Store.state.me, created: nowISO() }, data);
  c.contacts = (c.contacts || []).filter(x => x && (x.name || x.phone || x.email));
  e.clients.push(c);
  erpLog('crm', `added client ${c.name}`, { type: 'client', id: c.id });
  return c;
}
function convertLeadToClient(l, quiet) {
  let c = erp().clients.find(x => x.name.trim().toLowerCase() === (l.company || '').trim().toLowerCase());
  if (!c) c = newClient({ name: l.company.trim(), industry: l.industry, contacts: [l.contact], owner: l.owner || Store.state.me });
  l.clientId = c.id;
  leadLog(l, `linked to client ${c.name}`);
  // quotes and meetings raised against the lead follow it to the client
  erp().quotes.forEach(q => { if (q.leadId === l.id && !q.clientId) q.clientId = c.id; });
  erp().meetings.forEach(m => { if (m.leadId === l.id && !m.clientId) m.clientId = c.id; });
  if (!quiet) toast(`${c.name} is now a client`);
  return c;
}
function clientLeads(c) { return erp().leads.filter(l => l.clientId === c.id); }
function clientSpaces(c) { return Store.state.spaces.filter(sp => sp.clientId === c.id); }
function clientTotals(c) {
  const e = erp();
  const quotes = e.quotes.filter(q => q.clientId === c.id);
  const invs = e.invoices.filter(i => i.clientId === c.id && i.status !== 'draft' && i.status !== 'cancelled');
  return {
    pipeline: clientLeads(c).filter(isOpenLead).reduce((s, l) => s + (Number(l.value) || 0), 0),
    quoted: quotes.filter(q => q.status !== 'draft').reduce((s, q) => s + lineTotals(q).total, 0),
    invoiced: invs.reduce((s, i) => s + lineTotals(i).total, 0),
    outstanding: invs.reduce((s, i) => s + invoiceBalance(i), 0),
    quotes, invs,
  };
}
function uniqueSpaceKey(base) {
  let k = (base || 'PRJ').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PRJ';
  if (!Store.spaceByKey(k)) return k;
  for (let n = 2; n < 100; n++) if (!Store.spaceByKey(k.slice(0, 5) + n)) return k.slice(0, 5) + n;
  return k + Date.now().toString(36).slice(-2).toUpperCase();
}
function spaceProgress(sp) { const its = Store.itemsOf(sp.id); return { n: its.length, done: its.filter(i => Store.isDone(i)).length, open: its.filter(i => !Store.isDone(i)).length }; }

/* ---------------- Summary ---------------- */
function crmSummary(root) {
  const e = erp(), t = todayStr(), mk = monthKey(t);
  const s = erpSet('crm');
  const open = e.leads.filter(isOpenLead);
  const pipeline = open.reduce((a, l) => a + (Number(l.value) || 0), 0);
  const cat = l => (stageOf(l) || {}).cat;
  const won = e.leads.filter(l => cat(l) === 'won'), lost = e.leads.filter(l => cat(l) === 'lost');
  const wonMonth = won.filter(l => monthKey(l.updated) === mk);
  const winRate = won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : 0;
  const stages = s.stages.filter(x => x.cat === 'new' || x.cat === 'open');
  const bySource = {}; e.leads.forEach(l => { const k = l.source || 'Unknown'; bySource[k] = (bySource[k] || 0) + 1; });
  const srcColors = ['var(--series-1)', 'var(--series-2)', '#82B536', '#C97CF4', '#42B2D7', '#E774BB', '#FCA700', '#8C8F97'];
  const srcSegs = Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: k, value: v, color: srcColors[i % srcColors.length] }));
  const byInd = {}; open.forEach(l => { const k = l.industry || 'Other'; byInd[k] = (byInd[k] || 0) + (Number(l.value) || 0); });
  const indRows = Object.entries(byInd).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const staleCut = new Date(Date.now() - (s.staleDays || 14) * 864e5).toISOString();
  const attention = open.filter(l => (l.expected && l.expected < t) || l.updated < staleCut || !l.owner).slice(0, 8);
  const closing = open.filter(l => l.expected && l.expected >= t).sort((a, b) => a.expected.localeCompare(b.expected)).slice(0, 6);
  const follow = open.filter(l => l.followUp && l.followUp <= addDays(t, 2)).sort((a, b) => (a.followUp + (a.followUpTime || '')).localeCompare(b.followUp + (b.followUpTime || ''))).slice(0, 8);
  const topClients = e.clients.map(c => ({ c, v: clientTotals(c).invoiced + clientTotals(c).pipeline })).sort((a, b) => b.v - a.v).slice(0, 5);
  const why = l => (!l.owner ? 'No owner' : l.expected && l.expected < t ? `Close date passed ${fmtDate(l.expected)}` : `No update in ${Math.floor((Date.now() - Date.parse(l.updated)) / 864e5)} days`);

  root.innerHTML = `<div class="summary">
    <div class="stat-row">
      ${statCard('funnel', open.length, 'Open leads', `${e.leads.filter(l => l.created >= new Date(Date.now() - 7 * 864e5).toISOString()).length} new this week`, { href: '#/app/crm/leads' })}
      ${statCard('rupee', moneyShort(pipeline), 'Pipeline value', open.length ? `Avg ${moneyShort(pipeline / open.length)} per lead` : '')}
      ${statCard('checkCircle', moneyShort(wonMonth.reduce((a, l) => a + (Number(l.value) || 0), 0)), 'Won this month', `${wonMonth.length} deal${wonMonth.length === 1 ? '' : 's'}`, { tone: 'good' })}
      ${statCard('reports', winRate + '%', 'Win rate', `${won.length} won · ${lost.length} lost`)}
    </div>
    <div class="sum-grid">
      ${panel('Pipeline by stage', 'How many leads sit in each stage, and what they are worth.', `<div class="funnel">${stages.map((st, i) => {
        const ls = open.filter(l => l.stageId === st.id), v = ls.reduce((a, l) => a + (Number(l.value) || 0), 0);
        const w = Math.max(8, open.length ? (ls.length / Math.max(...stages.map(x => open.filter(l => l.stageId === x.id).length), 1)) * 100 : 0);
        return `<a class="fn-row" href="#/app/crm/leads?stage=${st.id}&view=list"><span class="fn-name ellip">${esc(st.name)}</span><span class="fn-track"><span class="fn-bar" style="width:${w}%;opacity:${1 - i * 0.08}"></span><b>${ls.length}</b></span><span class="fn-val">${moneyShort(v)}</span></a>`;
      }).join('')}</div>`)}
      ${panel('Where leads come from', 'All leads by source.', srcSegs.length ? `<div class="donut-wrap">${donut(srcSegs, e.leads.length, 180, 'Leads')}<ul class="legend-list">${srcSegs.map(x => `<li><span class="sw" style="background:${x.color}"></span>${esc(x.label)}: <b>${x.value}</b></li>`).join('')}</ul></div>` : miniEmpty('No leads yet.'))}
      ${panel('Needs attention', `Open leads that are overdue, unowned or quiet for ${s.staleDays || 14}+ days.`, attention.length ? `<div class="mini-list">${attention.map(l => `<div class="mini-row" data-rec="lead:${l.id}">${icon('funnel')}<span class="key">LD-${l.no}</span><span class="ellip grow">${esc(l.title)}<span class="muted small"> · ${esc(l.company)}</span></span><span class="due-chip overdue">${esc(why(l))}</span></div>`).join('')}</div>` : miniEmpty('Every open lead is on track.'))}
      ${panel('Closing soon', 'Open leads by expected close date.', closing.length ? `<div class="mini-list">${closing.map(l => `<div class="mini-row" data-rec="lead:${l.id}">${priorityIcon(l.priority)}<span class="ellip grow">${esc(l.title)}<span class="muted small"> · ${esc(l.company)}</span></span><b class="small">${moneyShort(l.value)}</b><span class="due-chip">${fmtDate(l.expected)}</span></div>`).join('')}</div>` : miniEmpty('No close dates set.'))}
      ${panel('Follow-ups', 'Open leads with a follow-up due in the next two days.', follow.length ? `<div class="mini-list">${follow.map(l => `<div class="mini-row" data-rec="lead:${l.id}">${icon('bell')}<span class="key">LD-${l.no}</span><span class="ellip grow">${esc(l.title)}<span class="muted small"> · ${esc(l.contact.name || l.company)}</span></span>${avatar(l.owner, 20)}<span class="due-chip ${followClass(l)}">${followText(l, { today: true })}</span></div>`).join('')}</div>` : miniEmpty('No follow-ups due. Set one on a lead, or when you log a call.'), { action: '<a class="link small" href="#/app/crm/leads?cv=followups">All follow-ups</a>' })}
      ${panel('Pipeline by industry', 'Open value per industry.', indRows.length ? hbars(indRows.map(([k, v]) => ({ label: `<span class="ellip">${esc(k)}</span>`, value: v, display: moneyShort(v), tip: money(v) })), Math.max(1, ...indRows.map(x => x[1]))) : miniEmpty('No open leads.'))}
      ${panel('Top clients', 'Invoiced plus open pipeline.', topClients.length ? `<div class="mini-list">${topClients.map(x => `<a class="mini-row" href="#/app/crm/clients/${x.c.id}">${clientAvatar(x.c, 24)}<span class="ellip grow">${esc(x.c.name)}<span class="muted small"> · ${esc(x.c.industry || '')}</span></span><b class="small">${moneyShort(x.v)}</b></a>`).join('')}</div>` : miniEmpty('No clients yet.'), { action: '<a class="link small" href="#/app/crm/clients">All clients</a>' })}
    </div></div>`;
}

function clientAvatar(c, size = 24) {
  const colors = ['#F87168', '#FCA700', '#4BCE97', '#669DF1', '#C97CF4', '#E774BB', '#42B2D7', '#94C748'];
  const h = [...c.name].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const ini = c.name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return `<span class="client-av" style="width:${size}px;height:${size}px;background:${colors[h % colors.length]};font-size:${Math.max(9, Math.round(size * 0.38))}px">${esc(ini)}</span>`;
}

/* ---------------- Leads list ---------------- */
/* crmLeads, leadCard and the list tools live in crm-leads.js */
function leadStageMenu(anchor, l, after) {
  menu(anchor, erpSet('crm').stages.map(s => ({ value: s.id, label: pill(s.name, STAGE_CLS[s.cat]), selected: s.id === l.stageId })), v => moveLeadStage(l, v, after), { cls: 'status-menu' });
}

/* ---------------- Lead create ---------------- */
function openLeadCreate(preset = {}) {
  const s = erpSet('crm');
  const pc = preset.clientId && client(preset.clientId);
  openModal({
    title: 'New lead', width: 640, cls: 'create-modal',
    body: `<p class="muted small">Required fields are marked with an asterisk <span class="req">*</span></p>
      <label class="field"><span class="field-label">What do they need? <span class="req">*</span></span><input class="input" name="title" autofocus placeholder="e.g. Gas chlorination system 10 kg/h"></label>
      <div class="form-grid">
        <label class="field"><span class="field-label">Company <span class="req">*</span></span><input class="input" name="company" list="crm-clients" value="${esc(pc ? pc.name : '')}" placeholder="Type a new or existing company">
          <datalist id="crm-clients">${erp().clients.map(c => `<option value="${esc(c.name)}">`).join('')}</datalist><span class="field-help" data-client-hint>${pc ? 'Linked to an existing client' : ''}</span></label>
        <label class="field"><span class="field-label">Estimated value (${esc(erpSet('sales').currency)})</span><input class="input" type="number" min="0" step="1000" name="value" placeholder="0"></label>
        <label class="field"><span class="field-label">Contact person</span><input class="input" name="cname" value="${esc(pc && pc.contacts[0] ? pc.contacts[0].name : '')}"></label>
        <label class="field"><span class="field-label">Phone</span><input class="input" name="cphone" value="${esc(pc && pc.contacts[0] ? pc.contacts[0].phone : '')}"></label>
        <label class="field"><span class="field-label">Email</span><input class="input" type="email" name="cemail" value="${esc(pc && pc.contacts[0] ? pc.contacts[0].email : '')}"></label>
        <label class="field"><span class="field-label">Source</span>${selectHTML('source', s.sources, pc ? 'Existing client' : '', { blank: 'Choose…' })}</label>
        <label class="field"><span class="field-label">Industry</span>${selectHTML('industry', s.industries, pc ? pc.industry : '', { blank: 'Choose…' })}</label>
        <label class="field"><span class="field-label">Type</span>${selectHTML('type', ['System', 'Spare', 'Service'], 'System')}</label>
        <label class="field"><span class="field-label">Priority</span>${selectHTML('priority', LEAD_PRIORITIES.map(p => ({ value: p.id, label: p.name })), 'medium')}</label>
        <label class="field"><span class="field-label">Expected close</span><input class="input" type="date" name="expected"></label>
        <label class="field"><span class="field-label">Owner</span>${selectHTML('owner', userOptions(), Store.state.me, { blank: 'Unassigned' })}</label>
        <label class="field"><span class="field-label">Stage</span>${selectHTML('stageId', (s.enforceStages === false ? s.stages : s.stages.slice(0, 1)).map(x => ({ value: x.id, label: x.name })), s.enforceStages === false ? preset.stageId || s.stages[0].id : s.stages[0].id)}</label>
        <label class="field"><span class="field-label">City</span><input class="input" name="city" value="${esc(pc ? pc.city || '' : '')}"></label>
        <label class="field"><span class="field-label">Next follow-up</span><div class="row gap8"><input class="input" type="date" name="followUp"><input class="input fu-time" type="time" name="followUpTime" title="Time (optional)"></div></label>
      </div>
      <div class="dup-warn" data-dup hidden></div>
      <label class="field"><span class="field-label">Requirement notes</span><textarea class="input" rows="3" name="requirement" placeholder="Flow rate, dose, site conditions…"></textarea></label>`,
    footer: '<label class="check small grow"><input type="checkbox" name="another"> Create another</label><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Create lead</button>',
    onMount(el, api) {
      const comp = el.querySelector('[name=company]');
      comp.addEventListener('input', () => {
        const c = erp().clients.find(x => x.name.toLowerCase() === comp.value.trim().toLowerCase());
        el.querySelector('[data-client-hint]').textContent = c ? 'Linked to an existing client' : comp.value.trim() ? 'New company — convert it to a client any time' : '';
        if (c) {
          const ct = c.contacts[0] || {};
          ['cname', 'cphone', 'cemail'].forEach((k, i) => { const f = el.querySelector(`[name=${k}]`); if (!f.value) f.value = [ct.name, ct.phone, ct.email][i] || ''; });
          const ind = el.querySelector('[name=industry]'); if (!ind.value && c.industry) ind.value = c.industry;
          const city = el.querySelector('[name=city]'); if (!city.value && c.city) city.value = c.city;
        }
      });
      // warn about an existing lead with the same email, phone, or company + requirement
      const dup = el.querySelector('[data-dup]');
      const checkDup = () => {
        const f = formData(el), em = f.cemail.trim().toLowerCase(), ph = phoneKey(f.cphone), ck = normKey(f.company) && normKey(f.title) ? normKey(f.company) + '|' + normKey(f.title) : '';
        const hits = erp().leads.filter(x => (em && (x.contact.email || '').trim().toLowerCase() === em) || (ph && phoneKey(x.contact.phone) === ph) || (ck && normKey(x.company) + '|' + normKey(x.title) === ck)).slice(0, 3);
        dup.hidden = !hits.length;
        dup.innerHTML = hits.length ? `${icon('help', 14)}<span>Possible duplicate of ${hits.map(x => `<button class="link" data-rec="lead:${x.id}">LD-${x.no}</button> <span class="muted">${esc(x.company)} · ${esc(stageOf(x).name)}</span>`).join(', ')}</span>` : '';
      };
      ['cemail', 'cphone', 'company', 'title'].forEach(n => el.querySelector(`[name=${n}]`).addEventListener('change', checkDup));
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el);
        if (!f.title.trim()) { el.querySelector('[name=title]').classList.add('invalid'); el.querySelector('[name=title]').focus(); return; }
        if (!f.company.trim()) { comp.classList.add('invalid'); comp.focus(); return; }
        const c = erp().clients.find(x => x.name.toLowerCase() === f.company.trim().toLowerCase());
        const l = newLead({ title: f.title.trim(), company: c ? c.name : f.company.trim(), clientId: c ? c.id : null, value: Number(f.value) || 0, contact: { name: f.cname, phone: f.cphone, email: f.cemail }, source: f.source, industry: f.industry, type: f.type, priority: f.priority, expected: f.expected || null, owner: f.owner || null, stageId: f.stageId, requirement: f.requirement, city: f.city.trim(), followUp: f.followUp || null, followUpTime: (f.followUp && f.followUpTime) || null });
        if (l.owner && l.owner !== Store.state.me) Store.notify(l.owner, null, `You were assigned lead LD-${l.no} "${l.title}" (${l.company})`);
        Store.save();
        toast(`LD-${l.no} created`);
        if (f.another) { el.querySelector('[name=title]').value = ''; el.querySelector('[name=title]').focus(); } else { api.close(); if (preset.open !== false) openLead(l.id); }
      });
    },
  });
}

/* ---------------- Lead detail ---------------- */
function openLead(id) {
  const l = lead(id);
  if (!l) return;
  touchRecord('lead', id);
  const s = erpSet('crm');
  let m, akind = 'note', hf = 'all';
  const KINDS = { note: ['comment', 'Note', 'Add a note — call summary, next step…'], call: ['phone', 'Call', 'What was discussed on the call?'], email: ['mail', 'Email', 'Summary of the email sent or received'], visit: ['pin', 'Visit', 'What happened at the visit?'] };
  const draw = () => {
    if (!lead(id)) { m.close(); return; }
    const c = l.clientId && client(l.clientId);
    const quotes = erp().quotes.filter(q => q.leadId === l.id);
    const meets = erp().meetings.filter(x => x.leadId === l.id).sort((a, b) => b.date.localeCompare(a.date));
    const calcs = erp().calcs.filter(x => x.leadId === l.id);
    const sp = l.spaceId && Store.space(l.spaceId);
    const idx = s.stages.findIndex(x => x.id === l.stageId);
    const cur = stageOf(l);
    const t = todayStr();
    const ids = (APP_UI['crm.leads'] || {}).ids || [], pos = ids.indexOf(l.id);
    const wa = String(l.contact.phone || '').replace(/\D/g, '');
    const HF = { all: () => true, notes: x => x.note && ['note', 'call', 'visit'].includes(x.kind || 'note'), email: x => x.note && x.kind === 'email', emailcalls: x => x.note && (x.kind === 'email' || x.kind === 'call'), changes: x => !x.note };
    const hist = l.log.filter(HF[hf]);
    const fuOfChip = x => {
      if (!x.fuDue) return '';
      const src = x.fuOf && l.log.find(y => y.id === x.fuOf);
      const due = `${fmtDate(x.fuDue)}${x.fuDueTime ? ' ' + fmtTime(x.fuDueTime) : ''}`;
      return src
        ? `<button class="fu-of" data-goto-log="${src.id}" title="${esc(src.text)}">${icon('bell', 11)} Follow-up to the ${LOG_KIND_NAME[src.kind || 'note']} of ${fmtDate(src.at.slice(0, 10))}: <span class="ellip">${esc(src.text)}</span></button>`
        : `<span class="fu-of">${icon('bell', 11)} Follow-up due ${due}</span>`;
    };
    const fuDoneChip = x => { const d = x.note && x.fu && l.log.find(y => y.fuOf === x.id); return d ? `<button class="fu-of done" data-goto-log="${d.id}" title="${esc(d.text)}">${icon('check', 11)} Followed up ${fmtDate(d.at.slice(0, 10))}</button>` : ''; };
    const fuChip = x => (x.fu ? `<span class="due-chip fu-chip" title="Follow-up set with this entry">${icon('bell', 11)} Follow-up ${fmtDate(x.fu)}${x.fuTime ? ' ' + fmtTime(x.fuTime) : ''}</span>` : '');
    m.el.querySelector('.modal-body').innerHTML = `<div class="item-view">
      <div class="iv-head"><div class="breadcrumbs"><a href="#/app/crm/leads" data-close>${appIcon(appById('crm'), 16)} CRM</a><span>/</span><span class="bc-key">${icon('funnel', 14)} LD-${l.no}</span></div>
        <div class="iv-head-actions">${pos >= 0 ? `<span class="lead-nav"><button class="icon-btn" data-lm="prev" ${pos === 0 ? 'disabled' : ''} title="Previous lead in the list">${icon('chevronUp')}</button><span class="muted small">${pos + 1} of ${ids.length}</span><button class="icon-btn" data-lm="next" ${pos >= ids.length - 1 ? 'disabled' : ''} title="Next lead in the list">${icon('chevronDown')}</button></span>` : ''}<button class="icon-btn" data-lm="menu" title="More actions">${icon('more')}</button><button class="icon-btn" data-close title="Close">${icon('close')}</button></div></div>
      <div class="iv-cols"><div class="iv-main">
        <input class="rec-title" data-lf="title" value="${esc(l.title)}" spellcheck="false">
        <div class="lead-tagrow">${(l.tags || []).map(x => tagChip(x, { x: true })).join('')}<button class="btn subtle sm" data-lm="tags">${icon('plus', 12)} Tag</button></div>
        ${l.junk ? `<div class="follow-banner junk">${icon('close', 14)}<span class="grow">This lead is in Junk leads. It's left out of the pipeline and every other view.</span><button class="btn subtle sm" data-lm="junk">Restore</button></div>` : ''}
        ${l.followUp && isOpenLead(l) ? `<div class="follow-banner ${followClass(l)}">${icon('bell', 14)}<span class="grow">Follow-up ${l.followUp < t ? `was due ${followText(l)}` : l.followUp === t ? `due today${l.followUpTime ? ` at ${fmtTime(l.followUpTime)}` : ''}` : `on ${followText(l)}`}</span><button class="btn subtle sm" data-lm="fusnooze">Move to tomorrow</button><button class="btn subtle sm" data-lm="fudone">${icon('check', 12)} Done</button></div>` : ''}
        <div class="stage-track">${s.stages.filter(x => x.cat !== 'lost').map((x, i) => `<button class="st-step ${x.id === l.stageId ? 'on' : ''} ${cur.cat !== 'lost' && i < idx ? 'past' : ''} ${STAGE_CLS[x.cat]}" data-set-stage="${x.id}" title="Move to ${esc(x.name)}"><span>${esc(x.name)}</span></button>`).join('')}
          ${cur.cat === 'lost' ? `<span class="lozenge cat-danger">${esc(cur.name)}</span>` : `<button class="btn subtle sm danger-text" data-set-stage="${(s.stages.find(x => x.cat === 'lost') || {}).id || ''}">Mark lost</button>`}</div>
        <div class="iv-toolbar wrap">
          <button class="btn" data-lm="quote">${icon('quote', 14)} Create quotation</button>
          <button class="btn" data-lm="meet">${icon('video', 14)} Schedule meeting</button>
          ${c ? '' : `<button class="btn" data-lm="convert">${icon('building', 14)} Convert to client</button>`}
          ${sp ? `<a class="btn" href="#/space/${encodeURIComponent(sp.key)}/board" data-close>${spaceAvatar(sp, 16)} Open project space</a>` : `<button class="btn" data-lm="space">${icon('spaces', 14)} Create project space</button>`}
        </div>
        <div class="iv-section"><h3>Requirement</h3><textarea class="input" rows="4" data-lf="requirement" placeholder="Flow rate, dose, site conditions, scope…">${esc(l.requirement || '')}</textarea></div>
        <div class="iv-section"><div class="sec-head"><h3>${icon('quote')} Quotations <span class="count">${quotes.length}</span></h3><button class="btn subtle sm" data-lm="quote">${icon('plus', 12)} New</button></div>
          ${quotes.length ? `<div class="child-list">${quotes.map(qx => `<div class="child-row" data-rec="quote:${qx.id}">${icon('quote', 14)}<span class="key">${esc(qx.no)}</span><span class="grow ellip muted small">${fmtDate(qx.date)}</span><b class="small">${money(lineTotals(qx).total, qx.currency)}</b>${quotePill(qx)}</div>`).join('')}</div>` : '<p class="muted small">No quotations yet.</p>'}</div>
        <div class="iv-section"><div class="sec-head"><h3>${icon('video')} Meetings &amp; visits <span class="count">${meets.length}</span></h3><button class="btn subtle sm" data-lm="meet">${icon('plus', 12)} Schedule</button></div>
          ${meets.length ? `<div class="child-list">${meets.map(x => `<div class="child-row" data-rec="meeting:${x.id}">${icon(x.kind === 'visit' ? 'pin' : 'video', 14)}<span class="grow ellip">${esc(x.title)}</span><span class="muted small">${fmtDate(x.date)} ${fmtTime(x.time)}</span>${meetPill(x)}</div>`).join('')}</div>` : '<p class="muted small">Nothing scheduled.</p>'}</div>
        <div class="iv-section"><div class="sec-head"><h3>${icon('calc')} Calculations <span class="count">${calcs.length}</span></h3><button class="btn subtle sm" data-lm="calc">${icon('plus', 12)} New</button></div>
          ${calcs.length ? `<div class="child-list">${calcs.map(x => `<a class="child-row" href="#/app/tools/${x.type}?load=${x.id}" data-close>${icon('calc', 14)}<span class="grow ellip">${esc(x.name)}</span>${x.headline ? `<span class="muted small ellip">${esc(x.headline)}</span>` : ''}<span class="muted small">${fmtDate(x.at)}</span></a>`).join('')}</div>` : '<p class="muted small">No sizing calculations yet.</p>'}</div>
        ${[['call', 'phone', 'Calls', 'No calls logged yet.'], ['email', 'mail', 'Emails', 'No emails logged yet.']].map(([k, ic, name, none]) => { const xs = l.log.filter(x => x.note && x.kind === k); return `<div class="iv-section"><div class="sec-head"><h3>${icon(ic)} ${name} <span class="count">${xs.length}</span></h3><span class="row gap8">${k === 'email' && l.contact.email ? `<a class="btn subtle sm" href="mailto:${esc(l.contact.email)}">${icon('mail', 12)} Send</a>` : ''}${k === 'call' && l.contact.phone ? `<a class="btn subtle sm" href="tel:${esc(l.contact.phone)}">${icon('phone', 12)} Call</a>` : ''}<button class="btn subtle sm" data-lm="log-${k}">${icon('plus', 12)} Log ${k}</button></span></div>
          ${xs.length ? `<div class="child-list">${xs.map(x => `<div class="child-row act-row-sm">${icon(ic, 14)}<span class="grow ellip-col"><span class="ellip" title="${esc(x.text)}">${esc(x.text)}</span>${fuOfChip(x)}</span>${fuDoneChip(x) || fuChip(x)}${avatar(x.user, 20)}<span class="muted small">${fmtDateTime(x.at)}</span></div>`).join('')}</div>` : `<p class="muted small">${none}</p>`}</div>`; }).join('')}
        ${sp ? `<div class="iv-section"><h3>${icon('spaces')} Project space</h3>${spaceProgressRow(sp)}</div>` : ''}
        <div class="iv-section"><div class="sec-head"><h3>Activity</h3><div class="seg">${[['all', 'All'], ['notes', 'Notes & calls'], ['email', 'Email'], ['emailcalls', 'Email & calls'], ['changes', 'Changes']].map(([k, n]) => `<button class="${hf === k ? 'on' : ''}" data-hf="${k}">${n}</button>`).join('')}</div></div>
          <div class="comment-new">${avatar(Store.state.me, 32)}<div class="grow"><div class="seg act-kind">${Object.entries(KINDS).map(([k, [ic, n]]) => `<button class="${akind === k ? 'on' : ''}" data-akind="${k}">${icon(ic, 13)}&nbsp;${n}</button>`).join('')}</div>
            <textarea class="input" rows="2" placeholder="${esc(KINDS[akind][2])}" data-note></textarea>
            <div class="comment-actions"><label class="row gap8 small muted fu-pick">Next follow-up <input class="input sm-in" type="date" data-note-fu value=""><input class="input sm-in fu-time" type="time" data-note-fut title="Time (optional)"></label><span class="grow"></span><button class="btn primary sm" data-lm="note">Save ${KINDS[akind][1].toLowerCase()}</button></div></div></div>
          ${hist.map(x => { const kd = x.note && KINDS[x.kind || 'note']; return `<div class="hist ${x.note ? 'is-note' : ''}" data-log-id="${x.id}">${avatar(x.user, 24)}<div class="grow"><b>${esc(personName(x.user, ''))}</b> ${x.note ? (x.kind && x.kind !== 'note' ? `<span class="act-tag">${icon(kd[0], 12)} logged ${{ call: 'a call', email: 'an email', visit: 'a visit' }[x.kind]}</span>` : '') : esc(x.text)}${x.note ? `${fuOfChip(x)}<div class="note-body">${esc(x.text)}</div>` : ''}<div class="muted small row gap8">${timeAgo(x.at)}${fuChip(x)}${fuDoneChip(x)}</div></div></div>`; }).join('')}
          ${!hist.length ? '<p class="muted small">Nothing here yet.</p>' : ''}</div>
      </div>
      <div class="iv-side">
        <details class="details-box" open><summary>Details ${icon('chevronDown')}</summary><div class="dl">
          <span class="dt">Stage</span><span class="dd"><button class="field-btn" data-lm="stage">${stagePill(l)}</button></span>
          <span class="dt">Value</span><span class="dd"><input class="input sm-in" type="number" min="0" step="1000" data-lf="value" value="${Number(l.value) || 0}"></span>
          <span class="dt">Priority</span><span class="dd">${selectHTML('priority', LEAD_PRIORITIES.map(p => ({ value: p.id, label: p.name })), l.priority, { cls: 'sm-in', attrs: 'data-lf="priority"' })}</span>
          <span class="dt">Owner</span><span class="dd">${selectHTML('owner', userOptions(), l.owner, { blank: 'Unassigned', cls: 'sm-in', attrs: 'data-lf="owner"' })}</span>
          <span class="dt">Close date</span><span class="dd"><input class="input sm-in" type="date" data-lf="expected" value="${esc(l.expected || '')}"></span>
          <span class="dt">Follow-up</span><span class="dd"><input class="input sm-in ${followClass(l)}" type="date" data-lf="followUp" value="${esc(l.followUp || '')}"></span>
          <span class="dt">Follow-up time</span><span class="dd"><input class="input sm-in" type="time" data-lf="followUpTime" value="${esc(l.followUpTime || '')}" ${l.followUp ? '' : 'disabled'} title="${l.followUp ? 'Optional' : 'Set a follow-up date first'}"></span>
          <span class="dt">Source</span><span class="dd">${selectHTML('source', s.sources, l.source, { blank: '—', cls: 'sm-in', attrs: 'data-lf="source"' })}</span>
          <span class="dt">Industry</span><span class="dd">${selectHTML('industry', s.industries, l.industry, { blank: '—', cls: 'sm-in', attrs: 'data-lf="industry"' })}</span>
          <span class="dt">Type</span><span class="dd">${selectHTML('type', ['System', 'Spare', 'Service'], l.type, { cls: 'sm-in', attrs: 'data-lf="type"' })}</span>
        </div></details>
        <details class="details-box" open><summary>Company &amp; contact ${icon('chevronDown')}</summary><div class="dl">
          <span class="dt">Company</span><span class="dd">${c ? `<a class="rec-chip" href="#/app/crm/clients/${c.id}" data-close>${icon('building', 12)} ${esc(c.name)}</a>` : `<input class="input sm-in" data-lf="company" value="${esc(l.company)}">`}</span>
          <span class="dt">Contact</span><span class="dd"><input class="input sm-in" data-lc="name" value="${esc(l.contact.name)}" placeholder="Name"></span>
          <span class="dt">Phone</span><span class="dd row gap8"><input class="input sm-in" data-lc="phone" value="${esc(l.contact.phone)}">${l.contact.phone ? `<a class="icon-btn xs" href="tel:${esc(l.contact.phone)}" title="Call">${icon('phone', 14)}</a>` : ''}${wa.length >= 10 ? `<a class="icon-btn xs" href="https://wa.me/${wa.length === 10 ? '91' + wa : wa}" target="_blank" rel="noopener" title="WhatsApp">${icon('comment', 14)}</a>` : ''}</span>
          <span class="dt">Email</span><span class="dd row gap8"><input class="input sm-in" data-lc="email" value="${esc(l.contact.email)}">${l.contact.email ? `<a class="icon-btn xs" href="mailto:${esc(l.contact.email)}" title="Email">${icon('mail', 14)}</a>` : ''}</span>
          <span class="dt">City</span><span class="dd"><input class="input sm-in" data-lf="city" value="${esc(l.city || '')}" placeholder="${esc(leadCity(l) || 'City')}"></span>
        </div></details>
        <div class="iv-meta muted small"><div>Created ${fmtDateTime(l.created)}</div><div>Last activity ${timeAgo(l.updated)}</div></div>
      </div></div></div>`;
  };
  m = openModal({ title: null, body: '', width: 1080, cls: 'item-modal rec-modal', onMount(el) { m = { el }; }, onClose: () => offChange(redraw) });
  draw();
  const el = m.el;
  const save = () => { l.updated = nowISO(); Store.save(); draw(); };
  el.addEventListener('change', ev => {
    const f = ev.target.dataset.lf, cf = ev.target.dataset.lc;
    if (f) {
      let v = ev.target.value;
      if (f === 'value') v = Number(v) || 0;
      if (f === 'title' && !v.trim()) { ev.target.value = l.title; return; }
      if (f === 'expected' || f === 'owner' || f === 'followUp' || f === 'followUpTime') v = v || null;
      if (f === 'city') v = v.trim();
      if (JSON.stringify(l[f]) === JSON.stringify(v)) return;
      if (f === 'owner') { setLeadOwner(l, v); save(); return; }
      const label = { title: 'title', value: 'value', priority: 'priority', expected: 'close date', source: 'source', industry: 'industry', type: 'type', company: 'company', requirement: 'requirement', city: 'city' }[f];
      l[f] = v;
      if (f === 'followUp' && !v) l.followUpTime = null;
      leadLog(l, f === 'value' ? `set the value to ${money(v)}` : f === 'followUp' || f === 'followUpTime' ? (l.followUp ? `set the follow-up to ${followText(l)}` : 'cleared the follow-up') : `updated the ${label}`);
      save();
    }
    if (cf) { l.contact[cf] = ev.target.value; leadLog(l, `updated the contact ${cf}`); save(); }
  });
  el.addEventListener('click', async ev => {
    const td = ev.target.closest('[data-tag-del]');
    if (td) { const tg = td.dataset.tagDel; l.tags = (l.tags || []).filter(x => x !== tg); leadLog(l, `removed the tag ${tg}`); save(); return; }
    const ak = ev.target.closest('[data-akind]');
    if (ak) { akind = ak.dataset.akind; $$('[data-akind]', el).forEach(x => x.classList.toggle('on', x === ak)); el.querySelector('[data-note]').placeholder = KINDS[akind][2]; el.querySelector('[data-lm="note"]').textContent = `Save ${KINDS[akind][1].toLowerCase()}`; return; }
    const gl = ev.target.closest('[data-goto-log]');
    if (gl) {
      const id = gl.dataset.gotoLog;
      if (!el.querySelector(`[data-log-id="${id}"]`)) { hf = 'all'; draw(); }
      const row = el.querySelector(`[data-log-id="${id}"]`);
      if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); }
      return;
    }
    const hb = ev.target.closest('[data-hf]');
    if (hb) { hf = hb.dataset.hf; draw(); return; }
    const st = ev.target.closest('[data-set-stage]');
    if (st && st.dataset.setStage) { moveLeadStage(l, st.dataset.setStage, draw); return; }
    const b = ev.target.closest('[data-lm]');
    if (!b) return;
    const a = b.dataset.lm;
    if (a === 'stage') leadStageMenu(b, l, draw);
    if (a === 'note') {
      const t = el.querySelector('[data-note]').value.trim(), fu = el.querySelector('[data-note-fu]').value, fut = el.querySelector('[data-note-fut]').value || null;
      if (!t && !fu) return;
      if (t) logLeadActivity(l, akind, t, fu, fut);
      else if (fu !== l.followUp || fut !== (l.followUpTime || null)) { l.followUp = fu; l.followUpTime = fut; leadLog(l, `set the follow-up to ${followText(l)}`); }
      save();
    }
    if (a === 'prev' || a === 'next') { const ids = APP_UI['crm.leads'].ids, i = ids.indexOf(l.id) + (a === 'prev' ? -1 : 1); if (ids[i] && lead(ids[i])) { m.close(); openLead(ids[i]); } return; }
    if (a === 'tags') leadTagPop(b, [l]);
    if (a === 'junk') { l.junk = !l.junk; leadLog(l, l.junk ? 'marked this lead as junk' : 'restored this lead from junk'); save(); toast(l.junk ? `LD-${l.no} moved to Junk leads` : `LD-${l.no} restored`); }
    if (a === 'fudone') openFollowUpDone(l, save);
    if (a === 'fusnooze') { l.followUp = addDays(todayStr(), 1); leadLog(l, `moved the follow-up to ${followText(l)}`); save(); }
    if (a === 'convert') { if (!l.company.trim()) { toast('Add a company name first', 'error'); return; } convertLeadToClient(l); save(); }
    if (a === 'quote') openQuote(null, { leadId: l.id, clientId: l.clientId });
    if (a === 'meet') openMeeting(null, { leadId: l.id, clientId: l.clientId, title: `Discussion – ${l.company}` });
    if (a === 'calc' && !appEnabled(appById('tools'))) { toast('Turn on the Calculators app first (Manage apps)', 'error'); return; }
    if (a === 'calc') menu(b, appById('tools').tabs.filter(x => !['summary', 'saved'].includes(x.id)).map(x => ({ value: x.id, label: esc(x.name), icon: icon(x.icon) })), v => { closeAllModals(); location.hash = `#/app/tools/${v}?lead=${l.id}`; });
    if (a === 'log-call' || a === 'log-email') {
      akind = a.slice(4); draw();
      const ta = el.querySelector('[data-note]'); ta.scrollIntoView({ block: 'center', behavior: 'smooth' }); ta.focus();
    }
    if (a === 'space') openProjectSpaceFromLead(l);
    if (a === 'menu') {
      menu(b, [{ value: 'copy', label: 'Copy link', icon: icon('link') }, { value: 'dup', label: 'Duplicate lead', icon: icon('copy') }, { value: 'junk', label: l.junk ? 'Not junk — restore' : 'Mark as junk', icon: icon(l.junk ? 'refresh' : 'close') }, '-', { value: 'del', label: 'Delete lead', icon: icon('trash'), danger: true }], async v => {
        if (v === 'junk') { l.junk = !l.junk; leadLog(l, l.junk ? 'marked this lead as junk' : 'restored this lead from junk'); save(); toast(l.junk ? `LD-${l.no} moved to Junk leads` : `LD-${l.no} restored`); }
        if (v === 'copy') { navigator.clipboard && navigator.clipboard.writeText(location.href.split('#')[0] + '#/app/crm/leads'); toast('Link copied'); }
        if (v === 'dup') { const n = newLead({ ...JSON.parse(JSON.stringify(l)), id: undefined, no: undefined, log: [], spaceId: null, stageAt: null, created: nowISO(), updated: nowISO(), title: l.title + ' (copy)' }); Store.save(); m.close(); openLead(n.id); }
        if (v === 'del' && await confirmDialog({ title: `Delete LD-${l.no}?`, message: 'The lead and its notes are deleted. Quotations and meetings linked to it are kept.' })) {
          deleteLeads([l]); Store.save(); m.close(); toast('Lead deleted');
        }
      }, { align: 'right' });
    }
  });
  // re-draw when something else (a quote, a meeting) changes underneath
  function redraw() { if (document.body.contains(el) && !el.contains(document.activeElement)) draw(); }
  Store.onChange(redraw);
}
function spaceProgressRow(sp) {
  const p = spaceProgress(sp);
  const pct = p.n ? Math.round(p.done / p.n * 100) : 0;
  return `<a class="space-prog" href="#/space/${encodeURIComponent(sp.key)}/summary" data-close>${spaceAvatar(sp, 24)}<div class="grow"><div class="row gap8"><b class="ellip">${esc(sp.name)}</b><span class="muted small">${p.open} open · ${p.done}/${p.n} done</span></div>
    <div class="progress"><span style="width:${pct}%"></span></div></div><span class="small">${pct}%</span></a>`;
}

function openProjectSpaceFromLead(l, { clientId } = {}) {
  const c = client(clientId || l && l.clientId);
  const baseName = l ? lfLeadSpaceName(l) : c ? `${c.name} project` : 'New project';
  const words = (l ? l.company : c ? c.name : 'Project').split(/\s+/).filter(Boolean);
  const folder = l ? lfLeadFolder(l) : null;
  const ftpl = lfFolderTemplate(folder, l);
  openModal({
    title: 'Create project space', width: 520,
    body: `<p class="muted">A Taskspace space for delivering this work. It stays linked to ${esc(c ? c.name : l ? l.company : 'the client')}, so progress shows up in CRM.</p>
      <label class="field"><span class="field-label">Name <span class="req">*</span></span><input class="input" name="name" value="${esc(baseName.slice(0, 60))}" autofocus></label>
      <label class="field"><span class="field-label">Key <span class="req">*</span></span><input class="input narrow" name="key" maxlength="10" value="${esc(l ? lfLeadSpaceKey(l.company) : uniqueSpaceKey(words.length > 1 ? words.map(w => w[0]).join('') : words[0].slice(0, 4)))}"></label>
      <label class="field"><span class="field-label">Start from a template</span><select class="input" name="ttpl"><option value="">Blank (To Do → In Progress → Done)</option>${Store.state.taskTemplates.map(t => `<option value="${t.id}" ${ftpl && ftpl.id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        <span class="field-help">${ftpl ? `The ${esc(folder.name)} folder's template for ${esc(l.type || 'System')} leads. The space goes into that folder.` : Store.state.taskTemplates.length ? 'Stages, tasks and rules come from the template.' : 'Tip: save a space as a template to reuse your delivery stages here.'}</span></label>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Create space</button>',
    onMount(el, api) {
      const key = el.querySelector('[name=key]');
      key.addEventListener('input', () => { key.value = key.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const n = el.querySelector('[name=name]').value.trim(), k = key.value.trim();
        if (!n) { el.querySelector('[name=name]').classList.add('invalid'); return; }
        if (!k || Store.spaceByKey(k)) { key.classList.add('invalid'); toast(k ? 'That key is already in use' : 'Enter a key', 'error'); return; }
        let cl = c;
        if (!cl && l && l.company) cl = convertLeadToClient(l, true);
        const sp = Store.createSpace({ name: n, key: k, color: SPACE_COLORS[Math.floor(Math.random() * SPACE_COLORS.length)], glyph: 'rocket' });
        sp.clientId = cl ? cl.id : null;
        if (folder) sp.folderId = folder.id;
        if (l) leadLog(l, `created project space ${sp.name}`);
        lfSetupLeadSpace(sp, l, Store.state.taskTemplates.find(t => t.id === el.querySelector('[name=ttpl]').value));
        erpLog('crm', `created project space ${sp.name}`, cl ? { type: 'client', id: cl.id } : null);
        Store.save();
        api.close(); closeAllModals();
        toast(`Space "${sp.name}" created`);
        location.hash = `#/space/${encodeURIComponent(sp.key)}/board`;
      });
    },
  });
}

/* ---------------- Clients ---------------- */
function crmClients(root) {
  const vs = ui('crm.clients', { search: '', industry: '' });
  let list = erp().clients.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (vs.search) { const x = vs.search.toLowerCase(); list = list.filter(c => `${c.name} ${c.city} ${c.gst} ${c.contacts.map(k => k.name).join(' ')}`.toLowerCase().includes(x)); }
  if (vs.industry) list = list.filter(c => c.industry === vs.industry);
  root.innerHTML = `<div class="wide-page">
    <div class="toolbar"><div class="search-sm">${icon('search')}<input placeholder="Search clients" value="${esc(vs.search)}" data-cv="search" data-keep="cl-search"></div>
      ${selectHTML('industry', erpSet('crm').industries, vs.industry, { blank: 'All industries', cls: 'sm-select', attrs: 'data-cv="industry"' })}<span class="grow"></span>
      <button class="btn subtle sm" data-cl-csv>${icon('download', 14)} CSV</button></div>
    <div class="table-wrap"><table class="grid"><thead><tr><th>Client</th><th style="width:150px">Industry</th><th style="width:150px">City</th><th style="width:190px">Primary contact</th><th style="width:100px">Open leads</th><th style="width:120px">Pipeline</th><th style="width:120px">Invoiced</th><th style="width:120px">Outstanding</th><th style="width:100px">Spaces</th></tr></thead>
    <tbody>${list.map(c => { const t = clientTotals(c); const ct = c.contacts[0] || {}; return `<tr class="row-link" data-href="#/app/crm/clients/${c.id}"><td><span class="cell-in">${clientAvatar(c, 28)} <b class="ellip">${esc(c.name)}</b></span></td><td>${esc(c.industry || '—')}</td><td>${esc(c.city || '—')}</td>
      <td><span class="ellip">${esc(ct.name || '—')}</span></td><td>${clientLeads(c).filter(isOpenLead).length}</td><td class="num">${moneyShort(t.pipeline)}</td><td class="num">${moneyShort(t.invoiced)}</td><td class="num ${t.outstanding ? 'warn-text' : ''}">${moneyShort(t.outstanding)}</td><td>${clientSpaces(c).length}</td></tr>`; }).join('')}</tbody></table>
    ${!list.length ? emptyState({ title: vs.search ? 'No clients match' : 'No clients yet', text: 'Clients are created when you convert a lead, or add one yourself.', art: 'building', action: '<button class="btn primary" data-new-client>New client</button>' }) : ''}</div>
    <div class="list-foot"><span>${list.length} client${list.length === 1 ? '' : 's'}</span></div></div>`;
  root.addEventListener('input', e => { if (e.target.dataset.cv === 'search') { vs.search = e.target.value; render(); } });
  root.addEventListener('change', e => { if (e.target.dataset.cv === 'industry') { vs.industry = e.target.value; render(); } });
  root.addEventListener('click', e => {
    if (e.target.closest('[data-new-client]')) openClientModal();
    if (e.target.closest('[data-cl-csv]')) downloadCSV(`clients-${todayStr()}.csv`, [['Client', 'Industry', 'Type', 'GSTIN', 'City', 'State', 'Contact', 'Phone', 'Email'], ...list.map(c => { const ct = c.contacts[0] || {}; return [c.name, c.industry, c.type, c.gst, c.city, c.state, ct.name, ct.phone, ct.email]; })]);
    const tr = e.target.closest('[data-href]'); if (tr) location.hash = tr.dataset.href;
  });
}

function openClientModal(c = null, onDone) {
  const s = erpSet('crm'), x = c || { name: '', industry: '', type: 'Direct user', gst: '', website: '', address: '', city: '', state: '', country: 'India', contacts: [{ name: '', phone: '', email: '' }] };
  const ct = x.contacts[0] || {};
  openModal({
    title: c ? 'Edit client' : 'New client', width: 620, cls: 'create-modal',
    body: `<label class="field"><span class="field-label">Company name <span class="req">*</span></span><input class="input" name="name" value="${esc(x.name)}" autofocus></label>
      <div class="form-grid">
        <label class="field"><span class="field-label">Industry</span>${selectHTML('industry', s.industries, x.industry, { blank: 'Choose…' })}</label>
        <label class="field"><span class="field-label">Client type</span>${selectHTML('type', CLIENT_TYPES, x.type)}</label>
        <label class="field"><span class="field-label">GSTIN</span><input class="input" name="gst" value="${esc(x.gst)}" maxlength="15"></label>
        <label class="field"><span class="field-label">Website</span><input class="input" name="website" value="${esc(x.website)}" placeholder="https://"></label>
      </div>
      <label class="field"><span class="field-label">Address</span><textarea class="input" rows="2" name="address">${esc(x.address)}</textarea></label>
      <div class="form-grid three"><label class="field"><span class="field-label">City</span><input class="input" name="city" value="${esc(x.city)}"></label>
        <label class="field"><span class="field-label">State</span><input class="input" name="state" value="${esc(x.state)}"></label>
        <label class="field"><span class="field-label">Country</span><input class="input" name="country" value="${esc(x.country)}"></label></div>
      ${c ? '' : `<h4>Primary contact</h4><div class="form-grid three"><label class="field"><span class="field-label">Name</span><input class="input" name="cname" value="${esc(ct.name || '')}"></label>
        <label class="field"><span class="field-label">Phone</span><input class="input" name="cphone" value="${esc(ct.phone || '')}"></label><label class="field"><span class="field-label">Email</span><input class="input" name="cemail" value="${esc(ct.email || '')}"></label></div>`}`,
    footer: `<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>${c ? 'Save' : 'Create client'}</button>`,
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el);
        if (!f.name.trim()) { el.querySelector('[name=name]').classList.add('invalid'); return; }
        const dupe = erp().clients.find(k => k !== c && k.name.trim().toLowerCase() === f.name.trim().toLowerCase());
        if (dupe) { toast('A client with that name already exists', 'error'); return; }
        const data = { name: f.name.trim(), industry: f.industry, type: f.type, gst: f.gst.trim().toUpperCase(), website: f.website, address: f.address, city: f.city, state: f.state, country: f.country };
        let res = c;
        if (c) { Object.assign(c, data); erpLog('crm', `updated client ${c.name}`, { type: 'client', id: c.id }); }
        else res = newClient({ ...data, contacts: [{ name: f.cname, phone: f.cphone, email: f.cemail }] });
        // keep leads' company names in step with the client
        erp().leads.forEach(ld => { if (ld.clientId === res.id) ld.company = res.name; });
        Store.save(); api.close(); toast(c ? 'Client saved' : `${res.name} added`);
        if (onDone) onDone(res); else if (!c) location.hash = `#/app/crm/clients/${res.id}`;
      });
    },
  });
}

function clientPage(root, id) {
  const c = client(id);
  if (!c) { root.innerHTML = emptyState({ title: 'Client not found', text: 'It may have been deleted.', art: 'building', action: '<a class="btn" href="#/app/crm/clients">Back to clients</a>' }); return; }
  touchRecord('client', id);
  const t = clientTotals(c);
  const leads = clientLeads(c).sort((a, b) => b.updated.localeCompare(a.updated));
  const meets = erp().meetings.filter(m => m.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const spaces = clientSpaces(c);
  const docs = [...t.quotes.map(q => ({ kind: 'quote', d: q })), ...erp().invoices.filter(i => i.clientId === c.id).map(i => ({ kind: 'invoice', d: i }))].sort((a, b) => b.d.date.localeCompare(a.d.date));
  const leadIds = new Set(leads.map(l => l.id));
  const acts = erp().log.filter(x => x.ref && ((x.ref.type === 'client' && x.ref.id === c.id) || (x.ref.type === 'lead' && leadIds.has(x.ref.id)) || (x.ref.type === 'quote' && t.quotes.some(q => q.id === x.ref.id)))).slice(0, 12);
  root.innerHTML = `<div class="client-page">
    <a class="back-link" href="#/app/crm/clients">${icon('arrowLeft')} Clients</a>
    <div class="cp-head">${clientAvatar(c, 56)}<div class="grow"><h2>${esc(c.name)}</h2><div class="row gap8 muted small wrap">${c.industry ? `<span class="tag">${esc(c.industry)}</span>` : ''}<span>${esc(c.type)}</span>${c.city ? `<span>· ${icon('pin', 12)} ${esc([c.city, c.state].filter(Boolean).join(', '))}</span>` : ''}<span>· Client since ${fmtDate(c.created)}</span></div></div>
      <div class="row gap8 wrap"><button class="btn" data-cp="lead">${icon('funnel', 14)} New lead</button><button class="btn" data-cp="quote">${icon('quote', 14)} New quotation</button><button class="btn" data-cp="meet">${icon('video', 14)} Schedule</button>
        <button class="btn" data-cp="edit">${icon('edit', 14)} Edit</button><button class="icon-btn bordered" data-cp="menu">${icon('more')}</button></div></div>
    <div class="stat-row">
      ${statCard('funnel', moneyShort(t.pipeline), 'Open pipeline', `${leads.filter(isOpenLead).length} open lead${leads.filter(isOpenLead).length === 1 ? '' : 's'}`)}
      ${statCard('quote', moneyShort(t.quoted), 'Quoted', `${t.quotes.length} quotation${t.quotes.length === 1 ? '' : 's'}`)}
      ${statCard('receipt', moneyShort(t.invoiced), 'Invoiced', `${t.invs.length} invoice${t.invs.length === 1 ? '' : 's'}`, { tone: 'good' })}
      ${statCard('wallet', moneyShort(t.outstanding), 'Outstanding', t.outstanding ? 'Waiting for payment' : 'All settled', { tone: t.outstanding ? 'warn' : '' })}
    </div>
    <div class="sum-grid">
      ${panel('Details', '', `<div class="dl flat">
        <span class="dt">GSTIN</span><span class="dd">${esc(c.gst || '—')}</span>
        <span class="dt">Address</span><span class="dd pre">${esc([c.address, [c.city, c.state].filter(Boolean).join(', '), c.country].filter(Boolean).join('\n') || '—')}</span>
        <span class="dt">Website</span><span class="dd">${c.website ? `<a class="link" href="${esc(c.website)}" target="_blank" rel="noopener">${esc(c.website)}</a>` : '—'}</span>
        <span class="dt">Account owner</span><span class="dd">${selectHTML('owner', userOptions(), c.owner, { cls: 'sm-in', attrs: 'data-cf="owner"' })}</span></div>`)}
      ${panel('Contacts', 'People you talk to at this company.', `<div class="contact-list">${c.contacts.map((k, i) => `<div class="contact-row">${avatarLetter(k.name)}<div class="grow"><b>${esc(k.name || 'Unnamed')}</b><div class="muted small">${[k.phone, k.email].filter(Boolean).map(esc).join(' · ') || 'No details'}</div></div>
          ${k.phone ? `<a class="icon-btn xs" href="tel:${esc(k.phone)}" title="Call">${icon('phone', 14)}</a>` : ''}${k.email ? `<a class="icon-btn xs" href="mailto:${esc(k.email)}" title="Email">${icon('mail', 14)}</a>` : ''}<button class="icon-btn xs" data-ct-del="${i}" title="Remove">${icon('trash', 14)}</button></div>`).join('') || '<p class="muted small">No contacts yet.</p>'}</div>
        <div class="contact-add"><input class="input" placeholder="Name" data-ct="name"><input class="input" placeholder="Phone" data-ct="phone"><input class="input" placeholder="Email" data-ct="email"><button class="btn" data-ct-add>${icon('plus', 14)}</button></div>`)}
      ${panel('Leads', 'Every opportunity with this client.', leads.length ? `<div class="mini-list">${leads.map(l => `<div class="mini-row" data-rec="lead:${l.id}">${icon('funnel')}<span class="key">LD-${l.no}</span><span class="ellip grow">${esc(l.title)}</span><b class="small">${moneyShort(l.value)}</b>${stagePill(l)}</div>`).join('')}</div>` : miniEmpty('No leads yet.'), { action: '<button class="btn subtle sm" data-cp="lead">+ Lead</button>' })}
      ${panel('Quotations & invoices', 'Documents sent to this client.', docs.length ? `<div class="mini-list">${docs.map(x => `<div class="mini-row" data-rec="${x.kind}:${x.d.id}">${icon(x.kind === 'quote' ? 'quote' : 'receipt')}<span class="key">${esc(x.d.no)}</span><span class="grow muted small">${fmtDate(x.d.date)}</span><b class="small">${money(lineTotals(x.d).total, x.d.currency)}</b>${x.kind === 'quote' ? quotePill(x.d) : invoicePill(x.d)}</div>`).join('')}</div>` : miniEmpty('Nothing sent yet.'), { action: '<button class="btn subtle sm" data-cp="quote">+ Quotation</button>' })}
      ${panel('Project spaces', 'Delivery work in Taskspace.', spaces.length ? spaces.map(spaceProgressRow).join('') : miniEmpty('No project space yet. Create one to plan delivery with tasks, a board and a timeline.'), { action: '<button class="btn subtle sm" data-cp="space">+ Space</button>' })}
      ${panel('Meetings & site visits', '', meets.length ? `<div class="mini-list">${meets.slice(0, 8).map(x => `<div class="mini-row" data-rec="meeting:${x.id}">${icon(x.kind === 'visit' ? 'pin' : 'video')}<span class="ellip grow">${esc(x.title)}</span><span class="muted small">${fmtDate(x.date)}</span>${meetPill(x)}</div>`).join('')}</div>` : miniEmpty('No meetings yet.'), { action: '<button class="btn subtle sm" data-cp="meet">+ Schedule</button>' })}
      ${panel('Notes', 'Anything worth remembering about this account.', `<textarea class="input" rows="5" data-cf="notes" placeholder="Payment habits, decision makers, site access…">${esc(c.notes || '')}</textarea>`)}
      ${panel('Activity', '', acts.length ? `<div class="activity">${acts.map(a => `<div class="act-row">${avatar(a.user, 24)}<div class="grow"><b>${esc(personName(a.user, ''))}</b> ${esc(a.text)}<div class="muted small">${timeAgo(a.at)}</div></div></div>`).join('')}</div>` : miniEmpty('No activity yet.'))}
    </div></div>`;
  root.addEventListener('change', e => {
    const f = e.target.dataset.cf;
    if (f) { c[f] = e.target.value; Store.save(true); toast('Saved'); }
  });
  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-ct-del]');
    if (del) { c.contacts.splice(Number(del.dataset.ctDel), 1); Store.save(); return; }
    if (e.target.closest('[data-ct-add]')) {
      const v = k => root.querySelector(`[data-ct="${k}"]`).value.trim();
      if (!v('name') && !v('phone') && !v('email')) return;
      c.contacts.push({ name: v('name'), phone: v('phone'), email: v('email') }); Store.save(); toast('Contact added'); return;
    }
    const b = e.target.closest('[data-cp]');
    if (!b) return;
    const a = b.dataset.cp;
    if (a === 'lead') openLeadCreate({ clientId: c.id });
    if (a === 'quote') openQuote(null, { clientId: c.id });
    if (a === 'meet') openMeeting(null, { clientId: c.id, title: `Meeting – ${c.name}` });
    if (a === 'space') openProjectSpaceFromLead(null, { clientId: c.id });
    if (a === 'edit') openClientModal(c, () => render());
    if (a === 'menu') menu(b, [{ value: 'del', label: 'Delete client', icon: icon('trash'), danger: true }], async v => {
      if (v !== 'del') return;
      if (await confirmDialog({ title: `Delete ${c.name}?`, message: 'The client is removed. Its leads, quotations, invoices and spaces are kept but no longer linked to it.' })) {
        erp().clients = erp().clients.filter(x => x !== c);
        erp().leads.forEach(l => { if (l.clientId === c.id) l.clientId = null; });
        erp().meetings.forEach(m => { if (m.clientId === c.id) m.clientId = null; });
        Store.state.spaces.forEach(sp => { if (sp.clientId === c.id) sp.clientId = null; });
        erpLog('crm', `deleted client ${c.name}`); Store.save(); toast('Client deleted'); location.hash = '#/app/crm/clients';
      }
    }, { align: 'right' });
  });
}
function avatarLetter(name) {
  const c = { name: name || '?' };
  return clientAvatar(c, 32).replace('client-av', 'client-av round');
}

/* ---------------- Settings ---------------- */
function crmSettings(root, r) {
  const s = erpSet('crm');
  const stageOpts = () => s.stages.map(x => ({ value: x.id, label: x.name }));
  appSettingsPage(appById('crm'), root, r, [
    {
      id: 'pipeline', name: 'Pipeline stages', icon: 'funnel',
      html: () => `<h2>Pipeline stages</h2><p class="muted">The stages a lead moves through. Category decides whether a stage counts as open, won or lost in reports.</p>
        <div class="panel settings-panel"><table class="grid compact stage-table"><thead><tr><th style="width:36px"></th><th>Stage</th><th style="width:160px">Category</th><th style="width:90px">Leads</th><th style="width:80px"></th></tr></thead><tbody>
        ${s.stages.map((x, i) => `<tr><td><span class="stage-dot ${STAGE_CLS[x.cat]}"></span></td><td><input class="input sm-in" data-stg-name="${x.id}" value="${esc(x.name)}"></td>
          <td>${selectHTML('cat', [{ value: 'new', label: 'New' }, { value: 'open', label: 'Open' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }], x.cat, { cls: 'sm-in', attrs: `data-stg-cat="${x.id}"` })}</td>
          <td>${erp().leads.filter(l => l.stageId === x.id).length}</td>
          <td><button class="icon-btn xs" data-stg-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('chevronUp', 14)}</button><button class="icon-btn xs" data-stg-del="${x.id}" title="Delete">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table>
        <div class="le-add"><input class="input" placeholder="New stage name" data-stg-new><button class="btn" data-stg-add>${icon('plus', 14)} Add stage</button></div></div>`,
      bind(el) {
        const redraw = () => render();
        el.addEventListener('change', e => {
          const n = e.target.dataset.stgName, c = e.target.dataset.stgCat;
          if (n) { const v = e.target.value.trim(); if (!v) { render(); return; } s.stages.find(x => x.id === n).name = v; Store.save(true); toast('Saved'); }
          if (c) { s.stages.find(x => x.id === c).cat = e.target.value; Store.save(); toast('Saved'); }
        });
        el.addEventListener('click', async e => {
          const up = e.target.closest('[data-stg-up]'), del = e.target.closest('[data-stg-del]');
          if (up) { const i = Number(up.dataset.stgUp); [s.stages[i - 1], s.stages[i]] = [s.stages[i], s.stages[i - 1]]; Store.save(); }
          if (del) {
            if (s.stages.length <= 2) { toast('Keep at least two stages', 'error'); return; }
            const x = s.stages.find(k => k.id === del.dataset.stgDel);
            const n = erp().leads.filter(l => l.stageId === x.id).length;
            const to = s.stages.find(k => k !== x);
            if (await confirmDialog({ title: `Delete "${x.name}"?`, message: n ? `${n} lead${n === 1 ? '' : 's'} in this stage will move to "${esc(to.name)}".` : 'No leads are in this stage.' })) {
              erp().leads.forEach(l => { if (l.stageId === x.id) l.stageId = to.id; });
              s.stages = s.stages.filter(k => k !== x);
              ['quoteSentStage', 'quoteAcceptedStage'].forEach(k => { if (s[k] === x.id) s[k] = ''; });
              Store.save(); toast('Stage deleted');
            }
          }
          if (e.target.closest('[data-stg-add]')) add();
        });
        el.addEventListener('keydown', e => { if (e.target.matches('[data-stg-new]') && e.key === 'Enter') add(); });
        function add() { const v = el.querySelector('[data-stg-new]').value.trim(); if (!v) return; const wonIdx = s.stages.findIndex(x => x.cat === 'won'); s.stages.splice(wonIdx < 0 ? s.stages.length : wonIdx, 0, { id: uid('stg'), name: v, cat: 'open' }); Store.save(); toast('Stage added'); redraw(); }
      },
    },
    { id: 'sources', name: 'Lead sources', icon: 'bolt', html: () => `<h2>Lead sources</h2><p class="muted">Where leads come from. Used for the "Where leads come from" chart.</p><div class="panel settings-panel">${listEditorHTML('sources', s.sources, 'Add a source')}</div>`, bind: el => bindListEditor(el, () => s.sources, () => render()) },
    { id: 'industries', name: 'Industries', icon: 'building', html: () => `<h2>Industries</h2><p class="muted">Industries you sell into, for leads and clients.</p><div class="panel settings-panel">${listEditorHTML('industries', s.industries, 'Add an industry')}</div>`, bind: el => bindListEditor(el, () => s.industries, () => render()) },
    {
      id: 'tags', name: 'Tags', icon: 'star',
      html: () => `<h2>Tags</h2><p class="muted">Labels you put on leads — "Tender", "Hot", "Export". Filter, group and mass-tag by them from the leads list. Renaming or deleting a tag here changes every lead that has it.</p>
        <div class="panel settings-panel"><table class="grid compact"><thead><tr><th>Tag</th><th style="width:90px">Leads</th><th style="width:60px"></th></tr></thead><tbody>
        ${s.tags.map((x, i) => `<tr><td><div class="row gap8">${tagChip(x)}<input class="input sm-in" data-tag-name="${i}" value="${esc(x)}"></div></td><td>${erp().leads.filter(l => (l.tags || []).includes(x)).length}</td><td><button class="icon-btn xs" data-tag-rm="${i}" title="Delete">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table>
        ${s.tags.length ? '' : '<p class="muted small">No tags yet.</p>'}
        <div class="le-add"><input class="input" placeholder="New tag" data-tag-new><button class="btn" data-tag-add>${icon('plus', 14)} Add tag</button></div></div>`,
      bind(el) {
        el.addEventListener('change', e => {
          const i = e.target.dataset.tagName; if (i == null) return;
          const from = s.tags[i], to = e.target.value.trim();
          if (!to || to === from) { e.target.value = from; return; }
          if (s.tags.includes(to)) { toast('That tag already exists', 'error'); e.target.value = from; return; }
          s.tags[i] = to;
          erp().leads.forEach(l => { if ((l.tags || []).includes(from)) l.tags = l.tags.map(x => (x === from ? to : x)); });
          Store.save(); toast('Tag renamed');
        });
        el.addEventListener('click', async e => {
          const rm = e.target.closest('[data-tag-rm]');
          if (rm) {
            const x = s.tags[rm.dataset.tagRm], n = erp().leads.filter(l => (l.tags || []).includes(x)).length;
            if (!await confirmDialog({ title: `Delete tag "${x}"?`, message: n ? `It comes off ${n} lead${n === 1 ? '' : 's'}.` : 'No leads have it.' })) return;
            s.tags = s.tags.filter(t => t !== x);
            erp().leads.forEach(l => { if ((l.tags || []).includes(x)) l.tags = l.tags.filter(t => t !== x); });
            Store.save(); toast('Tag deleted');
          }
          if (e.target.closest('[data-tag-add]')) add();
        });
        el.addEventListener('keydown', e => { if (e.target.matches('[data-tag-new]') && e.key === 'Enter') add(); });
        function add() { const v = el.querySelector('[data-tag-new]').value.trim(); if (!v) return; if (s.tags.includes(v)) { toast('Already a tag', 'error'); return; } s.tags.push(v); Store.save(); toast('Tag added'); }
      },
    },
    {
      id: 'views', name: 'Custom views', icon: 'list',
      html: () => `<h2>Custom views</h2><p class="muted">Saved searches and filters for the leads list. Everyone sees them in the views menu and in the CRM sidebar. To make one, filter the leads list and choose <b>Save as view</b>.</p>
        <div class="panel settings-panel">${s.views.length ? `<table class="grid compact"><thead><tr><th>View</th><th style="width:110px">Filters</th><th style="width:160px">Made by</th><th style="width:90px"></th></tr></thead><tbody>
        ${s.views.map(v => `<tr><td><input class="input sm-in" data-cv-name="${v.id}" value="${esc(v.name)}"></td><td class="muted">${Object.keys(v.state.f || {}).length + (v.state.sys || []).length + (v.state.search ? 1 : 0)}</td><td><span class="cell-in">${avatar(v.by, 20)} ${esc(personName(v.by, '—'))}</span></td>
          <td><a class="icon-btn xs" href="#/app/crm/leads?cv=${v.id}" title="Open">${icon('arrowRight', 14)}</a><button class="icon-btn xs" data-cv-rm="${v.id}" title="Delete">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table>`
        : emptyState({ title: 'No custom views yet', text: 'Filter the leads list — by stage, source, tags, follow-ups — then save it as a view.', art: 'funnel', action: '<a class="btn" href="#/app/crm/leads">Go to leads</a>', small: true })}</div>`,
      bind(el) {
        el.addEventListener('change', e => { const id = e.target.dataset.cvName; if (!id) return; const v = s.views.find(x => x.id === id), n = e.target.value.trim(); if (!n) { e.target.value = v.name; return; } v.name = n; Store.save(); toast('Saved'); });
        el.addEventListener('click', async e => {
          const rm = e.target.closest('[data-cv-rm]'); if (!rm) return;
          const v = s.views.find(x => x.id === rm.dataset.cvRm);
          if (await confirmDialog({ title: `Delete view "${v.name}"?`, message: 'Only the saved view goes. No leads are deleted.' })) { s.views = s.views.filter(x => x !== v); Store.save(); toast('View deleted'); }
        });
      },
    },
    {
      id: 'automation', name: 'Automation', icon: 'bolt',
      html: () => `<h2>Automation</h2><p class="muted">Keep the pipeline up to date on its own as quotations move in the Sales app.</p>
        <div class="panel settings-panel">
          <label class="field"><span class="field-label">When a quotation is marked Sent, move its lead to</span>${selectHTML('qs', stageOpts(), s.quoteSentStage, { blank: 'Don’t move it', attrs: 'data-setting="crm.quoteSentStage"' })}</label>
          <label class="field"><span class="field-label">When a quotation is Accepted, move its lead to</span>${selectHTML('qa', stageOpts(), s.quoteAcceptedStage, { blank: 'Don’t move it', attrs: 'data-setting="crm.quoteAcceptedStage"' })}</label>
          <label class="toggle-row"><input type="checkbox" data-setting="crm.convertOnWin" ${s.convertOnWin ? 'checked' : ''}><span class="toggle"></span><span>When a lead is won, turn its company into a client automatically</span></label>
          <label class="toggle-row"><input type="checkbox" data-setting="crm.enforceStages" ${s.enforceStages !== false ? 'checked' : ''}><span class="toggle"></span><span>Leads move one stage at a time, with a note, call, email, visit, quotation or meeting in each stage — and a logged call or email before Contacted. New leads start in the first stage.</span></label>
          <label class="field" style="margin-top:12px"><span class="field-label">Flag open leads with no update for</span><div class="row gap8"><input class="input narrow" type="number" min="1" max="120" data-setting="crm.staleDays" value="${s.staleDays}"><span class="muted">days</span></div></label>
        </div>`,
    },
  ]);
}
