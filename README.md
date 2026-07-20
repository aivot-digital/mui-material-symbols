# MUI Material Symbols

This repository builds React icon packages from Google's
[Material Symbols](https://fonts.google.com/icons) SVG source files. The
generated components are Material UI `SvgIcon` components and are intended to be
used like MUI icons, but this package is not a drop-in replacement for
`@mui/icons-material`.

The SVG sources come from the official
[google/material-design-icons](https://github.com/google/material-design-icons)
repository.

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or newer
- npm
- Git
- Make
- curl

## Build

Install the generator dependencies once:

```bash
npm install
```

Build the default package set:

```bash
make build
```

The build has four stages:

1. `make icons` creates `.icons` as a shallow clone of Google's repository.
2. `make metadata` downloads the Google Fonts Material Symbols metadata.
3. `npm run transform` generates package folders below `PACKAGES_DIR`.
4. `make build` installs and runs `tsc` inside each generated package.

The first checkout can take a while because Google's icon repository is large.
Keep `.icons` around between builds and avoid `make clean-icons` unless you need
a fresh source checkout. Keep `.metadata` around for normal rebuilds; use
`make clean-metadata` when you intentionally want to refresh Google's metadata
cache.

The generator uses the SVG checkout for path data and the Google Fonts metadata
to decide which symbol slugs are officially supported for each Material Symbols
style. Legacy aliases that still exist in the source repository, such as
`file_download`, are skipped when the metadata marks them as unsupported for
Material Symbols.

## Build a Test Subset

For local testing, restrict the transform to a few official symbol slugs:

```bash
make build \
  PACKAGES_DIR=.packages-test \
  ICONS=home,spa \
  STYLES=outlined \
  WEIGHTS=400 \
  GRADES=0 \
  FILLS=0,1
```

This creates a package such as `@aivot/mui-material-symbols-400-outlined`.

```tsx
import Spa from '@aivot/mui-material-symbols-400-outlined/Spa';
import SpaFilled from '@aivot/mui-material-symbols-400-outlined/SpaFilled';
```

Root imports are intentionally not exposed. Direct imports keep IDE auto-imports
and bundlers from touching a package-level barrel file that references every
symbol.

The generated packages include subpath `exports` and `typesVersions`, so direct
icon imports work with modern TypeScript resolvers and with classic
`moduleResolution: "node"`.

The generated component and file names do not use an `Icon` suffix. Consumers
can still choose a local import name such as `SpaIcon` in application code.

## Build Options

- `PACKAGES_DIR`: output directory for generated packages. Default: `.packages`.
- `SOURCE_DIR`: source checkout directory. Default: `.icons`.
- `METADATA_DIR`: metadata cache directory. Default: `.metadata`.
- `METADATA_FILE`: downloaded Google Fonts metadata file. Default:
  `.metadata/material-symbols.json`.
- `ICONS`: comma-separated Material Symbols slugs, e.g. `home,spa`.
- `STYLES`: comma-separated styles: `outlined`, `rounded`, `sharp`.
- `WEIGHTS`: comma-separated weights: `100,200,300,400,500,600,700`.
- `GRADES`: comma-separated grades: `0,-25,200`. Default: `0`.
- `FILLS`: comma-separated fills: `0,1`.

You can also pass raw transform arguments through `TRANSFORM_ARGS`, but the
dedicated Make variables are easier to read and less error-prone.

When running the transform script without Make, pass the source checkout and
metadata file explicitly if you do not use the defaults:

```bash
npm run transform -- .packages-test \
  --source .icons \
  --metadata .metadata/material-symbols.json \
  --icons home,spa \
  --styles outlined \
  --weights 400 \
  --grades 0 \
  --fills 0,1
```

## Generated Package Shape

Each generated package contains one style, one weight, and one grade. Grade `0`
keeps the package name unchanged; non-default grades add a grade segment.
Filled variants are separate components in the same package.
Negative grades use an `n` prefix and positive grades use a `p` prefix.

```text
@aivot/mui-material-symbols-400-outlined/Spa
@aivot/mui-material-symbols-400-outlined/SpaFilled
@aivot/mui-material-symbols-400-n25-outlined/Spa
@aivot/mui-material-symbols-400-p200-outlined/Spa
```

Each icon is exported with the same public component type as Material UI's
`SvgIcon`, while the generated implementation keeps the Material Symbols
`viewBox`.

The generator writes files incrementally and removes stale generated files from
previous filtered builds. TypeScript uses incremental build info to avoid
unnecessary recompilation, but that build metadata is not published.
