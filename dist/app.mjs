import {
  STORAGE_KEY, STATUSES, PRIORITIES, WORK_TYPES, TASK_SOURCES, TIME_KINDS, taskType, projectSummary, monthlyCareerStats,
  newId, localDate, localDateTime, parseLocalDate, addDays, weekStart, monthKey,
  formatDuration, shortDuration, createInitialState, loadState, saveState, normalizeState,
  createTask, setTaskStatus, startTimer, stopTimer, createManualEntry,
  taskDuration, timeSummary, timeByWorkType, weeklyReport, reportText, safeUrl, parseEstimatedHours
} from './core.mjs';

const viewEl = document.querySelector('#view');
const navEl = document.querySelector('#nav');
const titles = { home: '今日工作', tasks: '我的任务', projects: '项目中心', calendar: '项目排期', portfolio: '我的作品库', video: '视频记录', topics: '内容选题', time: '工时统计', report: '周总结', evidence: '成果档案', data: '数据备份' };
let state;
let loadWarning = '';
try { state = loadState(); } catch (error) { state = createInitialState(); loadWarning = `本地数据读取失败：${error.message}。请先检查或恢复备份。`; }
let currentView = 'home';
let reportWeek = weekStart();
let calendarMonth = monthKey();
let evidenceMonth = monthKey();
let currentProjectId = '';
const filters = { project: '', priority: '', query: '' };
let toastTimeout;

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const project = id => state.projects.find(p => p.id === id);
const projectName = id => project(id)?.name || '未分类项目';
const projectDot = id => `<span class="project-dot" style="background:${/^#[0-9a-fA-F]{6}$/.test(project(id)?.color || '') ? project(id).color : '#b0a79b'}"></span>`;
const priorityPill = p => `<span class="pill ${p === '紧急' ? 'urgent' : p === '重要' ? 'important' : 'normal'}">${p === '紧急' ? '🔥 ' : ''}${esc(p || '普通')}</span>`;
const projectColor = id => /^#[0-9a-fA-F]{6}$/.test(project(id)?.color || '') ? project(id).color : '#b0a79b';
const projectTag = id => `<span class="project-tag" style="--project-color:${projectColor(id)}">${esc(projectName(id))}</span>`;
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

function resultItems() {
  const linked = new Set([...state.evidence, ...state.works].map(e => e.taskId).filter(Boolean));
  return [
    ...state.works.map(w => ({ ...w, output:w.description, kind:'work' })),
    ...state.evidence.map(e => ({ id:e.id, taskId:e.taskId, title:e.title, output:e.output, date:e.date, link:e.link, imageData:e.imageData, projectId:e.projectId || state.tasks.find(t=>t.id===e.taskId)?.projectId, type:state.tasks.find(t=>t.id===e.taskId)?.type || '成果', kind:'evidence' })),
    ...state.tasks.filter(t => t.status === '已完成' && t.deliveredAt && !linked.has(t.id)).map(t => ({ id:t.id, taskId:t.id, title:t.title, output:t.notes || '已完成交付', date:t.deliveredAt.slice(0,10), link:t.deliverableUrl, projectId:t.projectId, type:t.type, kind:'task' }))
  ].sort((a,b) => (b.date || '').localeCompare(a.date || ''));
}
function resultCover(item) {
  const url = safeUrl(item.link);
  const imageUrl = /^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(item.imageData || '') ? item.imageData : url && /\.(?:png|jpe?g|webp|gif|avif)(?:[?#]|$)/i.test(url) ? url : '';
  const type = taskType(item.type);
  const glyph = type === '视频' ? '▶' : type === '内容' ? '✎' : '✦';
  return `<div class="result-cover ${type === '视频' ? 'video-cover' : type === '内容' ? 'content-cover' : ''}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(item.title)} 的成果预览" loading="lazy">` : `<span aria-hidden="true">${glyph}</span>`}</div>`;
}
function resultCard(item, allowDelete = false) {
  return `<article class="result-card">${resultCover(item)}<div class="result-body"><div class="result-kicker">${projectTag(item.projectId)}<span>${esc(taskType(item.type))}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.output)}</p>${item.tags ? `<div class="work-tags">${String(item.tags).split(/[,，]/).map(tag=>tag.trim()).filter(Boolean).map(tag=>`<span>#${esc(tag)}</span>`).join('')}</div>` : ''}<div class="result-foot"><span>${esc((item.date || '').replaceAll('-', '.'))}</span><button class="text-link" data-action="${item.kind === 'work' ? 'edit-work' : item.kind === 'evidence' ? 'edit-evidence' : 'edit-task'}" data-id="${esc(item.id)}">查看记录 →</button></div>${allowDelete && item.kind === 'work' ? `<button class="mini-btn work-delete" data-action="delete-work" data-id="${esc(item.id)}">删除作品</button>` : ''}</div></article>`;
}

