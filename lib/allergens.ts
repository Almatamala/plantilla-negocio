export type AllergenCode = "gluten" | "lacteos" | "frutos-secos" | "huevo" | "mani" | "soja" | "sesamo";

export const ALLERGENS: Record<AllergenCode, { label: string; icon: string }> = {
  gluten: { label: "Gluten", icon: "🌾" },
  lacteos: { label: "Lácteos", icon: "🥛" },
  "frutos-secos": { label: "Frutos secos", icon: "🥜" },
  huevo: { label: "Huevo", icon: "🥚" },
  mani: { label: "Maní", icon: "🫘" },
  soja: { label: "Soja", icon: "🌱" },
  sesamo: { label: "Sésamo", icon: "🌰" },
};

export function allergenInfo(code: string): { label: string; icon: string } | null {
  return ALLERGENS[code as AllergenCode] ?? null;
}