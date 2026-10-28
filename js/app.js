// GamePM —— 游戏项目管理系统（作品集 Demo）
const STORE_KEY = 'gamepm_portfolio_v1';
const TODAY = d(0);
let S = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && s.version === 1) return s;
  } catch (e) { /* 数据损坏时回退到演示数据 */ }
  return seedData();
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }

// ---------- 常量与工具 ----------
const STATUS = { todo: '待办', doing: '进行中', review: '验收中', done: '已完成' };
const PRI_COLOR = { P0: '#e5484d', P1: '#f5a524', P2: '#5b6cff', P3: '#8a90a6' };
const SEV_COLOR = { S: '#a3171c', A: '#e5484d', B: '#f5a524', C: '#8a90a6' };
const BUG_STATUS = ['新建', '处理中', '待验证', '已关闭', '延期处理'];
const RISK_STATUS = ['监控中', '应对中', '已关闭'];
const LV_TEXT = { g: '正常', y: '关注', r: '预警' };

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pct = v => Math.round(v * 100) + '%';
const md = s => s.slice(5).replace('-', '/');
const taskById = id => S.tasks.find(t => t.id === id);
const isOpen = b => b.status !== '已关闭' && b.status !== '延期处理';
const isOverdue = t => t.status !== 'done' && t.end < TODAY;
const riskScore = r => r.prob * r.impact;
const riskLv = sc => sc >= 15 ? 'r' : sc >= 8 ? 'y' : 'g';
const blocked = t => t.status !== 'done' && t.start <= TODAY && (t.deps || []).some(id => { const x = taskById(id); return x && x.status !== 'done'; });
const workers = () => S.members.filter(m => m.cap > 0);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), 2000); }

// ---------- 核心指标 ----------
function curMs() { return S.milestones.find(m => m.status === 'active') || S.milestones.find(m => m.status !== 'done') || S.milestones.at(-1); }
function curSprint() { return S.sprints.find(s => s.start <= TODAY && TODAY <= s.end) || S.sprints.at(-1); }

// 挣值法：SPI = EV / PV。PV 按任务计划工期线性分摊，EV 按实际进度
function evm(msId) {
  let pv = 0, ev = 0, bac = 0;
  S.tasks.filter(t => t.ms === msId).forEach(t => {
    const dur = diffDays(t.start, t.end) + 1;
    pv += t.est * clamp((diffDays(t.start, TODAY) + 1) / dur, 0, 1);
    ev += t.est * (t.status === 'done' ? 1 : t.progress / 100);
    bac += t.est;
  });
  return { pv, ev, bac, spi: pv ? ev / pv : 1 };
}

// 关键路径：倒推最晚完成时间，浮动时间 ≤ 2 天视为关键任务
function computeSlack() {
  const msDate = Object.fromEntries(S.milestones.map(m => [m.id, m.date]));
  const succ = {};
  S.tasks.forEach(t => (t.deps || []).forEach(p => (succ[p] = succ[p] || []).push(t)));
  const lf = {};
  const num = s => diffDays(TODAY, s);
  function LF(t) {
    if (lf[t.id] != null) return lf[t.id];
    lf[t.id] = num(msDate[t.ms] || t.end); // 防止循环依赖
    const ss = succ[t.id] || [];
    if (ss.length) lf[t.id] = Math.min(...ss.map(s => LF(s) - (diffDays(s.start, s.end) + 1)));
    return lf[t.id];
  }
  const out = {};
  S.tasks.forEach(t => { out[t.id] = LF(t) - num(t.end); });
  return out;
}

function weekStarts(n) {
  const t = new Date(TODAY + 'T00:00:00');
  t.setDate(t.getDate() - (t.getDay() + 6) % 7);
  return Array.from({ length: n }, (_, i) => addDays(fmt(t), i * 7));
}

// 负载：剩余工作量按剩余工期均摊到各周（人日）
function memberLoad(name, weeks) {
  const loads = weeks.map(() => 0);
  S.tasks.filter(t => t.owner === name && t.status !== 'done').forEach(t => {
    const remain = t.est * (1 - t.progress / 100);
    const s = t.start > TODAY ? t.start : TODAY;
    const e = t.end < s ? s : t.end;
    const dur = diffDays(s, e) + 1;
    weeks.forEach((w, i) => {
      const we = addDays(w, 6);
      const ov = diffDays(s > w ? s : w, e < we ? e : we) + 1;
      if (ov > 0) loads[i] += remain * ov / dur;
    });
  });
  return loads;
}

function overloads(nWeeks = 4) {
  const weeks = weekStarts(nWeeks), out = [];
  workers().forEach(m => memberLoad(m.name, weeks).forEach((l, i) => { if (l / m.cap > 1.1) out.push({ m, week: weeks[i], idx: i, pct: l / m.cap }); }));
  return out;
}

function bugStats(days = 7) {
  const from = d(-days + 1);
  const open = S.bugs.filter(isOpen);
  return {
    open: open.length,
    s: open.filter(b => b.sev === 'S').length,
    a: open.filter(b => b.sev === 'A').length,
    deferred: S.bugs.filter(b => b.status === '延期处理').length,
    newN: S.bugs.filter(b => b.created >= from).length,
    closedN: S.bugs.filter(b => b.closed && b.closed >= from).length,
  };
}

function health() {
  const ms = curMs(), e = evm(ms.id), b = bugStats();
  const high = S.risks.filter(r => r.status !== '已关闭' && riskScore(r) >= 15);
  const ov = overloads();
  return {
    ms, e, b, high, ov,
    sched: e.spi >= 0.95 ? 'g' : e.spi >= 0.85 ? 'y' : 'r',
    qual: b.s > 0 ? 'r' : b.a > 5 ? 'y' : 'g',
    risk: high.some(r => r.status === '监控中') ? 'r' : high.length ? 'y' : 'g',
    res: ov.length >= 3 ? 'r' : ov.length ? 'y' : 'g',
  };
}

// 版本门禁：由数据自动判定，避免"拍脑袋"放行
function gates(ms) {
  const p0 = S.tasks.filter(t => t.ms === ms.id && t.pri === 'P0');
  const p0done = p0.filter(t => t.status === 'done').length;
  const b = bugStats();
  const high = S.risks.filter(r => r.status !== '已关闭' && riskScore(r) >= 15);
  const spi = evm(ms.id).spi;
  return [
    { name: 'P0 需求完成率 = 100%', ok: p0done === p0.length, val: `${p0done}/${p0.length}` },
    { name: 'S 级 Bug = 0', ok: b.s === 0, val: `${b.s} 个` },
    { name: 'A 级 Bug ≤ 5', ok: b.a <= 5, val: `${b.a} 个` },
    { name: '未关闭 Bug ≤ 30', ok: b.open <= 30, val: `${b.open} 个` },
    { name: 'Bug 收敛（近 7 日关闭 ≥ 新增）', ok: b.closedN >= b.newN, val: `新增 ${b.newN} / 关闭 ${b.closedN}` },
    { name: '高风险均已启动应对', ok: !high.some(r => r.status === '监控中'), val: `${high.filter(r => r.status === '监控中').length} 项未应对` },
    { name: '进度绩效 SPI ≥ 0.9', ok: spi >= 0.9, val: spi.toFixed(2) },
  ];
}

