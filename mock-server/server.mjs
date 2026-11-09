/**
 * Servidor mock de la Running Tracker & Analytics API (solo desarrollo).
 *
 * Replica los contratos descritos en `api-docs.json` con datos de ejemplo
 * deterministas para poder previsualizar la interfaz sin backend real.
 *
 *   node mock-server/server.mjs           → http://localhost:4300
 *
 * En la pantalla de acceso de la app introduce http://localhost:4300 como
 * "URL base de la API" y entra con cualquier email/contraseña.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env['PORT'] ?? 4300);
const ACCESS_TTL = 600; // segundos (10 min) — permite ver la renovación automática
const REFRESH_TTL = 604800; // 7 días

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    return send(res, 204, null);
  }

  // Leer cuerpo (json) si es necesario.
  readBody(req)
    .then((body) => route(req, path, url, body, res))
    .catch((err) => send(res, 500, { message: String(err) }));
});

function route(req, path, url, body, res) {
  const method = req.method ?? 'GET';
  // --- Autenticación ---
  if (method === 'POST' && path === '/api/v1/auth/login') {
    return send(res, 200, authPayload(body?.email ?? 'runner@example.com'));
  }
  if (method === 'POST' && path === '/api/v1/auth/register') {
    if (!body?.email || !body?.password) {
      return send(res, 400, error(400, 'Bad Request', 'Email y contraseña son obligatorios'));
    }
    return send(res, 200, authPayload(body.email));
  }
  if (method === 'POST' && path === '/api/v1/auth/refresh') {
    if (!body?.refreshToken) {
      return send(res, 400, error(400, 'Bad Request', 'refreshToken obligatorio'));
    }
    return send(res, 200, authPayload('runner@example.com'));
  }
  if (method === 'GET' && path === '/api/v1/auth/me') {
    if (!authorized(req)) {
      return send(res, 401, error(401, 'Unauthorized', 'No autenticado o token inválido'));
    }
    return send(res, 200, { id: 1, email: userEmail, role: 'USER' });
  }

  // El resto de rutas requieren token válido.
  if (!authorized(req)) {
    return send(res, 401, error(401, 'Unauthorized', 'No autenticado o token inválido'));
  }

  // --- Claves de API ---
  if (method === 'GET' && path === '/api/v1/auth/api-keys') {
    return send(res, 200, apiKeyList());
  }
  if (method === 'POST' && path === '/api/v1/auth/api-keys') {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return send(res, 400, error(400, 'Bad Request', 'El nombre de la clave es obligatorio'));
    }
    const days = body?.expiresInDays;
    if (days !== undefined && days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) {
      return send(res, 400, error(400, 'Bad Request', 'expiresInDays debe estar entre 1 y 3650'));
    }
    const key = generateApiKey();
    const created = {
      id: apiKeySeq++,
      name,
      key,
      keyPrefix: key.slice(0, 10),
      createdAt: new Date().toISOString(),
      expiresAt: days ? new Date(Date.now() + days * 86400000).toISOString() : null,
      lastUsedAt: null,
    };
    apiKeys.unshift(created);
    return send(res, 201, created);
  }
  const keyMatch = path.match(/^\/api\/v1\/auth\/api-keys\/(\d+)$/);
  if (method === 'DELETE' && keyMatch) {
    const id = Number(keyMatch[1]);
    const index = apiKeys.findIndex((k) => k.id === id);
    if (index === -1) {
      return send(res, 404, error(404, 'Not Found', `Clave de API no encontrada: ${id}`));
    }
    apiKeys.splice(index, 1);
    return send(res, 204, null);
  }

  // --- Estadísticas ---
  if (method === 'GET' && path === '/api/v1/stats/summary') {
    return send(res, 200, summary());
  }
  if (method === 'GET' && path === '/api/v1/stats/records') {
    return send(res, 200, records());
  }
  if (method === 'POST' && path === '/api/v1/stats/recalculate') {
    return send(res, 200, { message: 'Estadísticas y récords recalculados' });
  }

  // --- Analítica global ---
  if (method === 'GET' && path === '/api/v1/analytics/pmc') {
    const end = url.searchParams.get('endDate') ?? isoDate(new Date());
    const start =
      url.searchParams.get('startDate') ?? isoDate(addDays(new Date(end), -89));
    return send(res, 200, pmc(start, end));
  }
  if (method === 'GET' && path === '/api/v1/analytics/eddington') {
    return send(res, 200, { eddingtonNumber: 15, currentCountForNumber: 18, runsNeededForNext: 3, nextTargetKm: 16 });
  }
  if (method === 'GET' && path === '/api/v1/analytics/acwr/current') {
    return send(res, 200, {
      date: isoDate(new Date()),
      acuteLoad: 65.0,
      chronicLoad: 50.0,
      acwr: 1.3,
      zone: 'SWEET_SPOT',
      recommendation: 'Carga de entrenamiento óptima. Progresión segura.',
    });
  }

  // --- Actividades ---
  if (method === 'GET' && path === '/api/v1/activities') {
    const page = Number(url.searchParams.get('page') ?? 0);
    const size = Number(url.searchParams.get('size') ?? 20);
    const all = activities();
    const totalPages = Math.max(1, Math.ceil(all.length / size));
    const content = all.slice(page * size, page * size + size);
    return send(res, 200, {
      totalPages,
      totalElements: all.length,
      size,
      content,
      number: page,
      numberOfElements: content.length,
      first: page === 0,
      last: page >= totalPages - 1,
      empty: content.length === 0,
    });
  }

  let match = path.match(/^\/api\/v1\/activities\/([^/]+)\/trackpoints$/);
  if (method === 'GET' && match) {
    const resolution = url.searchParams.get('resolution') ?? 'medium';
    return send(res, 200, trackpoints(decodeURIComponent(match[1]), resolution));
  }

  if (method === 'GET' && path === '/api/v1/activities/elevation-coverage') {
    const total = Math.max(1, activities().length * 3200);
    const withElevation = Math.round(total * 0.9388);
    const flatElevation = Math.round(total * 0.0158);
    return send(res, 200, {
      totalTrackpoints: total,
      trackpointsWithElevation: withElevation,
      trackpointsMissingElevation: total - withElevation,
      trackpointsWithFlatElevation: flatElevation,
      withElevationPercent: 93.88,
      missingElevationPercent: 6.12,
      flatElevationPercent: 1.58,
    });
  }

  match = path.match(/^\/api\/v1\/activities\/([^/]+)$/);
  if (method === 'GET' && match) {
    const id = decodeURIComponent(match[1]);
    const activity = activities().find((a) => a.id === id);
    if (!activity) {
      return send(res, 404, error(404, 'Not Found', `Actividad no encontrada: ${id}`));
    }
    return send(res, 200, activity);
  }

  // --- Borrado de actividades ---
  if (method === 'DELETE' && path === '/api/v1/activities') {
    return send(res, 202, startActivityDeletion());
  }

  match = path.match(/^\/api\/v1\/activities\/delete-status\/([^/]+)$/);
  if (method === 'GET' && match) {
    const status = activityDeletionStatus(decodeURIComponent(match[1]));
    if (!status) {
      return send(
        res,
        404,
        error(404, 'Not Found', 'El vaciado no existe o fue reemplazado por uno más reciente'),
      );
    }
    return send(res, 200, status);
  }

  match = path.match(/^\/api\/v1\/activities\/([^/]+)$/);
  if (method === 'DELETE' && match) {
    const id = decodeURIComponent(match[1]);
    deletedActivityIds.add(id);
    const index = uploadedActivities.findIndex((a) => a.id === id);
    if (index >= 0) {
      uploadedActivities.splice(index, 1);
    }
    return send(res, 200, { message: `Carrera eliminada: ${id}` });
  }

  // --- Analítica por actividad ---
  match = path.match(/^\/api\/v1\/analytics\/([^/]+)\/(splits|hr-zones|training-load|vo2max-vam|cardiac-drift)$/);
  if (method === 'GET' && match) {
    const id = decodeURIComponent(match[1]);
    const kind = match[2];
    if (kind === 'splits') return send(res, 200, splits(id));
    if (kind === 'hr-zones') return send(res, 200, hrZones(id));
    if (kind === 'training-load') {
      return send(res, 200, { activityId: id, trainingLoad: 120.5, edwardsTrimp: 120.5, banisterTrimp: 115.2, hrss: 50.2, effortLevel: 'Moderado' });
    }
    if (kind === 'vo2max-vam') {
      return send(res, 200, {
        activityId: id,
        vo2MaxEstimated: 48.5,
        vamKmH: 13.86,
        fitnessCategory: 'Intermedio / Bueno',
        predictedRaceTimes: { '5k': '00:22:30', '10k': '00:46:15', '21k': '01:42:10', '42k': '03:35:00' },
      });
    }
    return send(res, 200, {
      firstHalfEfficiencyRatio: 0.035,
      secondHalfEfficiencyRatio: 0.033,
      cardiacDriftPercentage: '4.5',
      decouplingStatus: 'Esfuerzo aeróbico estable',
    });
  }

  // --- Archivos ---
  if (method === 'POST' && path === '/api/v1/files/upload') {
    uploadSeq += 1;
    const id = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    allActivitiesDeleted = false;
    uploadedActivities.unshift(createUploadedActivity(id, 'Carrera importada (demo)'));
    return send(res, 201, {
      message: 'Carrera importada y respaldada con éxito',
      activityId: id,
      backupPath: `storage/${id.slice(0, 10)}.tcx`,
      totalPoints: 1250,
      sourceFileType: 'tcx',
    });
  }

  if (method === 'POST' && path === '/api/v1/files/upload-bulk') {
    uploadSeq += 1;
    const uploadId = `mock-upload-${uploadSeq}`;
    uploads.set(uploadId, {
      uploadId,
      filename: 'activities_backup.zip',
      status: 'PROCESSING',
      totalFiles: 3,
      processedFiles: 0,
      pendingFiles: 3,
      successCount: 0,
      errorCount: 0,
      percentMissing: 0,
      progress: 0,
      errors: [],
      startedAt: Date.now(),
      activitiesAdded: false,
    });
    return send(res, 202, publicUpload(uploads.get(uploadId)));
  }

  match = path.match(/^\/api\/v1\/files\/upload-status\/([^/]+)\/stream$/);
  if (method === 'GET' && match) {
    const upload = advanceUpload(decodeURIComponent(match[1]));
    if (!upload) {
      return send(res, 404, error(404, 'Not Found', 'Carga no encontrada'));
    }
    return sendUploadStream(res, req, upload.uploadId);
  }

  match = path.match(/^\/api\/v1\/files\/upload-status\/([^/]+)$/);
  if (method === 'GET' && match) {
    const upload = advanceUpload(decodeURIComponent(match[1]));
    if (!upload) {
      return send(res, 404, error(404, 'Not Found', 'Carga no encontrada'));
    }
    return send(res, 200, publicUpload(upload));
  }

  if (
    method === 'GET' &&
    (path === '/api/v1/files/export-bulk' || path === '/api/v1/files/export-backup-zip')
  ) {
    const backup = path.endsWith('export-backup-zip');
    const payload = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        mode: backup ? 'backup' : 'data',
        activities: activities().slice(0, 5),
      },
      null,
      2,
    );
    const zip = zipStore(backup ? 'backups.json' : 'activities.json', payload);
    return sendBinary(
      res,
      200,
      zip,
      'application/zip',
      backup ? 'running-respaldos-demo.zip' : 'running-datos-demo.zip',
    );
  }

  // --- Exportación geoespacial ---
  match = path.match(/^\/api\/v1\/geo\/([^/]+)\/(gpx|geojson)$/);
  if (method === 'GET' && match) {
    const id = decodeURIComponent(match[1]);
    const activity = activities().find((item) => item.id === id);
    if (!activity) {
      return send(res, 404, error(404, 'Not Found', `Actividad no encontrada: ${id}`));
    }
    const points = trackpoints(id, 'low').filter(
      (point) => point.latitude !== null && point.longitude !== null,
    );
    if (match[2] === 'gpx') {
      const track = points
        .map(
          (point) =>
            `<trkpt lat="${point.latitude}" lon="${point.longitude}"><ele>${point.altitudeMeters ?? 0}</ele><time>${point.timestamp}</time></trkpt>`,
        )
        .join('');
      const xml = `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="running-mock" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${activity.name}</name><trkseg>${track}</trkseg></trk></gpx>`;
      return sendText(res, 200, xml, 'application/gpx+xml', `attachment; filename="${activity.id}.gpx"`);
    }
    return send(res, 200, {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: points.map((point) => [
              point.longitude,
              point.latitude,
              point.altitudeMeters ?? 0,
            ]),
          },
          properties: {
            id: activity.id,
            name: activity.name,
            distanceMeters: activity.distanceMeters,
            sourceFileType: activity.sourceFileType,
          },
        },
      ],
    });
  }

  // --- MCP (JSON-RPC + SSE) ---
  if (method === 'POST' && path === '/mcp') {
    const rpcId = body?.id ?? null;
    const rpcMethod = body?.method;
    const mcpHeaders = { 'Mcp-Session-Id': mcpSessionId };
    if (rpcMethod === 'initialize') {
      return send(
        res,
        200,
        {
          jsonrpc: '2.0',
          id: rpcId,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'running-tracker-mock', version: '1.0.0' },
          },
        },
        mcpHeaders,
      );
    }
    if (rpcMethod === 'notifications/initialized') {
      return send(res, 202, null, mcpHeaders);
    }
    if (rpcMethod === 'ping') {
      return send(res, 200, { jsonrpc: '2.0', id: rpcId, result: {} }, mcpHeaders);
    }
    if (rpcMethod === 'tools/list') {
      return send(
        res,
        200,
        {
          jsonrpc: '2.0',
          id: rpcId,
          result: { tools: mcpTools() },
        },
        mcpHeaders,
      );
    }
    if (rpcMethod === 'tools/call') {
      const name = body?.params?.name;
      const args = body?.params?.arguments ?? {};
      let result;
      if (name === 'get_summary') {
        result = summary();
      } else if (name === 'get_records') {
        result = records();
      } else if (name === 'list_activities') {
        result = activities().slice(0, Number(args?.limit ?? 5));
      } else if (name === 'get_activity') {
        result = activities().find((activity) => activity.id === args?.id) ?? null;
      } else {
        return send(
          res,
          200,
          { jsonrpc: '2.0', id: rpcId, error: { code: -32602, message: `Tool no encontrada: ${name}` } },
          mcpHeaders,
        );
      }
      return send(
        res,
        200,
        {
          jsonrpc: '2.0',
          id: rpcId,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] },
        },
        mcpHeaders,
      );
    }
    return send(
      res,
      200,
      { jsonrpc: '2.0', id: rpcId, error: { code: -32601, message: `Método no soportado: ${rpcMethod}` } },
      mcpHeaders,
    );
  }

  if (method === 'GET' && path === '/mcp') {
    return sendMcpStream(res);
  }

  return send(res, 404, error(404, 'Not Found', `Ruta no simulada: ${path}`));
}

/* ------------------------------------------------------------------ */
/* Datos deterministas                                                 */
/* ------------------------------------------------------------------ */

