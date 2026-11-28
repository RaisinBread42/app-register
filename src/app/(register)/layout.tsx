import {apiClient} from '@/lib/ui/api-client';
import {openCount} from '@/lib/ui/notice-inbox';
import {RegisterShell} from './_components/RegisterShell';

/** Every register page reads live data from the API on each request. */
export const dynamic = 'force-dynamic';

export default async function RegisterLayout({children}: {children: React.ReactNode}) {
  return <RegisterShell openNotices={await openNoticeCount()}>{children}</RegisterShell>;
}

/** Notices that need attention, for the side nav; the nav simply shows no count if the API is unreachable. */
async function openNoticeCount(): Promise<number | null> {
  try {
    return openCount(await apiClient().listNotices());
  } catch {
    return null;
  }
}
