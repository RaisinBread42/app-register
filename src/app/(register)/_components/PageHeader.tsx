'use client';

import {HStack} from '@astryxdesign/core/HStack';
import {Heading} from '@astryxdesign/core/Heading';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

type PageHeaderProps = {title: string; description?: string; actions?: React.ReactNode; back?: React.ReactNode};

export function PageHeader({title, description, actions, back}: PageHeaderProps) {
  return (
    <HStack gap={4} vAlign="end" justify="between" wrap="wrap">
      <VStack gap={1} hAlign="start">
        {back}
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
