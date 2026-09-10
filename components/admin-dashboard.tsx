"use client";

import { Slider } from "@base-ui/react/slider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Box, CalendarDays, Check, ChevronDown, ChevronRight, ChevronsUpDown, ChevronUp, CircleDollarSign, Eye, FileText, LayoutDashboard, MapPin, Menu, MessageSquare, Package, Pencil, Plus, RotateCcw, Search, Settings, Store, Trash2, Upload, Users, X } from "lucide-react";
import { apiFetch, clearAdminToken, clearSessionTokenCache, uploadImage } from "@/lib/api";
import { formatPrice, products as demoProducts, type Product, type ProductStatus } from "@/lib/products";
import { ALLERGENS } from "@/lib/allergens";
import { storeConfig } from "@/lib/store-config";

type Section = "inicio" | "productos" | "pedidos" | "agenda" | "clientes" | "comentarios" | "contenido" | "reportes" | "configuracion";
type OrderItem = { name: string; quantity: number; price: number };
type OrderStatus = "Pendiente" | "Pagado" | "Preparando" | "Enviado" | "Entregado" | "Cancelado";
type Order = { id: string; customer: string; total: number; status: OrderStatus; fulfillment: "retiro" | "domicilio"; location: string; items: OrderItem[]; scheduledDate?: string | null; timeSlot?: string | null; zone?: string | null; paymentMethod?: string | null; customerPhone?: string | null; notes?: string | null };
type AdminProduct = Product & { category_id: string | null };
type ApiProduct = { id: string; slug: string; name: string; price: number; description: string | null; status: ProductStatus; inventory: number; allow_backorder: boolean; lead_time_days: number; images: string[]; image_url: string | null; ingredients: string | null; artisan_seal: boolean; sustainable: boolean; allergens: string[]; category_id: string | null };
type ApiOrder = { id: string; customer_name: string | null; customer_phone: string | null; status: string; total: number; payment_method: string | null; scheduled_date: string | null; fulfillment: "retiro" | "domicilio" | null; location: string | null; notes: string | null; time_slot_label: string | null; shipping_zone_name: string | null; items: { name: string; unit_price: number; quantity: number }[] };
type SlotRow = { id: string; label: string; start_time: string; end_time: string; enabled: boolean };
type ClosedDayRow = { id: string; date: string; reason: string | null };
type ZoneRow = { id: string; name: string; type: "retiro" | "domicilio"; areas: string[]; active: boolean };

const fulfillmentMeta: Record<Order["fulfillment"], { label: string; icon: typeof Store; className: string }> = {
  domicilio: { label: "A domicilio", icon: MapPin, className: "bg-[#e2f0e2] text-[#3c6b3f]" },
  retiro: { label: "Retiro", icon: Store, className: "bg-[#e4e9f5] text-[#3d5384]" },
};
const statusDbToUi: Record<string, OrderStatus> = { pending: "Pendiente", paid: "Pagado", preparing: "Preparando", shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Cancelado" };
const statusUiToDb: Record<OrderStatus, string> = { Pendiente: "pending", Pagado: "paid", Preparando: "preparing", Enviado: "shipped", Entregado: "delivered", Cancelado: "cancelled" };
const displayOrderId = (id: string) => (id.startsWith("#") ? id : id.slice(0, 8).toUpperCase());
const menu: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard }, { id: "productos", label: "Productos", icon: Package }, { id: "pedidos", label: "Pedidos", icon: Box }, { id: "agenda", label: "Agenda", icon: CalendarDays }, { id: "clientes", label: "Clientes", icon: Users }, { id: "comentarios", label: "Comentarios", icon: MessageSquare }, { id: "contenido", label: "Contenido", icon: FileText }, { id: "reportes", label: "Reportes", icon: BarChart3 }, { id: "configuracion", label: "Configuración", icon: Settings },
];

const DEMO_ORDERS: Order[] = [
  { id: "#1004", customer: "Camila R.", total: 77980, status: "Preparando", fulfillment: "domicilio", location: "San Javier — Av. Providencia 1234", scheduledDate: "2026-09-10", timeSlot: "09:00 – 12:00", zone: "San Javier", paymentMethod: "Transferencia", items: [{ name: "Producto Dos", quantity: 1, price: 42990 }, { name: "Producto Uno", quantity: 1, price: 34990 }] },
  { id: "#1003", customer: "Lucas M.", total: 69980, status: "Pagado", fulfillment: "retiro", location: "Retiro en Talca — Plaza de Armas", scheduledDate: "2026-09-11", timeSlot: "12:00 – 15:00", zone: "Talca", paymentMethod: "Webpay", items: [{ name: "Producto Uno", quantity: 2, price: 34990 }] },
  { id: "#1002", customer: "Andrea G.", total: 86980, status: "Entregado", fulfillment: "domicilio", location: "San Javier — Los Alerces 455", scheduledDate: "2026-09-08", timeSlot: "15:00 – 18:00", zone: "San Javier", paymentMethod: "Transferencia", items: [{ name: "Producto Tres", quantity: 1, price: 48990 }, { name: "Producto Cuatro", quantity: 1, price: 37990 }] },
];

function productPayload(p: AdminProduct): Record<string, unknown> {
  return { category_id: p.category_id, name: p.name, slug: p.slug, description: p.description, price: p.price, image_url: p.image_url ?? null, images: p.images ?? [], ingredients: p.ingredients ?? null, artisan_seal: p.artisan_seal ?? false, sustainable: p.sustainable ?? false, allergens: p.allergens ?? [], status: p.status, inventory: p.inventory, allow_backorder: p.allow_backorder ?? false, lead_time_days: p.lead_time_days ?? 0, variants: [] };
}

