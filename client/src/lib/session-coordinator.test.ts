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

class DelayedDeliveryBus {
  readonly messages: RefreshCoordinationMessage[] = [];
  private readonly delayed: Array<{ senderId: string; message: RefreshCoordinationMessage }> = [];
  private readonly listeners = new Map<string, Set<(message: RefreshCoordinationMessage) => void>>();
  private delayedOwnerId: string | undefined;

  delayOwnerMessagesFrom(participantId: string) {
    this.delayedOwnerId = participantId;
  }

  channel(id: string): RefreshCoordinationChannel {
    const ownListeners = new Set<(message: RefreshCoordinationMessage) => void>();
    this.listeners.set(id, ownListeners);
    return {
      postMessage: (message) => {
        this.messages.push(message);
        if (message.type === "owner" && message.participantId === this.delayedOwnerId) {
          this.delayed.push({ senderId: id, message });
          return;
        }
        this.deliver(id, message);
      },
      subscribe: (listener) => {
        ownListeners.add(listener);
        return () => ownListeners.delete(listener);
      },
    };
  }

  releaseOwnerMessage(participantId: string): boolean {
    const index = this.delayed.findIndex(({ message }) =>
      message.type === "owner" && message.participantId === participantId);
    if (index < 0) return false;
    const [{ senderId, message }] = this.delayed.splice(index, 1);
    this.deliver(senderId, message);
    return true;
  }

