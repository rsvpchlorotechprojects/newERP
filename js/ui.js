/* Shared UI helpers: escaping, avatars, lozenges, popovers, modals, toasts */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function fmtDate(s) {
  if (!s) return '';
  const d = s.length > 10 ? new Date(s) : parseYmd(s);
  const y = d.getFullYear() === new Date().getFullYear() ? '' : `, ${d.getFullYear()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${y}`;
}
function fmtDateTime(iso) {
  const d = new Date(iso);
  return `${fmtDate(iso)}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} minute${s < 120 ? '' : 's'} ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${s < 7200 ? '' : 's'} ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} day${s < 172800 ? '' : 's'} ago`;
  return fmtDate(iso);
}
function dueClass(item) {
  if (!item.due || Store.isDone(item)) return '';
  const t = todayStr();
  if (item.due < t) return 'overdue';
  if (item.due <= addDays(t, 2)) return 'soon';
  return '';
}

function avatar(userId, size = 24, extraCls = '') {
  const u = Store.user(userId);
  if (!u) {
    return `<span class="avatar unassigned ${extraCls}" style="width:${size}px;height:${size}px" title="Unassigned">${icon('foryou', Math.round(size * 0.7))}</span>`;
  }
  return `<span class="avatar ${extraCls}" style="width:${size}px;height:${size}px;background:${u.color};font-size:${Math.max(9, Math.round(size * 0.4))}px" title="${esc(u.name)}">${esc(u.initials)}</span>`;
}

/* Who gave a task to whom, for tooltips: "Assigned by Priya to you" */
const whoName = (id, you = true) => (id && id === Store.state.me && you ? 'you' : (Store.user(id) || { name: '' }).name);
function assignedText(item) {
  const rep = Store.user(item.reporter) ? whoName(item.reporter) : '';
  const to = item.assignee && Store.user(item.assignee) ? whoName(item.assignee) : '';
  if (!to) return rep ? `Unassigned · reported by ${rep}` : 'Unassigned';
  if (!rep) return `Assigned to ${to}`;
  return item.reporter === item.assignee ? `${cap(whoName(item.assignee))} (self-assigned)` : `Assigned by ${rep} to ${to}`;
}
/* The faces on a task card/row: reporter (who assigned it) → assignee. Just one face when self-assigned. */
function itemAvatar(item, size = 24) {
  const title = `title="${esc(assignedText(item))}"`;
  if (!Store.user(item.reporter) || item.reporter === item.assignee) return avatar(item.assignee, size).replace(/title="[^"]*"/, title);
  return `<span class="av-pair" ${title}>${avatar(item.reporter, Math.round(size * 0.75), 'av-rep').replace(/ title="[^"]*"/, '')}${icon('arrowRight', 10)}${avatar(item.assignee, size).replace(/ title="[^"]*"/, '')}</span>`;
}
/* "by Priya" line for rows and boxes that already show the assignee */
function reporterText(item) {
  return Store.user(item.reporter) ? `by ${esc(whoName(item.reporter))}` : '';
}

function lozenge(status) {
  if (!status) return '';
  return `<span class="lozenge cat-${status.cat}">${esc(status.name)}</span>`;
}

/* ---------------- Toasts ---------------- */
function toast(msg, kind = 'info') {
  let wrap = $('#toasts');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toasts'; document.body.appendChild(wrap); }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'close' : 'checkCircle', 16)}<span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3600);
}

/* ---------------- Popovers / menus ---------------- */
let openPop = null;
function closePopover() {
  if (openPop) { openPop.el.remove(); if (openPop.onClose) openPop.onClose(); openPop = null; }
}
/**
 * popover(anchor, html, { onSelect(value, el), align:'left'|'right', width, onMount(el) })
 * Elements with [data-value] inside trigger onSelect.
 */
function popover(anchor, html, opts = {}) {
  const same = openPop && openPop.anchor === anchor;
  closePopover();
  if (same && !opts.force) return null;
  const el = document.createElement('div');
  el.className = 'popover ' + (opts.cls || '');
  el.innerHTML = html;
  if (opts.width) el.style.width = opts.width + 'px';
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  const pw = el.offsetWidth, ph = el.offsetHeight;
  let left = opts.align === 'right' ? r.right - pw : r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.bottom + 4;
  if (top + ph > window.innerHeight - 8 && r.top - ph - 4 > 8) top = r.top - ph - 4;
  el.style.left = left + 'px';
  el.style.top = Math.max(8, top) + 'px';
  el.addEventListener('click', e => {
    const t = e.target.closest('[data-value]');
    if (t && opts.onSelect) {
      const keep = opts.onSelect(t.dataset.value, t, e);
      if (keep !== true) closePopover();
    }
  });
  openPop = { el, anchor, onClose: opts.onClose };
  if (opts.onMount) opts.onMount(el);
  const first = el.querySelector('input');
  if (first) setTimeout(() => first.focus(), 0);
  return el;
}
document.addEventListener('mousedown', e => {
  if (openPop && !openPop.el.contains(e.target) && !openPop.anchor.contains(e.target)) closePopover();
});
window.addEventListener('resize', closePopover);

function menuHTML(items) {
  return `<div class="menu">${items.map(it => {
    if (it === '-') return '<div class="menu-sep"></div>';
    if (it.heading) return `<div class="menu-heading">${esc(it.heading)}</div>`;
    return `<button class="menu-item ${it.danger ? 'danger' : ''} ${it.selected ? 'selected' : ''}" data-value="${esc(it.value)}" ${it.disabled ? 'disabled' : ''}>
      ${it.icon ? `<span class="mi-icon">${it.icon}</span>` : ''}<span class="mi-label">${it.label}</span>${it.hint ? `<span class="mi-hint">${esc(it.hint)}</span>` : ''}${it.selected ? `<span class="mi-check">${icon('check', 14)}</span>` : ''}
    </button>`;
  }).join('')}</div>`;
}
function menu(anchor, items, onSelect, opts = {}) {
  return popover(anchor, menuHTML(items), Object.assign({ onSelect }, opts));
}

