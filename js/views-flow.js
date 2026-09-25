/* Workflow editor, task level:
 *   #/space/KEY/workflow              canvas: stages as columns, draggable task boxes, arrows = rules between tasks
 *   #/space/KEY/workflow/task/<id>    one task's own diagram: its transitions and their rules
 * Plus task templates (save a space's tasks + people + rules, start new spaces from them).
 */

const FLOW_UI = {};
const flowUI = sp => FLOW_UI[sp.id] || (FLOW_UI[sp.id] = { linkFrom: null, sel: null });
const flowBase = sp => `#/space/${encodeURIComponent(sp.key)}/workflow`;

/* Tasks shown on the canvas: ones you added, plus any task a rule mentions */
function canvasTaskIds(sp) {
  const ids = new Set(sp.canvasTasks || []);
  (sp.taskFlows || []).forEach(f => { if (f.rules.length) ids.add(f.taskId); f.rules.forEach(r => (r.cfg.tasks || []).forEach(t => ids.add(t))); });
  return [...ids].filter(id => { const i = Store.item(id); return i && i.spaceId === sp.id; });
}

/* Arrows between tasks, derived from the rules */
function taskLinks(sp) {
  const out = [];
  (sp.taskFlows || []).forEach(f => f.rules.forEach(r => {
    const T = RULE_TYPES[r.type];
    if (!T || !r.cfg.tasks) return;
    if (T.kind === 'action') {
      r.cfg.tasks.forEach(t => out.push({ from: f.taskId, to: t, kind: 'action', flow: f.id, rule: r.id,
        label: r.type === 'a_move' ? `→ ${statusLabel(sp, r.cfg.status)}` : `assign ${userName(r.cfg.user)}`,
        tip: `When ${Store.item(f.taskId).key} moves to ${statusLabel(sp, f.to)}: ${ruleSummary(sp, r)}` }));
    } else {
      r.cfg.tasks.forEach(t => out.push({ from: t, to: f.taskId, kind: T.kind, flow: f.id, rule: r.id,
        label: `waits: ${statusLabel(sp, r.cfg.status)}`,
        tip: `${Store.item(f.taskId).key} can't move to ${statusLabel(sp, f.to)} until ${Store.item(t) ? Store.item(t).key : ''} is in ${statusLabel(sp, r.cfg.status)}` }));
    }
  }));
  return out;
}

function ruleCounts(sp, taskId) {
  const c = { restrict: 0, validate: 0, action: 0 };
  (sp.taskFlows || []).filter(f => f.taskId === taskId).forEach(f => f.rules.forEach(r => { const T = RULE_TYPES[r.type]; if (T) c[T.kind]++; }));
  return c;
}

/* =========================== WORKFLOW CANVAS =========================== */
/* Stages are the columns; task boxes sit in their stage and can be dragged up/down
   or into another stage (which moves the task, through its rules). Columns can be
   dragged to reorder stages. */
const FC = { COL_W: 260, GAP: 64, PAD_X: 28, TOP: 60, BOX_H: 112, VGAP: 18 };
const fcColX = i => FC.PAD_X + i * (FC.COL_W + FC.GAP);

function canvasLayout(sp, ids) {
  sp.canvasPos = sp.canvasPos || {};
  const pos = {};
  sp.workflow.statuses.forEach((s, ci) => {
    const its = ids.map(id => Store.item(id)).filter(i => i && i.statusId === s.id).sort(byRank);
    const taken = [];
    its.filter(i => sp.canvasPos[i.id] && sp.canvasPos[i.id].y != null).forEach(i => { pos[i.id] = { x: fcColX(ci), y: sp.canvasPos[i.id].y }; taken.push(pos[i.id].y); });
    let y = FC.TOP;
    its.filter(i => !pos[i.id]).forEach(i => {
      while (taken.some(t => Math.abs(t - y) < FC.BOX_H + FC.VGAP)) y += 8;
      pos[i.id] = { x: fcColX(ci), y }; taken.push(y); y += FC.BOX_H + FC.VGAP;
    });
  });
  return pos;
}

