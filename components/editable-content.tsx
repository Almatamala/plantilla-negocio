"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

/**
 * Modo edición del admin (`/admin/editor`).
 *
 * La tienda pública no cambia: `EditableText` se comporta como texto normal mientras no haya un
 * `ContentEditProvider` arriba. En la ruta del editor, el provider guarda un borrador y cada texto se
 * vuelve editable al hacer clic; el botón «Guardar cambios» (en `StorefrontEditor`) es el que persiste
 * todo de una vez en `PUT /api/settings`.
 *
 * Solo entran los textos que **ya viven en `store_settings`** (D38): el resto de los textos de la
 * vitrina —«Catálogo», «Productos destacados», las tarjetas de beneficios— siguen fijos en el código.
 */
export type EditableField =
  | "name"
  | "announcement"
  | "hero_title"
  | "hero_description"
  | "story_headline"
  | "story_description";

export const editableFields: EditableField[] = [
  "name",
  "announcement",
  "hero_title",
  "hero_description",
  "story_headline",
  "story_description",
];

type ContentEditContextValue = {
  /** Valores cambiados en esta sesión de edición, por campo. Lo que falte sale del valor que se muestra. */
  draft: Partial<Record<EditableField, string>>;
  set: (field: EditableField, value: string) => void;
};

const ContentEditContext = createContext<ContentEditContextValue | null>(null);

export function ContentEditProvider({
  draft,
  set,
  children,
}: {
  draft: Partial<Record<EditableField, string>>;
  set: (field: EditableField, value: string) => void;
  children: ReactNode;
}) {
  return <ContentEditContext.Provider value={{ draft, set }}>{children}</ContentEditContext.Provider>;
}

/** `null` fuera del editor, que es lo que usa `EditableText` para saber si debe permitir editar. */
export function useContentEdit(): ContentEditContextValue | null {
  return useContext(ContentEditContext);
}

type EditableTag = "span" | "p" | "h1" | "h2" | "h3";

/** Props del texto; agrega el `ref` (que `HTMLAttributes` no trae) para poder enfocar el nodo editado. */
type EditableProps = React.HTMLAttributes<HTMLElement> & { ref?: React.RefCallback<HTMLElement> };

/**
 * Texto que se vuelve editable con un clic cuando hay `ContentEditProvider` arriba (D38).
 *
 * Al hacer clic, **el mismo elemento** pasa a `contentEditable`: no se cambia por un `<input>` ni por un
 * `<textarea>`, así el texto mantiene la fuente, el tamaño y la posición que tiene en la página (A50) y no
 * se mueve nada de lo que está alrededor. Se guarda en el borrador al salir del campo (o con Enter) y
 * Escape cancela. Si el campo está vacío se muestra el `placeholder` (que nunca se guarda).
 */
export function EditableText({
  field,
  value,
  as = "span",
  className,
  placeholder = "Escribe un texto…",
}: {
  field: EditableField;
  value: string;
  as?: EditableTag;
  className?: string;
  placeholder?: string;
}) {
  const context = useContentEdit();
  const [editing, setEditing] = useState(false);
  // Punto exacto del clic: al entrar en edición se deja el cursor ahí, sin seleccionar todo el texto (A51).
  const [caret, setCaret] = useState<{ x: number; y: number } | null>(null);

  /**
   * React llama a este `ref` al entrar en edición: se enfoca el propio texto y se deja el **cursor justo
   * donde se hizo clic**. La identidad depende del punto del clic, así el `ref` se vuelve a llamar al
   * entrar en edición (y no en cada render).
   */
  const focusNode = useCallback((element: HTMLElement | null) => {
    if (!element) return;
    const place = (node: HTMLElement) => {
      if (!node.isConnected) return;
      node.focus({ preventScroll: true });
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(caretRange(node, caret));
    };
    place(element);
    // Al terminar el clic el navegador puede reacomodar la selección —en los textos de una línea del
    // header se pierde por completo—, así que se vuelve a colocar en el próximo cuadro.
    requestAnimationFrame(() => place(element));
  }, [caret]);

  // Fuera del editor (o antes de que cargue) es solo texto: la tienda pública no cambia.
  if (!context) return renderText(as, className, value);

  const current = context.draft[field] ?? value;
  const classes = `editable-text ${className ?? ""}`.trim();

  if (editing) {
    return renderText(as, classes, current, {
      ref: focusNode,
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: false,
      tabIndex: 0,
      // El nombre del header vive dentro de un `<Link>`: evita que el clic navegue al editar/caret.
      onClick: (event) => { event.preventDefault(); event.stopPropagation(); },
      onBlur: (event) => {
        // El texto sale del `contentEditable`; se colapsa el espacio sobrante porque la página lo hace igual.
        context.set(field, (event.currentTarget.textContent ?? "").replace(/\s+/g, " ").trim());
        setEditing(false);
      },
      onKeyDown: (event) => {
        if (event.key === "Escape") { setEditing(false); return; }
        if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      },
    });
  }

  return renderText(as, classes, current || placeholder, {
    onClick: (event) => {
      // En el header el nombre va dentro de un `<Link>`: sin esto, el clic navegaría en vez de editar.
      event.preventDefault();
      event.stopPropagation();
      setCaret({ x: event.clientX, y: event.clientY });
      setEditing(true);
    },
    role: "button",
    tabIndex: 0,
    title: "Haz clic para editar",
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setCaret(null); // sin clic (teclado): el cursor va al final del texto
        setEditing(true);
      }
    },
  });
}

/**
 * Rango del cursor: justo donde se hizo clic. Si el punto no se puede traducir a una posición del texto
 * (por ejemplo al entrar con el teclado), se deja al final del texto.
 */
function caretRange(element: HTMLElement, spot: { x: number; y: number } | null): Range {
  const at = spot ? rangeFromPoint(spot.x, spot.y) : null;
  // El rango del clic tiene que caer dentro del texto editable; si no, se usa el final del texto.
  if (at && element.contains(at.startContainer)) return at;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  return range;
}

/** El "caret" del navegador en un punto: `caretRangeFromPoint` (Chrome/Safari) y `caretPositionFromPoint` (Firefox). */
function rangeFromPoint(x: number, y: number): Range | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range) return range;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (!position) return null;
  const fallback = document.createRange();
  fallback.setStart(position.offsetNode, position.offset);
  fallback.collapse(true);
  return fallback;
}

/** Renderiza el texto en la etiqueta pedida (con las props opcionales del modo edición). */
function renderText(
  tag: EditableTag,
  className: string | undefined,
  content: string,
  props: EditableProps = {},
) {
  const shared = { className, ...props };
  if (tag === "p") return <p {...shared}>{content}</p>;
  if (tag === "h1") return <h1 {...shared}>{content}</h1>;
  if (tag === "h2") return <h2 {...shared}>{content}</h2>;
  if (tag === "h3") return <h3 {...shared}>{content}</h3>;
  return <span {...shared}>{content}</span>;
}
