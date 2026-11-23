import {describe, expect, it} from 'vitest';
import {INCIDENT_SCOPE, STATUS_FEED_KIND} from '@/lib/constants';
import {findProvider} from '@/lib/hosting-catalog';
import {azureRegionsNamed, rowRegion} from './regions';
import {incidentScope, parseStatusFeed} from './status-feeds';
import {awsCurrentEvents, azureStatusRss, googleCloudIncidents} from './test/feeds';

const NO_ALIASES = new Map<string, string>();
const feedOf = (provider: string) => findProvider(provider)!.statusFeed!;

describe('regions', () => {
  it('an Azure region is matched by its full name as whole words, never inside the name of another region', () => {
    const named = (text: string) => [...azureRegionsNamed(text)].sort();

    expect(named('Customers in North Central US, East US 2 and West US 3 may see failures.')).toEqual(['eastus2', 'northcentralus', 'westus3']);
    expect(named('South Central US and West Central US')).toEqual(['southcentralus', 'westcentralus']);
    expect(named('Central US; East US; West US.')).toEqual(['centralus', 'eastus', 'westus']);
    expect(named('East US and East US 2')).toEqual(['eastus', 'eastus2']);
    expect(named('Key Vault - UK South - Investigating')).toEqual(['uksouth']);
    expect(named('resources in germany-west-central and the eastus2 region')).toEqual(['eastus2', 'germanywestcentral']);
    // Words that only look like part of a region name.
    expect(named('Customers in the US and in Europe may see errors in a central service.')).toEqual([]);
  });

  it('a row’s region is recognised by its code, an availability zone is its region, and a display name counts when the feed gives it', () => {
    const aws = (region: string | null, aliases = NO_ALIASES) => rowRegion(STATUS_FEED_KIND.awsHealth, region, aliases);
    const google = (region: string) => rowRegion(STATUS_FEED_KIND.gcpIncidents, region, NO_ALIASES);
    const azure = (region: string) => rowRegion(STATUS_FEED_KIND.azureRss, region, NO_ALIASES);
    const known = (key: string) => ({key, isUnrecognised: false});
    const unrecognised = {key: null, isUnrecognised: true};

    expect([aws('us-east-1'), aws('US-EAST-1a'), aws(' us-east-1f '), aws('us-gov-west-1')]).toEqual([known('useast1'), known('useast1'), known('useast1'), known('usgovwest1')]);
    expect([google('us-central1'), google('us-central1-a'), google('europe-west4-c')]).toEqual([known('uscentral1'), known('uscentral1'), known('europewest4')]);
    expect([azure('centralus'), azure('Central US'), azure('North Central US'), azure('east-us-2')]).toEqual([
      known('centralus'),
      known('centralus'),
      known('northcentralus'),
      known('eastus2'),
    ]);
    expect(aws('N. Virginia', new Map([['nvirginia', 'useast1']]))).toEqual(known('useast1'));

    expect([aws('N. Virginia'), aws('our data centre'), google('Iowa'), azure('Mars North')]).toEqual(Array(4).fill(unrecognised));
    // No region recorded is not the same as one that cannot be read.
    expect([aws(null), aws('  ')]).toEqual(Array(2).fill({key: null, isUnrecognised: false}));
    // A Statuspage feed names no regions, so there is nothing to recognise.
    expect(rowRegion(STATUS_FEED_KIND.statuspage, 'BRU', NO_ALIASES)).toEqual({key: null, isUnrecognised: false});
  });

  it('a regional outage of the row’s service is an outage in that region (also by zone or display name), nothing in another region, and a provider notice when the row’s region cannot be read', () => {
    const [incident] = parseStatusFeed(
      feedOf('AWS'),
      awsCurrentEvents([{region: 'us-east-1', status: '3', service: 'Multiple services', impacted: ['Amazon Simple Storage Service']}]).replace('Example region', 'N. Virginia'),
    );
    const scope = (region: string | null, components = ['Amazon Simple Storage Service']) => incidentScope(incident, {components, region});

    expect([scope('us-east-1'), scope('us-east-1c'), scope('N. Virginia'), scope('n virginia'), scope(null)]).toEqual(Array(5).fill(INCIDENT_SCOPE.service));
    expect([scope('eu-west-1'), scope('eu-west-1b')]).toEqual([null, null]);
    expect([scope('Ohio'), scope('the basement')]).toEqual([INCIDENT_SCOPE.provider, INCIDENT_SCOPE.provider]);
    // Another service stays out, whatever the region says.
    expect([scope('us-east-1', ['Amazon DynamoDB']), scope('Ohio', ['Amazon DynamoDB'])]).toEqual([null, null]);
  });

  it('a Google Cloud zone is matched to its region, and a location name the feed gives is accepted', () => {
    const body = googleCloudIncidents([{description: 'Cloud Run failing', impact: 'SERVICE_OUTAGE', products: ['Cloud Run'], locations: ['us-central1']}]).replace(
      '"title":"us-central1"',
      '"title":"Iowa (us-central1)"',
    );
    const [incident] = parseStatusFeed(feedOf('Google Cloud'), body);
    const scope = (region: string) => incidentScope(incident, {components: ['Cloud Run'], region});

    expect([scope('us-central1'), scope('us-central1-b'), scope('Iowa (us-central1)')]).toEqual(Array(3).fill(INCIDENT_SCOPE.service));
    expect(scope('europe-west1')).toBeNull();
    expect(scope('Iowa')).toBe(INCIDENT_SCOPE.provider);
  });

  it('Azure text that names the row’s service but another region is a provider notice, not an outage on the row', () => {
    const [incident] = parseStatusFeed(feedOf('Azure'), azureStatusRss([{title: 'Key Vault - UK South', description: 'Key Vault is unavailable in UK South.'}]));
    const scope = (region: string | null, components = ['Key Vault']) => incidentScope(incident, {components, region});

    expect([scope('uksouth'), scope('UK South'), scope(null)]).toEqual(Array(3).fill(INCIDENT_SCOPE.service));
    expect([scope('ukwest'), scope('eastus'), scope('somewhere else')]).toEqual(Array(3).fill(INCIDENT_SCOPE.provider));
    // The region is named, so a row there is in it whatever its service.
    expect(scope('uksouth', ['Cosmos DB'])).toBe(INCIDENT_SCOPE.service);
  });
});
