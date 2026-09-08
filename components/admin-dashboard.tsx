"use client";

import { Slider } from "@base-ui/react/slider";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Box, ChevronDown, ChevronRight, ChevronsUpDown, ChevronUp, CircleDollarSign, Eye, FileText, LayoutDashboard, MapPin, Package, Pencil, Plus, RotateCcw, Search, Settings, Store, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { formatPrice, products as demoProducts, type Product } from "@/lib/products";
import { storeConfig } from "@/lib/store-config";

type Section = "inicio" | "productos" | "pedidos" | "clientes" | "contenido" | "reportes" | "configuracion";
type OrderItem = { name: string; quantity: number; price: number };
type Order = { id: string; customer: string; total: number; status: "Pendiente" | "Pagado" | "Preparando" | "Enviado" | "Entregado" | "Cancelado"; fulfillment: "retiro" | "domicilio"; location: string; items: OrderItem[] };
const fulfillmentMeta: Record<Order["fulfillment"], { label: string; icon: typeof Store; className: string }> = {
  domicilio: { label: "A domicilio", icon: MapPin, className: "bg-[#e2f0e2] text-[#3c6b3f]" },
  retiro: { label: "Retiro", icon: Store, className: "bg-[#e4e9f5] text-[#3d5384]" },
};
const menu: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard }, { id: "productos", label: "Productos", icon: Package }, { id: "pedidos", label: "Pedidos", icon: Box }, { id: "clientes", label: "Clientes", icon: Users }, { id: "contenido", label: "Contenido", icon: FileText }, { id: "reportes", label: "Reportes", icon: BarChart3 }, { id: "configuracion", label: "Configuración", icon: Settings },
];
type AdminProduct = Product & { status: "draft" | "active" | "sold_out"; inventory: number; category_id: string | null };

