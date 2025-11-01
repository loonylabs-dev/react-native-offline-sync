import {
  LastWriteWinsResolver,
  ServerWinsResolver,
  ClientWinsResolver,
  CustomResolver,
  createConflictResolver,
} from '../../src/strategies/ConflictResolver';
import { ConflictContext, ConflictStrategy } from '../../src/types';

describe('ConflictResolver', () => {
  const mockContext: ConflictContext = {
    tableName: 'users',
    recordId: '123',
    localData: { name: 'John Local' },
    serverData: { name: 'John Server' },
    localUpdatedAt: 1000,
    serverUpdatedAt: 2000,
  };

  describe('LastWriteWinsResolver', () => {
    it('should choose server when server timestamp is newer', () => {
      const resolver = new LastWriteWinsResolver();
      const result = resolver.resolve(mockContext);
      expect(result).toBe('server');
    });

    it('should choose local when local timestamp is newer', () => {
      const resolver = new LastWriteWinsResolver();
      const result = resolver.resolve({
        ...mockContext,
        localUpdatedAt: 3000,
        serverUpdatedAt: 2000,
      });
      expect(result).toBe('local');
    });
  });

  describe('ServerWinsResolver', () => {
    it('should always choose server', () => {
      const resolver = new ServerWinsResolver();
      const result = resolver.resolve(mockContext);
      expect(result).toBe('server');
    });
  });

  describe('ClientWinsResolver', () => {
    it('should always choose local', () => {
      const resolver = new ClientWinsResolver();
      const result = resolver.resolve(mockContext);
      expect(result).toBe('local');
    });
  });

  describe('CustomResolver', () => {
    it('should use custom function', () => {
      const customFn = jest.fn(() => 'local');
      const resolver = new CustomResolver(customFn);
      const result = resolver.resolve(mockContext);

      expect(customFn).toHaveBeenCalledWith(mockContext);
      expect(result).toBe('local');
    });

    it('should support merging data', () => {
      const customFn = jest.fn((context) => ({
        name: `${context.localData.name} + ${context.serverData.name}`,
      }));
      const resolver = new CustomResolver(customFn);
      const result = resolver.resolve(mockContext);

      expect(result).toEqual({ name: 'John Local + John Server' });
    });
  });

  describe('createConflictResolver', () => {
    it('should create LastWriteWinsResolver', () => {
      const resolver = createConflictResolver(ConflictStrategy.LAST_WRITE_WINS);
      expect(resolver).toBeInstanceOf(LastWriteWinsResolver);
    });

    it('should create ServerWinsResolver', () => {
      const resolver = createConflictResolver(ConflictStrategy.SERVER_WINS);
      expect(resolver).toBeInstanceOf(ServerWinsResolver);
    });

    it('should create ClientWinsResolver', () => {
      const resolver = createConflictResolver(ConflictStrategy.CLIENT_WINS);
      expect(resolver).toBeInstanceOf(ClientWinsResolver);
    });

    it('should create CustomResolver with function', () => {
      const customFn = jest.fn(() => 'local');
      const resolver = createConflictResolver(ConflictStrategy.CUSTOM, customFn);
      expect(resolver).toBeInstanceOf(CustomResolver);
    });

    it('should throw error for CUSTOM without function', () => {
      expect(() => {
        createConflictResolver(ConflictStrategy.CUSTOM);
      }).toThrow('Custom conflict resolver function is required');
    });
  });
});
