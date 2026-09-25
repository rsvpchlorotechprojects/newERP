/* Summary, Reports, Approvals, Forms, Docs, Attachments, Workflow editor, Space settings */

/* ---------------- small chart helpers (SVG, with hover tooltips via data-tip) ---------------- */
const CAT_COLOR = { todo: 'var(--cat-todo-mark)', progress: 'var(--cat-progress-mark)', done: 'var(--cat-done-mark)' };

function donut(segments, total, size = 180, centerLabel = null) {
  const r = size / 2 - 14, c = 2 * Math.PI * r, cx = size / 2;
  let off = 0;
  const gap = segments.filter(s => s.value).length > 1 ? 2 : 0;
  const arcs = segments.filter(s => s.value).map(s => {
    const len = (s.value / total) * c;
    const el = `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${s.color}" stroke-width="22" stroke-dasharray="${Math.max(0, len - gap)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${cx} ${cx})" data-tip="${esc(s.label)}: ${s.value} (${Math.round(s.value / total * 100)}%)"/>`;
    off += len;
    return el;
  }).join('');
  return `<svg class="donut" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Status breakdown">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="var(--bg-neutral)" stroke-width="22"/>${arcs}
    <text x="${cx}" y="${cx - 2}" text-anchor="middle" class="donut-num">${total}</text>
    <text x="${cx}" y="${cx + 18}" text-anchor="middle" class="donut-lab">${centerLabel ? esc(centerLabel) : `Total work item${total === 1 ? '' : 's'}`}</text></svg>`;
}

function hbars(rows, max) {
  return `<div class="hbars">${rows.map(r => `<div class="hbar-row"><div class="hbar-label">${r.label}</div>
    <div class="hbar-track" data-tip="${esc(r.tip || '')}"><div class="hbar-fill" style="width:${max ? (r.value / max) * 100 : 0}%"></div></div>
    <div class="hbar-val">${r.display != null ? r.display : r.value}</div></div>`).join('')}</div>`;
}