/* Pickers */
function userPicker(anchor, current, onPick, { allowUnassigned = true } = {}) {
  const items = [];
  if (allowUnassigned) items.push({ value: '', label: 'Unassigned', icon: avatar(null, 20), selected: !current });
  Store.state.users.forEach(u => items.push({ value: u.id, label: esc(u.name) + (u.id === Store.state.me ? ' <span class="muted">(you)</span>' : ''), icon: avatar(u.id, 20), selected: current === u.id }));
  menu(anchor, items, v => onPick(v || null));
}
function priorityPicker(anchor, current, onPick) {
  menu(anchor, PRIORITIES.map(p => ({ value: p.id, label: p.name, icon: priorityIcon(p.id), selected: current === p.id })), onPick);
}
function typePicker(anchor, current, onPick) {
  menu(anchor, WORK_TYPES.map(t => ({ value: t.id, label: t.name, icon: typeIcon(t.id), selected: current === t.id })), onPick);
}
function statusPicker(anchor, item, onPick) {
  const sp = Store.space(item.spaceId);
  const trs = Store.moveOptions(item);
  const items = trs.map(t => {
    const st = Store.status(sp, t.to);
    let label = t.name && t.name !== st.name ? `${esc(t.name)} <span class="mi-arrow">${icon('arrowRight', 12)}</span> ${lozenge(st)}` : lozenge(st);
    if (t.blocked) label += `<span class="mi-blocked">${icon('lock', 12)} ${esc(t.blocked)}</span>`;
    return { value: t.blocked ? '' : t.to, label, disabled: !!t.blocked };
  });
  if (!items.length) items.push({ value: '', label: '<span class="muted">No transitions available</span>', disabled: true });
  items.push('-', { value: '__workflow', label: 'View this task\'s workflow', icon: icon('approvals') });
  menu(anchor, items, v => {
    if (v === '__workflow') { closeAllModals(); location.hash = `#/space/${sp.key}/workflow/task/${item.id}`; return; }
    if (v) onPick(v);
  });
}
function datePicker(anchor, current, onPick, { min = null, max = null, note = '' } = {}) {
  const html = `<div class="date-pop"><input type="date" class="input" value="${esc(current || '')}" ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''}>
    ${note ? `<div class="muted small">${note}</div>` : ''}
    <div class="date-pop-actions"><button class="btn subtle" data-value="__clear">Clear</button><button class="btn subtle" data-value="__today">Today</button></div></div>`;
  popover(anchor, html, {
    onSelect(v) { if (v === '__clear') onPick(null); if (v === '__today') onPick(todayStr()); },
    onMount(el) {
      const inp = el.querySelector('input');
      inp.addEventListener('change', () => { if (inp.value) { onPick(inp.value); closePopover(); } });
      setTimeout(() => { try { inp.showPicker && inp.showPicker(); } catch (e) { /* not supported */ } }, 30);
    },
  });
}

/* ---------------- Modals ---------------- */
const modalStack = [];
function openModal({ title, body, footer = '', width = 600, cls = '', onMount, onClose, headerExtra = '' }) {
  const back = document.createElement('div');
  back.className = 'blanket';
  back.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true" style="width:${width}px">
    ${title !== null ? `<div class="modal-head"><h2>${title}</h2><div class="modal-head-actions">${headerExtra}<button class="icon-btn" data-close title="Close">${icon('close')}</button></div></div>` : ''}
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  </div>`;
  document.body.appendChild(back);
  const modal = back.firstElementChild;
  const api = {
    el: modal,
    close() {
      closePopover();
      back.remove();
      const i = modalStack.indexOf(api);
      if (i >= 0) modalStack.splice(i, 1);
      if (onClose) onClose();
    },
  };
  modalStack.push(api);
  back.addEventListener('mousedown', e => { if (e.target === back) api.close(); });
  modal.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
  if (onMount) onMount(modal, api);
  const auto = modal.querySelector('[autofocus]');
  if (auto) setTimeout(() => auto.focus(), 0);
  return api;
}
function closeAllModals() { while (modalStack.length) modalStack[modalStack.length - 1].close(); }
function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise(resolve => {
    let done = false;
    const m = openModal({
      title: `${danger ? `<span class="warn-ic">${icon('help', 20)}</span>` : ''}${esc(title)}`, width: 440,
      body: `<p>${message}</p>`,
      footer: `<button class="btn subtle" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(confirmLabel)}</button>`,
      onMount(el, api) { el.querySelector('[data-ok]').addEventListener('click', () => { done = true; api.close(); resolve(true); }); },
      onClose() { if (!done) resolve(false); },
    });
    return m;
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (openPop) { closePopover(); return; }
    const top = modalStack[modalStack.length - 1];
    if (top) top.close();
  }
});

/* Read a File into a data URL */
function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/* Hover tooltips for any element with data-tip (charts, icons) */
(function tooltips() {
  let tip = null;
  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !t.dataset.tip) { if (tip) { tip.remove(); tip = null; } return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; document.body.appendChild(tip); }
    tip.textContent = t.dataset.tip;
    t.classList.add('tip-on');
    t.addEventListener('mouseleave', () => { t.classList.remove('tip-on'); if (tip) { tip.remove(); tip = null; } }, { once: true });
  });
  document.addEventListener('mousemove', e => {
    if (!tip) return;
    const w = tip.offsetWidth;
    tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 12) + 'px';
    tip.style.top = (e.clientY - tip.offsetHeight - 10) + 'px';
  });
})();
