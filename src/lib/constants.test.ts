import {describe, expect, it} from 'vitest';
import {APP_KINDS, PRODUCT_NAME, ROUTES} from './constants';

describe('product skeleton constants', () => {
  it('names the product App Register for the home experience', () => {
    expect(PRODUCT_NAME).toBe('App Register');
    expect(ROUTES.home).toBe('/');
  });

  it('lists the four MVP app kinds without duplicates', () => {
    expect(APP_KINDS).toEqual([
      'saas',
      'in_house',
      'citizen_built',
      'vendor_service',
    ]);
    expect(new Set(APP_KINDS).size).toBe(APP_KINDS.length);
  });
});
