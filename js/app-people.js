/* People app: employees (the same people you assign work to), attendance, leave, payroll, announcements */

const LEAVE_TYPES = { casual: 'Casual leave', sick: 'Sick leave', unpaid: 'Unpaid leave' };
const LEAVE_ST = { pending: ['Pending', 'cat-progress'], approved: ['Approved', 'cat-done'], declined: ['Declined', 'cat-danger'], cancelled: ['Cancelled', 'cat-todo'] };
const WORK_MODES = { office: 'Office', remote: 'Remote', site: 'On site' };
const DAY_ST = {
  present: ['Present', 'cat-done'], late: ['Late', 'cat-warn'], leave: ['On leave', 'cat-leave'], half: ['Half day', 'cat-leave'],
  absent: ['Absent', 'cat-danger'], off: ['Week off', 'cat-todo'], holiday: ['Holiday', 'cat-todo'], future: ['—', ''], none: ['Not in yet', 'cat-todo'],
};

/* ---------------- people data ---------------- */
function empRecord(userId) { return erp().employees.find(e => e.userId === userId) || null; }
function empEnsure(userId) {
  let r = empRecord(userId);
  if (!r) { r = { userId, empId: '', designation: '', email: '', phone: '', joined: '', salary: 0, office: '' }; erp().employees.push(r); }
  return r;
}
function peopleList() { return Store.state.users.slice().sort((a, b) => (a.id === Store.state.me ? -1 : b.id === Store.state.me ? 1 : a.name.localeCompare(b.name))); }
function holidayOn(d) { return erp().holidays.find(h => h.date === d) || null; }
function isWorkday(d) { return !erpSet('people').weekOff.includes(parseYmd(d).getDay()) && !holidayOn(d); }
function attOf(userId, d) { return erp().attendance.find(a => a.userId === userId && a.date === d) || null; }
function isLate(rec) { return rec && rec.in && rec.in > erpSet('people').lateCutoff; }
function hoursOf(rec) {
  if (!rec || !rec.in || !rec.out) return 0;
  const m = s => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  return Math.max(0, (m(rec.out) - m(rec.in)) / 60);
}
function leaveDays(l) {
  const out = [];
  for (let d = l.from; d <= l.to; d = addDays(d, 1)) if (isWorkday(d)) out.push({ date: d, weight: l.half ? 0.5 : 1 });
  return out;
}
function quarterKey(d) { return `${d.slice(0, 4)}-Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`; }
function quarterLabel(d) { const q = Math.ceil(Number(d.slice(5, 7)) / 3); return `Q${q} ${d.slice(0, 4)} (${MONTHS[(q - 1) * 3]}–${MONTHS[q * 3 - 1]})`; }
/* approved leave, day by day, split into paid (within the quarterly quota) and unpaid */
function leaveLedger(userId) {
  const quota = Number(erpSet('people').leaveQuota) || 0;
  const used = {}, map = {};
  erp().leaves.filter(l => l.userId === userId && l.status === 'approved').sort((a, b) => a.from.localeCompare(b.from)).forEach(l => {
    leaveDays(l).forEach(({ date, weight }) => {
      const q = quarterKey(date);
      used[q] = used[q] || 0;
      let paid = 0;
      if (l.type !== 'unpaid') { paid = Math.min(weight, Math.max(0, quota - used[q])); used[q] += paid; }
      map[date] = { paid, unpaid: weight - paid, weight, leave: l };
    });
  });
  return { map, used, quota };
}
function leaveBalance(userId, d = todayStr()) { const { used, quota } = leaveLedger(userId); return Math.max(0, quota - (used[quarterKey(d)] || 0)); }
function dayStatus(userId, d) {
  const rec = attOf(userId, d), t = todayStr();
  const lv = leaveLedger(userId).map[d];
  if (rec && rec.in) return { code: lv && lv.weight < 1 ? 'half' : isLate(rec) ? 'late' : 'present', rec, lv };
  if (lv) return { code: lv.weight < 1 ? 'half' : 'leave', lv };
  if (holidayOn(d)) return { code: 'holiday', holiday: holidayOn(d) };
  if (!isWorkday(d)) return { code: 'off' };
  if (d > t) return { code: 'future' };
  if (d === t) return { code: 'none' };
  return { code: 'absent' };
}
function dayPill(st) { const s = DAY_ST[st.code]; return s[1] ? pill(st.code === 'holiday' ? st.holiday.name : s[0], s[1]) : '<span class="muted">—</span>'; }
function payroll(userId, mk) {
  const emp = empRecord(userId) || {};
  const base = Number(emp.salary) || 0, t = todayStr();
  const { map } = leaveLedger(userId);
  let working = 0, counted = 0, present = 0, paidLeave = 0, unpaidLeave = 0, absent = 0, late = 0;
  for (let i = 1; i <= daysInMonth(mk); i++) {
    const d = `${mk}-${String(i).padStart(2, '0')}`;
    if (!isWorkday(d)) continue;
    working++;
    if (d > t) continue; // days still to come aren't counted against anyone
    counted++;
    if (emp.joined && d < emp.joined) { absent++; continue; }
    const rec = attOf(userId, d), lv = map[d];
    if (rec && rec.in) { present += lv ? 1 - lv.weight : 1; if (isLate(rec)) late++; if (lv) { paidLeave += lv.paid; unpaidLeave += lv.unpaid; } }
    else if (lv) { paidLeave += lv.paid; unpaidLeave += lv.unpaid; absent += 1 - lv.weight; }
    else if (d < t) absent++;
  }
  const lop = unpaidLeave + absent;
  const perDay = working ? base / working : 0;
  const adj = Number((erp().salaryAdj || {})[`${userId}:${mk}`]) || 0;
  const lopAmt = Math.min(base, perDay * lop);
  return { base, working, counted, present, paidLeave, unpaidLeave, absent, late, lop, lopAmt, adj, net: Math.max(0, base - lopAmt + adj) };
}
function checkIn(mode = 'office') {
  const t = todayStr(), me = Store.state.me;
  if (attOf(me, t)) return;
  const rec = { id: uid('at'), userId: me, date: t, in: nowHM(), out: '', mode };
  erp().attendance.push(rec);
  erpLog('people', `checked in at ${fmtTime(rec.in)}${mode !== 'office' ? ` (${WORK_MODES[mode].toLowerCase()})` : ''}`, { type: 'employee', id: me });
  Store.save();
  toast(isLate(rec) ? `Checked in at ${fmtTime(rec.in)} — after the ${fmtTime(erpSet('people').lateCutoff)} cutoff` : `Checked in at ${fmtTime(rec.in)}. Have a good day!`, isLate(rec) ? 'error' : 'info');
}
function checkOut() {
  const rec = attOf(Store.state.me, todayStr());
  if (!rec || rec.out) return;
  rec.out = nowHM();
  erpLog('people', `checked out at ${fmtTime(rec.out)}`, { type: 'employee', id: Store.state.me });
  Store.save();
  toast(`Checked out at ${fmtTime(rec.out)} · ${hoursOf(rec).toFixed(1)} h today`);
}