function viewTaskCanvas(sp, root) {
  const ui = flowUI(sp);
  const ids = canvasTaskIds(sp);
  const sts = sp.workflow.statuses;
  const nRules = (sp.taskFlows || []).reduce((n, f) => n + f.rules.length, 0);
  const pos = canvasLayout(sp, ids);
  const W = fcColX(sts.length) + 220;
  const H = Math.max(560, ...Object.values(pos).map(p => p.y + FC.BOX_H + 140));
  const anyTo = new Set(sp.workflow.transitions.filter(t => t.from.includes('any')).map(t => t.to));
  const box = it => {
    const c = ruleCounts(sp, it.id);
    const p = pos[it.id];
    return `<div class="fc-box ${ui.linkFrom === it.id ? 'linking' : ''} ${ui.linkFrom && ui.linkFrom !== it.id ? 'pickable' : ''}" data-box="${it.id}" data-colof="${it.statusId}" style="left:${p.x}px;top:${p.y}px">
      <div class="fc-box-top">${typeIcon(it.type)}<span class="key ${Store.isDone(it) ? 'done' : ''}">${esc(it.key)}</span><span class="grow"></span>
        ${c.restrict + c.validate ? `<span class="fc-badge wait" title="${c.restrict + c.validate} waiting rule(s)">${icon('lock', 11)} ${c.restrict + c.validate}</span>` : ''}
        ${c.action ? `<span class="fc-badge act" title="${c.action} action rule(s)">${icon('bolt', 11)} ${c.action}</span>` : ''}</div>
      <div class="fc-sum">${esc(it.summary)}</div>
      <div class="fc-box-foot">${itemAvatar(it, 20)}<span class="ellip grow muted small" title="${esc(assignedText(it))}">${esc((Store.user(it.assignee) || { name: 'Unassigned' }).name)}${Store.user(it.reporter) && it.reporter !== it.assignee ? ` · ${reporterText(it)}` : ''}</span>
        <button class="icon-btn xs" data-fl-link="${it.id}" title="Link to another task">${icon('link', 14)}</button>
        <button class="icon-btn xs" data-fl-menu="${it.id}" title="More">${icon('more', 14)}</button></div>
    </div>`;
  };
  root.innerHTML = `<div class="settings-layout">${settingsNav(sp, 'wf')}
    <div class="settings-main wf flow">
      <div class="wf-top">
        <div><div class="muted small">Workflow for</div><div class="wf-types"><b>${esc(sp.name)}</b><span class="muted small">${sts.length} stages · ${ids.length} task${ids.length === 1 ? '' : 's'} on canvas · ${nRules} rule${nRules === 1 ? '' : 's'}</span></div></div>
        <div class="row gap8">
          <button class="btn primary" data-fl="add-task">${icon('plus', 14)} Add task</button>
          <button class="btn" data-fl="add-stage">${icon('plus', 14)} Add stage</button>
          <button class="btn ${ui.linkFrom ? 'selected' : ''}" data-fl="link">${icon('link', 14)} Link tasks</button>
          <button class="btn" data-fl="templates">${icon('docs', 14)} Templates ${icon('chevronDown', 12)}</button>
          <button class="icon-btn" data-fl="help" title="How the workflow works">${icon('help')}</button>
        </div>
      </div>
      ${ui.linkFrom ? `<div class="banner info">${icon('link')} Pick the task that <b>${esc(Store.item(ui.linkFrom).key)}</b> should trigger or wait for. <button class="btn subtle sm" data-fl="cancel-link">Cancel</button></div>`
        : `<div class="muted small fc-hint">Drag tasks to arrange them or move them to another stage · drag a stage's ${icon('drag', 12)} handle to reorder stages · solid arrows <span class="lg-line act"></span> trigger other tasks, dashed <span class="lg-line wait"></span> wait for them. Changes save automatically.</div>`}
      <div class="fc-wrap" data-keep-scroll="fc-${sp.id}">
        <div class="fc-board" style="width:${W}px;height:${H}px">
          ${sts.map((s, ci) => {
            const n = ids.filter(id => Store.item(id).statusId === s.id).length;
            const ap = sp.approvals.enabled && sp.approvals.statusId === s.id;
            return `<div class="fc-col" data-col="${s.id}" style="left:${fcColX(ci)}px;width:${FC.COL_W}px">
              <div class="fc-col-head"><span class="fc-grip" data-col-drag="${s.id}" title="Drag to reorder">${icon('drag', 14)}</span>${lozenge(s)}<span class="count">${n}</span>
                ${anyTo.has(s.id) ? `<span class="muted small" title="Every task can move here from any stage">All</span>` : ''}
                ${ap ? `<span class="appr-dot" title="Approval required here">${icon('approvals', 12)}</span>` : ''}
                <span class="grow"></span><button class="icon-btn xs" data-col-menu="${s.id}" title="Stage actions">${icon('more', 14)}</button></div>
              ${!ids.length && ci === 0 ? `<div class="fc-empty"><b>No tasks on the canvas yet</b><span>Add tasks, then link them so they trigger or wait for each other.</span><button class="btn primary sm" data-fl="add-task">Add task</button></div>` : ''}
            </div>`;
          }).join('')}
          <button class="fc-add-col" data-fl="add-stage" style="left:${fcColX(sts.length)}px" title="Add stage">${icon('plus')} Add stage</button>
          ${ids.map(id => box(Store.item(id))).join('')}
          <svg class="fc-links"><defs>
            <marker id="fc-arrow-act" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-act"/></marker>
            <marker id="fc-arrow-wait" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-wait"/></marker></defs></svg>
          <div class="fc-labels"></div>
        </div>
      </div>
    </div></div>`;

  if (ids.length) requestAnimationFrame(() => drawCanvasLinks(sp, root));

  root.addEventListener('click', e => {
    const t = e.target;
    const lk = t.closest('[data-fl-link]');
    if (lk) { ui.linkFrom = ui.linkFrom === lk.dataset.flLink ? null : lk.dataset.flLink; render(); return; }
    const mm = t.closest('[data-fl-menu]');
    if (mm) { canvasBoxMenu(mm, sp, mm.dataset.flMenu); return; }
    const cm = t.closest('[data-col-menu]');
    if (cm) { stageMenu(cm, sp, cm.dataset.colMenu); return; }
    const lab = t.closest('[data-link-flow]');
    if (lab) { ui.sel = { kind: 'flow', id: lab.dataset.linkFlow }; location.hash = `${flowBase(sp)}/task/${(sp.taskFlows.find(f => f.id === lab.dataset.linkFlow) || {}).taskId}`; return; }
    const bx = t.closest('[data-box]');
    if (bx) {
      if (bx.dataset.dragged) { delete bx.dataset.dragged; return; }
      if (ui.linkFrom && ui.linkFrom !== bx.dataset.box) { const a = ui.linkFrom; ui.linkFrom = null; render(); openLinkDialog(sp, a, bx.dataset.box); return; }
      if (ui.linkFrom) return;
      ui.sel = null; location.hash = `${flowBase(sp)}/task/${bx.dataset.box}`; return;
    }
    const b = t.closest('[data-fl]');
    if (!b) return;
    switch (b.dataset.fl) {
      case 'add-task': openCanvasTaskPicker(sp); break;
      case 'add-stage': addStatusPopover(b, sp); break;
      case 'link':
        if (ui.linkFrom) { ui.linkFrom = null; render(); break; }
        if (!ids.length) { toast('Add tasks to the canvas first', 'error'); break; }
        menu(b, [{ heading: 'Link from which task?' }, ...ids.map(id => Store.item(id)).map(i => ({ value: i.id, label: `${esc(i.key)} ${esc(i.summary)}`, icon: typeIcon(i.type) }))], v => { ui.linkFrom = v; render(); }, { width: 340 });
        break;
      case 'cancel-link': ui.linkFrom = null; render(); break;
      case 'templates': {
        const n = Store.state.taskTemplates.length;
        menu(b, [{ value: 'save', label: 'Save as template', icon: icon('download') }, { value: 'apply', label: 'Apply template', icon: icon('upload'), hint: n ? String(n) : '' }, { value: 'manage', label: 'Manage templates', icon: icon('gear') }], v => {
          if (v === 'save') openSaveTaskTemplate(sp);
          if (v === 'apply') openApplyTaskTemplate(sp);
          if (v === 'manage') openTaskTemplates();
        }, { align: 'right', width: 240 });
        break;
      }
      case 'help': openFlowHelp(); break;
    }
  });

  // drag task boxes (and move them between stages), drag stage columns to reorder
  root.addEventListener('mousedown', e => {
    if (e.button !== 0 || ui.linkFrom) return;
    const board = root.querySelector('.fc-board');
    if (!board) return;
    const grip = e.target.closest('[data-col-drag]');
    const bx = !grip && !e.target.closest('button') && e.target.closest('[data-box]');
    if (!grip && !bx) return;
    e.preventDefault();
    const br = () => board.getBoundingClientRect();
    const colAt = clientX => Math.max(0, Math.min(sts.length - 1, Math.floor((clientX - br().left - FC.PAD_X + FC.GAP / 2) / (FC.COL_W + FC.GAP))));
    const x0 = e.clientX, y0 = e.clientY;
    let moved = false;
    if (bx) {
      const l0 = bx.offsetLeft, t0 = bx.offsetTop;
      const mv = ev => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        moved = true;
        bx.classList.add('dragging');
        bx.style.left = (l0 + dx) + 'px'; bx.style.top = Math.max(FC.TOP - 16, t0 + dy) + 'px';
        const ci = colAt(ev.clientX);
        $$('.fc-col', board).forEach((c, i) => c.classList.toggle('drop-over', i === ci));
      };
      const up = ev => {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        $$('.fc-col.drop-over', board).forEach(c => c.classList.remove('drop-over'));
        if (!moved) return;
        bx.dataset.dragged = '1';
        const it = Store.item(bx.dataset.box);
        const target = sts[colAt(ev.clientX)];
        const y = Math.max(FC.TOP, Math.round((t0 + ev.clientY - y0) / 8) * 8);
        const prev = sp.canvasPos[it.id];
        sp.canvasPos[it.id] = { y };
        if (target.id !== it.statusId && !Store.updateItem(it.id, { statusId: target.id }, true)) {
          if (prev) sp.canvasPos[it.id] = prev; else delete sp.canvasPos[it.id];
        }
        Store.save();
      };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      return;
    }
    // column reorder
    const sid = grip.dataset.colDrag;
    const col = board.querySelector(`.fc-col[data-col="${sid}"]`);
    const parts = [col, ...$$(`[data-colof="${sid}"]`, board)];
    const from = sts.findIndex(s => s.id === sid);
    const mv = ev => {
      const dx = ev.clientX - x0;
      if (!moved && Math.abs(dx) < 5) return;
      moved = true;
      parts.forEach(p => { p.style.transform = `translateX(${dx}px)`; p.classList.add('dragging'); });
      const ci = colAt(ev.clientX);
      $$('.fc-col', board).forEach((c, i) => c.classList.toggle('drop-over', i === ci && i !== from));
    };
    const up = ev => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      if (!moved) return;
      const to = colAt(ev.clientX);
      if (to === from) { render(); return; }
      const list = sp.workflow.statuses;
      const [s] = list.splice(from, 1);
      list.splice(to, 0, s);
      Store.save();
      toast(`${s.name} moved`);
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
}

/* Stage (column) actions */
function stageMenu(anchor, sp, statusId) {
  const st = Store.status(sp, statusId);
  const list = sp.workflow.statuses;
  const idx = list.indexOf(st);
  const anyT = sp.workflow.transitions.find(t => t.to === st.id && t.from.includes('any'));
  const ap = sp.approvals.enabled && sp.approvals.statusId === st.id;
  menu(anchor, [
    { heading: st.name },
    { value: 'rename', label: 'Rename stage', icon: icon('edit') },
    { value: 'cat', label: `Category: ${(CATEGORIES.find(c => c.id === st.cat) || {}).name}`, icon: icon('sliders') },
    { value: 'any', label: 'Tasks can move here from any stage', icon: icon('arrowRight'), selected: !!anyT },
    { value: 'approval', label: ap ? 'Edit approval' : 'Require approval here', icon: icon('approvals') },
    '-',
    { value: 'left', label: 'Move stage left', icon: icon('arrowLeft'), disabled: idx === 0 },
    { value: 'right', label: 'Move stage right', icon: icon('arrowRight'), disabled: idx === list.length - 1 },
    '-',
    { value: 'delete', label: 'Delete stage', icon: icon('trash'), danger: true, disabled: list.length <= 1 },
  ], v => {
    if (v === 'rename') {
      popover(anchor, `<div class="pad"><input class="input" value="${esc(st.name)}" maxlength="60"><div class="muted small" style="margin-top:6px">Press Enter to save</div></div>`, {
        force: true, width: 260,
        onMount(el) { const inp = el.querySelector('input'); inp.select(); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && inp.value.trim()) { st.name = inp.value.trim(); closePopover(); Store.save(); } }); },
      });
      return true;
    }
    if (v === 'cat') {
      menu(anchor, CATEGORIES.map(c => ({ value: c.id, label: `<span class="lozenge cat-${c.id}">${c.name}</span>`, selected: st.cat === c.id })), c => { st.cat = c; Store.itemsOf(sp.id).filter(i => i.statusId === st.id).forEach(i => Store.afterStatusChange(i)); Store.save(); }, { force: true });
      return true;
    }
    if (v === 'any') {
      if (anyT) sp.workflow.transitions = sp.workflow.transitions.filter(t => t !== anyT);
      else sp.workflow.transitions.push({ id: uid('tr'), name: st.name, from: ['any'], to: st.id });
      Store.save();
    }
    if (v === 'approval') openApprovalWizard(sp, { statusId: st.id });
    if (v === 'left' || v === 'right') { const j = v === 'left' ? idx - 1 : idx + 1; [list[idx], list[j]] = [list[j], list[idx]]; Store.save(); }
    if (v === 'delete') moveAndDeleteStatus(sp, st);
  }, { align: 'right', width: 290 });
}

function drawCanvasLinks(sp, root) {
  const board = root.querySelector('.fc-board');
  if (!board) return;
  const svg = board.querySelector('.fc-links'), labels = board.querySelector('.fc-labels');
  svg.setAttribute('width', board.scrollWidth); svg.setAttribute('height', board.scrollHeight);
  const rect = id => { const el = board.querySelector(`[data-box="${id}"]`); return el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null; };
  const pairIdx = {};
  let paths = '', labs = '';
  taskLinks(sp).forEach(l => {
    const a = rect(l.from), b = rect(l.to);
    if (!a || !b) return;
    const k = [l.from, l.to].sort().join('|');
    const n = pairIdx[k] = (pairIdx[k] || 0) + 1;
    const acx = a.x + a.w / 2, bcx = b.x + b.w / 2;
    let x1, y1, x2, y2, c1x, c2x;
    const off = (n - 1) * 14;
    if (bcx > acx + 20) { x1 = a.x + a.w; x2 = b.x; y1 = a.y + a.h / 2 + off; y2 = b.y + b.h / 2 + off; const d = Math.max(40, (x2 - x1) / 2); c1x = x1 + d; c2x = x2 - d; }
    else if (bcx < acx - 20) { x1 = a.x; x2 = b.x + b.w; y1 = a.y + a.h / 2 + off; y2 = b.y + b.h / 2 + off; const d = Math.max(40, (x1 - x2) / 2); c1x = x1 - d; c2x = x2 + d; }
    else { x1 = a.x + a.w; x2 = b.x + b.w; y1 = a.y + a.h / 2; y2 = b.y + b.h / 2; c1x = x1 + 60 + off; c2x = x2 + 60 + off; }
    const cls = l.kind === 'action' ? 'act' : 'wait';
    paths += `<path d="M${x1},${y1} C${c1x},${y1} ${c2x},${y2} ${x2},${y2}" class="fc-path ${cls}" marker-end="url(#fc-arrow-${cls})"/>`;
    const mx = 0.125 * x1 + 0.375 * c1x + 0.375 * c2x + 0.125 * x2, my = 0.5 * y1 + 0.5 * y2;
    labs += `<button class="fc-label ${cls}" style="left:${mx}px;top:${my}px" data-link-flow="${l.flow}" data-tip="${esc(l.tip)}">${l.kind === 'action' ? icon('bolt', 11) : icon('lock', 11)} ${esc(l.label)}</button>`;
  });
  svg.innerHTML = svg.querySelector('defs').outerHTML + paths;
  labels.innerHTML = labs;
}

window.addEventListener('resize', () => { const r = App.route; if (r && r.tab === 'workflow' && r.sub !== 'task') { const sp = currentSpace(); if (sp) drawCanvasLinks(sp, $('#view')); } });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || modalStack.length || openPop) return;
  const sp = currentSpace();
  if (sp && FLOW_UI[sp.id] && FLOW_UI[sp.id].linkFrom) { FLOW_UI[sp.id].linkFrom = null; render(); }
});

function canvasBoxMenu(anchor, sp, id) {
  const it = Store.item(id);
  const c = ruleCounts(sp, id);
  const mentioned = (sp.taskFlows || []).some(f => f.rules.some(r => (r.cfg.tasks || []).includes(id)));
  menu(anchor, [
    { value: 'flow', label: 'Open task workflow', icon: icon('approvals') },
    { value: 'open', label: 'Open work item', icon: icon('external') },
    { value: 'link', label: 'Link to another task', icon: icon('link') },
    '-',
    { value: 'remove', label: 'Remove from canvas', icon: icon('close'), disabled: !!(c.restrict + c.validate + c.action) || mentioned, hint: c.restrict + c.validate + c.action || mentioned ? 'has rules' : '' },
  ], v => {
    if (v === 'flow') location.hash = `${flowBase(sp)}/task/${id}`;
    if (v === 'open') openItem(id);
    if (v === 'link') { flowUI(sp).linkFrom = id; render(); }
    if (v === 'remove') { sp.canvasTasks = (sp.canvasTasks || []).filter(x => x !== id); Store.save(); toast(`${it.key} removed from the canvas`); }
  }, { align: 'right', width: 250 });
}

/* Task list: pick which tasks go on the canvas, or create new ones */
function openCanvasTaskPicker(sp) {
  const onCanvas = new Set(canvasTaskIds(sp));
  const chosen = new Set(onCanvas);
  const m = openModal({
    title: 'Add tasks', width: 640, cls: 'task-picker-modal',
    body: `<p class="muted">Pick the tasks you want to connect with rules. Tasks already linked by a rule always stay on the canvas.</p>
      <div class="tp-create"><input class="input" placeholder="Create a new task: what needs to be done?" data-new-sum>
        <select class="input" data-new-user><option value="">Unassigned</option>${Store.state.users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
        <button class="btn" data-new-add>${icon('plus', 14)} Create</button></div>
      <div class="row gap8 tp-bar"><div class="search-sm grow">${icon('search')}<input placeholder="Search tasks" data-tp-search></div><button class="btn subtle sm" data-all>Select all</button><button class="btn subtle sm" data-none>Clear</button></div>
      <div class="tp-list big"></div>`,
    footer: '<span class="muted small" data-count></span><span class="grow"></span><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Add to canvas</button>',
  });
  const el = m.el;
  const list = el.querySelector('.tp-list');
  const draw = () => {
    const q = (el.querySelector('[data-tp-search]').value || '').trim().toLowerCase();
    const its = Store.itemsOf(sp.id).sort(byRank);
    list.innerHTML = its.length ? its.filter(i => !q || (i.key + ' ' + i.summary).toLowerCase().includes(q)).map(i => `<label class="chk-row tp-row"><input type="checkbox" value="${i.id}" ${chosen.has(i.id) ? 'checked' : ''} ${onCanvas.has(i.id) && canvasTaskIds({ ...sp, canvasTasks: [] }).includes(i.id) ? 'disabled' : ''}>
      ${typeIcon(i.type)} <span class="key">${esc(i.key)}</span> <span class="ellip grow">${esc(i.summary)}</span> ${lozenge(Store.statusOf(i))} ${itemAvatar(i, 20)}</label>`).join('')
      : '<p class="muted">No tasks in this space yet. Create one above.</p>';
    el.querySelector('[data-count]').textContent = `${chosen.size} selected`;
  };
  el.addEventListener('input', e => { if (e.target.matches('[data-tp-search]')) draw(); });
  el.addEventListener('change', e => { if (e.target.type === 'checkbox') { if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value); el.querySelector('[data-count]').textContent = `${chosen.size} selected`; } });
  const create = () => {
    const inp = el.querySelector('[data-new-sum]');
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    const it = Store.createItem({ spaceId: sp.id, summary: v, assignee: el.querySelector('[data-new-user]').value || null, rank: Date.now() }, true);
    Store.save(true);
    chosen.add(it.id); inp.value = ''; inp.focus(); draw();
  };
  el.addEventListener('keydown', e => { if (e.target.matches('[data-new-sum]') && e.key === 'Enter') create(); });
  el.addEventListener('click', e => {
    if (e.target.closest('[data-new-add]')) create();
    if (e.target.closest('[data-all]')) { $$('.tp-row input:not(:disabled)', list).forEach(i => chosen.add(i.value)); draw(); }
    if (e.target.closest('[data-none]')) { $$('.tp-row input:not(:disabled)', list).forEach(i => chosen.delete(i.value)); draw(); }
    if (e.target.closest('[data-ok]')) {
      sp.canvasTasks = [...chosen];
      Store.save(); m.close();
    }
  });
  draw();
  setTimeout(() => el.querySelector('[data-new-sum]').focus(), 0);
}

/* Connect task A to task B: A triggers B, or B waits for A */
function openLinkDialog(sp, aId, bId) {
  let a = Store.item(aId), b = Store.item(bId);
  const sts = sp.workflow.statuses;
  const byCat = c => (sts.find(s => s.cat === c) || sts[0]).id;
  const stSel = (name, v) => `<select class="input sm-select" data-l="${name}">${sts.map(s => `<option value="${s.id}" ${s.id === v ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
  let mode = 'trigger';
  const m = openModal({ title: 'Link tasks', width: 680, body: '<div class="link-body"></div>', footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Create link</button>' });
  const body = m.el.querySelector('.link-body');
  const chip = i => `<span class="link-chip">${typeIcon(i.type)} <b>${esc(i.key)}</b> <span class="ellip">${esc(i.summary)}</span> ${itemAvatar(i, 20)}</span>`;
  const draw = () => {
    body.innerHTML = `<div class="link-pair">${chip(a)}<button class="icon-btn sm" data-swap title="Swap">${icon('refresh', 14)}</button>${chip(b)}</div>
      <label class="radio-card link-opt ${mode === 'trigger' ? 'on' : ''}"><input type="radio" name="lm" value="trigger" ${mode === 'trigger' ? 'checked' : ''}>
        <div><div class="lo-title">${icon('bolt', 14)} <b>${esc(a.key)} triggers ${esc(b.key)}</b></div>
        <div class="lo-sentence">When <b>${esc(a.key)}</b> moves to ${stSel('aTo', byCat('done'))}, move <b>${esc(b.key)}</b> to ${stSel('bTo', byCat('progress'))}</div>
        <div class="lo-sentence">and assign ${esc(b.key)} to <select class="input sm-select" data-l="assign"><option value="">keep current assignee</option>${Store.state.users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div></div></label>
      <label class="radio-card link-opt ${mode === 'wait' ? 'on' : ''}"><input type="radio" name="lm" value="wait" ${mode === 'wait' ? 'checked' : ''}>
        <div><div class="lo-title">${icon('lock', 14)} <b>${esc(b.key)} waits for ${esc(a.key)}</b></div>
        <div class="lo-sentence"><b>${esc(b.key)}</b> can't move to ${stSel('bTo2', byCat('progress'))} until <b>${esc(a.key)}</b> is in ${stSel('aIn', byCat('done'))}</div>
        <div class="lo-sentence"><select class="input sm-select" data-l="strict"><option value="r_task">Hide the move until then (Restrict)</option><option value="v_task">Show the move but refuse it (Validate)</option></select></div></div></label>
      <p class="muted small">You can fine-tune this later from either task's workflow, or add more rule types there.</p>`;
  };
  m.el.addEventListener('change', e => { if (e.target.name === 'lm') { mode = e.target.value; $$('.link-opt', m.el).forEach(x => x.classList.toggle('on', x.contains(e.target))); } });
  m.el.addEventListener('click', e => {
    if (e.target.closest('[data-swap]')) { [a, b] = [b, a]; draw(); return; }
    if (!e.target.closest('[data-ok]')) return;
    const v = n => m.el.querySelector(`[data-l="${n}"]`).value;
    let f;
    if (mode === 'trigger') {
      f = ensureFlow(sp, a.id, ['any'], v('aTo'));
      const same = f.rules.find(r => r.type === 'a_move' && r.cfg.status === v('bTo') && (r.cfg.assign || '') === v('assign'));
      if (same) { if (!same.cfg.tasks.includes(b.id)) same.cfg.tasks.push(b.id); }
      else f.rules.push({ id: uid('rl'), type: 'a_move', cfg: { tasks: [b.id], status: v('bTo'), assign: v('assign') } });
    } else {
      f = ensureFlow(sp, b.id, ['any'], v('bTo2'));
      const type = v('strict');
      const same = f.rules.find(r => r.type === type && r.cfg.status === v('aIn') && r.cfg.mode !== 'any');
      if (same) { if (!same.cfg.tasks.includes(a.id)) same.cfg.tasks.push(a.id); }
      else f.rules.push({ id: uid('rl'), type, cfg: { tasks: [a.id], status: v('aIn'), mode: 'all' } });
    }
    sp.canvasTasks = [...new Set([...(sp.canvasTasks || []), a.id, b.id])];
    Store.save(); m.close();
    toast(mode === 'trigger' ? `${a.key} now triggers ${b.key}` : `${b.key} now waits for ${a.key}`);
  });
  draw();
}

function openFlowHelp() {
  openModal({
    title: 'How task rules work', width: 600,
    body: `<ul class="steps">
      <li><b>Stages</b> are the columns (To Do, In Progress, Done…). Add them with <b>Add stage</b>, drag a column's handle to reorder, and use its ••• menu to rename, recategorise, require approval or delete.</li>
      <li>Drag a task box to arrange it, or drop it in another stage to move the task. Rules still apply, so a blocked move snaps back.</li>
      <li><b>Task transitions</b> belong to one task: "when <i>this</i> task moves from In Progress to Done". Open a task from the canvas to see and edit them.</li>
      <li>Each task transition can have rules, just like the Add rule dialog: <b>Restrict</b> (hide the move until…), <b>Validate</b> (refuse the move unless…), and <b>Perform actions</b> (move or assign other tasks, set fields).</li>
      <li><b>Link tasks</b> is the quick way: pick task A, then task B, and choose "A triggers B" or "B waits for A".</li>
      <li>Rules run everywhere: board drag and drop, the status menu, list and bulk changes.</li></ul>`,
    footer: '<button class="btn primary" data-close>Got it</button>',
  });
}

/* =========================== ONE TASK'S WORKFLOW =========================== */
function viewTaskFlow(sp, root, r) {
  const it = Store.item(r.sub2);
  if (!it || it.spaceId !== sp.id) { location.replace(`${flowBase(sp)}`); return; }
  const ui = flowUI(sp);
  const w = sp.workflow;
  const sts = w.statuses;
  w.layout = w.layout || {};
  sts.forEach((s, i) => { if (!w.layout[s.id]) w.layout[s.id] = { x: 140 + i * 250, y: 170 }; });
  const NW = 150, NH = 40;
  const pos = id => w.layout[id];
  const flows = (sp.taskFlows || []).filter(f => f.taskId === it.id);
  if (ui.sel && ui.sel.kind === 'flow' && !flows.some(f => f.id === ui.sel.id)) ui.sel = null;
  const sel = ui.sel;
  const curve = (a, b, bend) => {
    const x1 = a.x + NW / 2, y1 = a.y + NH / 2, x2 = b.x + NW / 2, y2 = b.y + NH / 2;
    const dir = x2 >= x1 ? 1 : -1;
    const sx = x1 + dir * NW / 2, ex = x2 - dir * NW / 2;
    const mx = (sx + ex) / 2, my = (y1 + y2) / 2 + bend;
    return { d: `M${sx},${y1} Q${mx},${my} ${ex},${y2}`, lx: mx, ly: (y1 + y2) / 2 + bend / 2 };
  };

  // stage transitions (shared by every task), drawn muted
  let svg = '';
  w.transitions.forEach(t => t.from.forEach(f => {
    if (f === 'any' || f === 'start' || !pos(f) || !pos(t.to)) return;
    const c = curve(pos(f), pos(t.to), 0);
    const on = sel && sel.kind === 'space' && sel.id === t.id;
    svg += `<g class="edge space ${on ? 'on' : ''}" data-space-t="${t.id}"><path d="${c.d}" marker-end="url(#arrow)"/></g>`;
  }));
  w.transitions.filter(t => t.from.includes('any')).forEach(t => {
    const b = pos(t.to); if (!b) return;
    const on = sel && sel.kind === 'space' && sel.id === t.id;
    svg += `<g class="edge space any ${on ? 'on' : ''}" data-space-t="${t.id}"><path d="M${b.x + NW / 2 + 30},${b.y - 36} L${b.x + NW / 2 + 30},${b.y - 4}" marker-end="url(#arrow)"/>
      <foreignObject x="${b.x + NW / 2 + 8}" y="${b.y - 62}" width="44" height="24"><div class="any-pill" title="Stage transition: any status to ${esc((sts.find(s => s.id === t.to) || {}).name)}">All</div></foreignObject></g>`;
  });
  // this task's own transitions
  const anyCount = {};
  flows.forEach((f, k) => {
    const on = sel && sel.kind === 'flow' && sel.id === f.id;
    const n = f.rules.length;
    const lab = `<div class="edge-label task-flow ${on ? 'on' : ''}">${icon('bolt', 11)} ${esc(f.name)}${n ? ` <span class="rule-n">${n}</span>` : ''}</div>`;
    if (f.from.includes('any')) {
      const b = pos(f.to); if (!b) return;
      const i = anyCount[f.to] = (anyCount[f.to] || 0) + 1;
      const x = b.x + NW / 2 - 30 - (i - 1) * 16;
      svg += `<g class="edge task ${on ? 'on' : ''}" data-flow="${f.id}"><path d="M${x},${b.y - 70 - (i - 1) * 30} L${x},${b.y - 4}" marker-end="url(#arrow-task)"/>
        <foreignObject x="${x - 150}" y="${b.y - 96 - (i - 1) * 30}" width="170" height="26">${lab}</foreignObject></g>`;
    } else {
      f.from.forEach(fr => {
        if (!pos(fr) || !pos(f.to)) return;
        const c = curve(pos(fr), pos(f.to), 90 + (k % 3) * 30);
        svg += `<g class="edge task ${on ? 'on' : ''}" data-flow="${f.id}"><path d="${c.d}" marker-end="url(#arrow-task)"/>
          <foreignObject x="${c.lx - 85}" y="${c.ly - 13}" width="170" height="26">${lab}</foreignObject></g>`;
      });
    }
  });
  const nodes = sts.map(s => {
    const p = pos(s.id);
    const here = it.statusId === s.id;
    const on = sel && sel.kind === 'node' && sel.id === s.id;
    return `<foreignObject x="${p.x}" y="${p.y}" width="${NW}" height="${NH + 30}"><div class="wf-node cat-${s.cat} ${on ? 'on' : ''} ${here ? 'here' : ''}" data-tnode="${s.id}">${esc(s.name.toUpperCase())}</div>${here ? '<div class="here-tag">● This task is here</div>' : ''}</foreignObject>`;
  }).join('');
  const maxX = Math.max(900, ...sts.map(s => pos(s.id).x + NW + 80));
  const maxY = Math.max(420, ...sts.map(s => pos(s.id).y + NH + 200));

  // side panel
  const ruleRows = f => Object.keys(RULE_KINDS).map(k => {
    const rs = f.rules.filter(x => (RULE_TYPES[x.type] || {}).kind === k);
    return rs.length ? `<div class="rule-group"><div class="menu-heading">${RULE_KINDS[k].name}</div>${rs.map(x => `<div class="rule-row">${ruleIcon(x.type, 24)}<span class="grow">${esc(ruleSummary(sp, x))}</span>
      <button class="icon-btn xs" data-edit-rule="${x.id}" title="Edit">${icon('edit', 14)}</button><button class="icon-btn xs" data-del-rule="${x.id}" title="Delete">${icon('trash', 14)}</button></div>`).join('')}</div>` : '';
  }).join('');
  let panel;
  if (sel && sel.kind === 'flow') {
    const f = flows.find(x => x.id === sel.id);
    panel = `<div class="wf-panel-head"><h3>Task transition</h3><button class="icon-btn sm" data-tf="deselect">${icon('close')}</button></div>
      <label class="field"><span class="field-label">Name</span><input class="input" data-tf-name value="${esc(f.name)}" maxlength="60"></label>
      <div class="field"><span class="field-label">When ${esc(it.key)} moves</span><div>${esc(flowName(sp, f))}</div></div>
      <div class="wf-sec"><div class="sec-head"><b>Rules</b><button class="btn sm" data-tf="add-rule">${icon('plus', 14)} Add rule</button></div>
        ${f.rules.length ? ruleRows(f) : '<p class="muted small">No rules yet. Add one to make this task wait for others, check details, or trigger other tasks.</p>'}</div>
      <button class="btn danger-text" data-tf="delete-flow">${icon('trash', 14)} Delete task transition</button>`;
  } else if (sel && sel.kind === 'space') {
    const t = w.transitions.find(x => x.id === sel.id);
    const from = t.from.filter(x => x !== 'start');
    panel = `<div class="wf-panel-head"><h3>Stage transition</h3><button class="icon-btn sm" data-tf="deselect">${icon('close')}</button></div>
      <p><b>${esc(t.name)}</b>: ${esc(from.includes('any') ? 'Any stage' : from.map(x => statusLabel(sp, x)).join(', '))} → ${lozenge(sts.find(s => s.id === t.to))}</p>
      <p class="muted small">This transition is shared by every task in the space. Rules you add here apply to <b>${esc(it.key)}</b> only.</p>
      <button class="btn primary" data-tf="rule-on-space" data-t="${t.id}">${icon('plus', 14)} Add rule for this task</button>`;
  } else if (sel && sel.kind === 'node') {
    const s = sts.find(x => x.id === sel.id);
    const into = flows.filter(f => f.to === s.id);
    panel = `<div class="wf-panel-head"><h3>${lozenge(s)}</h3><button class="icon-btn sm" data-tf="deselect">${icon('close')}</button></div>
      <p class="muted small">${it.statusId === s.id ? `${esc(it.key)} is in this stage right now.` : `Task transitions that bring ${esc(it.key)} here:`}</p>
      ${into.map(f => `<div class="tr-row" data-sel-flow="${f.id}">${icon('bolt', 12)} <span class="grow">${esc(f.name)}</span><span class="muted small">${f.rules.length} rule${f.rules.length === 1 ? '' : 's'}</span></div>`).join('') || '<p class="muted small">None yet.</p>'}
      <button class="btn sm" data-tf="add-flow-to" data-to="${s.id}">${icon('plus', 14)} Add task transition to ${esc(s.name)}</button>`;
  } else {
    const incoming = (sp.taskFlows || []).filter(f => f.taskId !== it.id).flatMap(f => f.rules.filter(x => (x.cfg.tasks || []).includes(it.id)).map(x => ({ f, x })));
    panel = `<div class="wf-panel-head"><h3>${typeIcon(it.type)} ${esc(it.key)}</h3></div>
      <p class="tf-sum">${esc(it.summary)}</p>
      <div class="row gap8">${lozenge(Store.statusOf(it))}${itemAvatar(it, 20)}<span class="small">${esc((Store.user(it.assignee) || { name: 'Unassigned' }).name)}${Store.user(it.reporter) ? ` <span class="muted">${reporterText(it)}</span>` : ''}</span></div>
      <div class="wf-sec"><div class="sec-head"><b>This task's transitions</b><button class="icon-btn xs" data-tf="add-flow" title="Add task transition">${icon('plus', 14)}</button></div>
        ${flows.map(f => `<div class="tr-row" data-sel-flow="${f.id}">${icon('bolt', 12)} <span class="grow">${esc(f.name)} <span class="muted small">${esc(flowName(sp, f))}</span></span><span class="muted small">${f.rules.length}</span></div>`).join('') || '<p class="muted small">None yet. Select an arrow in the diagram to add a rule to it, or add a task transition.</p>'}</div>
      ${incoming.length ? `<div class="wf-sec"><b>Other tasks that affect it</b>${incoming.map(({ f, x }) => `<div class="tr-row" data-goto-task="${f.taskId}">${ruleIcon(x.type, 20)} <span class="grow small">${esc(Store.item(f.taskId).key)}: ${esc(ruleSummary(sp, x))}</span></div>`).join('')}</div>` : ''}`;
  }

  root.innerHTML = `<div class="settings-layout">${settingsNav(sp, 'wf')}
    <div class="settings-main wf flow">
      <div class="wf-top">
        <div><div class="muted small"><a class="link" href="${flowBase(sp)}">${icon('arrowLeft', 12)} Back to workflow</a> · Workflow for task</div>
          <div class="wf-types"><button class="btn sm" data-tf="pick-task">${typeIcon(it.type, 14)} <b>${esc(it.key)}</b> <span class="ellip tf-pick-sum">${esc(it.summary)}</span> ${icon('chevronDown', 12)}</button></div>
</div>
        <div class="row gap8">
          <button class="btn" data-tf="add-flow">${icon('arrowRight', 14)} Add transition</button>
          <button class="btn primary" data-tf="add-rule">${icon('plus', 14)} Add rule</button>
          <button class="btn" data-tf="open">${icon('external', 14)} Open work item</button>
        </div>
      </div>
      <div class="muted small fc-hint">Grey arrows are stage transitions every task shares. Blue arrows are this task's own transitions. Select any arrow to add rules; drag the stage boxes to rearrange. Changes save automatically.</div>
      <div class="wf-body">
        <div class="wf-canvas" data-keep-scroll="tf-${sp.id}">
          <svg class="wf-svg" width="${maxX}" height="${maxY}"><defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
            <marker id="arrow-task" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-act"/></marker></defs>
            ${svg}${nodes}</svg>
        </div>
        <aside class="wf-panel">${panel}</aside>
      </div>
    </div></div>`;

  const flowById = id => (sp.taskFlows || []).find(f => f.id === id);
  const newFlow = (to) => {
    const fake = { workflow: { statuses: sts, transitions: [] }, sel: null };
    openCreateTransition(sp, fake, () => {
      const t = fake.workflow.transitions[0];
      if (!t) return;
      const f = ensureFlow(sp, it.id, t.from, t.to, t.name);
      f.name = t.name;
      ui.sel = { kind: 'flow', id: f.id };
      Store.save();
    });
    if (to) setTimeout(() => { const btn = $('.transition-modal [data-pick="to"]'); if (btn) { btn.click(); setTimeout(() => { const o = $(`.popover [data-value="${to}"]`); if (o) o.click(); }, 30); } }, 30);
  };
  const addRuleFlow = f => openAddRule(sp, f, { onDone: () => { ui.sel = { kind: 'flow', id: f.id }; render(); } });

  root.addEventListener('click', async e => {
    const t = e.target;
    const fl = t.closest('[data-flow]') || t.closest('[data-sel-flow]');
    if (fl) { ui.sel = { kind: 'flow', id: fl.dataset.flow || fl.dataset.selFlow }; render(); return; }
    const st = t.closest('[data-space-t]');
    if (st) { ui.sel = { kind: 'space', id: st.dataset.spaceT }; render(); return; }
    const nd = t.closest('[data-tnode]');
    if (nd) { if (nd.dataset.dragged) return; ui.sel = { kind: 'node', id: nd.dataset.tnode }; render(); return; }
    const gt = t.closest('[data-goto-task]');
    if (gt) { ui.sel = null; location.hash = `${flowBase(sp)}/task/${gt.dataset.gotoTask}`; return; }
    const er = t.closest('[data-edit-rule]'), dr = t.closest('[data-del-rule]');
    if (er || dr) {
      const f = flowById(ui.sel.id);
      const rule = f.rules.find(x => x.id === (er || dr).dataset[er ? 'editRule' : 'delRule']);
      if (er) openAddRule(sp, f, { rule, onDone: render });
      else if (await confirmDialog({ title: 'Delete rule?', message: esc(ruleSummary(sp, rule)), confirmLabel: 'Delete' })) { f.rules = f.rules.filter(x => x !== rule); Store.save(); }
      return;
    }
    const b = t.closest('[data-tf]');
    if (!b) { if (t.closest('.wf-svg') && !t.closest('g,foreignObject')) { ui.sel = null; render(); } return; }
    switch (b.dataset.tf) {
      case 'deselect': ui.sel = null; render(); break;
      case 'open': openItem(it.id); break;
      case 'add-flow': newFlow(); break;
      case 'add-flow-to': newFlow(b.dataset.to); break;
      case 'pick-task': {
        const list = Store.itemsOf(sp.id).sort(byRank);
        popover(b, `<div class="pad"><div class="search-sm full">${icon('search')}<input placeholder="Search tasks" data-q></div></div><div class="menu" data-list>${list.map(i => `<button class="menu-item ${i.id === it.id ? 'selected' : ''}" data-value="${i.id}" data-text="${esc((i.key + ' ' + i.summary).toLowerCase())}">${typeIcon(i.type)}<span class="mi-label"><b>${esc(i.key)}</b> ${esc(i.summary)}</span>${lozenge(Store.statusOf(i))}</button>`).join('')}</div>`, {
          width: 420,
          onSelect: v => { ui.sel = null; location.hash = `${flowBase(sp)}/task/${v}`; },
          onMount(el) { el.querySelector('[data-q]').addEventListener('input', ev => { const q = ev.target.value.toLowerCase(); $$('[data-text]', el).forEach(x => { x.hidden = q && !x.dataset.text.includes(q); }); }); },
        });
        break;
      }
      case 'add-rule': {
        if (sel && sel.kind === 'flow') { addRuleFlow(flowById(sel.id)); break; }
        if (sel && sel.kind === 'space') { b.dataset.t = sel.id; }
        else {
          // choose which move of this task the rule is for
          const opts = [...flows.map(f => ({ value: 'f:' + f.id, label: `${esc(f.name)} <span class="muted small">${esc(flowName(sp, f))}</span>`, icon: icon('bolt') })),
            ...sts.filter(s => !flows.some(f => f.to === s.id && f.from.includes('any'))).map(s => ({ value: 'to:' + s.id, label: `When it moves to ${lozenge(s)}`, icon: icon('arrowRight') }))];
          menu(b, [{ heading: `Add a rule for ${it.key} when it…` }, ...opts], v => {
            const f = v.startsWith('f:') ? flowById(v.slice(2)) : ensureFlow(sp, it.id, ['any'], v.slice(3));
            Store.save(true);
            addRuleFlow(f);
          }, { align: 'right', width: 340 });
          break;
        }
      }
      // falls through for a selected stage transition
      case 'rule-on-space': {
        const tr = w.transitions.find(x => x.id === (b.dataset.t || (sel && sel.id)));
        const from = tr.from.filter(x => x !== 'start');
        const f = ensureFlow(sp, it.id, from.length ? from : ['any'], tr.to, tr.name);
        Store.save(true);
        addRuleFlow(f);
        break;
      }
      case 'delete-flow': {
        const f = flowById(sel.id);
        if (!(await confirmDialog({ title: `Delete "${f.name}"?`, message: `This task transition and its ${f.rules.length} rule(s) will be removed.` }))) return;
        sp.taskFlows = sp.taskFlows.filter(x => x !== f); ui.sel = null; Store.save();
        break;
      }
    }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-tf-name]') && e.target.value.trim()) { flowById(ui.sel.id).name = e.target.value.trim(); Store.save(); }
  });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-tf-name]')) e.target.blur(); });
  root.addEventListener('mousedown', e => {
    const node = e.target.closest('[data-tnode]');
    if (!node || e.button !== 0) return;
    e.preventDefault();
    const p = w.layout[node.dataset.tnode];
    const fo = node.parentElement;
    const x0 = e.clientX, y0 = e.clientY, px = p.x, py = p.y;
    let moved = false;
    const mv = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved) { fo.setAttribute('x', Math.max(10, px + dx)); fo.setAttribute('y', Math.max(110, py + dy)); }
    };
    const up = ev => {
      document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
      if (!moved) return;
      node.dataset.dragged = '1';
      p.x = Math.max(10, Math.round((px + ev.clientX - x0) / 10) * 10);
      p.y = Math.max(110, Math.round((py + ev.clientY - y0) / 10) * 10);
      Store.save();
    };
    document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
  });
}

