import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CityJsonImportError, loadCityJson, SEMANTIC_COLORS, triangulatePolygon } from '../src/index.js';
import { sample } from './files.js';

const load = (name: string, options = {}) => loadCityJson(sample(name).data, options);

describe('CityJSON', () => {
  it('reads a building with its transform, recentred and turned Y up', () => {
    const r = load('cube.json');
    expect(r.version).toBe('1.1');
    expect(r.stats).toMatchObject({ cityObjects: 1, meshes: 1, triangles: 12 });
    expect(r.group.rotation.x).toBeCloseTo(-Math.PI / 2);
    expect(r.group.children.map((c) => c.name)).toEqual(['Building']);
  });

  it('reads the reference system and keeps the origin', () => {
    const r = load('rotterdam_one.json');
    expect(r.referenceSystem).toBe('EPSG:7415');
    expect(r.origin[0]).toBeGreaterThan(1000);
    // The model itself sits near the origin.
    const box = new THREE.Box3().setFromObject(r.group);
    expect(Math.abs(box.getCenter(new THREE.Vector3()).x)).toBeLessThan(100);
  });

  it('colours surfaces by their semantics', () => {
    const r = load('rotterdam_one.json');
    const colors = new Set<number>();
    r.group.traverse((o) => {
      const ms = (o as THREE.Mesh).material;
      for (const m of [ms].flat()) if (m) colors.add((m as THREE.MeshStandardMaterial).color.getHex());
    });
    expect(colors.size).toBeGreaterThan(1);
  });

  it('uses the file’s materials', () => {
    const r = load('mt-1.json');
    const names: string[] = [];
    r.group.traverse((o) => {
      for (const m of [(o as THREE.Mesh).material].flat()) if (m) names.push((m as THREE.Material).name);
    });
    expect(names.some((n) => !(n in SEMANTIC_COLORS))).toBe(true);
  });

  it('chooses the level of detail', () => {
    const highest = load('multi_lod.json');
    const lowest = load('multi_lod.json', { lod: 'lowest' });
    expect(highest.stats.triangles).toBeGreaterThan(lowest.stats.triangles);
    expect([...highest.cityObjects.values()][0]!.lod).not.toBe([...lowest.cityObjects.values()][0]!.lod);
  });

  it('reads building parts and their parents', () => {
    const r = load('DH_01_subs.city.json');
    expect(r.group.children.map((c) => c.name)).toEqual(['Building', 'BuildingPart']);
    const part = [...r.cityObjects.values()].find((o) => o.type === 'BuildingPart')!;
    expect(part.parents.length).toBe(1);
  });

  it('reads CityJSON 2.0 and every sample', () => {
    expect(load('dummy.json').version).toBe('2.0');
    expect(load('multisurface_with_material.json').stats.triangles).toBeGreaterThan(0);
    expect(load('minimal.json').stats.cityObjects).toBe(0);
  });

  it('reads CityJSONSeq', () => {
    const header = JSON.stringify({ type: 'CityJSON', version: '2.0', transform: { scale: [1, 1, 1], translate: [0, 0, 0] }, CityObjects: {}, vertices: [] });
    const feature = (id: string, x: number) =>
      JSON.stringify({ type: 'CityJSONFeature', id, CityObjects: { [id]: { type: 'Building', geometry: [{ type: 'MultiSurface', lod: '1', boundaries: [[[0, 1, 2]]] }] } }, vertices: [[x, 0, 0], [x + 1, 0, 0], [x, 1, 0]] });
    const r = loadCityJson([header, feature('a', 0), feature('b', 10)].join('\n'));
    expect(r.stats).toMatchObject({ cityObjects: 2, triangles: 2 });
  });

  it('triangulates polygons with holes', () => {
    const square = (s: number): [number, number, number][] => [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]];
    const tris = triangulatePolygon([square(2), square(1).reverse()]);
    let area = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const [a, b, c] = [tris[i]!, tris[i + 1]!, tris[i + 2]!];
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    expect(area).toBeCloseTo(16 - 4);
  });

  it('refuses files that are not CityJSON', () => {
    expect(() => loadCityJson('{"type":"FeatureCollection"}')).toThrow(CityJsonImportError);
    expect(() => loadCityJson('hello')).toThrow(CityJsonImportError);
  });
});
