"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Box, CircleDollarSign, Package, Store, TrendingDown, TrendingUp } from "lucide-react";
import { formatPrice, type ProductStatus } from "@/lib/products";
import { WEEKDAY_LONG, WEEKDAY_ORDER } from "@/lib/schedule";
import { monthAfter, monthFromKey, monthKey, monthLabel, moveRange, rangeMonths, type MonthKey, type MonthRange } from "@/lib/months";
import { localDateIso, useReports } from "@/lib/use-reports";
import { Metric } from "@/components/admin-metric";

/**
 * Reportes del negocio (D21).
 *
 * Los números los **agrega la API** (`GET /api/reports`) para el período elegido: ventas comparadas con el
 * tramo anterior, productos más y menos vendidos, dónde se retiran los pedidos y qué días y franjas se
 * cargan más. Antes el panel bajaba **todos** los pedidos con sus líneas y sumaba en el navegador, así que
 * el peso crecía con el historial. Acá queda la presentación —períodos, comparación, barras— más lo que
 * necesita el catálogo: la categoría de cada producto vendido, los que no vendieron y la reposición.
 */

/** Producto del catálogo (nombre de categoría ya resuelto). */
type CatalogProduct = { name: string; category: string; inventory: number; status: ProductStatus };

type PeriodId = "7d" | "30d" | "custom" | "all";

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "custom", label: "Personalizado" },
  { id: "all", label: "Todo" },
];

/**
 * Rango personalizado: **meses enteros** (de un mes a más de un mes, hasta un año) que define el tramo
 * de datos que usan las tablas del reporte. No se compara con nada: el dueño lo usa para mirar un
 * período puntual, no para medir variación.
 */
const MAX_RANGE_MONTHS = 12;

/** Mismo tratamiento que los demás selects del panel (`select-field`). */
const SELECT = "select-field rounded-lg border border-[#d9ddd5] bg-white px-3 py-2 text-sm outline-none transition hover:border-[#243128] focus:border-[#243128]";

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Rango de fechas del período elegido y, cuando corresponde, el período anterior de igual largo para
 * comparar. El rango personalizado no compara: define el tramo de datos que alimenta las tablas.
 */
function resolvePeriod(id: PeriodId, range: MonthRange): { from: Date | null; to: Date; previous: { from: Date; to: Date } | null } {
  const today = startOfDay(new Date());
  const to = addDays(today, 1); // exclusivo: incluye todo el día de hoy

  if (id === "all") return { from: null, to, previous: null };

  // Meses enteros: entra el mes de inicio completo y el de término completo.
  if (id === "custom") return { from: monthFromKey(range.from), to: monthAfter(range.to), previous: null };

  const days = id === "7d" ? 7 : 30;
  const from = addDays(to, -days);
  return { from, to, previous: { from: addDays(from, -days), to: from } };
}