registerApp({
  id: 'people', name: 'People', short: 'HR & attendance', desc: 'Employees, attendance, leave, payroll and team announcements', color: '#C97CF4', glyph: 'people',
  tabs: [
    { id: 'summary', name: 'Summary', icon: 'globe' },
    { id: 'employees', name: 'Employees', icon: 'people' },
    { id: 'attendance', name: 'Attendance', icon: 'clock' },
    { id: 'leave', name: 'Leave', icon: 'plane', count: () => erp().leaves.filter(l => l.status === 'pending').length },
    { id: 'payroll', name: 'Payroll', icon: 'wallet' },
    { id: 'announcements', name: 'Announcements', icon: 'megaphone' },
    { id: 'settings', name: 'Settings', icon: 'gear' },
  ],
  primary(r) {
    if (r.tab === 'leave') return { label: 'Request leave', run: () => openLeaveRequest() };
    if (r.tab === 'announcements') return { label: 'New announcement', run: () => openAnnouncement() };
    return { label: 'Add employee', run: () => openEmployeeModal(null) };
  },
  shortcuts() {
    const me = Store.state.me, rec = attOf(me, todayStr());
    return [
      rec && !rec.out ? { id: 'out', label: `Check out (in since ${fmtTime(rec.in)})`, icon: 'logout', run: () => checkOut() } : rec ? { id: 'done', label: `Checked out ${fmtTime(rec.out)}`, icon: 'checkCircle', href: '#/app/people/attendance' } : { id: 'in', label: 'Check in now', icon: 'login', run: () => checkIn() },
      { id: 'req', label: 'Request leave', icon: 'plane', run: () => openLeaveRequest() },
      { id: 'pend', label: 'Leave to approve', icon: 'approvals', href: '#/app/people/leave?st=pending', count: erp().leaves.filter(l => l.status === 'pending').length },
      { id: 'reg', label: 'Today’s register', icon: 'list', href: '#/app/people/attendance?view=day' },
    ];
  },
  stats() {
    const t = todayStr();
    return [{ label: 'People', value: peopleList().length }, { label: 'In today', value: erp().attendance.filter(a => a.date === t && a.in).length }, { label: 'Leave to approve', value: erp().leaves.filter(l => l.status === 'pending').length }];
  },
  create(anchor) { menu(anchor, [{ value: 'e', label: 'Employee', icon: icon('people') }, { value: 'l', label: 'Leave request', icon: icon('plane') }, { value: 'a', label: 'Announcement', icon: icon('megaphone') }], v => (v === 'e' ? openEmployeeModal(null) : v === 'l' ? openLeaveRequest() : openAnnouncement())); },
  render(tab, root, r) {
    if (tab === 'summary') return peopleSummary(root);
    if (tab === 'employees') return r.sub ? employeePage(root, r.sub) : peopleEmployees(root);
    if (tab === 'attendance') return peopleAttendance(root, r);
    if (tab === 'leave') return peopleLeave(root, r);
    if (tab === 'payroll') return peoplePayroll(root, r);
    if (tab === 'announcements') return peopleAnnouncements(root);
    if (tab === 'settings') return peopleSettings(root, r);
  },
});

/* ---------------- check-in card (summary + attendance) ---------------- */
function checkinCardHTML() {
  const me = Store.state.me, t = todayStr(), rec = attOf(me, t), ps = erpSet('people');
  const st = dayStatus(me, t);
  let body;
  if (!isWorkday(t) && !rec) body = `<div class="ci-state">${icon('sun', 20)} <div><b>${holidayOn(t) ? esc(holidayOn(t).name) : 'It’s your week off'}</b><div class="muted small">Check in anyway if you’re working today.</div></div></div>`;
  else if (st.code === 'leave') body = `<div class="ci-state">${icon('plane', 20)} <div><b>You’re on leave today</b><div class="muted small">${esc(LEAVE_TYPES[st.lv.leave.type])}</div></div></div>`;
  else if (!rec) body = `<div class="ci-state">${icon('clock', 20)} <div><b>You haven’t checked in</b><div class="muted small">Office hours ${fmtTime(ps.workStart)} – ${fmtTime(ps.workEnd)} · late after ${fmtTime(ps.lateCutoff)}</div></div></div>`;
  else body = `<div class="ci-state">${icon('checkCircle', 20)} <div><b>In at ${fmtTime(rec.in)}${rec.out ? ` · out at ${fmtTime(rec.out)}` : ''}</b><div class="muted small">${WORK_MODES[rec.mode] || 'Office'}${isLate(rec) ? ' · <span class="warn-text">late</span>' : ''}${rec.out ? ` · ${hoursOf(rec).toFixed(1)} h` : ''}</div></div></div>`;
  return `<div class="checkin-card"><div class="ci-clock"><div class="ci-time" data-clock>${fmtTime(nowHM())}</div><div class="muted small">${DOW_LONG[new Date().getDay()]}, ${fmtDate(t)}</div></div>${body}
    <div class="ci-actions">${!rec ? `<select class="input sm-select" data-ci-mode>${Object.entries(WORK_MODES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button class="btn primary" data-ci="in">${icon('login', 14)} Check in</button>` : !rec.out ? `<button class="btn primary" data-ci="out">${icon('logout', 14)} Check out</button>` : '<span class="done-chip">Done for today</span>'}</div></div>`;
}
function bindCheckin(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ci]');
    if (!b) return;
    if (b.dataset.ci === 'in') checkIn((root.querySelector('[data-ci-mode]') || {}).value || 'office');
    if (b.dataset.ci === 'out') checkOut();
  });
}