function alerts() {
  const list = [];
  S.tasks.filter(isOverdue).forEach(t => list.push({ lv: 'r', tag: '延期', text: `${t.id} ${t.title}`, sub: `${t.owner} · 原定 ${md(t.end)} 完成，进度 ${t.progress}%`, act: `openTask('${t.id}')` }));
  S.bugs.filter(b => isOpen(b) && b.sev === 'S').forEach(b => list.push({ lv: 'r', tag: 'S 级 Bug', text: `${b.id} ${b.title}`, sub: `${b.owner} · ${b.status}`, act: `go('bugs')` }));
  S.risks.filter(r => r.status === '监控中' && riskScore(r) >= 15).forEach(r => list.push({ lv: 'r', tag: '高风险', text: `${r.id} ${r.title}`, sub: `风险值 ${riskScore(r)}，尚未启动应对措施`, act: `openRisk('${r.id}')` }));
  S.tasks.filter(blocked).forEach(t => list.push({ lv: 'y', tag: '依赖阻塞', text: `${t.id} ${t.title}`, sub: `前置未完成：${t.deps.filter(id => taskById(id)?.status !== 'done').join(', ')}`, act: `openTask('${t.id}')` }));
  overloads(2).forEach(o => list.push({ lv: 'y', tag: '超负荷', text: `${o.m.name}（${o.m.role}）`, sub: `${md(o.week)} 当周负载 ${pct(o.pct)}`, act: `go('resource')` }));
  return list;
}

