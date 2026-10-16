/** Response of `GET /health`, mirrored from the API's health controller. */
export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}
