/**
 * DTOs generados a partir de `api-docs.json` (Running Tracker & Analytics API v1.4.0).
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
/* Mantenimiento de trackpoints                                        */
/* ------------------------------------------------------------------ */

export interface TrackpointCompletionResultDto {
  activityId: string;
  totalTrackpoints: number;
  latitudeFilled: number;
  longitudeFilled: number;
  altitudeFilled: number;
  heartRateFilled: number;
  cadenceFilled: number;
  speedFilled: number;
  heartRateRemoved: number;
  cadenceRemoved: number;
  speedRemoved: number;
  totalRemoved: number;
  distanceAdjusted: number;
  distanceDiscardedMeters: number;
  externalElevationUsed: boolean;
  altitudeSource: string;
  message: string;
}

export interface TrackpointMetricsCompletionResultDto {
  activityId: string;
  totalTrackpoints: number;
  heartRateFilled: number;
  cadenceFilled: number;
  speedFilled: number;
  heartRateRemoved: number;
  cadenceRemoved: number;
  speedRemoved: number;
  totalFilled: number;
  totalRemoved: number;
  distanceAdjusted: number;
  distanceDiscardedMeters: number;
  message: string;
}

export interface TrackpointMetricsBatchCompletionResultDto {
  activitiesFound: number;
  activitiesProcessed: number;
  activitiesUpdated: number;
  activitiesWithoutTrackpoints: number;
  activitiesFailed: number;
  totalTrackpoints: number;
  heartRateFilled: number;
  cadenceFilled: number;
  speedFilled: number;
  heartRateRemoved: number;
  cadenceRemoved: number;
  speedRemoved: number;
  totalFilled: number;
  totalRemoved: number;
  distanceAdjusted: number;
  distanceDiscardedMeters: number;
  errors: Record<string, string>;
  message: string;
}

export interface ElevationCoverageDto {
  totalTrackpoints: number;
  trackpointsWithElevation: number;
  trackpointsMissingElevation: number;
  withElevationPercent: number;
  missingElevationPercent: number;
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
  DANGER: 'RIESGO ALTO',
  OVERLOAD: 'SOBRECARGA',
};
