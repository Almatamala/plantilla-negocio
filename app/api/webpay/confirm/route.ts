import { NextRequest } from "next/server";

/**
 * Confirmación de transacción Webpay Plus (F2.3): recibe el retorno del usuario
 * desde la pasarela, confirma la transacción y marca la orden como pagada.
 * Activo solo con credenciales TBK; sin ellas devuelve 501.
 */
export async function GET(request: NextRequest) {
  const commerceCode = process.env.TBK_COMMERCE_CODE;
  const apiKeyId = process.env.TBK_API_KEY_ID;
  const apiKeySecret = process.env.TBK_API_KEY_SECRET;
  if (!commerceCode || !apiKeyId || !apiKeySecret) {
    return Response.json({ error: "Webpay no configurado." }, { status: 501 });
  }
  const token = request.nextUrl.searchParams.get("token_ws");
  if (!token) {
    return Response.json({ error: "Falta token de transacción." }, { status: 400 });
  }
  // TODO(F2.3): confirmar con el SDK de Transbank:
  //   const tx = new WebpayPlus.Transaction();
  //   const result = await tx.commit(token);
  //   si result.status === "AUTHORIZED", marcar la orden como "paid"
  //   y redirigir al checkout con confirmación visible.
  return Response.json({ error: "Pendiente de implementación del SDK." }, { status: 501 });
}