/* =========================== TASK TEMPLATES =========================== */
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);

function openSaveTaskTemplate(sp) {
  const items = Store.itemsOf(sp.id);
  const nRules = (sp.taskFlows || []).reduce((n, f) => n + f.rules.length, 0);
  const people = new Set(items.map(i => i.assignee).filter(Boolean)).size;
  const list = Store.state.taskTemplates;
  openModal({
    title: 'Save tasks as template', width: 540,
    body: `<p class="muted">Saves this workflow so you can start new spaces from it, or apply it to other spaces.</p>
      <div class="tpl-preview"><span>${icon('docs', 14)} <b>${items.length}</b> task${items.length === 1 ? '' : 's'}</span><span>${icon('people', 14)} <b>${people}</b> ${people === 1 ? 'person' : 'people'}</span><span>${icon('bolt', 14)} <b>${nRules}</b> rule${nRules === 1 ? '' : 's'}</span><span>${icon('approvals', 14)} ${sp.workflow.statuses.map(s => esc(s.name)).join(' → ')}</span></div>
      <label class="field"><span class="field-label">Template name <span class="req">*</span></span><input class="input" name="n" autofocus maxlength="60" placeholder="e.g. Event launch checklist" list="ttpl-names"><datalist id="ttpl-names">${list.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist></label>
      <label class="check"><input type="checkbox" name="tasks" checked> Include the tasks, people and rules (untick to save only the stages)</label>
      <label class="check" style="margin-top:8px"><input type="checkbox" name="reset" checked> Start every task in ${esc((sp.workflow.statuses[0] || {}).name || 'the first stage')}</label>
      <label class="check" style="margin-top:8px"><input type="checkbox" name="people" checked> Keep who each task is assigned to</label>
      <p class="field-help" style="margin-top:12px">Also saved: descriptions, priorities, labels, sub-tasks, the stages, and dates relative to today.</p>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Save template</button>',
    onMount(el, api) {
      const go = async () => {
        const inp = el.querySelector('[name=n]');
        const n = inp.value.trim();
        if (!n) { inp.classList.add('invalid'); inp.focus(); return; }
        const existing = list.find(t => t.name.toLowerCase() === n.toLowerCase());
        if (existing && !(await confirmDialog({ title: `Replace "${existing.name}"?`, message: 'The saved task template will be overwritten.', confirmLabel: 'Replace', danger: false }))) return;
        const t0 = todayStr();
        const keepPeople = el.querySelector('[name=people]').checked;
        const withTasks = el.querySelector('[name=tasks]').checked;
        const tpl = {
          id: existing ? existing.id : uid('ttpl'), name: n, created: existing ? existing.created : nowISO(), updated: nowISO(),
          resetStatus: el.querySelector('[name=reset]').checked,
          workflow: JSON.parse(JSON.stringify(sp.workflow)), approvals: JSON.parse(JSON.stringify(sp.approvals)),
          tasks: (withTasks ? items : []).slice().sort(byRank).map(i => ({
            ref: i.id, summary: i.summary, description: i.description, type: i.type, priority: i.priority, labels: i.labels.slice(),
            assignee: keepPeople ? i.assignee : null, statusId: i.statusId, parentRef: i.parentId, rank: rankOf(i),
            startOff: i.start ? daysBetween(t0, i.start) : null, dueOff: i.due ? daysBetween(t0, i.due) : null,
            lf: i.lf ? { id: i.lf.id, group: i.lf.group } : undefined, // what finishes the task (leadflow.js)
            approvalChain: keepPeople && i.approvalChain ? i.approvalChain.map(c => ({ ...c })) : undefined, // who approves, in steps
          })),
          flows: withTasks ? JSON.parse(JSON.stringify(sp.taskFlows || [])) : [],
          canvas: withTasks ? (sp.canvasTasks || []).slice() : [],
          pos: withTasks ? JSON.parse(JSON.stringify(sp.canvasPos || {})) : {},
        };
        if (existing) list[list.indexOf(existing)] = tpl; else list.push(tpl);
        Store.save(true); api.close();
        toast(`Task template "${n}" saved`);
      };
      el.querySelector('[data-ok]').addEventListener('click', go);
      el.querySelector('[name=n]').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    },
  });
}

/* Best matching template stage for an existing stage: same name, else same category, else the first */
function guessStageIdx(st, tplStatuses) {
  let i = tplStatuses.findIndex(x => x.name.toLowerCase() === (st.name || '').toLowerCase());
  if (i < 0) i = tplStatuses.findIndex(x => x.cat === st.cat);
  return i < 0 ? 0 : i;
}

/**
 * Apply a template to a space.
 *   stages: replace the space's stages with the template's (existing tasks move per `map`: stageId -> template stage index)
 *   tasks:  add the template's tasks, people and rules (dates placed from startDate)
 */
function applyTaskTemplate(sp, tpl, { stages = true, tasks = true, map = {}, startDate = todayStr() } = {}) {
  const tplSts = tpl.workflow.statuses;
  const smap = {};
  if (stages) {
    const c = cloneWorkflow(tpl.workflow, tpl.approvals);
    const newIds = c.workflow.statuses.map(s => s.id);
    tplSts.forEach((s, i) => { smap[s.id] = newIds[i]; });
    const conv = {};
    sp.workflow.statuses.forEach(s => { conv[s.id] = newIds[map[s.id] != null ? Number(map[s.id]) : guessStageIdx(s, tplSts)]; });
    Store.itemsOf(sp.id).forEach(i => {
      if (!conv[i.statusId]) return;
      i.statusId = conv[i.statusId]; i.updated = nowISO();
      if (i.approval && i.approval.state === 'pending') i.approval = null;
    });
    const cv = v => (v && !String(v).startsWith('cat:') && conv[v]) || v;
    (sp.taskFlows || []).forEach(f => {
      f.to = cv(f.to); f.from = f.from.map(x => (x === 'any' ? x : cv(x)));
      f.rules.forEach(r => { if (r.cfg.status) r.cfg.status = cv(r.cfg.status); if (r.type === 'r_prevmover') { r.cfg.from = cv(r.cfg.from); r.cfg.to = cv(r.cfg.to); } });
    });
    sp.workflow = c.workflow; sp.approvals = c.approvals;
    Store.itemsOf(sp.id).forEach(i => Store.afterStatusChange(i));
    dropDraft(sp);
  } else {
    tplSts.forEach(s => { smap[s.id] = sp.workflow.statuses[guessStageIdx(s, sp.workflow.statuses)].id; });
  }
  if (tasks && tpl.tasks.length) {
    const tmap = {};
    const firstId = sp.workflow.statuses[0].id;
    tpl.tasks.forEach(t => {
      const it = Store.createItem({
        spaceId: sp.id, summary: t.summary, description: t.description, type: t.type, priority: t.priority, labels: t.labels.slice(),
        assignee: t.assignee && Store.user(t.assignee) ? t.assignee : null, statusId: tpl.resetStatus ? firstId : smap[t.statusId], rank: t.rank,
        start: t.startOff != null ? addDays(startDate, t.startOff) : null, due: t.dueOff != null ? addDays(startDate, t.dueOff) : null,
        lf: t.lf ? JSON.parse(JSON.stringify(t.lf)) : undefined,
        approvalChain: t.approvalChain && t.approvalChain.some(c => Store.user(c.user)) ? t.approvalChain.filter(c => Store.user(c.user)).map(c => ({ ...c })) : undefined,
      }, true);
      tmap[t.ref] = it.id;
    });
    tpl.tasks.forEach(t => { if (t.parentRef && tmap[t.parentRef]) Store.item(tmap[t.ref]).parentId = tmap[t.parentRef]; });
    const mapS = v => (v && !String(v).startsWith('cat:') ? smap[v] : v);
    sp.taskFlows = (sp.taskFlows || []).concat((tpl.flows || []).map(f => ({
      id: uid('tf'), taskId: tmap[f.taskId], name: f.name, to: smap[f.to],
      from: f.from.map(x => (x === 'any' ? x : smap[x])),
      rules: f.rules.map(r => {
        const cfg = JSON.parse(JSON.stringify(r.cfg));
        if (cfg.tasks) cfg.tasks = cfg.tasks.map(x => tmap[x]).filter(Boolean);
        if (cfg.status != null) cfg.status = mapS(cfg.status);
        if (r.type === 'r_prevmover') { cfg.from = mapS(cfg.from); cfg.to = mapS(cfg.to); }
        if (cfg.assign && cfg.assign !== '@me' && !Store.user(cfg.assign)) cfg.assign = '';
        if (cfg.user && !cfg.user.startsWith('@') && !Store.user(cfg.user)) cfg.user = '';
        if (cfg.users) cfg.users = cfg.users.filter(u => Store.user(u));
        return { id: uid('rl'), type: r.type, cfg };
      }),
    })));
    sp.canvasTasks = [...new Set([...(sp.canvasTasks || []), ...(tpl.canvas || []).map(x => tmap[x]).filter(Boolean)])];
    sp.canvasPos = sp.canvasPos || {};
    // keep the template's arrangement only when the tasks land on an empty canvas
    if (!Object.keys(sp.canvasPos).length) Object.entries(tpl.pos || {}).forEach(([ref, p]) => { if (tmap[ref]) sp.canvasPos[tmap[ref]] = p; });
  }
  Store.cleanFlows(sp);
  Store.save();
}

const templateMeta = t => {
  const nr = (t.flows || []).reduce((n, f) => n + f.rules.length, 0);
  return t.tasks.length ? `${t.tasks.length} tasks · ${nr} rules · ${new Set(t.tasks.map(x => x.assignee).filter(Boolean)).size} people` : 'Stages only';
};
const stageFlowHTML = sts => `<span class="tpl-flow">${sts.map(lozenge).join(`<span class="muted">${icon('arrowRight', 12)}</span>`)}</span>`;

function openApplyTaskTemplate(sp) {
  let pick = null;
  const m = openModal({ title: 'Apply template', width: 660, body: '<div class="tpl-body"></div>', footer: '<div class="wiz-foot"></div>' });
  const body = m.el.querySelector('.tpl-body'), foot = m.el.querySelector('.wiz-foot');
  const items = Store.itemsOf(sp.id);
  const draw = () => {
    const list = Store.state.taskTemplates;
    if (!pick) {
      body.innerHTML = list.length ? `<p class="muted">Pick a template to apply to <b>${esc(sp.name)}</b>. You'll choose what to bring in next.</p>
        <div class="tpl-list">${list.map(t => `<div class="tpl-row" data-pick="${t.id}"><div class="grow"><b>${esc(t.name)}</b><div class="tpl-meta"><span class="muted small">${templateMeta(t)}</span>${stageFlowHTML(t.workflow.statuses)}</div></div>${icon('chevronRight')}</div>`).join('')}</div>`
        : emptyState({ title: 'No templates yet', text: 'Set up a space the way you like it, then choose Templates › Save as template.', art: 'docs', small: true });
      foot.innerHTML = '<span class="grow"></span><button class="btn subtle" data-close>Cancel</button>';
      return;
    }
    const t = pick;
    const used = sp.workflow.statuses.filter(s => items.some(i => i.statusId === s.id));
    const sameStages = t.workflow.statuses.map(s => s.name.toLowerCase()).join('|') === sp.workflow.statuses.map(s => s.name.toLowerCase()).join('|');
    body.innerHTML = `<p>Apply <b>${esc(t.name)}</b> to <b>${esc(sp.name)}</b>.</p>
      <label class="radio-card link-opt ${!sameStages ? 'on' : ''}"><input type="checkbox" data-o="stages" ${!sameStages ? 'checked' : ''}>
        <div class="grow"><div class="lo-title"><b>Use the template's stages</b></div>${stageFlowHTML(t.workflow.statuses)}
        <div data-map-box ${sameStages ? 'hidden' : ''}>${used.length ? `<p class="muted small" style="margin-top:10px">Where should existing tasks go?</p>
          <table class="grid compact"><thead><tr><th>Current stage</th><th>Tasks</th><th>Move to</th></tr></thead><tbody>
          ${used.map(s => `<tr><td>${lozenge(s)}</td><td>${items.filter(i => i.statusId === s.id).length}</td><td><select class="input sm-select" data-map="${s.id}">${t.workflow.statuses.map((x, i) => `<option value="${i}" ${i === guessStageIdx(s, t.workflow.statuses) ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : ''}</div></div></label>
      <label class="radio-card link-opt ${t.tasks.length ? 'on' : ''}"><input type="checkbox" data-o="tasks" ${t.tasks.length ? 'checked' : 'disabled'}>
        <div class="grow"><div class="lo-title"><b>Add the template's tasks, people and rules</b></div><div class="muted small">${t.tasks.length ? templateMeta(t) : 'This template only has stages.'}</div>
        ${t.tasks.some(x => x.startOff != null || x.dueOff != null) ? `<div class="lo-sentence">Place task dates from <input class="input sm-select" type="date" data-o="start" value="${todayStr()}"></div>` : ''}</div></label>`;
    foot.innerHTML = '<button class="btn subtle" data-back>Back</button><span class="grow"></span><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-apply>Apply</button>';
  };
  m.el.addEventListener('change', e => {
    const o = e.target.dataset.o;
    if (o === 'stages' || o === 'tasks') e.target.closest('.link-opt').classList.toggle('on', e.target.checked);
    if (o === 'stages') m.el.querySelector('[data-map-box]').hidden = !e.target.checked;
  });
  m.el.addEventListener('click', e => {
    const p = e.target.closest('[data-pick]');
    if (p) { pick = Store.state.taskTemplates.find(x => x.id === p.dataset.pick); draw(); return; }
    if (e.target.closest('[data-back]')) { pick = null; draw(); return; }
    if (!e.target.closest('[data-apply]')) return;
    const q = n => m.el.querySelector(`[data-o="${n}"]`);
    const stages = q('stages').checked, tasks = q('tasks').checked;
    if (!stages && !tasks) { toast('Choose something to apply', 'error'); return; }
    const map = {};
    $$('[data-map]', m.el).forEach(s => { map[s.dataset.map] = s.value; });
    applyTaskTemplate(sp, pick, { stages, tasks, map, startDate: (q('start') && q('start').value) || todayStr() });
    m.close();
    toast(`"${pick.name}" applied`);
  });
  draw();
}

function openTaskTemplates() {
  const m = openModal({ title: 'Task templates', width: 620, body: '<div class="ttpl"></div>', footer: '<button class="btn primary" data-close>Done</button>' });
  const body = m.el.querySelector('.ttpl');
  const draw = () => {
    const list = Store.state.taskTemplates;
    body.innerHTML = list.length ? `<div class="tpl-list">${list.map(t => `<div class="tpl-row"><div class="grow"><b>${esc(t.name)}</b>
      <div class="tpl-meta muted small">${templateMeta(t)} · saved ${fmtDate(t.updated)}</div></div>
      <button class="icon-btn xs" data-ren="${t.id}" title="Rename">${icon('edit', 14)}</button><button class="icon-btn xs" data-del="${t.id}" title="Delete">${icon('trash', 14)}</button></div>`).join('')}</div>
      <p class="muted small" style="margin-top:12px">Use a template from <b>Create space</b> › Start with tasks.</p>`
      : emptyState({ title: 'No task templates yet', text: 'Open a space\'s workflow, then choose Templates › Save as template.', art: 'docs', small: true });
  };
  m.el.addEventListener('click', async e => {
    const d = e.target.closest('[data-del]'), r = e.target.closest('[data-ren]');
    const list = Store.state.taskTemplates;
    if (d) { const t = list.find(x => x.id === d.dataset.del); if (await confirmDialog({ title: `Delete "${t.name}"?`, message: 'Spaces created from it keep their tasks.' })) { Store.state.taskTemplates = list.filter(x => x !== t); Store.save(true); draw(); } }
    if (r) {
      const t = list.find(x => x.id === r.dataset.ren);
      popover(r, `<div class="pad"><input class="input" value="${esc(t.name)}" maxlength="60"><div class="muted small" style="margin-top:6px">Press Enter to save</div></div>`, {
        force: true, width: 260, align: 'right',
        onMount(el) { const inp = el.querySelector('input'); inp.select(); inp.addEventListener('keydown', ev => { if (ev.key === 'Enter' && inp.value.trim()) { t.name = inp.value.trim(); Store.save(true); closePopover(); draw(); } }); },
      });
    }
  });
  draw();
}
