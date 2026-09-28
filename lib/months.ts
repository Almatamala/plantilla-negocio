/**
 * Meses del año para los reportes del panel (D21).
 *
 * Las claves son `YYYY-MM`: se ordenan y se comparan como texto y no arrastran problemas de zona
 * horaria (a diferencia de un `Date` serializado). Los rangos se manejan con **meses enteros**, que es
 * como el dueño piensa los períodos de venta.
 */

/** Meses abreviados para las fechas cortas de la tienda y el checkout. */
export const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/** Clave de mes `YYYY-MM` de una fecha. */
export type MonthKey = string;

export function monthKey(date: Date): MonthKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Primer día del mes de la clave. */
export function monthFromKey(key: MonthKey): Date {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, 1);
}

/** Meses de distancia entre dos claves (positivo si `to` es posterior a `from`). */
function monthDistance(from: MonthKey, to: MonthKey): number {
  const a = monthFromKey(from);
  const b = monthFromKey(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/** Desplaza una clave de mes la cantidad de meses indicada (acepta negativos). */
function addMonthsKey(key: MonthKey, amount: number): MonthKey {
  const date = monthFromKey(key);
  return monthKey(new Date(date.getFullYear(), date.getMonth() + amount, 1));
}

/** Primer día del mes siguiente: límite exclusivo para que un rango incluya el mes de término completo. */
export function monthAfter(key: MonthKey): Date {
  const date = monthFromKey(key);
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/** «Mayo 2026», listo para mostrar en pantalla. */
export function monthLabel(key: MonthKey): string {
  const date = monthFromKey(key);
  return `${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

/** Rango de meses con los dos extremos incluidos. */
export type MonthRange = { from: MonthKey; to: MonthKey };

/** Meses que abarca el rango (los dos extremos cuentan). */
export function rangeMonths(range: MonthRange): number {
  return monthDistance(range.from, range.to) + 1;
}

/**
 * Mueve un extremo del rango respetando dos reglas: nunca queda invertido (`from` ≤ `to`) y nunca abarca
 * más de `maxMonths` meses (12 = un año con los dos extremos incluidos). Al recortar, el extremo que no
 * se está moviendo se ajusta para conservar el tope.
 */
export function moveRange(range: MonthRange, edge: "from" | "to", key: MonthKey, maxMonths = 12): MonthRange {
  if (edge === "from") {
    const distance = monthDistance(key, range.to);
    if (distance < 0) return { from: key, to: key };
    if (distance >= maxMonths) return { from: key, to: addMonthsKey(key, maxMonths - 1) };
    return { from: key, to: range.to };
  }
  const distance = monthDistance(range.from, key);
  if (distance < 0) return { from: key, to: key };
  if (distance >= maxMonths) return { from: addMonthsKey(key, -(maxMonths - 1)), to: key };
  return { from: range.from, to: key };
}
