// Curated starter problems for the MVP. Restated in our own words to sidestep
// LeetCode licensing on the problem text. Approach notes are the "back" of each card.

export interface SeedProblem {
  slug: string;
  title: string;
  source: string;
  url?: string;
  prompt: string;
  approach: string;
  tags: string[];
}

export const SEED_PROBLEMS: SeedProblem[] = [
  {
    slug: "two-sum",
    title: "Two Sum",
    source: "LeetCode 1",
    url: "https://leetcode.com/problems/two-sum/",
    prompt:
      "Given an integer array and a target, return indices of two numbers that add up to the target. Each input has exactly one solution; you may not reuse the same element.",
    approach:
      "One-pass hash map: as you iterate, for each `x` check whether `target - x` is already in the map. If yes, return its index and the current index. Otherwise store `x → i`. O(n) time, O(n) space. Beats the obvious O(n²) double loop.",
    tags: ["array", "hash-map"],
  },
  {
    slug: "valid-parentheses",
    title: "Valid Parentheses",
    source: "LeetCode 20",
    url: "https://leetcode.com/problems/valid-parentheses/",
    prompt:
      "Given a string of brackets `()[]{}`, decide whether every open bracket is closed by the same type in the correct order.",
    approach:
      "Stack. Push opens; on a close, peek-and-pop and confirm types match. Empty stack at the end ⇒ valid. Map closes to their opens to keep the compare clean. O(n) time, O(n) space.",
    tags: ["stack", "string"],
  },
  {
    slug: "best-time-to-buy-stock",
    title: "Best Time to Buy and Sell Stock",
    source: "LeetCode 121",
    url: "https://leetcode.com/problems/best-time-to-buy-and-sell-stock/",
    prompt:
      "Given an array of daily prices, find the max profit from a single buy and a single sale (must buy before selling).",
    approach:
      "Track running minimum so far and running max profit. For each price, profit candidate = price − minSoFar. Update both. O(n) time, O(1) space. The trick is to recognize you don't need the actual buy/sell indices — just the running min suffices.",
    tags: ["array", "dp", "greedy"],
  },
  {
    slug: "binary-tree-level-order",
    title: "Binary Tree Level Order Traversal",
    source: "LeetCode 102",
    url: "https://leetcode.com/problems/binary-tree-level-order-traversal/",
    prompt:
      "Given the root of a binary tree, return the values level by level, left to right, as a list of lists.",
    approach:
      "BFS with a queue, but track level boundaries. Each outer iteration: snapshot queue length n, then dequeue exactly n nodes into the current level list and enqueue their children. O(n) time, O(n) space. Mistake to avoid: trying to track depth on each node — the length-snapshot is cleaner.",
    tags: ["tree", "bfs"],
  },
  {
    slug: "rate-limiter-design",
    title: "Design a Rate Limiter",
    source: "System Design",
    prompt:
      "Design a rate limiter for an API gateway: 100 req/s per user. Sketch algorithm choice, data store, and what happens under multi-region traffic.",
    approach:
      "Token bucket as default — smooth, bursty-friendly, simple to reason about. Per-user state: { tokens, lastRefill }. On request: refill = (now - lastRefill) * rate, capped at burst; if tokens ≥ 1, decrement & allow; else reject (429). Storage: Redis with Lua script to make the read/decide/write atomic and avoid races. Multi-region: prefer regional limits over a global counter — the cross-region coordination cost isn't worth the precision; accept slight over-allowance at region boundaries. Alternative: sliding-window log (more precise, more memory) or fixed window (simpler, allows 2× burst at boundaries).",
    tags: ["system-design", "distributed"],
  },
];
