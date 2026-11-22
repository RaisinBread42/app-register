import {NextRequest} from 'next/server';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ENV} from '@/lib/constants';
import {proxy} from './proxy';

const PASSWORD = 'correct horse battery staple';

function visit(path: string, authorization?: string) {
  const headers = authorization ? {authorization} : undefined;
  return proxy(new NextRequest(`http://register.test${path}`, {headers}));
}

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

/** A response the proxy lets through to the page carries Next's "continue" marker. */
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

describe('UI shared-password Basic auth', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('a UI page without the right password is refused with a Basic auth challenge', () => {
    vi.stubEnv(ENV.uiPassword, PASSWORD);

    for (const authorization of [undefined, basic('it', 'wrong'), basic('it', ''), `Bearer ${PASSWORD}`, 'Basic !!!']) {
      const response = visit('/applications', authorization);
      expect(response.status, String(authorization)).toBe(401);
      expect(response.headers.get('www-authenticate')).toMatch(/^Basic realm=/);
      expect(passedThrough(response)).toBe(false);
    }
  });

  it('the right password opens the UI with any username, including a password that contains a colon', () => {
    vi.stubEnv(ENV.uiPassword, `${PASSWORD}:2026`);

    expect(passedThrough(visit('/applications', basic('anyone', `${PASSWORD}:2026`)))).toBe(true);
    expect(passedThrough(visit('/people', basic('', `${PASSWORD}:2026`)))).toBe(true);
  });

  it('the UI fails closed when UI_PASSWORD is not set', () => {
    vi.stubEnv(ENV.uiPassword, '');

    const response = visit('/', basic('anyone', ''));

    expect(response.status).toBe(503);
    expect(passedThrough(response)).toBe(false);
  });

  it('the JSON API is never behind the UI password, but a look-alike path is', () => {
    vi.stubEnv(ENV.uiPassword, PASSWORD);

    expect(passedThrough(visit('/api/apps'))).toBe(true);
    expect(passedThrough(visit('/api'))).toBe(true);
    expect(visit('/apifoo').status).toBe(401);
    expect(visit('/applications/api/x').status).toBe(401);
    expect(visit('/apps').status).toBe(401);
  });
});
