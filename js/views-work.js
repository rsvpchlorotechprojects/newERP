/* Board, List, Calendar and Timeline views + shared toolbar/filters */

const VS = {};
function vsOf(sp) {
  const k = sp ? sp.id : '__global';
  if (!VS[k]) {
    VS[k] = {
      search: '', assignees: [], types: [], priorities: [], statuses: [], labels: [], due: '',
      // lead spaces (leadflow.js) list their tasks in workflow order; others newest first
      group: 'none', sort: sp && Store.itemsOf(sp.id).some(i => i.lf) ? { key: 'rank', dir: 1 } : { key: 'created', dir: -1 }, collapsed: {}, lanesCollapsed: {}, composer: null,
      calMonth: todayStr().slice(0, 7), calMode: 'month', calWeek: todayStr(), unscheduledOpen: false, unschedSearch: '',
      scale: 'months', tlInit: null, expanded: {}, listSel: [], listCreate: false, tlCreate: false,
    };
  }
  return VS[k];
}

const rankOf = i => (i.rank != null ? i.rank : Date.parse(i.created));
const byRank = (a, b) => rankOf(a) - rankOf(b);

function applyFilters(items, vs) {
  const q = vs.search.trim().toLowerCase();
  const t = todayStr();
  return items.filter(i => {
    if (q && !(i.summary + ' ' + i.key + ' ' + i.description + ' ' + i.labels.join(' ')).toLowerCase().includes(q)) return false;
    if (vs.assignees.length && !vs.assignees.includes(i.assignee || '')) return false;
    if (vs.types.length && !vs.types.includes(i.type)) return false;
    if (vs.priorities.length && !vs.priorities.includes(i.priority)) return false;
    if (vs.statuses.length && !vs.statuses.includes(i.statusId)) return false;
    if (vs.labels.length && !i.labels.some(l => vs.labels.includes(l))) return false;
    if (vs.due === 'overdue' && !(i.due && i.due < t && !Store.isDone(i))) return false;
    if (vs.due === 'week' && !(i.due && i.due >= t && i.due <= addDays(t, 7))) return false;
    if (vs.due === 'none' && i.due) return false;
    return true;
  });
}
const filterCount = vs => vs.types.length + vs.priorities.length + vs.statuses.length + vs.labels.length + (vs.due ? 1 : 0);
const hasFilters = vs => !!(vs.search || vs.assignees.length || filterCount(vs) || vs.fFolder || vs.fSpace || vs.fCat); // f*: Filters page pickers

function toolbarHTML(sp, vs, { placeholder = 'Search', group = false, right = '', left = '' } = {}) {
  const users = Store.state.users;
  return `<div class="toolbar">
    <div class="search-sm">${icon('search')}<input placeholder="${placeholder}" value="${esc(vs.search)}" data-vs="search" data-keep="vs-search"></div>
    <div class="avatar-stack" role="group" aria-label="Filter by assignee">
      <button class="av-toggle ${vs.assignees.includes('') ? 'on' : ''}" data-assignee="" title="Unassigned">${avatar(null, 28)}</button>
      ${users.map(u => `<button class="av-toggle ${vs.assignees.includes(u.id) ? 'on' : ''}" data-assignee="${u.id}" title="${esc(u.name)}">${avatar(u.id, 28)}</button>`).join('')}
    </div>
    ${left}
    <button class="btn ${filterCount(vs) ? 'selected' : ''}" data-vs-act="filter">${icon('filter')} Filter${filterCount(vs) ? ` <span class="count">${filterCount(vs)}</span>` : ''}</button>
    ${group ? `<button class="btn ${vs.group !== 'none' ? 'selected' : ''}" data-vs-act="group">${icon('group')} Group${vs.group !== 'none' ? `: ${groupLabel(vs.group)}` : ''}</button>` : ''}
    ${hasFilters(vs) ? '<button class="btn subtle" data-vs-act="clear">Clear filters</button>' : ''}
    <span class="grow"></span>
    ${right}
  </div>`;
}
const groupLabel = g => ({ assignee: 'Assignee', priority: 'Priority', type: 'Work type', status: 'Status', none: 'None' }[g]);

function bindToolbar(root, sp, vs, { groups = ['none', 'assignee', 'priority', 'type'] } = {}) {
  root.addEventListener('input', e => {
    if (e.target.dataset.vs === 'search') { vs.search = e.target.value; render(); }
  });
  root.addEventListener('click', e => {
    const a = e.target.closest('[data-assignee]');
    if (a) {
      const v = a.dataset.assignee;
      vs.assignees = vs.assignees.includes(v) ? vs.assignees.filter(x => x !== v) : [...vs.assignees, v];
      render(); return;
    }
    const b = e.target.closest('[data-vs-act]');
    if (!b) return;
    const act = b.dataset.vsAct;
    if (act === 'clear') { Object.assign(vs, { search: '', assignees: [], types: [], priorities: [], statuses: [], labels: [], due: '', fFolder: '', fSpace: '', fCat: '' }); render(); }
    if (act === 'group') {
      menu(b, groups.map(g => ({ value: g, label: groupLabel(g), selected: vs.group === g })), v => { vs.group = v; render(); });
    }
    if (act === 'filter') openFilterPop(b, sp, vs);
  });
}