  private deliver(senderId: string, message: RefreshCoordinationMessage) {
    for (const [listenerId, listeners] of this.listeners) {
      if (listenerId === senderId) continue;
      for (const listener of listeners) listener(message);
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("cross-tab refresh coordinator", () => {
  it("elects one owner for simultaneous refresh attempts", async () => {
    const bus = new SharedChannelBus();
    const firstAction = vi.fn(async () => true);
    const secondAction = vi.fn(async () => true);
    const first = createRefreshCoordinator({
      channel: bus.channel("first"),
      participantId: "first",
      claimWindowMs: 1,
      leaseMs: 100,
    });
    const second = createRefreshCoordinator({
      channel: bus.channel("second"),
      participantId: "second",
      claimWindowMs: 1,
      leaseMs: 100,
    });

    await expect(Promise.all([first.run(firstAction), second.run(secondAction)]))
      .resolves.toEqual([true, true]);

    expect(firstAction.mock.calls.length + secondAction.mock.calls.length).toBe(1);
    first.dispose();
    second.dispose();
  });

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

  it("uses a result delivered during the claim window instead of starting a second refresh", async () => {
    const bus = new DelayedDeliveryBus();
    const ownerRefresh = deferred<boolean>();
    const ownerAction = vi.fn(() => ownerRefresh.promise);
    const candidateAction = vi.fn(async () => true);
    bus.delayOwnerMessagesFrom("a-owner");
    const owner = createRefreshCoordinator({
      channel: bus.channel("a-owner"),
      participantId: "a-owner",
      claimWindowMs: 100,
      leaseMs: 1_000,
    });

    const ownerResult = owner.run(ownerAction);
    await vi.waitFor(() => expect(ownerAction).toHaveBeenCalledOnce(), {
      interval: 1,
      timeout: 500,
    });

    const candidate = createRefreshCoordinator({
      channel: bus.channel("z-candidate"),
      participantId: "z-candidate",
      claimWindowMs: 100,
      leaseMs: 1_000,
    });
    const candidateResult = candidate.run(candidateAction);
    await vi.waitFor(() => expect(bus.messages.some((message) =>
      message.type === "claim" && message.participantId === "z-candidate")).toBe(true), {
      interval: 1,
      timeout: 500,
    });

    expect(bus.releaseOwnerMessage("a-owner")).toBe(true);
    ownerRefresh.resolve(true);
    await vi.waitFor(() => expect(bus.messages.some((message) =>
      message.type === "result" && message.participantId === "a-owner")).toBe(true), {
      interval: 1,
      timeout: 500,
    });

    await expect(Promise.all([ownerResult, candidateResult])).resolves.toEqual([true, true]);
    expect(ownerAction).toHaveBeenCalledOnce();
    expect(candidateAction).not.toHaveBeenCalled();
    owner.dispose();
    candidate.dispose();
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

  it("does not resolve a current claim waiter with a stale result", async () => {
    const bus = new SharedChannelBus();
    const currentOwner = bus.channel("current-owner");
    const staleOwner = bus.channel("stale-owner");
    const localAction = vi.fn(async () => true);
    const waiter = createRefreshCoordinator({
      channel: bus.channel("waiter"),
      participantId: "waiter",
      claimWindowMs: 1,
      leaseMs: 100,
    });
    const currentClaimId = "current-owner:claim:1";
    currentOwner.postMessage({
      protocol: "politicall-session-v2",
      type: "owner",
      participantId: "current-owner",
      claimId: currentClaimId,
      leaseUntil: Date.now() + 100,
    });

    let settled = false;
    const result = waiter.run(localAction).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    staleOwner.postMessage({
      protocol: "politicall-session-v2",
      type: "result",
      participantId: "stale-owner",
      claimId: "stale-owner:claim:0",
      success: false,
      validUntil: Date.now() + 50,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const settledByStaleResult = settled;
    currentOwner.postMessage({
      protocol: "politicall-session-v2",
      type: "result",
      participantId: "current-owner",
      claimId: currentClaimId,
      success: true,
      validUntil: Date.now() + 50,
    });

    await expect(result).resolves.toBe(true);
    expect(settledByStaleResult).toBe(false);
    expect(localAction).not.toHaveBeenCalled();
    waiter.dispose();
  });

  it("ignores malformed and unknown result messages", async () => {
    const bus = new SharedChannelBus();
    const attacker = bus.channel("attacker");
    const localAction = vi.fn(async () => true);
    const local = createRefreshCoordinator({
      channel: bus.channel("local"),
      participantId: "local",
      claimWindowMs: 1,
      leaseMs: 20,
    });
    attacker.postMessage({
      protocol: "politicall-session-v2",
      type: "result",
      participantId: "attacker",
      claimId: "",
      success: "yes",
      validUntil: Number.POSITIVE_INFINITY,
    } as unknown as RefreshCoordinationMessage);

    await expect(local.run(localAction)).resolves.toBe(true);

    expect(localAction).toHaveBeenCalledOnce();
    local.dispose();
  });

  it("clamps remote leases and result validity to local bounds", async () => {
    const bus = new SharedChannelBus();
    const remote = bus.channel("remote");
    const localAction = vi.fn(async () => true);
    const local = createRefreshCoordinator({
      channel: bus.channel("local"),
      participantId: "local",
      claimWindowMs: 1,
      leaseMs: 15,
    });
    remote.postMessage({
      protocol: "politicall-session-v2",
      type: "owner",
      participantId: "remote",
      claimId: "remote:claim:1",
      leaseUntil: Date.now() + 60_000,
    });

    const boundedRun = local.run(localAction);
    const boundedResult = await Promise.race([
      boundedRun,
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ]);
    if (boundedResult === "timeout") local.reset();
    await boundedRun;

    expect(boundedResult).toBe(true);
    expect(localAction).toHaveBeenCalledOnce();

    local.reset();
    localAction.mockClear();
    remote.postMessage({
      protocol: "politicall-session-v2",
      type: "owner",
      participantId: "remote",
      claimId: "remote:claim:2",
      leaseUntil: Date.now() + 15,
    });
    remote.postMessage({
      protocol: "politicall-session-v2",
      type: "result",
      participantId: "remote",
      claimId: "remote:claim:2",
      success: true,
      validUntil: Date.now() + 60_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 70));

    await expect(local.run(localAction)).resolves.toBe(true);
    expect(localAction).toHaveBeenCalledOnce();
    local.dispose();
  });

  it("does not start an owner callback when reset wins the owner announcement race", async () => {
    let coordinator!: ReturnType<typeof createRefreshCoordinator>;
    const channel: RefreshCoordinationChannel = {
      postMessage: (message) => {
        if (message.type === "owner") coordinator.reset();
      },
      subscribe: () => () => undefined,
    };
    const localAction = vi.fn(async () => true);
    coordinator = createRefreshCoordinator({
      channel,
      participantId: "local",
      claimWindowMs: 1,
      leaseMs: 20,
    });

    await expect(coordinator.run(localAction)).resolves.toBe(false);

    expect(localAction).not.toHaveBeenCalled();
    coordinator.dispose();
  });
});