/* ---------------- Summary ---------------- */
function peopleSummary(root) {
  const e = erp(), t = todayStr(), ppl = peopleList();
  const today = ppl.map(u => ({ u, st: dayStatus(u.id, t) }));
  const inToday = today.filter(x => ['present', 'late', 'half'].includes(x.st.code));
  const onLeave = today.filter(x => ['leave', 'half'].includes(x.st.code));
  const pending = e.leaves.filter(l => l.status === 'pending');
  const days = []; for (let d = t, n = 0; n < 10 && d > addDays(t, -30); d = addDays(d, -1)) if (isWorkday(d)) { days.unshift(d); n++; }
  const byDesig = {}; ppl.forEach(u => { const k = (empRecord(u.id) || {}).designation || 'Not set'; byDesig[k] = (byDesig[k] || 0) + 1; });
  const out = e.leaves.filter(l => l.status === 'approved' && l.to >= t && l.from <= addDays(t, 14)).sort((a, b) => a.from.localeCompare(b.from));
  const load = ppl.map(u => ({ u, n: Store.state.items.filter(i => i.assignee === u.id && !Store.isDone(i)).length })).filter(x => x.n);
  const anns = e.announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at)).slice(0, 3);
  root.innerHTML = `<div class="summary">
    ${checkinCardHTML()}
    <div class="stat-row">
      ${statCard('people', ppl.length, 'People', `${Object.keys(byDesig).length} team${Object.keys(byDesig).length === 1 ? '' : 's'}`, { href: '#/app/people/employees' })}
      ${statCard('checkCircle', `${inToday.length}<span class="unit">/${ppl.length}</span>`, 'In today', `${today.filter(x => x.st.code === 'late').length} late`, { tone: 'good', href: '#/app/people/attendance?view=day' })}
      ${statCard('plane', onLeave.length, 'On leave today', out.length ? `${out.length} leave(s) in the next 2 weeks` : 'No upcoming leave')}
      ${statCard('approvals', pending.length, 'Leave to approve', pending.length ? 'Waiting on a decision' : 'All caught up', { tone: pending.length ? 'warn' : '', href: '#/app/people/leave?st=pending' })}
    </div>
    <div class="sum-grid">
      ${panel('Today', 'Where everyone is right now.', `<div class="mini-list">${today.map(x => `<a class="mini-row" href="#/app/people/employees/${x.u.id}">${avatar(x.u.id, 28)}<span class="grow ellip"><b>${esc(x.u.name)}</b><span class="muted small"> · ${esc((empRecord(x.u.id) || {}).designation || '')}</span></span>${x.st.rec ? `<span class="muted small">${fmtTime(x.st.rec.in)}${x.st.rec.out ? ' – ' + fmtTime(x.st.rec.out) : ''}</span>` : ''}${dayPill(x.st)}</a>`).join('')}</div>`, { action: '<a class="link small" href="#/app/people/attendance?view=day">Open register</a>' })}
      ${panel('Attendance trend', 'People in, on the last 10 working days.', vbars(days.map(d => { const n = ppl.filter(u => ['present', 'late', 'half'].includes(dayStatus(u.id, d).code)).length; return { name: fmtDate(d), label: `${DOW[parseYmd(d).getDay()].slice(0, 2)} ${parseYmd(d).getDate()}`, value: n, tip: `${DOW_LONG[parseYmd(d).getDay()]} ${fmtDate(d)}: ${n} of ${ppl.length} in`, color: 'var(--cat-done-mark)' }; }), 170))}
      ${panel('Leave to approve', '', pending.length ? `<div class="mini-list">${pending.map(l => leaveRowMini(l, true)).join('')}</div>` : miniEmpty('No leave requests waiting.'), { action: '<a class="link small" href="#/app/people/leave">All leave</a>' })}
      ${panel('Who’s out', 'Approved leave in the next 2 weeks.', out.length ? `<div class="mini-list">${out.map(l => leaveRowMini(l)).join('')}</div>` : miniEmpty('Nobody is out in the next 2 weeks.'))}
      ${panel('Work in Taskspace', 'Open work items assigned to each person.', load.length ? hbars(load.map(x => ({ label: `${avatar(x.u.id, 20)} <span class="ellip">${esc(x.u.name)}</span>`, value: x.n, tip: `${x.n} open work item${x.n === 1 ? '' : 's'}` })), Math.max(...load.map(x => x.n))) : miniEmpty('No open work is assigned yet.'))}
      ${panel('Announcements', '', anns.length ? anns.map(a => `<div class="ann-mini">${a.pinned ? `<span class="pin-tag">${icon('pin', 12)} Pinned</span>` : ''}<b>${esc(a.title)}</b><div class="muted small clamp2">${esc(a.message)}</div><div class="muted small">${esc(personName(a.by, ''))} · ${timeAgo(a.at)}</div></div>`).join('') : miniEmpty('No announcements yet.'), { action: '<a class="link small" href="#/app/people/announcements">View all</a>' })}
    </div></div>`;
  bindCheckin(root);
  bindLeaveDecisions(root);
}
function leaveRowMini(l, actions = false) {
  const n = leaveDays(l).reduce((s, x) => s + x.weight, 0);
  return `<div class="mini-row static">${avatar(l.userId, 24)}<span class="grow ellip"><b>${esc(personName(l.userId, ''))}</b><span class="muted small"> · ${esc(LEAVE_TYPES[l.type])} · ${fmtDate(l.from)}${l.to !== l.from ? ` – ${fmtDate(l.to)}` : ''} (${n} day${n === 1 ? '' : 's'})</span></span>
    ${actions ? `<button class="btn sm" data-lv-dec="declined:${l.id}">Decline</button><button class="btn primary sm" data-lv-dec="approved:${l.id}">Approve</button>` : pill(LEAVE_ST[l.status][0], LEAVE_ST[l.status][1])}</div>`;
}
function bindLeaveDecisions(root) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-lv-dec]');
    if (!b) return;
    const [st, id] = b.dataset.lvDec.split(':');
    decideLeave(erp().leaves.find(l => l.id === id), st);
  });
}
function decideLeave(l, st) {
  if (!l) return;
  l.status = st; l.decidedBy = Store.state.me; l.decidedAt = nowISO();
  const n = leaveDays(l).reduce((s, x) => s + x.weight, 0);
  const txt = `${LEAVE_TYPES[l.type]} for ${fmtDate(l.from)}${l.to !== l.from ? ` – ${fmtDate(l.to)}` : ''} (${n} day${n === 1 ? '' : 's'}) was ${st}`;
  erpLog('people', `${st} ${personName(l.userId, '')}'s leave`, { type: 'employee', id: l.userId });
  if (l.userId !== Store.state.me) Store.notify(l.userId, null, `Your ${txt} by ${Store.me().name}`);
  Store.save();
  toast(`${personName(l.userId, '')}’s leave ${st}`);
}

