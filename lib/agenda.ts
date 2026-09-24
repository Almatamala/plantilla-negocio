/**
 * Puntos donde el cliente retira (retiro presencial o punto de encuentro) y sus franjas horarias.
 *
 * Estaban declarados por separado en el checkout, la agenda del panel y el formulario de pedidos, y el
 * mismo tipo se repetía con campos distintos según lo que cada pantalla hubiera usado. Aquí queda la
 * forma que devuelve la API (D16 y D18).
 */

export type ZoneType = "retiro" | "encuentro";

/** Punto de retiro o punto de encuentro. `active` solo llega en los listados del panel. */
export type Zone = {
  id: string;
  name: string;
  type: ZoneType;
  location: string | null;
  active?: boolean;
};

/**
 * Franja horaria de un punto: `weekdays` usa 0 domingo … 6 sábado (D18). No tiene nombre: se nombra
 * por su horario, y los días libres salen de `weekdays` más las fechas cerradas puntuales.
 */
export type Slot = {
  id: string;
  zone_id: string;
  start_time: string;
  end_time: string;
  weekdays: number[];
  enabled?: boolean;
  zone_name?: string | null;
};

/** Tipo normalizado: los puntos creados antes de D16 (p. ej. `domicilio`) se tratan como retiro. */
export const zoneTypeOf = (type: string): ZoneType => (type === "encuentro" ? "encuentro" : "retiro");
