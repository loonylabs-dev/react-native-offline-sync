import { ConflictContext, ConflictResolverFn, ConflictStrategy } from '../types';

/**
 * Base conflict resolver interface
 */
export interface IConflictResolver {
  resolve(context: ConflictContext): 'local' | 'server' | Record<string, any>;
}

/**
 * Last-Write-Wins strategy
 * Resolves conflicts based on timestamps - most recent update wins
 */
export class LastWriteWinsResolver implements IConflictResolver {
  resolve(context: ConflictContext): 'local' | 'server' {
    if (context.localUpdatedAt > context.serverUpdatedAt) {
      return 'local';
    }
    return 'server';
  }
}

/**
 * Server-Wins strategy
 * Server data always takes precedence
 */
export class ServerWinsResolver implements IConflictResolver {
  resolve(): 'server' {
    return 'server';
  }
}

/**
 * Client-Wins strategy
 * Local client data always takes precedence
 */
export class ClientWinsResolver implements IConflictResolver {
  resolve(): 'local' {
    return 'local';
  }
}

/**
 * Custom resolver wrapper
 * Wraps a custom conflict resolver function
 */
export class CustomResolver implements IConflictResolver {
  constructor(private customFn: ConflictResolverFn) {}

  resolve(context: ConflictContext): 'local' | 'server' | Record<string, any> {
    return this.customFn(context);
  }
}

/**
 * Factory function to create conflict resolver based on strategy
 */
export function createConflictResolver(
  strategy: ConflictStrategy,
  customResolver?: ConflictResolverFn
): IConflictResolver {
  switch (strategy) {
    case ConflictStrategy.LAST_WRITE_WINS:
      return new LastWriteWinsResolver();

    case ConflictStrategy.SERVER_WINS:
      return new ServerWinsResolver();

    case ConflictStrategy.CLIENT_WINS:
      return new ClientWinsResolver();

    case ConflictStrategy.CUSTOM:
      if (!customResolver) {
        throw new Error('Custom conflict resolver function is required for CUSTOM strategy');
      }
      return new CustomResolver(customResolver);

    default:
      throw new Error(`Unknown conflict strategy: ${strategy}`);
  }
}
