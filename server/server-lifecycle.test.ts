import { EventEmitter } from "node:events";
import { createServer as createHttpServer, request as httpRequest } from "node:http";
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

function createMockServer() {
  return {
    close: vi.fn((callback?: (error?: Error) => void) => callback?.()),
  };
}

describe("installGracefulShutdown", () => {
  it("closes each resource once for repeated signals and removes its timeout after a successful shutdown", async () => {
    const signals = new EventEmitter();
    const server = createMockServer();
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
      server: createMockServer(),
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
    const closeDatabase = vi.fn(async () => {
      throw new Error("database cleanup failed");
    });
    const clearTimeout = vi.fn();

    const lifecycle = installGracefulShutdown({
      server: {
        close: () => {
          throw new Error("http cleanup failed");
        },
      },
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

  it("finishes when Node reports that the server was already not listening", async () => {
    const signals = new EventEmitter();
    const server = createHttpServer();
    const closeRealtime = vi.fn(async () => undefined);
    const closeDatabase = vi.fn(async () => undefined);

    const lifecycle = installGracefulShutdown({
      server,
      closeRealtime,
      closeDatabase,
      timeoutMs: 1_000,
      process: signals,
      exit: vi.fn(),
      setTimeout: (() => 1 as unknown as NodeJS.Timeout) as typeof setTimeout,
      clearTimeout: vi.fn() as typeof global.clearTimeout,
    });

    signals.emit("SIGTERM");
    await lifecycle.shutdownPromise;

    expect(closeRealtime).toHaveBeenCalledTimes(1);
    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });

  it("waits for an active HTTP request before completing shutdown and closing the database", async () => {
    const requestStarted = createDeferred();
    const releaseRequest = createDeferred();
    const server = createHttpServer(async (_request, response) => {
      requestStarted.resolve();
      await releaseRequest.promise;
      response.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");

    const activeResponse = new Promise<void>((resolve, reject) => {
      const request = httpRequest({
        host: "127.0.0.1",
        port: address.port,
        path: "/active",
        agent: false,
      }, (response) => {
        response.resume();
        response.once("end", resolve);
      });
      request.once("error", reject);
      request.end();
    });
    await requestStarted.promise;

    const signals = new EventEmitter();
    const closeRealtime = vi.fn(async () => undefined);
    const closeDatabase = vi.fn(async () => undefined);
    const clearTimeout = vi.fn();
    const lifecycle = installGracefulShutdown({
      server,
      closeRealtime,
      closeDatabase,
      timeoutMs: 1_000,
      process: signals,
      exit: vi.fn(),
      setTimeout: (() => 1 as unknown as NodeJS.Timeout) as typeof setTimeout,
      clearTimeout: clearTimeout as typeof global.clearTimeout,
    });

    try {
      signals.emit("SIGTERM");
      let shutdownFinished = false;
      void lifecycle.shutdownPromise?.then(() => {
        shutdownFinished = true;
      });
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(shutdownFinished).toBe(false);
      expect(closeRealtime).toHaveBeenCalledTimes(1);
      expect(closeDatabase).not.toHaveBeenCalled();
      expect(clearTimeout).not.toHaveBeenCalled();

      const connectionError = await new Promise<NodeJS.ErrnoException>((resolve, reject) => {
        const request = httpRequest({
          host: "127.0.0.1",
          port: address.port,
          path: "/new",
          agent: false,
        });
        request.once("response", () => reject(new Error("New HTTP connection was accepted during shutdown")));
        request.once("error", resolve);
        request.end();
      });
      expect(connectionError.code).toBe("ECONNREFUSED");

      releaseRequest.resolve();
      await activeResponse;
      await lifecycle.shutdownPromise;

      expect(shutdownFinished).toBe(true);
      expect(closeDatabase).toHaveBeenCalledTimes(1);
      expect(clearTimeout).toHaveBeenCalledWith(1);
    } finally {
      releaseRequest.resolve();
      await activeResponse.catch(() => undefined);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      lifecycle.dispose();
    }
  });

  it("starts HTTP and realtime draining before closing the database", async () => {
    const signals = new EventEmitter();
    const realtime = createDeferred();
    let finishHttp: ((error?: Error) => void) | undefined;
    const server = {
      close: vi.fn((callback?: (error?: Error) => void) => {
        finishHttp = callback;
      }),
    };
    const closeRealtime = vi.fn(() => realtime.promise);
    const closeDatabase = vi.fn(async () => undefined);
    const lifecycle = installGracefulShutdown({
      server,
      closeRealtime,
      closeDatabase,
      timeoutMs: 1_000,
      process: signals,
      exit: vi.fn(),
      setTimeout: (() => 1 as unknown as NodeJS.Timeout) as typeof setTimeout,
      clearTimeout: vi.fn() as typeof global.clearTimeout,
    });

    signals.emit("SIGTERM");
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(closeRealtime).toHaveBeenCalledTimes(1);
    expect(closeDatabase).not.toHaveBeenCalled();

    finishHttp?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(closeDatabase).not.toHaveBeenCalled();

    realtime.resolve();
    await lifecycle.shutdownPromise;

    expect(closeDatabase).toHaveBeenCalledTimes(1);
  });
});
