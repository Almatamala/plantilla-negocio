"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { invalidateResource, loadResource } from "@/lib/resource";
import type { DeliveryZone } from "@/lib/delivery";

/**
 * Zonas de **envío** (D44) en una lectura compartida.
 *
 * La tienda (carrito y checkout) pide solo las activas; la Agenda del panel usa `admin: true` para ver
 * también las inactivas. Es una lectura aparte de `useAgenda` (los puntos de retiro) porque el carrito
 * no necesita los puntos ni los horarios: mientras no haya zonas activas, la tienda no menciona el envío.
 * Sin respaldo offline (`cache: false`): mostrar un envío que ya no existe sería peor que no mostrarlo.
 */
export function useDeliveryZones({ admin = false }: { admin?: boolean } = {}) {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const key = admin ? "delivery-zones:admin" : "delivery-zones";

  const load = useCallback(
    () =>
      loadResource<DeliveryZone[]>(
        key,
        () => apiFetch<DeliveryZone[]>(`/api/delivery-zones${admin ? "?include_inactive=true" : ""}`, admin ? { admin: true } : {}),
        { cache: false },
      ).then(({ value, stale }) => {
        setZones(value ?? []);
        setStale(stale);
        setLoading(false);
      }),
    [admin, key],
  );

  useEffect(() => {
    void load();
  }, [load]);

  /** Vuelve a leer las zonas tras crear, editar o borrar una. */
  const reload = useCallback(async () => {
    invalidateResource(key);
    await load();
  }, [key, load]);

  return { zones, loading, stale, reload };
}
