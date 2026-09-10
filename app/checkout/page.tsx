"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, CreditCard, MapPin, Store } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { formatPrice, products as demoProducts, type Product, type ProductStatus } from "@/lib/products";
import { storeConfig } from "@/lib/store-config";

type Slot = { id: string; label: string; start_time: string; end_time: string };
type Zone = { id: string; name: string; type: "retiro" | "domicilio"; areas: string[] };
type PaymentMethod = "transferencia" | "webpay";
type ApiProduct = { id: string; slug: string; name: string; price: number; description: string | null; status: ProductStatus; inventory: number; allow_backorder: boolean; lead_time_days: number; images: string[]; image_url: string | null; allergens: string[]; category_id: string | null };

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DEMO_SLOTS: Slot[] = [
  { id: "demo-1", label: "Mañana", start_time: "09:00", end_time: "12:00" },
  { id: "demo-2", label: "Mediodía", start_time: "12:00", end_time: "15:00" },
  { id: "demo-3", label: "Tarde", start_time: "15:00", end_time: "18:00" },
];
const DEMO_ZONES: Zone[] = [
  { id: "demo-sj", name: "San Javier", type: "retiro", areas: ["San Javier centro"] },
  { id: "demo-tl", name: "Talca", type: "retiro", areas: ["Talca centro"] },
  { id: "demo-dj", name: "San Javier (domicilio)", type: "domicilio", areas: ["San Javier y alrededores"] },
];