/* ---------------- Employees ---------------- */
function peopleEmployees(root) {
  const vs = ui('people.emps', { search: '', desig: '' });
  const t = todayStr();
  let list = peopleList();
  if (vs.search) { const x = vs.search.toLowerCase(); list = list.filter(u => { const r = empRecord(u.id) || {}; return `${u.name} ${r.empId} ${r.email} ${r.phone}`.toLowerCase().includes(x); }); }
  if (vs.desig) list = list.filter(u => (empRecord(u.id) || {}).designation === vs.desig);
  root.innerHTML = `<div class="wide-page">
    <div class="toolbar"><div class="search-sm">${icon('search')}<input placeholder="Search people" value="${esc(vs.search)}" data-ev data-keep="emp-search"></div>
      ${selectHTML('desig', erpSet('people').designations, vs.desig, { blank: 'All designations', cls: 'sm-select', attrs: 'data-ed' })}<span class="grow"></span>
      <span class="muted small">Everyone here can also be assigned work in Taskspace.</span></div>
    <div class="emp-grid">${list.map(u => { const r = empRecord(u.id) || {}; const st = dayStatus(u.id, t); const open = Store.state.items.filter(i => i.assignee === u.id && !Store.isDone(i)).length;
      return `<a class="emp-card" href="#/app/people/employees/${u.id}">${avatar(u.id, 56)}<b class="ellip">${esc(u.name)}${u.id === Store.state.me ? ' <span class="muted small">(you)</span>' : ''}</b>
        <span class="muted small">${esc(r.designation || 'No designation')}${r.empId ? ` · ${esc(r.empId)}` : ''}</span>${dayPill(st)}
        <div class="emp-meta"><span data-tip="Open work in Taskspace">${icon('checkCircle', 12)} ${open}</span><span data-tip="Leave left this quarter">${icon('plane', 12)} ${leaveBalance(u.id)}</span>${r.office ? `<span>${icon('pin', 12)} ${esc(r.office)}</span>` : ''}</div></a>`; }).join('')}
      <button class="emp-card add" data-emp-new>${icon('plus', 20)}<span>Add employee</span></button></div></div>`;
  root.addEventListener('input', e => { if (e.target.matches('[data-ev]')) { vs.search = e.target.value; render(); } });
  root.addEventListener('change', e => { if (e.target.matches('[data-ed]')) { vs.desig = e.target.value; render(); } });
  root.addEventListener('click', e => { if (e.target.closest('[data-emp-new]')) openEmployeeModal(null); });
}
function openEmployeeModal(userId) {
  const ps = erpSet('people');
  const u = userId && Store.user(userId), r = (userId && empRecord(userId)) || {};
  let color = u ? u.color : SPACE_COLORS[Store.state.users.length % SPACE_COLORS.length];
  const nextId = 'EMP' + String(erp().employees.length + 1).padStart(3, '0');
  openModal({
    title: u ? `Edit ${u.name}` : 'Add employee', width: 620, cls: 'create-modal',
    body: `<div class="form-grid">
        <label class="field"><span class="field-label">Full name <span class="req">*</span></span><input class="input" name="name" value="${esc(u ? u.name : '')}" autofocus></label>
        <label class="field"><span class="field-label">Employee ID</span><input class="input" name="empId" value="${esc(r.empId || (u ? '' : nextId))}"></label>
        <label class="field"><span class="field-label">Designation</span>${selectHTML('designation', ps.designations, r.designation, { blank: 'Choose…' })}</label>
        <label class="field"><span class="field-label">Office</span>${selectHTML('office', ps.offices, r.office, { blank: 'Choose…' })}</label>
        <label class="field"><span class="field-label">Email</span><input class="input" type="email" name="email" value="${esc(r.email || '')}"></label>
        <label class="field"><span class="field-label">Mobile</span><input class="input" name="phone" value="${esc(r.phone || '')}"></label>
        <label class="field"><span class="field-label">Joined on</span><input class="input" type="date" name="joined" value="${esc(r.joined || (u ? '' : todayStr()))}"></label>
        <label class="field"><span class="field-label">Monthly salary (${esc(erpSet('sales').currency)})</span><input class="input" type="number" min="0" step="500" name="salary" value="${esc(r.salary || '')}"></label>
      </div>
      <div class="field"><span class="field-label">Avatar color</span><div class="color-row">${SPACE_COLORS.map(c => `<button class="swatch ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>`,
    footer: `<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>${u ? 'Save' : 'Add employee'}</button>`,
    onMount(el, api) {
      el.addEventListener('click', e => { const c = e.target.closest('[data-color]'); if (c) { color = c.dataset.color; $$('.swatch', el).forEach(s => s.classList.toggle('on', s === c)); } });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el);
        if (!f.name.trim()) { el.querySelector('[name=name]').classList.add('invalid'); return; }
        let user = u;
        const initials = f.name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
        if (user) { user.name = f.name.trim(); user.color = color; if (!user.initials || user.id !== Store.state.me) user.initials = initials; }
        else { user = { id: uid('u'), name: f.name.trim(), initials, color }; Store.state.users.push(user); }
        Object.assign(empEnsure(user.id), { empId: f.empId, designation: f.designation, office: f.office, email: f.email, phone: f.phone, joined: f.joined, salary: Number(f.salary) || 0 });
        erpLog('people', u ? `updated ${user.name}'s profile` : `added ${user.name}`, { type: 'employee', id: user.id });
        Store.save(); api.close(); toast(u ? 'Saved' : `${user.name} added — you can assign them work in Taskspace too`);
      });
    },
  });
}
function employeePage(root, userId) {
  const u = Store.user(userId);
  if (!u) { root.innerHTML = emptyState({ title: 'Person not found', text: 'They may have been removed.', art: 'people', action: '<a class="btn" href="#/app/people/employees">Back to employees</a>' }); return; }
  touchRecord('employee', userId);
  const r = empRecord(userId) || {}, t = todayStr(), mk = monthKey(t);
  const pr = payroll(userId, mk);
  const work = Store.state.items.filter(i => i.assignee === userId && !Store.isDone(i)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const leaves = erp().leaves.filter(l => l.userId === userId).sort((a, b) => b.from.localeCompare(a.from));
  const meets = erp().meetings.filter(m => m.attendees.includes(userId) && m.date >= t && m.status === 'scheduled').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 5);
  const leadsOwned = erp().leads.filter(l => l.owner === userId && isOpenLead(l));
  root.innerHTML = `<div class="client-page">
    <a class="back-link" href="#/app/people/employees">${icon('arrowLeft')} Employees</a>
    <div class="cp-head">${avatar(userId, 64)}<div class="grow"><h2>${esc(u.name)}${userId === Store.state.me ? ' <span class="muted small">(you)</span>' : ''}</h2>
      <div class="row gap8 muted small wrap">${r.designation ? `<span class="tag">${esc(r.designation)}</span>` : ''}${r.empId ? `<span>${esc(r.empId)}</span>` : ''}${r.office ? `<span>· ${icon('pin', 12)} ${esc(r.office)}</span>` : ''}${r.joined ? `<span>· Joined ${fmtDate(r.joined)}</span>` : ''}</div></div>
      <div class="row gap8">${dayPill(dayStatus(userId, t))}<button class="btn" data-ep="leave">${icon('plane', 14)} Add leave</button><button class="btn" data-ep="edit">${icon('edit', 14)} Edit</button>${userId !== Store.state.me ? `<button class="icon-btn bordered" data-ep="menu">${icon('more')}</button>` : ''}</div></div>
    <div class="stat-row">
      ${statCard('checkCircle', `${pr.present}<span class="unit">/${pr.counted}</span>`, 'Days in this month', `${pr.late} late arrival${pr.late === 1 ? '' : 's'}`)}
      ${statCard('plane', leaveBalance(userId), 'Leave left', quarterLabel(t))}
      ${statCard('emptyWork', work.length, 'Open work', `${work.filter(i => i.due && i.due < t).length} overdue in Taskspace`, { href: '#/filters' })}
      ${statCard('funnel', leadsOwned.length, 'Open leads owned', moneyShort(leadsOwned.reduce((s, l) => s + (Number(l.value) || 0), 0)))}
    </div>
    <div class="sum-grid">
      ${panel('Contact', '', `<div class="dl flat"><span class="dt">Email</span><span class="dd">${r.email ? `<a class="link" href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '—'}</span>
        <span class="dt">Mobile</span><span class="dd">${r.phone ? `<a class="link" href="tel:${esc(r.phone)}">${esc(r.phone)}</a>` : '—'}</span>
        <span class="dt">Monthly salary</span><span class="dd">${r.salary ? money(r.salary) : '—'}</span><span class="dt">This month so far</span><span class="dd">${money(pr.net)} <span class="muted small">after ${pr.lop} LOP day(s)</span></span></div>`)}
      ${panel(`Attendance · ${monthLabel(mk)}`, '', monthStripHTML(userId, mk), { action: `<a class="link small" href="#/app/people/attendance?view=month&m=${mk}">Team view</a>` })}
      ${panel('Assigned work', 'Open work items in Taskspace.', work.length ? `<div class="mini-list">${work.slice(0, 8).map(i => itemRow(i, i.due ? `<span class="due-chip ${dueClass(i)}">${fmtDate(i.due)}</span>` : '')).join('')}</div>` : miniEmpty('Nothing open. 🎉'))}
      ${panel('Upcoming meetings', '', meets.length ? `<div class="mini-list">${meets.map(m => `<div class="mini-row" data-rec="meeting:${m.id}">${icon(m.kind === 'visit' ? 'pin' : 'video')}<span class="grow ellip">${esc(m.title)}</span><span class="muted small">${fmtDate(m.date)} ${fmtTime(m.time)}</span></div>`).join('')}</div>` : miniEmpty('No meetings scheduled.'))}
      ${panel('Leave history', '', leaves.length ? `<div class="mini-list">${leaves.slice(0, 8).map(l => leaveRowMini(l, l.status === 'pending')).join('')}</div>` : miniEmpty('No leave taken.'), { wide: true })}
    </div></div>`;
  bindOpen(root);
  bindLeaveDecisions(root);
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-ep]');
    if (!b) return;
    if (b.dataset.ep === 'edit') openEmployeeModal(userId);
    if (b.dataset.ep === 'leave') openLeaveRequest({ userId });
    if (b.dataset.ep === 'menu') menu(b, [{ value: 'rm', label: 'Remove person', icon: icon('trash'), danger: true }], async () => {
      if (await confirmDialog({ title: `Remove ${u.name}?`, message: 'They are removed from People and Taskspace. Work assigned to them becomes unassigned; their attendance and leave records are deleted.', confirmLabel: 'Remove' })) {
        const st = Store.state;
        st.items.forEach(i => { if (i.assignee === u.id) i.assignee = null; if (i.reporter === u.id) i.reporter = st.me; });
        st.spaces.forEach(sp => { sp.approvals.approvers = sp.approvals.approvers.filter(x => x !== u.id); });
        erp().leads.forEach(l => { if (l.owner === u.id) l.owner = null; });
        erp().meetings.forEach(m => { m.attendees = m.attendees.filter(x => x !== u.id); });
        ['attendance', 'leaves', 'employees'].forEach(k => { erp()[k] = erp()[k].filter(x => x.userId !== u.id); });
        st.users = st.users.filter(x => x !== u);
        Store.save(); toast(`${u.name} removed`); location.hash = '#/app/people/employees';
      }
    }, { align: 'right' });
  });
}
function monthStripHTML(userId, mk) {
  const n = daysInMonth(mk);
  const first = parseYmd(`${mk}-01`).getDay();
  const cells = [];
  for (let i = 0; i < (first + 6) % 7; i++) cells.push('<span class="ms-cell pad"></span>');
  for (let i = 1; i <= n; i++) {
    const d = `${mk}-${String(i).padStart(2, '0')}`, st = dayStatus(userId, d);
    cells.push(`<span class="ms-cell st-${st.code} ${d === todayStr() ? 'today' : ''}" data-tip="${esc(`${fmtDate(d)} — ${st.code === 'holiday' ? st.holiday.name : DAY_ST[st.code][0]}${st.rec ? ` · ${fmtTime(st.rec.in)}${st.rec.out ? '–' + fmtTime(st.rec.out) : ''}` : ''}`)}">${i}</span>`);
  }
  return `<div class="month-strip"><div class="ms-head">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="ms-grid">${cells.join('')}</div>${attLegend()}</div>`;
}
function attLegend() { return `<div class="att-legend">${['present', 'late', 'leave', 'absent', 'off'].map(k => `<span><span class="ms-dot st-${k}"></span>${DAY_ST[k][0]}</span>`).join('')}</div>`; }

/* ---------------- Attendance ---------------- */
function peopleAttendance(root, r) {
  const q = r.query || {}, view = q.view || 'me';
  const tabs = subtabs([{ id: 'me', label: 'My attendance', href: '#/app/people/attendance' }, { id: 'day', label: 'Daily register', href: '#/app/people/attendance?view=day' }, { id: 'month', label: 'Monthly view', href: '#/app/people/attendance?view=month' }], view);
  const me = Store.state.me, t = todayStr();
  if (view === 'me') {
    const mk = q.m || monthKey(t), pr = payroll(me, mk);
    const recs = erp().attendance.filter(a => a.userId === me && monthKey(a.date) === mk).sort((a, b) => b.date.localeCompare(a.date));
    const hrs = recs.reduce((s, a) => s + hoursOf(a), 0);
    root.innerHTML = `<div class="wide-page">${tabs}${checkinCardHTML()}
      <div class="month-bar"><a class="icon-btn bordered" href="#/app/people/attendance?m=${shiftMonth(mk, -1)}">${icon('chevronLeft')}</a><b>${monthLabel(mk)}</b><a class="icon-btn bordered" href="#/app/people/attendance?m=${shiftMonth(mk, 1)}">${icon('chevronRight')}</a></div>
      <div class="stat-row">${statCard('checkCircle', `${pr.present}<span class="unit">/${pr.counted}</span>`, 'Days in', `${pr.working} working days this month`)}${statCard('clock', hrs.toFixed(1) + '<span class="unit"> h</span>', 'Hours logged', recs.filter(a => a.out).length ? `${(hrs / Math.max(1, recs.filter(a => a.out).length)).toFixed(1)} h a day on average` : '')}${statCard('bell', pr.late, 'Late arrivals', `Cutoff ${fmtTime(erpSet('people').lateCutoff)}`, { tone: pr.late ? 'warn' : '' })}${statCard('plane', pr.paidLeave + pr.unpaidLeave, 'Leave days', `${leaveBalance(me)} left this quarter`)}</div>
      <div class="sum-grid">${panel('Calendar', '', monthStripHTML(me, mk))}
        ${panel('Records', '', recs.length ? `<table class="grid compact"><thead><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>Mode</th></tr></thead><tbody>${recs.map(a => `<tr><td>${DOW[parseYmd(a.date).getDay()]} ${fmtDate(a.date)}</td><td class="${isLate(a) ? 'warn-text' : ''}">${fmtTime(a.in)}</td><td>${a.out ? fmtTime(a.out) : '<span class="muted">—</span>'}</td><td>${a.out ? hoursOf(a).toFixed(1) : ''}</td><td>${WORK_MODES[a.mode] || ''}</td></tr>`).join('')}</tbody></table>` : miniEmpty('No records this month.'))}</div></div>`;
    bindCheckin(root);
    return;
  }
  if (view === 'day') {
    const d = q.d || t;
    const ppl = peopleList();
    const rows = ppl.map(u => ({ u, st: dayStatus(u.id, d), rec: attOf(u.id, d) }));
    const counts = k => rows.filter(x => k.includes(x.st.code)).length;
    root.innerHTML = `<div class="wide-page">${tabs}
      <div class="month-bar"><a class="icon-btn bordered" href="#/app/people/attendance?view=day&d=${addDays(d, -1)}">${icon('chevronLeft')}</a><b>${DOW_LONG[parseYmd(d).getDay()]}, ${fmtDate(d)}</b><a class="icon-btn bordered" href="#/app/people/attendance?view=day&d=${addDays(d, 1)}">${icon('chevronRight')}</a>
        ${d !== t ? `<a class="btn sm" href="#/app/people/attendance?view=day">Today</a>` : ''}<input class="input sm-select" type="date" value="${d}" data-day-pick style="width:160px">
        <span class="grow"></span><span class="muted small">${counts(['present', 'late', 'half'])} in · ${counts(['late'])} late · ${counts(['leave', 'half'])} on leave · ${counts(['absent'])} absent</span></div>
      ${!isWorkday(d) ? `<div class="banner info">${icon('sun', 16)} ${holidayOn(d) ? `${esc(holidayOn(d).name)} — a holiday` : 'This is a week off'}. You can still record attendance for anyone who worked.</div>` : ''}
      <div class="table-wrap"><table class="grid register"><thead><tr><th>Employee</th><th style="width:130px">Status</th><th style="width:130px">In</th><th style="width:130px">Out</th><th style="width:90px">Hours</th><th style="width:140px">Mode</th><th style="width:120px"></th></tr></thead>
      <tbody>${rows.map(x => `<tr><td><span class="cell-in">${avatar(x.u.id, 26)} <span><b>${esc(x.u.name)}</b><span class="muted small"> · ${esc((empRecord(x.u.id) || {}).designation || '')}</span></span></span></td>
        <td>${dayPill(x.st)}</td>
        <td><input class="input cell ${isLate(x.rec) ? 'warn-in' : ''}" type="time" data-att="${x.u.id}" data-k="in" value="${esc(x.rec ? x.rec.in : '')}"></td>
        <td><input class="input cell" type="time" data-att="${x.u.id}" data-k="out" value="${esc(x.rec ? x.rec.out : '')}" ${x.rec ? '' : 'disabled'}></td>
        <td>${x.rec && x.rec.out ? hoursOf(x.rec).toFixed(1) : ''}</td>
        <td>${x.rec ? selectHTML('mode', Object.entries(WORK_MODES).map(([k, v]) => ({ value: k, label: v })), x.rec.mode, { cls: 'cell', attrs: `data-att="${x.u.id}" data-k="mode"` }) : ''}</td>
        <td>${x.rec ? `<button class="btn subtle sm" data-att-clear="${x.u.id}">Clear</button>` : `<button class="btn sm" data-att-mark="${x.u.id}">Mark present</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;
    root.addEventListener('change', e => {
      if (e.target.matches('[data-day-pick]') && e.target.value) { location.hash = `#/app/people/attendance?view=day&d=${e.target.value}`; return; }
      const u = e.target.dataset.att; if (!u) return;
      let rec = attOf(u, d);
      if (!rec) { if (!e.target.value) return; rec = { id: uid('at'), userId: u, date: d, in: '', out: '', mode: 'office', manual: true }; erp().attendance.push(rec); }
      rec[e.target.dataset.k] = e.target.value;
      if (!rec.in) erp().attendance = erp().attendance.filter(a => a !== rec);
      Store.save();
    });
    root.addEventListener('click', e => {
      const m = e.target.closest('[data-att-mark]'), c = e.target.closest('[data-att-clear]');
      if (m) { const ps = erpSet('people'); erp().attendance.push({ id: uid('at'), userId: m.dataset.attMark, date: d, in: ps.workStart, out: d < t ? ps.workEnd : '', mode: 'office', manual: true }); Store.save(); }
      if (c) { erp().attendance = erp().attendance.filter(a => !(a.userId === c.dataset.attClear && a.date === d)); Store.save(); }
    });
    return;
  }
  // monthly team grid
  const mk = q.m || monthKey(t), n = daysInMonth(mk);
  const ppl = peopleList();
  const days = Array.from({ length: n }, (_, i) => `${mk}-${String(i + 1).padStart(2, '0')}`);
  root.innerHTML = `<div class="wide-page">${tabs}
    <div class="month-bar"><a class="icon-btn bordered" href="#/app/people/attendance?view=month&m=${shiftMonth(mk, -1)}">${icon('chevronLeft')}</a><b>${monthLabel(mk)}</b><a class="icon-btn bordered" href="#/app/people/attendance?view=month&m=${shiftMonth(mk, 1)}">${icon('chevronRight')}</a><span class="grow"></span>${attLegend()}
      <button class="btn subtle sm" data-att-csv>${icon('download', 14)} CSV</button></div>
    <div class="table-wrap"><table class="grid att-grid"><thead><tr><th class="sticky-col">Employee</th>${days.map(d => `<th class="${!isWorkday(d) ? 'off' : ''} ${d === t ? 'today' : ''}"><div>${DOW[parseYmd(d).getDay()][0]}</div><div>${Number(d.slice(8))}</div></th>`).join('')}<th>In</th><th>Late</th><th>Leave</th><th>LOP</th></tr></thead>
    <tbody>${ppl.map(u => { const pr = payroll(u.id, mk); return `<tr><td class="sticky-col"><a class="cell-in link-plain" href="#/app/people/employees/${u.id}">${avatar(u.id, 22)} <span class="ellip">${esc(u.name)}</span></a></td>
      ${days.map(d => { const st = dayStatus(u.id, d); return `<td class="ag-cell"><a class="ms-dot big st-${st.code}" href="#/app/people/attendance?view=day&d=${d}" data-tip="${esc(`${u.name} · ${fmtDate(d)} — ${st.code === 'holiday' ? st.holiday.name : DAY_ST[st.code][0]}${st.rec ? ` ${fmtTime(st.rec.in)}${st.rec.out ? '–' + fmtTime(st.rec.out) : ''}` : ''}`)}"></a></td>`; }).join('')}
      <td><b>${pr.present}</b></td><td>${pr.late}</td><td>${pr.paidLeave + pr.unpaidLeave}</td><td class="${pr.lop ? 'danger-text' : ''}">${pr.lop}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  root.addEventListener('click', e => {
    if (!e.target.closest('[data-att-csv]')) return;
    downloadCSV(`attendance-${mk}.csv`, [['Employee', ...days, 'Days in', 'Late', 'Leave', 'LOP'], ...ppl.map(u => { const pr = payroll(u.id, mk); return [u.name, ...days.map(d => { const st = dayStatus(u.id, d); return st.rec ? `${st.rec.in}-${st.rec.out || ''}` : DAY_ST[st.code][0]; }), pr.present, pr.late, pr.paidLeave + pr.unpaidLeave, pr.lop]; })]);
  });
}

