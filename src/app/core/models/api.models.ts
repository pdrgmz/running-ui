/**
 * DTOs generados a partir de `api-docs.json` (Running Tracker & Analytics API v1.7.0).
 * Los campos marcados como opcionales pueden no venir informados por el servidor.
 */

/* ------------------------------------------------------------------ */
/* Autenticación                                                       */
/* ------------------------------------------------------------------ */

export interface UserResponseDto {
  id: number;
  email: string;
  role: string;
}

export interface AuthResponseDto {
  token: string;
  tokenType: string;
  expiresInSeconds: number;
  refreshToken: string;
  refreshExpiresInSeconds: number;
  user: UserResponseDto;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface RegisterRequestDto {
  email: string;
  password: string;
}

export interface RefreshTokenRequestDto {
  refreshToken: string;
}

export interface ErrorResponseDto {
  timestamp?: string;
  status?: number;
  error?: string;
  message?: string;
  path?: string;
}

/** Payload decodificado de un JWT (no verificado criptográficamente). */
export interface JwtPayload {
  sub?: string;
  iat?: number;
  exp?: number;
  type?: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Claves de API                                                       */
/* ------------------------------------------------------------------ */

export interface CreateApiKeyRequestDto {
  /** Nombre descriptivo para identificar la clave (ej. "n8n"). */
  name: string;
  /** Días de vigencia (1–3650). Si se omite, la clave no caduca. */
  expiresInDays?: number;
}

/** Metadatos de una clave de API (sin su valor secreto). */
export interface ApiKeyResponseDto {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

/** Clave recién creada: el campo `key` solo se muestra en esta respuesta. */
export interface ApiKeyCreatedResponseDto extends ApiKeyResponseDto {
  key: string;
}

/* ------------------------------------------------------------------ */
/* Estadísticas y récords                                              */
/* ------------------------------------------------------------------ */

/** Periodos predefinidos aceptados por GET /api/v1/stats/summary. */
export type SummaryPeriod = 'THIS_MONTH' | 'LAST_MONTH' | 'THIS_YEAR' | 'LAST_YEAR';

export interface SummaryStatsDto {
  totalActivities: number;
  totalDistanceMeters: number;
  totalDistanceKm: number;
  totalTimeSeconds: number;
  totalTimeFormatted: string;
  totalElevationGain: number;
  totalCalories: number;
  avgDistanceKm: number;
  maxHeartRateGlobal: number;
}

export interface RecordResponseDto {
  distanceCategory: string;
  targetDistanceMeters: number;
  bestTimeSeconds: number;
  bestTimeFormatted: string;
  activityId: string;
  activityDate: string;
  avgSpeed: number;
  avgPaceMinPerKm: number;
}

/* ------------------------------------------------------------------ */
/* Analítica deportiva                                                 */
/* ------------------------------------------------------------------ */

export interface PmcPointDto {
  date: string;
  dailyTrimp: number;
  ctl: number;
  atl: number;
  tsb: number;
  acwr: number;
  /** Carga crónica de 28 días usada por el ACWR (v1.7.0). */
  chronicLoad28?: number;
}

export interface EddingtonStatsDto {
  eddingtonNumber: number;
  currentCountForNumber: number;
  runsNeededForNext: number;
  nextTargetKm: number;
}

export interface AcwrStatusDto {
  date: string;
  acuteLoad: number;
  chronicLoad: number;
  acwr: number;
  zone: string;
  recommendation: string;
}

export interface RacePredictionsDto {
  '5k': string;
  '10k': string;
  '21k': string;
  '42k': string;
}

export interface Vo2MaxVamResponseDto {
  activityId: string;
  vo2MaxEstimated: number;
  vamKmH: number;
  fitnessCategory: string;
  predictedRaceTimes: RacePredictionsDto;
}

export interface TrainingLoadResponseDto {
  activityId: string;
  trainingLoad: number;
  edwardsTrimp: number;
  banisterTrimp: number;
  hrss: number;
  effortLevel: string;
}

export interface SplitDto {
  km: number;
  distanceMeters: number;
  timeSeconds: number;
  paceMinPerKm: string;
  avgHeartRate: number;
}

export interface HrZoneDetailDto {
  seconds: number;
  percentage: number;
}

export interface HrZonesMapDto {
  Z1_Recovery: HrZoneDetailDto;
  Z2_Endurance: HrZoneDetailDto;
  Z3_Tempo: HrZoneDetailDto;
  Z4_Threshold: HrZoneDetailDto;
  Z5_Anaerobic: HrZoneDetailDto;
}

export interface HrZonesResponseDto {
  maxHrUsed: number;
  zones: HrZonesMapDto;
}

export interface CardiacDriftResponseDto {
  firstHalfEfficiencyRatio?: number;
  secondHalfEfficiencyRatio?: number;
  cardiacDriftPercentage?: string;
  decouplingStatus?: string;
  status?: string;
}

/* ------------------------------------------------------------------ */
/* Entrenamientos (recomendación diaria generada por IA)               */
/* ------------------------------------------------------------------ */

export type TrainingJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';
export type WorkoutType =
  | 'EASY'
  | 'RECOVERY'
  | 'LONG_RUN'
  | 'TEMPO'
  | 'INTERVALS'
  | 'HILLS'
  | 'RACE_PACE'
  | 'RACE'
  | 'CROSS_TRAINING'
  | 'REST'
  | 'OTHER';

/** Preferencias para la generación automática de la recomendación diaria. */
export interface TrainingPreferencesDto {
  configured: boolean;
  /** `null` en filas antiguas; la API lo normaliza a `false`. */
  enabled: boolean | null;
  timezone: string;
  /** Hora local (0-23) a la que se genera la recomendación. */
  generationHour: number | null;
  notes: string | null;
  updatedAt?: string;
}

/** Actualización de preferencias de la recomendación diaria. */
export interface UpdateTrainingPreferencesRequestDto {
  enabled?: boolean;
  timezone?: string;
  generationHour?: number;
  notes?: string;
}

/** Sesión recomendada para un día. */
export interface DailyWorkoutDto {
  type: WorkoutType;
  title: string;
  description: string | null;
  targetDistanceMeters: number | null;
  targetDurationSeconds: number | null;
  targetPaceMinPerKm: number | null;
  targetHrZone: number | null;
  targetLoad: number | null;
  mainSet: string | null;
}

/** Recomendación de entrenamiento para un día concreto. */
export interface DailyRecommendationResponseDto {
  recommendationId: string;
  userId: number;
  date: string;
  requestId: string;
  summary: string | null;
  analysis: string | null;
  coachNotes: string | null;
  workout: DailyWorkoutDto;
  model: string | null;
  promptVersion: string | null;
  generatedAt: string;
}

/** Resumen de una recomendación diaria para el histórico. */
export interface DailyRecommendationSummaryDto {
  recommendationId: string;
  date: string;
  type: WorkoutType;
  title: string;
  targetDistanceMeters: number | null;
  targetDurationSeconds: number | null;
  targetPaceMinPerKm: number | null;
  targetHrZone: number | null;
  targetLoad: number | null;
  summary: string | null;
  generatedAt: string;
}

export interface GenerateDailyRecommendationRequestDto {
  /** Día a recomendar (yyyy-MM-dd). Por defecto, hoy en la zona del atleta. */
  date?: string;
  /** Sobrescribe la recomendación existente de ese día. */
  replace?: boolean;
}

export interface GenerateDailyRecommendationResponseDto {
  requestId: string;
  date: string;
  status: TrainingJobStatus;
  message?: string;
}

/** Estado de un job de generación de la recomendación diaria. */
export interface DailyGenerationJobResponseDto {
  requestId: string;
  userId: number;
  date: string;
  status: TrainingJobStatus;
  source: string;
  attempts: number;
  recommendationId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DeletedRecommendationsResponseDto {
  deleted: number;
}

export interface DeletedJobsResponseDto {
  deleted: number;
}

/* ------------------------------------------------------------------ */
/* Actividades                                                         */
/* ------------------------------------------------------------------ */

export interface Activity {
  id: string;
  userId: number;
  name: string;
  startTime: string;
  distanceMeters: number;
  totalTimeSeconds: number;
  avgSpeed: number;
  maxSpeed: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgCadence: number | null;
  maxCadence: number | null;
  avgPaceMinPerKm: number;
  maxPaceMinPerKm: number;
  trainingLoad: number | null;
  vo2MaxEstimated: number | null;
  vamKmH: number | null;
  totalCalories: number | null;
  elevationGain: number | null;
  elevationLoss: number | null;
  backupFilePath: string | null;
  sourceFileType: string | null;
  extraData: string | null;
  aiAnalysis: string | null;
  createdAt: string;
}

export interface SortObject {
  empty?: boolean;
  unsorted?: boolean;
  sorted?: boolean;
}

export interface PageableObject {
  offset?: number;
  sort?: SortObject;
  paged?: boolean;
  unpaged?: boolean;
  pageNumber?: number;
  pageSize?: number;
}

export interface PageActivity {
  totalPages: number;
  totalElements: number;
  size: number;
  content: Activity[];
  number: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
  sort?: SortObject;
  pageable?: PageableObject;
}

export interface ActivityTrackpoint {
  id: number;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  altitudeMeters: number | null;
  distanceMeters: number | null;
  heartRate: number | null;
  cadence: number | null;
  speed: number | null;
}

/** Resumen del recálculo masivo de métricas derivadas de las actividades. */
export interface MetricsRecalculationResponseDto {
  activitiesProcessed: number;
  trainingLoadRecalculated: number;
  vo2MaxRecalculated: number;
  athleteMaxHrUsed: number;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/* Archivos e ingesta                                                  */
/* ------------------------------------------------------------------ */

export interface FileUploadResponseDto {
  message: string;
  activityId: string;
  backupPath: string;
  totalPoints: number;
  sourceFileType: string;
}

export interface FileErrorDto {
  fileName: string;
  errorMessage: string;
}

export type BulkUploadState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface BulkUploadStatusDto {
  uploadId: string;
  filename: string;
  status: BulkUploadState | string;
  totalFiles: number;
  processedFiles: number;
  pendingFiles: number;
  successCount: number;
  errorCount: number;
  percentMissing: number;
  progress: number;
  errors: FileErrorDto[];
}

/* ------------------------------------------------------------------ */
/* Cobertura de altitudes                                              */
/* ------------------------------------------------------------------ */

export interface ElevationCoverageDto {
  totalTrackpoints: number;
  trackpointsWithElevation: number;
  trackpointsMissingElevation: number;
  /** Trackpoints descartados por compartir una altitud constante sospechosa. */
  trackpointsWithFlatElevation: number;
  withElevationPercent: number;
  missingElevationPercent: number;
  /** Porcentaje de trackpoints con altitud constante sospechosa. */
  flatElevationPercent: number;
}

/* ------------------------------------------------------------------ */
/* Borrado asíncrono de actividades                                    */
/* ------------------------------------------------------------------ */

export type ActivityDeletionState = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ActivityDeletionStatusDto {
  deleteId: string;
  status: ActivityDeletionState | string;
  totalActivities: number;
  deletedActivities: number;
  progressPercent: number;
  message: string;
  error: string | null;
}

/* ------------------------------------------------------------------ */
/* GeoJSON                                                             */
/* ------------------------------------------------------------------ */

export interface GeoJsonGeometry {
  type: string;
  coordinates: number[][];
}

export interface GeoJsonFeature {
  type: string;
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
}

export interface GeoJsonDto {
  type: string;
  features: GeoJsonFeature[];
}

/* ------------------------------------------------------------------ */
/* MCP (Model Context Protocol)                                        */
/* ------------------------------------------------------------------ */

export interface McpServerInfo {
  name?: string;
  version?: string;
}

export interface McpInitializeResult {
  protocolVersion?: string;
  capabilities?: Record<string, unknown>;
  serverInfo?: McpServerInfo;
  instructions?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolListResult {
  tools: McpTool[];
}

export interface McpContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface McpToolCallResult {
  content?: McpContentBlock[];
  isError?: boolean;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Sesión local                                                        */
/* ------------------------------------------------------------------ */

/** Estado de sesión persistido en localStorage tras login/registro/refresh. */
export interface SessionState {
  token: string;
  tokenType: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  /** Momento (epoch ms) en el que se emitió la sesión desde el cliente. */
  issuedAt: number;
}

/** Nombres legibles de las zonas ACWR devueltas por la API. */
export const ACWR_ZONE_LABELS: Record<string, string> = {
  UNDERTRAINING: 'SUBENTRENAMIENTO',
  SWEET_SPOT: 'ZONA ÓPTIMA',
  CAUTION: 'PRECAUCIÓN',
  HIGH_RISK: 'PRECAUCIÓN',
  DANGER: 'RIESGO ALTO',
  DANGER_ZONE: 'RIESGO ALTO',
  OVERLOAD: 'SOBRECARGA',
  UNDETERMINED: 'SIN DATOS',
};

/* ------------------------------------------------------------------ */
/* Análisis de actividad con IA                                       */
/* ------------------------------------------------------------------ */

export type AnalysisJobState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'TIMEOUT';

export interface AnalyzeActivityResponseDto {
  requestId: string;
  activityId: string;
  status: AnalysisJobState | string;
  message: string;
}

export interface ActivityAnalysisJobResponseDto {
  requestId: string;
  userId: number;
  activityId: string;
  status: AnalysisJobState | string;
  source: string;
  attempts: number;
  analysisResult: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
