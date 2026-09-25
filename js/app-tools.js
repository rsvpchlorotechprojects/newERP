/* Calculators app: the ERP's four design calculators (engines in calc-engines.js, same formulas and BOQ), saved against leads */

const CALCS = {
  gas: { name: 'Gas chlorinator', icon: 'drop', engine: CALC_ENGINES.gas, desc: 'Vacuum gas chlorination: system capacity, tonners or cylinders, gas, vacuum and water line sizes, NPSH, TDH, injector, diffusers and BOQ.' },
  clo2: { name: 'ClO₂ (2 chem)', icon: 'sparkle', engine: CALC_ENGINES.clo2, desc: 'Chlorine dioxide from NaClO₂ + HCl: feed rates, bulk and measuring tanks, pumps with NPSH/TDH, motive water, reactor and BOQ.' },
  electro: { name: 'Electrochlorinator (continuous)', icon: 'bolt', engine: CALC_ENGINES.electro, desc: 'On-site NaOCl generation: design Cl₂, salt, water and power, tanks, rectifier, chiller, acid cleaning, H₂ dilution, datasheet and BOQ.' },
  batch: { name: 'Electrochlorinator (batch)', icon: 'box', engine: CALC_ENGINES.batch, desc: 'Batch NaOCl up to 400 g/hr Cl₂: preparation tank and dimensions, storage tote, rectifier, dosing, H₂ dilution and BOQ.' },
};
const fmtN = (v, d = 2) => (Number.isFinite(v) ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const fmtINR = n => '₹ ' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// shows a result value exactly as the ERP does, except NaN/Infinity from incomplete inputs
const calcVal = v => (/^-?(NaN|Infinity)$/.test(String(v)) ? '—' : String(v));
const boqNum = v => parseFloat(v) || 0;

registerApp({
  id: 'tools', name: 'Calculators', short: 'Sizing tools', desc: 'Design calculations for gas chlorinators, ClO₂ and electrochlorinators, saved against a lead', color: '#42B2D7', glyph: 'calc',
  tabs: [
    { id: 'summary', name: 'Overview', icon: 'globe' },
    { id: 'gas', name: 'Gas chlorinator', icon: 'drop' },
    { id: 'clo2', name: 'ClO₂ (2 chem)', icon: 'sparkle' },
    { id: 'electro', name: 'E-chloro continuous', icon: 'bolt' },
    { id: 'batch', name: 'E-chloro batch', icon: 'box' },
    { id: 'saved', name: 'Saved', icon: 'star', count: () => erp().calcs.length },
    { id: 'settings', name: 'Settings', icon: 'gear' },
  ],
  primary() { return { label: 'New calculation', run: b => menu(b, Object.entries(CALCS).map(([k, c]) => ({ value: k, label: c.name, icon: icon(c.icon) })), v => { location.hash = `#/app/tools/${v}`; }) }; },
  shortcuts() { return erp().calcs.filter(c => CALCS[c.type]).slice(-4).reverse().map(c => ({ id: c.id, label: c.name, icon: CALCS[c.type].icon, href: `#/app/tools/${c.type}?load=${c.id}` })); },
  stats() { const e = erp(); return [{ label: 'Calculators', value: Object.keys(CALCS).length }, { label: 'Saved', value: e.calcs.length }, { label: 'Linked to leads', value: e.calcs.filter(c => c.leadId).length }]; },
  create(anchor) { menu(anchor, Object.entries(CALCS).map(([k, c]) => ({ value: k, label: c.name, icon: icon(c.icon) })), v => { location.hash = `#/app/tools/${v}`; }); },
  render(tab, root, r) {
    if (tab === 'summary') return toolsHome(root);
    if (CALCS[tab]) return calcPage(root, tab, r);
    if (tab === 'saved') return toolsSaved(root, r);
    if (tab === 'settings') return toolsSettings(root, r);
  },
});

function toolsHome(root) {
  const recent = erp().calcs.filter(c => CALCS[c.type]).slice().reverse().slice(0, 8);
  root.innerHTML = `<div class="summary">
    <div class="calc-cards">${Object.entries(CALCS).map(([k, c]) => `<a class="calc-card" href="#/app/tools/${k}"><div class="stat-ic">${icon(c.icon, 22)}</div><div class="grow"><b>${c.name}</b><p class="muted small">${c.desc}</p></div>${icon('chevronRight')}</a>`).join('')}</div>
    <div class="sum-grid">
      ${panel('Recent calculations', 'Open one to tweak it, or attach it to a lead.', recent.length ? `<div class="mini-list">${recent.map(c => `<a class="mini-row" href="#/app/tools/${c.type}?load=${c.id}">${icon(CALCS[c.type].icon)}<span class="ellip grow">${esc(c.name)}<span class="muted small"> · ${esc(c.headline || '')}</span></span>${c.leadId && lead(c.leadId) ? `<span class="tag">LD-${lead(c.leadId).no}</span>` : ''}<span class="muted small">${timeAgo(c.at)}</span></a>`).join('')}</div>` : miniEmpty('Nothing saved yet.'), { wide: true })}
    </div></div>`;
}

/* walk every field of an engine's input sections (including a number field's unit select) */
function calcEachField(secs, fn) {
  secs.forEach(s => (s.fields ? [{ fields: s.fields }] : s.blocks).forEach(b => b.fields.forEach(f => {
    fn(f);
    if (f.unitSel) fn({ id: f.unitSel.id, value: f.unitSel.value });
  })));
}
function calcFillDefaults(def, vs) {
  // twice, because some sections depend on values (e.g. the gas calculator's dosing-point count)
  for (let n = 0; n < 2; n++) calcEachField(def.engine.sections(vs, erpSet('tools')), f => { if (vs[f.id] == null) vs[f.id] = f.value; });
}
function calcInputs(vs) { const o = {}; Object.keys(vs).forEach(k => { if (k[0] !== '_') o[k] = vs[k]; }); return o; }

/* BOQ rows after the user's edits: generated rows (minus removed, with edits and client scope applied) plus added rows */
function calcBoq(res, vs) {
  const ed = vs._boq;
  return (res.boq || []).map((area, a) => {
    const key = area.area;
    const client = Boolean(area.scopeKey) && vs[`boqScope_${area.scopeKey}`] === 'CLIENT';
    const rows = area.items.map((it, i) => ({ it, i })).filter(({ i }) => !ed.del[`${key}#${i}`]).map(({ it, i }) => {
      const e = ed.e[`${key}#${i}`] || {};
      const row = { rk: `${key}#${i}`, sl: it.slNo != null ? it.slNo : null, item: it.item, spec: e.spec != null ? e.spec : it.specification, moc: e.moc != null ? e.moc : it.moc, qty: e.qty != null ? e.qty : it.qty, unit: it.unit, price: e.price != null ? e.price : (it.price == null ? '' : it.price) };
      if (client) row.qty = 0;
      return row;
    });
    (ed.add[key] || []).forEach((r, j) => rows.push({ rk: `${key}+${j}`, add: [key, j], sl: null, item: r.item, spec: r.spec, moc: r.moc, qty: client ? 0 : r.qty, unit: r.unit, price: r.price }));
    rows.forEach((r, i) => { if (r.sl == null) r.sl = i + 1; r.total = boqNum(r.qty) * boqNum(r.price); });
    return { a, key, title: area.area + (client ? ' (Client Scope)' : ''), client, rows, total: rows.reduce((s, r) => s + r.total, 0) };
  });
}

function calcPage(root, type, r) {
  const def = CALCS[type];
  const q = r.query || {};
  if (q.load) {
    const c = erp().calcs.find(x => x.id === q.load);
    if (c) APP_UI['calc.' + type] = { ...(def.engine.migrate ? def.engine.migrate(c.inputs || {}) : c.inputs), _boq: JSON.parse(JSON.stringify(c.boq || {})), _loaded: c.id, _lead: c.leadId };
    history.replaceState(null, '', `#/app/tools/${type}`);
    return calcPage(root, type, { ...r, query: {} });
  }
  const vs = ui('calc.' + type, {});
  vs._boq = Object.assign({ e: {}, add: {}, del: {} }, vs._boq || {});
  vs._open = vs._open || {};
  if (q.lead) vs._lead = q.lead;
  calcFillDefaults(def, vs);
  const loaded = vs._loaded && erp().calcs.find(x => x.id === vs._loaded);

  root.innerHTML = `<div class="calc-wrap"><div class="calc-page">
    <div class="calc-form panel">
      <div class="panel-head"><div><h3>${icon(def.icon)} ${def.name}</h3><p class="muted small">${def.desc}</p></div></div>
      ${loaded ? `<div class="banner info">${icon('star', 14)} Editing “${esc(loaded.name)}” <button class="link small" data-calc="new">Start fresh</button></div>` : ''}
      <div class="row gap8 calc-form-tools"><button class="btn subtle sm" data-calc="expand">Expand all</button><button class="btn subtle sm" data-calc="collapse">Collapse all</button><span class="grow"></span><button class="btn subtle sm" data-calc="reset">${icon('refresh', 12)} Reset to defaults</button></div>
      <div class="calc-form-body" data-form></div>
    </div>
    <div class="calc-out" data-out></div></div>
    <div class="calc-boq" data-boq></div></div>`;
  const form = root.querySelector('[data-form]');
  const out = root.querySelector('[data-out]');
  const boqEl = root.querySelector('[data-boq]');

  const fieldHTML = f => {
    const v = vs[f.id];
    const rr = f.rerender ? ' data-rr="1"' : '';
    let ctl;
    if (f.type === 'select') ctl = selectHTML(f.id, f.opts, v, { attrs: `data-cf="${f.id}"${rr}` });
    else if (f.type === 'textarea') ctl = `<textarea class="input" rows="4" data-cf="${f.id}">${esc(v)}</textarea>`;
    else ctl = `<div class="calc-in"><input class="input" type="number" step="any" placeholder="0" data-cf="${f.id}"${rr} value="${esc(v)}">${f.unitSel ? selectHTML(f.unitSel.id, f.unitSel.opts, vs[f.unitSel.id], { cls: 'unit-sel', attrs: `data-cf="${f.unitSel.id}"` }) : f.unit ? `<span class="calc-unit">${esc(f.unit)}</span>` : ''}</div>`;
    return `<label class="field"><span class="field-label">${esc(f.label)}</span>${ctl}</label>`;
  };
  const paintForm = () => {
    let group = null;
    form.innerHTML = def.engine.sections(vs, erpSet('tools')).map(s => {
      const head = s.group && s.group !== group ? `<div class="calc-grp">${esc((group = s.group))}</div>` : '';
      const blocks = s.fields ? [{ fields: s.fields }] : s.blocks;
      const count = blocks.reduce((n, b) => n + b.fields.length, 0);
      const open = vs._open[s.title] != null ? vs._open[s.title] : !s.internal;
      return `${head}<details class="calc-sec${s.internal ? ' internal' : ''}" data-sec="${esc(s.title)}"${open ? ' open' : ''}${s.hidden ? ' hidden' : ''}>
        <summary>${icon('chevronRight', 14)}<span class="grow">${esc(s.title)}</span>${s.internal ? '<span class="tag">Internal</span>' : ''}<span class="muted small">${count}</span></summary>
        <div class="calc-sec-body">${s.note ? `<p class="muted small">${esc(s.note)}</p>` : ''}${blocks.map(b => `${b.sub ? `<div class="calc-sub">${esc(b.sub)}</div>` : ''}${b.fields.map(fieldHTML).join('')}`).join('')}</div>
      </details>`;
    }).join('');
  };

  const cardHTML = c => `<div class="calc-card-out${c.flag === 'hl' ? ' hl' : ''}${c.flag === 'safe' ? ' ok' : ''}${c.flag === 'warn' ? ' bad' : ''}${c.internal ? ' int' : ''}"><div class="muted small">${esc(c.label)}${c.internal ? ' <span class="tag">Internal</span>' : ''}</div><div class="cv${isNaN(parseFloat(c.value)) && calcVal(c.value) !== '—' ? ' txt' : ''}">${esc(calcVal(c.value))}<span>${esc(c.unit)}</span></div></div>`;
  const boqRowHTML = row => `<tr data-rk="${esc(row.rk)}"${row.add ? ` data-ak="${esc(row.add[0])}" data-aj="${row.add[1]}"` : ''}>
      <td class="muted">${esc(row.sl)}</td>
      <td>${row.add ? `<input class="input xs" data-bf="item" value="${esc(row.item)}" placeholder="Item">` : esc(row.item)}</td>
      <td><input class="input xs" data-bf="spec" value="${esc(row.spec)}"></td>
      <td><input class="input xs" data-bf="moc" value="${esc(row.moc)}"></td>
      <td><input class="input xs num" data-bf="qty" value="${esc(row.qty)}"${row.client ? ' disabled title="Client scope"' : ''}></td>
      <td>${row.add ? `<input class="input xs" data-bf="unit" value="${esc(row.unit)}">` : esc(row.unit)}</td>
      <td><input class="input xs num" data-bf="price" value="${esc(row.price)}"></td>
      <td class="num" data-rt>${fmtINR(row.total)}</td>
      <td><button class="icon-btn xs" data-boq-del title="Remove row">${icon('trash', 14)}</button></td></tr>`;

  const draw = () => {
    const res = def.engine.compute({ ...vs });
    vs._res = res;
    if (res.error) {
      out.innerHTML = `<div class="banner warn">${icon('help', 16)} ${esc(res.error)}</div><p class="muted small">Results appear here as soon as the inputs are complete.</p>`;
      boqEl.innerHTML = '';
      return;
    }
    const boq = calcBoq(res, vs);
    vs._boqView = boq;
    const grand = boq.reduce((s, a) => s + a.total, 0);
    const hideInt = Boolean(vs._hideInt);
    const intCount = res.groups.reduce((n, g) => n + g.cards.filter(c => c.internal).length, 0);
    out.innerHTML = `<div class="calc-headline">${icon('sparkle', 18)}<div><div class="muted small">Result</div><b>${esc(res.headline)}</b></div></div>
      ${res.warn ? `<div class="banner warn">${icon('help', 16)} ${esc(res.warn)}</div>` : ''}
      <div class="row gap8 calc-out-tools"><h3 class="grow">Output data</h3>
        ${intCount ? `<label class="check small"><input type="checkbox" data-calc-int ${hideInt ? '' : 'checked'}> Show internal values (${intCount})</label>` : ''}
        <button class="btn subtle sm" data-calc="csv">${icon('download', 12)} Export CSV</button></div>
      ${res.groups.map(g => {
        const cards = g.cards.filter(c => !(hideInt && c.internal));
        if (!cards.length) return '';
        const open = vs._open['out:' + g.title] !== false;
        return `<details class="calc-group" data-sec="out:${esc(g.title)}"${open ? ' open' : ''}><summary>${icon('chevronRight', 14)}<h4 class="grow">${esc(g.title)}</h4><span class="muted small">${cards.length}</span></summary><div class="calc-grid">${cards.map(cardHTML).join('')}</div></details>`;
      }).join('')}`;
    // BOQ and save bar span the full page width under the form and outputs
    boqEl.innerHTML = `
        <div class="row gap8 calc-out-tools"><h3 class="grow">Bill of quantities</h3>${Object.keys(vs._boq.e).length || Object.keys(vs._boq.del).length || Object.keys(vs._boq.add).length ? '<button class="btn subtle sm" data-calc="boqreset">Undo BOQ edits</button>' : ''}</div>
        ${boq.map(a => `<div class="calc-boq-area" data-area="${a.a}">
          <h4>${esc(a.title)}</h4>
          ${a.rows.length || res.boq[a.a].items.length ? `<div class="boq-wrap"><table class="grid boq-grid"><thead><tr><th style="width:52px">Sl.No</th><th style="width:210px">Item description</th><th>Specification</th><th style="width:170px">MOC</th><th style="width:80px">Qty</th><th style="width:64px">Unit</th><th style="width:110px">Price/unit</th><th style="width:120px" class="num">Total</th><th style="width:40px"></th></tr></thead>
            <tbody>${a.rows.map(row => boqRowHTML({ ...row, client: a.client })).join('')}</tbody></table></div>
          <div class="row gap8 calc-boq-foot"><button class="btn subtle sm" data-boq-add="${esc(a.key)}">${icon('plus', 12)} Add row</button><span class="grow"></span><span class="muted small">Area total</span><b data-at>${fmtINR(a.total)}</b></div>` : '<p class="muted small">No BOQ template for this configuration yet.</p>'}
        </div>`).join('')}
        <div class="calc-grand"><span class="grow">Grand total</span><b data-gt>${fmtINR(grand)}</b></div>
      <div class="panel calc-save"><div class="row gap8 wrap"><input class="input grow" data-save-name value="${esc(vs._name != null ? vs._name : loaded ? loaded.name : '')}" placeholder="Name this calculation, e.g. Metro Utilities – Kilpauk WTP">
        ${selectHTML('lead', erp().leads.filter(l => (stageOf(l) || {}).cat !== 'lost' || l.id === vs._lead).map(l => ({ value: l.id, label: `LD-${l.no} · ${l.company}` })), vs._lead, { blank: 'Not linked to a lead', cls: 'sm-select', attrs: 'data-save-lead' })}
        ${loaded ? '<button class="btn" data-calc="saveas">Save as new</button>' : ''}<button class="btn primary" data-calc="save">${icon('star', 14)} ${loaded ? 'Update' : 'Save'}</button></div></div>`;
  };
  // BOQ price/qty edits update totals in place, so the cell being typed in keeps focus
  const retotal = () => {
    let grand = 0;
    (vs._boqView || []).forEach(a => {
      const box = boqEl.querySelector(`[data-area="${a.a}"]`); if (!box) return;
      let t = 0;
      $$('tr[data-rk]', box).forEach(tr => {
        const v = k => (tr.querySelector(`[data-bf="${k}"]`) || {}).value;
        const tot = boqNum(v('qty')) * boqNum(v('price'));
        t += tot; tr.querySelector('[data-rt]').textContent = fmtINR(tot);
      });
      const at = box.querySelector('[data-at]'); if (at) at.textContent = fmtINR(t);
      grand += t;
    });
    const gt = boqEl.querySelector('[data-gt]'); if (gt) gt.textContent = fmtINR(grand);
  };
  let timer = null;
  const drawSoon = () => { clearTimeout(timer); timer = setTimeout(draw, 150); };

  paintForm();
  draw();

  root.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-save-name]')) { vs._name = t.value; return; }
    const k = t.dataset.cf;
    if (k && t.tagName !== 'SELECT') { vs[k] = t.value; if (!t.dataset.rr) drawSoon(); return; }
    const bf = t.dataset.bf;
    if (bf) {
      const tr = t.closest('tr');
      if (tr.dataset.ak != null) vs._boq.add[tr.dataset.ak][+tr.dataset.aj][bf] = t.value;
      else (vs._boq.e[tr.dataset.rk] = vs._boq.e[tr.dataset.rk] || {})[bf] = t.value;
      if (bf === 'qty' || bf === 'price') retotal();
    }
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-save-lead]')) { vs._lead = t.value || null; return; }
    if (t.matches('[data-calc-int]')) { vs._hideInt = !t.checked; draw(); return; }
    const k = t.dataset.cf;
    if (!k) return;
    vs[k] = t.value;
    if (t.dataset.rr) { calcFillDefaults(def, vs); paintForm(); }
    clearTimeout(timer); draw();
  });
  root.addEventListener('toggle', e => { const d = e.target; if (d.dataset && d.dataset.sec) vs._open[d.dataset.sec] = d.open; }, true);
  root.addEventListener('click', e => {
    const add = e.target.closest('[data-boq-add]');
    if (add) { const key = add.dataset.boqAdd; (vs._boq.add[key] = vs._boq.add[key] || []).push({ item: '', spec: '', moc: '', qty: '', unit: '', price: '' }); draw(); return; }
    const del = e.target.closest('[data-boq-del]');
    if (del) {
      const tr = del.closest('tr');
      if (tr.dataset.ak != null) vs._boq.add[tr.dataset.ak].splice(+tr.dataset.aj, 1);
      else vs._boq.del[tr.dataset.rk] = true;
      draw(); return;
    }
    const b = e.target.closest('[data-calc]'); if (!b) return;
    const a = b.dataset.calc;
    if (a === 'expand' || a === 'collapse') { $$('details.calc-sec', form).forEach(d => { d.open = a === 'expand'; vs._open[d.dataset.sec] = d.open; }); return; }
    if (a === 'boqreset') { vs._boq = { e: {}, add: {}, del: {} }; draw(); return; }
    if (a === 'reset' || a === 'new') { APP_UI['calc.' + type] = a === 'new' ? {} : { _loaded: vs._loaded, _lead: vs._lead, _open: vs._open }; render(); return; }
    if (a === 'csv') return calcExportCSV(def, vs);
    if (!vs._res || vs._res.error) { toast('Complete the inputs before saving', 'error'); return; }
    const name = root.querySelector('[data-save-name]').value.trim() || `${def.name} · ${fmtDate(todayStr())}`;
    const leadId = root.querySelector('[data-save-lead]').value || null;
    const rec = { name, leadId, inputs: calcInputs(vs), boq: JSON.parse(JSON.stringify(vs._boq)), headline: vs._res.headline, capacity: vs._res.capacity, at: nowISO() };
    let c = a === 'save' && loaded;
    if (c) Object.assign(c, rec);
    else { c = { id: uid('calc'), type, ...rec, by: Store.state.me }; erp().calcs.push(c); vs._loaded = c.id; }
    const l = lead(leadId); if (l) leadLog(l, `attached sizing “${name}” (${vs._res.headline})`);
    erpLog('tools', `saved ${def.name.toLowerCase()} sizing “${name}”`, l ? { type: 'lead', id: l.id } : null);
    Store.save(); toast(l ? `Saved and attached to LD-${l.no}` : 'Calculation saved');
  });
}

