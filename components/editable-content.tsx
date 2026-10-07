"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ImagePlus, ImageUp, Loader2, RotateCcw } from "lucide-react";
import { uploadImage } from "@/lib/api";

/**
 * Modo edición del admin (`/admin/editor`).
 *
 * La tienda pública no cambia: `EditableText` se comporta como texto normal mientras no haya un
 * `ContentEditProvider` arriba. En la ruta del editor, el provider guarda un borrador y cada texto se
 * vuelve editable al hacer clic; el botón «Guardar cambios» (en `StorefrontEditor`) es el que persiste
 * todo de una vez en `PUT /api/settings`.
 *
 * Entran los textos que **ya viven en `store_settings`** (D38): el nombre, el anuncio, los antetítulos y
 * textos del hero, la historia y la **bajada y la ubicación del pie**
 * —más las **fotos** con `EditableImage`: la del hero (D48) y la de la **sección de historia** (A76)—. El
 * resto de la copy —«Catálogo», «Productos destacados», «Contacto», «Tienda»— sigue fija en el código, y
 * las **tarjetas de beneficios** salieron con su sección (D54).
 *
 * El **nombre** se edita **solo en el título del header** (el primero de la página) y el pie y el copyright
 * lo siguen: son el mismo campo, pero el del pie no se marca como editable a propósito.
 */
/**
 * Campos editables, en el orden en que aparecen en la página (lo usa el editor al guardar).
 *
 * La **lista es la fuente** y el tipo sale de ella (`typeof …[number]`): antes el union y el arreglo
 * enumeraban los mismos veinte nombres por separado y había que tocar los dos al sumar un texto.
 */
export const editableFields = [
  "name",
  "announcement",
  "hero_image",
  "hero_image_position",
  "hero_logo",
  "hero_logo_shape",
  "hero_eyebrow",
  "hero_title",
  "hero_description",
  "story_eyebrow",
  "story_headline",
  "story_description",
  "story_image",
  "footer_tagline",
  "footer_location",
] as const;

export type EditableField = (typeof editableFields)[number];

type ContentEditContextValue = {
  /** Valores cambiados en esta sesión de edición, por campo. Lo que falte sale del valor que se muestra. */
  draft: Partial<Record<EditableField, string>>;
  set: (field: EditableField, value: string) => void;
  /**
   * Aviso en la barra del editor. Lo usan los campos que hacen trabajo extra —como la **foto del hero**,
   * que se sube a la API— para contar qué pasó sin abrir un diálogo aparte.
   */
  notify?: (message: string) => void;
};

const ContentEditContext = createContext<ContentEditContextValue | null>(null);

