import {notFound} from 'next/navigation';

/** Any path no other route matches: shows the register's own not-found page inside the shell. */
export default function MissingPage() {
  notFound();
}
