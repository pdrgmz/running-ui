# Running Tracker UI

Panel de analítica del corredor construido en **Angular 20** sobre la
**Running Tracker & Analytics API v1.3.0** (ver [`api-docs.json`](api-docs.json)),
con el sistema de diseño **Smart Dashboard UI Kit** (carpeta
[`smart-dashboard-ui-kit/`](smart-dashboard-ui-kit)).

La aplicación muestra **toda la información que la API expone para el usuario
autenticado**: perfil, resumen acumulado, récords personales (PB), PMC
(CTL/ATL/TSB), ACWR, número de Eddington, historial de actividades y analítica
detallada por sesión (splits, zonas de FC, carga TRIMP/HRSS, VO2Max/VAM,
predicción de marcas, desacople aeróbico y ruta GPS).

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
│       ├── stats.service.ts          # summary, records, pmc, eddington, acwr
│       ├── activities.service.ts     # actividades + analíticas por sesión
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
│           ├── activities-table/     # /activities (paginada)
│           └── activity-detail/      # modal con splits, zonas, carga, GPS
└── shared/
    ├── pipes/format.pipes.ts         # duration, km, pace, kmh
    └── terminal-console/             # consola de telemetría estilo terminal
```

## Endpoints consumidos

| Vista | Endpoint |
| --- | --- |
| Acceso / registro / sesión | `POST /api/v1/auth/login`, `/register`, `/refresh`, `GET /auth/me` |
| Resumen acumulado | `GET /api/v1/stats/summary` |
| Récords (PB) | `GET /api/v1/stats/records` · `POST /stats/recalculate` |
| PMC | `GET /api/v1/analytics/pmc?startDate&endDate` |
| ACWR | `GET /api/v1/analytics/acwr/current` |
| Eddington | `GET /api/v1/analytics/eddington` |
| Actividades | `GET /api/v1/activities?page&size&sort` · `GET /activities/{id}` |
| GPS | `GET /api/v1/activities/{id}/trackpoints?resolution` |
| Analítica de sesión | `GET /api/v1/analytics/{id}/(splits\|hr-zones\|training-load\|vo2max-vam\|cardiac-drift)` |

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
