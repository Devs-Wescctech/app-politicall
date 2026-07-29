import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { installGracefulShutdown } from "./server-lifecycle";

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createServer(listening = true) {
  return {
    listening,
    close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
  };
}

describe("installGracefulShutdown", () => {
  it("closes each resource once for repeated signals and removes its timeout after a successful shutdown", async () => {
    const signals = new EventEmitter();
    const server = createServer();
    const closeRealtime = vi.fn(async () => undefined);
    const closeDatabase = vi.fn(async () => undefined);
    const exit = vi.fn();
    const clearTimeout = vi.fn();
    let timeoutHandler: (() => void) | undefined;

    const lifecycle = installGracefulShutdown({
      server,
      closeRealtime,
      closeDatabase,
      timeoutMs: 1_000,
      process: signals,
      exit,
      setTimeout: ((handler: () => void) => {
        timeoutHandler = handler;
        return 1 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout,
      clearTimeout: clearTimeout as typeof global.clearTimeout,
    });

    signals.emit("SIGTERM");
    signals.emit("SIGINT");
    await lifecycle.shutdownPromise;

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(closeRealtime).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(clearTimeout).toHaveBeenCalledWith(1);
    expect(exit).not.toHaveBeenCalled();
    expect(timeoutHandler).toBeDefined();

    lifecycle.dispose();
    signals.emit("SIGTERM");
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it("forces a non-zero exit when cleanup exceeds the timeout", async () => {
    const signals = new EventEmitter();
    const realtime = createDeferred();
    const database = createDeferred();
    const exit = vi.fn();
    let timeoutHandler: (() => void) | undefined;

    const lifecycle = installGracefulShutdown({
      server: createServer(),
      closeRealtime: vi.fn(() => realtime.promise),
      closeDatabase: vi.fn(() => database.promise),
      timeoutMs: 1_000,
      process: signals,
      exit,
      setTimeout: ((handler: () => void) => {
        timeoutHandler = handler;
        return 1 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout,
      clearTimeout: vi.fn() as typeof global.clearTimeout,
    });

    signals.emit("SIGTERM");
    timeoutHandler?.();

    expect(exit).toHaveBeenCalledWith(1);

    realtime.resolve();
    database.resolve();
    await lifecycle.shutdownPromise;
  });

  it("continues cleanup and clears the timeout when a resource cleanup fails", async () => {
    const signals = new EventEmitter();
    const closeDatabase = vi.fn(async () => undefined);
    const clearTimeout = vi.fn();

    const lifecycle = installGracefulShutdown({
      server: createServer(),
      closeRealtime: vi.fn(async () => {
        throw new Error("realtime cleanup failed");
      }),
      closeDatabase,
      timeoutMs: 1_000,
      process: signals,
      exit: vi.fn(),
      setTimeout: (() => 1 as unknown as NodeJS.Timeout) as typeof setTimeout,
      clearTimeout: clearTimeout as typeof global.clearTimeout,
    });

    signals.emit("SIGTERM");
    await lifecycle.shutdownPromise;

    expect(closeDatabase).toHaveBeenCalledTimes(1);
    expect(clearTimeout).toHaveBeenCalledWith(1);
  });

  it("does not wait for a close callback from a server that is not listening", async () => {
    const signals = new EventEmitter();
    const server = createServer(false);
    server.close.mockImplementation(() => undefined);

    const lifecycle = installGracefulShutdown({
      server,
      closeRealtime: async () => undefined,
      closeDatabase: async () => undefined,
      timeoutMs: 1_000,
      process: signals,
      exit: vi.fn(),
      setTimeout: (() => 1 as unknown as NodeJS.Timeout) as typeof setTimeout,
      clearTimeout: vi.fn() as typeof global.clearTimeout,
    });

    signals.emit("SIGTERM");
    await lifecycle.shutdownPromise;

    expect(server.close).toHaveBeenCalledTimes(1);
  });
});