function renderHome() {
  const today = localDate(), week = weekStart(), weekData = weeklyReport(state, week);
  const lastWeek = weeklyReport(state, addDays(week, -7));
  const pending = state.tasks.filter(t => t.status !== '已完成');
  const focus = [...pending].sort((a,b) => ({紧急:0,重要:1,普通:2})[a.priority]-({紧急:0,重要:1,普通:2})[b.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))[0];
  const todayTime = timeSummary(state, today, addDays(today, 1));
  const hour = new Date().getHours();
  const greeting = hour < 11 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const activeProjects = state.projects.filter(p => p.status === '进行中' || (!p.status && pending.some(t => t.projectId === p.id))).length;
  const toReview = state.tasks.filter(t => t.status === '已完成' && !state.evidence.some(e => e.taskId === t.id) && !state.works.some(w => w.taskId === t.id)).length;
  const results = resultItems().slice(0, 3);
  const nextTasks = [...pending].filter(t => t.id !== focus?.id).slice(0, 2);
  const delta = weekData.completed.length - lastWeek.completed.length;
  const monthly = monthlyCareerStats(state, monthKey());
  return `${timerBanner()}<div class="hero"><div class="hero-copy"><span class="eyebrow">YOUR CREATIVE DESK · ${esc(today.replaceAll('-', '.'))}</span><h1>${greeting}，设计师 <span aria-hidden="true">👋</span></h1><p>记录创意 · 管理项目 · 沉淀成果</p><div class="hero-focus-list"><strong>今天重点</strong>${focus ? `<span>01　${esc(focus.title)}</span>` : '<span>还没有待推进任务，先为今天安排一项工作吧。</span>'}${nextTasks.map((t,i)=>`<span>0${i+2}　${esc(t.title)}</span>`).join('')}</div><button class="btn primary hero-button" data-action="${focus ? 'start-focus' : 'new-task'}" ${focus ? `data-id="${esc(focus.id)}"` : ''}>${focus ? '开始工作 ↗' : '新建第一项任务 ↗'}</button></div><div class="today-state"><span class="eyebrow">TODAY / 今日状态</span><div><span>待处理任务</span><strong data-count="${pending.filter(t=>t.status==='待开始').length}">${pending.filter(t=>t.status==='待开始').length}</strong></div><div><span>进行中</span><strong data-count="${pending.filter(t=>t.status==='进行中').length}">${pending.filter(t=>t.status==='进行中').length}</strong></div><div><span>今日专注</span><strong>${shortDuration(todayTime.totalMs)}</strong></div></div></div>
    <div class="section-title"><div><span class="eyebrow">FOCUS / 01</span><h2>今日焦点</h2></div><button class="text-link" data-goto="tasks">查看全部任务 →</button></div>
    ${focus ? `<section class="focus-card"><div class="focus-mark">✳</div><div class="focus-content">${projectTag(focus.projectId)}<h3>${esc(focus.title)}</h3><div class="focus-details"><span>${esc(focus.type)}</span><span>截止 ${formatDay(focus.dueDate)}</span><span>${esc(focus.status)}</span></div></div><div class="focus-actions">${priorityPill(focus.priority)}<button class="btn primary" data-action="${state.timer?.taskId === focus.id ? 'stop-timer' : state.timer ? 'edit-task' : 'start-timer'}" data-id="${esc(focus.id)}">${state.timer?.taskId === focus.id ? '暂停并保存' : state.timer ? '查看任务' : '继续工作 →'}</button></div></section>` : `<section class="focus-card focus-empty"><div><h3>给今天一个清晰的开始</h3><p>创建任务后，这里会自动显示最值得先做的一项。</p></div><button class="btn primary" data-action="new-task">新建任务</button></section>`}
    <div class="section-title"><div><span class="eyebrow">INSIGHTS / 02</span><h2>工作数据</h2></div><button class="text-link" data-goto="time">查看工时 →</button></div>
    <div class="insights-grid"><div class="insight-feature"><span>本周完成</span><div><strong data-count="${weekData.completed.length}">${weekData.completed.length}</strong><span>项工作成果</span></div><small>${delta > 0 ? `↑ 比上周多 ${delta} 项` : delta < 0 ? `比上周少 ${Math.abs(delta)} 项` : '与上周持平'}</small></div><div class="insight-small"><span>今日工时</span><strong>${shortDuration(todayTime.totalMs)}</strong><small>每一分钟都有记录</small></div><div class="insight-small"><span>进行项目</span><strong data-count="${activeProjects}">${activeProjects}</strong><small>正在推进的项目</small></div><div class="insight-small"><span>待复盘</span><strong data-count="${toReview}">${toReview}</strong><small>完成后尚未归档证据</small></div></div>
    <div class="section-title"><div><span class="eyebrow">MONTHLY OUTPUT / 03</span><h2>本月工作成果</h2></div><span class="muted-text">${esc(monthKey().replace('-', ' 年 '))} 月</span></div>
    <div class="monthly-grid"><div><span>设计</span><strong>${monthly.counts['设计']}</strong><small>项</small></div><div><span>视频</span><strong>${monthly.counts['视频']}</strong><small>条</small></div><div><span>内容</span><strong>${monthly.counts['内容']}</strong><small>篇</small></div><div><span>涉及项目</span><strong>${monthly.projects}</strong><small>个</small></div></div><p class="monthly-note">本月新建任务 ${monthly.tasks} 项 · 其中临时需求 ${monthly.temporary} 项${monthly.tasks ? `（${Math.round(monthly.temporary/monthly.tasks*100)}%）` : ''}。统计来自实际任务与作品记录。</p>
    <div class="section-title"><div><span class="eyebrow">SELECTED WORK / 04</span><h2>最近成果墙</h2></div><button class="text-link" data-goto="portfolio">查看我的作品库 →</button></div>
    ${results.length ? `<div class="result-grid">${results.map(resultCard).join('')}</div>` : `<div class="panel result-empty"><span class="empty-illustration">✦</span><div><h3>让每份完成的工作都留下痕迹</h3><p>完成任务、新增作品或归档成果后，最近成果会出现在这里。</p></div><button class="btn" data-action="add-evidence">归档成果</button></div>`}`;
}

