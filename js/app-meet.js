/* Meetings app: meetings, site visits, minutes and action items that turn into Taskspace work */

const MEET_ST = { scheduled: ['Scheduled', 'cat-progress'], minutes: ['Needs minutes', 'cat-warn'], done: ['Done', 'cat-done'], cancelled: ['Cancelled', 'cat-todo'] };
function meetStatus(m) { return m.status === 'scheduled' && m.date < todayStr() ? 'minutes' : m.status; }
function meetPill(m) { const s = MEET_ST[meetStatus(m)]; return pill(s[0], s[1]); }
function actionItem(a) { return a.itemId ? Store.item(a.itemId) : null; }
function actionDone(a) { const it = actionItem(a); return it ? Store.isDone(it) : !!a.done; }
function allActions() { return erp().meetings.flatMap(m => (m.actions || []).map(a => ({ m, a }))); }
function endTime(m) {
  if (!m.time) return '';
  const [h, mm] = m.time.split(':').map(Number), t = h * 60 + mm + (Number(m.duration) || 0);
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
function weekStart(d) { const x = parseYmd(d); return addDays(d, -((x.getDay() + 6) % 7)); }

registerApp({
  id: 'meet', name: 'Meetings', short: 'Meetings & site visits', desc: 'Schedule meetings and site visits, take minutes and turn action items into work', color: '#FCA700', glyph: 'video',
  tabs: [
    { id: 'summary', name: 'Summary', icon: 'globe' },
    { id: 'schedule', name: 'Schedule', icon: 'calendar' },
    { id: 'visits', name: 'Site visits', icon: 'pin' },
    { id: 'actions', name: 'Action items', icon: 'checklist', count: () => allActions().filter(x => !actionDone(x.a)).length },
    { id: 'settings', name: 'Settings', icon: 'gear' },
  ],
  primary(r) { return r.tab === 'visits' ? { label: 'Plan site visit', run: () => openMeeting(null, { kind: 'visit' }) } : { label: 'Schedule meeting', run: () => openMeeting(null) }; },
  shortcuts() {
    const t = todayStr(), me = Store.state.me, e = erp();
    return [
      { id: 'today', label: 'Today', icon: 'clock', href: '#/app/meet/schedule?when=today', count: e.meetings.filter(m => m.date === t && m.status !== 'cancelled').length },
      { id: 'mine', label: 'My meetings', icon: 'foryou', href: '#/app/meet/schedule?who=me', count: e.meetings.filter(m => m.attendees.includes(me) && m.date >= t && m.status === 'scheduled').length },
      { id: 'mins', label: 'Needs minutes', icon: 'edit', href: '#/app/meet/schedule?when=minutes', count: e.meetings.filter(m => meetStatus(m) === 'minutes').length },
      { id: 'myact', label: 'My action items', icon: 'checklist', href: '#/app/meet/actions?who=me', count: allActions().filter(x => x.a.owner === me && !actionDone(x.a)).length },
    ];
  },
  stats() {
    const t = todayStr(), e = erp();
    return [{ label: 'Today', value: e.meetings.filter(m => m.date === t && m.status !== 'cancelled').length }, { label: 'This week', value: e.meetings.filter(m => m.date >= weekStart(t) && m.date < addDays(weekStart(t), 7) && m.status !== 'cancelled').length }, { label: 'Open actions', value: allActions().filter(x => !actionDone(x.a)).length }];
  },
  create(anchor) { menu(anchor, [{ value: 'm', label: 'Meeting', icon: icon('video') }, { value: 'v', label: 'Site visit', icon: icon('pin') }], v => openMeeting(null, v === 'v' ? { kind: 'visit' } : {})); },
  render(tab, root, r) {
    if (tab === 'summary') return meetSummary(root);
    if (tab === 'schedule') return meetSchedule(root, r, null);
    if (tab === 'visits') return meetSchedule(root, r, 'visit');
    if (tab === 'actions') return meetActions(root, r);
    if (tab === 'settings') return meetSettings(root, r);
  },
});

/* ---------------- Summary ---------------- */
function meetSummary(root) {
  const e = erp(), t = todayStr(), ws = weekStart(t);
  const live = e.meetings.filter(m => m.status !== 'cancelled');
  const today = live.filter(m => m.date === t).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const week = live.filter(m => m.date >= ws && m.date < addDays(ws, 7));
  const visitsMonth = live.filter(m => m.kind === 'visit' && monthKey(m.date) === monthKey(t));
  const open = allActions().filter(x => !actionDone(x.a));
  const overdueAct = open.filter(x => x.a.due && x.a.due < t);
  const upcoming = live.filter(m => m.date >= t && m.status === 'scheduled').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 8);
  const weeks = []; for (let k = 7; k >= 0; k--) weeks.push(addDays(ws, -7 * k));
  const plat = {}; live.forEach(m => { const k = m.kind === 'visit' ? 'Site visit' : (m.platform || 'Other'); plat[k] = (plat[k] || 0) + 1; });
  const colors = ['var(--series-1)', 'var(--series-2)', '#82B536', '#C97CF4', '#42B2D7', '#E774BB', '#8C8F97'];
  const segs = Object.entries(plat).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: k, value: v, color: colors[i % colors.length] }));
  const needMin = e.meetings.filter(m => meetStatus(m) === 'minutes').sort((a, b) => b.date.localeCompare(a.date));
  root.innerHTML = `<div class="summary">
    <div class="stat-row">
      ${statCard('clock', today.length, 'Meetings today', today[0] ? `Next: ${esc(today.find(m => (m.time || '') >= nowHM()) ? fmtTime(today.find(m => (m.time || '') >= nowHM()).time) : 'all done')}` : 'Your day is clear', { href: '#/app/meet/schedule?when=today' })}
      ${statCard('calendar', week.length, 'This week', `${week.filter(m => m.kind === 'visit').length} site visit(s)`, { href: '#/app/meet/schedule' })}
      ${statCard('pin', visitsMonth.length, 'Site visits this month', moneyShort(visitsMonth.reduce((s, m) => s + (Number(m.fund) || 0), 0)) + ' travel budget', { href: '#/app/meet/visits' })}
      ${statCard('checklist', open.length, 'Open action items', overdueAct.length ? `${overdueAct.length} overdue` : 'None overdue', { tone: overdueAct.length ? 'warn' : '', href: '#/app/meet/actions' })}
    </div>
    <div class="sum-grid">
      ${panel('Coming up', 'Your next meetings and visits.', upcoming.length ? agendaHTML(upcoming, { compact: true }) : miniEmpty('Nothing scheduled.'), { action: '<a class="link small" href="#/app/meet/schedule">Full schedule</a>' })}
      ${panel('Open action items', 'Follow-ups agreed in meetings.', open.length ? `<div class="mini-list">${open.slice(0, 8).map(({ m, a }) => actionMiniRow(m, a)).join('')}</div>` : miniEmpty('No open action items.'), { action: '<a class="link small" href="#/app/meet/actions">All actions</a>' })}
      ${panel('Meetings per week', 'Last 8 weeks.', vbars(weeks.map(w => { const n = live.filter(m => m.date >= w && m.date < addDays(w, 7)).length; return { name: `Week of ${fmtDate(w)}`, label: fmtDate(w), value: n }; }), 170))}
      ${panel('How you meet', 'By platform, all time.', segs.length ? `<div class="donut-wrap">${donut(segs, live.length, 180, 'Meetings')}<ul class="legend-list">${segs.map(x => `<li><span class="sw" style="background:${x.color}"></span>${esc(x.label)}: <b>${x.value}</b></li>`).join('')}</ul></div>` : miniEmpty('No meetings yet.'))}
      ${panel('Needs minutes', 'Past meetings still marked as scheduled.', needMin.length ? `<div class="mini-list">${needMin.slice(0, 6).map(m => `<div class="mini-row" data-rec="meeting:${m.id}">${icon(m.kind === 'visit' ? 'pin' : 'video')}<span class="ellip grow">${esc(m.title)}</span><span class="muted small">${fmtDate(m.date)}</span><span class="btn sm">Add minutes</span></div>`).join('')}</div>` : miniEmpty('All caught up.'), { wide: true })}
    </div></div>`;
  bindActionToggles(root);
}
function actionMiniRow(m, a) {
  const it = actionItem(a), t = todayStr();
  return `<div class="mini-row static"><input type="checkbox" data-act-done="${m.id}:${a.id}" ${actionDone(a) ? 'checked' : ''} ${it ? 'disabled title="Tracked as a work item — finish it in Taskspace"' : ''}>
    <span class="ellip grow">${esc(a.text)}<span class="muted small"> · ${esc(m.title)}</span></span>${it ? `<a class="link small" data-open-item="${it.id}">${esc(it.key)}</a>` : ''}
    ${a.due ? `<span class="due-chip ${a.due < t && !actionDone(a) ? 'overdue' : ''}">${fmtDate(a.due)}</span>` : ''}${avatar(a.owner, 20)}</div>`;
}
function bindActionToggles(root) {
  root.addEventListener('change', e => {
    const k = e.target.dataset.actDone; if (!k) return;
    const [mid, aid] = k.split(':'); const a = (meeting(mid).actions || []).find(x => x.id === aid);
    a.done = e.target.checked; Store.save();
  });
  root.addEventListener('click', e => { const o = e.target.closest('[data-open-item]'); if (o) openItem(o.dataset.openItem); });
}

