/* Pages outside a space: For you, Spaces, Filters, Dashboards, Plans, Apps, Teams, Projects */

function pageHead(title, sub = '', actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="row gap8">${actions}</div></div>`;
}
function itemRow(i, extra = '') {
  const sp = Store.space(i.spaceId);
  return `<div class="item-row" data-open="${i.id}">${typeIcon(i.type)}<div class="grow ir-main"><div class="ellip">${esc(i.summary)}</div>
    <div class="muted small">${esc(i.key)} · ${esc(sp ? sp.name : '')}${Store.user(i.reporter) ? ` · ${reporterText(i)}` : ''}</div></div>${extra}${lozenge(Store.statusOf(i))}${itemAvatar(i, 24)}</div>`;
}
function bindOpen(root) { root.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (o) openItem(o.dataset.open); }); }

/* Search work items table: used by Filters and by Assign Task (its own filters, clickable assignees) */
function workSearchPage(root, r, opts) {
  const vs = vsOf(opts.vsKey ? { id: opts.vsKey } : null);
  if (r.query && r.query.q != null && vs._q !== r.query.q) { vs.search = r.query.q; vs._q = r.query.q; }
  vs.fSpace = vs.fSpace || '';
  vs.fCat = vs.fCat || '';
  vs.fFolder = vs.fFolder || ''; // folder id, or '__none' for spaces not in a folder
  const inFolder = sp => !vs.fFolder || (folderIdOf(sp) || '__none') === vs.fFolder;
  if (vs.fSpace && !inFolder(Store.space(vs.fSpace) || {})) vs.fSpace = '';
  let items = applyFilters(Store.state.items, vs);
  if (vs.fFolder) items = items.filter(i => inFolder(Store.space(i.spaceId)));
  if (vs.fSpace) items = items.filter(i => i.spaceId === vs.fSpace);
  if (vs.fCat) items = items.filter(i => (Store.statusOf(i) || {}).cat === vs.fCat);
  items = sortItems(items, vs.sort);
  Store.state.filters = Store.state.filters || [];
  const saved = Store.state.filters;
  const sortIc = k => vs.sort.key === k ? icon(vs.sort.dir > 0 ? 'chevronUp' : 'chevronDown', 12) : '';
  root.innerHTML = `<div class="wide-page">${pageHead(opts.title, opts.sub || '', `<button class="btn" data-f="saved">${icon('star', 14)} Saved filters${saved.length ? ` <span class="count">${saved.length}</span>` : ''}</button><button class="btn primary" data-f="save">Save filter</button>`)}
    ${toolbarHTML(null, vs, { placeholder: 'Search work', left: `<select class="input sm-select" data-fsel="fFolder" title="Folder"><option value="">All folders</option>${Store.state.folders.map(f => `<option value="${f.id}" ${vs.fFolder === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="__none" ${vs.fFolder === '__none' ? 'selected' : ''}>Not in a folder</option></select>
      <select class="input sm-select" data-fsel="fSpace"><option value="">All spaces</option>${Store.state.spaces.filter(inFolder).map(sp => `<option value="${sp.id}" ${vs.fSpace === sp.id ? 'selected' : ''}>${esc(sp.name)}</option>`).join('')}</select>
      <select class="input sm-select" data-fsel="fCat"><option value="">Any status</option>${CATEGORIES.map(c => `<option value="${c.id}" ${vs.fCat === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>` })}
    <div class="table-wrap"><table class="grid"><thead><tr><th class="work" data-sort="work">Work ${sortIc('work')}</th><th style="width:200px">Space</th><th style="width:150px" data-sort="status">Status ${sortIc('status')}</th><th style="width:170px" data-sort="assignee">Assignee ${sortIc('assignee')}</th><th style="width:170px" data-sort="reporter">Reporter ${sortIc('reporter')}</th><th style="width:110px" data-sort="priority">Priority ${sortIc('priority')}</th><th style="width:120px" data-sort="due">Due date ${sortIc('due')}</th><th style="width:120px" data-sort="updated">Updated ${sortIc('updated')}</th></tr></thead>
    <tbody>${items.map(i => `<tr data-id="${i.id}"><td class="work"><div class="work-cell">${typeIcon(i.type)}<a class="key ${Store.isDone(i) ? 'done' : ''}" data-open="${i.id}">${esc(i.key)}</a><a class="sum ellip" data-open="${i.id}">${esc(i.summary)}</a></div></td>
      <td><span class="cell-in">${spaceAvatar(Store.space(i.spaceId), 18)} <span class="ellip">${folderOf(Store.space(i.spaceId)) ? `<span class="muted">${esc(folderOf(Store.space(i.spaceId)).name)} / </span>` : ''}${esc(Store.space(i.spaceId).name)}</span></span></td><td>${lozenge(Store.statusOf(i))}</td>
      <td>${opts.assign ? `<button class="cell-btn" data-assign="${i.id}" title="Change assignee">` : '<span class="cell-in">'}${avatar(i.assignee, 24)} <span class="ellip">${esc((Store.user(i.assignee) || { name: 'Unassigned' }).name)}</span>${opts.assign ? '</button>' : '</span>'}</td>
      <td><span class="cell-in">${avatar(i.reporter, 24)} <span class="ellip">${esc((Store.user(i.reporter) || { name: 'None' }).name)}</span></span></td><td><span class="cell-in">${priorityIcon(i.priority)} ${cap(i.priority)}</span></td>
      <td><span class="cell-in ${dueClass(i)}">${i.due ? fmtDate(i.due) : '<span class="muted">None</span>'}</span></td><td><span class="cell-in">${fmtDate(i.updated)}</span></td></tr>`).join('')}</tbody></table>
    ${!items.length ? emptyState({ title: 'No work items found', text: 'Try changing your search or filters.', art: 'search' }) : ''}</div>
    <div class="list-foot"><span>${items.length} work item${items.length === 1 ? '' : 's'}</span><button class="btn subtle sm" data-f="csv">${icon('download', 14)} Export CSV</button></div></div>`;
  bindToolbar(root, null, vs);
  bindOpen(root);
  root.addEventListener('change', e => { const k = e.target.dataset.fsel; if (k) { vs[k] = e.target.value; render(); } });
  root.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th) { const k = th.dataset.sort; vs.sort = { key: k, dir: vs.sort.key === k ? -vs.sort.dir : 1 }; render(); return; }
    const as = opts.assign && e.target.closest('[data-assign]');
    if (as) { const it = Store.item(as.dataset.assign); userPicker(as, it.assignee, v => { Store.updateItem(it.id, { assignee: v }); toast(`${it.key} assigned to ${v ? Store.user(v).name : 'nobody'}`); }); return; }
    const b = e.target.closest('[data-f]'); if (!b) return;
    if (b.dataset.f === 'csv') exportCSV(null, items);
    if (b.dataset.f === 'save') {
      popover(b, `<div class="pad"><input class="input" placeholder="Filter name"><div class="row gap8" style="margin-top:8px;justify-content:flex-end"><button class="btn primary sm" data-value="ok">Save</button></div></div>`, {
        align: 'right', width: 260,
        onSelect(v, el) {
          const n = el.closest('.popover').querySelector('input').value.trim();
          if (!n) return true;
          saved.push({ id: uid('flt'), name: n, v: { search: vs.search, assignees: vs.assignees, types: vs.types, priorities: vs.priorities, labels: vs.labels, due: vs.due, fSpace: vs.fSpace, fCat: vs.fCat, fFolder: vs.fFolder } });
          Store.save(); toast('Filter saved');
        },
      });
    }
    if (b.dataset.f === 'saved') {
      menu(b, saved.length ? saved.map(f => ({ value: f.id, label: esc(f.name), icon: icon('filter') })).concat(['-', { value: '__manage', label: 'Delete all saved filters', icon: icon('trash'), danger: true }])
        : [{ value: '', label: '<span class="muted">No saved filters yet</span>', disabled: true }], async v => {
        if (v === '__manage') { if (await confirmDialog({ title: 'Delete saved filters?', message: 'All saved filters will be removed.' })) { Store.state.filters = []; Store.save(); } return; }
        const f = saved.find(x => x.id === v); if (f) { Object.assign(vs, JSON.parse(JSON.stringify(f.v))); render(); }
      }, { align: 'right', width: 260 });
    }
  });
}

const PAGES = {
  'for-you'(root, r) {
    const tab = (r.query && r.query.tab) || 'worked';
    const me = Store.state.me;
    const items = Store.state.items;
    const lists = {
      worked: items.filter(i => i.history.some(h => h.user === me) || i.reporter === me).sort((a, b) => b.updated.localeCompare(a.updated)),
      assigned: items.filter(i => i.assignee === me && !Store.isDone(i)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')),
      starred: items.filter(i => { const sp = Store.space(i.spaceId); return sp && sp.starred; }).sort((a, b) => b.updated.localeCompare(a.updated)),
    };
    const list = lists[tab];
    const t = todayStr(), wk = addDays(t, -7);
    const buckets = tab === 'assigned'
      ? [['Overdue', list.filter(i => i.due && i.due < t)], ['Due soon', list.filter(i => i.due && i.due >= t && i.due <= addDays(t, 7))], ['Later', list.filter(i => !i.due || i.due > addDays(t, 7))]]
      : [['Today', list.filter(i => i.updated.slice(0, 10) === t)], ['In the last week', list.filter(i => i.updated.slice(0, 10) < t && i.updated.slice(0, 10) >= wk)], ['Earlier', list.filter(i => i.updated.slice(0, 10) < wk)]];
    const recent = Store.state.recent.map(id => Store.space(id)).filter(Boolean).slice(0, 4);
    root.innerHTML = `<div class="narrow-page">${pageHead('For you')}
      <div class="sec-head"><h3>Recent spaces</h3><a class="link small" href="#/spaces">View all spaces</a></div>
      <div class="space-cards">${recent.map(sp => {
        const its = Store.itemsOf(sp.id);
        return `<a class="space-card" href="#/space/${encodeURIComponent(sp.key)}/board" style="--sc:${sp.color}"><div class="sc-band"></div><div class="sc-body">${spaceAvatar(sp, 32)}<div class="ellip"><b class="ellip">${esc(sp.name)}</b><div class="muted small">Business space</div></div></div>
          <div class="sc-links"><div class="muted small">Quick links</div><div class="row"><span>My open work items</span><span class="count">${its.filter(i => i.assignee === me && !Store.isDone(i)).length}</span></div><div class="row"><span>Done work items</span><span class="count">${its.filter(i => Store.isDone(i)).length}</span></div></div></a>`;
      }).join('')}<button class="space-card add" data-new-space>${icon('plus', 20)}<span>Create space</span></button></div>
      <div class="subtabs"><a class="${tab === 'worked' ? 'on' : ''}" href="#/for-you?tab=worked">Worked on</a><a class="${tab === 'assigned' ? 'on' : ''}" href="#/for-you?tab=assigned">Assigned to me <span class="count">${lists.assigned.length}</span></a><a class="${tab === 'starred' ? 'on' : ''}" href="#/for-you?tab=starred">Starred</a></div>
      ${list.length ? buckets.filter(b => b[1].length).map(([h, its]) => `<div class="bucket"><div class="menu-heading">${h}</div>${its.map(i => itemRow(i, i.due ? `<span class="due-chip ${dueClass(i)}">${fmtDate(i.due)}</span>` : '')).join('')}</div>`).join('')
        : emptyState({ title: tab === 'assigned' ? 'Nothing assigned to you' : tab === 'starred' ? 'No work in starred spaces' : 'You haven\'t worked on anything yet', text: 'Work you create, edit or get assigned will show up here.' })}
    </div>`;
    bindOpen(root);
    root.addEventListener('click', e => { if (e.target.closest('[data-new-space]')) openCreateSpace(); });
  },

  spaces(root, r) {
    const q = ((r.query && r.query.q) || '').toLowerCase();
    const match = sp => !q || sp.name.toLowerCase().includes(q) || sp.key.toLowerCase().includes(q);
    const row = sp => `<tr draggable="true" data-sp-row="${sp.id}"><td><button class="icon-btn xs star ${sp.starred ? 'on' : ''}" data-star="${sp.id}" title="${sp.starred ? 'Remove from' : 'Add to'} starred">${icon(sp.starred ? 'starFill' : 'star', 14)}</button></td>
        <td><a class="cell-in link-plain" href="#/space/${encodeURIComponent(sp.key)}/board">${spaceAvatar(sp, 24)} ${esc(sp.name)}</a></td><td>${esc(sp.key)}</td>
        <td><button class="cell-btn" data-sp-folder="${sp.id}">${icon('folder', 14)} ${folderOf(sp) ? esc(folderOf(sp).name) : '<span class="muted">None</span>'}</button></td>
        <td><span class="cell-in">${avatar(sp.lead || Store.state.me, 24)} ${esc((Store.user(sp.lead || Store.state.me) || {}).name || '')}</span></td><td>${Store.itemsOf(sp.id).length}</td>
        <td><button class="icon-btn xs" data-sp-more="${sp.id}">${icon('more', 14)}</button></td></tr>`;
    const groups = [...Store.state.folders.map(f => ({ f, sps: spacesIn(f.id).filter(match) })), { f: null, sps: spacesIn(null).filter(match) }]
      .filter(g => g.f || g.sps.length || !Store.state.folders.length);
    const total = groups.reduce((n, g) => n + g.sps.length, 0);
    root.innerHTML = `<div class="wide-page">${pageHead('Spaces', '', `<button class="btn" data-new-folder>${icon('folder', 14)} Create folder</button><button class="btn primary" data-new-space>Create space</button>`)}
      <div class="toolbar"><div class="search-sm">${icon('search')}<input placeholder="Search spaces" value="${esc(q)}" data-space-search data-keep="space-search"></div><span class="muted small">Drag a space onto a folder to move it.</span></div>
      <table class="grid spaces-table"><thead><tr><th style="width:40px"></th><th>Name</th><th style="width:120px">Key</th><th style="width:200px">Folder</th><th style="width:200px">Lead</th><th style="width:120px">Work items</th><th style="width:60px"></th></tr></thead>
      ${groups.map(g => `<tbody class="folder-group" data-group-drop="${g.f ? g.f.id : ''}">
        ${Store.state.folders.length ? `<tr class="group-row"><td colspan="7"><div class="row gap8">${g.f ? `<button class="icon-btn xs" data-fold="${g.f.id}">${icon(g.f.collapsed ? 'chevronRight' : 'chevronDown', 12)}</button>${icon('folder')} <b>${esc(g.f.name)}</b>` : `${icon('spaces')} <b>Not in a folder</b>`}
          <span class="muted small">${g.sps.length} space${g.sps.length === 1 ? '' : 's'}</span><span class="grow"></span>
          ${g.f ? `<button class="btn subtle sm" data-fnew="${g.f.id}">${icon('plus', 12)} Space</button><button class="icon-btn xs" data-fmenu="${g.f.id}">${icon('more', 14)}</button>` : ''}</div></td></tr>` : ''}
        ${g.f && g.f.collapsed ? '' : g.sps.map(row).join('') || (g.f ? '<tr><td colspan="7" class="muted small folder-empty-row">Empty folder. Drag spaces here.</td></tr>' : '')}
      </tbody>`).join('')}</table>
      ${!total && !Store.state.folders.length ? emptyState({ title: 'No spaces found', text: q ? 'Try a different search.' : 'Create a space to start organizing your work.', art: 'spaces' }) : ''}</div>`;
    root.addEventListener('click', e => {
      if (e.target.closest('[data-new-space]')) openCreateSpace();
      if (e.target.closest('[data-new-folder]')) openFolderModal();
      const s = e.target.closest('[data-star]'); if (s) { const sp = Store.space(s.dataset.star); sp.starred = !sp.starred; Store.save(); }
      const m = e.target.closest('[data-sp-more]'); if (m) spaceMenu(m, Store.space(m.dataset.spMore));
      const fo = e.target.closest('[data-sp-folder]'); if (fo) moveToFolderMenu(fo, Store.space(fo.dataset.spFolder));
      const fd = e.target.closest('[data-fold]'); if (fd) { const f = Store.state.folders.find(x => x.id === fd.dataset.fold); f.collapsed = !f.collapsed; Store.save(); }
      const fn = e.target.closest('[data-fnew]'); if (fn) openCreateSpace({ folderId: fn.dataset.fnew });
      const fmn = e.target.closest('[data-fmenu]'); if (fmn) folderMenu(fmn, Store.state.folders.find(x => x.id === fmn.dataset.fmenu));
    });
    root.addEventListener('input', e => { if (e.target.matches('[data-space-search]')) history.replaceState(null, '', '#/spaces?q=' + encodeURIComponent(e.target.value)) || render(); });
    let drag = null;
    root.addEventListener('dragstart', e => { const tr = e.target.closest('[data-sp-row]'); if (!tr) return; drag = tr.dataset.spRow; e.dataTransfer.setData('text/plain', drag); e.dataTransfer.effectAllowed = 'move'; });
    root.addEventListener('dragend', () => { drag = null; $$('.drop-over', root).forEach(x => x.classList.remove('drop-over')); });
    root.addEventListener('dragover', e => { const g = drag && e.target.closest('[data-group-drop]'); if (!g) return; e.preventDefault(); $$('.drop-over', root).forEach(x => x !== g && x.classList.remove('drop-over')); g.classList.add('drop-over'); });
    root.addEventListener('drop', e => { const g = drag && e.target.closest('[data-group-drop]'); if (!g) return; e.preventDefault(); const sp = Store.space(drag); drag = null; moveSpaceToFolder(sp, g.dataset.groupDrop || null); });
  },

  filters(root, r) { workSearchPage(root, r, { title: 'Search work items' }); },

  'assign-task'(root, r) { workSearchPage(root, r, { title: 'Assign Task', sub: 'Find work items and click an assignee to reassign it.', vsKey: '__assign', assign: true }); },

  dashboards(root) {
    const items = Store.state.items;
    const me = Store.state.me;
    const t = todayStr();
    const byCat = CATEGORIES.map(c => ({ label: c.name, value: items.filter(i => (Store.statusOf(i) || {}).cat === c.id).length, color: CAT_COLOR[c.id] }));
    const mine = items.filter(i => i.assignee === me && !Store.isDone(i)).sort((a, b) => (a.due || '9').localeCompare(b.due || '9')).slice(0, 8);
    const due = items.filter(i => i.due && !Store.isDone(i) && i.due <= addDays(t, 7)).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 8);
    const perSpace = Store.state.spaces.map(sp => { const its = Store.itemsOf(sp.id); return { sp, n: its.length, done: its.filter(i => Store.isDone(i)).length }; });
    root.innerHTML = `<div class="wide-page">${pageHead('My dashboard', 'An overview of work across all your spaces.')}
      <div class="sum-grid">
        <section class="panel"><h3>Assigned to me</h3>${mine.length ? `<div class="mini-list">${mine.map(i => itemRow(i, i.due ? `<span class="due-chip ${dueClass(i)}">${fmtDate(i.due)}</span>` : '')).join('')}</div>` : '<p class="muted">You\'re all caught up.</p>'}</section>
        <section class="panel"><h3>Status across spaces</h3>${items.length ? `<div class="donut-wrap">${donut(byCat, items.length)}<ul class="legend-list">${byCat.map(s => `<li><span class="sw" style="background:${s.color}"></span>${s.label}: <b>${s.value}</b></li>`).join('')}</ul></div>` : '<p class="muted">No work yet.</p>'}</section>
        <section class="panel"><h3>Due in the next 7 days</h3>${due.length ? `<div class="mini-list">${due.map(i => itemRow(i, `<span class="due-chip ${dueClass(i)}">${fmtDate(i.due)}</span>`)).join('')}</div>` : '<p class="muted">Nothing due soon.</p>'}</section>
        <section class="panel"><h3>Progress by space</h3>${hbars(perSpace.map(x => ({ label: `${spaceAvatar(x.sp, 18)} <span class="ellip">${esc(x.sp.name)}</span>`, value: x.done, display: x.n ? `${Math.round(x.done / x.n * 100)}%` : '—', tip: `${x.done} of ${x.n} done` })), Math.max(1, ...perSpace.map(x => x.n)))}</section>
      </div></div>`;
    bindOpen(root);
  },

  plans(root) {
    const vs = vsOf({ id: '__plans' });
    root.innerHTML = '<div class="plans-page"></div>';
    renderTimeline(root.firstElementChild, null, vs, applyFilters(Store.state.items, vs), {
      showSpace: true,
      title: `${pageHead('Plans', 'Every scheduled work item across your spaces, on one timeline.')}${toolbarHTML(null, vs, { placeholder: 'Search plans' })}`,
    });
    bindToolbar(root, null, vs);
  },

  apps(root) { renderAppsHome(root); },

  teams(root) {
    const users = Store.state.users;
    root.innerHTML = `<div class="narrow-page">${pageHead('People', 'People you can assign work to. They only exist in this browser.', '<button class="btn primary" data-p="add">Add person</button>')}
      <div class="people-grid">${users.map(u => `<div class="person">${avatar(u.id, 56)}<b>${esc(u.name)}</b><span class="muted small">${u.id === Store.state.me ? 'You' : `${Store.state.items.filter(i => i.assignee === u.id).length} assigned`}</span>
        ${u.id === Store.state.me ? '<button class="btn sm" data-p="me">Edit profile</button>' : `<button class="btn sm danger-text" data-p-del="${u.id}">Remove</button>`}</div>`).join('')}</div></div>`;
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-p]');
      if (b && b.dataset.p === 'me') openProfile();
      if (b && b.dataset.p === 'add') {
        let color = SPACE_COLORS[users.length % SPACE_COLORS.length];
        openModal({
          title: 'Add person', width: 440,
          body: `<label class="field"><span class="field-label">Name <span class="req">*</span></span><input class="input" name="n" autofocus></label>
            <div class="field"><span class="field-label">Avatar color</span><div class="color-row">${SPACE_COLORS.map(c => `<button class="swatch ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>`,
          footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Add</button>',
          onMount(el, api) {
            el.addEventListener('click', ev => { const c = ev.target.closest('[data-color]'); if (c) { color = c.dataset.color; $$('.swatch', el).forEach(s => s.classList.toggle('on', s === c)); } });
            const go = () => {
              const n = el.querySelector('[name=n]').value.trim(); if (!n) return;
              const initials = n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
              users.push({ id: uid('u'), name: n, initials, color }); Store.save(); api.close(); toast(`${n} added`);
            };
            el.querySelector('[data-ok]').addEventListener('click', go);
            el.querySelector('[name=n]').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
          },
        });
      }
      const d = e.target.closest('[data-p-del]');
      if (d) {
        const u = Store.user(d.dataset.pDel);
        if (await confirmDialog({ title: `Remove ${u.name}?`, message: 'Work assigned to them becomes unassigned.', confirmLabel: 'Remove' })) {
          Store.state.items.forEach(i => { if (i.assignee === u.id) i.assignee = null; if (i.reporter === u.id) i.reporter = Store.state.me; });
          Store.state.spaces.forEach(sp => { sp.approvals.approvers = sp.approvals.approvers.filter(x => x !== u.id); });
          Store.state.users = users.filter(x => x !== u); Store.save();
        }
      }
    });
  },

  projects(root) { placeholderPage(root, 'Projects', 'projects', 'Your spaces are your projects here. Open a space to see its board, list, calendar and timeline.', '<a class="btn primary" href="#/spaces">View spaces</a>'); },
  notfound(root) { placeholderPage(root, 'Page not found', 'search', 'That page doesn\'t exist.', '<a class="btn primary" href="#/for-you">Go to For you</a>'); },
};

function placeholderPage(root, title, ic, text, action = '') {
  root.innerHTML = `<div class="narrow-page">${pageHead(title)}<div class="empty big"><div class="empty-illus">${icon(ic, 40)}</div><h3>${title}</h3><p>${text}</p>${action}</div></div>`;
}
