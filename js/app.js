/* App shell: top bar, sidebar, space header, tabs, router */

const TABS = [
  { id: 'summary', name: 'Summary', icon: 'globe' },
  { id: 'board', name: 'Board', icon: 'board' },
  { id: 'list', name: 'List', icon: 'list' },
  { id: 'calendar', name: 'Calendar', icon: 'calendar' },
  { id: 'timeline', name: 'Timeline', icon: 'timeline' },
  { id: 'approvals', name: 'Approvals', icon: 'approvals' },
  { id: 'forms', name: 'Forms', icon: 'forms' },
  { id: 'docs', name: 'Docs', icon: 'docs' },
  { id: 'attachments', name: 'Attachments', icon: 'attach' },
  { id: 'reports', name: 'Reports', icon: 'reports' },
];
const MORE_TABS = [
  { id: 'workflow', name: 'Workflow', icon: 'approvals' },
  { id: 'settings', name: 'Space settings', icon: 'gear' },
];

const App = { route: null, fullscreen: false };

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (parts[0] === 'app' && parts[1]) return { kind: 'app', app: parts[1], tab: parts[2] || '', sub: parts[3] ? decodeURIComponent(parts[3]) : undefined, query };
  if (parts[0] === 'space' && parts[1]) return { kind: 'space', key: decodeURIComponent(parts[1]), tab: parts[2] || 'board', sub: parts[3], sub2: parts[4], query };
  return { kind: 'page', page: parts[0] || '', query };
}

function currentSpace() {
  const r = App.route || parseRoute();
  return r.kind === 'space' ? Store.spaceByKey(r.key) : null;
}

/* ---------------- Top bar ---------------- */
function renderTopbar() {
  const me = Store.me();
  const unread = (Store.state.notifications || []).filter(n => !n.read).length;
  return `
  <div class="tb-left">
    <button class="icon-btn" data-top="sidebar" title="${Store.state.ui.sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar">${icon('sidebar')}</button>
    <button class="icon-btn" data-top="switch" title="Switch apps">${icon('appSwitcher')}</button>
    ${(() => { const a = appById(currentAppId()) || appById('taskspace'); return a.id === 'taskspace'
      ? `<a class="brand" href="#/for-you"><span class="brand-mark">${icon('logo', 20)}</span><span>Taskspace</span></a>`
      : `<a class="brand" href="${appHome(a)}">${appIcon(a, 22)}<span>${esc(a.name)}</span></a>`; })()}
  </div>
  <div class="tb-center">
    <div class="tb-search">${icon('search')}<input id="global-search" placeholder="Search" autocomplete="off" data-keep="global-search"></div>
    <button class="btn primary create-btn" data-top="create">${icon('plus')} Create</button>
  </div>
  <div class="tb-right">
    <button class="icon-btn" data-top="notifications" title="Notifications">${icon('bell')}${unread ? `<span class="badge">${unread > 9 ? '9+' : unread}</span>` : ''}</button>
    <button class="icon-btn" data-top="help" title="Help">${icon('help')}</button>
    <button class="icon-btn" data-top="settings" title="Settings">${icon('gear')}</button>
    <button class="avatar-btn" data-top="profile" title="${esc(me.name)}">${avatar(me.id, 24)}</button>
  </div>`;
}

/* ---------------- Sidebar ---------------- */
function renderSidebar() {
  const r = App.route;
  if (r.kind === 'app') return renderAppSidebar(appById(r.app), r);
  const s = Store.state;
  const active = (p) => (r.kind === 'page' && r.page === p) ? 'active' : '';
  const starred = s.spaces.filter(sp => sp.starred);
  const recent = s.recent.map(id => Store.space(id)).filter(sp => sp && !sp.starred).slice(0, 3);
  const cur = currentSpace();
  const spRow = sp => `<a class="nav-item space-row ${cur && cur.id === sp.id ? 'active' : ''}" href="#/space/${encodeURIComponent(sp.key)}/board" draggable="true" data-space-drag="${sp.id}">
      ${spaceAvatar(sp, 20)}<span class="label ellip">${esc(sp.name)}</span>
      <span class="row-actions"><button class="icon-btn xs" data-space-menu="${sp.id}" title="More actions for ${esc(sp.name)}">${icon('more', 14)}</button></span></a>`;
  return `
  <div class="nav-scroll">
    <a class="nav-item ${active('assign-task')}" href="#/assign-task">${icon('people')}<span class="label">Assign Task</span></a>
    <a class="nav-item ${active('for-you')}" href="#/for-you">${icon('foryou')}<span class="label">For you</span></a>
    <button class="nav-item" data-nav="recent">${icon('clock')}<span class="label">Recent</span><span class="trail">${icon('chevronRight')}</span></button>
    <button class="nav-item" data-nav="starred">${icon('star')}<span class="label">Starred</span><span class="trail">${icon('chevronRight')}</span></button>
    <a class="nav-item ${active('apps')}" href="#/apps">${icon('apps')}<span class="label">Apps</span></a>
    <a class="nav-item ${active('plans')}" href="#/plans">${icon('plans')}<span class="label">Plans</span></a>
    <div class="nav-item static ${active('spaces')}" data-folder-drop="" title="Drop a space here to take it out of its folder"><a href="#/spaces" class="nav-link">${icon('spaces')}<span class="label">Spaces</span></a>
      <span class="row-actions show"><button class="icon-btn xs" data-nav="new-space" title="Create space">${icon('plus', 14)}</button><button class="icon-btn xs" data-nav="spaces-menu" title="More actions for spaces">${icon('more', 14)}</button></span></div>
    ${starred.length ? `<div class="nav-heading">Starred</div>${starred.map(spRow).join('')}` : ''}
    ${recent.length ? `<div class="nav-heading">Recent</div>${recent.map(spRow).join('')}` : ''}
    ${folderNavHTML(spRow)}
    <a class="nav-item indent" href="#/spaces">${icon('plans')}<span class="label">More spaces</span><span class="trail">${icon('chevronRight')}</span></a>
    <a class="nav-item ${active('filters')}" href="#/filters">${icon('filter')}<span class="label">Filters</span></a>
    <a class="nav-item ${active('dashboards')}" href="#/dashboards">${icon('dashboard')}<span class="label">Dashboards</span></a>
    <div class="nav-gap"></div>
    <a class="nav-item ${active('teams')}" href="#/teams">${icon('teams')}<span class="label">Teams</span><span class="trail">${icon('external', 14)}</span></a>
    <a class="nav-item ${active('projects')}" href="#/projects">${icon('projects')}<span class="label">Projects</span><span class="trail">${icon('external', 14)}</span></a>
  </div>`;
}

