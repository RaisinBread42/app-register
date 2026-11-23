import {describe, expect, it} from 'vitest';
import {endOfSupport} from './end-of-life';
import {endOfLifeDocument} from './test/feeds';

/** Shapes copied from endoflife.date (Nov 2026), newest first as it lists them. */
const MYSQL = endOfLifeDocument([
  {name: '26.10', eolFrom: null},
  {name: '9.7', label: '9.7 (LTS)', eolFrom: '2034-04-30'},
  {name: '8.4', label: '8.4 (LTS)', eolFrom: '2032-04-30'},
  {name: '8.0', eolFrom: '2026-04-30'},
  {name: '5.7', eolFrom: '2023-10-31'},
]);

const SQL_SERVER = endOfLifeDocument([
  {name: '16.0', label: "2022 'Dallas'", eolFrom: '2033-01-11'},
  {name: '13.0-sp3-acp', label: '2016 SP3 Azure Connect Pack', eolFrom: '2026-07-14'},
  {name: '13.0-sp3', label: '2016 SP3', eolFrom: '2026-07-14'},
  {name: '12.0-sp3', label: "2014 'Hekaton' SP3", eolFrom: '2024-07-09'},
  {name: '13.0-sp2', label: '2016 SP2', eolFrom: '2022-10-11'},
  {name: '13.0-sp1', label: '2016 SP1', eolFrom: '2019-07-09'},
  {name: '12.0-sp2', label: "2014 'Hekaton' SP2", eolFrom: '2020-01-14'},
  {name: '13.0', label: '2016', eolFrom: '2018-01-09'},
  {name: '12.0', label: "2014 'Hekaton'", eolFrom: '2016-07-12'},
]);

describe('end-of-support lookup', () => {
  it('an exact version, a "v" prefix and a patch version each name one release and its date', () => {
    for (const version of ['8.0', 'v8.0', ' 8.0 ', '8.0.36']) {
      expect(endOfSupport(MYSQL, version), version).toEqual({date: '2026-04-30', isVersionInexact: false});
    }
    expect(endOfSupport(MYSQL, '9.7')).toEqual({date: '2034-04-30', isVersionInexact: false});
    expect(endOfSupport(SQL_SERVER, '2022')).toEqual({date: '2033-01-11', isVersionInexact: false});
  });

  it('a version that names several releases takes the earliest of their dates and is flagged as not exact', () => {
    // MySQL "8" is both 8.0 (support ended 2026-04-30) and 8.4 (2032): the cautious answer is 8.0's.
    expect(endOfSupport(MYSQL, '8')).toEqual({date: '2026-04-30', isVersionInexact: true});
    // A release with no announced date does not hide the one that has a date.
    expect(endOfSupport(endOfLifeDocument([{name: '26.10', eolFrom: null}, {name: '26.7', eolFrom: '2026-10-20'}]), '26')).toEqual({
      date: '2026-10-20',
      isVersionInexact: true,
    });
  });

  it('SQL Server by its bare year names the latest service pack of that year, the one still supported', () => {
    expect(endOfSupport(SQL_SERVER, '2016')).toEqual({date: '2026-07-14', isVersionInexact: false});
    expect(endOfSupport(SQL_SERVER, '2014')).toEqual({date: '2024-07-09', isVersionInexact: false});
    // Naming a service pack still gets that service pack.
    expect(endOfSupport(SQL_SERVER, '2016 SP2')).toEqual({date: '2022-10-11', isVersionInexact: false});
    expect(endOfSupport(SQL_SERVER, '13.0-sp1')).toEqual({date: '2019-07-09', isVersionInexact: false});
  });

  it('an unknown or empty version has no date', () => {
    for (const version of ['7', '80', '8.', '', '  ', 'latest']) {
      expect(endOfSupport(MYSQL, version), version).toEqual({date: null, isVersionInexact: false});
    }
  });
});
