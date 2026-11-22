import {RegisterShell} from './_components/RegisterShell';

/** Every register page reads live data from the API on each request. */
export const dynamic = 'force-dynamic';

export default function RegisterLayout({children}: {children: React.ReactNode}) {
  return <RegisterShell>{children}</RegisterShell>;
}
