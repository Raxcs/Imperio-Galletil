import { generateId, isUuid, stripDeletedPrefix } from '../lib/sync';

describe('Sync helpers', () => {
  it('generates valid UUIDs', () => {
    const id = generateId();
    expect(isUuid(id)).toBe(true);
    expect(isUuid('temp_123')).toBe(false);
    expect(isUuid('1')).toBe(false);
  });

  it('strips the legacy delete prefix', () => {
    expect(stripDeletedPrefix('__DELETED__Maria')).toBe('Maria');
    expect(stripDeletedPrefix('Maria')).toBe('Maria');
    expect(stripDeletedPrefix(undefined)).toBe('');
  });
});
