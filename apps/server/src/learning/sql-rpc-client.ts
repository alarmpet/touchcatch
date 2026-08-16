export type SqlRpcTransport = (functionName: string, args: Record<string, unknown>) => Promise<unknown>;

export class SqlRpcError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SqlRpcError';
    this.code = code;
  }
}

export interface SqlRpcClient {
  call<T>(functionName: string, args: Record<string, unknown>): Promise<T>;
}

export function createSqlRpcClient(transport: SqlRpcTransport): SqlRpcClient {
  return {
    async call<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
      try {
        return await transport(functionName, args) as T;
      } catch (error) {
        if (error instanceof SqlRpcError) throw error;
        const source = error as { code?: unknown; message?: unknown };
        throw new SqlRpcError(
          typeof source.code === 'string' ? source.code : 'RPC_ERROR',
          typeof source.message === 'string' ? source.message : 'SQL RPC call failed',
          { cause: error },
        );
      }
    },
  };
}