export function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ name?: string | null; email?: string | null } | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [catalog, setCatalog] = useState<AdminProduct[]>(demoProducts.map((p) => ({ ...p, category_id: null })));
  const [orders, setOrders] = useState<Order[]>(DEMO_ORDERS);
  const [state, setState] = useState("Esperando datos de la API…");
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, products, ordersRows] = await Promise.all([
          apiFetch<{ id: string; name: string }[]>("/api/categories", { admin: true }),
          apiFetch<ApiProduct[]>("/api/products", { admin: true }),
          apiFetch<ApiOrder[]>("/api/orders", { admin: true }),
        ]);
        if (cancelled) return;
        const map = new Map(cats.map((c) => [c.id, c.name]));
        setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
        setCatalog(products.map((p, i) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, description: p.description ?? "", category: map.get(p.category_id ?? "") ?? "Sin categoría", category_id: p.category_id ?? null, status: p.status, inventory: p.inventory, allow_backorder: p.allow_backorder ?? false, lead_time_days: p.lead_time_days ?? 0, images: p.images ?? [], image_url: p.image_url, ingredients: p.ingredients ?? undefined, artisan_seal: p.artisan_seal ?? false, sustainable: p.sustainable ?? false, allergens: p.allergens ?? [], tone: (["warm", "light", "deep", "classic"] as const)[i % 4] })));
        setOrders(ordersRows.map((o) => ({ id: o.id, customer: o.customer_name ?? "Sin nombre", customerPhone: o.customer_phone, total: o.total, status: statusDbToUi[o.status] ?? "Pendiente", fulfillment: o.fulfillment ?? "retiro", location: o.location ?? "", notes: o.notes, scheduledDate: o.scheduled_date, timeSlot: o.time_slot_label, zone: o.shipping_zone_name, paymentMethod: o.payment_method, items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.unit_price })) })));
        setState("Conectado a la API.");
      } catch (e) {
        if (!cancelled) setState(e instanceof Error ? (e.message.includes("401") ? "Inicia sesión en /login para acceder al panel." : e.message) : "No se pudo conectar con la API.");
      }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => { if (data?.user) setUser(data.user); }).catch(() => undefined);
  }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSessionTokenCache();
    clearAdminToken();
    router.push("/");
  }
  const revenue = useMemo(() => orders.filter((order) => order.status !== "Cancelado").reduce((sum, order) => sum + order.total, 0), [orders]);
  function changeOrder(id: string, patch: Partial<Order>) {
    setOrders((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    if (patch.status) {
      apiFetch(`/api/orders/${id}/status`, { method: "PATCH", admin: true, body: { status: statusUiToDb[patch.status] } }).catch((e) => setState(e instanceof Error ? e.message : "No se pudo actualizar."));
    }
  }
  function addOrder() { setOrders((items) => [{ id: `#${1000 + items.length + 2}`, customer: "Cliente nuevo", total: 0, status: "Pendiente", fulfillment: "retiro", location: "Retiro en tienda", items: [] }, ...items]); }
  const selected = menu.find((item) => item.id === section)?.label;
  return <main className="min-h-screen bg-[#f5f6f2] text-[#243128]"><header className="flex h-16 items-center justify-between border-b border-[#d9ddd5] bg-white px-5 md:px-8"><div className="flex items-center gap-3"><button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={22}/></button><Link href="/" className="display text-2xl">{storeConfig.name}</Link></div><div className="flex items-center gap-4 text-sm"><span className="hidden max-w-[320px] truncate text-[#647167] sm:block">{state}</span>{user ? <><span className="hidden text-[#526058] sm:block">{user.email}</span><button onClick={logout} className="rounded-lg border border-[#d9ddd5] px-3 py-2 hover:border-[#243128]">Salir</button></> : <Link href="/login" className="rounded-lg border border-[#d9ddd5] px-3 py-2">Cuenta</Link>}</div></header>{mobileMenu && <div className="fixed inset-0 z-40 md:hidden"><button aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} className="absolute inset-0 bg-[#243128]/30"/><nav className="absolute top-4 right-4 left-4 rounded-2xl bg-white p-3 shadow-xl">{menu.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setMobileMenu(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${section === id ? "bg-[#243128] text-white" : "hover:bg-[#edf0e8]"}`}><Icon size={17}/>{label}</button>)}</nav></div>}<div className="mx-auto flex max-w-[1440px]"><aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-[#d9ddd5] bg-white p-4 md:block"><p className="px-3 pb-3 text-[11px] tracking-[.16em] text-[#7a867d] uppercase">Administración</p>{menu.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? "bg-[#243128] text-white" : "hover:bg-[#edf0e8]"}`}><Icon size={17}/>{label}</button>)}</aside><div className="min-w-0 flex-1 p-5 md:p-8"><div className="mb-7 flex items-center justify-between"><div><p className="text-sm text-[#748077]">Administración</p><h1 className="display text-4xl">{selected}</h1></div>{section === "pedidos" && <button onClick={addOrder} className="inline-flex items-center gap-2 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white"><Plus size={16}/>Nueva orden</button>}{section === "productos" && <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white"><Plus size={16}/>Nuevo producto</button>}</div><AdminContent section={section} catalog={catalog} orders={orders} revenue={revenue} onOrdersChange={setOrders} onOrderChange={changeOrder} categories={categories} onCatalogChange={setCatalog} setState={setState} creatingProduct={creating} onCreateProductChange={setCreating}/></div></div></main>;
}

function AdminContent(props: { section: Section; catalog: AdminProduct[]; orders: Order[]; revenue: number; onOrdersChange: React.Dispatch<React.SetStateAction<Order[]>>; onOrderChange: (id: string, patch: Partial<Order>) => void; categories: { id: string; name: string }[]; onCatalogChange: React.Dispatch<React.SetStateAction<AdminProduct[]>>; setState: (value: string) => void; creatingProduct: boolean; onCreateProductChange: React.Dispatch<React.SetStateAction<boolean>> }) {
  const { section, catalog, orders, revenue, categories, onCatalogChange, setState } = props;
  if (section === "inicio") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Ventas del período" value={formatPrice(revenue)} icon={CircleDollarSign}/><Metric label="Pedidos por gestionar" value={String(orders.filter((o) => !["Entregado", "Cancelado"].includes(o.status)).length)} icon={Box}/><Metric label="Productos activos" value={String(catalog.filter((p) => p.status === "active").length)} icon={Package}/><Metric label="Stock bajo" value={String(catalog.filter((p) => p.inventory > 0 && p.inventory <= 5).length)} icon={BarChart3}/></div><section className="mt-7 rounded-xl bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="display text-2xl">Pedidos recientes</h2><button onClick={() => props.onOrderChange(orders[0]?.id ?? "", { status: "Preparando" })} className="text-sm underline">Actualizar primero</button></div><OrderTable orders={orders} onOrderChange={props.onOrderChange}/></section></>;
  if (section === "productos") return <ProductSection catalog={catalog} categories={categories} onCatalogChange={onCatalogChange} setState={setState} creating={props.creatingProduct} onCreatingChange={props.onCreateProductChange} />;
  if (section === "pedidos") return <section className="rounded-xl bg-white p-5"><p className="mb-4 text-sm text-[#647167]">Los pedidos llegan desde el checkout de la tienda. Gestiona estados, entrega y pago.</p><OrdersSection orders={orders} onOrderChange={props.onOrderChange}/></section>;
  if (section === "agenda") return <AgendaSection setState={setState}/>;
  if (section === "clientes") return <DataCard title="Clientes" description="El historial de clientes se construirá a partir de las órdenes registradas." rows={[[orders.find((o) => o.customer !== "Sin nombre")?.customer ?? "Camila R.", "—", `${orders.length} pedidos`], ["Contacto WhatsApp", "Configúralo en Contenido", "Editar"]]}/>;
  if (section === "comentarios") return <ReviewsSection setState={setState}/>;
  if (section === "contenido") return <ContentEditor setState={setState}/>;
  if (section === "reportes") return <><div className="grid gap-4 sm:grid-cols-3"><Metric label="Ventas" value={formatPrice(revenue)} icon={CircleDollarSign}/><Metric label="Órdenes" value={String(orders.length)} icon={Box}/><Metric label="Ticket promedio" value={formatPrice(orders.length ? Math.round(revenue / orders.length) : 0)} icon={BarChart3}/></div><DataCard title="Productos más vendidos" description="Calculado a partir de las líneas de órdenes." rows={(() => { const counts = new Map<string, number>(); orders.flatMap((o) => o.items).forEach((i) => counts.set(i.name, (counts.get(i.name) ?? 0) + i.quantity)); return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => [name, `${qty} vendidos`, ""]); })()}/> </>;
  return <DataCard title="Configuración" description="Administra identidad de tienda, dominio, contactos, usuarios y permisos." rows={[["Datos de la tienda", storeConfig.name, "Editar"], ["Clave de administración", "Se define en API_ADMIN_TOKEN del backend", "Gestionar"], ["Métodos de pago", "Transferencia activa · Webpay pendiente de credenciales", "Próximamente"]]}/>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) { return <div className="rounded-xl bg-white p-5"><div className="flex items-center justify-between text-[#647167]"><span className="text-sm">{label}</span><Icon size={18}/></div><p className="display mt-3 text-3xl">{value}</p></div>; }
