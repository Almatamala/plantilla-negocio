import { NextRequest } from "next/server";

/**
 * Retorno de Webpay Plus (F2.3 / D8): acá vuelve el **navegador** desde la pasarela.
 *
 * No devuelve JSON: siempre termina en la **página visible** `/checkout/retorno`, con el estado del
 * pago. Los casos:
 *   - **Anulado:** Webpay llega con `TBK_TOKEN` y sin `token_ws` (el cliente cerró la pasarela). No hay
 *     nada que confirmar, así que se muestra el estado `anulado` sin exigir credenciales.
 *   - **Confirmación:** con `token_ws`, se confirma la transacción con el SDK de Transbank; según el
 *     resultado (`AUTHORIZED`) se marca el pedido como pagado y se muestra `ok`, o `rechazado`.
 *
 * Mientras no haya credenciales TBK el route handler devuelve 501, como el resto del flujo Webpay.
 */
function retornoUrl(request: NextRequest, estado: string, pedido: string): URL {
  const url = new URL("/checkout/retorno", request.nextUrl.origin);
  url.searchParams.set("estado", estado);
  if (pedido) url.searchParams.set("pedido", pedido);
  return url;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const commerceCode = process.env.TBK_COMMERCE_CODE;
  const apiKeyId = process.env.TBK_API_KEY_ID;
  const apiKeySecret = process.env.TBK_API_KEY_SECRET;
  const token = searchParams.get("token_ws");
  // `TBK_ORDEN_COMPRA` trae el `buyOrder` (la referencia del pedido) que se envió al crear la transacción.
  const pedido = searchParams.get("TBK_ORDEN_COMPRA") ?? "";

  // Fin de compra cancelado por el cliente: Webpay no manda `token_ws`.
  if (!token && searchParams.get("TBK_TOKEN")) {
    return Response.redirect(retornoUrl(request, "anulado", pedido), 303);
  }
  if (!commerceCode || !apiKeyId || !apiKeySecret) {
    return Response.json({ error: "Webpay no configurado." }, { status: 501 });
  }
  if (!token) {
    return Response.redirect(retornoUrl(request, "error", pedido), 303);
  }
  // TODO(F2.3): confirmar con el SDK de Transbank y marcar la orden como pagada:
  //   const tx = new WebpayPlus.Transaction();
  //   const result = await tx.commit(token);
  //   const estado = result.status === "AUTHORIZED" ? "ok" : "rechazado";
  //   return Response.redirect(retornoUrl(request, estado, result.buy_order ?? pedido), 303);
  return Response.json({ error: "Pendiente de implementación del SDK." }, { status: 501 });
}
