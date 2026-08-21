# === Dependencies ===
# - All dependencies must be listed here.
# - Dependencies must be sorted alphabetically.
# - run `tools/hab sync` or `tools/hab.ps1` to sync dependencies.
#
# FlatBuffers toolchain (flatc binary + header-only runtime) is managed here via
# the Lynx ecosystem's habitat tool, mirroring lynx-native-svg's DEPS.py. Targets
# live under packages/native/shared/third_party so schema + generated stubs +
# the flatbuffers runtime stay centralized in the lynx-skity package.
#
# skity (the rendering engine) is provided separately by the maintainer and will
# be added here once its source/binary location is confirmed.

import platform


system = platform.system().lower()
machine = platform.machine().lower()
machine = "x86_64" if machine == "amd64" else machine

deps = {
    'packages/native/shared/third_party/flatc': {
        "type": "http",
        "url": {
            "linux": "https://github.com/google/flatbuffers/releases/download/v25.12.19-2026-02-06-03fffb2/Linux.flatc.binary.clang++-18.zip",
            "darwin": {
                "x86_64": "https://github.com/google/flatbuffers/releases/download/v25.12.19-2026-02-06-03fffb2/MacIntel.flatc.binary.zip",
                "arm64": "https://github.com/google/flatbuffers/releases/download/v25.12.19-2026-02-06-03fffb2/Mac.flatc.binary.zip",
            }.get(machine, None),
            "windows": "https://github.com/google/flatbuffers/releases/download/v25.12.19-2026-02-06-03fffb2/Windows.flatc.binary.zip"
        }.get(system, None),
        "ignore_in_git": True,
        "decompress": True,
    },
    'packages/native/shared/third_party/flatbuffers': {
        "type": "git",
        "url": "https://github.com/google/flatbuffers.git",
        "ignore_in_git": True,
        "tag": "v25.12.19-2026-02-06-03fffb2",
    },
    # GoogleTest — the C++ unit-test framework for the host-side tests of the
    # pure-std shared layer (line breaker etc.); consumed via
    # tests/CMakeLists.txt, run by `pnpm --filter @lynx-skity/native
    # test:native`. Test-only: never compiled into any shipping library.
    'packages/native/shared/third_party/googletest': {
        "type": "git",
        "url": "https://github.com/google/googletest.git",
        "ignore_in_git": True,
        "tag": "v1.17.0",
    },
    # SheenBidi — UAX #9 bidirectional algorithm, Android-only <Paragraph>
    # backend (iOS uses CoreText's built-in UAX #9). Pure C, zero deps, data
    # tables compiled in. Statically linked into libskityrender.so (same
    # pattern as the HarfBuzz static prefab — no runtime .so); the podspec
    # never globs third_party.
    'packages/native/shared/third_party/sheenbidi': {
        "type": "git",
        "url": "https://github.com/Tehreer/SheenBidi.git",
        "ignore_in_git": True,
        "tag": "v3.0.0",
    },
}