/* ---------------- Space header + tabs ---------------- */
function renderSpaceHeader(sp, tab) {
  const shown = TABS.filter(t => sp.tabs[t.id] !== false);
  const hidden = TABS.filter(t => sp.tabs[t.id] === false);
  const moreCount = hidden.length + MORE_TABS.length;
  const moreActive = hidden.concat(MORE_TABS).some(t => t.id === tab);
  return `
  <div class="space-head">
    <div class="sh-top">
      <div>
        <a class="crumb" href="#/spaces">Spaces</a>${sp.clientId && client(sp.clientId) ? ` <span class="crumb-sep">/</span> <a class="crumb crumb-client" href="#/app/crm/clients/${sp.clientId}" title="Open client in CRM">${icon('building', 12)} ${esc(client(sp.clientId).name)}</a>` : ''}
        <div class="sh-title">
          ${spaceAvatar(sp, 24)}
          <h1 contenteditable="true" spellcheck="false" data-space-name="${sp.id}">${esc(sp.name)}</h1>
          <button class="icon-btn bordered" data-sh="people" title="People">${icon('people')}</button>
          <button class="icon-btn" data-sh="menu" title="More actions">${icon('more')}</button>
        </div>
      </div>
      <div class="sh-actions">
        <button class="icon-btn bordered" data-sh="share" title="Share">${icon('share')}</button>
        <button class="icon-btn bordered" data-sh="automation" title="Automation">${icon('bolt')}</button>
        <button class="icon-btn bordered" data-sh="feedback" title="Give feedback">${icon('feedback')}</button>
        <button class="icon-btn bordered" data-sh="fullscreen" title="${App.fullscreen ? 'Exit' : 'Enter'} full screen">${icon('fullscreen')}</button>
      </div>
    </div>
    <nav class="tabs">
      ${shown.map(t => `<a class="tab ${tab === t.id ? 'active' : ''}" href="#/space/${encodeURIComponent(sp.key)}/${t.id}">${icon(t.icon)}<span>${t.name}</span>
        <button class="icon-btn xs tab-more" data-tab-menu="${t.id}" title="More actions">${icon('more', 12)}</button></a>`).join('')}
      <button class="tab ${moreActive ? 'active' : ''}" data-sh="more-tabs">More <span class="count">${moreCount}</span></button>
      <button class="icon-btn" data-sh="add-tab" title="Add to navigation">${icon('plus')}</button>
    </nav>
  </div>`;
}

/* ---------------- Rendering ---------------- */
function render() {
  App.route = parseRoute();
  const r = App.route;
  const s = Store.state;
  document.documentElement.dataset.theme = s.theme === 'system'
    ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : s.theme;

  // unknown or switched-off apps go to the Apps home
  if (r.kind === 'app' && (!appById(r.app) || r.app === 'taskspace' || !appEnabled(appById(r.app)))) { location.replace('#/apps'); return; }
  // redirect unknown spaces
  if (r.kind === 'space' && !Store.spaceByKey(r.key)) {
    const first = s.spaces[0];
    location.replace(first ? `#/space/${encodeURIComponent(first.key)}/board` : '#/spaces');
    return;
  }
  if (r.kind === 'page' && !r.page) {
    const first = Store.space(s.recent[0]) || s.spaces[0];
    location.replace(first ? `#/space/${encodeURIComponent(first.key)}/board` : '#/for-you');
    return;
  }

  // remember focus so re-rendering while typing doesn't lose the caret
  const ae = document.activeElement;
  const keep = ae && ae.dataset && ae.dataset.keep;
  const sel = keep && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  const scrollers = $$('[data-keep-scroll]').map(el => [el.dataset.keepScroll, el.scrollLeft, el.scrollTop]);

  const app = $('#app');
  app.classList.toggle('sidebar-collapsed', !!s.ui.sidebarCollapsed);
  app.classList.toggle('fullscreen', App.fullscreen);
  app.classList.toggle('settings-mode', r.kind === 'space' && (r.tab === 'workflow' || r.tab === 'settings'));
  $('#topbar').innerHTML = renderTopbar();
  $('#sidebar').innerHTML = renderSidebar();

  const page = $('#page');
  if (r.kind === 'space') {
    const sp = Store.spaceByKey(r.key);
    if (App.lastSpace !== sp.id) { Store.touchRecent(sp.id); App.lastSpace = sp.id; }
    const view = VIEWS[r.tab] || VIEWS.board;
    page.className = `page space-page tab-${r.tab}`;
    const bare = r.tab === 'workflow' || r.tab === 'settings';
    page.innerHTML = (bare ? '' : renderSpaceHeader(sp, r.tab)) + `<div class="view" id="view"></div>`;
    view(sp, $('#view'), r);
  } else if (r.kind === 'app') {
    App.lastSpace = null;
    renderAppView(appById(r.app), r, page);
  } else {
    App.lastSpace = null;
    const view = PAGES[r.page] || PAGES.notfound;
    page.className = `page global-page page-${r.page}`;
    page.innerHTML = '<div class="view" id="view"></div>';
    view($('#view'), r);
  }

  if (keep) {
    const el = document.querySelector(`[data-keep="${keep}"]`);
    if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } }
  }
  scrollers.forEach(([k, l, t]) => { const el = document.querySelector(`[data-keep-scroll="${k}"]`); if (el) { el.scrollLeft = l; el.scrollTop = t; } });
  renderQuickstart();
}

