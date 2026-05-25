// Curated NeetCode 150 starter problems. Restated in our own words to sidestep
// LeetCode licensing on problem text. URLs link to the source page for reference.
//
// Order mirrors the NeetCode 150 categories: Arrays & Hashing, Two Pointers,
// Sliding Window, Stack, Binary Search, Linked List, Trees, Heap, Backtracking,
// Tries, Graphs, Advanced Graphs, 1D DP, 2D DP, Greedy, Intervals, Math &
// Geometry, Bit Manipulation.

export interface SeedProblem {
  slug: string;
  title: string;
  source: string;
  url?: string;
  prompt: string;
  approach: string;
  tags: string[];
}

const LC = (slug: string) => `https://leetcode.com/problems/${slug}/`;
const SRC = "NeetCode 150";

export const SEED_PROBLEMS: SeedProblem[] = [
  // ───── Arrays & Hashing ─────
  {
    slug: "contains-duplicate",
    title: "Contains Duplicate",
    source: SRC,
    url: LC("contains-duplicate"),
    prompt: "Given an integer array, return true iff any value appears at least twice.",
    approach:
      "One pass; insert into a hash set, return true on the first re-insert. O(n) time, O(n) space. Sorting then scanning adjacent is O(n log n) and worse.",
    tags: ["array", "hash-map"],
  },
  {
    slug: "valid-anagram",
    title: "Valid Anagram",
    source: SRC,
    url: LC("valid-anagram"),
    prompt: "Given two strings, decide whether one is a permutation of the other.",
    approach:
      "Length check, then count characters in one map and decrement on the other; any non-zero means false. O(n) time. For lowercase-only, a fixed 26-int array beats a hash map on constants.",
    tags: ["string", "hash-map"],
  },
  {
    slug: "two-sum",
    title: "Two Sum",
    source: SRC,
    url: LC("two-sum"),
    prompt:
      "Given an integer array and a target, return indices of two numbers that add up to the target. Exactly one solution exists; an element can't be reused.",
    approach:
      "One-pass hash map. For each x at index i, check whether target-x is already in the map; if so, return its index and i. Otherwise store x→i. O(n) time, O(n) space — beats the O(n²) double loop.",
    tags: ["array", "hash-map"],
  },
  {
    slug: "group-anagrams",
    title: "Group Anagrams",
    source: SRC,
    url: LC("group-anagrams"),
    prompt: "Group strings into buckets where each bucket holds anagrams of one another.",
    approach:
      "Use a canonical key per string: a length-26 count tuple (or sorted chars). Bucket into a hash map keyed by that tuple. O(n·k) with count-key, O(n·k log k) with sort-key, where k is string length.",
    tags: ["array", "hash-map", "string"],
  },
  {
    slug: "top-k-frequent-elements",
    title: "Top K Frequent Elements",
    source: SRC,
    url: LC("top-k-frequent-elements"),
    prompt: "Given an array and integer k, return the k most frequent values.",
    approach:
      "Count with a hash map; then bucket sort by frequency (index i holds values with count i) and walk from the back, collecting k values. O(n) total — beats the heap solution's O(n log k) and the sort's O(n log n).",
    tags: ["array", "hash-map", "bucket-sort"],
  },
  {
    slug: "encode-and-decode-strings",
    title: "Encode and Decode Strings",
    source: SRC,
    url: LC("encode-and-decode-strings"),
    prompt:
      "Design encode(list<string>) → string and decode(string) → list<string> that survive arbitrary characters in the inputs.",
    approach:
      "Length-prefix each string: `${s.length}#${s}`. Decode reads digits up to '#', then takes that many characters as one string, repeating until end. O(n) both ways. Don't use a separator alone — strings can contain any separator.",
    tags: ["string", "design"],
  },
  {
    slug: "product-of-array-except-self",
    title: "Product of Array Except Self",
    source: SRC,
    url: LC("product-of-array-except-self"),
    prompt:
      "Return an array where each element is the product of all other elements. No division; O(n) time.",
    approach:
      "Two passes. Left pass: out[i] = product of everything to the left. Right pass: multiply out[i] by running right product. O(n) time, O(1) extra space (output excluded). Division would fail on zeros.",
    tags: ["array", "prefix-product"],
  },
  {
    slug: "valid-sudoku",
    title: "Valid Sudoku",
    source: SRC,
    url: LC("valid-sudoku"),
    prompt: "Decide whether a partially-filled 9×9 Sudoku board is valid (no rule violations).",
    approach:
      "One pass; for each filled cell, insert into three sets keyed by row, column, and box index (r/3)*3 + (c/3). Reject on duplicate. O(81) = O(1).",
    tags: ["matrix", "hash-map"],
  },
  {
    slug: "longest-consecutive-sequence",
    title: "Longest Consecutive Sequence",
    source: SRC,
    url: LC("longest-consecutive-sequence"),
    prompt: "Given an unsorted array, return the length of the longest run of consecutive integers.",
    approach:
      "Set of all values. For each x that is a *start* (x-1 not in set), walk forward x, x+1, x+2, ... and track the longest run. Each element visited at most twice → O(n). Sorting is O(n log n).",
    tags: ["array", "hash-set"],
  },

  // ───── Two Pointers ─────
  {
    slug: "valid-palindrome",
    title: "Valid Palindrome",
    source: SRC,
    url: LC("valid-palindrome"),
    prompt:
      "Return true iff a string is a palindrome after lowercasing and ignoring non-alphanumeric characters.",
    approach:
      "Two pointers L=0, R=n-1. Skip non-alphanumeric on each side; compare lowercased chars; advance. O(n) time, O(1) space. Beats building a cleaned string.",
    tags: ["string", "two-pointers"],
  },
  {
    slug: "two-sum-ii-input-array-is-sorted",
    title: "Two Sum II Input Array Is Sorted",
    source: SRC,
    url: LC("two-sum-ii-input-array-is-sorted"),
    prompt: "Given a *sorted* array and a target, return the 1-indexed pair whose values sum to target.",
    approach:
      "Two pointers L, R. If sum < target, move L right; if sum > target, move R left; else done. O(n) time, O(1) space — sortedness lets us skip the hash map.",
    tags: ["array", "two-pointers"],
  },
  {
    slug: "3sum",
    title: "3Sum",
    source: SRC,
    url: LC("3sum"),
    prompt: "Return all unique triplets [a,b,c] from an integer array with a+b+c = 0.",
    approach:
      "Sort. Fix i and run two-pointers on the remainder for target -nums[i]. Skip duplicate values at both i and the inner pointers to avoid duplicate triplets. O(n²) time, O(1) extra.",
    tags: ["array", "two-pointers"],
  },
  {
    slug: "container-with-most-water",
    title: "Container With Most Water",
    source: SRC,
    url: LC("container-with-most-water"),
    prompt:
      "Given heights, pick two indices forming a container; return the maximum area = min(h_L, h_R) × (R-L).",
    approach:
      "Two pointers from the ends. Always move the smaller side inward — the only way to possibly improve the area, since moving the taller side can only shrink the width and not raise min. O(n) time.",
    tags: ["array", "two-pointers"],
  },
  {
    slug: "trapping-rain-water",
    title: "Trapping Rain Water",
    source: SRC,
    url: LC("trapping-rain-water"),
    prompt: "Given elevation heights, compute total water trapped after rain.",
    approach:
      "Two pointers tracking maxLeft and maxRight. Whichever side's max is smaller determines water at that index (smaller − height[i]); advance from that side. O(n) time, O(1) space. DP-on-prefix-max also works in O(n) but uses O(n) extra.",
    tags: ["array", "two-pointers"],
  },

  // ───── Sliding Window ─────
  {
    slug: "best-time-to-buy-and-sell-stock",
    title: "Best Time to Buy And Sell Stock",
    source: SRC,
    url: LC("best-time-to-buy-and-sell-stock"),
    prompt:
      "Given an array of daily prices, find max profit from one buy and one later sale.",
    approach:
      "Track running minimum so far and running max profit. For each price: profit candidate = price − minSoFar; update both. O(n) time, O(1) space. The trick is realizing you don't need both indices — just the running min.",
    tags: ["array", "dp", "greedy"],
  },
  {
    slug: "longest-substring-without-repeating-characters",
    title: "Longest Substring Without Repeating Characters",
    source: SRC,
    url: LC("longest-substring-without-repeating-characters"),
    prompt: "Return the length of the longest substring with all distinct characters.",
    approach:
      "Sliding window [L,R]. Maintain a set of chars in-window. On duplicate at R, advance L (removing chars) until the duplicate is gone; record window length. O(n) time, O(min(n, alphabet)) space.",
    tags: ["string", "sliding-window", "hash-set"],
  },
  {
    slug: "longest-repeating-character-replacement",
    title: "Longest Repeating Character Replacement",
    source: SRC,
    url: LC("longest-repeating-character-replacement"),
    prompt:
      "Given a string and integer k, return the longest substring achievable by replacing up to k characters.",
    approach:
      "Sliding window with letter-count map and a running max-count. Window is valid while (length − maxCount) ≤ k; otherwise shrink from L. Answer is max window size. O(n) time, O(26) space.",
    tags: ["string", "sliding-window"],
  },
  {
    slug: "permutation-in-string",
    title: "Permutation In String",
    source: SRC,
    url: LC("permutation-in-string"),
    prompt: "Decide whether any permutation of s1 is a substring of s2.",
    approach:
      "Fixed-size sliding window of length |s1| over s2. Maintain 26-int counts; compare to s1's counts each step (or track a 'matches' counter incrementally). O(n) time.",
    tags: ["string", "sliding-window"],
  },
  {
    slug: "minimum-window-substring",
    title: "Minimum Window Substring",
    source: SRC,
    url: LC("minimum-window-substring"),
    prompt: "Smallest substring of s containing every character of t (with multiplicity).",
    approach:
      "Sliding window. Track required-count map and a 'have' counter of distinct chars meeting their required count. Expand R until have == need, then contract L while still valid, recording min length. O(|s| + |t|).",
    tags: ["string", "sliding-window", "hash-map"],
  },
  {
    slug: "sliding-window-maximum",
    title: "Sliding Window Maximum",
    source: SRC,
    url: LC("sliding-window-maximum"),
    prompt: "For each window of size k in array nums, return the maximum.",
    approach:
      "Monotonic decreasing deque of indices. Before pushing i, pop from the back while nums[back] ≤ nums[i]; pop from the front if it's out of window. Front is current max. O(n) time, O(k) space.",
    tags: ["array", "sliding-window", "monotonic-deque"],
  },

  // ───── Stack ─────
  {
    slug: "valid-parentheses",
    title: "Valid Parentheses",
    source: SRC,
    url: LC("valid-parentheses"),
    prompt: "Given a string of `()[]{}`, decide whether every open bracket is closed in the correct order.",
    approach:
      "Stack of opens. On a close, peek-and-pop; verify type match via a close→open map. Empty stack at end ⇒ valid. O(n) time, O(n) space.",
    tags: ["string", "stack"],
  },
  {
    slug: "min-stack",
    title: "Min Stack",
    source: SRC,
    url: LC("min-stack"),
    prompt: "Design a stack supporting push, pop, top, and getMin — all in O(1).",
    approach:
      "Two stacks: the main one, and a 'min stack' that pushes the new minimum on each push (or only on a *new* minimum and pops in sync). getMin = peek the min stack.",
    tags: ["stack", "design"],
  },
  {
    slug: "evaluate-reverse-polish-notation",
    title: "Evaluate Reverse Polish Notation",
    source: SRC,
    url: LC("evaluate-reverse-polish-notation"),
    prompt: "Evaluate an arithmetic expression given in postfix (RPN) form.",
    approach:
      "Stack of integers. For each token: if number, push; if operator, pop two operands (mind the order — second popped is left operand for /, -), apply, push result. Final top is the answer. O(n).",
    tags: ["array", "stack"],
  },
  {
    slug: "generate-parentheses",
    title: "Generate Parentheses",
    source: SRC,
    url: LC("generate-parentheses"),
    prompt: "Generate all well-formed strings of n pairs of parentheses.",
    approach:
      "Backtrack with counts (open, close). Add '(' if open < n; add ')' if close < open. Base case: open == close == n. Avoids the generate-then-filter cost. O(Catalan(n)) results.",
    tags: ["string", "backtracking", "stack"],
  },
  {
    slug: "daily-temperatures",
    title: "Daily Temperatures",
    source: SRC,
    url: LC("daily-temperatures"),
    prompt:
      "For each day's temperature, return the number of days until a strictly warmer day (0 if none).",
    approach:
      "Monotonic decreasing stack of indices. On each i: while stack-top temp is colder than today, pop and set answer[popped] = i − popped. Push i. O(n) amortized.",
    tags: ["array", "stack", "monotonic-stack"],
  },
  {
    slug: "car-fleet",
    title: "Car Fleet",
    source: SRC,
    url: LC("car-fleet"),
    prompt:
      "Cars at various positions move toward a target at given speeds. Slower cars block faster ones. How many fleets arrive?",
    approach:
      "Sort cars by position descending. Walk left→right computing time-to-target for each; a car forms a new fleet iff its time strictly exceeds the running max. Count fleets. O(n log n).",
    tags: ["array", "stack", "greedy"],
  },
  {
    slug: "largest-rectangle-in-histogram",
    title: "Largest Rectangle In Histogram",
    source: SRC,
    url: LC("largest-rectangle-in-histogram"),
    prompt: "Largest rectangle area in a histogram of bar heights.",
    approach:
      "Monotonic increasing stack of (startIndex, height). For each bar, pop while it's shorter than the top; on each pop, compute area = popped.height × (i − popped.startIndex), tracking max. Push (popped.startIndex, current). Flush at end. O(n).",
    tags: ["array", "stack", "monotonic-stack"],
  },

  // ───── Binary Search ─────
  {
    slug: "binary-search",
    title: "Binary Search",
    source: SRC,
    url: LC("binary-search"),
    prompt: "Find a target in a sorted array; return its index or -1.",
    approach:
      "Standard binary search. Use mid = L + (R-L)/2 (overflow-safe). Loop while L ≤ R. O(log n).",
    tags: ["array", "binary-search"],
  },
  {
    slug: "search-a-2d-matrix",
    title: "Search a 2D Matrix",
    source: SRC,
    url: LC("search-a-2d-matrix"),
    prompt:
      "Matrix is row-sorted and the first element of each row is greater than the last of the previous. Find target.",
    approach:
      "Treat it as a sorted 1D array of length m·n; index i maps to (i/n, i%n). Binary search. O(log(m·n)).",
    tags: ["matrix", "binary-search"],
  },
  {
    slug: "koko-eating-bananas",
    title: "Koko Eating Bananas",
    source: SRC,
    url: LC("koko-eating-bananas"),
    prompt:
      "Choose the smallest eating-rate k bananas/hour so Koko finishes all piles within h hours.",
    approach:
      "Binary search k in [1, max(piles)]. For each k, sum ceil(pile/k) over piles; if ≤ h, k is feasible — try smaller. O(n log max).",
    tags: ["array", "binary-search"],
  },
  {
    slug: "find-minimum-in-rotated-sorted-array",
    title: "Find Minimum In Rotated Sorted Array",
    source: SRC,
    url: LC("find-minimum-in-rotated-sorted-array"),
    prompt: "Sorted ascending array rotated at some pivot. Find the minimum.",
    approach:
      "Binary search comparing nums[mid] to nums[R]. If nums[mid] > nums[R], minimum is in (mid, R] so L = mid+1; else minimum is in [L, mid] so R = mid. O(log n).",
    tags: ["array", "binary-search"],
  },
  {
    slug: "search-in-rotated-sorted-array",
    title: "Search In Rotated Sorted Array",
    source: SRC,
    url: LC("search-in-rotated-sorted-array"),
    prompt: "Find a target in a rotated sorted array.",
    approach:
      "Binary search with side-check. At mid, determine which side is sorted (compare nums[L] to nums[mid]). If target lies in that sorted side's range, search there; otherwise the other side. O(log n).",
    tags: ["array", "binary-search"],
  },
  {
    slug: "time-based-key-value-store",
    title: "Time Based Key Value Store",
    source: SRC,
    url: LC("time-based-key-value-store"),
    prompt:
      "Design a key-value store where set(k, v, t) records and get(k, t) returns the value at the largest timestamp ≤ t.",
    approach:
      "Map<key, list<(timestamp, value)>>. Sets are append (timestamps are non-decreasing per problem). Get: binary search for the largest timestamp ≤ t. set O(1), get O(log n).",
    tags: ["binary-search", "design", "hash-map"],
  },
  {
    slug: "median-of-two-sorted-arrays",
    title: "Median of Two Sorted Arrays",
    source: SRC,
    url: LC("median-of-two-sorted-arrays"),
    prompt: "Find the median of two sorted arrays in O(log(min(m, n))).",
    approach:
      "Binary search the partition of the smaller array. Pick partitionX in [0, m]; partitionY = (m+n+1)/2 − partitionX. Check that max(leftX, leftY) ≤ min(rightX, rightY); shrink the search otherwise. Median from the four boundary elements.",
    tags: ["array", "binary-search"],
  },

  // ───── Linked List ─────
  {
    slug: "reverse-linked-list",
    title: "Reverse Linked List",
    source: SRC,
    url: LC("reverse-linked-list"),
    prompt: "Reverse a singly linked list in place; return the new head.",
    approach:
      "Iterate with prev=null, curr=head. While curr: save next, point curr.next at prev, advance prev and curr. Return prev. O(n) time, O(1) space.",
    tags: ["linked-list"],
  },
  {
    slug: "merge-two-sorted-lists",
    title: "Merge Two Sorted Lists",
    source: SRC,
    url: LC("merge-two-sorted-lists"),
    prompt: "Merge two sorted linked lists into one sorted list.",
    approach:
      "Dummy head; tail pointer walks. While both non-null, attach the smaller head and advance. Append the remaining list. O(m+n).",
    tags: ["linked-list"],
  },
  {
    slug: "linked-list-cycle",
    title: "Linked List Cycle",
    source: SRC,
    url: LC("linked-list-cycle"),
    prompt: "Return true iff a linked list contains a cycle.",
    approach:
      "Floyd's tortoise and hare. Slow advances 1, fast advances 2. If they meet, there's a cycle; if fast hits null, no cycle. O(n) time, O(1) space — beats the hash-set approach.",
    tags: ["linked-list", "two-pointers"],
  },
  {
    slug: "reorder-list",
    title: "Reorder List",
    source: SRC,
    url: LC("reorder-list"),
    prompt: "Reorder a list L0→L1→…→Ln-1 into L0→Ln-1→L1→Ln-2→… in place.",
    approach:
      "Three phases: (1) find middle (slow/fast), (2) reverse second half, (3) merge two halves alternately. O(n) time, O(1) space.",
    tags: ["linked-list", "two-pointers"],
  },
  {
    slug: "remove-nth-node-from-end-of-list",
    title: "Remove Nth Node From End of List",
    source: SRC,
    url: LC("remove-nth-node-from-end-of-list"),
    prompt: "Remove the nth-from-end node and return the head.",
    approach:
      "Dummy head before head to handle removing the first node uniformly. Two pointers; advance fast n+1 steps, then move both until fast is null. slow.next is the node to remove. O(n), single pass.",
    tags: ["linked-list", "two-pointers"],
  },
  {
    slug: "copy-list-with-random-pointer",
    title: "Copy List With Random Pointer",
    source: SRC,
    url: LC("copy-list-with-random-pointer"),
    prompt:
      "Deep-copy a linked list whose nodes have both next and a random pointer (to any node or null).",
    approach:
      "Two passes with a hash map. Pass 1: create clones, map original→clone. Pass 2: wire clones' next and random via the map. O(n) time, O(n) space. (Interleaving clones in-place achieves O(1) space.)",
    tags: ["linked-list", "hash-map"],
  },
  {
    slug: "add-two-numbers",
    title: "Add Two Numbers",
    source: SRC,
    url: LC("add-two-numbers"),
    prompt:
      "Two linked lists store non-negative integers in reverse-digit order. Return the sum as a linked list.",
    approach:
      "Walk both lists in parallel with a carry. At each step, sum = a + b + carry; new node value = sum % 10; carry = sum / 10. Handle different lengths and a trailing carry. O(max(m,n)).",
    tags: ["linked-list", "math"],
  },
  {
    slug: "find-the-duplicate-number",
    title: "Find The Duplicate Number",
    source: SRC,
    url: LC("find-the-duplicate-number"),
    prompt:
      "Array of n+1 integers in [1,n]; exactly one value repeats. Find it without modifying the array and in O(1) extra space.",
    approach:
      "Treat indices/values as a linked list with a cycle (a[i] is the next pointer). Floyd's tortoise and hare finds the cycle; second pass from start and meeting point finds the entry — the duplicate. O(n) time, O(1) space.",
    tags: ["array", "two-pointers"],
  },
  {
    slug: "lru-cache",
    title: "LRU Cache",
    source: SRC,
    url: LC("lru-cache"),
    prompt: "Design an LRU cache with O(1) get and put for a given capacity.",
    approach:
      "Hash map: key → doubly-linked-list node. List orders nodes by recency (front = most recent). On get/put: move/insert to front; on overflow, evict the tail node and its map entry.",
    tags: ["linked-list", "hash-map", "design"],
  },
  {
    slug: "merge-k-sorted-lists",
    title: "Merge K Sorted Lists",
    source: SRC,
    url: LC("merge-k-sorted-lists"),
    prompt: "Merge k sorted linked lists into one sorted list.",
    approach:
      "Two clean options: (a) min-heap of k current heads → repeatedly pop the smallest and push its next; O(N log k) where N total nodes. (b) Pairwise merge in log k rounds.",
    tags: ["linked-list", "heap", "divide-and-conquer"],
  },
  {
    slug: "reverse-nodes-in-k-group",
    title: "Reverse Nodes In K Group",
    source: SRC,
    url: LC("reverse-nodes-in-k-group"),
    prompt: "Reverse the list k nodes at a time; leftover tail (length < k) keeps its order.",
    approach:
      "Walk in groups of k. For each full group, reverse those k nodes in place and stitch the previous group's tail to the new head. Use a dummy head. O(n) time, O(1) space.",
    tags: ["linked-list"],
  },

  // ───── Trees ─────
  {
    slug: "invert-binary-tree",
    title: "Invert Binary Tree",
    source: SRC,
    url: LC("invert-binary-tree"),
    prompt: "Mirror a binary tree — swap left and right at every node.",
    approach:
      "Recurse: swap left and right children at the current node, recurse on each. Or BFS with a queue. O(n) time, O(h) recursion depth.",
    tags: ["tree", "recursion"],
  },
  {
    slug: "maximum-depth-of-binary-tree",
    title: "Maximum Depth of Binary Tree",
    source: SRC,
    url: LC("maximum-depth-of-binary-tree"),
    prompt: "Return the depth of the deepest leaf.",
    approach:
      "Recurse: 0 if null, else 1 + max(left depth, right depth). O(n) time, O(h) recursion. BFS counting levels also works.",
    tags: ["tree", "recursion"],
  },
  {
    slug: "diameter-of-binary-tree",
    title: "Diameter of Binary Tree",
    source: SRC,
    url: LC("diameter-of-binary-tree"),
    prompt:
      "Return the length of the longest path between any two nodes (counted in edges).",
    approach:
      "DFS returning height. At each node compute candidate = leftHeight + rightHeight; track max in a closure or wrapper. Return 1 + max(leftHeight, rightHeight) up. O(n) time.",
    tags: ["tree", "dfs"],
  },
  {
    slug: "balanced-binary-tree",
    title: "Balanced Binary Tree",
    source: SRC,
    url: LC("balanced-binary-tree"),
    prompt: "Decide whether every node's two subtrees differ in height by at most 1.",
    approach:
      "DFS returning height OR -1 if any subtree is unbalanced. At each node, if either child returned -1 or |left−right| > 1, propagate -1. O(n) time.",
    tags: ["tree", "dfs"],
  },
  {
    slug: "same-tree",
    title: "Same Tree",
    source: SRC,
    url: LC("same-tree"),
    prompt: "Decide whether two binary trees are structurally identical with equal values.",
    approach:
      "Recurse on pairs. Both null → true. One null → false. Different values → false. Recurse on (l.left, r.left) and (l.right, r.right). O(n).",
    tags: ["tree", "recursion"],
  },
  {
    slug: "subtree-of-another-tree",
    title: "Subtree of Another Tree",
    source: SRC,
    url: LC("subtree-of-another-tree"),
    prompt: "Decide whether subRoot is a subtree of root.",
    approach:
      "DFS root; at each node, sameTree(node, subRoot) → return true. O(m·n) worst case. Optimal is hashing both via Merkle-style subtree signatures for O(m+n).",
    tags: ["tree", "recursion"],
  },
  {
    slug: "lowest-common-ancestor-of-a-binary-search-tree",
    title: "Lowest Common Ancestor of a Binary Search Tree",
    source: SRC,
    url: LC("lowest-common-ancestor-of-a-binary-search-tree"),
    prompt: "Find the LCA of two nodes in a BST.",
    approach:
      "Walk from root. If both p and q are smaller than current, go left; if both larger, go right; otherwise current is the LCA (split point). O(h).",
    tags: ["tree", "bst"],
  },
  {
    slug: "binary-tree-level-order-traversal",
    title: "Binary Tree Level Order Traversal",
    source: SRC,
    url: LC("binary-tree-level-order-traversal"),
    prompt: "Return node values level-by-level, left to right.",
    approach:
      "BFS with a queue. Each outer iteration: snapshot queue length n; dequeue exactly n nodes into the current level's list and enqueue their children. O(n) time and space.",
    tags: ["tree", "bfs"],
  },
  {
    slug: "binary-tree-right-side-view",
    title: "Binary Tree Right Side View",
    source: SRC,
    url: LC("binary-tree-right-side-view"),
    prompt: "Return the rightmost node value at each depth.",
    approach:
      "BFS level-by-level — take the last node of each level. Or DFS visiting right child first, tracking depth and pushing to answer the first time depth == answer.length.",
    tags: ["tree", "bfs", "dfs"],
  },
  {
    slug: "count-good-nodes-in-binary-tree",
    title: "Count Good Nodes In Binary Tree",
    source: SRC,
    url: LC("count-good-nodes-in-binary-tree"),
    prompt:
      "Count nodes for which no node on the root-to-node path has a strictly greater value.",
    approach:
      "DFS carrying the running max along the path. At each node, if value ≥ max, increment count and update max. O(n).",
    tags: ["tree", "dfs"],
  },
  {
    slug: "validate-binary-search-tree",
    title: "Validate Binary Search Tree",
    source: SRC,
    url: LC("validate-binary-search-tree"),
    prompt: "Decide whether a binary tree is a valid BST.",
    approach:
      "DFS with a (lo, hi) interval. At each node, value must be strictly inside (lo, hi); recurse left with (lo, value) and right with (value, hi). Equivalently, inorder traversal must be strictly increasing.",
    tags: ["tree", "bst", "dfs"],
  },
  {
    slug: "kth-smallest-element-in-a-bst",
    title: "Kth Smallest Element In a Bst",
    source: SRC,
    url: LC("kth-smallest-element-in-a-bst"),
    prompt: "Return the k-th smallest value in a BST.",
    approach:
      "Iterative inorder traversal with a stack; count nodes as you pop. The k-th popped is the answer. O(h+k). For repeated queries, augment the BST with subtree sizes.",
    tags: ["tree", "bst", "stack"],
  },
  {
    slug: "construct-binary-tree-from-preorder-and-inorder-traversal",
    title: "Construct Binary Tree From Preorder And Inorder Traversal",
    source: SRC,
    url: LC("construct-binary-tree-from-preorder-and-inorder-traversal"),
    prompt: "Rebuild a binary tree from its preorder and inorder traversals (unique values).",
    approach:
      "Preorder's first element is the root; locate it in inorder to split left/right subtrees, then recurse. Use a hash map inorder-value→index for O(1) lookups → O(n) total.",
    tags: ["tree", "recursion"],
  },
  {
    slug: "binary-tree-maximum-path-sum",
    title: "Binary Tree Maximum Path Sum",
    source: SRC,
    url: LC("binary-tree-maximum-path-sum"),
    prompt: "Max sum of any path in a binary tree (path = sequence of connected nodes).",
    approach:
      "DFS returning max single-branch sum (≥0; clamp negatives to 0). At each node, candidate = node.val + left + right; track max. Return node.val + max(left, right). O(n).",
    tags: ["tree", "dfs"],
  },
  {
    slug: "serialize-and-deserialize-binary-tree",
    title: "Serialize And Deserialize Binary Tree",
    source: SRC,
    url: LC("serialize-and-deserialize-binary-tree"),
    prompt: "Design a roundtrip codec for an arbitrary binary tree.",
    approach:
      "Preorder DFS with explicit null markers ('null'). Comma-join for serialize; iterator over the tokens for deserialize, recursing the same way. O(n) both ways.",
    tags: ["tree", "design", "dfs"],
  },

  // ───── Heap / Priority Queue ─────
  {
    slug: "kth-largest-element-in-a-stream",
    title: "Kth Largest Element In a Stream",
    source: SRC,
    url: LC("kth-largest-element-in-a-stream"),
    prompt: "Design a structure supporting add(val); add returns the k-th largest seen so far.",
    approach:
      "Min-heap of size k. add: push; if size > k, pop. Top is the k-th largest. O(log k) per add.",
    tags: ["heap", "design"],
  },
  {
    slug: "last-stone-weight",
    title: "Last Stone Weight",
    source: SRC,
    url: LC("last-stone-weight"),
    prompt:
      "Repeatedly smash the two heaviest stones (difference if any survives). Return the last remaining weight (0 if none).",
    approach:
      "Max-heap. Pop two, push back |a−b| if non-zero. Repeat until ≤1 left. O(n log n).",
    tags: ["heap"],
  },
  {
    slug: "k-closest-points-to-origin",
    title: "K Closest Points to Origin",
    source: SRC,
    url: LC("k-closest-points-to-origin"),
    prompt: "Return the k points closest to (0,0) by Euclidean distance.",
    approach:
      "Max-heap of size k on squared distance — push, evict largest when size > k. O(n log k). Quickselect achieves O(n) average.",
    tags: ["array", "heap"],
  },
  {
    slug: "kth-largest-element-in-an-array",
    title: "Kth Largest Element In An Array",
    source: SRC,
    url: LC("kth-largest-element-in-an-array"),
    prompt: "Find the k-th largest element in an unsorted array.",
    approach:
      "Min-heap of size k → top is answer. O(n log k). Quickselect is O(n) average, O(n²) worst.",
    tags: ["array", "heap"],
  },
  {
    slug: "task-scheduler",
    title: "Task Scheduler",
    source: SRC,
    url: LC("task-scheduler"),
    prompt:
      "Given task labels and a cooldown n, schedule with one task per slot. Same task needs ≥n slots between repeats. Minimum total slots?",
    approach:
      "Formula: let maxCount = highest task frequency; let tied = count of tasks at that frequency. Answer = max(len, (maxCount − 1) × (n + 1) + tied). Beats simulation.",
    tags: ["array", "greedy", "heap"],
  },
  {
    slug: "design-twitter",
    title: "Design Twitter",
    source: SRC,
    url: LC("design-twitter"),
    prompt:
      "Design Twitter with postTweet, follow, unfollow, getNewsFeed (10 most recent tweets by user + followees).",
    approach:
      "Per-user tweet list + follow set. getNewsFeed: heap-merge the most recent tweets across self + followees, take 10. Time-ordered with a monotonic counter so heap comparisons are O(1).",
    tags: ["heap", "design", "hash-map"],
  },
  {
    slug: "find-median-from-data-stream",
    title: "Find Median From Data Stream",
    source: SRC,
    url: LC("find-median-from-data-stream"),
    prompt: "Support addNum and findMedian over a stream.",
    approach:
      "Two heaps: max-heap (lower half) and min-heap (upper half). After each insert, rebalance so |sizes| ≤ 1. Median = top of larger (or mean of tops if equal). O(log n) add, O(1) median.",
    tags: ["heap", "design"],
  },

  // ───── Backtracking ─────
  {
    slug: "subsets",
    title: "Subsets",
    source: SRC,
    url: LC("subsets"),
    prompt: "Return all subsets of an array of distinct integers.",
    approach:
      "Backtracking: at each index decide to include or skip; push the current subset at each call. Generates 2^n subsets. O(n · 2^n).",
    tags: ["backtracking"],
  },
  {
    slug: "combination-sum",
    title: "Combination Sum",
    source: SRC,
    url: LC("combination-sum"),
    prompt:
      "Given distinct positive ints and a target, return all combinations (with repetition allowed) summing to target.",
    approach:
      "Sort. Backtrack with a start index to avoid duplicates; for each candidate ≥ start, subtract and recurse (passing same start to allow reuse). Prune when remaining < 0.",
    tags: ["backtracking"],
  },
  {
    slug: "combination-sum-ii",
    title: "Combination Sum II",
    source: SRC,
    url: LC("combination-sum-ii"),
    prompt: "Like Combination Sum, but each number can be used at most once and inputs may repeat.",
    approach:
      "Sort. Backtrack: advance start (no reuse). Skip duplicates at the *same depth* (if i > start && nums[i] == nums[i-1]).",
    tags: ["backtracking"],
  },
  {
    slug: "permutations",
    title: "Permutations",
    source: SRC,
    url: LC("permutations"),
    prompt: "Return all permutations of distinct integers.",
    approach:
      "Backtrack with a used-set (or in-place swap). At each step, try each unused element. n! results, O(n · n!) total.",
    tags: ["backtracking"],
  },
  {
    slug: "subsets-ii",
    title: "Subsets II",
    source: SRC,
    url: LC("subsets-ii"),
    prompt: "Return all unique subsets when the input may contain duplicates.",
    approach:
      "Sort. Backtrack with start index. Skip duplicates at the same depth (i > start && nums[i] == nums[i-1]).",
    tags: ["backtracking"],
  },
  {
    slug: "word-search",
    title: "Word Search",
    source: SRC,
    url: LC("word-search"),
    prompt:
      "Decide whether a word can be formed by walking adjacent cells (no reuse) in a 2D grid of letters.",
    approach:
      "DFS from each cell that matches word[0]; mark visited in-place (e.g., temporarily overwrite the cell), recurse 4 directions, restore on backtrack. O(m·n·4^L).",
    tags: ["matrix", "backtracking", "dfs"],
  },
  {
    slug: "palindrome-partitioning",
    title: "Palindrome Partitioning",
    source: SRC,
    url: LC("palindrome-partitioning"),
    prompt: "Return all partitions of a string where every substring is a palindrome.",
    approach:
      "Backtrack: at each position, try every prefix that's a palindrome; recurse on the rest. Palindrome check is O(n). Total O(n · 2^n).",
    tags: ["string", "backtracking"],
  },
  {
    slug: "letter-combinations-of-a-phone-number",
    title: "Letter Combinations of a Phone Number",
    source: SRC,
    url: LC("letter-combinations-of-a-phone-number"),
    prompt: "Phone-keypad letters per digit; return all letter combos for a digit string.",
    approach:
      "Backtrack digit-by-digit, appending each letter. 3-4 branches per digit → O(3^n · 4^m) combos.",
    tags: ["string", "backtracking"],
  },
  {
    slug: "two-integer-sum-ii",
    title: "Two Integer Sum II",
    source: SRC,
    url: LC("two-sum-ii-input-array-is-sorted"),
    prompt:
      "Two Sum on a sorted array (NeetCode's renamed variant). Return the 1-indexed pair with sum = target.",
    approach:
      "Same as Two Sum II Input Array Is Sorted: two pointers from the ends; move L right if sum < target, R left if sum > target. O(n).",
    tags: ["array", "two-pointers"],
  },
  {
    slug: "n-queens",
    title: "N Queens",
    source: SRC,
    url: LC("n-queens"),
    prompt: "Return all distinct n-queens placements on an n×n board.",
    approach:
      "Backtrack row-by-row. Track used columns, diag1 (r−c), diag2 (r+c) sets. Try each column at the current row; if all three are free, place and recurse. O(n!).",
    tags: ["backtracking"],
  },

  // ───── Tries ─────
  {
    slug: "implement-trie-prefix-tree",
    title: "Implement Trie Prefix Tree",
    source: SRC,
    url: LC("implement-trie-prefix-tree"),
    prompt: "Implement insert, search, and startsWith on a prefix tree.",
    approach:
      "Each node holds a children map (or 26-array) and an isEnd flag. Walk per character, creating nodes as needed for insert. search asserts isEnd at the end; startsWith doesn't.",
    tags: ["trie", "design"],
  },
  {
    slug: "design-add-and-search-words-data-structure",
    title: "Design Add And Search Words Data Structure",
    source: SRC,
    url: LC("design-add-and-search-words-data-structure"),
    prompt:
      "Like Trie, but search supports '.' which matches any single letter.",
    approach:
      "Trie. search recurses on each char; on '.', try every child. Worst case O(26^L) for L dots but typical use is fine.",
    tags: ["trie", "design"],
  },
  {
    slug: "word-search-ii",
    title: "Word Search II",
    source: SRC,
    url: LC("word-search-ii"),
    prompt: "Find all words from a list that can be formed by walking the board (Word Search).",
    approach:
      "Build a Trie of the word list. DFS each cell, walking the Trie in parallel. Prune dead paths and remove found words from the Trie (set isEnd=false; detach leaf nodes) to keep it small.",
    tags: ["matrix", "trie", "backtracking"],
  },

  // ───── Graphs ─────
  {
    slug: "number-of-islands",
    title: "Number of Islands",
    source: SRC,
    url: LC("number-of-islands"),
    prompt: "Count connected components of '1's in a 2D grid (4-directional adjacency).",
    approach:
      "Scan cells. On unvisited '1', increment count and DFS/BFS the whole island, marking visited (e.g., overwrite to '0' or use a visited set). O(m·n).",
    tags: ["matrix", "graph", "dfs", "bfs"],
  },
  {
    slug: "max-area-of-island",
    title: "Max Area of Island",
    source: SRC,
    url: LC("max-area-of-island"),
    prompt: "Largest area (cell count) of any connected component of 1s.",
    approach:
      "Same as Number of Islands but DFS returns the count of visited cells; track max. O(m·n).",
    tags: ["matrix", "graph", "dfs"],
  },
  {
    slug: "clone-graph",
    title: "Clone Graph",
    source: SRC,
    url: LC("clone-graph"),
    prompt: "Deep-copy an undirected connected graph.",
    approach:
      "DFS/BFS with a hash map original→clone. Create clone on first visit; recurse/enqueue neighbors, wiring clone.neighbors via the map. O(V+E).",
    tags: ["graph", "dfs", "bfs", "hash-map"],
  },
  {
    slug: "walls-and-gates",
    title: "Walls And Gates",
    source: SRC,
    url: LC("walls-and-gates"),
    prompt:
      "Fill each empty cell with distance to its nearest gate. INF if unreachable; walls block.",
    approach:
      "Multi-source BFS from all gates simultaneously. Distance fills outward; first-visit is shortest. O(m·n).",
    tags: ["matrix", "bfs"],
  },
  {
    slug: "rotting-oranges",
    title: "Rotting Oranges",
    source: SRC,
    url: LC("rotting-oranges"),
    prompt:
      "Each minute, rotten oranges (2) rot 4-adjacent fresh ones (1). Return minutes to rot all fresh or -1.",
    approach:
      "Multi-source BFS from all rotten cells. Track fresh count; decrement on infection; depth at end is the answer. -1 if fresh > 0 at end. O(m·n).",
    tags: ["matrix", "bfs"],
  },
  {
    slug: "pacific-atlantic-water-flow",
    title: "Pacific Atlantic Water Flow",
    source: SRC,
    url: LC("pacific-atlantic-water-flow"),
    prompt:
      "Find cells whose water can reach both the Pacific (top/left) and Atlantic (bottom/right) edges.",
    approach:
      "Reverse the flow: BFS/DFS from each ocean's border cells, walking only to neighbors with ≥ current height. Intersect the two reachable sets. O(m·n).",
    tags: ["matrix", "graph", "dfs", "bfs"],
  },
  {
    slug: "surrounded-regions",
    title: "Surrounded Regions",
    source: SRC,
    url: LC("surrounded-regions"),
    prompt: "Flip all Os fully surrounded by Xs to X. Os connected to a border stay.",
    approach:
      "DFS/BFS from every border 'O', marking reachable Os with a sentinel ('#'). Then scan: 'O' → 'X', '#' → 'O'. O(m·n).",
    tags: ["matrix", "graph", "dfs"],
  },
  {
    slug: "course-schedule",
    title: "Course Schedule",
    source: SRC,
    url: LC("course-schedule"),
    prompt:
      "Given course prerequisites, decide whether all courses can be finished (no cycles).",
    approach:
      "DAG cycle detection. DFS with three states (unvisited / in-stack / done) or Kahn's topological sort (BFS with indegree==0 queue). O(V+E).",
    tags: ["graph", "topological-sort"],
  },
  {
    slug: "course-schedule-ii",
    title: "Course Schedule II",
    source: SRC,
    url: LC("course-schedule-ii"),
    prompt: "Return a valid course order or empty if impossible.",
    approach: "Kahn's topological sort: keep popping nodes with indegree 0, decrement neighbors. O(V+E).",
    tags: ["graph", "topological-sort"],
  },
  {
    slug: "graph-valid-tree",
    title: "Graph Valid Tree",
    source: SRC,
    url: LC("graph-valid-tree"),
    prompt:
      "Decide whether n nodes + edges form a tree (connected, acyclic).",
    approach:
      "Two checks: edges == n−1 AND graph is connected (BFS/DFS visit count == n). Union-Find: every edge union; reject if endpoints already share a root.",
    tags: ["graph", "union-find"],
  },
  {
    slug: "number-of-connected-components-in-an-undirected-graph",
    title: "Number of Connected Components In An Undirected Graph",
    source: SRC,
    url: LC("number-of-connected-components-in-an-undirected-graph"),
    prompt: "Count connected components in an undirected graph.",
    approach:
      "Union-Find: start with n components, union each edge that joins two different roots, decrementing. O(E·α(n)).",
    tags: ["graph", "union-find"],
  },
  {
    slug: "redundant-connection",
    title: "Redundant Connection",
    source: SRC,
    url: LC("redundant-connection"),
    prompt: "Given a tree + one extra edge, return the extra edge that closes a cycle.",
    approach:
      "Union-Find. Process edges in order; the first edge whose endpoints already share a root is the answer. O(n·α(n)).",
    tags: ["graph", "union-find"],
  },
  {
    slug: "word-ladder",
    title: "Word Ladder",
    source: SRC,
    url: LC("word-ladder"),
    prompt:
      "Shortest sequence of single-letter swaps from beginWord to endWord through the given word list.",
    approach:
      "BFS on words. Neighbors via pattern keys: for each word build patterns like 'h*t' (one wildcard per position); look up matching words in a prebuilt pattern→words map. O(L²·N).",
    tags: ["string", "graph", "bfs"],
  },

  // ───── Advanced Graphs ─────
  {
    slug: "network-delay-time",
    title: "Network Delay Time",
    source: SRC,
    url: LC("network-delay-time"),
    prompt:
      "Given directed weighted edges (signal travel times) and a source, return time until all nodes get the signal (or -1).",
    approach:
      "Dijkstra from source. Answer is max shortest-path. O(E log V). Bellman-Ford works too if you don't trust positive weights.",
    tags: ["graph", "dijkstra", "heap"],
  },
  {
    slug: "reconstruct-itinerary",
    title: "Reconstruct Itinerary",
    source: SRC,
    url: LC("reconstruct-itinerary"),
    prompt:
      "Given flight tickets, reconstruct the lexicographically smallest itinerary starting from JFK that uses every ticket exactly once.",
    approach:
      "Hierholzer's Eulerian path. Adjacency lists sorted; DFS popping the smallest neighbor each time. Append to a list on return (post-order); reverse at end.",
    tags: ["graph", "dfs", "eulerian"],
  },
  {
    slug: "min-cost-to-connect-all-points",
    title: "Min Cost to Connect All Points",
    source: SRC,
    url: LC("min-cost-to-connect-all-points"),
    prompt: "Connect all points with min total Manhattan-distance edges (MST).",
    approach:
      "Prim's MST with a min-heap on lightest edge to the tree, or Kruskal's with Union-Find on all O(n²) edges. Prim is usually simpler here. O(n² log n).",
    tags: ["graph", "mst", "heap"],
  },
  {
    slug: "swim-in-rising-water",
    title: "Swim In Rising Water",
    source: SRC,
    url: LC("swim-in-rising-water"),
    prompt:
      "Grid of elevations; water rises over time; find the minimum time t such that you can swim from top-left to bottom-right through cells of height ≤ t.",
    approach:
      "Dijkstra-style with a min-heap keyed by max height encountered along the path. Pop, expand to neighbors with key = max(currentKey, neighborHeight). O(n² log n).",
    tags: ["matrix", "graph", "dijkstra", "heap"],
  },
  {
    slug: "alien-dictionary",
    title: "Alien Dictionary",
    source: SRC,
    url: LC("alien-dictionary"),
    prompt:
      "Given alien dictionary words sorted lexicographically by an unknown alphabet, return a valid alphabet ordering (or '' on contradiction).",
    approach:
      "Pairwise compare adjacent words to extract precedence edges (first differing char). Topological sort the resulting graph (Kahn's or DFS). Detect cycles → contradiction. Watch the 'shorter-prefix-after-longer' invalid case.",
    tags: ["graph", "topological-sort"],
  },
  {
    slug: "cheapest-flights-within-k-stops",
    title: "Cheapest Flights Within K Stops",
    source: SRC,
    url: LC("cheapest-flights-within-k-stops"),
    prompt:
      "Cheapest flight from src to dst with at most K stops, given weighted directed edges.",
    approach:
      "Bellman-Ford limited to K+1 relaxations. Each iteration uses the *previous* iteration's costs (clone array) to enforce ≤K stops. O(K · E).",
    tags: ["graph", "dp"],
  },

  // ───── 1-D Dynamic Programming ─────
  {
    slug: "climbing-stairs",
    title: "Climbing Stairs",
    source: SRC,
    url: LC("climbing-stairs"),
    prompt: "How many ways to climb n stairs taking 1 or 2 steps at a time.",
    approach:
      "Fibonacci: f(n) = f(n-1) + f(n-2). Iterate with two rolling variables. O(n) time, O(1) space.",
    tags: ["dp"],
  },
  {
    slug: "min-cost-climbing-stairs",
    title: "Min Cost Climbing Stairs",
    source: SRC,
    url: LC("min-cost-climbing-stairs"),
    prompt:
      "Each step has a cost paid upon stepping on it. From index 0 or 1, find min cost to reach the top (past last index).",
    approach:
      "dp[i] = cost to reach step i = cost[i] + min(dp[i-1], dp[i-2]). Answer = min(dp[n-1], dp[n-2]). O(n), O(1) rolling.",
    tags: ["dp"],
  },
  {
    slug: "house-robber",
    title: "House Robber",
    source: SRC,
    url: LC("house-robber"),
    prompt: "Max sum of non-adjacent values in an array.",
    approach:
      "dp[i] = max(dp[i-1], dp[i-2] + nums[i]). Rolling two variables, O(n) time, O(1) space.",
    tags: ["array", "dp"],
  },
  {
    slug: "house-robber-ii",
    title: "House Robber II",
    source: SRC,
    url: LC("house-robber-ii"),
    prompt: "House Robber on a circular street (first and last are adjacent).",
    approach:
      "Run House Robber on nums[0..n-2] and nums[1..n-1]; answer is the max. Two O(n) passes.",
    tags: ["array", "dp"],
  },
  {
    slug: "longest-palindromic-substring",
    title: "Longest Palindromic Substring",
    source: SRC,
    url: LC("longest-palindromic-substring"),
    prompt: "Return the longest palindromic substring.",
    approach:
      "Expand around center: 2n−1 centers; expand while chars match; track longest. O(n²). Manacher's gives O(n) but is rarely needed in interviews.",
    tags: ["string", "dp"],
  },
  {
    slug: "palindromic-substrings",
    title: "Palindromic Substrings",
    source: SRC,
    url: LC("palindromic-substrings"),
    prompt: "Count distinct palindromic substrings (counted by position).",
    approach: "Expand around center; each successful expansion is a palindrome — count them. O(n²).",
    tags: ["string", "dp"],
  },
  {
    slug: "decode-ways",
    title: "Decode Ways",
    source: SRC,
    url: LC("decode-ways"),
    prompt:
      "Numeric string encodes letters via '1'→'A', ..., '26'→'Z'. Count valid decodings.",
    approach:
      "dp[i] = ways to decode s[0..i). dp[i] += dp[i-1] if s[i-1] is '1'..'9'; dp[i] += dp[i-2] if s[i-2..i] is '10'..'26'. O(n), O(1) rolling.",
    tags: ["string", "dp"],
  },
  {
    slug: "coin-change",
    title: "Coin Change",
    source: SRC,
    url: LC("coin-change"),
    prompt: "Min coins to make amount; -1 if impossible.",
    approach:
      "Bottom-up: dp[a] = 1 + min(dp[a-c]) over coins c. O(amount · |coins|). Initialize dp[0]=0, others = ∞.",
    tags: ["dp"],
  },
  {
    slug: "maximum-product-subarray",
    title: "Maximum Product Subarray",
    source: SRC,
    url: LC("maximum-product-subarray"),
    prompt: "Max product of any contiguous subarray.",
    approach:
      "Track max-ending-here and min-ending-here (negatives flip). max = max(num, num*prevMax, num*prevMin); min = min(...). Update global max. O(n).",
    tags: ["array", "dp"],
  },
  {
    slug: "word-break",
    title: "Word Break",
    source: SRC,
    url: LC("word-break"),
    prompt: "Decide whether s can be segmented into a sequence of dictionary words.",
    approach:
      "dp[i] = can segment s[0..i). dp[0] = true. dp[i] is true if any j < i has dp[j] && s[j..i) ∈ dict. O(n²) with O(L) substring hash cost.",
    tags: ["string", "dp"],
  },
  {
    slug: "longest-increasing-subsequence",
    title: "Longest Increasing Subsequence",
    source: SRC,
    url: LC("longest-increasing-subsequence"),
    prompt: "Length of the longest strictly increasing subsequence.",
    approach:
      "O(n²) DP: dp[i] = 1 + max(dp[j]) for j < i with nums[j] < nums[i]. O(n log n) via patience-sort: maintain tails[]; on each x, binary-search the first tails[k] ≥ x and overwrite; answer is tails.length.",
    tags: ["array", "dp", "binary-search"],
  },
  {
    slug: "partition-equal-subset-sum",
    title: "Partition Equal Subset Sum",
    source: SRC,
    url: LC("partition-equal-subset-sum"),
    prompt: "Decide whether the array can be partitioned into two subsets with equal sum.",
    approach:
      "Target = total/2 (require total even). Subset-sum DP: bitset of reachable sums; for each x, reachable |= reachable << x. Test bit at target. O(n · sum / 64).",
    tags: ["array", "dp"],
  },

  // ───── 2-D Dynamic Programming ─────
  {
    slug: "unique-paths",
    title: "Unique Paths",
    source: SRC,
    url: LC("unique-paths"),
    prompt:
      "Count paths from top-left to bottom-right of an m×n grid using only right or down moves.",
    approach:
      "dp[i][j] = dp[i-1][j] + dp[i][j-1] with first row/col = 1. O(m·n) time, O(n) space rolling. Closed form: C(m+n-2, m-1).",
    tags: ["matrix", "dp"],
  },
  {
    slug: "longest-common-subsequence",
    title: "Longest Common Subsequence",
    source: SRC,
    url: LC("longest-common-subsequence"),
    prompt: "Length of the longest subsequence common to two strings.",
    approach:
      "dp[i][j] = LCS of prefixes. If chars match, dp[i][j] = 1 + dp[i-1][j-1]; else max(dp[i-1][j], dp[i][j-1]). O(m·n).",
    tags: ["string", "dp"],
  },
  {
    slug: "best-time-to-buy-and-sell-stock-with-cooldown",
    title: "Best Time to Buy And Sell Stock With Cooldown",
    source: SRC,
    url: LC("best-time-to-buy-and-sell-stock-with-cooldown"),
    prompt:
      "Trade stock with unlimited transactions, but after a sell you must wait one day before buying again. Max profit?",
    approach:
      "State DP with three states: held, sold (just sold today), rest. Transitions: hold = max(prevHold, prevRest − price); sold = prevHold + price; rest = max(prevRest, prevSold). O(n), O(1).",
    tags: ["array", "dp"],
  },
  {
    slug: "coin-change-ii",
    title: "Coin Change II",
    source: SRC,
    url: LC("coin-change-ii"),
    prompt: "Count ways to make amount with unlimited supply of each coin.",
    approach:
      "Unbounded-knapsack count DP. dp[a] = ways. For each coin c (outer): for a from c..amount: dp[a] += dp[a-c]. The coin-outer ordering prevents double-counting permutations. O(amount · |coins|).",
    tags: ["dp"],
  },
  {
    slug: "target-sum",
    title: "Target Sum",
    source: SRC,
    url: LC("target-sum"),
    prompt:
      "Assign + or − to each number to reach a target. Count expressions.",
    approach:
      "Let P be the subset assigned '+', N the rest. P - N = target, P + N = sum → P = (sum + target)/2 (must be non-negative integer). Reduces to subset-sum count to P. O(n · sum).",
    tags: ["dp"],
  },
  {
    slug: "interleaving-string",
    title: "Interleaving String",
    source: SRC,
    url: LC("interleaving-string"),
    prompt:
      "Decide whether s3 is formed by interleaving s1 and s2 preserving each's order.",
    approach:
      "dp[i][j] = can form s3[0..i+j) from s1[0..i) and s2[0..j). dp[i][j] = (dp[i-1][j] && s1[i-1]==s3[i+j-1]) OR (dp[i][j-1] && s2[j-1]==s3[i+j-1]). O(m·n).",
    tags: ["string", "dp"],
  },
  {
    slug: "longest-increasing-path-in-a-matrix",
    title: "Longest Increasing Path In a Matrix",
    source: SRC,
    url: LC("longest-increasing-path-in-a-matrix"),
    prompt: "Longest strictly increasing path in a 2D grid (4-directional moves).",
    approach:
      "DFS + memoization. memo[i][j] = 1 + max over neighbors with greater value. O(m·n).",
    tags: ["matrix", "dp", "dfs"],
  },
  {
    slug: "distinct-subsequences",
    title: "Distinct Subsequences",
    source: SRC,
    url: LC("distinct-subsequences"),
    prompt: "Count distinct subsequences of s equal to t.",
    approach:
      "dp[i][j] = ways to form t[0..j) from s[0..i). dp[i][j] = dp[i-1][j] + (s[i-1]==t[j-1] ? dp[i-1][j-1] : 0). dp[i][0] = 1. O(m·n).",
    tags: ["string", "dp"],
  },
  {
    slug: "edit-distance",
    title: "Edit Distance",
    source: SRC,
    url: LC("edit-distance"),
    prompt: "Min insert/delete/replace operations to convert s1 to s2.",
    approach:
      "dp[i][j] = edit distance between prefixes. If chars match, dp[i][j] = dp[i-1][j-1]; else 1 + min(insert, delete, replace) = 1 + min(dp[i][j-1], dp[i-1][j], dp[i-1][j-1]). O(m·n).",
    tags: ["string", "dp"],
  },
  {
    slug: "burst-balloons",
    title: "Burst Balloons",
    source: SRC,
    url: LC("burst-balloons"),
    prompt:
      "Burst balloons one at a time; bursting balloon i scores left*i*right where left and right are current neighbors. Maximize total score.",
    approach:
      "Interval DP. Pad with 1s on both ends. dp[l][r] = max score bursting all between l and r exclusive. Try each k as the *last* to burst in (l,r): dp[l][r] = max over k of dp[l][k] + dp[k][r] + nums[l]*nums[k]*nums[r]. O(n³).",
    tags: ["dp", "interval-dp"],
  },
  {
    slug: "regular-expression-matching",
    title: "Regular Expression Matching",
    source: SRC,
    url: LC("regular-expression-matching"),
    prompt: "Regex with '.' (any single) and '*' (zero or more of previous). Match entire s against p.",
    approach:
      "dp[i][j] = s[0..i) matches p[0..j). If p[j-1] == '*': dp[i][j] = dp[i][j-2] (zero) OR (matches(s[i-1], p[j-2]) && dp[i-1][j]) (more). Else: matches && dp[i-1][j-1]. O(m·n).",
    tags: ["string", "dp"],
  },

  // ───── Greedy ─────
  {
    slug: "maximum-subarray",
    title: "Maximum Subarray",
    source: SRC,
    url: LC("maximum-subarray"),
    prompt: "Max sum of a contiguous subarray (Kadane's).",
    approach:
      "Running sum: at each x, runningSum = max(x, runningSum + x); update global max. O(n), O(1).",
    tags: ["array", "dp", "greedy"],
  },
  {
    slug: "jump-game",
    title: "Jump Game",
    source: SRC,
    url: LC("jump-game"),
    prompt: "Each entry is max jump length. Decide whether you can reach the last index from index 0.",
    approach:
      "Greedy: track farthest reachable. For each i ≤ farthest, update farthest = max(farthest, i + nums[i]). If farthest ≥ last index, true. O(n).",
    tags: ["array", "greedy"],
  },
  {
    slug: "jump-game-ii",
    title: "Jump Game II",
    source: SRC,
    url: LC("jump-game-ii"),
    prompt: "Min number of jumps to reach the last index.",
    approach:
      "BFS-style: maintain currentEnd (end of current jump range) and farthest. On reaching i == currentEnd, jumps++, currentEnd = farthest. O(n).",
    tags: ["array", "greedy"],
  },
  {
    slug: "gas-station",
    title: "Gas Station",
    source: SRC,
    url: LC("gas-station"),
    prompt:
      "Find the unique starting gas station that allows a complete loop, or -1.",
    approach:
      "If sum(gas) < sum(cost), no solution. Otherwise scan once: running tank; on tank < 0, reset and set start = i+1. O(n).",
    tags: ["array", "greedy"],
  },
  {
    slug: "hand-of-straights",
    title: "Hand of Straights",
    source: SRC,
    url: LC("hand-of-straights"),
    prompt:
      "Decide whether the hand can be split into groups of size W, each group being W consecutive integers.",
    approach:
      "Counter map. Sort distinct cards (or use a TreeMap). For each smallest still-present card x, decrement counts for x, x+1, ..., x+W-1; fail if any count goes negative.",
    tags: ["array", "greedy", "hash-map"],
  },
  {
    slug: "merge-triplets-to-form-target-triplet",
    title: "Merge Triplets to Form Target Triplet",
    source: SRC,
    url: LC("merge-triplets-to-form-target-triplet"),
    prompt:
      "Triplets, merged by taking component-wise max. Decide if some subset's merge equals target.",
    approach:
      "Filter out triplets exceeding target on any axis. From the survivors, take component-wise max; check equality with target. O(n).",
    tags: ["array", "greedy"],
  },
  {
    slug: "partition-labels",
    title: "Partition Labels",
    source: SRC,
    url: LC("partition-labels"),
    prompt: "Partition a string into pieces so each letter appears in at most one piece.",
    approach:
      "Last-occurrence map. Walk with start and end; expand end to lastOccurrence[c]; on i == end, close a piece (length = end − start + 1), advance. O(n).",
    tags: ["string", "greedy"],
  },
  {
    slug: "valid-parenthesis-string",
    title: "Valid Parenthesis String",
    source: SRC,
    url: LC("valid-parenthesis-string"),
    prompt: "String of '(', ')', '*' (any). Decide if it can be balanced.",
    approach:
      "Track range [lo, hi] of possible open counts. '(': lo++, hi++. ')': lo--, hi--. '*': lo--, hi++. If hi < 0 fail; clamp lo at 0. At end, lo == 0 ⇒ valid. O(n).",
    tags: ["string", "greedy"],
  },

  // ───── Intervals ─────
  {
    slug: "insert-interval",
    title: "Insert Interval",
    source: SRC,
    url: LC("insert-interval"),
    prompt: "Insert a new interval into a sorted, non-overlapping list and merge as needed.",
    approach:
      "Three passes: append all intervals ending before new (no overlap), merge all overlapping into new, append remaining. O(n).",
    tags: ["intervals", "array"],
  },
  {
    slug: "merge-intervals",
    title: "Merge Intervals",
    source: SRC,
    url: LC("merge-intervals"),
    prompt: "Merge overlapping intervals.",
    approach:
      "Sort by start. Walk; if current.start ≤ last.end, extend last.end; else push current. O(n log n).",
    tags: ["intervals", "array"],
  },
  {
    slug: "non-overlapping-intervals",
    title: "Non Overlapping Intervals",
    source: SRC,
    url: LC("non-overlapping-intervals"),
    prompt: "Min number of intervals to remove so remaining are non-overlapping.",
    approach:
      "Greedy by end time. Sort by end. Keep first; for each next, keep if start ≥ last kept end, else remove (count++). O(n log n).",
    tags: ["intervals", "greedy"],
  },
  {
    slug: "meeting-rooms",
    title: "Meeting Rooms",
    source: SRC,
    url: LC("meeting-rooms"),
    prompt: "Decide if a person can attend all meetings (no overlaps).",
    approach: "Sort by start; check that each meeting starts ≥ previous end. O(n log n).",
    tags: ["intervals"],
  },
  {
    slug: "meeting-rooms-ii",
    title: "Meeting Rooms II",
    source: SRC,
    url: LC("meeting-rooms-ii"),
    prompt: "Min rooms needed for all meetings.",
    approach:
      "Min-heap of end times. Sort by start; for each meeting, if its start ≥ heap.top, pop (reuse room). Push current's end. Max heap size = answer. O(n log n).",
    tags: ["intervals", "heap"],
  },
  {
    slug: "minimum-interval-to-include-each-query",
    title: "Minimum Interval to Include Each Query",
    source: SRC,
    url: LC("minimum-interval-to-include-each-query"),
    prompt:
      "For each query q, return the length of the shortest interval that contains q (or -1).",
    approach:
      "Sort intervals by start, queries by value. Sweep queries; maintain a min-heap of (length, end) for intervals with start ≤ q. Discard heap entries with end < q. Top of heap is the answer. O((n+m) log n).",
    tags: ["intervals", "heap"],
  },

  // ───── Math & Geometry ─────
  {
    slug: "rotate-image",
    title: "Rotate Image",
    source: SRC,
    url: LC("rotate-image"),
    prompt: "Rotate an n×n matrix 90° clockwise in place.",
    approach: "Transpose, then reverse each row. O(n²) time, O(1) space.",
    tags: ["matrix", "math"],
  },
  {
    slug: "spiral-matrix",
    title: "Spiral Matrix",
    source: SRC,
    url: LC("spiral-matrix"),
    prompt: "Return matrix elements in clockwise spiral order.",
    approach:
      "Four boundary pointers (top, bottom, left, right). Walk each border, then shrink the corresponding boundary, until they cross. O(m·n).",
    tags: ["matrix"],
  },
  {
    slug: "set-matrix-zeroes",
    title: "Set Matrix Zeroes",
    source: SRC,
    url: LC("set-matrix-zeroes"),
    prompt: "If any cell is 0, zero its entire row and column. In place; O(1) extra.",
    approach:
      "Use the first row and column as zero markers. Track separately whether the first row or first column originally had a zero. Two passes set the rest, then handle the first row/col last.",
    tags: ["matrix"],
  },
  {
    slug: "happy-number",
    title: "Happy Number",
    source: SRC,
    url: LC("happy-number"),
    prompt:
      "Repeatedly replace n with the sum of squares of its digits. Decide whether it eventually reaches 1.",
    approach:
      "Cycle detection. Either a hash set of seen values, or Floyd's tortoise/hare. Non-1 cycles all collapse into a known small set; this halts. O(log n) per step.",
    tags: ["math", "hash-set"],
  },
  {
    slug: "plus-one",
    title: "Plus One",
    source: SRC,
    url: LC("plus-one"),
    prompt: "Increment an array of digits by one (big-int style).",
    approach:
      "Walk from the back. If digit < 9, increment and return. Else set to 0 and continue. If all became 0, prepend 1. O(n).",
    tags: ["array", "math"],
  },
  {
    slug: "powx-n",
    title: "Pow(x, n)",
    source: SRC,
    url: LC("powx-n"),
    prompt: "Compute x^n in O(log n).",
    approach:
      "Fast exponentiation: if n is even, pow(x, n/2)²; if odd, x · pow(x, n-1). Handle negative n by inverting x. Avoid Math.pow.",
    tags: ["math", "recursion"],
  },
  {
    slug: "multiply-strings",
    title: "Multiply Strings",
    source: SRC,
    url: LC("multiply-strings"),
    prompt: "Multiply two non-negative integers given as strings. No built-in bignum.",
    approach:
      "Result has at most m+n digits. For each (i, j), partial = (a[i]−'0') · (b[j]−'0'); add to result[i+j+1] with carry to result[i+j]. Trim leading zeros at the end. O(m·n).",
    tags: ["string", "math"],
  },
  {
    slug: "detect-squares",
    title: "Detect Squares",
    source: SRC,
    url: LC("detect-squares"),
    prompt:
      "Stream of 2D points; answer count(p) = number of axis-aligned squares with one corner at p and three already-added corners.",
    approach:
      "Count map: (x,y)→count. For query (qx, qy), iterate stored points (px, py) with same x; require |py − qy| = |px − qx| (square side). Multiply counts at the two diagonal corners.",
    tags: ["hash-map", "design", "math"],
  },

  // ───── Bit Manipulation ─────
  {
    slug: "single-number",
    title: "Single Number",
    source: SRC,
    url: LC("single-number"),
    prompt: "Every element appears twice except one; find that one.",
    approach: "XOR all values; pairs cancel; the result is the single. O(n) time, O(1) space.",
    tags: ["bit-manipulation"],
  },
  {
    slug: "number-of-1-bits",
    title: "Number of 1 Bits",
    source: SRC,
    url: LC("number-of-1-bits"),
    prompt: "Count set bits (popcount) of an unsigned 32-bit integer.",
    approach:
      "Repeatedly clear the lowest set bit: while n, n &= (n-1), count++. O(popcount) iterations.",
    tags: ["bit-manipulation"],
  },
  {
    slug: "counting-bits",
    title: "Counting Bits",
    source: SRC,
    url: LC("counting-bits"),
    prompt: "For i in [0, n], return popcount(i).",
    approach:
      "DP: bits[i] = bits[i >> 1] + (i & 1). O(n) time, O(n) space.",
    tags: ["bit-manipulation", "dp"],
  },
  {
    slug: "reverse-bits",
    title: "Reverse Bits",
    source: SRC,
    url: LC("reverse-bits"),
    prompt: "Reverse the bit order of an unsigned 32-bit integer.",
    approach:
      "Shift-out and shift-in: for 32 iterations, result = (result << 1) | (n & 1); n >>= 1. O(32).",
    tags: ["bit-manipulation"],
  },
  {
    slug: "missing-number",
    title: "Missing Number",
    source: SRC,
    url: LC("missing-number"),
    prompt: "Array of n distinct values from [0, n], one missing. Find it.",
    approach:
      "XOR i with nums[i] across the array AND with n itself → the missing number remains. Or formula: n(n+1)/2 − sum(nums). O(n).",
    tags: ["array", "bit-manipulation", "math"],
  },
  {
    slug: "sum-of-two-integers",
    title: "Sum of Two Integers",
    source: SRC,
    url: LC("sum-of-two-integers"),
    prompt: "Add two integers without using + or -.",
    approach:
      "Loop: sum = a XOR b (without carry); carry = (a AND b) << 1; a = sum, b = carry. Repeat until b == 0. Use bit masks for languages without 32-bit integer wraparound.",
    tags: ["bit-manipulation"],
  },
  {
    slug: "reverse-integer",
    title: "Reverse Integer",
    source: SRC,
    url: LC("reverse-integer"),
    prompt:
      "Reverse the digits of a signed 32-bit integer. Return 0 if the result overflows.",
    approach:
      "Pop last digit with x % 10; push onto result (result = result*10 + digit). Before each push, check overflow against INT_MAX bounds. O(log |x|).",
    tags: ["math", "bit-manipulation"],
  },
];
