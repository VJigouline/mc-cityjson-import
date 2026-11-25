# mc-cityjson-import

A CityJSON importer for [three.js](https://threejs.org/), written in TypeScript. It reads CityJSON 1.0 to 2.0 and CityJSONSeq 3D city models: buildings, bridges, roads, terrain, vegetation and the other city objects, with their semantic surfaces, levels of detail, materials and attributes, in metres and Y up. It was made for [SceneEditor](https://github.com/VJigouline/SceneEditor), and works in any three.js application.

```ts
import { loadCityJson } from 'mc-cityjson-import';

const result = loadCityJson(await file.text());
scene.add(result.group);
console.log(result.warnings);       // anything that couldn't be read
```

## What it reads

- Every city object type, with MultiSurface, CompositeSurface, Solid, MultiSolid and CompositeSolid geometries, surfaces with holes, MultiLineString and MultiPoint.
- Geometry templates (GeometryInstance), placed by their transforms.
- One level of detail per city object: the highest by default, or the lowest or a given one.
- Semantic surfaces, coloured by type (roofs, walls, ground, windows and so on), and the file's materials, which take precedence.
- Attributes, children and parents of every city object, and the file's metadata and reference system.
- The vertex transform, and recentring near the origin, as city coordinates are too large for the GPU's precision.

Textures are not read; surfaces with textures are drawn with their material or semantic colour. See [Formats and support](Documentation/Support.md) for the details.

## Install

The package is not on the npm registry. Install it from GitHub:

```sh
npm install github:VJigouline/mc-cityjson-import
```

`three` (r160 or later) is a peer dependency. The package builds itself on install.

## Documentation

- [Getting started](Documentation/GettingStarted.md)
- [API](Documentation/API.md)
- [Formats and support](Documentation/Support.md)
- [Using it in SceneEditor](Documentation/SceneEditor.md)

## Development

```sh
npm install
npm test           # unit tests, with Vitest
npm run typecheck
npm run build      # dist/
```

The tests load real CityJSON files, kept in [`tests/samples`](tests/samples/README.md) with their licences. It needs Node.js 22 or later.

## Licence

[MIT](LICENSE)
