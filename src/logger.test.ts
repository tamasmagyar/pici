import { describe, it, expect, afterEach } from 'vitest';
import { logInfo, logSuccess, logWarn, logError, setStderrOnly } from './logger';
import { useProject } from '../test/helpers/in-process';

const context = useProject();
afterEach(() => setStderrOnly(false));

describe('logger', () => {
  it('aligns levels and splits streams', () => {
    logInfo('a');
    logSuccess('b');
    logWarn('c');
    logError('d');
    expect(context.stdout).toEqual(['[INFO]   : a', '[SUCCESS]: b']);
    expect(context.stderr).toEqual(['[WARN]   : c', '[ERROR]  : d']);
  });

  it('keeps stdout empty in stderr-only mode', () => {
    setStderrOnly(true);
    logInfo('a');
    logSuccess('b');
    expect(context.stdout).toEqual([]);
    expect(context.stderr).toEqual(['[INFO]   : a', '[SUCCESS]: b']);
  });
});
