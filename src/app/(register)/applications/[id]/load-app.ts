import {notFound} from 'next/navigation';
import {HTTP_STATUS} from '@/lib/constants';
import {ApiError, apiClient, type AppDetail} from '@/lib/ui/api-client';

/** One app for a page, or the 404 page when the API does not know it. */
export async function loadApp(id: string): Promise<AppDetail> {
  try {
    return await apiClient().getApp(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_STATUS.notFound) {
      notFound();
    }
    throw error;
  }
}
