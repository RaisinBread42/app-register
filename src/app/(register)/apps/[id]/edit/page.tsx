import {redirect} from 'next/navigation';
import {editAppRoute} from '@/lib/constants';

/** The first UI's edit page moved to /applications/:id/edit. */
export default async function LegacyEditAppPage({params}: {params: Promise<{id: string}>}) {
  redirect(editAppRoute((await params).id));
}
