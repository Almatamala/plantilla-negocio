"use client";

import { CHILE_REGIONS, comunasOf } from "@/lib/chile";

/**
 * Selects en cascada **región → comuna** de Chile (D44).
 *
 * La cobertura de envío se elige por comuna y esa lista aparecía copiada en la Agenda, el checkout y
 * Mi cuenta; acá vive una sola vez. La clase la pasa cada pantalla porque cada una tiene su propio estilo
 * de campo (panel, checkout o cuenta).
 */
export function RegionSelect({ value, onChange, className }: { value: string; onChange: (value: string) => void; className: string }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={className}>
      <option value="">Elige una región</option>
      {CHILE_REGIONS.map((row) => <option key={row.region} value={row.region}>{row.region}</option>)}
    </select>
  );
}

/** Comuna en cascada: sin región elegida queda deshabilitada y muestra las comunas de esa región (D44). */
export function ComunaSelect({ region, value, onChange, className }: { region: string; value: string; onChange: (value: string) => void; className: string }) {
  return (
    <select value={value} disabled={!region} onChange={(event) => onChange(event.target.value)} className={className}>
      <option value="">{region ? "Elige una comuna" : "Primero elige la región"}</option>
      {comunasOf(region).map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  );
}
