/* CRM leads list, modelled on Zoho CRM's list view: saved views, a "filter leads by" panel, inline edits,
   mass actions, group-by charts, tiles, pagination, CSV import, duplicate merge and print.
   The lead record itself (openLead) lives in app-crm.js. */

const LEAD_TYPES = ['System', 'Spare', 'Service'];
const TAG_COLORS = ['#669DF1', '#4BCE97', '#FCA700', '#F87168', '#C97CF4', '#42B2D7', '#E774BB', '#94C748'];
const SERIES = ['var(--series-1)', 'var(--series-2)', '#82B536', '#C97CF4', '#42B2D7', '#E774BB', '#FCA700', '#8C8F97'];
const LEAD_COLS_DEFAULT = ['company', 'stage', 'value', 'priority', 'source', 'owner', 'expected', 'created'];

/* ---------------- lead helpers ---------------- */
function tagChip(t, { x = false } = {}) {
  const h = [...t].reduce((a, c) => a + c.charCodeAt(0), 0);
  return `<span class="ltag" style="--tc:${TAG_COLORS[h % TAG_COLORS.length]}">${esc(t)}${x ? `<button class="ltag-x" data-tag-del="${esc(t)}" title="Remove tag">${icon('close', 10)}</button>` : ''}</span>`;
}
function tagsHTML(l, max = 3) {
  const ts = l.tags || [];
  return ts.length ? `<span class="lead-tags">${ts.slice(0, max).map(t => tagChip(t)).join('')}${ts.length > max ? `<span class="muted small">+${ts.length - max}</span>` : ''}</span>` : '';
}
/* contacted = a call or email has been logged; unread = open and not contacted yet */
const leadContacted = l => (l.log || []).some(x => x.note && (x.kind === 'call' || x.kind === 'email'));
const leadUnread = l => isOpenLead(l) && !leadContacted(l);
function leadCity(l) { return l.city || (l.clientId && (client(l.clientId) || {}).city) || ''; }
function localDay(iso) { return !iso ? '' : iso.length > 10 ? ymd(new Date(iso)) : iso; }
function phoneKey(p) { const d = String(p || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-10) : ''; }
const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function leadIndex() { const e = erp(); return { q: new Set(e.quotes.map(x => x.leadId).filter(Boolean)), m: new Set(e.meetings.map(x => x.leadId).filter(Boolean)) }; }
/* touched = someone did something with it: a note or call, a stage move, a quotation or a meeting */
function leadTouched(l, ix) { return ix.q.has(l.id) || ix.m.has(l.id) || (l.log || []).some(x => x.note || /^moved from /.test(x.text)); }
function followClass(l) { const t = todayStr(); return !l.followUp || !isOpenLead(l) ? '' : l.followUp < t || (l.followUp === t && l.followUpTime && l.followUpTime < nowHM()) ? 'overdue' : l.followUp <= addDays(t, 1) ? 'soon' : ''; }
function followText(l, { today = false } = {}) { return !l.followUp ? '' : `${today && l.followUp === todayStr() ? 'Today' : fmtDate(l.followUp)}${l.followUpTime ? ' ' + fmtTime(l.followUpTime) : ''}`; }
function ensureTags(tags) { const s = erpSet('crm'); tags.forEach(t => { if (t && !s.tags.includes(t)) s.tags.push(t); }); }
function setLeadOwner(l, v, { notify = true } = {}) {
  v = v || null;
  if (l.owner === v) return false;
  l.owner = v;
  leadLog(l, `set the owner to ${personName(v)}`);
  if (notify && v && v !== Store.state.me) Store.notify(v, null, `You were assigned lead LD-${l.no} "${l.title}"`);
  return true;
}
function deleteLeads(ls) {
  const e = erp(), gone = new Set(ls.map(l => l.id));
  e.leads = e.leads.filter(l => !gone.has(l.id));
  [e.quotes, e.meetings, e.calcs, e.invoices, Store.state.spaces].forEach(arr => arr.forEach(x => { if (gone.has(x.leadId)) x.leadId = null; }));
  e.recent = e.recent.filter(r => !(r.type === 'lead' && gone.has(r.id)));
  erpLog('crm', ls.length === 1 ? `deleted lead LD-${ls[0].no} ${ls[0].title}` : `deleted ${ls.length} leads`);
}
/* fold duplicates into one lead: empty fields fill in, history and linked records move over */
function mergeLeads(master, others) {
  const e = erp();
  others.forEach(o => {
    ['company', 'clientId', 'source', 'industry', 'expected', 'followUp', 'city', 'requirement', 'spaceId', 'owner'].forEach(k => { if (!master[k] && o[k]) master[k] = o[k]; });
    ['name', 'phone', 'email'].forEach(k => { if (!master.contact[k] && o.contact[k]) master.contact[k] = o.contact[k]; });
    if (!Number(master.value) && Number(o.value)) master.value = o.value;
    master.tags = [...new Set([...(master.tags || []), ...(o.tags || [])])];
    master.log = [...master.log, ...(o.log || [])].sort((a, b) => b.at.localeCompare(a.at));
    [e.quotes, e.meetings, e.calcs, e.invoices, Store.state.spaces].forEach(arr => arr.forEach(x => { if (x.leadId === o.id) x.leadId = master.id; }));
    if (o.created < master.created) master.created = o.created;
  });
  const gone = new Set(others.map(o => o.id));
  e.leads = e.leads.filter(l => !gone.has(l.id));
  e.recent = e.recent.filter(r => !(r.type === 'lead' && gone.has(r.id)));
  leadLog(master, `merged ${others.map(o => `LD-${o.no}`).join(', ')} into this lead`);
  erpLog('crm', `merged ${others.length} duplicate${others.length === 1 ? '' : 's'} into LD-${master.no}`, { type: 'lead', id: master.id });
}
/* bulk changes shouldn't pop a team dialog per lead when a folder rule makes spaces */
function quietly(fn) { const was = Store.loading; Store.loading = true; try { return fn(); } finally { Store.loading = was; } }

/* ---------------- stage rules ---------------- */
/* when the lead reached its current stage (older leads: from the history) */
function leadStageAt(l) {
  if (l.stageAt) return l.stageAt;
  const name = (stageOf(l) || {}).name;
  const x = (l.log || []).find(e => e.text.startsWith('moved from ') && e.text.endsWith(` to ${name}`));
  return x ? x.at : l.created;
}
/* kinds of activity since a time: note / call / email / visit, quote, meeting, calc */
function leadActivitySince(l, t0) {
  const e = erp(), k = new Set();
  (l.log || []).forEach(x => { if (x.note && x.at > t0) k.add(x.kind || 'note'); });
  if (e.quotes.some(q => q.leadId === l.id && (q.created || '') > t0)) k.add('quote');
  if (e.meetings.some(m => m.leadId === l.id && (m.created || '') > t0)) k.add('meeting');
  if (e.calcs.some(c => c.leadId === l.id && (c.at || '') > t0)) k.add('calc');
  return k;
}
const isContactStage = st => !!st && (st.id === 'stg_contacted' || /contact/i.test(st.name));
/* null when a person may make this move, else why not. Going back, staying and Lost are always allowed;
   forward is one stage at a time, with something logged in the current stage (a call or email before Contacted). */