/* ---------------- Leave ---------------- */
function peopleLeave(root, r) {
  const st = (r.query && r.query.st) || 'pending';
  const all = erp().leaves.slice().sort((a, b) => b.created.localeCompare(a.created));
  const list = st === 'all' ? all : all.filter(l => l.status === st);
  const t = todayStr(), quota = erpSet('people').leaveQuota;
  root.innerHTML = `<div class="wide-page leave-page">
    ${subtabs([...['pending', 'approved', 'declined'].map(k => ({ id: k, label: LEAVE_ST[k][0], count: all.filter(l => l.status === k).length, href: `#/app/people/leave?st=${k}` })), { id: 'all', label: 'All', count: all.length, href: '#/app/people/leave?st=all' }], st)}
    <div class="leave-layout"><div class="grow">
      ${list.length ? `<div class="leave-list">${list.map(l => { const n = leaveDays(l).reduce((s, x) => s + x.weight, 0); const bal = leaveBalance(l.userId, l.from);
        return `<div class="leave-card"><div class="row gap12">${avatar(l.userId, 36)}<div class="grow"><b>${esc(personName(l.userId, ''))}</b> <span class="muted small">requested ${timeAgo(l.created)}</span>
          <div class="leave-dates">${icon('calendar', 14)} ${fmtDate(l.from)}${l.to !== l.from ? ` → ${fmtDate(l.to)}` : ''}${l.half ? ' · half day' : ''} · <b>${n} working day${n === 1 ? '' : 's'}</b> · ${esc(LEAVE_TYPES[l.type])}</div>
          ${l.reason ? `<div class="leave-reason">“${esc(l.reason)}”</div>` : ''}
          ${l.status === 'pending' && l.type !== 'unpaid' && n > bal ? `<div class="warn-text small">${icon('help', 12)} Only ${bal} paid day(s) left in ${quarterLabel(l.from)} — ${n - bal} day(s) would be unpaid.</div>` : ''}
          ${l.decidedBy ? `<div class="muted small">${LEAVE_ST[l.status][0]} by ${esc(personName(l.decidedBy, ''))} ${l.decidedAt ? timeAgo(l.decidedAt) : ''}</div>` : ''}</div>
          <div class="leave-actions">${l.status === 'pending' ? `<button class="btn sm" data-lv-dec="declined:${l.id}">Decline</button><button class="btn primary sm" data-lv-dec="approved:${l.id}">Approve</button>` : pill(LEAVE_ST[l.status][0], LEAVE_ST[l.status][1])}
            <button class="icon-btn xs" data-lv-more="${l.id}" title="More">${icon('more', 14)}</button></div></div></div>`; }).join('')}</div>`
        : emptyState({ title: st === 'pending' ? 'No leave waiting for approval' : 'Nothing here', text: 'Leave requests show up here for a decision. Approved leave counts in attendance and payroll automatically.', art: 'plane', action: '<button class="btn primary" data-lv-new>Request leave</button>' })}
    </div>
    <aside class="panel leave-bal"><h3>Leave balance</h3><p class="muted small">${quota} paid day(s) per quarter · ${quarterLabel(t)}</p>
      ${peopleList().map(u => { const b = leaveBalance(u.id); return `<div class="bal-row">${avatar(u.id, 24)}<span class="grow ellip">${esc(u.name)}</span><div class="bal-bar"><span style="width:${quota ? (b / quota) * 100 : 0}%"></span></div><b class="small">${b}/${quota}</b></div>`; }).join('')}
      <a class="link small" href="#/app/people/settings/leave">Change leave policy</a></aside></div></div>`;
  bindLeaveDecisions(root);
  root.addEventListener('click', e => {
    if (e.target.closest('[data-lv-new]')) openLeaveRequest();
    const m = e.target.closest('[data-lv-more]');
    if (m) {
      const l = erp().leaves.find(x => x.id === m.dataset.lvMore);
      menu(m, [...(l.status !== 'pending' ? [{ value: 'reset', label: 'Move back to pending', icon: icon('refresh') }] : []), { value: 'del', label: 'Delete request', icon: icon('trash'), danger: true }], async v => {
        if (v === 'reset') { l.status = 'pending'; l.decidedBy = null; Store.save(); }
        if (v === 'del' && await confirmDialog({ title: 'Delete this leave request?', message: 'It is removed from attendance and payroll.' })) { erp().leaves = erp().leaves.filter(x => x !== l); Store.save(); toast('Leave request deleted'); }
      }, { align: 'right' });
    }
  });
}
function openLeaveRequest(preset = {}) {
  const me = Store.state.me;
  openModal({
    title: 'Request leave', width: 520,
    body: `<label class="field"><span class="field-label">For</span>${selectHTML('userId', userOptions(), preset.userId || me)}</label>
      <label class="field"><span class="field-label">Type</span><div class="seg full" data-type>${Object.entries(LEAVE_TYPES).map(([k, v], i) => `<button class="${i === 0 ? 'on' : ''}" data-t="${k}">${v}</button>`).join('')}</div></label>
      <div class="form-grid"><label class="field"><span class="field-label">From <span class="req">*</span></span><input class="input" type="date" name="from" value="${addDays(todayStr(), 1)}"></label>
        <label class="field"><span class="field-label">To <span class="req">*</span></span><input class="input" type="date" name="to" value="${addDays(todayStr(), 1)}"></label></div>
      <label class="check" data-half-row><input type="checkbox" name="half"> Half day</label>
      <div class="leave-calc" data-calc></div>
      <label class="field"><span class="field-label">Reason</span><textarea class="input" rows="3" name="reason" placeholder="Optional"></textarea></label>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Submit request</button>',
    onMount(el, api) {
      let type = 'casual';
      const calc = () => {
        const f = formData(el);
        if (f.to < f.from) { el.querySelector('[name=to]').value = f.from; f.to = f.from; }
        el.querySelector('[data-half-row]').hidden = f.from !== f.to;
        const probe = { from: f.from, to: f.to, half: f.from === f.to && f.half };
        const n = leaveDays(probe).reduce((s, x) => s + x.weight, 0);
        const bal = leaveBalance(f.userId, f.from);
        el.querySelector('[data-calc]').innerHTML = `${icon('calendar', 14)} <b>${n}</b> working day${n === 1 ? '' : 's'} (week offs and holidays aren’t counted)
          ${type === 'unpaid' ? ' · all unpaid' : ` · <b>${bal}</b> paid day(s) left in ${quarterLabel(f.from)}${n > bal ? ` · <span class="warn-text">${n - bal} day(s) would be unpaid</span>` : ''}`}`;
        return n;
      };
      calc();
      el.addEventListener('change', calc);
      el.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) { type = b.dataset.t; $$('[data-t]', el).forEach(x => x.classList.toggle('on', x === b)); calc(); } });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el);
        if (!f.from || !f.to) return;
        if (!calc()) { toast('Those dates are all week offs or holidays', 'error'); return; }
        const clash = erp().leaves.find(l => l.userId === f.userId && ['pending', 'approved'].includes(l.status) && l.from <= f.to && l.to >= f.from);
        if (clash) { toast(`Overlaps a ${clash.status} request (${fmtDate(clash.from)}${clash.to !== clash.from ? '–' + fmtDate(clash.to) : ''})`, 'error'); return; }
        const l = { id: uid('lv'), userId: f.userId, type, from: f.from, to: f.to, half: f.from === f.to && f.half, reason: f.reason.trim(), status: 'pending', created: nowISO() };
        erp().leaves.push(l);
        erpLog('people', `requested leave for ${personName(l.userId, '')} (${fmtDate(l.from)}${l.to !== l.from ? '–' + fmtDate(l.to) : ''})`, { type: 'employee', id: l.userId });
        Store.save(); api.close(); toast('Leave requested — approve it from People › Leave');
      });
    },
  });
}

