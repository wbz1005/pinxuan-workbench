import {
  STORAGE_KEY, STATUSES, PRIORITIES, WORK_TYPES, TIME_KINDS,
  newId, localDate, localDateTime, parseLocalDate, addDays, weekStart, monthKey,
  formatDuration, shortDuration, createInitialState, loadState, saveState, normalizeState,
  createTask, setTaskStatus, startTimer, stopTimer, createManualEntry,
  taskDuration, timeSummary, weeklyReport, reportText, safeUrl
} from './core.mjs';

const viewEl = document.querySelector('#view');
const navEl = document.querySelector('#nav');
const titles = { home: '工作首页', tasks: '任务看板', calendar: '日历排期', time: '工时统计', report: '每周总结', evidence: '绩效证据', data: '备份恢复' };
let state;
let loadWarning = '';
try { state = loadState(); } catch (error) { state = createInitialState(); loadWarning = `本地数据读取失败：${error.message}。请先检查或恢复备份。`; }
let currentView = 'home';
let reportWeek = weekStart();
let calendarMonth = monthKey();
let evidenceMonth = monthKey();
const filters = { project: '', priority: '', query: '' };
let toastTimeout;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const project = id => state.projects.find(p => p.id === id);
const projectName = id => project(id)?.name || '未分类项目';
const projectDot = id => `<span class="project-dot" style="background:${/^#[0-9a-fA-F]{6}$/.test(project(id)?.color || '') ? project(id).color : '#b0a79b'}"></span>`;
const priorityPill = p => `<span class="pill ${p === '紧急' ? 'urgent' : p === '重要' ? 'important' : 'normal'}">${esc(p || '普通')}</span>`;
const formatDay = text => text ? `${Number(text.slice(5, 7))}月${Number(text.slice(8, 10))}日` : '未安排';
const option = (value, label, selected) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;
const selectedProjectOptions = selected => `<option value="">未分类项目</option>${state.projects.map(p => option(p.id, p.name, selected)).join('')}`;
const taskOptions = selected => `<option value="">请选择任务</option>${state.tasks.map(t => option(t.id, t.title, selected)).join('')}`;
const aLink = (url, label = '查看成果链接') => { const safe = safeUrl(url); return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : ''; };

