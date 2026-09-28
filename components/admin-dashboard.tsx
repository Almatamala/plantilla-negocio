"use client";

import { Slider } from "@base-ui/react/slider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AtSign, BarChart3, Box, CalendarDays, Check, ChevronDown, ChevronsUpDown, ChevronUp, CircleDollarSign, FileText, LayoutDashboard, Mail, Menu, MessageCircle, MessageSquare, Package, Pencil, Phone, Plus, RotateCcw, Search, Store, Tags, Trash2, Upload, X } from "lucide-react";
import { apiFetch, endSession, uploadImage } from "@/lib/api";
import { useSession } from "@/lib/account";
import { formatPrice, type ApiProduct, type ProductStatus } from "@/lib/products";
import { ALLERGENS } from "@/lib/allergens";
import { storeConfig } from "@/lib/store-config";
import { defaultThemeColors, isHexColor, normalizeThemeColors, themeColorFields, type ThemeColorKey, type ThemeColors } from "@/lib/theme";
import { categoryNames, mapAdminProducts, type AdminProduct } from "@/lib/catalog";
import { ORDER_STATUS_DB, ORDER_STATUS_LABEL, displayOrderId, type OrderStatus } from "@/lib/orders";
import { AgendaSection, type SlotRow, type ZoneRow } from "@/components/admin-agenda";
import { Metric } from "@/components/admin-metric";
import { ReportsSection } from "@/components/admin-reports";
import { formatSlot, weekdayFromIso } from "@/lib/schedule";

type Section = "inicio" | "productos" | "pedidos" | "agenda" | "comentarios" | "contenido" | "reportes";
type OrderItem = { name: string; quantity: number; price: number; productId?: string | null };
// Estados unificados (D37): un pedido en preparación ya está pagado, así que «Pagado» y «Preparando»
// se unificaron en «Pendiente» y solo se ofrecen Pendiente / Enviado / Entregado / Cancelado.
type Order = { id: string; customer: string; total: number; status: OrderStatus; location: string; items: OrderItem[]; scheduledDate?: string | null; timeSlot?: string | null; timeSlotId?: string | null; zone?: string | null; shippingZoneId?: string | null; paymentMethod?: string | null; customerPhone?: string | null; customerEmail?: string | null; createdAt?: string | null };
type CategoryRow = { id: string; name: string; slug: string };
type ApiOrder = { id: string; customer_name: string | null; customer_phone: string | null; customer_email: string | null; status: string; total: number; payment_method: string | null; scheduled_date: string | null; time_slot_id: string | null; shipping_zone_id: string | null; location: string | null; time_slot_label: string | null; shipping_zone_name: string | null; created_at: string; items: { product_id: string | null; name: string; unit_price: number; quantity: number }[] };


/**
 * Campos de selección del panel.
 *
 * `select-field` (app/globals.css) oculta la flecha nativa: Chrome la resalta en azul al pasar el
 * mouse y ese brillo se sale de las esquinas redondeadas. En su lugar hay una flecha propia y el
 * estado se marca en el borde, igual que el botón del filtro de precio (hover) y el foco.
 */
const SELECT_FIELD_INLINE = "select-field rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm outline-none transition hover:border-[#243128] focus:border-[#243128]";
const SELECT_FIELD = `${SELECT_FIELD_INLINE} w-full`;
const SELECT_FIELD_SM = "select-field rounded-md border border-[#d9ddd5] bg-white px-2 py-1 text-xs outline-none transition hover:border-[#243128] focus:border-[#243128]";
const menu: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard }, { id: "productos", label: "Productos", icon: Package }, { id: "pedidos", label: "Pedidos", icon: Box }, { id: "agenda", label: "Agenda", icon: CalendarDays }, { id: "comentarios", label: "Comentarios", icon: MessageSquare }, { id: "contenido", label: "Contenido", icon: FileText }, { id: "reportes", label: "Reportes", icon: BarChart3 },
];

function productPayload(p: AdminProduct): Record<string, unknown> {
  return { category_id: p.category_id, name: p.name, slug: p.slug, description: p.description, price: p.price, image_url: p.image_url ?? null, images: p.images ?? [], ingredients: p.ingredients ?? null, allergens: p.allergens ?? [], status: p.status, inventory: p.inventory, preparation_days: p.preparation_days ?? 0 };
}

function mapApiOrder(o: ApiOrder): Order {
  return { id: o.id, customer: o.customer_name ?? "Sin nombre", customerPhone: o.customer_phone, customerEmail: o.customer_email, total: o.total, status: (ORDER_STATUS_LABEL[o.status] ?? "Pendiente") as OrderStatus, location: o.location ?? "", scheduledDate: o.scheduled_date, timeSlot: o.time_slot_label, timeSlotId: o.time_slot_id, zone: o.shipping_zone_name, shippingZoneId: o.shipping_zone_id, paymentMethod: o.payment_method, createdAt: o.created_at, items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.unit_price, productId: i.product_id })) };
}

