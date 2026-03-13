/**
 * 3D Chess Piece Geometry Builder — Premium Edition
 *
 * Creates 3D mesh geometry for each chess piece type using Three.js
 * primitives (lathe geometry, cylinders, spheres) — no external models needed.
 *
 * Features PBR materials with:
 * - High-gloss porcelain look for white pieces
 * - Deep matte-metallic look for black pieces
 * - Subtle emissive rim for visibility
 * - Environment map reflections
 */
import * as THREE from 'three';

// Piece Unicode symbols for 2D fallback
const PIECE_SYMBOLS = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

// Premium material colors
const WHITE_COLOR = 0xf8f2ea;
const BLACK_COLOR = 0x2a2a44;
const WHITE_EMISSIVE = 0x443322;
const BLACK_EMISSIVE = 0x333355;

function createMaterial(isWhite) {
  if (isWhite) {
    return new THREE.MeshStandardMaterial({
      color: WHITE_COLOR,
      emissive: WHITE_EMISSIVE,
      emissiveIntensity: 0.12,
      roughness: 0.15,
      metalness: 0.05,
      envMapIntensity: 0.7,
    });
  } else {
    return new THREE.MeshStandardMaterial({
      color: BLACK_COLOR,
      emissive: BLACK_EMISSIVE,
      emissiveIntensity: 0.25,
      roughness: 0.18,
      metalness: 0.2,
      envMapIntensity: 1.0,
    });
  }
}

/**
 * Create a lathe (revolution) geometry from a 2D profile
 */
function latheFromProfile(points, segments = 32) {
  const vec2 = points.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(vec2, segments);
}

// ---- Piece profiles (radius, height pairs for lathe revolution) ----

function createPawnGeometry() {
  const profile = [
    [0, 0], [0.35, 0], [0.35, 0.05], [0.28, 0.08],
    [0.15, 0.12], [0.12, 0.25], [0.14, 0.35], [0.18, 0.4],
    [0.18, 0.42], [0.14, 0.45], [0.11, 0.5],
    [0.15, 0.55], [0.15, 0.6], [0.12, 0.7],
    [0, 0.75],
  ];
  return latheFromProfile(profile);
}

function createRookGeometry() {
  const profile = [
    [0, 0], [0.38, 0], [0.38, 0.05], [0.3, 0.08],
    [0.16, 0.12], [0.14, 0.45], [0.16, 0.5],
    [0.22, 0.55], [0.22, 0.7], [0.28, 0.72],
    [0.28, 0.85], [0.22, 0.85], [0.22, 0.78],
    [0.18, 0.78], [0.18, 0.85], [0.12, 0.85],
    [0.12, 0.78], [0.08, 0.78], [0.08, 0.85],
    [0, 0.85],
  ];
  return latheFromProfile(profile, 4); // 4 segments = blocky rook turret
}

function createKnightGeometry() {
  // Knight is harder for lathe — use a composite approach
  const group = new THREE.Group();

  // Base
  const baseProfile = [
    [0, 0], [0.35, 0], [0.35, 0.05], [0.28, 0.08],
    [0.15, 0.12], [0.13, 0.3], [0.15, 0.35],
  ];
  const baseMesh = new THREE.Mesh(latheFromProfile(baseProfile));
  group.add(baseMesh);

  // Head — elongated sphere
  const headGeo = new THREE.SphereGeometry(0.18, 16, 12);
  headGeo.scale(0.8, 1.4, 0.6);
  headGeo.translate(0, 0.65, 0.04);
  const headMesh = new THREE.Mesh(headGeo);
  group.add(headMesh);

  // Snout
  const snoutGeo = new THREE.CylinderGeometry(0.06, 0.1, 0.2, 8);
  snoutGeo.translate(0, 0.55, 0.18);
  snoutGeo.rotateX(Math.PI * 0.3);
  const snoutMesh = new THREE.Mesh(snoutGeo);
  group.add(snoutMesh);

  // Ear
  const earGeo = new THREE.ConeGeometry(0.06, 0.15, 6);
  earGeo.translate(0, 0.82, -0.02);
  const earMesh = new THREE.Mesh(earGeo);
  group.add(earMesh);

  return group;
}

function createBishopGeometry() {
  const profile = [
    [0, 0], [0.35, 0], [0.35, 0.05], [0.28, 0.08],
    [0.15, 0.12], [0.12, 0.3], [0.14, 0.38],
    [0.16, 0.42], [0.14, 0.5], [0.11, 0.6],
    [0.14, 0.65], [0.14, 0.72], [0.08, 0.82],
    [0.04, 0.88], [0, 0.9],
  ];
  const geo = latheFromProfile(profile);

  // Add a small sphere on top
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8));
  top.position.y = 0.93;
  group.add(top);

  return group;
}

function createQueenGeometry() {
  const profile = [
    [0, 0], [0.38, 0], [0.38, 0.05], [0.3, 0.08],
    [0.16, 0.12], [0.14, 0.35], [0.16, 0.42],
    [0.18, 0.5], [0.15, 0.6], [0.12, 0.7],
    [0.16, 0.75], [0.16, 0.82], [0.1, 0.9],
    [0.06, 0.95], [0, 0.98],
  ];
  const geo = latheFromProfile(profile);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo));

  // Crown points
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6));
    spike.position.set(
      Math.cos(angle) * 0.12,
      0.92,
      Math.sin(angle) * 0.12
    );
    group.add(spike);
  }

  // Top ball
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8));
  top.position.y = 1.02;
  group.add(top);

  return group;
}

function createKingGeometry() {
  const profile = [
    [0, 0], [0.38, 0], [0.38, 0.05], [0.3, 0.08],
    [0.16, 0.12], [0.14, 0.4], [0.16, 0.48],
    [0.19, 0.55], [0.16, 0.65], [0.12, 0.75],
    [0.15, 0.8], [0.15, 0.88], [0.1, 0.95],
    [0.06, 1.0], [0, 1.02],
  ];
  const geo = latheFromProfile(profile);

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo));

  // Cross on top
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04));
  crossV.position.y = 1.12;
  group.add(crossV);

  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04));
  crossH.position.y = 1.16;
  group.add(crossH);

  return group;
}

// ---- Factory ----

const GEOMETRY_BUILDERS = {
  'P': createPawnGeometry,
  'R': createRookGeometry,
  'N': createKnightGeometry,
  'B': createBishopGeometry,
  'Q': createQueenGeometry,
  'K': createKingGeometry,
};

/**
 * Create a 3D mesh for a chess piece.
 *
 * @param {string} pieceType - One of P, R, N, B, Q, K
 * @param {boolean} isWhite - true for white pieces
 * @param {number} scale - size multiplier (default 1.0)
 * @returns {THREE.Object3D} the piece mesh/group
 */
export function createPieceMesh(pieceType, isWhite, scale = 1.0) {
  const builder = GEOMETRY_BUILDERS[pieceType.toUpperCase()];
  if (!builder) return null;

  const result = builder();
  const mat = createMaterial(isWhite);

  if (result instanceof THREE.Group) {
    result.traverse((child) => {
      if (child.isMesh) {
        child.material = mat;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    result.scale.setScalar(scale);
    return result;
  }

  // Single geometry
  const mesh = new THREE.Mesh(result, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.scale.setScalar(scale);
  return mesh;
}

export { PIECE_SYMBOLS };
