"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { invalidateResource, loadResource } from "@/lib/resource";

/**
 * Reportes del negocio (D21) tal como los devuelve `GET /api/reports` (espejo de `ReportOut`).
 *
 * La API agrega el período y devuelve solo los números: antes el panel bajaba **todos** los pedidos con
 * sus líneas y sumaba en el navegador, así que el peso crecía con el historial.
 */
export type ReportTotals = {
  orders: number;
  sales_orders: number;
  units: number;
  revenue: number;
};

export type ReportProductStat = { name: string; units: number; revenue: number };
export type ReportPlaceStat = { label: string; orders: number; units: number; revenue: number };
export type ReportWeekdayStat = { weekday: number; orders: number };
export type ReportSlotStat = { label: string; orders: number };

export type Report = {
  from_date: string | null;
  to_date: string | null;
  orders: number;
  sales_orders: number;
  units: number;
  revenue: number;
  /** Pedidos del período que todavía no se retiran (ni entregados ni cancelados). */
  pending_pickup: number;
  /** Fecha del pedido más antiguo: con ella se arma el selector de meses del rango personalizado. */
  oldest_order_at: string | null;
  previous: ReportTotals | null;
  products: ReportProductStat[];
  places: ReportPlaceStat[];
  weekdays: ReportWeekdayStat[];
  slots: ReportSlotStat[];
};

export type ReportWindow = {
  /** Fecha local `YYYY-MM-DD`; vacía significa «todo el historial». */
  from: string;
  /** Fecha local `YYYY-MM-DD`, **exclusiva** (el día siguiente al último que se mira). */
  to: string;
  /** Pide también el tramo anterior de igual largo, para la comparación. */
  compare: boolean;
};

/** Fecha local en `YYYY-MM-DD`, que es el formato que espera la API en `from`/`to`. */
export function localDateIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Reportes de un período, compartidos por Inicio (últimos 30 días) y la sección Reportes: se leen con la
 * lectura compartida por clave (`lib/resource.ts`), **sin** respaldo offline (un reporte viejo no sirve
 * para decidir) y con `reload` para refrescar después de tocar un pedido.
 */
export function useReports({ from, to, compare }: ReportWindow) {
  const [state, setState] = useState<{ report: Report | null; failed: boolean }>({ report: null, failed: false });
  const key = `reports:${from || "all"}:${to}:${compare}`;

  const load = useCallback(() => {
    const query = new URLSearchParams({ to, compare: String(compare) });
    if (from) query.set("from", from);
    return loadResource<Report>(
      key,
      () => apiFetch<Report>(`/api/reports?${query}`, { admin: true }),
      { cache: false },
    ).then(({ value, stale }) => {
      // Al cambiar de período se conservan los números anteriores hasta que llega la respuesta nueva.
      setState((current) => (value ? { report: value, failed: false } : { report: current.report, failed: stale }));
    });
  }, [compare, from, key, to]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Vuelve a pedir los reportes (lo usa el panel después de cambiar un pedido). */
  const reload = useCallback(() => {
    invalidateResource(key);
    return load();
  }, [key, load]);

  return { ...state, loading: state.report === null && !state.failed, reload };
}