let userEmail = 'runner@example.com';

/* Estado de demostración para borrados, cargas y sesiones MCP. */
const deletedActivityIds = new Set();
const uploadedActivities = [];
let allActivitiesDeleted = false;
let uploadSeq = 0;
const uploads = new Map();
const mcpSessionId = 'mock-mcp-session-0001';

/* Vaciado asíncrono: solo se conserva el último trabajo de cada usuario. */
const DELETION_DURATION_MS = 2500;
let deletionJob = null;

/* Claves de API en memoria (el valor `key` solo se devuelve al crearlas). */
let apiKeySeq = 4;
const apiKeys = [
  {
    id: 1,
    name: 'n8n',
    key: 'rk_N8nAutomation7Fq2LmXp0RtYvBc4DeHjKw',
    keyPrefix: 'rk_N8nAuto',
    createdAt: '2026-08-02T09:14:00.000Z',
    expiresAt: null,
    lastUsedAt: '2026-10-15T07:02:11.000Z',
  },
  {
    id: 2,
    name: 'cron-backup',
    key: 'rk_CronBackup5Zs8QwEr1Ty3UiOp2AsDfGh',
    keyPrefix: 'rk_CronBa',
    createdAt: '2026-09-20T18:40:00.000Z',
    expiresAt: '2026-12-19T18:40:00.000Z',
    lastUsedAt: null,
  },
  {
    id: 3,
    name: 'script-antiguo',
    key: 'rk_ScriptOld9Pl4KjHg6Fd3Sa10MzXcVbNm',
    keyPrefix: 'rk_ScriptO',
    createdAt: '2025-01-10T10:00:00.000Z',
    expiresAt: '2025-12-31T10:00:00.000Z',
    lastUsedAt: '2025-06-01T09:00:00.000Z',
  },
];