function openFilterPop(anchor, sp, vs) {
  const statuses = sp ? Store.allStatuses(sp) : [];
  const labels = [...new Set((sp ? Store.itemsOf(sp.id) : Store.state.items).flatMap(i => i.labels))].sort();
  const chk = (group, val, label, on) => `<label class="chk-row"><input type="checkbox" data-fg="${group}" value="${esc(val)}" ${on ? 'checked' : ''}> ${label}</label>`;
  const html = `<div class="filter-pop">
    <div class="fp-col"><div class="menu-heading">Work type</div>${WORK_TYPES.map(t => chk('types', t.id, `${typeIcon(t.id)} ${t.name}`, vs.types.includes(t.id))).join('')}
      <div class="menu-heading">Due date</div>
      ${[['', 'Any time'], ['overdue', 'Overdue'], ['week', 'Due in the next 7 days'], ['none', 'No due date']].map(([v, l]) => `<label class="chk-row"><input type="radio" name="fp-due" data-fg="due" value="${v}" ${vs.due === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <div class="fp-col"><div class="menu-heading">Priority</div>${PRIORITIES.map(p => chk('priorities', p.id, `${priorityIcon(p.id)} ${p.name}`, vs.priorities.includes(p.id))).join('')}
      ${statuses.length ? `<div class="menu-heading">Status</div>${statuses.map(s => chk('statuses', s.id, lozenge(s), vs.statuses.includes(s.id))).join('')}` : ''}</div>
    ${labels.length ? `<div class="fp-col"><div class="menu-heading">Labels</div>${labels.map(l => chk('labels', l, `<span class="tag">${esc(l)}</span>`, vs.labels.includes(l))).join('')}</div>` : ''}
  </div>`;
  popover(anchor, html, {
    onMount(el) {
      el.addEventListener('change', e => {
        const g = e.target.dataset.fg;
        if (g === 'due') vs.due = e.target.value;
        else {
          const v = e.target.value;
          vs[g] = e.target.checked ? [...vs[g], v] : vs[g].filter(x => x !== v);
        }
        render();
      });
    },
  });
}

function emptyState({ title, text, action = '', art = 'emptyWork', small = false }) {
  return `<div class="empty ${small ? 'small' : ''}"><div class="empty-art">${icon(art, small ? 20 : 28)}</div><h3>${title}</h3><p>${text}</p>${action}</div>`;
}

/* =========================== BOARD =========================== */
function viewBoard(sp, root) {
  const vs = vsOf(sp);
  sp.boardSettings = sp.boardSettings || { key: true, priority: true, due: true, labels: true, avatar: true, subtasks: true, done14: false };
  const bs = sp.boardSettings;
  const all = Store.itemsOf(sp.id);
  let items = applyFilters(all, vs).filter(i => bs.subtasks || i.type !== 'subtask');
  if (bs.done14) { const cut = new Date(Date.now() - 14 * 864e5).toISOString(); items = items.filter(i => !Store.isDone(i) || !i.resolved || i.resolved > cut); }
  const boardEmpty = all.length === 0;

  const colHead = (st, n) => {
    const collapsed = vs.collapsed[st.id];
    return `<div class="col-head">
      <span class="col-name">${esc(st.name)}</span><span class="count">${n}</span>${st.cat === 'done' ? `<span class="done-tick">${icon('check', 14)}</span>` : ''}
      <span class="col-actions"><button class="icon-btn xs" data-col-collapse="${st.id}" title="${collapsed ? 'Expand' : 'Collapse'} ${esc(st.name)}">${icon(collapsed ? 'chevronRight' : 'collapse', 14)}</button>
      <button class="icon-btn xs" data-col-menu="${st.id}" title="More actions for column ${esc(st.name)}">${icon('more', 14)}</button></span></div>`;
  };
  const colBody = (st, laneKey, laneItems, first) => {
    const cards = laneItems.filter(i => i.statusId === st.id).sort(byRank);
    const comp = vs.composer && vs.composer.status === st.id && vs.composer.lane === laneKey;
    return `<div class="col-body" data-drop="${st.id}" data-lane="${esc(laneKey)}">
      ${cards.map(c => cardHTML(c, bs)).join('')}
      ${boardEmpty && first && !comp ? emptyState({ title: 'No work items', text: 'Create a work item to get started. Work will appear here.' }) : ''}
      ${comp ? composerHTML(st.id, laneKey) : `<button class="col-create" data-create-in="${st.id}" data-lane="${esc(laneKey)}">${icon('plus')} Create</button>`}
    </div>`;
  };

  // columns for one workflow's statuses (optionally split into lanes by the Group setting)
  const sectionHTML = (statuses, secItems, secKey, first) => {
    const addCol = `<button class="icon-btn bordered add-col" data-add-col="${esc(secKey)}" title="Create status">${icon('plus')}</button>`;
    if (vs.group === 'none') {
      return `<div class="board-row">${statuses.map((st, idx) => {
        const n = secItems.filter(i => i.statusId === st.id).length;
        if (vs.collapsed[st.id]) return collapsedCol(st, n);
        return `<div class="col" data-col="${st.id}">${colHead(st, n)}${colBody(st, '', secItems, first && idx === 0)}</div>`;
      }).join('')}${addCol}</div>`;
    }
    const lanes = boardLanes(vs.group, secItems);
    return `<div class="board-row heads">${statuses.map(st => {
      const n = secItems.filter(i => i.statusId === st.id).length;
      return vs.collapsed[st.id] ? collapsedCol(st, n) : `<div class="col head-only">${colHead(st, n)}</div>`;
    }).join('')}${addCol}</div>
    ${lanes.map(l => { const lk = `${secKey}:${l.key}`; return `<div class="lane ${vs.lanesCollapsed[lk] ? 'collapsed' : ''}">
      <button class="lane-head" data-lane-toggle="${esc(lk)}">${icon(vs.lanesCollapsed[lk] ? 'chevronRight' : 'chevronDown', 14)} ${l.icon || ''} <b>${esc(l.label)}</b> <span class="muted small">(${l.items.length} work item${l.items.length === 1 ? '' : 's'})</span></button>
      ${vs.lanesCollapsed[lk] ? '' : `<div class="board-row">${statuses.map(st => vs.collapsed[st.id] ? '<div class="col collapsed ghost"></div>' : `<div class="col lane-col">${colBody(st, l.key, l.items, false)}</div>`).join('')}</div>`}
    </div>`; }).join('')}`;
  };

  const boardHTML = sectionHTML(sp.workflow.statuses, items, '', true);

  root.innerHTML = toolbarHTML(sp, vs, {
    placeholder: 'Search board', group: true,
    right: `<button class="icon-btn bordered" data-board="settings" title="View settings">${icon('sliders')}</button>
            <button class="icon-btn bordered" data-board="more" title="More board view actions">${icon('more')}</button>`,
  }) + `<div class="board" data-keep-scroll="board-${sp.id}">${boardHTML}</div>`;

  bindToolbar(root, sp, vs);
  bindComposer(root, sp, vs);
  bindCardDnD(root, sp, vs);

  root.addEventListener('click', e => {
    const t = e.target;
    const card = t.closest('.card');
    if (card && !t.closest('button')) { openItem(card.dataset.id); return; }
    const cc = t.closest('[data-col-collapse]');
    if (cc) { vs.collapsed[cc.dataset.colCollapse] = !vs.collapsed[cc.dataset.colCollapse]; render(); return; }
    const lt = t.closest('[data-lane-toggle]');
    if (lt) { vs.lanesCollapsed[lt.dataset.laneToggle] = !vs.lanesCollapsed[lt.dataset.laneToggle]; render(); return; }
    const cm = t.closest('[data-col-menu]');
    if (cm) { columnMenu(cm, sp, cm.dataset.colMenu); return; }
    const ci = t.closest('[data-create-in]');
    if (ci) { vs.composer = { status: ci.dataset.createIn, lane: ci.dataset.lane, type: 'task' }; render(); return; }
    const ac = t.closest('[data-add-col]');
    if (ac) { addStatusPopover(ac, sp, ac.dataset.addCol || null); return; }
    const bb = t.closest('[data-board]');
    if (bb && bb.dataset.board === 'settings') {
      const opt = (k, l) => `<label class="toggle-row"><input type="checkbox" data-bs="${k}" ${bs[k] ? 'checked' : ''}><span class="toggle"></span><span>${l}</span></label>`;
      popover(bb, `<div class="pad settings-pop"><h4>View settings</h4>${opt('key', 'Work item key')}${opt('priority', 'Priority')}${opt('due', 'Due date')}${opt('labels', 'Labels')}${opt('avatar', 'Assignee')}${opt('subtasks', 'Show sub-tasks as cards')}${opt('done14', 'Hide done work older than 14 days')}</div>`, {
        align: 'right', width: 280,
        onMount(el) { el.addEventListener('change', ev => { bs[ev.target.dataset.bs] = ev.target.checked; Store.save(); }); },
      });
    }
    if (bb && bb.dataset.board === 'more') {
      menu(bb, [{ value: 'wf', label: 'Workflow, tasks & rules', icon: icon('approvals') },
        { value: 'save-tasks', label: 'Save as template', icon: icon('docs') },
        '-', { value: 'csv', label: 'Export to CSV', icon: icon('download') }, { value: 'settings', label: 'Space settings', icon: icon('gear') }], v => {
        if (v === 'save-tasks') openSaveTaskTemplate(sp);
        if (v === 'wf') location.hash = `#/space/${encodeURIComponent(sp.key)}/workflow`;
        if (v === 'settings') location.hash = `#/space/${encodeURIComponent(sp.key)}/settings`;
        if (v === 'csv') exportCSV(sp, items);
      }, { align: 'right' });
    }
  });
}

function collapsedCol(st, n) {
  return `<div class="col collapsed" data-drop="${st.id}" data-lane=""><button class="icon-btn xs" data-col-collapse="${st.id}" title="Expand">${icon('chevronRight', 14)}</button>
    <span class="count">${n}</span><span class="vert">${esc(st.name)}</span></div>`;
}

function boardLanes(group, items) {
  if (group === 'none') return [{ key: '', label: '', items }];
  if (group === 'assignee') {
    const lanes = Store.state.users.map(u => ({ key: u.id, label: u.name, icon: avatar(u.id, 20), items: items.filter(i => i.assignee === u.id) }));
    lanes.push({ key: '', label: 'Unassigned', icon: avatar(null, 20), items: items.filter(i => !i.assignee) });
    return lanes;
  }
  if (group === 'priority') return PRIORITIES.map(p => ({ key: p.id, label: p.name, icon: priorityIcon(p.id), items: items.filter(i => i.priority === p.id) }));
  if (group === 'type') return WORK_TYPES.map(t => ({ key: t.id, label: t.name, icon: typeIcon(t.id), items: items.filter(i => i.type === t.id) }));
  return [{ key: '', label: '', items }];
}

