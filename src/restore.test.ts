import { describe, it, expect } from 'vitest';
import { restoreBackups, findLeftoverBackups } from './restore';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
const conflict = expect.objectContaining({ code: 'RESTORE_CONFLICT' });
const STUB = { name: 'pici-temp', version: '1.0.0', dependencies: {} };

function leaveBehind(files: Record<string, unknown>) {
  Object.entries(files).forEach(([name, content]) => context.project.write(name, content));
}

describe('restoreBackups', () => {
  it('does nothing in a clean directory', () => {
    leaveBehind({ 'package.json': '{}' });
    expect(findLeftoverBackups()).toEqual([]);
    expect(restoreBackups()).toEqual([]);
    expect(context.project.snapshot()).toEqual({ 'package.json': '{}' });
  });

  it('replaces the stub and brings back every lock file', () => {
    leaveBehind({
      'package.json': STUB,
      'package.json.pici.backup': 'main',
      'package-lock.json.pici.backup': 'npm',
      'npm-shrinkwrap.json.pici.backup': 'shrink',
      'yarn.lock.pici.backup': 'yarn',
    });

    expect(restoreBackups()).toEqual([
      'package.json',
      'package-lock.json',
      'npm-shrinkwrap.json',
      'yarn.lock',
    ]);
    expect(context.project.snapshot()).toEqual({
      'package.json': 'main',
      'package-lock.json': 'npm',
      'npm-shrinkwrap.json': 'shrink',
      'yarn.lock': 'yarn',
    });
  });

  it('restores a missing package.json and removes the temp file', () => {
    leaveBehind({ 'package.json.pici.backup': 'main', 'package.json.pici.temp': 'temp' });
    restoreBackups();
    expect(context.project.snapshot()).toEqual({ 'package.json': 'main' });
  });

  it.each([
    ['an edited package.json', { 'package.json': { name: 'mine' } }],
    ['an unparseable package.json', { 'package.json': '{oops' }],
    ['a regenerated lock file', { 'yarn.lock': 'new', 'yarn.lock.pici.backup': 'old' }],
  ])('changes nothing at all if there is %s', (_label, extra) => {
    leaveBehind({
      'package.json': STUB,
      'package.json.pici.backup': 'main',
      'package-lock.json.pici.backup': 'npm',
      ...extra,
    });
    const before = context.project.snapshot();

    expect(() => restoreBackups()).toThrow(conflict);
    expect(context.project.snapshot()).toEqual(before);
  });

  it('only reports on a dry run', () => {
    leaveBehind({ 'package.json': STUB, 'package.json.pici.backup': 'main' });
    const before = context.project.snapshot();

    expect(restoreBackups({ dryRun: true })).toEqual(['package.json']);
    expect(context.project.snapshot()).toEqual(before);
  });

  it('refuses while another pici process is running', () => {
    leaveBehind({ '.pici.lock': `${process.pid}`, 'package.json.pici.backup': 'main' });
    expect(() => restoreBackups()).toThrow(expect.objectContaining({ code: 'LOCKED' }));
    expect(context.project.exists('package.json.pici.backup')).toBe(true);
  });
});
