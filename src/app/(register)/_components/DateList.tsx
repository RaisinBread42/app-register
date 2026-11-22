import {Badge} from '@astryxdesign/core/Badge';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {appRoute} from '@/lib/constants';
import {CalendarIcon} from '@/lib/ui/icons';
import {formatDate} from '@/lib/ui/register-view';
import {IconTile} from './Cards';

export type DateRow = {appId: string; title: string; date: string};

/** The prototype's "Upcoming renewals" rows: amber calendar tile, title and date, amber badge. */
export function DateList({rows, badge, emptyTitle}: {rows: DateRow[]; badge: string; emptyTitle: string}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description="Add the dates when you add or edit an application." isCompact />;
  }
  return (
    <VStack gap={0}>
      {rows.map((row, index) => (
        <VStack key={row.appId} gap={0}>
          {index > 0 && <Divider />}
          <HStack gap={3} vAlign="center" paddingBlock={3}>
            <IconTile icon={CalendarIcon} tone="amber" size={35} />
            <VStack gap={0.5} style={{flex: 1, minWidth: 0}}>
              <Link href={appRoute(row.appId)} color="primary" weight="bold" size="sm">
                {row.title}
              </Link>
              <Text type="supporting" color="secondary">
                {formatDate(row.date)}
              </Text>
            </VStack>
            <Badge label={badge} variant="yellow" />
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}
