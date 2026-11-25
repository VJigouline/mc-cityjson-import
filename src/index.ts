// Reads CityJSON (1.0 to 2.0) and CityJSONSeq into three.js: a mesh per city object, with the
// surfaces of the chosen level of detail triangulated, coloured by their semantics or materials.

import * as THREE from 'three';

type V3 = [number, number, number];

export interface CityJsonOptions {
  /** Which level of detail to draw for each city object: the highest (default), the lowest, or a given one, such as 2 or "2.2". */
  lod?: 'highest' | 'lowest' | number | string;
  /** Material theme to use when the file has several; the first by default. Pass null to colour by semantics only. */
  materialTheme?: string | null;
  /** Moves the model near the origin, as city coordinates are too large for the GPU's precision. Default true. */
  recentre?: boolean;
  /** Metres per unit of the reference system. Default 1. */
  unitScale?: number;
}

export interface CityObjectData {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
  /** The level of detail drawn, or null if the object has no geometry. */
  lod: string | null;
  children: string[];
  parents: string[];
}

export interface CityJsonLoadResult {
  /** The model, in metres and Y up: a group per city object type, holding a mesh per city object. */
  group: THREE.Group;
  version: string;
  /** The reference system the file names, such as EPSG:7415. */
  referenceSystem: string | null;
  /** The point of the reference system that the model's origin stands for, when it is recentred. */
  origin: V3;
  /** Every city object, drawn or not, by id. */
  cityObjects: Map<string, CityObjectData>;
  metadata: Record<string, unknown>;
  warnings: string[];
  stats: { cityObjects: number; meshes: number; triangles: number; lines: number; points: number };
}

export class CityJsonImportError extends Error {
  override name = 'CityJsonImportError';
}

/** Colours for semantic surface types, and for city objects without semantics. */
export const SEMANTIC_COLORS: Record<string, number> = {
  RoofSurface: 0xc0605a,
  WallSurface: 0xe8e2d6,
  GroundSurface: 0x8c8c8c,
  ClosureSurface: 0xcccccc,
  OuterCeilingSurface: 0xd8d0c4,
  OuterFloorSurface: 0xb0a898,
  Window: 0x8fb3d9,
  Door: 0x8a6a4a,
  InteriorWallSurface: 0xf0ece4,
  CeilingSurface: 0xf4f0e8,
  FloorSurface: 0xa89c88,
  WaterSurface: 0x4f8fcf,
  WaterGroundSurface: 0x3f6f9f,
  WaterClosureSurface: 0x6fa0d0,
  TrafficArea: 0x707070,
  AuxiliaryTrafficArea: 0x9a9a8a,
  TransportationMarking: 0xffffff,
  TransportationHole: 0x505050,
};

const TYPE_COLORS: Record<string, number> = {
  Building: 0xdcd4c6, BuildingPart: 0xdcd4c6, BuildingInstallation: 0xc8c0b2, BuildingConstructiveElement: 0xc8c0b2, BuildingFurniture: 0xb8a890,
  BuildingStorey: 0xdcd4c6, BuildingRoom: 0xf0ece4, BuildingUnit: 0xdcd4c6, Bridge: 0xa8a8a0, BridgePart: 0xa8a8a0, BridgeInstallation: 0x989890,
  BridgeConstructiveElement: 0x989890, BridgeRoom: 0xc0c0b8, BridgeFurniture: 0x908878, CityFurniture: 0x8a7a6a, CityObjectGroup: 0xcccccc,
  GenericCityObject: 0xc4c4c4, LandUse: 0xd4c890, OtherConstruction: 0xb4aca0, PlantCover: 0x6fa25a, SolitaryVegetationObject: 0x4f8a3f,
  TINRelief: 0xc8b48c, WaterBody: 0x4f8fcf, Road: 0x707070, Railway: 0x8a7060, Waterway: 0x4f8fcf, TransportSquare: 0x9a9a8a,
  Tunnel: 0x8a8a80, TunnelPart: 0x8a8a80, TunnelInstallation: 0x7a7a70, TunnelConstructiveElement: 0x7a7a70, TunnelHollowSpace: 0xa0a098, TunnelFurniture: 0x706858,
};

