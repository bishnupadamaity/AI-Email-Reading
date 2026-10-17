import {
  type AnalysisDetail,
  type CreateEmail,
  type EmailDetail,
  type EmailSummary,
  type Paginated,
  type PaginationQuery,
} from '@email-ai/contracts';
import { ANALYZE_TIMEOUT_MS, apiClient, toApiError } from '../api-client';

/** `GET /v1/emails` — the only parameters the endpoint accepts. */
export async function fetchEmails(query: PaginationQuery): Promise<Paginated<EmailSummary>> {
  try {
    const { data } = await apiClient.get<Paginated<EmailSummary>>('/v1/emails', {
      params: { page: query.page, pageSize: query.pageSize },
    });
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** `GET /v1/emails/:id` — includes the body and a reference to the latest analysis. */
export async function fetchEmail(id: string): Promise<EmailDetail> {
  try {
    const { data } = await apiClient.get<EmailDetail>(`/v1/emails/${id}`);
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** `POST /v1/emails` — ingests one email and its pending analysis record. */
export async function createEmail(body: CreateEmail): Promise<EmailDetail> {
  try {
    const { data } = await apiClient.post<EmailDetail>('/v1/emails', body);
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * `POST /v1/emails/:id/analyze` — runs extraction synchronously.
 *
 * A `200` means the run was performed and recorded, not that it succeeded:
 * callers must read `status` and treat `failed` as a failure.
 */
export async function analyzeEmail(id: string): Promise<AnalysisDetail> {
  try {
    const { data } = await apiClient.post<AnalysisDetail>(`/v1/emails/${id}/analyze`, undefined, {
      timeout: ANALYZE_TIMEOUT_MS,
    });
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}
