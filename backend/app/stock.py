"""Reserva de stock y expiración de los pedidos **pendientes de pago**.

El pedido se registra antes de pagar y **descuenta stock** al instante: eso es la reserva. Si el pago no
llega dentro de `stock_hold_minutes`, la reserva **expira**: se devuelve el stock y el pedido queda
`expired`, para que una compra abandonada no deje unidades tomadas para siempre.

La liberación corre en una **tarea de fondo** (igual que la renovación del token de Instagram, ver
`app/instagram.py`) y también de forma **perezosa** antes de crear un pedido, para que la disponibilidad
esté al día sin depender del reloj de la tarea.

Solo se tocan pedidos **`pending`** con `expires_at` vencido: un pedido **pagado** conserva su stock
aunque la fecha haya pasado.
"""

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import get_settings
from .models import Order, OrderItem, Product

logger = logging.getLogger("bosque.stock")

PENDING_STATUS = "pending"
# El pedido deja de estar pendiente: la reserva se libera y no vuelve a expirar.
EXPIRED_STATUS = "expired"
RELEASING_STATUSES = ("cancelled", "expired")


def hold_until(now: datetime | None = None) -> datetime:
    """Cuándo vence la reserva de un pedido recién creado (UTC)."""
    minutes = max(1, get_settings().stock_hold_minutes)
    return (now or datetime.now(timezone.utc)) + timedelta(minutes=minutes)


def release_stock(db: Session, items: list[OrderItem]) -> None:
    """Devuelve al inventario lo que el pedido tenía reservado.

    Si un producto quedó **agotado** solo por falta de stock, vuelve a `active`; el estado manual del
    dueño se respeta, igual que en el descuento al crear el pedido.
    """
    for item in items:
        if not item.product_id:
            continue
        product = db.get(Product, item.product_id)
        if product is None:
            continue
        product.inventory = (product.inventory or 0) + item.quantity
        if product.status == "sold_out" and not product.allow_backorder:
            product.status = "active"


def release_expired_orders(db: Session, now: datetime | None = None) -> int:
    """Expira los pedidos pendientes cuya reserva venció. Devuelve cuántos liberó."""
    reference = now or datetime.now(timezone.utc)
    rows = db.scalars(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.status == PENDING_STATUS, Order.expires_at.is_not(None), Order.expires_at < reference)
    ).all()
    for order in rows:
        release_stock(db, order.items)
        order.status = EXPIRED_STATUS
        order.expires_at = None
    if rows:
        db.commit()
        logger.info("Reservas vencidas liberadas: %s pedido(s).", len(rows))
    return len(rows)


def _release_cycle(session_factory: Callable[[], Session]) -> None:
    with session_factory() as db:
        release_expired_orders(db)


async def release_loop(session_factory: Callable[[], Session]) -> None:
    """Tarea de fondo: revisa las reservas vencidas cada `stock_hold_check_minutes`.

    La fábrica de sesiones la pasa quien arranca la tarea (`main.lifespan`), para que use siempre el
    motor de la aplicación en curso. Un fallo puntual no mata la tarea.
    """
    interval = max(1, get_settings().stock_hold_check_minutes) * 60
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_release_cycle, session_factory)
        except Exception:  # noqa: BLE001 — un fallo puntual no debe matar la tarea
            logger.exception("Falló la liberación de reservas vencidas.")
