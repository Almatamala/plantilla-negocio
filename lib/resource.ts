import { loadCached } from "@/lib/offline-cache";

/**
 * Lectura compartida de un recurso de la API.
 *
 * Cada pantalla pedía sus datos por su cuenta y, cuando dos componentes necesitaban lo mismo al mismo
 * tiempo (la tienda y el carrito, el editor y la tienda que dibuja adentro, el checkout y su modal), se
 * disparaban **dos peticiones idénticas**. Acá la petición en vuelo se guarda por clave y quien la pida
 * mientras está pendiente recibe **la misma promesa**: una sola llamada a la API. Es el mismo criterio
 * que ya usa la sesión (`lib/session-client.ts`), aplicado a los datos.
 *
 * El resultado se entrega como `{ value, stale }`:
 * - `stale: false` → la API respondió.
 * - `stale: true` → la API no respondió y el valor, si hay, es la **última versión conocida**
 *   (`lib/offline-cache.ts`). Con `cache: false` no se lee ni se escribe el respaldo, que es lo que
 *   necesitan las pantallas que no deben operar con datos viejos (checkout y agenda, D20).
 *
 * Una lectura compartida **no se cancela** al desmontar un consumidor: la promesa la pueden estar
 * esperando otros. Por eso acá no hay `AbortController`; el respaldo de una lectura no debe quedar a
 * merced de quién se desmonta primero.
 */
export type ResourceResult<T> = {
  value: T | null;
  /** La API no respondió (el valor, si hay, es lo último guardado). */
  stale: boolean;
};

const inFlight = new Map<string, Promise<ResourceResult<unknown>>>();

/** Llama a la API sin respaldo: un fallo se reporta como `stale`, no como excepción. */
async function fromApi<T>(loader: () => Promise<T>): Promise<ResourceResult<T>> {
  try {
    return { value: await loader(), stale: false };
  } catch {
    return { value: null, stale: true };
  }
}

/**
 * Pide un recurso compartido. `key` identifica el recurso (y, cuando hay respaldo, también la clave del
 * caché), así que dos consumidores con la misma clave comparten la lectura.
 */
export function loadResource<T>(
  key: string,
  loader: () => Promise<T>,
  options: { cache?: boolean } = {},
): Promise<ResourceResult<T>> {
  const pending = inFlight.get(key) as Promise<ResourceResult<T>> | undefined;
  if (pending) return pending;
  const request = options.cache === false
    ? fromApi(loader)
    : loadCached(key, loader).then(({ value, fromCache }) => ({ value, stale: fromCache }));
  const tracked = request.finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, tracked as Promise<ResourceResult<unknown>>);
  return tracked;
}

/**
 * Olvida una lectura en vuelo: la próxima vez se vuelve a pedir a la API. Solo hace falta cuando una
 * mutación puede cruzarse con una lectura ya pedida (por ejemplo, guardar en la agenda y recargarla).
 */
export function invalidateResource(key: string): void {
  inFlight.delete(key);
}
