import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EARTH_HOTSPOTS, GROUND_STATIONS } from '../data/missionData';
import { EarthHotspot, OrbitId } from '../types/mission';
import {
  afterDraw,
  createEarthTextures,
  createMarsTextures,
  createMoonTextures,
  detectSoftwareGl,
  disposeObject3D,
} from './webglUtils';

export interface SubSatelliteStatus {
  lat: number;
  lon: number;
  inSunlight: boolean;
  activeHotspotId: string | null;
  activeStationId: string | null;
}

interface EarthGlobeViewProps {
  backdropMode?: boolean;
  orbitId?: OrbitId;
  hotspots?: EarthHotspot[];
  scannedIds?: string[];
  scanningPulse?: number; // timestamp to trigger visual scan ring
  downlinkActive?: boolean;
  speedMultiplier?: number;
  swathSlewDeg?: number;
  onStatusUpdate?: (status: SubSatelliteStatus) => void;
  className?: string;
}

const _satPos = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _satDir = new THREE.Vector3();
const _velDir = new THREE.Vector3();
const _crossDir = new THREE.Vector3();
const _aimDir = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
const _markerDir = new THREE.Vector3();
const _sunDir = new THREE.Vector3(1, 0.25, 0.7).normalize();
const _dummy = new THREE.Object3D();

function latLonToVector3(lat: number, lon: number, radius: number, out: THREE.Vector3): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  out.set(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
  return out;
}

