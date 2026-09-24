# Plan de Implementación — BOSQUE

**Proyecto:** Tienda BOSQUE (repostería)
**Basado en:** `RPD.md` (decisiones D1–D32)
**Fecha:** 2026-09-24 · **Estado:** documento vivo — despliegue y pendientes

---

## 0. Cómo usar este documento

- **Qué queda acá:** lo que **falta hacer** y cómo **desplegar**. El **estado actual del código** y las
  **decisiones** (D1–D32) viven en `RPD.md`.
- **Regla del proyecto (AGENTS.md):** antes de escribir código, leer la guía correspondiente en
  `node_modules/next/dist/docs/` (esta versión de Next.js tiene breaking changes respecto de lo conocido).
- **Verificación de cada cambio:** `npx tsc --noEmit`, `npm run lint` y `npm run build`; en `backend/`,
  `pytest`.

---

## 1. Transición a AWS — qué considerar al desplegar

Hoy la tienda corre en local (Next + API dockerizada con `docker-compose.backend.yml`). Al pasar a AWS:

1. **Reconstruir y redesplegar la imagen de la API (obligatorio).** El `Dockerfile` copia el código
   (`COPY . .`) y arranca `uvicorn` **sin `--reload`**, así que un contenedor viejo sirve código viejo.
   En local basta `docker compose -f docker-compose.backend.yml up --build -d`; en AWS, subir la imagen a
   ECR y redesplegar (ECS/EC2).
2. **Schema sin Alembic.** Las tablas se crean al arrancar con `Base.metadata.create_all`, que **no** altera
   tablas existentes. Para mantener al día una base ya creada, la API ejecuta al arrancar listas
   idempotentes de `ALTER TABLE …`/`DROP … IF EXISTS` **solo en PostgreSQL** (catálogo retirado, columnas de
   verificación y de contenido, agenda y ajustes retirados). Entre los últimos retiros están
   `time_slots.label`, `closed_days.reason` y la tabla `closed_weekdays` (**D32**). El usuario de la base
   debe tener permiso DDL; en RDS, verificar que no esté restringido. En una base nueva no hace nada.
3. **Variables de entorno.** `AUTH_JWT_SECRET` debe ser **el mismo** en Next.js y en la API (si difiere, las
   sesiones dejan de validar); `CORS_ORIGINS` debe incluir el dominio de producción; `ADMIN_EMAILS` define
   quién obtiene rol `admin`; `NEXT_PUBLIC_API_URL` apunta al dominio/balanceador de la API.
4. **Instagram.** `INSTAGRAM_USER_ID` e `INSTAGRAM_ACCESS_TOKEN` van en el entorno de la **API** (ver §2).
5. **Imágenes (`/api/upload`).** Montar un volumen persistente (EFS/EBS) en `UPLOAD_DIR` o migrar a S3 para
   no perder fotos al reiniciar contenedores.
6. **Health check** del target group: `/health`.

> Regla práctica: **cada cambio en `backend/` exige reconstruir la imagen** antes de probar en el frontend;
> si no, aparecerán `404`/`405` por rutas que en el código ya existen.

---

## 2. Instagram — renovación automática del token (D31)

El token **no se le pasa a la página**: se carga **una sola vez en el entorno de la API** y la API se
encarga del resto (consulta, caché y renovación).

1. **En la API, no en Next.** Definir `INSTAGRAM_USER_ID` e `INSTAGRAM_ACCESS_TOKEN` en `backend/.env` (o el
   `.env` de la raíz que usa `docker compose`) en local, y en las variables del servicio en AWS
   (`backend/.env.example` las documenta; `docker-compose.backend.yml` ya las pasa).
2. **Una sola vez.** Al arrancar, `backend/app/instagram.py` guarda el token en la tabla `instagram_token` y
   una **tarea de fondo** lo renueva sola (revisa cada 12 h y renueva pasados 50 de los 60 días). Desde ahí
   el valor del entorno deja de usarse: no hay que recalcularlo ni volver a cargarlo.
