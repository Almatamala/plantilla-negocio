"use client";

import { Modal } from "@/components/modal";

/**
 * Modal de confirmación para **borrar**.
 *
 * Toda acción destructiva del panel (y la papelera de un admin en la ficha) pasa por acá en vez de
 * `window.confirm`, que se ve como una alerta del navegador y no se puede estilar. El armazón es el
 * `Modal` compartido; acá solo vive el mensaje y los dos botones. Quien lo usa lo renderiza solo cuando
 * hay algo pendiente por borrar y cierra el estado en `onCancel`/`onConfirm`.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Eliminar",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} role="alertdialog" z="z-[60]" size="sm">
      <p className="text-sm leading-6 text-[#647167]">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="rounded-lg border border-[#d9ddd5] px-4 py-2.5 text-sm hover:border-[#243128]">Cancelar</button>
        <button type="button" onClick={onConfirm} className="rounded-lg bg-[#8a4a44] px-4 py-2.5 text-sm text-white">{confirmLabel}</button>
      </div>
    </Modal>
  );
}
