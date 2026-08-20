// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Unit tests for the native base64 decoder (the decode half of the JS
// bytesToBase64 ↔ native prop channel; the custom-font data URIs ride it).
// Host-side GoogleTest binary, built by tests/CMakeLists.txt.

#include "../shared/skity/base64.h"

#include <string>
#include <vector>

#include <gtest/gtest.h>

using skityrt::Base64Decode;

static std::string D(std::string_view in) {
  std::vector<uint8_t> out;
  if (!Base64Decode(in, &out)) return "<decode-failed>";
  return std::string(out.begin(), out.end());
}

TEST(Base64Decode, AlphabetAndQuantumBoundaries) {
  EXPECT_EQ(D(""), "");
  EXPECT_EQ(D("Zg=="), "f");
  EXPECT_EQ(D("Zm8="), "fo");
  EXPECT_EQ(D("Zm9v"), "foo");
  EXPECT_EQ(D("Zm9vYg=="), "foob");
  EXPECT_EQ(D("Zm9vYmE="), "fooba");
  EXPECT_EQ(D("Zm9vYmFy"), "foobar");
  // + and / (values 62/63)
  EXPECT_EQ(D("Pjw/Pg=="), "><?>");
}

TEST(Base64Decode, PaddingOptionalAndWhitespaceSkipped) {
  EXPECT_EQ(D("Zm9vYg"), "foob"); // unpadded
  EXPECT_EQ(D("Zg"), "f");
  EXPECT_EQ(D("Zm9v\n YmFy"), "foobar"); // line-wrapped payloads
}

TEST(Base64Decode, RejectsMalformedInput) {
  std::vector<uint8_t> out;
  EXPECT_FALSE(Base64Decode("Z", &out));        // dangling 6-bit group
  EXPECT_FALSE(Base64Decode("Zm9v!", &out));    // outside the alphabet
  EXPECT_FALSE(Base64Decode("Zg==Zg==", &out)); // data after '='
  EXPECT_FALSE(Base64Decode("Zg=====", &out));  // more than 2 pads
  EXPECT_TRUE(out.empty());                     // failures leave out untouched
}
