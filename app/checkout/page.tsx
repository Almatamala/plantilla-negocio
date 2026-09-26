"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, CreditCard, Store } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { loadCached } from "@/lib/offline-cache";
import { formatPrice, mapApiProduct, products as demoProducts, type ApiProduct, type Product } from "@/lib/products";
import { useStoreSettings } from "@/lib/use-store-settings";
import { CheckoutFooter, CheckoutHeader } from "@/components/checkout-shell";
import { WEEKDAY_LONG, formatSlot, weekdayFromIso } from "@/lib/schedule";
import type { Slot, Zone } from "@/lib/agenda";
import { MONTHS_SHORT } from "@/lib/months";
import { WhatsAppButton } from "@/components/whatsapp-button";

type PlacedOrder = { id: string; total: number; items: { name: string; quantity: number; price: number }[]; zone: string; date: string; slot: string; payment: string };

/** El cliente puede agendar hasta dos semanas de anticipación (D16). */
const SCHEDULE_WINDOW_DAYS = 14;

const FIELD = "w-full rounded-lg border border-[#c9cfc4] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#243128]";
const SECTION = "border-t border-[#e2e5df] py-7 first:border-t-0 first:pt-0";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[#3f4b43]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[#748077]">{hint}</span>}
    </label>
  );
}