function leadStageCheck(l, toId) {
  const s = erpSet('crm'), st = s.stages;
  const from = st.findIndex(x => x.id === l.stageId), to = st.findIndex(x => x.id === toId), T = st[to];
  if (s.enforceStages === false || !T || to <= from || T.cat === 'lost') return null;
  const next = st.slice(from + 1).find(x => x.cat !== 'lost');
  if (next && next.id !== T.id) return { kind: 'skip', next, to: T };
  // Quotation sent needs a quotation that has actually been sent
  if (T.id === s.quoteSentStage) {
    const qs = erp().quotes.filter(q => q.leadId === l.id);
    return qs.some(q => q.status !== 'draft') ? null : { kind: 'noquote', to: T, drafts: qs };
  }
  const acts = leadActivitySince(l, leadStageAt(l));
  // the call or email that got a lead into Contacted is that stage's activity (it's logged just before the move)
  if (isContactStage(st[from]) && leadContacted(l)) return null;
  if (isContactStage(T)) return acts.has('call') || acts.has('email') ? null : { kind: 'contact', to: T, from: st[from] };
  return acts.size ? null : { kind: 'activity', to: T, from: st[from] };
}
/* lead folders whose space-creating stage this move reaches, when the lead has no space yet */
function leadQualifyFolders(l, toId) {
  const st = erpSet('crm').stages, t = lfStageIdx(toId);
  if ((l.spaceId && Store.space(l.spaceId)) || !st[t] || !['new', 'open'].includes(st[t].cat)) return null;
  const fs = Store.state.folders.filter(f => f.lead && f.lead.stageId && lfStageIdx(f.lead.stageId) >= 0 && t >= lfStageIdx(f.lead.stageId));
  return fs.length ? fs : null;
}
/* every stage change a person makes goes through here (automation calls setLeadStage directly) */
function moveLeadStage(l, toId, after) {
  if (!l || !toId || l.stageId === toId) return;
  const chk = leadStageCheck(l, toId);
  if (chk && chk.kind === 'skip') { toast(`Stages can't be skipped — move LD-${l.no} to ${chk.next.name} first`, 'error'); return; }
  if (chk && chk.kind === 'noquote') { openNoQuote(l, chk); return; }
  if (chk) { openStageActivity(l, chk, () => moveLeadStage(l, toId, after)); return; }
  if (leadQualifyFolders(l, toId)) { openQualifyDialog([l], toId, after); return; }
  setLeadStage(l, toId); Store.save(); if (after) after();
}
function openNoQuote(l, chk) {
  const d = chk.drafts[0];
  openModal({
    title: 'Send a quotation first', width: 480,
    body: `<p>LD-${l.no} moves to <b>${esc(chk.to.name)}</b> when one of its quotations is marked sent — it then moves there by itself.</p>
      <p class="muted">${d ? `${esc(d.no)}${chk.drafts.length > 1 ? ` and ${chk.drafts.length - 1} more` : ''} ${chk.drafts.length > 1 ? 'are' : 'is'} still a draft.` : 'This lead has no quotation yet.'}</p>`,
    footer: `<button class="btn subtle" data-close>Cancel</button>${d ? `<button class="btn" data-open>Open ${esc(d.no)}</button><button class="btn primary" data-ok>${icon('mail', 14)} Mark ${esc(d.no)} as sent</button>` : `<button class="btn primary" data-ok>${icon('quote', 14)} Create quotation</button>`}`,
    onMount(el, api) {
      const o = el.querySelector('[data-open]'); if (o) o.addEventListener('click', () => { api.close(); openQuote(d.id); });
      el.querySelector('[data-ok]').addEventListener('click', () => { if (d) { if (markQuoteSent(d)) api.close(); } else { api.close(); openQuote(null, { leadId: l.id, clientId: l.clientId }); } });
    },
  });
}
function logLeadActivity(l, kind, text, fu, fut) {
  if (fu && (fu !== l.followUp || (fut || null) !== (l.followUpTime || null))) { l.followUp = fu; l.followUpTime = fut || null; leadLog(l, `set the follow-up to ${followText(l)}`); }
  leadLog(l, text, true);
  l.log[0].kind = kind;
  if (fu) Object.assign(l.log[0], { fu, fuTime: fut || null });
  erpLog('crm', `${kind === 'note' ? 'added a note' : `logged ${{ call: 'a call', email: 'an email', visit: 'a visit' }[kind]}`} on LD-${l.no}`, { type: 'lead', id: l.id });
}
/* Marking a follow-up done: log how the call went and set the next follow-up, if one is needed */
/* The logged note, call, email or visit that set the follow-up now due, if there is one */
function followUpSource(l) {
  return (l.log || []).find(x => x.note && x.fu === l.followUp && (x.fuTime || null) === (l.followUpTime || null)) || null;
}
const LOG_KIND_NAME = { note: 'note', call: 'call', email: 'email', visit: 'visit' };
function openFollowUpDone(l, after) {
  const due = followText(l), dueDay = l.followUp, dueTime = l.followUpTime || null, src = followUpSource(l);
  const finish = () => { leadLog(l, `completed the follow-up due ${due}`); l.followUp = null; l.followUpTime = null; };
  openModal({
    title: `Follow-up done · LD-${l.no}`, width: 520,
    body: `<p class="muted">The follow-up due <b>${esc(due)}</b> with ${esc(l.contact.name || l.company)} is marked done. Log how the call went and whether it needs another follow-up.</p>
      ${src ? `<div class="fu-src small"><span class="muted">${icon('bell', 12)} Follow-up to the ${LOG_KIND_NAME[src.kind || 'note']} logged ${fmtDate(src.at.slice(0, 10))}${src.user ? ` by ${esc(personName(src.user, ''))}` : ''}</span><div class="fu-src-text">${esc(src.text)}</div></div>` : ''}
      <textarea class="input" rows="3" name="text" placeholder="Call log: what was discussed?" autofocus></textarea>
      <label class="row gap8 small muted fu-pick" style="margin-top:10px">Next follow-up <input class="input sm-in" type="date" name="fu" min="${todayStr()}"><input class="input sm-in fu-time" type="time" name="fut" title="Time (optional)"></label>
      <p class="muted small">Leave the date empty if no more follow-ups are needed.</p>`,
    footer: `<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>${icon('phone', 14)} Log call &amp; mark done</button>`,
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el), t = f.text.trim();
        if (!t) { el.querySelector('[name=text]').classList.add('invalid'); el.querySelector('[name=text]').focus(); toast('Type the call log first', 'error'); return; }
        finish();
        logLeadActivity(l, 'call', t, f.fu, f.fut);
        Object.assign(l.log[0], { fuOf: src ? src.id : null, fuDue: dueDay, fuDueTime: dueTime });
        api.close(); if (after) after();
        toast(f.fu ? `Call logged · next follow-up ${followText(l, { today: true })}` : 'Call logged · follow-up done');
      });
    },
  });
}
function openStageActivity(l, chk, cont) {
  const contact = chk.kind === 'contact';
  const kinds = contact ? [['call', 'phone', 'Call'], ['email', 'mail', 'Email']] : [['note', 'comment', 'Note'], ['call', 'phone', 'Call'], ['email', 'mail', 'Email'], ['visit', 'pin', 'Visit']];
  let kind = kinds[0][0];
  openModal({
    title: contact ? 'Log the call or email first' : `Log what happened in ${esc(chk.from.name)}`, width: 540,
    body: `<p class="muted">${contact
      ? `LD-${l.no} moves to <b>${esc(chk.to.name)}</b> once a call or email with ${esc(l.contact.name || l.company)} is logged.`
      : `Each stage needs something logged before the lead moves on. Nothing has been logged on LD-${l.no} since it reached <b>${esc(chk.from.name)}</b>. Log a note, call, email or visit — or create a quotation or meeting — to move it to <b>${esc(chk.to.name)}</b>.`}</p>
      <div class="seg act-kind">${kinds.map(([k, ic, n], i) => `<button class="${i ? '' : 'on'}" data-sk="${k}">${icon(ic, 13)}&nbsp;${n}</button>`).join('')}</div>
      <textarea class="input" rows="3" name="text" placeholder="What was discussed?" autofocus></textarea>
      <label class="row gap8 small muted fu-pick" style="margin-top:10px">Next follow-up <input class="input sm-in" type="date" name="fu"><input class="input sm-in fu-time" type="time" name="fut" title="Time (optional)"></label>`,
    footer: `<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Log &amp; move to ${esc(chk.to.name)}</button>`,
    onMount(el, api) {
      el.addEventListener('click', ev => { const b = ev.target.closest('[data-sk]'); if (b) { kind = b.dataset.sk; $$('[data-sk]', el).forEach(x => x.classList.toggle('on', x === b)); } });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el), t = f.text.trim();
        if (!t) { el.querySelector('[name=text]').classList.add('invalid'); el.querySelector('[name=text]').focus(); return; }
        logLeadActivity(l, kind, t, f.fu, f.fut);
        api.close(); cont();
      });
    },
  });
}
/* Qualifying: System or Spare? The space goes into Leads: System or Leads: Spare, then the lead moves on to Requirement gathering */
function openQualifyDialog(ls, toId, after) {
  const s = erpSet('crm');
  const req = s.stages.find(x => x.id === 'stg_req') || s.stages.find(x => /requirement/i.test(x.name));
  const goReq = req && lfStageIdx(req.id) > lfStageIdx(toId);
  const one = ls.length === 1 ? ls[0] : null;
  let kind = one && one.type === 'Spare' ? 'Spare' : 'System';
  const fname = k => (lfLeadFolder({ type: k }) || { name: `Leads: ${k}` }).name;
  const preview = () => (one ? `Goes in <b>${esc(fname(kind))}</b>` : `${ls.length} spaces in <b>${esc(fname(kind))}</b>, one per lead: ${ls.slice(0, 4).map(l => `${esc(lfLeadSpaceName(l))} (${esc(lfLeadSpaceKey(l.company))})`).join(', ')}${ls.length > 4 ? '…' : ''}`);
  openModal({
    title: one ? `Qualify LD-${one.no}` : `Qualify ${ls.length} leads`, width: 560,
    body: `<p class="muted">Is ${one ? 'this' : 'each of these'} a system or a spare lead? The project space is created in the matching Taskspace folder${goReq ? `, and the lead moves on to <b>${esc(req.name)}</b>` : ''}.</p>
      <div class="qual-pick">${['System', 'Spare'].map(k => `<label class="qual-opt"><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span class="qual-card"><b>${k} lead</b>
        <span class="muted small">${k === 'System' ? 'Requirement Engineering, Proposal and Follow Ups tasks' : 'Spares tasks: category, client requirement, GAD, vendor and PO'}</span><span class="small">${icon('folder', 12)} ${esc(fname(k))}</span></span></label>`).join('')}</div>
      ${one ? `<div class="form-grid qual-space"><label class="field"><span class="field-label">Space name <span class="req">*</span></span><input class="input" name="sname" maxlength="60" value="${esc(lfLeadSpaceName(one))}"></label>
        <label class="field"><span class="field-label">Key <span class="req">*</span></span><input class="input" name="skey" maxlength="10" value="${esc(lfLeadSpaceKey(one.company))}"><span class="field-help" data-khint>Suggested from the company name</span></label></div>` : ''}
      <p class="small qual-prev" data-qprev>${preview()}</p>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Qualify &amp; create space</button>',
    onMount(el, api) {
      el.addEventListener('change', ev => { if (ev.target.name === 'kind') { kind = ev.target.value; el.querySelector('[data-qprev]').innerHTML = preview(); } });
      const key = el.querySelector('[name=skey]'), hint = el.querySelector('[data-khint]');
      if (key) key.addEventListener('input', () => {
        key.value = key.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const taken = key.value && Store.spaceByKey(key.value);
        key.classList.toggle('invalid', !!taken); hint.textContent = taken ? `${key.value} is already used by ${taken.name}` : 'Work items in the space are numbered ' + (key.value || 'KEY') + '-1, -2…';
      });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        if (one) {
          const n = el.querySelector('[name=sname]').value.trim(), k = key.value.trim();
          if (!n) { el.querySelector('[name=sname]').classList.add('invalid'); el.querySelector('[name=sname]').focus(); return; }
          if (!k || Store.spaceByKey(k)) { key.classList.add('invalid'); key.focus(); toast(k ? 'That key is already in use' : 'Enter a key', 'error'); return; }
          lfSpaceOverride[one.id] = { name: n, key: k };
        }
        api.close();
        const run = () => ls.forEach(l => {
          if (l.type !== kind) { l.type = kind; leadLog(l, `set the type to ${kind}`); }
          setLeadStage(l, toId, { quiet: true }); // the folder rule creates the space
          if (goReq && isOpenLead(l)) setLeadStage(l, req.id, { quiet: true });
        });
        if (ls.length > 1) quietly(run); else run();
        Store.save();
        toast(`${one ? `LD-${one.no}` : `${ls.length} leads`} qualified as ${kind}${goReq ? ` · now in ${req.name}` : ''}`);
        if (after) after();
      });
    },
  });
}

/* ---------------- dates ---------------- */
const LV_DATE = [{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: 'month', label: 'This month' }, { value: 'lastmonth', label: 'Last month' }, { value: 'older30', label: 'More than 30 days ago' }];
function inDatePreset(iso, p) {
  const d = localDay(iso), t = todayStr();
  if (!d) return false;
  switch (p) {
    case 'today': return d === t;
    case 'yesterday': return d === addDays(t, -1);
    case '7': return d >= addDays(t, -6);
    case '30': return d >= addDays(t, -29);
    case 'month': return monthKey(d) === monthKey(t);
    case 'lastmonth': return monthKey(d) === shiftMonth(monthKey(t), -1);
    case 'older30': return d < addDays(t, -30);
  }
  return true;
}
/* CSV dates: ISO, or day-first (25/09/2026) as written in India */
function parseLooseDate(s) {
  s = String(s || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (Number(m[2]) <= 12) return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const d = new Date(s);
  return isNaN(d) ? null : ymd(d);
}

/* ---------------- filters, views, columns ---------------- */
function lvFields() {
  const s = erpSet('crm'), t = todayStr();
  const opt = a => a.map(x => ({ value: x, label: x }));
  return [
    { id: 'stage', name: 'Stage', kind: 'multi', opts: s.stages.map(x => ({ value: x.id, label: x.name })), get: l => l.stageId },
    { id: 'owner', name: 'Lead owner', kind: 'multi', opts: [{ value: '', label: 'Unassigned' }, ...userOptions()], get: l => l.owner || '' },
    { id: 'priority', name: 'Priority', kind: 'multi', opts: LEAD_PRIORITIES.map(p => ({ value: p.id, label: p.name })), get: l => l.priority },
    { id: 'source', name: 'Lead source', kind: 'multi', opts: [...opt(s.sources), { value: '', label: 'No source' }], get: l => l.source || '' },
    { id: 'industry', name: 'Industry', kind: 'multi', opts: [...opt(s.industries), { value: '', label: 'No industry' }], get: l => l.industry || '' },
    { id: 'type', name: 'Type', kind: 'multi', opts: opt(LEAD_TYPES), get: l => l.type },
    { id: 'tags', name: 'Tags', kind: 'multi', opts: [...opt(s.tags), { value: '', label: 'No tags' }], get: l => ((l.tags || []).length ? l.tags : ['']) },
    { id: 'value', name: 'Estimated value', kind: 'range', get: l => Number(l.value) || 0 },
    {
      id: 'expected', name: 'Close date', kind: 'preset',
      opts: [{ value: 'overdue', label: 'Close date passed' }, { value: 'month', label: 'Closing this month' }, { value: 'next30', label: 'Closing in 30 days' }, { value: 'none', label: 'No close date' }],
      test: (l, v) => ({ overdue: () => l.expected && l.expected < t && isOpenLead(l), month: () => l.expected && monthKey(l.expected) === monthKey(t), next30: () => l.expected && l.expected >= t && l.expected <= addDays(t, 30), none: () => !l.expected }[v] || (() => true))(),
    },
    {
      id: 'followUp', name: 'Follow-up date', kind: 'preset',
      opts: [{ value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Next 7 days' }, { value: 'set', label: 'Any follow-up set' }, { value: 'none', label: 'No follow-up' }],
      test: (l, v) => ({ overdue: () => l.followUp && l.followUp < t, today: () => l.followUp === t, week: () => l.followUp && l.followUp >= t && l.followUp <= addDays(t, 7), set: () => !!l.followUp, none: () => !l.followUp }[v] || (() => true))(),
    },
    { id: 'created', name: 'Created time', kind: 'preset', opts: LV_DATE, test: (l, v) => inDatePreset(l.created, v) },
    { id: 'updated', name: 'Last activity time', kind: 'preset', opts: LV_DATE, test: (l, v) => inDatePreset(l.updated, v) },
    { id: 'company', name: 'Company', kind: 'text', get: l => l.company },
    { id: 'title', name: 'Requirement', kind: 'text', get: l => `${l.title} ${l.requirement || ''}` },
    { id: 'cname', name: 'Contact name', kind: 'text', get: l => l.contact.name },
    { id: 'phone', name: 'Phone', kind: 'text', get: l => l.contact.phone },
    { id: 'email', name: 'Email', kind: 'text', get: l => l.contact.email },
    { id: 'city', name: 'City', kind: 'text', get: leadCity },
  ];
}
const TEXT_OPS = [{ value: 'has', label: 'contains' }, { value: 'not', label: "doesn't contain" }, { value: 'is', label: 'is' }, { value: 'empty', label: 'is empty' }, { value: 'filled', label: 'is not empty' }];
function lvFieldBlank(fd) { return fd.kind === 'multi' ? [] : fd.kind === 'range' ? { min: '', max: '' } : fd.kind === 'text' ? { op: 'has', v: '' } : ''; }
function lvFieldActive(fd, v) {
  if (v == null) return false;
  if (fd.kind === 'multi') return v.length > 0;
  if (fd.kind === 'range') return (v.min !== '' && v.min != null) || (v.max !== '' && v.max != null);
  if (fd.kind === 'text') return v.op === 'empty' || v.op === 'filled' || !!String(v.v || '').trim();
  return !!v;
}
function lvFieldTest(fd, v, l) {
  if (fd.kind === 'multi') { const x = fd.get(l); return Array.isArray(x) ? x.some(k => v.includes(k)) : v.includes(x); }
  if (fd.kind === 'range') { const x = fd.get(l); return (v.min === '' || v.min == null || x >= Number(v.min)) && (v.max === '' || v.max == null || x <= Number(v.max)); }
  if (fd.kind === 'text') {
    const x = String(fd.get(l) || '').toLowerCase().trim(), q = String(v.v || '').toLowerCase().trim();
    return v.op === 'empty' ? !x : v.op === 'filled' ? !!x : v.op === 'is' ? x === q : v.op === 'not' ? !x.includes(q) : x.includes(q);
  }
  return fd.test(l, v);
}
function lvFieldSummary(fd, v) {
  if (fd.kind === 'multi') { const ls = v.map(k => (fd.opts.find(o => o.value === k) || { label: k || '—' }).label); return ls.slice(0, 2).join(', ') + (ls.length > 2 ? ` +${ls.length - 2}` : ''); }
  if (fd.kind === 'range') return v.min !== '' && v.max !== '' ? `${moneyShort(v.min)} – ${moneyShort(v.max)}` : v.min !== '' ? `≥ ${moneyShort(v.min)}` : `≤ ${moneyShort(v.max)}`;
  if (fd.kind === 'text') { const op = TEXT_OPS.find(o => o.value === v.op).label; return v.op === 'empty' || v.op === 'filled' ? op : `${op} “${v.v}”`; }
  return (fd.opts.find(o => o.value === v) || { label: v }).label;
}
function lvSystem(ix) {
  const s = erpSet('crm'), t = todayStr();
  const staleCut = new Date(Date.now() - (s.staleDays || 14) * 864e5).toISOString();
  return [
    { id: 'touched', name: 'Touched records', test: l => leadTouched(l, ix) },
    { id: 'untouched', name: 'Untouched records', test: l => !leadTouched(l, ix) },
    { id: 'unread', name: 'Not contacted yet', test: l => leadUnread(l) },
    { id: 'followdue', name: 'Follow-up due', test: l => l.followUp && l.followUp <= t },
    { id: 'quoted', name: 'Has a quotation', test: l => ix.q.has(l.id) },
    { id: 'noquote', name: 'No quotation yet', test: l => !ix.q.has(l.id) },
    { id: 'meet', name: 'Has meetings or visits', test: l => ix.m.has(l.id) },
    { id: 'stale', name: `No update in ${s.staleDays || 14}+ days`, test: l => l.updated < staleCut },
    { id: 'converted', name: 'Converted to client', test: l => !!l.clientId },
    { id: 'space', name: 'Has a project space', test: l => !!(l.spaceId && Store.space(l.spaceId)) },
  ];
}
function lvBuiltinViews() {
  const me = Store.state.me, t = todayStr();
  const cat = l => (stageOf(l) || {}).cat;
  return [
    { id: 'all', name: 'All leads', test: l => !l.junk },
    { id: 'mine', name: 'My leads', test: l => !l.junk && l.owner === me },
    { id: 'open', name: 'Open leads', test: isOpenLead },
    { id: 'myopen', name: 'My open leads', test: l => isOpenLead(l) && l.owner === me },
    { id: 'unread', name: 'My unread leads', test: l => l.owner === me && leadUnread(l) },
    { id: 'today', name: "Today's leads", test: l => !l.junk && localDay(l.created) === t },
    { id: 'recent', name: 'Recently created leads', test: l => !l.junk && inDatePreset(l.created, '7') },
    { id: 'modified', name: 'Recently modified leads', test: l => !l.junk && inDatePreset(l.updated, '7') },
    { id: 'followups', name: 'Follow-ups due', test: l => isOpenLead(l) && !!l.followUp, sort: { key: 'followUp', dir: 1 } },
    { id: 'unassigned', name: 'Unassigned leads', test: l => isOpenLead(l) && !l.owner },
    { id: 'converted', name: 'Converted leads', test: l => !l.junk && !!l.clientId },
    { id: 'won', name: 'Won leads', test: l => !l.junk && cat(l) === 'won' },
    { id: 'lost', name: 'Lost leads', test: l => !l.junk && cat(l) === 'lost' },
    { id: 'junk', name: 'Junk leads', test: l => !!l.junk },
  ];
}
function lvView(id) {
  const b = lvBuiltinViews().find(v => v.id === id);
  if (b) return b;
  const c = erpSet('crm').views.find(v => v.id === id);
  return c ? { ...c, custom: true, test: l => !l.junk } : null;
}
function lvViewState(vs) { return JSON.parse(JSON.stringify({ search: vs.search, f: vs.f, sys: vs.sys, sort: vs.sort })); }
function lvApplyView(vs, id) {
  const v = lvView(id) || lvView('all');
  vs.cv = v.id; vs.page = 0; vs.sel = [];
  if (v.custom) { Object.assign(vs, JSON.parse(JSON.stringify(v.state))); vs.exp = Object.keys(vs.f); } else { vs.f = {}; vs.sys = []; vs.search = ''; vs.exp = []; if (v.sort) vs.sort = { ...v.sort }; }
}
function lvDirty(vs) { const v = lvView(vs.cv); return v && v.custom && JSON.stringify(lvViewState(vs)) !== JSON.stringify(v.state); }

const dash = '<span class="muted">—</span>';
function leadCols() {
  const t = todayStr();
  return [
    { id: 'company', name: 'Company', w: 200, cell: l => `<span class="cell-in">${l.clientId ? `<a class="link-plain ellip" href="#/app/crm/clients/${l.clientId}">${esc(l.company)}</a>` : `<span class="ellip">${esc(l.company)}</span>`}</span>` },
    { id: 'stage', name: 'Stage', w: 170, cell: l => `<button class="cell-btn" data-stage-menu="${l.id}">${stagePill(l)}</button>` },
    { id: 'value', name: 'Value', w: 120, num: true, cell: l => money(l.value) },
    { id: 'priority', name: 'Priority', w: 110, cell: l => `<button class="cell-btn" data-ledit="priority:${l.id}">${priorityIcon(l.priority)} ${cap(l.priority)}</button>` },
    { id: 'source', name: 'Source', w: 130, cell: l => (l.source ? esc(l.source) : dash) },
    { id: 'owner', name: 'Owner', w: 170, cell: l => `<button class="cell-btn" data-ledit="owner:${l.id}">${avatar(l.owner, 22)} <span class="ellip">${esc(personName(l.owner))}</span></button>` },
    { id: 'expected', name: 'Close date', w: 120, cell: l => `<button class="cell-btn ${l.expected && l.expected < t && isOpenLead(l) ? 'overdue' : ''}" data-ledit="expected:${l.id}">${l.expected ? fmtDate(l.expected) : dash}</button>` },
    { id: 'followUp', name: 'Follow-up', w: 120, cell: l => `<button class="cell-btn ${followClass(l)}" data-ledit="followUp:${l.id}">${l.followUp ? followText(l, { today: true }) : dash}</button>` },
    { id: 'created', name: 'Created', w: 110, cell: l => `<span class="muted">${fmtDate(l.created)}</span>` },
    { id: 'updated', name: 'Last activity', w: 130, cell: l => `<span class="muted">${timeAgo(l.updated)}</span>` },
    { id: 'contact', name: 'Contact', w: 160, cell: l => (l.contact.name ? `<span class="ellip">${esc(l.contact.name)}</span>` : dash) },
    { id: 'phone', name: 'Phone', w: 150, cell: l => (l.contact.phone ? `<a class="link-plain" href="tel:${esc(l.contact.phone)}">${esc(l.contact.phone)}</a>` : dash) },
    { id: 'email', name: 'Email', w: 210, cell: l => (l.contact.email ? `<a class="link-plain ellip" href="mailto:${esc(l.contact.email)}">${esc(l.contact.email)}</a>` : dash) },
    { id: 'city', name: 'City', w: 130, cell: l => (leadCity(l) ? esc(leadCity(l)) : dash) },
    { id: 'industry', name: 'Industry', w: 140, cell: l => (l.industry ? esc(l.industry) : dash) },
    { id: 'type', name: 'Type', w: 90, cell: l => esc(l.type || '') },
    { id: 'tags', name: 'Tags', w: 180, cell: l => tagsHTML(l, 2) || dash },
  ];
}
const LEAD_SORTS = [['created', 'Created time'], ['updated', 'Last activity'], ['no', 'Key'], ['title', 'Lead'], ['company', 'Company'], ['stage', 'Stage'], ['value', 'Value'], ['priority', 'Priority'], ['source', 'Source'], ['owner', 'Owner'], ['expected', 'Close date'], ['followUp', 'Follow-up'], ['contact', 'Contact'], ['city', 'City'], ['industry', 'Industry']];
function leadSortVal(l, k, stages) {
  switch (k) {
    case 'no': return l.no;
    case 'title': return l.title.toLowerCase();
    case 'company': return l.company.toLowerCase();
    case 'stage': return stages.findIndex(x => x.id === l.stageId);
    case 'value': return Number(l.value) || 0;
    case 'priority': return PRI_ORDER[l.priority];
    case 'source': return (l.source || '~').toLowerCase();
    case 'owner': return personName(l.owner, 'zzz');
    case 'expected': return l.expected || '9';
    case 'followUp': return l.followUp ? l.followUp + (l.followUpTime || '') : '9';
    case 'contact': return (l.contact.name || '~').toLowerCase();
    case 'city': return (leadCity(l) || '~').toLowerCase();
    case 'industry': return (l.industry || '~').toLowerCase();
    case 'updated': return l.updated;
    default: return l.created;
  }
}

/* ---------------- Leads page ---------------- */
function crmLeads(root, r) {
  const e = erp(), s = erpSet('crm'), me = Store.state.me, q = r.query || {}, t = todayStr();
  const pref = Store.state.ui.crmLv = Object.assign({ view: 'list', panel: true, per: 50 }, Store.state.ui.crmLv || {});
  const vs = ui('crm.leads', { cv: 'all', search: '', f: {}, sys: [], exp: [], fq: '', sort: { key: 'created', dir: -1 }, sel: [], page: 0, chart: { on: false, dim: 'stage', measure: 'count', type: 'bar' }, boardMore: {}, ids: [] });
  const view = q.view || pref.view;
  // a view opened from the sidebar (?cv=) loads once; after that the filters are yours to change
  if (q.cv && vs.cvLoaded !== q.cv) { lvApplyView(vs, q.cv); vs.cvLoaded = q.cv; } else if (!q.cv) vs.cvLoaded = null;
  if (!lvView(vs.cv)) vs.cv = 'all';
  const cur = lvView(vs.cv);
  const ix = leadIndex(), fields = lvFields(), sysDefs = lvSystem(ix);

  const base = e.leads.filter(cur.test);
  let leads = base.slice();
  const chips = [];
  if (q.owner === 'me') { leads = leads.filter(l => l.owner === me); chips.push('My leads'); }
  if (q.priority) { leads = leads.filter(l => l.priority === q.priority); chips.push(cap(q.priority) + ' priority'); }
  if (q.closing) { leads = leads.filter(l => l.expected && monthKey(l.expected) === monthKey(t) && isOpenLead(l)); chips.push('Closing this month'); }
  if (q.cat) { leads = leads.filter(l => (stageOf(l) || {}).cat === q.cat); chips.push(q.cat === 'won' ? 'Won' : cap(q.cat)); }
  if (q.stage) { leads = leads.filter(l => l.stageId === q.stage); chips.push((s.stages.find(x => x.id === q.stage) || {}).name || 'Stage'); }
  if (vs.search) { const x = vs.search.toLowerCase(); leads = leads.filter(l => `${l.title} ${l.company} LD-${l.no} ${l.contact.name} ${l.contact.email} ${l.contact.phone} ${(l.tags || []).join(' ')} ${leadCity(l)}`.toLowerCase().includes(x)); }
  const active = fields.filter(fd => lvFieldActive(fd, vs.f[fd.id]));
  active.forEach(fd => { leads = leads.filter(l => lvFieldTest(fd, vs.f[fd.id], l)); });
  vs.sys = vs.sys.filter(id => sysDefs.some(x => x.id === id));
  vs.sys.forEach(id => { const sd = sysDefs.find(x => x.id === id); leads = leads.filter(sd.test); });
  const k = vs.sort.key, dir = vs.sort.dir;
  const vals = new Map(leads.map(l => [l.id, leadSortVal(l, k, s.stages)]));
  leads.sort((a, b) => { const x = vals.get(a.id), y = vals.get(b.id); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  vs.ids = leads.map(l => l.id);
  const idSet = new Set(vs.ids);
  vs.sel = vs.sel.filter(id => idSet.has(id));
  const nFilters = active.length + vs.sys.length;
  const sum = leads.reduce((a, l) => a + (Number(l.value) || 0), 0);
  const pages = Math.max(1, Math.ceil(leads.length / pref.per));
  vs.page = Math.min(vs.page, pages - 1);
  const pageLeads = view === 'board' ? leads : leads.slice(vs.page * pref.per, (vs.page + 1) * pref.per);
  const owners = [...new Set(e.leads.map(l => l.owner).filter(Boolean))];
  const ownerF = vs.f.owner || [];
  const sortName = (LEAD_SORTS.find(x => x[0] === k) || LEAD_SORTS[0])[1];

  const toolbar = `<div class="lv-top">
    <button class="lv-viewbtn" data-lv="views" title="Switch view">${icon('list', 14)}<span class="ellip">${esc(cur.name)}</span><span class="count">${base.length}</span>${icon('chevronDown', 14)}</button>
    ${lvDirty(vs) ? '<button class="btn subtle sm" data-lv="updateview">Save changes to view</button>' : ''}
    <button class="btn sm ${pref.panel ? 'on-soft' : ''}" data-lv="panel" title="${pref.panel ? 'Hide' : 'Show'} filters">${icon('filter', 14)} Filter${nFilters ? ` <span class="count brand">${nFilters}</span>` : ''}</button>
    <div class="search-sm">${icon('search')}<input placeholder="Search leads, contacts, tags" value="${esc(vs.search)}" data-lv-in="search" data-keep="crm-search"></div>
    <div class="avatar-stack">${owners.map(u => `<button class="av-toggle ${ownerF.includes(u) ? 'on' : ''}" data-owner="${u}" title="${esc(personName(u))}">${avatar(u, 28)}</button>`).join('')}</div>
    <span class="grow"></span>
    <button class="btn subtle sm" data-lv="sort" title="Sort">${icon('sort', 14)} ${esc(sortName)} ${icon(dir > 0 ? 'chevronUp' : 'chevronDown', 12)}</button>
    <button class="btn subtle sm ${vs.chart.on ? 'on-soft' : ''}" data-lv="chart" title="Group by and chart">${icon('reports', 14)} Group by</button>
    <div class="seg"><button class="${view === 'board' ? 'on' : ''}" data-lv-view="board">${icon('board', 14)}&nbsp;Board</button><button class="${view === 'list' ? 'on' : ''}" data-lv-view="list">${icon('list', 14)}&nbsp;List</button><button class="${view === 'tiles' ? 'on' : ''}" data-lv-view="tiles">${icon('apps', 14)}&nbsp;Tiles</button></div>
    <button class="btn sm" data-lv="actions">Actions ${icon('chevronDown', 12)}</button>
  </div>`;

  const chipRow = chips.length || nFilters || vs.search ? `<div class="lv-chips">
    ${chips.map(c => `<span class="filter-chip">${esc(c)}<a href="#/app/crm/leads" title="Clear">${icon('close', 12)}</a></span>`).join('')}
    ${active.map(fd => `<span class="filter-chip"><span class="muted-sel">${esc(fd.name)}:</span>&nbsp;${esc(lvFieldSummary(fd, vs.f[fd.id]))}<a data-lv-rm="f:${fd.id}" title="Remove">${icon('close', 12)}</a></span>`).join('')}
    ${vs.sys.map(id => `<span class="filter-chip">${esc(sysDefs.find(x => x.id === id).name)}<a data-lv-rm="s:${id}" title="Remove">${icon('close', 12)}</a></span>`).join('')}
    ${nFilters || vs.search ? '<button class="btn subtle sm" data-lv="clear">Clear filters</button>' : ''}
    <span class="muted small">${leads.length} of ${base.length} match</span></div>` : '';

  let body;
  if (view === 'board') body = lvBoard(leads, vs, q);
  else if (view === 'tiles') body = pageLeads.length ? `<div class="lead-tiles" data-keep-scroll="crm-tiles">${pageLeads.map(leadTile).join('')}</div>` : lvEmpty(base.length);
  else body = lvTable(pageLeads, vs, base.length);

  const foot = `<div class="lv-foot"><span>${leads.length} lead${leads.length === 1 ? '' : 's'} · ${money(sum)}</span><span class="grow"></span>
    ${view !== 'board' && leads.length ? `<label class="row gap8 small muted">Per page ${selectHTML('per', ['25', '50', '100', '200'], String(pref.per), { cls: 'sm-in per-sel', attrs: 'data-lv-in="per"' })}</label>
      <span class="small">${vs.page * pref.per + 1}–${Math.min(leads.length, (vs.page + 1) * pref.per)} of ${leads.length}</span>
      <button class="icon-btn xs bordered" data-lv-page="-1" ${vs.page === 0 ? 'disabled' : ''} title="Previous page">${icon('chevronLeft', 14)}</button><button class="icon-btn xs bordered" data-lv-page="1" ${vs.page >= pages - 1 ? 'disabled' : ''} title="Next page">${icon('chevronRight', 14)}</button>` : ''}</div>`;

  const bulk = view === 'list' && vs.sel.length ? `<div class="bulk-bar"><b>${vs.sel.length} selected</b>
    ${vs.sel.length < leads.length ? `<button class="link small" data-lv-bulk="all">Select all ${leads.length}</button>` : ''}
    <button class="btn sm" data-lv-bulk="stage">Change stage</button><button class="btn sm" data-lv-bulk="owner">Transfer owner</button>
    <button class="btn sm" data-lv-bulk="update">Mass update</button><button class="btn sm" data-lv-bulk="tags">Tags</button>
    <button class="btn sm" data-lv-bulk="more">More ${icon('chevronDown', 12)}</button>
    <span class="grow"></span><button class="btn subtle sm" data-lv-bulk="clear">Clear selection</button></div>` : '';

  root.innerHTML = `<div class="leads-page">${toolbar}${chipRow}<div class="lv-body">
    ${pref.panel ? lvFilterPanel(vs, fields, sysDefs, base) : ''}
    <div class="lv-main">${vs.chart.on ? lvInsights(leads, vs) : ''}${bulk}${body}${foot}</div></div></div>`;

  const redraw = () => { vs.page = 0; render(); };
  const setPref = (key, v) => { pref[key] = v; Store.save(true); render(); };
  root.addEventListener('input', ev => {
    const d = ev.target.dataset;
    if (d.lvIn === 'search') { vs.search = ev.target.value; redraw(); }
    if (d.lvfQ != null) { vs.fq = ev.target.value; render(); }
    if (d.lvfText) { vs.f[d.lvfText] = { ...(vs.f[d.lvfText] || lvFieldBlank({ kind: 'text' })), v: ev.target.value }; redraw(); }
  });
  root.addEventListener('change', ev => {
    const el = ev.target, d = el.dataset;
    if (d.lvIn === 'per') { vs.page = 0; setPref('per', Number(el.value)); return; }
    if (d.lvSys) { vs.sys = el.checked ? [...vs.sys, d.lvSys] : vs.sys.filter(x => x !== d.lvSys); redraw(); return; }
    if (d.lvExp) { const id = d.lvExp; if (el.checked) { vs.exp = [...vs.exp, id]; if (!vs.f[id]) vs.f[id] = lvFieldBlank(fields.find(x => x.id === id)); } else { vs.exp = vs.exp.filter(x => x !== id); delete vs.f[id]; } redraw(); return; }
    if (d.lvfMulti) { const id = d.lvfMulti, cur2 = vs.f[id] || []; vs.f[id] = el.checked ? [...cur2, el.value] : cur2.filter(x => x !== el.value); redraw(); return; }
    if (d.lvfMin || d.lvfMax) { const id = d.lvfMin || d.lvfMax; vs.f[id] = { ...(vs.f[id] || { min: '', max: '' }), [d.lvfMin ? 'min' : 'max']: el.value }; redraw(); return; }
    if (d.lvfOp) { vs.f[d.lvfOp] = { ...(vs.f[d.lvfOp] || { v: '' }), op: el.value }; redraw(); return; }
    if (d.lvfPreset) { vs.f[d.lvfPreset] = el.value; redraw(); return; }
    if (d.lvcDim != null) { vs.chart.dim = el.value; render(); return; }
    if (el.matches('[data-lv-sel]')) { vs.sel = el.checked ? [...vs.sel, d.lvSel] : vs.sel.filter(x => x !== d.lvSel); render(); return; }
    if (el.matches('[data-lv-selall]')) { const ids = pageLeads.map(l => l.id); vs.sel = el.checked ? [...new Set([...vs.sel, ...ids])] : vs.sel.filter(x => !ids.includes(x)); render(); }
  });
  root.addEventListener('click', ev => {
    const tg = ev.target;
    const o = tg.closest('[data-owner]'); if (o) { const u = o.dataset.owner; vs.f.owner = ownerF.includes(u) ? ownerF.filter(x => x !== u) : [...ownerF, u]; if (!vs.exp.includes('owner')) vs.exp.push('owner'); redraw(); return; }
    const vw = tg.closest('[data-lv-view]'); if (vw) { pref.view = vw.dataset.lvView; Store.save(true); if (q.view) location.hash = '#/app/crm/leads'; else render(); return; }
    const rm = tg.closest('[data-lv-rm]'); if (rm) { const [kind, id] = rm.dataset.lvRm.split(':'); if (kind === 'f') { delete vs.f[id]; vs.exp = vs.exp.filter(x => x !== id); } else vs.sys = vs.sys.filter(x => x !== id); redraw(); return; }
    const pg = tg.closest('[data-lv-page]'); if (pg) { vs.page = Math.max(0, Math.min(pages - 1, vs.page + Number(pg.dataset.lvPage))); render(); return; }
    const grp = tg.closest('[data-lv-grp]'); if (grp) { const dim = vs.chart.dim; vs.f[dim] = [grp.dataset.lvGrp]; if (!vs.exp.includes(dim)) vs.exp.push(dim); pref.panel = true; redraw(); return; }
    const ct = tg.closest('[data-lvc]'); if (ct) { const [key, v] = ct.dataset.lvc.split(':'); vs.chart[key] = v; render(); return; }
    const more = tg.closest('[data-board-more]'); if (more) { const id = more.dataset.boardMore; vs.boardMore[id] = (vs.boardMore[id] || 40) + 40; render(); return; }
    const bk = tg.closest('[data-lv-bulk]'); if (bk) { lvBulk(bk, vs, leads); return; }
    const le = tg.closest('[data-ledit]'); if (le) { lvInlineEdit(le); return; }
    const th = tg.closest('[data-lsort]'); if (th) { const key = th.dataset.lsort; vs.sort = { key, dir: vs.sort.key === key ? -vs.sort.dir : 1 }; render(); return; }
    const n = tg.closest('[data-new-in]'); if (n) { openLeadCreate({ stageId: n.dataset.newIn }); return; }
    const c = tg.closest('[data-lead]'); if (c && !tg.closest('a,button')) { openLead(c.dataset.lead); return; }
    const sm = tg.closest('[data-stage-menu]'); if (sm) { leadStageMenu(sm, lead(sm.dataset.stageMenu)); return; }
    const b = tg.closest('[data-lv]'); if (!b) return;
    const a = b.dataset.lv;
    if (a === 'panel') setPref('panel', !pref.panel);
    if (a === 'clear') { vs.f = {}; vs.sys = []; vs.exp = []; vs.search = ''; redraw(); }
    if (a === 'chart') { vs.chart.on = !vs.chart.on; render(); }
    if (a === 'views') lvViewsPop(b, vs);
    if (a === 'saveview') lvSaveView(vs);
    if (a === 'updateview') { const v = s.views.find(x => x.id === vs.cv); v.state = lvViewState(vs); Store.save(); toast(`View "${v.name}" updated`); }
    if (a === 'sort') {
      menu(b, [{ heading: 'Sort by' }, ...LEAD_SORTS.map(([key, label]) => ({ value: key, label, selected: vs.sort.key === key })), '-',
        { value: '__dir', label: dir > 0 ? 'Ascending — switch to descending' : 'Descending — switch to ascending', icon: icon(dir > 0 ? 'chevronUp' : 'chevronDown') }], v => {
        vs.sort = v === '__dir' ? { key: k, dir: -dir } : { key: v, dir: vs.sort.key === v ? dir : ['created', 'updated', 'value'].includes(v) ? -1 : 1 }; render();
      }, { align: 'right' });
    }
    if (a === 'cols') lvColumnsPop(b);
    if (a === 'actions') {
      menu(b, [
        { value: 'import', label: 'Import leads', icon: icon('upload') }, { value: 'csv', label: `Export ${leads.length} lead${leads.length === 1 ? '' : 's'} to CSV`, icon: icon('download') },
        { value: 'print', label: 'Print this view', icon: icon('print') }, '-',
        { value: 'dedupe', label: 'Deduplicate leads', icon: icon('copy') }, { value: 'tags', label: 'Manage tags', icon: icon('bolt') },
        { value: 'save', label: 'Save filters as a view', icon: icon('star') }, { value: 'views', label: 'Manage custom views', icon: icon('gear') },
      ], v => {
        if (v === 'import') openLeadImport();
        if (v === 'csv') exportLeadsCSV(leads);
        if (v === 'print') printLeads(leads, cur.name);
        if (v === 'dedupe') openDedupe();
        if (v === 'tags') location.hash = '#/app/crm/settings/tags';
        if (v === 'save') lvSaveView(vs);
        if (v === 'views') location.hash = '#/app/crm/settings/views';
      }, { align: 'right' });
    }
  });
  // drag cards between stages
  let drag = null;
  root.addEventListener('dragstart', ev => { const c = ev.target.closest('[data-lead]'); if (!c || view !== 'board') return; drag = c.dataset.lead; c.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', drag); });
  root.addEventListener('dragend', () => { drag = null; $$('.dragging,.drop-over', root).forEach(x => x.classList.remove('dragging', 'drop-over')); });
  root.addEventListener('dragover', ev => { const z = drag && ev.target.closest('[data-drop-stage]'); if (!z) return; ev.preventDefault(); $$('.drop-over', root).forEach(x => x !== z && x.classList.remove('drop-over')); z.classList.add('drop-over'); });
  root.addEventListener('drop', ev => { const z = drag && ev.target.closest('[data-drop-stage]'); if (!z) return; ev.preventDefault(); const l = lead(drag); drag = null; $$('.drop-over', root).forEach(x => x.classList.remove('drop-over')); moveLeadStage(l, z.dataset.dropStage); });
}

function lvEmpty(anyInView) {
  return emptyState({ title: anyInView ? 'No leads match' : 'No leads in this view', text: anyInView ? 'Try removing a filter, or search for something else.' : 'Create a lead, import a CSV, or switch to another view.', art: 'funnel', action: '<button class="btn" data-lv="clear">Clear filters</button>' });
}

function lvFilterPanel(vs, fields, sysDefs, base) {
  const fq = (vs.fq || '').toLowerCase();
  const match = n => !fq || n.toLowerCase().includes(fq);
  const ctl = fd => {
    const v = vs.f[fd.id] != null ? vs.f[fd.id] : lvFieldBlank(fd);
    if (fd.kind === 'multi') return fd.opts.length ? `<div class="lvf-opts">${fd.opts.map(o => `<label class="chk-row"><input type="checkbox" data-lvf-multi="${fd.id}" value="${esc(o.value)}" ${v.includes(o.value) ? 'checked' : ''}><span class="ellip">${fd.id === 'tags' && o.value ? tagChip(o.label) : esc(o.label)}</span></label>`).join('')}</div>` : '<span class="muted small">Nothing to pick yet.</span>';
    if (fd.kind === 'range') return `<div class="row gap8"><input class="input" type="number" min="0" placeholder="Min" value="${esc(v.min)}" data-lvf-min="${fd.id}"><span class="muted">–</span><input class="input" type="number" min="0" placeholder="Max" value="${esc(v.max)}" data-lvf-max="${fd.id}"></div>`;
    if (fd.kind === 'text') return `${selectHTML('op', TEXT_OPS, v.op, { attrs: `data-lvf-op="${fd.id}"` })}${v.op === 'empty' || v.op === 'filled' ? '' : `<input class="input" placeholder="Type a value" value="${esc(v.v)}" data-lvf-text="${fd.id}" data-keep="lvf-${fd.id}">`}`;
    return selectHTML('preset', fd.opts, v, { blank: 'Choose…', attrs: `data-lvf-preset="${fd.id}"` });
  };
  const sys = sysDefs.filter(x => match(x.name));
  const flds = fields.filter(x => match(x.name));
  return `<aside class="lv-filters">
    <div class="lvf-head"><b>Filter leads by</b><button class="icon-btn xs" data-lv="panel" title="Hide filters">${icon('close', 14)}</button></div>
    <div class="lvf-search"><div class="search-sm">${icon('search')}<input placeholder="Search filters" value="${esc(vs.fq || '')}" data-lvf-q data-keep="lvf-q"></div></div>
    <div class="lvf-scroll">
      ${sys.length ? `<div class="lvf-sec"><h4>System defined filters</h4>${sys.map(x => `<label class="lvf-row ${vs.sys.includes(x.id) ? 'on' : ''}"><input type="checkbox" data-lv-sys="${x.id}" ${vs.sys.includes(x.id) ? 'checked' : ''}><span class="grow ellip">${esc(x.name)}</span><span class="lvf-n">${base.filter(x.test).length}</span></label>`).join('')}</div>` : ''}
      ${flds.length ? `<div class="lvf-sec"><h4>Filter by fields</h4>${flds.map(fd => { const open = vs.exp.includes(fd.id); return `<div class="lvf-item ${lvFieldActive(fd, vs.f[fd.id]) ? 'on' : ''}">
        <label class="lvf-row"><input type="checkbox" data-lv-exp="${fd.id}" ${open ? 'checked' : ''}><span class="grow ellip">${esc(fd.name)}</span></label>${open ? `<div class="lvf-ctl">${ctl(fd)}</div>` : ''}</div>`; }).join('')}</div>` : ''}
      ${!sys.length && !flds.length ? '<p class="muted small lvf-none">No filter by that name.</p>' : ''}
    </div>
    <div class="lvf-foot">${vs.exp.length || vs.sys.length ? '<button class="btn subtle sm" data-lv="clear">Clear all</button>' : ''}<span class="grow"></span><button class="btn sm" data-lv="saveview">${icon('star', 14)} Save as view</button></div>
  </aside>`;
}

function lvTable(pageLeads, vs, anyInView) {
  const s = erpSet('crm');
  s.leadCols = (s.leadCols || LEAD_COLS_DEFAULT).filter(id => leadCols().some(c => c.id === id));
  const cols = leadCols().filter(c => s.leadCols.includes(c.id));
  const k = vs.sort.key, dir = vs.sort.dir;
  const th = (key, label, w, cls = '') => `<th class="${cls}" ${w ? `style="width:${w}px"` : ''} data-lsort="${key}">${label} ${k === key ? icon(dir > 0 ? 'chevronUp' : 'chevronDown', 12) : ''}</th>`;
  const sel = new Set(vs.sel);
  const allOn = pageLeads.length && pageLeads.every(l => sel.has(l.id));
  return `<div class="table-wrap" data-keep-scroll="crm-list"><table class="grid lead-grid"><thead><tr>
      <th class="chk"><input type="checkbox" data-lv-selall ${allOn ? 'checked' : ''} title="Select this page"></th>${th('no', 'Key', 90)}${th('title', 'Lead')}
      ${cols.map(c => th(c.id, c.name, c.w, c.num ? 'num' : '')).join('')}<th class="cfg"><button class="icon-btn xs" data-lv="cols" title="Choose columns">${icon('plus', 14)}</button></th></tr></thead>
    <tbody>${pageLeads.map(l => { const un = leadUnread(l); return `<tr class="${sel.has(l.id) ? 'sel' : ''} ${un ? 'unread' : ''}">
      <td class="chk"><input type="checkbox" data-lv-sel="${l.id}" ${sel.has(l.id) ? 'checked' : ''}></td>
      <td><a class="key link-plain" data-rec="lead:${l.id}">${un ? '<span class="unread-dot" title="Not contacted yet"></span>' : ''}LD-${l.no}</a></td>
      <td><a class="link-plain ellip strong" data-rec="lead:${l.id}">${esc(l.title)}</a></td>
      ${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.cell(l)}</td>`).join('')}<td></td></tr>`; }).join('')}</tbody></table>
    ${!pageLeads.length ? lvEmpty(anyInView) : ''}</div>`;
}

function lvBoard(leads, vs, q) {
  const s = erpSet('crm');
  const stages = q.cat ? s.stages.filter(x => x.cat === q.cat) : s.stages;
  return `<div class="board lead-board" data-keep-scroll="crm-board"><div class="board-row">${stages.map(st => {
    const ls = leads.filter(l => l.stageId === st.id);
    const v = ls.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const capN = vs.boardMore[st.id] || 40;
    return `<div class="col"><div class="col-head"><span class="stage-dot ${STAGE_CLS[st.cat]}"></span><span class="col-name" title="${esc(st.name)}">${esc(st.name)}</span><span class="count">${ls.length}</span><span class="col-sum">${moneyShort(v)}</span></div>
      <div class="col-body" data-drop-stage="${st.id}">${ls.slice(0, capN).map(leadCard).join('')}
        ${ls.length > capN ? `<button class="col-create" data-board-more="${st.id}">${icon('chevronDown')} Show ${Math.min(40, ls.length - capN)} more of ${ls.length - capN}</button>` : ''}
        ${s.enforceStages === false || st.id === s.stages[0].id ? `<button class="col-create" data-new-in="${st.id}">${icon('plus')} Create lead</button>` : ''}</div></div>`;
  }).join('')}</div></div>`;
}
function leadCard(l) {
  const t = todayStr(), fc = followClass(l);
  return `<div class="card lead-card ${leadUnread(l) ? 'unread' : ''}" draggable="true" data-lead="${l.id}">
    <div class="card-summary">${leadUnread(l) ? '<span class="unread-dot" title="Not contacted yet"></span>' : ''}${esc(l.title)}</div>
    <div class="lc-company">${icon('building', 12)}<span class="ellip">${esc(l.company || 'No company')}</span></div>
    ${(l.tags || []).length ? `<div class="card-tags">${tagsHTML(l, 3)}</div>` : ''}
    <div class="card-foot"><span class="lc-val">${moneyShort(l.value)}</span>${priorityIcon(l.priority, 14)}<span class="card-key">LD-${l.no}</span><span class="grow"></span>
      ${l.followUp && fc ? `<span class="due-chip ${fc}" title="Follow-up">${icon('bell', 11)} ${followText(l, { today: true })}</span>` : ''}
      ${l.expected ? `<span class="due-chip ${l.expected < t && isOpenLead(l) ? 'overdue' : ''}">${fmtDate(l.expected)}</span>` : ''}${avatar(l.owner, 20)}</div></div>`;
}
function leadTile(l) {
  const fc = followClass(l), ph = l.contact.phone, em = l.contact.email;
  return `<div class="lead-tile ${leadUnread(l) ? 'unread' : ''}" data-lead="${l.id}">
    <div class="lt-top">${clientAvatar({ name: l.company || '?' }, 36)}<div class="grow" style="min-width:0"><div class="lt-title ellip">${leadUnread(l) ? '<span class="unread-dot" title="Not contacted yet"></span>' : ''}${esc(l.title)}</div><div class="muted small ellip">${esc(l.company)}${leadCity(l) ? ` · ${esc(leadCity(l))}` : ''}</div></div></div>
    <div class="lt-mid">${stagePill(l)}<b class="lc-val">${moneyShort(l.value)}</b>${priorityIcon(l.priority, 14)}</div>
    <div class="lt-contact">${icon('people', 12)}<span class="ellip grow">${esc(l.contact.name || 'No contact')}</span>
      ${ph ? `<a class="icon-btn xs" href="tel:${esc(ph)}" title="Call ${esc(ph)}">${icon('phone', 13)}</a>` : ''}${em ? `<a class="icon-btn xs" href="mailto:${esc(em)}" title="Email ${esc(em)}">${icon('mail', 13)}</a>` : ''}</div>
    ${(l.tags || []).length ? `<div class="card-tags">${tagsHTML(l, 4)}</div>` : ''}
    <div class="card-foot"><span class="card-key">LD-${l.no}</span><span class="muted small">· ${timeAgo(l.updated)}</span><span class="grow"></span>
      ${l.followUp ? `<span class="due-chip ${fc}" title="Follow-up">${icon('bell', 11)} ${followText(l, { today: true })}</span>` : ''}${avatar(l.owner, 22)}</div></div>`;
}

/* inline edits in list cells */
function lvInlineEdit(btn) {
  const [f, id] = btn.dataset.ledit.split(':');
  const l = lead(id);
  if (!l) return;
  const done = () => { l.updated = nowISO(); Store.save(); };
  if (f === 'owner') userPicker(btn, l.owner, v => { if (setLeadOwner(l, v)) done(); });
  if (f === 'priority') menu(btn, LEAD_PRIORITIES.map(p => ({ value: p.id, label: p.name, icon: priorityIcon(p.id), selected: l.priority === p.id })), v => { if (v === l.priority) return; l.priority = v; leadLog(l, 'updated the priority'); done(); });
  if (f === 'expected' || f === 'followUp') datePicker(btn, l[f], v => { if (v === l[f]) return; l[f] = v; if (f === 'followUp' && !v) l.followUpTime = null; leadLog(l, v ? `set the ${f === 'expected' ? 'close date' : 'follow-up'} to ${fmtDate(v)}` : `cleared the ${f === 'expected' ? 'close date' : 'follow-up'}`); done(); });
}

function lvColumnsPop(anchor) {
  const s = erpSet('crm');
  popover(anchor, `<div class="pad"><div class="menu-heading">Columns</div>${leadCols().map(c => `<label class="chk-row"><input type="checkbox" value="${c.id}" ${s.leadCols.includes(c.id) ? 'checked' : ''}> ${c.name}</label>`).join('')}
    <div class="menu-sep"></div><button class="btn subtle sm" data-value="__reset">Reset to default</button></div>`, {
    align: 'right', width: 220,
    onSelect(v) { if (v === '__reset') { s.leadCols = LEAD_COLS_DEFAULT.slice(); Store.save(); } },
    onMount(el) { el.addEventListener('change', ev => { const v = ev.target.value; s.leadCols = ev.target.checked ? leadCols().map(c => c.id).filter(id => s.leadCols.includes(id) || id === v) : s.leadCols.filter(x => x !== v); Store.save(); }); },
  });
}

/* ---------------- views menu ---------------- */
function lvViewsPop(anchor, vs) {
  const s = erpSet('crm'), leads = erp().leads;
  const b = lvBuiltinViews(), cs = s.views;
  const item = (v, n, extra = '') => `<button class="menu-item lvv-item ${vs.cv === v.id ? 'selected' : ''}" data-value="v:${v.id}" data-name="${esc(v.name.toLowerCase())}"><span class="mi-label ellip">${esc(v.name)}</span>${extra}<span class="mi-hint">${n}</span></button>`;
  const notJunk = leads.filter(l => !l.junk).length;
  popover(anchor, `<div class="lv-views"><div class="pad-sm"><input class="input" placeholder="Search views" data-vq></div>
    <div class="menu"><div class="menu-heading">Views</div>${b.map(v => item(v, leads.filter(v.test).length)).join('')}
    <div class="menu-heading">Custom views</div>${cs.length ? cs.map(v => item(v, notJunk, `<span class="lvv-acts"><span class="icon-btn xs" data-value="ren:${v.id}" title="Rename">${icon('edit', 12)}</span><span class="icon-btn xs" data-value="del:${v.id}" title="Delete">${icon('trash', 12)}</span></span>`)).join('') : '<p class="muted small lvv-none">Filter the list, then save it as a view to come back to it in one click.</p>'}
    <div class="menu-sep"></div><button class="menu-item" data-value="__new"><span class="mi-icon">${icon('plus')}</span><span class="mi-label">New custom view from these filters</span></button></div></div>`, {
    width: 300,
    onMount(el) {
      el.querySelector('[data-vq]').addEventListener('input', ev => { const x = ev.target.value.toLowerCase(); $$('.lvv-item', el).forEach(i => { i.style.display = i.dataset.name.includes(x) ? '' : 'none'; }); });
    },
    async onSelect(v) {
      const [kind, id] = v.split(':');
      if (v === '__new') { lvSaveView(vs); return; }
      if (kind === 'v') { lvApplyView(vs, id); if (location.hash.includes('cv=')) location.hash = '#/app/crm/leads'; else render(); return; }
      const cv = s.views.find(x => x.id === id);
      if (kind === 'ren') lvSaveView(vs, cv);
      if (kind === 'del' && await confirmDialog({ title: `Delete view "${cv.name}"?`, message: 'Only the saved view goes. No leads are deleted.' })) {
        s.views = s.views.filter(x => x !== cv);
        if (vs.cv === id) lvApplyView(vs, 'all');
        Store.save(); toast('View deleted');
      }
    },
  });
}
function lvSaveView(vs, existing = null) {
  openModal({
    title: existing ? 'Rename view' : 'Save as custom view', width: 460,
    body: `${existing ? '' : `<p class="muted small">Saves the search, filters and sort you have now. It shows up in the views menu and the CRM sidebar for everyone.</p>`}
      <label class="field"><span class="field-label">View name <span class="req">*</span></span><input class="input" name="name" value="${esc(existing ? existing.name : '')}" placeholder="e.g. Hot IndiaMART enquiries" autofocus></label>`,
    footer: `<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>${existing ? 'Save' : 'Save view'}</button>`,
    onMount(el, api) {
      const go = () => {
        const n = el.querySelector('[name=name]').value.trim();
        if (!n) { el.querySelector('[name=name]').classList.add('invalid'); return; }
        const s = erpSet('crm');
        if (existing) existing.name = n;
        else { const v = { id: uid('lv'), name: n, by: Store.state.me, created: nowISO(), state: lvViewState(vs) }; s.views.push(v); vs.cv = v.id; }
        api.close(); Store.save(); toast(existing ? 'View renamed' : `View "${n}" saved`);
      };
      el.querySelector('[data-ok]').addEventListener('click', go);
      el.querySelector('[name=name]').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    },
  });
}

/* ---------------- group by (Zoho's list-view chart) ---------------- */
const LV_DIMS = [['stage', 'Stage'], ['owner', 'Lead owner'], ['source', 'Lead source'], ['industry', 'Industry'], ['priority', 'Priority'], ['type', 'Type'], ['tags', 'Tags'], ['city', 'City'], ['created', 'Created month'], ['expected', 'Close month']];
const LV_FILTERABLE = ['stage', 'owner', 'source', 'industry', 'priority', 'type', 'tags'];
function lvGroups(leads, dim) {
  const s = erpSet('crm');
  const keys = {
    stage: l => [l.stageId], owner: l => [l.owner || ''], source: l => [l.source || ''], industry: l => [l.industry || ''], priority: l => [l.priority], type: l => [l.type || ''],
    tags: l => ((l.tags || []).length ? l.tags : ['']), city: l => [leadCity(l)], created: l => [monthKey(localDay(l.created))], expected: l => [l.expected ? monthKey(l.expected) : ''],
  }[dim];
  const label = {
    stage: k => (s.stages.find(x => x.id === k) || { name: 'Unknown stage' }).name, owner: k => (k ? personName(k) : 'Unassigned'), priority: k => cap(k),
    tags: k => k || 'No tags', created: k => monthLabel(k), expected: k => (k ? monthLabel(k) : 'No close date'),
  }[dim] || (k => k || 'None');
  const map = new Map();
  leads.forEach(l => keys(l).forEach(k => { const g = map.get(k) || { key: k, n: 0, v: 0 }; g.n++; g.v += Number(l.value) || 0; map.set(k, g); }));
  let rows = [...map.values()];
  if (dim === 'stage') rows.sort((a, b) => s.stages.findIndex(x => x.id === a.key) - s.stages.findIndex(x => x.id === b.key));
  else if (dim === 'priority') rows.sort((a, b) => PRI_ORDER[a.key] - PRI_ORDER[b.key]);
  else if (dim === 'created' || dim === 'expected') rows.sort((a, b) => (a.key || '9').localeCompare(b.key || '9'));
  else rows.sort((a, b) => b.n - a.n);
  return rows.map(g => ({ ...g, label: label(g.key) }));
}
function lvInsights(leads, vs) {
  const c = vs.chart;
  let rows = lvGroups(leads, c.dim);
  if (rows.length > 12 && !['stage', 'created', 'expected'].includes(c.dim)) {
    const rest = rows.slice(11);
    rows = [...rows.slice(0, 11), { key: null, label: `${rest.length} others`, n: rest.reduce((a, r) => a + r.n, 0), v: rest.reduce((a, r) => a + r.v, 0) }];
  }
  const val = r => (c.measure === 'value' ? r.v : r.n);
  const disp = r => (c.measure === 'value' ? moneyShort(r.v) : r.n);
  const tip = r => `${r.label}: ${r.n} lead${r.n === 1 ? '' : 's'} · ${money(r.v)}`;
  const max = Math.max(1, ...rows.map(val));
  const total = rows.reduce((a, r) => a + val(r), 0);
  const click = r => (LV_FILTERABLE.includes(c.dim) && r.key !== null ? `data-lv-grp="${esc(r.key)}"` : '');
  const color = i => SERIES[i % SERIES.length];
  let chart;
  if (!rows.length) chart = miniEmpty('No leads to chart.');
  else if (c.type === 'column') {
    chart = `<div class="lvi-cols">${rows.map((r, i) => `<button class="lvi-col" ${click(r)} data-tip="${esc(tip(r))}"><span class="lvi-cval">${disp(r)}</span><span class="lvi-cbar" style="height:${(val(r) / max) * 100}%;background:${color(i)}"></span><span class="lvi-cx ellip">${esc(r.label)}</span></button>`).join('')}</div>`;
  } else if (c.type === 'donut') {
    const size = 170, rad = size / 2 - 14, circ = 2 * Math.PI * rad, cx = size / 2;
    let off = 0;
    const arcs = rows.map((r, i) => { const len = total ? (val(r) / total) * circ : 0; const el = `<circle cx="${cx}" cy="${cx}" r="${rad}" fill="none" stroke="${color(i)}" stroke-width="22" stroke-dasharray="${Math.max(0, len - (rows.length > 1 ? 2 : 0))} ${circ}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cx})" data-tip="${esc(tip(r))}"/>`; off += len; return el; }).join('');
    chart = `<div class="donut-wrap"><svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cx}" r="${rad}" fill="none" stroke="var(--bg-neutral)" stroke-width="22"/>${arcs}
      <text x="${cx}" y="${cx - 2}" text-anchor="middle" class="donut-num">${c.measure === 'value' ? moneyShort(total) : total}</text><text x="${cx}" y="${cx + 18}" text-anchor="middle" class="donut-lab">${c.measure === 'value' ? 'Value' : 'Leads'}</text></svg>
      <ul class="legend-list lvi-legend">${rows.map((r, i) => `<li ${click(r)} class="${click(r) ? 'clickable' : ''}"><span class="sw" style="background:${color(i)}"></span><span class="ellip">${esc(r.label)}</span>: <b>${disp(r)}</b><span class="muted small">${total ? Math.round(val(r) / total * 100) : 0}%</span></li>`).join('')}</ul></div>`;
  } else {
    chart = `<div class="lvi-bars ${c.type === 'funnel' ? 'funnel-mode' : ''}">${rows.map((r, i) => `<button class="lvi-row" ${click(r)} data-tip="${esc(tip(r))}"><span class="lvi-lab ellip">${esc(r.label)}</span><span class="lvi-track"><span class="lvi-fill" style="width:${Math.max(2, (val(r) / max) * 100)}%;background:${c.type === 'funnel' ? 'var(--series-1)' : color(i)}"></span></span><span class="lvi-val">${disp(r)}</span></button>`).join('')}</div>`;
  }
  const typeBtn = (id, label) => `<button class="${c.type === id ? 'on' : ''}" data-lvc="type:${id}">${label}</button>`;
  return `<section class="panel lv-insights"><div class="lvi-head"><b>Group by</b>${selectHTML('dim', LV_DIMS.map(([value, label]) => ({ value, label })), c.dim, { cls: 'sm-in', attrs: 'data-lvc-dim' })}
    <div class="seg"><button class="${c.measure === 'count' ? 'on' : ''}" data-lvc="measure:count">Count</button><button class="${c.measure === 'value' ? 'on' : ''}" data-lvc="measure:value">Value</button></div>
    <div class="seg">${typeBtn('bar', 'Bar')}${typeBtn('column', 'Column')}${typeBtn('donut', 'Donut')}${typeBtn('funnel', 'Funnel')}</div>
    <span class="grow"></span>${LV_FILTERABLE.includes(c.dim) ? '<span class="muted small">Click a group to filter by it</span>' : ''}<button class="icon-btn xs" data-lv="chart" title="Close chart">${icon('close', 14)}</button></div>${chart}</section>`;
}

/* ---------------- mass actions ---------------- */
async function lvBulk(btn, vs, leads) {
  const act = btn.dataset.lvBulk;
  if (act === 'clear') { vs.sel = []; render(); return; }
  if (act === 'all') { vs.sel = leads.map(l => l.id); render(); return; }
  const ls = vs.sel.map(lead).filter(Boolean);
  const n = ls.length, N = `${n} lead${n === 1 ? '' : 's'}`;
  const done = msg => { vs.sel = []; Store.save(); toast(msg); };
  if (act === 'stage') {
    menu(btn, erpSet('crm').stages.map(s => ({ value: s.id, label: pill(s.name, STAGE_CLS[s.cat]) })), v => {
      const name = erpSet('crm').stages.find(x => x.id === v).name;
      const ok = ls.filter(l => l.stageId !== v && !leadStageCheck(l, v)), blocked = ls.filter(l => l.stageId !== v && leadStageCheck(l, v));
      const qual = ok.filter(l => leadQualifyFolders(l, v)), plain = ok.filter(l => !qual.includes(l));
      quietly(() => plain.forEach(l => setLeadStage(l, v, { quiet: true })));
      done(`${plain.length} lead${plain.length === 1 ? '' : 's'} moved to ${name}${blocked.length ? ` · ${blocked.length} skipped: leads move one stage at a time, with a call, email or note logged in the stage` : ''}`);
      if (qual.length) openQualifyDialog(qual, v);
    }, { cls: 'status-menu' });
  }
  if (act === 'owner') userPicker(btn, null, v => {
    let c = 0; ls.forEach(l => { if (setLeadOwner(l, v, { notify: false })) c++; });
    if (c && v && v !== Store.state.me) Store.notify(v, null, `You were given ${c} lead${c === 1 ? '' : 's'} by ${personName(Store.state.me, '')}`);
    done(`${c} lead${c === 1 ? '' : 's'} transferred to ${personName(v)}`);
  });
  if (act === 'update') lvMassUpdate(ls, () => { vs.sel = []; });
  if (act === 'tags') leadTagPop(btn, ls);
  if (act === 'more') {
    const junk = ls.every(l => l.junk);
    menu(btn, [
      { value: 'convert', label: 'Convert to clients', icon: icon('building') }, { value: 'email', label: 'Send email', icon: icon('mail') },
      { value: 'csv', label: 'Export selected', icon: icon('download') }, { value: 'print', label: 'Print selected', icon: icon('print') },
      { value: 'junk', label: junk ? 'Not junk — restore' : 'Mark as junk', icon: icon(junk ? 'refresh' : 'close') }, '-',
      { value: 'del', label: `Delete ${N}`, icon: icon('trash'), danger: true },
    ], async v => {
      if (v === 'convert') { let c = 0; ls.forEach(l => { if (!l.clientId && l.company.trim()) { convertLeadToClient(l, true); c++; } }); done(c ? `${c} lead${c === 1 ? '' : 's'} linked to clients` : 'Every selected lead is already a client'); }
      if (v === 'email') { const ems = [...new Set(ls.map(l => l.contact.email).filter(Boolean))]; if (!ems.length) { toast('None of these leads has an email address', 'error'); return; } location.href = `mailto:?bcc=${encodeURIComponent(ems.join(','))}`; if (ems.length < n) toast(`${n - ems.length} lead${n - ems.length === 1 ? ' has' : 's have'} no email`); }
      if (v === 'csv') exportLeadsCSV(ls);
      if (v === 'print') printLeads(ls, `${N} selected`);
      if (v === 'junk') { ls.forEach(l => { l.junk = !junk; leadLog(l, junk ? 'restored this lead from junk' : 'marked this lead as junk'); }); done(junk ? `${N} restored` : `${N} moved to Junk leads`); }
      if (v === 'del' && await confirmDialog({ title: `Delete ${N}?`, message: 'The leads and their notes are deleted. Quotations, meetings and spaces linked to them are kept.' })) { deleteLeads(ls); done(`${N} deleted`); }
    });
  }
}
function lvMassUpdate(ls, after) {
  const s = erpSet('crm');
  const F = {
    priority: ['Priority', () => selectHTML('v', LEAD_PRIORITIES.map(p => ({ value: p.id, label: p.name })), 'medium')],
    source: ['Source', () => selectHTML('v', s.sources, '', { blank: 'None' })],
    industry: ['Industry', () => selectHTML('v', s.industries, '', { blank: 'None' })],
    type: ['Type', () => selectHTML('v', LEAD_TYPES, 'System')],
    expected: ['Close date', () => '<input class="input" type="date" name="v">'],
    followUp: ['Follow-up date', () => '<input class="input" type="date" name="v">'],
    value: ['Estimated value', () => '<input class="input" type="number" min="0" step="1000" name="v">'],
    city: ['City', () => '<input class="input" name="v">'],
  };
  openModal({
    title: `Mass update ${ls.length} lead${ls.length === 1 ? '' : 's'}`, width: 480,
    body: `<p class="muted small">Sets one field to the same value on every selected lead. Leave the value empty to clear it.</p>
      <label class="field"><span class="field-label">Field</span>${selectHTML('field', Object.entries(F).map(([value, [label]]) => ({ value, label })), 'priority')}</label>
      <label class="field"><span class="field-label">New value</span><span data-mu-val>${F.priority[1]()}</span></label>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Update</button>',
    onMount(el, api) {
      const fs = el.querySelector('[name=field]');
      fs.addEventListener('change', () => { el.querySelector('[data-mu-val]').innerHTML = F[fs.value][1](); });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = fs.value; let v = el.querySelector('[name=v]').value;
        if (f === 'value') v = Number(v) || 0; else if (['expected', 'followUp', 'source', 'industry'].includes(f)) v = v || (f === 'source' || f === 'industry' ? '' : null);
        ls.forEach(l => { l[f] = v; leadLog(l, `updated the ${F[f][0].toLowerCase()} (mass update)`); });
        after(); api.close(); Store.save(); toast(`${F[f][0]} updated on ${ls.length} lead${ls.length === 1 ? '' : 's'}`);
      });
    },
  });
}
/* add/remove tags on one or many leads; type to create a new tag */
function leadTagPop(anchor, ls) {
  const s = erpSet('crm');
  const list = x => {
    const tags = s.tags.filter(t => !x || t.toLowerCase().includes(x.toLowerCase()));
    return `${tags.map(t => { const has = ls.filter(l => (l.tags || []).includes(t)).length; return `<button class="menu-item" data-value="t:${esc(t)}"><span class="mi-icon tag-box ${has === ls.length ? 'all' : has ? 'some' : ''}">${has === ls.length ? icon('check', 12) : has ? '–' : ''}</span><span class="mi-label">${tagChip(t)}</span>${ls.length > 1 ? `<span class="mi-hint">${has}/${ls.length}</span>` : ''}</button>`; }).join('')}
      ${x && !s.tags.some(t => t.toLowerCase() === x.trim().toLowerCase()) ? `<button class="menu-item" data-value="new"><span class="mi-icon">${icon('plus', 14)}</span><span class="mi-label">Create tag “${esc(x.trim())}”</span></button>` : ''}
      ${!tags.length && !x ? '<p class="muted small lvv-none">No tags yet. Type one above to create it.</p>' : ''}`;
  };
  let q = '';
  popover(anchor, `<div class="tag-pop"><div class="pad-sm"><input class="input" placeholder="Search or create a tag" data-tq></div><div class="menu" data-tlist>${list('')}</div></div>`, {
    width: 260,
    onMount(el) {
      const inp = el.querySelector('[data-tq]');
      inp.addEventListener('input', () => { q = inp.value; el.querySelector('[data-tlist]').innerHTML = list(q); });
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && q.trim()) { apply(q.trim(), true); inp.value = q = ''; el.querySelector('[data-tlist]').innerHTML = list(''); } });
      function apply(t, add) {
        ensureTags([t]);
        ls.forEach(l => { const cur = l.tags || []; if (add && !cur.includes(t)) { l.tags = [...cur, t]; leadLog(l, `added the tag ${t}`); } if (!add && cur.includes(t)) { l.tags = cur.filter(x => x !== t); leadLog(l, `removed the tag ${t}`); } });
        Store.save(true);
      }
      el.addEventListener('click', ev => {
        const b = ev.target.closest('[data-value]'); if (!b) return;
        const v = b.dataset.value;
        if (v === 'new') apply(q.trim(), true);
        else { const t = v.slice(2); apply(t, !ls.every(l => (l.tags || []).includes(t))); }
        inp.value = q = ''; el.querySelector('[data-tlist]').innerHTML = list('');
      });
    },
    onSelect: () => true, // stay open while toggling tags
    onClose: () => Store.save(),
  });
}

/* ---------------- export / print ---------------- */
function exportLeadsCSV(leads) {
  downloadCSV(`leads-${todayStr()}.csv`, [['Key', 'Lead', 'Company', 'Stage', 'Value', 'Priority', 'Owner', 'Source', 'Industry', 'Close date', 'Contact', 'Phone', 'Email', 'Created', 'Type', 'City', 'Tags', 'Follow-up', 'Last activity', 'Junk'],
    ...leads.map(l => [`LD-${l.no}`, l.title, l.company, stageOf(l).name, l.value, l.priority, personName(l.owner, ''), l.source, l.industry, l.expected || '', l.contact.name, l.contact.phone, l.contact.email, l.created.slice(0, 10), l.type, leadCity(l), (l.tags || []).join(', '), l.followUp || '', l.updated.slice(0, 10), l.junk ? 'Yes' : ''])]);
}
function printLeads(leads, title) {
  const s = erpSet('crm');
  const cols = leadCols().filter(c => s.leadCols.includes(c.id));
  const text = (c, l) => { const d = document.createElement('div'); d.innerHTML = c.cell(l); return d.textContent.trim(); };
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to print', 'error'); return; }
  w.document.write(`<!doctype html><html><head><title>${esc(title)} — Leads</title><style>
    body{font:12px/1.4 system-ui,sans-serif;color:#172B4D;margin:24px} h1{font-size:18px;margin:0 0 4px} p{color:#626F86;margin:0 0 16px}
    table{border-collapse:collapse;width:100%} th,td{border-bottom:1px solid #DCDFE4;padding:6px 8px;text-align:left;vertical-align:top} th{font-size:11px;text-transform:uppercase;color:#626F86} td.num{text-align:right}
  </style></head><body><h1>${esc(erpSet('company').name)} — ${esc(title)}</h1><p>${leads.length} lead${leads.length === 1 ? '' : 's'} · ${esc(money(leads.reduce((a, l) => a + (Number(l.value) || 0), 0)))} · printed ${esc(fmtDateTime(nowISO()))}</p>
    <table><thead><tr><th>Key</th><th>Lead</th>${cols.map(c => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>
    ${leads.map(l => `<tr><td>LD-${l.no}</td><td>${esc(l.title)}</td>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${esc(c.id === 'tags' ? (l.tags || []).join(', ') : text(c, l).replace(/^—$/, ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 250);
}

/* ---------------- deduplicate ---------------- */
function findDuplicateLeads() {
  const leads = erp().leads, parent = new Map(leads.map(l => [l.id, l.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const seen = new Map();
  const keysOf = l => [
    (l.contact.email || '').trim().toLowerCase() && 'e:' + l.contact.email.trim().toLowerCase(),
    phoneKey(l.contact.phone) && 'p:' + phoneKey(l.contact.phone),
    normKey(l.company) && normKey(l.title) && `t:${normKey(l.company)}|${normKey(l.title)}`,
  ].filter(Boolean);
  leads.forEach(l => keysOf(l).forEach(k => { if (seen.has(k)) { const a = find(l.id), b = find(seen.get(k)); if (a !== b) parent.set(a, b); } else seen.set(k, l.id); }));
  const groups = new Map();
  leads.forEach(l => { const r = find(l.id); groups.set(r, [...(groups.get(r) || []), l]); });
  return [...groups.values()].filter(g => g.length > 1).map(g => {
    const count = p => new Set(g.map(l => keysOf(l).find(k => k.startsWith(p))).filter(Boolean)).size;
    const why = [];
    if (g.every(l => (l.contact.email || '').trim()) && count('e:') === 1) why.push('same email');
    if (g.every(l => phoneKey(l.contact.phone)) && count('p:') === 1) why.push('same phone');
    if (g.every(l => normKey(l.title)) && count('t:') === 1) why.push('same company and requirement');
    return { leads: g.sort((a, b) => a.created.localeCompare(b.created)), why: why.join(' · ') || 'matching email, phone or requirement' };
  }).sort((a, b) => b.leads.length - a.leads.length);
}
function openDedupe() {
  let groups = [];
  const draw = el => {
    groups = findDuplicateLeads();
    const extra = groups.reduce((a, g) => a + g.leads.length - 1, 0);
    el.querySelector('.modal-body').innerHTML = groups.length ? `<p class="muted">${groups.length} group${groups.length === 1 ? '' : 's'} of possible duplicates · ${extra} extra lead${extra === 1 ? '' : 's'}. Pick the lead to keep — the others are merged into it: empty fields fill in, and their notes, quotations, meetings and sizing move over.</p>
      ${groups.slice(0, 40).map((g, i) => `<div class="dd-group"><div class="dd-head"><b>${esc(g.why)}</b><span class="muted small">${g.leads.length} leads</span><span class="grow"></span><button class="btn sm" data-dd-merge="${i}">Merge</button></div>
        <table class="grid compact"><thead><tr><th style="width:50px">Keep</th><th style="width:80px">Key</th><th>Lead</th><th>Company</th><th>Contact</th><th>Stage</th><th>Created</th></tr></thead><tbody>
        ${g.leads.map((l, j) => `<tr><td><input type="radio" name="keep-${i}" value="${l.id}" ${j === 0 ? 'checked' : ''}></td><td><a class="key link-plain" data-rec="lead:${l.id}">LD-${l.no}</a></td><td><span class="ellip">${esc(l.title)}</span></td><td><span class="ellip">${esc(l.company)}</span></td>
          <td><span class="ellip small">${esc([l.contact.name, l.contact.phone, l.contact.email].filter(Boolean).join(' · ') || '—')}</span></td><td>${stagePill(l)}</td><td class="muted">${fmtDate(l.created)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      ${groups.length > 40 ? `<p class="muted small">${groups.length - 40} more groups — merge these first to see them.</p>` : ''}`
      : emptyState({ title: 'No duplicates found', text: 'No two leads share an email, phone number, or the same company and requirement.', art: 'checkCircle' });
    el.querySelector('[data-dd-all]').style.display = groups.length ? '' : 'none';
  };
  const merge = (el, i) => {
    const g = groups[i], keep = el.querySelector(`[name="keep-${i}"]:checked`).value;
    mergeLeads(g.leads.find(l => l.id === keep), g.leads.filter(l => l.id !== keep));
  };
  openModal({
    title: 'Deduplicate leads', width: 920,
    body: '', footer: '<button class="btn subtle" data-close>Close</button><button class="btn primary" data-dd-all>Merge all shown</button>',
    onMount(el) {
      draw(el);
      el.addEventListener('click', async ev => {
        const b = ev.target.closest('[data-dd-merge]');
        if (b) { merge(el, Number(b.dataset.ddMerge)); Store.save(); toast('Leads merged'); draw(el); }
        if (ev.target.closest('[data-dd-all]')) {
          const n = Math.min(40, groups.length);
          if (!await confirmDialog({ title: `Merge ${n} group${n === 1 ? '' : 's'}?`, message: 'In each group the lead picked under Keep stays and the others are merged into it. This can’t be undone.', confirmLabel: 'Merge all', danger: false })) return;
          for (let i = 0; i < n; i++) merge(el, i);
          Store.save(); toast(`${n} group${n === 1 ? '' : 's'} merged`); draw(el);
        }
      });
    },
  });
}

/* ---------------- CSV import ---------------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = first.split('\t').length > first.split(',').length ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const IMPORT_TARGETS = [['', "Don't import"], ['title', 'Lead / requirement'], ['company', 'Company'], ['cname', 'Contact name'], ['clast', 'Contact last name'], ['cphone', 'Phone'], ['cemail', 'Email'], ['value', 'Estimated value'],
  ['source', 'Source'], ['industry', 'Industry'], ['type', 'Type'], ['city', 'City'], ['stage', 'Stage'], ['owner', 'Owner'], ['priority', 'Priority'], ['expected', 'Close date'], ['followUp', 'Follow-up date'], ['tags', 'Tags'], ['requirement', 'Requirement notes'], ['created', 'Created time']];
/* checked in order; the first unused column that matches takes the field, so exact names beat loose ones */
const IMPORT_GUESS = [
  ['cemail', /^(e-?mail|email address|email id|contact email|primary email)$/], ['cemail', /e-?mail(?!.*opt)/],
  ['cphone', /^(phone|mobile|mobile no|phone number|contact no|contact number|whatsapp)$/], ['cphone', /phone|mobile|contact no|whatsapp/],
  ['title', /^(lead|lead title|requirement|subject|product( name)?|enquiry|mcat name|item( name)?)$/],
  ['owner', /owner|assigned|sales ?person/], ['company', /company|account name|organi[sz]ation|firm/],
  ['cname', /^(lead name|full name|contact name|contact person|name)$/], ['cname', /first ?name|contact|person/], ['clast', /last ?name|surname/],
  ['value', /value|amount|revenue|budget|deal size/], ['source', /source/], ['industry', /industry|segment/], ['stage', /stage|status/], ['city', /city|town|location/],
  ['priority', /priority|rating/], ['expected', /close|expected/], ['followUp', /follow/], ['tags', /^tags?$/], ['type', /^(lead )?type$/],
  ['created', /created (time|date|on)|^created$|^date$/], ['requirement', /description|notes?|remarks|message|query text|details/],
  ['title', /title|requirement|subject|product|enquiry|mcat|item/]];
function guessImportMap(headers) {
  const hs = headers.map(h => h.trim().toLowerCase()), map = hs.map(() => '');
  IMPORT_GUESS.forEach(([t, re]) => { if (map.includes(t)) return; const i = hs.findIndex((h, j) => !map[j] && re.test(h)); if (i >= 0) map[i] = t; });
  // a full-name column already has the surname in it
  const cn = map.indexOf('cname');
  if (cn >= 0 && !/first/.test(hs[cn])) { const cl = map.indexOf('clast'); if (cl >= 0) map[cl] = ''; }
  return map;
}
function openLeadImport() {
  const s = erpSet('crm');
  let rows = null, map = [];
  const step1 = `<p class="muted">Bring leads in from a spreadsheet, IndiaMART or a Zoho CRM export. Save it as CSV first; the first row must be the column names.</p>
    <label class="drop-file"><input type="file" accept=".csv,.tsv,.txt,text/csv" data-imp-file>${icon('upload', 20)}<b>Choose a CSV file</b><span class="muted small">or paste the rows below</span></label>
    <textarea class="input mono" rows="5" data-imp-paste placeholder="Company,Contact,Phone,Email,Requirement&#10;Coastal Builders,Anita George,+91 97890 45454,anita@coastalbuilders.in,STP disinfection"></textarea>
    <div class="row gap8" style="margin-top:8px"><button class="btn" data-imp-read>Read pasted rows</button><span class="grow"></span><button class="link small" data-imp-tpl>Download a template</button></div>`;
  const step2 = () => {
    const [head, ...data] = rows;
    const sample = i => data.slice(0, 2).map(r => r[i] || '').filter(Boolean).join(' · ');
    return `<p class="muted">${data.length} row${data.length === 1 ? '' : 's'} found. Check which field each column goes into.</p>
      <div class="imp-map"><table class="grid compact"><thead><tr><th>Column in your file</th><th>Sample</th><th style="width:220px">Import as</th></tr></thead><tbody>
      ${head.map((h, i) => `<tr><td><b>${esc(h || `Column ${i + 1}`)}</b></td><td><span class="muted small ellip imp-sample">${esc(sample(i)) || '—'}</span></td><td>${selectHTML('m' + i, IMPORT_TARGETS.map(([value, label]) => ({ value, label })), map[i], { cls: 'sm-in', attrs: `data-imp-map="${i}"` })}</td></tr>`).join('')}</tbody></table></div>
      <h4>For every imported lead</h4><div class="form-grid">
        <label class="field"><span class="field-label">Stage (when not in the file)</span>${selectHTML('dstage', s.stages.map(x => ({ value: x.id, label: x.name })), s.stages[0].id)}</label>
        <label class="field"><span class="field-label">Owner (when not in the file)</span>${selectHTML('downer', userOptions(), Store.state.me, { blank: 'Unassigned' })}</label>
        <label class="field"><span class="field-label">Source (when not in the file)</span>${selectHTML('dsource', s.sources, '', { blank: 'None' })}</label>
        <label class="field"><span class="field-label">Add tags</span><input class="input" name="dtags" placeholder="e.g. Import Sep 2026, IndiaMART"></label></div>
      <label class="check"><input type="checkbox" name="skipdup" checked> Skip rows whose email or phone already belongs to a lead</label>`;
  };
  openModal({
    title: 'Import leads', width: 760, body: step1,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-imp-go disabled>Import</button>',
    onMount(el, api) {
      const body = el.querySelector('.modal-body'), go = el.querySelector('[data-imp-go]');
      const load = text => {
        const r = parseCSV(text || '');
        if (r.length < 2) { toast('Need a header row and at least one row of data', 'error'); return; }
        rows = r; map = guessImportMap(r[0]);
        body.innerHTML = step2(); go.disabled = false; go.textContent = `Import ${r.length - 1} lead${r.length === 2 ? '' : 's'}`;
      };
      el.addEventListener('change', async ev => {
        if (ev.target.matches('[data-imp-file]') && ev.target.files[0]) load(await ev.target.files[0].text());
        if (ev.target.dataset.impMap != null) map[Number(ev.target.dataset.impMap)] = ev.target.value;
      });
      el.addEventListener('click', ev => {
        if (ev.target.closest('[data-imp-read]')) load(el.querySelector('[data-imp-paste]').value);
        if (ev.target.closest('[data-imp-tpl]')) downloadCSV('leads-template.csv', [['Lead', 'Company', 'Contact name', 'Phone', 'Email', 'Estimated value', 'Source', 'Industry', 'City', 'Stage', 'Owner', 'Priority', 'Close date', 'Follow-up date', 'Tags', 'Description'], ['Gas chlorination system 10 kg/h', 'Metro Utilities', 'S. Balaji', '+91 90030 77889', 'ee.water@metroutilities.gov.in', '1850000', 'Website', 'Municipal', 'Chennai', 'New lead', '', 'High', '2026-10-30', '2026-09-28', 'Tender', 'Flow 500 m3/h']]);
      });
      go.addEventListener('click', () => {
        if (!rows) return;
        const f = formData(el);
        const res = importLeadRows(rows, map, { stageId: f.dstage, owner: f.downer || null, source: f.dsource, tags: f.dtags.split(/[,;]/).map(x => x.trim()).filter(Boolean), skipDup: f.skipdup });
        api.close(); Store.save();
        toast(`${res.added} lead${res.added === 1 ? '' : 's'} imported${res.dup ? ` · ${res.dup} duplicate${res.dup === 1 ? '' : 's'} skipped` : ''}${res.blank ? ` · ${res.blank} empty row${res.blank === 1 ? '' : 's'} skipped` : ''}`);
      });
    },
  });
}
function importLeadRows(rows, map, d) {
  const s = erpSet('crm'), e = erp(), me = Store.state.me;
  const emails = new Set(e.leads.map(l => (l.contact.email || '').trim().toLowerCase()).filter(Boolean));
  const phones = new Set(e.leads.map(l => phoneKey(l.contact.phone)).filter(Boolean));
  const findOpt = (list, v) => list.find(x => x.toLowerCase() === v.toLowerCase());
  const res = { added: 0, dup: 0, blank: 0 };
  quietly(() => rows.slice(1).forEach(r => {
    const get = k => { const i = map.indexOf(k); return i < 0 ? '' : String(r[i] || '').trim(); };
    const cname = [get('cname'), get('clast')].filter(Boolean).join(' ');
    const email = get('cemail'), phone = get('cphone');
    if (!get('title') && !get('company') && !cname && !phone && !email) { res.blank++; return; }
    if (d.skipDup && ((email && emails.has(email.toLowerCase())) || (phoneKey(phone) && phones.has(phoneKey(phone))))) { res.dup++; return; }
    const company = get('company') || cname || 'Unknown company';
    const title = get('title') || get('requirement').split('\n')[0].slice(0, 90) || `Enquiry from ${company}`;
    const st = get('stage') && s.stages.find(x => x.name.toLowerCase() === get('stage').toLowerCase());
    const ow = get('owner') && Store.state.users.find(u => u.name.toLowerCase() === get('owner').toLowerCase() || (u.initials || '').toLowerCase() === get('owner').toLowerCase());
    const pr = get('priority').toLowerCase();
    let source = get('source'), industry = get('industry');
    if (source) { source = findOpt(s.sources, source) || source; if (!s.sources.includes(source)) s.sources.push(source); }
    if (industry) { industry = findOpt(s.industries, industry) || industry; if (!s.industries.includes(industry)) s.industries.push(industry); }
    const cl = e.clients.find(c => c.name.trim().toLowerCase() === company.toLowerCase());
    const tags = [...new Set([...get('tags').split(/[,;]/).map(x => x.trim()).filter(Boolean), ...d.tags])];
    ensureTags(tags);
    const created = parseLooseDate(get('created'));
    const owner = ow ? ow.id : d.owner;
    const l = newLead({
      title, company: cl ? cl.name : company, clientId: cl ? cl.id : null, value: Number(get('value').replace(/[^0-9.]/g, '')) || 0,
      contact: { name: cname, phone, email }, source: source || d.source, industry, type: findOpt(LEAD_TYPES, get('type')) || 'System', city: get('city'),
      priority: /high|hot|urgent/.test(pr) ? 'high' : /low|cold/.test(pr) ? 'low' : 'medium', stageId: st ? st.id : d.stageId, owner,
      expected: parseLooseDate(get('expected')), followUp: parseLooseDate(get('followUp')), requirement: get('requirement'), tags,
    });
    if (created) { l.created = new Date(created + 'T09:00:00').toISOString(); l.log[0].at = l.created; }
    if (email) emails.add(email.toLowerCase());
    if (phoneKey(phone)) phones.add(phoneKey(phone));
    res.added++;
  }));
  if (res.added) erpLog('crm', `imported ${res.added} lead${res.added === 1 ? '' : 's'}`);
  return res;
}
