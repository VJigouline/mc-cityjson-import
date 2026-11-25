# Getting started

## Install

```sh
npm install three github:VJigouline/mc-cityjson-import
```

## Open a file

`loadCityJson` takes the file's text or bytes, as a string, `ArrayBuffer` or `Uint8Array`. It returns the model at once.

```ts
import * as THREE from 'three';
import { loadCityJson } from 'mc-cityjson-import';

const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
input.addEventListener('change', async () => {
  const result = loadCityJson(await input.files![0]!.arrayBuffer());
  scene.add(result.group);
  for (const warning of result.warnings) console.warn(warning);
});
```

## What you get

- **`group`:** a `THREE.Group` holding the model, named after the file.
- **`stats`:** counts of what was read.
- **`warnings`:** anything that couldn't be read or was left out.

CityJSON is Z up, in the units of its reference system (usually metres); the group turns it Y up.

## Options

- **`lod`** (default 'highest'): `'highest'`, `'lowest'`, or a level such as `2` or `'2.2'`.
- **`materialTheme`** (default the first): Material theme to use; `null` colours by semantics only.
- **`recentre`** (default true): Moves the model near the origin.
- **`unitScale`** (default 1): Metres per unit of the reference system.

See the [API](API.md) for every field of the result.
