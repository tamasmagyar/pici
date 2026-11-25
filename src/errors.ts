export type ErrorCode =
  | 'USAGE'
  | 'FILE_NOT_FOUND'
  | 'INVALID_FILE'
  | 'INVALID_PACKAGE'
  | 'PACKAGE_NOT_FOUND'
  | 'LOCKED'
  | 'RESTORE_REQUIRED'
  | 'RESTORE_CONFLICT'
  | 'RESTORE_FAILED'
  | 'NPM_NOT_FOUND'
  | 'NPM_FAILED'
  | 'INTERRUPTED'
  | 'UNEXPECTED';

export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

/** An expected failure with a stable, machine-readable code. */
export class PiciError extends Error {
  readonly code: ErrorCode;
  readonly exitCode: number;

  constructor(code: ErrorCode, message: string, exitCode: number = EXIT_FAILURE) {
    super(message);
    // Required for `instanceof` to work with the ES2016 target and subclassed Error.
    Object.setPrototypeOf(this, PiciError.prototype);
    this.name = 'PiciError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function usageError(message: string): PiciError {
  return new PiciError('USAGE', message, EXIT_USAGE);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
