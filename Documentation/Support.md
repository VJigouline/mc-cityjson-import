# Formats and support

mc-cityjson-import reads CityJSON with its own reader, with no other dependencies.

## What is read

- Every city object type, with MultiSurface, CompositeSurface, Solid, MultiSolid and CompositeSolid geometries, surfaces with holes, MultiLineString and MultiPoint.
- Geometry templates (GeometryInstance), placed by their transforms.
- One level of detail per city object: the highest by default, or the lowest or a given one.
- Semantic surfaces, coloured by type (roofs, walls, ground, windows and so on), and the file's materials, which take precedence.
- Attributes, children and parents of every city object, and the file's metadata and reference system.
- The vertex transform, and recentring near the origin, as city coordinates are too large for the GPU's precision.

## Orientation and units

CityJSON is Z up, in the units of its reference system (usually metres); the group turns it Y up.

## Limits

Textures are not read; surfaces with textures are drawn with their material or semantic colour.
