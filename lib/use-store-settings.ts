"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadCached } from "@/lib/offline-cache";
import { mergeSettings, storeConfig, type ApiSettings, type StoreConfig } from "@/lib/store-config";

/**
 * Ajustes de tienda (nombre, anuncio, hero, historia, WhatsApp, Instagram y paleta) con respaldo de
 * **última versión conocida** si la API no responde.
 *
 * Antes la tienda, la ficha, la cuenta y el checkout repetían el mismo efecto (fetch + `mergeSettings` +
 * caché). Devuelve los valores de la plantilla hasta que responde la API.
 */
export function useStoreSettings(): StoreConfig {
  const [config, setConfig] = useState<StoreConfig>(storeConfig);

  useEffect(() => {
    let active = true;
    void loadCached("settings", () => apiFetch<ApiSettings>("/api/settings")).then(({ value }) => {
      if (active && value) setConfig((current) => mergeSettings(current, value));
    });
    return () => {
      active = false;
    };
  }, []);

  return config;
}
