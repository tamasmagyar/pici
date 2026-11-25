import type { PackageSpec } from './types';
import { PiciError } from './errors';

// Uppercase is accepted because some legacy packages on the registry still use it.
const PACKAGE_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/i;

export function isValidPackageName(name: string): boolean {
  return name.length <= 214 && PACKAGE_NAME.test(name);
}

export function assertValidPackageName(name: string): void {
  if (!isValidPackageName(name)) {
    throw new PiciError('INVALID_PACKAGE', `Invalid package name: '${name}'`);
  }
}

/** Splits `name`, `name@version`, `@scope/name` and `@scope/name@version`. */
export function parsePackageSpec(spec: string): PackageSpec {
  // Index 0 is skipped so the leading '@' of a scope is not treated as a separator.
  const separator = spec.indexOf('@', 1);
  const name = separator === -1 ? spec : spec.slice(0, separator);
  const version = separator === -1 ? '' : spec.slice(separator + 1).trim();

  assertValidPackageName(name);
  if (separator !== -1 && !version) {
    throw new PiciError('INVALID_PACKAGE', `Missing version after '@' in '${spec}'`);
  }

  return { name, version };
}

export function formatPackageSpec({ name, version }: PackageSpec): string {
  return version ? `${name}@${version}` : name;
}