export function AdminDashboard() {
  const [section, setSection] = useState<Section>("inicio");
  const [catalog, setCatalog] = useState<AdminProduct[]>(demoProducts.map((p) => ({ ...p, status: "active", inventory: 0, category_id: null })));
  const [orders, setOrders] = useState<Order[]>([{ id: "#1004", customer: "Camila R.", total: 77980, status: "Preparando", fulfillment: "domicilio", location: "Av. Providencia 1234, dpto 502, Providencia", items: [{ name: "Producto Dos", quantity: 1, price: 42990 }, { name: "Producto Uno", quantity: 1, price: 34990 }] }, { id: "#1003", customer: "Lucas M.", total: 69980, status: "Pagado", fulfillment: "retiro", location: "Sucursal Centro — Av. Libertad 780", items: [{ name: "Producto Uno", quantity: 2, price: 34990 }] }, { id: "#1002", customer: "Andrea G.", total: 86980, status: "Entregado", fulfillment: "domicilio", location: "Los Alerces 455, Ñuñoa", items: [{ name: "Producto Tres", quantity: 1, price: 48990 }, { name: "Producto Cuatro", quantity: 1, price: 37990 }] }]);
  const [state, setState] = useState("Modo demostración: configura Supabase para administrar datos reales.");
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { const client = createClient(); if (!client) return; client.auth.getUser().then(({ data }) => { if (!data.user) { setState("Inicia sesión con una cuenta administradora para editar datos."); return; } client.from("categories").select("id,name").order("name").then(({ data: cats }) => setCategories((cats ?? []).map((c) => ({ id: c.id, name: c.name })))); client.from("products").select("id,slug,name,price,description,status,inventory,category_id,categories(name)").order("created_at", { ascending: false }).then(({ data: rows, error }) => { if (error) setState(error.message); else { setCatalog((rows ?? []).map((p, i) => ({ id: p.id, slug: p.slug, name: p.name, price: p.price, description: p.description ?? "", category: (p.categories as unknown as { name: string } | null)?.name ?? "Sin categoría", category_id: p.category_id ?? null, inventory: p.inventory, status: p.status, tone: (["warm", "light", "deep", "classic"] as const)[i % 4] }))); setState("Conectado a Supabase."); } }); }); }, []);
  const revenue = useMemo(() => orders.filter((order) => order.status !== "Cancelado").reduce((sum, order) => sum + order.total, 0), [orders]);
  function addOrder() { setOrders((items) => [{ id: `#${1000 + items.length + 2}`, customer: "Cliente nuevo", total: 0, status: "Pendiente", fulfillment: "retiro", location: "Retiro en tienda", items: [] }, ...items]); }
  const selected = menu.find((item) => item.id === section)?.label;
  return <main className="min-h-screen bg-[#f5f6f2] text-[#243128]"><header className="flex h-16 items-center justify-between border-b border-[#d9ddd5] bg-white px-5 md:px-8"><Link href="/" className="display text-2xl">{storeConfig.name}</Link><div className="flex items-center gap-4 text-sm"><span className="hidden text-[#647167] sm:block">{state}</span><Link href="/login" className="rounded-lg border border-[#d9ddd5] px-3 py-2">Cuenta</Link></div></header><div className="mx-auto flex max-w-[1440px]"><aside className="sticky top-0 hidden h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-[#d9ddd5] bg-white p-4 md:block"><p className="px-3 pb-3 text-[11px] tracking-[.16em] text-[#7a867d] uppercase">Administración</p>{menu.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? "bg-[#243128] text-white" : "hover:bg-[#edf0e8]"}`}><Icon size={17}/>{label}</button>)}</aside><div className="min-w-0 flex-1 p-5 md:p-8"><div className="mb-7 flex items-center justify-between"><div><p className="text-sm text-[#748077]">Administración</p><h1 className="display text-4xl">{selected}</h1></div>{section === "pedidos" && <button onClick={addOrder} className="inline-flex items-center gap-2 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white"><Plus size={16}/>Nueva orden</button>}{section === "productos" && <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-lg bg-[#243128] px-4 py-2.5 text-sm text-white"><Plus size={16}/>Nuevo producto</button>}</div><AdminContent section={section} catalog={catalog} orders={orders} revenue={revenue} onOrdersChange={setOrders} categories={categories} onCatalogChange={setCatalog} setState={setState} creatingProduct={creating} onCreateProductChange={setCreating}/></div></div></main>;
}

function AdminContent(props: { section: Section; catalog: AdminProduct[]; orders: Order[]; revenue: number; onOrdersChange: React.Dispatch<React.SetStateAction<Order[]>>; categories: { id: string; name: string }[]; onCatalogChange: React.Dispatch<React.SetStateAction<AdminProduct[]>>; setState: (value: string) => void; creatingProduct: boolean; onCreateProductChange: React.Dispatch<React.SetStateAction<boolean>> }) {
  const { section, catalog, orders, revenue, categories, onCatalogChange, setState } = props;
  if (section === "inicio") return <><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Ventas del período" value={formatPrice(revenue)} icon={CircleDollarSign}/><Metric label="Pedidos por gestionar" value={String(orders.filter((o) => !["Entregado", "Cancelado"].includes(o.status)).length)} icon={Box}/><Metric label="Productos activos" value={String(catalog.length)} icon={Package}/><Metric label="Stock bajo" value="0" icon={BarChart3}/></div><section className="mt-7 rounded-xl bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="display text-2xl">Pedidos recientes</h2><button onClick={() => props.onOrdersChange((items) => items.map((item, index) => index === 0 ? { ...item, status: "Preparando" } : item))} className="text-sm underline">Actualizar primero</button></div><OrderTable orders={orders} onChange={props.onOrdersChange}/></section></>;
  if (section === "productos") return <ProductSection catalog={catalog} categories={categories} onCatalogChange={onCatalogChange} setState={setState} creating={props.creatingProduct} onCreatingChange={props.onCreateProductChange} />;
  if (section === "pedidos") return <section className="rounded-xl bg-white p-5"><p className="mb-4 text-sm text-[#647167]">Gestiona estados internos. Pago, boleta y despacho se conectarán cuando se integren esos servicios.</p><OrdersSection orders={orders} onChange={props.onOrdersChange}/></section>;
  if (section === "clientes") return <DataCard title="Clientes" description="Los perfiles de Supabase aparecerán aquí con historial de pedidos, direcciones y segmentación." rows={[["Camila R.", "camila@ejemplo.cl", "Cliente frecuente"], ["Lucas M.", "lucas@ejemplo.cl", "Nuevo cliente"]]}/>;
  if (section === "contenido") return <DataCard title="Contenido de la tienda" description="Edita hero, secciones de la home y páginas estáticas como nosotros, términos y preguntas frecuentes." rows={[["Home", "Hero y colección destacada", "Editar"], ["Nosotros", "Página estática", "Editar"], ["Preguntas frecuentes", "Página estática", "Editar"]]}/>;
  if (section === "reportes") return <><div className="grid gap-4 sm:grid-cols-3"><Metric label="Ventas" value={formatPrice(revenue)} icon={CircleDollarSign}/><Metric label="Órdenes" value={String(orders.length)} icon={Box}/><Metric label="Ticket promedio" value={formatPrice(orders.length ? Math.round(revenue / orders.length) : 0)} icon={BarChart3}/></div><DataCard title="Productos más vendidos" description="Se calculará a partir de las líneas de órdenes pagadas." rows={catalog.slice(0, 3).map((p, index) => [p.name, `${3 - index} ventas`, formatPrice(p.price)])}/> </>;
  return <DataCard title="Configuración" description="Administra identidad de tienda, dominio, contactos, usuarios y permisos. Los medios de pago se configurarán en su fase de integración." rows={[["Datos de la tienda", storeConfig.name, "Editar"], ["Usuarios del panel", "Roles: dueño / encargado", "Gestionar"], ["Métodos de pago", "No configurados", "Próximamente"]]}/>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Package }) { return <div className="rounded-xl bg-white p-5"><div className="flex items-center justify-between text-[#647167]"><span className="text-sm">{label}</span><Icon size={18}/></div><p className="display mt-3 text-3xl">{value}</p></div>; }
function OrderTable({ orders, onChange }: { orders: Order[]; onChange: React.Dispatch<React.SetStateAction<Order[]>> }) { const [detail, setDetail] = useState<Order | null>(null); return <><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-y border-[#e2e5df] text-xs text-[#748077] uppercase"><tr><th className="py-3">Orden</th><th>Cliente</th><th>Entrega</th><th>Total</th><th>Estado</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-b border-[#edf0e8]"><td className="py-4 font-medium"><span className="inline-flex items-center gap-2">{order.id}<button onClick={() => setDetail(order)} aria-label={`Ver productos de ${order.id}`} title="Ver productos" className="rounded-md border border-[#d9ddd5] p-1 transition hover:border-[#243128]"><Eye size={13}/></button></span></td><td>{order.customer}</td><td><FulfillmentCell order={order}/></td><td>{formatPrice(order.total)}</td><td><select value={order.status} onChange={(e) => onChange((items) => items.map((item) => item.id === order.id ? { ...item, status: e.target.value as Order["status"] } : item))} className="rounded-md border border-[#d9ddd5] bg-white px-2 py-1 text-xs"><option>Pendiente</option><option>Pagado</option><option>Preparando</option><option>Enviado</option><option>Entregado</option><option>Cancelado</option></select></td></tr>)}</tbody></table></div>{detail && <OrderItemsModal order={detail} onClose={() => setDetail(null)}/>}</>; }
function OrderItemsModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">Pedido {order.id}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <p className="text-sm text-[#647167]">Cliente: <strong className="text-[#243128]">{order.customer}</strong></p>
        <div className="mt-2"><FulfillmentCell order={order}/></div>
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
function FulfillmentCell({ order }: { order: Order }) { const meta = fulfillmentMeta[order.fulfillment]; const Icon = meta.icon; return <div className="flex items-center gap-2"><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-xs whitespace-nowrap ${meta.className}`}><Icon size={12}/>{meta.label}</span><span className="text-xs text-[#748077]">{order.fulfillment === "retiro" ? "Retira en: " : "Envío a: "}{order.location}</span></div>; }
function OrdersSection({ orders, onChange }: { orders: Order[]; onChange: React.Dispatch<React.SetStateAction<Order[]>> }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"activos" | "all" | Order["status"]>("activos");
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
      <OrderTable orders={filtered} onChange={onChange}/>
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
  const [stockFilter, setStockFilter] = useState<"all" | "available" | "low" | "out">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminProduct | null>(null);
  const [stocking, setStocking] = useState<AdminProduct | null>(null);
  const [sort, setSort] = useState<{ key: "name" | "price" | "inventory"; dir: "asc" | "desc" } | null>(null);
  const blankProduct: AdminProduct = { id: "", slug: "", name: "", price: 0, category: "Sin categoría", description: "", tone: "light", status: "draft", inventory: 0, category_id: null };
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
  const statusMeta: Record<AdminProduct["status"], { label: string; className: string }> = {
    draft: { label: "Borrador", className: "bg-[#fff0d8] text-[#8a6420]" },
    active: { label: "Activo", className: "bg-[#e2f0e2] text-[#3c6b3f]" },
    sold_out: { label: "Agotado", className: "bg-[#f3e2e0] text-[#8a4a44]" },
  };
  async function saveProduct(data: { name: string; price: number; inventory: number; status: AdminProduct["status"]; category_id: string | null }) {
    if (!editing) return;
    const client = createClient();
    if (client) {
      const { error } = await client.from("products").update({ name: data.name, price: data.price, inventory: data.inventory, status: data.status, category_id: data.category_id }).eq("id", editing.id);
      if (error) { setState(error.message); return; }
    }
    onCatalogChange((items) => items.map((p) => p.id === editing.id ? { ...p, name: data.name, price: data.price, inventory: data.inventory, status: data.status, category_id: data.category_id, category: categories.find((c) => c.id === data.category_id)?.name ?? "Sin categoría" } : p));
    setState(client ? "Producto actualizado." : "Producto actualizado (modo demostración).");
    setEditing(null);
  }
  async function createProduct(data: { name: string; price: number; inventory: number; status: AdminProduct["status"]; category_id: string | null }) {
    const slug = data.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "producto";
    const client = createClient();
    const category = categories.find((c) => c.id === data.category_id)?.name ?? "Sin categoría";
    if (client) {
      const { data: row, error } = await client.from("products").insert({ name: data.name, slug, price: data.price, inventory: data.inventory, status: data.status, category_id: data.category_id, description: "" }).select().single();
      if (error) { setState(error.message); return; }
      onCatalogChange((items) => [{ id: row.id, slug: row.slug, name: row.name, price: row.price, description: row.description ?? "", category: categories.find((c) => c.id === row.category_id)?.name ?? "Sin categoría", category_id: row.category_id ?? null, inventory: row.inventory, status: row.status, tone: "light" as const }, ...items]);
      setState("Producto creado.");
    } else {
      onCatalogChange((items) => [{ id: String(Date.now()), slug, name: data.name, price: data.price, description: "", category, category_id: data.category_id, inventory: data.inventory, status: data.status, tone: "light" as const }, ...items]);
      setState("Producto creado (modo demostración).");
    }
    onCreatingChange(false);
  }
  async function addStock(product: AdminProduct, amount: number) {
    const client = createClient();
    if (client) {
      const { error } = await client.from("products").update({ inventory: product.inventory + amount }).eq("id", product.id);
      if (error) { setState(error.message); return; }
    }
    onCatalogChange((items) => items.map((p) => p.id === product.id ? { ...p, inventory: p.inventory + amount } : p));
    setState(client ? "Stock actualizado." : "Stock actualizado (modo demostración).");
    setStocking(null);
  }
  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-2xl">Inventario y catálogo</h2>
          <p className="text-sm text-[#647167]">{filtered.length} de {catalog.length} productos</p>
        </div>
        <div className="mb-5 grid gap-3 md:grid-cols-[40%_1fr_1fr_1fr_auto]">
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
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as "all" | "available" | "low" | "out")} className="rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm">
            <option value="all">Todo el stock</option>
            <option value="available">Disponible</option>
            <option value="low">Stock bajo (≤ 5)</option>
            <option value="out">Agotado</option>
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
              {sorted.map((product) => { const meta = statusMeta[product.status]; return (
                <tr key={product.id} className="border-b border-[#edf0e8]">
                  <td className="py-4"><strong>{product.name}</strong><span className="ml-2 text-xs text-[#748077]">/{product.slug}</span></td>
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
      {editing && <ProductEditor product={editing} categories={categories} onCancel={() => setEditing(null)} onSave={saveProduct}/>}
      {creating && <ProductEditor product={blankProduct} categories={categories} mode="create" onCancel={() => onCreatingChange(false)} onSave={createProduct}/>}
      {stocking && <StockModal product={stocking} onCancel={() => setStocking(null)} onAdd={(amount) => addStock(stocking, amount)}/>}
    </div>
  );
}
function ProductEditor({ product, categories, onCancel, onSave, mode = "edit" }: { product: AdminProduct; categories: { id: string; name: string }[]; onCancel: () => void; onSave: (data: { name: string; price: number; inventory: number; status: AdminProduct["status"]; category_id: string | null }) => void; mode?: "edit" | "create" }) {
  const isCreate = mode === "create";
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(String(product.price));
  const [inventory, setInventory] = useState(String(product.inventory));
  const [status, setStatus] = useState<AdminProduct["status"]>(product.status);
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  function submit(event: React.FormEvent) { event.preventDefault(); onSave({ name, price: Number(price), inventory: Number(inventory), status, category_id: categoryId || null }); }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white p-6">
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
            <span className="mb-1.5 block text-[#647167]">Estado</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as AdminProduct["status"])} className="w-full rounded-lg border border-[#d9ddd5] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#243128]">
              <option value="draft">Borrador</option>
              <option value="active">Activo</option>
              <option value="sold_out">Agotado</option>
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
