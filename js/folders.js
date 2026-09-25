/* Folders: group spaces. state.folders = [{ id, name, collapsed }], space.folderId = folder id or null */

const folderOf = sp => (sp.folderId && Store.state.folders.find(f => f.id === sp.folderId)) || null;
const folderIdOf = sp => (folderOf(sp) ? sp.folderId : null); // a deleted folder counts as none
const spacesIn = folderId => Store.state.spaces.filter(sp => folderIdOf(sp) === (folderId || null));

function createFolder(name) {
  const f = { id: uid('fd'), name, collapsed: false };
  Store.state.folders.push(f);
  return f;
}
function moveSpaceToFolder(sp, folderId) {
  const before = sp.folderId || null;
  sp.folderId = folderId || null;
  if (before === sp.folderId) return;
  const f = folderOf(sp);
  if (f) f.collapsed = false;
  Store.save();
  toast(f ? `${sp.name} moved to ${f.name}` : `${sp.name} removed from its folder`);
}

function openFolderModal({ folder = null, spaceIds = [], onDone } = {}) {
  const chosen = new Set(folder ? spacesIn(folder.id).map(s => s.id) : spaceIds);
  openModal({
    title: folder ? 'Edit folder' : 'Create folder', width: 520,
    body: `<label class="field"><span class="field-label">Folder name <span class="req">*</span></span><input class="input" name="n" autofocus maxlength="60" value="${esc(folder ? folder.name : '')}" placeholder="e.g. Marketing, Clients, Personal"></label>
      <div class="field"><span class="field-label">Spaces in this folder</span>
        <div class="chk-list folder-spaces">${Store.state.spaces.map(sp => { const other = folderOf(sp) && (!folder || sp.folderId !== folder.id) ? folderOf(sp) : null; return `<label class="chk-row"><input type="checkbox" value="${sp.id}" ${chosen.has(sp.id) ? 'checked' : ''}> ${spaceAvatar(sp, 20)} <span class="grow ellip">${esc(sp.name)}</span>${other ? `<span class="muted small">in ${esc(other.name)}</span>` : ''}</label>`; }).join('') || '<p class="muted small">No spaces yet.</p>'}</div>
        <span class="field-help">A space can be in one folder. Picking one that's in another folder moves it here.</span></div>
      ${lfFolderFieldsHTML(folder)}`,
    footer: `${folder ? '<button class="btn danger-text" data-del>Delete folder</button><span class="grow"></span>' : ''}<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>${folder ? 'Save' : 'Create'}</button>`,
    onMount(el, api) {
      const go = () => {
        const inp = el.querySelector('[name=n]');
        const n = inp.value.trim();
        if (!n) { inp.classList.add('invalid'); inp.focus(); return; }
        const f = folder || createFolder(n);
        f.name = n;
        const picked = new Set($$('.folder-spaces input:checked', el).map(x => x.value));
        Store.state.spaces.forEach(sp => {
          if (picked.has(sp.id)) sp.folderId = f.id;
          else if (sp.folderId === f.id) sp.folderId = null;
        });
        f.collapsed = false;
        lfSaveFolderFields(el, f); // reads the fields now, may offer to backfill lead spaces after closing
        Store.save(); api.close();
        toast(folder ? 'Folder saved' : `Folder "${n}" created`);
        if (onDone) onDone(f);
      };
      el.querySelector('[data-ok]').addEventListener('click', go);
      el.querySelector('[name=n]').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      const del = el.querySelector('[data-del]');
      if (del) del.addEventListener('click', async () => { api.close(); deleteFolder(folder); });
    },
  });
}

async function deleteFolder(f) {
  const n = spacesIn(f.id).length;
  if (!(await confirmDialog({ title: `Delete folder "${f.name}"?`, message: n ? `Its ${n} space${n === 1 ? '' : 's'} won't be deleted. They'll just move out of the folder.` : 'The folder is empty.', confirmLabel: 'Delete folder' }))) return;
  Store.state.spaces.forEach(sp => { if (sp.folderId === f.id) sp.folderId = null; });
  Store.state.folders = Store.state.folders.filter(x => x !== f);
  Store.save(); toast('Folder deleted');
}