3. **El navegador nunca ve el token.** El widget (`components/instagram-grid.tsx`) solo lee
   `GET /api/instagram/feed`, que devuelve las publicaciones normalizadas; no hay `NEXT_PUBLIC_*` ni route
   handler de Next para Instagram.
4. **Diagnóstico y renovación manual (admins):** `GET /api/instagram/token` (estado, origen y última falla) y
   `POST /api/instagram/refresh` para adelantar la renovación.

> **Seguridad:** el token se compartió por chat, así que conviene **rotarlo** desde la cuenta de Instagram
> antes de dejarlo en producción; al renovarse, la API guarda el nuevo en la base y el del entorno deja de
> usarse.

---

## 3. Últimos ajustes del dueño (2026-09-24)

**Implementado y verificado** (`pytest` 47/47; `tsc`, `lint` y `build` sin errores). Cuatro puntos, con una
decisión nueva (**D32**):

| # | Ajuste pedido | Implementación |
|---|---|---|
| **A37** | Cómo pasar el token de Instagram (solo necesario una vez) | Ver **§2**: el token vive en la API y se renueva solo; la página nunca lo recibe. |
| **A38** | Los enlaces Productos / Beneficios / Nosotros con la misma tipografía que el nombre | Se probó con la clase `display` y se **revirtió** el mismo día a pedido del dueño: queda como estaba. |
| **A39** | En **Inicio** del panel, «Ventas del período» no decía de qué período y sobraba el botón «Actualizar primero» | La métrica pasa a **«Ventas del último mes»** (los **últimos 30 días móviles**) y se **elimina el botón** «Actualizar primero». |
| **A40** | En **Agenda**: quitar el cierre «todas las semanas», mantener solo las fechas puntuales (sin motivo) y quitar el nombre de la franja | **D32:** los días libres salen de los **días de cada franja** + **fechas cerradas puntuales**; se retiran `closed_weekdays`, `time_slots.label` y `closed_days.reason`. La sección de cierres queda como **«Fechas cerradas»**. |

**Decisión D32 (nueva):** los días que no se atiende salen de los **días de cada franja** (por punto, D18) y
de las **fechas cerradas puntuales** (`closed_days`). Se retira el cierre semanal `closed_weekdays` porque
duplicaba los días de la franja y, al ser global, cerraba el día para todos los puntos. La franja **no tiene
nombre** (se identifica por su horario) y la fecha cerrada **no pide motivo**.

**Al desplegar:** **reconstruir la imagen de la API** (hay `ALTER TABLE`/`DROP TABLE` al arrancar; ver §1). El
`DROP TABLE IF EXISTS closed_weekdays` deja de cerrar los días que estuvieran marcados semanalmente: los que
deban seguir cerrados se ajustan en los **días de cada franja** desde Agenda.

---

## 4. Pendientes

1. **Webpay Plus (D8):** solicitar credenciales TBK e integrar el SDK en `app/api/webpay/*`. Hasta entonces
   el checkout cobra por **transferencia** con confirmación manual desde el panel.
2. **Notificación automática de WhatsApp (D9):** elegir proveedor (API de Meta Cloud vs. enlace `wa.me`). El
   botón flotante `wa.me` ya funciona.
3. **Credenciales externas:** OAuth Client de Google (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`), cuenta y
   dominio **verificados** en **Resend** (`RESEND_API_KEY`/`RESEND_EMAIL_FROM`) y **rotar** el token de Instagram.
4. **Seed de agenda:** cargar en Agenda los **puntos reales** (retiro presencial y puntos de encuentro de San
   Javier / Talca) con su ubicación y sus **franjas** (días + horario).
5. **Desplegar en AWS** (§1): reconstruir la imagen de la API y cargar las variables de entorno.
6. **Revisión visual con el dueño** de carta, ficha, footer y checkout en móvil y escritorio (referencia:
   https://simplysweet.cl), y de los **Reportes** con pedidos reales cargados.
