"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadResource } from "@/lib/resource";
import { mergeSettings, storeConfig, type ApiSettings, type StoreConfig } from "@/lib/store-config";

/** Ajustes tal como los devuelve `GET /api/settings`, con los campos de solo lectura que agrega la API. */
export type RawSettings = ApiSettings & { id?: unknown; updated_at?: unknown };

/**
 * Lectura **compartida** de `GET /api/settings` (con respaldo de la última versión conocida).
 *
 * La tienda la usa a través de `useStoreSettings` y el editor visual la usa tal cual para mandar el
 * objeto completo al guardar; al compartir la clave, la página del editor hace **una** petición y no dos.
 */
export function loadSettings() {
  return loadResource<RawSettings>("settings", () => apiFetch<RawSettings>("/api/settings"));
}

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
    void loadSettings().then(({ value }) => {
      if (active && value) setConfig((current) => mergeSettings(current, value));
    });
    return () => {
      active = false;
    };
  }, []);

  return config;
}