function apiKeyList() {
  return apiKeys.map(({ key, ...meta }) => meta);
}

function generateApiKey() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let secret = '';
  for (let i = 0; i < 40; i++) {
    secret += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `rk_${secret}`;
}

function startActivityDeletion() {
  const total = activities().length;
  deletionJob = {
    deleteId: randomUUID(),
    status: total === 0 ? 'COMPLETED' : 'PROCESSING',
    totalActivities: total,
    deletedActivities: 0,
    progressPercent: total === 0 ? 100 : 0,
    message: total === 0 ? 'No hay actividades que eliminar' : 'Vaciado en proceso',
    error: null,
    startedAt: Date.now(),
    finalized: total === 0,
  };
  return publicActivityDeletion();
}

function activityDeletionStatus(deleteId) {
  if (!deletionJob || deletionJob.deleteId !== deleteId) {
    return null;
  }
  return publicActivityDeletion();
}

function publicActivityDeletion() {
  if (!deletionJob) {
    return null;
  }
  const job = deletionJob;
  if (!job.finalized) {
    const ratio = Math.min(1, (Date.now() - job.startedAt) / DELETION_DURATION_MS);
    job.deletedActivities = Math.min(
      job.totalActivities,
      Math.round(job.totalActivities * ratio),
    );
    job.progressPercent = Math.round(ratio * 1000) / 10;
    if (ratio >= 1) {
      job.deletedActivities = job.totalActivities;
      job.progressPercent = 100;
      job.status = 'COMPLETED';
      job.message = 'Vaciado completado';
      job.finalized = true;
      allActivitiesDeleted = true;
      deletedActivityIds.clear();
      uploadedActivities.length = 0;
    }
  }
  return {
    deleteId: job.deleteId,
    status: job.status,
    totalActivities: job.totalActivities,
    deletedActivities: job.deletedActivities,
    progressPercent: job.progressPercent,
    message: job.message,
    error: job.error,
  };
}

