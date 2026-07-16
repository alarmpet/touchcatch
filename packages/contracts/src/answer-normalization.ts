export function normalizeFinalAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(/\p{White_Space}+/gu, ' ').toLowerCase();
}

export function containsDisallowedControl(value: string): boolean {
  return /[\u0000-\u001f\u007f-\u009f]/u.test(value);
}
