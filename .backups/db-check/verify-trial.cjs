const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('../../node_modules/typescript');
const filename = path.resolve('lib/access.ts');
const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(js, filename);
const { TRIAL_DAYS, getTrialState, formatTrialRemaining } = mod.exports;
const DAY = 86400000;
let checks = 0;
const pass = (name, fn) => { fn(); checks++; console.log('PASS ' + name); };

pass('Trial length is seven days', () => assert.equal(TRIAL_DAYS, 7));
pass('New account has a full seven days left', () => {
  const now = Date.parse('2026-11-11T10:00:00Z');
  const state = getTrialState('2026-11-11T10:00:00Z', now);
  assert.equal(state.active, true);
  assert.equal(state.daysLeft, 7);
  assert.equal(state.remainingMs, 7 * DAY);
  assert.equal(state.endsAt, now + 7 * DAY);
});
pass('One day elapsed shows six days left', () => {
  const created = '2026-11-11T10:00:00Z';
  const state = getTrialState(created, Date.parse(created) + DAY);
  assert.equal(state.daysLeft, 6);
  assert.equal(state.active, true);
});
pass('Partial final day shows one day left', () => {
  const created = '2026-11-11T10:00:00Z';
  const state = getTrialState(created, Date.parse(created) + 6 * DAY + 23 * 3600000);
  assert.equal(state.daysLeft, 1);
  assert.equal(state.active, true);
});
pass('Exact seven-day boundary is expired', () => {
  const created = '2026-11-11T10:00:00Z';
  const state = getTrialState(created, Date.parse(created) + 7 * DAY);
  assert.equal(state.active, false);
  assert.equal(state.daysLeft, 0);
  assert.equal(state.remainingMs, 0);
});
pass('Invalid creation timestamp is reported as unavailable', () => {
  assert.equal(getTrialState('not-a-date'), null);
});
pass('Remaining time formatting shows days, hours and minutes', () => {
  assert.equal(formatTrialRemaining(7 * DAY), '7d 0h 0m');
  assert.equal(formatTrialRemaining(23 * 3600000 + 59 * 60000), '23h 59m');
  assert.equal(formatTrialRemaining(60000), '1m');
  assert.equal(formatTrialRemaining(0), '0m');
});
console.log(`${checks} trial countdown checks passed.`);
