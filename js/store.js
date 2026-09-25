/* Data layer: everything lives in localStorage under one key */
const STORE_KEY = 'taskspace.v1';

const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const nowISO = () => new Date().toISOString();
const todayStr = () => ymd(new Date());
function ymd(d) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function parseYmd(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }

const PRIORITIES = [
  { id: 'highest', name: 'Highest' }, { id: 'high', name: 'High' }, { id: 'medium', name: 'Medium' },
  { id: 'low', name: 'Low' }, { id: 'lowest', name: 'Lowest' },
];
const WORK_TYPES = [
  { id: 'task', name: 'Task' }, { id: 'subtask', name: 'Sub-task' },
];
const CATEGORIES = [
  { id: 'todo', name: 'To do' }, { id: 'progress', name: 'In progress' }, { id: 'done', name: 'Done' },
];

function defaultWorkflow() {
  const s1 = uid('st'), s2 = uid('st'), s3 = uid('st');
  return {
    statuses: [
      { id: s1, name: 'To Do', cat: 'todo' },
      { id: s2, name: 'In Progress', cat: 'progress' },
      { id: s3, name: 'Done', cat: 'done' },
    ],
    transitions: [
      { id: uid('tr'), name: 'Create', from: ['start'], to: s1 },
      { id: uid('tr'), name: 'To Do', from: ['any'], to: s1 },
      { id: uid('tr'), name: 'In Progress', from: ['any'], to: s2 },
      { id: uid('tr'), name: 'Done', from: ['any'], to: s3 },
    ],
  };
}

function makeSpace({ name, key, color = '#F87168', glyph = 'calendar', starred = false }) {
  return {
    id: uid('sp'), name, key, color, glyph, starred,
    created: nowISO(), counter: 0,
    workflow: defaultWorkflow(),
    approvals: { enabled: false, statusId: null, approvers: [], fieldName: 'Approvers', approveTo: null, declineTo: null },
    tabs: { summary: true, board: true, list: true, calendar: true, timeline: true, approvals: true, forms: true, docs: true, attachments: true, reports: true },
    docs: [], forms: [], taskFlows: [], canvasTasks: [],
  };
}

function seedState() {
  const me = { id: 'u_me', name: 'Dharshini A', initials: 'DA', color: '#FCA700' };
  const project = makeSpace({ name: 'project', key: 'PROJ', color: '#F87168', glyph: 'calendar' });
  const example = makeSpace({ name: '(Example) Timeline Tracking Initiatives', key: 'TTI', color: '#F15B50', glyph: 'chart', starred: true });
  const team = makeSpace({ name: 'My Project Management Team', key: 'MPMT', color: '#4688EC', glyph: 'mountain' });
  const st = {
    version: 1,
    theme: 'dark',
    me: me.id,
    users: [me],
    spaces: [project, example, team],
    items: [],
    wfTemplates: [],
    taskTemplates: [],
    activity: [],
    notifications: [],
    folders: [],
    recent: [project.id, team.id, example.id],
    ui: { sidebarCollapsed: false, quickstartHidden: false, quickstartOpen: false, calendarWeekends: false },
  };
  // A few example items so the example space shows how things look
  const [todo, prog, done] = example.workflow.statuses;
  const t = todayStr();
  const samples = [
    ['Define quarterly initiatives', 'task', done.id, 'high', -20, -6],
    ['Collect timeline requirements', 'task', done.id, 'medium', -14, -3],
    ['Draft roadmap for launch', 'task', prog.id, 'high', -4, 6],
    ['Review budget with finance', 'task', prog.id, 'medium', -2, 3],
    ['Plan marketing campaign', 'task', todo.id, 'medium', 3, 18],
    ['Book venue for kickoff', 'task', todo.id, 'low', 5, 9],
    ['Prepare kickoff deck', 'task', todo.id, 'highest', 1, 4],
  ];
  samples.forEach(([summary, type, statusId, priority, s, d], idx) => {
    example.counter++;
    st.items.push({
      id: uid('it'), spaceId: example.id, key: `${example.key}-${example.counter}`, type, summary, description: '',
      statusId, priority, assignee: me.id, reporter: me.id, labels: [], start: addDays(t, s), due: addDays(t, d),
      parentId: null, created: new Date(Date.now() - (24 - idx * 3) * 864e5).toISOString(), updated: nowISO(),
      resolved: statusId === done.id ? nowISO() : null, comments: [], attachments: [], history: [], approval: null, trail: [],
    });
  });
  return st;
}