/* ---------------- Events: top bar ---------------- */
function bindShell() {
  $('#topbar').addEventListener('click', e => {
    const b = e.target.closest('[data-top]');
    if (!b) return;
    const s = Store.state;
    switch (b.dataset.top) {
      case 'sidebar': s.ui.sidebarCollapsed = !s.ui.sidebarCollapsed; Store.save(); break;
      case 'create': {
        const app = App.route.kind === 'app' && appById(App.route.app);
        if (app && app.create) app.create(b); else openCreateModal();
        break;
      }
      case 'switch': openAppSwitcher(b); break;
      case 'notifications': openNotifications(b); break;
      case 'help':
        menu(b, [{ heading: 'Keyboard shortcuts' }, { value: 'x', label: 'Create (in the current app)', hint: 'C' }, { value: 'x', label: 'Search', hint: '/' }, { value: 'x', label: 'Toggle sidebar', hint: '[' }, { value: 'x', label: 'Close dialog', hint: 'Esc' }, '-', { value: 'qs', label: 'Open Quickstart', icon: icon('bulb') }], v => {
          if (v === 'qs') { s.ui.quickstartHidden = false; s.ui.quickstartOpen = true; Store.save(); }
        }, { align: 'right', width: 260 });
        break;
      case 'settings': openSettingsMenu(b); break;
      case 'profile':
        menu(b, [{ heading: Store.me().name }, { value: 'profile', label: 'Profile', icon: avatar(s.me, 20) }, { value: 'theme', label: 'Theme: ' + cap(s.theme), icon: icon(s.theme === 'light' ? 'sun' : 'moon') }, { value: 'teams', label: 'People', icon: icon('people') }], v => {
          if (v === 'profile') openProfile();
          if (v === 'theme') { s.theme = s.theme === 'dark' ? 'light' : 'dark'; Store.save(); }
          if (v === 'teams') location.hash = '#/teams';
        }, { align: 'right', width: 240 });
        break;
    }
  });

  // global search with typeahead
  $('#topbar').addEventListener('input', e => {
    if (e.target.id !== 'global-search') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) { closePopover(); return; }
    const hits = Store.state.items.filter(i => (i.summary + ' ' + i.key + ' ' + i.description).toLowerCase().includes(q)).slice(0, 8);
    const spaces = Store.state.spaces.filter(sp => sp.name.toLowerCase().includes(q)).slice(0, 3);
    const recs = erpSearch(q).slice(0, 6);
    const html = `<div class="menu search-results">
      ${hits.length ? '<div class="menu-heading">Work items</div>' + hits.map(i => `<button class="menu-item" data-value="item:${i.id}">${typeIcon(i.type)}<span class="mi-label"><span class="ellip">${esc(i.summary)}</span><span class="small muted">${esc(i.key)} · ${esc(Store.space(i.spaceId).name)}</span></span>${lozenge(Store.statusOf(i))}</button>`).join('') : ''}
      ${spaces.length ? '<div class="menu-heading">Spaces</div>' + spaces.map(sp => `<button class="menu-item" data-value="space:${sp.key}">${spaceAvatar(sp, 20)}<span class="mi-label">${esc(sp.name)}</span></button>`).join('') : ''}
      ${recs.length ? '<div class="menu-heading">Apps</div>' + recs.map(x => `<button class="menu-item" data-value="rec:${x.type}:${x.id}">${icon(x.icon)}<span class="mi-label"><span class="ellip">${esc(x.label)}</span><span class="small muted">${esc(x.sub)} · ${esc(appById(x.app).name)}</span></span></button>`).join('') : ''}
      ${!hits.length && !spaces.length && !recs.length ? '<div class="empty-mini">No matches</div>' : ''}
      <div class="menu-sep"></div><button class="menu-item" data-value="all">${icon('search')}<span class="mi-label">View all results</span><span class="mi-hint">Enter</span></button></div>`;
    popover(e.target.parentElement, html, {
      force: true, width: 440,
      onSelect(v) {
        const inp = $('#global-search');
        if (v.startsWith('item:')) openItem(v.slice(5));
        else if (v.startsWith('rec:')) { const [, type, id] = v.split(':'); openRecord(type, id); }
        else if (v.startsWith('space:')) location.hash = `#/space/${encodeURIComponent(v.slice(6))}/board`;
        else location.hash = '#/filters?q=' + encodeURIComponent(inp.value);
        inp.value = ''; inp.blur();
      },
    });
    e.target.focus();
  });
  $('#topbar').addEventListener('keydown', e => {
    if (e.target.id === 'global-search' && e.key === 'Enter') {
      closePopover();
      location.hash = '#/filters?q=' + encodeURIComponent(e.target.value);
      e.target.value = ''; e.target.blur();
    }
  });

  /* sidebar */
  $('#sidebar').addEventListener('click', e => {
    const sm = e.target.closest('[data-space-menu]');
    if (sm) { e.preventDefault(); e.stopPropagation(); spaceMenu(sm, Store.space(sm.dataset.spaceMenu)); return; }
    const b = e.target.closest('[data-nav]');
    if (!b) return;
    const s = Store.state;
    switch (b.dataset.nav) {
      case 'recent': {
        const sps = s.recent.map(id => Store.space(id)).filter(Boolean);
        const its = s.items.slice().sort((a, c) => c.updated.localeCompare(a.updated)).slice(0, 5);
        popover(b, menuHTML([{ heading: 'Recent spaces' }, ...sps.map(sp => ({ value: 'sp:' + sp.key, label: esc(sp.name), icon: spaceAvatar(sp, 20) })),
          ...(its.length ? [{ heading: 'Recent work items' }, ...its.map(i => ({ value: 'it:' + i.id, label: `${esc(i.summary)} <span class="muted small">${esc(i.key)}</span>`, icon: typeIcon(i.type) }))] : [])]),
        { cls: 'flyout', width: 300, onSelect: navPick });
        flyoutRight(b);
        break;
      }
      case 'starred': {
        const sps = s.spaces.filter(sp => sp.starred);
        popover(b, menuHTML(sps.length ? [{ heading: 'Starred spaces' }, ...sps.map(sp => ({ value: 'sp:' + sp.key, label: esc(sp.name), icon: spaceAvatar(sp, 20) }))] : [{ heading: 'Nothing starred yet' }, { value: 'x', label: '<span class="muted">Star a space from its ••• menu</span>', disabled: true }]),
          { cls: 'flyout', width: 300, onSelect: navPick });
        flyoutRight(b);
        break;
      }
      case 'new-space': openCreateSpace(); break;
      case 'spaces-menu':
        menu(b, [{ value: 'new', label: 'Create space', icon: icon('plus') }, { value: 'folder', label: 'Create folder', icon: icon('folder') }, { value: 'all', label: 'View all spaces', icon: icon('spaces') }], v => {
          if (v === 'new') openCreateSpace();
          if (v === 'folder') openFolderModal();
          if (v === 'all') location.hash = '#/spaces';
        });
        break;
    }
  });
  function navPick(v) {
    if (v.startsWith('sp:')) location.hash = `#/space/${encodeURIComponent(v.slice(3))}/board`;
    if (v.startsWith('it:')) openItem(v.slice(3));
  }
  function flyoutRight(anchor) {
    if (!openPop) return;
    const r = anchor.getBoundingClientRect();
    openPop.el.style.left = (r.right + 6) + 'px';
    openPop.el.style.top = r.top + 'px';
  }

  /* space header */
  $('#page').addEventListener('click', e => {
    const tm = e.target.closest('[data-tab-menu]');
    if (tm) {
      e.preventDefault(); e.stopPropagation();
      const sp = currentSpace();
      menu(tm, [{ value: 'hide', label: 'Hide from navigation', icon: icon('eye') }, { value: 'open', label: 'Open in new tab', icon: icon('external') }], v => {
        if (v === 'hide') {
          if (TABS.filter(t => sp.tabs[t.id] !== false).length <= 1) { toast('Keep at least one view', 'error'); return; }
          sp.tabs[tm.dataset.tabMenu] = false; Store.save();
        }
        if (v === 'open') window.open(location.href.split('#')[0] + `#/space/${encodeURIComponent(sp.key)}/${tm.dataset.tabMenu}`, '_blank');
      });
      return;
    }
    const b = e.target.closest('[data-sh]');
    if (!b) return;
    const sp = currentSpace();
    switch (b.dataset.sh) {
      case 'menu': spaceMenu(b, sp); break;
      case 'people': location.hash = '#/teams'; break;
      case 'share': {
        const url = location.href;
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copied to clipboard'), () => toast('Could not copy link', 'error'));
        break;
      }
      case 'automation': openAutomation(b, sp); break;
      case 'feedback': openFeedback(); break;
      case 'fullscreen': App.fullscreen = !App.fullscreen; render(); break;
      case 'more-tabs': {
        const hidden = TABS.filter(t => sp.tabs[t.id] === false);
        menu(b, [...hidden.map(t => ({ value: t.id, label: t.name, icon: icon(t.icon) })), ...(hidden.length ? ['-'] : []), ...MORE_TABS.map(t => ({ value: t.id, label: t.name, icon: icon(t.icon) }))],
          v => { location.hash = `#/space/${encodeURIComponent(sp.key)}/${v}`; });
        break;
      }
      case 'add-tab': {
        const hidden = TABS.filter(t => sp.tabs[t.id] === false);
        menu(b, hidden.length ? [{ heading: 'Add to navigation' }, ...hidden.map(t => ({ value: t.id, label: t.name, icon: icon(t.icon) }))]
          : [{ heading: 'Add to navigation' }, { value: '', label: '<span class="muted">All views are already in your navigation</span>', disabled: true }], v => {
          if (!v) return;
          sp.tabs[v] = true; Store.save(); location.hash = `#/space/${encodeURIComponent(sp.key)}/${v}`;
        }, { width: 260 });
        break;
      }
    }
  });
  // inline space rename
  $('#page').addEventListener('keydown', e => {
    if (e.target.matches('[data-space-name]') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });
  $('#page').addEventListener('focusout', e => {
    if (!e.target.matches('[data-space-name]')) return;
    const sp = Store.space(e.target.dataset.spaceName);
    const v = e.target.textContent.trim();
    if (v && v !== sp.name) { sp.name = v; Store.save(); toast('Space renamed'); } else e.target.textContent = sp.name;
  });

  /* global shortcuts */
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select, [contenteditable="true"]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (modalStack.length) return;
    if (e.key === 'c') { e.preventDefault(); const app = App.route.kind === 'app' && appById(App.route.app); if (app && app.create) app.create($('[data-top="create"]')); else openCreateModal(); }
    if (e.key === '/') { e.preventDefault(); $('#global-search').focus(); }
    if (e.key === '[') { Store.state.ui.sidebarCollapsed = !Store.state.ui.sidebarCollapsed; Store.save(); }
  });

  /* Quickstart */
  $('#quickstart').addEventListener('click', e => {
    const s = Store.state;
    const b = e.target.closest('[data-qs]');
    if (!b) return;
    if (b.dataset.qs === 'toggle') s.ui.quickstartOpen = !s.ui.quickstartOpen;
    if (b.dataset.qs === 'hide') { s.ui.quickstartHidden = true; s.ui.quickstartOpen = false; }
    if (b.dataset.qs === 'go') {
      const sp = currentSpace() || Store.space(s.recent[0]) || s.spaces[0];
      const step = b.dataset.step;
      if (step === 'create') openCreateModal();
      else if (sp) location.hash = `#/space/${encodeURIComponent(sp.key)}/${step}`;
    }
    Store.save();
  });
}

