/**
 * Pedidos: estados y cómo se muestran.
 *
 * La API guarda el estado en inglés (`pending`, `shipped`…) y la interfaz lo muestra en español (D37).
 * Esa traducción, la vuelta a inglés para escribir en la API y la referencia corta del pedido estaban
 * repetidas en el panel, la cuenta y el checkout; acá viven una sola vez.
 */

/** Estados que ofrece el panel. `paid` y `preparing` se unificaron en «Pendiente» (D37). */
export type OrderStatus = "Pendiente" | "Enviado" | "Entregado" | "Cancelado";

/** Estado de la API → etiqueta de la interfaz (`refunded` se muestra como «Cancelado»). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  refunded: "Cancelado",
};

/** Etiqueta de la interfaz → estado de la API, solo para los estados que el panel puede escribir. */
export const ORDER_STATUS_DB: Record<OrderStatus, string> = {
  Pendiente: "pending",
  Enviado: "shipped",
  Entregado: "delivered",
  Cancelado: "cancelled",
};

/** Etiqueta en español de un estado de la API; si llega uno desconocido, se muestra tal cual. */
export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status;
}

/** Referencia corta del pedido para listados: `#AB12CD34` (si ya viene como referencia, se deja igual). */
export function displayOrderId(id: string): string {
  return id.startsWith("#") ? id : id.slice(0, 8).toUpperCase();
}
