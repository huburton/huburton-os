// Calendar-day helpers in the server's local time zone (set TZ in the container).

export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days); // calendar days, DST-safe (unlike adding 86_400_000 ms)
  return out;
}
