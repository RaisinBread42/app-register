import {Card} from '@astryxdesign/core/Card';
import {Divider} from '@astryxdesign/core/Divider';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Link} from '@astryxdesign/core/Link';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {ArrowIcon} from '@/lib/ui/icons';

type PanelProps = {title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode; isFlush?: boolean};

/** The prototype's content card: a title and subtitle, an optional link on the right, then the body. */
export function PanelCard({title, subtitle, action, children, isFlush = false}: PanelProps) {
  return (
    <Card padding={0}>
      <VStack gap={0}>
        <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap" paddingInline={5} paddingBlockStart={5} paddingBlockEnd={3}>
          <VStack gap={0.5}>
            <Heading level={2}>{title}</Heading>
            {subtitle && (
              <Text type="supporting" color="secondary">
                {subtitle}
              </Text>
            )}
          </VStack>
          {action}
        </HStack>
        {isFlush ? children : <VStack paddingInline={5} paddingBlockEnd={5}>{children}</VStack>}
      </VStack>
    </Card>
  );
}

/** "View all applications →" style link in a card header. */
export function CardLink({label, href}: {label: string; href: string}) {
  return (
    <Link href={href} size="sm" weight="bold">
      <HStack gap={1} vAlign="center" as="span">
        {label}
        <Icon icon={ArrowIcon} size="xsm" />
      </HStack>
    </Link>
  );
}

/** A friendly muted state for a part of the prototype that has no API yet. */
export function ComingSoon({title, description}: {title: string; description: string}) {
  return <EmptyState title={title} description={description} isCompact />;
}

type KeyValueProps = {rows: {label: string; value: React.ReactNode}[]; isLabelStrong?: boolean};

/** Label on the left, value on the right, with a line between rows (prototype `.kv`; `.status-line` with a strong label). */
export function KeyValueRows({rows, isLabelStrong = false}: KeyValueProps) {
  return (
    <VStack gap={0}>
      {rows.map((row, index) => (
        <VStack key={row.label} gap={0}>
          {index > 0 && <Divider />}
          <HStack gap={4} hAlign="between" vAlign="center" paddingBlock={isLabelStrong ? 3 : 2} minHeight={isLabelStrong ? 47 : undefined}>
            <Text color={isLabelStrong ? 'primary' : 'secondary'} weight={isLabelStrong ? 'semibold' : undefined} size="sm">
              {row.label}
            </Text>
            {/* Long values (addresses, host names) wrap anywhere instead of running off a phone screen. */}
            <HStack hAlign="end" style={{minWidth: 0, overflowWrap: 'anywhere', textAlign: 'end'}}>
              {typeof row.value === 'string' ? (
                <Text weight="bold" size="sm">
                  {row.value}
                </Text>
              ) : (
                row.value
              )}
            </HStack>
          </HStack>
        </VStack>
      ))}
    </VStack>
  );
}

/** Small muted note under a section (prototype `.foot-note`). */
export function FootNote({children}: {children: string}) {
  return (
    <Text type="supporting" color="secondary" display="block">
      {children}
    </Text>
  );
}