export function AdminDashboard() {
  const router = useRouter();
  // La sesión es compartida con la tienda y la cuenta: no se vuelve a pedir a /api/auth/me.
  const session = useSession();
  const user = session.user;
  const [section, setSection] = useState<Section>("inicio");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [catalog, setCatalog] = useState<AdminProduct[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [managingCategories, setManagingCategories] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, products, ordersRows] = await Promise.all([
          apiFetch<CategoryRow[]>("/api/categories", { admin: true }),
          // El panel ve todo el catálogo, incluidos los productos inactivos (ocultos en la tienda).
          apiFetch<ApiProduct[]>("/api/products?include_inactive=true", { admin: true }),
          apiFetch<ApiOrder[]>("/api/orders", { admin: true }),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setCatalog(mapAdminProducts(products, cats));
        setOrders(ordersRows.map(mapApiOrder));
      } catch (e) {
        if (!cancelled) setState(e instanceof Error ? (e.message.includes("401") ? "Inicia sesión en /login para acceder al panel." : e.message) : "No se pudo conectar con la API.");
      }
    })();
    return () => { cancelled = true; };
  }, []);
  /** Refresca el nombre de categoría que muestra cada producto del catálogo. */
  function applyCategories(next: CategoryRow[]) {
    const map = categoryNames(next);
    setCategories(next);
    setCatalog((items) => items.map((p) => p.category_id ? { ...p, category: map.get(p.category_id) ?? "Sin categoría" } : p));
  }
  // Avisos de acción (creado/eliminado/error): se muestran como toast y se ocultan solos.
  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(() => setState(""), 5000);
    return () => window.clearTimeout(timer);
  }, [state]);
  async function logout() {
    await endSession();
    router.push("/");
  }
  // «Ventas del último mes»: los últimos 30 días móviles (mismo criterio que el preset «Últimos 30 días»
  // de Reportes). Antes sumaba todo el historial sin decir de qué período hablaba.
  const revenue = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const cutoff = from.getTime();
    return orders
      .filter((order) => order.status !== "Cancelado" && order.createdAt && new Date(order.createdAt).getTime() >= cutoff)
      .reduce((sum, order) => sum + order.total, 0);
  }, [orders]);
  function changeOrder(id: string, patch: Partial<Order>) {
    setOrders((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
    if (patch.status) {
      apiFetch(`/api/orders/${id}/status`, { method: "PATCH", admin: true, body: { status: ORDER_STATUS_DB[patch.status] } }).catch((e) => setState(e instanceof Error ? e.message : "No se pudo actualizar."));
    }
  }
  function orderSaved(order: Order) {
    setOrders((items) => items.some((item) => item.id === order.id) ? items.map((item) => item.id === order.id ? order : item) : [order, ...items]);
  }
  const selected = menu.find((item) => item.id === section)?.label;
  return <main className="min-h-screen bg-[#f5f6f2] text-[#243128]"><header className="flex h-16 items-center justify-between border-b border-[#d9ddd5] bg-white px-5 md:px-8"><div className="flex items-center gap-3"><button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Abrir menú"><Menu size={22}/></button><Link href="/" className="display text-2xl">{storeConfig.name}</Link></div><div className="flex items-center gap-4 text-sm">{user ? <button onClick={logout} className="rounded-lg border border-[#d9ddd5] px-3 py-2 hover:border-[#243128]">Cerrar sesión</button> : <Link href="/login" className="rounded-lg border border-[#d9ddd5] px-3 py-2">Cuenta</Link>}</div></header>{mobileMenu && <div className="fixed inset-0 z-40 md:hidden"><button aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} className="absolute inset-0 bg-[#243128]/30"/><nav className="absolute top-4 right-4 left-4 rounded-2xl bg-white p-3 shadow-xl">{menu.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { setSection(id); setMobileMenu(false); }} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm ${section === id ? "bg-[#243128] text-white" : "hover:bg-[#edf0e8]"}`}><Icon size={17}/>{label}</button>)}</nav></div>}<div className="mx-auto flex max-w-[1440px]"><aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-[#d9ddd5] bg-white p-4 md:block"><p className="px-3 pb-3 text-[11px] tracking-[.16em] text-[#7a867d] uppercase">Administración</p>{menu.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? "bg-[#243128] text-white" : "hover:bg-[#edf0e8]"}`}><Icon size={17}/>{label}</button>)}</aside><div className="min-w-0 flex-1 p-5 md:p-8"><div className="mb-7 flex items-center justify-between"><div><p className="text-sm text-[#748077]">Administración</p><h1 className="display text-4xl">{selected}</h1></div>{section === "pedidos" && <button onClick={() => setCreatingOrder(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white"><Plus size={16}/>Nueva orden</button>}{section === "productos" && <div className="flex flex-wrap items-center gap-2"><button onClick={() => setManagingCategories(true)} className="inline-flex items-center gap-2 rounded-lg border border-[#d9ddd5] bg-white px-4 py-2.5 text-sm transition hover:border-[#243128]"><Tags size={16}/>Categorías</button><button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white"><Plus size={16}/>Nuevo producto</button></div>}{section === "contenido" && <Link href="/admin/editor" className="inline-flex items-center gap-2 rounded-lg border border-[#d9ddd5] bg-white px-4 py-2.5 text-sm transition hover:border-[#243128]"><Pencil size={16}/>Editar en la página</Link>}</div><AdminContent section={section} catalog={catalog} orders={orders} revenue={revenue} onOrderChange={changeOrder} onOrderEdit={setEditingOrder} categories={categories} onCatalogChange={setCatalog} setState={setState} creatingProduct={creating} onCreateProductChange={setCreating}/></div></div>{state && <button onClick={() => setState("")} title="Cerrar aviso" className="fixed bottom-5 left-5 z-50 max-w-sm rounded-lg bg-[#243128] px-4 py-3 text-left text-sm text-white shadow-lg">{state}</button>}{creatingOrder && <OrderModal catalog={catalog} onClose={() => setCreatingOrder(false)} onSaved={orderSaved} setState={setState}/>}{editingOrder && <OrderModal key={editingOrder.id} order={editingOrder} catalog={catalog} onClose={() => setEditingOrder(null)} onSaved={orderSaved} setState={setState}/>}{managingCategories && <CategoriesModal categories={categories} onChange={applyCategories} onClose={() => setManagingCategories(false)} setState={setState}/>}</main>;
}

function AdminContent(props: { section: Section; catalog: AdminProduct[]; orders: Order[]; revenue: number; onOrderChange: (id: string, patch: Partial<Order>) => void; onOrderEdit: (order: Order) => void; categories: { id: string; name: string }[]; onCatalogChange: React.Dispatch<React.SetStateAction<AdminProduct[]>>; setState: (value: string) => void; creatingProduct: boolean; onCreateProductChange: React.Dispatch<React.SetStateAction<boolean>> }) {
  const { section, catalog, orders, revenue, categories, onCatalogChange, setState } = props;
  if (section === "inicio") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Ventas del último mes" value={formatPrice(revenue)} icon={CircleDollarSign}/><Metric label="Pedidos por gestionar" value={String(orders.filter((o) => !["Entregado", "Cancelado"].includes(o.status)).length)} icon={Box}/><Metric label="Productos activos" value={String(catalog.filter((p) => p.status === "active").length)} icon={Package}/><Metric label="Stock bajo" value={String(catalog.filter((p) => p.inventory > 0 && p.inventory <= 5).length)} icon={BarChart3}/></div><section className="mt-7 rounded-xl bg-white p-5"><h2 className="display mb-4 text-2xl">Pedidos recientes</h2><OrderTable orders={orders} onOrderChange={props.onOrderChange} onOrderEdit={props.onOrderEdit}/></section></>;
  if (section === "productos") return <ProductSection catalog={catalog} categories={categories} onCatalogChange={onCatalogChange} setState={setState} creating={props.creatingProduct} onCreatingChange={props.onCreateProductChange} />;
  if (section === "pedidos") return <section className="rounded-xl bg-white p-5"><p className="text-sm text-[#647167]"></p><OrdersSection orders={orders} onOrderChange={props.onOrderChange} onOrderEdit={props.onOrderEdit}/></section>;
  if (section === "agenda") return <AgendaSection setState={setState}/>;
  if (section === "comentarios") return <ReviewsSection setState={setState}/>;
  if (section === "contenido") return <ContentEditor setState={setState}/>;
  return <ReportsSection orders={orders} catalog={catalog}/>;
}

/**
 * Tabla de pedidos.
 *
 * Las dos fechas del pedido viven acá como columnas y se ordenan haciendo clic en su encabezado, de la
 * más antigua a la más nueva y al revés (igual que las columnas de Productos). En «Pedidos recientes»
 * (Inicio) se usa sin `onSort`, así que los encabezados son texto plano y no hay orden propio.
 */
function OrderTable({ orders, onOrderChange, onOrderEdit, sort, onSort }: { orders: Order[]; onOrderChange: (id: string, patch: Partial<Order>) => void; onOrderEdit: (order: Order) => void; sort?: OrderSort; onSort?: (key: OrderSort["key"]) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="border-y border-[#e2e5df] text-xs text-[#748077] uppercase">
          <tr>
            <th className="py-3">Orden</th>
            <th>Cliente</th>
            <th>Entrega</th>
            <th>{onSort ? <SortableHeader label="Fecha de pedido" active={sort?.key === "created"} dir={sort?.dir} onClick={() => onSort("created")}/> : "Fecha de pedido"}</th>
            <th>{onSort ? <SortableHeader label="Fecha agendada" active={sort?.key === "scheduled"} dir={sort?.dir} onClick={() => onSort("scheduled")}/> : "Fecha agendada"}</th>
            <th>Total</th>
            <th>Estado</th>
            <th className="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-[#edf0e8]">
              <td className="py-4 font-medium">{displayOrderId(order.id)}</td>
              <td>{order.customer}{order.customerPhone && <span className="block text-xs text-[#748077]">{order.customerPhone}</span>}</td>
              <td><FulfillmentCell order={order}/></td>
              <td className="whitespace-nowrap">{order.createdAt ? order.createdAt.slice(0, 10) : "—"}</td>
              <td className="whitespace-nowrap">{order.scheduledDate ? `${order.scheduledDate}${order.timeSlot ? ` · ${order.timeSlot}` : ""}` : "—"}</td>
              <td>{formatPrice(order.total)}</td>
              <td><select value={order.status} onChange={(e) => onOrderChange(order.id, { status: e.target.value as OrderStatus })} className={SELECT_FIELD_SM}><option>Pendiente</option><option>Enviado</option><option>Entregado</option><option>Cancelado</option></select></td>
              <td className="text-right"><button onClick={() => onOrderEdit(order)} aria-label={`Editar pedido ${order.id}`} title="Editar" className="rounded-md border border-[#d9ddd5] p-1.5 transition hover:border-[#243128]"><Pencil size={14}/></button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
// Todos los pedidos son **retiro presencial** (D33): la celda ya no distingue tipo, solo el punto.
function FulfillmentCell({ order }: { order: Order }) { return <div className="flex items-center gap-2"><span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#e4e9f5] px-2 py-1 text-xs whitespace-nowrap text-[#3d5384]"><Store size={12}/>Retiro presencial</span><span className="text-xs text-[#748077]">Retira en: {order.location || order.zone || "—"}</span></div>; }
/**
 * Orden de la tabla de Pedidos: por **cuándo se pidió** o por **cuándo se retira**, y en qué sentido
 * (de la fecha más antigua a la más nueva, o al revés).
 */
type OrderSort = { key: "created" | "scheduled"; dir: "asc" | "desc" };
/** Orden con el que abre la tabla: lo más reciente primero. */
const ORDER_SORT_DEFAULT: OrderSort = { key: "created", dir: "desc" };

/** Fecha con la que se ordena la tabla: la de creación (`created_at`, ISO) o la agendada (fecha simple). */
function orderDate(order: Order, key: OrderSort["key"]): string {
  return key === "created" ? order.createdAt ?? "" : order.scheduledDate ?? "";
}

/** Punto de retiro de un pedido: el nombre del punto y, si no lo tiene, la ubicación guardada. */
function orderZone(order: Order): string {
  return order.zone ?? order.location ?? "";
}

function OrdersSection({ orders, onOrderChange, onOrderEdit }: { orders: Order[]; onOrderChange: (id: string, patch: Partial<Order>) => void; onOrderEdit: (order: Order) => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"activos" | "all" | OrderStatus>("activos");
  const [zone, setZone] = useState("all");
  const [sort, setSort] = useState<OrderSort>(ORDER_SORT_DEFAULT);
  const query = search.trim().toLowerCase();
  // Puntos de retiro que ya aparecen en los pedidos: salen del propio listado, sin pedir la agenda a la API.
  const zoneOptions = useMemo(() => [...new Set(orders.map(orderZone))].filter(Boolean).sort(), [orders]);
  const hasNoZone = useMemo(() => orders.some((order) => !orderZone(order)), [orders]);
  const sortActive = sort.key !== ORDER_SORT_DEFAULT.key || sort.dir !== ORDER_SORT_DEFAULT.dir;
  const filtersActive = query !== "" || status !== "activos" || zone !== "all" || sortActive;
  const filtered = useMemo(() => orders.filter((order) => {
    if (status === "activos" && ["Entregado", "Cancelado"].includes(order.status)) return false;
    if (status !== "activos" && status !== "all" && order.status !== status) return false;
    if (query && !(order.customer.toLowerCase().includes(query) || order.location.toLowerCase().includes(query) || order.id.toLowerCase().includes(query))) return false;
    if (zone !== "all" && orderZone(order) !== zone) return false;
    return true;
  }), [orders, status, query, zone]);
  // El orden por fecha se aplica siempre; los pedidos sin la fecha elegida quedan al final para que no
  // desaparezcan al cambiar de columna.
  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const aValue = orderDate(a, sort.key);
      const bValue = orderDate(b, sort.key);
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      return aValue < bValue ? -factor : aValue > bValue ? factor : 0;
    });
  }, [filtered, sort]);
  /** Primer clic en una columna: de la fecha más antigua a la más nueva; el segundo la invierte. */
  function toggleSort(key: OrderSort["key"]) {
    setSort((current) => (current.key !== key ? { key, dir: "asc" } : { key, dir: current.dir === "asc" ? "desc" : "asc" }));
  }
  function clearFilters() {
    setSearch("");
    setStatus("activos");
    setZone("all");
    setSort(ORDER_SORT_DEFAULT);
  }
  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#748077]"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o ubicación..." className="w-full rounded-lg border border-[#d9ddd5] bg-white py-2.5 pr-3 pl-9 text-sm outline-none focus:border-[#243128]"/>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={`${SELECT_FIELD_INLINE} w-44`}>
          <option value="activos">Pedidos activos</option>
          <option value="all">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Enviado">Enviado</option>
          <option value="Entregado">Entregado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
        <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="Filtrar por punto de retiro" className={`${SELECT_FIELD_INLINE} w-56`}>
          <option value="all">Todos los puntos de retiro</option>
          {zoneOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          {hasNoZone && <option value="">Sin punto definido</option>}
        </select>
        <button onClick={clearFilters} disabled={!filtersActive} aria-label="Quitar todos los filtros" title="Quitar todos los filtros" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm transition hover:border-[#243128] disabled:cursor-not-allowed disabled:opacity-40">
          <RotateCcw size={14}/>Limpiar filtros
        </button>
        <p className="text-sm whitespace-nowrap text-[#647167]">{filtered.length} de {orders.length} pedidos</p>
      </div>
      <OrderTable orders={sorted} onOrderChange={onOrderChange} onOrderEdit={onOrderEdit} sort={sort} onSort={toggleSort}/>
      {filtered.length === 0 && <p className="py-8 text-center text-sm text-[#647167]">No hay pedidos que coincidan con los filtros. Usa «Todos los estados» para revisar pedidos entregados o cancelados.</p>}
    </>
  );
}
function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc" | undefined; onClick: () => void }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1 py-3 uppercase transition hover:text-[#243128] ${active ? "text-[#243128]" : ""}`} aria-label={`Ordenar por ${label}`}>{label}{active ? (dir === "asc" ? <ChevronUp size={13}/> : <ChevronDown size={13}/>) : <ChevronsUpDown size={13} className="opacity-40"/>}</button>;
}

/** Rango numérico elegido en un filtro (precio de un producto, total de un pedido). */
type RangeValue = { min: number; max: number };

/**
 * Filtro de rango con deslizador.
 *
 * Hoy lo usa el **precio** de Productos: vive en la barra de filtros como un selector más, se pinta
 * activo cuando el rango recorta los extremos y «Restablecer» vuelve al rango completo.
 */
function RangeFilter({ label, bounds, value, onChange, step = 100, className = "" }: {
  label: string;
  bounds: RangeValue;
  value: RangeValue | null;
  onChange: (value: RangeValue | null) => void;
  step?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== null && (value.min > bounds.min || value.max < bounds.max);
  return (
    <div className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${active ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] bg-white hover:border-[#243128]"}`}>
        <span className="truncate">{active ? `${label}: ${formatPrice(value!.min)} – ${formatPrice(value!.max)}` : label}</span>
        <ChevronDown size={15} className={`shrink-0 transition ${open ? "rotate-180" : ""}`}/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)}/>
          <div className="absolute top-full left-0 z-20 mt-2 w-72 rounded-xl border border-[#e2e5df] bg-white p-4 shadow-lg">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{formatPrice(value?.min ?? bounds.min)}</span>
              <span className="font-medium">{formatPrice(value?.max ?? bounds.max)}</span>
            </div>
            <Slider.Root value={value ? [value.min, value.max] : [bounds.min, bounds.max]} onValueChange={(next) => onChange({ min: next[0], max: next[1] })} min={bounds.min} max={bounds.max} step={step} thumbCollisionBehavior="swap">
              <Slider.Control className="flex w-full touch-none items-center py-3 select-none">
                <Slider.Track className="h-1.5 w-full rounded-full bg-[#e2e5df] select-none">
                  <Slider.Indicator className="rounded-full bg-[#243128] select-none"/>
                  <Slider.Thumb index={0} aria-label={`${label} mínimo`} className="size-4 rounded-full border-2 border-white bg-[#243128] shadow outline-none ring-1 ring-[#243128] select-none has-[:focus-visible]:ring-2"/>
                  <Slider.Thumb index={1} aria-label={`${label} máximo`} className="size-4 rounded-full border-2 border-white bg-[#243128] shadow outline-none ring-1 ring-[#243128] select-none has-[:focus-visible]:ring-2"/>
                </Slider.Track>
              </Slider.Control>
            </Slider.Root>
            <div className="flex justify-end">
              <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-[#647167] transition hover:bg-[#edf0e8] hover:text-[#243128]">
                <RotateCcw size={13}/>Restablecer
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function ProductSection({ catalog, categories, onCatalogChange, setState, creating, onCreatingChange }: { catalog: AdminProduct[]; categories: { id: string; name: string }[]; onCatalogChange: React.Dispatch<React.SetStateAction<AdminProduct[]>>; setState: (value: string) => void; creating: boolean; onCreatingChange: React.Dispatch<React.SetStateAction<boolean>> }) {
  const [category, setCategory] = useState("Todas");
  const [price, setPrice] = useState<{ min: number; max: number } | null>(null);
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "low" | "out">("all");
  // Activos (visibles en la tienda) / inactivos (solo en el panel), como ya hace la columna «Estado».
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  // Producto al que se le está agregando stock desde el botón «+» de la tabla.
  const [stocking, setStocking] = useState<AdminProduct | null>(null);
  // Producto pendiente de confirmar para eliminar (el borrado siempre pasa por el diálogo).
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const [sort, setSort] = useState<{ key: "name" | "price" | "inventory"; dir: "asc" | "desc" } | null>(null);
  const blankProduct: AdminProduct = { id: "", slug: "", name: "", price: 0, category: "Sin categoría", description: "", ingredients: "", images: [], allergens: [], tone: "light", status: "active", inventory: 0, preparation_days: 0, category_id: null };
  const options = [...new Set(catalog.map((p) => p.category).filter(Boolean))].sort();
  const bounds = useMemo(() => {
    const prices = catalog.map((p) => p.price);
    if (!prices.length) return { min: 0, max: 100000 };
    return { min: Math.floor(Math.min(...prices) / 100) * 100, max: Math.ceil(Math.max(...prices) / 100) * 100 };
  }, [catalog]);
  const priceActive = price !== null && (price.min > bounds.min || price.max < bounds.max);
  const query = search.trim().toLowerCase();
  const filtersActive = category !== "Todas" || priceActive || stockFilter !== "all" || statusFilter !== "all" || sort !== null || query !== "";
  const filtered = useMemo(() => catalog.filter((p) => {
    if (query && !(p.name.toLowerCase().includes(query) || p.slug.toLowerCase().includes(query) || p.category.toLowerCase().includes(query))) return false;
    if (category !== "Todas" && p.category !== category) return false;
    if (price && (p.price < price.min || p.price > price.max)) return false;
    if (stockFilter === "available" && p.inventory <= 0) return false;
    if (stockFilter === "low" && !(p.inventory > 0 && p.inventory <= 5)) return false;
    if (stockFilter === "out" && p.inventory !== 0) return false;
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    return true;
  }), [catalog, category, price, stockFilter, statusFilter, query]);
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
  // Dos estados: `active` se ve en la tienda; `inactive` solo en el panel de inventario.
  const statusMeta: Record<ProductStatus, { label: string; className: string }> = {
    active: { label: "Activo", className: "bg-[#e2f0e2] text-[#3c6b3f]" },
    inactive: { label: "Inactivo", className: "bg-[#edf0e8] text-[#647167]" },
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
      const row = await apiFetch<ApiProduct>("/api/products", { method: "POST", admin: true, body: { ...data, slug, image_url: data.image_url ?? null } });
      const [created] = mapAdminProducts([row], categories);
      onCatalogChange((items) => [created, ...items]);
      setState("Producto creado.");
      onCreatingChange(false);
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo crear."); }
  }
  /** Elimina el producto del catálogo, ya confirmado en el diálogo de borrado. */
  async function removeProduct(product: AdminProduct) {
    try {
      await apiFetch(`/api/products/${product.id}`, { method: "DELETE", admin: true });
      onCatalogChange((items) => items.filter((p) => p.id !== product.id));
      setState("Producto eliminado.");
      setDeleting(null);
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo eliminar."); }
  }
  /** Suma unidades al stock del producto desde el modal (D35). */
  async function addStock(product: AdminProduct, amount: number) {
    const updated: AdminProduct = { ...product, inventory: product.inventory + amount };
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
        {/* La búsqueda toma un tercio de la fila (antes 40 %) y el resto se reparte entre los cuatro
            filtros y el botón de limpiar, así ninguno queda apretado. */}
        <div className="mb-5 grid gap-3 md:grid-cols-[33%_1fr_1fr_1fr_1fr_auto]">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[#748077]"/>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="w-full rounded-lg border border-[#d9ddd5] bg-white py-2.5 pr-3 pl-9 text-sm outline-none focus:border-[#243128]"/>
          </div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={SELECT_FIELD}>
            <option>Todas</option>
            {options.map((c) => <option key={c}>{c}</option>)}
          </select>
          <RangeFilter label="Precio" bounds={bounds} value={price} onChange={setPrice}/>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)} className={SELECT_FIELD}>
            <option value="all">Todo el stock</option>
            <option value="available">Disponible</option>
            <option value="low">Stock bajo (≤ 5)</option>
            <option value="out">Sin stock</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} aria-label="Filtrar por estado" className={SELECT_FIELD}>
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
          <button onClick={() => { setCategory("Todas"); setPrice(null); setStockFilter("all"); setStatusFilter("all"); setSearch(""); setSort(null); }} disabled={!filtersActive} aria-label="Quitar todos los filtros" title="Quitar todos los filtros" className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm transition hover:border-[#243128] disabled:cursor-not-allowed disabled:opacity-40">
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
                  <td className="py-4"><div className="flex items-center gap-3">{photo ? <img src={photo} alt="" className="h-10 w-8 rounded object-cover"/> : <div data-tone={product.tone} className="product-visual h-10 w-8 rounded"/>}<div><strong>{product.name}</strong><span className="block text-xs text-[#748077]">/{product.slug}</span></div></div></td>
                  <td>{product.category}</td>
                  <td>{formatPrice(product.price)}</td>
                  <td>{product.inventory}</td>
                  <td><span className={`rounded-full px-2 py-1 text-xs ${meta.className}`}>{meta.label}</span></td>
                  <td className="text-right"><div className="inline-flex items-center gap-2"><button onClick={() => setEditing(product)} aria-label={`Editar ${product.name}`} title="Editar" className="rounded-md border border-[#d9ddd5] p-1.5 transition hover:border-[#243128]"><Pencil size={14}/></button><button onClick={() => setStocking(product)} aria-label={`Agregar stock a ${product.name}`} title="Agregar stock" className="rounded-md border border-[#d9ddd5] p-1.5 transition hover:border-[#243128]"><Plus size={14}/></button><button onClick={() => setDeleting(product)} aria-label={`Eliminar ${product.name}`} title="Eliminar" className="rounded-md border border-[#d9ddd5] p-1.5 text-[#8a4a44] transition hover:border-[#8a4a44]"><Trash2 size={14}/></button></div></td>
                </tr>
              ); })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="py-8 text-center text-sm text-[#647167]">No hay productos que coincidan con los filtros.</p>}
        </div>
      </section>
      {deleting && <DeleteProductModal product={deleting} onCancel={() => setDeleting(null)} onConfirm={() => removeProduct(deleting)}/>}
      {stocking && <StockModal product={stocking} onCancel={() => setStocking(null)} onAdd={(amount) => addStock(stocking, amount)}/>}
      {editing && <ProductEditor product={editing} categories={categories} onCancel={() => setEditing(null)} onSave={saveProduct} setState={setState}/>}
      {creating && <ProductEditor product={blankProduct} categories={categories} mode="create" onCancel={() => onCreatingChange(false)} onSave={createProduct} setState={setState}/>}
    </div>
  );
}
function DeleteProductModal({ product, onCancel, onConfirm }: { product: AdminProduct; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <div role="alertdialog" aria-modal="true" aria-label={`Eliminar ${product.name}`} className="w-full max-w-sm rounded-xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="display text-2xl">Eliminar producto</h2>
          <button type="button" onClick={onCancel} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <p className="text-sm text-[#647167]">¿Seguro que quieres eliminar <strong>{product.name}</strong>? Se quita del catálogo y no se puede deshacer.</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="rounded-lg border border-[#d9ddd5] px-4 py-2.5 text-sm hover:border-[#243128]">Cancelar</button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-[#8a4a44] px-4 py-2.5 text-sm text-white">Eliminar</button>
        </div>
      </div>
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

type AdminProductData = { name: string; price: number; inventory: number; status: ProductStatus; category_id: string | null; description: string; ingredients: string; images: string[]; image_url: string | null; allergens: string[]; preparation_days: number };
function ProductEditor({ product, categories, onCancel, onSave, setState, mode = "edit" }: { product: AdminProduct; categories: { id: string; name: string }[]; onCancel: () => void; onSave: (data: AdminProductData) => void; setState: (value: string) => void; mode?: "edit" | "create" }) {
  const isCreate = mode === "create";
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [description, setDescription] = useState(product.description);
  const [ingredients, setIngredients] = useState(product.ingredients ?? "");
  const [images, setImages] = useState<string[]>(product.images ?? []);
  const [imageUrl] = useState(product.image_url ?? "");
  const [urlInput, setUrlInput] = useState("");
  const [allergens, setAllergens] = useState<string[]>(product.allergens ?? []);
  const [inventory, setInventory] = useState(String(product.inventory));
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [preparationDays, setPreparationDays] = useState(String(product.preparation_days ?? 0));
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
    onSave({ name, price: Number(price), inventory: Number(inventory), status, category_id: categoryId || null, description, ingredients, images: finalImages, image_url: imageUrl || (finalImages[0] ?? null), allergens, preparation_days: Math.max(0, Number(preparationDays) || 0) });
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
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Precio (CLP)</span>
              <input required type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Stock</span>
              <input required type="number" min="0" value={inventory} onChange={(e) => setInventory(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Días de preparación</span>
              <input required type="number" min="0" value={preparationDays} onChange={(e) => setPreparationDays(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
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
              <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} className={SELECT_FIELD}>
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Categoría</span>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={SELECT_FIELD}>
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          </div>
          <div className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Alérgenos</span>
            <div className="flex flex-wrap gap-2">{Object.entries(ALLERGENS).map(([code, info]) => <button key={code} type="button" onClick={() => toggleAllergen(code)} className={`rounded-full border px-3 py-1.5 text-xs transition ${allergens.includes(code) ? "border-[#243128] bg-[#243128] text-white" : "border-[#d9ddd5] hover:border-[#243128]"}`}>{info.icon} {info.label}</button>)}</div>
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
function initialOrderItems(order: Order | undefined, catalog: AdminProduct[]): { product: AdminProduct; quantity: number }[] {
  if (!order) return [];
  return order.items.map((item) => {
    const found = item.productId ? catalog.find((product) => product.id === item.productId) : undefined;
    return { product: found ?? { id: item.productId ?? "", slug: "", name: item.name, price: item.price, category: "", description: "", tone: "light" as const, status: "active" as const, inventory: 0, preparation_days: 0, category_id: null }, quantity: item.quantity };
  });
}

function OrderModal({ order, catalog, onClose, onSaved, setState }: { order?: Order; catalog: AdminProduct[]; onClose: () => void; onSaved: (order: Order) => void; setState: (value: string) => void }) {
  const isEditing = Boolean(order);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [customer, setCustomer] = useState({ name: order?.customer ?? "", phone: order?.customerPhone ?? "", email: order?.customerEmail ?? "" });
  const [zoneId, setZoneId] = useState(order?.shippingZoneId ?? "");
  const [date, setDate] = useState(order?.scheduledDate ?? "");
  const [slotId, setSlotId] = useState(order?.timeSlotId ?? "");
  // Único medio de pago: Webpay (D8). Los pedidos viejos con otro método se normalizan a Webpay.
  const [payment, setPayment] = useState("Webpay");
  const [items, setItems] = useState(() => initialOrderItems(order, catalog));
  const [picker, setPicker] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiFetch<SlotRow[]>("/api/time-slots").then((rows) => setSlots(rows.filter((slot) => slot.enabled))).catch(() => undefined);
    apiFetch<ZoneRow[]>("/api/shipping-zones").then(setZones).catch(() => undefined);
  }, []);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  // Solo hay retiro presencial (D33): el punto elegido define dónde se retira y con qué franjas.
  const selectedZone = zones.find((zone) => zone.id === zoneId) ?? null;
  // Solo las franjas del punto elegido y que atienden ese día de la semana (D18).
  const zoneSlots = slots.filter((slot) => (!zoneId || slot.zone_id === zoneId) && (!date || slot.weekdays.includes(weekdayFromIso(date))));
  const selectedSlotId = zoneSlots.some((slot) => slot.id === slotId) ? slotId : "";
  function addItem() {
    const product = catalog.find((p) => p.id === picker);
    const qty = Number(quantity);
    if (!product || !Number.isInteger(qty) || qty <= 0) return;
    setItems((current) => current.some((item) => item.product.id === product.id)
      ? current.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + qty } : item)
      : [...current, { product, quantity: qty }]);
    setPicker("");
    setQuantity("1");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!customer.name.trim()) { setState("Ingresa el nombre del cliente."); return; }
    if (items.length === 0) { setState("Agrega al menos un producto."); return; }
    setSaving(true);
    try {
      const row = await apiFetch<ApiOrder>(isEditing ? `/api/orders/${order!.id}` : "/api/orders", {
        method: isEditing ? "PUT" : "POST",
        admin: isEditing,
        body: {
          customer_name: customer.name.trim(), customer_phone: customer.phone.trim() || null, customer_email: customer.email.trim() || null,
          payment_method: payment, scheduled_date: date || null, time_slot_id: selectedSlotId || null,
          shipping_zone_id: zoneId || null,
          location: selectedZone ? (selectedZone.location || selectedZone.name) : null,
          items: items.map((item) => ({ product_id: item.product.id || null, name: item.product.name, unit_price: item.product.price, quantity: item.quantity })),
        },
      });
      onSaved(mapApiOrder(row));
      setState(isEditing ? "Pedido actualizado." : "Pedido registrado.");
      onClose();
    } catch (e) { setState(e instanceof Error ? e.message : isEditing ? "No se pudo actualizar el pedido." : "No se pudo registrar el pedido."); }
    finally { setSaving(false); }
  }
  const fieldClass = "w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">{isEditing ? `Editar pedido ${displayOrderId(order!.id)}` : "Nueva orden"}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Cliente</span><input required value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className={fieldClass}/></label>
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Teléfono</span><input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className={fieldClass}/></label>
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Correo</span><input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} className={fieldClass}/></label>
          </div>
          <div>
            <span className="mb-1.5 block text-sm text-[#647167]">Productos</span>
            <div className="flex flex-wrap items-center gap-2">
              <select value={picker} onChange={(e) => setPicker(e.target.value)} className={`${SELECT_FIELD} min-w-0 flex-1`}>
                <option value="">Elige un producto…</option>
                {catalog.map((product) => <option key={product.id} value={product.id}>{product.name} · {formatPrice(product.price)}</option>)}
              </select>
              <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Cantidad" className="w-20 rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
              <button type="button" onClick={addItem} disabled={!picker} className="rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm transition hover:border-[#243128] disabled:opacity-40">Agregar</button>
            </div>
            <div className="mt-3 divide-y divide-[#edf0e8]">
              {items.map((item, index) => <div key={`${item.product.id}-${index}`} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{item.quantity} × {item.product.name}</span><span className="flex items-center gap-3"><span>{formatPrice(item.product.price * item.quantity)}</span><button type="button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))} aria-label={`Quitar ${item.product.name}`} className="text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button></span></div>)}
              {items.length === 0 && <p className="py-2 text-sm text-[#647167]">Agrega al menos un producto para crear el pedido.</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Punto de retiro</span><select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={SELECT_FIELD}><option value="">Sin punto definido</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
            {selectedZone && <p className="self-end pb-2.5 text-xs text-[#647167]">{selectedZone.location || "Sin ubicación definida"}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Fecha agendada</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass}/></label>
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Franja horaria</span><select value={selectedSlotId} onChange={(e) => setSlotId(e.target.value)} className={SELECT_FIELD}><option value="">{zoneSlots.length === 0 ? "Sin franjas para ese día" : "Sin franja"}</option>{zoneSlots.map((slot) => <option key={slot.id} value={slot.id}>{formatSlot(slot)}</option>)}</select></label>
            <label className="block text-sm"><span className="mb-1.5 block text-[#647167]">Pago</span><select value={payment} onChange={(e) => setPayment(e.target.value)} className={SELECT_FIELD}><option>Webpay</option></select></label>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-[#e2e5df] pt-4 text-sm"><span className="text-[#647167]">Total</span><strong className="display text-xl">{formatPrice(total)}</strong></div>
        <div className="mt-4 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#d9ddd5] px-4 py-2.5 text-sm hover:border-[#243128]">Cancelar</button>
          <button disabled={saving} className="rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white disabled:opacity-50">{saving ? "Guardando…" : isEditing ? "Guardar cambios" : "Crear pedido"}</button>
        </div>
      </form>
    </div>
  );
}
function ContentEditor({ setState }: { setState: (value: string) => void }) {
  // Solo el contacto se edita acá: los textos de la página (nombre, anuncio, hero e historia) pasaron
  // al editor visual `/admin/editor` (D38), así que ya no se muestran en Contenido.
  const [contact, setContact] = useState({ contact_email: "", contact_phone: "", whatsapp_phone: "", instagram_url: "" });
  // Paleta de marca (D29): se editan los cinco tonos y el borrador guarda lo que se está escribiendo en
  // el campo de texto, para no volcar a la paleta (ni a la API) un hex a medio escribir.
  const [colors, setColors] = useState<ThemeColors>(defaultThemeColors);
  const [drafts, setDrafts] = useState<ThemeColors>(defaultThemeColors);
  useEffect(() => {
    apiFetch<{ contact_email?: string | null; contact_phone?: string | null; whatsapp_phone?: string | null; instagram_url?: string | null; theme_colors?: Partial<Record<string, string>> | null }>("/api/settings").then((data) => {
      setContact({ contact_email: data.contact_email ?? "", contact_phone: data.contact_phone ?? "", whatsapp_phone: data.whatsapp_phone ?? "", instagram_url: data.instagram_url ?? "" });
      const palette = normalizeThemeColors(data.theme_colors);
      setColors(palette);
      setDrafts(palette);
    }).catch(() => undefined);
  }, []);
  function set<K extends keyof typeof contact>(key: K, value: string) { setContact((current) => ({ ...current, [key]: value })); }
  // El hex solo pasa a la paleta cuando está completo; si no, se guarda en el borrador y al salir del
  // campo vuelve al último color válido.
  function setColor(key: ThemeColorKey, value: string) {
    if (isHexColor(value)) {
      const hex = value.trim().toLowerCase();
      setColors((current) => ({ ...current, [key]: hex }));
      setDrafts((current) => ({ ...current, [key]: hex }));
      return;
    }
    setDrafts((current) => ({ ...current, [key]: value }));
  }
  // Intercambiar dos tonos de lugar: el color de uno pasa al otro y viceversa, así que probar otro
  // reparto (p. ej. llevar el salvia al pie) no obliga a copiar hex a mano ni pierde ningún color.
  function swapColors(key: ThemeColorKey, other: ThemeColorKey) {
    const swap = (current: ThemeColors) => ({ ...current, [key]: current[other], [other]: current[key] });
    setColors(swap);
    setDrafts(swap);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      // Los textos de la página se editan en `/admin/editor`, así que se leen de la API y se reenvían
      // tal cual: guardar contacto o colores no debe pisarlos.
      const current = await apiFetch<Record<string, unknown> & { id?: unknown; updated_at?: unknown }>("/api/settings");
      const { id, updated_at, ...base } = current;
      void id;
      void updated_at;
      await apiFetch("/api/settings", { method: "PUT", admin: true, body: { ...base, ...contact, theme_colors: colors } });
      setState("Contenido guardado. Refresca la tienda para ver los cambios.");
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo guardar."); }
  }
  /**
   * Campo de contacto. Cada uno lleva el **mismo icono que el footer de la tienda**: `Mail`, `Phone`,
   * `MessageCircle` (WhatsApp) y `AtSign` (Instagram). Este `lucide-react` no trae los logos de marca
   * —no existen `Instagram` ni `WhatsApp`—, así que el panel y la tienda se ven igual.
   */
  const field = (key: keyof typeof contact, label: string, Icon: typeof Mail, placeholder = "") => (
    <label className="block text-sm">
      <span className="mb-1.5 flex items-center gap-1.5 text-[#647167]"><Icon size={14}/>{label}</span>
      <input value={contact[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
    </label>
  );
  // El formulario ocupa todo el ancho del panel (como Productos y Pedidos): antes se quedaba en 2xl.
  return (
    <form onSubmit={save} className="space-y-4 rounded-xl bg-white p-5">
      {/* Sin encabezado propio: el título de la sección es el «Contenido» de arriba y el botón
          «Editar en la página» vive a su derecha, en el encabezado del panel. */}
      <fieldset className="rounded-xl border border-[#e2e5df] p-4">
        <legend className="px-1 text-sm font-medium">Contactos</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("contact_email", "Correo de contacto", Mail)}
          {field("contact_phone", "Teléfono de contacto", Phone)}
          {field("whatsapp_phone", "WhatsApp", MessageCircle)}
          {field("instagram_url", "Instagram (URL del perfil)", AtSign)}
        </div>
      </fieldset>
      <fieldset className="rounded-xl border border-[#e2e5df] p-4">
        <legend className="px-1 text-sm font-medium">Colores de la tienda</legend>
        <div className=" grid gap-3 sm:grid-cols-2">
          {themeColorFields.map(({ key, label, hint }) => (
            <div key={key} className="rounded-lg border border-[#e2e5df] p-2.5">
              <div className="flex items-center gap-3">
                <input type="color" value={colors[key]} onChange={(e) => setColor(key, e.target.value)} aria-label={label} className="h-10 w-12 shrink-0 cursor-pointer rounded border border-[#d9ddd5] bg-white p-1"/>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{label}</p>
                  <span className="mt-0.5 block text-xs text-[#647167]">{hint}</span>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input value={drafts[key]} onChange={(e) => setColor(key, e.target.value)} onBlur={() => setDrafts((current) => ({ ...current, [key]: colors[key] }))} spellCheck={false} className="w-full rounded border border-[#d9ddd5] px-2 py-1 font-mono text-xs uppercase outline-none focus:border-[#243128]"/>
                <select value="" onChange={(e) => e.target.value && swapColors(key, e.target.value as ThemeColorKey)} aria-label={`Intercambiar ${label} con otro tono`} className={`${SELECT_FIELD_SM} w-36 shrink-0`}>
                  <option value="">Intercambiar con…</option>
                  {themeColorFields.filter((field) => field.key !== key).map((field) => <option key={field.key} value={field.key}>{field.label} ({colors[field.key]})</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <button className="rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white">Guardar contenido</button>
      </div>
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
/** Convierte «Postres Fríos» en `postres-frios` (slug válido para la API). */
function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140);
}

/**
 * Gestión de categorías del catálogo: listar, agregar, editar y quitar.
 * Al eliminar una categoría sus productos quedan como «Sin categoría».
 */
function CategoriesModal({ categories, onChange, onClose, setState }: { categories: CategoryRow[]; onChange: (next: CategoryRow[]) => void; onClose: () => void; setState: (value: string) => void }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const fieldClass = "w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]";
  const sorted = (rows: CategoryRow[]) => [...rows].sort((a, b) => a.name.localeCompare(b.name));

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    const slug = slugify(name);
    if (!name || !slug) { setState("Escribe un nombre válido para la categoría."); return; }
    setBusy(true);
    try {
      const row = await apiFetch<CategoryRow>("/api/categories", { method: "POST", admin: true, body: { name, slug } });
      onChange(sorted([...categories, { id: row.id, name: row.name, slug: row.slug }]));
      setNewName("");
      setState("Categoría creada.");
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo crear la categoría."); }
    finally { setBusy(false); }
  }

  async function save(row: CategoryRow) {
    const name = editName.trim();
    if (!name) { setState("El nombre no puede quedar vacío."); return; }
    setBusy(true);
    try {
      const updated = await apiFetch<CategoryRow>(`/api/categories/${row.id}`, { method: "PUT", admin: true, body: { name, slug: slugify(name) } });
      onChange(sorted(categories.map((c) => c.id === row.id ? { id: updated.id, name: updated.name, slug: updated.slug } : c)));
      setEditingId(null);
      setState("Categoría actualizada.");
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo actualizar la categoría."); }
    finally { setBusy(false); }
  }

  async function remove(row: CategoryRow) {
    if (!window.confirm(`¿Eliminar la categoría «${row.name}»? Los productos que la usen quedarán como «Sin categoría».`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/categories/${row.id}`, { method: "DELETE", admin: true });
      onChange(categories.filter((c) => c.id !== row.id));
      setState("Categoría eliminada.");
    } catch (e) { setState(e instanceof Error ? e.message : "No se pudo eliminar la categoría."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">Categorías</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <p className="text-sm text-[#647167]">Organizan la carta y el filtro de la tienda. Al eliminar una categoría, sus productos quedan como «Sin categoría».</p>
        <div className="mt-5 divide-y divide-[#edf0e8]">
          {categories.length === 0 && <p className="py-3 text-sm text-[#647167]">Todavía no hay categorías.</p>}
          {categories.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 py-3 text-sm">
              {editingId === row.id ? (
                <>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} aria-label={`Nombre de ${row.name}`} className={`${fieldClass} min-w-0 flex-1`}/>
                  <button disabled={busy} onClick={() => save(row)} className="rounded-lg bg-[#243128] px-3 py-2 text-xs text-white disabled:opacity-50">Guardar</button>
                  <button onClick={() => setEditingId(null)} className="rounded-lg border border-[#d9ddd5] px-3 py-2 text-xs hover:border-[#243128]">Cancelar</button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1"><strong>{row.name}</strong><span className="block text-xs text-[#748077]">/{row.slug}</span></span>
                  <button onClick={() => { setEditingId(row.id); setEditName(row.name); }} aria-label={`Editar ${row.name}`} className="rounded-md border border-[#d9ddd5] p-1.5 transition hover:border-[#243128]"><Pencil size={14}/></button>
                  <button disabled={busy} onClick={() => remove(row)} aria-label={`Eliminar ${row.name}`} className="rounded-md border border-[#d9ddd5] p-1.5 text-[#8a4a44] transition hover:border-[#8a4a44] disabled:opacity-50"><Trash2 size={14}/></button>
                </>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={create} className="mt-5 border-t border-[#e2e5df] pt-5">
          <label className="block text-sm">
            <span className="mb-1.5 block text-[#647167]">Nueva categoría</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej. Tortas, Postres, Panes" className={fieldClass}/>
          </label>
          <button disabled={busy || !newName.trim()} className="mt-3 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white disabled:opacity-50">Agregar categoría</button>
        </form>
      </div>
    </div>
  );
}

function ReviewRow({ review, onStatus, onRemove }: { review: { id: string; author: string; rating: number; comment: string; status: string; product: string | null }; onStatus: (status: string) => void; onRemove: () => void }) {
  return <div className="rounded-xl border border-[#e2e5df] p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">{review.author} · {review.product ?? "Producto"}</span><span className="text-[#c9962e]">{"★".repeat(review.rating)}</span></div><p className="mt-2 text-sm leading-6 text-[#526058]">{review.comment}</p><div className="mt-3 flex items-center gap-2">{review.status !== "approved" && <button onClick={() => onStatus("approved")} className="inline-flex items-center gap-1.5 rounded-lg bg-[#243128] px-3 py-1.5 text-xs text-white"><Check size={13}/>Aprobar</button>}{review.status !== "rejected" && <button onClick={() => onStatus("rejected")} className="rounded-lg border border-[#d9ddd5] px-3 py-1.5 text-xs hover:border-[#243128]">Rechazar</button>}<button onClick={onRemove} aria-label="Eliminar comentario" className="ml-auto text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button></div></div>;
}