function cardHTML(i, bs) {
  const done = Store.isDone(i);
  const parent = i.parentId ? Store.item(i.parentId) : null;
  const kids = Store.state.items.filter(c => c.parentId === i.id);
  return `<div class="card" draggable="true" data-id="${i.id}" tabindex="0">
    ${parent ? `<div class="card-parent">${typeIcon(parent.type, 12)} <span class="ellip">${esc(parent.summary)}</span></div>` : ''}
    <div class="card-summary">${esc(i.summary)}</div>
    ${bs.labels && i.labels.length ? `<div class="card-tags">${i.labels.map(l => `<span class="tag">${esc(l)}</span>`).join('')}</div>` : ''}
    ${bs.due && i.due ? `<div class="due-chip ${dueClass(i)}">${icon('calendar', 12)} ${fmtDate(i.due)}</div>` : ''}
    <div class="card-foot">
      ${typeIcon(i.type)}
      ${bs.key ? `<span class="card-key ${done ? 'done' : ''}">${esc(i.key)}</span>` : ''}
      ${kids.length ? `<span class="kid-count" title="Child work items">${icon('hierarchy', 12)} ${kids.filter(k => Store.isDone(k)).length}/${kids.length}</span>` : ''}
      ${i.approval && i.approval.state === 'pending' ? `<span class="appr-dot" title="Waiting for approval">${icon('approvals', 12)}</span>` : ''}
      <span class="grow"></span>
      ${bs.priority ? `<span title="${cap(i.priority)} priority">${priorityIcon(i.priority)}</span>` : ''}
      ${bs.avatar ? itemAvatar(i, 24) : ''}
    </div>
  </div>`;
}

function composerHTML(statusId, lane) {
  const vsType = 'task';
  return `<div class="composer">
    <textarea rows="2" placeholder="What needs to be done?" data-keep="composer-${statusId}-${lane}" data-composer></textarea>
    <div class="composer-foot"><button class="btn subtle sm" data-comp-type title="Work type">${typeIcon(vsType)} ${icon('chevronDown', 12)}</button>
    <span class="grow"></span><button class="btn primary sm" data-comp-create>Create ${icon('arrowLeft', 12)}</button></div></div>`;
}

function bindComposer(root, sp, vs, extra = {}) {
  const create = () => {
    const ta = root.querySelector('[data-composer]');
    if (!ta) return;
    const v = ta.value.trim();
    if (!v) return;
    const c = vs.composer;
    const data = { spaceId: sp.id, summary: v, statusId: c.status || undefined, type: c.type || 'task', assignee: Store.state.me, rank: Date.now() };
    if (vs.group === 'assignee') data.assignee = c.lane || null;
    if (vs.group === 'priority' && c.lane) data.priority = c.lane;
    if (vs.group === 'type' && c.lane) data.type = c.lane;
    if (extra.patch) Object.assign(data, extra.patch(c));
    // a sub-task needs a parent: hand over to the Create dialog, which asks for it
    if (data.type === 'subtask' && !data.parentId) {
      vs.composer = null; render();
      openCreateModal({ spaceId: sp.id, type: 'subtask', summary: v, statusId: data.statusId, assignee: data.assignee, due: data.due });
      return;
    }
    Store.createItem(data);
  };
  root.addEventListener('keydown', e => {
    if (!e.target.matches('[data-composer]')) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); create(); }
    if (e.key === 'Escape') { e.stopPropagation(); vs.composer = null; render(); }
  });
  root.addEventListener('click', e => {
    if (e.target.closest('[data-comp-create]')) create();
    const ct = e.target.closest('[data-comp-type]');
    if (ct) typePicker(ct, vs.composer.type, v => { vs.composer.type = v; ct.innerHTML = `${typeIcon(v)} ${icon('chevronDown', 12)}`; root.querySelector('[data-composer]').focus(); });
  });
  root.addEventListener('focusout', e => {
    if (!e.target.matches('[data-composer]')) return;
    setTimeout(() => {
      const ae = document.activeElement;
      if (openPop) return;
      if (!e.target.isConnected) return;
      if (ae && ae.closest('.composer')) return;
      if (!e.target.value.trim()) { vs.composer = null; render(); }
    }, 120);
  });
}

function bindCardDnD(root, sp, vs) {
  let dragId = null;
  root.addEventListener('dragstart', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    dragId = card.dataset.id;
    e.dataTransfer.setData('text/plain', dragId);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => card.classList.add('dragging'), 0);
    const item = Store.item(dragId);
    $$('[data-drop]', root).forEach(z => { if (z.dataset.drop !== item.statusId && !Store.canMove(item, z.dataset.drop)) z.classList.add('no-drop'); });
  });
  root.addEventListener('dragend', () => {
    dragId = null;
    $$('.dragging, .drop-over, .no-drop', root).forEach(x => x.classList.remove('dragging', 'drop-over', 'no-drop'));
    $$('.drop-marker', root).forEach(m => m.remove());
  });
  root.addEventListener('dragover', e => {
    const zone = e.target.closest('[data-drop]');
    if (!zone || !dragId || zone.classList.contains('no-drop')) return;
    e.preventDefault();
    $$('.drop-over', root).forEach(x => x !== zone && x.classList.remove('drop-over'));
    zone.classList.add('drop-over');
    // marker line where the card will land
    let marker = $('.drop-marker', root);
    if (!marker) { marker = document.createElement('div'); marker.className = 'drop-marker'; }
    const next = cardAfter(zone, e.clientY);
    if (next) zone.insertBefore(marker, next); else {
      const btn = zone.querySelector('.col-create, .composer, .empty');
      if (btn) zone.insertBefore(marker, btn); else zone.appendChild(marker);
    }
  });
  root.addEventListener('drop', e => {
    const zone = e.target.closest('[data-drop]');
    if (!zone || !dragId) return;
    e.preventDefault();
    const item = Store.item(dragId);
    const patch = {};
    const to = zone.dataset.drop;
    if (to !== item.statusId) {
      if (!Store.canMove(item, to)) { toast(`${item.key}: ${moveBlocker(item, to)}`, 'error'); return; }
      if (item.approval && item.approval.state === 'pending') { toast('This work item is waiting for approval', 'error'); return; }
      patch.statusId = to;
    }
    const lane = zone.dataset.lane;
    if (vs.group === 'assignee' && (item.assignee || '') !== lane) patch.assignee = lane || null;
    if (vs.group === 'priority' && lane && item.priority !== lane) patch.priority = lane;
    if (vs.group === 'type' && lane && item.type !== lane) patch.type = lane;
    const next = cardAfter(zone, e.clientY);
    const cards = $$('.card', zone).filter(c => c.dataset.id !== dragId);
    const idx = next ? cards.indexOf(next) : cards.length;
    const prevR = idx > 0 ? rankOf(Store.item(cards[idx - 1].dataset.id)) : null;
    const nextR = idx < cards.length ? rankOf(Store.item(cards[idx].dataset.id)) : null;
    patch.rank = prevR == null && nextR == null ? rankOf(item) : prevR == null ? nextR - 1000 : nextR == null ? prevR + 1000 : (prevR + nextR) / 2;
    Store.updateItem(item.id, patch);
  });
}
function cardAfter(zone, y) {
  const cards = $$('.card:not(.dragging)', zone);
  return cards.find(c => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; }) || null;
}