function toast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('show'), 3500);
}
function commit(next, message = '已保存到此浏览器') {
  try { saveState(next); state = next; render(); toast(message); return true; }
  catch (error) { toast(`保存失败：${error.name === 'QuotaExceededError' ? '浏览器存储空间不足，请先下载备份。' : error.message}`); return false; }
}
function openDialog(id) { document.getElementById(id).showModal(); }
function closeDialog(id) { document.getElementById(id).close(); }
function download(name, type, content) {
  const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function heading(label, title, description, actions = '') {
  return `<div class="page-head"><div><span class="eyebrow">${esc(label)}</span><h1>${esc(title)}</h1><p>${esc(description)}</p></div><div class="page-actions">${actions}</div></div>`;
}
function stat(label, value, icon, suffix = '') { return `<div class="stat-card"><div class="stat-top"><span class="stat-label">${esc(label)}</span><span class="stat-icon">${icon}</span></div><div class="stat-value">${value}${suffix ? `<small> ${esc(suffix)}</small>` : ''}</div></div>`; }
function empty(message) { return `<div class="empty">${esc(message)}</div>`; }
function timerBanner() {
  if (!state.timer) return '';
  const task = state.tasks.find(t => t.id === state.timer.taskId);
  return `<div class="timer-banner"><span>◷ 正在计时：<strong>${esc(task?.title || '已删除任务')}</strong>　<span data-live="timer">${shortDuration(Date.now() - Date.parse(state.timer.startedAt))}</span></span><button class="btn small" data-action="stop-timer">暂停并保存</button></div>`;
}

function renderHome() {
  const today = localDate(); const week = weekStart(); const weekData = weeklyReport(state, week);
  const pending = state.tasks.filter(t => t.status !== '已完成');
  const urgent = pending.filter(t => t.priority === '紧急');
  const due = [...pending].filter(t => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  const active = [...pending].sort((a, b) => ({ 紧急: 0, 重要: 1, 普通: 2 })[a.priority] - ({ 紧急: 0, 重要: 1, 普通: 2 })[b.priority]).slice(0, 6);
  const todayTime = timeSummary(state, today, addDays(today, 1));
  return `${timerBanner()}<div class="hero"><div><span class="eyebrow">GOOD DAY, CREATOR</span><h1>把每一份创意，都认真记录下来。</h1><p>任务、工时、成果与成长，集中在你的个人工作台。</p></div><div class="hero-art" aria-hidden="true">✳</div></div>
    <div class="cards-grid">${stat('待推进任务', pending.length, '▦')}${stat('紧急任务', urgent.length, '!', '')}${stat('本周完成', weekData.completed.length, '✓')}${stat('今日工时', shortDuration(todayTime.totalMs), '◷')}</div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>优先处理</h2><button class="text-link" data-goto="tasks">查看全部任务 →</button></div>${active.length ? active.map(t => `<div class="list-row"><div class="list-main"><div class="list-title">${esc(t.title)}</div><div class="list-sub">${esc(projectName(t.projectId))} · ${esc(t.status)}</div></div><div class="page-actions">${priorityPill(t.priority)}<button class="mini-btn" data-action="edit-task" data-id="${esc(t.id)}">编辑</button></div></div>`).join('') : empty('目前没有待推进任务。点击右上角新建第一项任务。')}</section>
    <section class="panel"><div class="panel-head"><h2>近期截止</h2><button class="text-link" data-goto="calendar">查看日历 →</button></div>${due.length ? due.map(t => `<div class="list-row"><div class="list-main"><div class="list-title">${esc(t.title)}</div><div class="list-sub">${esc(projectName(t.projectId))}</div></div><span class="mini-date" style="color:${t.dueDate < today ? 'var(--red)' : ''}">${t.dueDate < today ? '已逾期 · ' : ''}${formatDay(t.dueDate)}</span></div>`).join('') : empty('暂无设置截止日期的任务。')}</section></div>`;
}

function taskCard(t) {
  const running = state.timer?.taskId === t.id;
  return `<article class="task-card"><div class="task-top"><span class="project-line">${projectDot(t.projectId)}${esc(projectName(t.projectId))}</span>${priorityPill(t.priority)}</div>
    <div class="task-title">${esc(t.title)}</div><div class="task-meta"><span>${esc(t.type)}</span><span>·</span><span>截止 ${formatDay(t.dueDate)}</span></div>
    <div class="task-bottom"><span class="mini-date ${running ? 'timer-running' : ''}">◷ ${shortDuration(taskDuration(state, t.id))}</span><div class="task-actions"><button class="mini-btn ${running ? 'timer-running' : ''}" data-action="${running ? 'stop-timer' : 'start-timer'}" data-id="${esc(t.id)}" title="${running ? '暂停计时' : '开始计时'}">${running ? '■ 暂停' : '▷ 计时'}</button><button class="mini-btn" data-action="edit-task" data-id="${esc(t.id)}">编辑</button><button class="mini-btn" data-action="delete-task" data-id="${esc(t.id)}" title="删除任务">×</button></div></div>
    <select class="select" data-task-status="${esc(t.id)}" aria-label="修改 ${esc(t.title)} 的状态" style="width:100%;margin-top:10px">${STATUSES.map(s => option(s, `状态：${s}`, t.status)).join('')}</select></article>`;
}
function filteredTasks() {
  return state.tasks.filter(t => (!filters.project || t.projectId === filters.project) && (!filters.priority || t.priority === filters.priority) && (!filters.query || `${t.title} ${projectName(t.projectId)} ${t.type} ${t.notes}`.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())));
}
function boardMarkup() {
  const tasks = filteredTasks();
  return `<div class="board">${STATUSES.map(status => { const items = tasks.filter(t => t.status === status).sort((a,b) => ({ 紧急: 0, 重要: 1, 普通: 2 })[a.priority] - ({ 紧急: 0, 重要: 1, 普通: 2 })[b.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')); return `<section class="board-col"><div class="col-head"><span>${status}</span><span class="count">${items.length}</span></div>${items.length ? items.map(taskCard).join('') : empty('暂无任务')}</section>`; }).join('')}</div>`;
}
function renderTasks() {
  return `${timerBanner()}${heading('TASK BOARD', '任务看板', '按状态推进工作，随手计时与记录交付。', '<button class="btn" data-action="add-project">＋ 新增项目</button><button class="btn primary" data-action="new-task">＋ 新建任务</button>')}
    <div class="project-chips">${state.projects.map(p => `<span class="project-chip">${projectDot(p.id)}${esc(p.name)}<button data-action="delete-project" data-id="${esc(p.id)}" title="删除项目">×</button></span>`).join('')}</div>
    <div class="filterbar"><input id="taskSearch" class="search" placeholder="搜索任务、项目或备注" value="${esc(filters.query)}" aria-label="搜索任务"><select id="projectFilter" class="select" aria-label="按项目筛选">${option('', '全部项目', filters.project)}${state.projects.map(p => option(p.id, p.name, filters.project)).join('')}</select><select id="priorityFilter" class="select" aria-label="按优先级筛选">${option('', '全部优先级', filters.priority)}${PRIORITIES.map(p => option(p, p, filters.priority)).join('')}</select></div><div id="boardContainer">${boardMarkup()}</div>`;
}
function renderCalendar() {
  const [year, month] = calendarMonth.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, month - 1, 1 - startOffset);
  const days = Array.from({length:42}, (_,i) => { const d = new Date(gridStart); d.setDate(d.getDate()+i); return localDate(d); });
  const dayCell = date => { const tasks = state.tasks.filter(t => t.dueDate === date || (t.startDate === date && t.dueDate !== date)); return `<div class="day ${date.slice(0,7) !== calendarMonth ? 'muted' : ''} ${date === localDate() ? 'today' : ''}"><div class="day-num">${Number(date.slice(8))}</div>${tasks.slice(0,3).map(t => `<button class="calendar-task ${t.status === '已完成' ? 'done' : ''}" data-action="edit-task" data-id="${esc(t.id)}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('')}${tasks.length > 3 ? `<div class="calendar-more">另有 ${tasks.length-3} 项</div>` : ''}</div>`; };
  return `${heading('WORK SCHEDULE', '日历排期', '显示任务开始与截止日期；点击任务可编辑。', '<button class="btn primary" data-action="new-task">＋ 新建任务</button>')}
    <div class="calendar-toolbar"><div class="calendar-title">${year} 年 ${month} 月</div><div class="page-actions"><button class="btn small" data-action="calendar-prev">← 上月</button><button class="btn small" data-action="calendar-today">本月</button><button class="btn small" data-action="calendar-next">下月 →</button></div></div>
    <div class="calendar-wrap"><div class="calendar-grid">${['周一','周二','周三','周四','周五','周六','周日'].map(x => `<div class="weekday">${x}</div>`).join('')}${days.map(dayCell).join('')}</div></div>`;
}
function renderTime() {
  const today = localDate(), monday = weekStart();
  const daily = timeSummary(state, today, addDays(today, 1));
  const weekly = timeSummary(state, monday, addDays(monday, 7));
  const monthly = timeSummary(state, `${monthKey()}-01`, addDays(`${monthKey()}-01`, 32).slice(0,7)+'-01');
  const rows = [...state.timeEntries].sort((a,b) => b.startedAt.localeCompare(a.startedAt)).slice(0,40);
  const maxProject = Math.max(1, ...Object.values(monthly.byProject));
  return `${timerBanner()}${heading('TIME TRACKING', '工时统计', '计时自动累计，也可补录临时插单与返工。', `<button class="btn primary" data-action="add-time" ${state.tasks.length ? '' : 'disabled'}>＋ 手动补录</button>`)}
    <div class="cards-grid">${stat('今日工时', shortDuration(daily.totalMs), '◷')}${stat('本周工时', shortDuration(weekly.totalMs), '▤')}${stat('本月工时', shortDuration(monthly.totalMs), '▣')}${stat('累计工时', shortDuration(state.timeEntries.reduce((n,e)=>n+(Number(e.durationMs)||0),0)+(state.timer?Date.now()-Date.parse(state.timer.startedAt):0)), '∑')}</div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>本月项目耗时</h2></div><div class="bars">${Object.entries(monthly.byProject).sort((a,b)=>b[1]-a[1]).map(([id,ms]) => `<div class="bar-row"><span class="bar-name" title="${esc(projectName(id))}">${esc(projectName(id))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,Math.round(ms/maxProject*100))}%"></div></div><span class="bar-value">${shortDuration(ms)}</span></div>`).join('') || empty('本月还没有工时记录。')}</div></section>
    <section class="panel"><div class="panel-head"><h2>本周工时类型</h2></div><div class="bars">${TIME_KINDS.map(k => `<div class="bar-row"><span class="bar-name">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${weekly.totalMs ? Math.round(weekly.byKind[k]/weekly.totalMs*100) : 0}%"></div></div><span class="bar-value">${shortDuration(weekly.byKind[k])}</span></div>`).join('')}</div></section></div>
    <section class="panel" style="margin-top:16px"><div class="panel-head"><h2>工时明细</h2><span class="report-small">最近 40 条</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>任务</th><th>类型</th><th>时长</th><th>说明</th><th></th></tr></thead><tbody>${rows.length ? rows.map(e => `<tr><td class="nowrap">${esc(localDate(e.startedAt))}</td><td class="table-title">${esc(state.tasks.find(t=>t.id===e.taskId)?.title || '已删除任务')}</td><td>${esc(e.kind)}${e.manual ? ' · 补录' : ''}</td><td>${shortDuration(e.durationMs)}</td><td>${esc(e.description || '—')}</td><td><button class="mini-btn" data-action="delete-time" data-id="${esc(e.id)}">删除</button></td></tr>`).join('') : '<tr><td colspan="6">暂无工时记录。可从任务卡开始计时。</td></tr>'}</tbody></table></div></section>`;
}
function renderReport() {
  const r = weeklyReport(state, reportWeek);
  return `${heading('WEEKLY REVIEW', '每周工作总结', '根据实际完成任务、工时和成果自动整理；补充说明可编辑。', '<button class="btn" data-action="copy-report">复制全文</button><button class="btn" data-action="print-report">打印</button><button class="btn primary" data-action="export-report">导出 TXT</button>')}
    <div class="calendar-toolbar"><div class="calendar-title">${r.start} — ${r.end}</div><div class="page-actions"><button class="btn small" data-action="report-prev">← 上周</button><button class="btn small" data-action="report-current">本周</button><button class="btn small" data-action="report-next">下周 →</button></div></div>
    <div class="report-grid"><section class="report-paper"><span class="eyebrow">WEEKLY REPORT</span><h2>品宣工作周报</h2><span class="report-small">${r.start} 至 ${r.end}</span><h3>01 · 本周完成事项</h3>${r.completed.length ? `<ul>${r.completed.map(t=>`<li><strong>${esc(t.title)}</strong>　<span class="muted-text">${esc(projectName(t.projectId))}</span></li>`).join('')}</ul>` : empty('本周暂无已完成任务。将任务设为“已完成”后自动出现在这里。')}
      <h3>02 · 重要成果</h3>${r.evidence.length ? `<ul>${r.evidence.map(e=>`<li><strong>${esc(e.title || e.output)}</strong>　${esc(projectName(e.projectId || state.tasks.find(t=>t.id===e.taskId)?.projectId))}</li>`).join('')}</ul>` : empty('本周暂无绩效证据。')}
      <h3>03 · 补充说明</h3><textarea id="reportNote" class="note-editor" placeholder="填写工作亮点、问题、下周计划等；保存后会进入导出内容。">${esc(r.note)}</textarea><div style="text-align:right;margin-top:9px"><button class="btn small subtle" data-action="save-note">保存说明</button></div></section>
    <aside class="section-stack"><section class="panel"><div class="panel-head"><h2>本周数字</h2></div><div class="list-row"><span>完成任务</span><strong>${r.completed.length} 项</strong></div><div class="list-row"><span>参与工作</span><strong>${r.touchedCount} 项</strong></div><div class="list-row"><span>记录工时</span><strong>${shortDuration(r.time.totalMs)}</strong></div><div class="list-row"><span>成果证据</span><strong>${r.evidence.length} 条</strong></div></section><section class="panel"><div class="panel-head"><h2>时间结构</h2></div>${Object.entries(r.time.byProject).sort((a,b)=>b[1]-a[1]).map(([id,ms])=>`<div class="list-row"><span>${esc(projectName(id))}</span><strong>${shortDuration(ms)}</strong></div>`).join('') || empty('暂无项目工时。')}<div class="list-row"><span>临时插单</span><strong>${shortDuration(r.time.byKind['临时插单'])}</strong></div><div class="list-row"><span>返工</span><strong>${shortDuration(r.time.byKind['返工'])}</strong></div></section></aside></div>`;
}
function renderEvidence() {
  const items = state.evidence.filter(e => e.date?.slice(0,7) === evidenceMonth).sort((a,b) => b.date.localeCompare(a.date));
  return `${heading('PERFORMANCE ARCHIVE', '绩效证据档案', '按月归档交付成果、链接、审核反馈和价值说明。', '<button class="btn primary" data-action="add-evidence">＋ 新增证据</button>')}
    <div class="calendar-toolbar"><div class="calendar-title">${evidenceMonth.replace('-', ' 年 ')} 月　<span class="report-small">${items.length} 条证据</span></div><div class="page-actions"><button class="btn small" data-action="evidence-prev">← 上月</button><button class="btn small" data-action="evidence-current">本月</button><button class="btn small" data-action="evidence-next">下月 →</button></div></div>
    <div class="evidence-grid">${items.length ? items.map(e => { const task = state.tasks.find(t=>t.id===e.taskId); return `<article class="evidence-card"><div class="project-line">${projectDot(e.projectId || task?.projectId)}${esc(projectName(e.projectId || task?.projectId))} · ${esc(e.date)}</div><h3>${esc(e.title)}</h3><p>${esc(e.output)}</p>${task ? `<div class="muted">关联任务：${esc(task.title)}${task.reviewFeedback ? ` · 审核反馈：${esc(task.reviewFeedback)}` : ''}</div>` : ''}${e.notes ? `<p class="muted">备注：${esc(e.notes)}</p>` : ''}<div class="evidence-foot">${aLink(e.link) || '<span class="muted">未添加链接</span>'}<div><button class="mini-btn" data-action="edit-evidence" data-id="${esc(e.id)}">编辑</button><button class="mini-btn" data-action="delete-evidence" data-id="${esc(e.id)}">删除</button></div></div></article>`; }).join('') : `<div class="panel" style="grid-column:1/-1">${empty('这个月还没有证据。完成设计稿、视频或活动后，新增一条成果记录。')}</div>`}</div>`;
}
function renderData() {
  const size = new Blob([JSON.stringify(state)]).size;
  return `${heading('DATA & BACKUP', '数据备份与恢复', '所有工作数据只保存在当前浏览器，不需要登录。')}
    <div class="info-box">请定期下载 JSON 备份。浏览器清理数据、换电脑或使用无痕模式时，本地记录可能丢失。恢复备份会替换当前浏览器中的全部工作数据。</div>
    <section class="panel" style="margin-top:18px"><div class="panel-head"><h2>当前数据</h2></div><div class="cards-grid" style="margin-bottom:14px">${stat('任务', state.tasks.length, '▦')}${stat('项目', state.projects.length, '◫')}${stat('工时记录', state.timeEntries.length, '◷')}${stat('绩效证据', state.evidence.length, '✦')}</div><div class="report-small">数据大小约 ${(size/1024).toFixed(1)} KB · 存储位置：当前浏览器</div></section>
    <section class="panel" style="margin-top:18px"><div class="panel-head"><h2>数据操作</h2></div><div class="backup-card"><div><h3>下载完整备份</h3><p>包含项目、任务、工时、证据和周报补充说明。</p></div><button class="btn primary" data-action="download-backup">下载 JSON</button></div><div class="backup-card"><div><h3>从备份恢复</h3><p>选择此前下载的 JSON 文件，确认后覆盖当前数据。</p></div><button class="btn" data-action="select-backup">选择文件</button></div><input type="file" id="backupFile" accept=".json,application/json" hidden></section>`;
}
function render() {
  document.querySelector('#topTitle').textContent = titles[currentView];
  document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'long', day:'numeric', weekday:'long'}).format(new Date());
  navEl.querySelectorAll('[data-view]').forEach(btn => { btn.classList.toggle('active', btn.dataset.view === currentView); btn.setAttribute('aria-current', btn.dataset.view === currentView ? 'page' : 'false'); });
  const views = { home: renderHome, tasks: renderTasks, calendar: renderCalendar, time: renderTime, report: renderReport, evidence: renderEvidence, data: renderData };
  viewEl.innerHTML = (loadWarning ? `<div class="info-box" style="margin-bottom:18px">${esc(loadWarning)}</div>` : '') + views[currentView]();
}
function goto(view) { if (!titles[view]) return; currentView = view; render(); window.scrollTo({top:0,behavior:'smooth'}); }
function updateBoard() { const el = document.querySelector('#boardContainer'); if (el) el.innerHTML = boardMarkup(); }

function showTask(task = null) {
  const form = document.querySelector('#taskForm'); form.reset();
  document.querySelector('#taskModalTitle').textContent = task ? '编辑任务' : '新建任务';
  document.querySelector('#taskProject').innerHTML = selectedProjectOptions(task?.projectId || '');
  document.querySelector('#taskType').innerHTML = WORK_TYPES.map(t => option(t,t,task?.type || '平面设计')).join('');
  const fields = task || { id:'', title:'', projectId:'', type:'平面设计', priority:'普通', status:'待开始', startDate:localDate(), dueDate:'', assignedBy:'', deliveredAt:'', notes:'', deliverableUrl:'', revisionLog:'', reviewFeedback:'' };
  for (const [key,value] of Object.entries(fields)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  openDialog('taskDialog'); form.elements.namedItem('title').focus();
}
function showTime() {
  const form = document.querySelector('#timeForm'); form.reset();
  document.querySelector('#timeTask').innerHTML = taskOptions('');
  form.elements.namedItem('date').value = localDate(); openDialog('timeDialog');
}
function showEvidence(item = null) {
  const form = document.querySelector('#evidenceForm'); form.reset();
  document.querySelector('#evidenceModalTitle').textContent = item ? '编辑绩效证据' : '新增绩效证据';
  document.querySelector('#evidenceTask').innerHTML = taskOptions(item?.taskId || '');
  document.querySelector('#evidenceProject').innerHTML = selectedProjectOptions(item?.projectId || '');
  const fields = item || { id:'', taskId:'', projectId:'', date:localDate(), title:'', output:'', link:'', notes:'' };
  for (const [key,value] of Object.entries(fields)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  openDialog('evidenceDialog');
}
function changeMonth(current, delta) {
  const [y,m] = current.split('-').map(Number);
  return monthKey(new Date(y,m-1+delta,1));
}

navEl.addEventListener('click', event => { const btn = event.target.closest('[data-view]'); if (btn) goto(btn.dataset.view); });
document.querySelector('#newTaskGlobal').addEventListener('click', () => showTask());
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeDialog(btn.dataset.close)));
viewEl.addEventListener('click', async event => {
  const target = event.target.closest('[data-action],[data-goto]'); if (!target) return;
  if (target.dataset.goto) { goto(target.dataset.goto); return; }
  const { action, id } = target.dataset;
  try {
    if (action === 'new-task') showTask();
    else if (action === 'edit-task') showTask(state.tasks.find(t=>t.id===id));
    else if (action === 'delete-task') {
      const task = state.tasks.find(t=>t.id===id); if (!task) return;
      if (!confirm(`删除“${task.title}”？相关工时和绩效证据也会删除，此操作无法撤销。`)) return;
      commit({ ...state, tasks:state.tasks.filter(t=>t.id!==id), timeEntries:state.timeEntries.filter(e=>e.taskId!==id), evidence:state.evidence.filter(e=>e.taskId!==id), timer:state.timer?.taskId===id ? null : state.timer }, '任务及关联记录已删除');
    }
    else if (action === 'start-timer') commit(startTimer(state,id), '已开始计时');
    else if (action === 'stop-timer') commit(stopTimer(state), '计时已暂停并保存');
    else if (action === 'add-project') { document.querySelector('#projectForm').reset(); openDialog('projectDialog'); }
    else if (action === 'delete-project') {
      const p = project(id); if (!p) return;
      if (state.tasks.some(t=>t.projectId===id) || state.evidence.some(e=>e.projectId===id)) return toast('项目仍有关联任务或证据，请先调整归属。');
      if (confirm(`删除项目“${p.name}”？`)) commit({...state, projects:state.projects.filter(x=>x.id!==id)}, '项目已删除');
    }
    else if (action === 'add-time') showTime();
    else if (action === 'delete-time') { if (confirm('删除这条工时记录？')) commit({...state,timeEntries:state.timeEntries.filter(e=>e.id!==id)},'工时记录已删除'); }
    else if (action === 'calendar-prev' || action === 'calendar-next') { calendarMonth=changeMonth(calendarMonth,action==='calendar-prev'?-1:1); render(); }
    else if (action === 'calendar-today') { calendarMonth=monthKey(); render(); }
    else if (action === 'report-prev' || action === 'report-next') { reportWeek=addDays(reportWeek,action==='report-prev'?-7:7); render(); }
    else if (action === 'report-current') { reportWeek=weekStart(); render(); }
    else if (action === 'save-note') { const note=document.querySelector('#reportNote').value; commit({...state,reportNotes:{...state.reportNotes,[reportWeek]:note}},'周报说明已保存'); }
    else if (action === 'copy-report' || action === 'export-report' || action === 'print-report') {
      const note = document.querySelector('#reportNote')?.value ?? state.reportNotes[reportWeek] ?? '';
      const snapshot={...state,reportNotes:{...state.reportNotes,[reportWeek]:note}};
      if (note !== (state.reportNotes[reportWeek] || '') && !commit(snapshot,'周报说明已保存')) return;
      const content=reportText(snapshot,reportWeek);
      if (action==='copy-report') { await navigator.clipboard.writeText(content); toast('周报已复制到剪贴板'); }
      if (action==='export-report') { download(`品宣周报-${reportWeek}.txt`,'text/plain;charset=utf-8',content); toast('周报已导出'); }
      if (action==='print-report') { document.querySelector('#printArea').textContent=content; window.print(); }
    }
    else if (action === 'add-evidence') showEvidence();
    else if (action === 'edit-evidence') showEvidence(state.evidence.find(e=>e.id===id));
    else if (action === 'delete-evidence') { if (confirm('删除这条绩效证据？')) commit({...state,evidence:state.evidence.filter(e=>e.id!==id)},'证据已删除'); }
    else if (action === 'evidence-prev' || action === 'evidence-next') { evidenceMonth=changeMonth(evidenceMonth,action==='evidence-prev'?-1:1); render(); }
    else if (action === 'evidence-current') { evidenceMonth=monthKey(); render(); }
    else if (action === 'download-backup') { download(`品宣工作台备份-${localDate()}.json`,'application/json;charset=utf-8',JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)); toast('完整备份已下载'); }
    else if (action === 'select-backup') document.querySelector('#backupFile').click();
  } catch (error) { toast(error.message || '操作失败，请重试。'); }
});
viewEl.addEventListener('input', event => { if (event.target.id === 'taskSearch') { filters.query=event.target.value; updateBoard(); } });
viewEl.addEventListener('change', event => {
  if (event.target.id === 'projectFilter') { filters.project=event.target.value; updateBoard(); }
  if (event.target.id === 'priorityFilter') { filters.priority=event.target.value; updateBoard(); }
  if (event.target.dataset.taskStatus) {
    const id=event.target.dataset.taskStatus; const updated=state.tasks.map(t=>t.id===id?setTaskStatus(t,event.target.value):t);
    commit({...state,tasks:updated},'任务状态已更新');
  }
  if (event.target.id === 'backupFile') {
    const file=event.target.files?.[0]; if (!file) return;
    file.text().then(text => {
      const restored=normalizeState(JSON.parse(text));
      if (!confirm(`从“${file.name}”恢复？当前 ${state.tasks.length} 项任务及其他数据将被替换。`)) return;
      if (commit(restored,'备份已恢复')) { loadWarning=''; goto('home'); }
    }).catch(error => toast(`恢复失败：${error.message}`)).finally(()=>{ event.target.value=''; });
  }
});
document.querySelector('#evidenceTask').addEventListener('change', event => { const task=state.tasks.find(t=>t.id===event.target.value); if (task) document.querySelector('#evidenceProject').value=task.projectId || ''; });
document.querySelector('#taskForm').addEventListener('submit', event => {
  event.preventDefault(); const form=event.currentTarget; const fields=Object.fromEntries(new FormData(form));
  if (fields.startDate && fields.dueDate && fields.dueDate < fields.startDate) return toast('截止日期不能早于开始日期。');
  try {
    const existing=state.tasks.find(t=>t.id===fields.id);
    let task;
    if (existing) {
      task={...existing,...fields,title:fields.title.trim(),updatedAt:new Date().toISOString()};
      if (task.status==='已完成' && !task.deliveredAt) task.deliveredAt=localDateTime();
      if (task.status!=='已完成') task.deliveredAt='';
    } else task=createTask(fields);
    if (commit({...state,tasks:existing?state.tasks.map(t=>t.id===task.id?task:t):[...state.tasks,task]},existing?'任务已更新':'任务已创建')) closeDialog('taskDialog');
  } catch (error) { toast(error.message); }
});
document.querySelector('#projectForm').addEventListener('submit', event => {
  event.preventDefault(); const form=event.currentTarget; const name=form.elements.namedItem('name').value.trim();
  if (!name) return toast('请输入项目名称。');
  if (state.projects.some(p=>p.name===name)) return toast('已有同名项目。');
  if (commit({...state,projects:[...state.projects,{id:newId(),name,color:form.elements.namedItem('color').value}]},'项目已创建')) closeDialog('projectDialog');
});
document.querySelector('#timeForm').addEventListener('submit', event => {
  event.preventDefault(); const fields=Object.fromEntries(new FormData(event.currentTarget));
  if (!state.tasks.some(t=>t.id===fields.taskId)) return toast('请选择关联任务。');
  try { const entry=createManualEntry(fields); if (commit({...state,timeEntries:[...state.timeEntries,entry]},'工时已补录')) closeDialog('timeDialog'); }
  catch (error) { toast(error.message); }
});
document.querySelector('#evidenceForm').addEventListener('submit', event => {
  event.preventDefault(); const fields=Object.fromEntries(new FormData(event.currentTarget));
  if (!fields.title.trim() || !fields.output.trim()) return toast('请填写证据标题和输出成果。');
  const old=state.evidence.find(e=>e.id===fields.id);
  const item={...fields,id:old?.id||newId(),title:fields.title.trim(),output:fields.output.trim(),notes:fields.notes.trim()};
  if (commit({...state,evidence:old?state.evidence.map(e=>e.id===item.id?item:e):[...state.evidence,item]},old?'证据已更新':'证据已归档')) { evidenceMonth=item.date.slice(0,7); closeDialog('evidenceDialog'); }
});
setInterval(() => { if (!state.timer) return; document.querySelectorAll('[data-live="timer"]').forEach(el => { el.textContent=shortDuration(Date.now()-Date.parse(state.timer.startedAt)); }); }, 1000);
render();
