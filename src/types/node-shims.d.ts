/**
 * Minimal ambient declarations for the Node.js built-in APIs used by the
 * server. In a normal environment these come from `@types/node`, but this
 * sandbox cannot install packages, so we declare only what we use.
 *
 * These are intentionally loose; runtime behaviour is provided by Node itself.
 */

declare module "node:http" {
  export interface IncomingMessage {
    url?: string;
    method?: string;
    headers: Record<string, string | string[] | undefined>;
    on(event: "data", listener: (chunk: unknown) => void): this;
    on(event: "end", listener: () => void): this;
    on(event: "error", listener: (err: Error) => void): this;
    setEncoding(enc: string): void;
  }
  export interface ServerResponse {
    statusCode: number;
    setHeader(name: string, value: string | number | string[]): void;
    getHeader(name: string): string | number | string[] | undefined;
    writeHead(status: number, headers?: Record<string, string | number | string[]>): this;
    write(chunk: string | Uint8Array): boolean;
    end(chunk?: string | Uint8Array): void;
  }
  export type RequestListener = (req: IncomingMessage, res: ServerResponse) => void;
  export interface Server {
    listen(port: number, host?: string, cb?: () => void): Server;
    close(cb?: (err?: Error) => void): Server;
  }
  export function createServer(listener: RequestListener): Server;
}

declare module "node:fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function readFileSync(path: string): Uint8Array;
  export function existsSync(path: string): boolean;
  export function statSync(path: string): { isFile(): boolean; isDirectory(): boolean };
}

declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array>;
  export function readFile(path: string, encoding: string): Promise<string>;
}

declare module "node:path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function extname(p: string): string;
  export function dirname(p: string): string;
  export const sep: string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:crypto" {
  export function randomUUID(): string;
  export function randomBytes(size: number): { toString(enc: string): string };
}

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(fn: () => void, message?: string): void;
    rejects(
      fn: () => Promise<unknown>,
      check?: ((err: unknown) => boolean) | string,
    ): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  cwd(): string;
  exit(code?: number): never;
  platform: string;
};

declare const console: {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

declare const Buffer: {
  concat(list: Uint8Array[]): Uint8Array;
  from(data: string | Uint8Array, enc?: string): Uint8Array & { toString(enc?: string): string };
};

declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(id: number): void;
declare function setInterval(handler: () => void, timeout?: number): number;
declare function clearInterval(id: number): void;

interface ImportMeta {
  url: string;
}

declare class URL {
  constructor(input: string, base?: string);
  pathname: string;
  searchParams: {
    forEach(cb: (value: string, key: string) => void): void;
    get(name: string): string | null;
  };
}
