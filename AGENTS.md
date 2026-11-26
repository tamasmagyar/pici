# AGENTS.md

Guidance for AI agents and scripts, both using pici and working on this repo.

## Using pici

Run non-interactively: `npx --yes pici@<version> <command> --json`. Pin a version for reproducible builds.

| Command | Effect |
| --- | --- |
| `pici install <package...>` | Install packages; versions come from `package.json` unless given as `name@version` |
| `pici install [file.json]` | Install the packages in a custom file (default `package.custom.json`) |
| `pici add <package...> [file.json]` | Add packages to a custom file; never edits `package.json` |
| `pici restore` | Recover original files after a run that was killed |

| Option | Effect |
| --- | --- |
| `--json` | Print exactly one JSON object to stdout; logs and npm output go to stderr |
| `--dry-run` | Resolve and report without changing anything |
| `--no-lockfile` | Ignore lock files and use the ranges in `package.json` |
| `--fields=a,b` | `package.json` fields to read versions from, in priority order |
| `--help`, `--version` | Print help or version |

Recommended flow: run with `--dry-run --json`, check `packages` and `skipped`, then run without `--dry-run`.

Versions come from `npm-shrinkwrap.json`, `package-lock.json` or `yarn.lock` (Yarn 1 and later), including transitive dependencies; `lockfile` in the result names the one used, or is null. Overrides and resolutions are applied. pnpm and Bun lock files are not read.

npm may remove other packages from `node_modules`, so use pici on a fresh checkout.

`install` runs npm, including the lifecycle scripts of the installed packages. Do not run it on untrusted input.

### JSON output

Success. `install` returns `packages`, `skipped` and `lockfile`, `add` returns `file` and `added`, `restore` returns `restored`:

```json
{
  "ok": true,
  "command": "install",
  "dryRun": false,
  "packages": [{ "name": "react", "version": "18.2.0" }],
  "skipped": [],
  "lockfile": "package-lock.json"
}
```

`skipped` lists custom-file entries with no version anywhere. They are not an error, so check for them.

Failure:

```json
{
  "ok": false,
  "command": "install",
  "exitCode": 1,
  "error": { "code": "PACKAGE_NOT_FOUND", "message": "Not found in package.json: 'react'" }
}
```

`command` is null if the arguments could not be parsed.

| Code | What to do |
| --- | --- |
| `USAGE` | Fix the arguments (exit code 2) |
| `FILE_NOT_FOUND` | Create the file or fix the path |
| `INVALID_FILE` | Fix the JSON |
| `INVALID_PACKAGE` | Fix the package name or version |
| `PACKAGE_NOT_FOUND` | Add it to `package.json`, pass `name@version`, or widen `--fields` |
| `UNSUPPORTED_VERSION` | `workspace:`, `catalog:` and similar cannot be installed by npm; pass `name@version` |
| `LOCKED` | Wait for the other pici process, then retry |
| `RESTORE_REQUIRED` | Run `pici restore`, then retry |
| `RESTORE_CONFLICT` | Ask a human; do not delete either copy |
| `RESTORE_FAILED` | Ask a human; the message names the backup that holds the original |
| `NPM_NOT_FOUND` | Install npm or fix `PATH` |
| `NPM_FAILED` | Read npm's output on stderr; the exit code is npm's |
| `INTERRUPTED` | Retry if appropriate; the exit code is 128 + the signal number |
| `UNEXPECTED` | Report a bug |

Never delete `*.pici.backup` files: one may be the only copy of the original.

## Working on this repo

- `yarn verify` runs everything CI runs: lint, formatting, types, tests with coverage.
- `src/` holds the code with unit tests next to it; `test/` holds end-to-end, fault-injection and docs tests. `test/e2e/lockfile.e2e.test.ts` runs real npm against a local registry.
- Tests use real temporary directories and a fake `npm` on `PATH` (`test/helpers/fake-npm`). Do not mock `fs` except to inject failures.
- Invariant: after any exit except SIGKILL, `package.json` and all lock files are byte-for-byte unchanged. Test every new failure path for it.
- Throw `PiciError` with a code; never call `process.exit`, which skips cleanup.
- A new error code or option must be documented above; `test/docs.test.ts` enforces it.
