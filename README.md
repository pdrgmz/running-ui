# Running Tracker UI

Panel de analítica del corredor construido en **Angular 20** sobre la
**Running Tracker & Analytics API v1.4.0** (ver [`api-docs.json`](api-docs.json)),
con el sistema de diseño **Smart Dashboard UI Kit** (carpeta
[`smart-dashboard-ui-kit/`](smart-dashboard-ui-kit)).

La aplicación muestra **toda la información que la API expone para el usuario
autenticado**: perfil, resumen acumulado, récords personales (PB), logros
automáticos en un timeline cronológico calculados sobre el historial completo
(volumen, sesiones, desnivel, tiempo, distancias largas, constancia semanal,
Eddington y récords),
PMC (CTL/ATL/TSB), ACWR, número de Eddington, historial de actividades, mapa de
calor global con las trazas GPS de **todas** las sesiones (estilo Strava,
carga por lotes con progreso), analítica detallada por sesión (splits, zonas
de FC, carga TRIMP/HRSS, VO2Max/VAM, predicción de marcas, desacople aeróbico
y ruta GPS sobre mapa **Leaflet + OpenStreetMap** con tiles desaturados a
juego con el sistema de diseño), **gestión de claves de API** (`X-Api-Key`)
para automatizaciones como n8n, scripts o cron, **importación/exportación de
archivos** (TCX/GPX/FIT, ZIP masivo con progreso SSE y exportaciones ZIP),
**mantenimiento de trackpoints** (completado de métricas y cobertura de
altitud), **exportación GPX/GeoJSON** por actividad y un **panel MCP** para
inicializar sesiones, listar/ejecutar tools y consumir el stream SSE.

## Puesta en marcha

```bash
npm install        # solo la primera vez
npm start          # ng serve → http://localhost:4200 (con proxy /api al servidor de producción)
```

En la pantalla de acceso:

- **URL base de la API vacía** → usa el mismo origen (el proxy de `ng serve`
  redirige `/api/*` a `https://running-api.pdrgmz.uk`, configurable en
  [`proxy.conf.json`](proxy.conf.json)).
- **URL absoluta** (ej. `https://running-api.pdrgmz.uk` o el mock local) →
  se guarda en el navegador y se usa directamente.

### Modo demo sin backend

```bash
npm run mock       # servidor mock en http://localhost:4300
```

Introduce `http://localhost:4300` como URL base en el formulario de acceso y
entra con cualquier email/contraseña para ver todo el panel con datos de ejemplo.

### Build de producción

```bash
npm run build      # genera dist/running-ui
```

## Despliegue con Docker / Portainer

Archivos incluidos:

| Archivo | Descripción |
| --- | --- |
| [`Dockerfile`](Dockerfile) | Build multi-stage: Angular 20 + Nginx |
| [`nginx/default.conf.template`](nginx/default.conf.template) | SPA fallback, caché de assets y proxy `/api/*` |
| [`docker-compose.yml`](docker-compose.yml) | Stack listo para Portainer |
| [`.env.example`](.env.example) | Variables `APP_PORT` y `API_UPSTREAM` |

Nginx sirve la SPA y reenvía `/api/*` al `API_UPSTREAM` configurado
(`https://running-api.pdrgmz.uk` por defecto). Por eso la **URL base de la API
puede dejarse vacía** en el login: frontend y API comparten origen y no hay
problemas de CORS. Si en el navegador se guardó una URL absoluta anteriormente,
bórrala para volver a usar el proxy.

### Docker Compose local

```bash
cp .env.example .env    # opcional: ajusta APP_PORT / API_UPSTREAM
docker compose up -d --build
```

La UI queda en `http://localhost:3000` (o el `APP_PORT` configurado).

```bash
docker compose ps
curl http://localhost:3000/healthz   # responde "ok"
docker compose logs -f running-ui
docker compose down
```

### Portainer

**Opción A — Stack desde el repositorio Git (recomendada)**

