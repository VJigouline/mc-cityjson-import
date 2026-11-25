# API

## `loadCityJson(input, options?)`

Reads `.json`, `.city.json` or `.jsonl` (CityJSONSeq) and returns a `CityJsonLoadResult`.

`input` is the file's text or bytes, as a string, `ArrayBuffer` or `Uint8Array`.

It throws `CityJsonImportError` for input that isn't CityJSON.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `lod` | 'highest' | `'highest'`, `'lowest'`, or a level such as `2` or `'2.2'`. |
| `materialTheme` | the first | Material theme to use; `null` colours by semantics only. |
| `recentre` | true | Moves the model near the origin. |
| `unitScale` | 1 | Metres per unit of the reference system. |

### `CityJsonLoadResult`

| Field | Type | Meaning |
| --- | --- | --- |
| `group` | `THREE.Group` | The model. |
| `version` | `string` | The CityJSON version. |
| `referenceSystem` | `string \| null` | Such as EPSG:7415. |
| `origin` | `[x, y, z]` | The reference-system point at the model's origin. |
| `cityObjects` | `Map<string, CityObjectData>` | Every city object: `id`, `type`, `attributes`, `lod`, `children` and `parents`. |
| `metadata` | `object` | The file's metadata. |
| `warnings` | `string[]` | Problems that didn't stop the import. |
| `stats` | object | Counts of meshes, triangles and the like. |

See the package's `index.d.ts` for every exported type and helper.
