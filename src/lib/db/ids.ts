const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every primary key is a UUID made here, never by a database default. */
export function newId(): string {
  return crypto.randomUUID();
}

/** Guards path and query ids so a malformed one is a 404/400, not a DB error. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
