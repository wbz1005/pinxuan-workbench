export const STORAGE_KEY = 'pinxuan-workbench-v1';
export const STATUSES = ['待开始', '进行中', '已完成'];
export const PRIORITIES = ['紧急', '重要', '普通'];
export const WORK_TYPES = ['设计', '视频', '内容', '拍摄', '沟通', '物料'];
export const TASK_SOURCES = ['自主规划', '领导安排', '临时需求', '客户需求'];
export const TIME_KINDS = ['常规', '临时插单', '返工'];
export function taskType(type) {
  const legacy = { 平面设计: '设计', 视频剪辑: '视频', 文案策划: '内容', 公众号运营: '内容', 活动执行: '物料', 沟通协调: '沟通' };
  return WORK_TYPES.includes(type) ? type : (legacy[type] || '其他');
}
export function parseEstimatedHours(value) {
  if (value === '' || value === null || value === undefined) return null;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 999) throw new Error('预计工时需在 0 至 999 小时之间。');
  return hours;
}

export const newId = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const pad = n => String(n).padStart(2, '0');
export function localDate(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function localDateTime(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function parseLocalDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text ?? '')) return new Date(NaN);
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(text, days) {
  const d = parseLocalDate(text);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function weekStart(value = new Date()) {
  const d = value instanceof Date ? new Date(value) : parseLocalDate(value);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return localDate(d);
}
export function monthKey(value = new Date()) { return localDate(value).slice(0, 7); }
export function formatDuration(ms) {
  const minutes = Math.round(Math.max(0, Number(ms) || 0) / 60000);
  return `${Math.floor(minutes / 60)}小时${pad(minutes % 60)}分`;
}
export function shortDuration(ms) {
  const minutes = Math.round(Math.max(0, Number(ms) || 0) / 60000);
  if (Number(ms) > 0 && minutes === 0) return '<1m';
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m` : `${minutes}m`;
}

export function createInitialState() {
  const names = ['双师双证培训招生', '公众号运营', '视频剪辑', '门店视觉设计', '客户项目'];
  const colors = ['#D87550', '#7D8F78', '#9A7DAB', '#D9A751', '#6E94A7'];
  return {
    schemaVersion: 1,
    projects: names.map((name, index) => ({ id: newId(), name, color: colors[index] })),
    tasks: [], timeEntries: [], evidence: [], works: [], reportNotes: {}, timer: null
  };
}
export function normalizeState(raw) {
  if (!raw || raw.schemaVersion !== 1 || !Array.isArray(raw.projects) || !Array.isArray(raw.tasks) || !Array.isArray(raw.timeEntries) || !Array.isArray(raw.evidence)) {
    throw new Error('备份文件格式不正确或版本不受支持。');
  }
  const works = raw.works === undefined ? [] : raw.works;
  if (!Array.isArray(works)) throw new Error('备份文件中的作品记录格式不正确。');
  const records = [raw.projects, raw.tasks, raw.timeEntries, raw.evidence, works];
  if (records.some(items => items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || typeof item.id !== 'string'))) {
    throw new Error('备份文件包含无效记录。');
  }
  return {
    schemaVersion: 1,
    projects: raw.projects,
    tasks: raw.tasks,
    timeEntries: raw.timeEntries,
    evidence: raw.evidence,
    works,
    reportNotes: raw.reportNotes && typeof raw.reportNotes === 'object' && !Array.isArray(raw.reportNotes) ? raw.reportNotes : {},
    timer: raw.timer && typeof raw.timer.taskId === 'string' && Number.isFinite(Date.parse(raw.timer.startedAt)) ? raw.timer : null
  };
}
export function loadState(storage = localStorage) {
  const saved = storage.getItem(STORAGE_KEY);
  if (!saved) return createInitialState();
  return normalizeState(JSON.parse(saved));
}
export function saveState(state, storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}
export function createTask(fields, now = new Date()) {
  const title = String(fields.title ?? '').trim();
  if (!title) throw new Error('请填写任务名称。');
  const iso = now.toISOString();
  return {
    id: newId(), title, projectId: String(fields.projectId ?? ''), type: WORK_TYPES.includes(taskType(fields.type)) ? taskType(fields.type) : '设计',
    source: TASK_SOURCES.includes(fields.source) ? fields.source : '自主规划',
    priority: PRIORITIES.includes(fields.priority) ? fields.priority : '普通',
    status: STATUSES.includes(fields.status) ? fields.status : '待开始',
    startDate: fields.startDate || '', dueDate: fields.dueDate || '',
    estimatedHours: parseEstimatedHours(fields.estimatedHours),
    assignedBy: String(fields.assignedBy ?? '').trim(),
    deliveredAt: fields.deliveredAt || (fields.status === '已完成' ? localDateTime(now) : ''),
    notes: String(fields.notes ?? '').trim(), deliverableUrl: String(fields.deliverableUrl ?? '').trim(),
    revisionLog: String(fields.revisionLog ?? '').trim(), reviewFeedback: String(fields.reviewFeedback ?? '').trim(),
    createdAt: iso, updatedAt: iso
  };
}
export function setTaskStatus(task, status, now = new Date()) {
  if (!STATUSES.includes(status)) throw new Error('无效的任务状态。');
  return { ...task, status, deliveredAt: status === '已完成' ? (task.deliveredAt || localDateTime(now)) : '', updatedAt: now.toISOString() };
}
export function startTimer(state, taskId, now = new Date()) {
  if (state.timer) throw new Error('请先暂停当前计时，再开始另一项任务。');
  if (!state.tasks.some(task => task.id === taskId)) throw new Error('任务不存在。');
  return { ...state, timer: { taskId, startedAt: now.toISOString() } };
}
export function stopTimer(state, now = new Date()) {
  if (!state.timer) throw new Error('当前没有正在计时的任务。');
  const started = new Date(state.timer.startedAt);
  const durationMs = Math.max(0, now.getTime() - started.getTime());
  const entry = { id: newId(), taskId: state.timer.taskId, startedAt: started.toISOString(), endedAt: now.toISOString(), durationMs, kind: '常规', manual: false, description: '' };
  return { ...state, timer: null, timeEntries: [...state.timeEntries, entry] };
}
export function createManualEntry({ taskId, date, minutes, kind = '常规', description = '' }) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0 || total > 1440) throw new Error('补录时长需大于 0 且不超过 24 小时。');
  if (!TIME_KINDS.includes(kind)) throw new Error('无效的工时类型。');
  const base = parseLocalDate(date);
  if (!Number.isFinite(base.getTime())) throw new Error('请选择有效日期。');
  base.setHours(0, 0, 0, 0);
  const durationMs = Math.round(total * 60000);
  return { id: newId(), taskId, startedAt: base.toISOString(), endedAt: new Date(base.getTime() + durationMs).toISOString(), durationMs, kind, manual: true, description: String(description).trim() };
}
export function taskDuration(state, taskId, now = new Date()) {
  let total = state.timeEntries.filter(e => e.taskId === taskId).reduce((n, e) => n + (Number(e.durationMs) || 0), 0);
  if (state.timer?.taskId === taskId) total += Math.max(0, now.getTime() - Date.parse(state.timer.startedAt));
  return total;
}
export function entryDurationInRange(entry, from, to) {
  const start = Date.parse(entry.startedAt);
  const end = Date.parse(entry.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(end, to.getTime()) - Math.max(start, from.getTime()));
}
export function timeSummary(state, fromDate, toDateExclusive, now = new Date()) {
  const from = parseLocalDate(fromDate);
  const to = parseLocalDate(toDateExclusive);
  const byProject = {}, byDay = {}, byKind = Object.fromEntries(TIME_KINDS.map(k => [k, 0]));
  let totalMs = 0;
  const entries = [...state.timeEntries];
  if (state.timer) entries.push({ taskId: state.timer.taskId, startedAt: state.timer.startedAt, endedAt: now.toISOString(), kind: '常规' });
  for (const entry of entries) {
    const ms = entryDurationInRange(entry, from, to);
    if (!ms) continue;
    totalMs += ms;
    byKind[entry.kind] = (byKind[entry.kind] || 0) + ms;
    const task = state.tasks.find(t => t.id === entry.taskId);
    const projectId = task?.projectId || 'unassigned';
    byProject[projectId] = (byProject[projectId] || 0) + ms;
    let day = localDate(new Date(Math.max(Date.parse(entry.startedAt), from.getTime())));
    while (day < toDateExclusive) {
      const next = addDays(day, 1);
      const segment = entryDurationInRange(entry, parseLocalDate(day), parseLocalDate(next));
      if (segment) byDay[day] = (byDay[day] || 0) + segment;
      if (next >= toDateExclusive || parseLocalDate(next).getTime() >= Date.parse(entry.endedAt)) break;
      day = next;
    }
  }
  return { totalMs, byProject, byDay, byKind };
}
export function timeByWorkType(state, fromDate, toDateExclusive, now = new Date()) {
  const from = parseLocalDate(fromDate), to = parseLocalDate(toDateExclusive);
  const byType = {};
  const entries = [...state.timeEntries];
  if (state.timer) entries.push({ taskId: state.timer.taskId, startedAt: state.timer.startedAt, endedAt: now.toISOString() });
  for (const entry of entries) {
    const duration = entryDurationInRange(entry, from, to);
    if (!duration) continue;
    const rawType = state.tasks.find(task => task.id === entry.taskId)?.type;
    const type = rawType ? taskType(rawType) : '其他';
    byType[type] = (byType[type] || 0) + duration;
  }
  return byType;
}
export function projectSummary(state, projectId) {
  const tasks = state.tasks.filter(t => t.projectId === projectId);
  const works = (state.works || []).filter(w => w.projectId === projectId);
  const evidenceCount = state.evidence.filter(e => (e.projectId || state.tasks.find(t => t.id === e.taskId)?.projectId) === projectId).length;
  const completed = tasks.filter(t => t.status === '已完成').length;
  const inProgress = tasks.filter(t => t.status === '进行中').length;
  const pending = tasks.length - completed - inProgress;
  const outputs = Object.fromEntries([...WORK_TYPES, '其他'].map(type => [type, 0]));
  const linked = new Set(works.map(w => w.taskId).filter(Boolean));
  for (const work of works) outputs[taskType(work.type)]++;
  for (const task of tasks) if (task.status === '已完成' && !linked.has(task.id)) outputs[taskType(task.type)]++;
  return { total: tasks.length, completed, inProgress, pending, progress: tasks.length ? Math.round(completed / tasks.length * 100) : 0, outputs, works, evidenceCount };
}
export function monthlyCareerStats(state, month) {
  const completed = state.tasks.filter(t => t.status === '已完成' && t.deliveredAt?.slice(0, 7) === month);
  const works = (state.works || []).filter(w => w.date?.slice(0, 7) === month);
  const linked = new Set(works.map(w => w.taskId).filter(Boolean));
  const counts = Object.fromEntries([...WORK_TYPES, '其他'].map(type => [type, 0]));
  for (const work of works) counts[taskType(work.type)]++;
  for (const task of completed) if (!linked.has(task.id)) counts[taskType(task.type)]++;
  const projectIds = new Set([...completed.map(t => t.projectId), ...works.map(w => w.projectId)].filter(Boolean));
  const created = state.tasks.filter(t => (t.createdAt || t.startDate || '').slice(0, 7) === month);
  return { counts, projects: projectIds.size, temporary: created.filter(t => t.source === '临时需求').length, tasks: created.length };
}
export function weeklyReport(state, startDate, now = new Date()) {
  const start = weekStart(startDate);
  const end = addDays(start, 7);
  const completed = state.tasks.filter(t => t.status === '已完成' && t.deliveredAt && t.deliveredAt.slice(0, 10) >= start && t.deliveredAt.slice(0, 10) < end);
  const touchedTaskIds = new Set(completed.map(t => t.id));
  for (const e of state.timeEntries) if (entryDurationInRange(e, parseLocalDate(start), parseLocalDate(end))) touchedTaskIds.add(e.taskId);
  const evidence = state.evidence.filter(e => e.date >= start && e.date < end);
  const works = (state.works || []).filter(w => w.date >= start && w.date < end);
  return { start, end: addDays(end, -1), completed, touchedCount: touchedTaskIds.size, evidence, works, time: timeSummary(state, start, end, now), note: state.reportNotes[start] || '' };
}
export function reportText(state, startDate, now = new Date()) {
  const r = weeklyReport(state, startDate, now);
  const projectName = id => state.projects.find(p => p.id === id)?.name || '未分类项目';
  return [
    `我的品宣工作周报｜${r.start} — ${r.end}`,
    '', `本周完成 ${r.completed.length} 项任务，参与 ${r.touchedCount} 项工作，记录工时 ${formatDuration(r.time.totalMs)}。`,
    '', '一、本周完成事项',
    ...(r.completed.length ? r.completed.map((t, i) => `${i + 1}. [${projectName(t.projectId)}] ${t.title}`) : ['暂无已完成任务']),
    '', '二、重要成果',
    ...(r.evidence.length || r.works.length ? [...r.evidence.map(e => `${e.title || e.output}｜${projectName(e.projectId || state.tasks.find(t => t.id === e.taskId)?.projectId)}${e.value ? `｜价值：${e.value}` : ''}${e.link ? `｜${e.link}` : ''}`), ...r.works.map(w => `${w.title}｜${projectName(w.projectId)}${w.description ? `｜${w.description}` : ''}${w.link ? `｜${w.link}` : ''}`)].map((entry, i) => `${i + 1}. ${entry}`) : ['暂无成果档案或作品']),
    '', '三、工时统计',
    ...Object.entries(r.time.byProject).sort((a, b) => b[1] - a[1]).map(([id, ms]) => `- ${projectName(id)}：${formatDuration(ms)}`),
    `- 临时插单：${formatDuration(r.time.byKind['临时插单'])}`,
    `- 返工：${formatDuration(r.time.byKind['返工'])}`,
    '', '四、补充说明', r.note || '（可在工作台中编辑）'
  ].join('\n');
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