function OrderTable({ orders, onOrderChange }: { orders: Order[]; onOrderChange: (id: string, patch: Partial<Order>) => void }) { const [detail, setDetail] = useState<Order | null>(null); return <><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-y border-[#e2e5df] text-xs text-[#748077] uppercase"><tr><th className="py-3">Orden</th><th>Cliente</th><th>Entrega</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-b border-[#edf0e8]"><td className="py-4 font-medium"><span className="inline-flex items-center gap-2">{displayOrderId(order.id)}<button onClick={() => setDetail(order)} aria-label={`Ver productos de ${order.id}`} title="Ver productos" className="rounded-md border border-[#d9ddd5] p-1 transition hover:border-[#243128]"><Eye size={13}/></button></span></td><td>{order.customer}{order.customerPhone && <span className="block text-xs text-[#748077]">{order.customerPhone}</span>}</td><td><FulfillmentCell order={order}/></td><td className="whitespace-nowrap">{order.scheduledDate ? `${order.scheduledDate}${order.timeSlot ? ` · ${order.timeSlot}` : ""}` : "—"}</td><td>{formatPrice(order.total)}</td><td><select value={order.status} onChange={(e) => onOrderChange(order.id, { status: e.target.value as OrderStatus })} className="rounded-md border border-[#d9ddd5] bg-white px-2 py-1 text-xs"><option>Pendiente</option><option>Pagado</option><option>Preparando</option><option>Enviado</option><option>Entregado</option><option>Cancelado</option></select></td></tr>)}</tbody></table></div>{detail && <OrderItemsModal order={detail} onClose={() => setDetail(null)}/>}</>; }
function OrderItemsModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">Pedido {displayOrderId(order.id)}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <p className="text-sm text-[#647167]">Cliente: <strong className="text-[#243128]">{order.customer}</strong></p>
        {order.customerPhone && <p className="mt-1 text-sm text-[#647167]">Teléfono: <strong className="text-[#243128]">{order.customerPhone}</strong></p>}
        <div className="mt-2"><FulfillmentCell order={order}/></div>
        <p className="mt-3 text-sm text-[#647167]">{order.scheduledDate ? <>Agendado: <strong className="text-[#243128]">{order.scheduledDate}{order.timeSlot ? ` · ${order.timeSlot}` : ""}</strong></> : "Sin fecha agendada"}{order.paymentMethod ? <> · Pago: <strong className="text-[#243128]">{order.paymentMethod}</strong></> : null}</p>
        {order.notes && <p className="mt-2 rounded-lg bg-[#edf0e8] p-3 text-sm text-[#526058]">Nota: {order.notes}</p>}
        <h3 className="mt-5 mb-1 text-xs tracking-[.16em] text-[#748077] uppercase">Productos</h3>
        <div className="divide-y divide-[#edf0e8]">
          {order.items.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 py-3 text-sm"><div><p className="font-medium">{item.name}</p><p className="text-xs text-[#748077]">{item.quantity} × {formatPrice(item.price)}</p></div><span>{formatPrice(item.price * item.quantity)}</span></div>)}
          {order.items.length === 0 && <p className="py-3 text-sm text-[#647167]">Este pedido todavía no tiene productos registrados.</p>}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#e2e5df] pt-4 text-sm"><span className="text-[#647167]">Total</span><strong className="display text-lg">{formatPrice(order.total)}</strong></div>
      </div>
    </div>
  );
}
function FulfillmentCell({ order }: { order: Order }) { const meta = fulfillmentMeta[order.fulfillment]; const Icon = meta.icon; return <div className="flex items-center gap-2"><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs whitespace-nowrap ${meta.className}`}><Icon size={12}/>{meta.label}</span><span className="text-xs text-[#748077]">{order.fulfillment === "retiro" ? "Retira en: " : "Envío a: "}{order.location || order.zone || "—"}</span></div>; }
function OrdersSection({ orders, onOrderChange }: { orders: Order[]; onOrderChange: (id: string, patch: Partial<Order>) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"activos" | "all" | OrderStatus>("activos");
  const [fulfillment, setFulfillment] = useState<"all" | Order["fulfillment"]>("all");
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => orders.filter((order) => {
    if (status === "activos" && ["Entregado", "Cancelado"].includes(order.status)) return false;
    if (status !== "activos" && status !== "all" && order.status !== status) return false;
    if (fulfillment !== "all" && order.fulfillment !== fulfillment) return false;
    if (query && !(order.customer.toLowerCase().includes(query) || order.location.toLowerCase().includes(query) || order.id.toLowerCase().includes(query))) return false;
    return true;
  }), [orders, status, fulfillment, query]);
  return (
    <>
      <div className="mb-5 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#748077]"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o ubicación..." className="w-full rounded-lg border border-[#d9ddd5] bg-white py-2.5 pr-3 pl-9 text-sm outline-none focus:border-[#243128]"/>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm">
          <option value="activos">Pedidos activos</option>
          <option value="all">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Pagado">Pagado</option>
          <option value="Preparando">Preparando</option>
          <option value="Enviado">Enviado</option>
          <option value="Entregado">Entregado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select value={fulfillment} onChange={(e) => setFulfillment(e.target.value as typeof fulfillment)} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm">
          <option value="all">Todo tipo de entrega</option>
          <option value="domicilio">A domicilio</option>
          <option value="retiro">Retiro</option>
        </select>
        <p className="self-center text-sm whitespace-nowrap text-[#647167]">{filtered.length} de {orders.length} pedidos</p>
      </div>
      <OrderTable orders={filtered} onOrderChange={onOrderChange}/>
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-[#647167]">No hay pedidos que coincidan con los filtros. Usa «Todos los estados» para revisar pedidos entregados o cancelados.</p>}
    </>
  );
}
function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc" | undefined; onClick: () => void }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1 py-3 uppercase transition hover:text-[#243128] ${active ? "text-[#243128]" : ""}`} aria-label={`Ordenar por ${label}`}>{label}{active ? (dir === "asc" ? <ChevronUp size={13}/> : <ChevronDown size={13}/>) : <ChevronsUpDown size={13} className="opacity-40"/>}</button>;
}
function DataCard({ title, description, rows }: { title: string; description: string; rows: string[][] }) { return <section className="rounded-xl bg-white p-5"><h2 className="display text-2xl">{title}</h2><p className="mt-2 text-sm text-[#647167]">{description}</p><div className="mt-5 divide-y divide-[#edf0e8]">{rows.map((row) => <div key={row[0]} className="grid gap-2 py-4 text-sm md:grid-cols-3">{row.map((cell) => <span key={cell}>{cell}</span>)}<ChevronRight className="hidden md:block md:justify-self-end" size={16}/></div>)}</div></section>; }
function ProductSection({ catalog, categories, onCatalogChange, setState, creating, onCreatingChange }: { catalog: AdminProduct[]; categories: { id: string; name: string }[]; onCatalogChange: React.Dispatch<React.SetStateAction<AdminProduct[]>>; setState: (value: string) => void; creating: boolean; onCreatingChange: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [category, setCategory] = useState("Todas");
  const [price, setPrice] = useState<{ min: number; max: number } | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "low" | "out" | "preorder">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [stocking, setStocking] = useState<AdminProduct | null>(null);
  const [sort, setSort] = useState<{ key: "name" | "price" | "inventory"; dir: "asc" | "desc" } | null>(null);
  const blankProduct: AdminProduct = { id: "", slug: "", name: "", price: 0, category: "Sin categoría", description: "", ingredients: "", images: [], allergens: [], tone: "light", status: "draft", inventory: 0, allow_backorder: false, lead_time_days: 0, category_id: null };
  const options = [...new Set(catalog.map((p) => p.category).filter(Boolean))].sort();
  const bounds = useMemo(() => {
    const prices = catalog.map((p) => p.price);
    if (!prices.length) return { min: 0, max: 100000 };
    return { min: Math.floor(Math.min(...prices) / 100) * 100, max: Math.ceil(Math.max(...prices) / 100) * 100 };
  }, [catalog]);
  const priceActive = price !== null && (price.min > bounds.min || price.max < bounds.max);
  const query = search.trim().toLowerCase();
  const filtersActive = category !== "Todas" || priceActive || stockFilter !== "all" || sort !== null || query !== "";
  const filtered = useMemo(() => catalog.filter((p) => {
    if (query && !(p.name.toLowerCase().includes(query) || p.slug.toLowerCase().includes(query) || p.category.toLowerCase().includes(query))) return false;
    if (category !== "Todas" && p.category !== category) return false;
    if (price && (p.price < price.min || p.price > price.max)) return false;
    if (stockFilter === "available" && p.inventory <= 0) return false;
    if (stockFilter === "low" && !(p.inventory > 0 && p.inventory <= 5)) return false;
    if (stockFilter === "out" && p.inventory !== 0) return false;
    if (stockFilter === "preorder" && !(p.allow_backorder && p.inventory === 0)) return false;
    return true;
  }), [catalog, category, price, stockFilter, query]);
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aValue = sort.key === "name" ? a.name.toLowerCase() : sort.key === "price" ? a.price : a.inventory;
      const bValue = sort.key === "name" ? b.name.toLowerCase() : sort.key === "price" ? b.price : b.inventory;
      return aValue < bValue ? -factor : aValue > bValue ? factor : 0;
    });
  }, [filtered, sort]);
  function toggleSort(key: "name" | "price" | "inventory") {
    setSort((current) => (current?.key !== key ? { key, dir: "asc" } : { key, dir: current.dir === "asc" ? "desc" : "asc" }));
  }
  const statusMeta: Record<ProductStatus, { label: string; className: string }> = {
    draft: { label: "Borrador", className: "bg-[#edf0e8] text-[#647167]" },
    active: { label: "Activo", className: "bg-[#e2f0e2] text-[#3c6b3f]" },
    sold_out: { label: "Agotado", className: "bg-[#f3e2e0] text-[#8a4a44]" },
    preorder: { label: "Bajo pedido", className: "bg-[#fff0d8] text-[#8a6420]" },
  };
  async function saveProduct(data: AdminProductData) {
    if (!editing) return;
    try {
      await apiFetch(`/api/products/${editing.id}`, { method: "PUT", admin: true, body: { ...productPayload({ ...editing, ...data }), slug: editing.slug } });
      onCatalogChange((items) => items.map((p) => p.id === editing.id ? { ...p, ...data, category: categories.find((c) => c.id === data.category_id)?.name ?? "Sin categoría" } : p));
      setState("Producto actualizado.");
      setEditing(null);
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo actualizar."); }
  }
  async function createProduct(data: AdminProductData) {
    const slug = data.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "producto";
    try {
      const row = await apiFetch<ApiProduct>("/api/products", { method: "POST", admin: true, body: { ...data, slug, image_url: data.image_url ?? null, variants: [] } });
      onCatalogChange((items) => [{ id: row.id, slug: row.slug, name: row.name, price: row.price, description: row.description ?? "", ingredients: row.ingredients ?? undefined, images: row.images ?? [], image_url: row.image_url, artisan_seal: row.artisan_seal, sustainable: row.sustainable, allergens: row.allergens ?? [], category: categories.find((c) => c.id === row.category_id)?.name ?? "Sin categoría", category_id: row.category_id ?? null, inventory: row.inventory, status: row.status, allow_backorder: row.allow_backorder, lead_time_days: row.lead_time_days, tone: "light" as const }, ...items]);
      setState("Producto creado.");
      onCreatingChange(false);
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo crear."); }
  }
  async function addStock(product: AdminProduct, amount: number) {
    const updated: AdminProduct = { ...product, inventory: product.inventory + amount, status: product.inventory + amount > 0 && product.status === "sold_out" ? "active" : product.status };
    try {
      await apiFetch(`/api/products/${product.id}`, { method: "PUT", admin: true, body: productPayload(updated) });
      onCatalogChange((items) => items.map((p) => p.id === product.id ? updated : p));
      setState("Stock actualizado.");
      setStocking(null);
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo actualizar."); }
  }
  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-2xl">Inventario y catálogo</h2>
          <p className="text-sm text-[#647167]">{filtered.length} de {catalog.length} productos</p>
        </div>
        <div className="mb-5 grid gap-3 md:grid-cols-[40%_1fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#748077]"/>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full rounded-lg border border-[#d9ddd5] bg-white py-2.5 pr-3 pl-9 text-sm outline-none focus:border-[#243128]"/>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm">
            <option>Todas</option>
            {options.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="relative">
            <button onClick={() => setPriceOpen((open) => !open)} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${priceActive ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] bg-white hover:border-[#243128]"}`}>
              <span className="truncate">{priceActive ? `Precio: ${formatPrice(price!.min)} – ${formatPrice(price!.max)}` : "Precio"}</span>
              <ChevronDown size={15} className={`shrink-0 transition ${priceOpen ? "rotate-180" : ""}`}/>
            </button>
            {priceOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPriceOpen(false)}/>
                <div className="absolute left-0 top-full z-20 mt-2 w-72 rounded-xl border border-[#e2e5df] bg-white p-4 shadow-lg">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{formatPrice(price?.min ?? bounds.min)}</span>
                    <span className="font-medium">{formatPrice(price?.max ?? bounds.max)}</span>
                  </div>
                  <Slider.Root value={price ? [price.min, price.max] : [bounds.min, bounds.max]} onValueChange={(value) => setPrice({ min: value[0], max: value[1] })} min={bounds.min} max={bounds.max} step={100} thumbCollisionBehavior="swap">
                    <Slider.Control className="flex w-full touch-none items-center py-3 select-none">
                      <Slider.Track className="h-1.5 w-full rounded-full bg-[#e2e5df] select-none">
                        <Slider.Indicator className="rounded-full bg-[#243128] select-none"/>
                        <Slider.Thumb index={0} aria-label="Precio mínimo" className="size-4 rounded-full border-2 border-white bg-[#243128] shadow outline-none ring-1 ring-[#243128] select-none has-[:focus-visible]:ring-2"/>
                        <Slider.Thumb index={1} aria-label="Precio máximo" className="size-4 rounded-full border-2 border-white bg-[#243128] shadow outline-none ring-1 ring-[#243128] select-none has-[:focus-visible]:ring-2"/>
                      </Slider.Track>
                    </Slider.Control>
                  </Slider.Root>
                  <div className="flex justify-end">
                    <button onClick={() => { setPrice(null); setPriceOpen(false); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#647167] transition hover:bg-[#edf0e8] hover:text-[#243128]">
                      <RotateCcw size={13}/>Restablecer
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm">
            <option value="all">Todo el stock</option>
            <option value="available">Disponible</option>
            <option value="low">Stock bajo (≤ 5)</option>
            <option value="out">Agotado</option>
            <option value="preorder">Bajo pedido</option>
          </select>
          <button onClick={() => { setCategory("Todas"); setPrice(null); setPriceOpen(false); setStockFilter("all"); setSearch(""); setSort(null); }} disabled={!filtersActive} aria-label="Quitar todos los filtros" title="Quitar todos los filtros" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm transition hover:border-[#243128] disabled:cursor-not-allowed disabled:opacity-40">
            <RotateCcw size={14}/>Limpiar filtros
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-y border-[#e2e5df] text-xs text-[#748077] uppercase">
              <tr><th className="py-3"><SortableHeader label="Producto" active={sort?.key === "name"} dir={sort?.dir} onClick={() => toggleSort("name")}/></th><th>Categoría</th><th><SortableHeader label="Precio" active={sort?.key === "price"} dir={sort?.dir} onClick={() => toggleSort("price")}/></th><th><SortableHeader label="Stock" active={sort?.key === "inventory"} dir={sort?.dir} onClick={() => toggleSort("inventory")}/></th><th>Estado</th><th className="text-right">Acciones</th></tr>
            </thead>
            <tbody>
              {sorted.map((product) => { const meta = statusMeta[product.status]; const photo = product.images?.[0] ?? product.image_url; return (
                <tr key={product.id} className="border-b border-[#edf0e8]">
                  <td className="py-4"><div className="flex items-center gap-3">{photo ? <img src={photo} alt="" className="h-10 w-8 rounded object-cover"/> : <div data-tone={product.tone} className="product-visual h-10 w-8 rounded"/>}<div><strong>{product.name}</strong><span className="block text-xs text-[#748077]">/{product.slug}{product.allow_backorder && product.inventory === 0 ? ` · anticipación ${product.lead_time_days} día(s)` : ""}</span></div></div></td>
                  <td>{product.category}</td>
                  <td>{formatPrice(product.price)}</td>
                  <td>{product.inventory}</td>
                  <td><span className={`rounded-full px-2 py-1 text-xs ${meta.className}`}>{meta.label}</span></td>
                  <td className="text-right"><div className="inline-flex items-center gap-2"><button onClick={() => setEditing(product)} aria-label={`Editar ${product.name}`} title="Editar" className="rounded-md border border-[#d9ddd5] p-1.5 transition hover:border-[#243128]"><Pencil size={14}/></button><button onClick={() => setStocking(product)} aria-label={`Agregar stock a ${product.name}`} title="Agregar stock" className="rounded-md border border-[#d9ddd5] p-1.5 transition hover:border-[#243128]"><Plus size={14}/></button></div></td>
                </tr>
              ); })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-[#647167]">No hay productos que coincidan con los filtros.</p>}
        </div>
      </section>
      {editing && <ProductEditor product={editing} categories={categories} onCancel={() => setEditing(null)} onSave={saveProduct} setState={setState}/>}
      {creating && <ProductEditor product={blankProduct} categories={categories} mode="create" onCancel={() => onCreatingChange(false)} onSave={createProduct} setState={setState}/>}
      {stocking && <StockModal product={stocking} onCancel={() => setStocking(null)} onAdd={(amount) => addStock(stocking, amount)}/>}
    </div>
  );
}
type AdminProductData = { name: string; price: number; inventory: number; status: ProductStatus; category_id: string | null; description: string; ingredients: string; images: string[]; image_url: string | null; artisan_seal: boolean; sustainable: boolean; allergens: string[]; allow_backorder: boolean; lead_time_days: number };
function ProductEditor({ product, categories, onCancel, onSave, setState, mode = "edit" }: { product: AdminProduct; categories: { id: string; name: string }[]; onCancel: () => void; onSave: (data: AdminProductData) => void; setState: (value: string) => void; mode?: "edit" | "create" }) {
  const isCreate = mode === "create";
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [description, setDescription] = useState(product.description);
  const [ingredients, setIngredients] = useState(product.ingredients ?? "");
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [imageUrl] = useState(product.image_url ?? "");
  const [urlInput, setUrlInput] = useState("");
  const [artisanSeal, setArtisanSeal] = useState(product.artisan_seal ?? false);
  const [sustainable, setSustainable] = useState(product.sustainable ?? false);
  const [allergens, setAllergens] = useState<string[]>(product.allergens ?? []);
  const [inventory, setInventory] = useState(String(product.inventory));
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [allowBackorder, setAllowBackorder] = useState(product.allow_backorder ?? false);
  const [leadTimeDays, setLeadTimeDays] = useState(String(product.lead_time_days ?? 0));
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  function toggleAllergen(code: string) { setAllergens((current) => current.includes(code) ? current.filter((a) => a !== code) : [...current, code]); }
  async function upload(file: File) {
    try {
      const url = await uploadImage(file);
      setImages((imgs) => [...imgs, url]);
      setState("Imagen subida.");
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo subir la imagen."); }
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    const finalImages = [...images, ...(urlInput.trim() ? [urlInput.trim()] : [])];
    onSave({ name, price: Number(price), inventory: Number(inventory), status, category_id: categoryId || null, description, ingredients, images: finalImages, image_url: imageUrl || (finalImages[0] ?? null), artisan_seal: artisanSeal, sustainable, allergens, allow_backorder: allowBackorder, lead_time_days: Number(leadTimeDays) || 0 });
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">{isCreate ? "Nuevo producto" : "Editar producto"}</h2>
          <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Nombre</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Precio (CLP)</span>
              <input required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Stock</span>
              <input required type="number" min="0" value={inventory} onChange={(e) => setInventory(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Descripción</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Ingredientes principales</span>
            <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={2} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
          </label>
          <div className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Fotos</span>
            <div className="mb-2 flex flex-wrap gap-2">{images.map((src) => <span key={src} className="relative"><img src={src} alt="" className="h-16 w-14 rounded-lg object-cover"/><button type="button" onClick={() => setImages((imgs) => imgs.filter((i) => i !== src))} aria-label="Quitar imagen" className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#243128] text-white"><X size={11}/></button></span>)}</div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#d9ddd5] px-3 py-2 text-xs hover:border-[#243128]"><Upload size={13}/>Subir foto<input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); }}/></label>
              <input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="…o pega una URL de imagen" className="min-w-0 flex-1 rounded-lg border border-[#d9ddd5] px-3 py-2 text-xs outline-none focus:border-[#243128]"/>
              <button type="button" onClick={() => { if (urlInput.trim()) { setImages((imgs) => [...imgs, urlInput.trim()]); setUrlInput(""); } }} className="rounded-lg bg-[#243128] px-3 py-2 text-xs text-white">Agregar</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Estado</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className="w-full rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#243128]">
                <option value="draft">Borrador</option>
                <option value="active">Activo</option>
                <option value="sold_out">Agotado</option>
                <option value="preorder">Bajo pedido</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Categoría</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#243128]">
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm"><input type="checkbox" checked={artisanSeal} onChange={(e) => setArtisanSeal(e.target.checked)}/>Sello artesanal</label>
            <label className="flex items-center gap-2 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm"><input type="checkbox" checked={sustainable} onChange={(e) => setSustainable(e.target.checked)}/>Sello sustentable</label>
          </div>
          <div className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Alérgenos</span>
            <div className="flex flex-wrap gap-2">{Object.entries(ALLERGENS).map(([code, info]) => <button key={code} type="button" onClick={() => toggleAllergen(code)} className={`rounded-full border px-3 py-1.5 text-xs transition ${allergens.includes(code) ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"}`}>{info.icon} {info.label}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm"><input type="checkbox" checked={allowBackorder} onChange={(e) => setAllowBackorder(e.target.checked)}/>Acepta bajo pedido</label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Días de anticipación</span>
              <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-[#d9ddd5] px-4 py-2.5 text-sm hover:border-[#243128]">Cancelar</button>
          <button className="rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white">{isCreate ? "Crear producto" : "Guardar cambios"}</button>
        </div>
      </form>
    </div>
  );
}
function StockModal({ product, onCancel, onAdd }: { product: AdminProduct; onCancel: () => void; onAdd: (amount: number) => void }) {
  const [amount, setAmount] = useState("1");
  function submit(event: React.FormEvent) { event.preventDefault(); const value = Number(amount); if (value > 0) onAdd(value); }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">Agregar stock</h2>
          <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <p className="text-sm text-[#647167]">Suma unidades al stock de <strong>{product.name}</strong>. Stock actual: {product.inventory}.</p>
        <label className="mt-4 block text-sm">
          <span className="mb-1.5 block text-[#647167]">Cantidad a agregar</span>
          <input required type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
        </label>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-[#d9ddd5] px-4 py-2.5 text-sm hover:border-[#243128]">Cancelar</button>
          <button className="rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white">Agregar stock</button>
        </div>
      </form>
    </div>
  );
}

function AgendaSection({ setState }: { setState: (value: string) => void }) {
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [closed, setClosed] = useState<ClosedDayRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [slotForm, setSlotForm] = useState({ label: "", start_time: "09:00", end_time: "12:00" });
  const [closedForm, setClosedForm] = useState({ date: "", reason: "" });
  const [zoneForm, setZoneForm] = useState({ name: "", type: "retiro" as "retiro" | "domicilio", areas: "" });
  useEffect(() => {
    apiFetch<SlotRow[]>("/api/time-slots").then(setSlots).catch(() => undefined);
    apiFetch<ClosedDayRow[]>("/api/closed-days").then(setClosed).catch(() => undefined);
    apiFetch<ZoneRow[]>("/api/shipping-zones?include_inactive=true", { admin: true }).then(setZones).catch(() => undefined);
  }, []);
  async function addSlot(event: React.FormEvent) { event.preventDefault(); if (!slotForm.label.trim()) return; try { const row = await apiFetch<SlotRow>("/api/time-slots", { method: "POST", admin: true, body: slotForm }); setSlots((items) => [...items, row]); setState("Franja agregada."); setSlotForm({ label: "", start_time: "09:00", end_time: "12:00" }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo agregar."); } }
  async function toggleSlot(id: string, enabled: boolean) { setSlots((items) => items.map((s) => s.id === id ? { ...s, enabled } : s)); try { await apiFetch(`/api/time-slots/${id}`, { method: "PATCH", admin: true, body: { enabled } }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo actualizar."); } }
  async function deleteSlot(id: string) { setSlots((items) => items.filter((s) => s.id !== id)); try { await apiFetch(`/api/time-slots/${id}`, { method: "DELETE", admin: true }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo eliminar."); } }
  async function addClosed(event: React.FormEvent) { event.preventDefault(); if (!closedForm.date) return; try { const row = await apiFetch<ClosedDayRow>("/api/closed-days", { method: "POST", admin: true, body: closedForm }); setClosed((items) => [...items, row]); setState("Día cerrado guardado."); setClosedForm({ date: "", reason: "" }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo guardar."); } }
  async function deleteClosed(id: string) { setClosed((items) => items.filter((c) => c.id !== id)); try { await apiFetch(`/api/closed-days/${id}`, { method: "DELETE", admin: true }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo eliminar."); } }
  async function addZone(event: React.FormEvent) { event.preventDefault(); if (!zoneForm.name.trim()) return; const areas = zoneForm.areas.split(",").map((a) => a.trim()).filter(Boolean); try { const row = await apiFetch<ZoneRow>("/api/shipping-zones", { method: "POST", admin: true, body: { ...zoneForm, areas } }); setZones((items) => [...items, row]); setState("Zona agregada."); setZoneForm({ name: "", type: "retiro", areas: "" }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo agregar."); } }
  async function toggleZone(id: string, active: boolean) { setZones((items) => items.map((z) => z.id === id ? { ...z, active } : z)); try { await apiFetch(`/api/shipping-zones/${id}`, { method: "PATCH", admin: true, body: { active } }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo actualizar."); } }
  async function deleteZone(id: string) { setZones((items) => items.filter((z) => z.id !== id)); try { await apiFetch(`/api/shipping-zones/${id}`, { method: "DELETE", admin: true }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo eliminar."); } }
  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-5">
        <h2 className="display text-2xl">Franjas horarias</h2>
        <p className="mt-2 text-sm text-[#647167]">Los clientes eligen día y franja al agendar su pedido.</p>
        <form onSubmit={addSlot} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
          <input required value={slotForm.label} onChange={(e) => setSlotForm({ ...slotForm, label: e.target.value })} placeholder="Ej. Mañana" className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <input required type="time" value={slotForm.start_time} onChange={(e) => setSlotForm({ ...slotForm, start_time: e.target.value })} className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <input required type="time" value={slotForm.end_time} onChange={(e) => setSlotForm({ ...slotForm, end_time: e.target.value })} className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <button className="rounded-lg bg-[#243128] px-4 py-2 text-sm text-white">Agregar</button>
        </form>
        <div className="mt-4 divide-y divide-[#edf0e8]">{slots.length === 0 ? <p className="py-3 text-sm text-[#647167]">Sin franjas configuradas. Agrégalas desde aquí o en el panel Agenda del admin.</p> : slots.map((slot) => <div key={slot.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{slot.label}</span><span className="text-[#647167]">{slot.start_time} – {slot.end_time}</span><span className="flex items-center gap-3"><button onClick={() => toggleSlot(slot.id, !slot.enabled)} className={`rounded-full px-3 py-1 text-xs ${slot.enabled ? "bg-[#e2f0e2] text-[#3c6b3f]" : "bg-[#edf0e8] text-[#647167]"}`}>{slot.enabled ? "Habilitada" : "Deshabilitada"}</button><button onClick={() => deleteSlot(slot.id)} aria-label="Eliminar franja" className="text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button></span></div>)}</div>
      </section>
      <section className="rounded-xl bg-white p-5">
        <h2 className="display text-2xl">Días cerrados</h2>
        <p className="mt-2 text-sm text-[#647167]">Cierra fines de semana, feriados o días de producción intensa.</p>
        <form onSubmit={addClosed} className="mt-4 grid gap-2 md:grid-cols-[auto_1fr_auto]">
          <input required type="date" value={closedForm.date} onChange={(e) => setClosedForm({ ...closedForm, date: e.target.value })} className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <input value={closedForm.reason} onChange={(e) => setClosedForm({ ...closedForm, reason: e.target.value })} placeholder="Motivo (opcional)" className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <button className="rounded-lg bg-[#243128] px-4 py-2 text-sm text-white">Cerrar día</button>
        </form>
        <div className="mt-4 divide-y divide-[#edf0e8]">{closed.length === 0 ? <p className="py-3 text-sm text-[#647167]">No hay días cerrados.</p> : closed.map((day) => <div key={day.id} className="flex items-center justify-between py-3 text-sm"><span className="font-medium">{day.date}</span><span className="text-[#647167]">{day.reason ?? ""}</span><button onClick={() => deleteClosed(day.id)} aria-label="Quitar día cerrado" className="text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button></div>)}</div>
      </section>
      <section className="rounded-xl bg-white p-5">
        <h2 className="display text-2xl">Zonas de entrega</h2>
        <p className="mt-2 text-sm text-[#647167]">Domicilio solo en San Javier; retiro presencial en San Javier y Talca.</p>
        <form onSubmit={addZone} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
          <input required value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} placeholder="Ej. San Javier" className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <select value={zoneForm.type} onChange={(e) => setZoneForm({ ...zoneForm, type: e.target.value as "retiro" | "domicilio" })} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2 text-sm outline-none focus:border-[#243128]"><option value="retiro">Retiro presencial</option><option value="domicilio">A domicilio</option></select>
          <input value={zoneForm.areas} onChange={(e) => setZoneForm({ ...zoneForm, areas: e.target.value })} placeholder="Áreas (separadas por coma)" className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]"/>
          <button className="rounded-lg bg-[#243128] px-4 py-2 text-sm text-white">Agregar</button>
        </form>
        <div className="mt-4 divide-y divide-[#edf0e8]">{zones.length === 0 ? <p className="py-3 text-sm text-[#647167]">Sin zonas configuradas.</p> : zones.map((zone) => <div key={zone.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-medium">{zone.name}</span><span className={`rounded-full px-3 py-1 text-xs ${zone.type === "domicilio" ? "bg-[#e2f0e2] text-[#3c6b3f]" : "bg-[#e4e9f5] text-[#3d5384]"}`}>{zone.type === "domicilio" ? "A domicilio" : "Retiro presencial"}</span><span className="text-xs text-[#748077]">{zone.areas.join(", ")}</span><span className="flex items-center gap-3"><button onClick={() => toggleZone(zone.id, !zone.active)} className={`rounded-full px-3 py-1 text-xs ${zone.active ? "bg-[#e2f0e2] text-[#3c6b3f]" : "bg-[#edf0e8] text-[#647167]"}`}>{zone.active ? "Activa" : "Inactiva"}</button><button onClick={() => deleteZone(zone.id)} aria-label="Eliminar zona" className="text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button></span></div>)}</div>
      </section>
    </div>
  );
}

function ContentEditor({ setState }: { setState: (value: string) => void }) {
  const [settings, setSettings] = useState({
    name: storeConfig.name, announcement: storeConfig.announcement, hero_title: storeConfig.headline, hero_description: storeConfig.description,
    story_headline: storeConfig.storyHeadline, story_description: storeConfig.storyDescription, contact_email: "", contact_phone: "",
    whatsapp_phone: "", instagram_url: "", bank_account_info: "",
  });
  useEffect(() => {
    apiFetch<typeof settings>("/api/settings").then((data) => setSettings((current) => ({ ...current, name: data.name ?? current.name, announcement: data.announcement ?? current.announcement, hero_title: data.hero_title ?? current.hero_title, hero_description: data.hero_description ?? current.hero_description, story_headline: data.story_headline ?? current.story_headline, story_description: data.story_description ?? current.story_description, contact_email: data.contact_email ?? "", contact_phone: data.contact_phone ?? "", whatsapp_phone: data.whatsapp_phone ?? "", instagram_url: data.instagram_url ?? "", bank_account_info: data.bank_account_info ?? "" }))).catch(() => undefined);
  }, []);
  function set<K extends keyof typeof settings>(key: K, value: string) { setSettings((current) => ({ ...current, [key]: value })); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/api/settings", { method: "PUT", admin: true, body: settings });
      setState("Contenido guardado. Refresca la tienda para ver los cambios.");
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo guardar."); }
  }
  const field = (key: keyof typeof settings, label: string, placeholder = "") => <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">{label}</span><input value={settings[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/></label>;
  return (
    <form onSubmit={save} className="max-w-2xl space-y-4 rounded-xl bg-white p-5">
      <div><h2 className="display text-2xl">Contenido de la tienda</h2><p className="mt-2 text-sm text-[#647167]">Estos textos y datos se muestran en la tienda pública. Se guardan en la API (tabla store_settings).</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", "Nombre de la tienda", "BOSQUE")}
        {field("announcement", "Anuncio superior", "Pedidos con 1 día de anticipación")}
        {field("hero_title", "Título principal", "Pan artesanal de San Javier")}
        {field("hero_description", "Descripción principal")}
        {field("story_headline", "Título de Nuestra Historia")}
        {field("story_description", "Historia (texto largo)")}
        {field("contact_email", "Correo de contacto")}
        {field("contact_phone", "Teléfono de contacto")}
        {field("whatsapp_phone", "WhatsApp (formato +569…)")}
        {field("instagram_url", "Instagram (URL completa)")}
      </div>
      <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Datos de transferencia bancaria</span><textarea value={settings.bank_account_info} onChange={(e) => set("bank_account_info", e.target.value)} rows={3} placeholder={"Banco, titular, RUT y número de cuenta"} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/></label>
      <button className="rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white">Guardar contenido</button>
    </form>
  );
}

function ReviewsSection({ setState }: { setState: (value: string) => void }) {
  const [reviews, setReviews] = useState<{ id: string; author: string; rating: number; comment: string; status: string; product: string | null }[]>([]);
  useEffect(() => {
    apiFetch<{ id: string; author: string; rating: number; comment: string; status: string; product_name: string | null }[]>("/api/reviews/admin", { admin: true })
      .then((rows) => setReviews(rows.map((r) => ({ id: r.id, author: r.author, rating: r.rating, comment: r.comment, status: r.status, product: r.product_name ?? null }))))
      .catch(() => undefined);
  }, []);
  async function setStatus(id: string, status: string) { setReviews((items) => items.map((r) => r.id === id ? { ...r, status } : r)); try { await apiFetch(`/api/reviews/${id}/status`, { method: "PATCH", admin: true, body: { status } }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo actualizar."); } }
  async function remove(id: string) { setReviews((items) => items.filter((r) => r.id !== id)); try { await apiFetch(`/api/reviews/${id}`, { method: "DELETE", admin: true }); } catch (e) { setState(e instanceof Error ? e.message : "No se pudo eliminar."); } }
  const pending = reviews.filter((r) => r.status === "pending");
  return (
    <section className="rounded-xl bg-white p-5">
      <h2 className="display text-2xl">Comentarios de clientes</h2>
      <p className="mt-2 text-sm text-[#647167]">Los comentarios nuevos quedan pendientes hasta que los apruebes para publicarlos en la ficha del producto.</p>
      {pending.length > 0 && <div className="mt-5 mb-6 rounded-lg bg-[#fff8e8] p-4"><p className="text-xs tracking-[.16em] text-[#8a6420] uppercase">Por aprobar ({pending.length})</p><div className="mt-3 space-y-3">{pending.map((review) => <ReviewRow key={review.id} review={review} onStatus={(s) => setStatus(review.id, s)} onRemove={() => remove(review.id)}/>)}</div></div>}
      <div className="mt-4 divide-y divide-[#edf0e8]">{reviews.filter((r) => r.status !== "pending").length === 0 ? <p className="py-3 text-sm text-[#647167]">No hay comentarios revisados todavía.</p> : reviews.filter((r) => r.status !== "pending").map((review) => <ReviewRow key={review.id} review={review} onStatus={(s) => setStatus(review.id, s)} onRemove={() => remove(review.id)}/>)}</div>
    </section>
  );
}
function ReviewRow({ review, onStatus, onRemove }: { review: { id: string; author: string; rating: number; comment: string; status: string; product: string | null }; onStatus: (status: string) => void; onRemove: () => void }) {
  return <div className="rounded-xl border border-[#e2e5df] p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{review.author} · {review.product ?? "Producto"}</span><span className="text-[#c9962e]">{"★".repeat(review.rating)}</span></div><p className="mt-2 text-sm leading-6 text-[#526058]">{review.comment}</p><div className="mt-3 flex items-center gap-2">{review.status !== "approved" && <button onClick={() => onStatus("approved")} className="inline-flex items-center gap-1.5 rounded-lg bg-[#243128] px-3 py-1.5 text-xs text-white"><Check size={13}/>Aprobar</button>}{review.status !== "rejected" && <button onClick={() => onStatus("rejected")} className="rounded-lg border border-[#d9ddd5] px-3 py-1.5 text-xs hover:border-[#243128]">Rechazar</button>}<button onClick={onRemove} aria-label="Eliminar comentario" className="ml-auto text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button></div></div>;
}