function authPayload(email) {
  userEmail = email;
  const now = Math.floor(Date.now() / 1000);
  const user = { id: 1, email, role: 'USER' };
  return {
    token: jwt({ sub: '1', email, role: 'USER', type: 'ACCESS', iat: now, exp: now + ACCESS_TTL }),
    tokenType: 'Bearer',
    expiresInSeconds: ACCESS_TTL,
    refreshToken: jwt({ sub: '1', type: 'REFRESH', iat: now, exp: now + REFRESH_TTL }),
    refreshExpiresInSeconds: REFRESH_TTL,
    user,
  };
}

function authorized(req) {
  const header = req.headers['authorization'] ?? '';
  if (header.startsWith('Bearer ')) {
    const payload = decodeJwt(header.slice(7));
    if (payload && (payload.exp ?? 0) > Date.now() / 1000) {
      return true;
    }
  }
  // Alternativa al JWT: cabecera X-Api-Key con una clave vigente.
  const apiKey = req.headers['x-api-key'];
  return (
    typeof apiKey === 'string' &&
    apiKeys.some((k) => k.key === apiKey && (!k.expiresAt || new Date(k.expiresAt).getTime() > Date.now()))
  );
}

function activities() {
  if (allActivitiesDeleted) {
    return [];
  }
  const names = [
    'Rodaje matutino',
    'Intervalos 8x400',
    'Tirada larga de domingo',
    'Series en cuesta',
    'Progresivo 10K',
    'Recuperación suave',
    'Fartlek junto al río',
    'Tempo run 6K',
    'Cuestas cortas',
    'Rodaje nocturno',
  ];
  const sources = ['tcx', 'gpx', 'fit'];
  const list = [];
  const today = new Date();
  today.setHours(21, 0, 0, 0);

  // ~10 meses de historial con patrón realista: descansos, dobles sesiones y tiradas largas.
  for (let back = 0; back < 320; back++) {
    const day = addDays(today, -back);
    const dayRand = mulberry32(90401 + back * 7919);
    const dow = day.getDay(); // 0 domingo … 6 sábado
    const runProbability = dow === 0 ? 0.82 : dow === 6 ? 0.88 : dow === 1 ? 0.35 : 0.66;
    if (dayRand() > runProbability) continue;

    const runs = dayRand() > 0.94 ? 2 : 1;
    for (let r = 0; r < runs; r++) {
      const rand = mulberry32(1337 + back * 131 + r * 17);
      const isLong = runs === 1 && rand() > 0.84;
      const distance = isLong ? 17000 + rand() * 13000 : 5000 + rand() * 11000;
      const pace = 4.5 + rand() * 1.25; // min/km
      const timeSeconds = pace * 60 * (distance / 1000);
      const elevationGain = Math.round(rand() * (isLong ? 420 : 240)) + 20;
      const avgHr = Math.round(136 + rand() * 28);
      const maxHr = avgHr + Math.round(6 + rand() * 14);
      const start = new Date(day);
      start.setHours(
        r === 0 ? 7 + Math.floor(rand() * 3) : 18 + Math.floor(rand() * 2),
        Math.floor(rand() * 60),
        Math.floor(rand() * 60),
        0,
      );
      const id = start.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const i = back + r;
      list.push({
        id,
        userId: 1,
        name: names[i % names.length],
        startTime: id,
        distanceMeters: Math.round(distance),
        totalTimeSeconds: Math.round(timeSeconds),
        avgSpeed: 1000 / (pace * 60),
        maxSpeed: 1000 / ((pace - 0.9 - rand() * 0.4) * 60),
        avgHeartRate: avgHr,
        maxHeartRate: maxHr,
        avgCadence: Math.round(168 + rand() * 12),
        maxCadence: Math.round(184 + rand() * 8),
        avgPaceMinPerKm: Number(pace.toFixed(2)),
        maxPaceMinPerKm: Number((pace - 0.9 - rand() * 0.4).toFixed(2)),
        trainingLoad: Math.round(40 + rand() * 140),
        vo2MaxEstimated: Number((44 + rand() * 8).toFixed(1)),
        vamKmH: Number((12 + rand() * 4).toFixed(2)),
        totalCalories: Math.round((distance / 1000) * 62),
        elevationGain,
        elevationLoss: elevationGain - Math.round(rand() * 40),
        backupFilePath: `storage/${id.slice(0, 10)}.${sources[i % 3]}`,
        sourceFileType: sources[i % 3],
        extraData: JSON.stringify({ device: 'Garmin Forerunner 965', sport: 'RUNNING', manufacturer: 'GARMIN' }),
        createdAt: id,
      });
    }
  }

  // Orden descendente por fecha (el más reciente primero).
  return [...uploadedActivities, ...list]
    .filter((activity) => !deletedActivityIds.has(activity.id))
    .sort((a, b) => (a.startTime < b.startTime ? 1 : a.startTime > b.startTime ? -1 : 0));
}