/* ---------------- Payroll ---------------- */
function peoplePayroll(root, r) {
  const mk = (r.query && r.query.m) || monthKey(todayStr());
  const e = erp(); e.salaryAdj = e.salaryAdj || {}; e.payruns = e.payruns || {};
  const ppl = peopleList();
  const rows = ppl.map(u => ({ u, p: payroll(u.id, mk) }));
  const tot = k => rows.reduce((s, x) => s + x.p[k], 0);
  const run = e.payruns[mk];
  const partial = mk >= monthKey(todayStr());
  root.innerHTML = `<div class="wide-page">
    <div class="month-bar"><a class="icon-btn bordered" href="#/app/people/payroll?m=${shiftMonth(mk, -1)}">${icon('chevronLeft')}</a><b>${monthLabel(mk)}</b><a class="icon-btn bordered" href="#/app/people/payroll?m=${shiftMonth(mk, 1)}">${icon('chevronRight')}</a>
      ${run ? `<span class="lozenge cat-done">Paid ${fmtDate(run.at)}</span>` : partial ? '<span class="lozenge cat-progress">Month in progress</span>' : '<span class="lozenge cat-todo">Not paid yet</span>'}
      <span class="grow"></span><button class="btn subtle sm" data-pay-csv>${icon('download', 14)} CSV</button>
      ${run ? '<button class="btn sm" data-payrun="undo">Reopen month</button>' : `<button class="btn primary sm" data-payrun="do" ${partial ? 'title="You can still mark it, but days after today aren’t counted yet"' : ''}>Mark month as paid</button>`}</div>
    <div class="stat-row">${statCard('wallet', moneyShort(tot('base')), 'Gross salaries', `${ppl.length} people`)}${statCard('bell', moneyShort(tot('lopAmt')), 'Loss of pay', `${tot('lop')} day(s)`, { tone: tot('lop') ? 'warn' : '' })}${statCard('plus', moneyShort(tot('adj')), 'Adjustments', 'Bonus, advances, deductions')}${statCard('checkCircle', moneyShort(tot('net')), 'Net payable', partial ? 'So far this month' : '', { tone: 'good' })}</div>
    ${partial ? `<div class="banner info">${icon('help', 16)} Days after today aren’t counted yet, so loss of pay can still change this month.</div>` : ''}
    <div class="table-wrap"><table class="grid payroll"><thead><tr><th>Employee</th><th class="num" style="width:140px">Monthly salary</th><th class="num" style="width:90px">Working</th><th class="num" style="width:80px">In</th><th class="num" style="width:90px">Paid leave</th><th class="num" style="width:90px">LOP days</th><th class="num" style="width:120px">LOP amount</th><th class="num" style="width:140px">Adjustment</th><th class="num" style="width:140px">Net pay</th></tr></thead>
    <tbody>${rows.map(({ u, p }) => `<tr><td><a class="cell-in link-plain" href="#/app/people/employees/${u.id}">${avatar(u.id, 24)} <span class="ellip">${esc(u.name)}</span></a></td>
      <td class="num"><input class="input cell num" type="number" min="0" step="500" data-sal="${u.id}" value="${p.base || ''}" placeholder="0" ${run ? 'disabled' : ''}></td>
      <td class="num">${p.working}</td><td class="num">${p.present}</td><td class="num">${p.paidLeave}</td><td class="num ${p.lop ? 'danger-text' : ''}" data-tip="${esc(`${p.absent} absent + ${p.unpaidLeave} unpaid leave`)}">${p.lop}</td>
      <td class="num">${p.lopAmt ? '− ' + money(p.lopAmt) : '—'}</td>
      <td class="num"><input class="input cell num" type="number" step="100" data-adj="${u.id}" value="${p.adj || ''}" placeholder="0" ${run ? 'disabled' : ''}></td>
      <td class="num"><b>${money(p.net)}</b></td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Total</b></td><td class="num"><b>${money(tot('base'))}</b></td><td></td><td></td><td></td><td class="num">${tot('lop')}</td><td class="num">${tot('lopAmt') ? '− ' + money(tot('lopAmt')) : '—'}</td><td class="num">${money(tot('adj'))}</td><td class="num"><b>${money(tot('net'))}</b></td></tr></tfoot></table></div>
    <p class="muted small">Loss of pay = (monthly salary ÷ working days) × (absent days + unpaid leave). Paid leave comes from each person’s quarterly quota; anything beyond it is unpaid.</p></div>`;
  root.addEventListener('change', ev => {
    const s = ev.target.dataset.sal, a = ev.target.dataset.adj;
    if (s) { empEnsure(s).salary = Number(ev.target.value) || 0; Store.save(); }
    if (a) { e.salaryAdj[`${a}:${mk}`] = Number(ev.target.value) || 0; Store.save(); }
  });
  root.addEventListener('click', ev => {
    const b = ev.target.closest('[data-payrun]');
    if (b) {
      if (b.dataset.payrun === 'do') { e.payruns[mk] = { at: nowISO(), by: Store.state.me, total: tot('net') }; erpLog('people', `marked payroll for ${monthLabel(mk)} as paid (${money(tot('net'))})`); toast(`${monthLabel(mk)} payroll marked as paid`); }
      else { delete e.payruns[mk]; }
      Store.save();
    }
    if (ev.target.closest('[data-pay-csv]')) downloadCSV(`payroll-${mk}.csv`, [['Employee', 'Employee ID', 'Monthly salary', 'Working days', 'Days in', 'Paid leave', 'LOP days', 'LOP amount', 'Adjustment', 'Net pay'], ...rows.map(({ u, p }) => [u.name, (empRecord(u.id) || {}).empId, p.base, p.working, p.present, p.paidLeave, p.lop, p.lopAmt.toFixed(2), p.adj, p.net.toFixed(2)])]);
  });
}

/* ---------------- Announcements ---------------- */
function peopleAnnouncements(root) {
  const list = erp().announcements.slice().sort((a, b) => (b.pinned - a.pinned) || b.at.localeCompare(a.at));
  root.innerHTML = `<div class="narrow-page ann-page">
    <div class="ann-compose" data-compose>${avatar(Store.state.me, 36)}<button class="ann-fake" data-ann-new>Share an update with the team…</button></div>
    ${list.length ? list.map(a => `<article class="ann-card ${a.pinned ? 'pinned' : ''}"><div class="row gap12">${avatar(a.by, 36)}<div class="grow"><b>${esc(personName(a.by, ''))}</b><div class="muted small">${timeAgo(a.at)} · ${a.audience === 'all' ? 'Everyone' : esc(a.audience)}</div></div>
        ${a.pinned ? `<span class="pin-tag">${icon('pin', 12)} Pinned</span>` : ''}<button class="icon-btn xs" data-ann-more="${a.id}">${icon('more', 14)}</button></div>
        <h3>${esc(a.title)}</h3><p class="ann-body">${esc(a.message)}</p></article>`).join('')
      : emptyState({ title: 'No announcements yet', text: 'Post holidays, policy changes or wins. Everyone it’s meant for gets a notification.', art: 'megaphone' })}</div>`;
  root.addEventListener('click', e => {
    if (e.target.closest('[data-ann-new]')) openAnnouncement();
    const m = e.target.closest('[data-ann-more]');
    if (m) {
      const a = erp().announcements.find(x => x.id === m.dataset.annMore);
      menu(m, [{ value: 'pin', label: a.pinned ? 'Unpin' : 'Pin to top', icon: icon('pin') }, { value: 'del', label: 'Delete', icon: icon('trash'), danger: true }], async v => {
        if (v === 'pin') { a.pinned = !a.pinned; Store.save(); }
        if (v === 'del' && await confirmDialog({ title: 'Delete this announcement?', message: esc(a.title) })) { erp().announcements = erp().announcements.filter(x => x !== a); Store.save(); }
      }, { align: 'right' });
    }
  });
}
function openAnnouncement() {
  const ps = erpSet('people');
  openModal({
    title: 'New announcement', width: 560,
    body: `<label class="field"><span class="field-label">Title <span class="req">*</span></span><input class="input" name="title" autofocus placeholder="e.g. Office closed on Friday"></label>
      <label class="field"><span class="field-label">Message <span class="req">*</span></span><textarea class="input" rows="5" name="message"></textarea></label>
      <div class="form-grid"><label class="field"><span class="field-label">Who is it for?</span>${selectHTML('audience', [{ value: 'all', label: 'Everyone' }, ...ps.designations.map(d => ({ value: d, label: `${d} team` }))], 'all')}</label>
        <label class="check" style="margin-top:22px"><input type="checkbox" name="pinned"> Pin to the top</label></div>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Post</button>',
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const f = formData(el);
        if (!f.title.trim()) { el.querySelector('[name=title]').classList.add('invalid'); return; }
        if (!f.message.trim()) { el.querySelector('[name=message]').classList.add('invalid'); return; }
        const a = { id: uid('an'), title: f.title.trim(), message: f.message.trim(), audience: f.audience, pinned: f.pinned, at: nowISO(), by: Store.state.me };
        erp().announcements.push(a);
        const to = peopleList().filter(u => u.id !== Store.state.me && (a.audience === 'all' || (empRecord(u.id) || {}).designation === a.audience));
        to.forEach(u => Store.notify(u.id, null, `📣 ${a.title}`));
        erpLog('people', `posted "${a.title}"`);
        Store.save(); api.close(); toast(to.length ? `Posted · ${to.length} ${to.length === 1 ? 'person' : 'people'} notified` : 'Posted');
      });
    },
  });
}