function vbars(rows, height = 180) {
  const max = Math.max(1, ...rows.map(r => r.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return `<div class="vbars" style="height:${height + 28}px">
    <div class="vb-axis">${ticks.slice().reverse().map(t => `<span>${t}</span>`).join('')}</div>
    <div class="vb-plot" style="height:${height}px">
      ${ticks.map(t => `<div class="vb-grid" style="bottom:${(t / top) * 100}%"></div>`).join('')}
      <div class="vb-cols">${rows.map(r => `<div class="vb-col" data-tip="${esc(r.tip || `${r.name}: ${r.value}`)}"><div class="vb-bar" style="height:${(r.value / top) * 100}%;${r.color ? `background:${r.color}` : ''}"></div><div class="vb-x">${r.label}</div></div>`).join('')}</div>
    </div></div>`;
}
function niceTicks(max) {
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : Math.ceil(max / 5 / 5) * 5;
  const out = [];
  for (let v = 0; v <= max + step - 1 && out.length < 8; v += step) out.push(v);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

function lineChart(series, labels, height = 240) {
  const w = 1000, h = height, padL = 32, padB = 24, padT = 12, padR = 12;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const ticks = niceTicks(max), top = ticks[ticks.length - 1];
  const x = i => padL + (i / Math.max(1, labels.length - 1)) * (w - padL - padR);
  const y = v => padT + (1 - v / top) * (h - padT - padB);
  const grid = ticks.map(t => `<line x1="${padL}" x2="${w - padR}" y1="${y(t)}" y2="${y(t)}" class="grid-line"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end" class="axis-text">${t}</text>`).join('');
  const xl = labels.map((l, i) => (i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1) ? `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" class="axis-text">${l}</text>` : '').join('');
  const paths = series.map(s => `<path d="${s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const hits = labels.map((l, i) => `<rect x="${x(i) - (w - padL - padR) / labels.length / 2}" y="${padT}" width="${(w - padL - padR) / labels.length}" height="${h - padT - padB}" fill="transparent" data-idx="${i}" data-tip="${esc(l)} — ${series.map(s => `${s.name}: ${s.values[i]}`).join(' · ')}"/>`).join('');
  const ends = series.map(s => `<circle cx="${x(labels.length - 1)}" cy="${y(s.values[s.values.length - 1])}" r="4" fill="${s.color}" stroke="var(--surface-raised)" stroke-width="2"/>`).join('');
  return `<svg class="line-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${series.map(s => s.name).join(' and ')} over time">${grid}${xl}${paths}${ends}<line class="crosshair" x1="0" x2="0" y1="${padT}" y2="${h - padB}" style="display:none"/>${hits}</svg>`;
}

/* =========================== SUMMARY =========================== */
function viewSummary(sp, root) {
  const items = Store.itemsOf(sp.id);
  const t = todayStr(), weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const completed = items.filter(i => i.resolved && i.resolved >= weekAgo).length;
  const updated = items.filter(i => i.updated >= weekAgo).length;
  const created = items.filter(i => i.created >= weekAgo).length;
  const dueSoon = items.filter(i => i.due && i.due >= t && i.due <= addDays(t, 7) && !Store.isDone(i)).length;
  const segs = [];
  Store.allStatuses(sp).forEach(s => {
    const n = items.filter(i => i.statusId === s.id).length;
    const seg = segs.find(x => x.label.toLowerCase() === s.name.toLowerCase());
    if (seg) seg.value += n; else segs.push({ label: s.name, value: n, color: CAT_COLOR[s.cat], cat: s.cat });
  });
  const activity = Store.state.activity.filter(a => { const it = a.itemId && Store.item(a.itemId); return it && it.spaceId === sp.id; }).slice(0, 12);
  const byType = WORK_TYPES.map(w => ({ ...w, n: items.filter(i => i.type === w.id).length }));
  const users = [...Store.state.users.map(u => u.id), null];
  const load = users.map(u => ({ u, n: items.filter(i => (i.assignee || null) === u).length })).filter(x => x.n);

  const stat = (ic, n, label, sub) => `<div class="stat-card"><div class="stat-ic">${icon(ic, 20)}</div><div><div class="stat-n">${n} ${label}</div><div class="muted small">${sub}</div></div></div>`;
  root.innerHTML = `
    <div class="summary">
      <div class="stat-row">
        ${stat('checkCircle', completed, 'completed', 'in the last 7 days')}
        ${stat('edit', updated, 'updated', 'in the last 7 days')}
        ${stat('plus', created, 'created', 'in the last 7 days')}
        ${stat('calendar', dueSoon, 'due soon', 'in the next 7 days')}
      </div>
      <div class="sum-grid">
        <section class="panel">
          <h3>Status overview</h3><p class="muted small">Get a snapshot of the status of your work items. <a class="link" href="#/space/${encodeURIComponent(sp.key)}/list">View all work items</a></p>
          ${items.length ? `<div class="donut-wrap">${donut(segs, items.length)}
            <ul class="legend-list">${segs.map(s => `<li><span class="sw" style="background:${s.color}"></span>${esc(s.label)}: <b>${s.value}</b></li>`).join('')}</ul></div>`
            : emptyState({ title: 'No work yet', text: 'Once you create work items, you\'ll see a breakdown of their status here.', small: true })}
        </section>
        <section class="panel">
          <h3>Recent activity</h3><p class="muted small">Stay up to date with what's happening across the space.</p>
          <div class="activity">${activity.length ? activity.map(a => { const it = Store.item(a.itemId); return `<div class="act-row">${avatar(a.user, 28)}<div><b>${esc((Store.user(a.user) || {}).name || '')}</b> ${esc(a.text)} <a class="link" data-open="${it.id}">${esc(it.key)}: ${esc(it.summary)}</a> ${lozenge(Store.statusOf(it))}<div class="muted small">${timeAgo(a.at)}</div></div></div>`; }).join('')
            : emptyState({ title: 'No activity yet', text: 'Create a few work items and invite yourself to get going.', art: 'clock', small: true })}</div>
        </section>
        <section class="panel">
          <h3>Priority breakdown</h3><p class="muted small">Get a holistic view of how work is being prioritized.</p>
          ${vbars(PRIORITIES.map(p => ({ name: p.name, label: `${priorityIcon(p.id, 14)}<span>${p.name}</span>`, value: items.filter(i => i.priority === p.id).length })))}
        </section>
        <section class="panel">
          <h3>Types of work</h3><p class="muted small">Get a breakdown of work items by their types.</p>
          ${hbars(byType.map(w => ({ label: `${typeIcon(w.id)} ${w.name}`, value: w.n, display: items.length ? Math.round(w.n / items.length * 100) + '%' : '0%', tip: `${w.name}: ${w.n}` })), items.length)}
        </section>
        <section class="panel">
          <h3>Team workload</h3><p class="muted small">Monitor the capacity of your team.</p>
          ${load.length ? hbars(load.map(x => ({ label: `${avatar(x.u, 20)} ${esc((Store.user(x.u) || { name: 'Unassigned' }).name)}`, value: x.n, display: Math.round(x.n / items.length * 100) + '%', tip: `${x.n} work item${x.n === 1 ? '' : 's'}` })), items.length) : '<p class="muted">No work assigned yet.</p>'}
        </section>
        <section class="panel">
          <h3>Due soon</h3><p class="muted small">Work due in the next 7 days and anything overdue.</p>
          ${(() => { const list = items.filter(i => i.due && !Store.isDone(i) && i.due <= addDays(t, 7)).sort((a, b) => a.due.localeCompare(b.due)); return list.length ? `<div class="mini-list">${list.map(i => `<div class="mini-row" data-open="${i.id}">${typeIcon(i.type)}<span class="ellip grow">${esc(i.summary)}</span><span class="due-chip ${dueClass(i)}">${fmtDate(i.due)}</span></div>`).join('')}</div>` : '<p class="muted">Nothing due this week.</p>'; })()}
        </section>
      </div>
    </div>`;
  root.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) openItem(o.dataset.open); });
}

/* =========================== REPORTS =========================== */
function viewReports(sp, root, r) {
  const items = Store.itemsOf(sp.id);
  const range = Number((r.query && r.query.days) || 30);
  const days = []; for (let k = range - 1; k >= 0; k--) days.push(addDays(todayStr(), -k));
  const createdSeries = days.map(d => items.filter(i => i.created.slice(0, 10) <= d).length);
  const resolvedSeries = days.map(d => items.filter(i => i.resolved && i.resolved.slice(0, 10) <= d).length);
  const weeks = []; for (let k = 7; k >= 0; k--) weeks.push(addDays(todayStr(), -7 * k - ((new Date().getDay() + 6) % 7)));
  const perWeek = weeks.map(w => ({ name: `Week of ${fmtDate(w)}`, label: fmtDate(w), value: items.filter(i => i.resolved && i.resolved.slice(0, 10) >= w && i.resolved.slice(0, 10) < addDays(w, 7)).length }));
  const overdue = items.filter(i => i.due && i.due < todayStr() && !Store.isDone(i));
  const open = items.filter(i => !Store.isDone(i));
  const avgAge = open.length ? Math.round(open.reduce((s, i) => s + (Date.now() - Date.parse(i.created)) / 864e5, 0) / open.length) : 0;

  root.innerHTML = `<div class="reports">
    <div class="toolbar"><div class="seg">${[7, 30, 90].map(d => `<a class="${range === d ? 'on' : ''}" href="#/space/${encodeURIComponent(sp.key)}/reports?days=${d}">Last ${d} days</a>`).join('')}</div></div>
    <div class="stat-row">
      <div class="stat-card"><div><div class="stat-big">${open.length}</div><div class="muted small">Open work items</div></div></div>
      <div class="stat-card"><div><div class="stat-big">${items.length - open.length}</div><div class="muted small">Done</div></div></div>
      <div class="stat-card"><div><div class="stat-big ${overdue.length ? 'danger-text' : ''}">${overdue.length}</div><div class="muted small">Overdue</div></div></div>
      <div class="stat-card"><div><div class="stat-big">${avgAge}<span class="unit"> days</span></div><div class="muted small">Average age of open work</div></div></div>
    </div>
    <div class="sum-grid">
      <section class="panel wide"><h3>Created vs. resolved</h3><p class="muted small">Cumulative work items created and resolved over the last ${range} days.</p>
        <div class="legend-inline"><span><span class="sw line" style="background:var(--series-1)"></span>Created</span><span><span class="sw line" style="background:var(--series-2)"></span>Resolved</span></div>
        ${lineChart([{ name: 'Created', values: createdSeries, color: 'var(--series-1)' }, { name: 'Resolved', values: resolvedSeries, color: 'var(--series-2)' }], days.map(d => fmtDate(d)))}
        <details class="table-view"><summary>View as table</summary><table class="grid compact"><thead><tr><th>Date</th><th>Created</th><th>Resolved</th></tr></thead><tbody>${days.map((d, i) => `<tr><td>${fmtDate(d)}</td><td>${createdSeries[i]}</td><td>${resolvedSeries[i]}</td></tr>`).join('')}</tbody></table></details>
      </section>
      <section class="panel"><h3>Work completed per week</h3><p class="muted small">Work items resolved each week.</p>${vbars(perWeek)}</section>
      <section class="panel"><h3>Overdue work</h3><p class="muted small">Open work items past their due date.</p>
        ${overdue.length ? `<div class="mini-list">${overdue.map(i => `<div class="mini-row" data-open="${i.id}">${typeIcon(i.type)}<span class="key">${esc(i.key)}</span><span class="ellip grow">${esc(i.summary)}</span><span class="due-chip overdue">${fmtDate(i.due)}</span></div>`).join('')}</div>` : '<p class="muted">Nothing is overdue. Nice work.</p>'}
      </section>
    </div></div>`;
  root.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) openItem(o.dataset.open); });
}

/* =========================== APPROVALS =========================== */
function viewApprovals(sp, root, r) {
  const tab = (r.query && r.query.tab) || 'pending';
  const me = Store.state.me;
  const all = Store.itemsOf(sp.id).filter(i => i.approval);
  const lists = {
    pending: all.filter(i => canApprove(i, me)), // only when it's your step
    waiting: all.filter(i => i.approval.state === 'pending' && !canApprove(i, me) && i.approval.approvers.some(a => a.user === me && !a.decision)),
    requested: all.filter(i => i.approval.requestedBy === me),
    all,
  };
  const items = lists[tab];
  const ap = sp.approvals;
  const base = `#/space/${encodeURIComponent(sp.key)}/approvals`;
  root.innerHTML = `<div class="approvals">
    <div class="subtabs">
      <a class="${tab === 'pending' ? 'on' : ''}" href="${base}?tab=pending">Pending your approval</a>
      <a class="${tab === 'waiting' ? 'on' : ''}" href="${base}?tab=waiting" title="You're in a later step">Coming to you${lists.waiting.length ? ` <span class="count">${lists.waiting.length}</span>` : ''}</a>
      <a class="${tab === 'requested' ? 'on' : ''}" href="${base}?tab=requested">Requested by you</a>
      <a class="${tab === 'all' ? 'on' : ''}" href="${base}?tab=all">All approvals</a>
      <span class="grow"></span>
      <button class="btn" data-ap="manage">${icon('gear')} Manage approval settings</button>
    </div>
    <div class="muted small count-line">${items.length} work item${items.length === 1 ? '' : 's'} found</div>
    <div class="table-wrap"><table class="grid">
      <thead><tr><th>Work item</th><th style="width:160px">Status</th><th style="width:180px">Assignee</th><th style="width:180px">Reporter</th><th style="width:200px">Approvers</th><th style="width:200px">Action</th></tr></thead>
      <tbody>${items.map(i => {
        const a = i.approval;
        const mine = canApprove(i, me);
        const steps = [...new Set(a.approvers.map(x => x.step || 1))].sort((p, q) => p - q), cur = approvalStep(a);
        return `<tr data-id="${i.id}"><td><div class="work-cell">${typeIcon(i.type)}<a class="key" data-open>${esc(i.key)}</a><a class="sum ellip" data-open>${esc(i.summary)}</a></div></td>
          <td>${lozenge(Store.statusOf(i))}</td><td><span class="cell-in">${avatar(i.assignee, 24)} ${esc((Store.user(i.assignee) || { name: 'Unassigned' }).name)}</span></td>
          <td><span class="cell-in">${avatar(i.reporter, 24)} ${esc((Store.user(i.reporter) || { name: 'None' }).name)}</span></td>
          <td><span class="cell-in" title="${esc(chainText(a.approvers))}">${steps.map(s => a.approvers.filter(x => (x.step || 1) === s).map(x => avatar(x.user, 24)).join('')).join(`<span class="muted">${icon('chevronRight', 12)}</span>`)} <span class="muted small">${a.approvers.filter(x => x.decision === 'approved').length}/${a.approvers.length}</span></span></td>
          <td>${mine ? `<div class="row gap8"><button class="btn primary sm" data-decide="approved">Approve</button><button class="btn sm" data-decide="declined">Decline</button></div>` : `<span class="lozenge ${a.state === 'approved' ? 'cat-done' : a.state === 'declined' ? 'cat-danger' : 'cat-progress'}">${a.state === 'pending' ? (steps.length > 1 ? `Step ${steps.indexOf(cur) + 1} of ${steps.length}` : 'Waiting') : cap(a.state)}</span>`}</td></tr>`;
      }).join('')}</tbody></table>
    ${!items.length ? (ap.enabled
      ? emptyState({ title: tab === 'pending' ? 'You\'re all caught up' : 'No approvals here yet', text: `Approvals start when work moves to <b>${esc((Store.status(sp, ap.statusId) || {}).name || '')}</b>.`, art: 'approvals' })
      : `<div class="empty big"><div class="empty-illus">${icon('approvals', 40)}</div><h3>Need work signed off for your team?</h3><p>Here's where you'll be able to view your team's pending approvals.<br>Set up approvals for your space to get started.</p>
        <div class="row gap8 center"><button class="btn primary" data-ap="setup">Set up approvals</button></div><a class="link small" data-ap="learn">Learn how to set up approvals</a></div>`) : ''}
    </div></div>`;
  root.addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (e.target.closest('[data-open]') && tr) { openItem(tr.dataset.id); return; }
    const d = e.target.closest('[data-decide]');
    if (d && tr) { Store.decide(tr.dataset.id, d.dataset.decide); toast(d.dataset.decide === 'approved' ? 'Approved' : 'Declined'); return; }
    const b = e.target.closest('[data-ap]');
    if (!b) return;
    if (b.dataset.ap === 'setup') openApprovalWizard(sp);
    if (b.dataset.ap === 'manage') location.hash = `#/space/${encodeURIComponent(sp.key)}/settings/approvals`;
    if (b.dataset.ap === 'learn') openApprovalHelp(sp);
  });
}

function openApprovalHelp(sp) {
  openModal({
    title: 'Set up approvals', width: 620,
    body: `<h4>From the Approvals tab</h4><ol class="steps">
      <li>Select <b>Approvals</b> in your space navigation, then <b>Set up approvals</b>.</li>
      <li>Choose the workflow and the status that should trigger an approval, then select <b>Continue</b>.</li>
      <li>Nominate preset approvers. They're added automatically when work reaches that status.</li>
      <li>Name the approver field, then choose where work goes when it's approved and when it's declined.</li>
      <li>Select <b>Save</b>, then <b>Update workflow</b> at the top-right of the workflow editor.</li></ol>
      <h4>From space settings</h4><ol class="steps">
      <li>Open <b>•••</b> next to the space name, then <b>Space settings</b> › <b>Work types</b> › <b>Edit workflow</b>.</li>
      <li>Select the status, then the <b>+</b> next to Approvals in the right panel.</li>
      <li>Fill in approvers and transitions, select <b>Save</b>, then <b>Update workflow</b>.</li></ol>`,
    footer: `<button class="btn subtle" data-close>Close</button><button class="btn primary" data-go>Set up approvals</button>`,
    onMount(el, api) { el.querySelector('[data-go]').addEventListener('click', () => { api.close(); openApprovalWizard(sp); }); },
  });
}

/* Two-step approval setup. Writes into the workflow draft, then opens the editor to "Update workflow". */
function openApprovalWizard(sp, { statusId = null } = {}) {
  dropDraft(sp);
  const draft = wfDraft(sp);
  const cur = draft.approvals;
  let step = statusId ? 2 : 1;
  const cfg = { statusId: statusId || cur.statusId || (draft.workflow.statuses[1] || draft.workflow.statuses[0]).id, approvers: cur.approvers.length ? cur.approvers.slice() : [Store.state.me], fieldName: cur.fieldName || 'Approvers', approveTo: cur.approveTo, declineTo: cur.declineTo };
  const sts = draft.workflow.statuses;
  const opt = (sel) => sts.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const m = openModal({ title: 'Set up approvals', width: 580, body: '<div class="wiz"></div>', footer: '<div class="wiz-foot"></div>' });
  const draw = () => {
    const idx = sts.findIndex(s => s.id === cfg.statusId);
    if (!cfg.approveTo || cfg.approveTo === cfg.statusId) cfg.approveTo = (sts[idx + 1] || sts.find(s => s.cat === 'done') || sts[0]).id;
    if (!cfg.declineTo || cfg.declineTo === cfg.statusId) cfg.declineTo = (sts[idx - 1] || sts[0]).id;
    const body = m.el.querySelector('.wiz');
    const foot = m.el.querySelector('.wiz-foot');
    if (step === 1) {
      body.innerHTML = `<div class="wiz-steps"><span class="on">1. Choose a status</span><span>2. Approvers</span></div>
        <label class="field"><span class="field-label">Workflow <span class="req">*</span></span><select class="input" disabled><option>${esc(sp.name)} workflow (Task, Sub-task)</option></select>
        <span class="field-help">This space has one workflow, shared by all of its work types.</span></label>
        <div class="field"><span class="field-label">Which status should trigger an approval? <span class="req">*</span></span>
        <div class="status-choices">${sts.map(s => `<label class="radio-card ${s.id === cfg.statusId ? 'on' : ''}"><input type="radio" name="st" value="${s.id}" ${s.id === cfg.statusId ? 'checked' : ''}>${lozenge(s)}</label>`).join('')}</div>
        <span class="field-help">An approval request starts as soon as a work item moves to this status.</span></div>`;
      foot.innerHTML = '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-next>Continue</button>';
    } else {
      body.innerHTML = `<div class="wiz-steps"><span>1. Choose a status</span><span class="on">2. Approvers</span></div>
        <p class="muted small">Approval triggered from ${lozenge(Store.status(draft, cfg.statusId) || sts[idx])}</p>
        <div class="field"><span class="field-label">Preset approvers <span class="req">*</span></span>
          <div class="chk-list">${Store.state.users.map(u => `<label class="chk-row"><input type="checkbox" value="${u.id}" data-approver ${cfg.approvers.includes(u.id) ? 'checked' : ''}> ${avatar(u.id, 20)} ${esc(u.name)}</label>`).join('')}</div>
          <span class="field-help">Added automatically when a work item reaches this status. You can add people from <a class="link" href="#/teams" data-close>Teams</a>.</span></div>
        <label class="field"><span class="field-label">Approver field name <span class="req">*</span></span><input class="input" data-fname value="${esc(cfg.fieldName)}"></label>
        <div class="form-grid">
          <label class="field"><span class="field-label">When approved, move to <span class="req">*</span></span><select class="input" data-approve>${opt(cfg.approveTo)}</select></label>
          <label class="field"><span class="field-label">When declined, move to <span class="req">*</span></span><select class="input" data-decline>${opt(cfg.declineTo)}</select></label>
        </div>`;
      foot.innerHTML = `${statusId ? '' : '<button class="btn subtle" data-back>Back</button>'}<span class="grow"></span><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`;
    }
  };
  m.el.addEventListener('change', e => {
    if (e.target.name === 'st') { cfg.statusId = e.target.value; cfg.approveTo = null; cfg.declineTo = null; draw(); }
    if (e.target.matches('[data-approver]')) cfg.approvers = $$('[data-approver]:checked', m.el).map(x => x.value);
    if (e.target.matches('[data-approve]')) cfg.approveTo = e.target.value;
    if (e.target.matches('[data-decline]')) cfg.declineTo = e.target.value;
  });
  m.el.addEventListener('click', e => {
    if (e.target.closest('[data-next]')) { step = 2; draw(); }
    if (e.target.closest('[data-back]')) { step = 1; draw(); }
    if (e.target.closest('[data-save]')) {
      cfg.fieldName = m.el.querySelector('[data-fname]').value.trim() || 'Approvers';
      if (!cfg.approvers.length) { toast('Choose at least one approver', 'error'); return; }
      if (cfg.approveTo === cfg.statusId || cfg.declineTo === cfg.statusId) { toast('Approved and declined work must move to a different status', 'error'); return; }
      draft.approvals = { enabled: true, ...cfg };
      // approval transition shown in the diagram
      draft.workflow.transitions = draft.workflow.transitions.filter(t => !t.approval);
      draft.workflow.transitions.push({ id: uid('tr'), name: 'approval', from: [cfg.statusId], to: cfg.approveTo, approval: true, rules: 1 });
      m.close();
      commitWorkflow(sp, 'Approval saved');
    }
  });
  draw();
}

/* =========================== WORKFLOW EDITOR =========================== */
const WF_DRAFTS = {};
function wfDraft(sp, wfId = null) {
  const key = `${sp.id}:`;
  if (!WF_DRAFTS[key]) {
    WF_DRAFTS[key] = { wfId: null, name: sp.name, workflow: JSON.parse(JSON.stringify(sp.workflow)), approvals: JSON.parse(JSON.stringify(sp.approvals)), dirty: false, sel: null, mode: 'diagram', labels: true };
  }
  const d = WF_DRAFTS[key];
  d.statuses = d.workflow.statuses;
  return d;
}
function dropDraft(sp, wfId = null) { delete WF_DRAFTS[`${sp.id}:${wfId || ''}`]; }

function settingsNav(sp, active) {
  const base = `#/space/${encodeURIComponent(sp.key)}/settings`;
  const link = (id, label, href) => `<a class="nav-item ${active === id ? 'active' : ''}" href="${href || base + '/' + id}"><span class="label">${label}</span></a>`;
  return `<aside class="settings-nav">
    <a class="back-link" href="#/space/${encodeURIComponent(sp.key)}/board">${icon('arrowLeft')} Back to space</a>
    <div class="sn-space">${spaceAvatar(sp, 24)}<div><b>${esc(sp.name)}</b><div class="muted small">Business space</div></div></div>
    <div class="nav-heading">Space settings</div>
    ${link('details', 'Details')}${link('access', 'Access')}${link('notifications', 'Notifications')}${link('automation', 'Automation')}${link('approvals', 'Approvals')}${link('fields', 'Fields')}
    <div class="nav-heading">Workflow</div>
    <a class="nav-item ${active === 'wf' ? 'active' : ''}" href="#/space/${encodeURIComponent(sp.key)}/workflow">${icon('approvals')}<span class="label">Stages, tasks &amp; rules</span><span class="muted small">${(sp.taskFlows || []).reduce((n, f) => n + f.rules.length, 0) || ''}</span></a>
    <div class="nav-heading">Work types</div>
    ${WORK_TYPES.map(w => `<a class="nav-item" href="#/space/${encodeURIComponent(sp.key)}/workflow">${typeIcon(w.id)}<span class="label">${w.name}</span></a>`).join('')}
  </aside>`;
}

function viewWorkflow(sp, root, r = {}) {
  if (r.sub === 'task') return viewTaskFlow(sp, root, r);
  return viewTaskCanvas(sp, root, r);
}

function commitWorkflow(sp, message = 'Workflow updated') {
  const d = wfDraft(sp);
  const keep = new Set(d.workflow.statuses.map(s => s.id));
  const fallback = d.workflow.statuses[0].id;
  const remap = d.remap || {};
  Store.itemsOf(sp.id).forEach(i => {
    if (keep.has(i.statusId)) return;
    i.statusId = keep.has(remap[i.statusId]) ? remap[i.statusId] : fallback;
    i.updated = nowISO();
    if (i.approval && i.approval.state === 'pending') i.approval = null;
  });
  const wf = JSON.parse(JSON.stringify(d.workflow)), ap = JSON.parse(JSON.stringify(d.approvals));
  sp.workflow = wf; sp.approvals = ap;
  Store.cleanFlows(sp);
  d.dirty = false;
  dropDraft(sp, d.wfId);
  Store.save();
  toast(message);
}

/* ---------------- Workflow templates ---------------- */
/* Deep copy of a workflow (+ approval setup) with fresh status/transition ids */
function cloneWorkflow(workflow, approvals) {
  const w = JSON.parse(JSON.stringify(workflow));
  const ids = {};
  w.statuses.forEach(st => { ids[st.id] = uid('st'); st.id = ids[st.id]; });
  const mapId = x => ids[x] || x;
  w.transitions = w.transitions.map(t => ({ ...t, id: uid('tr'), from: t.from.map(mapId), to: mapId(t.to) }));
  const layout = {};
  Object.entries(w.layout || {}).forEach(([k, v]) => { if (ids[k]) layout[ids[k]] = v; });
  w.layout = layout;
  const ap = JSON.parse(JSON.stringify(approvals || { enabled: false, approvers: [], fieldName: 'Approvers' }));
  ['statusId', 'approveTo', 'declineTo'].forEach(k => { ap[k] = ap[k] ? mapId(ap[k]) : null; });
  ap.approvers = (ap.approvers || []).filter(u => Store.user(u));
  if (ap.enabled && !w.statuses.some(x => x.id === ap.statusId)) ap.enabled = false;
  return { workflow: w, approvals: ap };
}

function openCreateTransition(sp, d, done) {
  const sts = d.workflow.statuses;
  let from = [], to = null;
  const fromLabel = () => from.length ? from.map(f => f === 'any' ? 'Any status' : esc(sts.find(s => s.id === f).name)).join(', ') : '<span class="ph">Select from status</span>';
  const toLabel = () => to ? lozenge(sts.find(s => s.id === to)) : '<span class="ph">Select to status</span>';
  openModal({
    title: 'Create transition', width: 720, cls: 'transition-modal',
    body: `<p>Transitions connect statuses. They represent actions people take to move work items through your workflow. They also appear as drop zones when people move cards across your project's board.</p>
      <p class="muted">Required fields are marked with an asterisk <span class="req">*</span></p>
      <div class="tr-grid">
        <div class="field"><span class="field-label">From statuses <span class="req">*</span></span><button class="input select-like" data-pick="from"><span class="sl-val">${fromLabel()}</span>${icon('chevronDown')}</button></div>
        <div class="tr-arrow">${icon('arrowRight')}</div>
        <div class="field"><span class="field-label">To status <span class="req">*</span></span><button class="input select-like" data-pick="to"><span class="sl-val">${toLabel()}</span>${icon('chevronDown')}</button></div>
      </div>
      <label class="field"><span class="field-label">Name <span class="req">*</span></span><input class="input" name="name" placeholder="Give your transition a name">
        <span class="field-help">Tip: Name your transition as an action people take to move an issue, like "Start progress" or "Send for review".</span></label>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok disabled>Create</button>',
    onMount(el, api) {
      const ok = el.querySelector('[data-ok]');
      const nameEl = el.querySelector('[name=name]');
      const refresh = () => {
        el.querySelector('[data-pick=from] .sl-val').innerHTML = fromLabel();
        el.querySelector('[data-pick=to] .sl-val').innerHTML = toLabel();
        ok.disabled = !(from.length && to && nameEl.value.trim());
      };
      nameEl.addEventListener('input', refresh);
      el.addEventListener('click', e => {
        const p = e.target.closest('[data-pick]');
        if (!p) return;
        if (p.dataset.pick === 'to') {
          menu(p, sts.map(s => ({ value: s.id, label: lozenge(s), selected: s.id === to })), v => { to = v; if (!nameEl.value.trim()) nameEl.value = sts.find(s => s.id === v).name; refresh(); }, { width: p.offsetWidth, cls: 'status-menu' });
        } else {
          const html = `<div class="menu status-menu">${[{ id: 'any', name: 'Any status' }, ...sts].map(s => `<label class="menu-item chk"><input type="checkbox" value="${s.id}" ${from.includes(s.id) ? 'checked' : ''}> ${s.id === 'any' ? '<span>Any status</span>' : lozenge(s)}</label>`).join('')}</div>`;
          popover(p, html, { width: p.offsetWidth, onMount(pe) { pe.addEventListener('change', ev => { const v = ev.target.value; from = ev.target.checked ? (v === 'any' ? ['any'] : [...from.filter(f => f !== 'any'), v]) : from.filter(f => f !== v); $$('input', pe).forEach(i => { i.checked = from.includes(i.value); }); refresh(); }); } });
        }
      });
      ok.addEventListener('click', () => {
        const src = from.filter(f => f !== to);
        if (!src.length) { toast('A transition needs a different from and to status', 'error'); return; }
        const t = { id: uid('tr'), name: nameEl.value.trim(), from: src, to };
        d.workflow.transitions.push(t);
        d.sel = { kind: 't', id: t.id };
        api.close(); done();
      });
    },
  });
}

/* =========================== SPACE SETTINGS =========================== */
function viewSettings(sp, root, r) {
  const sub = r.sub || 'details';
  const ap = sp.approvals;
  sp.rules = sp.rules || { assignOnProgress: false, closeKidsOnDone: false };
  sp.notify = sp.notify || { overdue: true };
  let main;
  switch (sub) {
    case 'access':
      main = `<h1>Access</h1><div class="panel"><div class="row gap12">${icon('lock', 20)}<div><b>Private</b><div class="muted">Everything in this space is stored only in this browser on this device. Nobody else can see it.</div></div></div></div>
        <p class="muted small">To move your data to another browser, use Settings › Export data, then Import data on the other device.</p>`;
      break;
    case 'notifications':
      main = `<h1>Notifications</h1><div class="panel"><label class="toggle-row"><input type="checkbox" data-set="notify.overdue" ${sp.notify.overdue ? 'checked' : ''}><span class="toggle"></span><span>Remind me about overdue work in this space when I open the app</span></label></div>`;
      break;
    case 'automation':
      main = `<h1>Automation</h1><div class="panel">
        <label class="toggle-row"><input type="checkbox" data-set="rules.assignOnProgress" ${sp.rules.assignOnProgress ? 'checked' : ''}><span class="toggle"></span><span>When unassigned work moves to an <b>In progress</b> status, assign it to me</span></label>
        <label class="toggle-row"><input type="checkbox" data-set="rules.closeKidsOnDone" ${sp.rules.closeKidsOnDone ? 'checked' : ''}><span class="toggle"></span><span>When a parent moves to <b>Done</b>, move its child work items to Done too</span></label></div>`;
      break;
    case 'approvals':
      main = `<h1>Approvals</h1>${ap.enabled ? `<div class="panel"><div class="row gap12">${icon('approvals', 20)}<div class="grow">
        <div>Approval requested when work moves to ${lozenge(Store.status(sp, ap.statusId))}</div>
        <div class="muted small" style="margin-top:6px">${esc(ap.fieldName)}: ${ap.approvers.map(u => esc((Store.user(u) || {}).name || '')).join(', ')} · Approved → ${esc((Store.status(sp, ap.approveTo) || {}).name || '')} · Declined → ${esc((Store.status(sp, ap.declineTo) || {}).name || '')}</div></div>
        <button class="btn" data-s="edit-ap">Edit</button><button class="btn danger-text" data-s="remove-ap">Remove</button></div></div>`
        : `<div class="panel">${emptyState({ title: 'No approvals yet', text: 'Require sign-off before work moves on. Pick a status that triggers the approval and who approves it.', art: 'approvals', small: true, action: '<button class="btn primary" data-s="setup-ap">Set up approvals</button>' })}</div>`}`;
      break;
    case 'fields':
      main = `<h1>Fields</h1><table class="grid"><thead><tr><th>Field</th><th>Type</th><th>Used in</th></tr></thead><tbody>
        ${[['Summary', 'Text'], ['Description', 'Paragraph'], ['Status', 'Workflow'], ['Assignee', 'User picker'], ['Reporter', 'User picker'], ['Priority', 'Select list'], ['Labels', 'Labels'], ['Start date', 'Date'], ['Due date', 'Date'], ['Parent', 'Work item link'], ['Attachment', 'Files']].concat(ap.enabled ? [[ap.fieldName, 'User picker (approvals)']] : [])
          .map(([f, t]) => `<tr><td>${esc(f)}</td><td class="muted">${t}</td><td class="muted">Task, Sub-task</td></tr>`).join('')}</tbody></table>`;
      break;
    default:
      main = `<h1>Details</h1><div class="details-form">
        <div class="field"><span class="field-label">Space icon</span><div class="row gap12">${spaceAvatar(sp, 48)}<div><div class="av-row">${SPACE_GLYPHS.map(g => `<button class="av-pick ${g === sp.glyph ? 'on' : ''}" data-glyph="${g}">${spaceAvatar({ color: sp.color, glyph: g }, 28)}</button>`).join('')}</div>
          <div class="color-row">${SPACE_COLORS.map(c => `<button class="swatch ${c === sp.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div></div></div>
        <label class="field"><span class="field-label">Name <span class="req">*</span></span><input class="input" name="name" value="${esc(sp.name)}"></label>
        <label class="field"><span class="field-label">Space key</span><input class="input narrow" name="key" value="${esc(sp.key)}" disabled><span class="field-help">Work item keys like ${esc(sp.key)}-1 use this, so it can't change.</span></label>
        <label class="field"><span class="field-label">Space type</span><input class="input" value="Business space" disabled></label>
        <label class="field"><span class="field-label">Space lead</span><select class="input" name="lead">${Store.state.users.map(u => `<option value="${u.id}" ${u.id === (sp.lead || Store.state.me) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
        <div class="row gap8"><button class="btn primary" data-s="save">Save</button></div>
        <div class="danger-zone"><h3>Delete space</h3><p class="muted">Permanently delete this space and all ${Store.itemsOf(sp.id).length} of its work items.</p><button class="btn danger" data-s="delete">Delete space</button></div></div>`;
  }
  root.innerHTML = `<div class="settings-layout">${settingsNav(sp, sub)}<div class="settings-main">${main}</div></div>`;
  root.addEventListener('change', e => {
    const k = e.target.dataset.set;
    if (!k) return;
    const [a, b] = k.split('.');
    sp[a][b] = e.target.checked; Store.save(true); toast('Saved');
  });
  root.addEventListener('click', async e => {
    const g = e.target.closest('[data-glyph]'), c = e.target.closest('[data-color]');
    if (g) { sp.glyph = g.dataset.glyph; Store.save(); return; }
    if (c) { sp.color = c.dataset.color; Store.save(); return; }
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const a = b.dataset.s;
    if (a === 'save') {
      const n = root.querySelector('[name=name]').value.trim();
      if (!n) { toast('Name is required', 'error'); return; }
      sp.name = n; sp.lead = root.querySelector('[name=lead]').value; Store.save(); toast('Details saved');
    }
    if (a === 'delete') spaceMenuDelete(sp);
    if (a === 'setup-ap') openApprovalWizard(sp);
    if (a === 'edit-ap') openApprovalWizard(sp, { statusId: ap.statusId });
    if (a === 'remove-ap') {
      if (await confirmDialog({ title: 'Remove approvals?', message: 'Pending approvals will be cleared and work will no longer need sign-off.', confirmLabel: 'Remove' })) {
        sp.approvals.enabled = false;
        sp.workflow.transitions = sp.workflow.transitions.filter(t => !t.approval);
        Store.itemsOf(sp.id).forEach(i => { if (i.approval && i.approval.state === 'pending') i.approval = null; });
        dropDraft(sp, null);
        Store.save(); toast('Approvals removed');
      }
    }
  });
}
async function spaceMenuDelete(sp) {
  const n = Store.itemsOf(sp.id).length;
  if (await confirmDialog({ title: `Delete ${sp.name}?`, message: `This permanently deletes the space and its ${n} work item${n === 1 ? '' : 's'}.` })) {
    Store.deleteSpace(sp.id); toast('Space deleted'); location.hash = '#/spaces';
  }
}

/* =========================== FORMS =========================== */
const FORM_FIELDS = [
  { id: 'description', name: 'Description' }, { id: 'priority', name: 'Priority' }, { id: 'assignee', name: 'Assignee' },
  { id: 'due', name: 'Due date' }, { id: 'start', name: 'Start date' }, { id: 'labels', name: 'Labels' },
];
function viewForms(sp, root) {
  const forms = sp.forms;
  root.innerHTML = `<div class="forms">
    <div class="toolbar"><h2 class="view-title">Forms</h2><span class="grow"></span><button class="btn primary" data-f="new">${icon('plus', 14)} Create form</button></div>
    ${forms.length ? `<div class="card-grid">${forms.map(f => `<div class="form-card"><div class="fc-top">${icon('forms', 20)}<button class="icon-btn xs" data-f-menu="${f.id}">${icon('more', 14)}</button></div>
      <h3>${esc(f.name)}</h3><p class="muted small">${esc(f.description || 'No description')}</p>
      <div class="muted small">${f.submissions || 0} submission${f.submissions === 1 ? '' : 's'} · creates ${esc((WORK_TYPES.find(t => t.id === f.type) || {}).name || 'Task')}</div>
      <div class="row gap8"><button class="btn sm primary" data-f-open="${f.id}">Open form</button><button class="btn sm" data-f-edit="${f.id}">Edit</button></div></div>`).join('')}</div>`
      : `<div class="empty big"><div class="empty-illus">${icon('forms', 40)}</div><h3>Collect work requests with forms</h3><p>Build a form once and use it to capture requests. Every submission becomes a work item in this space.</p><button class="btn primary" data-f="new">Create form</button></div>`}
  </div>`;
  root.addEventListener('click', e => {
    const t = e.target;
    if (t.closest('[data-f="new"]')) formBuilder(sp, null);
    const ed = t.closest('[data-f-edit]'); if (ed) formBuilder(sp, sp.forms.find(f => f.id === ed.dataset.fEdit));
    const op = t.closest('[data-f-open]'); if (op) fillForm(sp, sp.forms.find(f => f.id === op.dataset.fOpen));
    const mm = t.closest('[data-f-menu]');
    if (mm) menu(mm, [{ value: 'dup', label: 'Duplicate', icon: icon('docs') }, { value: 'del', label: 'Delete', icon: icon('trash'), danger: true }], async v => {
      const f = sp.forms.find(x => x.id === mm.dataset.fMenu);
      if (v === 'dup') { sp.forms.push({ ...JSON.parse(JSON.stringify(f)), id: uid('fm'), name: f.name + ' (copy)', submissions: 0 }); Store.save(); }
      if (v === 'del' && await confirmDialog({ title: `Delete ${f.name}?`, message: 'Work items created from this form are kept.' })) { sp.forms = sp.forms.filter(x => x !== f); Store.save(); }
    });
  });
}
function formBuilder(sp, form) {
  const f = form ? JSON.parse(JSON.stringify(form)) : { id: uid('fm'), name: '', description: '', type: 'task', statusId: sp.workflow.statuses[0].id, fields: ['description', 'priority', 'due'], submissions: 0 };
  openModal({
    title: form ? 'Edit form' : 'Create form', width: 560,
    body: `<label class="field"><span class="field-label">Form name <span class="req">*</span></span><input class="input" name="name" value="${esc(f.name)}" autofocus placeholder="e.g. Request a design"></label>
      <label class="field"><span class="field-label">Description</span><textarea class="input" name="desc" rows="2">${esc(f.description)}</textarea></label>
      <div class="form-grid"><label class="field"><span class="field-label">Creates</span><select class="input" name="type">${WORK_TYPES.map(t => `<option value="${t.id}" ${t.id === f.type ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">In status</span><select class="input" name="status">${sp.workflow.statuses.map(s => `<option value="${s.id}" ${s.id === f.statusId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
      <div class="field"><span class="field-label">Fields on the form</span><div class="chk-list"><label class="chk-row"><input type="checkbox" checked disabled> Summary <span class="muted small">(always included)</span></label>
      ${FORM_FIELDS.map(x => `<label class="chk-row"><input type="checkbox" value="${x.id}" data-ff ${f.fields.includes(x.id) ? 'checked' : ''}> ${x.name}</label>`).join('')}</div></div>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Save form</button>',
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        f.name = el.querySelector('[name=name]').value.trim();
        if (!f.name) { el.querySelector('[name=name]').classList.add('invalid'); return; }
        f.description = el.querySelector('[name=desc]').value.trim();
        f.type = el.querySelector('[name=type]').value; f.statusId = el.querySelector('[name=status]').value;
        f.fields = $$('[data-ff]:checked', el).map(x => x.value);
        const i = sp.forms.findIndex(x => x.id === f.id);
        if (i >= 0) sp.forms[i] = f; else sp.forms.push(f);
        Store.save(); api.close(); toast('Form saved');
      });
    },
  });
}
function fillForm(sp, f) {
  const has = id => f.fields.includes(id);
  openModal({
    title: esc(f.name), width: 560, cls: 'fill-form',
    body: `${f.description ? `<p class="muted">${esc(f.description)}</p>` : ''}
      <label class="field"><span class="field-label">Summary <span class="req">*</span></span><input class="input" name="summary" autofocus></label>
      ${has('description') ? '<label class="field"><span class="field-label">Description</span><textarea class="input" name="description" rows="4"></textarea></label>' : ''}
      ${has('priority') ? `<label class="field"><span class="field-label">Priority</span><select class="input" name="priority">${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === 'medium' ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>` : ''}
      ${has('assignee') ? `<label class="field"><span class="field-label">Assignee</span><select class="input" name="assignee"><option value="">Unassigned</option>${Store.state.users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label>` : ''}
      ${has('start') ? '<label class="field"><span class="field-label">Start date</span><input class="input" type="date" name="start"></label>' : ''}
      ${has('due') ? '<label class="field"><span class="field-label">Due date</span><input class="input" type="date" name="due"></label>' : ''}
      ${has('labels') ? '<label class="field"><span class="field-label">Labels</span><input class="input" name="labels" placeholder="Separate with commas"></label>' : ''}`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Submit</button>',
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const v = n => { const x = el.querySelector(`[name=${n}]`); return x ? x.value.trim() : ''; };
        if (!v('summary')) { el.querySelector('[name=summary]').classList.add('invalid'); return; }
        const it = Store.createItem({ spaceId: sp.id, type: f.type, statusId: f.statusId, summary: v('summary'), description: v('description'), priority: v('priority') || 'medium', assignee: v('assignee') || null, start: v('start') || null, due: v('due') || null, labels: v('labels').split(',').map(s => s.trim()).filter(Boolean) });
        f.submissions = (f.submissions || 0) + 1; Store.save();
        api.close(); toast(`Submitted — ${it.key} created`);
      });
    },
  });
}

/* =========================== DOCS =========================== */
function viewDocs(sp, root, r) {
  const docs = sp.docs.slice().sort((a, b) => b.updated.localeCompare(a.updated));
  const cur = docs.find(d => d.id === (r.query && r.query.doc)) || null;
  root.innerHTML = `<div class="docs">
    <aside class="docs-list"><div class="row"><h3 class="grow">Docs</h3><button class="icon-btn sm" data-d="new" title="Create doc">${icon('plus')}</button></div>
      ${docs.map(d => `<a class="doc-link ${cur && cur.id === d.id ? 'active' : ''}" href="#/space/${encodeURIComponent(sp.key)}/docs?doc=${d.id}">${icon('docs')}<span class="ellip">${esc(d.title || 'Untitled')}</span></a>`).join('') || '<p class="muted small">No docs yet.</p>'}</aside>
    <div class="doc-main">${cur ? `
      <div class="doc-bar"><div class="muted small">Last edited ${timeAgo(cur.updated)}</div><span class="grow"></span>
        <div class="fmt">${[['bold', 'B'], ['italic', '<i>I</i>'], ['insertUnorderedList', '•'], ['insertOrderedList', '1.'], ['h2', 'H']].map(([c, l]) => `<button class="icon-btn sm" data-fmt="${c}" title="${c}">${l}</button>`).join('')}</div>
        <button class="icon-btn sm" data-d="del" title="Delete doc">${icon('trash')}</button></div>
      <input class="doc-title" value="${esc(cur.title)}" placeholder="Give this page a title" data-doc-title>
      <div class="doc-body" contenteditable="true" data-doc-body data-placeholder="Start writing...">${cur.body}</div>`
      : docs.length ? emptyState({ title: 'Pick a doc', text: 'Choose a doc from the list, or create a new one.', art: 'docs' })
        : `<div class="empty big"><div class="empty-illus">${icon('docs', 40)}</div><h3>Keep your notes next to your work</h3><p>Write plans, meeting notes and checklists for this space.</p><button class="btn primary" data-d="new">Create doc</button></div>`}
    </div></div>`;
  let saveT;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => { cur.updated = nowISO(); Store.save(true); const s = root.querySelector('.doc-bar .muted'); if (s) s.textContent = 'Saved'; }, 400);
  };
  root.addEventListener('input', e => {
    if (!cur) return;
    if (e.target.matches('[data-doc-title]')) { cur.title = e.target.value; persist(); const a = root.querySelector('.doc-link.active .ellip'); if (a) a.textContent = cur.title || 'Untitled'; }
    if (e.target.matches('[data-doc-body]')) { cur.body = e.target.innerHTML; persist(); }
  });
  root.addEventListener('click', async e => {
    const f = e.target.closest('[data-fmt]');
    if (f) { e.preventDefault(); const c = f.dataset.fmt; document.execCommand(c === 'h2' ? 'formatBlock' : c, false, c === 'h2' ? 'h2' : null); const b = root.querySelector('[data-doc-body]'); cur.body = b.innerHTML; persist(); return; }
    const b = e.target.closest('[data-d]');
    if (!b) return;
    if (b.dataset.d === 'new') {
      const d = { id: uid('doc'), title: '', body: '', created: nowISO(), updated: nowISO() };
      sp.docs.push(d); Store.save(true);
      location.hash = `#/space/${encodeURIComponent(sp.key)}/docs?doc=${d.id}`;
      setTimeout(() => { const t = $('[data-doc-title]'); if (t) t.focus(); }, 30);
    }
    if (b.dataset.d === 'del' && await confirmDialog({ title: `Delete "${cur.title || 'Untitled'}"?`, message: 'This doc will be permanently deleted.' })) {
      sp.docs = sp.docs.filter(d => d !== cur); Store.save(true); location.hash = `#/space/${encodeURIComponent(sp.key)}/docs`;
    }
  });
  root.addEventListener('mousedown', e => { if (e.target.closest('[data-fmt]')) e.preventDefault(); });
}

/* =========================== ATTACHMENTS =========================== */
function viewAttachments(sp, root, r) {
  const kind = (r.query && r.query.kind) || 'all';
  const items = Store.itemsOf(sp.id);
  let atts = items.flatMap(i => i.attachments.map(a => ({ a, i }))).sort((x, y) => y.a.at.localeCompare(x.a.at));
  if (kind === 'images') atts = atts.filter(x => (x.a.mime || '').startsWith('image/'));
  if (kind === 'docs') atts = atts.filter(x => !(x.a.mime || '').startsWith('image/'));
  const base = `#/space/${encodeURIComponent(sp.key)}/attachments`;
  const total = items.reduce((s, i) => s + i.attachments.reduce((t, a) => t + a.size, 0), 0);
  root.innerHTML = `<div class="attachments">
    <div class="toolbar"><div class="seg"><a class="${kind === 'all' ? 'on' : ''}" href="${base}">All</a><a class="${kind === 'images' ? 'on' : ''}" href="${base}?kind=images">Images</a><a class="${kind === 'docs' ? 'on' : ''}" href="${base}?kind=docs">Documents</a></div>
      <span class="muted small">${fmtBytes(total)} used</span><span class="grow"></span>
      <button class="btn primary" data-up ${items.length ? '' : 'disabled title="Create a work item first"'}>${icon('upload', 14)} Upload</button></div>
    ${atts.length ? `<div class="att-grid big">${atts.map(x => `<div class="att-wrap">${attachmentTile(x.a, x.i)}<a class="link small" data-open="${x.i.id}">${esc(x.i.key)} ${esc(x.i.summary)}</a></div>`).join('')}</div>`
      : `<div class="empty big"><div class="empty-illus">${icon('attach', 40)}</div><h3>No attachments yet</h3><p>Attach files to work items and they'll all show up here. Files up to 2 MB are stored in this browser.</p></div>`}
  </div>`;
  root.addEventListener('click', async e => {
    const o = e.target.closest('[data-open]'); if (o) { openItem(o.dataset.open); return; }
    const del = e.target.closest('[data-del-att]');
    if (del) {
      const it = Store.item(del.dataset.item);
      if (await confirmDialog({ title: 'Delete attachment?', message: 'Once you delete, it\'s gone for good.' })) { it.attachments = it.attachments.filter(a => a.id !== del.dataset.delAtt); Store.save(); }
      return;
    }
    const up = e.target.closest('[data-up]');
    if (up) {
      menu(up, [{ heading: 'Attach to' }, ...items.slice(0, 30).map(i => ({ value: i.id, label: `${esc(i.key)} ${esc(i.summary)}`, icon: typeIcon(i.type) }))], v => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true;
        inp.onchange = () => addAttachments(Store.item(v), inp.files);
        inp.click();
      }, { align: 'right', width: 320 });
    }
  });
}

const VIEWS = {
  summary: viewSummary, board: viewBoard, list: viewList, calendar: viewCalendar, timeline: viewTimeline,
  approvals: viewApprovals, forms: viewForms, docs: viewDocs, attachments: viewAttachments, reports: viewReports,
  workflow: viewWorkflow, settings: viewSettings,
};
