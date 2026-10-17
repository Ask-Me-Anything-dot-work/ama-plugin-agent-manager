import { describe, expect, test } from 'bun:test';
import {
  ProfileNotFoundError,
  RegistryUnavailableError,
  type RegistryClient,
} from '../src/clients/registry.client.js';
import { createMcpProfileValidator } from '../src/services/mcp-profile.validator.js';

function stubClient(overrides: Partial<RegistryClient> = {}): RegistryClient {
  return {
    listProfiles: async () => [],
    getProfile: async () => ({ id: 'default', label: 'Default' }),
    ...overrides,
  };
}

describe('createMcpProfileValidator', () => {
  test('existing profile resolves (registry 200)', async () => {
    const calls: string[] = [];
    const validate = createMcpProfileValidator(
      stubClient({
        getProfile: async (id: string) => {
          calls.push(id);
          return { id, label: id };
        },
      }),
    );

    await expect(validate('default')).resolves.toBeUndefined();
    expect(calls).toEqual(['default']);
  });

  test('unknown profile → ProfileNotFoundError ("Profile not found in registry")', async () => {
    const validate = createMcpProfileValidator(
      stubClient({
        getProfile: async (id: string) => {
          throw new ProfileNotFoundError(id);
        },
      }),
    );

    try {
      await validate('stale-id');
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ProfileNotFoundError);
      expect((err as ProfileNotFoundError).code).toBe('PROFILE_NOT_FOUND');
      expect((err as Error).message).toBe('Profile not found in registry');
    }
  });

  test('registry unreachable → RegistryUnavailableError propagates (fail-closed)', async () => {
    const validate = createMcpProfileValidator(
      stubClient({
        getProfile: async () => {
          throw new RegistryUnavailableError('REGISTRY_PSK not configured');
        },
      }),
    );

    await expect(validate('default')).rejects.toBeInstanceOf(RegistryUnavailableError);
  });
});
