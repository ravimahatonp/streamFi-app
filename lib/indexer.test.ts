import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchStreamsFromIndexer,
  fetchTransactionHistory,
  fetchTransactionHistoryWithTimeout,
} from './indexer';
import * as factory from './factory';
import * as stream from './stream';

vi.mock('./factory', () => ({
  streamsBySender: vi.fn(),
  streamsByRecipient: vi.fn(),
  isMock: vi.fn(() => true),
}));

vi.mock('./stream', () => ({
  getStreamAddress: vi.fn(),
  getStreamInfo: vi.fn(),
}));

describe('fetchStreamsFromIndexer (#342)', () => {
  const PUBLIC_KEY = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFTGWEBUSAVFILHUYW5ZV';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches streams concurrently and returns indexed stream metadata', async () => {
    vi.mocked(factory.streamsBySender).mockResolvedValueOnce([1n, 2n]);
    vi.mocked(stream.getStreamAddress).mockImplementation(async (_source, id) => `ADDR_${id}`);
    vi.mocked(stream.getStreamInfo).mockImplementation(async (_source, addr) => ({
      sender: PUBLIC_KEY,
      recipient: 'GRECIPIENT',
      token: 'XLM',
      ratePerSecond: 100n,
      startTime: 1000,
      endTime: 2000,
      withdrawn: 0n,
      paused: false,
      pausedAt: 0,
      clawbackEnabled: false,
      cancelled: false,
    }));

    const result = await fetchStreamsFromIndexer(PUBLIC_KEY, 'sender', { maxConcurrency: 2 });

    expect(result.length).toBe(2);
    expect(result.streams.length).toBe(2);
    expect(result.failedIds).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result[0]!.id).toBe('1');
    expect(result[0]!.address).toBe('ADDR_1');
    expect(result[1]!.id).toBe('2');
    expect(result[1]!.address).toBe('ADDR_2');
  });

  it('surfaces partial failure and invokes onPartialFailure callback when individual stream RPCs fail', async () => {
    vi.mocked(factory.streamsBySender).mockResolvedValueOnce([1n, 2n, 3n]);
    vi.mocked(stream.getStreamAddress).mockImplementation(async (_source, id) => {
      if (id === 2n) throw new Error('RPC connection dropped');
      return `ADDR_${id}`;
    });
    vi.mocked(stream.getStreamInfo).mockImplementation(async (_source, addr) => {
      if (addr === 'ADDR_3') throw new Error('Contract simulation failed');
      return {
        sender: PUBLIC_KEY,
        recipient: 'GRECIPIENT',
        token: 'XLM',
        ratePerSecond: 100n,
        startTime: 1000,
        endTime: 2000,
        withdrawn: 0n,
        paused: false,
        pausedAt: 0,
        clawbackEnabled: false,
        cancelled: false,
      };
    });

    const onPartialFailure = vi.fn();
    const result = await fetchStreamsFromIndexer(PUBLIC_KEY, 'sender', { onPartialFailure });

    expect(result.length).toBe(1);
    expect(result[0]!.id).toBe('1');
    expect(result.failedIds).toEqual(['2', '3']);
    expect(result.errors.length).toBe(2);
    expect(result.errors[0]!.id).toBe('2');
    expect(result.errors[0]!.error.message).toMatch(/RPC connection dropped/);
    expect(result.errors[1]!.id).toBe('3');
    expect(result.errors[1]!.error.message).toMatch(/Contract simulation failed/);
    expect(onPartialFailure).toHaveBeenCalledWith(['2', '3'], result.errors);
  });

  it('respects AbortSignal cancellation', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchStreamsFromIndexer(PUBLIC_KEY, 'sender', { signal: controller.signal }),
    ).rejects.toThrow(/Aborted/);
  });
});
