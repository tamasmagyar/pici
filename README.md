# pici

Minimal CLI to install a subset of dependencies from your main package.json.

## Why is this useful?

In most cases, you only need a few specific packages rather than all dependencies. For example:

- **Playwright testing**: You might only need `@playwright/test` and `playwright` for testing, not all your app's dependencies
- **Development tools**: Just the linter and formatter, not the entire dev stack
- **CI/CD**: Only the packages needed for building/deploying
- **Microservices**: A subset of shared dependencies

This saves time, disk space, and reduces potential conflicts.

## Install

```bash
npm install pici
# or
yarn add pici
```

## Usage

### Custom File Format

```json
{
  "dependencies": {
    "react": "",         // Uses version from package.json
    "lodash": "4.17.21"  // Uses this version instead
  }
}
```

### Install packages

```bash
pici my-packages.json           # Implicit install
pici install my-packages.json   # Explicit install
pici install                    # Uses package.custom.json
```

### Add a package

```bash
pici add lodash my-packages.json
pici add lodash                 # Adds to package.custom.json
```

### Specify dependency fields

```bash
# By default, reads from all dependency fields (dependencies, devDependencies, peerDependencies, optionalDependencies)
pici install

# Restrict to specific fields
pici install --fields=dependencies,devDependencies
pici install --fields=peerDependencies,optionalDependencies
```

## License

MIT