function taskCard(t) {
  const running = state.timer?.taskId === t.id;
  return `<article class="task-card"><div class="task-top">${projectTag(t.projectId)}${priorityPill(t.priority)}</div>
    <div class="task-title">${esc(t.title)}</div><div class="task-meta"><span class="type-tag">${esc(taskType(t.type))}</span><span>${esc(t.source || '未记录来源')}</span><span>截止 ${formatDay(t.dueDate)}</span></div>
    <div class="task-estimate"><span>预计 ${t.estimatedHours === null || t.estimatedHours === undefined ? '未设置' : `${esc(t.estimatedHours)}h`}</span><span>已投入 ${shortDuration(taskDuration(state, t.id))}</span></div>
    <div class="task-bottom"><div class="task-actions"><button class="mini-btn timer-button ${running ? 'timer-running' : ''}" data-action="${running ? 'stop-timer' : 'start-timer'}" data-id="${esc(t.id)}" title="${running ? '暂停计时' : '开始计时'}">${running ? '■ 暂停计时' : '▷ 开始计时'}</button><button class="mini-btn" data-action="edit-task" data-id="${esc(t.id)}">编辑</button><button class="mini-btn" data-action="delete-task" data-id="${esc(t.id)}" title="删除任务">×</button></div></div>
    <select class="select" data-task-status="${esc(t.id)}" aria-label="修改 ${esc(t.title)} 的状态" style="width:100%;margin-top:10px">${STATUSES.map(s => option(s, `状态：${s}`, t.status)).join('')}</select></article>`;
}
function filteredTasks() {
  return state.tasks.filter(t => (!filters.project || t.projectId === filters.project) && (!filters.priority || t.priority === filters.priority) && (!filters.query || `${t.title} ${projectName(t.projectId)} ${t.type} ${t.source || ''} ${t.notes}`.toLocaleLowerCase().includes(filters.query.toLocaleLowerCase())));
}
function boardMarkup() {
  const tasks = filteredTasks();
  return `<div class="board">${STATUSES.map(status => { const items = tasks.filter(t => t.status === status).sort((a,b) => ({ 紧急: 0, 重要: 1, 普通: 2 })[a.priority] - ({ 紧急: 0, 重要: 1, 普通: 2 })[b.priority] || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')); return `<section class="board-col"><div class="col-head"><span>${status}</span><span class="count">${items.length}</span></div>${items.length ? items.map(taskCard).join('') : empty('暂无任务')}</section>`; }).join('')}</div>`;
}
function renderTasks() {
  return `${timerBanner()}${heading('TASK BOARD', '我的任务', '按状态推进工作，随手计时与记录交付。', '<button class="btn" data-action="add-project">＋ 新增项目</button><button class="btn primary" data-action="new-task">＋ 新建任务</button>')}
    <div class="project-chips">${state.projects.map(p => `<span class="project-chip" style="--project-color:${projectColor(p.id)}">${projectDot(p.id)}${esc(p.name)}<button data-action="delete-project" data-id="${esc(p.id)}" title="删除项目">×</button></span>`).join('')}</div>
    <div class="filterbar"><input id="taskSearch" class="search" placeholder="搜索任务、项目或备注" value="${esc(filters.query)}" aria-label="搜索任务"><select id="projectFilter" class="select" aria-label="按项目筛选">${option('', '全部项目', filters.project)}${state.projects.map(p => option(p.id, p.name, filters.project)).join('')}</select><select id="priorityFilter" class="select" aria-label="按优先级筛选">${option('', '全部优先级', filters.priority)}${PRIORITIES.map(p => option(p, p, filters.priority)).join('')}</select></div><div id="boardContainer">${boardMarkup()}</div>`;
}
function renderProjects() {
  if (currentProjectId) {
    const p = project(currentProjectId);
    if (!p) currentProjectId = '';
    else {
      const summary = projectSummary(state, p.id);
      const tasks = state.tasks.filter(t => t.projectId === p.id);
      const results = resultItems().filter(item => item.projectId === p.id);
      return `<div class="detail-back"><button class="text-link" data-action="project-back">← 返回项目中心</button></div>${heading('PROJECT / DETAIL', p.name, p.description || '项目任务与成果实时关联。', `<button class="btn" data-action="edit-project" data-id="${esc(p.id)}">编辑项目信息</button><button class="btn primary" data-action="project-new-task" data-id="${esc(p.id)}">＋ 添加任务</button>`)}
      <section class="project-detail-top"><div class="panel"><h2>项目信息</h2><div class="detail-facts"><span>状态<strong>${esc(p.status || (summary.inProgress ? '进行中' : summary.completed && !summary.pending ? '已完成' : '规划中'))}</strong></span><span>负责人<strong>${esc(p.owner || '自己')}</strong></span><span>开始时间<strong>${esc(p.startDate || '未设置')}</strong></span><span>结束时间<strong>${esc(p.endDate || '未设置')}</strong></span></div></div><div class="panel"><h2>项目进度</h2><div class="project-progress-number">${summary.progress}<small>%</small></div><div class="progress-track"><span style="width:${summary.progress}%"></span></div><div class="project-metrics"><span>已完成 ${summary.completed}</span><span>进行中 ${summary.inProgress}</span><span>待处理 ${summary.pending}</span></div></div></section>
      <div class="section-title"><div><span class="eyebrow">TASKS</span><h2>关联任务</h2></div></div>${tasks.length ? `<div class="collection-grid">${tasks.map(taskCard).join('')}</div>` : empty('这个项目还没有任务。')}
      <div class="section-title"><div><span class="eyebrow">OUTPUTS</span><h2>成果记录</h2></div><button class="text-link" data-action="project-new-work" data-id="${esc(p.id)}">新增作品 →</button></div>${results.length ? `<div class="result-grid">${results.map(resultCard).join('')}</div>` : empty('完成任务或新增作品、成果档案后，这里会自动汇集。')}`;
    }
  }
  return `${heading('PROJECT HUB', '项目中心', '从大项目看进度、任务和产出；点击卡片进入详情。', '<button class="btn" data-goto="calendar">查看排期日历</button><button class="btn primary" data-action="add-project">＋ 新增项目</button>')}
    <div class="project-center-grid">${state.projects.map(p => { const s=projectSummary(state,p.id); const status=p.status || (s.inProgress ? '进行中' : s.completed && !s.pending ? '已完成' : '规划中'); return `<article class="project-center-card" style="--project-color:${projectColor(p.id)}"><div class="project-center-head">${projectTag(p.id)}<span class="status-chip">${esc(status)}</span></div><h2>${esc(p.name)}</h2><p>${esc(p.description || '点击查看项目任务与成果记录')}</p><div class="progress-label"><span>项目进度</span><strong>${s.progress}%</strong></div><div class="progress-track"><span style="width:${s.progress}%"></span></div><div class="project-metrics"><span>已完成 <strong>${s.completed}</strong></span><span>进行中 <strong>${s.inProgress}</strong></span><span>待处理 <strong>${s.pending}</strong></span></div><div class="output-line">${[...Object.entries(s.outputs).filter(([,count])=>count).map(([type,count])=>`${esc(type)} ${count}`), ...(s.evidenceCount ? [`成果档案 ${s.evidenceCount}`] : [])].join(' · ') || '尚无产出'}</div><div class="project-center-actions"><button class="btn small" data-action="open-project" data-id="${esc(p.id)}">进入项目 →</button><button class="mini-btn" data-action="edit-project" data-id="${esc(p.id)}">编辑</button><button class="mini-btn" data-action="delete-project" data-id="${esc(p.id)}">删除</button></div></article>`; }).join('')}</div>`;
}
function renderPortfolio() {
  const items = resultItems();
  return `${heading('CREATIVE PORTFOLIO', '我的作品库', '每件作品都是可编辑的职业资产，关联项目、任务、封面和成果描述。', '<button class="btn primary" data-action="add-work">＋ 新增作品</button>')}${items.length ? `<div class="result-grid portfolio-grid">${items.map(item=>resultCard(item,true)).join('')}</div>` : `<div class="panel result-empty"><span class="empty-illustration">✦</span><div><h3>从第一件作品开始</h3><p>可直接创建作品档案；已完成任务和成果档案也会自动显示在这里。</p></div><button class="btn" data-action="add-work">新增作品</button></div>`}`;
}
function renderCollection(kind) {
  const video = kind === 'video';
  const items = state.tasks.filter(t => taskType(t.type) === (video ? '视频' : '内容')).sort((a,b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return `${timerBanner()}${heading(video ? 'VIDEO LOG' : 'CONTENT IDEAS', video ? '视频记录' : '内容选题', video ? '这里汇集视频类任务和交付记录。' : '这里汇集内容类任务。', `<button class="btn primary" data-action="${video ? 'new-video' : 'new-topic'}">＋ ${video ? '新建视频任务' : '新建内容任务'}</button>`)}${items.length ? `<div class="collection-grid">${items.map(taskCard).join('')}</div>` : `<div class="panel result-empty"><span class="empty-illustration">${video ? '▶' : '✎'}</span><div><h3>${video ? '还没有视频任务' : '还没有内容任务'}</h3><p>新增相应工作类型的任务，就能在这里集中查看和计时。</p></div><button class="btn" data-action="${video ? 'new-video' : 'new-topic'}">新增任务</button></div>`}`;
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
  const byType = timeByWorkType(state, monday, addDays(monday, 7));
  const maxType = Math.max(1, ...Object.values(byType));
  return `${timerBanner()}${heading('TIME TRACKING', '我的时间去哪了？', '按工作类型、项目和工时性质，看清每一份投入。', `<button class="btn primary" data-action="add-time" ${state.tasks.length ? '' : 'disabled'}>＋ 手动补录</button>`)}
    <div class="cards-grid">${stat('今日工时', shortDuration(daily.totalMs), '◷')}${stat('本周工时', shortDuration(weekly.totalMs), '▤')}${stat('本月工时', shortDuration(monthly.totalMs), '▣')}${stat('累计工时', shortDuration(state.timeEntries.reduce((n,e)=>n+(Number(e.durationMs)||0),0)+(state.timer?Date.now()-Date.parse(state.timer.startedAt):0)), '∑')}</div>
    <section class="panel time-type-panel"><div class="panel-head"><div><span class="eyebrow">THIS WEEK / WORK MIX</span><h2>本周时间分布</h2></div><span class="report-small">按任务工作类型汇总</span></div><div class="time-type-grid">${Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([type,ms],i)=>`<div class="time-type-item"><div><span class="time-type-icon">${['✳','▷','✎','◷'][i%4]}</span><span>${esc(type)}</span></div><strong>${shortDuration(ms)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.round(ms/maxType*100)}%"></div></div></div>`).join('') || empty('本周还没有工时记录。开始任务计时后会自动生成时间分布。')}</div></section>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><h2>本月项目耗时</h2></div><div class="bars">${Object.entries(monthly.byProject).sort((a,b)=>b[1]-a[1]).map(([id,ms]) => `<div class="bar-row"><span class="bar-name" title="${esc(projectName(id))}">${esc(projectName(id))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3,Math.round(ms/maxProject*100))}%"></div></div><span class="bar-value">${shortDuration(ms)}</span></div>`).join('') || empty('本月还没有工时记录。')}</div></section>
    <section class="panel"><div class="panel-head"><h2>本周工时类型</h2></div><div class="bars">${TIME_KINDS.map(k => `<div class="bar-row"><span class="bar-name">${k}</span><div class="bar-track"><div class="bar-fill" style="width:${weekly.totalMs ? Math.round(weekly.byKind[k]/weekly.totalMs*100) : 0}%"></div></div><span class="bar-value">${shortDuration(weekly.byKind[k])}</span></div>`).join('')}</div></section></div>
    <section class="panel" style="margin-top:16px"><div class="panel-head"><h2>工时明细</h2><span class="report-small">最近 40 条</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>任务</th><th>类型</th><th>时长</th><th>说明</th><th></th></tr></thead><tbody>${rows.length ? rows.map(e => `<tr><td class="nowrap">${esc(localDate(e.startedAt))}</td><td class="table-title">${esc(state.tasks.find(t=>t.id===e.taskId)?.title || '已删除任务')}</td><td>${esc(e.kind)}${e.manual ? ' · 补录' : ''}</td><td>${shortDuration(e.durationMs)}</td><td>${esc(e.description || '—')}</td><td><button class="mini-btn" data-action="delete-time" data-id="${esc(e.id)}">删除</button></td></tr>`).join('') : '<tr><td colspan="6">暂无工时记录。可从任务卡开始计时。</td></tr>'}</tbody></table></div></section>`;
}
function renderReport() {
  const r = weeklyReport(state, reportWeek);
  return `${heading('WEEKLY REVIEW', '每周工作总结', '根据实际完成任务、工时和成果自动整理；补充说明可编辑。', '<button class="btn" data-action="copy-report">复制全文</button><button class="btn" data-action="print-report">打印</button><button class="btn primary" data-action="export-report">导出 TXT</button>')}
    <div class="calendar-toolbar"><div class="calendar-title">${r.start} — ${r.end}</div><div class="page-actions"><button class="btn small" data-action="report-prev">← 上周</button><button class="btn small" data-action="report-current">本周</button><button class="btn small" data-action="report-next">下周 →</button></div></div>
    <div class="report-grid"><section class="report-paper"><span class="eyebrow">WEEKLY REPORT</span><h2>品宣工作周报</h2><span class="report-small">${r.start} 至 ${r.end}</span><h3>01 · 本周完成事项</h3>${r.completed.length ? `<ul>${r.completed.map(t=>`<li><strong>${esc(t.title)}</strong>　<span class="muted-text">${esc(projectName(t.projectId))}</span></li>`).join('')}</ul>` : empty('本周暂无已完成任务。将任务设为“已完成”后自动出现在这里。')}
      <h3>02 · 重要成果</h3>${r.evidence.length || r.works.length ? `<ul>${r.evidence.map(e=>`<li><strong>${esc(e.title || e.output)}</strong>　${esc(projectName(e.projectId || state.tasks.find(t=>t.id===e.taskId)?.projectId))}${e.value ? `<br><span class="muted-text">${esc(e.value)}</span>` : ''}</li>`).join('')}${r.works.map(w=>`<li><strong>${esc(w.title)}</strong>　${esc(projectName(w.projectId))}</li>`).join('')}</ul>` : empty('本周暂无成果档案或作品。')}
      <h3>03 · 补充说明</h3><textarea id="reportNote" class="note-editor" placeholder="填写工作亮点、问题、下周计划等；保存后会进入导出内容。">${esc(r.note)}</textarea><div style="text-align:right;margin-top:9px"><button class="btn small subtle" data-action="save-note">保存说明</button></div></section>
    <aside class="section-stack"><section class="panel"><div class="panel-head"><h2>本周数字</h2></div><div class="list-row"><span>完成任务</span><strong>${r.completed.length} 项</strong></div><div class="list-row"><span>参与工作</span><strong>${r.touchedCount} 项</strong></div><div class="list-row"><span>记录工时</span><strong>${shortDuration(r.time.totalMs)}</strong></div><div class="list-row"><span>成果档案 / 作品</span><strong>${r.evidence.length + r.works.length} 条</strong></div></section><section class="panel"><div class="panel-head"><h2>时间结构</h2></div>${Object.entries(r.time.byProject).sort((a,b)=>b[1]-a[1]).map(([id,ms])=>`<div class="list-row"><span>${esc(projectName(id))}</span><strong>${shortDuration(ms)}</strong></div>`).join('') || empty('暂无项目工时。')}<div class="list-row"><span>临时插单</span><strong>${shortDuration(r.time.byKind['临时插单'])}</strong></div><div class="list-row"><span>返工</span><strong>${shortDuration(r.time.byKind['返工'])}</strong></div></section></aside></div>
    <section class="panel writing-helper"><div class="panel-head"><div><span class="eyebrow">WRITING HELPER</span><h2>写作辅助草稿</h2></div></div><p>根据你保存的真实记录生成可编辑文案。此功能在本地运行，不是联网 AI；具体成效请自行核对。</p><div class="page-actions"><button class="btn small" data-action="draft-report">生成周报草稿</button><button class="btn small" data-action="draft-value">生成成果价值描述</button><button class="btn small" data-action="draft-work">整理作品介绍</button><button class="btn small" data-action="copy-draft">复制草稿</button></div><textarea id="draftOutput" class="note-editor" rows="7" placeholder="选择上方功能，草稿会显示在这里；可以直接修改。"></textarea></section>`;
}
function writingDraft(kind) {
  if (kind === 'report') return reportText(state, reportWeek);
  if (kind === 'value') {
    const evidence=[...state.evidence].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
    if (evidence) return `在「${projectName(evidence.projectId || state.tasks.find(t=>t.id===evidence.taskId)?.projectId)}」项目中，完成${evidence.title}。\n完成内容：${evidence.output}\n产生价值：${evidence.value || '请根据实际传播、交付或协作效果补充，勿填写未经验证的数据。'}`;
    const task=[...state.tasks].filter(t=>t.status==='已完成').sort((a,b)=>(b.deliveredAt||'').localeCompare(a.deliveredAt||''))[0];
    return task ? `在「${projectName(task.projectId)}」项目中，完成${task.title}，并按计划交付。\n实际价值：请根据真实使用场景和结果补充。` : '';
  }
  const work=[...state.works].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  return work ? `作品名称：${work.title}\n项目：${projectName(work.projectId)}\n类型：${taskType(work.type)} · 完成时间：${work.date}\n作品介绍：${work.description}\n我的贡献与成果：${work.notes || '请补充你负责的环节和实际效果。'}` : '';
}
function renderEvidence() {
  const items = state.evidence.filter(e => e.date?.slice(0,7) === evidenceMonth).sort((a,b) => b.date.localeCompare(a.date));
  return `${heading('ACHIEVEMENT ARCHIVE', '成果档案', '按月记录完成内容与产生的价值，为复盘和职业展示留下一手资料。', '<button class="btn primary" data-action="add-evidence">＋ 新增成果</button>')}
    <div class="calendar-toolbar"><div class="calendar-title">${evidenceMonth.replace('-', ' 年 ')} 月　<span class="report-small">${items.length} 条成果</span></div><div class="page-actions"><button class="btn small" data-action="evidence-prev">← 上月</button><button class="btn small" data-action="evidence-current">本月</button><button class="btn small" data-action="evidence-next">下月 →</button></div></div>
    <div class="evidence-grid">${items.length ? items.map(e => { const task = state.tasks.find(t=>t.id===e.taskId); const pid=e.projectId || task?.projectId; return `<article class="evidence-card"><div class="evidence-cover">${resultCover({title:e.title,link:e.link,imageData:e.imageData,type:task?.type || '成果'})}</div><div class="evidence-content"><div class="evidence-meta">${projectTag(pid)}<span>${esc(e.date?.replaceAll('-', '.'))}</span></div><h3>${esc(e.title)}</h3><div class="evidence-label">完成内容</div><p>${esc(e.output)}</p>${e.value ? `<div class="evidence-label">产生价值</div><p>${esc(e.value)}</p>` : ''}${e.notes ? `<div class="evidence-label">备注</div><p>${esc(e.notes)}</p>` : ''}${task?.reviewFeedback ? `<div class="evidence-label">审核反馈</div><p>${esc(task.reviewFeedback)}</p>` : ''}<div class="evidence-foot">${aLink(e.link, '打开成果链接') || (e.imageData ? '<span class="muted">已附图片</span>' : '<span class="muted">未添加附件</span>')}<div><button class="mini-btn" data-action="edit-evidence" data-id="${esc(e.id)}">编辑</button><button class="mini-btn" data-action="delete-evidence" data-id="${esc(e.id)}">删除</button></div></div></div></article>`; }).join('') : `<div class="panel" style="grid-column:1/-1">${empty('这个月还没有成果。完成设计稿、视频或活动后，新增一条成果档案。')}</div>`}</div>`;
}
function renderData() {
  const size = new Blob([JSON.stringify(state)]).size;
  return `${heading('DATA & BACKUP', '数据备份与恢复', '所有工作数据只保存在当前浏览器，不需要登录。')}
    <div class="info-box">请定期下载 JSON 备份。浏览器清理数据、换电脑或使用无痕模式时，本地记录可能丢失。恢复备份会替换当前浏览器中的全部工作数据。</div>
    <section class="panel" style="margin-top:18px"><div class="panel-head"><h2>当前数据</h2></div><div class="cards-grid" style="margin-bottom:14px">${stat('任务', state.tasks.length, '▦')}${stat('项目', state.projects.length, '◫')}${stat('作品', state.works.length, '✦')}${stat('成果档案', state.evidence.length, '★')}</div><div class="report-small">另有 ${state.timeEntries.length} 条工时记录 · 数据大小约 ${(size/1024).toFixed(1)} KB · 存储位置：当前浏览器</div></section>
    <section class="panel" style="margin-top:18px"><div class="panel-head"><h2>数据操作</h2></div><div class="backup-card"><div><h3>下载完整备份</h3><p>包含项目、任务、工时、作品、成果档案、图片和周报补充说明。</p></div><button class="btn primary" data-action="download-backup">下载 JSON</button></div><div class="backup-card"><div><h3>从备份恢复</h3><p>选择此前下载的 JSON 文件，确认后覆盖当前数据。</p></div><button class="btn" data-action="select-backup">选择文件</button></div><input type="file" id="backupFile" accept=".json,application/json" hidden></section>`;
}
function render() {
  document.querySelector('#topTitle').textContent = titles[currentView];
  document.querySelector('#todayLabel').textContent = new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'long', day:'numeric', weekday:'long'}).format(new Date());
  navEl.querySelectorAll('[data-view]').forEach(btn => { btn.classList.toggle('active', btn.dataset.view === currentView); btn.setAttribute('aria-current', btn.dataset.view === currentView ? 'page' : 'false'); });
  const views = { home: renderHome, tasks: renderTasks, projects: renderProjects, calendar: renderCalendar, portfolio: renderPortfolio, video: () => renderCollection('video'), topics: () => renderCollection('topics'), time: renderTime, report: renderReport, evidence: renderEvidence, data: renderData };
  viewEl.innerHTML = `<div class="view-enter">${(loadWarning ? `<div class="info-box" style="margin-bottom:18px">${esc(loadWarning)}</div>` : '') + views[currentView]()}</div>`;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) viewEl.querySelectorAll('[data-count]').forEach(el => {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target) || target < 1) return;
    const started = performance.now();
    const animate = now => { if (!el.isConnected) return; const progress = Math.min(1, (now-started)/440); el.textContent = String(Math.round(target*(1-(1-progress)**3))); if (progress<1) requestAnimationFrame(animate); };
    requestAnimationFrame(animate);
  });
}
function goto(view) { if (!titles[view]) return; currentView = view; render(); window.scrollTo({top:0,behavior:'smooth'}); }
function updateBoard() { const el = document.querySelector('#boardContainer'); if (el) el.innerHTML = boardMarkup(); }

