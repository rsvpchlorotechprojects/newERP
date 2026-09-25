/* Task-level transitions and rules.
 *
 * A space keeps `taskFlows`: transitions that belong to one work item.
 *   { id, taskId, name, from: ['any' | statusId...], to: statusId, rules: [{ id, type, cfg }] }
 * When that work item moves from a matching stage to `to`, the rules apply:
 *   restrict  - the move is hidden/blocked until the condition holds
 *   validate  - the move is offered but refused unless the check passes
 *   action    - something happens automatically after the move (other tasks move, people get assigned...)
 */

const RULE_KINDS = {
  restrict: { name: 'Restrict transition', icon: 'lock', badge: 'lock',
    text: 'Hide the transition when certain conditions aren\'t met. You won\'t be able to use the transition or see it in the work item\'s status dropdown until they are.' },
  validate: { name: 'Validate details', icon: 'check', badge: 'check',
    text: 'Make sure details are correct before moving work items. The transition is still offered, but it won\'t complete unless these rules are met.' },
  action: { name: 'Perform actions', icon: 'arrowRight', badge: 'arrowRight',
    text: 'Automatically perform an action when moving work items. Use these rules to trigger other work items and save time on things you\'d otherwise do by hand.' },
};

const RULE_FIELDS = [
  { id: 'assignee', name: 'Assignee', type: 'user' }, { id: 'reporter', name: 'Reporter', type: 'user' },
  { id: 'priority', name: 'Priority', type: 'priority' }, { id: 'type', name: 'Work type', type: 'worktype' },
  { id: 'labels', name: 'Labels', type: 'labels' }, { id: 'due', name: 'Due date', type: 'date' },
  { id: 'start', name: 'Start date', type: 'date' }, { id: 'description', name: 'Description', type: 'text' },
];
const FIELD_OPS = [
  { id: 'set', name: 'has a value' }, { id: 'empty', name: 'is empty' }, { id: 'is', name: 'is' },
  { id: 'not', name: 'is not' }, { id: 'contains', name: 'contains' },
];

/* ---------- small helpers ---------- */
const fieldDef = id => RULE_FIELDS.find(f => f.id === id) || RULE_FIELDS[0];
const itemsByIds = ids => (ids || []).map(id => Store.item(id)).filter(Boolean);
const keysOf = ids => itemsByIds(ids).map(i => i.key).join(', ') || 'no work items';
const userName = id => id === '@me' ? 'me' : id === '@reporter' ? 'the reporter' : (Store.user(id) || { name: 'Unassigned' }).name;

function statusLabel(sp, v) {
  if (!v) return '—';
  if (String(v).startsWith('cat:')) return `any ${(CATEGORIES.find(c => c.id === v.slice(4)) || {}).name || ''} stage`;
  return (Store.status(sp, v) || { name: '(deleted stage)' }).name;
}
function statusMatches(item, v) {
  if (String(v).startsWith('cat:')) return (Store.statusOf(item) || {}).cat === v.slice(4);
  return item.statusId === v;
}
function fieldValueLabel(fid, v) {
  const t = fieldDef(fid).type;
  if (v == null || v === '') return 'empty';
  if (t === 'user') return userName(v);
  if (t === 'priority') return cap(v);
  if (t === 'worktype') return (WORK_TYPES.find(w => w.id === v) || {}).name || v;
  if (t === 'date') return String(v).startsWith('+') ? `today ${v} days` : v === 'today' ? 'today' : fmtDate(v);
  return `"${v}"`;
}
function fieldTest(item, c) {
  const t = fieldDef(c.field).type;
  const val = item[c.field];
  const empty = val == null || val === '' || (Array.isArray(val) && !val.length);
  const eq = () => {
    if (t === 'labels') return (val || []).map(x => x.toLowerCase()).includes(String(c.value || '').toLowerCase());
    if (t === 'text') return String(val || '').trim().toLowerCase() === String(c.value || '').trim().toLowerCase();
    return (val || '') === (c.value || '');
  };
  switch (c.op) {
    case 'set': return !empty;
    case 'empty': return empty;
    case 'is': return eq();
    case 'not': return !eq();
    case 'contains': return t === 'labels' ? eq() : String(val || '').toLowerCase().includes(String(c.value || '').toLowerCase());
    default: return true;
  }
}
const fieldSentence = c => `${fieldDef(c.field).name} ${(FIELD_OPS.find(o => o.id === c.op) || {}).name}${['set', 'empty'].includes(c.op) ? '' : ' ' + fieldValueLabel(c.field, c.value)}`;
function beenThrough(item, statusId) {
  if (item.statusId === statusId) return true;
  return (item.trail || []).some(t => t.to === statusId || t.from === statusId);
}

