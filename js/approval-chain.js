/* Approval chain: who approves a work item, in steps (step 2 is asked only after everyone in step 1 approved).
 * Asked every time a work item reaches the approval stage, and editable any time from the work item
 * (Details › Approvers). item.approvalChain = [{ user, step }] is the task's own chain; without one the
 * space's preset approvers are used as a single step. */

const AC_QUEUE = [];
let acOpen = false;
/* Store calls this whenever a work item starts waiting for approval. Returns true when it will ask (and notify the
   approvers once answered); false lets Store notify the preset approvers straight away. */
Store.approvalRequested = item => {
  if (Store.loading || !document.body) return false; // not while loading or seeding data
  if (!AC_QUEUE.includes(item.id)) AC_QUEUE.push(item.id);
  setTimeout(acDrain, 60);
  return true;
};
function acDrain() {
  if (acOpen) return;
  let id;
  while ((id = AC_QUEUE.shift())) {
    const it = Store.item(id);
    if (it && it.approval && it.approval.state === 'pending') break;
  }
  if (!id) return;
  acOpen = true;
  openApprovalChain(id, { request: true, onClose: () => { acOpen = false; setTimeout(acDrain, 60); } });
}

function openApprovalChain(id, { request = false, onClose } = {}) {
  const it = Store.item(id);
  if (!it) return;
  const sp = Store.space(it.spaceId);
  const pending = it.approval && it.approval.state === 'pending';
  const decided = new Map(pending ? it.approval.approvers.filter(a => a.decision).map(a => [a.user, a.decision]) : []);
  let rows = (pending ? it.approval.approvers : Store.approvalChainFor(it)).map(a => ({ user: a.user, step: a.step || 1 }));
  const reviewName = (Store.status(sp, sp.approvals.statusId) || { name: 'review' }).name;
  const presetText = chainText(Store.approvalChainFor({ ...it, approvalChain: null }).map(c => ({ user: c.user, step: c.step })));
  const m = openModal({
    title: request ? `Who should approve ${it.key}?` : `Approvers for ${it.key}`, width: 640, cls: 'ac-modal',
    body: `<p class="muted">${request
      ? `<b>${esc(it.summary)}</b> moved to <b>${esc(reviewName)}</b>. Choose who approves it and in what order. People in a later step are only asked after everyone in the step before has approved.`
      : `Who approves <b>${esc(it.summary)}</b> every time it goes to <b>${esc(reviewName)}</b>. People in a later step are only asked after everyone in the step before has approved.`}</p>
      <div class="ac-body"></div>`,
    footer: request
      ? `<label class="check small grow"><input type="checkbox" data-ac-remember checked> Remember for ${esc(it.key)} next time</label><button class="btn subtle" data-ac-close>Keep as is</button><button class="btn primary" data-ac-ok>Send for approval</button>`
      : `${it.approvalChain ? '<button class="btn subtle" data-ac-clear title="Forget this task\'s chain">Use the space\'s approvers</button>' : ''}<span class="grow"></span><button class="btn subtle" data-ac-close>Cancel</button><button class="btn primary" data-ac-ok>Save</button>`,
    onClose: () => {
      // however the question was closed, whoever's turn it is now gets told
      const x = Store.item(id);
      if (x && x.approval && x.approval.state === 'pending') { Store.notifyApprovalTurn(x); Store.save(true); }
      if (onClose) onClose();
    },
  });
  const box = m.el.querySelector('.ac-body');
  const mode = () => (rows.length > 1 && rows.every(r => r.step === 1) ? 'together' : rows.length > 1 && rows.every((r, i) => r.step === i + 1) ? 'order' : rows.length <= 1 ? 'together' : 'custom');
  const sortRows = () => { rows = normalizeChain(rows).map(c => ({ user: c.user, step: c.step })); };
  const draw = () => {
    const md = mode(), n = Math.max(rows.length, 1);
    const users = Store.state.users;
    const stepsUsed = [...new Set(rows.map(r => r.step))].sort((a, b) => a - b);
    box.innerHTML = `<div class="ac-presets"><span class="muted small">Order</span><div class="seg"><button class="${md === 'together' ? 'on' : ''}" data-ac-mode="together">Everyone at once</button><button class="${md === 'order' ? 'on' : ''}" data-ac-mode="order">One after another</button>${md === 'custom' ? '<button class="on" disabled>Custom steps</button>' : ''}</div></div>
      <div class="ac-list">${rows.map((r, i) => `<div class="ac-row">
        <select class="input sm-select ac-step" data-ac-step="${i}" title="Approval step">${Array.from({ length: n }, (_, k) => `<option value="${k + 1}" ${r.step === k + 1 ? 'selected' : ''}>Step ${k + 1}</option>`).join('')}</select>
        ${avatar(r.user, 24)}
        <select class="input grow" data-ac-user="${i}">${users.map(u => `<option value="${u.id}" ${u.id === r.user ? 'selected' : ''} ${u.id !== r.user && rows.some(x => x.user === u.id) ? 'disabled' : ''}>${esc(u.name)}${u.id === Store.state.me ? ' (you)' : ''}</option>`).join('')}</select>
        ${decided.has(r.user) ? `<span class="lozenge ${decided.get(r.user) === 'approved' ? 'cat-done' : 'cat-danger'}">${cap(decided.get(r.user))}</span>` : ''}
        <button class="icon-btn xs" data-ac-up="${i}" ${i === 0 ? 'disabled' : ''} title="Move up">${icon('chevronUp', 14)}</button>
        <button class="icon-btn xs" data-ac-down="${i}" ${i === rows.length - 1 ? 'disabled' : ''} title="Move down">${icon('chevronDown', 14)}</button>
        <button class="icon-btn xs" data-ac-del="${i}" title="Remove">${icon('trash', 14)}</button></div>`).join('') || '<p class="muted small">Add at least one approver.</p>'}</div>
      <button class="btn subtle sm" data-ac-add ${rows.length >= users.length ? 'disabled' : ''}>${icon('plus', 12)} Add approver</button>
      ${rows.length ? `<div class="ac-flow">${stepsUsed.map((s, k) => `<div class="ac-step-box"><div class="muted small">Step ${k + 1}${k === 0 ? ' · asked first' : ` · after step ${k}`}</div>
        <div class="ac-people">${rows.filter(r => r.step === s).map(r => `<span class="ac-person">${avatar(r.user, 20)} ${esc((Store.user(r.user) || {}).name || '')}</span>`).join('')}</div></div>`).join(`<span class="ac-arrow">${icon('arrowRight', 16)}</span>`)}</div>` : ''}
      ${request ? `<p class="muted small">Space preset: ${esc(presetText)}</p>` : ''}`;
  };
  m.el.addEventListener('change', e => {
    const s = e.target.dataset.acStep, u = e.target.dataset.acUser;
    if (s != null) { rows[Number(s)].step = Number(e.target.value); sortRows(); draw(); }
    if (u != null) { rows[Number(u)].user = e.target.value; draw(); }
  });
  m.el.addEventListener('click', e => {
    const t = e.target.closest('[data-ac-mode],[data-ac-up],[data-ac-down],[data-ac-del],[data-ac-add],[data-ac-ok],[data-ac-close],[data-ac-clear]');
    if (!t) return;
    const d = t.dataset;
    if (d.acMode) { rows.forEach((r, i) => { r.step = d.acMode === 'order' ? i + 1 : 1; }); draw(); }
    if (d.acUp != null || d.acDown != null) {
      const was = mode(), i = Number(d.acUp != null ? d.acUp : d.acDown), j = d.acUp != null ? i - 1 : i + 1;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      if (was === 'order') rows.forEach((r, k) => { r.step = k + 1; }); // keep "one after another" in the new order
      else if (rows[i].step !== rows[j].step) { const x = rows[i].step; rows[i].step = rows[j].step; rows[j].step = x; }
      draw();
    }
    if (d.acDel != null) { rows.splice(Number(d.acDel), 1); sortRows(); draw(); }
    if (t.matches('[data-ac-add]')) {
      const free = Store.state.users.find(u => !rows.some(r => r.user === u.id));
      if (free) { rows.push({ user: free.id, step: mode() === 'together' ? 1 : Math.max(0, ...rows.map(r => r.step)) + 1 }); draw(); }
    }
    if (t.matches('[data-ac-close]')) m.close();
    if (t.matches('[data-ac-clear]')) { it.approvalChain = null; Store.log(it, 'now uses the space\'s approvers'); Store.save(); m.close(); toast(`${it.key} uses the space's approvers`); }
    if (t.matches('[data-ac-ok]')) {
      if (!rows.length) { toast('Add at least one approver', 'error'); return; }
      const remember = request ? m.el.querySelector('[data-ac-remember]').checked : true;
      Store.setApprovalChain(it.id, rows, { remember });
      m.close();
      const first = Store.item(it.id).approval;
      toast(first && first.state === 'pending' ? `Sent to ${chainText(first.approvers.filter(a => (a.step || 1) === approvalStep(first)))} for approval` : 'Approvers saved');
    }
  });
  draw();
  return m;
}

