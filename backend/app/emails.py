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
