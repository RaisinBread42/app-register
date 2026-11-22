'use client';

import {redirect} from 'next/navigation';

export default function MockupsIndexPage() {
  redirect('/mockups/overview');
}
