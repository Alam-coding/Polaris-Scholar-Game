import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ROCKET_ENGINES } from '../data/missionData';
import { getSensorBay } from '../engine/physics';
import { RocketConfig, SatelliteConfig } from '../types/mission';
import {
  afterDraw,
  createKaptonFoilTexture,
  createRadiatorTexture,
  createSolarPanelTexture,
  detectSoftwareGl,
  disposeObject3D,
} from './webglUtils';

interface SpacecraftViewportProps {
  mode: 'satellite' | 'rocket';
  satelliteConfig?: SatelliteConfig;
  rocketConfig?: RocketConfig;
  highlightPart?: string | null;
  testFire?: boolean;
  className?: string;
}

type CameraPresetId = 'iso' | 'sensors' | 'engine' | 'top';

const CAMERA_PRESETS: Record<CameraPresetId, { label: string; pos: [number, number, number] }> = {
  iso: { label: 'Iso', pos: [3.9, 2.35, 5.1] },
  sensors: { label: 'Sensors', pos: [0.3, 0.7, 5.6] },
  engine: { label: 'Engine', pos: [1.6, 1.1, -5.3] },
  top: { label: 'Top', pos: [0.1, 5.6, 1.4] },
};

// Instrument mounting slots matching MASS_COORDS in physics.ts (so 3D placement reflects CoM balance!)
const INSTRUMENT_3D_SLOTS: Record<string, [number, number, number]> = {
  img: [-0.52, 0.34, 0.92],
  snd: [0.52, 0.34, 0.92],
  lid: [-0.52, -0.32, 0.92],
  rad: [0.52, -0.32, 0.92],
  cor: [-0.18, 0.42, 0.92],
  par: [0.22, 0.42, 0.92],
  mag: [-0.26, -0.44, 0.92],
  neu: [0.22, -0.42, 0.92],
};

interface PartGroupRecord {
  group: THREE.Group;
  basePos: THREE.Vector3;
  explodeOffset: THREE.Vector3;
  partKey: string;
  meshes: THREE.Mesh[];
}

