# Dropping support for `protolint` versions prior to `v0.58.0`

Starting from the next major update, this VS Code extension will switch from its
legacy file-mirroring mechanism to native `stdin` linting.

This change requires a modern version of the `protolint` binary (`v0.58.0` or
newer).

## Why are we doing this?

Until recently, `protolint` could only lint physical files on disk. To provide a
smooth "lint-as-you-type" experience, the extension had to constantly copy your
unsaved code into the system's temporary directory.

With native `stdin` support finally merged into `protolint`, we can eliminate
this workaround, bringing massive improvements:

- **🛡️ Better Security & Privacy:** No sensitive code leftovers in the system
  temp folders.
- **📐 Native Configuration Discovery:** Eliminate previous limitations on
  configuration files. The extension now fully delegates configuration discovery
  to the native `protolint` CLI logic.
- **⚡ CPU & I/O Efficiency:** Modern `protolint` core includes linting
  optimizations. We also eliminated redundant disk read/write cycles.
- **💾 No SSD Wear:** Eliminating thousands of micro-writes per coding session
  reduces unnecessary disk wear.

## How to Downgrade the Extension

If you are working in a legacy or restricted environment where you cannot
upgrade the `protolint` binary to `v0.58.0+`, you can easily roll back this
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

### Option 3: Via VS Code Settings (Disable auto-update)

To prevent VS Code from automatically upgrading the extension in the future:

1. Open the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`) and find
   [`protolint`][extension].
2. Disable the `Auto Update` checkbox.

---

_Thank you for using the extension! If you encounter any bugs during this
transition, please feel free to [open an issue on GitHub][new_issue]._

[extension]: vscode:extension/astryna-tools.protolint-vscode
[new_issue]: https://github.com/AlexCannonball/protolint-vscode/issues/new
