/**
 * Envío a domicilio (D44).
 *
 * Una **zona de envío** cubre una comuna (país > región > ciudad), con su **tarifa** y su **límite de
 * cobro**: desde ese monto el envío es gratis. Son locales (solo Chile) y hay un espejo del contrato de
 * `GET /api/delivery-zones`. La tienda no menciona el envío mientras no haya ninguna zona activa.
 */

export type DeliveryZone = {
  id: string;
  country: string;
  region: string;
  city: string;
  fee: number;
  /** Monto desde el cual el envío es gratis; 0 = nunca gratis. */
  free_threshold: number;
  /** Solo llega en el listado del panel (`include_inactive=true`). */
  active?: boolean;
  created_at?: string;
};

/** Compara texto sin importar mayúsculas ni espacios sobrantes. */
function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Zona activa que cubre esa comuna (región + ciudad), o `null` si no hay envío ahí. */
export function findDeliveryZone(zones: DeliveryZone[], region: string, city: string): DeliveryZone | null {
  if (!region.trim() || !city.trim()) return null;
  return zones.find((zone) => same(zone.region, region) && same(zone.city, city)) ?? null;
}

/**
 * Tarifa de envío para un carrito: 0 si no hay zona, si el comprador no alcanza y **gratis** cuando el
 * subtotal llega al límite de cobro de la zona. La API recalcula lo mismo al registrar el pedido.
 */
export function deliveryFee(zone: DeliveryZone | null, subtotal: number): number {
  if (!zone) return 0;
  if (zone.free_threshold > 0 && subtotal >= zone.free_threshold) return 0;
  return zone.fee;
}

/** Etiqueta corta de una zona: «San Javier, Región del Maule». */
export function deliveryZoneLabel(zone: DeliveryZone): string {
  return `${zone.city}, ${zone.region}`;
}
