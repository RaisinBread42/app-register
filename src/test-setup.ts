import {vi} from 'vitest';

/**
 * Unit tests never touch the network: every outbound feed request fails here
 * unless a test hands the hosting check its own `fetchText`.
 */
vi.mock('@/lib/monitoring/http', () => ({
  fetchText: vi.fn(async () => {
    throw new Error('no network in tests');
  }),
}));