/* ---------------- Schedule (agenda + month) ---------------- */
function agendaHTML(list, { compact = false } = {}) {
  const t = todayStr();
  const byDay = {}; list.forEach(m => { (byDay[m.date] = byDay[m.date] || []).push(m); });
  return `<div class="agenda-list">${Object.keys(byDay).sort().map(d => `<div class="ag-day"><div class="ag-date ${d === t ? 'today' : ''}"><b>${parseYmd(d).getDate()}</b><span>${DOW[parseYmd(d).getDay()]}</span>${compact ? '' : `<span class="muted small">${MONTHS[parseYmd(d).getMonth()]}</span>`}</div>
    <div class="ag-items">${byDay[d].sort((a, b) => (a.time || '').localeCompare(b.time || '')).map(m => { const c = client(m.clientId);
      return `<div class="ag-item ${m.kind} st-${meetStatus(m)}" data-rec="meeting:${m.id}"><div class="ag-when">${m.time ? `${fmtTime(m.time)}<span class="muted small">${m.duration ? `${m.duration} min` : ''}</span>` : 'All day'}</div>
        <div class="grow ag-main"><div class="row gap8">${icon(m.kind === 'visit' ? 'pin' : 'video', 14)}<b class="ellip">${esc(m.title)}</b></div>
          <div class="muted small ellip">${esc(m.kind === 'visit' ? (m.location || 'Location not set') : (m.platform || ''))}${c ? ` · ${esc(c.name)}` : ''}${(m.actions || []).length ? ` · ${(m.actions || []).filter(a => !actionDone(a)).length} open action(s)` : ''}</div></div>
        <div class="av-row-sm">${m.attendees.slice(0, 4).map(u => avatar(u, 22)).join('')}${m.attendees.length > 4 ? `<span class="muted small">+${m.attendees.length - 4}</span>` : ''}</div>${meetPill(m)}</div>`; }).join('')}</div></div>`).join('')}</div>`;
}
function meetSchedule(root, r, kind) {
  const q = r.query || {}, t = todayStr(), me = Store.state.me;
  const base = `#/app/meet/${kind ? 'visits' : 'schedule'}`;
  const vs = ui('meet.' + (kind || 'all'), { view: 'agenda', month: monthKey(t), search: '' });
  if (q.view) vs.view = q.view;
  const when = q.when || 'upcoming';
  let list = erp().meetings.filter(m => !kind || m.kind === kind);
  if (q.who === 'me') list = list.filter(m => m.attendees.includes(me));
  if (vs.search) { const x = vs.search.toLowerCase(); list = list.filter(m => `${m.title} ${m.location} ${(client(m.clientId) || {}).name}`.toLowerCase().includes(x)); }
  const filtered = when === 'today' ? list.filter(m => m.date === t) : when === 'past' ? list.filter(m => m.date < t) : when === 'minutes' ? list.filter(m => meetStatus(m) === 'minutes') : when === 'all' ? list : list.filter(m => m.date >= t && m.status !== 'cancelled');
  if (when === 'past') filtered.sort((a, b) => b.date.localeCompare(a.date));
  const tabs = subtabs([['upcoming', 'Upcoming'], ['today', 'Today'], ['past', 'Past'], ['minutes', 'Needs minutes'], ['all', 'All']].map(([id, label]) => ({ id, label, href: `${base}?when=${id}${q.who ? '&who=' + q.who : ''}`, count: id === 'minutes' ? list.filter(m => meetStatus(m) === 'minutes').length : undefined })), when);
  let body;
  if (vs.view === 'month') {
    const mk = vs.month, first = parseYmd(`${mk}-01`), lead0 = (first.getDay() + 6) % 7;
    const cells = []; const start = addDays(`${mk}-01`, -lead0);
    for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
    body = `<div class="month-bar"><button class="icon-btn bordered" data-mm="-1">${icon('chevronLeft')}</button><b>${monthLabel(mk)}</b><button class="icon-btn bordered" data-mm="1">${icon('chevronRight')}</button><button class="btn sm" data-mm="0">Today</button></div>
      <div class="cal w7 meet-cal"><div class="cal-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div>${d}</div>`).join('')}</div><div class="cal-grid">${cells.map(d => {
        const ms = list.filter(m => m.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        return `<div class="cal-cell ${monthKey(d) !== mk ? 'other' : ''} ${d === t ? 'today' : ''}"><div class="cal-date"><span>${parseYmd(d).getDate()}</span><button class="icon-btn xs cal-add" data-new-on="${d}" title="Schedule on ${fmtDate(d)}">${icon('plus', 12)}</button></div>
          <div class="cal-items">${ms.slice(0, 3).map(m => `<div class="cal-chip meet-chip ${m.kind} ${meetStatus(m) === 'done' ? 'cat-done' : ''}" data-rec="meeting:${m.id}">${icon(m.kind === 'visit' ? 'pin' : 'video', 12)}<span class="ellip">${m.time ? fmtTime(m.time).replace(':00', '') + ' ' : ''}${esc(m.title)}</span></div>`).join('')}${ms.length > 3 ? `<span class="cal-more">+${ms.length - 3} more</span>` : ''}</div></div>`;
      }).join('')}</div></div>`;
  } else {
    body = filtered.length ? agendaHTML(filtered) : emptyState({ title: kind ? 'No site visits here' : 'No meetings here', text: kind ? 'Plan a site visit to record where you’re going, who’s going and the travel budget.' : 'Schedule a meeting and link it to a client, lead or project space.', art: kind ? 'pin' : 'video', action: `<button class="btn primary" data-new-on="${t}">${kind ? 'Plan site visit' : 'Schedule meeting'}</button>` });
  }
  root.innerHTML = `<div class="wide-page">${vs.view === 'agenda' ? tabs : ''}
    <div class="toolbar tight"><div class="search-sm">${icon('search')}<input placeholder="Search ${kind ? 'visits' : 'meetings'}" value="${esc(vs.search)}" data-ms data-keep="m-search"></div>
      ${q.who === 'me' ? `<span class="filter-chip">Only mine<a href="${base}" title="Clear">${icon('close', 12)}</a></span>` : ''}<span class="grow"></span>
      <div class="seg"><button class="${vs.view === 'agenda' ? 'on' : ''}" data-mv="agenda">${icon('list', 14)}&nbsp;Agenda</button><button class="${vs.view === 'month' ? 'on' : ''}" data-mv="month">${icon('calendar', 14)}&nbsp;Month</button></div></div>
    <div class="meet-body">${body}</div></div>`;
  root.addEventListener('input', e => { if (e.target.matches('[data-ms]')) { vs.search = e.target.value; render(); } });
  root.addEventListener('click', e => {
    const v = e.target.closest('[data-mv]'); if (v) { vs.view = v.dataset.mv; if (q.view) location.hash = base; else render(); return; }
    const mm = e.target.closest('[data-mm]'); if (mm) { const n = Number(mm.dataset.mm); vs.month = n ? shiftMonth(vs.month, n) : monthKey(t); render(); return; }
    const n = e.target.closest('[data-new-on]'); if (n) openMeeting(null, { date: n.dataset.newOn, kind: kind || 'meeting' });
  });
}

/* ---------------- Action items ---------------- */
function meetActions(root, r) {
  const q = r.query || {}, st = q.st || 'open', me = Store.state.me, t = todayStr();
  let list = allActions();
  if (q.who === 'me') list = list.filter(x => x.a.owner === me);
  const shown = st === 'open' ? list.filter(x => !actionDone(x.a)) : st === 'done' ? list.filter(x => actionDone(x.a)) : list;
  shown.sort((x, y) => (x.a.due || '9').localeCompare(y.a.due || '9'));
  const who = q.who ? `&who=${q.who}` : '';
  root.innerHTML = `<div class="wide-page">
    ${subtabs([{ id: 'open', label: 'Open', count: list.filter(x => !actionDone(x.a)).length, href: `#/app/meet/actions?st=open${who}` }, { id: 'done', label: 'Done', count: list.filter(x => actionDone(x.a)).length, href: `#/app/meet/actions?st=done${who}` }, { id: 'all', label: 'All', href: `#/app/meet/actions?st=all${who}` }], st)}
    <div class="toolbar tight"><a class="btn sm ${q.who === 'me' ? 'selected' : ''}" href="#/app/meet/actions?st=${st}${q.who === 'me' ? '' : '&who=me'}">${icon('foryou', 14)} Only mine</a><span class="grow"></span><span class="muted small">Turn an action into a work item to track it on a Taskspace board.</span></div>
    <div class="table-wrap"><table class="grid"><thead><tr><th style="width:40px"></th><th>Action</th><th style="width:170px">Owner</th><th style="width:110px">Due</th><th style="width:260px">From meeting</th><th style="width:200px">Work item</th></tr></thead>
    <tbody>${shown.map(({ m, a }) => { const it = actionItem(a); return `<tr><td><input type="checkbox" data-act-done="${m.id}:${a.id}" ${actionDone(a) ? 'checked' : ''} ${it ? 'disabled title="Finish it in Taskspace"' : ''}></td>
      <td><span class="${actionDone(a) ? 'strike muted' : ''}">${esc(a.text)}</span></td><td><span class="cell-in">${avatar(a.owner, 22)} <span class="ellip">${esc(personName(a.owner))}</span></span></td>
      <td><span class="cell-in ${a.due && a.due < t && !actionDone(a) ? 'overdue' : ''}">${a.due ? fmtDate(a.due) : '<span class="muted">—</span>'}</span></td>
      <td><button class="rec-chip" data-rec="meeting:${m.id}">${icon(m.kind === 'visit' ? 'pin' : 'video', 12)}<span class="ellip">${esc(m.title)}</span></button></td>
      <td>${it ? `<a class="cell-in link-plain" data-open-item="${it.id}">${typeIcon(it.type, 14)} ${esc(it.key)} ${lozenge(Store.statusOf(it))}</a>` : `<button class="btn subtle sm" data-to-item="${m.id}:${a.id}">${icon('plus', 12)} Create work item</button>`}</td></tr>`; }).join('')}</tbody></table>
    ${!shown.length ? emptyState({ title: st === 'open' ? 'No open action items' : 'Nothing here', text: 'Add action items to a meeting’s minutes and they appear here.', art: 'checklist' }) : ''}</div></div>`;
  bindActionToggles(root);
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-to-item]'); if (!b) return;
    const [mid, aid] = b.dataset.toItem.split(':'); const m = meeting(mid);
    pickSpaceThen(b, m, sp => { actionToWorkItem(m, m.actions.find(x => x.id === aid), sp.id); Store.save(); });
  });
}
function pickSpaceThen(anchor, m, fn) {
  const sp = m.spaceId && Store.space(m.spaceId);
  if (sp) { fn(sp); return; }
  const sps = Store.state.spaces;
  if (!sps.length) { toast('Create a space in Taskspace first', 'error'); return; }
  menu(anchor, [{ heading: 'Add to which space?' }, ...sps.map(s => ({ value: s.id, label: esc(s.name), icon: spaceAvatar(s, 18) }))], v => fn(Store.space(v)), { width: 280 });
}
function actionToWorkItem(m, a, spaceId) {
  if (!a || a.itemId) return;
  const it = Store.createItem({ spaceId, summary: a.text, assignee: a.owner || null, due: a.due || null, description: `From ${m.kind === 'visit' ? 'site visit' : 'meeting'} "${m.title}" on ${fmtDate(m.date)}.` }, true);
  a.itemId = it.id;
  if (a.owner && a.owner !== Store.state.me) Store.notify(a.owner, it, `You were assigned ${it.key} from "${m.title}"`);
  erpLog('meet', `turned an action from "${m.title}" into ${it.key}`, { type: 'meeting', id: m.id });
  toast(`${it.key} created in ${Store.space(spaceId).name}`);
}

/* ---------------- Meeting editor ---------------- */
function openMeeting(id, preset = {}) {
  const ms = erpSet('meet'), me = Store.state.me;
  const existing = id && meeting(id);
  if (id && !existing) return;
  if (existing) touchRecord('meeting', id);
  const w = existing ? JSON.parse(JSON.stringify(existing)) : Object.assign({
    id: uid('mt'), kind: 'meeting', title: '', date: todayStr(), time: '', duration: ms.defaultDuration, platform: ms.platforms[0] || '', link: '', location: '', attendees: [me],
    clientId: null, leadId: null, spaceId: null, purpose: '', notes: '', actions: [], fund: 0, status: 'scheduled', created: nowISO(),
  }, preset);
  if (!existing && w.kind === 'visit' && !preset.platform) w.platform = 'In person';
  if (!existing && w.leadId && !w.clientId) { const l = lead(w.leadId); if (l) w.clientId = l.clientId; }
  let api;
  const leadOpts = () => erp().leads.filter(l => !w.clientId || l.clientId === w.clientId || l.id === w.leadId).map(l => ({ value: l.id, label: `LD-${l.no} · ${l.title}` }));
  const linksHTML = () => `<div class="form-grid three">
    <label class="field"><span class="field-label">Client</span>${selectHTML('clientId', erp().clients.map(c => ({ value: c.id, label: c.name })), w.clientId, { blank: 'None' })}</label>
    <label class="field"><span class="field-label">Lead</span>${selectHTML('leadId', leadOpts(), w.leadId, { blank: 'None' })}</label>
    <label class="field"><span class="field-label">Project space</span>${selectHTML('spaceId', Store.state.spaces.map(s => ({ value: s.id, label: s.name })), w.spaceId, { blank: 'None' })}</label></div>`;
  const whereHTML = () => w.kind === 'visit'
    ? `<div class="form-grid"><label class="field"><span class="field-label">Location</span><input class="input" name="location" value="${esc(w.location || '')}" placeholder="Site address"></label>
        <label class="field"><span class="field-label">Map link</span><input class="input" name="link" value="${esc(w.link || '')}" placeholder="https://maps…"></label>
        <label class="field"><span class="field-label">Travel budget (${esc(erpSet('sales').currency)})</span><input class="input" type="number" min="0" name="fund" value="${esc(w.fund || '')}"></label></div>`
    : `<div class="form-grid"><label class="field"><span class="field-label">Platform</span>${selectHTML('platform', ms.platforms, w.platform)}</label>
        <label class="field"><span class="field-label">${w.platform === 'In person' ? 'Location' : 'Meeting link'}</span><input class="input" name="${w.platform === 'In person' ? 'location' : 'link'}" value="${esc(w.platform === 'In person' ? w.location || '' : w.link || '')}" placeholder="${w.platform === 'In person' ? 'Where?' : 'https://'}"></label></div>`;
  const attHTML = () => `<div class="att-pick">${Store.state.users.map(u => `<button class="att-chip ${w.attendees.includes(u.id) ? 'on' : ''}" data-att-t="${u.id}">${avatar(u.id, 22)}<span>${esc(u.name.split(' ')[0])}</span>${w.attendees.includes(u.id) ? icon('check', 12) : ''}</button>`).join('')}</div>`;
  const actionsHTML = () => `<div class="act-list">${w.actions.map((a, i) => { const it = actionItem(a); return `<div class="act-edit">
      <input type="checkbox" data-ai="${i}" data-ak="done" ${actionDone(a) ? 'checked' : ''} ${it ? 'disabled' : ''}>
      <input class="input cell grow" data-ai="${i}" data-ak="text" value="${esc(a.text)}" placeholder="What needs to happen?">
      ${selectHTML('owner', userOptions(), a.owner, { blank: 'Owner', cls: 'cell', attrs: `data-ai="${i}" data-ak="owner" style="width:150px"` })}
      <input class="input cell" type="date" data-ai="${i}" data-ak="due" value="${esc(a.due || '')}" style="width:150px">
      ${it ? `<a class="rec-chip" data-open-item="${it.id}">${typeIcon(it.type, 12)} ${esc(it.key)}</a>` : `<button class="btn subtle sm" data-ai-item="${i}" title="Create a Taskspace work item">${icon('plus', 12)} Work item</button>`}
      <button class="icon-btn xs" data-ai-del="${i}">${icon('trash', 14)}</button></div>`; }).join('')}</div>
    <button class="btn subtle sm" data-ai-add>${icon('plus', 12)} Add action item</button>`;
  const footer = () => `${existing ? `<button class="btn subtle danger-text" data-mt="delete">${icon('trash', 14)}</button>` : ''}
    ${existing && w.status === 'scheduled' ? '<button class="btn subtle" data-mt="cancel">Cancel meeting</button>' : ''}
    <span class="grow"></span>
    ${w.link && w.kind !== 'visit' ? `<a class="btn" href="${esc(w.link)}" target="_blank" rel="noopener">${icon('video', 14)} Join</a>` : ''}
    <button class="btn ${existing && w.status === 'scheduled' ? '' : 'primary'}" data-mt="save">${existing ? 'Save' : w.kind === 'visit' ? 'Plan visit' : 'Schedule'}</button>
    ${existing && w.status !== 'done' ? '<button class="btn primary" data-mt="done">Save &amp; mark done</button>' : ''}`;
  api = openModal({
    title: null, width: 860, cls: 'doc-modal meet-modal',
    body: `<div class="doc-head"><div>${icon(w.kind === 'visit' ? 'pin' : 'video', 20)}</div><div class="grow">
        <input class="rec-title" name="title" value="${esc(w.title)}" placeholder="${w.kind === 'visit' ? 'Site visit – where and why' : 'Meeting title'}" autofocus></div>
        ${existing ? meetPill(existing) : `<div class="seg" data-kind><button class="${w.kind === 'meeting' ? 'on' : ''}" data-k="meeting">Meeting</button><button class="${w.kind === 'visit' ? 'on' : ''}" data-k="visit">Site visit</button></div>`}</div>
      <div class="form-grid three"><label class="field"><span class="field-label">Date <span class="req">*</span></span><input class="input" type="date" name="date" value="${esc(w.date)}"></label>
        <label class="field"><span class="field-label">Start time</span><input class="input" type="time" name="time" value="${esc(w.time || '')}"></label>
        <label class="field"><span class="field-label">Duration (min)</span><input class="input" type="number" min="0" step="15" name="duration" value="${esc(w.duration || '')}"></label></div>
      <div data-where>${whereHTML()}</div>
      <div class="field"><span class="field-label">Attendees</span><div data-att>${attHTML()}</div></div>
      <div data-links>${linksHTML()}</div>
      <label class="field"><span class="field-label">Agenda / purpose</span><textarea class="input" rows="2" name="purpose">${esc(w.purpose || '')}</textarea></label>
      ${existing ? `<div class="sep"></div><h3>Minutes</h3><label class="field"><textarea class="input" rows="5" name="notes" placeholder="What was discussed and decided">${esc(w.notes || '')}</textarea></label>
      <h3 style="margin-bottom:8px">Action items</h3><div data-actions>${actionsHTML()}</div>` : '<p class="muted small">You can add minutes and action items after the meeting.</p>'}`,
    footer: footer(),
    onMount(el, a) {
      api = a;
      el.addEventListener('input', e => {
        const i = e.target.dataset.ai, k = e.target.dataset.ak;
        if (i != null && k === 'text') w.actions[Number(i)].text = e.target.value;
      });
      el.addEventListener('change', e => {
        const n = e.target.name, i = e.target.dataset.ai, k = e.target.dataset.ak;
        if (i != null) { const x = w.actions[Number(i)]; x[k] = k === 'done' ? e.target.checked : e.target.value || (k === 'owner' || k === 'due' ? null : ''); return; }
        if (n === 'clientId') { w.clientId = e.target.value || null; if (w.leadId && (lead(w.leadId) || {}).clientId !== w.clientId) w.leadId = null; el.querySelector('[data-links]').innerHTML = linksHTML(); }
        if (n === 'leadId') { w.leadId = e.target.value || null; const l = lead(w.leadId); if (l && l.clientId) w.clientId = l.clientId; el.querySelector('[data-links]').innerHTML = linksHTML(); }
        if (n === 'spaceId') w.spaceId = e.target.value || null;
        if (n === 'platform') { grab(); w.platform = e.target.value; el.querySelector('[data-where]').innerHTML = whereHTML(); }
      });
      el.addEventListener('click', async e => {
        const kb = e.target.closest('[data-k]'); if (kb) { grab(); w.kind = kb.dataset.k; if (w.kind === 'visit') w.platform = 'In person'; $$('[data-k]', el).forEach(x => x.classList.toggle('on', x === kb)); el.querySelector('[data-where]').innerHTML = whereHTML(); return; }
        const at = e.target.closest('[data-att-t]'); if (at) { const u = at.dataset.attT; w.attendees = w.attendees.includes(u) ? w.attendees.filter(x => x !== u) : [...w.attendees, u]; el.querySelector('[data-att]').innerHTML = attHTML(); return; }
        if (e.target.closest('[data-ai-add]')) { w.actions.push({ id: uid('ac'), text: '', owner: null, due: null, done: false, itemId: null }); el.querySelector('[data-actions]').innerHTML = actionsHTML(); const ins = $$('[data-ak="text"]', el); ins[ins.length - 1].focus(); return; }
        const del = e.target.closest('[data-ai-del]'); if (del) { w.actions.splice(Number(del.dataset.aiDel), 1); el.querySelector('[data-actions]').innerHTML = actionsHTML(); return; }
        const oi = e.target.closest('[data-open-item]'); if (oi) { openItem(oi.dataset.openItem); return; }
        const ai = e.target.closest('[data-ai-item]');
        if (ai) {
          const x = w.actions[Number(ai.dataset.aiItem)];
          if (!x.text.trim()) { toast('Write the action first', 'error'); return; }
          pickSpaceThen(ai, w, sp => { if (!commit()) return; const real = meeting(w.id).actions.find(y => y.id === x.id); actionToWorkItem(meeting(w.id), real, sp.id); x.itemId = real.itemId; Store.save(); el.querySelector('[data-actions]').innerHTML = actionsHTML(); });
          return;
        }
        const b = e.target.closest('[data-mt]'); if (!b) return;
        const act = b.dataset.mt;
        if (act === 'delete') {
          if (await confirmDialog({ title: `Delete "${existing.title}"?`, message: 'The meeting and its minutes are deleted. Work items created from it are kept.' })) { erp().meetings = erp().meetings.filter(x => x !== existing); erpLog('meet', `deleted "${existing.title}"`); Store.save(); api.close(); }
          return;
        }
        if (act === 'cancel') { w.status = 'cancelled'; if (commit()) { notifyAttendees(w, `was cancelled`); Store.save(); api.close(); toast('Meeting cancelled'); } return; }
        if (act === 'done') w.status = 'done';
        if (commit()) { Store.save(); api.close(); toast(existing ? (act === 'done' ? 'Marked as done' : 'Saved') : `${w.kind === 'visit' ? 'Site visit planned' : 'Meeting scheduled'} for ${fmtDate(w.date)}`); }
      });
      function grab() {
        const f = formData(el);
        ['title', 'date', 'time', 'purpose', 'location', 'link', 'notes'].forEach(k => { if (k in f) w[k] = f[k]; });
        if ('duration' in f) w.duration = Number(f.duration) || 0;
        if ('fund' in f) w.fund = Number(f.fund) || 0;
      }
      function commit() {
        grab();
        if (!w.title.trim()) { const t = el.querySelector('[name=title]'); t.classList.add('invalid'); t.focus(); toast('Give it a title', 'error'); return false; }
        if (!w.date) { toast('Pick a date', 'error'); return false; }
        w.title = w.title.trim();
        w.actions = w.actions.filter(x => x.text.trim());
        if (existing) {
          const was = existing.date + existing.time;
          Object.assign(existing, w);
          if (was !== w.date + w.time && w.status === 'scheduled') notifyAttendees(w, `moved to ${fmtDate(w.date)}${w.time ? ' at ' + fmtTime(w.time) : ''}`);
          erpLog('meet', `updated "${w.title}"`, { type: 'meeting', id: w.id });
        } else {
          erp().meetings.push(w);
          notifyAttendees(w, `on ${fmtDate(w.date)}${w.time ? ' at ' + fmtTime(w.time) : ''} — you're invited`);
          erpLog('meet', `scheduled "${w.title}"`, { type: 'meeting', id: w.id });
          const l = lead(w.leadId); if (l) leadLog(l, `scheduled ${w.kind === 'visit' ? 'a site visit' : 'a meeting'} for ${fmtDate(w.date)}`);
        }
        return true;
      }
    },
  });
}
function notifyAttendees(m, what) {
  m.attendees.filter(u => u !== Store.state.me).forEach(u => Store.notify(u, null, `${m.kind === 'visit' ? '📍' : '📅'} "${m.title}" ${what}`));
}

/* ---------------- Settings ---------------- */
function meetSettings(root, r) {
  const ms = erpSet('meet');
  appSettingsPage(appById('meet'), root, r, [
    {
      id: 'general', name: 'Defaults', icon: 'sliders',
      html: () => `<h2>Defaults</h2><p class="muted">Used when you schedule something new.</p>
        <div class="panel settings-panel"><label class="field"><span class="field-label">Default duration (minutes)</span><input class="input narrow" type="number" min="15" step="15" data-setting="meet.defaultDuration" value="${ms.defaultDuration}"></label>
          <label class="toggle-row"><input type="checkbox" data-setting="meet.remindToday" ${ms.remindToday !== false ? 'checked' : ''}><span class="toggle"></span><span>Remind me about today’s meetings when I open the app</span></label></div>`,
    },
    { id: 'platforms', name: 'Platforms', icon: 'video', html: () => `<h2>Platforms</h2><p class="muted">Ways you meet. "In person" asks for a location instead of a link.</p><div class="panel settings-panel">${listEditorHTML('platforms', ms.platforms, 'Add a platform')}</div>`, bind: el => bindListEditor(el, () => ms.platforms, () => render()) },
  ]);
}