function columnMenu(anchor, sp, statusId) {
  const st = Store.status(sp, statusId);
  const list = sp.workflow.statuses;
  const idx = list.indexOf(st);
  menu(anchor, [
    { value: 'rename', label: 'Rename status', icon: icon('edit') },
    { value: 'left', label: 'Move column left', icon: icon('arrowLeft'), disabled: idx === 0 },
    { value: 'right', label: 'Move column right', icon: icon('arrowRight'), disabled: idx === list.length - 1 },
    { value: 'wf', label: 'Manage workflow', icon: icon('approvals') },
    '-',
    { value: 'delete', label: 'Delete status', icon: icon('trash'), danger: true, disabled: list.length <= 1 },
  ], async v => {
    if (v === 'left' || v === 'right') {
      const j = v === 'left' ? idx - 1 : idx + 1;
      [list[idx], list[j]] = [list[j], list[idx]]; Store.save();
    }
    if (v === 'wf') location.hash = `#/space/${encodeURIComponent(sp.key)}/workflow`;
    if (v === 'rename') {
      popover(anchor, `<div class="pad"><input class="input" value="${esc(st.name)}" maxlength="60"><div class="row gap8" style="margin-top:8px"><button class="btn primary sm" data-value="ok">Save</button></div></div>`, {
        force: true, width: 260,
        onSelect(val, el) { const inp = el.closest('.popover').querySelector('input'); if (inp.value.trim()) { st.name = inp.value.trim(); Store.save(); } },
        onMount(el) { const inp = el.querySelector('input'); inp.select(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { if (inp.value.trim()) { st.name = inp.value.trim(); closePopover(); Store.save(); } } }); },
      });
    }
    if (v === 'delete') moveAndDeleteStatus(sp, st);
  });
}

