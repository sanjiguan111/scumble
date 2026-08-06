# === Dependencies ===
# - All dependencies must be listed here.
# - Dependencies must be sorted alphabetically.
# - run `tools/hab sync` or `tools/hab.ps1` to sync dependencies.
#
# FlatBuffers toolchain (flatc binary + header-only runtime) is managed here via
# the Lynx ecosystem's habitat tool, mirroring lynx-native-svg's DEPS.py. Targets
# live under packages/lynx-skity/shared/third_party so schema + generated stubs +
# the flatbuffers runtime stay centralized in the lynx-skity package.
#
# skity (the rendering engine) is provided separately by the maintainer and will
# be added here once its source/binary location is confirmed.

import platform


system = platform.system().lower()
machine = platform.machine().lower()
machine = "x86_64" if machine == "amd64" else machine

deps = {
    'packages/lynx-skity/shared/third_party/flatc': {
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
    'packages/lynx-skity/shared/third_party/flatbuffers': {
        "type": "git",
        "url": "https://github.com/google/flatbuffers.git",
        "ignore_in_git": True,
        "tag": "v25.12.19-2026-02-06-03fffb2",
    },
}
