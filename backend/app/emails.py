"""Correos transaccionales del negocio (Resend).

Se usa la API HTTP de Resend con `requests` (ya es dependencia del proyecto) para no
agregar un SDK extra. Si faltan las credenciales, el envío se omite y queda en el log:
la tienda nunca se cae por un correo.
"""

import logging

import requests

logger = logging.getLogger("bosque.emails")

RESEND_DEFAULT_URL = "https://api.resend.com/emails"
CODE_TTL_MINUTES = 15


def _clp(value: int) -> str:
    """Precio en pesos chilenos, como en la tienda ($25.000)."""
    return f"${value:,}".replace(",", ".")


def verification_email_html(*, store_name: str, name: str, code: str, store_url: str = "", ttl_minutes: int = CODE_TTL_MINUTES) -> str:
    """Correo personalizado con el código temporal de 6 dígitos."""
    greeting = f"Hola {name.strip()}," if name and name.strip() else "Hola,"
    buy_link = (
        f'<p style="margin:24px 0 0"><a href="{store_url}" '
        f'style="background:#243128;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Ir a la tienda</a></p>'
        if store_url else ""
    )
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;background:#faf7f0;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;color:#243128">
    <p style="margin:0;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#56745c">{store_name}</p>
    <h1 style="margin:12px 0 0;font-size:24px">Confirma tu correo</h1>
    <p style="margin:16px 0 0;line-height:1.6;color:#526058">{greeting}</p>
    <p style="margin:8px 0 0;line-height:1.6;color:#526058">Creamos tu cuenta en {store_name}. Para activarla, escribe este código en la página de acceso:</p>
    <p style="margin:24px 0;font-size:34px;font-weight:700;letter-spacing:.28em;text-align:center;background:#edf0e8;border-radius:12px;padding:18px 8px">{code}</p>
    <p style="margin:0;line-height:1.6;color:#526058">El código vence en {ttl_minutes} minutos y solo puede usarse una vez.</p>
    <p style="margin:8px 0 0;line-height:1.6;color:#748077;font-size:13px">Si no pediste esta cuenta, ignora este correo: no se activará nada.</p>
    {buy_link}
  </div>
</div>"""


def send_email(*, to: str, subject: str, html: str, api_key: str, sender: str, api_url: str = RESEND_DEFAULT_URL) -> bool:
    """Envía un correo con Resend. Devuelve `False` si no está configurado o falla."""
    if not api_key or not sender:
        logger.warning("Correo a %s no enviado: faltan RESEND_API_KEY / RESEND_EMAIL_FROM.", to)
        return False
    try:
        response = requests.post(
            api_url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": sender, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
    except Exception as error:  # noqa: BLE001 — red caída, DNS, timeout…
        logger.error("No se pudo enviar el correo a %s: %s", to, error)
        return False
    if response.status_code >= 400:
        logger.error("Resend respondió %s al enviar a %s: %s", response.status_code, to, response.text[:300])
        return False
    return True


def order_email_html(
    *,
    store_name: str,
    store_url: str = "",
    for_store: bool,
    order_id: str,
    customer_name: str = "",
    customer_phone: str = "",
    customer_email: str = "",
    items: list[dict],
    total: int,
    scheduled_date: str = "",
    time_slot: str = "",
    place: str = "",
    payment_method: str = "",
) -> str:
    """Resumen del pedido por correo: al **cliente** (confirmación) y a la **tienda** (aviso).

    El mismo cuerpo sirve para los dos: cambia el encabezado y, en el aviso a la tienda, se agregan los
    datos de contacto del cliente. Se usa al registrar un pedido (ver `send_order_confirmation`).
    """
    items_rows = "".join(
        f'<tr><td style="padding:6px 0;color:#526058">{item["quantity"]} × {item["name"]}</td>'
        f'<td style="padding:6px 0;text-align:right;white-space:nowrap">{_clp(item["unit_price"] * item["quantity"])}</td></tr>'
        for item in items
    )
    schedule = " · ".join(part for part in (scheduled_date, time_slot) if part)
    detail_rows = "".join(
        f'<tr><td style="padding:4px 0;color:#748077">{label}</td>'
        f'<td style="padding:4px 0;text-align:right;color:#526058">{value}</td></tr>'
        for label, value in (("Retiro", place), ("Agenda", schedule), ("Pago", payment_method))
        if value
    )
    if for_store:
        title = f"Nuevo pedido #{order_id}"
        intro = "Entró un pedido nuevo, agendado para retiro presencial:"
        contact = (
            f'<p style="margin:16px 0 0;line-height:1.6;color:#526058"><strong>Cliente:</strong> '
            f'{customer_name or "Sin nombre"}'
            + (f" · {customer_phone}" if customer_phone else "")
            + (f" · {customer_email}" if customer_email else "")
            + "</p>"
        )
        button_href = f"{store_url}/admin" if store_url else ""
        button_text = "Ver en el panel"
        footer = "Los pedidos nuevos también quedan en el panel, con su estado de pago y de retiro."
    else:
        greeting = f"Hola {customer_name.strip()}," if customer_name and customer_name.strip() else "Hola,"
        title = "¡Gracias por tu pedido!"
        intro = f"{greeting} recibimos tu pedido y lo dejamos agendado. Te confirmaremos el pago y la entrega por WhatsApp:"
        contact = ""
        button_href = store_url
        button_text = "Ir a la tienda"
        footer = "Si algo no calza, responde este correo y lo revisamos."
    button = (
        f'<p style="margin:24px 0 0"><a href="{button_href}" '
        f'style="background:#243128;color:#ffffff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">{button_text}</a></p>'
        if button_href else ""
    )
    return f"""\
