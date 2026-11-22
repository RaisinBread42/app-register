import {describe, expect, it} from 'vitest';
import {findProvider, findRuntime, findService, hostingCatalogView} from './hosting-catalog';

describe('hosting catalog', () => {
  it('the catalog offers the main providers with their services, and asks for a version or a runtime only where one matters', () => {
    const catalog = hostingCatalogView();
    const services = (provider: string) => catalog.providers.find((entry) => entry.name === provider)!.services;
    const service = (provider: string, name: string) => services(provider).find((entry) => entry.name === name);

    expect(catalog.providers.map((provider) => provider.name)).toEqual(['Azure', 'AWS', 'Google Cloud', 'Vercel', 'Cloudflare', 'Netlify', 'GitHub']);
    expect(catalog.providers.every((provider) => provider.isStatusMonitored && provider.services.length > 0)).toBe(true);
    expect(services('Azure').map((entry) => entry.name)).toEqual(
      expect.arrayContaining(['App Service', 'Container Apps', 'Database for PostgreSQL', 'SQL Database', 'Container Registry', 'Functions', 'Storage']),
    );
    expect(services('AWS').map((entry) => entry.name)).toEqual(expect.arrayContaining(['EC2', 'RDS for PostgreSQL', 'Lambda', 'S3']));

    // A database has a version with an end-of-support date; an app service has a runtime; storage has neither.
    expect(service('Azure', 'Database for PostgreSQL')).toEqual({name: 'Database for PostgreSQL', hasVersion: true, hasRuntime: false, isEndOfSupportTracked: true});
    expect(service('Azure', 'App Service')).toMatchObject({hasVersion: false, hasRuntime: true});
    expect(service('Azure', 'Storage')).toMatchObject({hasVersion: false, hasRuntime: false, isEndOfSupportTracked: false});
    expect(catalog.runtimes.map((runtime) => runtime.name)).toEqual(expect.arrayContaining(['Node.js', 'Python', '.NET']));
    // The API never hands out feed URLs or matching details.
    expect(JSON.stringify(catalog)).not.toMatch(/https?:|statusComponents|eolProduct/);
  });

  it('a provider, service or runtime is found however it is typed, and anything unlisted stays free text', () => {
    expect(findProvider('microsoft azure')?.name).toBe('Azure');
    expect(findProvider('GCP')?.name).toBe('Google Cloud');
    expect(findService('azure', 'Azure Database for PostgreSQL')?.eolProduct).toBe('azure-database-for-postgresql');
    expect(findService('AWS', 'rds for postgresql')?.eolProduct).toBe('amazon-rds-postgresql');
    expect(findRuntime('nodejs')?.name).toBe('Node.js');
    expect(findRuntime('dotnet')?.name).toBe('.NET');

    expect(findProvider('Hetzner')).toBeUndefined();
    expect(findService('Azure', 'SQL Server')).toBeUndefined();
    expect(findService('Hetzner', 'App Service')).toBeUndefined();
  });
});
