# pici

Minimal CLI to install a subset of dependencies from your main `package.json`.

[![npm version](https://img.shields.io/npm/v/pici.svg)](https://npmjs.org/package/pici)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Install only the dependencies you need from your main `package.json`, saving time and disk space. Perfect for monorepos, microservices, CI/CD, or when you only need a few tools.

**How it works:** Temporarily replaces `package.json` with a minimal one containing only the packages you want, runs `npm install`, then puts your original files back. `package.json`, `package-lock.json`, `npm-shrinkwrap.json` and `yarn.lock` are restored byte for byte whether the install succeeds, fails, or is interrupted (Ctrl+C, SIGTERM).

> **Note:** If pici itself is killed outright (SIGKILL, power loss), your originals are kept as `*.pici.backup`. Run `pici restore` to put them back. pici refuses to install until you do.

## Installation

### Local development

```bash
npm install -g pici
# or
yarn global add pici
```

### CI/CD (recommended)

```bash
# Use npx with a fixed version for reproducible builds (--yes auto-accepts installation prompt)
npx --yes pici@4.0.0
# or shorthand
npx -y pici@4.0.0
# or use latest (not recommended for CI)
npx --yes pici
```

## Usage

### Example workflow

```bash
# 1. Add packages to a custom file (creates package.custom.json if it doesn't exist)
# If installed globally:
pici add react
pici add lodash package.test.json  # Or use a custom file name
# Or using npx:
npx --yes pici add react
npx --yes pici add lodash package.test.json

# 2. Install from the custom file
# If installed globally:
pici install                      # Uses package.custom.json by default
pici package.test.json           # Or specify a custom file
# Or using npx:
npx --yes pici install
npx --yes pici package.test.json
```

### Install packages by name

```bash
pici install react               # Version from package.json
pici install react lodash        # Several at once
pici install react@18.2.0        # Explicit version
```

If any package is not found in `package.json`, nothing is installed.

### Add packages to a custom file

```bash
pici add lodash                     # Adds to package.custom.json
pici add lodash react@18            # Several, optionally with a version
pici add lodash package.test.json   # Adds to a custom file
```

Adding a package again without a version keeps the version already pinned in the file.

### Custom file format

Create a JSON file (e.g., `package.test.json`):

```json
{
  "dependencies": {
    "react": "",
    "lodash": "4.17.21"
  }
}
```

Then run `pici install package.test.json`, or just `pici package.test.json`.

- Empty version (`react`): uses the version from the main `package.json`
- Specified version (`lodash`): installs that version

### Specify dependency fields

```bash
pici install --fields=dependencies,devDependencies
```

By default, reads from `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`. If a package is in several, the first field listed wins.

### Versions and lock files

Versions come from your lock file when there is one, so installs are reproducible. This includes the dependencies of the packages you install.

| Project | Lock file | Forced versions |
| --- | --- | --- |
| npm | `npm-shrinkwrap.json`, `package-lock.json` | `overrides` |
| Yarn 1 | `yarn.lock` | `resolutions` |
| Yarn 2 and later | `yarn.lock` | `resolutions` |
| pnpm, Bun | not read; ranges in `package.json` are used | `overrides` in `package.json` only |

- A version you give yourself (`react@18.2.0`, or in a custom file) always wins.
- Use `--no-lockfile` to ignore lock files.
- pici always installs with npm into `node_modules`, also in Yarn projects. Registry settings are read from `.npmrc`, not `.yarnrc.yml`, and Yarn patches are not applied.
- With a `yarn.lock`, transitive versions are pinned when `node_modules` is empty; otherwise npm keeps what is already installed if it fits.
- npm may remove packages you did not ask for from an existing `node_modules`. pici is meant for fresh checkouts such as CI.
- `workspace:`, `catalog:` and other versions npm does not understand are reported as errors.

### Options

| Option | Effect |
| --- | --- |
| `--dry-run` | Show what would happen without changing anything |
| `--json` | Print one JSON result to stdout; logs go to stderr |
| `--no-lockfile` | Ignore lock files and use the ranges in `package.json` |
| `--fields=<a,b>` | Dependency fields to read, in priority order |
| `-h`, `--help` | Show help |
| `-v`, `--version` | Show the version |

Exit codes: `0` success, `1` failure, `2` usage error. If npm fails, pici exits with npm's code; if interrupted, with 128 + the signal number.

## AI agents and scripts

Use `--json` for machine-readable results with stable error codes, and `--dry-run` to preview. See [AGENTS.md](AGENTS.md) for the full contract.

## Development

```bash
yarn install
yarn test     # Builds, then runs unit and end-to-end tests (no registry needed)
yarn verify   # Everything CI runs
```

## License

MIT