export default function CheckoutPage() {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [catalog, setCatalog] = useState<Product[]>(demoProducts);
  const [slots, setSlots] = useState<Slot[]>(DEMO_SLOTS);
  const [closedDays, setClosedDays] = useState<string[]>([]);
  const [zones, setZones] = useState<Zone[]>(DEMO_ZONES);
  const [bankInfo, setBankInfo] = useState("");
  const [fulfillment, setFulfillment] = useState<"retiro" | "domicilio">("retiro");
  const [zoneId, setZoneId] = useState("");
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("transferencia");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [user, setUser] = useState<{ name?: string | null; email?: string | null; phone?: string | null } | null>(null);
  const [message, setMessage] = useState("");
  const [placed, setPlaced] = useState(false);
  const [placedId, setPlacedId] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("store-cart");
    const timer = window.setTimeout(() => { if (saved) setCart(JSON.parse(saved)); }, 0);
    apiFetch<ApiProduct[]>("/api/products").then((rows) => { if (rows.length) setCatalog(rows.map((p, index) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, description: p.description ?? "", category: "Productos", tone: (["warm", "light", "deep", "classic"] as const)[index % 4], status: p.status, inventory: p.inventory, allow_backorder: p.allow_backorder ?? false, lead_time_days: p.lead_time_days ?? 0, images: p.images ?? [], image_url: p.image_url, allergens: p.allergens ?? [] }))); }).catch(() => undefined);
    apiFetch<Slot[]>("/api/time-slots").then((rows) => { if (rows.length) setSlots(rows); }).catch(() => undefined);
    apiFetch<{ date: string }[]>("/api/closed-days").then((rows) => setClosedDays(rows.map((d) => d.date))).catch(() => undefined);
    apiFetch<Zone[]>("/api/shipping-zones").then((rows) => { if (rows.length) setZones(rows); }).catch(() => undefined);
    apiFetch<{ bank_account_info: string | null }>("/api/settings").then((data) => { if (data.bank_account_info) setBankInfo(data.bank_account_info); }).catch(() => undefined);
    fetch("/api/auth/me").then((r) => r.json()).then((data) => {
      if (data?.user) {
        setUser(data.user);
        setCustomer((c) => ({ ...c, name: c.name || data.user.name || "", email: c.email || data.user.email || "", phone: c.phone || data.user.phone || "" }));
      }
    }).catch(() => undefined);
    return () => window.clearTimeout(timer);
  }, []);

  const lines = useMemo(() => Object.entries(cart).flatMap(([id, qty]) => { const p = catalog.find((c) => c.id === id); return p ? [{ product: p, qty }] : []; }), [cart, catalog]);
  const total = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0);
  const availableZones = zones.filter((z) => z.type === fulfillment);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; return { iso, day: d.getDate(), month: MONTHS[d.getMonth()], weekday: WEEKDAYS[d.getDay()], closed: d.getDay() === 0 || closedDays.includes(iso) }; }), [closedDays]);

  async function confirm() {
    setMessage("");
    if (!date || !slotId || !zoneId) { setMessage("Elige día, franja horaria y zona de entrega."); return; }
    if (!customer.name || !customer.phone) { setMessage("Completa tu nombre y teléfono."); return; }
    if (fulfillment === "domicilio" && !customer.address) { setMessage("Indica tu dirección para el despacho."); return; }
    const zone = zones.find((z) => z.id === zoneId)!;
    const slot = slots.find((s) => s.id === slotId)!;
    try {
      const order = await apiFetch<{ id: string }>("/api/orders", {
        method: "POST",
        body: {
          customer_name: customer.name, customer_phone: customer.phone, customer_email: customer.email || null,
          payment_method: payment === "transferencia" ? "Transferencia" : "Webpay",
          scheduled_date: date, time_slot_id: slotId, fulfillment, shipping_zone_id: zoneId,
          location: fulfillment === "domicilio" ? customer.address : zone.name, notes: customer.notes || null,
          items: lines.map(({ product, qty }) => ({ product_id: product.id, name: product.name, unit_price: product.price, quantity: qty })),
        },
      });
      setPlacedId(order.id.slice(0, 8).toUpperCase());
      setPlaced(true);
      localStorage.removeItem("store-cart");
      if (process.env.NEXT_PUBLIC_ORDER_WEBHOOK_URL) {
        fetch(process.env.NEXT_PUBLIC_ORDER_WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, customer: customer.name, total, date, slot: `${slot.start_time}–${slot.end_time}`, zone: zone.name, payment }) }).catch(() => undefined);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar el pedido. Intenta nuevamente.");
    }
  }

  if (placed) return (
    <main className="grid min-h-screen place-items-center bg-[#faf7f0] px-5 text-[#243128]">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#e2f0e2] text-2xl">✓</div>
        <h1 className="display text-3xl">¡Pedido recibido!</h1>
        <p className="mt-3 leading-7 text-[#526058]">Tu pedido{placedId ? ` #${placedId}` : ""} quedó agendado. Te contactaremos por WhatsApp para coordinar el pago y la entrega.</p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 border-b border-[#243128] pb-1 text-sm">Volver a la tienda <ArrowLeft size={15}/></Link>
      </div>
    </main>
  );

  const webpayEnabled = process.env.NEXT_PUBLIC_WEBPAY_ENABLED === "true";
  return (
    <main className="min-h-screen bg-[#faf7f0] text-[#243128]">
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#647167] hover:text-[#243128]"><ArrowLeft size={15}/>Volver a la tienda</Link>
        <h1 className="display mt-6 text-4xl md:text-5xl">Agenda tu pedido</h1>
        <p className="mt-3 text-[#526058]">Elige el día y rango horario en que necesitas tu pedido, y cómo lo retirarás.</p>
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-8">
            <section className="rounded-2xl bg-white p-5">
              <h2 className="display text-2xl">1 · Tus datos</h2>
              {user && <p className="mt-2 rounded-lg bg-[#edf0e8] px-3 py-2 text-xs text-[#526058]">Sesión iniciada{user.email ? ` como ${user.email}` : ""}. Tus datos se completaron automáticamente.</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="Nombre y apellido" className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
                <input required value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="Teléfono (WhatsApp)" className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
                <input value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="Correo (opcional)" className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128] sm:col-span-2"/>
                {fulfillment === "domicilio" && <input required value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="Dirección en San Javier" className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128] sm:col-span-2"/>}
                <input value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} placeholder="Notas del pedido (opcional)" className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128] sm:col-span-2"/>
              </div>
            </section>
            <section className="rounded-2xl bg-white p-5">
              <h2 className="display text-2xl">2 · Día y horario</h2>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">{days.map((d) => <button key={d.iso} onClick={() => setDate(d.iso)} disabled={d.closed} className={`shrink-0 rounded-xl border px-3 py-2 text-center transition ${date === d.iso ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"} ${d.closed ? "cursor-not-allowed opacity-35" : ""}`}><span className="block text-[10px] tracking-wider uppercase">{d.weekday}</span><span className="display block text-lg">{d.day}</span><span className="block text-[10px] text-[#748077]">{d.month}</span></button>)}</div>
              {date && days.find((d) => d.iso === date)?.closed && <p className="mt-2 text-sm text-[#8a4a44]">Ese día está cerrado. Elige otra fecha.</p>}
              <div className="mt-4 flex flex-wrap gap-2">{slots.map((slot) => <button key={slot.id} onClick={() => setSlotId(slot.id)} className={`rounded-full border px-4 py-2 text-sm transition ${slotId === slot.id ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"}`}>{slot.label} · {slot.start_time}–{slot.end_time}</button>)}</div>
            </section>
            <section className="rounded-2xl bg-white p-5">
              <h2 className="display text-2xl">3 · Entrega</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button onClick={() => { setFulfillment("retiro"); setZoneId(""); }} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${fulfillment === "retiro" ? "border-[#243128] bg-[#edf0e8]" : "border-[#d9ddd5] hover:border-[#243128]"}`}><Store size={18} className="mt-0.5 text-[#56745c]"/><span><span className="block text-sm font-medium">Retiro presencial</span><span className="mt-1 block text-xs text-[#647167]">San Javier o Talca</span></span></button>
                <button onClick={() => { setFulfillment("domicilio"); setZoneId(""); }} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${fulfillment === "domicilio" ? "border-[#243128] bg-[#edf0e8]" : "border-[#d9ddd5] hover:border-[#243128]"}`}><MapPin size={18} className="mt-0.5 text-[#56745c]"/><span><span className="block text-sm font-medium">A domicilio</span><span className="mt-1 block text-xs text-[#647167]">Solo San Javier</span></span></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">{availableZones.map((zone) => <button key={zone.id} onClick={() => setZoneId(zone.id)} className={`rounded-full border px-4 py-2 text-sm transition ${zoneId === zone.id ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"}`}>{zone.name}</button>)}</div>
              {fulfillment === "domicilio" && <p className="mt-3 text-xs text-[#748077]">El despacho a domicilio solo está disponible en San Javier y alrededores.</p>}
            </section>
            <section className="rounded-2xl bg-white p-5">
              <h2 className="display text-2xl">4 · Pago</h2>
              <div className="mt-4 space-y-2">
                <button onClick={() => setPayment("transferencia")} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition ${payment === "transferencia" ? "border-[#243128] bg-[#edf0e8]" : "border-[#d9ddd5] hover:border-[#243128]"}`}><Banknote size={18} className="text-[#56745c]"/><span><span className="block text-sm font-medium">Transferencia bancaria</span><span className="block text-xs text-[#647167]">Confirmamos manualmente tu pago</span></span></button>
                <button onClick={() => webpayEnabled && setPayment("webpay")} disabled={!webpayEnabled} className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${payment === "webpay" ? "border-[#243128] bg-[#edf0e8]" : "border-[#d9ddd5] hover:border-[#243128]"}`}><CreditCard size={18} className="text-[#56745c]"/><span><span className="block text-sm font-medium">Webpay Plus (débito/crédito)</span><span className="block text-xs text-[#647167]">{webpayEnabled ? "Pago en línea con tarjeta" : "Disponible próximamente"}</span></span></button>
              </div>
              {payment === "transferencia" && <div className="mt-4 rounded-xl bg-[#edf0e8] p-4"><p className="text-xs tracking-[.16em] text-[#56745c] uppercase">Datos para transferir</p><p className="mt-2 text-sm whitespace-pre-line text-[#526058]">{bankInfo || "Transferencia a confirmar — te enviaremos los datos por WhatsApp tras agendar."}</p></div>}
            </section>
          </div>
          <aside className="h-fit rounded-2xl bg-white p-5 lg:sticky lg:top-6">
            <h2 className="display text-2xl">Tu pedido</h2>
            <div className="mt-4 divide-y divide-[#edf0e8]">{lines.map(({ product, qty }) => <div key={product.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="min-w-0"><span className="block truncate font-medium">{product.name}</span><span className="text-xs text-[#748077]">{qty} × {formatPrice(product.price)}</span></span><span className="whitespace-nowrap">{formatPrice(product.price * qty)}</span></div>)}</div>
            {lines.length === 0 && <p className="py-3 text-sm text-[#647167]">Tu carrito está vacío. <Link href="/#coleccion" className="underline underline-offset-2">Ver productos</Link></p>}
            <div className="mt-4 flex items-center justify-between border-t border-[#243128] pt-4 text-sm"><span>Total</span><span className="display text-xl">{formatPrice(total)}</span></div>
            <button onClick={confirm} disabled={lines.length === 0} className="mt-5 w-full rounded-full bg-[#243128] py-3.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40">Confirmar pedido</button>
            {message && <p className="mt-3 rounded-lg bg-[#f3e2e0] p-3 text-sm text-[#8a4a44]">{message}</p>}
            <p className="mt-3 text-xs leading-5 text-[#748077]">Al confirmar, reservamos tu pedido para la fecha elegida. {storeConfig.name} confirmará el pago por WhatsApp.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}