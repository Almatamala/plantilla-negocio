/**
 * Última versión conocida de los datos de la vidriera de la tienda.
 *
 * Si la API (o su base de datos) no responde, la carta y la ficha caían a los valores por defecto —
 * productos demo, ajustes de plantilla — y el cliente veía una tienda que no es la suya. Acá se
 * guarda en `localStorage` la última respuesta buena y se usa como respaldo, sin service worker ni
 * PWA ni copia en el servidor: no hay proceso que mantener y ocupa unos pocos KB.
 *
 * Alcance acordado (PLAN §0.9, D20):
 * - **Sí:** tienda y ficha de producto (la vidriera: catálogo, ajustes y la ficha por slug).
 * - **No:** el **checkout**, porque con la API caída el pedido no se puede registrar igual; ahí se
 *   avisa explícitamente en vez de mostrar puntos y horarios que quizá ya no existen.
 * - **No:** el **panel**. Un stock o un pedido viejos inducirían a editar sobre datos desactualizados.
 *
 * Es un respaldo de **último recurso**: la API siempre gana cuando responde y lo guardado vence a los
 * 7 días. Solo cubre a quien ya visitó la tienda antes; una primera visita durante una caída sigue
 * viendo los valores por defecto.
 */

/**
 * `v1` invalida todo lo guardado. **Subir la versión cuando cambie la forma de los datos de la API**:
 * las entradas viejas dejan de leerse y se borran en la próxima escritura (si no, quedarían mapeadas
 * a ciegas por componentes que esperan el formato nuevo).
 */
const VERSION = "v1";
const PREFIX = "bosque-cache:";
const currentPrefix = () => `${PREFIX}${VERSION}:`;

/** Un dato guardado más viejo que esto se descarta: mejor los valores por defecto que un precio de hace un mes. */
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

type Entry<T> = { savedAt: number; value: T };

let swept = false;

/** Borra lo guardado por versiones anteriores (una sola vez por carga de página). */
function sweepOldVersions(): void {
  if (swept || typeof window === "undefined") return;
  swept = true;
  try {
    const keep = currentPrefix();
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX) && !key.startsWith(keep)) window.localStorage.removeItem(key);
    }
  } catch {
    /* sin almacenamiento disponible */
  }
}

/** Devuelve lo último guardado para esa clave, o `null` si no hay nada (o ya venció). */
export function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  sweepOldVersions();
  try {
    const raw = window.localStorage.getItem(currentPrefix() + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.savedAt !== "number") return null;
    if (Date.now() - entry.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(currentPrefix() + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

/**
 * Lectura con respaldo en un solo paso: pide a la API, guarda la respuesta y, si la petición falla,
 * devuelve lo último guardado.
 *
 * `fromCache` en `true` significa que **la API no respondió** (el valor, si hay, viene del caché): es la
 * señal que usan las pantallas para avisar o para bloquear una acción (p. ej. el botón de confirmar del
 * checkout). Sin esto, cada pantalla repetía el mismo `then(writeCache).catch(readCache)`.
 */
export async function loadCached<T>(key: string, loader: () => Promise<T>): Promise<{ value: T | null; fromCache: boolean }> {
  try {
    const value = await loader();
    writeCache(key, value);
    return { value, fromCache: false };
  } catch {
    return { value: readCache<T>(key), fromCache: true };
  }
}

/** Guarda la respuesta buena de la API para poder mostrarla si la próxima lectura falla. */
export function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  sweepOldVersions();
  try {
    window.localStorage.setItem(currentPrefix() + key, JSON.stringify({ savedAt: Date.now(), value } satisfies Entry<T>));
  } catch {
    /* sin espacio o sin almacenamiento disponible */
  }
}