1. Portainer → **Stacks** → **Add stack** → **Git repository**.
2. Repository URL: `https://github.com/pdrgmz/running-ui.git` (o tu fork),
   referencia `main`.
3. Compose path: `docker-compose.yml`.
4. En **Environment variables** ajusta, si hace falta:
   - `APP_PORT`: puerto del host (por defecto `3000`).
   - `API_UPSTREAM`: servidor de la API, **sin barra final**.
5. **Deploy the stack**. En Docker Standalone, Portainer construye la imagen
   con el `Dockerfile` y arranca el contenedor.

> Si al desplegar aparece `pull access denied for running-ui, repository does
> not exist or may require 'docker login'`, es porque Portainer intenta
> descargar la imagen antes de construirla. El stack ya incluye
> `pull_policy: build` para evitarlo; si tu versión de Portainer lo ignora,
> desactiva la opción **Re-pull image** al desplegar.

> En un entorno **Swarm**, `docker stack deploy` no construye imágenes: usa la
> opción B con una imagen ya publicada.

**Opción B — Imagen publicada en un registry**

```bash
docker build -t TU_USUARIO/running-ui:latest .
docker push TU_USUARIO/running-ui:latest
```

En Portainer → **Stacks** → **Add stack** → **Web editor**, pega:

```yaml
services:
  running-ui:
    image: TU_USUARIO/running-ui:latest
    restart: unless-stopped
    ports:
      - "3000:80"
    environment:
      API_UPSTREAM: https://running-api.pdrgmz.uk
```

El contenedor solo necesita el puerto interno `80`; el healthcheck consulta
`GET /healthz`. Si la API corre como otro servicio de la misma red Docker, usa
su nombre como upstream (por ejemplo `http://running-api:8080`).

Para actualizar, vuelve a desplegar el stack o ejecuta
`docker compose up -d --build` en local. Si Portainer reutiliza la imagen en
caché tras un redespliegue, elimina la imagen `running-ui:latest` del entorno y
vuelve a desplegar (o publica la imagen con CI y usa la opción B).

## Arquitectura

```
src/app/
├── core/
│   ├── guards/auth.guard.ts          # protección de rutas (authGuard / loginGuard)
│   ├── interceptors/api.interceptor.ts  # Bearer + refresh automático en 401 + telemetría + errores
│   ├── models/api.models.ts          # DTOs extraídos de api-docs.json
│   └── services/
│       ├── api-config.service.ts     # URL base configurable (localStorage)
│       ├── auth.service.ts           # login/registro/refresh/me + claims JWT
│       ├── api-keys.service.ts       # claves de API (X-Api-Key) del usuario
│       ├── stats.service.ts          # summary, records, pmc, eddington, acwr
│       ├── milestones.service.ts     # logros automáticos sobre /activities
│       ├── activities.service.ts     # actividades + analíticas + mantenimiento
│       ├── files.service.ts          # importación/exportación de archivos
│       ├── geo.service.ts            # exportación GPX / GeoJSON
│       ├── mcp.service.ts            # cliente MCP JSON-RPC + SSE
│       ├── telemetry.service.ts      # registro de tráfico HTTP para la consola
│       └── toast.service.ts          # notificaciones
├── features/
│   ├── login/                        # pantalla de acceso / registro
│   └── dashboard/
│       ├── dashboard.*               # shell con pestañas y carga paralela
│       └── widgets/
│           ├── profile-card/         # identidad + sesión JWT
│           ├── summary-stats/        # /stats/summary
│           ├── pmc-chart/            # SVG CTL/ATL/TSB (/analytics/pmc)
│           ├── acwr-card/            # /analytics/acwr/current
│           ├── eddington-card/       # /analytics/eddington
│           ├── records-grid/         # /stats/records
│           ├── milestone-timeline/   # timeline de logros con fecha, recientes primero
│           ├── milestones-panel/     # logros: resumen, filtros y próximos objetivos
│           ├── activity-calendar/    # historial en calendario con scroll infinito
│           ├── activity-detail/      # modal bento con splits, zonas, carga, mapa GPS
│           ├── activity-heatmap/     # mapa de calor con todas las trazas GPS
│           ├── files-panel/          # subida individual/ZIP y exportaciones
│           ├── mcp-panel/            # sesión MCP, tools y stream SSE
│           └── api-keys-panel/       # generar/revocar claves de API (X-Api-Key)
└── shared/
    ├── pipes/format.pipes.ts         # duration, km, pace, kmh
    └── terminal-console/             # consola de telemetría estilo terminal
```

