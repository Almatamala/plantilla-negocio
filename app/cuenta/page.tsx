"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Package } from "lucide-react";
import { apiFetch, endSession } from "@/lib/api";
import { useSession } from "@/lib/account";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/products";
import { refreshSession } from "@/lib/session-client";
import { useStoreSettings } from "@/lib/use-store-settings";
import { themeVars } from "@/lib/theme";
import { StoreFooter, StoreHeader } from "@/components/store-shell";
import { WhatsAppButton } from "@/components/whatsapp-button";

type MyOrder = {
  id: string;
  status: string;
  total: number;
  payment_method: string | null;
  scheduled_date: string | null;
  time_slot_label: string | null;
  shipping_zone_name: string | null;
  items: { name: string; unit_price: number; quantity: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", paid: "Pagado", preparing: "Preparando",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Cancelado",
};

export default function CuentaPage() {
  const router = useRouter();
  const session = useSession();
  const user = session.user;
  const { count } = useCart();
  const config = useStoreSettings();
  /** Lo que el cliente editó en el formulario; lo demás se toma de su sesión. */
  const [edits, setEdits] = useState<{ name?: string; phone?: string }>({});
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // Sin sesión (ya resuelta) no hay nada que mostrar acá: se va al login.
  useEffect(() => {
    if (session.status === "ready" && !session.user) router.replace("/login");
  }, [router, session.status, session.user]);

  // Los campos se derivan de la sesión hasta que el cliente los edita (sin efecto intermedio).
  const name = edits.name ?? user?.name ?? "";
  const phone = edits.phone ?? user?.phone ?? "";

  useEffect(() => {
    if (!user) return;
    apiFetch<MyOrder[]>("/api/orders/me", { admin: true })
      .then(setOrders)
      .catch(() => undefined);
  }, [user]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setSaving(true);
    try {
      await apiFetch("/api/auth/me", { method: "PATCH", admin: true, body: { name, phone } });
      // Los datos cambiaron: el checkout y el resto de las pantallas deben verlos.
      void refreshSession();
      setMessage("Datos guardados. Se usarán para llenar tu próximo pedido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron guardar los datos.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await endSession();
    router.push("/");
  }

  return (
    // La cuenta conserva la identidad anterior en su contenido y en el header, pero su footer es el
    // mismo pie cálido de la tienda: por eso acá solo se publica la paleta editable (D29), que el
    // footer hereda.
    <main className="min-h-screen bg-[#faf7f0] text-[#243128]" style={themeVars(config.theme_colors)}>
      <StoreHeader config={config} cartCount={count}/>
      <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
        <p className="text-xs tracking-[.18em] text-[#56745c] uppercase">Tu cuenta</p>
        <h1 className="display mt-2 text-4xl md:text-5xl">Mi cuenta</h1>
        <p className="mt-3 text-[#526058]">Mantén tus datos actualizados para agendar pedidos más rápido.</p>

        {session.status === "loading" ? (
          <p className="mt-10 text-sm text-[#647167]">Cargando…</p>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl bg-white p-6">
              <h2 className="display text-2xl">Tus datos</h2>
              <form onSubmit={save} className="mt-4 space-y-4">
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[#647167]">Nombre</span>
                  <input value={name} onChange={(e) => setEdits((current) => ({ ...current, name: e.target.value }))} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[#647167]">Teléfono (WhatsApp) — se completa solo en el checkout</span>
                  <input type="tel" value={phone} onChange={(e) => setEdits((current) => ({ ...current, phone: e.target.value }))} placeholder="+569…" className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
                </label>
                <label className="block text-sm">
                  <span className="mb-1.5 block text-[#647167]">Correo</span>
                  <input value={user?.email ?? ""} disabled className="w-full rounded-lg border border-[#e2e5df] bg-[#f5f6f2] px-3 py-2.5 text-sm text-[#748077]"/>
                </label>
                <button disabled={saving} className="rounded-full bg-[#243128] px-6 py-2.5 text-sm text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar cambios"}</button>
                {message && <p className="rounded-lg bg-[#edf0e8] p-3 text-sm">{message}</p>}
              </form>
              <button onClick={logout} className="mt-6 inline-flex items-center gap-2 text-sm text-[#8a4a44] underline underline-offset-4"><LogOut size={15}/>Cerrar sesión</button>
            </section>

            <section className="rounded-2xl bg-white p-6">
              <h2 className="display text-2xl">Tus pedidos</h2>
              {orders.length === 0 ? (
                <p className="mt-4 text-sm text-[#647167]">Todavía no tienes pedidos. <Link href="/#coleccion" className="underline underline-offset-2">Ver productos</Link></p>
              ) : (
                <div className="mt-4 divide-y divide-[#edf0e8]">
                  {orders.map((order) => (
                    <div key={order.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="flex items-center gap-2 font-medium"><Package size={14} className="text-[#56745c]"/>{order.id.slice(0, 8).toUpperCase()}</p>
                        <p className="mt-0.5 text-xs text-[#748077]">
                          {order.scheduled_date ? `${order.scheduled_date}${order.time_slot_label ? ` · ${order.time_slot_label}` : ""}` : "Sin fecha agendada"}
                          {" · Retiro presencial"}
                          {order.payment_method ? ` · ${order.payment_method}` : ""}
                        </p>
                        <p className="mt-0.5 text-xs text-[#748077]">{order.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <p className="font-medium">{formatPrice(order.total)}</p>
                        <span className="mt-1 inline-block rounded-full bg-[#edf0e8] px-2 py-0.5 text-xs text-[#647167]">{STATUS_LABEL[order.status] ?? order.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
      <StoreFooter config={config}/>
      <WhatsAppButton phone={config.whatsapp_phone}/>
    </main>
  );
}