/* ---------------- Settings ---------------- */
function peopleSettings(root, r) {
  const ps = erpSet('people');
  appSettingsPage(appById('people'), root, r, [
    {
      id: 'hours', name: 'Working hours', icon: 'clock',
      html: () => `<h2>Working hours</h2><p class="muted">Used to flag late arrivals and to count working days for payroll.</p>
        <div class="panel settings-panel"><div class="form-grid three">
          <label class="field"><span class="field-label">Day starts</span><input class="input" type="time" data-setting="people.workStart" value="${ps.workStart}"></label>
          <label class="field"><span class="field-label">Late after</span><input class="input" type="time" data-setting="people.lateCutoff" value="${ps.lateCutoff}"></label>
          <label class="field"><span class="field-label">Day ends</span><input class="input" type="time" data-setting="people.workEnd" value="${ps.workEnd}"></label></div>
          <div class="field"><span class="field-label">Week off</span><div class="dow-pick">${DOW.map((d, i) => `<label class="dow ${ps.weekOff.includes(i) ? 'on' : ''}"><input type="checkbox" data-dow="${i}" ${ps.weekOff.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div></div></div>`,
      bind(el) { el.addEventListener('change', e => { const d = e.target.dataset.dow; if (d == null) return; const i = Number(d); ps.weekOff = e.target.checked ? [...ps.weekOff, i].sort() : ps.weekOff.filter(x => x !== i); Store.save(); toast('Saved'); }); },
    },
    {
      id: 'leave', name: 'Leave policy', icon: 'plane',
      html: () => `<h2>Leave policy</h2><p class="muted">Paid leave resets every quarter. Leave beyond the quota — and any Unpaid leave — counts as loss of pay.</p>
        <div class="panel settings-panel"><label class="field"><span class="field-label">Paid leave per quarter (days)</span><input class="input narrow" type="number" min="0" max="30" step="0.5" data-setting="people.leaveQuota" value="${ps.leaveQuota}"></label>
          <p class="muted small">Casual and sick leave both draw from this quota. Half days count as 0.5.</p></div>`,
    },
    {
      id: 'holidays', name: 'Holidays', icon: 'sun',
      html: () => `<h2>Holidays</h2><p class="muted">Holidays aren’t counted as working days or leave.</p>
        <div class="panel settings-panel"><table class="grid compact"><thead><tr><th style="width:170px">Date</th><th>Holiday</th><th style="width:48px"></th></tr></thead><tbody>
          ${erp().holidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map(h => `<tr><td>${DOW[parseYmd(h.date).getDay()]} ${fmtDate(h.date)}</td><td>${esc(h.name)}</td><td><button class="icon-btn xs" data-hol-del="${h.date}">${icon('trash', 14)}</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No holidays yet.</td></tr>'}</tbody></table>
          <div class="le-add"><input class="input" type="date" data-hol-date style="max-width:180px"><input class="input" placeholder="Holiday name" data-hol-name><button class="btn" data-hol-add>${icon('plus', 14)} Add</button></div></div>`,
      bind(el) {
        el.addEventListener('click', e => {
          const d = e.target.closest('[data-hol-del]');
          if (d) { erp().holidays = erp().holidays.filter(h => h.date !== d.dataset.holDel); Store.save(); }
          if (e.target.closest('[data-hol-add]')) {
            const date = el.querySelector('[data-hol-date]').value, name = el.querySelector('[data-hol-name]').value.trim();
            if (!date || !name) { toast('Pick a date and a name', 'error'); return; }
            erp().holidays = erp().holidays.filter(h => h.date !== date).concat({ date, name }); Store.save(); toast('Holiday added');
          }
        });
      },
    },
    { id: 'designations', name: 'Designations', icon: 'people', html: () => `<h2>Designations</h2><p class="muted">Roles people can have. Announcements can target one.</p><div class="panel settings-panel">${listEditorHTML('designations', ps.designations, 'Add a designation')}</div>`, bind: el => bindListEditor(el, () => ps.designations, () => render()) },
    { id: 'offices', name: 'Offices', icon: 'building', html: () => `<h2>Offices</h2><p class="muted">Where people are based.</p><div class="panel settings-panel">${listEditorHTML('offices', ps.offices, 'Add an office')}</div>`, bind: el => bindListEditor(el, () => ps.offices, () => render()) },
  ]);
}

/* keep the check-in clock ticking */
setInterval(() => { $$('[data-clock]').forEach(el => { el.textContent = fmtTime(nowHM()); }); }, 20000);