## Endpoints consumidos

| Vista | Endpoint |
| --- | --- |
| Acceso / registro / sesión | `POST /api/v1/auth/login`, `/register`, `/refresh`, `GET /auth/me` |
| Claves de API | `GET` · `POST /api/v1/auth/api-keys` · `DELETE /auth/api-keys/{id}` |
| Resumen acumulado | `GET /api/v1/stats/summary` |
| Récords (PB) | `GET /api/v1/stats/records` · `POST /stats/recalculate` |
| Logros automáticos | Timeline cronológico derivado de `GET /api/v1/activities` (historial completo) + `records` + `eddington` |
| PMC | `GET /api/v1/analytics/pmc?startDate&endDate` |
| ACWR | `GET /api/v1/analytics/acwr/current` |
| Eddington | `GET /api/v1/analytics/eddington` |
| Actividades | `GET /api/v1/activities?page&size&sort` · `GET /activities/{id}` |
| GPS | `GET /api/v1/activities/{id}/trackpoints?resolution` |
| Analítica de sesión | `GET /api/v1/analytics/{id}/(splits\|hr-zones\|training-load\|vo2max-vam\|cardiac-drift)` |
| Archivos | `POST /api/v1/files/upload` · `/upload-bulk` · `GET /files/upload-status/{id}` · `/stream` · `GET /files/export-bulk` · `/export-backup-zip` |
| Mantenimiento | `POST /api/v1/activities/{id}/complete-trackpoints` · `/complete-metrics` · `POST /activities/complete-metrics` · `GET /activities/elevation-coverage` |
| Borrado | `DELETE /api/v1/activities` · `DELETE /activities/{id}` |
| Geoespacial | `GET /api/v1/geo/{id}/gpx` · `/geojson` |
| MCP | `POST /mcp` (JSON-RPC) · `GET /mcp` (SSE) |

## Design system

Los estilos base viven en [`src/smart-dashboard-ds.css`](src/smart-dashboard-ds.css)
(copia fiel de `smart-dashboard-ui-kit/smart-dashboard-ds.css`). En
[`src/styles.css`](src/styles.css) se añade una capa de extensión que **reutiliza
los tokens del kit** (`--bg-card`, `--border-color`, `--font-mono`,
`--accent-green`, radios, transiciones…) para los componentes nuevos: tablas de
datos, stat tiles, modales, barras de zonas, gauges y toasts.

Componentes del kit utilizados: `card-panel`, `card-header-bar`,
`card-title-mono`, `card-tag-badge`, `btn-pill-header/cta`, `btn-outline-pill`,
`status-module-badge`, `seniority-meter-wrapper`, `terminal-panel`, `nav-tabs-bar`,
`form-control`, `toast-notice`, `dashboard-grid` (col-12/8/6/4/3, col-left-6,
col-right-6), `hero-identity`, `hero-specs-list`, etc.

## Notas

- El JWT se guarda en `localStorage`; ante un `401` el interceptor renueva el
  token con el refresh token y reintenta la petición una vez.
- La consola de telemetría (pestaña *Cuenta & API*) muestra el tráfico HTTP en
  vivo, incluidos los reintentos tras renovación de token.
- Si el servidor de producción no envía cabeceras CORS, usa el proxy de
  `ng serve` (URL base vacía) o sirve `dist/running-ui` detrás del mismo dominio
  que la API.