function summary() {
  const all = activities();
  if (all.length === 0) {
    return {
      totalActivities: 0,
      totalDistanceMeters: 0,
      totalDistanceKm: 0,
      totalTimeSeconds: 0,
      totalTimeFormatted: '0:00:00',
      totalElevationGain: 0,
      totalCalories: 0,
      avgDistanceKm: 0,
      maxHeartRateGlobal: 0,
    };
  }
  const totalDistanceMeters = all.reduce((acc, a) => acc + a.distanceMeters, 0);
  const totalTimeSeconds = all.reduce((acc, a) => acc + a.totalTimeSeconds, 0);
  const totalElevationGain = all.reduce((acc, a) => acc + a.elevationGain, 0);
  const totalCalories = all.reduce((acc, a) => acc + a.totalCalories, 0);
  const maxHeartRateGlobal = Math.max(...all.map((a) => a.maxHeartRate));
  const hours = Math.floor(totalTimeSeconds / 3600);
  const minutes = Math.floor((totalTimeSeconds % 3600) / 60);
  const seconds = Math.round(totalTimeSeconds % 60);
  return {
    totalActivities: all.length,
    totalDistanceMeters,
    totalDistanceKm: Number((totalDistanceMeters / 1000).toFixed(2)),
    totalTimeSeconds: Math.round(totalTimeSeconds),
    totalTimeFormatted: `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    totalElevationGain,
    totalCalories,
    avgDistanceKm: Number((totalDistanceMeters / 1000 / all.length).toFixed(2)),
    maxHeartRateGlobal,
  };
}

function records() {
  const all = activities();
  if (all.length === 0) {
    return [];
  }
  const base = all[1] ?? all[0];
  return [
    { distanceCategory: '1k', targetDistanceMeters: 1000, bestTimeSeconds: 252, bestTimeFormatted: '00:04:12', activityId: base.id, activityDate: base.startTime, avgSpeed: 3.97, avgPaceMinPerKm: 4.2 },
    { distanceCategory: '5k', targetDistanceMeters: 5000, bestTimeSeconds: 1355, bestTimeFormatted: '00:22:35', activityId: base.id, activityDate: base.startTime, avgSpeed: 3.69, avgPaceMinPerKm: 4.52 },
    { distanceCategory: '10k', targetDistanceMeters: 10000, bestTimeSeconds: 2772, bestTimeFormatted: '00:46:12', activityId: base.id, activityDate: base.startTime, avgSpeed: 3.61, avgPaceMinPerKm: 4.62 },
    { distanceCategory: '15k', targetDistanceMeters: 15000, bestTimeSeconds: 4263, bestTimeFormatted: '01:11:03', activityId: base.id, activityDate: base.startTime, avgSpeed: 3.52, avgPaceMinPerKm: 4.74 },
    { distanceCategory: '21k', targetDistanceMeters: 21097, bestTimeSeconds: 6130, bestTimeFormatted: '01:42:10', activityId: base.id, activityDate: base.startTime, avgSpeed: 3.44, avgPaceMinPerKm: 4.84 },
  ];
}

function pmc(start, end) {
  const points = [];
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  for (let d = new Date(startDate), i = 0; d <= endDate; d = addDays(d, 1), i++) {
    const ctl = 52 + 10 * Math.sin(i / 9) + 2 * Math.sin(i / 2.3);
    const atl = 62 + 18 * Math.sin(i / 6 + 1) + 6 * Math.sin(i / 1.7);
    const tsb = ctl - atl;
    points.push({
      date: isoDate(d),
      dailyTrimp: Math.max(0, Math.round(55 + 45 * Math.sin(i / 3) + 15 * Math.sin(i / 1.1))),
      ctl: Number(ctl.toFixed(2)),
      atl: Number(atl.toFixed(2)),
      tsb: Number(tsb.toFixed(2)),
      acwr: Number((atl / ctl).toFixed(2)),
    });
  }
  return points;
}

function splits(id) {
  const activity = activities().find((a) => a.id === id) ?? activities()[0];
  const totalKm = Math.ceil(activity.distanceMeters / 1000);
  const pace = activity.avgPaceMinPerKm;
  const list = [];
  for (let km = 1; km <= totalKm; km++) {
    const rand = mulberry32(km * 37 + totalKm);
    const splitPace = Number((pace + (rand() - 0.5) * 0.6).toFixed(1));
    list.push({
      km,
      distanceMeters: 1000,
      timeSeconds: Math.round(splitPace * 60),
      paceMinPerKm: splitPace.toFixed(1),
      avgHeartRate: Math.round((activity.avgHeartRate ?? 150) + (rand() - 0.4) * 12),
    });
  }
  return list;
}

function hrZones(id) {
  const activity = activities().find((a) => a.id === id) ?? activities()[0];
  const total = activity.totalTimeSeconds;
  const defs = [
    ['Z1_Recovery', 18.5],
    ['Z2_Endurance', 43.4],
    ['Z3_Tempo', 22.2],
    ['Z4_Threshold', 11.6],
    ['Z5_Anaerobic', 4.3],
  ];
  const zones = {};
  let assigned = 0;
  defs.forEach(([key, percentage], index) => {
    const seconds =
      index === defs.length - 1 ? total - assigned : Math.round((total * percentage) / 100);
    assigned += seconds;
    zones[key] = { seconds, percentage };
  });
  return { maxHrUsed: 185, zones };
}

function trackpoints(id, resolution) {
  const count = resolution === 'low' ? 120 : resolution === 'high' ? 420 : 260;
  const activity = activities().find((a) => a.id === id) ?? activities()[0];
  const seed = hashString(id);
  const rand = mulberry32(seed);
  // Firma espacial por actividad: cada salida recorre una zona distinta
  // alrededor de Madrid (centro, rotación, radio, estiramiento y lóbulos
  // derivados del seed), para que el mapa de calor agregado tenga riqueza.
  const centerLat = 40.4168 + (rand() - 0.5) * 0.045;
  const centerLon = -3.7038 + (rand() - 0.5) * 0.06;
  const rotation = rand() * Math.PI * 2;
  const radius = 0.004 + rand() * 0.009;
  const stretch = 1.15 + rand() * 0.85;
  const lobes = 2 + Math.floor(rand() * 3);
  const phase = rand() * Math.PI * 2;
  const cosRot = Math.cos(rotation);
  const sinRot = Math.sin(rotation);
  const totalDistance = activity.distanceMeters;
  const baseHr = activity.avgHeartRate ?? 150;
  const start = new Date(activity.startTime).getTime();
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const r = radius * (0.75 + 0.25 * Math.sin(lobes * t + phase));
    const x = r * Math.sin(t);
    const y = r * stretch * Math.cos(t);
    const dLat = x * cosRot - y * sinRot;
    const dLon = x * sinRot + y * cosRot;
    points.push({
      id: i + 1,
      timestamp: new Date(start + (i / count) * activity.totalTimeSeconds * 1000).toISOString(),
      latitude: Number((centerLat + dLat + (rand() - 0.5) * 0.0003).toFixed(6)),
      longitude: Number((centerLon + dLon + (rand() - 0.5) * 0.0003).toFixed(6)),
      altitudeMeters: Number((650 + 25 * Math.sin(2 * t) + rand() * 6).toFixed(1)),
      distanceMeters: Number(((i / count) * totalDistance).toFixed(1)),
      heartRate: Math.round(baseHr + 12 * Math.sin(t * 2) + (rand() - 0.5) * 8),
      cadence: Math.round(172 + 6 * Math.sin(t) + (rand() - 0.5) * 4),
      speed: Number((activity.avgSpeed * (0.95 + rand() * 0.1)).toFixed(2)),
    });
  }
  return points;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, X-Api-Key, Mcp-Session-Id, MCP-Protocol-Version',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id',
    'Cache-Control': 'no-store',
  };
}

function send(res, status, data, extraHeaders = {}) {
  const headers = { ...corsHeaders(), ...extraHeaders };
  if (data === null) {
    res.writeHead(status, headers);
    return res.end();
  }
  const payload = JSON.stringify(data);
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json' });
  res.end(payload);
}

function sendBinary(res, status, buffer, contentType, filename) {
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.end(buffer);
}

function sendText(res, status, text, contentType, contentDisposition) {
  const buffer = Buffer.from(text, 'utf8');
  res.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': `${contentType}; charset=utf-8`,
    'Content-Length': buffer.length,
    ...(contentDisposition ? { 'Content-Disposition': contentDisposition } : {}),
  });
  res.end(buffer);
}

function publicUpload(upload) {
  if (!upload) {
    return null;
  }
  const { startedAt, activitiesAdded, ...status } = upload;
  return status;
}

function advanceUpload(uploadId) {
  const upload = uploads.get(uploadId);
  if (!upload) {
    return null;
  }
  if (upload.status === 'COMPLETED' || upload.status === 'FAILED') {
    return upload;
  }
  const elapsed = Date.now() - upload.startedAt;
  const processed = Math.min(upload.totalFiles, Math.floor(elapsed / 650));
  upload.processedFiles = processed;
  upload.pendingFiles = upload.totalFiles - processed;
  upload.successCount = processed;
  upload.progress = Math.round((processed / upload.totalFiles) * 100);
  upload.status = processed >= upload.totalFiles ? 'COMPLETED' : 'PROCESSING';

  if (upload.status === 'COMPLETED' && !upload.activitiesAdded) {
    upload.activitiesAdded = true;
    allActivitiesDeleted = false;
    const now = Date.now();
    uploadedActivities.unshift(
      createUploadedActivity(
        new Date(now).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        'Carrera del ZIP (demo 1)',
      ),
      createUploadedActivity(
        new Date(now + 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        'Carrera del ZIP (demo 2)',
      ),
    );
  }
  return upload;
}

function sendUploadStream(res, req, uploadId) {
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  let timer = null;

  const tick = () => {
    if (closed) {
      return;
    }
    const upload = advanceUpload(uploadId);
    if (!upload) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'Carga no encontrada' })}\n\n`);
      closed = true;
      res.end();
      return;
    }
    res.write(`event: status\ndata: ${JSON.stringify(publicUpload(upload))}\n\n`);
    if (upload.status === 'COMPLETED' || upload.status === 'FAILED') {
      closed = true;
      res.end();
    }
  };

  tick();
  if (!closed) {
    timer = setInterval(tick, 650);
  }
  req.on('close', () => {
    closed = true;
    if (timer) {
      clearInterval(timer);
    }
  });
}

