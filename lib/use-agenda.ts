"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { invalidateResource, loadResource } from "@/lib/resource";
import type { Slot, Zone } from "@/lib/agenda";

/** Punto de retiro tal como lo devuelve el panel (`active` siempre viene). */
export type AgendaZone = Zone & { active: boolean };
/** Franja horaria tal como la devuelve el panel (`enabled` siempre viene). */
export type AgendaSlot = Slot & { enabled: boolean };
/** Fecha cerrada puntual. */
export type ClosedDay = { id: string; date: string };

type Agenda = {
  zones: AgendaZone[];
  slots: AgendaSlot[];
  closedDays: ClosedDay[];
  /** Alguna de las tres lecturas falló: la agenda que hay no es de fiar. */
  stale: boolean;
};

const EMPTY: Agenda = { zones: [], slots: [], closedDays: [], stale: false };

/**
 * Agenda compartida: **puntos de retiro + franjas + fechas cerradas** en una sola lectura lógica.
 *
 * El checkout pedía los tres listados por su cuenta y la Agenda del panel hacía lo mismo (y el modal de
 * pedido, otra vez franjas y puntos): acá se comparten y cada conjunto se pide una sola vez, aunque haya
 * varios componentes mirándolo al mismo tiempo.
 *
 * **Sin respaldo offline a propósito** (D20): con la API caída el pedido no se puede registrar igual, así
 * que `stale` queda en `true` y las pantallas avisan en vez de ofrecer horarios que quizá ya no existen.
 * El panel usa `admin: true` para ver también los puntos inactivos y las franjas deshabilitadas.
 */
export function useAgenda({ admin = false }: { admin?: boolean } = {}) {
  const [agenda, setAgenda] = useState<Agenda>(EMPTY);
  const [loading, setLoading] = useState(true);
  const variant = admin ? "admin" : "public";

  const load = useCallback(
    () =>
      Promise.all([
        loadResource<AgendaZone[]>(
          `agenda:zones:${variant}`,
          () => apiFetch<AgendaZone[]>(`/api/shipping-zones${admin ? "?include_inactive=true" : ""}`, admin ? { admin: true } : {}),
          { cache: false },
        ),
        loadResource<AgendaSlot[]>(
          `agenda:slots:${variant}`,
          async () => {
            const rows = await apiFetch<AgendaSlot[]>(`/api/time-slots${admin ? "?include_disabled=true" : ""}`, admin ? { admin: true } : {});
            // `weekdays` siempre es un array: una fila vieja sin el campo no debe romper el calendario.
            return rows.map((slot) => ({ ...slot, weekdays: Array.isArray(slot.weekdays) ? slot.weekdays : [] }));
          },
          { cache: false },
        ),
        loadResource<ClosedDay[]>("agenda:closed-days", () => apiFetch<ClosedDay[]>("/api/closed-days"), { cache: false }),
      ]).then(([zones, slots, closedDays]) => {
        setAgenda({
          zones: zones.value ?? [],
          slots: slots.value ?? [],
          closedDays: closedDays.value ?? [],
          stale: zones.stale || slots.stale || closedDays.stale,
        });
        setLoading(false);
      }),
    [admin, variant],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Vuelve a leer la agenda (tras crear, editar o borrar un punto, una franja o una fecha). */
  const reload = useCallback(async () => {
    invalidateResource(`agenda:zones:${variant}`);
    invalidateResource(`agenda:slots:${variant}`);
    invalidateResource("agenda:closed-days");
    await load();
  }, [load, variant]);

  return { ...agenda, loading, reload };
}
