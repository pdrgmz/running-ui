# 🎨 Guía de Estilo y Sistema de Diseño (Smart Dashboard Design System)

> **Versión:** 1.0.0  
> **Tema Visual:** Smart Control Panel / Instrumentation Dashboard (Sage & Olive Cream)  
> **Dependencias:** Ninguna (Pure HTML5 & Vanilla CSS3)  
> **Tipografías:** `JetBrains Mono` (Titulares & Datos Monospaciados) + `Inter` (Texto y Párrafos)

---

## 📸 Muestrario de Paleta de Colores (Color Tokens)

Todas las variables están definidas en la raíz `:root` de [`smart-dashboard-ds.css`](file:///d:/Proyectos/curriculum/smart-dashboard-ds.css).

| Variable CSS | Valor Hex / HSL | Uso / Propósito | Muestra Visual |
| :--- | :--- | :--- | :--- |
| `--bg-main` | `#E4E9DD` | Fondo general de la app y contenedores primarios | Sage Cream Claro |
| `--bg-card` | `#E8EDDF` | Fondo de tarjetas y paneles flotantes | Olive Light |
| `--bg-card-hover` | `#EEF3E6` | Estado hover en tarjetas | High-light Tint |
| `--bg-input` | `#DEE3D7` | Fondo de campos de entrada y barras desactivadas | Neutral Tint |
| `--bg-dark-panel` | `#161A16` | Consola terminal y badges de alto contraste | Charcoal Dark |
| `--border-color` | `#1A1A1A` | Bordes industriales sólidos de 1.5px y texto principal | Black Ink |
| `--text-muted` | `#555C52` | Subtítulos, metadata y texto secundario | Muted Olive Grey |
| `--accent-green` | `#00E676` | Indicadores de estado activo (LED) e hitos glowing | Electric Neon Green |

---

## 📐 Tipografía y Jerarquía Visual

- **Fuente Monospaciada (Data/UI):** `var(--font-mono)` -> `'JetBrains Mono', monospace`
- **Fuente Sans-Serif (Cuerpo/Lectura):** `var(--font-sans)` -> `'Inter', sans-serif`

### Reglas de Aplicación:
- Usar `var(--font-mono)` para títulos de tarjetas (`.card-title-mono`), botones, números de métricas, badges y elementos tipo panel de control.
- Usar `var(--font-sans)` para párrafos descriptivos y contenido extenso.

---

## 🧩 Biblioteca de Componentes

### 1. Botones (Button Elements)

#### Botón Primario / Call To Action (`.btn-pill-cta`)
Boton grande tipo píldora para acciones principales o conversiones.
```html
<button class="btn-pill-cta">Acción Principal</button>
```

#### Botón Header / Secundario (`.btn-pill-header`)
Botón de tamaño estándar con fondo oscuro y texto claro.
```html
<button class="btn-pill-header">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  </svg>
  Exportar Datos
</button>
```

#### Botón Delineado / Transparent (`.btn-outline-pill`)
Botón secundario transparente con borde sólido de 1.5px.
```html
<button class="btn-outline-pill">Cancelar</button>
```

---

### 2. Tarjetas y Paneles (`.card-panel`)

El contenedor básico para cualquier sección del dashboard.

```html
<article class="card-panel col-6">
  <div class="card-header-bar">
    <span class="card-title-mono">TÍTULO DEL PANEL</span>
    <span class="card-tag-badge">ETIQUETA</span>
  </div>
  <p style="font-size: 0.85rem; color: var(--text-muted);">
    Contenido del panel aquí...
  </p>
</article>
```

---

### 3. Indicadores de Estado y Módulos LED (`.status-module-badge`)

Genera insignias tipo módulo de telemetría con diodo LED activo encendido (`.status-dot-active`).

```html
<div class="status-module-badge">
  <span class="status-dot-active"></span>
  <div class="status-module-info">
    <span class="status-module-name">ESTADO DEL SERVIDOR</span>
    <span class="status-module-val">ONLINE (99.9%)</span>
  </div>
</div>
```

---

### 4. Medidor de Nivel Segmentado (`.seniority-meter-wrapper`)

Barra de progreso estilo instrumental dividida en bloques con efecto neón en el nivel máximo (`.glow`).

```html
<div class="seniority-meter-wrapper">
  <div class="seniority-hero-header">
    <div class="seniority-hero-number">10+</div>
    <div class="seniority-hero-text">
      <span class="seniority-hero-title">AÑOS DE EXPERIENCIA</span>
      <span class="seniority-hero-sub">Desarrollo de Software</span>
    </div>
  </div>

  <div class="seniority-segmented-bar">
    <div class="segment-block active"></div>
    <div class="segment-block active"></div>
    <div class="segment-block active"></div>
    <div class="segment-block active"></div>
    <div class="segment-block active glow"></div>
  </div>

  <div class="seniority-milestone-labels">
    <span>2015</span>
    <span>2020</span>
    <span>2026+</span>
  </div>
</div>
```

---

### 5. Gráfico de Barras Industrial (`.bar-chart-container`)

Visualización de datos tipo barra con etiquetas superiores e inferiores.

```html
<div class="bar-chart-container">
  <div class="chart-bars-row">
    <div class="chart-bar-group">
      <span class="chart-val-tag">95%</span>
      <div class="chart-bar-stick" style="height: 95px;"></div>
      <span class="chart-label">JAVA</span>
    </div>
    <div class="chart-bar-group">
      <span class="chart-val-tag">85%</span>
      <div class="chart-bar-stick" style="height: 85px;"></div>
      <span class="chart-label">AWS</span>
    </div>
  </div>
</div>
```

---

### 6. Terminal / Consola Telemetría (`.terminal-panel`)

Simulador de pantalla terminal oscura para logs, scripts y eventos.

```html
<div class="terminal-panel">
  <div class="terminal-header">
    <span>SYSTEM CONSOLE</span>
    <span>STATUS: ACTIVE</span>
  </div>
  <div class="terminal-lines-container">
    <div><span style="color: var(--accent-green);">$</span> npm run start</div>
    <div>[INFO] Servidor listo en port 8080...</div>
  </div>
</div>
```

---

### 7. Formularios e Inputs (`.form-group` y `.form-control`)

Campos de entrada minimalistas integrados al tema.

```html
<div class="form-group">
  <label class="form-label">Nombre del Servidor</label>
  <input type="text" class="form-control" placeholder="ej. prod-node-01">
</div>
```

---

## 📱 Sistema de Grilla (Responsive Grid)

Utiliza la clase contenedora `.dashboard-grid` (12 columnas) combinada con clases de span:

- `.col-12` : Ocupa el ancho completo (100%)
- `.col-8`  : Ocupa 8 columnas (66%)
- `.col-6`  : Ocupa 6 columnas (50%)
- `.col-4`  : Ocupa 4 columnas (33.3%)
- `.col-3`  : Ocupa 3 columnas (25%)

*Nota: En pantallas menores a 900px, las columnas cambian automáticamente a 100% de ancho.*

---

## ⚡ Instrucciones de Integración Rápidas

1. Copia [`smart-dashboard-ds.css`](file:///d:/Proyectos/curriculum/smart-dashboard-ds.css) a tu proyecto.
2. Abre [`demo.html`](file:///d:/Proyectos/curriculum/demo.html) en tu navegador para interactuar con la demostración en vivo.
3. Copia las clases CSS descritas en esta guía directamente a tu código.