function spaceMenu(anchor, sp) {
  menu(anchor, [
    { value: 'star', label: sp.starred ? 'Remove from starred' : 'Add to starred', icon: icon(sp.starred ? 'starFill' : 'star') },
    { value: 'settings', label: 'Space settings', icon: icon('gear') },
    { value: 'workflow', label: 'Workflow, tasks & rules', icon: icon('approvals') },
    { value: 'save-tasks', label: 'Save as template', icon: icon('docs') },
    { value: 'folder', label: folderOf(sp) ? `Folder: ${esc(folderOf(sp).name)}` : 'Move to folder', icon: icon('folder') },
    '-',
    { value: 'delete', label: 'Delete space', icon: icon('trash'), danger: true },
  ], async v => {
    if (v === 'star') { sp.starred = !sp.starred; Store.save(); }
    if (v === 'settings') location.hash = `#/space/${encodeURIComponent(sp.key)}/settings`;
    if (v === 'workflow') location.hash = `#/space/${encodeURIComponent(sp.key)}/workflow`;
    if (v === 'save-tasks') openSaveTaskTemplate(sp);
    if (v === 'folder') { moveToFolderMenu(anchor, sp); return true; }
    if (v === 'delete') {
      const n = Store.itemsOf(sp.id).length;
      if (await confirmDialog({ title: `Delete ${sp.name}?`, message: `This permanently deletes the space and its ${n} work item${n === 1 ? '' : 's'}.` })) {
        Store.deleteSpace(sp.id); toast('Space deleted'); location.hash = '#/spaces';
      }
    }
  });
}

