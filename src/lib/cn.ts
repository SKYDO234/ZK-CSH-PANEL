/** Tiny classname joiner (keeps conditional classes readable without clsx). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
