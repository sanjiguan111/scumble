// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Host-side unit tests for the skity-free core of the render build cache
// (RENDER_ARCHITECTURE.md §15): FNV-1a hashing, the bounded content-verified
// intern table, and the per-entry validity stamp. No skity dependency, so
// this runs in the plain host GoogleTest binary.

#include "../shared/skity/render_cache_core.h"

#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

using skityrt::CacheStamp;
using skityrt::HashBytes;
using skityrt::LRUInternTable;

struct Payload {
  int id = 0;
};

TEST(HashBytes, DeterministicAndDistinguishing) {
  const std::string a = "linear-gradient-stops";
  const std::string b = "linear-gradient-stops";
  const std::string c = "linear-gradient-stopz";
  EXPECT_EQ(HashBytes(reinterpret_cast<const uint8_t *>(a.data()), a.size()),
            HashBytes(reinterpret_cast<const uint8_t *>(b.data()), b.size()));
  EXPECT_NE(HashBytes(reinterpret_cast<const uint8_t *>(a.data()), a.size()),
            HashBytes(reinterpret_cast<const uint8_t *>(c.data()), c.size()));
  EXPECT_NE(HashBytes(nullptr, 0), HashBytes(reinterpret_cast<const uint8_t *>("x"), 1));
}

TEST(LRUInternTable, InsertLookupHitAndMiss) {
  LRUInternTable<Payload> t(8);
  const uint8_t bytes[] = {1, 2, 3, 4};
  auto v = std::make_shared<Payload>(Payload{42});
  t.Insert(HashBytes(bytes, sizeof bytes), bytes, sizeof bytes, v);
  auto got = t.Lookup(HashBytes(bytes, sizeof bytes), bytes, sizeof bytes);
  ASSERT_NE(got, nullptr);
  EXPECT_EQ(got->id, 42);
  // Different content under the same hash → treated as a miss (collision
  // safety: a wrong-object hit would silently corrupt rendering).
  const uint8_t other[] = {9, 9, 9, 9};
  EXPECT_EQ(t.Lookup(HashBytes(bytes, sizeof bytes), other, sizeof other), nullptr);
  EXPECT_EQ(t.Lookup(12345, bytes, sizeof bytes), nullptr); // unknown hash
}

TEST(LRUInternTable, EvictsLeastRecentlyUsedAndReinsertReplaces) {
  LRUInternTable<Payload> t(2);
  const uint8_t a[] = {1}, b[] = {2}, c[] = {3};
  t.Insert(1, a, sizeof a, std::make_shared<Payload>(Payload{1}));
  t.Insert(2, b, sizeof b, std::make_shared<Payload>(Payload{2}));
  // Touch `a` so `b` becomes the LRU entry, then overflow with `c`.
  EXPECT_NE(t.Lookup(1, a, sizeof a), nullptr);
  t.Insert(3, c, sizeof c, std::make_shared<Payload>(Payload{3}));
  EXPECT_EQ(t.size(), static_cast<std::size_t>(2));
  EXPECT_EQ(t.Lookup(2, b, sizeof b), nullptr); // evicted
  EXPECT_NE(t.Lookup(1, a, sizeof a), nullptr);
  EXPECT_NE(t.Lookup(3, c, sizeof c), nullptr);
  // Reinserting an existing hash replaces the value in place.
  t.Insert(1, a, sizeof a, std::make_shared<Payload>(Payload{99}));
  EXPECT_EQ(t.Lookup(1, a, sizeof a)->id, 99);
}

TEST(CacheStamp, MatchesExactTriple) {
  CacheStamp s{1, 2, 3};
  EXPECT_TRUE(s.Matches(1, 2, 3));
  EXPECT_FALSE(s.Matches(2, 2, 3)); // geom changed
  EXPECT_FALSE(s.Matches(1, 3, 3)); // paint changed
  EXPECT_FALSE(s.Matches(1, 2, 4)); // tree structure changed
}