const SPACE_COLORS = ['#F87168', '#FCA700', '#4BCE97', '#669DF1', '#C97CF4', '#E774BB', '#42B2D7', '#94C748', '#8C8F97'];
const SPACE_GLYPHS = ['calendar', 'chart', 'mountain', 'rocket', 'bulb', 'star'];

function openCreateSpace(preset = {}) {
  let color = SPACE_COLORS[Math.floor(Math.random() * SPACE_COLORS.length)], glyph = 'calendar';
  const avatars = () => SPACE_GLYPHS.map(g => `<button class="av-pick ${g === glyph ? 'on' : ''}" data-glyph="${g}">${spaceAvatar({ color, glyph: g }, 32)}</button>`).join('');
  openModal({
    title: 'Create space', width: 520,
    body: `<p class="muted small">Required fields are marked with an asterisk <span class="req">*</span></p>
      <label class="field"><span class="field-label">Name <span class="req">*</span></span><input class="input" name="name" autofocus placeholder="Try a team name, project goal, milestone..."></label>
      <label class="field"><span class="field-label">Key <span class="req">*</span></span><input class="input narrow" name="key" maxlength="10" placeholder="e.g. MKT"><span class="field-help">Used as the prefix of your work item keys, like KEY-1</span></label>
      <label class="field"><span class="field-label">Folder</span><select class="input" name="folder"><option value="">No folder</option>${Store.state.folders.map(f => `<option value="${f.id}" ${f.id === preset.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}<option value="__new">+ New folder…</option></select></label>
      <label class="field" data-new-folder hidden><span class="field-label">New folder name</span><input class="input" name="folderName" placeholder="e.g. Clients"></label>
      <label class="field"><span class="field-label">Start from a template</span><select class="input" name="ttpl"><option value="">Blank (To Do → In Progress → Done, no tasks)</option>${Store.state.taskTemplates.map(t => `<option value="${t.id}">${esc(t.name)} (${templateMeta(t)})</option>`).join('')}</select>
        <span class="field-help">${Store.state.taskTemplates.length ? 'Stages, tasks, people and rules come from the template.' : 'Save a workflow as a template (Workflow › Templates) to start new spaces from it.'}</span></label>
      <label class="field" data-ttpl-date hidden><span class="field-label">Start date</span><input class="input narrow" type="date" name="tstart" value="${todayStr()}"><span class="field-help">Task dates are placed relative to this day.</span></label>
      <div class="field"><span class="field-label">Icon</span><div class="av-row">${avatars()}</div><div class="color-row">${SPACE_COLORS.map(c => `<button class="swatch ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Create</button>',
    onMount(el, api) {
      const name = el.querySelector('[name=name]'), key = el.querySelector('[name=key]');
      let keyTouched = false;
      name.addEventListener('input', () => {
        if (keyTouched) return;
        const words = name.value.trim().split(/\s+/).filter(Boolean);
        key.value = (words.length > 1 ? words.map(w => w[0]).join('') : (words[0] || '').slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      });
      key.addEventListener('input', () => { keyTouched = true; key.value = key.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
      const ttplSel = el.querySelector('[name=ttpl]');
      const syncDate = () => {
        const t = Store.state.taskTemplates.find(x => x.id === ttplSel.value);
        el.querySelector('[data-ttpl-date]').hidden = !(t && t.tasks.some(x => x.startOff != null || x.dueOff != null));
      };
      // a folder with a task template: spaces created in it start from that template
      const useFolderTemplate = () => {
        const t = lfFolderTemplate(Store.state.folders.find(f => f.id === el.querySelector('[name=folder]').value), null);
        if (t) { ttplSel.value = t.id; syncDate(); }
      };
      el.querySelector('[name=folder]').addEventListener('change', e => {
        el.querySelector('[data-new-folder]').hidden = e.target.value !== '__new';
        if (e.target.value === '__new') el.querySelector('[name=folderName]').focus();
        useFolderTemplate();
      });
      ttplSel.addEventListener('change', syncDate);
      useFolderTemplate();
      el.addEventListener('click', e => {
        const g = e.target.closest('[data-glyph]'), c = e.target.closest('[data-color]');
        if (g) glyph = g.dataset.glyph;
        if (c) { color = c.dataset.color; $$('.swatch', el).forEach(s => s.classList.toggle('on', s.dataset.color === color)); }
        if (g || c) el.querySelector('.av-row').innerHTML = avatars();
      });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const n = name.value.trim(), k = key.value.trim();
        if (!n) { name.classList.add('invalid'); name.focus(); return; }
        if (!k || Store.spaceByKey(k)) { key.classList.add('invalid'); toast(k ? 'That key is already in use' : 'Enter a key', 'error'); key.focus(); return; }
        let folderId = el.querySelector('[name=folder]').value || null;
        if (folderId === '__new') {
          const fn = el.querySelector('[name=folderName]').value.trim();
          if (!fn) { el.querySelector('[name=folderName]').classList.add('invalid'); el.querySelector('[name=folderName]').focus(); return; }
          folderId = createFolder(fn).id;
        }
        const sp = Store.createSpace({ name: n, key: k, color, glyph });
        sp.folderId = folderId;
        const ttpl = Store.state.taskTemplates.find(t => t.id === el.querySelector('[name=ttpl]').value);
        if (ttpl) { applyTaskTemplate(sp, ttpl, { startDate: el.querySelector('[name=tstart]').value || todayStr() }); toast(ttpl.tasks.length ? `${ttpl.tasks.length} tasks added from "${ttpl.name}"` : `Stages from "${ttpl.name}" applied`); }
        api.close();
        location.hash = `#/space/${encodeURIComponent(sp.key)}/board`;
      });
    },
  });
}

