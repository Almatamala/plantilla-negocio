"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useStoreSettings } from "@/lib/use-store-settings";
import { CheckoutFooter, CheckoutHeader } from "@/components/checkout-shell";

/**
 * Página de retorno de **Webpay Plus** (D8): es donde aterriza el navegador cuando el cliente vuelve
 * de la pasarela. El route handler `/api/webpay/confirm` confirma la transacción y **redirige acá**
 * con `estado` (ok | rechazado | anulado | error) y la referencia del pedido.
 *
 * Es una página **visible** y con el mismo shell del checkout (header y footer mínimos, D15): explica
 * en lenguaje claro qué pasó, qué sigue y deja volver a la tienda o reintentar el pago. El pago por
 * Webpay se activa al cargar las credenciales TBK (PLAN §4).
 */

type Estado = "ok" | "rechazado" | "anulado" | "error";

const ESTADOS: Record<Estado, { title: string; message: string; icon: typeof CheckCircle2; iconClass: string }> = {
  ok: {
    title: "¡Pago confirmado!",
    message: "Recibimos tu pago y tu pedido quedó agendado. Te enviaremos el detalle por correo y coordinamos el retiro por WhatsApp.",
    icon: CheckCircle2,
    iconClass: "text-[#3c6b3f]",
  },
  rechazado: {
    title: "Tu pago no se pudo procesar",
    message: "La transacción fue rechazada y no se hizo ningún cargo. Puedes intentarlo de nuevo o escribirnos por WhatsApp y lo coordinamos.",
    icon: XCircle,
    iconClass: "text-[#8a4a44]",
  },
  anulado: {
    title: "Cancelaste el pago",
    message: "No se realizó ningún cargo. Tu pedido quedó registrado y puedes reintentar el pago cuando quieras.",
    icon: AlertTriangle,
    iconClass: "text-[#8a6a2f]",
  },
  error: {
    title: "No pudimos confirmar el pago",
    message: "Ocurrió un problema al confirmar la transacción. Escríbenos por WhatsApp y lo revisamos juntos antes de reintentar.",
    icon: AlertTriangle,
    iconClass: "text-[#8a6a2f]",
  },
};

/** Normaliza lo que viene en la URL: cualquier valor desconocido cae al estado de error. */
function resolveEstado(value: string | null): Estado {
  return value === "ok" || value === "rechazado" || value === "anulado" || value === "error" ? value : "error";
}

function Retorno() {
  const params = useSearchParams();
  const config = useStoreSettings();
  const estado = resolveEstado(params.get("estado"));
  const pedido = (params.get("pedido") ?? "").trim();
  const meta = ESTADOS[estado];
  const Icon = meta.icon;
  const pagado = estado === "ok";

  return (
    <main className="min-h-screen bg-white text-[#243128]">
      <CheckoutHeader config={config}/>
      <div className="mx-auto max-w-3xl px-5 py-14 md:px-10">
        <Icon size={46} className={meta.iconClass}/>
        <h1 className="display mt-4 text-3xl md:text-4xl">{meta.title}</h1>
        {pedido && <p className="mt-2 text-sm text-[#748077]">Pedido <strong className="font-medium text-[#526058]">#{pedido}</strong></p>}
        <p className="mt-4 leading-7 text-[#526058]">{meta.message}</p>

        <section className="mt-8 border-y border-[#e2e5df] py-6">
          <h2 className="text-sm font-semibold">Qué sigue</h2>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[#526058]">
            <li>· {pagado ? "Te enviamos la confirmación del pedido por correo." : "Puedes reintentar el pago o escribirnos y te ayudamos."}</li>
            <li>· Coordinamos el pago y la entrega por WhatsApp.</li>
            <li>· El retiro es presencial en San Javier o Talca, según el punto que elegiste.</li>
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/#coleccion" className="inline-flex items-center gap-2 rounded-full bg-[#243128] px-5 py-2.5 text-sm text-white"><ArrowLeft size={15}/>Volver a la tienda</Link>
          <Link href="/cuenta" className="rounded-full border border-[#d9ddd5] px-5 py-2.5 text-sm transition hover:border-[#243128]">Ver mis pedidos</Link>
          {!pagado && <Link href="/checkout" className="inline-flex items-center gap-2 rounded-full border border-[#d9ddd5] px-5 py-2.5 text-sm transition hover:border-[#243128]"><RefreshCw size={15}/>Reintentar el pago</Link>}
        </div>
      </div>
      <CheckoutFooter config={config}/>
    </main>
  );
}

export default function RetornoWebpayPage() {
  // `useSearchParams` obliga a un límite de Suspense para que la ruta se pueda prerenderizar.
  return (
    <Suspense fallback={<main className="min-h-screen bg-white"/>}>
      <Retorno/>
    </Suspense>
  );
}
