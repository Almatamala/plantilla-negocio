"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { loadSettings, type RawSettings } from "@/lib/use-store-settings";
import { ContentEditProvider, editableFields, type EditableField } from "@/components/editable-content";
import { Storefront } from "@/components/storefront";
import type { Product } from "@/lib/products";

/**
 * Editor visual de la página (`/admin/editor`, D38): muestra el storefront real y permite hacer clic en
 * los textos que viven en `store_settings` para cambiarlos, y cambiar la **foto del hero** con el botón que
 * aparece encima de ella (D48). Los cambios se confirman con un botón («Guardar cambios») y se envían juntos
 * en `PUT /api/settings`; el contacto y los colores siguen en la sección **Contenido** del panel.
 */
export function StorefrontEditor({ products }: { products: Product[] }) {
  const [base, setBase] = useState<RawSettings | null>(null);
  const [draft, setDraft] = useState<Partial<Record<EditableField, string>>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Los ajustes se leen con la lectura **compartida** (`loadSettings`): la tienda que este editor dibuja
  // adentro usa la misma, así que la página hace **una** petición a `/api/settings` y no dos. Se lee el
  // objeto completo (no con `useStoreSettings`) para poder mandarlo tal cual al guardar.
  useEffect(() => {
    void loadSettings().then(({ value }) => {
      if (value) setBase(value);
      else setMessage("No se pudieron cargar los textos. Revisa la conexión con la API.");
    });
  }, []);

  function set(field: EditableField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!base) return;
    setSaving(true);
    setMessage("");
    try {
      // La API reemplaza todos los ajustes, así que se manda la base completa más los textos editados.
      // `id` y `updated_at` son de salida y con `extra="forbid"` no se pueden enviar.
      const { id, updated_at, ...rest } = base;
      void id;
      void updated_at;
      const payload: Record<string, unknown> = { ...rest };
      for (const field of editableFields) {
        if (draft[field] !== undefined) payload[field] = draft[field];
      }
      const saved = await apiFetch<RawSettings>("/api/settings", { method: "PUT", admin: true, body: payload });
      setBase(saved);
      setDirty(false);
      setMessage("Cambios guardados. La tienda los muestra al refrescar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ContentEditProvider draft={draft} set={set} notify={setMessage}>
        {/* `pb-24` deja aire abajo para que la barra fija no tape el pie de la tienda. */}
        <div className="pb-24"><Storefront products={products}/></div>
      </ContentEditProvider>
      {/* Velo oscuro del modo edición (D38): la tienda se ve apagada y los textos editables (`EditableText`)
          quedan por encima con su **borde blanco**. `pointer-events-none` deja pasar los clics. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-40 bg-[#0d1710]/60"/>
      <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-[#d9ddd5] bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(36,49,40,.08)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#647167]">{message || "Haz clic en cualquier texto resaltado para cambiarlo"}</p>
          <div className="flex items-center gap-3">
            <Link href="/admin" className="rounded-lg border border-[#d9ddd5] px-4 py-2 text-sm transition hover:border-[#243128]">Volver al panel</Link>
            <button onClick={save} disabled={!dirty || saving || !base} className="rounded-lg bg-[#243128] px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40">
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