function openSettingsMenu(anchor) {
  const s = Store.state;
  menu(anchor, [
    { heading: 'Personal settings' },
    { value: 'theme-dark', label: 'Dark theme', icon: icon('moon'), selected: s.theme === 'dark' },
    { value: 'theme-light', label: 'Light theme', icon: icon('sun'), selected: s.theme === 'light' },
    { value: 'theme-system', label: 'Match system', icon: icon('sliders'), selected: s.theme === 'system' },
    '-', { heading: 'Apps' },
    { value: 'manage-apps', label: 'Manage apps', icon: icon('apps') },
    { value: 'company', label: 'Company details', icon: icon('building') },
    '-', { heading: 'Templates' },
    { value: 'task-templates', label: 'Task templates', icon: icon('docs'), hint: String(s.taskTemplates.length || '') },
    '-', { heading: 'Your data' },
    { value: 'export', label: 'Export data (JSON)', icon: icon('download') },
    { value: 'import', label: 'Import data', icon: icon('upload') },
    { value: 'reset', label: 'Reset everything', icon: icon('trash'), danger: true },
  ], async v => {
    if (v.startsWith('theme-')) { s.theme = v.slice(6); Store.save(); }
    if (v === 'task-templates') openTaskTemplates();
    if (v === 'manage-apps') openManageApps();
    if (v === 'company') location.hash = '#/app/sales/settings/company';
    if (v === 'export') {
      const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `taskspace-backup-${todayStr()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    if (v === 'import') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = async () => {
        try {
          const data = JSON.parse(await inp.files[0].text());
          if (!data.spaces || !data.items) throw new Error('bad');
          if (await confirmDialog({ title: 'Replace your data?', message: 'Importing replaces everything currently stored in this browser.', confirmLabel: 'Import' })) {
            data.ui = Object.assign({}, data.ui || {}); delete data.goals; data.folders = data.folders || []; data.notifications = data.notifications || []; data.wfTemplates = data.wfTemplates || []; data.taskTemplates = data.taskTemplates || []; data.activity = data.activity || [];
            localStorage.setItem(STORE_KEY, JSON.stringify(data)); Store.load(); Store.save(); toast('Data imported');
          }
        } catch (e) { toast('That file is not a valid backup', 'error'); }
      };
      inp.click();
    }
    if (v === 'reset') {
      if (await confirmDialog({ title: 'Reset everything?', message: 'All spaces, work items, docs and attachments stored in this browser will be deleted.', confirmLabel: 'Reset' })) {
        Store.reset(); location.hash = '#/'; toast('Workspace reset');
      }
    }
  }, { align: 'right', width: 260 });
}

function openProfile() {
  const me = Store.me();
  openModal({
    title: 'Profile', width: 460,
    body: `<div class="row gap12" style="margin-bottom:16px">${avatar(me.id, 56)}<div><b>${esc(me.name)}</b><div class="muted small">This is how you appear on work items</div></div></div>
      <label class="field"><span class="field-label">Full name</span><input class="input" name="name" value="${esc(me.name)}" autofocus></label>
      <label class="field"><span class="field-label">Initials</span><input class="input narrow" name="initials" maxlength="3" value="${esc(me.initials)}"></label>
      <div class="field"><span class="field-label">Avatar color</span><div class="color-row">${SPACE_COLORS.map(c => `<button class="swatch ${c === me.color ? 'on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>',
    onMount(el, api) {
      let color = me.color;
      el.addEventListener('click', e => { const c = e.target.closest('[data-color]'); if (c) { color = c.dataset.color; $$('.swatch', el).forEach(s => s.classList.toggle('on', s === c)); } });
      el.querySelector('[data-ok]').addEventListener('click', () => {
        me.name = el.querySelector('[name=name]').value.trim() || me.name;
        me.initials = (el.querySelector('[name=initials]').value.trim() || me.initials).toUpperCase();
        me.color = color; Store.save(); api.close();
      });
    },
  });
}

function openFeedback() {
  openModal({
    title: 'Give feedback', width: 520,
    body: `<p class="muted">This is your personal workspace, so feedback is saved as a note in your own "Feedback" list inside the current space's Docs.</p>
      <label class="field"><span class="field-label">What would you like to change?</span><textarea class="input" rows="5" autofocus></textarea></label>`,
    footer: '<button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-ok>Save</button>',
    onMount(el, api) {
      el.querySelector('[data-ok]').addEventListener('click', () => {
        const t = el.querySelector('textarea').value.trim();
        const sp = currentSpace();
        if (t && sp) {
          let doc = sp.docs.find(d => d.title === 'Feedback');
          if (!doc) { doc = { id: uid('doc'), title: 'Feedback', body: '', updated: nowISO(), created: nowISO() }; sp.docs.push(doc); }
          doc.body = `${doc.body ? doc.body + '<br>' : ''}<p><b>${fmtDate(nowISO())}:</b> ${esc(t)}</p>`;
          doc.updated = nowISO(); Store.save(); toast('Saved to Docs › Feedback');
        }
        api.close();
      });
    },
  });
}

function openAutomation(anchor, sp) {
  sp.rules = sp.rules || { assignOnProgress: false, closeKidsOnDone: false };
  const r = sp.rules;
  popover(anchor, `<div class="automation"><div class="auto-head">${icon('bolt')} <b>Automation</b></div>
    <p class="muted small">Simple rules that run whenever work moves in this space.</p>
    <label class="toggle-row"><input type="checkbox" data-rule="assignOnProgress" ${r.assignOnProgress ? 'checked' : ''}><span class="toggle"></span><span>When work moves to an <b>In progress</b> status, assign it to me</span></label>
    <label class="toggle-row"><input type="checkbox" data-rule="closeKidsOnDone" ${r.closeKidsOnDone ? 'checked' : ''}><span class="toggle"></span><span>When a parent moves to <b>Done</b>, move its child work items to Done too</span></label>
    </div>`, {
    align: 'right', width: 340,
    onMount(el) { el.addEventListener('change', e => { const k = e.target.dataset.rule; if (k) { r[k] = e.target.checked; Store.save(true); toast(e.target.checked ? 'Rule enabled' : 'Rule disabled'); } }); },
  });
}

/* hook automation rules into status changes */
(function wrapStatus() {
  const orig = Store.afterStatusChange.bind(Store);
  Store.afterStatusChange = function (item, prev) {
    orig(item, prev);
    const sp = Store.space(item.spaceId);
    const st = sp && Store.status(sp, item.statusId);
    if (!sp || !sp.rules || !st || !prev) return;
    if (sp.rules.assignOnProgress && st.cat === 'progress' && !item.assignee) item.assignee = Store.state.me;
    if (sp.rules.closeKidsOnDone && st.cat === 'done') {
      Store.state.items.filter(c => c.parentId === item.id && !Store.isDone(c)).forEach(c => {
        const prevKid = c.statusId; c.statusId = item.statusId; c.updated = nowISO(); Store.afterStatusChange(c, prevKid);
      });
    }
  };
})();

/* ---------------- Quickstart ---------------- */
function renderQuickstart() {
  const s = Store.state;
  const el = $('#quickstart');
  if (s.ui.quickstartHidden) { el.innerHTML = ''; return; }
  const anyApproval = s.spaces.some(sp => sp.approvals.enabled);
  const steps = [
    { id: 'create', label: 'Create your first work item', done: s.items.some(i => !i.key.startsWith('TTI-')) },
    { id: 'board', label: 'Move work across the board', done: s.activity.some(a => a.text.startsWith('changed Status')) },
    { id: 'calendar', label: 'Schedule work on the calendar', done: s.items.some(i => i.due && !i.key.startsWith('TTI-')) },
    { id: 'approvals', label: 'Set up approvals', done: anyApproval },
    { id: 'docs', label: 'Write your first doc', done: s.spaces.some(sp => sp.docs.length) },
  ];
  const n = steps.filter(x => x.done).length;
  el.innerHTML = `
    ${s.ui.quickstartOpen ? `<div class="qs-panel"><div class="qs-head"><h3>Get started</h3><button class="icon-btn sm" data-qs="toggle" title="Minimize">${icon('chevronDown')}</button></div>
      <div class="progress"><span style="width:${n / steps.length * 100}%"></span></div><div class="muted small" style="margin:6px 0 10px">${n} of ${steps.length} complete</div>
      ${steps.map(x => `<button class="qs-step ${x.done ? 'done' : ''}" data-qs="go" data-step="${x.id}"><span class="qs-check">${x.done ? icon('check', 12) : ''}</span>${x.label}${icon('chevronRight', 14)}</button>`).join('')}</div>` : ''}
    <div class="qs-pill"><button class="qs-main" data-qs="toggle">${icon('bulb')} Quickstart</button><button class="qs-x" data-qs="hide" title="Dismiss">${icon('close', 14)}</button></div>`;
}

/* ---------------- Boot ---------------- */
window.addEventListener('DOMContentLoaded', () => {
  Store.load();
  bindShell();
  bindAppShell();
  Store.onChange(render);
  window.addEventListener('hashchange', () => { closePopover(); render(); });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (Store.state.theme === 'system') render(); });
  render();
  // overdue reminder (Space settings › Notifications)
  const t = todayStr();
  const overdue = Store.state.items.filter(i => {
    const sp = Store.space(i.spaceId);
    return sp && (!sp.notify || sp.notify.overdue !== false) && i.due && i.due < t && !Store.isDone(i);
  }).length;
  if (overdue) setTimeout(() => toast(`You have ${overdue} overdue work item${overdue === 1 ? '' : 's'}`, 'error'), 600);
  const meets = appEnabled(appById('meet')) && erpSet('meet').remindToday !== false ? erp().meetings.filter(m => m.date === t && m.status === 'scheduled' && m.attendees.includes(Store.state.me)) : [];
  if (meets.length) setTimeout(() => toast(`${meets.length} meeting${meets.length === 1 ? '' : 's'} today — first at ${fmtTime(meets.map(m => m.time || '00:00').sort()[0])}`), 1400);
});

/* ---------------- Notifications panel ---------------- */
function openNotifications(anchor) {
  const s = Store.state;
  s.ui.notifTab = s.ui.notifTab || 'notif';
  s.ui.notifMine = !!s.ui.notifMine;
  const html = () => {
    const tab = s.ui.notifTab;
    const list = (s.notifications || []).filter(n => !s.ui.notifMine || n.to === s.me).slice(0, 40);
    const acts = s.activity.slice(0, 30);
    const row = (who, top, it, at, unread, extra = '') => `<div class="notif-row ${unread ? 'unread' : ''}" ${it ? `data-value="${it.id}"` : ''}>${avatar(who, 28)}<div class="grow">${extra}<div>${top}</div>
      ${it ? `<div class="small muted">${typeIcon(it.type, 14)} ${esc(it.key)} ${esc(it.summary)} ${lozenge(Store.statusOf(it))}</div>` : ''}<div class="small muted">${timeAgo(at)}</div></div></div>`;
    return `<div class="notif">
      <div class="notif-head"><h3>Notifications</h3>${tab === 'notif' ? `<button class="btn subtle sm" data-nt="read">Mark all as read</button>` : ''}</div>
      <div class="notif-tabs"><button class="${tab === 'notif' ? 'on' : ''}" data-nt="tab-notif">For people ${list.filter(n => !n.read).length ? `<span class="count">${list.filter(n => !n.read).length}</span>` : ''}</button><button class="${tab === 'act' ? 'on' : ''}" data-nt="tab-act">Activity</button>
        ${tab === 'notif' ? `<label class="check small notif-mine"><input type="checkbox" data-nt-mine ${s.ui.notifMine ? 'checked' : ''}> Only mine</label>` : ''}</div>
      ${tab === 'notif'
        ? (list.length ? list.map(n => { const it = n.itemId && Store.item(n.itemId); const u = Store.user(n.to) || { name: 'Someone' };
            return row(n.to, esc(n.text), it, n.at, !n.read, `<div class="small notif-to">To <b>${esc(u.name)}</b>${n.to === s.me ? ' (you)' : ''}</div>`); }).join('')
          : '<div class="empty-mini">No notifications yet. People get one when a child work item assigned to them is marked as done.</div>')
        : (acts.length ? acts.map(a => { const it = a.itemId && Store.item(a.itemId); return row(a.user, `<b>${esc((Store.user(a.user) || {}).name || '')}</b> ${esc(a.text)}`, it, a.at, false); }).join('') : '<div class="empty-mini">No activity yet</div>')}
    </div>`;
  };
  const el = popover(anchor, html(), {
    align: 'right', width: 420,
    onSelect: v => { openItem(v); },
    onClose() { (s.notifications || []).forEach(n => { if (!s.ui.notifMine || n.to === s.me) n.read = true; }); Store.save(); },
  });
  if (!el) return;
  const redraw = () => { el.innerHTML = html(); };
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-nt]');
    if (!b) return;
    e.stopPropagation();
    if (b.dataset.nt === 'tab-notif') s.ui.notifTab = 'notif';
    if (b.dataset.nt === 'tab-act') s.ui.notifTab = 'act';
    if (b.dataset.nt === 'read') { (s.notifications || []).forEach(n => { n.read = true; }); Store.save(true); $('[data-top="notifications"] .badge') && $('[data-top="notifications"] .badge').remove(); }
    redraw();
  });
  el.addEventListener('change', e => { if (e.target.matches('[data-nt-mine]')) { s.ui.notifMine = e.target.checked; redraw(); } });
}
