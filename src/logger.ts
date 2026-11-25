const MAX_LEVEL_LENGTH = 7; // Length of 'SUCCESS'

let stderrOnly = false;

/** In JSON mode stdout is reserved for the JSON result, so every log goes to stderr. */
export function setStderrOnly(value: boolean): void {
  stderrOnly = value;
}

function formatMessage(level: string, message: string): string {
  const paddingLength = MAX_LEVEL_LENGTH - level.length;
  const padding = ' '.repeat(paddingLength);
  return `[${level}]${padding}: ${message}`;
}

function logToStdout(line: string): void {
  if (stderrOnly) {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function logInfo(message: string): void {
  logToStdout(formatMessage('INFO', message));
}

export function logSuccess(message: string): void {
  logToStdout(formatMessage('SUCCESS', message));
}

export function logWarn(message: string): void {
  console.warn(formatMessage('WARN', message));
}

export function logError(message: string): void {
  console.error(formatMessage('ERROR', message));
}