interface Doc {
  type: string;
  version?: string;
  transform?: { scale: V3; translate: V3 };
  CityObjects: Record<string, RawObject>;
  vertices: V3[];
  metadata?: Record<string, unknown>;
  appearance?: { materials?: RawMaterial[] };
  'geometry-templates'?: { templates: RawGeometry[]; 'vertices-templates': V3[] };
}

interface RawObject {
  type: string;
  attributes?: Record<string, unknown>;
  geometry?: RawGeometry[];
  children?: string[];
  parents?: string[];
}

interface RawGeometry {
  type: string;
  lod?: number | string;
  boundaries: unknown;
  semantics?: { surfaces: { type: string }[]; values: unknown };
  material?: Record<string, { values?: unknown; value?: number }>;
  template?: number;
  transformationMatrix?: number[];
}

interface RawMaterial {
  name?: string;
  diffuseColor?: V3;
  emissiveColor?: V3;
  transparency?: number;
  shininess?: number;
  isSmooth?: boolean;
}

/** Splits a CityJSONSeq (JSON lines) file into its header and features, merged into one document. */
function readSequence(text: string): Doc {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = JSON.parse(lines[0]!) as Doc;
  if (head.type !== 'CityJSON') throw new CityJsonImportError('A CityJSONSeq file must start with a CityJSON object');
  const doc: Doc = { ...head, CityObjects: { ...(head.CityObjects ?? {}) }, vertices: [...(head.vertices ?? [])] };
  for (const line of lines.slice(1)) {
    const feature = JSON.parse(line) as { type: string; CityObjects: Record<string, RawObject>; vertices: V3[] };
    if (feature.type !== 'CityJSONFeature') continue;
    // Each feature's vertex indices are its own; shift them past the vertices so far.
    const offset = doc.vertices.length;
    doc.vertices.push(...feature.vertices);
    const shift = (b: unknown): unknown => (typeof b === 'number' ? b + offset : Array.isArray(b) ? b.map(shift) : b);
    for (const [id, o] of Object.entries(feature.CityObjects)) {
      doc.CityObjects[id] = { ...o, geometry: o.geometry?.map((g) => (g.type === 'GeometryInstance' ? { ...g, boundaries: shift(g.boundaries) } : { ...g, boundaries: shift(g.boundaries) })) };
    }
  }
  return doc;
}

/** Triangulates a planar polygon given as an outer ring and holes of 3D points. Returns triangle corners. */
export function triangulatePolygon(rings: V3[][]): V3[] {
  const outer = rings[0];
  if (!outer || outer.length < 3) return [];
  // Newell's normal of the outer ring.
  const n: V3 = [0, 0, 0];
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % outer.length]!;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(...n);
  if (len === 0) return [];
  const normal = new THREE.Vector3(n[0] / len, n[1] / len, n[2] / len);
  if (outer.length === 3 && rings.length === 1) return [...outer];
  const u = new THREE.Vector3(Math.abs(normal.x) < 0.9 ? 1 : 0, Math.abs(normal.x) < 0.9 ? 0 : 1, 0).cross(normal).normalize();
  const v = normal.clone().cross(u);
  const project = (p: V3) => new THREE.Vector2(p[0] * u.x + p[1] * u.y + p[2] * u.z, p[0] * v.x + p[1] * v.y + p[2] * v.z);
  const contour = outer.map(project);
  const holes = rings.slice(1).filter((h) => h.length >= 3).map((h) => h.map(project));
  const all = [...outer, ...rings.slice(1).filter((h) => h.length >= 3).flat()];
  const out: V3[] = [];
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, holes)) {
    const pa = all[a!]!;
    const pb = all[b!]!;
    const pc = all[c!]!;
    // Keep the ring's orientation, so faces point the way the file says.
    const e1 = new THREE.Vector3(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
    const e2 = new THREE.Vector3(pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]);
    if (e1.cross(e2).dot(normal) < 0) out.push(pa, pc, pb);
    else out.push(pa, pb, pc);
  }
  return out;
}

