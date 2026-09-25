/* Create-work-item dialog and work item detail view */

function openCreateModal(preset = {}) {
  const spaces = Store.state.spaces;
  if (!spaces.length) { toast('Create a space first', 'error'); return; }
  const spaceId = preset.spaceId || (currentSpace() || spaces[0]).id;

  // a Sub-task must sit under a parent; sub-tasks themselves can't be parents of one
  const buildOptions = (sp, type) => ({
    statuses: sp.workflow.statuses.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join(''),
    parents: (type === 'subtask' ? '<option value="">Choose the parent work item…</option>' : '<option value="">None</option>') + Store.itemsOf(sp.id)
      .filter(i => type !== 'subtask' || i.type !== 'subtask')
      .map(i => `<option value="${i.id}">${esc(i.key)} ${esc(i.summary)}</option>`).join(''),
  });
  const sp0 = Store.space(spaceId);
  const type0 = preset.parentId ? 'subtask' : (preset.type || 'task');
  const o = buildOptions(sp0, type0);

  const body = `
    <p class="muted small">Required fields are marked with an asterisk <span class="req">*</span></p>
    <div class="form-grid">
      <label class="field"><span class="field-label">Space <span class="req">*</span></span>
        <select class="input" name="spaceId">${spaces.map(s => `<option value="${s.id}" ${s.id === spaceId ? 'selected' : ''}>${esc(s.name)} (${esc(s.key)})</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Work type <span class="req">*</span></span>
        <select class="input" name="type">${WORK_TYPES.map(t => `<option value="${t.id}" ${t.id === type0 ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
    </div>
    <label class="field"><span class="field-label">Parent <span class="req" data-parent-req>*</span></span>
      <select class="input" name="parentId">${o.parents}</select>
      <span class="field-help" data-parent-help></span></label>
    <div class="sep"></div>
    <label class="field"><span class="field-label">Status</span>
      <select class="input narrow" name="statusId">${o.statuses}</select>
      <span class="field-help">This is the initial status upon creation</span></label>
    <label class="field"><span class="field-label">Summary <span class="req">*</span></span>
      <input class="input" name="summary" autofocus maxlength="255" value="${esc(preset.summary || '')}"></label>
    <label class="field"><span class="field-label">Description</span>
      <textarea class="input" name="description" rows="5" placeholder="Add a description..."></textarea></label>
    <div class="form-grid">
      <label class="field"><span class="field-label">Assignee</span>
        <select class="input" name="assignee"><option value="">Unassigned</option>${Store.state.users.map(u => `<option value="${u.id}" ${u.id === (preset.assignee !== undefined ? preset.assignee : Store.state.me) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
        <a class="link small" data-assign-me>Assign to me</a></label>
      <label class="field"><span class="field-label">Priority</span>
        <select class="input" name="priority">${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === 'medium' ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Start date</span>
        <input class="input" type="date" name="start" value="${esc(preset.start || (preset.due && preset.due < todayStr() ? preset.due : todayStr()))}"></label>
      <label class="field"><span class="field-label">Due date</span>
        <input class="input" type="date" name="due" value="${esc(preset.due || '')}"></label>
    </div>
    <label class="field"><span class="field-label">Labels</span>
      <input class="input" name="labels" placeholder="Separate labels with commas"></label>
  `;
  const footer = `<label class="check"><input type="checkbox" name="another"> Create another</label>
    <span class="grow"></span><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-create>Create</button>`;

  openModal({
    title: 'Create', body, footer, width: 680, cls: 'create-modal',
    onMount(el, api) {
      const f = n => el.querySelector(`[name="${n}"]`);
      if (preset.statusId) f('statusId').value = preset.statusId;
      if (preset.parentId) f('parentId').value = preset.parentId;
      // Parent is required for a Sub-task, optional for a Task; the list is rebuilt when type or space changes
      const syncParent = () => {
        const sub = f('type').value === 'subtask', cur = f('parentId').value;
        f('parentId').innerHTML = buildOptions(Store.space(f('spaceId').value), f('type').value).parents;
        if ([...f('parentId').options].some(x => x.value === cur)) f('parentId').value = cur;
        el.querySelector('[data-parent-req]').hidden = !sub;
        el.querySelector('[data-parent-help]').textContent = sub ? 'Which work item this sub-task belongs to' : 'Optional';
        f('parentId').classList.remove('invalid');
      };
      syncParent();
      f('type').addEventListener('change', () => { syncParent(); syncDueMax(); });
      const syncDueMax = () => {
        const par = f('parentId').value && Store.item(f('parentId').value);
        if (par && par.due) { f('due').max = par.due; f('due').title = `Can't be after ${par.key}'s due date (${fmtDate(par.due)})`; }
        else { f('due').removeAttribute('max'); f('due').title = ''; }
      };
      f('parentId').addEventListener('change', syncDueMax);
      syncDueMax();
      f('spaceId').addEventListener('change', () => {
        const oo = buildOptions(Store.space(f('spaceId').value), f('type').value);
        f('statusId').innerHTML = oo.statuses;
        syncParent(); syncDueMax();
      });
      el.querySelector('[data-assign-me]').addEventListener('click', () => { f('assignee').value = Store.state.me; });
      const submit = () => {
        const summary = f('summary').value.trim();
        if (!summary) { f('summary').classList.add('invalid'); f('summary').focus(); return; }
        if (f('type').value === 'subtask' && !f('parentId').value) {
          f('parentId').classList.add('invalid'); f('parentId').focus();
          toast('Choose the parent work item for this sub-task', 'error');
          return;
        }
        const par = f('parentId').value && Store.item(f('parentId').value);
        if (par && par.due && f('due').value && f('due').value > par.due) {
          f('due').classList.add('invalid'); f('due').focus();
          toast(`Due date can't be after the parent ${par.key}'s due date (${fmtDate(par.due)})`, 'error');
          return;
        }
        f('due').classList.remove('invalid');
        const it = Store.createItem({
          spaceId: f('spaceId').value, type: f('type').value, statusId: f('statusId').value, summary,
          description: f('description').value, assignee: f('assignee').value || null, priority: f('priority').value,
          start: f('start').value || null, due: f('due').value || null, parentId: f('parentId').value || null,
          labels: f('labels').value.split(',').map(s => s.trim()).filter(Boolean),
        });
        toast(`${it.key} has been created`);
        if (f('another').checked) {
          f('summary').value = ''; f('description').value = ''; f('labels').value = '';
          f('summary').focus();
        } else api.close();
      };
      el.querySelector('[data-create]').addEventListener('click', submit);
      f('summary').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    },
  });
}

/* ---------------- Work item detail ---------------- */
function openItem(id) {
  const item = Store.item(id);
  if (!item) return;
  let activityTab = 'comments';
  const modal = openModal({
    title: null, body: '<div class="item-view"></div>', width: 1080, cls: 'item-modal',
    onClose() { Store.listeners = Store.listeners.filter(l => l !== rerender); },
  });
  const root = modal.el.querySelector('.item-view');

  function rerender() {
    const it = Store.item(id);
    if (!it) { modal.close(); return; }
    const scrollTop = (root.querySelector('.iv-main') || {}).scrollTop || 0;
    render(it);
    const main = root.querySelector('.iv-main'); if (main) main.scrollTop = scrollTop;
  }
  Store.onChange(rerender);

  function render(it) {
    const sp = Store.space(it.spaceId);
    const st = Store.statusOf(it);
    const parent = it.parentId ? Store.item(it.parentId) : null;
    const children = Store.state.items.filter(c => c.parentId === it.id).sort(byRank);
    const doneKids = children.filter(c => Store.isDone(c)).length;
    const ap = it.approval;

    root.innerHTML = `
      <div class="iv-head">
        <div class="breadcrumbs">
          <a href="#/space/${sp.key}/board" data-close>${spaceAvatar(sp, 16)} ${esc(sp.name)}</a>
          ${Store.ancestors(it).reverse().map(a => `<span>/</span><a data-open="${a.id}">${typeIcon(a.type, 14)} ${esc(a.key)}</a>`).join('')}
          <span>/</span><span class="bc-key">${typeIcon(it.type, 14)} <a class="bc-type" data-act="type">${esc(it.key)}</a></span>
        </div>
        <div class="iv-head-actions">
          <button class="icon-btn" data-act="copy" title="Copy link">${icon('link')}</button>
          <button class="icon-btn" data-act="more" title="More actions">${icon('more')}</button>
          <button class="icon-btn" data-close title="Close">${icon('close')}</button>
        </div>
      </div>
      <div class="iv-cols">
        <div class="iv-main">
          <h1 class="iv-summary" contenteditable="true" spellcheck="false" data-field="summary">${esc(it.summary)}</h1>
          <div class="iv-toolbar">
            <label class="btn">${icon('attach')} Attach<input type="file" multiple hidden data-attach></label>
            <button class="btn" data-act="child">${icon('hierarchy')} Add child work item</button>
          </div>
          ${lfPanelHTML(it)}
          <section class="iv-section">
            <h3>Description</h3>
            <div class="desc-view ${it.description ? '' : 'empty'}" data-act="edit-desc">${it.description ? esc(it.description).replace(/\n/g, '<br>') : 'Add a description...'}</div>
          </section>
          <section class="iv-section">
            <div class="sec-head"><h3>Child work items</h3>${children.length ? `<span class="muted small">${Math.round(doneKids / children.length * 100)}% done</span>` : ''}</div>
            ${children.length ? `<div class="progress"><span style="width:${doneKids / children.length * 100}%"></span></div>
            <div class="child-list">${children.map(c => `
              <div class="child-row" data-open="${c.id}">${typeIcon(c.type)}<span class="key">${esc(c.key)}</span><span class="grow ellip">${esc(c.summary)}</span>${priorityIcon(c.priority)}${itemAvatar(c, 20)}${lozenge(Store.statusOf(c))}</div>`).join('')}</div>` : ''}
            <div class="child-add" hidden><input class="input" placeholder="What needs to be done?" data-child-input><button class="btn primary" data-act="child-save">Create</button><button class="btn subtle" data-act="child-cancel">Cancel</button></div>
          </section>
          ${rulesSectionHTML(it)}
          ${it.attachments.length ? `
          <section class="iv-section">
            <h3>Attachments <span class="count">${it.attachments.length}</span></h3>
            <div class="att-grid">${it.attachments.map(a => attachmentTile(a, it)).join('')}</div>
          </section>` : ''}
          <section class="iv-section">
            <h3>Activity</h3>
            <div class="seg"><button class="${activityTab === 'comments' ? 'on' : ''}" data-tab="comments">Comments</button><button class="${activityTab === 'history' ? 'on' : ''}" data-tab="history">History</button></div>
            ${activityTab === 'comments' ? `
              <div class="comment-new">${avatar(Store.state.me, 32)}<div class="grow"><textarea class="input" rows="2" placeholder="Add a comment..." data-comment></textarea>
              <div class="comment-actions" hidden><button class="btn primary" data-act="comment">Save</button><button class="btn subtle" data-act="comment-cancel">Cancel</button></div>
              <div class="muted small">Pro tip: press <kbd>M</kbd> to comment</div></div></div>
              ${it.comments.slice().reverse().map(c => `
                <div class="comment">${avatar(c.user, 32)}<div class="grow"><div><b>${esc((Store.user(c.user) || {}).name || 'Someone')}</b> <span class="muted small">${timeAgo(c.at)}</span></div>
                <div class="comment-body">${esc(c.text).replace(/\n/g, '<br>')}</div>
                <div class="comment-links"><a class="link small" data-del-comment="${c.id}">Delete</a></div></div></div>`).join('')}
            ` : `
              ${it.history.map(h => `<div class="hist">${avatar(h.user, 24)}<div><b>${esc((Store.user(h.user) || {}).name || '')}</b> ${esc(h.text)} <div class="muted small">${fmtDateTime(h.at)}</div></div></div>`).join('') || '<p class="muted">No history yet.</p>'}
            `}
          </section>
        </div>
        <aside class="iv-side">
          <div class="iv-status-row">
            <button class="btn status-btn cat-${st ? st.cat : 'todo'}" data-act="status" ${ap && ap.state === 'pending' ? 'disabled title="Waiting for approval"' : ''}>${esc(st ? st.name : 'Unknown')} ${icon('chevronDown', 14)}</button>
          </div>
          ${approvalBoxHTML(it)}
          <details class="details-box" open>
            <summary>Details ${icon('chevronDown', 14)}</summary>
            <div class="dl">
              <div class="dt">Assignee</div><div class="dd"><button class="field-btn" data-act="assignee">${avatar(it.assignee, 24)} ${esc((Store.user(it.assignee) || { name: 'Unassigned' }).name)}</button>
                ${it.assignee !== Store.state.me ? '<a class="link small assign-me" data-act="assign-me">Assign to me</a>' : ''}</div>
              <div class="dt">Reporter</div><div class="dd"><button class="field-btn" data-act="reporter">${avatar(it.reporter, 24)} ${esc((Store.user(it.reporter) || { name: 'None' }).name)}</button></div>
              <div class="dt">Priority</div><div class="dd"><button class="field-btn" data-act="priority">${priorityIcon(it.priority)} ${cap(it.priority)}</button></div>
              <div class="dt">Work type</div><div class="dd"><button class="field-btn" data-act="type">${typeIcon(it.type)} ${(WORK_TYPES.find(t => t.id === it.type) || {}).name}</button></div>
              <div class="dt">Labels</div><div class="dd"><button class="field-btn wrap" data-act="labels">${it.labels.length ? it.labels.map(l => `<span class="tag">${esc(l)}</span>`).join('') : '<span class="muted">None</span>'}</button></div>
              <div class="dt">Start date</div><div class="dd"><button class="field-btn" data-act="start">${it.start ? fmtDate(it.start) : '<span class="muted">None</span>'}</button></div>
              <div class="dt">Due date</div><div class="dd"><button class="field-btn ${dueClass(it)}" data-act="due">${it.due ? `${icon('calendar', 14)} ${fmtDate(it.due)}` : '<span class="muted">None</span>'}</button></div>
              <div class="dt">Parent</div><div class="dd"><button class="field-btn" data-act="parent">${parent ? `${typeIcon(parent.type, 14)} ${esc(parent.key)} ${esc(parent.summary)}` : '<span class="muted">None</span>'}</button></div>
              ${sp.approvals.enabled ? `<div class="dt">Approvers</div><div class="dd"><button class="field-btn wrap" data-act="ac-chain" title="Who approves this task, and in what order">${icon('approvals', 14)} ${esc(chainText(Store.approvalChainFor(it)))}${it.approvalChain ? '' : ' <span class="muted small">(space)</span>'}</button></div>` : ''}
            </div>
          </details>
          <div class="iv-meta muted small">
            <div>Created ${fmtDateTime(it.created)}</div>
            <div>Updated ${timeAgo(it.updated)}</div>
            ${it.resolved ? `<div>Resolved ${fmtDateTime(it.resolved)}</div>` : ''}
          </div>
        </aside>
      </div>`;
  }

  root.addEventListener('click', async e => {
    const it = Store.item(id);
    const t = e.target.closest('[data-act],[data-open],[data-tab],[data-del-comment],[data-del-att]');
    if (!t) return;
    if (t.dataset.open) { openItemSwap(t.dataset.open); return; }
    if (t.dataset.tab) { activityTab = t.dataset.tab; render(it); return; }
    if (t.dataset.delComment) { it.comments = it.comments.filter(c => c.id !== t.dataset.delComment); Store.save(); return; }
    if (t.dataset.delAtt) {
      if (await confirmDialog({ title: 'Delete attachment?', message: 'Once you delete, it\'s gone for good.' })) {
        it.attachments = it.attachments.filter(a => a.id !== t.dataset.delAtt); Store.log(it, 'deleted an attachment'); Store.save();
      }
      return;
    }
    const act = t.dataset.act;
    const set = patch => Store.updateItem(id, patch);
    switch (act) {
      case 'status': statusPicker(t, it, v => set({ statusId: v })); break;
      case 'assignee': userPicker(t, it.assignee, v => set({ assignee: v })); break;
      case 'assign-me': set({ assignee: Store.state.me }); break;
      case 'reporter': userPicker(t, it.reporter, v => set({ reporter: v }), { allowUnassigned: false }); break;
      case 'priority': priorityPicker(t, it.priority, v => set({ priority: v })); break;
      case 'type': typePicker(t, it.type, v => {
        if (v !== 'subtask' || it.parentId) { set({ type: v }); return; }
        const below = new Set(Store.descendantIds(it.id));
        const opts = Store.itemsOf(it.spaceId).filter(i => i.id !== it.id && !below.has(i.id) && i.type !== 'subtask');
        if (!opts.length) { toast('A sub-task needs a parent. Create another work item in this space first.', 'error'); return; }
        setTimeout(() => menu(t, [{ heading: 'Sub-task of which work item?' }, ...opts.map(o => ({ value: o.id, label: `${esc(o.key)} ${esc(o.summary)}`, icon: typeIcon(o.type) }))], p => set({ type: 'subtask', parentId: p }), { width: 320 }));
      }); break;
      case 'start': datePicker(t, it.start, v => set({ start: v })); break;
      case 'due': datePicker(t, it.due, v => set({ due: v }), (() => { const l = Store.dueLimits(it); const p = it.parentId && Store.item(it.parentId); return { min: l.min, max: l.max, note: [l.max ? `Parent ${esc(p.key)} is due ${fmtDate(l.max)}` : '', l.min ? `A child work item is due ${fmtDate(l.min)}` : ''].filter(Boolean).join(' · ') }; })()); break;
      case 'labels': {
        popover(t, `<div class="pad"><input class="input" value="${esc(it.labels.join(', '))}" placeholder="label1, label2"><div class="muted small" style="margin-top:6px">Separate with commas, press Enter to save</div></div>`, {
          width: 280, onMount(el) {
            const inp = el.querySelector('input');
            inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { closePopover(); set({ labels: inp.value.split(',').map(s => s.trim()).filter(Boolean) }); } });
          },
        });
        break;
      }
      case 'parent': {
        const below = new Set(Store.descendantIds(it.id)); // can't nest a task under its own child
        const opts = Store.itemsOf(it.spaceId).filter(i => i.id !== it.id && !below.has(i.id));
        menu(t, [...(it.type === 'subtask' ? [] : [{ value: '', label: 'None', selected: !it.parentId }]), ...opts.map(o => ({ value: o.id, label: `${esc(o.key)} ${esc(o.summary)}`, icon: typeIcon(o.type), selected: it.parentId === o.id }))], v => set({ parentId: v || null }), { width: 320 });
        break;
      }
      case 'edit-desc': {
        const box = t;
        box.outerHTML = `<div class="desc-edit"><textarea class="input" rows="7" data-desc>${esc(it.description)}</textarea><div class="row gap8"><button class="btn primary" data-act="desc-save">Save</button><button class="btn subtle" data-act="desc-cancel">Cancel</button></div></div>`;
        const ta = root.querySelector('[data-desc]'); ta.focus();
        break;
      }
      case 'desc-save': set({ description: root.querySelector('[data-desc]').value }); break;
      case 'desc-cancel': render(it); break;
      case 'child': { const box = root.querySelector('.child-add'); box.hidden = false; box.querySelector('input').focus(); break; }
      case 'child-cancel': root.querySelector('.child-add').hidden = true; break;
      case 'child-save': saveChild(); break;
      case 'comment': {
        const ta = root.querySelector('[data-comment]');
        if (!ta.value.trim()) return;
        it.comments.push({ id: uid('c'), user: Store.state.me, at: nowISO(), text: ta.value.trim() });
        it.updated = nowISO(); Store.log(it, 'added a comment'); Store.save();
        break;
      }
      case 'comment-cancel': render(it); break;
      case 'approve': Store.decide(id, 'approved'); toast('Approved'); break;
      case 'decline': Store.decide(id, 'declined'); toast('Declined'); break;
      case 'ac-edit': case 'ac-chain': openApprovalChain(id); break;
      case 'copy': {
        const url = location.href.split('#')[0] + `#/space/${Store.space(it.spaceId).key}/board?selected=${it.key}`;
        navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => toast('Could not copy link', 'error'));
        break;
      }
      case 'more':
        menu(t, [{ value: 'clone', label: 'Clone', icon: icon('docs') }, { value: 'move-top', label: 'Assign to me', icon: icon('foryou') }, '-', { value: 'delete', label: 'Delete', icon: icon('trash'), danger: true }], async v => {
          if (v === 'clone') {
            const c = Store.createItem({ ...JSON.parse(JSON.stringify(it)), id: undefined, key: undefined, summary: 'CLONE - ' + it.summary, comments: [], history: [], created: nowISO(), approval: null });
            toast(`${c.key} created`); openItemSwap(c.id);
          }
          if (v === 'move-top') set({ assignee: Store.state.me });
          if (v === 'delete') {
            const kids = Store.descendantIds(it.id).length;
            if (await confirmDialog({ title: `Delete ${it.key}?`, message: `You're about to permanently delete this work item${kids ? `, its ${kids} child work item(s)` : ''}, its comments and attachments.` })) {
              Store.deleteItem(it.id); toast(`${it.key} deleted`);
            }
          }
        }, { align: 'right' });
        break;
    }
  });

  function saveChild() {
    const inp = root.querySelector('[data-child-input]');
    const v = inp.value.trim();
    if (!v) return;
    const parent = Store.item(id);
    Store.createItem({ spaceId: parent.spaceId, type: 'subtask', summary: v, parentId: parent.id, assignee: parent.assignee });
    const again = root.querySelector('.child-add');
    if (again) { again.hidden = false; again.querySelector('input').focus(); }
  }

  root.addEventListener('keydown', e => {
    if (e.target.matches('[data-field="summary"]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.target.matches('[data-child-input]') && e.key === 'Enter') saveChild();
    if (e.target.matches('[data-comment]') && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) root.querySelector('[data-act="comment"]').click();
  });
  root.addEventListener('focusin', e => {
    if (e.target.matches('[data-comment]')) root.querySelector('.comment-actions').hidden = false;
  });
  root.addEventListener('focusout', e => {
    if (e.target.matches('[data-field="summary"]')) {
      const v = e.target.textContent.trim();
      const it = Store.item(id);
      if (v && v !== it.summary) Store.updateItem(id, { summary: v });
      else e.target.textContent = it.summary;
    }
  });
  root.addEventListener('change', async e => {
    if (e.target.matches('[data-attach]')) {
      await addAttachments(Store.item(id), e.target.files);
    }
  });
  // drop files anywhere on the item view
  root.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); root.classList.add('dropping'); } });
  root.addEventListener('dragleave', e => { if (e.target === root) root.classList.remove('dropping'); });
  root.addEventListener('drop', async e => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); root.classList.remove('dropping');
    await addAttachments(Store.item(id), e.dataTransfer.files);
  });

  lfBindPanel(root, id); // "finish from the task" panel (leadflow.js)
  function openItemSwap(nid) { modal.close(); openItem(nid); }
  render(item);
  return modal;
}

