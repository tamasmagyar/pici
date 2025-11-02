# pici

Minimal CLI to install a subset of dependencies from your main `package.json`.

[![npm version](https://img.shields.io/npm/v/pici.svg)](https://npmjs.org/package/pici)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Install only the dependencies you need from your main `package.json`, saving time and disk space. Perfect for monorepos, microservices, CI/CD, or when you only need a few tools.

**How it works:** Temporarily creates a minimal `package.json` with only the packages you want to install, runs `npm install`, then restores your original files. Your `package.json`, `package-lock.json`, and `yarn.lock` files are automatically backed up and restored.

> **Note:** Temporary backup files (`.pici.backup`) may appear briefly during installation but are automatically cleaned up.

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
npx --yes pici@3.1.0
# or shorthand
npx -y pici@3.1.0
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

### Install a single package

```bash
# If installed globally:
pici install <package>          # Installs a package with version from package.json
# Or using npx:
npx --yes pici install <package>
```

### Add packages to a custom file

```bash
# If installed globally:
pici add lodash                 # Adds to package.custom.json
pici add lodash package.test.json  # Adds to custom file
# Or using npx:
npx --yes pici add lodash
npx --yes pici add lodash package.test.json
```

### Custom file format

Create a JSON file (e.g., `package.test.json`):

```json
{
  "dependencies": {
    "react": "",         // Uses version from package.json
    "lodash": "4.17.21"  // Uses this specific version
  }
}
```

Then install from it:
```bash
# If installed globally:
pici install package.test.json
# Or using npx:
npx --yes pici install package.test.json
```

- Empty version: Uses version from main `package.json`
- Specified version: Installs that version directly

### Specify dependency fields

```bash
# If installed globally:
pici install --fields=dependencies,devDependencies
# Or using npx:
npx --yes pici install --fields=dependencies,devDependencies
```

By default, reads from `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`.

## Features

- Install only a subset of dependencies
- Automatically backs up and restores `package.json`, `package-lock.json`, and `yarn.lock`
- Safe to use with yarn projects (doesn't modify `yarn.lock`)
- Supports all dependency fields
- Custom dependency files

## License

MIT