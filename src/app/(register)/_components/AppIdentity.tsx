import {Badge} from '@astryxdesign/core/Badge';
import {HStack} from '@astryxdesign/core/HStack';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {Tooltip} from '@astryxdesign/core/Tooltip';
import {VStack} from '@astryxdesign/core/VStack';
import {appRoute} from '@/lib/constants';
import type {App} from '@/lib/ui/api-client';
import {COMING_SOON, NOT_SET} from '@/lib/ui/copy';
import {appIconColor, appInitials} from '@/lib/ui/register-view';

const ICON_SIZE = {
  sm: {box: 32, radius: 'var(--radius-element)', text: 'base'},
  lg: {box: 64, radius: 'var(--radius-container)', text: '2xl'},
} as const;

/** The coloured initials square for an application (prototype `.app-icon`). */
export function AppIcon({name, size = 'sm'}: {name: string; size?: keyof typeof ICON_SIZE}) {
  const color = appIconColor(name);
  const {box, radius, text} = ICON_SIZE[size];
  return (
    <HStack
      width={box}
      height={box}
      hAlign="center"
      vAlign="center"
      style={{
        flex: 'none',
        borderRadius: radius,
        background: `var(--color-background-${color})`,
        color: `var(--color-text-${color})`,
      }}>
      <Text weight="bold" color="inherit" size={text}>
        {appInitials(name)}
      </Text>
    </HStack>
  );
}

/** Icon, linked name and category, as the first cell of an applications table. */
export function AppCell({app}: {app: App}) {
  return (
    <HStack gap={2} vAlign="center">
      <AppIcon name={app.name} />
      <VStack gap={0}>
        <Link href={appRoute(app.id)} color="primary" weight="bold" size="sm">
          {app.name}
        </Link>
        <Text type="supporting" color="secondary">
          {app.category ?? NOT_SET}
        </Text>
      </VStack>
    </HStack>
  );
}

/** The grey "—" pill the prototype uses for a check that has no data, with a coming-soon tooltip. */
export function PendingPill() {
  return (
    <Tooltip content={COMING_SOON}>
      <Badge label={NOT_SET} variant="neutral" />
    </Tooltip>
  );
}