const Store = {
  state: null,
  listeners: [],
  load() {
    this.loading = true; // seeding/migrations below don't ask anyone anything
    try {
      const raw = localStorage.getItem(STORE_KEY);
      this.state = raw ? JSON.parse(raw) : seedState();
    } catch (e) {
      this.state = seedState();
    }
    this.state.ui = Object.assign({ sidebarCollapsed: false, quickstartHidden: false, calendarWeekends: false }, this.state.ui || {});
    delete this.state.goals; // Goals page was removed
    this.state.wfTemplates = this.state.wfTemplates || [];
    this.state.taskTemplates = this.state.taskTemplates || [];
    (this.state.wfTemplates || []).forEach(t => {
      if (!this.state.taskTemplates.some(x => x.id === t.id)) {
        this.state.taskTemplates.push({ id: t.id, name: t.name, created: t.created, updated: t.updated || t.created, resetStatus: true, workflow: t.workflow, approvals: t.approvals, tasks: [], flows: [], canvas: [], pos: {} });
      }
    });
    this.state.wfTemplates = [];
    this.state.spaces.forEach(sp => {
      (sp.workflows || []).forEach(w => {
        this.state.items.filter(i => i.spaceId === sp.id && i.workflowId === w.id).forEach(i => {
          const cur = w.workflow.statuses.find(x => x.id === i.statusId) || {};
          const sts = sp.workflow.statuses;
          i.statusId = (sts.find(x => x.name.toLowerCase() === (cur.name || '').toLowerCase()) || sts.find(x => x.cat === cur.cat) || sts[0]).id;
        });
      });
      delete sp.workflows;
      sp.taskFlows = sp.taskFlows || [];
      sp.canvasTasks = sp.canvasTasks || [];
      sp.canvasPos = sp.canvasPos || {};
    });
    this.state.items.forEach(i => { delete i.workflowId; i.trail = i.trail || []; });
    // only two work types now: Task and Sub-task (Workstream became Task)
    const noWs = t => (t === 'workstream' ? 'task' : t);
    this.state.items.forEach(i => { i.type = noWs(i.type); });
    this.state.spaces.forEach(sp => {
      (sp.forms || []).forEach(f => { f.type = noWs(f.type); });
      (sp.taskFlows || []).forEach(f => f.rules.forEach(r => { if (r.cfg && r.cfg.field === 'type') r.cfg.value = noWs(r.cfg.value); }));
    });
    this.state.taskTemplates.forEach(t => {
      (t.tasks || []).forEach(x => { x.type = noWs(x.type); });
      (t.flows || []).forEach(f => f.rules.forEach(r => { if (r.cfg && r.cfg.field === 'type') r.cfg.value = noWs(r.cfg.value); }));
    });
    (this.state.filters || []).forEach(f => { if (f.v && f.v.types) f.v.types = [...new Set(f.v.types.map(noWs))]; });
    this.state.activity = this.state.activity || [];
    this.state.notifications = this.state.notifications || [];
    this.state.folders = this.state.folders || [];
    ensureErp(this.state); // business apps (apps-core.js)
    ensureLeadFlow(this.state); // Sales templates + Leads folder (leadflow.js)
    this.save(true);
    this.loading = false;
  },
  save(silent) {
    if (!silent) leadFlowSync(); // finish tasks whose record now exists in another app (leadflow.js)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.state));
    } catch (e) {
      toast('Storage is full. Remove some attachments or export your data.', 'error');
    }
    if (!silent) this.listeners.forEach(fn => fn());
  },
  onChange(fn) { this.listeners.push(fn); },
  reset() { this.loading = true; this.state = seedState(); ensureErp(this.state); ensureLeadFlow(this.state); this.loading = false; this.save(); },

  /* --- lookups --- */
  me() { return this.user(this.state.me); },
  user(id) { return this.state.users.find(u => u.id === id) || null; },
  space(id) { return this.state.spaces.find(s => s.id === id) || null; },
  spaceByKey(key) { return this.state.spaces.find(s => s.key === key) || null; },
  item(id) { return this.state.items.find(i => i.id === id) || null; },
  itemsOf(spaceId) { return this.state.items.filter(i => i.spaceId === spaceId); },
  /* A space has one set of stages. Helpers also accept editor drafts (.workflow/.approvals). */
  workflows(sp) { return [{ id: null, name: 'Default', workflow: sp.workflow, approvals: sp.approvals }]; },
  allStatuses(sp) { return sp.workflow.statuses; },
  status(space, id) { return space.workflow.statuses.find(s => s.id === id) || null; },
  statusOf(item) { const sp = this.space(item.spaceId); return sp ? this.status(sp, item.statusId) : null; },
  isDone(item) { const s = this.statusOf(item); return !!s && s.cat === 'done'; },

  touchRecent(spaceId) {
    const r = this.state.recent.filter(id => id !== spaceId);
    r.unshift(spaceId);
    this.state.recent = r.slice(0, 8);
    this.save(true);
  },

  log(item, text) {
    const entry = { id: uid('ev'), at: nowISO(), user: this.state.me, itemId: item ? item.id : null, text };
    if (item) item.history.unshift(entry);
    this.state.activity.unshift(entry);
    this.state.activity = this.state.activity.slice(0, 300);
  },

  /* --- items --- */
  createItem(data, silent) {
    data = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const sp = this.space(data.spaceId);
    sp.counter++;
    const w = sp.workflow;
    if (data.statusId && !w.statuses.some(s => s.id === data.statusId)) delete data.statusId;
    const createTr = w.transitions.find(t => t.from.includes('start'));
    const firstStatus = (createTr && this.status(sp, createTr.to)) || w.statuses[0];
    const item = Object.assign({
      id: uid('it'), key: `${sp.key}-${sp.counter}`, type: 'task', summary: '', description: '',
      statusId: firstStatus.id, priority: 'medium', assignee: null, reporter: this.state.me, labels: [],
      start: null, due: null, parentId: null, created: nowISO(), updated: nowISO(), resolved: null,
      comments: [], attachments: [], history: [], approval: null, trail: [],
    }, data);
    if (!item.statusId) item.statusId = firstStatus.id;
    const parent = item.parentId && this.item(item.parentId);
    if (parent && parent.due && item.due && item.due > parent.due) {
      item.due = parent.due;
      if (item.start && item.start > item.due) item.start = item.due;
      if (!silent) setTimeout(() => toast(`${item.key}: due date set to ${fmtDate(parent.due)}, its parent ${parent.key}'s due date`), 50);
    }
    this.state.items.push(item);
    this.log(item, `created ${item.key}`);
    this.afterStatusChange(item, null);
    if (!silent) this.save();
    return item;
  },

  /**
   * Change fields on a work item. A status change goes through the task rules:
   * Restrict / Validate rules can refuse it (the other fields still save), and
   * Perform-action rules run afterwards. opts.force skips the checks (approvals, remapping).
   * Returns false when the status change was refused.
   */
  updateItem(id, patch, silent, opts = {}) {
    const item = this.item(id);
    if (!item) return false;
    const prevStatus = item.statusId;
    let refused = false;
    // a child's due date can't be after its parent's due date
    if (!opts.force && ('due' in patch || 'parentId' in patch)) {
      const why = this.dueConflict(item, { due: 'due' in patch ? patch.due : item.due, parentId: 'parentId' in patch ? patch.parentId : item.parentId });
      if (why) {
        refused = true;
        if (!opts.quiet) toast(`${item.key}: ${why}`, 'error');
        patch = { ...patch };
        if ('due' in patch) delete patch.start; // dates dragged together stay together
        delete patch.due; delete patch.parentId;
      }
    }
    if (patch.statusId && patch.statusId !== prevStatus && !opts.force) {
      const why = moveBlocker(item, patch.statusId);
      if (why) {
        refused = true;
        if (!opts.quiet) toast(`${item.key}: ${why}`, 'error');
        patch = { ...patch };
        delete patch.statusId;
      }
    }
    Object.entries(patch).forEach(([k, v]) => {
      if (JSON.stringify(item[k]) === JSON.stringify(v)) return;
      const label = { summary: 'Summary', description: 'Description', priority: 'Priority', assignee: 'Assignee', reporter: 'Reporter', due: 'Due date', start: 'Start date', labels: 'Labels', type: 'Work type', parentId: 'Parent', statusId: 'Status' }[k];
      if (label) {
        let from = item[k], to = v;
        if (k === 'statusId') { from = (this.statusOf(item) || {}).name; to = (this.status(this.space(item.spaceId), v) || {}).name; }
        if (k === 'assignee' || k === 'reporter') { from = (this.user(from) || { name: 'Unassigned' }).name; to = (this.user(to) || { name: 'Unassigned' }).name; }
        if (k === 'priority') { from = cap(from); to = cap(to); }
        if (k === 'labels') { from = (from || []).join(', '); to = (to || []).join(', '); }
        if (k === 'description' || k === 'parentId') this.log(item, `updated the ${label}`);
        else this.log(item, `changed ${label} from "${from || 'None'}" to "${to || 'None'}"`);
      }
      item[k] = v;
    });
    item.updated = nowISO();
    if (patch.statusId && patch.statusId !== prevStatus) {
      item.trail = (item.trail || []).concat({ from: prevStatus, to: patch.statusId, user: this.state.me, at: nowISO() });
      this.afterStatusChange(item, prevStatus);
      if (!opts.force || opts.runActions) runMoveActions(item, prevStatus, patch.statusId, opts.depth || 0);
    }
    if (!silent) this.save();
    return !refused;
  },

  /* A notification addressed to one person (shown under the bell) */
  notify(userId, item, text) {
    if (!userId || !this.user(userId)) return;
    this.state.notifications = this.state.notifications || [];
    this.state.notifications.unshift({ id: uid('nt'), to: userId, at: nowISO(), itemId: item ? item.id : null, text, read: false });
    this.state.notifications = this.state.notifications.slice(0, 300);
  },

  afterStatusChange(item, prev) {
    const sp = this.space(item.spaceId);
    const st = this.status(sp, item.statusId);
    item.resolved = st && st.cat === 'done' ? (item.resolved || nowISO()) : null;
    // a child work item just reached a Done stage: tell its assignee
    const was = prev ? this.status(sp, prev) : null;
    if (prev && item.parentId && st && st.cat === 'done' && (!was || was.cat !== 'done') && item.assignee) {
      const parent = this.item(item.parentId);
      this.notify(item.assignee, item, `${item.key} "${item.summary}" was marked as ${st.name}${parent ? ` (child of ${parent.key} ${parent.summary})` : ''}`);
      const who = this.user(item.assignee).name;
      setTimeout(() => toast(`Notified ${who}: ${item.key} is ${st.name}`), 60);
    }
    const ap = sp.approvals;
    if (ap.enabled && ap.statusId === item.statusId) {
      item.approval = {
        state: 'pending', fieldName: ap.fieldName, requestedBy: this.state.me, requestedAt: nowISO(),
        approvers: this.approvalChainFor(item).map(c => ({ user: c.user, step: c.step, decision: null })),
      };
      this.log(item, `requested approval from ${chainText(item.approval.approvers)}`);
      // the UI asks who should approve first (approval-chain.js) and notifies once that's settled
      if (!(this.approvalRequested && this.approvalRequested(item))) this.notifyApprovalTurn(item);
    } else if (item.approval && item.approval.state === 'pending') {
      item.approval = null;
    }
  },

  /* Who approves this work item, as steps: the task's own chain if it has one, else the space's preset approvers (one step) */
  approvalChainFor(item) {
    const own = (item.approvalChain || []).filter(c => this.user(c.user));
    if (own.length) return normalizeChain(own);
    const ap = this.space(item.spaceId).approvals;
    return normalizeChain((ap.approvers.length ? ap.approvers : [this.state.me]).filter(u => this.user(u)).map(u => ({ user: u, step: 1 })));
  },
  /* Tell the people whose step it is now (each person once per request) */
  notifyApprovalTurn(item) {
    const ap = item.approval, step = approvalStep(ap);
    if (step == null) return;
    const steps = Math.max(...ap.approvers.map(a => a.step || 1));
    ap.approvers.filter(a => (a.step || 1) === step && !a.decision && !a.notified).forEach(a => {
      a.notified = true;
      this.notify(a.user, item, `${item.key} "${item.summary}" is waiting for your approval${steps > 1 ? ` (step ${step} of ${steps})` : ''}`);
    });
  },
  /* Change who approves. remember: also keep it as the task's chain for the next time it goes to review */
  setApprovalChain(itemId, chain, { remember = true } = {}) {
    const item = this.item(itemId);
    chain = normalizeChain(chain.filter(c => this.user(c.user)));
    if (remember) item.approvalChain = chain.length ? chain.map(c => ({ user: c.user, step: c.step })) : null;
    const ap = item.approval;
    if (ap && ap.state === 'pending' && chain.length) {
      const prev = new Map(ap.approvers.map(a => [a.user, a]));
      ap.approvers = chain.map(c => { const p = prev.get(c.user); return { user: c.user, step: c.step, decision: p ? p.decision : null, at: p ? p.at : null, notified: p && p.step === c.step ? p.notified : false }; });
      this.log(item, `set the approvers: ${chainText(ap.approvers)}`);
      if (ap.approvers.some(a => a.decision === 'declined') || ap.approvers.every(a => a.decision === 'approved')) this.settleApproval(item);
      else this.notifyApprovalTurn(item);
    }
    item.updated = nowISO();
    this.save();
  },

  decide(itemId, decision) {
    const item = this.item(itemId);
    if (!item || !item.approval) return;
    const step = approvalStep(item.approval);
    const mine = item.approval.approvers.find(a => a.user === this.state.me && !a.decision && (a.step || 1) === step);
    if (!mine) return; // not your turn (an earlier step hasn't approved yet) or already decided
    mine.decision = decision; mine.at = nowISO();
    this.log(item, decision === 'approved' ? 'approved this work item' : 'declined this work item');
    this.settleApproval(item);
    this.save();
  },
  /* After a decision: finish the approval (approved by everyone / declined by anyone) or hand it to the next step */
  settleApproval(item) {
    const sp = this.space(item.spaceId);
    const all = item.approval.approvers;
    let outcome = null;
    if (all.some(a => a.decision === 'declined')) outcome = 'declined';
    else if (all.every(a => a.decision === 'approved')) outcome = 'approved';
    if (!outcome) { this.notifyApprovalTurn(item); item.updated = nowISO(); return; }
    this.notify(item.approval.requestedBy, item, `${item.key} "${item.summary}" was ${outcome}`);
    const approval = item.approval;
    approval.state = outcome;
    approval.decidedAt = nowISO();
    const target = outcome === 'approved' ? sp.approvals.approveTo : sp.approvals.declineTo;
    if (target && target !== item.statusId) {
      this.updateItem(item.id, { statusId: target }, true, { force: true, runActions: true });
    }
    // keep the decided record unless the new status started a fresh approval
    if (!item.approval || item.approval.state !== 'pending') item.approval = approval;
    item.updated = nowISO();
  },

  deleteItem(id) {
    const item = this.item(id);
    if (!item) return;
    const ids = new Set([id, ...this.descendantIds(id)]);
    this.state.items = this.state.items.filter(i => !ids.has(i.id));
    const sp = this.space(item.spaceId);
    if (sp) this.cleanFlows(sp);
    this.log(null, `deleted ${item.key} ${item.summary}`);
    this.save();
  },

  /* Children, grandchildren… of a work item (any depth) */
  descendantIds(id) {
    const out = [];
    const walk = pid => this.state.items.forEach(i => { if (i.parentId === pid && !out.includes(i.id)) { out.push(i.id); walk(i.id); } });
    walk(id);
    return out;
  },
  /* Parent, grandparent… up to the top, nearest first */
  ancestors(item) {
    const out = [];
    let p = item.parentId && this.item(item.parentId);
    while (p && !out.includes(p) && p !== item) { out.push(p); p = p.parentId && this.item(p.parentId); }
    return out;
  },

  /* Why a work item can't have this due date / parent (null = fine) */
  dueConflict(item, { due, parentId }) {
    const parent = parentId && this.item(parentId);
    if (due && parent && parent.due && due > parent.due) return `due date can't be after its parent ${parent.key}'s due date (${fmtDate(parent.due)})`;
    if (due) {
      const late = this.state.items.filter(c => c.parentId === item.id && c.due && c.due > due);
      if (late.length) {
        const latest = late.map(c => c.due).sort().pop();
        return `due date can't be before its child work item${late.length > 1 ? 's' : ''} ${late.map(c => c.key).join(', ')} (due ${fmtDate(latest)})`;
      }
    }
    return null;
  },
  /* Allowed due date range for a work item: { max: parent's due, min: latest child due } */
  dueLimits(item) {
    const parent = item.parentId && this.item(item.parentId);
    const kids = this.state.items.filter(c => c.parentId === item.id && c.due).map(c => c.due).sort();
    return { max: parent && parent.due ? parent.due : null, min: kids.length ? kids[kids.length - 1] : null };
  },

  /* Moves the item could make: stage transitions plus its own task transitions.
     Each entry: { to, name, blocked } where blocked is the Restrict reason, if any. */
  moveOptions(item) {
    const sp = this.space(item.spaceId);
    const from = item.statusId;
    const out = [];
    const add = (to, name) => {
      if (to === from || out.some(o => o.to === to)) return;
      out.push({ to, name, blocked: restrictReason(item, to) });
    };
    sp.workflow.transitions.forEach(t => { if (!t.from.includes('start') && (t.from.includes('any') || t.from.includes(from))) add(t.to, t.name); });
    (sp.taskFlows || []).forEach(f => { if (f.taskId === item.id && (f.from.includes('any') || f.from.includes(from))) add(f.to, f.name); });
    return out;
  },
  allowedTransitions(item) { return this.moveOptions(item).filter(o => !o.blocked); },
  canMove(item, toStatus) { return this.allowedTransitions(item).some(o => o.to === toStatus); },

  /* Drop task transitions and rules that point at deleted tasks or stages */
  cleanFlows(sp) {
    const sts = new Set(sp.workflow.statuses.map(s => s.id));
    const tasks = new Set(this.itemsOf(sp.id).map(i => i.id));
    const okStatus = v => !v || String(v).startsWith('cat:') || sts.has(v);
    sp.taskFlows = (sp.taskFlows || []).filter(f => tasks.has(f.taskId) && sts.has(f.to)).map(f => {
      f.from = f.from.filter(x => x === 'any' || sts.has(x));
      f.rules = f.rules.filter(r => {
        const c = r.cfg || {};
        if (c.tasks) { c.tasks = c.tasks.filter(t => tasks.has(t)); if (!c.tasks.length) return false; }
        return ['status', 'from', 'to'].every(k => okStatus(c[k]));
      });
      return f;
    }).filter(f => f.from.length);
    sp.canvasTasks = (sp.canvasTasks || []).filter(t => tasks.has(t));
    sp.canvasPos = Object.fromEntries(Object.entries(sp.canvasPos || {}).filter(([t]) => tasks.has(t)));
  },

  /* --- spaces --- */
  createSpace(data) {
    const sp = makeSpace(data);
    this.state.spaces.push(sp);
    this.touchRecent(sp.id);
    this.save();
    return sp;
  },
  deleteSpace(id) {
    this.state.spaces = this.state.spaces.filter(s => s.id !== id);
    this.state.items = this.state.items.filter(i => i.spaceId !== id);
    this.state.recent = this.state.recent.filter(r => r !== id);
    this.save();
  },
  addStatus(space, name, cat) {
    const w = space.workflow;
    const st = { id: uid('st'), name, cat };
    w.statuses.push(st);
    w.transitions.push({ id: uid('tr'), name, from: ['any'], to: st.id });
    this.save();
    return st;
  },
  removeStatus(space, statusId, moveTo) {
    const w = space.workflow;
    this.state.items.forEach(i => { if (i.spaceId === space.id && i.statusId === statusId) i.statusId = moveTo; });
    w.statuses = w.statuses.filter(s => s.id !== statusId);
    w.transitions = w.transitions
      .map(t => ({ ...t, from: t.from.filter(f => f !== statusId) }))
      .filter(t => t.to !== statusId && t.from.length);
    const ap = space.approvals;
    if ([ap.statusId, ap.approveTo, ap.declineTo].includes(statusId)) {
      ap.enabled = false;
      w.transitions = w.transitions.filter(t => !t.approval);
    }
    this.cleanFlows(space);
    this.save();
  },
};

