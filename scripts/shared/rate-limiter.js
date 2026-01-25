const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_TOKENS_PER_INTERVAL = 5;

function scheduleFlush(state) {
  if (state.refillTimer) {
    return;
  }

  state.refillTimer = setInterval(() => {
    state.tokens = Math.min(state.tokens + state.refillAmount, state.maxTokens);

    while (state.tokens > 0 && state.queue.length > 0) {
      const resolve = state.queue.shift();
      state.tokens -= 1;
      resolve();
    }

    if (state.queue.length === 0 && state.tokens === state.maxTokens) {
      clearInterval(state.refillTimer);
      state.refillTimer = null;
    }
  }, state.intervalMs);
}

export function createRateLimiter({ tokensPerInterval = DEFAULT_TOKENS_PER_INTERVAL, intervalMs = DEFAULT_INTERVAL_MS, maxTokens = tokensPerInterval } = {}) {
  const state = {
    tokens: tokensPerInterval,
    maxTokens,
    intervalMs,
    refillAmount: tokensPerInterval,
    queue: [],
    refillTimer: null
  };

  function tryConsume() {
    if (state.tokens > 0) {
      state.tokens -= 1;
      scheduleFlush(state);
      return true;
    }
    scheduleFlush(state);
    return false;
  }

  async function acquire() {
    if (tryConsume()) {
      return;
    }

    await new Promise((resolve) => {
      state.queue.push(resolve);
    });
  }

  return {
    acquire,
    async schedule(task) {
      await acquire();

      try {
        const result = await task();
        return result;
      }
      finally {
        scheduleFlush(state);
      }
    },
    getPendingCount() {
      return state.queue.length;
    }
  };
}
