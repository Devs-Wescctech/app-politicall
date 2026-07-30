import { describe, expect, it, vi } from "vitest";
import {
  createRefreshCoordinator,
  type RefreshCoordinationChannel,
  type RefreshCoordinationMessage,
} from "./session-coordinator";

class SharedChannelBus {
  readonly messages: RefreshCoordinationMessage[] = [];
  private readonly listeners = new Map<string, Set<(message: RefreshCoordinationMessage) => void>>();

  channel(id: string): RefreshCoordinationChannel {
    const ownListeners = new Set<(message: RefreshCoordinationMessage) => void>();
    this.listeners.set(id, ownListeners);
    return {
      postMessage: (message) => {
        this.messages.push(message);
        for (const [listenerId, listeners] of this.listeners) {
          if (listenerId === id) continue;
          for (const listener of listeners) listener(message);
        }
      },
      subscribe: (listener) => {
        ownListeners.add(listener);
        return () => ownListeners.delete(listener);
      },
    };
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("cross-tab refresh coordinator", () => {
  it("lets a late-joining tab discover the active owner and shares one refresh result", async () => {
    const bus = new SharedChannelBus();
    const ownerRefresh = deferred<boolean>();
    const ownerAction = vi.fn(() => ownerRefresh.promise);
    const lateAction = vi.fn(async () => true);
    const owner = createRefreshCoordinator({
      channel: bus.channel("owner"),
      participantId: "owner",
      claimWindowMs: 1,
      leaseMs: 100,
    });

    const ownerResult = owner.run(ownerAction);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const late = createRefreshCoordinator({
      channel: bus.channel("late"),
      participantId: "late",
      claimWindowMs: 1,
      leaseMs: 100,
    });
    const lateResult = late.run(lateAction);
    await new Promise((resolve) => setTimeout(resolve, 5));
    ownerRefresh.resolve(true);

    await expect(Promise.all([ownerResult, lateResult])).resolves.toEqual([true, true]);
    expect(ownerAction).toHaveBeenCalledOnce();
    expect(lateAction).not.toHaveBeenCalled();
    expect(JSON.stringify(bus.messages)).not.toMatch(/csrf|access|refreshToken|cookie|authorization/i);
    owner.dispose();
    late.dispose();
  });

  it("recovers with a local refresh after an abandoned owner lease expires", async () => {
    const bus = new SharedChannelBus();
    const localAction = vi.fn(async () => true);
    const local = createRefreshCoordinator({
      channel: bus.channel("local"),
      participantId: "local",
      claimWindowMs: 1,
      leaseMs: 20,
    });
    bus.channel("abandoned").postMessage({
      protocol: "politicall-session-v2",
      type: "owner",
      participantId: "abandoned",
      claimId: "abandoned:claim:1",
      leaseUntil: Date.now() + 10,
    });

    await expect(local.run(localAction)).resolves.toBe(true);

    expect(localAction).toHaveBeenCalledOnce();
    local.dispose();
  });
});