const lodValue = (l: number | string | undefined) => (l === undefined ? -1 : Number(l));

/** Reads CityJSON or CityJSONSeq text or bytes. */
export function loadCityJson(input: string | ArrayBuffer | Uint8Array, options: CityJsonOptions = {}): CityJsonLoadResult {
  const text = typeof input === 'string' ? input : new TextDecoder().decode(input instanceof Uint8Array ? input : new Uint8Array(input));
  let doc: Doc;
  try {
    const trimmed = text.replace(/^﻿/, '').trim();
    const firstLine = trimmed.slice(0, trimmed.indexOf('\n') > 0 ? trimmed.indexOf('\n') : trimmed.length);
    doc = /"type"\s*:\s*"CityJSON"/.test(firstLine) && /\n\s*\{[^\n]*"CityJSONFeature"/.test(trimmed) ? readSequence(trimmed) : (JSON.parse(trimmed) as Doc);
  } catch (error) {
    if (error instanceof CityJsonImportError) throw error;
    throw new CityJsonImportError(`Not a CityJSON file: ${(error as Error).message}`);
  }
  if (doc.type !== 'CityJSON' || !doc.CityObjects || !Array.isArray(doc.vertices)) throw new CityJsonImportError('Not a CityJSON file: it has no CityJSON type, CityObjects or vertices');
  const warnings: string[] = [];
  const scale = doc.transform?.scale ?? [1, 1, 1];
  const translate = doc.transform?.translate ?? [0, 0, 0];
  const vertices: V3[] = doc.vertices.map((p) => [p[0] * scale[0] + translate[0], p[1] * scale[1] + translate[1], p[2] * scale[2] + translate[2]]);

  // Recentre on the middle of the model's extent.
  let origin: V3 = [0, 0, 0];
  if (options.recentre ?? true) {
    if (vertices.length) {
      const lo: V3 = [Infinity, Infinity, Infinity];
      const hi: V3 = [-Infinity, -Infinity, -Infinity];
      for (const p of vertices) for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k]!, p[k]!);
        hi[k] = Math.max(hi[k]!, p[k]!);
      }
      origin = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
    }
  }
  const local = (p: V3): V3 => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]];

  const materials = doc.appearance?.materials ?? [];
  const themes = new Set<string>();
  for (const o of Object.values(doc.CityObjects)) for (const g of o.geometry ?? []) for (const t of Object.keys(g.material ?? {})) themes.add(t);
  const theme = options.materialTheme === null ? null : (options.materialTheme ?? [...themes][0] ?? null);

  const materialCache = new Map<string, THREE.MeshStandardMaterial>();
  const surfaceMaterial = (key: string, make: () => THREE.MeshStandardMaterial) => {
    let m = materialCache.get(key);
    if (!m) materialCache.set(key, (m = make()));
    return m;
  };
  const colourMaterial = (name: string, color: number) => surfaceMaterial(`c:${name}`, () => new THREE.MeshStandardMaterial({ name, color, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, ...(name === 'Window' ? { transparent: true, opacity: 0.6 } : {}) }));
  const fileMaterial = (index: number) =>
    surfaceMaterial(`m:${index}`, () => {
      const m = materials[index] ?? {};
      const d = m.diffuseColor ?? [0.8, 0.8, 0.8];
      const e = m.emissiveColor ?? [0, 0, 0];
      const t = m.transparency ?? 0;
      return new THREE.MeshStandardMaterial({
        name: m.name ?? `material ${index}`,
        color: new THREE.Color().setRGB(d[0], d[1], d[2], THREE.SRGBColorSpace),
        emissive: new THREE.Color().setRGB(e[0], e[1], e[2], THREE.SRGBColorSpace),
        roughness: m.shininess !== undefined ? Math.min(1, Math.sqrt(2 / (m.shininess * 128 + 2))) : 0.85,
        metalness: 0,
        transparent: t > 0,
        opacity: 1 - t,
        side: THREE.DoubleSide,
      });
    });

  const group = new THREE.Group();
  group.name = 'CityJSON';
  group.rotation.x = -Math.PI / 2;
  if (options.unitScale && options.unitScale !== 1) group.scale.setScalar(options.unitScale);
  const byType = new Map<string, THREE.Group>();
  const cityObjects = new Map<string, CityObjectData>();
  const stats = { cityObjects: 0, meshes: 0, triangles: 0, lines: 0, points: 0 };
  const templates = doc['geometry-templates'];
  const templateVertices: V3[] = templates?.['vertices-templates'] ?? [];

  for (const [id, o] of Object.entries(doc.CityObjects)) {
    stats.cityObjects++;
    const geoms = (o.geometry ?? []).filter((g) => g && g.type);
    let chosen: RawGeometry[] = [];
    if (geoms.length) {
      const lods = [...new Set(geoms.map((g) => lodValue(g.type === 'GeometryInstance' ? templates?.templates[g.template ?? -1]?.lod : g.lod)))].sort((a, b) => a - b);
      const wanted = options.lod === undefined || options.lod === 'highest' ? lods[lods.length - 1] : options.lod === 'lowest' ? lods[0] : Number(options.lod);
      chosen = geoms.filter((g) => lodValue(g.type === 'GeometryInstance' ? templates?.templates[g.template ?? -1]?.lod : g.lod) === wanted);
      if (!chosen.length) chosen = geoms.filter((g) => lodValue(g.lod) === lods[lods.length - 1]);
    }
    cityObjects.set(id, {
      id,
      type: o.type,
      attributes: o.attributes ?? {},
      lod: chosen.length ? String(chosen[0]!.type === 'GeometryInstance' ? templates?.templates[chosen[0]!.template ?? -1]?.lod : chosen[0]!.lod) : null,
      children: o.children ?? [],
      parents: o.parents ?? [],
    });
    if (!chosen.length) continue;

    // Triangles by material, lines and points.
    const tris = new Map<THREE.Material, V3[]>();
    const lines: V3[] = [];
    const points: V3[] = [];
    const surface = (rings: unknown, semantic: number | null | undefined, sem: RawGeometry['semantics'], material: number | null | undefined, point: (i: number) => V3) => {
      const rs = (rings as number[][]).map((r) => r.map(point));
      const semType = semantic !== null && semantic !== undefined ? sem?.surfaces[semantic]?.type : undefined;
      const m =
        material !== null && material !== undefined && materials[material]
          ? fileMaterial(material)
          : semType
            ? colourMaterial(semType, SEMANTIC_COLORS[semType] ?? TYPE_COLORS[o.type] ?? 0xcccccc)
            : colourMaterial(o.type, TYPE_COLORS[o.type] ?? 0xcccccc);
      const list = tris.get(m) ?? [];
      list.push(...triangulatePolygon(rs));
      tris.set(m, list);
    };
    const materialValues = (g: RawGeometry): unknown => {
      if (!theme || !g.material?.[theme]) return undefined;
      const t = g.material[theme]!;
      return t.values ?? t.value;
    };
    const at = (values: unknown, ...path: number[]): number | null | undefined => {
      let v: unknown = values;
      for (const i of path) {
        if (typeof v === 'number' || v === null || v === undefined) return v as number | null | undefined;
        v = (v as unknown[])[i];
      }
      return v as number | null | undefined;
    };
    const drawGeometry = (g: RawGeometry, point: (i: number) => V3) => {
      const b = g.boundaries as unknown[];
      const sv = g.semantics?.values;
      const mv = materialValues(g);
      switch (g.type) {
        case 'MultiPoint':
          for (const i of b as number[]) points.push(point(i));
          break;
        case 'MultiLineString':
          for (const ls of b as number[][]) for (let i = 0; i + 1 < ls.length; i++) lines.push(point(ls[i]!), point(ls[i + 1]!));
          break;
        case 'MultiSurface':
        case 'CompositeSurface':
          (b as unknown[]).forEach((s, i) => surface(s, at(sv, i), g.semantics, at(mv, i), point));
          break;
        case 'Solid':
          (b as unknown[][]).forEach((shell, j) => shell.forEach((s, i) => surface(s, at(sv, j, i), g.semantics, at(mv, j, i), point)));
          break;
        case 'MultiSolid':
        case 'CompositeSolid':
          (b as unknown[][][]).forEach((solid, k) => solid.forEach((shell, j) => shell.forEach((s, i) => surface(s, at(sv, k, j, i), g.semantics, at(mv, k, j, i), point))));
          break;
        default:
          warnings.push(`Geometry type ${g.type} is not read`);
      }
    };
    for (const g of chosen) {
      if (g.type === 'GeometryInstance') {
        const template = templates?.templates[g.template ?? -1];
        if (!template) {
          warnings.push(`City object ${id} uses a missing geometry template`);
          continue;
        }
        const ref = vertices[(g.boundaries as number[])[0]!]!;
        const m = new THREE.Matrix4();
        if (g.transformationMatrix?.length === 16) m.fromArray(g.transformationMatrix).transpose();
        const offset = local(ref);
        drawGeometry(template, (i) => {
          const p = new THREE.Vector3(...templateVertices[i]!).applyMatrix4(m);
          return [p.x + offset[0], p.y + offset[1], p.z + offset[2]];
        });
      } else {
        drawGeometry(g, (i) => local(vertices[i]!));
      }
    }

    // One mesh per object, with a group per material.
    const holder = new THREE.Group();
    holder.name = id;
    holder.userData.cityjson = { id, type: o.type, attributes: o.attributes ?? {} };
    if (tris.size) {
      const mats = [...tris.keys()];
      const pos: number[] = [];
      const geometry = new THREE.BufferGeometry();
      mats.forEach((m, i) => {
        const start = pos.length / 3;
        for (const p of tris.get(m)!) pos.push(p[0], p[1], p[2]);
        geometry.addGroup(start, pos.length / 3 - start, i);
      });
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, mats.length === 1 ? mats[0]! : mats);
      mesh.name = id;
      mesh.userData.cityjson = holder.userData.cityjson;
      stats.meshes++;
      stats.triangles += pos.length / 9;
      holder.add(mesh);
    }
    if (lines.length) {
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lines.flat(), 3));
      holder.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: TYPE_COLORS[o.type] ?? 0x666666 })));
      stats.lines += lines.length / 2;
    }
    if (points.length) {
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
      holder.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: TYPE_COLORS[o.type] ?? 0x666666, size: 3, sizeAttenuation: false })));
      stats.points += points.length;
    }
    let typeGroup = byType.get(o.type);
    if (!typeGroup) {
      typeGroup = new THREE.Group();
      typeGroup.name = o.type;
      byType.set(o.type, typeGroup);
    }
    typeGroup.add(holder);
  }
  for (const g of [...byType.values()].sort((a, b) => a.name.localeCompare(b.name))) group.add(g);
  const rs = (doc.metadata?.referenceSystem as string | undefined) ?? null;
  // Forms such as https://www.opengis.net/def/crs/EPSG/0/7415 and urn:ogc:def:crs:EPSG::7415.
  const epsg = rs ? (/EPSG\/\d+\/(\d+)/i.exec(rs) ?? /EPSG:+(\d+)/i.exec(rs))?.[1] : undefined;
  return {
    group,
    version: doc.version ?? '',
    referenceSystem: epsg ? `EPSG:${epsg}` : rs,
    origin,
    cityObjects,
    metadata: doc.metadata ?? {},
    warnings: [...new Set(warnings)],
    stats,
  };
}
