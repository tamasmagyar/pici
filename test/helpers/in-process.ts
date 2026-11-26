import { afterEach, beforeEach, vi } from 'vitest';
import { createProject, type Project } from './project';

/**
 * Runs each test inside a fresh real project directory, with the fake npm on PATH.
 * Console output is captured instead of printed.
 */
export function useProject() {
  const context = {} as {
    project: Project;
    stdout: string[];
    stderr: string[];
  };
  const originalCwd = process.cwd();
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    context.project = createProject();
    context.stdout = [];
    context.stderr = [];
    originalEnv = { ...process.env };
    Object.assign(process.env, context.project.fakeNpmEnv());
    process.chdir(context.project.dir);

    const capture = (sink: string[]) => (message: unknown) => {
      sink.push(String(message));
    };
    vi.spyOn(console, 'log').mockImplementation(capture(context.stdout));
    vi.spyOn(console, 'warn').mockImplementation(capture(context.stderr));
    vi.spyOn(console, 'error').mockImplementation(capture(context.stderr));
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      context.stdout.push(String(chunk).replace(/\n$/, ''));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(originalCwd);
    // Key by key: child processes do not see a replaced `process.env` object on Node 26.
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    context.project.cleanup();
  });

  return context;
}
