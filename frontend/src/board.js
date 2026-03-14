/**
 * 3D Chess Board Renderer — Premium Edition v2
 *
 * Features:
 * - Bloom post-processing for glowing highlights and pieces
 * - Environment-mapped reflective board surface
 * - Particle effects for captures, check, and victory confetti
 * - Ambient floating dust particles in the background
 * - Hover glow & piece float animation
 * - Camera shake on captures
 * - Multiple board themes
 * - PBR materials with metallic/glossy finish
 * - Animated highlight rings
 * - Smooth camera orbit with easing
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { createPieceMesh } from './pieces.js';

const SQUARE_SIZE = 1.0;
const BOARD_SIZE = 8;
const BOARD_OFFSET = (BOARD_SIZE * SQUARE_SIZE) / 2 - SQUARE_SIZE / 2;

// ── Board Themes ──
const THEMES = {
  classic: {
    name: 'Classic',
    light: 0xecd5b3, dark: 0x8b6f47,
    trim: 0xc9a84c, base: 0x2a1f10,
    bg: 0x4a4a70, ground: 0x3a3a58,
    ambientIntensity: 1.0, keyIntensity: 2.0, exposure: 1.8,
  },
  midnight: {
    name: 'Midnight',
    light: 0x8a8abc, dark: 0x5a5a92,
    trim: 0x6c5ce7, base: 0x2a2a52,
    bg: 0x3a3a60, ground: 0x2e2e50,
    ambientIntensity: 1.0, keyIntensity: 1.8, exposure: 1.9,
  },
  neon: {
    name: 'Neon',
    light: 0x5a9a5a, dark: 0x3a6a3a,
    trim: 0x00ff88, base: 0x1a3a28,
    bg: 0x2a4a3e, ground: 0x223a30,
    ambientIntensity: 1.0, keyIntensity: 1.8, exposure: 1.9,
  },
  marble: {
    name: 'Marble',
    light: 0xf5f5f5, dark: 0x909090,
    trim: 0xdddddd, base: 0x555555,
    bg: 0x4a4a68, ground: 0x3a3a58,
    ambientIntensity: 1.1, keyIntensity: 2.0, exposure: 1.8,
  },
  rosewood: {
    name: 'Rosewood',
    light: 0xf0d9b5, dark: 0xb58863,
    trim: 0x8b4513, base: 0x5d4a3e,
    bg: 0x4a3a30, ground: 0x3a2e24,
    ambientIntensity: 1.0, keyIntensity: 2.0, exposure: 1.8,
  },
  glass: {
    name: 'Glass',
    light: 0xd4eaf7, dark: 0x8aafc4,
    trim: 0x88ccee, base: 0x1a2a3a,
    bg: 0x1a2a44, ground: 0x15233a,
    ambientIntensity: 1.2, keyIntensity: 2.2, exposure: 2.0,
    squareRoughness: 0.1, squareMetalness: 0.3, squareOpacity: 0.85,
  },
  obsidian: {
    name: 'Obsidian',
    light: 0x444444, dark: 0x1a1a1a,
    trim: 0xff4444, base: 0x0a0a0a,
    bg: 0x0f0f1a, ground: 0x0a0a12,
    ambientIntensity: 0.8, keyIntensity: 1.6, exposure: 2.1,
    squareRoughness: 0.05, squareMetalness: 0.7,
  },
};

let currentTheme = 'classic';

// Current colors (mutable, swapped on theme change)
let LIGHT_SQUARE = THEMES.classic.light;
let DARK_SQUARE  = THEMES.classic.dark;

const HIGHLIGHT_SELECTED  = 0x00ff88;
const HIGHLIGHT_LEGAL      = 0x4488ff;
const HIGHLIGHT_LAST_MOVE  = 0xffd700;
const HIGHLIGHT_CHECK       = 0xff2244;
const HIGHLIGHT_HINT        = 0x00e5ff;

export class ChessBoard3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.flipped = false;
    this.pieceMeshes = new Map();
    this.squareMeshes = new Map();
    this.highlightMeshes = [];
    this.ringMeshes = [];
    this.particles = [];
    this.selectedSquare = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.animating = false;

    // Hover state
    this.hoveredSquare = null;
    this.hoveredMesh = null;
    this._hoverGlowIntensity = 0;

    // Camera shake
    this._shakeIntensity = 0;
    this._shakeDecay = 0.92;
    this._shakeOffset = new THREE.Vector3();

    // Confetti system
    this.confettiParticles = [];
    this._confettiActive = false;

    // Theme reference meshes for color swaps
    this._boardBase = null;
    this._boardTrim = null;

    // Trajectory trail
    this._trajectoryTrail = null;

    // Board annotations (arrows/circles from right-click drag)
    this._annotations = [];
    this._annotationDragging = false;
    this._annotationFrom = null;

    // Drag-and-drop state
    this._liftedPieceSq = null;
    this._liftedPieceOrigY = 0.04;

    this._initScene();
    this._initBoard();
    this._initLights();
    this._initEnvironment();
    this._initPostProcessing();
    this._initLabels();
    this._initParticleSystem();
    this._initAmbientParticles();
    this._initConfettiSystem();
    this._initHoverTracking();
    this._initAnnotationSystem();
    this._startRenderLoop();
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x4a4a70);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      40, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 100
    );
    this._setCameraPosition();

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.8;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Raycaster
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Resize
    this._resizeObserver = new ResizeObserver(() => this._onResize());
    this._resizeObserver.observe(this.canvas.parentElement);

    this._setupCameraOrbit();
  }

  _setCameraPosition() {
    const dist = 13;
    const angle = this.flipped ? Math.PI : 0;
    this.cameraTarget = { x: 0, y: -0.5, z: 0 };
    this.cameraOrbitAngle = angle;
    this.cameraOrbitPitch = 0.85;
    this.cameraOrbitDist = dist;
    this._updateCameraFromOrbit();
  }

  _updateCameraFromOrbit() {
    const x = Math.sin(this.cameraOrbitAngle) * Math.cos(this.cameraOrbitPitch) * this.cameraOrbitDist;
    const y = Math.sin(this.cameraOrbitPitch) * this.cameraOrbitDist;
    const z = Math.cos(this.cameraOrbitAngle) * Math.cos(this.cameraOrbitPitch) * this.cameraOrbitDist;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.cameraTarget.x, this.cameraTarget.y, this.cameraTarget.z);
  }

  _setupCameraOrbit() {
    let dragging = false;
    let lastX = 0, lastY = 0;
    let dragButton = -1;

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.canvas.addEventListener('pointerdown', (e) => {
      // Allow right-click and middle-click for orbit
      // Also allow left-click drag when holding Shift or Alt
      if (e.button === 2 || e.button === 1 || (e.button === 0 && (e.shiftKey || e.altKey))) {
        dragging = true;
        dragButton = e.button;
        lastX = e.clientX;
        lastY = e.clientY;
        this.canvas.setPointerCapture(e.pointerId);
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      this.cameraOrbitAngle -= dx * 0.005;
      this.cameraOrbitPitch = Math.max(0.05, Math.min(1.55, this.cameraOrbitPitch + dy * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
      this._updateCameraFromOrbit();
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button === dragButton || e.button === 2 || e.button === 1) {
        dragging = false;
        dragButton = -1;
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      this.cameraOrbitDist = Math.max(5, Math.min(25, this.cameraOrbitDist + e.deltaY * 0.01));
      this._updateCameraFromOrbit();
    });
  }

  // ── Camera presets ──
  setCameraPreset(preset) {
    switch (preset) {
      case 'default':
        this.cameraOrbitAngle = this.flipped ? Math.PI : 0;
        this.cameraOrbitPitch = 0.85;
        this.cameraOrbitDist = 13;
        break;
      case 'top':
        this.cameraOrbitAngle = this.flipped ? Math.PI : 0;
        this.cameraOrbitPitch = 1.5;
        this.cameraOrbitDist = 11;
        break;
      case 'low':
        this.cameraOrbitAngle = this.flipped ? Math.PI : 0;
        this.cameraOrbitPitch = 0.3;
        this.cameraOrbitDist = 14;
        break;
      case 'side':
        this.cameraOrbitAngle = (this.flipped ? Math.PI : 0) + Math.PI / 2;
        this.cameraOrbitPitch = 0.65;
        this.cameraOrbitDist = 14;
        break;
    }
    this._updateCameraFromOrbit();
  }

  _initEnvironment() {
    // Create a simple gradient environment map for reflections
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#0a0a2e');
    grad.addColorStop(0.3, '#12123a');
    grad.addColorStop(0.5, '#1a1a4a');
    grad.addColorStop(0.7, '#12123a');
    grad.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.globalAlpha = 0.15;
    const radGrad = ctx.createRadialGradient(size * 0.3, size * 0.2, 0, size * 0.3, size * 0.2, size * 0.3);
    radGrad.addColorStop(0, '#6688ff');
    radGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, size, size);

    const radGrad2 = ctx.createRadialGradient(size * 0.7, size * 0.6, 0, size * 0.7, size * 0.6, size * 0.25);
    radGrad2.addColorStop(0, '#ff6644');
    radGrad2.addColorStop(1, 'transparent');
    ctx.fillStyle = radGrad2;
    ctx.fillRect(0, 0, size, size);

    this.envTexture = new THREE.CanvasTexture(canvas);
    this.envTexture.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = this.envTexture;
  }

  _initBoard() {
    // Board base — dark wood with subtle glow edge
    const baseGeo = new THREE.BoxGeometry(
      BOARD_SIZE * SQUARE_SIZE + 0.6,
      0.2,
      BOARD_SIZE * SQUARE_SIZE + 0.6
    );
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1a0f08,
      roughness: 0.3,
      metalness: 0.4,
      envMapIntensity: 0.5,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -0.12;
    base.receiveShadow = true;
    this.scene.add(base);
    this._boardBase = base;

    // Board edge trim — golden accent
    const trimGeo = new THREE.BoxGeometry(
      BOARD_SIZE * SQUARE_SIZE + 0.65,
      0.04,
      BOARD_SIZE * SQUARE_SIZE + 0.65
    );
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xc9a84c,
      roughness: 0.15,
      metalness: 0.8,
      emissive: 0xc9a84c,
      emissiveIntensity: 0.05,
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = -0.01;
    this.scene.add(trim);
    this._boardTrim = trim;

    // Squares
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const isLight = (rank + file) % 2 === 0;
        const geo = new THREE.BoxGeometry(SQUARE_SIZE * 0.98, 0.06, SQUARE_SIZE * 0.98);
        const mat = new THREE.MeshStandardMaterial({
          color: isLight ? LIGHT_SQUARE : DARK_SQUARE,
          roughness: isLight ? 0.25 : 0.35,
          metalness: isLight ? 0.05 : 0.1,
          envMapIntensity: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const pos = this._squareToWorld(file, rank);
        mesh.position.set(pos.x, 0, pos.z);
        mesh.receiveShadow = true;
        mesh.userData = { file, rank, squareName: this._toAlgebraic(file, rank) };
        this.scene.add(mesh);
        this.squareMeshes.set(this._toAlgebraic(file, rank), mesh);
      }
    }

    // Ground plane beneath the board
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a58,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.25;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this._groundMesh = ground;
  }

  _initLights() {
    // Ambient — cool blue tint (brighter for visibility)
    const ambient = new THREE.AmbientLight(0xaabbdd, 1.0);
    this._ambientLight = ambient;
    this.scene.add(ambient);

    // Key light — warm directional (bright for clear visibility)
    const key = new THREE.DirectionalLight(0xfff5e8, 2.0);
    this._keyLight = key;
    key.position.set(5, 12, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = 2048;
    key.shadow.mapSize.height = 2048;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -8;
    key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.001;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);

    // Fill light — cooler blue
    const fill = new THREE.DirectionalLight(0xbbddff, 0.8);
    fill.position.set(-6, 8, -4);
    this.scene.add(fill);

    // Accent / rim light — dramatic red-purple
    const accent1 = new THREE.PointLight(0xe94560, 0.6, 25);
    accent1.position.set(-4, 6, -8);
    this.scene.add(accent1);

    // Second accent — cyan
    const accent2 = new THREE.PointLight(0x44aaff, 0.4, 25);
    accent2.position.set(6, 5, 8);
    this.scene.add(accent2);

    // Under-board glow
    const underGlow = new THREE.PointLight(0xc9a84c, 0.3, 8);
    underGlow.position.set(0, -0.5, 0);
    this.scene.add(underGlow);
  }

  _initPostProcessing() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);

    this.composer = new EffectComposer(this.renderer);

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Bloom pass — gives highlights and emissive materials a glow
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.25,  // strength (reduced to avoid darkening)
      0.4,   // radius
      0.9    // threshold (higher = less bloom = brighter scene)
    );
    this.composer.addPass(this.bloomPass);

    // FXAA
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (size.x * Math.min(window.devicePixelRatio, 2));
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (size.y * Math.min(window.devicePixelRatio, 2));
    this.fxaaPass = fxaaPass;
    this.composer.addPass(fxaaPass);
  }

  _initLabels() {
    const files = 'abcdefgh';
    for (let i = 0; i < 8; i++) {
      const fileSpr = this._createTextSprite(files[i]);
      const pos = this._squareToWorld(i, -1);
      fileSpr.position.set(pos.x, 0.01, pos.z + 0.7);
      this.scene.add(fileSpr);

      const rankSpr = this._createTextSprite(String(i + 1));
      const rpos = this._squareToWorld(-1, i);
      rankSpr.position.set(rpos.x - 0.7, 0.01, rpos.z);
      this.scene.add(rankSpr);
    }
  }

  _createTextSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#c9a84c';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.35, 0.35, 0.35);
    return sprite;
  }

  _initParticleSystem() {
    this.particlePool = [];
    const particleGeo = new THREE.SphereGeometry(0.03, 6, 6);

    for (let i = 0; i < 150; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(particleGeo, mat);
      mesh.visible = false;
      mesh.userData.velocity = new THREE.Vector3();
      mesh.userData.life = 0;
      mesh.userData.maxLife = 0;
      this.scene.add(mesh);
      this.particlePool.push(mesh);
    }
  }

  // ── Ambient floating dust particles + starfield ──
  _initAmbientParticles() {
    // --- Floating dust ---
    const count = 200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    this._ambientData = { count, velocities: [] };

    for (let i = 0; i < count; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = Math.random() * 12 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 24;

      const tint = Math.random();
      if (tint < 0.4) {
        colors[i * 3] = 0.3; colors[i * 3 + 1] = 0.7; colors[i * 3 + 2] = 1.0;
      } else if (tint < 0.7) {
        colors[i * 3] = 1.0; colors[i * 3 + 1] = 0.8; colors[i * 3 + 2] = 0.4;
      } else {
        colors[i * 3] = 0.8; colors[i * 3 + 1] = 0.5; colors[i * 3 + 2] = 1.0;
      }

      sizes[i] = 0.02 + Math.random() * 0.05;
      this._ambientData.velocities.push({
        x: (Math.random() - 0.5) * 0.004,
        y: 0.002 + Math.random() * 0.005,
        z: (Math.random() - 0.5) * 0.004,
        drift: Math.random() * Math.PI * 2,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this._ambientPoints = new THREE.Points(geo, mat);
    this.scene.add(this._ambientPoints);

    // --- Starfield background layer ---
    const starCount = 300;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 30 + Math.random() * 15;
      starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.5 + 2;
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const brightness = 0.5 + Math.random() * 0.5;
      starCol[i * 3] = brightness;
      starCol[i * 3 + 1] = brightness;
      starCol[i * 3 + 2] = brightness + Math.random() * 0.3;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this._starField = new THREE.Points(starGeo, starMat);
    this.scene.add(this._starField);
  }

  _updateAmbientParticles(t) {
    if (!this._ambientPoints) return;
    const posAttr = this._ambientPoints.geometry.getAttribute('position');
    const arr = posAttr.array;
    const vels = this._ambientData.velocities;

    for (let i = 0; i < this._ambientData.count; i++) {
      const v = vels[i];
      arr[i * 3]     += v.x + Math.sin(t * 0.5 + v.drift) * 0.001;
      arr[i * 3 + 1] += v.y;
      arr[i * 3 + 2] += v.z + Math.cos(t * 0.3 + v.drift) * 0.001;

      if (arr[i * 3 + 1] > 14) {
        arr[i * 3]     = (Math.random() - 0.5) * 24;
        arr[i * 3 + 1] = 0.5;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 24;
      }
    }
    posAttr.needsUpdate = true;

    this._ambientPoints.material.opacity = 0.3 + Math.sin(t * 0.8) * 0.1;

    // Slowly rotate starfield
    if (this._starField) {
      this._starField.rotation.y += 0.0001;
      this._starField.material.opacity = 0.35 + Math.sin(t * 0.3) * 0.15;
    }
  }

  // ── Confetti system for victory ──
  _initConfettiSystem() {
    this.confettiParticles = [];
    const confettiColors = [0xff2244, 0xffd700, 0x00ff88, 0x4488ff, 0xff66aa, 0x00d2ff, 0x6c5ce7];

    for (let i = 0; i < 200; i++) {
      const geo = new THREE.PlaneGeometry(0.08 + Math.random() * 0.06, 0.12 + Math.random() * 0.08);
      const mat = new THREE.MeshBasicMaterial({
        color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.userData.vel = new THREE.Vector3();
      mesh.userData.rotSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );
      mesh.userData.life = 0;
      this.scene.add(mesh);
      this.confettiParticles.push(mesh);
    }
  }

  triggerConfetti() {
    this._confettiActive = true;
    for (const p of this.confettiParticles) {
      p.visible = true;
      p.position.set(
        (Math.random() - 0.5) * 4,
        5 + Math.random() * 3,
        (Math.random() - 0.5) * 4
      );
      p.material.opacity = 1.0;
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.03 + Math.random() * 0.06;
      p.userData.vel.set(
        Math.cos(angle) * speed,
        0.02 + Math.random() * 0.04,
        Math.sin(angle) * speed
      );
      p.userData.life = 3 + Math.random() * 2;
    }
  }

  // Dramatic checkmate camera zoom
  triggerCheckmateZoom() {
    // Save current camera state
    const origDist = this.cameraOrbitDist;
    const origPitch = this.cameraOrbitPitch;
    const targetDist = 8;
    const targetPitch = 0.6;
    const duration = 1200;
    const startTime = performance.now();

    const animateZoom = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      // Ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3);

      this.cameraOrbitDist = origDist + (targetDist - origDist) * ease;
      this.cameraOrbitPitch = origPitch + (targetPitch - origPitch) * ease;
      this._updateCameraFromOrbit();

      if (t < 1) {
        requestAnimationFrame(animateZoom);
      } else {
        // Hold for a moment, then trigger confetti
        setTimeout(() => {
          this.triggerConfetti();
          this.triggerShake(0.2);
          // Bloom flash
          if (this.bloomPass) {
            const orig = this.bloomPass.strength;
            this.bloomPass.strength = orig + 0.5;
            setTimeout(() => { this.bloomPass.strength = orig; }, 300);
          }
        }, 400);

        // Restore camera after 4 seconds
        setTimeout(() => {
          const restoreStart = performance.now();
          const restoreDuration = 1500;
          const animateRestore = () => {
            const re = performance.now() - restoreStart;
            const rt = Math.min(1, re / restoreDuration);
            const rEase = 1 - Math.pow(1 - rt, 3);
            this.cameraOrbitDist = targetDist + (origDist - targetDist) * rEase;
            this.cameraOrbitPitch = targetPitch + (origPitch - targetPitch) * rEase;
            this._updateCameraFromOrbit();
            if (rt < 1) requestAnimationFrame(animateRestore);
          };
          requestAnimationFrame(animateRestore);
        }, 4000);
      }
    };
    requestAnimationFrame(animateZoom);
  }

  _updateConfetti(dt) {
    if (!this._confettiActive) return;
    let anyAlive = false;

    for (const p of this.confettiParticles) {
      if (p.userData.life <= 0) continue;
      anyAlive = true;

      p.userData.life -= dt;
      p.userData.vel.y -= 0.0008; // gravity
      p.userData.vel.x *= 0.998;
      p.userData.vel.z *= 0.998;
      p.position.add(p.userData.vel);

      // Flutter rotation
      p.rotation.x += p.userData.rotSpeed.x * dt;
      p.rotation.y += p.userData.rotSpeed.y * dt;
      p.rotation.z += p.userData.rotSpeed.z * dt;

      // Fade out in last second
      p.material.opacity = Math.min(1, p.userData.life);
      if (p.userData.life <= 0) {
        p.visible = false;
      }
    }

    if (!anyAlive) this._confettiActive = false;
  }

  // ── Hover tracking ──
  _initHoverTracking() {
    this._hoverMouse = new THREE.Vector2(-999, -999);
    this._hoverRaycaster = new THREE.Raycaster();

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this._hoverMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this._hoverMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    this.canvas.addEventListener('mouseleave', () => {
      this._hoverMouse.set(-999, -999);
      this._clearHover();
    });
  }

  _updateHover() {
    this._hoverRaycaster.setFromCamera(this._hoverMouse, this.camera);

    // Check pieces for hover
    const pieceArray = [];
    this.pieceMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Group) {
        mesh.traverse((child) => {
          if (child.isMesh) {
            child.userData._parentGroup = mesh;
            pieceArray.push(child);
          }
        });
      } else {
        pieceArray.push(mesh);
      }
    });

    const hits = this._hoverRaycaster.intersectObjects(pieceArray);
    if (hits.length > 0) {
      const hit = hits[0].object;
      const group = hit.userData._parentGroup || hit;
      const sq = group.userData.square;

      if (sq !== this.hoveredSquare) {
        this._clearHover();
        this.hoveredSquare = sq;
        this.hoveredMesh = this.pieceMeshes.get(sq);
        this._hoverGlowIntensity = 0;
      }
    } else {
      if (this.hoveredSquare) this._clearHover();
    }
  }

  _clearHover() {
    if (this.hoveredMesh) {
      // Reset emissive back to default
      const isWhite = this.hoveredMesh.userData.isWhite;
      const defaultEmissive = isWhite ? 0x332211 : 0x221133;
      const defaultIntensity = isWhite ? 0.08 : 0.15;
      this._setMeshEmissive(this.hoveredMesh, defaultEmissive, defaultIntensity);
    }
    this.hoveredSquare = null;
    this.hoveredMesh = null;
    this._hoverGlowIntensity = 0;
  }

  _animateHover(dt, t) {
    if (!this.hoveredMesh) return;

    // Ramp up glow
    this._hoverGlowIntensity = Math.min(1, this._hoverGlowIntensity + dt * 4);
    const glow = this._hoverGlowIntensity;

    // Emissive glow
    const isWhite = this.hoveredMesh.userData.isWhite;
    const baseEmissive = isWhite ? 0x332211 : 0x221133;
    const hoverEmissive = isWhite ? 0xffd700 : 0x6c5ce7;
    const intensity = (isWhite ? 0.08 : 0.15) + glow * 0.4;
    const color = new THREE.Color(baseEmissive).lerp(new THREE.Color(hoverEmissive), glow * 0.6);
    this._setMeshEmissive(this.hoveredMesh, color, intensity);

    // Float up effect
    const baseY = 0.04;
    const floatY = baseY + glow * 0.12 + Math.sin(t * 3) * 0.02 * glow;
    if (!this.hoveredMesh.userData.animTarget) {
      this.hoveredMesh.position.y = floatY;
    }
  }

  _setMeshEmissive(mesh, color, intensity) {
    if (!mesh) return;
    const setOnMat = (mat) => {
      if (mat && mat.emissive) {
        mat.emissive.set(color);
        mat.emissiveIntensity = intensity;
      }
    };
    if (mesh instanceof THREE.Group) {
      mesh.traverse((child) => { if (child.isMesh) setOnMat(child.material); });
    } else if (mesh.material) {
      setOnMat(mesh.material);
    }
  }

  // ── Camera shake ──
  triggerShake(intensity = 0.15) {
    this._shakeIntensity = intensity;
  }

  _updateShake() {
    if (this._shakeIntensity < 0.001) {
      this._shakeOffset.set(0, 0, 0);
      this._shakeIntensity = 0;
      return;
    }
    this._shakeOffset.set(
      (Math.random() - 0.5) * this._shakeIntensity,
      (Math.random() - 0.5) * this._shakeIntensity * 0.5,
      (Math.random() - 0.5) * this._shakeIntensity
    );
    this._shakeIntensity *= this._shakeDecay;
  }

  // ── Theme system ──
  setTheme(themeId) {
    const theme = THEMES[themeId];
    if (!theme) return;
    currentTheme = themeId;
    LIGHT_SQUARE = theme.light;
    DARK_SQUARE = theme.dark;

    // Update square colors + material properties
    for (const [sq, mesh] of this.squareMeshes) {
      const { file, rank } = this._fromAlgebraic(sq);
      const isLight = (rank + file) % 2 === 0;
      mesh.material.color.set(isLight ? LIGHT_SQUARE : DARK_SQUARE);
      if (theme.squareRoughness !== undefined) mesh.material.roughness = isLight ? theme.squareRoughness : theme.squareRoughness + 0.1;
      if (theme.squareMetalness !== undefined) mesh.material.metalness = theme.squareMetalness;
      if (theme.squareOpacity !== undefined) {
        mesh.material.transparent = true;
        mesh.material.opacity = theme.squareOpacity;
      } else {
        mesh.material.transparent = false;
        mesh.material.opacity = 1.0;
      }
    }

    // Update board base & trim
    if (this._boardBase) this._boardBase.material.color.set(theme.base);
    if (this._boardTrim) {
      this._boardTrim.material.color.set(theme.trim);
      this._boardTrim.material.emissive.set(theme.trim);
    }

    // Update background & ground
    this.scene.background.set(theme.bg);
    if (this._groundMesh) this._groundMesh.material.color.set(theme.ground);

    // Update lighting for theme
    if (this._ambientLight && theme.ambientIntensity) this._ambientLight.intensity = theme.ambientIntensity;
    if (this._keyLight && theme.keyIntensity) this._keyLight.intensity = theme.keyIntensity;
    if (theme.exposure) this.renderer.toneMappingExposure = theme.exposure;
  }

  getThemes() {
    return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name }));
  }

  _spawnParticles(worldX, worldZ, color, count = 20) {
    let spawned = 0;
    for (const p of this.particlePool) {
      if (spawned >= count) break;
      if (p.userData.life > 0) continue;

      p.visible = true;
      p.position.set(worldX, 0.3, worldZ);
      p.material.color.set(color);
      p.material.opacity = 1.0;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.02 + Math.random() * 0.05;
      p.userData.velocity.set(
        Math.cos(angle) * speed,
        0.04 + Math.random() * 0.06,
        Math.sin(angle) * speed
      );
      p.userData.life = 1.0;
      p.userData.maxLife = 0.8 + Math.random() * 0.6;
      spawned++;
    }
  }

  // Enhanced capture: shockwave ring + extra spark burst
  spawnCaptureEffect(worldX, worldZ, color) {
    // Burst of particles
    this._spawnParticles(worldX, worldZ, color, 35);

    // Shockwave ring that expands outward
    const ringGeo = new THREE.RingGeometry(0.05, 0.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(worldX, 0.08, worldZ);
    this.scene.add(ring);

    // Animate shockwave expansion
    const startTime = performance.now();
    const duration = 600;
    const animateRing = () => {
      const elapsed = performance.now() - startTime;
      const t = Math.min(1, elapsed / duration);
      const scale = 1 + t * 12;
      ring.scale.set(scale, scale, 1);
      ring.material.opacity = 0.9 * (1 - t);
      if (t < 1) {
        requestAnimationFrame(animateRing);
      } else {
        this.scene.remove(ring);
        ring.geometry.dispose();
        ring.material.dispose();
      }
    };
    requestAnimationFrame(animateRing);

    // Flash: briefly brighten the bloom
    if (this.bloomPass) {
      const origStrength = this.bloomPass.strength;
      this.bloomPass.strength = origStrength + 0.3;
      setTimeout(() => { this.bloomPass.strength = origStrength; }, 150);
    }
  }

  _updateParticles(dt) {
    for (const p of this.particlePool) {
      if (p.userData.life <= 0) continue;

      p.userData.life -= dt / p.userData.maxLife;
      if (p.userData.life <= 0) {
        p.visible = false;
        p.userData.life = 0;
        continue;
      }

      p.position.add(p.userData.velocity);
      p.userData.velocity.y -= 0.001;
      p.material.opacity = Math.max(0, p.userData.life);
      const s = 0.5 + p.userData.life * 0.5;
      p.scale.setScalar(s);
    }
  }

  _startRenderLoop() {
    const clock = new THREE.Clock();

    const animate = () => {
      requestAnimationFrame(animate);

      const dt = clock.getDelta();
      const t = clock.getElapsedTime();

      // Animate pieces to target positions
      this.pieceMeshes.forEach((mesh) => {
        if (mesh.userData.animTarget) {
          const target = mesh.userData.animTarget;
          // Fast tween: piece arrives in ~0.2 seconds
          if (!mesh.userData.animProgress) {
            mesh.userData.animStart = { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z };
            mesh.userData.animProgress = 0;
          }
          mesh.userData.animProgress = Math.min(1, mesh.userData.animProgress + dt * 5.0);
          const p = mesh.userData.animProgress;
          // Ease-out cubic for smooth deceleration
          const ease = 1 - Math.pow(1 - p, 3);
          const start = mesh.userData.animStart;
          mesh.position.x = start.x + (target.x - start.x) * ease;
          mesh.position.z = start.z + (target.z - start.z) * ease;
          // Arc: rise then fall
          const arc = Math.sin(p * Math.PI) * 0.3;
          mesh.position.y = target.y + arc;

          if (p >= 1) {
            mesh.position.set(target.x, target.y, target.z);
            delete mesh.userData.animTarget;
            delete mesh.userData.animStart;
            delete mesh.userData.animProgress;
            this.animating = false;
          }
        }
      });

      // Animate highlight rings
      for (const ring of this.ringMeshes) {
        ring.rotation.y += dt * 1.5;
        ring.material.opacity = 0.3 + Math.sin(t * 3 + ring.userData.phase) * 0.15;
      }

      // Update particles
      this._updateParticles(dt);

      // Update ambient floating particles
      this._updateAmbientParticles(t);

      // Update hover glow + piece float
      this._updateHover();
      this._animateHover(dt, t);

      // Update camera shake
      this._updateShake();
      this.camera.position.add(this._shakeOffset);

      // Update confetti
      this._updateConfetti(dt);

      // Update trajectory trail
      this._updateTrajectoryTrail(dt);

      // Render with post-processing
      this.composer.render();

      // Undo camera shake offset so it doesn't accumulate
      this.camera.position.sub(this._shakeOffset);
    };
    animate();
  }

  _onResize() {
    const container = this.canvas.parentElement;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);

    const pr = Math.min(window.devicePixelRatio, 2);
    this.fxaaPass.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
  }

  // ---- Coordinate helpers ----

  _squareToWorld(file, rank) {
    const f = this.flipped ? 7 - file : file;
    const r = this.flipped ? 7 - rank : rank;
    return {
      x: f * SQUARE_SIZE - BOARD_OFFSET,
      z: -(r * SQUARE_SIZE - BOARD_OFFSET),
    };
  }

  _toAlgebraic(file, rank) {
    return 'abcdefgh'[file] + (rank + 1);
  }

  _fromAlgebraic(sq) {
    const file = sq.charCodeAt(0) - 97;
    const rank = parseInt(sq[1]) - 1;
    return { file, rank };
  }

  // ---- Piece management ----

  setPieces(pieces, animate = false) {
    const newPositions = new Map();
    for (const p of pieces) {
      newPositions.set(p.square, p);
    }

    for (const [sq, mesh] of this.pieceMeshes) {
      if (!newPositions.has(sq)) {
        this.scene.remove(mesh);
        this.pieceMeshes.delete(sq);
      }
    }

    for (const [sq, p] of newPositions) {
      const existingMesh = this.pieceMeshes.get(sq);
      const { file, rank } = this._fromAlgebraic(sq);
      const worldPos = this._squareToWorld(file, rank);
      const isWhite = p.color === 'white' || p.color === 'White';

      const typeMap = {
        'king': 'K', 'queen': 'Q', 'rook': 'R',
        'bishop': 'B', 'knight': 'N', 'pawn': 'P',
        'King': 'K', 'Queen': 'Q', 'Rook': 'R',
        'Bishop': 'B', 'Knight': 'N', 'Pawn': 'P'
      };
      const typeLetter = typeMap[p.piece_type] || p.piece_type;

      if (existingMesh) {
        if (existingMesh.userData.pieceType === typeLetter &&
            existingMesh.userData.isWhite === isWhite) {
          continue;
        }
        this.scene.remove(existingMesh);
        this.pieceMeshes.delete(sq);
      }

      const mesh = createPieceMesh(typeLetter, isWhite, 0.9);
      if (!mesh) continue;

      mesh.userData = { square: sq, pieceType: typeLetter, isWhite };
      mesh.position.set(worldPos.x, 0.04, worldPos.z);
      this.scene.add(mesh);
      this.pieceMeshes.set(sq, mesh);
    }
  }

  animateMove(fromSq, toSq) {
    const mesh = this.pieceMeshes.get(fromSq);
    if (!mesh) return;

    const { file, rank } = this._fromAlgebraic(toSq);
    const worldPos = this._squareToWorld(file, rank);

    const targetMesh = this.pieceMeshes.get(toSq);
    if (targetMesh && targetMesh !== mesh) {
      // Capture — spawn enhanced effect + camera shake!
      const captureColor = targetMesh.userData.isWhite ? 0xf5f0e8 : 0x6644aa;
      this.spawnCaptureEffect(targetMesh.position.x, targetMesh.position.z, captureColor);
      this.triggerShake(0.15);
      this.scene.remove(targetMesh);
      this.pieceMeshes.delete(toSq);
    }

    this.pieceMeshes.delete(fromSq);
    this.pieceMeshes.set(toSq, mesh);
    mesh.userData.square = toSq;

    this.animating = true;
    mesh.userData.animProgress = 0;
    mesh.userData.animTarget = { x: worldPos.x, y: 0.04, z: worldPos.z };

    // Draw trajectory trail
    this._drawTrajectoryTrail(fromSq, toSq);
  }

  // ---- Highlights ----

  clearHighlights() {
    for (const mesh of this.highlightMeshes) {
      this.scene.remove(mesh);
    }
    this.highlightMeshes = [];
    for (const ring of this.ringMeshes) {
      this.scene.remove(ring);
    }
    this.ringMeshes = [];
  }

  highlightSquare(sq, color, opacity = 0.4, glow = false) {
    const { file, rank } = this._fromAlgebraic(sq);
    const pos = this._squareToWorld(file, rank);

    const geo = new THREE.PlaneGeometry(SQUARE_SIZE * 0.88, SQUARE_SIZE * 0.88);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.042, pos.z);
    this.scene.add(mesh);
    this.highlightMeshes.push(mesh);

    if (glow) {
      const ringGeo = new THREE.RingGeometry(0.35, 0.42, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pos.x, 0.05, pos.z);
      ring.userData.phase = Math.random() * Math.PI * 2;
      this.scene.add(ring);
      this.ringMeshes.push(ring);
    }
  }

  highlightLegalMoves(moves, fromSquare) {
    this.clearHighlights();
    this.highlightSquare(fromSquare, HIGHLIGHT_SELECTED, 0.5, true);

    for (const uci of moves) {
      if (uci.startsWith(fromSquare)) {
        const toSq = uci.substring(2, 4);
        const hasPiece = this.pieceMeshes.has(toSq);
        if (hasPiece) {
          this.highlightSquare(toSq, 0xff4466, 0.4, true);
        } else {
          this._addLegalMoveDot(toSq);
        }
      }
    }
  }

  _addLegalMoveDot(sq) {
    const { file, rank } = this._fromAlgebraic(sq);
    const pos = this._squareToWorld(file, rank);

    const geo = new THREE.CircleGeometry(0.15, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_LEGAL,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, 0.042, pos.z);
    this.scene.add(mesh);
    this.highlightMeshes.push(mesh);
  }

  highlightLastMove(from, to) {
    this.highlightSquare(from, HIGHLIGHT_LAST_MOVE, 0.2);
    this.highlightSquare(to, HIGHLIGHT_LAST_MOVE, 0.2);
  }

  highlightCheck(kingSq) {
    this.highlightSquare(kingSq, HIGHLIGHT_CHECK, 0.5, true);
    const { file, rank } = this._fromAlgebraic(kingSq);
    const pos = this._squareToWorld(file, rank);
    this._spawnParticles(pos.x, pos.z, HIGHLIGHT_CHECK, 15);
  }

  /**
   * Show a hint on the board: highlight the "from" square, the "to" square,
   * draw a glowing arrow between them, and spawn particles.
   */
  highlightHint(fromSq, toSq) {
    // Highlight source (pulsing glow ring)
    this.highlightSquare(fromSq, HIGHLIGHT_HINT, 0.45, true);
    // Highlight destination
    this.highlightSquare(toSq, HIGHLIGHT_HINT, 0.35, true);

    // Draw arrow from → to
    const fromPos = this._fromAlgebraic(fromSq);
    const toPos   = this._fromAlgebraic(toSq);
    const from3D  = this._squareToWorld(fromPos.file, fromPos.rank);
    const to3D    = this._squareToWorld(toPos.file, toPos.rank);

    const dx = to3D.x - from3D.x;
    const dz = to3D.z - from3D.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle  = Math.atan2(dx, dz);

    // Arrow shaft
    const shaftLen = Math.max(0.1, length - 0.35);
    const shaftGeo = new THREE.PlaneGeometry(0.08, shaftLen);
    const shaftMat = new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_HINT,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.rotation.x = -Math.PI / 2;
    shaft.rotation.z = -angle;
    shaft.position.set(
      from3D.x + dx * 0.4,
      0.055,
      from3D.z + dz * 0.4
    );
    this.scene.add(shaft);
    this.highlightMeshes.push(shaft);

    // Arrow head (triangle)
    const headGeo = new THREE.BufferGeometry();
    const s = 0.15;
    const verts = new Float32Array([
      0, 0,  s * 1.5,
     -s, 0, -s * 0.5,
      s, 0, -s * 0.5,
    ]);
    headGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    headGeo.computeVertexNormals();
    const headMat = new THREE.MeshBasicMaterial({
      color: HIGHLIGHT_HINT,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.y = angle;
    head.position.set(
      to3D.x - dx / length * 0.22,
      0.055,
      to3D.z - dz / length * 0.22
    );
    this.scene.add(head);
    this.highlightMeshes.push(head);

    // Particles on both squares
    this._spawnParticles(from3D.x, from3D.z, HIGHLIGHT_HINT, 10);
    this._spawnParticles(to3D.x, to3D.z, HIGHLIGHT_HINT, 12);
  }

  // ---- Click detection ----

  getSquareAtScreen(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((screenX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((screenY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const squareArray = Array.from(this.squareMeshes.values());
    const intersects = this.raycaster.intersectObjects(squareArray);
    if (intersects.length > 0) {
      return intersects[0].object.userData.squareName;
    }

    const pieceArray = [];
    this.pieceMeshes.forEach((mesh) => {
      if (mesh instanceof THREE.Group) {
        mesh.traverse((child) => {
          if (child.isMesh) {
            child.userData._parentSquare = mesh.userData.square;
            pieceArray.push(child);
          }
        });
      } else {
        pieceArray.push(mesh);
      }
    });

    const pieceIntersects = this.raycaster.intersectObjects(pieceArray);
    if (pieceIntersects.length > 0) {
      const hit = pieceIntersects[0].object;
      return hit.userData.square || hit.userData._parentSquare;
    }

    return null;
  }

  // ---- Move Trajectory Trail ----

  _drawTrajectoryTrail(fromSq, toSq) {
    this._clearTrajectoryTrail();

    const fromCoord = this._fromAlgebraic(fromSq);
    const toCoord = this._fromAlgebraic(toSq);
    const from3D = this._squareToWorld(fromCoord.file, fromCoord.rank);
    const to3D = this._squareToWorld(toCoord.file, toCoord.rank);

    // Create a curved trail using CatmullRomCurve
    const midY = 0.5;
    const points = [];
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = from3D.x + (to3D.x - from3D.x) * t;
      const z = from3D.z + (to3D.z - from3D.z) * t;
      const y = 0.06 + Math.sin(t * Math.PI) * midY;
      points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.02, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.scene.add(tubeMesh);

    this._trajectoryTrail = { mesh: tubeMesh, life: 2.0 };
  }

  _clearTrajectoryTrail() {
    if (this._trajectoryTrail) {
      this.scene.remove(this._trajectoryTrail.mesh);
      this._trajectoryTrail.mesh.geometry.dispose();
      this._trajectoryTrail.mesh.material.dispose();
      this._trajectoryTrail = null;
    }
  }

  _updateTrajectoryTrail(dt) {
    if (!this._trajectoryTrail) return;
    this._trajectoryTrail.life -= dt;
    if (this._trajectoryTrail.life <= 0) {
      this._clearTrajectoryTrail();
    } else {
      const alpha = Math.min(1, this._trajectoryTrail.life * 0.5);
      this._trajectoryTrail.mesh.material.opacity = alpha * 0.5;
    }
  }

  // ---- Board Annotation System (right-click drag arrows, shift-click circles) ----

  _initAnnotationSystem() {
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        // Right-click: start annotation drag
        e.preventDefault();
        const sq = this.getSquareAtScreen(e.clientX, e.clientY);
        if (sq) {
          this._annotationDragging = true;
          this._annotationFrom = sq;
        }
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (e.button === 2 && this._annotationDragging) {
        e.preventDefault();
        const sq = this.getSquareAtScreen(e.clientX, e.clientY);
        this._annotationDragging = false;

        if (sq && this._annotationFrom) {
          if (sq === this._annotationFrom) {
            // Same square: draw a circle annotation
            this._addCircleAnnotation(sq);
          } else {
            // Different square: draw an arrow annotation
            this._addArrowAnnotation(this._annotationFrom, sq);
          }
        }
        this._annotationFrom = null;
      }
    });
  }

  _addArrowAnnotation(fromSq, toSq) {
    const fromCoord = this._fromAlgebraic(fromSq);
    const toCoord = this._fromAlgebraic(toSq);
    const from3D = this._squareToWorld(fromCoord.file, fromCoord.rank);
    const to3D = this._squareToWorld(toCoord.file, toCoord.rank);

    const color = 0xff8800;
    const dx = to3D.x - from3D.x;
    const dz = to3D.z - from3D.z;
    const length = Math.sqrt(dx * dx + dz * dz);
    const angle = Math.atan2(dx, dz);

    // Arrow shaft
    const shaftLen = Math.max(0.1, length - 0.3);
    const shaftGeo = new THREE.PlaneGeometry(0.06, shaftLen);
    const shaftMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide,
    });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.rotation.x = -Math.PI / 2;
    shaft.rotation.z = -angle;
    shaft.position.set(from3D.x + dx * 0.4, 0.06, from3D.z + dz * 0.4);
    this.scene.add(shaft);

    // Arrow head
    const headGeo = new THREE.BufferGeometry();
    const s = 0.12;
    const verts = new Float32Array([0, 0, s * 1.5, -s, 0, -s * 0.5, s, 0, -s * 0.5]);
    headGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    headGeo.computeVertexNormals();
    const headMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, depthTest: false, side: THREE.DoubleSide,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.y = angle;
    head.position.set(to3D.x - dx / length * 0.2, 0.06, to3D.z - dz / length * 0.2);
    this.scene.add(head);

    this._annotations.push(shaft, head);
  }

  _addCircleAnnotation(sq) {
    const coord = this._fromAlgebraic(sq);
    const pos = this._squareToWorld(coord.file, coord.rank);
    const color = 0xff8800;

    const ringGeo = new THREE.RingGeometry(0.35, 0.42, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pos.x, 0.06, pos.z);
    this.scene.add(ring);
    this._annotations.push(ring);
  }

  clearAnnotations() {
    for (const mesh of this._annotations) {
      this.scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
    }
    this._annotations = [];
  }

  // ---- Drag and Drop Support ----

  liftPiece(sq) {
    const mesh = this.pieceMeshes.get(sq);
    if (!mesh) return;
    this._liftedPieceSq = sq;
    this._liftedPieceOrigY = mesh.position.y;
    mesh.position.y = 0.5;
  }

  dragPiece(sq, screenX, screenY) {
    const mesh = this.pieceMeshes.get(sq);
    if (!mesh) return;

    // Raycast to get world position at board height
    const rect = this.canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((screenX - rect.left) / rect.width) * 2 - 1,
      -((screenY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(mouse, this.camera);

    // Intersect with a horizontal plane at y=0.5
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
    const intersection = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(plane, intersection);

    if (intersection) {
      mesh.position.x = intersection.x;
      mesh.position.z = intersection.z;
      mesh.position.y = 0.5;
    }
  }

  dropPiece(sq) {
    const mesh = this.pieceMeshes.get(sq);
    if (!mesh) return;

    // Snap back to proper position
    const coord = this._fromAlgebraic(sq);
    const worldPos = this._squareToWorld(coord.file, coord.rank);
    mesh.position.set(worldPos.x, this._liftedPieceOrigY, worldPos.z);
    this._liftedPieceSq = null;
  }

  flipBoard() {
    this.flipped = !this.flipped;
    this._setCameraPosition();

    this.pieceMeshes.forEach((mesh, sq) => {
      const { file, rank } = this._fromAlgebraic(sq);
      const pos = this._squareToWorld(file, rank);
      mesh.position.set(pos.x, 0.04, pos.z);
    });
  }

  dispose() {
    this._resizeObserver.disconnect();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