/* Approval steps: everyone in step 1 decides first, then step 2 is asked, and so on */
function normalizeChain(chain) {
  const seen = new Set();
  const list = chain.filter(c => c && c.user && !seen.has(c.user) && seen.add(c.user)).map((c, i) => ({ user: c.user, step: Number(c.step) || 1, i }));
  const steps = [...new Set(list.map(c => c.step))].sort((a, b) => a - b);
  return list.map(c => ({ user: c.user, step: steps.indexOf(c.step) + 1, i: c.i })).sort((a, b) => a.step - b.step || a.i - b.i).map(({ user, step }) => ({ user, step }));
}
/* the step whose turn it is (null when nothing is waiting) */
function approvalStep(ap) {
  if (!ap || ap.state !== 'pending') return null;
  const open = ap.approvers.filter(a => !a.decision).map(a => a.step || 1);
  return open.length ? Math.min(...open) : null;
}
/* can this person approve or decline right now? */
function canApprove(item, user = Store.state.me) {
  const s = approvalStep(item.approval);
  return s != null && item.approval.approvers.some(a => a.user === user && !a.decision && (a.step || 1) === s);
}
/* "Arun → Priya, Karthik" */
function chainText(approvers) {
  const steps = [...new Set(approvers.map(a => a.step || 1))].sort((a, b) => a - b);
  return steps.map(s => approvers.filter(a => (a.step || 1) === s).map(a => (Store.user(a.user) || { name: '?' }).name).join(', ')).join(' → ');
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