async function moveAndDeleteStatus(sp, st) {
  const others = sp.workflow.statuses.filter(s => s.id !== st.id);
  const n = Store.itemsOf(sp.id).filter(i => i.statusId === st.id).length;
  if (!n) {
    if (await confirmDialog({ title: `Delete ${st.name}?`, message: 'This status will be removed from your workflow and board.' })) Store.removeStatus(sp, st.id, others[0].id);
    return;
  }
  openModal({
    title: `Move work from ${esc(st.name)}`, width: 460,
    body: `<p>Select a new home for the ${n} work item${n === 1 ? '' : 's'} in this status.</p>
      <label class="field"><span class="field-label">Move work to</span><select class="input">${others.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn danger" data-ok>Delete</button>',
    onMount(el, api) { el.querySelector('[data-ok]').addEventListener('click', () => { Store.removeStatus(sp, st.id, el.querySelector('select').value); api.close(); }); },
  });
}

function addStatusPopover(anchor, sp, wfId = null) {
  popover(anchor, `<div class="pad add-status-pop"><input class="input" placeholder="Status name" maxlength="60">
    <div class="seg cats">${CATEGORIES.map((c, i) => `<button class="${i === 0 ? 'on' : ''}" data-cat="${c.id}"><span class="lozenge cat-${c.id}">${c.name}</span></button>`).join('')}</div>
    <div class="row gap8"><span class="grow"></span><button class="btn subtle sm" data-value="cancel">Cancel</button><button class="btn primary sm" data-add>Add</button></div></div>`, {
    align: 'right', width: 320,
    onMount(el) {
      let cat = 'todo';
      const inp = el.querySelector('input');
      const add = () => { const v = inp.value.trim(); if (!v) return; closePopover(); Store.addStatus(sp, v, cat); toast(`${v} added`); };
      el.addEventListener('click', e => {
        const c = e.target.closest('[data-cat]');
        if (c) { cat = c.dataset.cat; $$('[data-cat]', el).forEach(b => b.classList.toggle('on', b === c)); }
        if (e.target.closest('[data-add]')) add();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
    },
  });
}

function exportCSV(sp, items) {
  const cols = ['Key', 'Summary', 'Type', 'Status', 'Priority', 'Assignee', 'Reporter', 'Start date', 'Due date', 'Labels', 'Created', 'Updated'];
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const rows = items.map(i => [i.key, i.summary, i.type, (Store.statusOf(i) || {}).name, i.priority, (Store.user(i.assignee) || {}).name, (Store.user(i.reporter) || {}).name, i.start, i.due, i.labels.join(';'), i.created, i.updated].map(q).join(','));
  const blob = new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${sp ? sp.key : 'work'}-${todayStr()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =========================== LIST =========================== */
const LIST_COLS = [
  { id: 'assignee', name: 'Assignee', w: 170 }, { id: 'reporter', name: 'Reporter', w: 170 }, { id: 'priority', name: 'Priority', w: 120 },
  { id: 'status', name: 'Status', w: 150 }, { id: 'resolution', name: 'Resolution', w: 130 }, { id: 'created', name: 'Created', w: 130 },
  { id: 'updated', name: 'Updated', w: 130 }, { id: 'due', name: 'Due date', w: 130 }, { id: 'labels', name: 'Labels', w: 150 }, { id: 'start', name: 'Start date', w: 130 },
];
const PRI_ORDER = { highest: 0, high: 1, medium: 2, low: 3, lowest: 4 };

function sortItems(items, sort) {
  const { key, dir } = sort;
  const val = i => {
    switch (key) {
      case 'work': return i.summary.toLowerCase();
      case 'key': return Number(i.key.split('-')[1]);
      case 'rank': return rankOf(i);
      case 'assignee': return (Store.user(i.assignee) || { name: '~' }).name;
      case 'reporter': return (Store.user(i.reporter) || { name: '~' }).name;
      case 'priority': return PRI_ORDER[i.priority];
      case 'status': return Store.space(i.spaceId).workflow.statuses.findIndex(s => s.id === i.statusId);
      case 'resolution': return i.resolved ? 'Done' : '~';
      case 'labels': return i.labels.join(',') || '~';
      case 'due': case 'start': return i[key] || '9999';
      default: return i[key] || '';
    }
  };
  return items.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
}

function listRowCells(i, cols) {
  const st = Store.statusOf(i);
  const cell = {
    assignee: `<button class="cell-btn" data-edit="assignee">${avatar(i.assignee, 24)} <span class="ellip">${esc((Store.user(i.assignee) || { name: 'Unassigned' }).name)}</span></button>`,
    reporter: `<span class="cell-in">${avatar(i.reporter, 24)} <span class="ellip">${esc((Store.user(i.reporter) || { name: 'None' }).name)}</span></span>`,
    priority: `<button class="cell-btn" data-edit="priority">${priorityIcon(i.priority)} ${cap(i.priority)}</button>`,
    status: `<button class="cell-btn" data-edit="status">${lozenge(st)} ${icon('chevronDown', 12)}</button>`,
    resolution: `<span class="cell-in ${i.resolved ? '' : 'muted'}">${i.resolved ? 'Done' : 'Unresolved'}</span>`,
    created: `<span class="cell-in">${fmtDate(i.created)}</span>`,
    updated: `<span class="cell-in">${fmtDate(i.updated)}</span>`,
    due: `<button class="cell-btn ${dueClass(i)}" data-edit="due">${i.due ? `${icon('calendar', 14)} ${fmtDate(i.due)}` : '<span class="muted">None</span>'}</button>`,
    start: `<button class="cell-btn" data-edit="start">${i.start ? fmtDate(i.start) : '<span class="muted">None</span>'}</button>`,
    labels: `<span class="cell-in">${i.labels.map(l => `<span class="tag">${esc(l)}</span>`).join('') || '<span class="muted">None</span>'}</span>`,
  };
  return cols.map(c => `<td>${cell[c.id]}</td>`).join('');
}

function viewList(sp, root) {
  const vs = vsOf(sp);
  sp.listCols = sp.listCols || ['assignee', 'reporter', 'priority', 'status', 'resolution', 'created', 'updated', 'due'];
  const cols = LIST_COLS.filter(c => sp.listCols.includes(c.id));
  const all = Store.itemsOf(sp.id);
  const items = sortItems(applyFilters(all, vs), vs.sort);
  vs.listSel = vs.listSel.filter(id => items.some(i => i.id === id));

  const groups = vs.group === 'none' ? [{ key: '', label: '', items }]
    : vs.group === 'status' ? Store.allStatuses(sp).map(s => ({ key: s.id, label: lozenge(s), items: items.filter(i => i.statusId === s.id) }))
      : boardLanes(vs.group, items).map(l => ({ key: l.key, label: `${l.icon} ${esc(l.label)}`, items: l.items }));

  const sortIc = k => vs.sort.key === k ? icon(vs.sort.dir > 0 ? 'chevronUp' : 'chevronDown', 12) : '';
  const head = `<tr><th class="chk"><input type="checkbox" data-sel-all ${items.length && vs.listSel.length === items.length ? 'checked' : ''}></th>
    <th class="work" data-sort="work">Work ${sortIc('work')}</th>
    ${cols.map(c => `<th style="width:${c.w}px" data-sort="${c.id}">${c.name} ${sortIc(c.id)}</th>`).join('')}
    <th class="cfg"><button class="icon-btn xs" data-list="cols" title="Configure columns">${icon('plus', 14)}</button></th></tr>`;
  const row = i => `<tr class="${vs.listSel.includes(i.id) ? 'sel' : ''}" data-id="${i.id}">
    <td class="chk"><input type="checkbox" data-sel="${i.id}" ${vs.listSel.includes(i.id) ? 'checked' : ''}></td>
    <td class="work"><div class="work-cell ${i.parentId ? 'child' : ''}" ${Store.ancestors(i).length > 1 ? `style="padding-left:${Store.ancestors(i).length * 24}px"` : ''}>${typeIcon(i.type)}<a class="key ${Store.isDone(i) ? 'done' : ''}" data-open>${esc(i.key)}</a><a class="sum ellip" data-open>${esc(i.summary)}</a></div></td>
    ${listRowCells(i, cols)}<td></td></tr>`;

  const empty = !items.length;
  root.innerHTML = toolbarHTML(sp, vs, {
    placeholder: 'Search list', group: true,
    right: `${vs.sort.key !== 'rank' ? '<button class="btn subtle sm" data-list="rank" title="Sort in workflow order">Workflow order</button>' : ''}<button class="icon-btn bordered" data-list="more" title="More actions">${icon('more')}</button>`,
  }) + (vs.listSel.length ? `<div class="bulk-bar"><b>${vs.listSel.length} selected</b>
      <button class="btn sm" data-bulk="status">Change status</button><button class="btn sm" data-bulk="assignee">Assign</button><button class="btn sm" data-bulk="priority">Priority</button>
      <button class="btn sm danger-text" data-bulk="delete">${icon('trash', 14)} Delete</button><span class="grow"></span><button class="btn subtle sm" data-bulk="clear">Clear selection</button></div>` : '') +
    `<div class="table-wrap" data-keep-scroll="list-${sp.id}"><table class="grid">
      <thead>${head}</thead>
      <tbody>${empty ? '' : groups.map(g => (vs.group !== 'none' ? `<tr class="group-row"><td colspan="${cols.length + 3}">${g.label} <span class="muted small">${g.items.length}</span></td></tr>` : '') + g.items.map(row).join('')).join('')}</tbody>
    </table>
    ${empty ? emptyState({ title: hasFilters(vs) || all.length ? 'No work items match your filters' : 'There are no work items here yet', text: 'You either don\'t have any work items or your existing ones don\'t match your current filters.', action: `<button class="btn" data-list="create-modal">Create</button>` }) : ''}
    <div class="list-create">${vs.listCreate ? `<div class="inline-create">${typeIcon('task')}<input class="input bare" placeholder="What needs to be done?" data-keep="list-create" data-list-input><span class="muted small">Enter to create · Esc to cancel</span></div>` : `<button class="btn subtle" data-list="create">${icon('plus')} Create</button>`}</div>
    </div>
    <div class="list-foot"><span>${items.length} of ${all.length}</span><button class="btn subtle sm" data-list="refresh">${icon('refresh', 14)} Refresh</button></div>`;

  bindToolbar(root, sp, vs, { groups: ['none', 'status', 'assignee', 'priority', 'type'] });

  root.addEventListener('click', e => {
    const t = e.target;
    const tr = t.closest('tr[data-id]');
    if (t.closest('[data-open]') && tr) { openItem(tr.dataset.id); return; }
    const ed = t.closest('[data-edit]');
    if (ed && tr) {
      const it = Store.item(tr.dataset.id);
      const set = p => Store.updateItem(it.id, p);
      const f = ed.dataset.edit;
      if (f === 'assignee') userPicker(ed, it.assignee, v => set({ assignee: v }));
      if (f === 'priority') priorityPicker(ed, it.priority, v => set({ priority: v }));
      if (f === 'status') statusPicker(ed, it, v => set({ statusId: v }));
      if (f === 'start') datePicker(ed, it.start, v => set({ start: v }));
      if (f === 'due') datePicker(ed, it.due, v => set({ due: v }), (() => { const l = Store.dueLimits(it); const p = it.parentId && Store.item(it.parentId); return { min: l.min, max: l.max, note: [l.max ? `Parent ${esc(p.key)} is due ${fmtDate(l.max)}` : '', l.min ? `A child work item is due ${fmtDate(l.min)}` : ''].filter(Boolean).join(' · ') }; })());
      return;
    }
    const th = t.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; vs.sort = { key: k, dir: vs.sort.key === k ? -vs.sort.dir : 1 }; render(); return; }
    const l = t.closest('[data-list]');
    if (l) {
      const a = l.dataset.list;
      if (a === 'create') { vs.listCreate = true; render(); }
      if (a === 'rank') { vs.sort = { key: 'rank', dir: 1 }; render(); }
      if (a === 'create-modal') openCreateModal({ spaceId: sp.id });
      if (a === 'refresh') { render(); toast('List refreshed'); }
      if (a === 'more') menu(l, [{ value: 'csv', label: 'Export to CSV', icon: icon('download') }], v => v === 'csv' && exportCSV(sp, items), { align: 'right' });
      if (a === 'cols') {
        popover(l, `<div class="pad"><div class="menu-heading">Columns</div>${LIST_COLS.map(c => `<label class="chk-row"><input type="checkbox" value="${c.id}" ${sp.listCols.includes(c.id) ? 'checked' : ''}> ${c.name}</label>`).join('')}</div>`, {
          align: 'right', width: 220,
          onMount(el) { el.addEventListener('change', ev => { const v = ev.target.value; sp.listCols = ev.target.checked ? LIST_COLS.map(c => c.id).filter(id => sp.listCols.includes(id) || id === v) : sp.listCols.filter(x => x !== v); Store.save(); }); },
        });
      }
      return;
    }
    const bk = t.closest('[data-bulk]');
    if (bk) bulkAction(bk, sp, vs);
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-sel]')) {
      const id = e.target.dataset.sel;
      vs.listSel = e.target.checked ? [...vs.listSel, id] : vs.listSel.filter(x => x !== id);
      render();
    }
    if (e.target.matches('[data-sel-all]')) { vs.listSel = e.target.checked ? items.map(i => i.id) : []; render(); }
  });
  root.addEventListener('keydown', e => {
    if (!e.target.matches('[data-list-input]')) return;
    if (e.key === 'Enter' && e.target.value.trim()) Store.createItem({ spaceId: sp.id, summary: e.target.value.trim(), assignee: Store.state.me });
    if (e.key === 'Escape') { e.stopPropagation(); vs.listCreate = false; render(); }
  });
  root.addEventListener('focusout', e => {
    if (e.target.matches('[data-list-input]')) setTimeout(() => { if (e.target.isConnected && !e.target.value.trim() && document.activeElement !== e.target) { vs.listCreate = false; render(); } }, 120);
  });
}

async function bulkAction(btn, sp, vs) {
  const ids = vs.listSel.slice();
  const act = btn.dataset.bulk;
  if (act === 'clear') { vs.listSel = []; render(); return; }
  if (act === 'status') {
    menu(btn, Store.allStatuses(sp).map(s => ({ value: s.id, label: lozenge(s) })), v => {
      let skipped = 0;
      ids.forEach(id => { const it = Store.item(id); if (it.statusId === v) return; if (Store.canMove(it, v)) Store.updateItem(id, { statusId: v }, true); else skipped++; });
      Store.save(); if (skipped) toast(`${skipped} work item(s) had no transition to that status`, 'error');
    });
  }
  if (act === 'assignee') userPicker(btn, null, v => { ids.forEach(id => Store.updateItem(id, { assignee: v }, true)); Store.save(); });
  if (act === 'priority') priorityPicker(btn, null, v => { ids.forEach(id => Store.updateItem(id, { priority: v }, true)); Store.save(); });
  if (act === 'delete') {
    if (await confirmDialog({ title: `Delete ${ids.length} work item${ids.length === 1 ? '' : 's'}?`, message: 'They will be permanently deleted along with their comments and attachments.' })) {
      const set = new Set(ids.flatMap(id => [id, ...Store.descendantIds(id)]));
      Store.state.items = Store.state.items.filter(i => !set.has(i.id));
      vs.listSel = []; Store.save(); toast('Deleted');
    }
  }
}

/* =========================== CALENDAR =========================== */
function viewCalendar(sp, root) {
  const vs = vsOf(sp);
  const weekends = !!Store.state.ui.calendarWeekends;
  const items = applyFilters(Store.itemsOf(sp.id), vs);
  const [y, m] = vs.calMonth.split('-').map(Number);
  const t = todayStr();
  let days = [];
  let label;
  if (vs.calMode === 'week') {
    const d = parseYmd(vs.calWeek);
    const monday = addDays(vs.calWeek, -((d.getDay() + 6) % 7));
    for (let k = 0; k < 7; k++) days.push(addDays(monday, k));
    const a = parseYmd(days[0]), b = parseYmd(days[6]);
    label = a.getMonth() === b.getMonth() ? `${MONTHS[a.getMonth()]} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}` : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}, ${b.getFullYear()}`;
  } else {
    const first = new Date(y, m - 1, 1);
    let start = addDays(ymd(first), -((first.getDay() + 6) % 7));
    const last = ymd(new Date(y, m, 0));
    while (start <= last || days.length % 7) { days.push(start); start = addDays(start, 1); }
    label = `${MONTHS[m - 1]} ${y}`;
  }
  if (!weekends) days = days.filter(d => { const w = parseYmd(d).getDay(); return w !== 0 && w !== 6; });
  const dayNames = weekends ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

  // weekend work shows on the Friday before when weekends are hidden
  const onDay = d => items.filter(i => {
    if (!i.due) return false;
    if (weekends) return i.due === d;
    const w = parseYmd(i.due).getDay();
    const eff = w === 6 ? addDays(i.due, -1) : w === 0 ? addDays(i.due, -2) : i.due;
    return eff === d;
  }).sort(byRank);

  const maxChips = vs.calMode === 'week' ? 20 : 3;
  const cell = d => {
    const dt = parseYmd(d);
    const other = vs.calMode === 'month' && dt.getMonth() !== m - 1;
    const its = onDay(d);
    const lab = dt.getDate() === 1 ? `${MONTHS[dt.getMonth()]} 1` : dt.getDate();
    const comp = vs.composer && vs.composer.date === d;
    return `<div class="cal-cell ${other ? 'other' : ''} ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}" data-date="${d}">
      <div class="cal-date"><span>${lab}</span><button class="icon-btn xs cal-add" data-cal-add="${d}" title="Create work item">${icon('plus', 14)}</button></div>
      <div class="cal-items">${its.slice(0, maxChips).map(calChip).join('')}
      ${its.length > maxChips ? `<button class="cal-more" data-cal-more="${d}">+${its.length - maxChips} more</button>` : ''}
      ${comp ? `<div class="cal-composer"><input class="input" placeholder="What needs to be done?" data-keep="cal-comp-${d}" data-cal-input="${d}"></div>` : ''}</div>
    </div>`;
  };

  const unsched = items.filter(i => !i.due && (!vs.unschedSearch || i.summary.toLowerCase().includes(vs.unschedSearch.toLowerCase())))
    .sort((a, b) => b.created.localeCompare(a.created));

  root.innerHTML = toolbarHTML(sp, vs, {
    placeholder: 'Search calendar',
    left: `<span class="tb-divider"></span><button class="btn" data-cal="today">Today</button>
      <button class="icon-btn" data-cal="prev" title="Previous">${icon('chevronLeft')}</button><button class="icon-btn" data-cal="next" title="Next">${icon('chevronRight')}</button>
      <span class="cal-label">${label}</span>`,
    right: `<button class="btn" data-cal="mode">${vs.calMode === 'week' ? 'Week' : 'Month'} ${icon('chevronDown', 12)}</button>
      <button class="btn ${vs.unscheduledOpen ? 'selected' : ''}" data-cal="unscheduled">Unscheduled work</button>
      <button class="icon-btn bordered" data-cal="settings" title="View settings">${icon('sliders')}</button>`,
  }) + `<div class="cal-wrap">
    <div class="cal ${vs.calMode} ${weekends ? 'w7' : 'w5'}">
      <div class="cal-head">${dayNames.map(n => `<div>${n}</div>`).join('')}</div>
      <div class="cal-grid">${days.map(cell).join('')}</div>
    </div>
    ${vs.unscheduledOpen ? `<aside class="unsched" data-unsched-drop>
      <div class="us-head"><h3>Unscheduled work</h3><button class="icon-btn sm" data-cal="unscheduled" title="Close">${icon('close')}</button></div>
      <p class="muted small">Drag each work item onto the calendar to set a due date for the work.</p>
      <div class="search-sm full">${icon('search')}<input placeholder="Search unscheduled work" value="${esc(vs.unschedSearch)}" data-unsched-search data-keep="unsched-search"></div>
      <div class="row gap8 us-sort"><span class="muted small">Most recent</span></div>
      <div class="us-list">${unsched.length ? unsched.map(i => `<div class="us-item card" draggable="true" data-id="${i.id}">${typeIcon(i.type)}<span class="ellip grow">${esc(i.summary)}</span>${itemAvatar(i, 20)}</div>`).join('')
        : emptyState({ title: 'All work has been scheduled', text: 'To remove a work item from the calendar, drag it back into the unscheduled work panel', art: 'calendar', small: true })}</div>
    </aside>` : ''}
  </div>`;

  bindToolbar(root, sp, vs);

  root.addEventListener('click', e => {
    const t2 = e.target;
    const chip = t2.closest('.cal-chip, .us-item');
    if (chip) { openItem(chip.dataset.id); return; }
    const add = t2.closest('[data-cal-add]');
    if (add) { vs.composer = { date: add.dataset.calAdd }; render(); return; }
    const more = t2.closest('[data-cal-more]');
    if (more) {
      const d = more.dataset.calMore;
      popover(more, `<div class="pad cal-pop"><div class="menu-heading">${fmtDate(d)}</div>${onDay(d).map(calChip).join('')}</div>`, { width: 260, onMount(el) { el.addEventListener('click', ev => { const c = ev.target.closest('.cal-chip'); if (c) { closePopover(); openItem(c.dataset.id); } }); } });
      return;
    }
    const b = t2.closest('[data-cal]');
    if (!b) return;
    const a = b.dataset.cal;
    const shiftMonth = n => { const d = new Date(y, m - 1 + n, 1); vs.calMonth = ymd(d).slice(0, 7); };
    if (a === 'today') { vs.calMonth = todayStr().slice(0, 7); vs.calWeek = todayStr(); }
    if (a === 'prev') vs.calMode === 'week' ? (vs.calWeek = addDays(vs.calWeek, -7), vs.calMonth = vs.calWeek.slice(0, 7)) : shiftMonth(-1);
    if (a === 'next') vs.calMode === 'week' ? (vs.calWeek = addDays(vs.calWeek, 7), vs.calMonth = vs.calWeek.slice(0, 7)) : shiftMonth(1);
    if (a === 'unscheduled') vs.unscheduledOpen = !vs.unscheduledOpen;
    if (a === 'mode') { menu(b, [{ value: 'month', label: 'Month', selected: vs.calMode === 'month' }, { value: 'week', label: 'Week', selected: vs.calMode === 'week' }], v => { vs.calMode = v; if (v === 'week') vs.calWeek = vs.calMonth === todayStr().slice(0, 7) ? todayStr() : vs.calMonth + '-01'; render(); }); return; }
    if (a === 'settings') {
      popover(b, `<div class="pad settings-pop"><h4>View settings</h4><label class="toggle-row"><input type="checkbox" data-wk ${weekends ? 'checked' : ''}><span class="toggle"></span><span>Show weekends</span></label></div>`, {
        align: 'right', width: 240, onMount(el) { el.addEventListener('change', ev => { Store.state.ui.calendarWeekends = ev.target.checked; Store.save(); }); },
      });
      return;
    }
    render();
  });
  root.addEventListener('input', e => { if (e.target.matches('[data-unsched-search]')) { vs.unschedSearch = e.target.value; render(); } });
  root.addEventListener('keydown', e => {
    if (!e.target.matches('[data-cal-input]')) return;
    if (e.key === 'Enter' && e.target.value.trim()) { Store.createItem({ spaceId: sp.id, summary: e.target.value.trim(), due: e.target.dataset.calInput, assignee: Store.state.me }); vs.composer = null; Store.save(); }
    if (e.key === 'Escape') { e.stopPropagation(); vs.composer = null; render(); }
  });
  root.addEventListener('focusout', e => {
    if (e.target.matches('[data-cal-input]')) setTimeout(() => { if (e.target.isConnected && document.activeElement !== e.target) { vs.composer = null; render(); } }, 150);
  });

  // drag and drop between days and the unscheduled panel
  let dragId = null;
  root.addEventListener('dragstart', e => {
    const c = e.target.closest('[data-id]'); if (!c) return;
    dragId = c.dataset.id; e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => c.classList.add('dragging'), 0);
  });
  root.addEventListener('dragend', () => { dragId = null; $$('.dragging, .drop-over', root).forEach(x => x.classList.remove('dragging', 'drop-over')); });
  root.addEventListener('dragover', e => {
    const z = e.target.closest('.cal-cell, [data-unsched-drop]'); if (!z || !dragId) return;
    e.preventDefault(); $$('.drop-over', root).forEach(x => x !== z && x.classList.remove('drop-over')); z.classList.add('drop-over');
  });
  root.addEventListener('drop', e => {
    const z = e.target.closest('.cal-cell, [data-unsched-drop]'); if (!z || !dragId) return;
    e.preventDefault();
    const it = Store.item(dragId);
    if (z.dataset.date) {
      const nd = z.dataset.date;
      const patch = { due: nd };
      if (it.start && it.due) { const dur = Math.round((parseYmd(it.due) - parseYmd(it.start)) / 864e5); patch.start = addDays(nd, -dur); }
      else if (it.start && it.start > nd) patch.start = nd;
      Store.updateItem(it.id, patch);
    } else Store.updateItem(it.id, { due: null });
  });
}
function calChip(i) {
  const st = Store.statusOf(i);
  return `<div class="cal-chip cat-${st ? st.cat : 'todo'} ${Store.isDone(i) ? 'is-done' : ''}" draggable="true" data-id="${i.id}" title="${esc(i.key)} ${esc(i.summary)}">${typeIcon(i.type, 14)}<span class="ellip">${esc(i.summary)}</span></div>`;
}