/* inputs, outputs and BOQ of the current calculation as one CSV */
function calcExportCSV(def, vs) {
  const res = vs._res; if (!res || res.error) return;
  const rows = [['Part', 'Section', 'Parameter', 'Value', 'Unit']];
  def.engine.sections(vs, erpSet('tools')).filter(s => !s.hidden).forEach(s => (s.fields ? [{ fields: s.fields }] : s.blocks).forEach(b => b.fields.forEach(f => {
    rows.push(['Input', s.title + (b.sub ? ' / ' + b.sub : ''), f.label, vs[f.id], f.unitSel ? (f.unitSel.opts.find(o => o.value === vs[f.unitSel.id]) || {}).label : f.unit]);
  })));
  res.groups.forEach(g => g.cards.forEach(c => rows.push(['Output', g.title, c.label + (c.internal ? ' (internal)' : ''), calcVal(c.value), c.unit])));
  rows.push([]);
  rows.push(['BOQ area', 'Sl.No', 'Item', 'Specification', 'MOC', 'Qty', 'Unit', 'Price/unit', 'Total']);
  (vs._boqView || []).forEach(a => a.rows.forEach(r => rows.push([a.title, r.sl, r.item, r.spec, r.moc, r.qty, r.unit, r.price, r.total.toFixed(2)])));
  downloadCSV(`${(vs._name || def.name).replace(/[^\w\- ]+/g, '').trim() || 'calculation'}.csv`, rows);
}

