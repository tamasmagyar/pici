import { PiciError } from './errors';

/** Protocols that npm cannot install: they only mean something to Yarn or pnpm. */
const UNSUPPORTED = /^(workspace|catalog|patch|portal|link|exec|jsr):/;

/** Yarn 2+ allows `npm:^1.0.0`, which npm would read as an alias. Real aliases are kept. */
export function normalizeRange(range: string): string {
  return range.trim().replace(/^npm:(?=[\d^~<>=*v])/, '');
}

export function isUnsupportedRange(range: string): boolean {
  return UNSUPPORTED.test(range);
}

export function assertSupportedRange(name: string, range: string): void {
  if (isUnsupportedRange(range)) {
    throw new PiciError(
      'UNSUPPORTED_VERSION',
      `npm cannot install '${name}@${range}'. Give it a plain version, e.g. '${name}@1.2.3'.`
    );
  }
}

/** Excludes aliases, URLs, paths and git references, which have no single registry version. */
export function isRegistryRange(range: string): boolean {
  return !/[:/]/.test(range);
}