// ---------- 图表 ----------
function lineChart({ labels, series, h = 220, marker }) {
  const W = 560, H = h, pl = 34, pr = 10, pt = 12, pb = 26;
  const all = series.flatMap(s => s.data.filter(v => v != null));
  const max = Math.max(1, ...all) * 1.1, n = labels.length;
  const x = i => pl + (W - pl - pr) * (n <= 1 ? 0 : i / (n - 1));
  const y = v => pt + (H - pt - pb) * (1 - v / max);
  let g = '';
  for (let k = 0; k <= 4; k++) {
    const v = max * k / 4;
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${Math.round(v)}</text>`;
  }
  const step = Math.ceil(n / 7);
  labels.forEach((l, i) => { if (i % step === 0) g += `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">${l}</text>`; });
  if (marker != null) g += `<line x1="${x(marker)}" x2="${x(marker)}" y1="${pt}" y2="${H - pb}" class="today-line"/><text x="${x(marker) + 4}" y="${pt + 10}" class="ax today-txt">今天</text>`;
  series.forEach(s => {
    let p = '';
    s.data.forEach((v, i) => { if (v != null) p += (p ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1); });
    if (s.area) g += `<path d="${p}L${x(s.data.length - 1 - [...s.data].reverse().findIndex(v => v != null)).toFixed(1)},${y(0)}L${x(s.data.findIndex(v => v != null))},${y(0)}Z" fill="${s.color}" opacity=".08"/>`;
    g += `<path d="${p}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
  });
  const legend = series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
  return `<div class="legend">${legend}</div><svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

function hbars(rows, color) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return rows.map(([k, v, c]) => `<div class="hbar"><span class="hbar-k">${esc(k)}</span><div class="hbar-track"><div style="width:${v / max * 100}%;background:${c || color}"></div></div><b>${v}</b></div>`).join('');
}

// ---------- 页面：总览 ----------
function renderDashboard() {
  const h = health(), ms = h.ms, sp = curSprint();
  const cards = [
    ['进度', h.sched, `SPI ${h.e.spi.toFixed(2)}`, `挣值 ${h.e.ev.toFixed(0)} / 计划 ${h.e.pv.toFixed(0)} 人日`],
    ['质量', h.qual, `${h.b.open} 个未关闭`, `S 级 ${h.b.s} · A 级 ${h.b.a} · 近 7 日 +${h.b.newN} / -${h.b.closedN}`],
    ['风险', h.risk, `${h.high.length} 项高风险`, `其中 ${h.high.filter(r => r.status === '监控中').length} 项尚未启动应对`],
    ['资源', h.res, `${h.ov.length} 人次超负荷`, '未来 4 周负载 > 110% 的成员·周'],
  ].map(([k, lv, big, sub]) => `<div class="card health ${lv}"><div class="health-top"><span>${k}</span><em class="pill ${lv}">${LV_TEXT[lv]}</em></div><div class="big">${big}</div><div class="muted sm">${sub}</div></div>`).join('');

  // 里程碑时间轴
  const first = S.milestones[0].date, last = S.milestones.at(-1).date, span = diffDays(first, last);
  const pos = s => clamp(diffDays(first, s) / span * 100, 0, 100);
  const tl = `<div class="timeline"><div class="tl-line"></div><div class="tl-fill" style="width:${pos(TODAY)}%"></div>
    <div class="tl-today" style="left:${pos(TODAY)}%"><span>今天</span></div>
    ${S.milestones.map(m => `<div class="tl-node ${m.status}" style="left:${pos(m.date)}%" title="${esc(m.desc)}"><i></i><b>${esc(m.name)}</b><small>${m.date}</small></div>`).join('')}</div>`;

  // 燃尽图
  const spTasks = S.tasks.filter(t => t.sprint === sp.id);
  const nDays = diffDays(sp.start, sp.end) + 1, total = spTasks.reduce((a, t) => a + t.est, 0);
  const labels = [], ideal = [], actual = [];
  for (let i = 0; i < nDays; i++) {
    const day = addDays(sp.start, i);
    labels.push(md(day));
    ideal.push(+(total * (1 - i / (nDays - 1))).toFixed(1));
    if (day > TODAY) { actual.push(null); continue; }
    let rem = 0;
    spTasks.forEach(t => {
      let p;
      if (t.status === 'done' && t.doneDate) p = day >= t.doneDate ? 1 : clamp(diffDays(t.start, day) / Math.max(1, diffDays(t.start, t.doneDate)), 0, 1);
      else p = t.progress / 100 * clamp(diffDays(t.start, day) / Math.max(1, diffDays(t.start, TODAY)), 0, 1);
      rem += t.est * (1 - p);
    });
    actual.push(+rem.toFixed(1));
  }
  const burn = lineChart({ labels, series: [{ name: '理想剩余', color: '#b4b9cc', data: ideal, dash: true }, { name: '实际剩余（人日）', color: '#5b6cff', data: actual, area: true }], marker: diffDays(sp.start, TODAY) });

  const al = alerts();
  const alertHtml = al.length ? al.map(a => `<div class="alert ${a.lv}" onclick="${a.act}"><em class="tag ${a.lv}">${a.tag}</em><div><div>${esc(a.text)}</div><div class="muted sm">${esc(a.sub)}</div></div></div>`).join('') : '<div class="empty">暂无需要处理的事项 🎉</div>';

  const discRows = Object.keys(DISCIPLINES).map(k => {
    const ts = S.tasks.filter(t => t.ms === ms.id && t.disc === k);
    const tot = ts.reduce((a, t) => a + t.est, 0), done = ts.reduce((a, t) => a + t.est * (t.status === 'done' ? 1 : t.progress / 100), 0);
    return `<div class="hbar"><span class="hbar-k">${k}</span><div class="hbar-track"><div style="width:${tot ? done / tot * 100 : 0}%;background:${DISCIPLINES[k]}"></div></div><b>${tot ? pct(done / tot) : '-'}</b></div>`;
  }).join('');

  const soon = S.tasks.filter(t => t.status !== 'done' && t.end >= TODAY && t.end <= d(7)).sort((a, b) => a.end.localeCompare(b.end));

  return `
  <div class="grid4">${cards}</div>
  <div class="card"><div class="card-h"><h3>里程碑</h3><span class="muted sm">当前：${esc(ms.name)} · 完成度 ${pct(h.e.ev / h.e.bac)} · 剩余 ${diffDays(TODAY, ms.date)} 天</span></div>${tl}</div>
  <div class="grid2">
    <div class="card"><div class="card-h"><h3>${sp.name} 燃尽图</h3><span class="muted sm">${md(sp.start)} - ${md(sp.end)} · ${esc(sp.goal)}</span></div>${burn}</div>
    <div class="card"><div class="card-h"><h3>PM 今日关注 <span class="count">${al.length}</span></h3><span class="muted sm">系统根据数据自动识别，点击处理</span></div><div class="alerts">${alertHtml}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-h"><h3>各工种进度（${esc(ms.name)}）</h3></div>${discRows}</div>
    <div class="card"><div class="card-h"><h3>未来 7 天到期</h3></div>
      <table class="tbl"><tbody>${soon.map(t => `<tr onclick="openTask('${t.id}')" class="click"><td><em class="pri" style="background:${PRI_COLOR[t.pri]}">${t.pri}</em></td><td>${esc(t.title)}</td><td class="muted">${t.owner}</td><td>${md(t.end)}</td><td>${progressBar(t.progress)}</td></tr>`).join('') || '<tr><td class="empty">无</td></tr>'}</tbody></table>
    </div>
  </div>`;
}

const progressBar = p => `<div class="pbar"><div style="width:${p}%"></div><span>${p}%</span></div>`;

// ---------- 页面：甘特图 ----------
const ganttUI = { disc: '全部', critical: false };
function renderGantt() {
  const slack = computeSlack();
  const ms = curMs();
  let tasks = S.tasks.filter(t => ganttUI.disc === '全部' || t.disc === ganttUI.disc);
  if (ganttUI.critical) tasks = tasks.filter(t => t.status !== 'done' && slack[t.id] <= 2);
  const start = addDays(S.tasks.reduce((a, t) => t.start < a ? t.start : a, TODAY), -2);
  const endD = addDays([ms.date, ...S.tasks.map(t => t.end)].reduce((a, b) => a > b ? a : b), 3);
  const days = diffDays(start, endD) + 1, DW = 24, LW = 290, RH = 34, GH = 28, HH = 44;
  const X = s => diffDays(start, s) * DW;

  let head = '', bg = '';
  for (let i = 0; i < days; i++) {
    const ds = addDays(start, i), dt = new Date(ds + 'T00:00:00'), wd = dt.getDay();
    head += `<div class="g-day ${wd === 0 || wd === 6 ? 'we' : ''} ${ds === TODAY ? 'td' : ''}" style="left:${i * DW}px">${dt.getDate() === 1 || i === 0 ? `<b>${dt.getMonth() + 1}月</b>` : ''}<span>${dt.getDate()}</span></div>`;
    if (wd === 0 || wd === 6) bg += `<div class="g-we" style="left:${LW + i * DW}px"></div>`;
  }
  const sprintBands = S.sprints.map(s => `<div class="g-sprint" style="left:${X(s.start)}px;width:${(diffDays(s.start, s.end) + 1) * DW}px">${s.name}</div>`).join('');

  let rows = '', y = 0;
  const ypos = {};
  Object.keys(DISCIPLINES).forEach(k => {
    const ts = tasks.filter(t => t.disc === k).sort((a, b) => a.start.localeCompare(b.start));
    if (!ts.length) return;
    rows += `<div class="g-group" style="height:${GH}px"><div class="g-label" style="width:${LW}px"><i style="background:${DISCIPLINES[k]}"></i>${k}<span class="muted sm">${ts.length} 项</span></div></div>`;
    y += GH;
    ts.forEach(t => {
      ypos[t.id] = y + RH / 2;
      const crit = t.status !== 'done' && slack[t.id] <= 2, od = isOverdue(t), bl = blocked(t);
      const flags = (od ? '<em class="tag r">延期</em>' : '') + (bl ? '<em class="tag y">阻塞</em>' : '') + (crit ? '<em class="tag crit">关键</em>' : '');
      rows += `<div class="g-row" style="height:${RH}px"><div class="g-label click" style="width:${LW}px" onclick="openTask('${t.id}')"><em class="pri" style="background:${PRI_COLOR[t.pri]}">${t.pri}</em><span class="g-title" title="${esc(t.title)}">${esc(t.title)}</span><span class="muted sm">${t.owner}</span>${flags}</div>
        <div class="g-track"><div class="g-bar s-${t.status} ${crit ? 'crit' : ''} ${od ? 'od' : ''}" onclick="openTask('${t.id}')" style="left:${X(t.start) + 2}px;width:${(diffDays(t.start, t.end) + 1) * DW - 4}px;--c:${DISCIPLINES[t.disc]}" title="${esc(t.id + ' ' + t.title)}\n${t.start} → ${t.end}\n浮动时间：${slack[t.id]} 天"><div class="g-prog" style="width:${t.status === 'done' ? 100 : t.progress}%"></div><span class="${t.status !== 'done' && t.progress < 30 ? 'dark' : ''}">${t.status === 'done' ? '✓' : t.progress + '%'}</span></div></div></div>`;
      y += RH;
    });
  });

  let arrows = '';
  tasks.forEach(t => (t.deps || []).forEach(p => {
    const pt = taskById(p);
    if (!pt || ypos[p] == null || ypos[t.id] == null) return;
    const x1 = X(pt.end) + DW - 2, y1 = ypos[p], x2 = X(t.start) + 2, y2 = ypos[t.id];
    const mx = Math.max(x1 + 6, Math.min(x2 - 6, x1 + 6));
    arrows += `<path d="M${x1},${y1}H${mx}V${y2}H${x2}" class="g-arrow ${slack[t.id] <= 2 && t.status !== 'done' ? 'crit' : ''}" marker-end="url(#ah)"/>`;
  }));

  const W = LW + days * DW;
  const vline = (s, cls, label) => `<div class="g-vline ${cls}" style="left:${LW + X(s) + DW / 2}px"><span>${label}</span></div>`;
  const msLines = S.milestones.filter(m => m.date >= start && m.date <= endD).map(m => vline(m.date, 'ms', '◆ ' + m.name)).join('');

  return `
  <div class="toolbar">
    ${['全部', ...Object.keys(DISCIPLINES)].map(k => `<button class="chip ${ganttUI.disc === k ? 'on' : ''}" onclick="ganttUI.disc='${k}';render()">${k}</button>`).join('')}
    <label class="chk"><input type="checkbox" ${ganttUI.critical ? 'checked' : ''} onchange="ganttUI.critical=this.checked;render()"> 仅看关键路径</label>
    <span class="grow"></span>
    <span class="legend"><span><i class="lg-crit"></i>关键路径（浮动 ≤ 2 天）</span><span><i style="background:#e5484d"></i>延期</span></span>
    <button class="btn" onclick="openTask()">+ 新建任务</button>
  </div>
  <div class="card nopad"><div class="gantt"><div class="g-inner" style="width:${W}px">
    <div class="g-head" style="height:${HH}px"><div class="g-label head" style="width:${LW}px;height:${HH}px">任务 / 负责人</div><div class="g-days">${sprintBands}${head}</div></div>
    <div class="g-body">${bg}${rows}
      <svg class="g-svg" style="left:${LW}px;width:${days * DW}px;height:${y}px"><defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#9aa0b5"/></marker></defs>${arrows}</svg>
      ${vline(TODAY, 'today', '今天')}${msLines}
    </div>
  </div></div></div>
  <p class="muted sm">关键路径算法：从里程碑日期倒推每个任务的"最晚完成时间"，与计划完成时间之差即浮动时间。浮动时间越小，任何延误越会直接推迟里程碑。</p>`;
}

// ---------- 页面：看板 ----------
const boardUI = { sprint: null, disc: '全部' };
function renderBoard() {
  const sp = boardUI.sprint || curSprint().id;
  const ts = S.tasks.filter(t => (sp === '全部' || t.sprint === sp) && (boardUI.disc === '全部' || t.disc === boardUI.disc));
  const spObj = S.sprints.find(s => s.id === sp);
  const cols = Object.entries(STATUS).map(([k, v]) => {
    const list = ts.filter(t => t.status === k).sort((a, b) => a.pri.localeCompare(b.pri));
    return `<div class="col" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="dropTask(event,'${k}');this.classList.remove('over')">
      <div class="col-h"><b>${v}</b><span class="count">${list.length}</span><span class="muted sm">${list.reduce((a, t) => a + t.est, 0)} 人日</span></div>
      ${list.map(card).join('')}</div>`;
  }).join('');
  const tot = ts.reduce((a, t) => a + t.est, 0), done = ts.filter(t => t.status === 'done').reduce((a, t) => a + t.est, 0);
  return `
  <div class="toolbar">
    <select onchange="boardUI.sprint=this.value;render()">${['全部', ...S.sprints.map(s => s.id)].map(id => `<option value="${id}" ${id === sp ? 'selected' : ''}>${id === '全部' ? '全部迭代' : S.sprints.find(s => s.id === id).name + (id === curSprint().id ? '（当前）' : '')}</option>`).join('')}</select>
    ${['全部', ...Object.keys(DISCIPLINES)].map(k => `<button class="chip ${boardUI.disc === k ? 'on' : ''}" onclick="boardUI.disc='${k}';render()">${k}</button>`).join('')}
    <span class="grow"></span>
    <span class="muted sm">${spObj ? `🎯 迭代目标：${esc(spObj.goal)} · ` : ''}已完成 ${done}/${tot} 人日</span>
    <button class="btn" onclick="openTask()">+ 新建任务</button>
  </div>
  <div class="board">${cols}</div>
  <p class="muted sm">提示：拖拽卡片可变更状态；卡片按优先级排序；"验收中"代表开发完成待策划/测试验收，是游戏项目中最容易被忽视的环节。</p>`;
}

function card(t) {
  const od = isOverdue(t), bl = blocked(t);
  return `<div class="tcard" draggable="true" ondragstart="event.dataTransfer.setData('id','${t.id}')" onclick="openTask('${t.id}')" style="--c:${DISCIPLINES[t.disc]}">
    <div class="tc-top"><em class="pri" style="background:${PRI_COLOR[t.pri]}">${t.pri}</em><span class="muted sm">${t.id}</span><span class="disc">${t.disc}</span></div>
    <div class="tc-title">${esc(t.title)}</div>
    ${t.status !== 'done' && t.status !== 'todo' ? progressBar(t.progress) : ''}
    <div class="tc-foot"><span>👤 ${esc(t.owner)}</span><span>${t.est} 人日</span><span class="${od ? 'red' : ''}">📅 ${md(t.end)}</span></div>
    ${od || bl ? `<div class="tc-flags">${od ? '<em class="tag r">已延期</em>' : ''}${bl ? '<em class="tag y">前置未完成</em>' : ''}</div>` : ''}
  </div>`;
}

function dropTask(ev, status) {
  ev.preventDefault();
  const t = taskById(ev.dataTransfer.getData('id'));
  if (!t || t.status === status) return;
  setTaskStatus(t, status);
  save(); render(); toast(`${t.id} → ${STATUS[status]}`);
}
function setTaskStatus(t, status) {
  if (status === 'done') { t.progress = 100; t.doneDate = t.doneDate || TODAY; }
  else { t.doneDate = null; if (t.progress === 100) t.progress = 90; if (status === 'todo') t.progress = 0; }
  t.status = status;
}

// ---------- 弹窗 ----------
function modal(title, body, onSave) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = body;
  $('#modal-save').style.display = onSave ? '' : 'none';
  $('#modal-save').onclick = () => { if (onSave() !== false) closeModal(); };
  $('#modal').classList.add('show');
}
function closeModal() { $('#modal').classList.remove('show'); }
const field = (label, input, full) => `<label class="field ${full ? 'full' : ''}"><span>${label}</span>${input}</label>`;
const sel = (id, opts, v) => `<select id="${id}">${opts.map(o => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${val == v ? 'selected' : ''}>${esc(txt)}</option>`; }).join('')}</select>`;
const inp = (id, v, type = 'text', extra = '') => `<input id="${id}" type="${type}" value="${esc(v)}" ${extra}>`;
const val = id => $('#' + id).value.trim();

function openTask(id) {
  const t = id ? taskById(id) : { id: 'T' + (Math.max(...S.tasks.map(x => +x.id.slice(1))) + 1), title: '', disc: '程序', owner: '', ms: curMs().id, sprint: curSprint().id, pri: 'P1', est: 3, start: TODAY, end: d(5), status: 'todo', progress: 0, deps: [], doneDate: null };
  const slack = computeSlack()[t.id];
  const info = id ? `<div class="info full">${isOverdue(t) ? '<em class="tag r">已延期</em>' : ''}${blocked(t) ? '<em class="tag y">前置未完成</em>' : ''}${t.status !== 'done' ? `<span class="muted sm">浮动时间 ${slack} 天${slack <= 2 ? '（关键路径，延误将直接影响里程碑）' : ''}</span>` : ''}</div>` : '';
  modal(id ? `编辑任务 ${t.id}` : '新建任务', `<div class="form">${info}
    ${field('任务名称', inp('f-title', t.title), true)}
    ${field('工种', sel('f-disc', Object.keys(DISCIPLINES), t.disc))}
    ${field('负责人', sel('f-owner', workers().map(m => [m.name, `${m.name}（${m.role}）`]), t.owner))}
    ${field('优先级', sel('f-pri', ['P0', 'P1', 'P2', 'P3'], t.pri))}
    ${field('状态', sel('f-status', Object.entries(STATUS), t.status))}
    ${field('迭代', sel('f-sprint', S.sprints.map(s => [s.id, s.name]), t.sprint))}
    ${field('里程碑', sel('f-ms', S.milestones.map(m => [m.id, m.name]), t.ms))}
    ${field('开始日期', inp('f-start', t.start, 'date'))}
    ${field('结束日期', inp('f-end', t.end, 'date'))}
    ${field('估算（人日）', inp('f-est', t.est, 'number', 'min="0.5" step="0.5"'))}
    ${field('进度 %', inp('f-prog', t.progress, 'number', 'min="0" max="100" step="5"'))}
    ${field('前置依赖（任务 ID，逗号分隔）', inp('f-deps', (t.deps || []).join(', ')), true)}
    ${id ? `<div class="full"><button class="btn danger sm" onclick="delTask('${t.id}')">删除任务</button></div>` : ''}
  </div>`, () => {
    const title = val('f-title');
    if (!title) { toast('请填写任务名称'); return false; }
    if (val('f-end') < val('f-start')) { toast('结束日期不能早于开始日期'); return false; }
    const deps = val('f-deps').split(/[,，\s]+/).filter(Boolean).map(s => s.toUpperCase());
    const bad = deps.filter(x => x === t.id || !taskById(x));
    if (bad.length) { toast('无效的依赖：' + bad.join(', ')); return false; }
    Object.assign(t, { title, disc: val('f-disc'), owner: val('f-owner'), pri: val('f-pri'), sprint: val('f-sprint'), ms: val('f-ms'), start: val('f-start'), end: val('f-end'), est: +val('f-est') || 1, progress: clamp(+val('f-prog') || 0, 0, 100), deps });
    setTaskStatus(t, val('f-status'));
    if (!id) S.tasks.push(t);
    save(); render(); toast('已保存');
  });
}
function delTask(id) {
  if (!confirm('确定删除该任务？')) return;
  S.tasks = S.tasks.filter(t => t.id !== id);
  S.tasks.forEach(t => { t.deps = (t.deps || []).filter(x => x !== id); });
  save(); closeModal(); render();
}

// ---------- 页面：缺陷 ----------
const bugUI = { sev: '全部', status: '未关闭', mod: '全部', q: '' };
function renderBugs() {
  const b = bugStats();
  const mods = [...new Set(S.bugs.map(x => x.mod))];
  const labels = [], found = [], closed = [], open = [], N = 35;
  for (let i = -N; i <= 0; i++) {
    const day = d(i);
    labels.push(md(day));
    const f = S.bugs.filter(x => x.created <= day).length, c = S.bugs.filter(x => x.closed && x.closed <= day).length;
    found.push(f); closed.push(c); open.push(f - c);
  }
  const chart = lineChart({ labels, series: [{ name: '累计发现', color: '#e5484d', data: found }, { name: '累计关闭', color: '#30a46c', data: closed }, { name: '未关闭', color: '#5b6cff', data: open, area: true }], h: 230 });
  const byMod = mods.map(m => [m, S.bugs.filter(x => isOpen(x) && x.mod === m).length]).sort((a, c) => c[1] - a[1]);

  const list = S.bugs.filter(x =>
    (bugUI.sev === '全部' || x.sev === bugUI.sev) &&
    (bugUI.status === '全部' || (bugUI.status === '未关闭' ? isOpen(x) : x.status === bugUI.status)) &&
    (bugUI.mod === '全部' || x.mod === bugUI.mod) &&
    (!bugUI.q || (x.title + x.id + x.owner).toLowerCase().includes(bugUI.q.toLowerCase()))
  ).sort((a, c) => 'SABC'.indexOf(a.sev) - 'SABC'.indexOf(c.sev) || c.created.localeCompare(a.created));

  const sevCards = ['S', 'A', 'B', 'C'].map(s => {
    const n = S.bugs.filter(x => isOpen(x) && x.sev === s).length;
    const desc = { S: '崩溃/阻断/付费异常', A: '主要功能错误', B: '次要功能/表现问题', C: '体验优化/文本' }[s];
    return `<div class="card sev" style="--c:${SEV_COLOR[s]}"><div class="sev-k">${s} 级</div><div class="big">${n}</div><div class="muted sm">${desc}</div></div>`;
  }).join('');

  return `
  <div class="grid5">${sevCards}<div class="card sev" style="--c:#5b6cff"><div class="sev-k">近 7 日</div><div class="big">+${b.newN} / -${b.closedN}</div><div class="muted sm">${b.closedN >= b.newN ? '✅ 正在收敛' : '⚠️ 发现快于修复'} · 延期 ${b.deferred}</div></div></div>
  <div class="grid2 r21">
    <div class="card"><div class="card-h"><h3>Bug 收敛曲线</h3><span class="muted sm">"未关闭"曲线持续下降，是版本可封版的核心信号</span></div>${chart}</div>
    <div class="card"><div class="card-h"><h3>未关闭 Bug 模块分布</h3></div>${hbars(byMod, '#5b6cff')}<p class="muted sm">集中度高的模块，需要在站会中拉通负责人评估是否需要加人或重构。</p></div>
  </div>
  <div class="card">
    <div class="toolbar">
      ${sel('bf-sev', [['全部', '全部级别'], 'S', 'A', 'B', 'C'], bugUI.sev).replace('<select', `<select onchange="bugUI.sev=this.value;render()"`)}
      ${sel('bf-st', [['未关闭', '未关闭'], ['全部', '全部状态'], ...BUG_STATUS], bugUI.status).replace('<select', `<select onchange="bugUI.status=this.value;render()"`)}
      ${sel('bf-mod', [['全部', '全部模块'], ...mods], bugUI.mod).replace('<select', `<select onchange="bugUI.mod=this.value;render()"`)}
      <input placeholder="搜索标题/ID/负责人" value="${esc(bugUI.q)}" onchange="bugUI.q=this.value;render()">
      <span class="grow"></span><span class="muted sm">${list.length} 条</span>
      <button class="btn" onclick="openBug()">+ 提交 Bug</button>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>ID</th><th>级别</th><th>标题</th><th>模块</th><th>负责人</th><th>创建</th><th>状态</th></tr></thead>
      <tbody>${list.map(x => `<tr><td class="muted">${x.id}</td><td><em class="sevtag" style="background:${SEV_COLOR[x.sev]}">${x.sev}</em></td><td>${esc(x.title)}</td><td>${x.mod}</td><td>${esc(x.owner)}</td><td class="muted">${md(x.created)}</td>
        <td><select class="mini st-${x.status}" onchange="setBug('${x.id}',this.value)">${BUG_STATUS.map(s => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
function setBug(id, status) {
  const b = S.bugs.find(x => x.id === id);
  b.status = status;
  b.closed = status === '已关闭' ? TODAY : null;
  save(); render(); toast(`${id} → ${status}`);
}
function openBug() {
  const mods = [...new Set(S.bugs.map(x => x.mod))];
  modal('提交 Bug', `<div class="form">
    ${field('标题', inp('b-title', ''), true)}
    ${field('级别', sel('b-sev', [['S', 'S - 崩溃/阻断'], ['A', 'A - 主要功能错误'], ['B', 'B - 次要问题'], ['C', 'C - 体验优化']], 'B'))}
    ${field('模块', sel('b-mod', mods, mods[0]))}
    ${field('负责人', sel('b-owner', workers().map(m => m.name), ''))}
    ${field('版本', inp('b-ver', 'CBT1-0.8'))}
  </div>`, () => {
    const title = val('b-title');
    if (!title) { toast('请填写标题'); return false; }
    S.bugs.push({ id: 'B' + (Math.max(...S.bugs.map(x => +x.id.slice(1))) + 1), title, sev: val('b-sev'), mod: val('b-mod'), owner: val('b-owner'), status: '新建', created: TODAY, closed: null, ver: val('b-ver') });
    save(); render(); toast('已提交');
  });
}

// ---------- 页面：风险 ----------
function renderRisks() {
  const act = S.risks.filter(r => r.status !== '已关闭');
  let grid = '';
  for (let p = 5; p >= 1; p--) {
    grid += `<div class="rm-y">${p}</div>`;
    for (let i = 1; i <= 5; i++) {
      const rs = act.filter(r => r.prob === p && r.impact === i);
      grid += `<div class="rm-cell ${riskLv(p * i)}">${rs.map(r => `<span class="rm-dot" title="${esc(r.title)}" onclick="openRisk('${r.id}')">${r.id}</span>`).join('')}</div>`;
    }
  }
  grid += `<div></div>${[1, 2, 3, 4, 5].map(i => `<div class="rm-x">${i}</div>`).join('')}`;
  const list = S.risks.slice().sort((a, b) => (a.status === '已关闭') - (b.status === '已关闭') || riskScore(b) - riskScore(a));
  return `
  <div class="grid2 r12">
    <div class="card"><div class="card-h"><h3>风险矩阵</h3><span class="muted sm">风险值 = 概率 × 影响</span></div>
      <div class="rm"><div class="rm-ylab">发生概率 →</div><div class="rm-grid">${grid}</div><div class="rm-xlab">影响程度 →</div></div>
      <div class="legend center"><span><i style="background:#fde2e2"></i>高（≥15）</span><span><i style="background:#fff1d6"></i>中（8-14）</span><span><i style="background:#e3f5ea"></i>低（≤7）</span></div>
    </div>
    <div class="card"><div class="card-h"><h3>风险登记册</h3><button class="btn" onclick="openRisk()">+ 登记风险</button></div>
      <div class="risk-list">${list.map(r => `<div class="risk ${r.status === '已关闭' ? 'closed' : ''}" onclick="openRisk('${r.id}')">
        <div class="risk-score ${riskLv(riskScore(r))}">${riskScore(r)}</div>
        <div class="grow"><div class="risk-t"><b>${r.id}</b> ${esc(r.title)}</div>
          <div class="muted sm">【${r.cat}】负责人 ${esc(r.owner)} · 触发条件：${esc(r.trigger)}</div>
          <div class="sm">🛡️ 应对：${esc(r.mitigation)}</div><div class="sm muted">🧯 预案：${esc(r.contingency)}</div></div>
        <em class="pill ${r.status === '监控中' ? (riskScore(r) >= 15 ? 'r' : 'y') : r.status === '应对中' ? 'b' : 'g'}">${r.status}</em></div>`).join('')}</div>
    </div>
  </div>`;
}
function openRisk(id) {
  const r = id ? S.risks.find(x => x.id === id) : { id: 'R' + String(S.risks.length + 1).padStart(2, '0'), title: '', cat: '技术', prob: 3, impact: 3, owner: '我', status: '监控中', trigger: '', mitigation: '', contingency: '' };
  const sc = [1, 2, 3, 4, 5];
  modal(id ? `风险 ${r.id}` : '登记风险', `<div class="form">
    ${field('风险描述', inp('r-title', r.title), true)}
    ${field('类别', sel('r-cat', ['技术', '进度', '人员', '资源', '外部', '合规', '产品'], r.cat))}
    ${field('负责人', sel('r-owner', S.members.map(m => m.name), r.owner))}
    ${field('发生概率（1-5）', sel('r-prob', sc, r.prob))}
    ${field('影响程度（1-5）', sel('r-impact', sc, r.impact))}
    ${field('状态', sel('r-status', RISK_STATUS, r.status))}
    ${field('触发条件', inp('r-trigger', r.trigger))}
    ${field('应对措施（降低概率）', `<textarea id="r-mit">${esc(r.mitigation)}</textarea>`, true)}
    ${field('应急预案（发生后）', `<textarea id="r-con">${esc(r.contingency)}</textarea>`, true)}
  </div>`, () => {
    if (!val('r-title')) { toast('请填写风险描述'); return false; }
    Object.assign(r, { title: val('r-title'), cat: val('r-cat'), owner: val('r-owner'), prob: +val('r-prob'), impact: +val('r-impact'), status: val('r-status'), trigger: val('r-trigger'), mitigation: val('r-mit'), contingency: val('r-con') });
    if (!id) S.risks.push(r);
    save(); render(); toast('已保存');
  });
}

// ---------- 页面：资源 ----------
function renderResource() {
  const weeks = weekStarts(8);
  const rows = workers().map(m => {
    const loads = memberLoad(m.name, weeks);
    return `<tr><td><b>${m.name}</b> <span class="muted sm">${m.role}</span></td><td><i class="dot" style="background:${DISCIPLINES[m.disc]}"></i>${m.disc}</td>
      ${loads.map(l => { const p = l / m.cap; return `<td class="heat" style="background:${heatColor(p)}" title="${l.toFixed(1)} / ${m.cap} 人日">${p ? pct(p) : '-'}</td>`; }).join('')}</tr>`;
  }).join('');

  // 调配建议：为超负荷的成员寻找同工种、同一周负载最低的同事
  const sugg = overloads(4).map(o => {
    const weeks4 = weekStarts(4);
    // 优先选择不负责关键路径任务的同事，避免把风险转移到关键路径上
    const slack = computeSlack();
    const onCrit = name => S.tasks.some(t => t.owner === name && t.status !== 'done' && slack[t.id] <= 2);
    const peers = workers().filter(m => m.disc === o.m.disc && m.name !== o.m.name).map(m => ({ m, p: memberLoad(m.name, weeks4)[o.idx] / m.cap, crit: onCrit(m.name) })).sort((a, b) => a.crit - b.crit || a.p - b.p);
    const tasks = S.tasks.filter(t => t.owner === o.m.name && t.status !== 'done' && t.start <= addDays(o.week, 6) && t.end >= o.week).sort((a, b) => a.pri.localeCompare(b.pri) * -1);
    const best = peers[0];
    return `<div class="sugg"><b>${o.m.name}</b> 在 ${md(o.week)} 当周负载 <b class="red">${pct(o.pct)}</b>
      <div class="sm">当周任务：${tasks.map(t => `${t.id}（${t.pri}）`).join('、')}</div>
      <div class="sm">💡 建议：${best && best.p < 0.8 ? `将优先级较低的 <b>${tasks[0]?.id}</b> 拆分或转交给 <b>${best.m.name}</b>（当周负载 ${pct(best.p)}${best.crit ? '，但其负责关键路径任务，需谨慎评估' : '，且不在关键路径上'}）` : '同工种成员负载均较高，建议与制作人沟通：调整排期或申请外部支援'}</div></div>`;
  }).join('') || '<div class="empty">未来 4 周无超负荷成员</div>';

  const discLoad = Object.keys(DISCIPLINES).map(k => {
    const ms = workers().filter(m => m.disc === k);
    const tot = ms.reduce((a, m) => a + memberLoad(m.name, weeks.slice(0, 4)).reduce((x, y) => x + y, 0), 0);
    const cap = ms.reduce((a, m) => a + m.cap * 4, 0);
    return [k, Math.round(tot / cap * 100), DISCIPLINES[k]];
  });

  return `
  <div class="card"><div class="card-h"><h3>成员负载热力图（未来 8 周）</h3><span class="muted sm">负载 = 剩余工作量按剩余工期均摊后 ÷ 周产能（5 人日）</span></div>
    <div class="tbl-wrap"><table class="tbl heatmap"><thead><tr><th>成员</th><th>工种</th>${weeks.map((w, i) => `<th>${i === 0 ? '本周' : 'W+' + i}<br><span class="muted sm">${md(w)}</span></th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="legend"><span><i style="background:${heatColor(0.3)}"></i>&lt; 60% 有余量</span><span><i style="background:${heatColor(0.85)}"></i>60-100% 饱和</span><span><i style="background:${heatColor(1.05)}"></i>100-110% 偏高</span><span><i style="background:${heatColor(1.4)}"></i>&gt; 110% 超负荷</span></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-h"><h3>调配建议</h3><span class="muted sm">未来 4 周</span></div>${sugg}</div>
    <div class="card"><div class="card-h"><h3>工种负载率（未来 4 周，%）</h3></div>${hbars(discLoad)}
      <p class="muted sm">负载率持续偏低的工种同样值得关注：可能是排期未及时拆解，或该工种处于等待上游交付的"空转"状态。</p></div>
  </div>`;
}
function heatColor(p) {
  if (!p) return '#f6f7fb';
  if (p > 1.1) return '#f8b4b4';
  if (p > 1) return '#fcd9a8';
  if (p >= 0.6) return '#c9e8d4';
  return '#e6f4ec';
}

// ---------- 页面：版本发布 ----------
function renderRelease() {
  const ms = curMs(), g = gates(ms);
  const done = S.checklist.filter(c => c.done).length, all = S.checklist.length;
  const autoOk = g.every(x => x.ok), go = autoOk && done === all;
  const cats = [...new Set(S.checklist.map(c => c.cat))];
  return `
  <div class="card verdict ${go ? 'go' : 'nogo'}">
    <div><div class="muted sm">${esc(ms.name)} · 计划 ${ms.date} · 剩余 ${diffDays(TODAY, ms.date)} 天</div>
    <div class="vd-big">${go ? 'GO ✅ 满足发布条件' : 'NO-GO ⛔ 暂不满足发布条件'}</div>
    <div class="muted">自动门禁 ${g.filter(x => x.ok).length}/${g.length} 通过 · 发布检查项 ${done}/${all} 完成</div></div>
    <div class="ring" style="--p:${(g.filter(x => x.ok).length + done) / (g.length + all) * 100}"><span>${pct((g.filter(x => x.ok).length + done) / (g.length + all))}</span></div>
  </div>
  <div class="grid2 r12">
    <div class="card"><div class="card-h"><h3>质量门禁（自动判定）</h3></div>
      ${g.map(x => `<div class="gate ${x.ok ? 'ok' : 'no'}"><span>${x.ok ? '✅' : '❌'}</span><span class="grow">${x.name}</span><b>${x.val}</b></div>`).join('')}
      <p class="muted sm">门禁规则由项目组在里程碑启动时共同约定，到期由数据说话，避免"带病上线"或因主观判断反复拉扯。</p>
      <div class="card-h" style="margin-top:14px"><h3>里程碑验收标准</h3></div>
      <ul class="ul">${ms.gates.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </div>
    <div class="card"><div class="card-h"><h3>发布检查清单</h3><span class="muted sm">点击勾选</span></div>
      <div class="cl-grid">${cats.map(c => {
        const items = S.checklist.filter(x => x.cat === c);
        return `<div class="cl"><div class="cl-h"><b>${c}</b><span class="muted sm">${items.filter(x => x.done).length}/${items.length}</span></div>
        ${items.map(x => `<label class="cl-i ${x.done ? 'done' : ''}"><input type="checkbox" ${x.done ? 'checked' : ''} onchange="toggleCheck('${x.id}')"> ${esc(x.text)}</label>`).join('')}</div>`;
      }).join('')}</div>
    </div>
  </div>`;
}
function toggleCheck(id) { const c = S.checklist.find(x => x.id === id); c.done = !c.done; save(); render(); }

// ---------- 页面：决策日志 ----------
function renderDecisions() {
  const list = S.decisions.slice().sort((a, b) => b.date.localeCompare(a.date));
  return `
  <div class="toolbar"><span class="muted">记录"为什么这么做"——三个月后没人记得当初的理由，但每个人都会问。</span><span class="grow"></span><button class="btn" onclick="openDecision()">+ 记录决策</button></div>
  <div class="dlog">${list.map(x => `<div class="dl-item"><div class="dl-date">${x.date}</div><div class="card dl-card">
    <div class="dl-topic">${esc(x.topic)}</div><div class="dl-dec">📌 ${esc(x.decision)}</div>
    <div class="sm"><span class="muted">原因：</span>${esc(x.reason)}</div><div class="sm"><span class="muted">影响：</span>${esc(x.impact)}</div>
    <div class="muted sm">决策人：${esc(x.owner)}</div></div></div>`).join('')}</div>`;
}
function openDecision() {
  modal('记录决策', `<div class="form">
    ${field('议题', inp('d-topic', ''), true)}
    ${field('决策内容', `<textarea id="d-dec"></textarea>`, true)}
    ${field('决策原因', `<textarea id="d-reason"></textarea>`, true)}
    ${field('影响范围', inp('d-impact', ''), true)}
    ${field('决策人', sel('d-owner', S.members.map(m => m.name), '王岚'))}
    ${field('日期', inp('d-date', TODAY, 'date'))}
  </div>`, () => {
    if (!val('d-topic') || !val('d-dec')) { toast('请填写议题和决策内容'); return false; }
    S.decisions.push({ date: val('d-date'), topic: val('d-topic'), decision: val('d-dec'), reason: val('d-reason'), impact: val('d-impact'), owner: val('d-owner') });
    save(); render(); toast('已记录');
  });
}

// ---------- 页面：设计思路 ----------
function renderAbout() {
  return `<div class="about">
  <div class="card hero"><h2>为什么做这个系统？</h2>
    <p>Jira、TAPD、飞书项目解决的是"<b>记录</b>"的问题；项目经理每天真正要回答的是另外三个问题：</p>
    <div class="q3"><div><b>① 我们能按时交付吗？</b><span>进度透明</span></div><div><b>② 什么会让我们交付不了？</b><span>风险前置</span></div><div><b>③ 现在该做什么决定？</b><span>决策可追溯</span></div></div>
    <p>GamePM 不打算取代任务工具，它是叠在任务数据之上的<b>项目经理驾驶舱</b>：把散落的任务、Bug、风险数据加工成可以直接行动的信号。</p>
  </div>

  <div class="card"><h3>游戏项目管理的特殊性</h3>
    <div class="grid2 tight">
      <div class="pt"><b>🎮 多工种长链路</b><p>策划案 → 程序实现 → 美术资源 → 特效/音频 → 测试验收。一个角色上线要经过 5 个工种，任何一环延误都会顺着依赖链传下去。<br>→ <i>甘特图依赖连线 + 关键路径计算</i></p></div>
      <div class="pt"><b>🚩 里程碑与测试节奏驱动</b><p>Demo → Alpha → CBT → OBT。每个节点对外都有承诺（渠道档期、测试资格、宣发），日期刚性很强。<br>→ <i>里程碑时间轴 + Go/No-Go 门禁</i></p></div>
      <div class="pt"><b>🎲 创意不确定性</b><p>"好不好玩"无法提前写进需求文档，体验后推翻重做是常态，需求变更是游戏开发的本质而不是例外。<br>→ <i>需求冻结 + 决策日志记录每次方向调整</i></p></div>
      <div class="pt"><b>📜 强外部约束</b><p>版号、防沉迷、隐私合规、渠道 SDK、外包交付——这些不在团队掌控内，却往往决定上线日期。<br>→ <i>风险登记册 + 发布检查清单的合规/渠道项</i></p></div>
    </div>
  </div>

  <div class="card"><h3>模块设计与 PM 工作的对应</h3>
    <table class="tbl"><thead><tr><th>模块</th><th>解决的问题</th><th>关键设计</th></tr></thead><tbody>
      <tr><td>项目总览</td><td>每天早上 5 分钟掌握全局</td><td>四维健康度（进度/质量/风险/资源）红黄绿灯；<b>"今日关注"由规则自动生成</b>，PM 不需要自己翻数据找问题</td></tr>
      <tr><td>里程碑与排期</td><td>哪些任务一延误就会推迟里程碑</td><td>从里程碑倒推最晚完成时间，计算浮动时间，识别关键路径；依赖连线暴露跨工种交接点</td></tr>
      <tr><td>迭代看板</td><td>两周节奏内的执行透明</td><td>单独设置"验收中"列：游戏开发中"做完了"≠"策划验收通过"，这是最常见的隐性延期</td></tr>
      <tr><td>质量与缺陷</td><td>版本什么时候能封</td><td>S/A/B/C 分级对应游戏行业通用标准；<b>收敛曲线</b>比 Bug 总数更能说明问题</td></tr>
      <tr><td>风险管理</td><td>把"担心"变成"预案"</td><td>概率×影响矩阵；每个风险必须有<b>触发条件</b>、应对措施（事前）与应急预案（事后）</td></tr>
      <tr><td>资源负载</td><td>谁忙不过来，谁在等待</td><td>按剩余工作量均摊计算负载；对超负荷成员<b>自动给出同工种调配建议</b></td></tr>
      <tr><td>版本发布</td><td>能不能上线</td><td>门禁规则提前约定、到期由数据自动判定，让 Go/No-Go 会议讨论"怎么办"而不是"是不是"</td></tr>
      <tr><td>决策日志</td><td>为什么当初这么定</td><td>记录原因与影响，减少反复讨论，也为项目复盘积累素材</td></tr>
      <tr><td>一键周报</td><td>向上汇报与跨团队同步</td><td>从数据自动生成结构化周报，PM 只需补充判断与需要协调的事项</td></tr>
    </tbody></table>
  </div>

  <div class="grid2">
    <div class="card"><h3>核心指标口径</h3>
      <ul class="ul">
        <li><b>SPI 进度绩效指数</b> = 挣值 EV ÷ 计划值 PV。EV 按任务实际进度，PV 按计划工期线性分摊；&lt; 0.95 关注，&lt; 0.85 预警</li>
        <li><b>燃尽图</b>：以人日为单位，理想线 vs 实际剩余，判断迭代是否能按期完成</li>
        <li><b>Bug 收敛</b>：近 7 日关闭数 ≥ 新增数；未关闭曲线拐头向下是封版前提</li>
        <li><b>负载率</b> = 当周分摊工作量 ÷ 周产能；&gt; 110% 视为超负荷</li>
        <li><b>风险值</b> = 概率(1-5) × 影响(1-5)；≥ 15 为高风险，必须启动应对</li>
        <li><b>浮动时间</b> = 最晚完成时间 − 计划完成时间；≤ 2 天视为关键路径</li>
      </ul>
    </div>
    <div class="card"><h3>设计取舍</h3>
      <ul class="ul">
        <li><b>不做工时打卡</b>：游戏研发是创意工作，按小时管控会伤害团队信任，人日估算 + 进度百分比的粒度足够做决策</li>
        <li><b>规则自动化优先</b>：PM 的时间应该花在沟通和决策上，而不是整理表格</li>
        <li><b>"建议"而不是"命令"</b>：系统只给出调配建议，最终决定需要与成员和主管沟通</li>
        <li><b>纯前端、零依赖</b>：打开即用，数据保存在本地浏览器，方便演示</li>
      </ul>
      <h3 style="margin-top:16px">后续迭代方向</h3>
      <ul class="ul">
        <li>对接 TAPD / 飞书项目 API，自动同步任务与缺陷数据</li>
        <li>沉淀历史迭代数据，计算估算偏差系数，让排期越来越准</li>
        <li>测试期接入留存、付费等运营数据，形成"研发—测试—运营"闭环</li>
        <li>基于大模型的周报润色与风险识别（如从会议纪要中提取风险）</li>
      </ul>
    </div>
  </div></div>`;
}

// ---------- 周报 ----------
function openWeekly() {
  const h = health(), ms = h.ms, sp = curSprint();
  const ws = weekStarts(1)[0], we = addDays(ws, 6), from = d(-6);
  const doneT = S.tasks.filter(t => t.doneDate && t.doneDate >= from);
  const doing = S.tasks.filter(t => t.status !== 'done' && t.start <= TODAY);
  const next = S.tasks.filter(t => t.status !== 'done' && ((t.start > TODAY && t.start <= d(7)) || (t.end > TODAY && t.end <= d(7))));
  const dot = { g: '🟢', y: '🟡', r: '🔴' };
  const overall = [h.sched, h.qual, h.risk, h.res].includes('r') ? 'r' : [h.sched, h.qual, h.risk, h.res].includes('y') ? 'y' : 'g';
  const coord = [
    ...S.bugs.filter(b => isOpen(b) && b.sev === 'S').map(b => `S 级 Bug ${b.id}「${b.title}」需 ${b.owner} 优先处理，建议每日同步进展`),
    ...h.high.filter(r => r.status === '监控中').map(r => `高风险 ${r.id}「${r.title}」尚未启动应对，需 ${r.owner} 本周内给出方案`),
    ...overloads(2).map(o => `${o.m.name} ${md(o.week)} 当周负载 ${pct(o.pct)}，需协调任务拆分或调配`),
  ];
  const txt = `【《${S.project.name}》项目周报】${ws} ~ ${we}

一、总体状态：${dot[overall]} ${LV_TEXT[overall]}
  进度 ${dot[h.sched]} SPI ${h.e.spi.toFixed(2)} ｜ 质量 ${dot[h.qual]} 未关闭 ${h.b.open}（S ${h.b.s} / A ${h.b.a}） ｜ 风险 ${dot[h.risk]} 高风险 ${h.high.length} 项 ｜ 资源 ${dot[h.res]} 超负荷 ${h.ov.length} 人次

二、里程碑
  当前目标：${ms.name}（${ms.date}），剩余 ${diffDays(TODAY, ms.date)} 天，整体完成度 ${pct(h.e.ev / h.e.bac)}
  当前迭代：${sp.name}（${md(sp.start)}-${md(sp.end)}）目标：${sp.goal}

三、本周完成（${doneT.length} 项）
${doneT.map(t => `  ✓ ${t.id} ${t.title}（${t.owner}）`).join('\n') || '  无'}

四、进行中（${doing.length} 项）
${doing.map(t => `  · ${t.id} ${t.title} — ${t.owner} ${t.progress}%${isOverdue(t) ? ' ⚠️已延期' : ''}${blocked(t) ? ' ⚠️前置未完成' : ''}`).join('\n')}

五、质量情况
  近 7 日新增 ${h.b.newN} / 关闭 ${h.b.closedN}，${h.b.closedN >= h.b.newN ? '处于收敛状态' : '发现速度快于修复速度，需关注'}；延期处理 ${h.b.deferred} 个

六、重点风险
${S.risks.filter(r => r.status !== '已关闭').sort((a, b) => riskScore(b) - riskScore(a)).slice(0, 4).map(r => `  · [${riskScore(r)}] ${r.title}（${r.owner}，${r.status}）\n    应对：${r.mitigation}`).join('\n')}

七、未来 7 天（启动或到期）
${next.map(t => `  · ${t.id} ${t.title}（${t.owner}，${md(t.start)}-${md(t.end)}）`).join('\n') || '  无'}

八、需要协调 / 决策的事项
${coord.map((c, i) => `  ${i + 1}. ${c}`).join('\n') || '  无'}
`;
  modal('一键生成周报', `<p class="muted sm">由系统数据自动生成，可直接编辑后复制到飞书 / 企业微信 / 邮件。</p><textarea id="weekly" class="weekly">${esc(txt)}</textarea>
    <button class="btn" onclick="copyWeekly()">📋 复制</button>`, null);
}
function copyWeekly() {
  const ta = $('#weekly');
  ta.select();
  // file:// 下 navigator.clipboard 不可用，回退到 execCommand
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(ta.value).then(() => toast('已复制到剪贴板'));
  else { document.execCommand('copy'); toast('已复制到剪贴板'); }
}

function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `gamepm-${TODAY}.json`;
  a.click();
}
function resetData() {
  if (!confirm('将恢复为初始演示数据，你的修改会丢失。确定？')) return;
  localStorage.removeItem(STORE_KEY);
  S = seedData(); save(); render(); toast('已重置');
}

// ---------- 路由 ----------
const PAGES = [
  ['dashboard', '📊', '项目总览', renderDashboard],
  ['gantt', '📅', '里程碑与排期', renderGantt],
  ['board', '🗂️', '迭代看板', renderBoard],
  ['bugs', '🐞', '质量与缺陷', renderBugs],
  ['risks', '⚠️', '风险管理', renderRisks],
  ['resource', '👥', '资源负载', renderResource],
  ['release', '🚀', '版本发布', renderRelease],
  ['decisions', '📌', '决策日志', renderDecisions],
  ['about', '💡', '设计思路', renderAbout],
];
function go(p) { location.hash = p; }
function render() {
  const key = location.hash.slice(1) || 'dashboard';
  const page = PAGES.find(p => p[0] === key) || PAGES[0];
  $('#nav').innerHTML = PAGES.map(p => `<a href="#${p[0]}" class="${p[0] === page[0] ? 'on' : ''}"><span>${p[1]}</span>${p[2]}</a>`).join('');
  $('#page-title').textContent = page[2];
  const ms = curMs();
  $('#proj-meta').textContent = `《${S.project.name}》· ${S.project.genre} · 团队 ${S.members.length} 人`;
  $('#countdown').innerHTML = `距 <b>${esc(ms.name)}</b> 还有 <b class="num">${diffDays(TODAY, ms.date)}</b> 天`;
  $('#view').innerHTML = page[3]();
}
window.addEventListener('hashchange', () => { closeModal(); render(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
render();
