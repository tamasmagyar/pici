import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import {
  readJsonFile,
  writeJsonFile,
  stashFile,
  unstashFile,
  describeBackup,
  isPlainObject,
} from './file-utils';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
const withCode = (code: string) => expect.objectContaining({ code });

describe('isPlainObject', () => {
  it('accepts objects only', () => {
    expect(isPlainObject({})).toBe(true);
    for (const value of [null, undefined, [], 'a', 1, true]) {
      expect(isPlainObject(value)).toBe(false);
    }
  });
});

describe('readJsonFile', () => {
  it('parses a JSON object', () => {
    context.project.write('a.json', { name: 'a' });
    expect(readJsonFile('a.json')).toEqual({ name: 'a' });
  });

  it('tolerates a byte order mark', () => {
    context.project.write('a.json', '\uFEFF{"name":"a"}');
    expect(readJsonFile('a.json')).toEqual({ name: 'a' });
  });

  it('reports a missing file', () => {
    expect(() => readJsonFile('nope.json')).toThrow(withCode('FILE_NOT_FOUND'));
  });

  it('reports an unreadable path', () => {
    fs.mkdirSync('dir.json');
    expect(() => readJsonFile('dir.json')).toThrow(withCode('INVALID_FILE'));
  });

  it.each(['', '{', '{"a":1,}', '// comment\n{}'])('reports invalid JSON %j', content => {
    context.project.write('a.json', content);
    expect(() => readJsonFile('a.json')).toThrow(/Invalid JSON in a\.json/);
  });

  it.each(['null', '[]', '"text"', '42'])('rejects non-object JSON %s', content => {
    context.project.write('a.json', content);
    expect(() => readJsonFile('a.json')).toThrow(/Expected a JSON object/);
  });
});

describe('writeJsonFile', () => {
  it('writes two-space JSON with a trailing newline', () => {
    writeJsonFile('a.json', { dependencies: { a: '1' } });
    expect(context.project.read('a.json')).toBe('{\n  "dependencies": {\n    "a": "1"\n  }\n}\n');
  });
});

describe('stashFile and unstashFile', () => {
  it('moves a file aside and back byte for byte', () => {
    context.project.write('a.txt', 'one\r\ntwo');

    const backup = stashFile('a.txt');
    expect(context.project.snapshot()).toEqual({ 'a.txt.pici.backup': 'one\r\ntwo' });

    unstashFile(backup);
    expect(context.project.snapshot()).toEqual({ 'a.txt': 'one\r\ntwo' });
  });

  it('does nothing for a file that does not exist', () => {
    const backup = stashFile('a.txt');
    expect(backup.exists).toBe(false);
    unstashFile(backup);
    expect(context.project.snapshot()).toEqual({});
  });

  it('never overwrites an existing backup', () => {
    context.project.write('a.txt', 'stub');
    context.project.write('a.txt.pici.backup', 'only good copy');

    expect(() => stashFile('a.txt')).toThrow(withCode('RESTORE_REQUIRED'));
    expect(context.project.snapshot()).toEqual({
      'a.txt': 'stub',
      'a.txt.pici.backup': 'only good copy',
    });
  });

  it('replaces whatever is at the original path', () => {
    context.project.write('a.txt', 'original');
    const backup = stashFile('a.txt');
    context.project.write('a.txt', 'replacement');

    unstashFile(backup);

    expect(context.project.snapshot()).toEqual({ 'a.txt': 'original' });
  });

  it('keeps the current file if the backup has disappeared', () => {
    context.project.write('a.txt', 'original');
    const backup = stashFile('a.txt');
    context.project.write('a.txt', 'current');
    fs.rmSync(backup.backupPath);

    expect(() => unstashFile(backup)).toThrow();
    expect(context.project.snapshot()).toEqual({ 'a.txt': 'current' });
  });

  it('describes a backup without touching anything', () => {
    context.project.write('a.txt', 'x');
    expect(describeBackup('a.txt')).toEqual({
      originalPath: context.project.resolve('a.txt'),
      backupPath: context.project.resolve('a.txt.pici.backup'),
      exists: true,
    });
    expect(context.project.snapshot()).toEqual({ 'a.txt': 'x' });
  });
});
