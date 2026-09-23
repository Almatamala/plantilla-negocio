"""Feed de Instagram propio y renovación **automática** del token de larga duración (D30).

Todo lo de Instagram vive en la API, que es la única fuente de verdad (D7): acá se guarda el token
(tabla `instagram_token`, aparte de `store_settings` porque es una credencial), se consulta la API de
Instagram para armar el feed que sirve `/api/instagram/feed` y una **tarea de fondo** que arranca con la
aplicación lo renueva antes de que venza.

El token de la *Instagram API with Instagram Login* dura **60 días** y se renueva con
`GET /refresh_access_token` (que devuelve otro de 60 días). Instagram exige que el token tenga **al menos
24 h** y que **no esté vencido**, así que la tarea revisa cada pocas horas y **reintenta sola** si falla,
en vez de intentarlo una única vez al filo del vencimiento.

Doc: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
"""

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from .config import get_settings
from .models import InstagramToken

logger = logging.getLogger("bosque.instagram")

GRAPH_API = "https://graph.instagram.com/v23.0"
MEDIA_FIELDS = ",".join(
    [
        "id",
        "caption",
        "media_type",
        "media_url",
        "thumbnail_url",
        "permalink",
        "timestamp",
        "like_count",
        "comments_count",
        "children{media_type,media_url,thumbnail_url}",
    ]
)
REQUEST_TIMEOUT_SECONDS = 15
# Caché en memoria del feed: la sección se pide al cargar la tienda, así que guardar la última respuesta
# buena (15 min, el mismo valor que usaba el route handler de Next) evita gastar llamadas a Instagram.
FEED_CACHE_SECONDS = 900
_feed_cache: dict[int, tuple[float, list[dict]]] = {}


class InstagramError(RuntimeError):
    """No se pudo hablar con la API de Instagram (token vencido, red o respuesta inesperada)."""


def reset_feed_cache() -> None:
    """Vacía la caché del feed (lo usan las pruebas)."""
    _feed_cache.clear()


