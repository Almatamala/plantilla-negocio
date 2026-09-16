"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { zoneTypeOf, type Slot, type Zone } from "@/lib/agenda";
import { WEEKDAY_LONG, WEEKDAY_ORDER, formatSlot, weekdayFromIso } from "@/lib/schedule";

/** Punto de retiro o encuentro tal como lo devuelve el panel (`active` siempre viene). */
export type ZoneRow = Zone & { active: boolean };
/** Franja horaria de un punto tal como la devuelve el panel (`enabled` siempre viene). */
export type SlotRow = Slot & { enabled: boolean };
/** Fecha cerrada puntual. */
type ClosedDayRow = { id: string; date: string; reason: string | null };
/** Día de la semana cerrado todas las semanas (D19). */
type ClosedWeekdayRow = { id: string; weekday: number; reason: string | null };

const zoneTypeLabel: Record<ZoneRow["type"], string> = { retiro: "Retiro presencial", encuentro: "Punto de encuentro" };

type ZoneDraft = { name: string; type: ZoneRow["type"]; location: string };
type SlotDraft = { label: string; start_time: string; end_time: string; weekdays: number[] };

const EMPTY_ZONE: ZoneDraft = { name: "", type: "retiro", location: "" };
const EMPTY_SLOT: SlotDraft = { label: "", start_time: "10:00", end_time: "13:00", weekdays: [] };
const FIELD = "rounded-lg border border-[#d9ddd5] px-3 py-2 text-sm outline-none focus:border-[#243128]";
const BUTTON = "rounded-lg bg-[#243128] px-4 py-2 text-sm text-white";
const LINK_BUTTON = "rounded-lg border border-[#d9ddd5] px-4 py-2 text-sm transition hover:border-[#243128]";
const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-xs transition ${active ? "bg-[#243128] text-white" : "border border-[#d9ddd5] text-[#647167] hover:border-[#243128]"}`;
const zoneAccent = (type: ZoneRow["type"]) => (type === "encuentro" ? "bg-[#e2f0e2] text-[#3c6b3f]" : "bg-[#e4e9f5] text-[#3d5384]");

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

/** Nombre, horario y días de una franja (compartido entre crear y editar). */
function SlotFields({ draft, setDraft }: { draft: SlotDraft; setDraft: (value: SlotDraft) => void }) {
  return (
    <>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Nombre (ej. Tarde)" className={FIELD}/>
        <input type="time" aria-label="Hora de inicio" value={draft.start_time} onChange={(event) => setDraft({ ...draft, start_time: event.target.value })} className={FIELD}/>
        <input type="time" aria-label="Hora de término" value={draft.end_time} onChange={(event) => setDraft({ ...draft, end_time: event.target.value })} className={FIELD}/>
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

/**
 * Agenda del panel (D18 / D19): cada **punto de retiro o encuentro** vive con su **ubicación** y
 * sus **franjas horarias**, y cada franja declara los **días de la semana** en que se atiende.
 * Abajo, los cierres: **todas las semanas** (p. ej. el lunes de producción) y **fechas puntuales**.
 */
export function AgendaSection({ setState }: { setState: (value: string) => void }) {
  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [closed, setClosed] = useState<ClosedDayRow[]>([]);
  const [closedWeekdays, setClosedWeekdays] = useState<ClosedWeekdayRow[]>([]);
  const [zoneForm, setZoneForm] = useState<ZoneDraft>(EMPTY_ZONE);
  const [editZone, setEditZone] = useState<string | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneDraft>(EMPTY_ZONE);
  const [slotZone, setSlotZone] = useState<string | null>(null);
  const [slotDraft, setSlotDraft] = useState<SlotDraft>(EMPTY_SLOT);
  const [editSlot, setEditSlot] = useState<string | null>(null);
  const [slotEditDraft, setSlotEditDraft] = useState<SlotDraft>(EMPTY_SLOT);
  const [closedForm, setClosedForm] = useState({ date: "", reason: "" });

  const reload = useCallback(async () => {
    const [zoneRows, slotRows, closedRows, weekdayRows] = await Promise.all([
      apiFetch<ZoneRow[]>("/api/shipping-zones?include_inactive=true", { admin: true }),
      apiFetch<SlotRow[]>("/api/time-slots?include_disabled=true", { admin: true }),
      apiFetch<ClosedDayRow[]>("/api/closed-days"),
      apiFetch<ClosedWeekdayRow[]>("/api/closed-weekdays"),
    ]);
    setZones(zoneRows);
    setSlots(slotRows);
    setClosed(closedRows);
    setClosedWeekdays(weekdayRows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await reload();
      } catch {
        if (!cancelled) setState("No se pudo cargar la agenda.");
      }
    })();
    return () => { cancelled = true; };
  }, [reload, setState]);

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
        const created = await apiFetch<ZoneRow>("/api/shipping-zones", { method: "POST", admin: true, body: { name: zoneForm.name.trim(), type: zoneForm.type, location: zoneForm.location.trim() || null } });
        setZoneForm(EMPTY_ZONE);
        // Un punto sin franjas no se puede agendar: se abre de inmediato el formulario.
        setSlotZone(created.id);
        setSlotDraft(EMPTY_SLOT);
      },
      "Punto agregado. Carga su primera franja horaria para que se pueda agendar.",
    );
  }

  function startEditingZone(zone: ZoneRow) {
    setEditZone(zone.id);
    setZoneDraft({ name: zone.name, type: zone.type, location: zone.location ?? "" });
  }

  function saveZone(id: string) {
    if (!zoneDraft.name.trim()) { setState("El punto necesita un nombre."); return; }
    void send(
      () => apiFetch(`/api/shipping-zones/${id}`, { method: "PATCH", admin: true, body: { name: zoneDraft.name.trim(), type: zoneDraft.type, location: zoneDraft.location.trim() || null } }),
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
    if (!slotDraft.label.trim() || slotDraft.weekdays.length === 0) { setState("Ponle un nombre a la franja y elige al menos un día."); return; }
    void send(
      () => apiFetch("/api/time-slots", { method: "POST", admin: true, body: { zone_id: zoneId, label: slotDraft.label.trim(), start_time: slotDraft.start_time, end_time: slotDraft.end_time, weekdays: slotDraft.weekdays } }),
      "Franja agregada.",
      () => { setSlotZone(null); setSlotDraft(EMPTY_SLOT); },
    );
  }

  function saveSlot(id: string) {
    if (!slotEditDraft.label.trim() || slotEditDraft.weekdays.length === 0) { setState("La franja necesita un nombre y al menos un día."); return; }
    void send(
      () => apiFetch(`/api/time-slots/${id}`, { method: "PATCH", admin: true, body: { label: slotEditDraft.label.trim(), start_time: slotEditDraft.start_time, end_time: slotEditDraft.end_time, weekdays: slotEditDraft.weekdays } }),
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

  function toggleWeekday(day: number) {
    const existing = closedWeekdays.find((row) => row.weekday === day);
    void send(
      () => existing
        ? apiFetch(`/api/closed-weekdays/${existing.id}`, { method: "DELETE", admin: true })
        : apiFetch("/api/closed-weekdays", { method: "POST", admin: true, body: { weekday: day } }),
      existing ? `${WEEKDAY_LONG[day]}: vuelve a estar disponible.` : `${WEEKDAY_LONG[day]} cerrado todas las semanas.`,
    );
  }

  function addClosed(event: React.FormEvent) {
    event.preventDefault();
    if (!closedForm.date) return;
    void send(
      () => apiFetch("/api/closed-days", { method: "POST", admin: true, body: { date: closedForm.date, reason: closedForm.reason.trim() || null } }),
      "Fecha cerrada guardada.",
      () => setClosedForm({ date: "", reason: "" }),
    );
  }

  function deleteClosed(id: string) {
    void send(() => apiFetch(`/api/closed-days/${id}`, { method: "DELETE", admin: true }), "Fecha reabierta.");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl bg-white p-5">
        <h2 className="display text-2xl">Puntos de retiro y encuentro</h2>
        <p className="mt-2 text-sm text-[#647167]">No hay despacho a domicilio: el cliente elige un punto y ahí se agenda. Cada punto tiene su <strong>ubicación</strong> y sus <strong>franjas horarias</strong>, y cada franja indica los <strong>días de la semana</strong> en que se atiende (una franja que solo corre los sábados no se puede agendar un miércoles).</p>
        <form onSubmit={addZone} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
          <input required value={zoneForm.name} onChange={(event) => setZoneForm({ ...zoneForm, name: event.target.value })} placeholder="Nombre (ej. Punto de encuentro Talca)" className={FIELD}/>
          <select value={zoneForm.type} onChange={(event) => setZoneForm({ ...zoneForm, type: event.target.value as ZoneRow["type"] })} className={`${FIELD} select-field bg-white transition hover:border-[#243128]`}>
            <option value="retiro">Retiro presencial</option>
            <option value="encuentro">Punto de encuentro</option>
          </select>
          <input value={zoneForm.location} onChange={(event) => setZoneForm({ ...zoneForm, location: event.target.value })} placeholder="Ubicación (dirección o referencia)" className={FIELD}/>
          <button className={BUTTON}>Agregar punto</button>
        </form>

        <div className="mt-5 space-y-4">
          {zones.map((zone) => {
            const Icon = zone.type === "encuentro" ? MapPin : Store;
            const zoneSlots = slots.filter((slot) => slot.zone_id === zone.id);
            return (
              <article key={zone.id} className="rounded-xl border border-[#e2e5df] p-4">
                {editZone === zone.id ? (
                  <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr_auto]">
                    <input required value={zoneDraft.name} onChange={(event) => setZoneDraft({ ...zoneDraft, name: event.target.value })} className={FIELD}/>
                    <select value={zoneDraft.type} onChange={(event) => setZoneDraft({ ...zoneDraft, type: event.target.value as ZoneRow["type"] })} className={`${FIELD} select-field bg-white transition hover:border-[#243128]`}>
                      <option value="retiro">Retiro presencial</option>
                      <option value="encuentro">Punto de encuentro</option>
                    </select>
                    <input value={zoneDraft.location} onChange={(event) => setZoneDraft({ ...zoneDraft, location: event.target.value })} placeholder="Ubicación" className={FIELD}/>
                    <div className="flex gap-2">
                      <button onClick={() => saveZone(zone.id)} className={BUTTON}>Guardar</button>
                      <button onClick={() => setEditZone(null)} className={LINK_BUTTON}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium"><Icon size={15} className="text-[#56745c]"/>{zone.name}<span className={`rounded-full px-2.5 py-0.5 text-xs ${zoneAccent(zone.type)}`}>{zoneTypeLabel[zoneTypeOf(zone.type)]}</span>{zoneSlots.length === 0 && <span className="rounded-full bg-[#f7ecd9] px-2.5 py-0.5 text-xs text-[#8a6a2f]">Sin horarios: no se puede agendar</span>}</p>
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
                        <span className="min-w-0"><span className="font-medium">{slot.label}</span> <span className="text-[#647167]">{formatSlot(slot)}</span></span>
                        <span className="flex items-center gap-3">
                          <button onClick={() => toggleSlot(slot)} className={chip(slot.enabled)}>{slot.enabled ? "Habilitada" : "Deshabilitada"}</button>
                          <button onClick={() => { setEditSlot(slot.id); setSlotEditDraft({ label: slot.label, start_time: slot.start_time, end_time: slot.end_time, weekdays: slot.weekdays }); }} aria-label={`Editar franja ${slot.label}`} title="Editar franja" className="text-[#647167] hover:text-[#243128]"><Pencil size={14}/></button>
                          <button onClick={() => deleteSlot(slot)} aria-label={`Eliminar franja ${slot.label}`} title="Eliminar franja" className="text-[#647167] hover:text-[#243128]"><Trash2 size={14}/></button>
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
          {zones.length === 0 && <p className="py-3 text-sm text-[#647167]">Sin puntos configurados. Agrega el primero arriba (retiro presencial o punto de encuentro).</p>}
        </div>
      </section>

      <section className="rounded-xl bg-white p-5">
        <h2 className="display text-2xl">Días cerrados</h2>
        <p className="mt-2 text-sm text-[#647167]">Los cierres se aplican al agendar: esos días no aparecen disponibles en el checkout.</p>

        <div className="mt-4">
          <p className="text-sm font-medium">Todas las semanas</p>
          <p className="mt-1 text-xs text-[#647167]">Marca los días que no se atiende nunca. Por ejemplo el <strong>lunes</strong>, si es día de solo producción: queda cerrado automáticamente en todas las semanas, sin cargar fechas a mano.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WEEKDAY_ORDER.map((day) => {
              const row = closedWeekdays.find((item) => item.weekday === day);
              return <button key={day} onClick={() => toggleWeekday(day)} title={row?.reason ?? "Disponible"} className={chip(Boolean(row))}>{WEEKDAY_LONG[day]}</button>;
            })}
          </div>
        </div>

        <div className="mt-6 border-t border-[#edf0e8] pt-4">
          <p className="text-sm font-medium">Fechas puntuales</p>
          <p className="mt-1 text-xs text-[#647167]">Feriados, vacaciones o días con producción especial.</p>
          <form onSubmit={addClosed} className="mt-2 grid gap-2 md:grid-cols-[auto_1fr_auto]">
            <input required type="date" value={closedForm.date} onChange={(event) => setClosedForm({ ...closedForm, date: event.target.value })} className={FIELD}/>
            <input value={closedForm.reason} onChange={(event) => setClosedForm({ ...closedForm, reason: event.target.value })} placeholder="Motivo (opcional)" className={FIELD}/>
            <button className={BUTTON}>Cerrar día</button>
          </form>
          <div className="mt-3 divide-y divide-[#edf0e8]">
            {closed.map((day) => (
              <div key={day.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0"><span className="font-medium">{day.date}</span> <span className="text-[#647167]">{day.reason ?? ""}</span></span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-[#748077]">{WEEKDAY_LONG[weekdayFromIso(day.date)]}</span>
                  <button onClick={() => deleteClosed(day.id)} aria-label={`Quitar ${day.date}`} title="Quitar cierre" className="text-[#647167] hover:text-[#243128]"><Trash2 size={14}/></button>
                </span>
              </div>
            ))}
            {closed.length === 0 && <p className="py-2 text-xs text-[#748077]">Sin fechas cerradas.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
