# Migration Guide: Support Dropped for `protolint` Versions Prior to `v0.58.0`

With the latest major update, this VS Code extension has officially switched
from its legacy file-mirroring mechanism to `stdin`.

This extension now requires [`protolint` binary][installation] `v0.58.0` or
newer.

## Why Was This Change Introduced?

Previously, `protolint` could only lint physical files saved on your disk. To
deliver a seamless "lint-as-you-type" experience, the extension had to
constantly write copies of your unsaved buffers into the system's temporary
directory.

With native `stdin` support now standard in `protolint`, we have completely
eliminated this workaround, introducing significant improvements:

- **🛡️ Better Security & Privacy:** No more sensitive code footprints or
  temporary buffer files left behind in your system's temp folders.
- **📐 Native Configuration Discovery:** The extension completely delegates
  configuration file resolution (`.protolint.yaml`, `protolint.yaml`, etc.) to
  native `protolint` CLI logic.
- **⚡ CPU & I/O Efficiency:** Modern `protolint` core optimizations coupled
  with zero redundant disk read/write cycles keep your environment lightweight.
- **💾 Reduced Hardware Wear:** Eliminating thousands of micro-writes per coding
  session removes unnecessary wear on your SSD.

## How to Downgrade the Extension

If you are forced to work in a restricted or legacy environment where upgrading
the `protolint` binary to `v0.58.0+` is impossible, you can roll back this
extension to the last compatible version.

### Option 1: Via VS Code UI

1. Open the **Command Palette** (`Ctrl+Shift+P` or `Cmd+Shift+P`).
2. Search for `Extensions: Install Specific Version of Extension`.
3. Search for `protolint`.
4. Choose version `1.1.5` from the list.
5. Click **Restart Extensions** if prompted.

### Option 2: Via VS Code CLI

```sh
code --install-extension astryna-tools.protolint-vscode@1.1.5
```

---

_Thank you for using the extension! If you encounter any bugs during this
transition, please feel free to [open an issue on GitHub][new_issue]._

[installation]: https://github.com/yoheimuta/protolint#installation
[extension]: vscode:extension/astryna-tools.protolint-vscode
[new_issue]: https://github.com/AlexCannonball/protolint-vscode/issues/new