def _graph_get(path: str, params: dict) -> dict:
    """Pide a la API de Instagram y devuelve el JSON, o levanta `InstagramError`.

    El token viaja como **parámetro** de la petición (nunca dentro de la URL que queda en los logs) y el
    mensaje de error de Instagram se propaga tal cual, porque es lo que explica qué pasó (por ejemplo, que
    el token todavía no tiene las 24 h que exige la renovación).
    """
    response = requests.get(f"{GRAPH_API}/{path}", params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    try:
        data = response.json()
    except ValueError:
        data = {}
    error = data.get("error") if isinstance(data, dict) else None
    if response.status_code >= 400 or error:
        raise InstagramError((error or {}).get("message") or f"HTTP {response.status_code}")
    return data


def as_utc(moment: datetime | None) -> datetime | None:
    """Normaliza a UTC lo que devuelve la base (SQLite guarda los `DateTime` sin zona)."""
    if moment is None:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def stored_token(db: Session) -> InstagramToken:
    """Fila única del token; se crea vacía la primera vez."""
    row = db.get(InstagramToken, True)
    if row is None:
        row = InstagramToken(id=True)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def current_token(db: Session) -> tuple[str, str]:
    """Token vigente y de dónde sale: el que renovó la tarea o, mientras no haya, el del entorno."""
    saved = (stored_token(db).access_token or "").strip()
    if saved:
        return saved, "base_de_datos"
    return get_settings().instagram_access_token.strip(), "entorno"


def feed_configured(db: Session) -> bool:
    """¿Hay con qué armar el feed? Sin credenciales la sección no se dibuja y no es un error."""
    token, _ = current_token(db)
    return bool(token and get_settings().instagram_user_id.strip())


def _image_of(media: dict) -> str:
    """Imagen que se pinta: la propia, la miniatura del video o la primera del carrusel."""
    first = ((media.get("children") or {}).get("data") or [{}])[0]
    candidates = [media.get("thumbnail_url"), media.get("media_url"), first.get("thumbnail_url"), first.get("media_url")]
    return next((url for url in candidates if isinstance(url, str) and url), "")


def normalize_media(media: dict) -> dict:
    """Deja la publicación con lo único que pinta la tienda (`lib/instagram.ts`)."""
    return {
        "id": media.get("id") or "",
        "image": _image_of(media),
        "permalink": media.get("permalink") or "",
        "caption": media.get("caption") or "",
        "likes": media.get("like_count") or 0,
        "comments": media.get("comments_count") or 0,
        "is_video": media.get("media_type") == "VIDEO",
        "timestamp": media.get("timestamp") or "",
    }


def fetch_posts(db: Session, limit: int) -> list[dict]:
    """Últimas publicaciones normalizadas, con caché de `FEED_CACHE_SECONDS`."""
    cached = _feed_cache.get(limit)
    if cached and time.monotonic() - cached[0] < FEED_CACHE_SECONDS:
        return cached[1]
    token, _ = current_token(db)
    user_id = get_settings().instagram_user_id.strip()
    if not token or not user_id:
        raise InstagramError("Falta INSTAGRAM_ACCESS_TOKEN (o su renovación) o INSTAGRAM_USER_ID.")
    data = _graph_get(f"{user_id}/media", {"fields": MEDIA_FIELDS, "limit": limit, "access_token": token})
    posts = [post for post in (normalize_media(item) for item in data.get("data", [])) if post["image"]][:limit]
    _feed_cache[limit] = (time.monotonic(), posts)
    return posts


def refresh_token(db: Session) -> InstagramToken:
    """Renueva el token de larga duración y lo guarda. Levanta `InstagramError` si Instagram lo rechaza."""
    token, _ = current_token(db)
    if not token:
        raise InstagramError("No hay ningún token que renovar: falta INSTAGRAM_ACCESS_TOKEN.")
    data = _graph_get("refresh_access_token", {"grant_type": "ig_refresh_token", "access_token": token})
    new_token = (data.get("access_token") or "").strip()
    if not new_token:
        raise InstagramError("Instagram no devolvió un token nuevo.")
    row = stored_token(db)
    row.access_token = new_token
    row.refreshed_at = datetime.now(timezone.utc)
    row.last_error = None
    db.commit()
    db.refresh(row)
    logger.info("Token de Instagram renovado; vence en ~60 días.")
    return row


def refresh_if_due(db: Session) -> bool:
    """Renueva **solo cuando toca**: pasados `instagram_refresh_days` desde la última renovación.

    Guarda el motivo en `last_error` si Instagram rechaza (lo típico: el token todavía no tiene las 24 h
    que exige) y devuelve `False`; el próximo ciclo lo reintenta solo.
    """
    settings = get_settings()
    row = stored_token(db)
    if not (settings.instagram_user_id.strip() and (settings.instagram_access_token.strip() or row.access_token)):
        return False
    last = as_utc(row.refreshed_at)
    if last is not None and datetime.now(timezone.utc) - last < timedelta(days=settings.instagram_refresh_days):
        return False
    try:
        refresh_token(db)
        return True
    except InstagramError as error:
        row.last_error = str(error)
        db.commit()
        logger.warning("No se pudo renovar el token de Instagram: %s", error)
        return False


def _refresh_cycle(session_factory: Callable[[], Session]) -> None:
    with session_factory() as db:
        refresh_if_due(db)


async def refresh_loop(session_factory: Callable[[], Session]) -> None:
    """Tarea de fondo: revisa el token cada `instagram_refresh_check_hours`.

    Espera un ciclo completo **antes** de la primera revisión: así el arranque de la API nunca depende de
    la red (las pruebas levantan la aplicación y la cierran enseguida, sin llamar a Instagram) y un token
    recién emitido tiene tiempo de cumplir las 24 h que pide la renovación.

    La fábrica de sesiones la pasa quien arranca la tarea (`main.lifespan`), para que use siempre el
    motor de la aplicación en curso.
    """
    interval = max(1, get_settings().instagram_refresh_check_hours) * 3600
    while True:
        await asyncio.sleep(interval)
        try:
            await asyncio.to_thread(_refresh_cycle, session_factory)
        except Exception:  # un fallo puntual no debe matar la tarea
            logger.exception("Error inesperado al renovar el token de Instagram.")
