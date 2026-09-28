import type { ReactNode } from "react";
import type { Package } from "lucide-react";

/**
 * Tarjeta de métrica del panel. Estaba copiada en `admin-dashboard.tsx` (Inicio) y `admin-reports.tsx`;
 * `hint` es el detalle extra que solo usan los reportes, así que es opcional.
 */
export function Metric({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon: typeof Package;
}) {
  return (
    <div className="rounded-xl bg-white p-5">
      <div className="flex items-center justify-between text-[#647167]"><span className="text-sm">{label}</span><Icon size={18}/></div>
      <p className="display mt-3 text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-[#748077]">{hint}</p>}
    </div>
  );
}