/* =========================== TIMELINE =========================== */
const TL_SCALES = { weeks: 32, months: 7, quarters: 2.4 };
const TL_ROW = 40;
const TL_LEFT = 460;

function viewTimeline(sp, root) {
  const vs = vsOf(sp);
  renderTimeline(root, sp, vs, applyFilters(Store.itemsOf(sp.id), vs), {});
}

function renderTimeline(root, sp, vs, items, { showSpace = false, title = '' }) {
  const ppd = TL_SCALES[vs.scale];
  const now = new Date();
  const rangeStart = ymd(new Date(now.getFullYear(), now.getMonth() - 12, 1));
  const rangeEnd = ymd(new Date(now.getFullYear(), now.getMonth() + 25, 0));
  const dayIdx = s => Math.round((parseYmd(s) - parseYmd(rangeStart)) / 864e5);
  const totalDays = dayIdx(rangeEnd) + 1;
  const width = totalDays * ppd;
  const t = todayStr();

  // rows: top-level items then their children when expanded
  const ids = new Set(items.map(i => i.id));
  const tops = items.filter(i => !i.parentId || !ids.has(i.parentId)).sort(byRank);
  const rows = [];
  const addRow = (i, depth) => {
    const kids = items.filter(c => c.parentId === i.id).sort(byRank);
    rows.push({ item: i, depth, kids: kids.length });
    if (kids.length && vs.expanded[i.id]) kids.forEach(k => addRow(k, depth + 1));
  };
  tops.forEach(i => addRow(i, 0));

  // header months
  let months = '';
  let d = new Date(parseYmd(rangeStart));
  while (ymd(d) <= rangeEnd) {
    const ms = ymd(d), dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const yy = d.getFullYear() !== now.getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : '';
    const lab = vs.scale === 'quarters' ? `${MONTHS[d.getMonth()]}${yy}` : `${MONTHS_LONG[d.getMonth()]}${yy}`;
    months += `<div class="tl-month ${ms.slice(0, 7) === t.slice(0, 7) ? 'current' : ''}" style="left:${dayIdx(ms) * ppd}px;width:${dim * ppd}px"><span>${lab}</span></div>`;
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  let weeks = '';
  if (vs.scale === 'weeks') {
    let w = addDays(rangeStart, (8 - parseYmd(rangeStart).getDay()) % 7);
    while (w <= rangeEnd) { weeks += `<div class="tl-week" style="left:${dayIdx(w) * ppd}px;width:${7 * ppd}px">${parseYmd(w).getDate()}</div>`; w = addDays(w, 7); }
  }
  const lines = vs.scale === 'weeks' ? weeks.replace(/tl-week/g, 'tl-vline').replace(/>\d+</g, '><') : months.replace(/tl-month[^"]*/g, 'tl-vline').replace(/<span>.*?<\/span>/g, '');

  const bar = i => {
    const s = i.start || i.due, e = i.due || i.start;
    if (!s) return `<div class="tl-hint">Hover and click to schedule</div>`;
    const a = s <= e ? s : e, b = s <= e ? e : s;
    const st = Store.statusOf(i);
    const left = dayIdx(a) * ppd, w = Math.max(ppd, (dayIdx(b) - dayIdx(a) + 1) * ppd);
    return `<div class="tl-bar cat-${st ? st.cat : 'todo'}" data-bar="${i.id}" style="left:${left}px;width:${w}px" title="${esc(i.summary)} · ${fmtDate(a)} – ${fmtDate(b)}">
      <span class="tl-handle l" data-handle="l"></span><span class="tl-bar-label ellip">${vs.scale !== 'quarters' ? esc(i.summary) : ''}</span><span class="tl-handle r" data-handle="r"></span></div>`;
  };

  root.innerHTML = (sp ? toolbarHTML(sp, vs, { placeholder: 'Search timeline', right: `<button class="icon-btn bordered" data-tl="settings" title="View settings">${icon('sliders')}</button><button class="icon-btn bordered" data-tl="more" title="More actions on the view options">${icon('more')}</button>` }) : title) +
  `<div class="tl" data-keep-scroll="tl-${sp ? sp.id : 'all'}-${vs.scale}">
    <div class="tl-inner" style="width:${TL_LEFT + width}px">
      <div class="tl-headrow">
        <div class="tl-left tl-lhead"><div class="c-work">Work</div><div class="c-status">Status</div><div class="c-assignee">Assignee</div></div>
        <div class="tl-scale" style="width:${width}px"><div class="tl-months">${months}</div>${weeks ? `<div class="tl-weeks">${weeks}</div>` : ''}</div>
      </div>
      <div class="tl-body" style="height:${Math.max(rows.length + 1, 8) * TL_ROW}px">
        <div class="tl-grid" style="left:${TL_LEFT}px;width:${width}px">${lines}<div class="tl-today" style="left:${dayIdx(t) * ppd + ppd / 2}px"></div></div>
        ${rows.map((r, idx) => {
          const i = r.item;
          return `<div class="tl-row" style="top:${idx * TL_ROW}px" data-row="${i.id}">
            <div class="tl-left">
              <div class="c-work" style="padding-left:${8 + r.depth * 24}px">
                ${r.kids ? `<button class="icon-btn xs" data-expand="${i.id}">${icon(vs.expanded[i.id] ? 'chevronDown' : 'chevronRight', 12)}</button>` : '<span class="exp-sp"></span>'}
                ${typeIcon(i.type)}<a class="key ${Store.isDone(i) ? 'done' : ''}" data-open="${i.id}">${esc(i.key)}</a><a class="ellip sum" data-open="${i.id}">${esc(i.summary)}</a>
                ${showSpace ? `<span class="muted small ellip sp-name">${esc(Store.space(i.spaceId).name)}</span>` : ''}</div>
              <div class="c-status"><button class="cell-btn" data-tl-status="${i.id}">${lozenge(Store.statusOf(i))}</button></div>
              <div class="c-assignee"><button class="cell-btn" data-tl-assignee="${i.id}">${itemAvatar(i, 24)}</button></div>
            </div>
            <div class="tl-track" style="width:${width}px" data-track="${i.id}">${bar(i)}</div>
          </div>`;
        }).join('')}
        ${sp ? `<div class="tl-row create-row" style="top:${rows.length * TL_ROW}px"><div class="tl-left">
          ${vs.tlCreate ? `<div class="inline-create">${typeIcon('task')}<input class="input bare" placeholder="What needs to be done?" data-keep="tl-create" data-tl-input></div>` : `<button class="btn subtle" data-tl="create">${icon('plus')} Create</button>`}</div></div>` : ''}
        ${!rows.length && !sp ? `<div class="tl-empty">${emptyState({ title: 'Nothing planned yet', text: 'Add start and due dates to work items and they\'ll appear here.', small: true })}</div>` : ''}
      </div>
    </div>
  </div>
  <div class="tl-controls">
    <button class="btn sm" data-tl="today">Today</button>
    <div class="seg">${['weeks', 'months', 'quarters'].map(s => `<button class="${vs.scale === s ? 'on' : ''}" data-scale="${s}">${cap(s)}</button>`).join('')}</div>
    <button class="btn sm" data-tl="legend">${icon('legend', 14)} Legend</button>
  </div>`;

  if (sp) bindToolbar(root, sp, vs);
  const scroller = root.querySelector('.tl');
  const scrollToToday = () => { scroller.scrollLeft = Math.max(0, dayIdx(t) * ppd - (scroller.clientWidth - TL_LEFT) / 3); };
  if (vs.tlInit !== vs.scale) { vs.tlInit = vs.scale; requestAnimationFrame(scrollToToday); }

  root.addEventListener('click', e => {
    const tg = e.target;
    if (tg.closest('[data-bar]')) return; // handled by drag logic
    const op = tg.closest('[data-open]'); if (op) { openItem(op.dataset.open); return; }
    const ex = tg.closest('[data-expand]'); if (ex) { vs.expanded[ex.dataset.expand] = !vs.expanded[ex.dataset.expand]; render(); return; }
    const ts = tg.closest('[data-tl-status]'); if (ts) { const it = Store.item(ts.dataset.tlStatus); statusPicker(ts, it, v => Store.updateItem(it.id, { statusId: v })); return; }
    const ta = tg.closest('[data-tl-assignee]'); if (ta) { const it = Store.item(ta.dataset.tlAssignee); userPicker(ta, it.assignee, v => Store.updateItem(it.id, { assignee: v })); return; }
    const sc = tg.closest('[data-scale]'); if (sc) { vs.scale = sc.dataset.scale; render(); return; }
    const b = tg.closest('[data-tl]');
    if (b) {
      const a = b.dataset.tl;
      if (a === 'today') scrollToToday();
      if (a === 'create') { vs.tlCreate = true; render(); }
      if (a === 'legend') popover(b, `<div class="pad legend"><div class="menu-heading">Legend</div>${CATEGORIES.map(c => `<div class="lg-row"><span class="tl-bar-sw cat-${c.id}"></span>${c.name}</div>`).join('')}<div class="lg-row"><span class="tl-today-sw"></span>Today</div></div>`, { align: 'right', width: 200 });
      if (a === 'settings') menu(b, [{ heading: 'Expand' }, { value: 'expand', label: 'Expand all' }, { value: 'collapse', label: 'Collapse all' }], v => { items.forEach(i => { vs.expanded[i.id] = v === 'expand'; }); render(); }, { align: 'right' });
      if (a === 'more') menu(b, [{ value: 'csv', label: 'Export to CSV', icon: icon('download') }], () => exportCSV(sp, items), { align: 'right' });
      return;
    }
    // click on an empty track schedules the item
    const tr = tg.closest('[data-track]');
    if (tr) {
      const it = Store.item(tr.dataset.track);
      if (it.start || it.due) return;
      const x = e.clientX - tr.getBoundingClientRect().left;
      const s = addDays(rangeStart, Math.floor(x / ppd));
      Store.updateItem(it.id, { start: s, due: addDays(s, vs.scale === 'weeks' ? 4 : 13) });
    }
  });
  root.addEventListener('keydown', e => {
    if (!e.target.matches('[data-tl-input]')) return;
    if (e.key === 'Enter' && e.target.value.trim()) Store.createItem({ spaceId: sp.id, summary: e.target.value.trim(), assignee: Store.state.me });
    if (e.key === 'Escape') { e.stopPropagation(); vs.tlCreate = false; render(); }
  });
  root.addEventListener('focusout', e => {
    if (e.target.matches('[data-tl-input]')) setTimeout(() => { if (e.target.isConnected && !e.target.value.trim() && document.activeElement !== e.target) { vs.tlCreate = false; render(); } }, 120);
  });

  // bar move / resize
  root.addEventListener('mousedown', e => {
    const barEl = e.target.closest('[data-bar]');
    if (!barEl || e.button !== 0) return;
    e.preventDefault();
    const mode = e.target.dataset.handle || 'move';
    const it = Store.item(barEl.dataset.bar);
    const x0 = e.clientX, l0 = barEl.offsetLeft, w0 = barEl.offsetWidth;
    let moved = false;
    barEl.classList.add('dragging');
    const onMove = ev => {
      const dx = ev.clientX - x0;
      if (Math.abs(dx) > 3) moved = true;
      if (mode === 'move') barEl.style.left = (l0 + dx) + 'px';
      if (mode === 'l') { barEl.style.left = Math.min(l0 + dx, l0 + w0 - ppd) + 'px'; barEl.style.width = Math.max(ppd, w0 - dx) + 'px'; }
      if (mode === 'r') barEl.style.width = Math.max(ppd, w0 + dx) + 'px';
    };
    const onUp = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      barEl.classList.remove('dragging');
      if (!moved) { openItem(it.id); return; }
      const days = Math.round((ev.clientX - x0) / ppd);
      const s = it.start || it.due, en = it.due || it.start;
      let ns = s, ne = en;
      if (mode === 'move') { ns = addDays(s, days); ne = addDays(en, days); }
      if (mode === 'l') { ns = addDays(s, days); if (ns > ne) ns = ne; }
      if (mode === 'r') { ne = addDays(en, days); if (ne < ns) ne = ns; }
      Store.updateItem(it.id, { start: ns, due: ne });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
