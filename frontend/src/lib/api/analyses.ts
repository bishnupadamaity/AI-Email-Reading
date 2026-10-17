import { type AnalysisDetail } from '@email-ai/contracts';
import { apiClient, toApiError } from '../api-client';

/** `GET /v1/analyses/:id` — the only way to read an analysis. There is no list endpoint. */
export async function fetchAnalysis(id: string): Promise<AnalysisDetail> {
  try {
    const { data } = await apiClient.get<AnalysisDetail>(`/v1/analyses/${id}`);
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}