export function EarthGlobeView({
  backdropMode = false,
  orbitId = 'LEO',
  hotspots = EARTH_HOTSPOTS,
  scannedIds = [],
  scanningPulse = 0,
  downlinkActive = false,
  speedMultiplier = 1,
  swathSlewDeg = 0,
  onStatusUpdate,
  className = '',
}: EarthGlobeViewProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    backdropMode,
    orbitId,
    hotspots,
    scannedIds,
    scanningPulse,
    downlinkActive,
    speedMultiplier,
    swathSlewDeg,
    onStatusUpdate,
  });
  propsRef.current = {
    backdropMode,
    orbitId,
    hotspots,
    scannedIds,
    scanningPulse,
    downlinkActive,
    speedMultiplier,
    swathSlewDeg,
    onStatusUpdate,
  };
  const rebuildHotspotsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x050912, 1);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 150);
    if (propsRef.current.backdropMode) {
      // Shift Earth slightly right so left 35-40% stays calm for title typography
      camera.position.set(-1.35, 1.4, 6.2);
    } else {
      camera.position.set(0, 2.2, 6.4);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 3.2;
    controls.maxDistance = 12;
    controls.enabled = !propsRef.current.backdropMode;
    if (propsRef.current.backdropMode) {
      controls.target.set(-1.1, 0, 0);
    }

    // Lighting: warm sun key + cool space fill
    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.45);
    scene.add(hemi);
    const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sunLight.position.copy(_sunDir).multiplyScalar(15);
    scene.add(sunLight);

    // Instanced starfield
    const starCount = 360;
    const starGeo = new THREE.SphereGeometry(0.03, 5, 5);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const stars = new THREE.InstancedMesh(starGeo, starMat, starCount);
    for (let i = 0; i < starCount; i++) {
      const r = 24 + (i % 15) * 1.4;
      const theta = i * 2.39996;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / starCount);
      _dummy.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
      );
      const s = 0.6 + (i % 4) * 0.35;
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      stars.setMatrixAt(i, _dummy.matrix);
    }
    stars.computeBoundingSphere();
    scene.add(stars);

    // Planet Globe Group (rotates slightly for Earth spin)
    const EARTH_R = 1.9;
    const planetGroup = new THREE.Group();
    scene.add(planetGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { dayTex, nightTex, cloudTex } = createEarthTextures(maxAniso);
    const { dayTex: moonTex } = createMoonTextures(maxAniso);
    const { dayTex: marsTex } = createMarsTextures(maxAniso);

    const earthMat = new THREE.MeshStandardMaterial({
      map: dayTex,
      emissiveMap: nightTex,
      emissive: new THREE.Color(0xfbbf24),
      emissiveIntensity: 0.32,
      roughness: 0.72,
      metalness: 0.08,
    });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 48, 36), earthMat);
    planetGroup.add(earthMesh);

    const cloudMesh = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_R * 1.015, 40, 28),
      new THREE.MeshStandardMaterial({
        map: cloudTex,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        roughness: 0.9,
      }),
    );
    planetGroup.add(cloudMesh);

    // Atmosphere Fresnel rim glow
    const atmosMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(0x38bdf8) },
        glowStrength: { value: 0.65 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        uniform float glowStrength;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        void main() {
          float fresnel = pow(1.0 - max(0.0, dot(vNormal, normalize(vViewPos))), 3.2);
          gl_FragColor = vec4(glowColor, fresnel * glowStrength);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.08, 40, 28), atmosMat);
    scene.add(atmosMesh);

    let lastBodyMode = '';
    const applyBodyVisuals = (orbitId: OrbitId) => {
      const bodyMode = orbitId === 'LUNAR' ? 'moon' : orbitId === 'MARS' ? 'mars' : 'earth';
      if (bodyMode === lastBodyMode) return;
      lastBodyMode = bodyMode;

      if (bodyMode === 'moon') {
        earthMat.map = moonTex;
        earthMat.emissiveMap = null;
        earthMat.emissiveIntensity = 0;
        earthMat.roughness = 0.92;
        earthMat.needsUpdate = true;
        cloudMesh.visible = false;
        atmosMat.uniforms.glowColor.value.setHex(0xcbd5e1);
        atmosMat.uniforms.glowStrength.value = 0.18;
      } else if (bodyMode === 'mars') {
        earthMat.map = marsTex;
        earthMat.emissiveMap = null;
        earthMat.emissiveIntensity = 0;
        earthMat.roughness = 0.86;
        earthMat.needsUpdate = true;
        cloudMesh.visible = false;
        atmosMat.uniforms.glowColor.value.setHex(0xf97316);
        atmosMat.uniforms.glowStrength.value = 0.42;
      } else {
        earthMat.map = dayTex;
        earthMat.emissiveMap = nightTex;
        earthMat.emissiveIntensity = 0.32;
        earthMat.roughness = 0.72;
        earthMat.needsUpdate = true;
        cloudMesh.visible = true;
        atmosMat.uniforms.glowColor.value.setHex(0x38bdf8);
        atmosMat.uniforms.glowStrength.value = 0.65;
      }
    };
    applyBodyVisuals(propsRef.current.orbitId);

    // Hotspot Beacons & Ground Stations attached to planetGroup
    const beaconGroup = new THREE.Group();
    planetGroup.add(beaconGroup);
    const hotspotBeacons: Array<{
      id: string;
      localDir: THREE.Vector3;
      ring: THREE.Mesh;
      pin: THREE.Mesh;
    }> = [];

    const buildHotspotBeacons = () => {
      disposeObject3D(beaconGroup);
      beaconGroup.clear();
      hotspotBeacons.length = 0;

      propsRef.current.hotspots.forEach((hs) => {
        const pos = latLonToVector3(hs.lat, hs.lon, EARTH_R * 1.015, new THREE.Vector3());
        const localDir = pos.clone().normalize();
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), localDir);

        const pin = new THREE.Mesh(
          new THREE.ConeGeometry(0.048, 0.15, 10),
          new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
        );
        pin.position.copy(localDir).multiplyScalar(EARTH_R * 1.06);
        pin.quaternion.copy(quat);
        beaconGroup.add(pin);

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.06, 0.1, 24),
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.88,
          }),
        );
        ring.position.copy(pos);
        ring.lookAt(localDir.clone().multiplyScalar(10));
        beaconGroup.add(ring);

        hotspotBeacons.push({ id: hs.id, localDir, ring, pin });
      });
    };

    rebuildHotspotsRef.current = buildHotspotBeacons;
    buildHotspotBeacons();

    const stationMarkers: Array<{ id: string; localDir: THREE.Vector3 }> = [];
    GROUND_STATIONS.forEach((gs) => {
      const pos = latLonToVector3(gs.lat, gs.lon, EARTH_R * 1.015, new THREE.Vector3());
      const localDir = pos.clone().normalize();
      const dish = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.015, 0.08, 12),
        new THREE.MeshBasicMaterial({ color: 0x10b981 }),
      );
      dish.position.copy(localDir).multiplyScalar(EARTH_R * 1.04);
      dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localDir);
      planetGroup.add(dish);
      stationMarkers.push({ id: gs.id, localDir });
    });

    // Orbiting Satellite Hero Group (composite multi-part)
    const satGroup = new THREE.Group();
    const satBus = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.14, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xd4a438, metalness: 0.88, roughness: 0.25 }),
    );
    satGroup.add(satBus);
    const satSolarMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      metalness: 0.5,
      roughness: 0.25,
    });
    [-1, 1].forEach((side) => {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.14), satSolarMat);
      wing.position.set(side * 0.24, 0, 0);
      satGroup.add(wing);
    });
    const satDish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.015, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }),
    );
    satDish.position.set(0, 0.1, 0);
    satGroup.add(satDish);
    scene.add(satGroup);

    // Sensor Swath Cone pointing from satellite to Earth center
    const swathMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const swathCone = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1, 24, 1, true), swathMat);
    scene.add(swathCone);

    // Downlink Beam line
    const beamGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const beamMat = new THREE.LineBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 });
    const beamLine = new THREE.Line(beamGeo, beamMat);
    beamLine.visible = false;
    scene.add(beamLine);

    // Orbit Track Ring
    const orbitRingGeo = new THREE.TorusGeometry(2.65, 0.008, 8, 128);
    const orbitRingMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.35,
    });
    const orbitRing = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    scene.add(orbitRing);

    let rafId = 0;
    let disposed = false;
    let orbitAngle = 0.6;
    let lastStatusEmit = 0;
    const clock = new THREE.Clock();

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const s = propsRef.current;
      applyBodyVisuals(s.orbitId);

      controls.update();

      // Rotate planet slowly
      const earthSpinRate = s.backdropMode ? 0.04 : 0.065 * s.speedMultiplier;
      planetGroup.rotation.y += dt * earthSpinRate;
      cloudMesh.rotation.y += dt * 0.015;

      // Orbit geometry by orbitId (GEO uses inclined figure-8 drift so high-latitude targets & stations are reachable)
      const orbitRadius = s.orbitId === 'GEO' ? 3.55 : s.orbitId === 'SSO' ? 2.75 : s.orbitId === 'LUNAR' ? 2.48 : 2.58;
      const inclination = s.orbitId === 'SSO' || s.orbitId === 'LUNAR' ? 1.38 : s.orbitId === 'GEO' ? 0.38 : 0.42;
      const orbitSpeed =
        (s.orbitId === 'GEO' ? 0.24 : s.orbitId === 'SSO' ? 0.46 : 0.56) *
        (s.backdropMode ? 0.65 : s.speedMultiplier);

      orbitAngle += dt * orbitSpeed;
      orbitRing.scale.setScalar(orbitRadius / 2.65);
      orbitRing.rotation.set(Math.PI / 2 - inclination, 0, 0);

      // Compute satellite 3D position + orbital tangent velocity for cross-track slew aiming
      const cx = Math.cos(orbitAngle) * orbitRadius;
      const cz = Math.sin(orbitAngle) * orbitRadius;
      _satPos.set(
        cx,
        Math.sin(orbitAngle) * orbitRadius * Math.sin(inclination),
        cz * Math.cos(inclination),
      );
      _velDir
        .set(
          -Math.sin(orbitAngle),
          Math.cos(orbitAngle) * Math.sin(inclination),
          Math.cos(orbitAngle) * Math.cos(inclination),
        )
        .normalize();

      satGroup.position.copy(_satPos);
      satGroup.lookAt(0, 0, 0);

      // Cross-track direction perpendicular to nadir and orbital track
      _satDir.copy(_satPos).normalize();
      _crossDir.crossVectors(_velDir, _satDir).normalize();
      const slewRad = ((s.swathSlewDeg || 0) * Math.PI) / 180;
      _aimDir.copy(_satDir).applyAxisAngle(_velDir, slewRad * 1.35).normalize();

      // Swath cone aimed from satellite toward slewed sub-track point on Earth surface
      _aimPoint.copy(_aimDir).multiplyScalar(EARTH_R * 0.99);
      const beamVec = _targetPos.copy(_satPos).sub(_aimPoint);
      const coneLen = Math.max(0.25, beamVec.length());
      const beamDir = beamVec.normalize();
      swathCone.position.copy(_aimPoint).addScaledVector(beamDir, coneLen * 0.5);
      swathCone.scale.set(s.orbitId === 'GEO' ? 1.55 : 0.96, coneLen, s.orbitId === 'GEO' ? 1.55 : 0.96);
      swathCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDir);

      // Pulse swath opacity when scanning
      const pulseAge = (performance.now() - s.scanningPulse) / 1000;
      if (pulseAge >= 0 && pulseAge < 0.7) {
        swathMat.opacity = 0.55 * (1 - pulseAge / 0.7) + 0.18;
        swathMat.color.setHex(0xfbbf24);
      } else {
        swathMat.opacity = 0.24;
        swathMat.color.setHex(0x22d3ee);
      }

      // Check hotspot & ground station alignment (hotspots use aimed beam _aimDir!)
      let activeHotspotId: string | null = null;
      let activeStationId: string | null = null;
      let hasStationTarget = false;

      hotspotBeacons.forEach((b) => {
        const isScanned = s.scannedIds.includes(b.id);
        (b.pin.material as THREE.MeshBasicMaterial).color.setHex(isScanned ? 0x10b981 : 0xf59e0b);
        (b.ring.material as THREE.MeshBasicMaterial).color.setHex(isScanned ? 0x10b981 : 0xf59e0b);
        b.ring.scale.setScalar(isScanned ? 0.85 : 1 + 0.18 * Math.sin(elapsed * 4));

        _markerDir.copy(b.localDir).applyEuler(planetGroup.rotation);
        const dot = _markerDir.dot(_aimDir);
        const threshold = s.orbitId === 'GEO' ? 0.68 : 0.88;
        if (dot > threshold && !isScanned && !activeHotspotId) {
          activeHotspotId = b.id;
          (b.ring.material as THREE.MeshBasicMaterial).color.setHex(0x22d3ee);
        }
      });

      stationMarkers.forEach((st) => {
        _markerDir.copy(st.localDir).applyEuler(planetGroup.rotation);
        const dot = _markerDir.dot(_satDir);
        const threshold = s.orbitId === 'GEO' ? 0.48 : 0.78;
        if (dot > threshold && !activeStationId) {
          activeStationId = st.id;
          _targetPos.copy(_markerDir).multiplyScalar(EARTH_R * 1.03);
          hasStationTarget = true;
        }
      });

      if (s.downlinkActive && hasStationTarget) {
        beamLine.visible = true;
        const posAttr = beamLine.geometry.getAttribute('position') as THREE.BufferAttribute;
        posAttr.setXYZ(0, _satPos.x, _satPos.y, _satPos.z);
        posAttr.setXYZ(1, _targetPos.x, _targetPos.y, _targetPos.z);
        posAttr.needsUpdate = true;
      } else {
        beamLine.visible = false;
      }

      // Emit sub-satellite telemetry at ~8Hz
      if (s.onStatusUpdate && elapsed - lastStatusEmit > 0.12) {
        lastStatusEmit = elapsed;
        // Convert world _satDir back into rotating planet local frame for lat/lon readout
        _markerDir.copy(_satDir).applyAxisAngle(new THREE.Vector3(0, 1, 0), -planetGroup.rotation.y);
        const lat = 90 - Math.acos(clampNum(_markerDir.y, -1, 1)) * (180 / Math.PI);
        const lon = Math.atan2(_markerDir.z, -_markerDir.x) * (180 / Math.PI) - 180;
        const normLon = ((lon + 540) % 360) - 180;
        const inSunlight = _satDir.dot(_sunDir) > -0.22;

        s.onStatusUpdate({
          lat: Math.round(lat * 10) / 10,
          lon: Math.round(normLon * 10) / 10,
          inSunlight,
          activeHotspotId,
          activeStationId,
        });
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
      const rw = container.clientWidth || window.innerWidth;
      const rh = container.clientHeight || window.innerHeight;
      camera.aspect = rw / rh;
      camera.updateProjectionMatrix();
      renderer.setSize(rw, rh);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
      clearTimeout(rafId);
      controls.dispose();
      disposeObject3D(scene);
      dayTex.dispose();
      nightTex.dispose();
      cloudTex.dispose();
      moonTex.dispose();
      marsTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    rebuildHotspotsRef.current?.();
  }, [hotspots]);

  return (
    <div
      ref={mountRef}
      className={`w-full h-full touch-none select-none ${backdropMode ? '' : 'cursor-grab active:cursor-grabbing'} ${className}`}
      aria-label="3D Earth and orbital sensor globe"
    />
  );
}

function clampNum(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
