import type {Person, PersonRef} from '@/lib/ui/api-client';
import type {PersonOption} from './AppForm';

/**
 * Active people to pick as owners, plus the app's current owners when they
 * are no longer active (an app whose owner has left can still be edited).
 */
export function ownerOptions(people: Person[], current: PersonRef[] = []): PersonOption[] {
  const options: PersonOption[] = people.map((person) => ({value: person.id, label: person.name, description: person.email}));
  for (const person of current) {
    if (!options.some((option) => option.value === person.id)) {
      options.push({value: person.id, label: person.name, description: 'No longer active'});
    }
  }
  return options;
}
