"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Store, Trash2, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAgenda, type AgendaSlot, type AgendaZone } from "@/lib/use-agenda";
import { WEEKDAY_LONG, WEEKDAY_ORDER, formatSlot, weekdayFromIso } from "@/lib/schedule";

/** Punto de retiro presencial tal como lo devuelve el panel (`active` siempre viene). */
export type ZoneRow = AgendaZone;
/** Franja horaria de un punto tal como la devuelve el panel (`enabled` siempre viene). */
export type SlotRow = AgendaSlot;

type ZoneDraft = { name: string; location: string };
type SlotDraft = { start_time: string; end_time: string; weekdays: number[] };

const EMPTY_ZONE: ZoneDraft = { name: "", location: "" };
const EMPTY_SLOT: SlotDraft = { start_time: "10:00", end_time: "13:00", weekdays: [] };
const FIELD = "rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]";
const BUTTON = "rounded-lg bg-[#243128] px-4 py-2 text-sm text-white";
const LINK_BUTTON = "rounded-lg border border-[#d9ddd5] px-4 py-2 text-sm transition hover:border-[#243128]";
const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-xs transition ${active ? "bg-[#243128] text-white" : "border border-[#d9ddd5] text-[#647167] hover:border-[#243128]"}`;

/** Días de la semana como chips (0 domingo … 6 sábado). */
function WeekdayChips({ value, onToggle }: { value: number[]; onToggle: (day: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_ORDER.map((day) => (
        <button key={day} type="button" onClick={() => onToggle(day)} className={chip(value.includes(day))}>{WEEKDAY_LONG[day]}</button>
      ))}
    </div>
  );
}

/** Horario y días de una franja (compartido entre crear y editar). */
function SlotFields({ draft, setDraft }: { draft: SlotDraft; setDraft: (value: SlotDraft) => void }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2">
        <span className="block text-sm"><span className="mb-1.5 block text-xs text-[#647167]">Hora de inicio</span><input type="time" aria-label="Hora de inicio" value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} className={`${FIELD} w-full`}/></span>
        <span className="block text-sm"><span className="mb-1.5 block text-xs text-[#647167]">Hora de término</span><input type="time" aria-label="Hora de término" value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} className={`${FIELD} w-full`}/></span>
      </div>
      <div className="mt-2">
        <p className="mb-1.5 text-xs text-[#647167]">Días en que se atiende esta franja</p>
        <WeekdayChips
          value={draft.weekdays}
          onToggle={(day) => setDraft({ ...draft, weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((item) => item !== day) : [...draft.weekdays, day] })}
        />
      </div>
    </>
  );
}

/** Hoy en `YYYY-MM-DD` (hora local), para bloquear al cerrar un día que ya pasó. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Contenedor común de los modales de la agenda (agregar punto y cerrar día). */
function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full overflow-auto rounded-xl bg-white p-6 ${wide ? "max-w-lg" : "max-w-sm"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Buscador de ubicación con el mapa de Google incrustado.
 *
 * La plantilla no tiene credenciales de Google Maps, así que se usa el embed público
 * (`output=embed`): se escribe la dirección —o un lugar, o «lat, lng»—, el mapa la muestra y se
 * confirma. Al aceptar, esa dirección queda en el campo del punto (y ahí siempre se puede corregir
 * a mano); «Abrir en Google Maps» sirve para afinar la búsqueda en una pestaña nueva.
 */
function LocationPicker({ initial, onClose, onSelect }: { initial: string; onClose: () => void; onSelect: (location: string) => void }) {
  const [query, setQuery] = useState(initial);
  // Lo que se ve en el mapa: solo cambia al buscar, no en cada tecla (el iframe se recargaría solo).
  const [searched, setSearched] = useState(initial.trim());
  const term = query.trim();
  function search() { if (term) setSearched(term); }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#243128]/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Buscar ubicación" className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="display text-2xl">Buscar ubicación</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
        </div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); search(); } }}
            placeholder="Dirección, lugar o «lat, lng»"
            aria-label="Ubicación a buscar"
            className={`${FIELD} min-w-0 flex-1`}
          />
          <button type="button" onClick={search} disabled={!term} className={`${BUTTON} shrink-0 disabled:opacity-40`}>Buscar</button>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-[#e2e5df] bg-[#f6f7f4]">
          {searched ? (
            <iframe title={`Mapa de ${searched}`} src={`https://www.google.com/maps?q=${encodeURIComponent(searched)}&z=16&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="h-64 w-full"/>
          ) : (
            <p className="grid h-64 place-items-center px-6 text-center text-sm text-[#647167]">Escribe una dirección o un lugar y presiona «Buscar» para verlo en el mapa.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-[#748077]">El mapa es una ayuda para confirmar la dirección: revisa que el punto marcado sea el correcto antes de guardarlo.</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(term || initial.trim())}`} target="_blank" rel="noreferrer" className="text-xs text-[#56745c] underline underline-offset-4">Abrir en Google Maps</a>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className={LINK_BUTTON}>Cancelar</button>
            <button type="button" onClick={() => onSelect(term)} disabled={!term} className={`${BUTTON} disabled:opacity-40`}>Usar esta ubicación</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Campo de ubicación de un punto: se escribe a mano o se busca con el mapa.
 *
 * El texto sigue siendo libre (una referencia como «frente a la plaza» es válida); el botón solo
 * abre el buscador de Google Maps para confirmar una dirección real.
 */
function LocationField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="block text-sm">
      <span className="mb-1.5 block text-[#647167]">Ubicación</span>
      <div className="flex gap-2">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Dirección o referencia" className={`${FIELD} min-w-0 flex-1`}/>
        <button type="button" onClick={() => setPicking(true)} aria-label="Buscar la ubicación en Google Maps" title="Buscar en Google Maps" className={`${LINK_BUTTON} inline-flex shrink-0 items-center gap-1.5`}>
          <MapPin size={14}/>Buscar
        </button>
      </div>
      {picking && <LocationPicker initial={value} onClose={() => setPicking(false)} onSelect={(location) => { onChange(location); setPicking(false); }}/>}
    </div>
  );
}

