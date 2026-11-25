// Keeps the documentation that people and AI agents rely on in step with the code.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HELP_TEXT } from '../src/cli';

const read = (file: string) => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf-8');

describe('AGENTS.md', () => {
  const agents = read('AGENTS.md');

  it('documents every error code', () => {
    const union = read('src/errors.ts').match(/export type ErrorCode =([^;]+);/)![1];
    const codes = [...union.matchAll(/'([A-Z_]+)'/g)].map(match => match[1]);
    expect(codes.length).toBeGreaterThan(5);
    for (const code of codes) {
      expect(agents).toContain(`\`${code}\``);
    }
  });

  it('documents every option in the help text', () => {
    for (const option of HELP_TEXT.match(/--[a-z-]+/g)!) {
      expect(agents).toContain(option);
    }
  });

  it('ships with the package', () => {
    expect(JSON.parse(read('package.json')).files).toContain('AGENTS.md');
  });
});

describe.each(['README.md', 'AGENTS.md'])('%s', file => {
  it('only has JSON examples that parse', () => {
    for (const [, block] of read(file).matchAll(/```json\n([\s\S]*?)```/g)) {
      expect(() => JSON.parse(block), block).not.toThrow();
    }
  });
});
