"use client";

import { X } from "lucide-react";

/**
 * Ventana modal compartida por el panel: fondo oscurecido, tarjeta blanca centrada y encabezado con
 * título y botón de cierre.
 *
 * Ese armazón estaba copiado en cada modal del panel (producto, stock, pedido, categorías, agenda y el
 * diálogo de confirmación); acá vive una sola vez, así el resto de los modales solo aporta su contenido.
 *
 * `onSubmit` hace que el contenedor sea un `<form>`, para los modales que guardan datos; sin él es un
 * `<div>`. `size` fija el ancho máximo y `z` permite que el diálogo de confirmación quede por encima de
 * otros modales abiertos.
 */
const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" } as const;

export function Modal({
  title,
  onClose,
  children,
  size = "sm",
  role = "dialog",
  z = "z-50",
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  role?: "dialog" | "alertdialog";
  z?: string;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
}) {
  const cardClass = `max-h-[90vh] w-full ${SIZES[size]} overflow-auto rounded-xl bg-white p-6`;
  const header = (
    <div className="mb-5 flex items-center justify-between">
      <h2 className="display text-2xl">{title}</h2>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="text-[#647167] hover:text-[#243128]"><X size={18}/></button>
    </div>
  );
  return (
    <div className={`fixed inset-0 ${z} grid place-items-center bg-[#243128]/40 p-4`}>
      {onSubmit ? (
        <form role={role} aria-modal="true" aria-label={title} onSubmit={onSubmit} className={cardClass}>{header}{children}</form>
      ) : (
        <div role={role} aria-modal="true" aria-label={title} className={cardClass}>{header}{children}</div>
      )}
    </div>
  );
}