async function addAttachments(item, files) {
  for (const f of files) {
    if (f.size > 2 * 1048576) { toast(`${f.name} is larger than 2 MB and was skipped`, 'error'); continue; }
    const data = await readFile(f);
    item.attachments.push({ id: uid('at'), name: f.name, size: f.size, mime: f.type, data, at: nowISO(), user: Store.state.me });
    Store.log(item, `attached ${f.name}`);
  }
  item.updated = nowISO();
  Store.save();
}

function attachmentTile(a, item) {
  const isImg = (a.mime || '').startsWith('image/');
  return `<div class="att">
    <a class="att-thumb" href="${a.data}" download="${esc(a.name)}" title="Download">${isImg ? `<img src="${a.data}" alt="">` : icon('file', 28)}</a>
    <div class="att-info"><div class="ellip" title="${esc(a.name)}">${esc(a.name)}</div><div class="muted small">${fmtBytes(a.size)} · ${fmtDate(a.at)}${item ? ` · ${esc(item.key)}` : ''}</div></div>
    <button class="icon-btn sm att-del" data-del-att="${a.id}" data-item="${item ? item.id : ''}" title="Delete">${icon('trash', 14)}</button>
  </div>`;
}

/* Rules that involve this work item, shown on its detail view */
function rulesSectionHTML(it) {
  const sp = Store.space(it.spaceId);
  const own = (sp.taskFlows || []).filter(f => f.taskId === it.id).flatMap(f => f.rules.map(r => ({ f, r })));
  const other = (sp.taskFlows || []).filter(f => f.taskId !== it.id).flatMap(f => f.rules.filter(r => (r.cfg.tasks || []).includes(it.id)).map(r => ({ f, r })));
  const href = `#/space/${encodeURIComponent(sp.key)}/workflow/task/${it.id}`;
  const row = (x, text) => `<div class="item-rule">${ruleIcon(x.r.type, 22)}<span class="grow">${text}</span></div>`;
  return `<section class="iv-section">
    <div class="sec-head"><h3>Rules</h3><a class="link small" href="${href}" data-close>${own.length + other.length ? 'Edit task workflow' : 'Add rules'}</a></div>
    ${own.map(x => row(x, `When it moves <b>${esc(flowName(sp, x.f))}</b>: ${esc(ruleSummary(sp, x.r))}`)).join('')}
    ${other.map(x => {
      const src = Store.item(x.f.taskId);
      const T = RULE_TYPES[x.r.type];
      return row(x, T.kind === 'action'
        ? `When <b>${esc(src.key)}</b> moves to ${esc(statusLabel(sp, x.f.to))}: ${esc(ruleSummary(sp, x.r))}`
        : `<b>${esc(src.key)}</b> waits for this before moving to ${esc(statusLabel(sp, x.f.to))}`);
    }).join('')}
    ${own.length + other.length ? '' : '<p class="muted small">No rules yet. Rules can make this task wait for other tasks, check details before it moves, or trigger other tasks when it moves.</p>'}
  </section>`;
}
