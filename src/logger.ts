const MAX_LEVEL_LENGTH = 7; // Length of 'SUCCESS'

function formatMessage(level: string, message: string): string {
  const paddingLength = MAX_LEVEL_LENGTH - level.length;
  const padding = ' '.repeat(paddingLength);
  return `[${level}]${padding}: ${message}`;
}

export function logInfo(message: string): void {
  console.log(formatMessage('INFO', message));
}

export function logSuccess(message: string): void {
  console.log(formatMessage('SUCCESS', message));
}

export function logWarn(message: string): void {
  console.warn(formatMessage('WARN', message));
}

export function logError(message: string): void {
  console.error(formatMessage('ERROR', message));
}