/* The approval box on a work item: approvers by step, whose turn it is, and the buttons for you when it's yours */
function approvalBoxHTML(it) {
  const ap = it.approval;
  if (!ap) return '';
  const cur = approvalStep(ap);
  const steps = [...new Set(ap.approvers.map(a => a.step || 1))].sort((a, b) => a - b);
  const state = a => a.decision ? cap(a.decision) : ap.state !== 'pending' ? '—' : (a.step || 1) === cur ? 'Their turn' : `After step ${steps.indexOf(a.step || 1)}`;
  return `<div class="approval-box state-${ap.state}">
    <div class="ab-head">${icon('approvals')} <b>${esc(ap.fieldName || 'Approvals')}</b>
      <span class="lozenge ${ap.state === 'approved' ? 'cat-done' : ap.state === 'declined' ? 'cat-danger' : 'cat-progress'}">${ap.state === 'pending' ? (steps.length > 1 ? `Step ${steps.indexOf(cur) + 1} of ${steps.length}` : 'Waiting for approval') : cap(ap.state)}</span></div>
    ${steps.map((s, k) => `${steps.length > 1 ? `<div class="ab-step muted small">Step ${k + 1}</div>` : ''}
      <div class="ab-list">${ap.approvers.filter(a => (a.step || 1) === s).map(a => `<div class="ab-row ${ap.state === 'pending' && (a.step || 1) === cur && !a.decision ? 'turn' : ''}">${avatar(a.user, 20)} <span class="grow">${esc((Store.user(a.user) || {}).name || '')}</span><span class="muted small">${state(a)}</span></div>`).join('')}</div>`).join('')}
    ${canApprove(it) ? `<div class="ab-actions"><button class="btn primary" data-act="approve">${icon('check', 14)} Approve</button><button class="btn" data-act="decline">${icon('close', 14)} Decline</button></div>` : ''}
    ${ap.state === 'pending' ? '<div class="ab-foot"><a class="link small" data-act="ac-edit">Change approvers or order</a></div>' : ''}
  </div>`;
}