/* ---------- form widgets ---------- */
function statusSelectHTML(sp, name, value, { cats = false } = {}) {
  return `<select class="input" data-cfg="${name}">${sp.workflow.statuses.map(s => `<option value="${s.id}" ${s.id === value ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
    ${cats ? CATEGORIES.map(c => `<option value="cat:${c.id}" ${value === 'cat:' + c.id ? 'selected' : ''}>Any "${c.name}" stage</option>`).join('') : ''}</select>`;
}
function userSelectHTML(name, value, { special = false, none = true } = {}) {
  return `<select class="input" data-cfg="${name}">${none ? `<option value="" ${!value ? 'selected' : ''}>Unassigned</option>` : ''}
    ${special ? `<option value="@me" ${value === '@me' ? 'selected' : ''}>Me (whoever moves it)</option><option value="@reporter" ${value === '@reporter' ? 'selected' : ''}>The reporter</option>` : ''}
    ${Store.state.users.map(u => `<option value="${u.id}" ${u.id === value ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>`;
}
function usersCheckHTML(name, values = []) {
  return `<div class="chk-list" data-cfg-multi="${name}">${Store.state.users.map(u => `<label class="chk-row"><input type="checkbox" value="${u.id}" ${values.includes(u.id) ? 'checked' : ''}> ${avatar(u.id, 20)} ${esc(u.name)}</label>`).join('')}</div>
    <span class="field-help">Add more people from <a class="link" href="#/teams" data-close>Teams</a>.</span>`;
}
function tasksPickHTML(sp, name, values = [], excludeId) {
  const list = Store.itemsOf(sp.id).filter(i => i.id !== excludeId).sort((a, b) => (values.includes(b.id) - values.includes(a.id)) || byRank(a, b));
  return `<div class="task-pick"><div class="search-sm full">${icon('search')}<input placeholder="Search work items" data-tp-search></div>
    <div class="tp-list" data-cfg-multi="${name}">${list.map(i => `<label class="chk-row tp-row" data-tp-text="${esc((i.key + ' ' + i.summary).toLowerCase())}"><input type="checkbox" value="${i.id}" ${values.includes(i.id) ? 'checked' : ''}>
      ${typeIcon(i.type)} <span class="key">${esc(i.key)}</span> <span class="ellip grow">${esc(i.summary)}</span> ${lozenge(Store.statusOf(i))} ${itemAvatar(i, 20)}</label>`).join('') || '<p class="muted small">No other work items in this space yet.</p>'}</div></div>`;
}
function fieldRuleHTML(c, { ops = true } = {}) {
  const f = fieldDef(c.field || 'assignee');
  return `<div class="form-grid three"><label class="field"><span class="field-label">Field</span><select class="input" data-cfg="field" data-rerender>${RULE_FIELDS.map(x => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
    ${ops ? `<label class="field"><span class="field-label">Condition</span><select class="input" data-cfg="op" data-rerender>${FIELD_OPS.filter(o => o.id !== 'contains' || ['labels', 'text'].includes(f.type)).map(o => `<option value="${o.id}" ${o.id === (c.op || 'set') ? 'selected' : ''}>${o.name}</option>`).join('')}</select></label>` : ''}
    ${!ops || !['set', 'empty'].includes(c.op || 'set') ? `<label class="field"><span class="field-label">Value</span>${fieldValueInput(f, c.value, { forAction: !ops })}</label>` : ''}</div>`;
}
function fieldValueInput(f, v, { forAction = false } = {}) {
  switch (f.type) {
    case 'user': return userSelectHTML('value', v, { special: forAction });
    case 'priority': return `<select class="input" data-cfg="value">${PRIORITIES.map(p => `<option value="${p.id}" ${p.id === v ? 'selected' : ''}>${p.name}</option>`).join('')}</select>`;
    case 'worktype': return `<select class="input" data-cfg="value">${WORK_TYPES.map(p => `<option value="${p.id}" ${p.id === v ? 'selected' : ''}>${p.name}</option>`).join('')}</select>`;
    case 'date': return forAction
      ? `<select class="input" data-cfg="value">${[['today', 'Today'], ['+1', 'Tomorrow'], ['+3', 'In 3 days'], ['+7', 'In 1 week'], ['+14', 'In 2 weeks'], ['', 'Clear the date']].map(([x, l]) => `<option value="${x}" ${x === (v == null ? 'today' : v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`
      : `<input class="input" type="date" data-cfg="value" value="${esc(v || '')}">`;
    default: return `<input class="input" data-cfg="value" value="${esc(v || '')}" placeholder="${f.type === 'labels' ? 'label' : 'text'}">`;
  }
}

/* ---------- rule catalog ---------- */
const RULE_TYPES = {
  /* Restrict transition */
  r_task: {
    kind: 'restrict', ic: 'hierarchy', task: true,
    title: 'Restrict to when other work items are in a specific status',
    desc: 'Only allow this work item to move when other work items you pick have reached a status. Use it to make work wait for other work.',
    defaults: () => ({ tasks: [], status: null, mode: 'all' }),
    form: (sp, item, c) => `<div class="field"><span class="field-label">Wait for these work items <span class="req">*</span></span>${tasksPickHTML(sp, 'tasks', c.tasks, item && item.id)}</div>
      <div class="form-grid"><label class="field"><span class="field-label">to be in <span class="req">*</span></span>${statusSelectHTML(sp, 'status', c.status || (sp.workflow.statuses.find(s => s.cat === 'done') || {}).id, { cats: true })}</label>
      <label class="field"><span class="field-label">Match</span><select class="input" data-cfg="mode"><option value="all" ${c.mode !== 'any' ? 'selected' : ''}>All of them</option><option value="any" ${c.mode === 'any' ? 'selected' : ''}>Any one of them</option></select></label></div>`,
    valid: c => c.tasks && c.tasks.length ? null : 'Pick at least one work item to wait for',
    summary: (sp, c) => `Only when ${c.tasks.length > 1 ? (c.mode === 'any' ? 'any of ' : 'all of ') : ''}${keysOf(c.tasks)} ${c.tasks.length > 1 ? (c.mode === 'any' ? 'is' : 'are') : 'is'} in ${statusLabel(sp, c.status)}`,
    check: (item, c, sp) => {
      const its = itemsByIds(c.tasks);
      const pass = c.mode === 'any' ? its.some(t => statusMatches(t, c.status)) : its.every(t => statusMatches(t, c.status));
      return pass ? null : `waiting for ${its.filter(t => !statusMatches(t, c.status)).map(t => `${t.key} ${t.summary}`).join(', ')} to be in ${statusLabel(sp, c.status)}`;
    },
  },
  r_assigned: {
    kind: 'restrict', ic: 'people',
    title: 'Restrict until every work item in the same stage is assigned',
    desc: 'Lock a stage\'s work items until each of them has an assignee, so nobody starts before the work is divided up.',
    defaults: () => ({}),
    form: () => '<p class="muted">Applies to this work item\'s siblings (the other work items under the same parent).</p>',
    summary: () => 'Only when every work item in its stage is assigned',
    check: item => {
      if (!item.parentId) return null;
      const open = Store.state.items.filter(s => s.parentId === item.parentId && !s.assignee);
      const parent = Store.item(item.parentId);
      return open.length ? `${parent ? parent.summary : 'this stage'} is locked until every task in it is assigned (${open.length} unassigned)` : null;
    },
  },
  r_self_assigned: {
    kind: 'restrict', ic: 'people',
    title: 'Restrict until this work item is assigned',
    desc: 'Lock a work item until someone is assigned to it.',
    defaults: () => ({}),
    form: () => '<p class="muted">The work item can\'t be moved until it has an assignee.</p>',
    summary: () => 'Only once it is assigned',
    check: item => (item.assignee ? null : 'locked until someone is assigned to this task'),
  },
  r_subtasks: {
    kind: 'restrict', ic: 'list',
    title: 'Restrict based on the status of subtasks',
    desc: 'Only allow a work item to be transitioned when its subtasks have a specific status.',
    defaults: () => ({ status: 'cat:done' }),
    form: (sp, item, c) => `<label class="field"><span class="field-label">All child work items must be in <span class="req">*</span></span>${statusSelectHTML(sp, 'status', c.status, { cats: true })}</label>`,
    summary: (sp, c) => `Only when all child work items are in ${statusLabel(sp, c.status)}`,
    check: (item, c, sp) => {
      const kids = Store.state.items.filter(k => k.parentId === item.id);
      const bad = kids.filter(k => !statusMatches(k, c.status));
      return bad.length ? `child work items ${bad.map(k => k.key).join(', ')} aren't in ${statusLabel(sp, c.status)} yet` : null;
    },
  },
  r_field: {
    kind: 'restrict', ic: 'forms',
    title: 'Restrict to when a field is a specific value.',
    desc: 'Only allow a work item to be moved using a particular transition when a field is a specific value or range of values.',
    defaults: () => ({ field: 'assignee', op: 'set', value: '' }),
    form: (sp, item, c) => fieldRuleHTML(c),
    summary: (sp, c) => `Only when ${fieldSentence(c)}`,
    check: (item, c) => fieldTest(item, c) ? null : `only when ${fieldSentence(c)}`,
  },
  r_been: {
    kind: 'restrict', ic: 'approvals',
    title: 'Restrict to when a work item has been through a specific status',
    desc: 'Only allow a work item to be moved using a particular transition if a work item has had a specific status.',
    defaults: () => ({ status: null }),
    form: (sp, item, c) => `<label class="field"><span class="field-label">Must have been in <span class="req">*</span></span>${statusSelectHTML(sp, 'status', c.status)}</label>`,
    summary: (sp, c) => `Only if it has been in ${statusLabel(sp, c.status)}`,
    check: (item, c, sp) => beenThrough(item, c.status) ? null : `it has to go through ${statusLabel(sp, c.status)} first`,
  },
  r_prevmover: {
    kind: 'restrict', ic: 'people',
    title: 'Restrict users who have previously updated a work item\'s status',
    desc: 'Only allow people who haven\'t moved a work item between two statuses to move a work item using a particular transition.',
    defaults: () => ({ from: null, to: null }),
    form: (sp, item, c) => `<p class="muted small">Whoever moved this work item between these two statuses can't use this transition (for example, so someone else reviews it).</p>
      <div class="form-grid"><label class="field"><span class="field-label">From</span>${statusSelectHTML(sp, 'from', c.from)}</label><label class="field"><span class="field-label">To</span>${statusSelectHTML(sp, 'to', c.to || (sp.workflow.statuses[1] || {}).id)}</label></div>`,
    summary: (sp, c) => `Not by whoever moved it from ${statusLabel(sp, c.from)} to ${statusLabel(sp, c.to)}`,
    check: (item, c, sp) => (item.trail || []).some(t => t.from === c.from && t.to === c.to && t.user === Store.state.me) ? `you moved it from ${statusLabel(sp, c.from)} to ${statusLabel(sp, c.to)}, so someone else has to do this` : null,
  },
  r_who: {
    kind: 'restrict', ic: 'foryou',
    title: 'Restrict who can move a work item',
    desc: 'Only allow certain people to move a work item using a particular transition.',
    defaults: () => ({ users: [] }),
    form: (sp, item, c) => `<div class="field"><span class="field-label">Only these people <span class="req">*</span></span>${usersCheckHTML('users', c.users)}</div>`,
    valid: c => c.users && c.users.length ? null : 'Pick at least one person',
    summary: (sp, c) => `Only ${c.users.map(userName).join(', ')} can use it`,
    check: (item, c) => c.users.includes(Store.state.me) ? null : `only ${c.users.map(userName).join(', ')} can do this`,
  },

  /* Validate details */
  v_field: {
    kind: 'validate', ic: 'forms',
    title: 'Validate a field',
    desc: 'Ensure that a field is a certain value when moving a work item using a particular transition.',
    defaults: () => ({ field: 'due', op: 'set', value: '' }),
    form: (sp, item, c) => fieldRuleHTML(c),
    summary: (sp, c) => `Check that ${fieldSentence(c)}`,
    check: (item, c) => fieldTest(item, c) ? null : `${fieldSentence(c)} is required first`,
  },
  v_task: {
    kind: 'validate', ic: 'hierarchy', task: true,
    title: 'Validate that other work items are in a specific status',
    desc: 'Ensure other work items you pick are in a status when moving this work item. The move is offered but refused until they are.',
    defaults: () => ({ tasks: [], status: null, mode: 'all' }),
    form: (sp, item, c) => RULE_TYPES.r_task.form(sp, item, c),
    valid: c => c.tasks && c.tasks.length ? null : 'Pick at least one work item',
    summary: (sp, c) => `Check that ${c.tasks.length > 1 ? (c.mode === 'any' ? 'any of ' : 'all of ') : ''}${keysOf(c.tasks)} ${c.tasks.length > 1 && c.mode !== 'any' ? 'are' : 'is'} in ${statusLabel(sp, c.status)}`,
    check: (item, c, sp) => RULE_TYPES.r_task.check(item, c, sp),
  },
  v_been: {
    kind: 'validate', ic: 'approvals',
    title: 'Validate that a work item has been through a specific status',
    desc: 'Ensure that a work item has been through a specific status when moving a work item.',
    defaults: () => ({ status: null }),
    form: (sp, item, c) => RULE_TYPES.r_been.form(sp, item, c),
    summary: (sp, c) => `Check it has been in ${statusLabel(sp, c.status)}`,
    check: (item, c, sp) => RULE_TYPES.r_been.check(item, c, sp),
  },
  v_parent: {
    kind: 'validate', ic: 'list',
    title: 'Validate that parent work items are in a specific status',
    desc: 'Ensure that a work item\'s parent has a specific status when moving a work item.',
    defaults: () => ({ status: null }),
    form: (sp, item, c) => `<label class="field"><span class="field-label">Parent must be in <span class="req">*</span></span>${statusSelectHTML(sp, 'status', c.status, { cats: true })}</label>`,
    summary: (sp, c) => `Check the parent is in ${statusLabel(sp, c.status)}`,
    check: (item, c, sp) => {
      const p = item.parentId && Store.item(item.parentId);
      if (!p) return null;
      return statusMatches(p, c.status) ? null : `its parent ${p.key} has to be in ${statusLabel(sp, c.status)}`;
    },
  },
  v_perm: {
    kind: 'validate', ic: 'foryou',
    title: 'Validate that people have a specific permission',
    desc: 'Ensure the person moving the work item is one of the people you allow.',
    defaults: () => ({ users: [] }),
    form: (sp, item, c) => `<div class="field"><span class="field-label">People allowed <span class="req">*</span></span>${usersCheckHTML('users', c.users)}</div>`,
    valid: c => c.users && c.users.length ? null : 'Pick at least one person',
    summary: (sp, c) => `Check the mover is ${c.users.map(userName).join(' or ')}`,
    check: (item, c) => c.users.includes(Store.state.me) ? null : `you don't have permission (only ${c.users.map(userName).join(', ')})`,
  },

  /* Perform actions */
  a_move: {
    kind: 'action', ic: 'arrowRight', task: true,
    title: 'Move other work items',
    desc: 'When this work item moves, move other work items to a status and optionally assign them. This is how one task triggers the next.',
    defaults: () => ({ tasks: [], status: null, assign: '' }),
    form: (sp, item, c) => `<div class="field"><span class="field-label">Work items to move <span class="req">*</span></span>${tasksPickHTML(sp, 'tasks', c.tasks, item && item.id)}</div>
      <div class="form-grid"><label class="field"><span class="field-label">Move them to <span class="req">*</span></span>${statusSelectHTML(sp, 'status', c.status || (sp.workflow.statuses.find(s => s.cat === 'progress') || sp.workflow.statuses[0]).id)}</label>
      <label class="field"><span class="field-label">and assign to</span><select class="input" data-cfg="assign"><option value="" ${!c.assign ? 'selected' : ''}>Keep current assignee</option><option value="@me" ${c.assign === '@me' ? 'selected' : ''}>Me (whoever moves it)</option>${Store.state.users.map(u => `<option value="${u.id}" ${u.id === c.assign ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label></div>`,
    valid: c => c.tasks && c.tasks.length ? null : 'Pick at least one work item to move',
    summary: (sp, c) => `Move ${keysOf(c.tasks)} to ${statusLabel(sp, c.status)}${c.assign ? ` and assign to ${userName(c.assign)}` : ''}`,
    run: (item, c, sp, depth) => {
      const done = [];
      itemsByIds(c.tasks).forEach(t => {
        const patch = {};
        if (t.statusId !== c.status) patch.statusId = c.status;
        if (c.assign) patch.assignee = c.assign === '@me' ? Store.state.me : c.assign;
        if (!Object.keys(patch).length) return;
        const ok = Store.updateItem(t.id, patch, true, { depth: depth + 1 });
        if (ok) done.push(t.key);
      });
      return done.length ? `moved ${done.join(', ')} to ${statusLabel(sp, c.status)}` : null;
    },
  },
  a_start: {
    kind: 'action', ic: 'bolt', task: true,
    title: 'Start other work items',
    desc: 'When this work item moves, move other work items that haven\'t started yet to a status. Work that has already started or finished is left alone.',
    defaults: () => ({ tasks: [], status: null }),
    form: (sp, item, c) => `<div class="field"><span class="field-label">Work items to start <span class="req">*</span></span>${tasksPickHTML(sp, 'tasks', c.tasks, item && item.id)}</div>
      <label class="field"><span class="field-label">Move them to <span class="req">*</span></span>${statusSelectHTML(sp, 'status', c.status || (sp.workflow.statuses.find(s => s.cat === 'progress') || sp.workflow.statuses[0]).id)}</label>`,
    valid: c => c.tasks && c.tasks.length ? null : 'Pick at least one work item to start',
    summary: (sp, c) => `Start ${keysOf(c.tasks)} (move to ${statusLabel(sp, c.status)} if not started yet)`,
    run: (item, c, sp, depth) => {
      const its = itemsByIds(c.tasks).filter(t => (Store.statusOf(t) || {}).cat === 'todo' && t.statusId !== c.status);
      const done = its.filter(t => Store.updateItem(t.id, { statusId: c.status }, true, { depth: depth + 1, quiet: true }));
      return done.length ? `started ${done.map(t => t.key).join(', ')}` : null;
    },
  },
  a_assign: {
    kind: 'action', ic: 'foryou',
    title: 'Assign a work item',
    desc: 'Automatically assign a work item to someone after moving the work item using a particular transition.',
    defaults: () => ({ user: '@me' }),
    form: (sp, item, c) => `<label class="field"><span class="field-label">Assign this work item to</span>${userSelectHTML('user', c.user, { special: true })}</label>`,
    summary: (sp, c) => `Assign it to ${userName(c.user)}`,
    run: (item, c) => {
      const to = c.user === '@me' ? Store.state.me : c.user === '@reporter' ? item.reporter : (c.user || null);
      if (item.assignee === to) return null;
      Store.updateItem(item.id, { assignee: to }, true);
      return `assigned it to ${userName(to)}`;
    },
  },
  a_assignTask: {
    kind: 'action', ic: 'people', task: true,
    title: 'Assign other work items',
    desc: 'When this work item moves, assign other work items to someone, for example to hand work over to the next person.',
    defaults: () => ({ tasks: [], user: '' }),
    form: (sp, item, c) => `<div class="field"><span class="field-label">Work items <span class="req">*</span></span>${tasksPickHTML(sp, 'tasks', c.tasks, item && item.id)}</div>
      <label class="field"><span class="field-label">Assign them to</span>${userSelectHTML('user', c.user, { special: true })}</label>`,
    valid: c => c.tasks && c.tasks.length ? null : 'Pick at least one work item',
    summary: (sp, c) => `Assign ${keysOf(c.tasks)} to ${userName(c.user)}`,
    run: (item, c) => {
      const to = c.user === '@me' ? Store.state.me : c.user === '@reporter' ? item.reporter : (c.user || null);
      const its = itemsByIds(c.tasks).filter(t => t.assignee !== to);
      its.forEach(t => Store.updateItem(t.id, { assignee: to }, true));
      return its.length ? `assigned ${its.map(t => t.key).join(', ')} to ${userName(to)}` : null;
    },
  },
  a_copy: {
    kind: 'action', ic: 'docs',
    title: 'Copy the value of one field to another',
    desc: 'Automatically copy the value of one field to another after moving a work item using a particular transition.',
    defaults: () => ({ from: 'assignee', to: 'reporter' }),
    form: (sp, item, c) => {
      const f = fieldDef(c.from);
      const same = RULE_FIELDS.filter(x => x.type === f.type && x.id !== f.id && ['user', 'date'].includes(x.type));
      return `<div class="form-grid"><label class="field"><span class="field-label">Copy from</span><select class="input" data-cfg="from" data-rerender>${RULE_FIELDS.filter(x => ['user', 'date'].includes(x.type)).map(x => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">to</span><select class="input" data-cfg="to">${same.map(x => `<option value="${x.id}" ${x.id === c.to ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label></div>`;
    },
    summary: (sp, c) => `Copy ${fieldDef(c.from).name} to ${fieldDef(c.to).name}`,
    run: (item, c) => {
      if (item[c.from] === item[c.to]) return null;
      Store.updateItem(item.id, { [c.to]: item[c.from] }, true);
      return `copied ${fieldDef(c.from).name} to ${fieldDef(c.to).name}`;
    },
  },
  a_update: {
    kind: 'action', ic: 'edit',
    title: 'Update a work item field',
    desc: 'Automatically change the value of a work item field after moving the work item using a particular transition.',
    defaults: () => ({ field: 'priority', value: 'high' }),
    form: (sp, item, c) => `${fieldRuleHTML(c, { ops: false })}<p class="muted small">Labels are added to the existing ones; description text is added at the end.</p>`,
    summary: (sp, c) => `Set ${fieldDef(c.field).name} to ${fieldValueLabel(c.field, c.value)}`,
    run: (item, c) => {
      const t = fieldDef(c.field).type;
      let v = c.value;
      if (t === 'user') v = v === '@me' ? Store.state.me : v === '@reporter' ? item.reporter : (v || null);
      if (t === 'date') v = !v ? null : v === 'today' ? todayStr() : addDays(todayStr(), Number(v));
      if (t === 'labels') { if (!v) return null; v = [...new Set([...(item.labels || []), v])]; }
      if (t === 'text' && c.field === 'description') v = (item.description ? item.description + '\n' : '') + (v || '');
      Store.updateItem(item.id, { [c.field]: v }, true);
      return `set ${fieldDef(c.field).name}`;
    },
  },
};

/* ---------- evaluation (used by Store) ---------- */
function flowsFor(item, from, to) {
  const sp = Store.space(item.spaceId);
  return (sp.taskFlows || []).filter(f => f.taskId === item.id && f.to === to && (f.from.includes('any') || f.from.includes(from)));
}
function ruleResults(item, to, kind) {
  const sp = Store.space(item.spaceId);
  const out = [];
  flowsFor(item, item.statusId, to).forEach(f => f.rules.forEach(r => {
    const T = RULE_TYPES[r.type];
    if (!T || T.kind !== kind || !T.check) return;
    const msg = T.check(item, r.cfg, sp);
    if (msg) out.push(msg);
  }));
  return out;
}
function restrictReason(item, to) {
  const r = ruleResults(item, to, 'restrict');
  return r.length ? cap(r[0]) : null;
}
/* Why this move can't happen right now (null = it can) */
function moveBlocker(item, to) {
  const sp = Store.space(item.spaceId);
  const opt = Store.moveOptions(item).find(o => o.to === to);
  if (!opt) return `there's no transition from ${statusLabel(sp, item.statusId)} to ${statusLabel(sp, to)}`;
  if (opt.blocked) return opt.blocked;
  const v = ruleResults(item, to, 'validate');
  return v.length ? cap(v[0]) : null;
}
function runMoveActions(item, from, to, depth) {
  if (depth > 6) return;
  const sp = Store.space(item.spaceId);
  const msgs = [];
  flowsFor(item, from, to).forEach(f => f.rules.forEach(r => {
    const T = RULE_TYPES[r.type];
    if (!T || T.kind !== 'action' || !T.run) return;
    const m = T.run(item, r.cfg, sp, depth);
    if (m) { msgs.push(m); Store.log(item, `rule: ${m}`); }
  }));
  if (msgs.length) setTimeout(() => toast(`${item.key} rules: ${msgs.join('; ')}`), 50);
}

function ruleSummary(sp, rule) {
  const T = RULE_TYPES[rule.type];
  return T ? T.summary(sp, rule.cfg) : 'Unknown rule';
}
function ruleIcon(type, size = 28) {
  const T = RULE_TYPES[type];
  const k = RULE_KINDS[T.kind];
  return `<span class="rule-ic kind-${T.kind}" style="width:${size}px;height:${size}px">${icon(T.ic, Math.round(size * 0.62))}<span class="rb">${icon(k.badge, 9)}</span></span>`;
}
function flowName(sp, f) {
  const from = f.from.includes('any') ? 'Any stage' : f.from.map(x => statusLabel(sp, x)).join(', ');
  return `${from} → ${statusLabel(sp, f.to)}`;
}

/* Get (or create) the task transition for item from → to */
function ensureFlow(sp, taskId, from, to, name) {
  sp.taskFlows = sp.taskFlows || [];
  const key = JSON.stringify(from.slice().sort());
  let f = sp.taskFlows.find(x => x.taskId === taskId && x.to === to && JSON.stringify(x.from.slice().sort()) === key);
  if (!f) {
    f = { id: uid('tf'), taskId, name: name || `Move to ${statusLabel(sp, to)}`, from: from.slice(), to, rules: [] };
    sp.taskFlows.push(f);
  }
  return f;
}

/* ---------- "Add rule" dialog (rule1–rule3) ---------- */
function openAddRule(sp, flow, { rule = null, onDone } = {}) {
  const item = Store.item(flow.taskId);
  let kind = rule ? RULE_TYPES[rule.type].kind : 'all';
  let pick = rule ? rule.type : null;
  let step = rule ? 2 : 1;
  let q = '';
  let cfg = rule ? JSON.parse(JSON.stringify(rule.cfg)) : null;
  const m = openModal({ title: null, width: 980, cls: 'rule-modal', body: '<div class="rm"></div>' });
  const root = m.el.querySelector('.rm');

  const readCfg = () => {
    $$('[data-cfg]', root).forEach(el => { cfg[el.dataset.cfg] = el.value; });
    $$('[data-cfg-multi]', root).forEach(el => { cfg[el.dataset.cfgMulti] = $$('input:checked', el).map(x => x.value); });
  };
  const draw = () => {
    if (step === 1) {
      const types = Object.entries(RULE_TYPES).filter(([, T]) => (kind === 'all' || T.kind === kind) && (!q || (T.title + ' ' + T.desc).toLowerCase().includes(q)));
      root.innerHTML = `<div class="rm-grid">
        <aside class="rm-nav"><h1>Add rule</h1>
          <button class="rm-nav-item ${kind === 'all' ? 'on' : ''}" data-kind="all">All rules</button>
          <div class="nav-heading">Rule types</div>
          ${Object.entries(RULE_KINDS).map(([k, K]) => `<button class="rm-nav-item ${kind === k ? 'on' : ''}" data-kind="${k}">${icon(K.icon)} ${K.name}</button>`).join('')}
        </aside>
        <div class="rm-main">
          <div class="rm-top"><div class="search-sm full">${icon('search')}<input placeholder="Search rules" value="${esc(q)}" data-rm-search></div><button class="icon-btn" data-close title="Close">${icon('close')}</button></div>
          <p class="rm-intro">${kind === 'all' ? `Rules for <b>${esc(item ? item.key + ' ' + item.summary : '')}</b> when it moves <b>${esc(flowName(sp, flow))}</b>. Pick a rule type on the left, or search.` : RULE_KINDS[kind].text}</p>
          <div class="rm-list">${types.map(([id, T]) => `<button class="rm-rule ${pick === id ? 'on' : ''}" data-pick="${id}">${ruleIcon(id)}<span><b>${esc(T.title)}</b>${T.task ? ' <span class="lozenge cat-progress tiny">Task level</span>' : ''}<span class="rm-desc">${esc(T.desc)}</span></span></button>`).join('') || '<p class="muted">No rules match your search.</p>'}</div>
        </div></div>
        <div class="rm-foot"><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-select ${pick ? '' : 'disabled'}>Select</button></div>`;
    } else {
      const T = RULE_TYPES[pick];
      root.innerHTML = `<div class="rm-config">
        <div class="rm-config-head">${ruleIcon(pick, 36)}<div class="grow"><h2>${esc(T.title)}</h2><div class="muted small">${RULE_KINDS[T.kind].name} · ${esc(item ? item.key : '')} when it moves ${esc(flowName(sp, flow))}</div></div><button class="icon-btn" data-close title="Close">${icon('close')}</button></div>
        <p class="muted">${esc(T.desc)}</p>
        <div class="rm-form">${T.form(sp, item, cfg)}</div>
        <div class="rm-preview">${icon('bolt', 14)} <span data-preview>${esc(T.summary(sp, cfg))}</span></div>
      </div>
      <div class="rm-foot">${rule ? '' : '<button class="btn subtle" data-back>Back</button>'}<span class="grow"></span><button class="btn subtle" data-close>Cancel</button><button class="btn primary" data-save>${rule ? 'Save rule' : 'Add rule'}</button></div>`;
    }
  };
  root.addEventListener('click', e => {
    const k = e.target.closest('[data-kind]'); if (k) { kind = k.dataset.kind; draw(); return; }
    const p = e.target.closest('[data-pick]');
    if (p) { pick = p.dataset.pick; $$('.rm-rule', root).forEach(b => b.classList.toggle('on', b === p)); root.querySelector('[data-select]').disabled = false; if (e.detail === 2) root.querySelector('[data-select]').click(); return; }
    if (e.target.closest('[data-select]') && pick) { cfg = RULE_TYPES[pick].defaults(); step = 2; draw(); readCfg(); return; }
    if (e.target.closest('[data-back]')) { step = 1; draw(); return; }
    if (e.target.closest('[data-save]')) {
      readCfg();
      const T = RULE_TYPES[pick];
      const bad = T.valid && T.valid(cfg);
      if (bad) { toast(bad, 'error'); return; }
      if (rule) { rule.cfg = cfg; } else flow.rules.push({ id: uid('rl'), type: pick, cfg });
      Store.save();
      m.close();
      toast(rule ? 'Rule saved' : 'Rule added');
      if (onDone) onDone();
    }
  });
  root.addEventListener('input', e => {
    if (e.target.matches('[data-rm-search]')) { q = e.target.value.trim().toLowerCase(); const pos = e.target.selectionStart; draw(); const s = root.querySelector('[data-rm-search]'); s.focus(); s.setSelectionRange(pos, pos); }
    if (e.target.matches('[data-tp-search]')) {
      const v = e.target.value.trim().toLowerCase();
      $$('[data-tp-text]', e.target.closest('.task-pick')).forEach(r => { r.hidden = v && !r.dataset.tpText.includes(v); });
    }
  });
  root.addEventListener('change', e => {
    if (step !== 2) return;
    readCfg();
    if (e.target.matches('[data-rerender]')) { if (e.target.dataset.cfg === 'field') delete cfg.value; if (e.target.dataset.cfg === 'from') cfg.to = ''; draw(); readCfg(); }
    const pv = root.querySelector('[data-preview]');
    if (pv) pv.textContent = RULE_TYPES[pick].summary(sp, cfg);
  });
  draw();
}
