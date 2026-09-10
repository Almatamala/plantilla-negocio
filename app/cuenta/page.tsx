"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Package } from "lucide-react";
import { apiFetch, clearAdminToken, clearSessionTokenCache } from "@/lib/api";
import { formatPrice } from "@/lib/products";
import { storeConfig } from "@/lib/store-config";

type MeUser = { id: string; name: string | null; phone: string | null; email: string; role: string };
type MyOrder = {
  id: string;
  status: string;
  total: number;
  payment_method: string | null;
  scheduled_date: string | null;
  time_slot_label: string | null;
  shipping_zone_name: string | null;
  fulfillment: string | null;
  items: { name: string; unit_price: number; quantity: number }[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", paid: "Pagado", preparing: "Preparando",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Cancelado",
};

export default function CuentaPage() {
  const router = useRouter();
  const [user, setUser] = useState<MeUser | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user) { router.replace("/login"); return; }
        setUser(data.user);
        setName(data.user.name ?? "");
        setPhone(data.user.phone ?? "");
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

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
      await apiFetch<MeUser>("/api/auth/me", { method: "PATCH", admin: true, body: { name, phone } });
      setMessage("Datos guardados. Se usarán para llenar tu próximo pedido.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron guardar los datos.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSessionTokenCache();
    clearAdminToken();
    router.push("/");
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#faf7f0] text-[#243128]"><p className="text-sm text-[#647167]">Cargando…</p></main>;
  }

  return (
    <main className="min-h-screen bg-[#faf7f0] text-[#243128]">
      <div className="mx-auto max-w-4xl px-5 py-8 md:px-10">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#647167] hover:text-[#243128]"><ArrowLeft size={15}/>Volver a la tienda</Link>
        <h1 className="display mt-6 text-4xl md:text-5xl">Mi cuenta</h1>
        <p className="mt-3 text-[#526058]">Mantén tus datos actualizados para agendar pedidos más rápido.</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="rounded-2xl bg-white p-6">
            <h2 className="display text-2xl">Tus datos</h2>
            <form onSubmit={save} className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-[#647167]">Nombre</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block text-[#647167]">Teléfono (WhatsApp) — se completa solo en el checkout</span>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+569…" className="w-full rounded-lg border border-[#d9ddd5] px-3 py-2.5 text-sm outline-none focus:border-[#243128]"/>
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
                        {order.fulfillment ? ` · ${order.fulfillment === "domicilio" ? "A domicilio" : "Retiro"}` : ""}
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
        <p className="mt-8 text-center text-xs text-[#748077]">{storeConfig.name}</p>
      </div>
    </main>
  );
}