function sendMcpStream(res) {
  res.writeHead(200, {
    ...corsHeaders(),
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(
    `event: ready\ndata: ${JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/ready',
      params: { sessionId: mcpSessionId, server: 'running-tracker-mock' },
    })}\n\n`,
  );
  res.write(
    `event: message\ndata: ${JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: 'info', data: 'Stream MCP de demostración conectado' },
    })}\n\n`,
  );
  const timer = setTimeout(() => res.end(), 1200);
  res.on('close', () => clearTimeout(timer));
}

function mcpTools() {
  return [
    {
      name: 'get_summary',
      description: 'Resumen acumulado de entrenamientos del usuario.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'get_records',
      description: 'Récords personales por distancia.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
      name: 'list_activities',
      description: 'Lista las actividades más recientes.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 20 } },
        additionalProperties: false,
      },
    },
    {
      name: 'get_activity',
      description: 'Devuelve una actividad por su ID.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  ];
}

function createUploadedActivity(id, name) {
  return {
    id,
    userId: 1,
    name,
    startTime: id,
    distanceMeters: 10000,
    totalTimeSeconds: 3000,
    avgSpeed: 3.33,
    maxSpeed: 4.2,
    avgHeartRate: 150,
    maxHeartRate: 172,
    avgCadence: 176,
    maxCadence: 186,
    avgPaceMinPerKm: 5,
    maxPaceMinPerKm: 4.2,
    trainingLoad: 80,
    vo2MaxEstimated: 48.5,
    vamKmH: 13.5,
    totalCalories: 620,
    elevationGain: 85,
    elevationLoss: 80,
    backupFilePath: `storage/uploaded-${id.slice(0, 10)}.tcx`,
    sourceFileType: 'tcx',
    extraData: JSON.stringify({ device: 'Mock upload', sport: 'RUNNING' }),
    createdAt: id,
  };
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP mínimo (método store) con un único archivo, para las descargas demo. */
function zipStore(filename, content) {
  const name = Buffer.from(filename, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(local.length + name.length + data.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, name, data, central, name, eocd]);
}

function error(status, name, message, path = '') {
  return { timestamp: new Date().toISOString(), status, error: name, message, path };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

function jwt(payload) {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.mock-signature-${Date.now().toString(36)}`;
}

function decodeJwt(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

server.listen(PORT, () => {
  console.log(`[mock-api] Running Tracker mock escuchando en http://localhost:${PORT}`);
  console.log('[mock-api] Usa cualquier email/contraseña. URL base API: http://localhost:' + PORT);
});
