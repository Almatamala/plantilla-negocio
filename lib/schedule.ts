/**
 * Días de la semana y franjas horarias de los puntos de retiro (PLAN §0.8, D18).
 *
 * La API guarda los días con la convención de JavaScript (`Date.getDay()`): `0` domingo … `6` sábado.
 * Se comparte entre el checkout, la ficha de agenda del admin y el formulario de pedidos.
 */

export const WEEKDAY_LONG = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const WEEKDAY_SHORT = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
/** Orden de presentación: lunes primero, domingo al final (como se lee una semana laboral). */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Día de la semana de una fecha `YYYY-MM-DD`, sin pasar por UTC (evita el corrimiento de zona horaria). */
export function weekdayFromIso(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).getDay();
}

/** Etiqueta compacta de días: `[1,2,3,4,5,6]` → «Lu–Sá», `[1,3,5]` → «Lu, Mi, Vi», los 7 → «Todos los días». */
function formatWeekdays(days: number[]): string {
  const unique = [...new Set(days)].filter((day) => day >= 0 && day <= 6);
  if (unique.length === 0) return "Sin días";
  if (unique.length === 7) return "Todos los días";
  const ordered = WEEKDAY_ORDER.filter((day) => unique.includes(day));
  const runs: number[][] = [];
  for (const day of ordered) {
    const last = runs[runs.length - 1];
    const consecutive = last && WEEKDAY_ORDER.indexOf(day) === WEEKDAY_ORDER.indexOf(last[last.length - 1]) + 1;
    if (consecutive) last.push(day);
    else runs.push([day]);
  }
  return runs.map((run) => (run.length > 1 ? `${WEEKDAY_SHORT[run[0]]}–${WEEKDAY_SHORT[run[run.length - 1]]}` : WEEKDAY_SHORT[run[0]])).join(", ");
}

/** Resumen de una franja para listados y tarjetas: «Lu–Sá · 10:00–13:00». */
export function formatSlot(slot: { weekdays: number[]; start_time: string; end_time: string }): string {
  return `${formatWeekdays(slot.weekdays)} · ${slot.start_time}–${slot.end_time}`;
}
