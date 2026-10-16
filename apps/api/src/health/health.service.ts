import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { API_CONFIG, type ApiConfig } from '../config/index.js';

const SERVICE_NAME = 'email-ai-api';
const VERSION = process.env['npm_package_version'] ?? '0.1.0';

export interface LivenessResult {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export type DependencyStatus = 'up' | 'down' | 'disabled';

export interface ReadinessResult {
  status: 'ok';
  dependencies: Record<string, DependencyStatus>;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    // Absent when DATABASE_ENABLED=false, hence optional.
    @Optional() private readonly dataSource?: DataSource,
  ) {}

  liveness(): LivenessResult {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: VERSION,
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      timestamp: new Date().toISOString(),
    };
  }

  async readiness(): Promise<ReadinessResult> {
    const database = await this.checkDatabase();

    if (database === 'down') {
      throw new ServiceUnavailableException({
        status: 'error',
        dependencies: { database },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      dependencies: { database },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Redis is deliberately absent: the queue connection is opened on first
   * dispatch, so a check here would create it just to probe it. It joins this
   * list when the ingestion feature puts the queue on a request path.
   */
  private async checkDatabase(): Promise<DependencyStatus> {
    if (!this.config.database.enabled || !this.dataSource) return 'disabled';

    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
