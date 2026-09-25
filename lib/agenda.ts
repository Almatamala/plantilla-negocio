/**
 * Puntos de retiro presencial y sus franjas horarias.
 *
 * Antes se distinguía **retiro presencial** de **punto de encuentro**, pero en la práctica eran lo
 * mismo: una dirección y unos horarios donde el cliente pasa a buscar su pedido. Desde D33 hay un solo
 * tipo, así que el punto ya no lleva `type` (la API tampoco lo devuelve). Aquí queda la forma que
 * devuelve la API (D16 y D18).
 */

/** Punto de retiro presencial. `active` solo llega en los listados del panel. */
export type Zone = {
  id: string;
  name: string;
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
