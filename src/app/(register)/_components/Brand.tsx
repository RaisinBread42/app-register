import {Avatar} from '@astryxdesign/core/Avatar';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';
import {DiamondIcon} from '@/lib/ui/icons';

export const WORKSPACE_NAME = 'Obsidian Software';

/** The prototype's purple gradient tile with the diamond mark. */
export function BrandMark() {
  return (
    <HStack
      width={42}
      height={42}
      hAlign="center"
      vAlign="center"
      style={{
        borderRadius: 'var(--radius-element)',
        color: 'var(--color-on-dark)',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--color-accent), var(--color-on-dark) 25%), var(--color-accent) 60%, color-mix(in srgb, var(--color-accent), var(--color-on-light) 45%))',
        boxShadow: '0 5px 15px color-mix(in srgb, var(--color-accent) 33%, transparent)',
      }}>
      <Icon icon={DiamondIcon} size="md" />
    </HStack>
  );
}

/** The workspace card at the foot of the sidebar. */
export function WorkspaceCard() {
  return (
    <HStack
      gap={2}
      padding={3}
      vAlign="center"
      style={{
        color: 'var(--color-on-dark)',
        borderRadius: 'var(--radius-container)',
        border: 'var(--border-width) solid color-mix(in srgb, var(--color-on-dark) 18%, transparent)',
        background: 'color-mix(in srgb, var(--color-on-dark) 7%, transparent)',
      }}>
      <Avatar name={WORKSPACE_NAME} size={32} shape="rounded" tooltip={false} />
      <VStack gap={0}>
        <Text weight="bold" color="inherit">
          {WORKSPACE_NAME}
        </Text>
        <Text type="supporting" color="inherit">
          App Register · Shared access
        </Text>
      </VStack>
    </HStack>
  );
}

/** The thin line between sidebar groups (prototype `.nav-sep`), dim on the dark sidebar. */
export function SidebarRule() {
  return (
    <HStack
      height={1}
      paddingInline={2}
      style={{flex: 'none', backgroundClip: 'content-box', background: 'color-mix(in srgb, var(--color-on-dark) 14%, transparent) content-box'}}
    />
  );
}
