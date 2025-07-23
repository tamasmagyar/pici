# pici

Minimal CLI to install a subset of dependencies from your main `package.json`.

[![npm version](https://img.shields.io/npm/v/pici.svg)](https://npmjs.org/package/pici)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Overview

**pici** lets you install only the dependencies you need from your main `package.json`, saving time, disk space, and reducing potential conflicts. Perfect for monorepos, microservices, CI/CD, or when you only need a few tools for testing or development.

## Features

- 🏃 Install only a subset of dependencies
- ⚡ Faster installs for testing, CI, or microservices
- 📝 Custom dependency files supported
- 🔧 Supports all dependency fields (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`)
- 📦 Works with npm and yarn

## Quick Start

```bash
npm install -g pici
# or
yarn global add pici

# Install only the dependencies listed in my-packages.json
pici my-packages.json
```

## Installation & Usage

> **Important:** To use the CLI globally, your global npm or yarn bin directory must be in your `PATH` environment variable, regardless of which shell you use. See below for how to add it if needed.

You can use **pici** in several ways:

### 1. Global Install (Recommended for CLI use)

Install globally with npm or yarn:
```bash
npm install -g pici
# or
yarn global add pici
```
Then run:
```bash
pici [args]
```
> **Note:** If you get a "command not found" error, ensure your global npm/yarn bin directory is in your `PATH`.  
> You can typically add it by editing your shell configuration file (e.g., `.zshrc`, `.bashrc`, `.bash_profile`, etc.) and adding a line like:
> ```sh
> export PATH="$PATH:$(npm bin -g):$(yarn global bin)"
> ```
> Use the one(s) relevant to your package manager (npm or yarn).

---

### 2. Use with npx (No install needed)

You can run pici directly with npx (npm 5.2+):
```bash
npx pici [args]
```

---

### 3. Local Project Install

Install as a dev dependency:
```bash
npm install --save-dev pici
# or
yarn add --dev pici
```
Then use it via npm/yarn scripts or with npx:
```bash
npx pici [args]
```
Or add to your `package.json` scripts:
```json
"scripts": {
  "pici": "pici"
}
```
and run:
```bash
npm run pici -- [args]
```

---

Choose the method that best fits your workflow!

## Why is this useful?

In most cases, you only need a few specific packages rather than all dependencies. For example:

- **Playwright testing**: Only need `@playwright/test`
- **Development tools**: Just the linter and formatter, not the entire dev stack
- **CI/CD**: Only the packages needed for building/deploying
- **Microservices**: A subset of shared dependencies

## Usage

> **Tip:** You can add packages to the custom dependency file at any time using the `pici add <package> [custom-file.json]` command. The file will be created for you if it doesn't exist, or updated if it does.

### Custom Dependency File Format

Create a JSON file (e.g., `my-packages.json`) with the dependencies you want:

```json
{
  "dependencies": {
    "react": "",         // Uses version from package.json
    "lodash": "4.17.21"  // Uses this version instead
  }
}
```

- If the version is empty, pici uses the version from your main `package.json`.
- You can specify any dependency field: `dependencies`, `devDependencies`, etc.

### Install Packages

```bash
pici my-packages.json           # Install from custom file
pici install my-packages.json   # Explicit install from custom file
pici install                    # Uses package.custom.json by default
```

### Add a Package

```bash
pici add lodash my-packages.json
pici add lodash                 # Adds to package.custom.json
```

### Specify Dependency Fields

By default, pici reads from all dependency fields. You can restrict this:

```bash
pici install --fields=dependencies,devDependencies
pici install --fields=peerDependencies,optionalDependencies
```

## Configuration

- **Custom file**: By default, pici looks for `package.custom.json` if no file is specified.
- **Fields**: Supports `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

MIT