function toolsSaved(root) {
  const list = erp().calcs.filter(c => CALCS[c.type]).slice().reverse();
  root.innerHTML = `<div class="wide-page"><div class="table-wrap"><table class="grid"><thead><tr><th>Name</th><th style="width:220px">Calculator</th><th>Result</th><th style="width:220px">Lead</th><th style="width:120px">Saved</th><th style="width:48px"></th></tr></thead>
    <tbody>${list.map(c => `<tr class="row-link" data-href="#/app/tools/${c.type}?load=${c.id}"><td><b>${esc(c.name)}</b></td><td><span class="cell-in">${icon(CALCS[c.type].icon, 14)} ${CALCS[c.type].name}</span></td><td class="muted">${esc(c.headline || '')}</td>
      <td>${c.leadId && lead(c.leadId) ? recordChip('lead', c.leadId) : '<span class="muted">—</span>'}</td><td class="muted">${fmtDate(c.at)}</td><td><button class="icon-btn xs" data-cdel="${c.id}" title="Delete">${icon('trash', 14)}</button></td></tr>`).join('')}</tbody></table>
    ${!list.length ? emptyState({ title: 'No saved calculations', text: 'Run a calculator and save it — attach it to a lead so the sizing lives with the opportunity.', art: 'calc', action: '<a class="btn primary" href="#/app/tools/gas">Open a calculator</a>' }) : ''}</div></div>`;
  root.addEventListener('click', async e => {
    const d = e.target.closest('[data-cdel]');
    if (d) { e.stopPropagation(); if (await confirmDialog({ title: 'Delete this calculation?', message: 'It is removed from Saved and from any lead it was attached to.' })) { erp().calcs = erp().calcs.filter(x => x.id !== d.dataset.cdel); Store.save(); } return; }
    if (e.target.closest('[data-rec]')) return;
    const tr = e.target.closest('[data-href]'); if (tr) location.hash = tr.dataset.href;
  });
}

function toolsSettings(root, r) {
  const ts = erpSet('tools');
  appSettingsPage(appById('tools'), root, r, [{
    id: 'defaults', name: 'Defaults', icon: 'sliders',
    html: () => `<h2>Defaults</h2><p class="muted">Starting values for new calculations. Everything else starts at the ERP design defaults.</p>
      <div class="panel settings-panel"><div class="form-grid">
        <label class="field"><span class="field-label">Gas chlorinator: dosage per dosing point (ppm)</span><input class="input" type="number" step="0.5" data-setting="tools.defaultDose" value="${ts.defaultDose}"></label>
        <label class="field"><span class="field-label">Electrochlorinators: NaOCl concentration at cell outlet (g/L)</span><input class="input" type="number" step="0.5" data-setting="tools.naoclConc" value="${ts.naoclConc}"></label></div>
        <p class="muted small">Changing defaults doesn’t change calculations you already saved.</p></div>`,
    bind() { Object.keys(APP_UI).filter(k => k.startsWith('calc.')).forEach(k => { if (!APP_UI[k]._loaded) delete APP_UI[k]; }); },
  }]);
}