export default function CheckoutPage() {
  const { cart, clear: clearCart } = useCart();
  const [catalog, setCatalog] = useState<Product[]>(demoProducts);
  const config = useStoreSettings();
  /** Puntos y franjas reales de la API. Si no responden, el checkout avisa en vez de inventarlos. */
  const [slots, setSlots] = useState<Slot[]>([]);
  const [closedDays, setClosedDays] = useState<string[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const session = useSession();
  const user = session.user;
  const [message, setMessage] = useState("");
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  /** La API no respondió en alguna lectura clave (catálogo o agenda): no se puede pedir. */
  const [catalogOk, setCatalogOk] = useState(true);
  const [scheduleOk, setScheduleOk] = useState(true);
  /** Alto real disponible para la columna de resumen (lo mide `useEffect` más abajo). */
  const [summaryMaxHeight, setSummaryMaxHeight] = useState<number | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Acá la última versión conocida sólo cubre el **catálogo** (para que el carrito no muestre precios
  // falsos) y los **ajustes** (nombre de la tienda, vía `useStoreSettings`).
  // Puntos de retiro, franjas y cierres **no** se respaldan: con la API caída no se puede registrar el
  // pedido igual, así que es más honesto avisar que ofrecer horarios que quizá ya no existen
  // (PLAN §0.9, D20).
  useEffect(() => {
    void loadCached("catalog", () => apiFetch<ApiProduct[]>("/api/products").then((rows) => rows.map((row, index) => mapApiProduct(row, index))))
      .then(({ value, fromCache }) => {
        setCatalogOk(!fromCache);
        if (value?.length) setCatalog(value);
      });
    apiFetch<Slot[]>("/api/time-slots").then((rows) => {
      if (!rows.length) return;
      setSlots(rows.map((slot) => ({ ...slot, weekdays: Array.isArray(slot.weekdays) ? slot.weekdays : [] })));
    }).catch(() => setScheduleOk(false));
    apiFetch<{ date: string }[]>("/api/closed-days")
      .then((rows) => setClosedDays(rows.map((d) => d.date)))
      .catch(() => setScheduleOk(false));
    apiFetch<Zone[]>("/api/shipping-zones").then((rows) => {
      if (rows.length) setZones(rows);
    }).catch(() => setScheduleOk(false));
  }, []);

  /** Sin catálogo o sin agenda no hay forma de agendar ni de registrar el pedido. */
  const unavailable = !catalogOk || !scheduleOk;
  const whatsappDigits = (config.whatsapp_phone ?? "").replace(/\D/g, "");

  // Si hay sesión, el contacto se completa con sus datos. Se deriva en el render (no en un efecto)
  // para no pisar lo que el cliente ya haya escrito; el flujo de invitado sigue igual.
  const contact = {
    name: customer.name || user?.name || "",
    phone: customer.phone || user?.phone || "",
    email: customer.email || user?.email || "",
  };

  const lines = useMemo(() => Object.entries(cart).flatMap(([id, qty]) => { const p = catalog.find((c) => c.id === id); return p ? [{ product: p, qty }] : []; }), [cart, catalog]);
  const total = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  // No hay despacho a domicilio: el tipo de entrega se deriva del punto de retiro elegido (D16).
  const selectedZone = zones.find((z) => z.id === zoneId) ?? null;
  /** Franjas del punto elegido (D18): cada una declara los días de la semana en que atiende. */
  const zoneSlots = useMemo(() => slots.filter((slot) => slot.zone_id === selectedZone?.id), [slots, selectedZone?.id]);
  /** Días de preparación del pedido (D35): manda el producto que más tarda del carrito. */
  const preparationDays = useMemo(() => lines.reduce((max, { product }) => Math.max(max, product.preparation_days ?? 0), 0), [lines]);
  // Un día se puede agendar si el punto atiende ese día de la semana, no está cerrado y el pedido
  // alcanza a prepararse (pasaron sus días de preparación).
  // El calendario arranca en el **primer día disponible**: si no, mostraría varios días bloqueados
  // seguidos antes de llegar al primero al que de verdad se puede agendar (D35).
  const days = useMemo(() => {
    const toIso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const earliest = new Date(today);
    earliest.setDate(earliest.getDate() + preparationDays);
    const scan = Array.from({ length: SCHEDULE_WINDOW_DAYS + preparationDays + 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = toIso(d);
      const weekday = d.getDay();
      const closed = closedDays.includes(iso);
      const attends = zoneSlots.some((slot) => slot.weekdays.includes(weekday));
      const prepared = d.getTime() >= earliest.getTime();
      return { iso, day: d.getDate(), month: MONTHS_SHORT[d.getMonth()], weekday: WEEKDAY_LONG[weekday].toLowerCase(), closed, prepared, available: Boolean(selectedZone) && prepared && !closed && attends };
    });
    const first = scan.findIndex((day) => day.available);
    return (first > 0 ? scan.slice(first) : scan).slice(0, SCHEDULE_WINDOW_DAYS);
  }, [closedDays, zoneSlots, selectedZone, preparationDays]);

  // Si cambia el carrito (más días de preparación) el día elegido puede quedar fuera de la agenda: en
  // vez de limpiarlo con un efecto, se **deriva** el día válido durante el render.
  const selectedDate = days.some((day) => day.iso === date && day.available) ? date : "";
  /** Franjas que aplican al día elegido; el cliente solo puede elegir entre ellas. */
  const daySlots = useMemo(() => (selectedDate ? zoneSlots.filter((slot) => slot.weekdays.includes(weekdayFromIso(selectedDate))) : []), [selectedDate, zoneSlots]);
  const selectedSlot = daySlots.find((slot) => slot.id === slotId) ?? null;

  async function confirm() {
    setMessage("");
    if (unavailable) { setMessage("No podemos conectar con la tienda. Vuelve a intentarlo en unos minutos."); return; }
    if (!selectedZone || !selectedDate || !selectedSlot) { setMessage("Elige punto de retiro, día y horario."); return; }
    if (!contact.name || !contact.phone) { setMessage("Completa tu nombre y teléfono."); return; }
    const zone = selectedZone;
    const slot = selectedSlot;
    const items = lines.map(({ product, qty }) => ({ product_id: product.id, name: product.name, unit_price: product.price, quantity: qty }));
    try {
      const order = await apiFetch<{ id: string }>("/api/orders", {
        method: "POST",
        body: {
          customer_name: contact.name, customer_phone: contact.phone, customer_email: contact.email || null,
          payment_method: "Webpay",
          scheduled_date: selectedDate, time_slot_id: slotId, shipping_zone_id: zone.id,
          location: zone.location || zone.name,
          items,
        },
      });
      setPlacedOrder({
        id: order.id.slice(0, 8).toUpperCase(),
        total,
        items: items.map(({ name, quantity, unit_price }) => ({ name, quantity, price: unit_price })),
        zone: zone.name,
        date: selectedDate,
        slot: `${slot.start_time}–${slot.end_time}`,
        payment: "Webpay Plus",
      });
      clearCart();
      if (process.env.NEXT_PUBLIC_ORDER_WEBHOOK_URL) {
        fetch(process.env.NEXT_PUBLIC_ORDER_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, customer: contact.name, total, date, slot: `${slot.start_time}–${slot.end_time}`, zone: zone.name, payment: "Webpay" }) }).catch(() => undefined);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar el pedido. Intenta nuevamente.");
    }
  }

  // Espacio de la columna de confirmación: en escritorio el resumen es `sticky`, pero antes de
  // scrollear vive en su posición natural (debajo de la cabecera). Por eso su alto máximo no puede
  // ser «viewport − margen»: hay que descontar también el tramo que va desde el borde superior de la
  // ventana hasta su posición natural. Eso no se puede saber con CSS, así que se mide acá: la columna
  // queda limitada justo al espacio libre y el botón «Confirmar pedido» entra en pantalla sin scrollear.
  // La lista de productos es lo único que se desplaza (ver `summary`); totales y botón no.
  useEffect(() => {
    const measure = () => {
      const el = summaryRef.current;
      if (!el || !el.offsetParent) return; // oculto (móvil/tablet): lo maneja el <details>
      // Se mide el contenedor (el <aside>), que nunca se pega: así el valor es estable aunque el
      // usuario redimensione la ventana con la página ya scrolleada.
      const host = el.parentElement ?? el;
      const top = host.getBoundingClientRect().top + window.scrollY; // offset fijo en el documento
      const available = window.innerHeight - top - 20; // 20px de respiro contra el borde inferior
      setSummaryMaxHeight(Math.max(320, Math.round(available)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const webpayEnabled = process.env.NEXT_PUBLIC_WEBPAY_ENABLED === "true";

  if (placedOrder) {
    return (
      <main className="min-h-screen bg-white text-[#243128]">
        <CheckoutHeader config={config}/>
        <div className="mx-auto max-w-3xl px-5 py-14 md:px-10">
          <h1 className="display text-3xl md:text-4xl">¡Gracias por tu pedido!</h1>
          <p className="mt-3 leading-7 text-[#526058]">Confirmación <strong>#{placedOrder.id}</strong>. Te contactaremos por WhatsApp para coordinar el pago y la entrega.</p>
          <section className="mt-8 border-y border-[#e2e5df] py-6">
            <h2 className="text-sm font-semibold">Resumen del pedido</h2>
            <div className="mt-4 divide-y divide-[#edf0e8]">
              {placedOrder.items.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span>{item.quantity} × {item.name}</span>
                  <span>{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-[#647167]">Retiro</span><span>{placedOrder.zone}</span></div>
              <div className="flex justify-between"><span className="text-[#647167]">Fecha</span><span>{placedOrder.date} · {placedOrder.slot}</span></div>
              <div className="flex justify-between"><span className="text-[#647167]">Pago</span><span>{placedOrder.payment}</span></div>
              <div className="flex justify-between border-t border-[#e2e5df] pt-3 text-base"><span className="font-medium">Total</span><strong className="display text-xl">{formatPrice(placedOrder.total)}</strong></div>
            </div>
          </section>
          <Link href="/#coleccion" className="mt-8 inline-flex items-center gap-2 text-sm text-[#56745c] underline underline-offset-4"><ArrowLeft size={15}/>Volver a la tienda</Link>
        </div>
        <CheckoutFooter config={config}/>
        <WhatsAppButton phone={config.whatsapp_phone}/>
      </main>
    );
  }

  // Resumen del pedido: fijo al costado en escritorio y plegable arriba en móvil,
  // como en la referencia simplysweet.cl.
  //
  // Administración del espacio: el resumen es una columna flex con un alto máximo de
  // «viewport − margen». La **lista de ítems** es lo único que se desplaza (`flex-1
  // min-h-0 overflow-y-auto`), mientras que totales, botón de confirmación y avisos son
  // bloques `shrink-0`: así el botón «Confirmar pedido» nunca queda bajo el borde de la
  // pantalla, por largo que sea el pedido (si no, el resumen fijo se recorta y su parte
  // baja queda inalcanzable porque el sticky la mantiene fuera del scroll de la página).
  const summary = (
    <>
      <div className="min-h-0 flex-1 divide-y divide-[#edf0e8] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]">
        {lines.map(({ product, qty }) => (
          <div key={product.id} className="flex items-center gap-3 py-2.5 text-sm">
            <div data-tone={product.tone} className="product-visual h-12 w-10 shrink-0 rounded-md"/>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{product.name}</span><span className="text-xs text-[#748077]">{qty} × {formatPrice(product.price)}</span></span>
            <span className="whitespace-nowrap">{formatPrice(product.price * qty)}</span>
          </div>
        ))}
        {lines.length === 0 && <p className="py-3 text-sm text-[#647167]">Tu carrito está vacío. <Link href="/#coleccion" className="underline underline-offset-2">Ver productos</Link></p>}
      </div>
      <div className="mt-3 shrink-0 space-y-1.5 border-t border-[#e2e5df] pt-3 text-sm">
        <div className="flex justify-between"><span className="text-[#647167]">Subtotal</span><span>{formatPrice(total)}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#647167]">Retiro</span><span className="text-right">{selectedZone ? selectedZone.name : "Por elegir"}</span></div>
        <div className="flex justify-between gap-3"><span className="text-[#647167]">Agenda</span><span className="text-right">{selectedDate ? `${selectedDate}${selectedSlot ? ` · ${selectedSlot.start_time}–${selectedSlot.end_time}` : ""}` : "Por elegir"}</span></div>
        <div className="flex justify-between border-t border-[#e2e5df] pt-3 text-base"><span className="font-medium">Total</span><strong className="display text-xl">{formatPrice(total)}</strong></div>
      </div>
      <button onClick={confirm} disabled={lines.length === 0 || unavailable} className="mt-4 w-full shrink-0 rounded-full bg-[#243128] py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40">{unavailable ? "Sin conexión con la tienda" : "Confirmar pedido"}</button>
      {message && <p className="mt-3 shrink-0 rounded-lg bg-[#f3e2e0] p-3 text-sm text-[#8a4a44]">{message}</p>}
      <p className="mt-2 shrink-0 text-xs leading-5 text-[#748077]">Al confirmar registramos tu pedido con su día de retiro. {config.name} te confirmará el pago por WhatsApp.</p>
    </>
  );

  return (
    <main className="min-h-screen bg-white text-[#243128]">
      <CheckoutHeader config={config}/>
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-10">
        <p className="text-xs tracking-[.18em] text-[#748077] uppercase">Finalizar compra</p>
        {/* Título y bajada en una sola fila: el resumen arranca más arriba y entra completo
            en pantalla junto al botón de confirmar (ver nota de espacio en `summary`). */}
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
          <h1 className="display text-2xl md:text-3xl">Agenda tu pedido</h1>
          <p className="text-sm text-[#526058]">Elige dónde retiras tu pedido y el día y horario en que lo necesitas.</p>
        </div>

        {/* Sin API no hay disponibilidad real ni forma de registrar el pedido: se dice de frente en
            lugar de mostrar puntos y horarios que podrían no existir (PLAN §0.9, D20). */}
        {unavailable && (
          <div className="mt-4 rounded-xl border border-[#e8c9c1] bg-[#fdf3f1] p-4 text-sm text-[#8a4a44]">
            <p className="font-medium">No podemos conectar con la tienda en este momento.</p>
            <p className="mt-1 leading-6">
              No es posible registrar pedidos ahora mismo. Vuelve a intentarlo en unos minutos
              {whatsappDigits ? <> o escríbenos por <a href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">WhatsApp</a> y lo coordinamos a mano</> : null}.
            </p>
          </div>
        )}

        {/* En móvil el resumen va plegado arriba, como en la referencia. */}
        <details className="mt-6 border-y border-[#e2e5df] py-4 lg:hidden">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">Resumen del pedido<span className="display text-base">{formatPrice(total)}</span></summary>
          <div className="mt-4">{summary}</div>
        </details>

        {/* `min-w-0` en las columnas: sin él, la fila de días (que se desplaza en horizontal)
            ensancha la columna y con ella todos los inputs y botones del formulario, dando
            scroll horizontal a la página en celular. */}
        <div className="mt-4 grid gap-8 lg:mt-6 lg:grid-cols-[55%_45%] lg:gap-0">
          <div className="min-w-0 lg:pr-12">
            <section className={SECTION}>
              <h2 className="text-sm font-semibold">1 · Contacto</h2>
              {user && <p className="mt-2 text-xs text-[#526058]">Sesión iniciada{user.email ? ` como ${user.email}` : ""}. Tus datos se completaron automáticamente.</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Correo electrónico" hint="Opcional: lo usamos para avisarte del pedido.">
                    <input type="email" value={contact.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="tucorreo@ejemplo.cl" className={FIELD}/>
                  </Field>
                </div>
                <Field label="Nombre y apellido">
                  <input required value={contact.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Camila Pérez" className={FIELD}/>
                </Field>
                <Field label="Teléfono (WhatsApp)">
                  <input required value={contact.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="+569 1234 5678" className={FIELD}/>
                </Field>
              </div>
            </section>

            <section className={SECTION}>
              <h2 className="text-sm font-semibold">2 · Punto de retiro</h2>
              {unavailable ? (
                <p className="mt-2 text-sm text-[#8a4a44]">La disponibilidad de puntos de retiro se habilita cuando vuelva la conexión con la tienda.</p>
              ) : (
              <>
              <p className="mt-2 text-xs text-[#647167]">Elige dónde irás a buscar tu pedido. No tenemos despacho a domicilio.</p>
              <div className="mt-3 space-y-2">
                {zones.map((zone) => {
                  const slotSummary = slots.filter((slot) => slot.zone_id === zone.id).map((slot) => formatSlot(slot));
                  return (
                    <label key={zone.id} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm transition ${zoneId === zone.id ? "border-[#243128]" : "border-[#e2e5df] hover:border-[#a7b2a3]"}`}>
                      <input type="radio" name="zone" checked={zoneId === zone.id} onChange={() => { setZoneId(zone.id); setDate(""); setSlotId(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#243128]"/>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          <Store size={15} className="shrink-0 text-[#56745c]"/>
                          <span className="break-words">{zone.name}</span>
                        </span>
                        {zone.location && <span className="mt-1 block break-words text-xs text-[#647167]">{zone.location}</span>}
                        <span className="mt-1 flex items-start gap-1.5 text-xs text-[#647167]">
                          <Clock size={12} className="mt-0.5 shrink-0"/>
                          <span className="break-words">{slotSummary.length > 0 ? `Atiende: ${slotSummary.join(" · ")}` : "Sin horarios publicados todavía"}</span>
                        </span>
                      </span>
                    </label>
                  );
                })}
                {zones.length === 0 && <p className="text-xs text-[#748077]">Aún no hay puntos de retiro configurados.</p>}
              </div>
              </>
              )}
            </section>

            <section className={SECTION}>
              <h2 className="text-sm font-semibold">3 · Día y horario</h2>
              {unavailable ? (
                <p className="mt-2 text-sm text-[#8a4a44]">La agenda se habilita cuando vuelva la conexión con la tienda.</p>
              ) : !selectedZone ? (
                <p className="mt-2 text-xs text-[#647167]">Elige primero el punto de retiro para ver los días disponibles.</p>
              ) : zoneSlots.length === 0 ? (
                <p className="mt-2 text-sm text-[#8a4a44]">Ese punto todavía no tiene horarios publicados. Escríbenos por WhatsApp y lo coordinamos.</p>
              ) : (
                <>
                  <p className="mt-2 text-xs text-[#647167]">
                    {preparationDays > 0 ? `Tu pedido necesita ${preparationDays} ${preparationDays === 1 ? "día" : "días"} de preparación, así que el calendario empieza en el primer día disponible. ` : ""}
                    Hasta {SCHEDULE_WINDOW_DAYS / 7} semanas de anticipación. Solo aparecen los días en que ese punto atiende, y después los horarios de ese día.
                  </p>
                  {days.length === 0 ? (
                    <p className="mt-3 text-sm text-[#8a4a44]">No hay días disponibles en las próximas semanas para este pedido. Escríbenos por WhatsApp y lo coordinamos.</p>
                  ) : (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
                    {days.map((d) => <button key={d.iso} onClick={() => { setDate(d.iso); setSlotId(""); }} disabled={!d.available} title={d.available ? undefined : d.closed ? "Cerrado" : "Ese punto no atiende ese día"} className={`shrink-0 rounded-xl border px-3 py-2 text-center transition ${date === d.iso ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"} ${d.available ? "" : "cursor-not-allowed opacity-35"}`}><span className="block text-[10px] tracking-wider uppercase">{d.weekday}</span><span className="display block text-lg">{d.day}</span><span className="block text-[10px] text-[#748077]">{d.month}</span></button>)}
                  </div>
                  )}
                  {daySlots.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">{daySlots.map((slot) => <button key={slot.id} onClick={() => setSlotId(slot.id)} className={`rounded-full border px-4 py-2 text-sm transition ${slotId === slot.id ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"}`}>{slot.start_time}–{slot.end_time}</button>)}</div>
                  )}
                  {date && daySlots.length === 0 && <p className="mt-3 text-sm text-[#8a4a44]">Elige un día para ver sus horarios.</p>}
                  {date && daySlots.length > 0 && !selectedSlot && <p className="mt-2 text-xs text-[#748077]">Elige el horario en que irás a buscarlo.</p>}
                </>
              )}
            </section>

            <section className={SECTION}>
              <h2 className="text-sm font-semibold">4 · Pago</h2>
              {/* Único medio: Webpay Plus (D8). Hasta cargar las credenciales TBK aparece deshabilitado;
                  el pedido se registra igual y el pago se coordina por WhatsApp. */}
              <div className={`mt-3 flex items-start gap-3 border-y border-[#e2e5df] py-4 ${webpayEnabled ? "" : "opacity-60"}`}>
                <CreditCard size={15} className="mt-0.5 shrink-0 text-[#56745c]"/>
                <span className="flex-1">
                  <span className="block text-sm font-medium">Webpay Plus (débito/crédito)</span>
                  <span className="mt-0.5 block text-xs text-[#647167]">{webpayEnabled ? "Pago en línea con tarjeta" : "Disponible próximamente: por ahora coordinamos el pago por WhatsApp tras agendar"}</span>
                </span>
              </div>
            </section>

          </div>

          {/* La columna del resumen se ancla al viewport y se limita a su alto (24px de
              margen arriba y abajo), para que el botón de confirmar siempre entre en pantalla. */}
          <aside className="mt-8 min-w-0 border-t border-[#e2e5df] pt-6 lg:mt-0 lg:border-t-0 lg:border-l lg:pl-10">
            <div
              ref={summaryRef}
              style={summaryMaxHeight ? { maxHeight: `${summaryMaxHeight}px` } : undefined}
              className="sticky top-5 flex max-h-[calc(100vh-2.5rem)] flex-col"
            >
              <h2 className="shrink-0 text-sm font-semibold">Resumen del pedido</h2>
              <div className="mt-3 flex min-h-0 flex-1 flex-col">{summary}</div>
            </div>
          </aside>
        </div>
      </div>
      <CheckoutFooter config={config}/>
      <WhatsAppButton phone={config.whatsapp_phone}/>
    </main>
  );
}