function showTask(task = null, defaultType = '设计', defaultProjectId = '') {
  const form = document.querySelector('#taskForm'); form.reset();
  document.querySelector('#taskModalTitle').textContent = task ? '编辑任务' : '新建任务';
  document.querySelector('#taskProject').innerHTML = selectedProjectOptions(task?.projectId || defaultProjectId);
  document.querySelector('#taskType').innerHTML = WORK_TYPES.map(t => option(t,t,task ? taskType(task.type) : defaultType)).join('');
  const fields = task ? {...task,type:taskType(task.type)} : { id:'', title:'', projectId:defaultProjectId, type:defaultType, source:'自主规划', priority:'普通', status:'待开始', startDate:localDate(), dueDate:'', estimatedHours:'', assignedBy:'', deliveredAt:'', notes:'', deliverableUrl:'', revisionLog:'', reviewFeedback:'' };
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
  document.querySelector('#evidenceModalTitle').textContent = item ? '编辑成果档案' : '新增成果档案';
  document.querySelector('#evidenceTask').innerHTML = taskOptions(item?.taskId || '');
  document.querySelector('#evidenceProject').innerHTML = selectedProjectOptions(item?.projectId || '');
  const fields = item || { id:'', taskId:'', projectId:'', date:localDate(), title:'', output:'', value:'', link:'', imageData:'', notes:'' };
  for (const [key,value] of Object.entries(fields)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  document.querySelector('#evidenceImageState').textContent = item?.imageData ? '已保存附件图片。上传新图可替换。' : '';
  openDialog('evidenceDialog');
}
function showProject(item = null) {
  const form = document.querySelector('#projectForm'); form.reset();
  document.querySelector('#projectModalTitle').textContent = item ? '编辑项目' : '新增项目';
  const fields = item || { id:'', name:'', owner:'自己', status:'规划中', startDate:'', endDate:'', description:'', color:'#D97745' };
  for (const [key,value] of Object.entries(fields)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  openDialog('projectDialog');
}
function showWork(item = null, defaultProjectId = '') {
  const form = document.querySelector('#workForm'); form.reset();
  document.querySelector('#workModalTitle').textContent = item ? '编辑作品' : '新增作品';
  document.querySelector('#workProject').innerHTML = selectedProjectOptions(item?.projectId || defaultProjectId);
  document.querySelector('#workTask').innerHTML = taskOptions(item?.taskId || '');
  document.querySelector('#workType').innerHTML = WORK_TYPES.map(t => option(t,t,item ? taskType(item.type) : '设计')).join('');
  const fields = item ? {...item,type:taskType(item.type)} : {id:'',title:'',projectId:defaultProjectId,taskId:'',type:'设计',date:localDate(),description:'',tags:'',link:'',imageData:'',notes:''};
  for (const [key,value] of Object.entries(fields)) if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  document.querySelector('#workImageState').textContent = item?.imageData ? '已保存封面。上传新图可替换。' : '';
  openDialog('workDialog');
}
async function compressedImage(file) {
  if (!file || !file.size) return '';
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) throw new Error('请选择小于 12 MB 的 PNG、JPEG 或 WebP 图片。');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', 0.72);
    if (data.length > 1000000) throw new Error('图片压缩后仍过大，请换一张尺寸更小的图片。');
    return data;
  } finally { bitmap.close(); }
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
    else if (action === 'new-video') showTask(null, '视频');
    else if (action === 'new-topic') showTask(null, '内容');
    else if (action === 'start-focus') {
      if (state.timer?.taskId === id) goto('tasks');
      else if (state.timer) { goto('tasks'); toast('已有任务正在计时，请先暂停。'); }
      else commit(startTimer(state,id), '已开始专注计时');
    }
    else if (action === 'edit-task') showTask(state.tasks.find(t=>t.id===id));
    else if (action === 'delete-task') {
      const task = state.tasks.find(t=>t.id===id); if (!task) return;
      if (!confirm(`删除“${task.title}”？相关工时和成果档案也会删除；已关联作品会保留但解除任务关联。此操作无法撤销。`)) return;
      commit({ ...state, tasks:state.tasks.filter(t=>t.id!==id), timeEntries:state.timeEntries.filter(e=>e.taskId!==id), evidence:state.evidence.filter(e=>e.taskId!==id), works:state.works.map(w=>w.taskId===id?{...w,taskId:''}:w), timer:state.timer?.taskId===id ? null : state.timer }, '任务及关联记录已删除');
    }
    else if (action === 'start-timer') commit(startTimer(state,id), '已开始计时');
    else if (action === 'stop-timer') commit(stopTimer(state), '计时已暂停并保存');
    else if (action === 'add-project') showProject();
    else if (action === 'edit-project') showProject(project(id));
    else if (action === 'open-project') { currentProjectId=id; render(); window.scrollTo(0,0); }
    else if (action === 'project-back') { currentProjectId=''; render(); }
    else if (action === 'project-new-task') showTask(null,'设计',id);
    else if (action === 'project-new-work') showWork(null,id);
    else if (action === 'delete-project') {
      const p = project(id); if (!p) return;
      if (state.tasks.some(t=>t.projectId===id) || state.evidence.some(e=>e.projectId===id) || state.works.some(w=>w.projectId===id)) return toast('项目仍有关联任务、作品或成果档案，请先调整归属。');
      if (confirm(`删除项目“${p.name}”？`)) { currentProjectId=''; commit({...state, projects:state.projects.filter(x=>x.id!==id)}, '项目已删除'); }
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
    else if (['draft-report','draft-value','draft-work'].includes(action)) {
      const draft=writingDraft(action.slice(6));
      if (!draft) return toast('暂无相应记录，请先完成任务或新增作品。');
      document.querySelector('#draftOutput').value=draft;
      toast('已根据实际记录生成草稿，可继续修改');
    }
    else if (action === 'copy-draft') {
      const draft=document.querySelector('#draftOutput')?.value;
      if (!draft) return toast('请先生成或填写草稿。');
      await navigator.clipboard.writeText(draft); toast('草稿已复制');
    }
    else if (action === 'add-evidence') showEvidence();
    else if (action === 'edit-evidence') showEvidence(state.evidence.find(e=>e.id===id));
    else if (action === 'delete-evidence') { if (confirm('删除这条成果档案？')) commit({...state,evidence:state.evidence.filter(e=>e.id!==id)},'成果档案已删除'); }
    else if (action === 'add-work') showWork();
    else if (action === 'edit-work') showWork(state.works.find(w=>w.id===id));
    else if (action === 'delete-work') { if (confirm('删除这件作品档案？关联任务不会删除。')) commit({...state,works:state.works.filter(w=>w.id!==id)},'作品已删除'); }
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
    commit({...state,tasks:updated},event.target.value==='已完成' ? '任务完成！别忘了归档成果 ✦' : '任务状态已更新');
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
document.querySelector('#workTask').addEventListener('change', event => { const task=state.tasks.find(t=>t.id===event.target.value); if (task) { document.querySelector('#workProject').value=task.projectId || ''; document.querySelector('#workType').value=taskType(task.type); } });
document.querySelector('#taskForm').addEventListener('submit', event => {
  event.preventDefault(); const form=event.currentTarget; const fields=Object.fromEntries(new FormData(form));
  if (fields.startDate && fields.dueDate && fields.dueDate < fields.startDate) return toast('截止日期不能早于开始日期。');
  try {
    const existing=state.tasks.find(t=>t.id===fields.id);
    let task;
    if (existing) {
      task={...existing,...fields,title:fields.title.trim(),estimatedHours:parseEstimatedHours(fields.estimatedHours),updatedAt:new Date().toISOString()};
      if (task.status==='已完成' && !task.deliveredAt) task.deliveredAt=localDateTime();
      if (task.status!=='已完成') task.deliveredAt='';
    } else task=createTask(fields);
    if (commit({...state,tasks:existing?state.tasks.map(t=>t.id===task.id?task:t):[...state.tasks,task]},existing?'任务已更新':'任务已创建')) closeDialog('taskDialog');
  } catch (error) { toast(error.message); }
});
document.querySelector('#projectForm').addEventListener('submit', event => {
  event.preventDefault(); const form=event.currentTarget; const name=form.elements.namedItem('name').value.trim();
  if (!name) return toast('请输入项目名称。');
  const fields=Object.fromEntries(new FormData(form));
  const old=state.projects.find(p=>p.id===fields.id);
  if (state.projects.some(p=>p.name===name && p.id!==old?.id)) return toast('已有同名项目。');
  if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) return toast('结束日期不能早于开始日期。');
  const item={...old,...fields,id:old?.id||newId(),name,description:fields.description.trim()};
  if (commit({...state,projects:old?state.projects.map(p=>p.id===item.id?item:p):[...state.projects,item]},old?'项目已更新':'项目已创建')) closeDialog('projectDialog');
});
document.querySelector('#timeForm').addEventListener('submit', event => {
  event.preventDefault(); const fields=Object.fromEntries(new FormData(event.currentTarget));
  if (!state.tasks.some(t=>t.id===fields.taskId)) return toast('请选择关联任务。');
  try { const entry=createManualEntry(fields); if (commit({...state,timeEntries:[...state.timeEntries,entry]},'工时已补录')) closeDialog('timeDialog'); }
  catch (error) { toast(error.message); }
});
document.querySelector('#workForm').addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget; const fields=Object.fromEntries(new FormData(form));
  try {
    const old=state.works.find(w=>w.id===fields.id);
    const file=form.elements.namedItem('imageFile').files?.[0];
    if (file) fields.imageData=await compressedImage(file);
    delete fields.imageFile;
    const item={...old,...fields,id:old?.id||newId(),title:fields.title.trim(),description:fields.description.trim(),tags:fields.tags.trim(),notes:fields.notes.trim()};
    if (commit({...state,works:old?state.works.map(w=>w.id===item.id?item:w):[...state.works,item]},old?'作品已更新':'作品已保存')) closeDialog('workDialog');
  } catch (error) { toast(error.message || '图片处理失败。'); }
});
document.querySelector('#evidenceForm').addEventListener('submit', async event => {
  event.preventDefault(); const form=event.currentTarget; const fields=Object.fromEntries(new FormData(form));
  if (!fields.title.trim() || !fields.output.trim()) return toast('请填写成果标题和完成内容。');
  try {
    const old=state.evidence.find(e=>e.id===fields.id);
    const file=form.elements.namedItem('imageFile').files?.[0];
    if (file) fields.imageData=await compressedImage(file);
    delete fields.imageFile;
    const item={...old,...fields,id:old?.id||newId(),title:fields.title.trim(),output:fields.output.trim(),value:fields.value.trim(),notes:fields.notes.trim()};
    if (commit({...state,evidence:old?state.evidence.map(e=>e.id===item.id?item:e):[...state.evidence,item]},old?'成果档案已更新':'成果已归档')) { evidenceMonth=item.date.slice(0,7); closeDialog('evidenceDialog'); }
  } catch (error) { toast(error.message || '图片处理失败。'); }
});
setInterval(() => { if (!state.timer) return; document.querySelectorAll('[data-live="timer"]').forEach(el => { el.textContent=shortDuration(Date.now()-Date.parse(state.timer.startedAt)); }); }, 1000);
render();
