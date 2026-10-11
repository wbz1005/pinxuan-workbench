import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, createInitialState, createTask, setTaskStatus,
  loadState, saveState, normalizeState, localDate, weekStart,
  startTimer, stopTimer, createManualEntry, taskDuration,
  timeSummary, weeklyReport, reportText
} from '../dist/core.mjs';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), values };
};

test('任务可新增、编辑状态并在浏览器存储中恢复', () => {
  const state = createInitialState();
  const now = new Date(2026, 9, 11, 10, 15);
  const task = createTask({ title: '  招生短视频  ', projectId: state.projects[0].id, type: '视频剪辑', priority: '紧急', status: '待开始', dueDate: '2026-10-16', assignedBy: '王老师' }, now);
  assert.equal(task.title, '招生短视频');
  assert.equal(task.priority, '紧急');
  const finished = setTaskStatus({ ...task, notes: '已输出竖版' }, '已完成', now);
  assert.equal(finished.status, '已完成');
  assert.equal(finished.deliveredAt, '2026-10-11T10:15');
  const storage = memoryStorage();
  saveState({ ...state, tasks: [finished] }, storage);
  assert.ok(storage.values.has(STORAGE_KEY));
  assert.deepEqual(loadState(storage).tasks[0], finished);
});

test('计时与补录按任务、日期、项目和工时类型准确汇总', () => {
  const base = createInitialState();
  const task = createTask({ title: '主视觉', projectId: base.projects[0].id });
  const withTask = { ...base, tasks: [task] };
  const started = startTimer(withTask, task.id, new Date(2026, 9, 11, 9, 0));
  assert.throws(() => startTimer(started, task.id), /先暂停/);
  const stopped = stopTimer(started, new Date(2026, 9, 11, 10, 30));
  assert.equal(taskDuration(stopped, task.id), 90 * 60000);
  const extra = createManualEntry({ taskId: task.id, date: '2026-10-11', minutes: 45, kind: '临时插单' });
  const state = { ...stopped, timeEntries: [...stopped.timeEntries, extra] };
  const totals = timeSummary(state, '2026-10-11', '2026-10-12');
  assert.equal(totals.totalMs, 135 * 60000);
  assert.equal(totals.byProject[base.projects[0].id], 135 * 60000);
  assert.equal(totals.byKind['临时插单'], 45 * 60000);
  assert.equal(totals.byDay['2026-10-11'], 135 * 60000);
});

test('跨午夜计时拆分到正确日期', () => {
  const base = createInitialState();
  const task = createTask({ title: '通宵剪辑' });
  const from = new Date(2026, 9, 11, 23, 30);
  const to = new Date(2026, 9, 12, 0, 30);
  const state = { ...base, tasks: [task], timeEntries: [{ id: 'overnight', taskId: task.id, startedAt: from.toISOString(), endedAt: to.toISOString(), durationMs: 3600000, kind: '返工', manual: false }] };
  assert.equal(timeSummary(state, '2026-10-11', '2026-10-12').totalMs, 1800000);
  assert.equal(timeSummary(state, '2026-10-12', '2026-10-13').totalMs, 1800000);
});

test('周报只使用真实完成任务、工时与绩效证据，且可生成导出文本', () => {
  const base = createInitialState();
  const task = setTaskStatus(createTask({ title: '公众号封面', projectId: base.projects[1].id }), '已完成', new Date(2026, 9, 11, 15));
  const evidence = { id: 'ev-1', taskId: task.id, projectId: base.projects[1].id, date: '2026-10-11', title: '封面交付', output: '完成封面设计', link: 'https://example.com/cover', notes: '' };
  const state = { ...base, tasks: [task], evidence: [evidence], reportNotes: { [weekStart('2026-10-11')]: '审核通过' } };
  const report = weeklyReport(state, '2026-10-11');
  assert.equal(report.completed.length, 1);
  assert.equal(report.evidence.length, 1);
  const text = reportText(state, '2026-10-11');
  assert.match(text, /公众号封面/);
  assert.match(text, /封面交付/);
  assert.match(text, /审核通过/);
  assert.match(text, /https:\/\/example.com\/cover/);
});

test('JSON 备份可恢复，非法格式被拒绝', () => {
  const state = createInitialState();
  const backup = JSON.stringify({ ...state, exportedAt: new Date().toISOString() });
  assert.equal(normalizeState(JSON.parse(backup)).projects.length, 5);
  assert.throws(() => normalizeState({ schemaVersion: 2 }), /格式不正确/);
  assert.match(localDate(new Date(2026, 9, 11)), /^2026-10-11$/);
});