export function SpacecraftViewport({
  mode,
  satelliteConfig,
  rocketConfig,
  highlightPart,
  testFire = false,
  className = '',
}: SpacecraftViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [exploded, setExploded] = useState(false);
  const [camPreset, setCamPreset] = useState<CameraPresetId>('iso');

  const stateRef = useRef({
    mode,
    satelliteConfig,
    rocketConfig,
    highlightPart,
    testFire,
    exploded,
  });
  stateRef.current = {
    mode,
    satelliteConfig,
    rocketConfig,
    highlightPart,
    testFire,
    exploded,
  };

  const rebuildFnRef = useRef<(() => void) | null>(null);
  const cameraMoveRef = useRef<((preset: CameraPresetId) => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));

    const width = container.clientWidth || 360;
    const height = container.clientHeight || 300;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(37, width / height, 0.1, 100);
    camera.position.set(...CAMERA_PRESETS.iso.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 2.6;
    controls.maxDistance = 12;
    controls.autoRotate = !isSoftwareGl;
    controls.autoRotateSpeed = 0.72;

    // 3-point warm/cool studio rig
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x1e293b, 0.65);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.55);
    keyLight.position.set(5, 7, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
    rimLight.position.set(-5, -2, -5);
    scene.add(rimLight);

    // Turntable calibration grid
    const grid = new THREE.GridHelper(10, 20, 0x22d3ee, 0x1e293b);
    grid.position.y = -2.1;
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.25;
    scene.add(grid);

    // Camera transition state (cancelled immediately when user grabs OrbitControls)
    let camAnimating = false;
    const camTargetPos = new THREE.Vector3(...CAMERA_PRESETS.iso.pos);
    const onControlsStart = () => {
      camAnimating = false;
    };
    controls.addEventListener('start', onControlsStart);

    cameraMoveRef.current = (preset: CameraPresetId) => {
      const p = CAMERA_PRESETS[preset].pos;
      camTargetPos.set(p[0], p[1], p[2]);
      camAnimating = true;
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const solarTex = createSolarPanelTexture(2, 3, maxAniso);
    const { colorTex: kaptonColorTex, bumpTex: kaptonBumpTex } = createKaptonFoilTexture(maxAniso);
    const radiatorTex = createRadiatorTexture(maxAniso);

    let modelGroup: THREE.Group | null = null;
    let plumeMesh: THREE.Group | null = null;
    let partRecords: PartGroupRecord[] = [];
    let currentExplode = 0;

    const registerPartGroup = (
      parent: THREE.Group,
      partKey: string,
      explodeOffset: THREE.Vector3,
      buildFn: (g: THREE.Group) => void,
    ) => {
      const g = new THREE.Group();
      buildFn(g);
      const meshes: THREE.Mesh[] = [];
      g.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          meshes.push(obj as THREE.Mesh);
        }
      });
      parent.add(g);
      partRecords.push({
        group: g,
        basePos: g.position.clone(),
        explodeOffset,
        partKey,
        meshes,
      });
      return g;
    };

    const createParabolicDishGeo = (radius: number) => {
      const pts: THREE.Vector2[] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const r = t * radius;
        const y = t * t * radius * 0.34;
        pts.push(new THREE.Vector2(r, y));
      }
      return new THREE.LatheGeometry(pts, 28);
    };

    const createContouredBellGeo = (throatR: number, exitR: number, height: number) => {
      const pts: THREE.Vector2[] = [];
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const r = throatR + (exitR - throatR) * Math.pow(t, 0.72);
        const y = -t * height;
        pts.push(new THREE.Vector2(r, y));
      }
      return new THREE.LatheGeometry(pts, 24);
    };

    const buildModel = () => {
      if (modelGroup) {
        scene.remove(modelGroup);
        disposeObject3D(modelGroup);
      }
      partRecords = [];
      plumeMesh = null;

      const root = new THREE.Group();
      const s = stateRef.current;

      const kaptonFoil = new THREE.MeshPhysicalMaterial({
        map: kaptonColorTex,
        bumpMap: kaptonBumpTex,
        bumpScale: 0.028,
        metalness: 0.88,
        roughness: 0.24,
        clearcoat: 0.35,
        clearcoatRoughness: 0.25,
      });
      const aluminum = new THREE.MeshStandardMaterial({
        color: 0xc2ccd9,
        metalness: 0.82,
        roughness: 0.24,
      });
      const titanium = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.78,
        roughness: 0.32,
      });
      const darkComposite = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.35,
        roughness: 0.65,
      });
      const whiteThermal = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.12,
        roughness: 0.5,
      });
      const radiatorMat = new THREE.MeshStandardMaterial({
        map: radiatorTex,
        metalness: 0.18,
        roughness: 0.42,
      });
      const copper = new THREE.MeshStandardMaterial({
        color: 0xc06f3e,
        metalness: 0.86,
        roughness: 0.24,
      });
      const shieldArmorMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        roughness: 0.28,
      });
      const lensCyan = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.75,
        metalness: 0.2,
        roughness: 0.1,
      });

      if (s.mode === 'satellite' && s.satelliteConfig) {
        const cfg = s.satelliteConfig;

        // 1. CORE OCTAGONAL BUS + ADAPTER RINGS + RCS PODS + STAR TRACKERS
        registerPartGroup(root, 'bus', new THREE.Vector3(0, 0, 0), (g) => {
          // Octagonal Kapton-wrapped core bus
          const busCore = new THREE.Mesh(
            new THREE.CylinderGeometry(0.84, 0.84, 1.72, 8),
            kaptonFoil.clone(),
          );
          busCore.rotation.x = Math.PI / 2;
          busCore.rotation.y = Math.PI / 8;
          g.add(busCore);

          // Forward & Aft structural adapter collars
          [-0.87, 0.87].forEach((zPos) => {
            const collar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.87, 0.87, 0.08, 16),
              titanium.clone(),
            );
            collar.rotation.x = Math.PI / 2;
            collar.position.z = zPos;
            g.add(collar);
          });

          // Front payload optical bench plate
          const deck = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 0.8, 0.04, 8),
            darkComposite.clone(),
          );
          deck.rotation.x = Math.PI / 2;
          deck.rotation.y = Math.PI / 8;
          deck.position.z = 0.91;
          g.add(deck);

          // 4 Corner structural longerons + RCS thruster quads
          [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ].forEach(([sx, sy]) => {
            const strut = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8),
              aluminum.clone(),
            );
            strut.rotation.x = Math.PI / 2;
            strut.position.set(sx * 0.62, sy * 0.62, 0);
            g.add(strut);

            const rcsPod = new THREE.Mesh(
              new THREE.BoxGeometry(0.11, 0.11, 0.14),
              titanium.clone(),
            );
            rcsPod.position.set(sx * 0.68, sy * 0.68, -0.78);
            g.add(rcsPod);
          });

          // Star-tracker optical baffles + Reaction wheel housing on top deck
          [-0.36, 0.36].forEach((x) => {
            const rw = new THREE.Mesh(
              new THREE.CylinderGeometry(0.14, 0.16, 0.14, 14),
              darkComposite.clone(),
            );
            rw.position.set(x, 0.84, 0.42);
            g.add(rw);
          });
          const tracker = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.05, 0.2, 12),
            whiteThermal.clone(),
          );
          tracker.position.set(-0.42, 0.88, 0.12);
          tracker.rotation.z = 0.45;
          tracker.rotation.x = 0.25;
          g.add(tracker);
        });

        // 2. RADIATION HARDENED SHIELDING (visibly armors avionics bays!)
        if (cfg.radiationShield) {
          registerPartGroup(root, 'shield', new THREE.Vector3(0, 0.38, 0), (g) => {
            [-1, 1].forEach((side) => {
              const plate = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.86, 1.32),
                shieldArmorMat.clone(),
              );
              plate.position.set(side * 0.84, 0, 0.05);
              g.add(plate);

              // Copper fastener rivets on armor plate
              [-0.42, 0.42].forEach((dz) => {
                [-0.28, 0.28].forEach((dy) => {
                  const bolt = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.025, 0.025, 0.1, 6),
                    copper.clone(),
                  );
                  bolt.rotation.z = Math.PI / 2;
                  bolt.position.set(side * 0.85, dy, 0.05 + dz);
                  g.add(bolt);
                });
              });
            });
          });
        }

        // 3. ARTICULATED SOLAR POWER ARRAYS (SADA gimbal + V-yoke + hinged cells)
        const panelCount = cfg.power === 'a' ? 1 : cfg.power === 'b' ? 2 : 3;
        const panelW = cfg.power === 'a' ? 1.05 : 0.96;
        const solarMat = new THREE.MeshStandardMaterial({
          map: solarTex,
          metalness: 0.45,
          roughness: 0.22,
        });
        [-1, 1].forEach((side) => {
          registerPartGroup(root, 'power', new THREE.Vector3(side * 0.68, 0, 0), (g) => {
            // SADA Rotary Gimbal Motor
            const sada = new THREE.Mesh(
              new THREE.CylinderGeometry(0.11, 0.12, 0.22, 14),
              titanium.clone(),
            );
            sada.rotation.z = Math.PI / 2;
            sada.position.set(side * 0.92, 0, 0);
            g.add(sada);

            // Angled V-yoke deployment trusses
            [-0.24, 0.24].forEach((zOff) => {
              const yoke = new THREE.Mesh(
                new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8),
                aluminum.clone(),
              );
              yoke.rotation.z = Math.PI / 2;
              yoke.rotation.y = side * (zOff > 0 ? -0.42 : 0.42);
              yoke.position.set(side * 1.12, 0, zOff * 0.65);
              g.add(yoke);
            });

            for (let i = 0; i < panelCount; i++) {
              const px = side * (1.28 + i * (panelW + 0.07) + panelW / 2);
              const wing = new THREE.Mesh(
                new THREE.BoxGeometry(panelW, 0.036, 1.46),
                solarMat.clone(),
              );
              wing.position.set(px, 0, 0);
              g.add(wing);

              const frame = new THREE.Mesh(
                new THREE.BoxGeometry(panelW + 0.035, 0.024, 1.5),
                aluminum.clone(),
              );
              frame.position.set(px, -0.02, 0);
              g.add(frame);

              // Hinge bracket between segments
              const hingeX = side * (1.26 + i * (panelW + 0.07));
              [-0.45, 0.45].forEach((hz) => {
                const hinge = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.025, 0.025, 0.07, 8),
                  copper.clone(),
                );
                hinge.rotation.x = Math.PI / 2;
                hinge.position.set(hingeX, 0, hz);
                g.add(hinge);
              });
            }
          });
        });

        // 4. COMMUNICATIONS ANTENNA (Lathe parabolic dish / phased patch / helical UHF)
        registerPartGroup(root, 'comms', new THREE.Vector3(0, 0.72, 0), (g) => {
          if (cfg.comms === 'a') {
            const mast = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.05, 0.25, 10),
              titanium.clone(),
            );
            mast.position.set(0.28, 0.92, -0.25);
            g.add(mast);
            const whip = new THREE.Mesh(
              new THREE.CylinderGeometry(0.014, 0.014, 1.05, 8),
              aluminum.clone(),
            );
            whip.position.set(0.28, 1.45, -0.25);
            g.add(whip);
            const cross = new THREE.Mesh(
              new THREE.CylinderGeometry(0.012, 0.012, 0.55, 8),
              aluminum.clone(),
            );
            cross.rotation.z = Math.PI / 2;
            cross.position.set(0.28, 1.25, -0.25);
            g.add(cross);
          } else if (cfg.comms === 'b') {
            const mount = new THREE.Mesh(
              new THREE.BoxGeometry(0.66, 0.09, 0.66),
              titanium.clone(),
            );
            mount.position.set(0, 0.86, -0.22);
            g.add(mount);
            const patch = new THREE.Mesh(
              new THREE.BoxGeometry(0.56, 0.04, 0.56),
              whiteThermal.clone(),
            );
            patch.position.set(0, 0.92, -0.22);
            g.add(patch);
            [-0.14, 0.14].forEach((px) => {
              [-0.14, 0.14].forEach((pz) => {
                const tile = new THREE.Mesh(
                  new THREE.BoxGeometry(0.18, 0.02, 0.18),
                  copper.clone(),
                );
                tile.position.set(px, 0.945, -0.22 + pz);
                g.add(tile);
              });
            });
          } else {
            const radius = cfg.comms === 'c' ? 0.54 : 0.84;
            const mast = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.08, 0.34, 12),
              titanium.clone(),
            );
            mast.position.set(0, 0.92, -0.22);
            g.add(mast);

            const dishGroup = new THREE.Group();
            dishGroup.position.set(0, 1.12, -0.22);
            dishGroup.rotation.x = 0.42;

            const dishMat = new THREE.MeshStandardMaterial({
              color: cfg.comms === 'd' ? 0xf8fafc : 0xe2e8f0,
              metalness: 0.25,
              roughness: 0.36,
              side: THREE.DoubleSide,
            });
            const dish = new THREE.Mesh(createParabolicDishGeo(radius), dishMat);
            dishGroup.add(dish);

            // Feed horn + tripod struts
            const feedY = radius * 0.65;
            const feedCap = new THREE.Mesh(
              new THREE.CylinderGeometry(0.06, 0.04, 0.1, 12),
              copper.clone(),
            );
            feedCap.position.y = feedY;
            dishGroup.add(feedCap);

            for (let k = 0; k < 3; k++) {
              const ang = (k / 3) * Math.PI * 2;
              const start = new THREE.Vector3(
                Math.cos(ang) * radius * 0.72,
                radius * 0.18,
                Math.sin(ang) * radius * 0.72,
              );
              const end = new THREE.Vector3(0, feedY, 0);
              const dir = new THREE.Vector3().subVectors(end, start);
              const len = dir.length();
              const strut = new THREE.Mesh(
                new THREE.CylinderGeometry(0.012, 0.012, len, 6),
                aluminum.clone(),
              );
              strut.position.copy(start).addScaledVector(dir, 0.5);
              strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
              dishGroup.add(strut);
            }
            g.add(dishGroup);
          }
        });

        // 5. THERMAL CONTROL (Radiator fins & copper fluid heat-pipe loop)
        registerPartGroup(root, 'therm', new THREE.Vector3(0, -0.62, 0), (g) => {
          if (cfg.therm === 'a') {
            const collar = new THREE.Mesh(
              new THREE.BoxGeometry(1.18, 0.06, 1.38),
              kaptonFoil.clone(),
            );
            collar.position.set(0, -0.82, 0);
            g.add(collar);
          } else {
            const rad = new THREE.Mesh(
              new THREE.BoxGeometry(1.36, 0.045, 1.46),
              radiatorMat.clone(),
            );
            rad.position.set(0, -0.84, 0);
            g.add(rad);

            if (cfg.therm === 'c') {
              // Active pumped fluid loop copper pipes
              const loopCurve = new THREE.CatmullRomCurve3(
                [
                  new THREE.Vector3(-0.48, -0.88, -0.58),
                  new THREE.Vector3(-0.48, -0.88, 0.58),
                  new THREE.Vector3(0, -0.88, 0.62),
                  new THREE.Vector3(0.48, -0.88, 0.58),
                  new THREE.Vector3(0.48, -0.88, -0.58),
                  new THREE.Vector3(0, -0.88, -0.62),
                ],
                true,
              );
              const pipe = new THREE.Mesh(
                new THREE.TubeGeometry(loopCurve, 32, 0.024, 8, true),
                copper.clone(),
              );
              g.add(pipe);
            }
          }
        });

        // 6. SOLID-STATE DATA STORAGE MODULE (mounted on right flank +X or bottom bay)
        registerPartGroup(root, 'store', new THREE.Vector3(0, -0.45, -0.35), (g) => {
          const storeLen = cfg.store === 'a' ? 0.34 : cfg.store === 'b' ? 0.62 : 0.94;
          const storeBox = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.14, storeLen),
            darkComposite.clone(),
          );
          storeBox.position.set(0, -0.78, -0.15);
          g.add(storeBox);
          const finCount = cfg.store === 'a' ? 2 : cfg.store === 'b' ? 4 : 6;
          for (let i = 0; i < finCount; i++) {
            const rib = new THREE.Mesh(
              new THREE.BoxGeometry(0.45, 0.02, 0.04),
              aluminum.clone(),
            );
            rib.position.set(0, -0.84, -0.15 - storeLen * 0.35 + i * ((storeLen * 0.7) / Math.max(1, finCount - 1)));
            g.add(rib);
          }
        });

        // 7. PROPULSION MODULE + ANIMATED THRUSTER PLUME
        let nozzleZ = -1.25;
        let plumeR = 0.24;
        let plumeY = 0;
        registerPartGroup(root, 'prop', new THREE.Vector3(0, 0, -0.78), (g) => {
          if (cfg.prop === 'a') {
            const tank = new THREE.Mesh(
              new THREE.SphereGeometry(0.24, 16, 12),
              aluminum.clone(),
            );
            tank.position.set(0, 0, -1.08);
            g.add(tank);
            const noz = new THREE.Mesh(
              createContouredBellGeo(0.035, 0.095, 0.18),
              titanium.clone(),
            );
            noz.rotation.x = Math.PI / 2;
            noz.position.set(0, 0, -1.26);
            g.add(noz);
            nozzleZ = -1.44;
            plumeR = 0.1;
          } else if (cfg.prop === 'b') {
            [-0.4, 0.4].forEach((x) => {
              const tank = new THREE.Mesh(
                new THREE.SphereGeometry(0.25, 16, 12),
                aluminum.clone(),
              );
              tank.position.set(x, 0, -1.08);
              g.add(tank);
            });
            const bell = new THREE.Mesh(
              createContouredBellGeo(0.08, 0.25, 0.44),
              titanium.clone(),
            );
            bell.rotation.x = Math.PI / 2;
            bell.position.set(0, 0, -0.96);
            g.add(bell);
            nozzleZ = -1.4;
            plumeR = 0.22;
          } else if (cfg.prop === 'c') {
            [-0.46, 0.46].forEach((x, idx) => {
              const tank = new THREE.Mesh(
                new THREE.CapsuleGeometry(0.18, 0.42, 8, 16),
                whiteThermal.clone(),
              );
              tank.rotation.x = Math.PI / 2;
              tank.position.set(x, 0, -1.16);
              g.add(tank);
              const band = new THREE.Mesh(
                new THREE.CylinderGeometry(0.185, 0.185, 0.06, 16),
                new THREE.MeshStandardMaterial({
                  color: idx === 0 ? 0xef4444 : 0x38bdf8,
                  roughness: 0.4,
                }),
              );
              band.rotation.x = Math.PI / 2;
              band.position.set(x, 0, -1.16);
              g.add(band);
            });
            const bell = new THREE.Mesh(
              createContouredBellGeo(0.12, 0.45, 0.82),
              copper.clone(),
            );
            bell.rotation.x = Math.PI / 2;
            bell.position.set(0, 0, -1.02);
            g.add(bell);
            nozzleZ = -1.84;
            plumeR = 0.42;
          } else {
            const xenon = new THREE.Mesh(
              new THREE.SphereGeometry(0.29, 18, 14),
              aluminum.clone(),
            );
            xenon.position.set(0, 0.15, -1.16);
            g.add(xenon);
            const hall = new THREE.Mesh(
              new THREE.CylinderGeometry(0.27, 0.27, 0.16, 24),
              darkComposite.clone(),
            );
            hall.rotation.x = Math.PI / 2;
            hall.position.set(0, -0.22, -1.05);
            g.add(hall);
            const glowRing = new THREE.Mesh(
              new THREE.TorusGeometry(0.17, 0.028, 10, 28),
              lensCyan.clone(),
            );
            glowRing.position.set(0, -0.22, -1.14);
            g.add(glowRing);
            nozzleZ = -1.16;
            plumeR = 0.2;
            plumeY = -0.22;
          }

          // Plume cone inside prop group so it moves together if exploded!
          const pGroup = new THREE.Group();
          pGroup.position.set(0, plumeY, nozzleZ);
          const plumeColor = cfg.prop === 'd' ? 0x38bdf8 : 0xfbbf24;
          const coneGeo = new THREE.ConeGeometry(plumeR, 1, 18, 1, true);
          coneGeo.rotateX(-Math.PI / 2);
          coneGeo.translate(0, 0, -0.5);
          pGroup.add(
            new THREE.Mesh(
              coneGeo,
              new THREE.MeshBasicMaterial({
                color: plumeColor,
                transparent: true,
                opacity: 0.58,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }),
            ),
          );
          g.add(pGroup);
          plumeMesh = pGroup;
        });

        // 8. INSTALLED SCIENTIFIC INSTRUMENTS (Mounted on dynamic Left/Right payload bay slots!)
        cfg.instruments.forEach((id, idx) => {
          const base = INSTRUMENT_3D_SLOTS[id] || [0.46, 0, 0.92];
          const bay = getSensorBay(cfg, id);
          const sameBayIdx = cfg.instruments
            .slice(0, idx)
            .filter((prevId) => getSensorBay(cfg, prevId) === bay).length;
          const x = (bay === 'left' ? -1 : 1) * Math.max(0.32, Math.abs(base[0]));
          const y = base[1] + (sameBayIdx % 2 === 1 ? -0.18 : 0.08);
          const z = base[2];
          registerPartGroup(root, `inst:${id}`, new THREE.Vector3(x * 0.25, y * 0.25, 0.72), (g) => {
            const basePlate = new THREE.Mesh(
              new THREE.BoxGeometry(0.32, 0.32, 0.05),
              titanium.clone(),
            );
            basePlate.position.set(x, y, z);
            g.add(basePlate);

            if (id === 'img') {
              // Multispectral Telescope + sunshade hood + sapphire aperture
              const barrel = new THREE.Mesh(
                new THREE.CylinderGeometry(0.13, 0.14, 0.44, 18),
                darkComposite.clone(),
              );
              barrel.rotation.x = Math.PI / 2;
              barrel.position.set(x, y, z + 0.24);
              g.add(barrel);
              const ring = new THREE.Mesh(
                new THREE.TorusGeometry(0.135, 0.018, 8, 20),
                copper.clone(),
              );
              ring.position.set(x, y, z + 0.46);
              g.add(ring);
              const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18), lensCyan.clone());
              lens.position.set(x, y, z + 0.455);
              g.add(lens);
            } else if (id === 'cor') {
              // Solar Coronagraph with external occulter disk on strut
              const tube = new THREE.Mesh(
                new THREE.CylinderGeometry(0.11, 0.13, 0.68, 16),
                whiteThermal.clone(),
              );
              tube.rotation.x = Math.PI / 2;
              tube.position.set(x, y, z + 0.36);
              g.add(tube);
              const occulterArm = new THREE.Mesh(
                new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6),
                aluminum.clone(),
              );
              occulterArm.rotation.x = Math.PI / 2;
              occulterArm.position.set(x, y + 0.09, z + 0.82);
              g.add(occulterArm);
              const occDisk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16),
                copper.clone(),
              );
              occDisk.rotation.x = Math.PI / 2;
              occDisk.position.set(x, y, z + 0.94);
              g.add(occDisk);
            } else if (id === 'lid') {
              // Twin Active Aerosol Lidar Optics
              [-0.08, 0.08].forEach((dx, idx) => {
                const tube = new THREE.Mesh(
                  new THREE.CylinderGeometry(0.065, 0.07, 0.48, 14),
                  idx === 0 ? whiteThermal.clone() : darkComposite.clone(),
                );
                tube.rotation.x = Math.PI / 2;
                tube.position.set(x + dx, y, z + 0.26);
                g.add(tube);
                const emitter = new THREE.Mesh(
                  new THREE.CircleGeometry(0.05, 14),
                  lensCyan.clone(),
                );
                emitter.position.set(x + dx, y, z + 0.505);
                g.add(emitter);
              });
            } else if (id === 'snd') {
              // Atmospheric Sounder rotary mirror housing
              const housing = new THREE.Mesh(
                new THREE.BoxGeometry(0.28, 0.26, 0.34),
                whiteThermal.clone(),
              );
              housing.position.set(x, y, z + 0.19);
              g.add(housing);
              const drum = new THREE.Mesh(
                new THREE.CylinderGeometry(0.09, 0.09, 0.24, 16),
                copper.clone(),
              );
              drum.rotation.z = Math.PI / 2;
              drum.position.set(x, y, z + 0.36);
              g.add(drum);
            } else if (id === 'rad') {
              // Thermal Radiometer cryo-fin + infrared aperture
              const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.26, 0.24, 0.3),
                darkComposite.clone(),
              );
              body.position.set(x, y, z + 0.17);
              g.add(body);
              const eye = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16),
                copper.clone(),
              );
              eye.rotation.x = Math.PI / 2;
              eye.position.set(x, y, z + 0.33);
              g.add(eye);
            } else if (id === 'mag') {
              // Fluxgate Magnetometer extendable boom + tri-axial sensor head
              const boom = new THREE.Mesh(
                new THREE.CylinderGeometry(0.016, 0.02, 1.35, 8),
                aluminum.clone(),
              );
              boom.rotation.z = 0.22;
              boom.position.set(-0.62, 1.15, -0.45);
              g.add(boom);
              const tip = new THREE.Mesh(
                new THREE.OctahedronGeometry(0.11, 0),
                copper.clone(),
              );
              tip.position.set(-0.77, 1.82, -0.45);
              g.add(tip);
            } else if (id === 'par') {
              // Electrostatic Particle Detector dome
              const dome = new THREE.Mesh(
                new THREE.SphereGeometry(0.14, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
                aluminum.clone(),
              );
              dome.rotation.x = Math.PI / 2;
              dome.position.set(x, y, z + 0.12);
              g.add(dome);
            } else {
              // Neutron & UHF Relay Spectrometer
              const box = new THREE.Mesh(
                new THREE.BoxGeometry(0.26, 0.22, 0.3),
                aluminum.clone(),
              );
              box.position.set(x, y, z + 0.17);
              g.add(box);
              const helix = new THREE.Mesh(
                new THREE.CylinderGeometry(0.035, 0.035, 0.36, 10),
                copper.clone(),
              );
              helix.rotation.x = Math.PI / 2;
              helix.position.set(x, y + 0.04, z + 0.42);
              g.add(helix);
            }
          });
        });
      } else if (s.mode === 'rocket' && s.rocketConfig) {
        const rc = s.rocketConfig;
        const e1 = ROCKET_ENGINES[rc.stage1Engine];
        const e2 = ROCKET_ENGINES[rc.stage2Engine];
        const e3 = ROCKET_ENGINES[rc.stage3Engine];

        let yCursor = -1.7;
        const scale = 0.24;

        const spread = Math.min(0.45, rc.stage1EnginesCount * 0.09);
        for (let i = 0; i < rc.stage1EnginesCount; i++) {
          const angle = (i / Math.max(1, rc.stage1EnginesCount)) * Math.PI * 2;
          const bx = rc.stage1EnginesCount === 1 ? 0 : Math.cos(angle) * spread;
          const bz = rc.stage1EnginesCount === 1 ? 0 : Math.sin(angle) * spread;
          const bell = new THREE.Mesh(
            new THREE.CylinderGeometry(0.06, 0.13, 0.24, 12),
            new THREE.MeshStandardMaterial({ color: e1.color, metalness: 0.75, roughness: 0.3 }),
          );
          bell.position.set(bx, yCursor + 0.12, bz);
          root.add(bell);
        }
        yCursor += 0.24;

        const s1H = Math.max(0.5, rc.stage1Tanks * scale);
        const s1R = 0.35 + rc.stage1EnginesCount * 0.03;
        const s1Tank = new THREE.Mesh(new THREE.CylinderGeometry(s1R, s1R, s1H, 24), whiteThermal);
        s1Tank.position.y = yCursor + s1H / 2;
        root.add(s1Tank);
        const stripe = new THREE.Mesh(
          new THREE.CylinderGeometry(s1R + 0.01, s1R + 0.01, 0.12, 24),
          new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }),
        );
        stripe.position.y = yCursor + s1H * 0.75;
        root.add(stripe);
        yCursor += s1H;

        const inter = new THREE.Mesh(new THREE.CylinderGeometry(0.32, s1R, 0.18, 20), darkComposite);
        inter.position.y = yCursor + 0.09;
        root.add(inter);
        yCursor += 0.18;

        const s2H = Math.max(0.4, rc.stage2Tanks * scale);
        const s2Tank = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.32, s2H, 22),
          new THREE.MeshStandardMaterial({ color: e2.color, metalness: 0.4, roughness: 0.4 }),
        );
        s2Tank.position.y = yCursor + s2H / 2;
        root.add(s2Tank);
        yCursor += s2H;

        if (rc.stage3Tanks > 0) {
          const inter3 = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.12, 18), darkComposite);
          inter3.position.y = yCursor + 0.06;
          root.add(inter3);
          yCursor += 0.12;
          const s3H = Math.max(0.3, rc.stage3Tanks * scale * 0.85);
          const s3Tank = new THREE.Mesh(
            new THREE.CylinderGeometry(0.24, 0.24, s3H, 18),
            new THREE.MeshStandardMaterial({ color: e3.color, metalness: 0.5, roughness: 0.35 }),
          );
          s3Tank.position.y = yCursor + s3H / 2;
          root.add(s3Tank);
          yCursor += s3H;
        }

        const fairingMat = rc.fairingType === 'composite' ? darkComposite : whiteThermal;
        const fairingCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.42, 20), fairingMat);
        fairingCyl.position.y = yCursor + 0.21;
        root.add(fairingCyl);
        const noseCone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.65, 20), fairingMat);
        noseCone.position.y = yCursor + 0.42 + 0.325;
        root.add(noseCone);

        const pGroup = new THREE.Group();
        pGroup.position.set(0, -1.72, 0);
        const coneGeo = new THREE.ConeGeometry(0.38, 1.2, 16, 1, true);
        coneGeo.rotateX(Math.PI);
        coneGeo.translate(0, -0.6, 0);
        pGroup.add(
          new THREE.Mesh(
            coneGeo,
            new THREE.MeshBasicMaterial({
              color: 0xfb923c,
              transparent: true,
              opacity: 0.6,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          ),
        );
        root.add(pGroup);
        plumeMesh = pGroup;
      }

      modelGroup = root;
      scene.add(root);
    };

    rebuildFnRef.current = buildModel;
    buildModel();

    let rafId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const s = stateRef.current;

      // Smooth damped camera preset transition
      if (camAnimating) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camTargetPos.x, 7, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camTargetPos.y, 7, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camTargetPos.z, 7, dt);
        if (camera.position.distanceTo(camTargetPos) < 0.04) {
          camAnimating = false;
        }
      }

      controls.update();

      // Smooth damped exploded-view separation + live part highlighting
      if (s.mode === 'satellite') {
        const targetExplode = s.exploded ? 1 : 0;
        currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 7, dt);
        const hl = s.highlightPart;
        const pulse = 0.45 + 0.3 * Math.sin(elapsed * 6);

        partRecords.forEach((rec) => {
          rec.group.position.set(
            rec.basePos.x + rec.explodeOffset.x * currentExplode,
            rec.basePos.y + rec.explodeOffset.y * currentExplode,
            rec.basePos.z + rec.explodeOffset.z * currentExplode,
          );
          const isHighlighted = Boolean(hl && rec.partKey === hl);
          rec.meshes.forEach((mesh) => {
            const mat = mesh.material as THREE.MeshStandardMaterial;
            if (mat && mat.emissive) {
              if (isHighlighted) {
                mat.emissive.setHex(0x22d3ee);
                mat.emissiveIntensity = pulse;
              } else {
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 0;
              }
            }
          });
        });
      }

      if (plumeMesh) {
        const throttleFactor =
          s.mode === 'satellite' && s.satelliteConfig ? s.satelliteConfig.throttlePct / 100 : 0.7;
        const boost = s.testFire ? 1.55 : 0.75;
        const flicker = 0.92 + 0.12 * Math.sin(elapsed * 32) + 0.05 * Math.cos(elapsed * 54);
        if (s.mode === 'satellite') {
          plumeMesh.scale.set(
            0.9 + 0.08 * Math.sin(elapsed * 20),
            0.9 + 0.08 * Math.sin(elapsed * 20),
            (0.3 + throttleFactor * 0.9) * boost * flicker,
          );
        } else {
          plumeMesh.visible = s.testFire;
          plumeMesh.scale.set(1, boost * flicker, 1);
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        rafId = afterDraw(renderer, tick);
      } else {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      rafId = afterDraw(renderer, tick);
    } else {
      rafId = requestAnimationFrame(tick);
    }

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 360;
      const h = container.clientHeight || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      controls.removeEventListener('start', onControlsStart);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
      clearTimeout(rafId);
      controls.dispose();
      if (modelGroup) disposeObject3D(modelGroup);
      solarTex.dispose();
      kaptonColorTex.dispose();
      kaptonBumpTex.dispose();
      radiatorTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [mode]);

  useEffect(() => {
    rebuildFnRef.current?.();
  }, [satelliteConfig, rocketConfig, mode]);

  const handleSelectPreset = (id: CameraPresetId) => {
    setCamPreset(id);
    cameraMoveRef.current?.(id);
  };

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full touch-none select-none cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D spacecraft model"
      />

      {mode === 'satellite' && (
        <div className="pointer-events-auto absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-slate-700/90 bg-[#0A101D]/95 px-2 py-1 text-[11px] font-mono shadow-lg">
          {(Object.keys(CAMERA_PRESETS) as CameraPresetId[]).map((pid) => (
            <button
              key={pid}
              type="button"
              onClick={() => handleSelectPreset(pid)}
              className={`rounded px-2 py-0.5 transition-colors whitespace-nowrap shrink-0 ${
                camPreset === pid
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              {CAMERA_PRESETS[pid].label}
            </button>
          ))}
          <span className="text-slate-600 px-0.5" aria-hidden="true">|</span>
          <button
            type="button"
            onClick={() => setExploded((v) => !v)}
            className={`rounded px-2 py-0.5 transition-colors whitespace-nowrap shrink-0 ${
              exploded
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-amber-300 hover:bg-slate-800'
            }`}
          >
            {exploded ? 'Assemble' : 'Explode View'}
          </button>
        </div>
      )}
    </div>
  );
}
