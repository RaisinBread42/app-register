import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

type PageHeaderProps = {title: string; description?: string; actions?: React.ReactNode};

/** The prototype's page heading: title and subtitle on the left, actions on the right. */
export function PageHeader({title, description, actions}: PageHeaderProps) {
  return (
    <HStack gap={4} vAlign="center" hAlign="between" wrap="wrap">
      <VStack gap={1} hAlign="start">
        <Heading level={1}>{title}</Heading>
        {description && (
          <Text color="secondary" display="block">
            {description}
          </Text>
        )}
      </VStack>
      {actions && <HStack gap={2}>{actions}</HStack>}
    </HStack>
  );
}
