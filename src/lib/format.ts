const formatters = new Map<number, Intl.NumberFormat>();

/** Число в русском формате: «15 733,5». digits — количество знаков после запятой. */
export function fmt(value: number, digits = 3): string {
  let f = formatters.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(digits, f);
  }
  return f.format(value);
}

/** Число без лишних нулей после запятой (для штук). */
export function fmtInt(value: number): string {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);
}