/**
 * Agenda del panel (D18): cada **punto de retiro presencial** vive con su **ubicación** y
 * sus **franjas horarias**, y cada franja declara los **días de la semana** en que se atiende.
 * La franja no tiene nombre: se nombra por su horario. Abajo quedan las **fechas cerradas**
 * puntuales (feriados, vacaciones).
 */
export function AgendaSection({ setState }: { setState: (value: string) => void }) {
  // Agenda compartida (`lib/use-agenda.ts`): los mismos puntos y franjas que pide el checkout, sin
  // respaldo offline a propósito, así que un fallo se avisa en vez de mostrar una agenda vieja (D20).
  const { zones, slots, closedDays: closed, stale, loading, reload } = useAgenda({ admin: true });
  const [zoneForm, setZoneForm] = useState<ZoneDraft>(EMPTY_ZONE);
  const [editZone, setEditZone] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>(EMPTY_ZONE);
  const [slotZone, setSlotZone] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft>(EMPTY_SLOT);
  const [editSlot, setEditSlot] = useState<string | null>(null);
  const [slotEditDraft, setSlotEditDraft] = useState<SlotDraft>(EMPTY_SLOT);
  const [closedForm, setClosedForm] = useState({ date: "" });
  // Los formularios de alta viven en un modal que abre el botón de la derecha del encabezado.
  const [creatingZone, setCreatingZone] = useState(false);
  const [creatingClosed, setCreatingClosed] = useState(false);

  useEffect(() => {
    if (!loading && stale) setState("No se pudo cargar la agenda.");
  }, [loading, stale, setState]);

  /** Ejecuta una mutación, recarga la agenda y reporta el resultado. */
  async function send(action: () => Promise<unknown>, ok: string, after?: () => void) {
    try {
      await action();
      after?.();
      await reload();
      setState(ok);
    } catch (error) {
      setState(error instanceof Error ? error.message : "No se pudo guardar el cambio.");
    }
  }

  function addZone(event: React.FormEvent) {
    event.preventDefault();
    if (!zoneForm.name.trim()) return;
    void send(
      async () => {
        const created = await apiFetch<ZoneRow>("/api/shipping-zones", { method: "POST", admin: true, body: { name: zoneForm.name.trim(), location: zoneForm.location.trim() || null } });
        setZoneForm(EMPTY_ZONE);
        // Un punto sin franjas no se puede agendar: se abre de inmediato el formulario.
        setSlotZone(created.id);
        setSlotDraft(EMPTY_SLOT);
      },
      "Punto agregado. Carga su primera franja horaria para que se pueda agendar.",
      () => setCreatingZone(false),
    );
  }

  function startEditingZone(zone: ZoneRow) {
    setEditZone(zone.id);
    setZoneDraft({ name: zone.name, location: zone.location ?? "" });
  }

  function saveZone(id: string) {
    if (!zoneDraft.name.trim()) { setState("El punto necesita un nombre."); return; }
    void send(
      () => apiFetch(`/api/shipping-zones/${id}`, { method: "PATCH", admin: true, body: { name: zoneDraft.name.trim(), location: zoneDraft.location.trim() || null } }),
      "Punto actualizado.",
      () => setEditZone(null),
    );
  }

  function toggleZone(zone: ZoneRow) {
    void send(() => apiFetch(`/api/shipping-zones/${zone.id}`, { method: "PATCH", admin: true, body: { active: !zone.active } }), zone.active ? "Punto desactivado: el checkout ya no lo ofrece." : "Punto activo.");
  }

  function deleteZone(zone: ZoneRow) {
    if (!window.confirm(`¿Eliminar «${zone.name}»? Se eliminarán también sus franjas horarias.`)) return;
    void send(() => apiFetch(`/api/shipping-zones/${zone.id}`, { method: "DELETE", admin: true }), "Punto eliminado.");
  }

  function addSlot(zoneId: string) {
    if (slotDraft.weekdays.length === 0) { setState("Elige al menos un día para la franja."); return; }
    void send(
      () => apiFetch("/api/time-slots", { method: "POST", admin: true, body: { zone_id: zoneId, start_time: slotDraft.start_time, end_time: slotDraft.end_time, weekdays: slotDraft.weekdays } }),
      "Franja agregada.",
      () => { setSlotZone(null); setSlotDraft(EMPTY_SLOT); },
    );
  }

  function saveSlot(id: string) {
    if (slotEditDraft.weekdays.length === 0) { setState("La franja necesita al menos un día."); return; }
    void send(
      () => apiFetch(`/api/time-slots/${id}`, { method: "PATCH", admin: true, body: { start_time: slotEditDraft.start_time, end_time: slotEditDraft.end_time, weekdays: slotEditDraft.weekdays } }),
      "Franja actualizada.",
      () => setEditSlot(null),
    );
  }

  function toggleSlot(slot: SlotRow) {
    void send(() => apiFetch(`/api/time-slots/${slot.id}`, { method: "PATCH", admin: true, body: { enabled: !slot.enabled } }), slot.enabled ? "Franja deshabilitada." : "Franja habilitada.");
  }

  function deleteSlot(slot: SlotRow) {
    void send(() => apiFetch(`/api/time-slots/${slot.id}`, { method: "DELETE", admin: true }), "Franja eliminada.");
  }

  function addClosed(event: React.FormEvent) {
    event.preventDefault();
    if (!closedForm.date) return;
    // El `min` del campo ya bloquea casi todo, pero una fecha escrita a mano no debe cerrar el pasado.
    if (closedForm.date < todayIso()) { setState("No se puede cerrar un día que ya pasó."); return; }
    void send(
      () => apiFetch("/api/closed-days", { method: "POST", admin: true, body: { date: closedForm.date } }),
      "Fecha cerrada guardada.",
      () => { setClosedForm({ date: "" }); setCreatingClosed(false); },
    );
  }

  function deleteClosed(id: string) {
    void send(() => apiFetch(`/api/closed-days/${id}`, { method: "DELETE", admin: true }), "Fecha reabierta.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-5">
        {/* El botón va centrado respecto del título y su descripción (como el de Productos): así queda
            entre el h2 y el p en vez de pegado a la esquina de arriba. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="display text-2xl">Puntos de retiro presencial</h2>
            <p className="mt-2 text-sm text-[#647167]">Cada punto tiene su <strong>ubicación</strong> y sus <strong>franjas horarias</strong>, y cada franja indica los <strong>días de la semana</strong> en que se atiende.</p>
          </div>
          <button type="button" onClick={() => { setZoneForm(EMPTY_ZONE); setCreatingZone(true); }} className={`${BUTTON} inline-flex shrink-0 items-center gap-2`}><Plus size={16}/>Agregar punto</button>
        </div>

        <div className="mt-5 space-y-4">
          {zones.map((zone) => {
            const zoneSlots = slots.filter((slot) => slot.zone_id === zone.id);
            return (
              <article key={zone.id} className="rounded-xl border border-[#e2e5df] p-4">
                {editZone === zone.id ? (
                  <div className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <label className="block text-sm">
                      <span className="mb-1.5 block text-[#647167]">Nombre</span>
                      <input required value={zoneDraft.name} onChange={(event) => setZoneDraft({ ...zoneDraft, name: event.target.value })} className={`${FIELD} w-full`}/>
                    </label>
                    <LocationField value={zoneDraft.location} onChange={(location) => setZoneDraft({ ...zoneDraft, location })}/>
                    <div className="flex gap-2">
                      <button onClick={() => saveZone(zone.id)} className={BUTTON}>Guardar</button>
                      <button onClick={() => setEditZone(null)} className={LINK_BUTTON}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium"><Store size={15} className="text-[#56745c]"/>{zone.name}{zoneSlots.length === 0 && <span className="rounded-full bg-[#f7ecd9] px-2.5 py-0.5 text-xs text-[#8a6a2f]">Sin horarios: no se puede agendar</span>}</p>
                      <p className="mt-1 flex items-start gap-1.5 text-xs text-[#647167]"><MapPin size={12} className="mt-0.5 shrink-0"/>{zone.location || "Sin ubicación definida"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={() => toggleZone(zone)} className={chip(zone.active)}>{zone.active ? "Activa" : "Inactiva"}</button>
                      <button onClick={() => startEditingZone(zone)} aria-label={`Editar ${zone.name}`} title="Editar punto" className="text-[#647167] hover:text-[#243128]"><Pencil size={15}/></button>
                      <button onClick={() => deleteZone(zone)} aria-label={`Eliminar ${zone.name}`} title="Eliminar punto" className="text-[#647167] hover:text-[#243128]"><Trash2 size={15}/></button>
                    </div>
                  </div>
                )}

                <div className="mt-4 border-t border-[#edf0e8] pt-3">
                  <p className="text-xs tracking-[.16em] text-[#748077] uppercase">Franjas horarias</p>
                  <div className="mt-1 divide-y divide-[#edf0e8]">
                    {zoneSlots.map((slot) => editSlot === slot.id ? (
                      <div key={slot.id} className="py-3">
                        <SlotFields draft={slotEditDraft} setDraft={setSlotEditDraft}/>
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => saveSlot(slot.id)} className={BUTTON}>Guardar franja</button>
                          <button onClick={() => setEditSlot(null)} className={LINK_BUTTON}>Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                        <span className="min-w-0 font-medium">{formatSlot(slot)}</span>
                        <span className="flex items-center gap-3">
                          <button onClick={() => toggleSlot(slot)} className={chip(slot.enabled)}>{slot.enabled ? "Habilitada" : "Deshabilitada"}</button>
                          <button onClick={() => { setEditSlot(slot.id); setSlotEditDraft({ start_time: slot.start_time, end_time: slot.end_time, weekdays: slot.weekdays }); }} aria-label={`Editar franja ${formatSlot(slot)}`} title="Editar franja" className="text-[#647167] hover:text-[#243128]"><Pencil size={14}/></button>
                          <button onClick={() => deleteSlot(slot)} aria-label={`Eliminar franja ${formatSlot(slot)}`} title="Eliminar franja" className="text-[#647167] hover:text-[#243128]"><Trash2 size={14}/></button>
                        </span>
                      </div>
                    ))}
                    {zoneSlots.length === 0 && <p className="py-2 text-xs text-[#8a6a2f]">Sin franjas todavía: este punto no aparece agendable en el checkout hasta que le agregues al menos una (con sus días y horario).</p>}
                  </div>

                  {slotZone === zone.id ? (
                    <div className="mt-3 rounded-lg bg-[#f6f7f4] p-3">
                      <SlotFields draft={slotDraft} setDraft={setSlotDraft}/>
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => addSlot(zone.id)} className={BUTTON}>Agregar franja</button>
                        <button onClick={() => { setSlotZone(null); setSlotDraft(EMPTY_SLOT); }} className={LINK_BUTTON}>Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setSlotZone(zone.id); setSlotDraft(EMPTY_SLOT); }} className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#56745c] underline underline-offset-4"><Plus size={13}/>Agregar franja horaria</button>
                  )}
                </div>
              </article>
            );
          })}
          {zones.length === 0 && <p className="py-3 text-sm text-[#647167]">Sin puntos configurados. Agrega el primero arriba (solo retiro presencial).</p>}
        </div>
      </section>

      <section className="rounded-xl bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="display text-2xl">Fechas cerradas</h2>
            <p className="mt-2 text-sm text-[#647167]">Dias excepcionales los cuales el retiro presencial esta desabilitado para la vista del cliente.</p>
          </div>
          <button type="button" onClick={() => { setClosedForm({ date: "" }); setCreatingClosed(true); }} className={`${BUTTON} inline-flex shrink-0 items-center gap-2`}><Plus size={16}/>Cerrar día</button>
        </div>
        <div className="mt-5 divide-y divide-[#edf0e8]">
          {closed.map((day) => (
            <div key={day.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-0 font-medium">{day.date}</span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-[#748077]">{WEEKDAY_LONG[weekdayFromIso(day.date)]}</span>
                <button onClick={() => deleteClosed(day.id)} aria-label={`Quitar ${day.date}`} title="Quitar cierre" className="text-[#647167] hover:text-[#243128]"><Trash2 size={14}/></button>
              </span>
            </div>
          ))}
          {closed.length === 0 && <p className="py-2 text-xs text-[#748077]">Sin fechas cerradas.</p>}
        </div>
      </section>

      {creatingZone && (
        <Modal title="Agregar punto" wide onClose={() => setCreatingZone(false)}>
          <form onSubmit={addZone} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Nombre</span>
              <input required autoFocus value={zoneForm.name} onChange={(event) => setZoneForm({ ...zoneForm, name: event.target.value })} placeholder="Retiro San Javier" className={`${FIELD} w-full`}/>
            </label>
            <LocationField value={zoneForm.location} onChange={(location) => setZoneForm({ ...zoneForm, location })}/>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setCreatingZone(false)} className={LINK_BUTTON}>Cancelar</button>
              <button className={BUTTON}>Agregar punto</button>
            </div>
          </form>
        </Modal>
      )}

      {creatingClosed && (
        <Modal title="Cerrar día" onClose={() => setCreatingClosed(false)}>
          <form onSubmit={addClosed} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1.5 block text-[#647167]">Fecha a cerrar</span>
              <input required autoFocus type="date" min={todayIso()} value={closedForm.date} onChange={(event) => setClosedForm({ ...closedForm, date: event.target.value })} className={`${FIELD} w-full`}/>
            </label>
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setCreatingClosed(false)} className={LINK_BUTTON}>Cancelar</button>
              <button className={BUTTON}>Cerrar día</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