function percentChange(current: number, previous: number): { label: string; up: boolean } | null {
  if (previous <= 0) return null;
  const change = Math.round(((current - previous) / previous) * 100);
  return { label: `${change > 0 ? "+" : ""}${change}%`, up: change >= 0 };
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5">
      <h2 className="display text-2xl">{title}</h2>
      {description && <p className="mt-2 text-sm text-[#647167]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, value, detail, max, percent }: { label: string; value: string; detail?: string; max?: number; percent?: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#edf0e8] py-3 text-sm last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {detail && <span className="block truncate text-xs text-[#748077]">{detail}</span>}
      </span>
      {percent !== undefined && max !== undefined && max > 0 && (
        <span className="hidden h-2 w-24 shrink-0 rounded-full bg-[#edf0e8] md:block"><span className="block h-2 rounded-full bg-[#243128]" style={{ width: `${Math.max(6, Math.round((percent / max) * 100))}%` }}/></span>
      )}
      <span className="shrink-0 whitespace-nowrap">{value}</span>
    </div>
  );
}

export function ReportsSection({ catalog }: { catalog: CatalogProduct[] }) {
  const [periodId, setPeriodId] = useState<PeriodId>("30d");
  /** Rango personalizado; parte en el mes en curso (lo que antes hacía «Este mes»). */
  const [range, setRange] = useState<MonthRange>(() => { const now = monthKey(new Date()); return { from: now, to: now }; });
  const period = useMemo(() => resolvePeriod(periodId, range), [periodId, range]);
  /** Ventana que se le pide a la API: fechas locales y `to` **exclusivo** (el día siguiente). */
  const reportWindow = useMemo(() => ({
    from: period.from ? localDateIso(period.from) : "",
    to: localDateIso(period.to),
    compare: Boolean(period.previous),
  }), [period]);
  const { report, failed } = useReports(reportWindow);

  /** Meses ofrecidos: desde el pedido más antiguo (lo informa la API) hasta el mes en curso. */
  const oldestOrderAt = report?.oldest_order_at ?? null;
  const monthOptions = useMemo(() => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const oldest = oldestOrderAt ? new Date(oldestOrderAt) : null;
    const first = oldest && !Number.isNaN(oldest.getTime()) && oldest < currentMonth
      ? new Date(oldest.getFullYear(), oldest.getMonth(), 1)
      : new Date(now.getFullYear(), now.getMonth() - (MAX_RANGE_MONTHS - 1), 1);
    const months: MonthKey[] = [];
    for (let month = first; month <= currentMonth; month = new Date(month.getFullYear(), month.getMonth() + 1, 1)) months.push(monthKey(month));
    return months;
  }, [oldestOrderAt]);

  const spanMonths = rangeMonths(range);
  const rangeLabel = spanMonths === 1 ? monthLabel(range.from) : `${monthLabel(range.from)} – ${monthLabel(range.to)} · ${spanMonths} meses`;

  // El recorte (nunca invertido, nunca más de un año) vive en `lib/months.ts`, donde está verificado.
  const changeFrom = (from: MonthKey) => setRange((current) => moveRange(current, "from", from, MAX_RANGE_MONTHS));
  const changeTo = (to: MonthKey) => setRange((current) => moveRange(current, "to", to, MAX_RANGE_MONTHS));

  /**
   * Lo que la API no puede saber sola: la categoría de cada producto vendido (el ranking viene por
   * nombre), los productos del catálogo que no vendieron y la reposición (los vendidos con stock bajo).
   */
  const data = useMemo(() => {
    if (!report) return null;

    const categoriesByName = new Map(catalog.map((product) => [product.name, product.category]));
    const ranking = report.products.map((stat) => ({ ...stat, category: categoriesByName.get(stat.name) ?? "Sin categoría" }));
    const ranked = new Set(ranking.map((stat) => stat.name));

    // Ingresos por categoría a partir del ranking vendido.
    const categories = new Map<string, number>();
    for (const stat of ranking) categories.set(stat.category, (categories.get(stat.category) ?? 0) + stat.revenue);

    return {
      count: report.orders,
      salesCount: report.sales_orders,
      units: report.units,
      revenue: report.revenue,
      previousRevenue: report.previous?.revenue ?? 0,
      previousOrders: report.previous?.orders ?? 0,
      pendingPickup: report.pending_pickup,
      ranking,
      // «Sin ventas» mira solo lo visible en la tienda: los inactivos no se espera que vendan.
      withoutSales: catalog.filter((product) => product.status !== "inactive" && !ranked.has(product.name)),
      places: report.places,
      weekdays: new Map(report.weekdays.map((row) => [row.weekday, row.orders])),
      slots: report.slots.map((row) => [row.label, row.orders] as [string, number]),
      categories: [...categories.entries()].sort((a, b) => b[1] - a[1]),
      restock: catalog
        .filter((product) => ranked.has(product.name) && product.inventory <= 5)
        .map((product) => ({ ...product, units: ranking.find((stat) => stat.name === product.name)?.units ?? 0 }))
        .sort((a, b) => a.inventory - b.inventory),
    };
  }, [catalog, report]);

  // Mientras no llega el primer reporte se avisa; si la API no respondió, se explica por qué.
  if (!data) {
    return (
      <section className="rounded-xl bg-white p-5">
        <h2 className="display text-2xl">Reportes</h2>
        <p className="mt-2 text-sm text-[#647167]">
          {failed ? "No se pudieron cargar los reportes. Revisa la conexión con la API." : "Cargando reportes…"}
        </p>
      </section>
    );
  }

  const variation = percentChange(data.revenue, data.previousRevenue);
  // El ticket promedio se calcula solo con los pedidos que efectivamente vendieron.
  const ticket = data.salesCount > 0 ? Math.round(data.revenue / data.salesCount) : 0;
  const top = data.ranking.slice(0, 5);
  const bottom = data.ranking.length > 5 ? data.ranking.slice(-5).reverse() : [];
  const maxWeekday = Math.max(1, ...data.weekdays.values());
  const maxPlace = Math.max(1, ...data.places.map((place) => place.revenue));
  const maxCategory = Math.max(1, ...data.categories.map(([, value]) => value));

  const summaryText = periodId === "all"
    ? `Todo el historial: ${data.count} pedidos.`
    : periodId === "custom"
      ? `${data.count} pedidos en ${rangeLabel}.`
      : `${data.count} pedidos desde el inicio del período${period.previous ? ` (${data.previousOrders} en el período anterior)` : ""}.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#647167]">{summaryText}</p>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((option) => (
            <button key={option.id} onClick={() => setPeriodId(option.id)} className={`rounded-full border px-3.5 py-1.5 text-xs transition ${periodId === option.id ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"}`}>{option.label}</button>
          ))}
        </div>
      </div>

      {/* Rango por meses enteros (hasta un año): el tramo elegido es el que usan todas las tablas. */}
      {periodId === "custom" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 text-sm">
          <label className="flex items-center gap-2 text-[#647167]">
            Desde
            <select value={range.from} onChange={(event) => changeFrom(event.target.value)} aria-label="Mes de inicio" className={SELECT}>
              {monthOptions.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[#647167]">
            hasta
            <select value={range.to} onChange={(event) => changeTo(event.target.value)} aria-label="Mes de término" className={SELECT}>
              {monthOptions.map((key) => <option key={key} value={key}>{monthLabel(key)}</option>)}
            </select>
          </label>
          <span className="text-xs text-[#56745c]">{rangeLabel}</span>
          <span className="ml-auto text-xs text-[#748077]">Hasta {MAX_RANGE_MONTHS} meses por rango</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Ventas del período"
          value={formatPrice(data.revenue)}
          icon={CircleDollarSign}
          hint={variation
            ? <span className={`inline-flex items-center gap-1 ${variation.up ? "text-[#3c6b3f]" : "text-[#8a4a44]"}`}>{variation.up ? <TrendingUp size={12}/> : <TrendingDown size={12}/>}{variation.label} vs. período anterior</span>
            : data.previousRevenue === 0 && period.previous ? "Sin período anterior con ventas" : undefined}
        />
        <Metric label="Pedidos" value={String(data.count)} icon={Box} hint={`${data.units} unidades vendidas`} />
        <Metric label="Ticket promedio" value={formatPrice(ticket)} icon={BarChart3}/>
        <Metric label="Pendientes de retirar" value={String(data.pendingPickup)} icon={Package}/>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Productos más vendidos" description="Unidades y dinero por producto en el período.">
          {top.length === 0
            ? <p className="py-3 text-sm text-[#647167]">Sin ventas en el período.</p>
            : top.map((stat) => (
              <Row key={stat.name} label={stat.name} detail={`${stat.category} · ${formatPrice(stat.revenue)}`} value={`${stat.units} u.`} percent={stat.units} max={top[0].units}/>
            ))}
        </Card>

        <Card title="Productos menos vendidos" description="Los que menos salieron: candidatos a revisar precio, receta o presencia en la carta.">
          {bottom.length === 0
            ? <p className="py-3 text-sm text-[#647167]">Hay {data.ranking.length || "0"} productos con ventas: todos aparecen en «Más vendidos».</p>
            : bottom.map((stat) => (
              <Row key={stat.name} label={stat.name} detail={`${stat.category} · ${formatPrice(stat.revenue)}`} value={`${stat.units} u.`} percent={stat.units} max={data.ranking[0]?.units ?? 1}/>
            ))}
          {bottom.length > 0 && <div className="mt-4 border-t border-[#edf0e8] pt-3">
            <p className="flex items-center gap-1.5 text-xs tracking-[.16em] text-[#748077] uppercase"><AlertTriangle size={13}/>Sin ventas en el período</p>
            <p className="mt-2 text-sm text-[#526058]">{data.withoutSales.length === 0 ? "Todos los productos activos vendieron al menos una vez." : data.withoutSales.map((product) => product.name).join(" · ")}</p>
          </div>}
        </Card>

        <Card title="Ventas por punto de retiro" description="Dónde van los clientes a buscar su pedido.">
          {data.places.length === 0
            ? <p className="py-3 text-sm text-[#647167]">Sin pedidos agendados en el período.</p>
            : data.places.map((place) => (
              <Row
                key={place.label}
                label={place.label}
                detail={`${place.orders} pedidos · ${place.units} u.`}
                value={formatPrice(place.revenue)}
                percent={place.revenue}
                max={maxPlace}
              />
            ))}
        </Card>

        <Card title="Pedidos por día y franja" description="Cuándo vienen a retirar: sirve para planificar producción y horarios.">
          <div className="space-y-2">
            {WEEKDAY_ORDER.map((day) => {
              const count = data.weekdays.get(day) ?? 0;
              return (
                <div key={day} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-[#647167]">{WEEKDAY_LONG[day]}</span>
                  <span className="h-2 flex-1 rounded-full bg-[#edf0e8]"><span className="block h-2 rounded-full bg-[#243128]" style={{ width: count === 0 ? "0%" : `${Math.max(6, Math.round((count / maxWeekday) * 100))}%` }}/></span>
                  <span className="w-16 shrink-0 text-right">{count} {count === 1 ? "pedido" : "pedidos"}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-[#edf0e8] pt-3">
            <p className="text-xs tracking-[.16em] text-[#748077] uppercase">Franjas más pedidas</p>
            {data.slots.length === 0
              ? <p className="mt-2 text-sm text-[#647167]">Sin franjas registradas en el período.</p>
              : <div className="mt-2 flex flex-wrap gap-2">{data.slots.map(([slot, count]) => <span key={slot} className="rounded-full bg-[#edf0e8] px-3 py-1 text-xs text-[#526058]">{slot} · {count}</span>)}</div>}
          </div>
        </Card>

        <Card title="Ingresos por categoría" description="Qué familias del catálogo dejan más ingresos en el período.">
          {data.categories.length === 0
            ? <p className="py-3 text-sm text-[#647167]">Sin ventas en el período.</p>
            : data.categories.map(([category, value]) => (
              <Row key={category} label={category} value={formatPrice(value)} percent={value} max={maxCategory}/>
            ))}
        </Card>

        <Card title="Reposición" description="Productos que se vendieron y están con stock bajo (≤ 5) o agotados.">
          {data.restock.length === 0
            ? <p className="py-3 text-sm text-[#647167]">Nada urgente: lo vendido tiene stock suficiente.</p>
            : data.restock.map((product) => (
              <Row
                key={product.name}
                label={product.name}
                detail={product.inventory === 0 ? `Sin stock · ${product.units} u. vendidas en el período` : `Quedan ${product.inventory} · ${product.units} u. vendidas en el período`}
                value={product.inventory === 0 ? "Reponer" : "Stock bajo"}
              />
            ))}
        </Card>
      </div>

      <p className="flex items-center gap-2 text-xs text-[#748077]">
        <Store size={13}/>
        Las ventas y los pedidos se calculan con la fecha de creación de cada orden; los cancelados no suman dinero. El día y la franja corresponden a la agenda del pedido. El rango personalizado trabaja con meses completos y no se compara con otro período.
      </p>
    </div>
  );
}
