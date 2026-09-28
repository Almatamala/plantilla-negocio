import { NextRequest } from "next/server";

/**
 * Creación de transacción Webpay Plus (D8).
 * Activo solo cuando existen credenciales TBK. Mientras no haya credenciales
 * devuelve 501 para que el checkout muestre "Webpay próximamente".
 *
 * Para activarlo:
 *   1. Solicita credenciales en Transbank (ambiente de integración primero).
 *   2. Define TBK_COMMERCE_CODE, TBK_API_KEY_ID y TBK_API_KEY_SECRET en el entorno.
 *   3. Instala el SDK oficial (p. ej. `transbank-sdk`) y reemplaza el TODO.
 *   4. Define NEXT_PUBLIC_WEBPAY_ENABLED=true para mostrar la opción en el checkout.
 *
 * El `returnUrl` de la transacción es `${origin}/api/webpay/confirm`: ese route handler confirma el
 * pago y muestra la **página visible** `/checkout/retorno` con el resultado.
 */
export async function POST(request: NextRequest) {
  const commerceCode = process.env.TBK_COMMERCE_CODE;
  const apiKeyId = process.env.TBK_API_KEY_ID;
  const apiKeySecret = process.env.TBK_API_KEY_SECRET;
  if (!commerceCode || !apiKeyId || !apiKeySecret) {
    return Response.json({ error: "Webpay no configurado." }, { status: 501 });
  }
  const { orderId, total } = await request.json();
  if (!orderId || typeof total !== "number" || total <= 0) {
    return Response.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  // Pendiente (D8): crear la transacción con el SDK de Transbank (ver `PLAN.md` §5):
  //   const tx = new WebpayPlus.Transaction();
  //   const { url, token } = await tx.create(buyOrder, sessionId, total, returnUrl);
  return Response.json({ url: "", token: "" }, { status: 501 });
}