<div style="font-family:Arial,Helvetica,sans-serif;background:#faf7f0;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;color:#243128">
    <p style="margin:0;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#56745c">{store_name}</p>
    <h1 style="margin:12px 0 0;font-size:24px">{title}</h1>
    <p style="margin:8px 0 0;font-size:13px;letter-spacing:.08em;color:#748077">Pedido #{order_id}</p>
    <p style="margin:16px 0 0;line-height:1.6;color:#526058">{intro}</p>
    {contact}
    <table style="margin:20px 0 0;width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #edf0e8">{items_rows}</table>
    <table style="margin:12px 0 0;width:100%;border-collapse:collapse;font-size:14px;border-top:1px solid #e2e5df;padding-top:8px">{detail_rows}</table>
    <p style="margin:12px 0 0;font-size:18px;text-align:right"><strong>Total {_clp(total)}</strong></p>
    {button}
    <p style="margin:20px 0 0;line-height:1.6;color:#748077;font-size:13px">{footer}</p>
  </div>
</div>"""


def send_order_confirmation(
    *,
    order_id: str,
    customer_name: str = "",
    customer_phone: str = "",
    customer_email: str = "",
    items: list[dict],
    total: int,
    scheduled_date: str = "",
    time_slot: str = "",
    place: str = "",
    payment_method: str = "",
    store_name: str,
    store_url: str = "",
    store_email: str = "",
    api_key: str,
    sender: str,
    api_url: str = RESEND_DEFAULT_URL,
) -> dict[str, bool]:
    """Avisa del pedido al **cliente** y a la **tienda**. Devuelve qué envíos salieron.

    El cliente recibe la confirmación en el correo que dejó en el checkout y la tienda recibe el aviso
    en su correo de contacto (Contenido). Si los dos correos coinciden se envía una sola vez, con el
    cuerpo del cliente. Nunca lanza: cada envío es de mejor esfuerzo (ver `send_email`).
    """
    common = dict(
        store_name=store_name,
        store_url=store_url,
        order_id=order_id,
        customer_name=customer_name,
        customer_phone=customer_phone,
        customer_email=customer_email,
        items=items,
        total=total,
        scheduled_date=scheduled_date,
        time_slot=time_slot,
        place=place,
        payment_method=payment_method,
    )
    result = {"customer": False, "store": False}
    if customer_email.strip():
        result["customer"] = send_email(
            to=customer_email.strip(),
            subject=f"Confirmamos tu pedido #{order_id} · {store_name}",
            html=order_email_html(for_store=False, **common),
            api_key=api_key,
            sender=sender,
            api_url=api_url,
        )
    if store_email.strip() and store_email.strip().lower() != customer_email.strip().lower():
        result["store"] = send_email(
            to=store_email.strip(),
            subject=f"Nuevo pedido #{order_id} · {store_name}",
            html=order_email_html(for_store=True, **common),
            api_key=api_key,
            sender=sender,
            api_url=api_url,
        )
    return result


def send_verification_code(
    *,
    to: str,
    name: str,
    code: str,
    store_name: str,
    store_url: str = "",
    api_key: str,
    sender: str,
    api_url: str = RESEND_DEFAULT_URL,
) -> bool:
    """Correo con el código temporal de 6 dígitos para confirmar la cuenta."""
    return send_email(
        to=to,
        subject=f"Tu código de verificación · {store_name}",
        html=verification_email_html(store_name=store_name, name=name, code=code, store_url=store_url),
        api_key=api_key,
        sender=sender,
        api_url=api_url,
    )
