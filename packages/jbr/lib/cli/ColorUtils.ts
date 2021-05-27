export const COLOR_RESET = '\u001B[0m';
export const COLOR_RED = '\u001B[31m';
export const COLOR_GREEN = '\u001B[32m';
export const COLOR_YELLOW = '\u001B[33m';
export const COLOR_BLUE = '\u001B[34m';
export const COLOR_MAGENTA = '\u001B[35m';
export const COLOR_CYAN = '\u001B[36m';
export const COLOR_GRAY = '\u001B[90m';

/**
 * Return a string in a given color
 * @param str The string that should be printed in
 * @param color A given color
 */
export function withColor(str: any, color: string): string {
  return `${color}${str}${COLOR_RESET}`;
}