export function ContentEditProvider({
  draft,
  set,
  notify,
  children,
}: {
  draft: Partial<Record<EditableField, string>>;
  set: (field: EditableField, value: string) => void;
  notify?: (message: string) => void;
  children: ReactNode;
}) {
  return <ContentEditContext.Provider value={{ draft, set, notify }}>{children}</ContentEditContext.Provider>;
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

/**
 * «X% Y%» → las dos coordenadas del encuadre (D51). Un valor que no sea un porcentaje válido cae al
 * centro, que es el valor por defecto de `object-position` en CSS.
 */
function parseImagePosition(value: string): { x: number; y: number } {
  const [x, y] = value.split(" ");
  const coordinate = (part: string | undefined) => {
    const parsed = Number.parseFloat(part ?? "");
    return Number.isFinite(parsed) ? clampPercent(parsed) : 50;
  };
  return { x: coordinate(x), y: coordinate(y) };
}

/** Redondea un porcentaje del encuadre a un entero entre 0 y 100 (el rango de `object-position`). */
function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

/** `object-position` de la foto (D51): el encuadre guardado, o `undefined` si no hay ninguno. */
function imagePositionStyle(position: string | undefined): React.CSSProperties | undefined {
  return position ? { objectPosition: position } : undefined;
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

/**
 * Foto que se cambia desde el propio editor (`/admin/editor`, D48).
 *
 * Igual que `EditableText`, fuera del editor es solo la imagen: la tienda pública no cambia. Con un
 * `ContentEditProvider` arriba, sobre la foto aparece un **botón con un ícono de imagen**; al pulsarlo se
 * elige un archivo, se sube con el mismo `uploadImage` del panel y la URL queda en el borrador, así que la
 * foto nueva se ve al instante y se publica con **«Guardar cambios»**. El botón cambia de ícono según haya
 * foto o no, y con `resetTo` aparece además el de **quitarla** (vuelve a la foto de la plantilla, o la deja
 * en blanco si el campo es opcional, como el **logo** del hero).
 *
 * Dos extras para el hero: con `panField` la foto se **arrastra con el mouse** para elegir su encuadre
 * (`object-position`, D51), y con `tools` se le suman botones propios —la **forma del logo** (D50) y el
 * botón para volver al encuadre original—.
 */
export function EditableImage({
  field,
  value,
  alt = "",
  className,
  containerClassName,
  controlsClassName,
  position,
  panField,
  tools,
  resetTo,
  resetLabel = "Volver a la foto de la plantilla",
  label = "Cambiar la foto",
}: {
  field: EditableField;
  value: string;
  alt?: string;
  /** Clase del `<img>`: la foto sigue ocupando su lugar en el diseño. */
  className?: string;
  /** Clase del contenedor que agrupa la foto y sus botones (dónde queda anclada). */
  containerClassName?: string;
  /** Posición de los botones **dentro** del contenedor (p. ej. `absolute right-5 top-5 z-50`). */
  controlsClassName?: string;
  /** `object-position` de la foto (D51): el encuadre guardado; fuera del editor se aplica tal cual. */
  position?: string;
  /**
   * Habilita **arrastrar la foto para encuadrarla** (D51) y guarda el resultado en ese campo: el editor
   * mueve la imagen con el mouse y el encuadre sale del gesto, así una foto apaisada no queda fuera de
   * cuadro. Solo actúa dentro del editor.
   */
  panField?: EditableField;
  /** Botones extra junto a los de la foto (la forma del logo, volver al encuadre; D50/D51). */
  tools?: ReactNode;
  /**
   * Valor del botón de quitar: la foto de la plantilla o `""` para dejarlo sin foto. **Sin esto no hay
   * botón**: el campo solo se puede reemplazar (la foto del hero siempre tiene una, el logo no).
   */
  resetTo?: string;
  resetLabel?: string;
  label?: string;
}) {
  const context = useContentEdit();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Punto de partida del arrastre del encuadre (D51): dónde se tomó la foto y con qué encuadre arrancó.
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Dentro del editor la foto sale del borrador (lo recién subido); fuera, del valor recibido.
  const current = context ? context.draft[field] ?? value : value;
  // El encuadre sigue el mismo criterio: con `panField`, el editor lo mueve y lo deja en el borrador.
  const currentPosition = context && panField ? context.draft[panField] ?? position : position;

  /**
   * Encuadre con el mouse (D51): mover la foto hacia la derecha muestra más de su lado izquierdo, así que
   * el porcentaje del `object-position` baja; el alto va en el mismo sentido. Se redondea a entero y se
   * acota a 0–100, que es todo el rango que entiende `object-position`.
   */
  function pan(event: React.PointerEvent<HTMLImageElement>) {
    if (!context || !panField || !drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - drag.current.x) / Math.max(rect.width, 1)) * 100;
    const dy = ((event.clientY - drag.current.y) / Math.max(rect.height, 1)) * 100;
    context.set(panField, `${clampPercent(drag.current.left - dx)}% ${clampPercent(drag.current.top - dy)}%`);
  }

  /**
   * Manijas del arrastre (D51), vacías fuera del editor o sin `panField`: así la foto se declara **una sola
   * vez** y la misma pieza sirve para la tienda pública y para el editor.
   */
  const panProps = context && panField ? {
    draggable: false,
    onDragStart: (event: React.DragEvent<HTMLImageElement>) => event.preventDefault(),
    onPointerDown: (event: React.PointerEvent<HTMLImageElement>) => {
      const start = parseImagePosition(currentPosition ?? "");
      drag.current = { x: event.clientX, y: event.clientY, left: start.x, top: start.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: pan,
    onPointerUp: (event: React.PointerEvent<HTMLImageElement>) => {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    onPointerCancel: () => { drag.current = null; },
  } : {};

  // Sin valor no se dibuja nada: así un campo vacío —el logo es **opcional** (D49)— no deja una imagen
  // rota, y en el editor solo queda el botón para subir la foto.
  const photo = current && (
    <img
      src={current}
      alt={alt}
      className={`${className ?? ""}${context && panField ? " editable-image-pan" : ""}`.trim()}
      style={imagePositionStyle(currentPosition)}
      {...panProps}
    />
  );

  // Fuera del editor (o antes de que cargue) es solo la foto: la tienda pública no cambia. El contenedor
  // se dibuja igual, porque es el que la ancla en su lugar; solo se salta el botón y el selector.
  if (!context) return <div className={containerClassName ?? ""}>{photo}</div>;

  const own = resetTo !== undefined && current !== resetTo;

  // Flecha y no `function`: así el ensanchado del `context` sobrevive dentro del cuerpo (una función
  // declarada se iza y el compilador no puede dar por hecho que el `context` ya no es nulo).
  const upload = async (file: File) => {
    setBusy(true);
    try {
      context.set(field, await uploadImage(file));
      context.notify?.("Foto subida. Guarda los cambios para publicarla.");
    } catch (error) {
      context.notify?.(error instanceof Error ? error.message : "No se pudo subir la imagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={containerClassName ?? ""}>
      {photo}
      <div className={`flex items-center gap-2 ${controlsClassName ?? ""}`}>
        <button type="button" onClick={() => input.current?.click()} disabled={busy} title={label} aria-label={label} className={`grid h-11 w-11 place-items-center rounded-full bg-white text-[#243128] shadow-lg transition hover:scale-105 disabled:cursor-progress disabled:opacity-70 ${current ? "" : "border-2 border-dashed border-[#243128]/40"}`}>
          {busy ? <Loader2 size={19} className="animate-spin"/> : current ? <ImageUp size={19}/> : <ImagePlus size={19}/>}
        </button>
        {own && <button type="button" onClick={() => context.set(field, resetTo ?? "")} title={resetLabel} aria-label={resetLabel} className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-[#243128] shadow-lg transition hover:scale-105"><RotateCcw size={19}/></button>}
        {tools}
      </div>
      {/* El mismo selector del panel: al elegir un archivo se sube y queda en el borrador. Se limpia el
          `value` para poder volver a elegir el mismo archivo después. */}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }}/>
    </div>
  );
}