function folderMenu(anchor, f) {
  menu(anchor, [
    { heading: f.name },
    { value: 'edit', label: f.lead ? 'Edit folder, template & lead spaces' : 'Rename / choose spaces / template', icon: icon('edit') },
    { value: 'new', label: 'Create space in this folder', icon: icon('plus') },
    '-',
    { value: 'delete', label: 'Delete folder', icon: icon('trash'), danger: true },
  ], v => {
    if (v === 'edit') openFolderModal({ folder: f });
    if (v === 'new') openCreateSpace({ folderId: f.id });
    if (v === 'delete') deleteFolder(f);
  }, { width: 260 });
}

/* "Move to folder" list for a space */
function moveToFolderMenu(anchor, sp) {
  const fs = Store.state.folders;
  menu(anchor, [
    { heading: `Move ${sp.name} to` },
    ...fs.map(f => ({ value: f.id, label: esc(f.name), icon: icon('folder'), selected: sp.folderId === f.id })),
    ...(fs.length ? ['-'] : []),
    { value: '__new', label: 'New folder…', icon: icon('plus') },
    ...(sp.folderId ? [{ value: '__none', label: 'Remove from folder', icon: icon('close') }] : []),
  ], v => {
    if (v === '__new') openFolderModal({ spaceIds: [sp.id] });
    else if (v === '__none') moveSpaceToFolder(sp, null);
    else moveSpaceToFolder(sp, v);
  }, { width: 260, force: true });
}

/* Sidebar section */
function folderNavHTML(spRow) {
  const fs = Store.state.folders;
  if (!fs.length) return '';
  return `<div class="nav-heading">Folders</div>${fs.map(f => {
    const sps = spacesIn(f.id);
    return `<div class="nav-item static folder-row" data-folder-drop="${f.id}">
        <button class="nav-link" data-folder-toggle="${f.id}">${icon(f.collapsed ? 'chevronRight' : 'chevronDown', 12)}${icon('folder')}<span class="label">${esc(f.name)}</span></button>
        <span class="fcount muted small">${sps.length}</span>
        <span class="row-actions"><button class="icon-btn xs" data-folder-menu="${f.id}" title="Folder actions">${icon('more', 14)}</button></span></div>
      ${f.collapsed ? '' : `<div class="folder-kids">${sps.map(spRow).join('') || `<div class="folder-empty" data-folder-drop="${f.id}">Drag spaces here</div>`}</div>`}`;
  }).join('')}`;
}

/* Sidebar interactions: toggle, menus, drag a space onto a folder */
window.addEventListener('DOMContentLoaded', () => {
  const sb = $('#sidebar');
  sb.addEventListener('click', e => {
    const tg = e.target.closest('[data-folder-toggle]');
    if (tg) { e.preventDefault(); const f = Store.state.folders.find(x => x.id === tg.dataset.folderToggle); f.collapsed = !f.collapsed; Store.save(); return; }
    const fm = e.target.closest('[data-folder-menu]');
    if (fm) { e.preventDefault(); folderMenu(fm, Store.state.folders.find(x => x.id === fm.dataset.folderMenu)); }
  });
  let dragSpace = null;
  sb.addEventListener('dragstart', e => {
    const row = e.target.closest('[data-space-drag]');
    if (!row) return;
    dragSpace = row.dataset.spaceDrag;
    e.dataTransfer.setData('text/plain', dragSpace);
    e.dataTransfer.effectAllowed = 'move';
    sb.classList.add('dragging-space');
  });
  const endDrag = () => { dragSpace = null; sb.classList.remove('dragging-space'); $$('.drop-over', sb).forEach(x => x.classList.remove('drop-over')); };
  // the sidebar re-renders on drop, so listen on the document: the dragged row may be gone by then
  document.addEventListener('dragend', endDrag);
  sb.addEventListener('dragover', e => {
    const z = dragSpace && e.target.closest('[data-folder-drop]');
    if (!z) return;
    e.preventDefault();
    $$('.drop-over', sb).forEach(x => x !== z && x.classList.remove('drop-over'));
    z.classList.add('drop-over');
  });
  sb.addEventListener('dragleave', e => { const z = e.target.closest('[data-folder-drop]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop-over'); });
  sb.addEventListener('drop', e => {
    const z = dragSpace && e.target.closest('[data-folder-drop]');
    if (!z) return;
    e.preventDefault();
    const sp = Store.space(dragSpace);
    endDrag();
    if (sp) moveSpaceToFolder(sp, z.dataset.folderDrop || null);
  });
});
