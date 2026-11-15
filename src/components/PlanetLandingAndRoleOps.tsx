import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Compass,
  Flame,
  FlaskConical,
  MapPin,
  Rocket,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { soundEngine } from '../engine/audio';
import { clamp } from '../engine/physics';
import { OrbitId } from '../types/mission';
import { CommanderBubble } from './CommanderBubble';

export type PlanetRoleId = 'engineer' | 'scientist' | 'explorer';

interface LandingZone {
  id: string;
  name: string;
  xPct: number;
  yPct: number;
  slopeDeg: number;
  hazardLevel: 'Low' | 'Medium' | 'High';
  scienceValue: string;
  safe: boolean;
  note: string;
}

interface RoleTask {
  id: string;
  label: string;
  detail: string;
  xp: number;
}

const ROLE_DEFS: Array<{
  id: PlanetRoleId;
  title: string;
  tagline: string;
  miniGameName: string;
  tasks: RoleTask[];
}> = [
  {
    id: 'explorer',
    title: 'Explorer / Scout',
    tagline: 'Drive a 6-wheel rover around craters to scan terrain & collect crystals.',
    miniGameName: 'Rover Expedition (WASD / D-Pad)',
    tasks: [
      {
        id: 'exp-map',
        label: 'Map Craters & Ridge Terrain',
        detail: 'Drive to the glowing Cyan Survey Beacon on the terrain map.',
        xp: 20,
      },
      {
        id: 'exp-collect',
        label: 'Collect Rare Rock & Ore Samples',
        detail: 'Roll over the Amber Ore Crystal cluster to scoop samples.',
        xp: 20,
      },
      {
        id: 'exp-path',
        label: 'Mark Safe Rover Supply Path',
        detail: 'Reach the Emerald Relay Flag while steering clear of red craters.',
        xp: 25,
      },
    ],
  },
  {
    id: 'scientist',
    title: 'Scientist',
    tagline: 'Sweep underground radar across strata and time core drills in the green zone.',
    miniGameName: 'Radar Sweep & Core Drill',
    tasks: [
      {
        id: 'sci-scan',
        label: 'Scan Soil & Atmosphere Chemistry',
        detail: 'Sweep boom to Target #1 (left strata) and lock drill pressure in green.',
        xp: 20,
      },
      {
        id: 'sci-ice',
        label: 'Find Underground Water-Ice Resources',
        detail: 'Sweep boom to Target #2 (center ice lens) and extract core cleanly.',
        xp: 20,
      },
      {
        id: 'sci-bio',
        label: 'Study Microscopic Alien Life Signs',
        detail: 'Sweep boom to Target #3 (right ancient pocket) and extract core.',
        xp: 25,
      },
    ],
  },
  {
    id: 'engineer',
    title: 'Engineer',
    tagline: 'Lock dome seals, aim solar wings at the sun, and stabilize O2 pressure.',
    miniGameName: '3-Step Base Hardware Ops',
    tasks: [
      {
        id: 'eng-base',
        label: 'Build Pressurized Base Dome',
        detail: 'Press [Space] or Lock Seal when the latch needle enters the green bracket.',
        xp: 20,
      },
      {
        id: 'eng-power',
        label: 'Set Up Solar Power Grid',
        detail: 'Aim the Solar Wing angle to match the sunbeam (>= 92%) until locked.',
        xp: 20,
      },
      {
        id: 'eng-o2',
        label: 'Start Oxygen (O2) Generator',
        detail: 'Hold Pump O2 to keep tank pressure inside the green 65–85 kPa band.',
        xp: 25,
      },
    ],
  },
];

function getLandingZonesForDest(dest: OrbitId): LandingZone[] {
  if (dest === 'MARS') {
    return [
      {
        id: 'mars-storm',
        name: 'Valles Dust Canyon',
        xPct: 24,
        yPct: 36,
        slopeDeg: 28,
        hazardLevel: 'High',
        scienceValue: 'Medium',
        safe: false,
        note: 'Steep canyon walls and swirling dust storms—risky touchdown!',
      },
      {
        id: 'mars-jezero',
        name: 'Jezero Ancient Lakebed',
        xPct: 52,
        yPct: 58,
        slopeDeg: 3,
        hazardLevel: 'Low',
        scienceValue: 'Very High (Ancient Water)',
        safe: true,
        note: 'Flat river delta where NASA Perseverance searches for ancient life!',
      },
      {
        id: 'mars-rocks',
        name: 'Olympus Boulder Slope',
        xPct: 78,
        yPct: 32,
        slopeDeg: 22,
        hazardLevel: 'High',
        scienceValue: 'Low',
        safe: false,
        note: 'Jagged lava boulders could tip over the landing legs.',
      },
      {
        id: 'mars-polar',
        name: 'Arcadia Ice Plain',
        xPct: 35,
        yPct: 75,
        slopeDeg: 5,
        hazardLevel: 'Medium',
        scienceValue: 'High (Shallow Water Ice)',
        safe: true,
        note: 'Smooth icy ground with buried water-ice for making rocket fuel!',
      },
    ];
  }
  if (dest === 'LUNAR') {
    return [
      {
        id: 'moon-crater',
        name: 'Shackleton Rim Plain',
        xPct: 48,
        yPct: 52,
        slopeDeg: 4,
        hazardLevel: 'Low',
        scienceValue: 'Very High (Sunlight + Ice)',
        safe: true,
        note: 'Flat sunlit ridge right beside water-ice craters—ideal Artemis site!',
      },
      {
        id: 'moon-pit',
        name: 'Dark Crater Floor',
        xPct: 23,
        yPct: 68,
        slopeDeg: 31,
        hazardLevel: 'High',
        scienceValue: 'High',
        safe: false,
        note: 'Zero sunlight (-230°C) and steep crater walls!',
      },
      {
        id: 'moon-boulder',
        name: 'Tycho Ejecta Field',
        xPct: 76,
        yPct: 42,
        slopeDeg: 19,
        hazardLevel: 'High',
        scienceValue: 'Medium',
        safe: false,
        note: 'Scattered sharp crater rocks make landing unsafe.',
      },
      {
        id: 'moon-mare',
        name: 'Mare Tranquillitatis Pad',
        xPct: 68,
        yPct: 74,
        slopeDeg: 2,
        hazardLevel: 'Low',
        scienceValue: 'High',
        safe: true,
        note: 'Smooth ancient lava sea—safe and steady like Apollo 11!',
      },
    ];
  }
  return [
    {
      id: 'orb-dock',
      name: 'Forward Safe Docking Port',
      xPct: 50,
      yPct: 48,
      slopeDeg: 1,
      hazardLevel: 'Low',
      scienceValue: 'Very High (Zero-G Lab)',
      safe: true,
      note: 'Clear approach corridor aligned with solar panels and Earth radio!',
    },
    {
      id: 'orb-debris',
      name: 'Micro-Debris Drift Zone',
      xPct: 24,
      yPct: 35,
      slopeDeg: 15,
      hazardLevel: 'High',
      scienceValue: 'Low',
      safe: false,
      note: 'Floating paint flecks and old bolt fragments—avoid!',
    },
    {
      id: 'orb-plume',
      name: 'Station Thruster Plume Side',
      xPct: 78,
      yPct: 62,
      slopeDeg: 18,
      hazardLevel: 'High',
      scienceValue: 'Low',
      safe: false,
      note: 'Active attitude thrusters fire here—unsafe to dock!',
    },
    {
      id: 'orb-platform',
      name: 'Science Truss Platform',
      xPct: 35,
      yPct: 72,
      slopeDeg: 2,
      hazardLevel: 'Low',
      scienceValue: 'High',
      safe: true,
      note: 'Stable orbital experiment deck with clear Earth view!',
    },
  ];
}

interface PlanetLandingAndRoleOpsProps {
  destination: OrbitId;
  destName: string;
  solarUpgradeLevel?: number;
  onAwardXp: (xp: number, reason: string) => void;
  onCompleteReturnToEarth: (roleUsed: PlanetRoleId, landingSiteName: string, bonusXp: number) => void;
}

export function PlanetLandingAndRoleOps({
  destination,
  destName,
  solarUpgradeLevel = 0,
  onAwardXp,
  onCompleteReturnToEarth,
}: PlanetLandingAndRoleOpsProps) {
  const maxDescentFuel = 100 + solarUpgradeLevel * 8;
  const zones = getLandingZonesForDest(destination);
  const [step, setStep] = useState<'landing' | 'descent' | 'role' | 'return'>('landing');
  const [selectedZoneId, setSelectedZoneId] = useState<string>(zones[0].id);
  const [scannedZoneIds, setScannedZoneIds] = useState<string[]>([zones[0].id]);
  const [warningMsg, setWarningMsg] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<PlanetRoleId | null>(null);
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const completedTasksRef = useRef<Set<string>>(new Set());
  const returnTimerRef = useRef<number | null>(null);
  const [earnedOpsXp, setEarnedOpsXp] = useState(0);

  // Powered Lander Descent HUD state
  const [descentHud, setDescentHud] = useState({
    altM: 100,
    vSpeed: 0,
    fuelPct: 100,
    onPad: false,
    crashedReason: null as string | null,
    landed: false,
  });

  // Role Mini-Games interactive React HUD states
  const [sciBoomX, setSciBoomX] = useState(20); // 0..100
  const [sciNeedlePct, setSciNeedlePct] = useState(50);
  const [sciSignalPct, setSciSignalPct] = useState(15);
  const [sciActiveTargetIdx, setSciActiveTargetIdx] = useState(0);

  const [engLatchPct, setEngLatchPct] = useState(15);
  const [engPanelAngle, setEngPanelAngle] = useState(25);
  const [engSunAngle, setEngSunAngle] = useState(64);
  const [engSunLockSec, setEngSunLockSec] = useState(0);
  const [engO2Kpa, setEngO2Kpa] = useState(42);
  const [engO2HoldSec, setEngO2HoldSec] = useState(0);
  const [roleFeedback, setRoleFeedback] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sciBoomXRef = useRef(20);
  sciBoomXRef.current = sciBoomX;
  const engPanelAngleRef = useRef(25);
  engPanelAngleRef.current = engPanelAngle;
  const heldKeysRef = useRef<Record<string, boolean>>({});
  const touchHoldRef = useRef<{
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
    pump: boolean;
  }>({ up: false, down: false, left: false, right: false, pump: false });

  // Descent physics ref
  const descentRef = useRef({
    x: 0.35, // 0..1 normalized canvas width
    y: 0.14, // 0.14 (top) -> 0.84 (ground)
    vx: 0.04,
    vy: 0.02,
    fuel: maxDescentFuel,
    padX: 0.62,
    padHalfW: 0.1,
    finished: false,
    crashedReason: null as string | null,
    landed: false,
  });

  // Rover mini-game ref (Explorer)
  const roverRef = useRef({
    x: 0.16,
    y: 0.78,
    headingRad: -0.4,
    bumpFlash: 0,
    nodes: [
      { id: 'exp-map', label: 'SURVEY', x: 0.28, y: 0.24, color: '#22d3ee', collected: false },
      { id: 'exp-collect', label: 'ORE', x: 0.66, y: 0.32, color: '#fbbf24', collected: false },
      { id: 'exp-path', label: 'RELAY', x: 0.82, y: 0.74, color: '#10b981', collected: false },
    ],
    hazards: [
      { x: 0.44, y: 0.5, r: 0.09 },
      { x: 0.72, y: 0.56, r: 0.08 },
      { x: 0.24, y: 0.52, r: 0.07 },
    ],
  });

  // Scientist / Engineer dynamic refs
  const sciTargets = [24, 52, 79];
  const sciDrillRef = useRef({ needle: 20, dir: 1 });
  const engRef = useRef({ latch: 20, latchDir: 1, sunTarget: 64, o2: 42, sunLock: 0, o2Hold: 0 });

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || zones[0];
  const activeRoleDef = ROLE_DEFS.find((r) => r.id === selectedRole) || null;
  const engStageIdx = completedTaskIds.length; // 0, 1, 2

  useEffect(() => {
    return () => {
      if (returnTimerRef.current !== null) {
        window.clearTimeout(returnTimerRef.current);
      }
    };
  }, []);

  const completeTaskById = useCallback(
    (taskId: string) => {
      if (!activeRoleDef) return;
      if (completedTasksRef.current.has(taskId)) return;
      const task = activeRoleDef.tasks.find((t) => t.id === taskId);
      if (!task) return;
      completedTasksRef.current.add(taskId);
      const next = Array.from(completedTasksRef.current);
      setCompletedTaskIds(next);
      soundEngine.playSfx('success');
      setEarnedOpsXp((x) => x + task.xp);
      onAwardXp(task.xp, task.label);
      setRoleFeedback(`Completed: ${task.label} (+${task.xp} EXP)!`);
      if (activeRoleDef.tasks.every((t) => next.includes(t.id))) {
        if (returnTimerRef.current !== null) {
          window.clearTimeout(returnTimerRef.current);
        }
        returnTimerRef.current = window.setTimeout(() => {
          returnTimerRef.current = null;
          setStep('return');
        }, 650);
      }
    },
    [activeRoleDef, onAwardXp],
  );

  const resetDescentGame = useCallback(() => {
    soundEngine.playSfx('click');
    const padX = 0.34 + Math.random() * 0.38;
    descentRef.current = {
      x: 0.22 + Math.random() * 0.16,
      y: 0.13,
      vx: 0.03,
      vy: 0.01,
      fuel: maxDescentFuel,
      padX,
      padHalfW: 0.105,
      finished: false,
      crashedReason: null,
      landed: false,
    };
    setDescentHud({
      altM: 100,
      vSpeed: 0,
      fuelPct: maxDescentFuel,
      onPad: false,
      crashedReason: null,
      landed: false,
    });
  }, [maxDescentFuel]);

  const resetRoleMiniGame = useCallback((roleId: PlanetRoleId) => {
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    completedTasksRef.current.clear();
    setCompletedTaskIds([]);
    setRoleFeedback(null);
    if (roleId === 'explorer') {
      roverRef.current = {
        x: 0.16,
        y: 0.78,
        headingRad: -0.4,
        bumpFlash: 0,
        nodes: [
          { id: 'exp-map', label: 'SURVEY', x: 0.28, y: 0.24, color: '#22d3ee', collected: false },
          { id: 'exp-collect', label: 'ORE', x: 0.66, y: 0.32, color: '#fbbf24', collected: false },
          { id: 'exp-path', label: 'RELAY', x: 0.82, y: 0.74, color: '#10b981', collected: false },
        ],
        hazards: [
          { x: 0.44, y: 0.5, r: 0.09 },
          { x: 0.72, y: 0.56, r: 0.08 },
          { x: 0.24, y: 0.52, r: 0.07 },
        ],
      };
    } else if (roleId === 'scientist') {
      setSciBoomX(12);
      setSciActiveTargetIdx(0);
      sciDrillRef.current = { needle: 15, dir: 1 };
    } else {
      engRef.current = { latch: 15, latchDir: 1, sunTarget: 68, o2: 42, sunLock: 0, o2Hold: 0 };
      setEngLatchPct(15);
      setEngPanelAngle(25);
      setEngSunAngle(68);
      setEngSunLockSec(0);
      setEngO2Kpa(42);
      setEngO2HoldSec(0);
    }
  }, []);

  // Scientist Drill Extraction action
  const handleScientistExtract = useCallback(() => {
    if (selectedRole !== 'scientist' || sciActiveTargetIdx >= sciTargets.length) return;
    const targetX = sciTargets[sciActiveTargetIdx];
    const dist = Math.abs(sciBoomX - targetX);
    if (dist > 8) {
      soundEngine.playSfx('warning');
      setRoleFeedback('Sweep the Radar Boom onto the glowing strata pulse (>= 85% Signal) first!');
      return;
    }
    const needle = sciDrillRef.current.needle;
    if (needle < 36 || needle > 64) {
      soundEngine.playSfx('warning');
      setRoleFeedback('Missed green drill zone! Wait for the calibration bar to enter 36–64%.');
      return;
    }
    const task = ROLE_DEFS.find((r) => r.id === 'scientist')?.tasks[sciActiveTargetIdx];
    if (task) {
      completeTaskById(task.id);
      setSciActiveTargetIdx((i) => Math.min(sciTargets.length, i + 1));
    }
  }, [selectedRole, sciActiveTargetIdx, sciBoomX, completeTaskById]);

  // Engineer Task 1 Latch Seal action
  const handleEngineerLockLatch = useCallback(() => {
    if (selectedRole !== 'engineer' || engStageIdx !== 0) return;
    const latch = engRef.current.latch;
    if (latch >= 38 && latch <= 62) {
      completeTaskById('eng-base');
    } else {
      soundEngine.playSfx('warning');
      setRoleFeedback('Latch needle outside green bracket (38–62%)! Watch the sweep and tap again.');
    }
  }, [selectedRole, engStageIdx, completeTaskById]);

  // Global keyboard controls for Descent & Role Mini-Games
  useEffect(() => {
    if (step !== 'descent' && step !== 'role') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' &&
        (document.activeElement as HTMLInputElement).type === 'range'
      ) {
        // Still allow Space/WASD without blocking sliders unless arrows
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      heldKeysRef.current[e.code] = true;

      if (step === 'descent' && e.code === 'KeyR' && descentRef.current.crashedReason) {
        resetDescentGame();
      } else if (step === 'role' && e.code === 'Space') {
        if (selectedRole === 'scientist') {
          handleScientistExtract();
        } else if (selectedRole === 'engineer' && engStageIdx === 0) {
          handleEngineerLockLatch();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      heldKeysRef.current = {};
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    step,
    selectedRole,
    engStageIdx,
    resetDescentGame,
    handleScientistExtract,
    handleEngineerLockLatch,
  ]);

  // Unified 60fps Canvas Loop for Landing Radar, Powered Descent, and all 3 Role Mini-Games
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();
    let lastReactSync = 0;
    const startTs = lastTs;

    const draw = (now: number) => {
      const dt = Math.min((now - lastTs) / 1000, 0.05);
      lastTs = now;
      const t = (now - startTs) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth || 640;
      const ch = canvas.clientHeight || 340;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      const held = heldKeysRef.current;
      const th = touchHoldRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background gradient per destination
      const bg = ctx.createLinearGradient(0, 0, 0, ch);
      if (destination === 'MARS') {
        bg.addColorStop(0, '#220e08');
        bg.addColorStop(1, '#582212');
      } else if (destination === 'LUNAR') {
        bg.addColorStop(0, '#0c1220');
        bg.addColorStop(1, '#2c384b');
      } else {
        bg.addColorStop(0, '#040a18');
        bg.addColorStop(1, '#0b223f');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      // Subtle topographic grid
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.1)';
      ctx.lineWidth = 1;
      for (let gx = 40; gx < cw; gx += 55) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, ch);
        ctx.stroke();
      }
      for (let gy = 40; gy < ch; gy += 55) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(cw, gy);
        ctx.stroke();
      }

      // === MODE 1: RADAR LANDING PIN SEARCH ===
      if (step === 'landing') {
        const terrainSpots = [
          { x: cw * 0.22, y: ch * 0.35, r: 44 },
          { x: cw * 0.78, y: ch * 0.32, r: 52 },
          { x: cw * 0.52, y: ch * 0.58, r: 62 },
          { x: cw * 0.36, y: ch * 0.75, r: 38 },
        ];
        terrainSpots.forEach((sp, i) => {
          ctx.strokeStyle =
            destination === 'MARS'
              ? 'rgba(251, 146, 60, 0.25)'
              : destination === 'LUNAR'
                ? 'rgba(203, 213, 225, 0.25)'
                : 'rgba(56, 189, 248, 0.25)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(sp.x, sp.y, sp.r, sp.r * 0.62, i * 0.3, 0, Math.PI * 2);
          ctx.stroke();
        });

        const sweepX = ((t * 115) % (cw + 80)) - 40;
        const grad = ctx.createLinearGradient(sweepX - 35, 0, sweepX + 10, 0);
        grad.addColorStop(0, 'rgba(34, 211, 238, 0)');
        grad.addColorStop(1, 'rgba(34, 211, 238, 0.22)');
        ctx.fillStyle = grad;
        ctx.fillRect(sweepX - 35, 0, 45, ch);
      }

      // === MODE 2: POWERED LANDER DESCENT MINI-GAME ===
      if (step === 'descent') {
        const d = descentRef.current;
        const groundY = ch * 0.86;
        const thrustUp =
          (held['KeyW'] || held['ArrowUp'] || held['Space'] || th.up) && d.fuel > 0;
        const rcsLeft = (held['KeyA'] || held['ArrowLeft'] || th.left) && d.fuel > 0;
        const rcsRight = (held['KeyD'] || held['ArrowRight'] || th.right) && d.fuel > 0;

        if (!d.finished) {
          const gravity = destination === 'MARS' ? 0.19 : destination === 'LUNAR' ? 0.14 : 0.11;
          d.vy += gravity * dt;
          if (thrustUp) {
            d.vy -= 0.36 * dt;
            d.fuel = Math.max(0, d.fuel - 16 * dt);
          }
          if (rcsLeft) {
            d.vx -= 0.32 * dt;
            d.fuel = Math.max(0, d.fuel - 7 * dt);
          }
          if (rcsRight) {
            d.vx += 0.32 * dt;
            d.fuel = Math.max(0, d.fuel - 7 * dt);
          }
          d.vx *= 1 - 0.8 * dt;
          d.x = clamp(d.x + d.vx * dt, 0.06, 0.94);
          d.y += d.vy * dt;

          // Check touchdown at groundY (d.y >= 0.82)
          if (d.y >= 0.82) {
            d.y = 0.82;
            d.finished = true;
            const onPad = Math.abs(d.x - d.padX) <= d.padHalfW;
            const speedMs = d.vy * 28;
            if (!onPad) {
              d.crashedReason = 'Missed the green landing pad! Steer with A / D to land over the pad.';
              soundEngine.playSfx('warning');
            } else if (speedMs > 7.8) {
              d.crashedReason = `Hit too fast (${speedMs.toFixed(1)} m/s)! Hold W / Space before touchdown to keep speed <= 7.5 m/s.`;
              soundEngine.playSfx('warning');
            } else {
              d.landed = true;
              soundEngine.playSfx('success');
              const landingXp = 30;
              setEarnedOpsXp((x) => x + landingXp);
              onAwardXp(landingXp, `Powered Landing at ${selectedZone.name}`);
              window.setTimeout(() => {
                setStep('role');
              }, 850);
            }
          }
        }

        // Stars in sky
        for (let i = 0; i < 28; i++) {
          const sx = ((i * 97) % 100) * 0.01 * cw;
          const sy = ((i * 53) % 62) * 0.01 * ch;
          ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
          ctx.fillRect(sx, sy, 2, 2);
        }

        // Rocky terrain ridges around pad
        ctx.fillStyle =
          destination === 'MARS' ? '#7c2d12' : destination === 'LUNAR' ? '#475569' : '#1e3a8a';
        ctx.beginPath();
        ctx.moveTo(0, ch);
        ctx.lineTo(0, groundY - 12);
        const padLeftX = (d.padX - d.padHalfW) * cw;
        const padRightX = (d.padX + d.padHalfW) * cw;
        ctx.lineTo(padLeftX * 0.5, groundY - 22);
        ctx.lineTo(padLeftX - 8, groundY);
        ctx.lineTo(padRightX + 8, groundY);
        ctx.lineTo((padRightX + cw) * 0.5, groundY - 18);
        ctx.lineTo(cw, groundY - 10);
        ctx.lineTo(cw, ch);
        ctx.closePath();
        ctx.fill();

        // Glowing Green Landing Pad
        ctx.fillStyle = '#10b981';
        ctx.fillRect(padLeftX, groundY - 4, padRightX - padLeftX, 7);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(padLeftX, groundY - 4);
        ctx.lineTo(padLeftX, groundY - 24);
        ctx.moveTo(padRightX, groundY - 4);
        ctx.lineTo(padRightX, groundY - 24);
        ctx.stroke();
        ctx.fillStyle = '#a7f3d0';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SAFE TARGET PAD', d.padX * cw, groundY + 18);

        // Lander Sprite
        const lx = d.x * cw;
        const ly = d.y * ch;
        if (thrustUp && !d.finished) {
          ctx.fillStyle = '#fb923c';
          ctx.beginPath();
          ctx.moveTo(lx - 7, ly + 10);
          ctx.lineTo(lx, ly + 26 + Math.random() * 10);
          ctx.lineTo(lx + 7, ly + 10);
          ctx.closePath();
          ctx.fill();
        }
        if (rcsLeft && !d.finished) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(lx + 11, ly - 5, 9, 4);
        }
        if (rcsRight && !d.finished) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(lx - 20, ly - 5, 9, 4);
        }
        // Lander body & legs
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(lx - 8, ly + 6);
        ctx.lineTo(lx - 15, ly + 14);
        ctx.moveTo(lx + 8, ly + 6);
        ctx.lineTo(lx + 15, ly + 14);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(lx - 9, ly - 10, 18, 17);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(lx - 9, ly - 10);
        ctx.lineTo(lx, ly - 22);
        ctx.lineTo(lx + 9, ly - 10);
        ctx.closePath();
        ctx.fill();

        if (now - lastReactSync > 70) {
          lastReactSync = now;
          setDescentHud({
            altM: Math.max(0, Math.round(((0.82 - d.y) / 0.68) * 100)),
            vSpeed: Number(Math.max(0, d.vy * 28).toFixed(1)),
            fuelPct: Math.round(d.fuel),
            onPad: Math.abs(d.x - d.padX) <= d.padHalfW,
            crashedReason: d.crashedReason,
            landed: d.landed,
          });
        }
      }

      // === MODE 3: CREW ROLE SURFACE MINI-GAMES ===
      if (step === 'role' || step === 'return') {
        // Always draw landed base pad in background unless Explorer Rover fills map
        if (selectedRole === 'explorer' && step === 'role') {
          const rv = roverRef.current;
          // Hazard craters
          rv.hazards.forEach((hz) => {
            const hx = hz.x * cw;
            const hy = hz.y * ch;
            const hr = hz.r * Math.min(cw, ch);
            ctx.fillStyle = 'rgba(244, 63, 94, 0.16)';
            ctx.strokeStyle = 'rgba(251, 113, 133, 0.7)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(hx, hy, hr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fda4af';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('CRATER', hx, hy + 3);
          });

          // Rover movement via WASD / Arrows / Touch D-Pad
          let mx = 0;
          let my = 0;
          if (held['KeyA'] || held['ArrowLeft'] || th.left) mx -= 1;
          if (held['KeyD'] || held['ArrowRight'] || th.right) mx += 1;
          if (held['KeyW'] || held['ArrowUp'] || th.up) my -= 1;
          if (held['KeyS'] || held['ArrowDown'] || th.down) my += 1;

          if (mx !== 0 || my !== 0) {
            const mag = Math.hypot(mx, my);
            rv.x = clamp(rv.x + (mx / mag) * 0.28 * dt, 0.06, 0.94);
            rv.y = clamp(rv.y + (my / mag) * 0.36 * dt, 0.1, 0.9);
            rv.headingRad = Math.atan2(my, mx);
          }
          if (rv.bumpFlash > 0) rv.bumpFlash = Math.max(0, rv.bumpFlash - dt);

          // Hazard bounce
          rv.hazards.forEach((hz) => {
            const dx = rv.x - hz.x;
            const dy = rv.y - hz.y;
            const dist = Math.hypot(dx, dy);
            const minSep = hz.r * 0.78 + 0.03;
            if (dist < minSep && dist > 0.0001) {
              rv.x = clamp(hz.x + (dx / dist) * minSep, 0.06, 0.94);
              rv.y = clamp(hz.y + (dy / dist) * minSep, 0.1, 0.9);
              if (rv.bumpFlash === 0) {
                rv.bumpFlash = 0.6;
                soundEngine.playSfx('warning');
                setRoleFeedback('Steep Crater! Steer the rover around red hazards.');
              }
            }
          });

          // Draw & collect targets
          rv.nodes.forEach((nd) => {
            const nx = nd.x * cw;
            const ny = nd.y * ch;
            if (!nd.collected) {
              const dist = Math.hypot(rv.x - nd.x, rv.y - nd.y);
              if (dist < 0.075) {
                nd.collected = true;
                completeTaskById(nd.id);
              }
            }
            ctx.save();
            ctx.strokeStyle = nd.collected ? '#10b981' : nd.color;
            ctx.fillStyle = nd.collected ? 'rgba(16,185,129,0.2)' : 'rgba(15,23,42,0.75)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(nx, ny, 16 + (nd.collected ? 0 : Math.sin(t * 4) * 2.5), 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = nd.collected ? '#a7f3d0' : '#f8fafc';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(nd.collected ? 'DONE' : nd.label, nx, ny - 22);
            ctx.restore();
          });

          // Draw 6-wheel NASA Rover
          const rx = rv.x * cw;
          const ry = rv.y * ch;
          ctx.save();
          ctx.translate(rx, ry);
          ctx.rotate(rv.headingRad);
          ctx.fillStyle = rv.bumpFlash > 0 ? '#fb7185' : '#334155';
          ctx.fillRect(-14, -12, 7, 5);
          ctx.fillRect(-2, -12, 7, 5);
          ctx.fillRect(10, -12, 7, 5);
          ctx.fillRect(-14, 7, 7, 5);
          ctx.fillRect(-2, 7, 7, 5);
          ctx.fillRect(10, 7, 7, 5);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(-12, -8, 24, 16);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-6, -5, 10, 10);
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(10, -4, 6, 8);
          ctx.restore();
        } else if (selectedRole === 'scientist' && step === 'role') {
          // Subsurface strata cross-section
          const surfY = ch * 0.48;
          ctx.fillStyle = destination === 'MARS' ? '#7c2d12' : '#475569';
          ctx.fillRect(0, surfY, cw, ch - surfY);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
          ctx.fillRect(0, surfY + 46, cw, ch - surfY - 46);

          // Draw 3 buried anomalies
          sciTargets.forEach((txPct, idx) => {
            const ax = (txPct / 100) * cw;
            const ay = surfY + 58 + (idx % 2) * 28;
            const cleared = idx < sciActiveTargetIdx;
            const isCurrent = idx === sciActiveTargetIdx;
            ctx.strokeStyle = cleared ? '#10b981' : isCurrent ? '#22d3ee' : 'rgba(148,163,184,0.35)';
            ctx.fillStyle = cleared
              ? 'rgba(16,185,129,0.25)'
              : isCurrent
                ? 'rgba(34,211,238,0.22)'
                : 'rgba(15,23,42,0.5)';
            ctx.lineWidth = isCurrent ? 2.5 : 1.5;
            ctx.beginPath();
            ctx.arc(ax, ay, isCurrent ? 18 + Math.sin(t * 5) * 3 : 14, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = cleared ? '#a7f3d0' : '#e2e8f0';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(cleared ? 'CORE OK' : `TARGET #${idx + 1}`, ax, ay + 32);
          });

          // Move boom via A/D/Arrows
          if (held['KeyA'] || held['ArrowLeft'] || th.left) {
            const nx = clamp(sciBoomXRef.current - 44 * dt, 5, 95);
            sciBoomXRef.current = nx;
            setSciBoomX(nx);
          }
          if (held['KeyD'] || held['ArrowRight'] || th.right) {
            const nx = clamp(sciBoomXRef.current + 44 * dt, 5, 95);
            sciBoomXRef.current = nx;
            setSciBoomX(nx);
          }

          // Oscillate drill pressure needle
          const sd = sciDrillRef.current;
          sd.needle += sd.dir * 68 * dt;
          if (sd.needle >= 96) {
            sd.needle = 96;
            sd.dir = -1;
          } else if (sd.needle <= 4) {
            sd.needle = 4;
            sd.dir = 1;
          }

          // Draw Science Rover & radar cone at sciBoomXRef.current
          const bx = (sciBoomXRef.current / 100) * cw;
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(bx - 18, surfY - 22, 36, 16);
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(bx - 5, surfY - 34, 10, 12);
          ctx.fillStyle = 'rgba(34, 211, 238, 0.2)';
          ctx.beginPath();
          ctx.moveTo(bx - 6, surfY);
          ctx.lineTo(bx - 32, surfY + 115);
          ctx.lineTo(bx + 32, surfY + 115);
          ctx.lineTo(bx + 6, surfY);
          ctx.closePath();
          ctx.fill();

          if (now - lastReactSync > 60) {
            lastReactSync = now;
            const targetX = sciTargets[Math.min(sciActiveTargetIdx, sciTargets.length - 1)];
            const sig = Math.round(clamp(100 - Math.abs(sciBoomXRef.current - targetX) * 2.5, 5, 100));
            setSciSignalPct(sig);
            setSciNeedlePct(Math.round(sd.needle));
          }
        } else {
          // Engineer Base Hardware Ops OR Landing Return Showcase
          const lx = cw * 0.5;
          const ly = ch * 0.62;
          const eg = engRef.current;

          if (selectedRole === 'engineer' && step === 'role') {
            if (engStageIdx === 0) {
              eg.latch += eg.latchDir * 72 * dt;
              if (eg.latch >= 95) {
                eg.latch = 95;
                eg.latchDir = -1;
              } else if (eg.latch <= 5) {
                eg.latch = 5;
                eg.latchDir = 1;
              }
            } else if (engStageIdx === 1) {
              eg.sunTarget = 50 + Math.sin(t * 0.75) * 32;
              if (held['KeyA'] || held['ArrowLeft'] || th.left) {
                const na = clamp(engPanelAngleRef.current - 55 * dt, 0, 100);
                engPanelAngleRef.current = na;
                setEngPanelAngle(na);
              }
              if (held['KeyD'] || held['ArrowRight'] || th.right) {
                const na = clamp(engPanelAngleRef.current + 55 * dt, 0, 100);
                engPanelAngleRef.current = na;
                setEngPanelAngle(na);
              }
              if (Math.abs(engPanelAngleRef.current - eg.sunTarget) <= 9) {
                eg.sunLock += dt;
                if (eg.sunLock >= 0.9) {
                  completeTaskById('eng-power');
                }
              } else {
                eg.sunLock = Math.max(0, eg.sunLock - dt * 0.6);
              }
            } else if (engStageIdx === 2) {
              const pumping = held['KeyW'] || held['ArrowUp'] || held['Space'] || th.pump;
              eg.o2 = clamp(eg.o2 + (pumping ? 32 : -18) * dt, 10, 100);
              if (eg.o2 >= 65 && eg.o2 <= 85) {
                eg.o2Hold += dt;
                if (eg.o2Hold >= 1.8) {
                  completeTaskById('eng-o2');
                }
              } else {
                eg.o2Hold = Math.max(0, eg.o2Hold - dt * 0.5);
              }
            }

            if (now - lastReactSync > 60) {
              lastReactSync = now;
              setEngLatchPct(Math.round(eg.latch));
              setEngSunAngle(Math.round(eg.sunTarget));
              setEngSunLockSec(Number(eg.sunLock.toFixed(1)));
              setEngO2Kpa(Math.round(eg.o2));
              setEngO2HoldSec(Number(eg.o2Hold.toFixed(1)));
            }
          }

          // Draw Base Horizon & Landed Rocket + Progressive Habitat Construction
          ctx.fillStyle =
            destination === 'MARS' ? '#5c2413' : destination === 'LUNAR' ? '#334155' : '#0f294a';
          ctx.fillRect(0, ly + 8, cw, ch - ly);

          // Glow ring
          ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(lx, ly + 10, 88, 18, 0, 0, Math.PI * 2);
          ctx.stroke();

          // Rocket
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(lx - 10, ly - 38, 20, 42);
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(lx - 11, ly - 38);
          ctx.lineTo(lx, ly - 58);
          ctx.lineTo(lx + 11, ly - 38);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lx - 10, ly);
          ctx.lineTo(lx - 18, ly + 12);
          ctx.moveTo(lx + 10, ly);
          ctx.lineTo(lx + 18, ly + 12);
          ctx.stroke();

          // Built base items
          if (completedTaskIds.length >= 1) {
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(lx - 68, ly + 8, 26, Math.PI, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#bae6fd';
            ctx.stroke();
          }
          if (completedTaskIds.length >= 2) {
            ctx.fillStyle = '#1d4ed8';
            ctx.fillRect(lx + 42, ly - 16, 48, 16);
            ctx.strokeStyle = '#93c5fd';
            ctx.strokeRect(lx + 42, ly - 16, 48, 16);
          }
          if (completedTaskIds.length >= 3) {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(lx - 68, ly + 8, 34, Math.PI, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [
    destination,
    step,
    selectedZone.name,
    selectedRole,
    completedTaskIds.length,
    sciActiveTargetIdx,
    engStageIdx,
    onAwardXp,
    completeTaskById,
  ]);

  const handleSelectZone = (z: LandingZone) => {
    soundEngine.playSfx('click');
    setSelectedZoneId(z.id);
    setWarningMsg(null);
    if (!scannedZoneIds.includes(z.id)) {
      setScannedZoneIds((prev) => [...prev, z.id]);
    }
  };

  const handleStartPoweredDescent = () => {
    if (!selectedZone.safe) {
      soundEngine.playSfx('warning');
      setWarningMsg(
        `Hazard Alert! ${selectedZone.name} has ${selectedZone.slopeDeg}° slopes & high hazards. Pick a green SAFE zone first!`,
      );
      return;
    }
    resetDescentGame();
    setStep('descent');
  };

  return (
    <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto space-y-4">
      <CommanderBubble
        tone={
          step === 'landing'
            ? 'amber'
            : step === 'descent'
              ? descentHud.crashedReason
                ? 'amber'
                : 'cyan'
              : step === 'role'
                ? 'cyan'
                : 'emerald'
        }
        message={
          step === 'landing'
            ? `We arrived at ${destName}! Scan pins on the Landing Radar and choose a flat green zone before starting your powered descent.`
            : step === 'descent'
              ? descentHud.landed
                ? `Smooth touchdown at ${selectedZone.name}! Preparing crew hatch...`
                : descentHud.crashedReason
                  ? descentHud.crashedReason
                  : `Pilot the lander down onto the glowing green SAFE TARGET PAD at ${selectedZone.name}! Keep landing speed <= 7.5 m/s.`
              : step === 'role' && !selectedRole
                ? `Great piloting! Choose your crew role—each role has its own hands-on surface mini-game on ${destName}!`
                : step === 'role' && activeRoleDef
                  ? selectedRole === 'explorer'
                    ? 'Drive your 6-wheel rover with WASD, Arrow Keys, or the D-Pad to grab all 3 glowing survey beacons and avoid red craters!'
                    : selectedRole === 'scientist'
                      ? 'Sweep the Radar Boom (A/D or slider) until Signal >= 85%, then press [Space] or Extract Core when the drill needle hits the green zone!'
                      : 'Complete the 3 Base Engineering controls on the right: Lock Dome Seal, Track the Sunbeam, and Pump O2 Pressure!'
                  : `All planet missions complete! Your crew earned +${earnedOpsXp} EXP here. Fire the return engine to fly home to Earth!`
        }
        actionHint={
          step === 'landing'
            ? 'Click radar pins, pick a green SAFE zone, then press Start Powered Descent!'
            : step === 'descent'
              ? 'Hold [W]/[Space] or "Hold Retro Thrust" to slow down; [A]/[D] or RCS buttons to center over the green pad.'
              : step === 'role' && !selectedRole
                ? 'Pick Explorer (Rover Driving), Scientist (Radar Core Drill), or Engineer (Base Controls).'
                : step === 'role'
                  ? `Finish all 3 ${activeRoleDef?.title} objectives (${completedTaskIds.length}/3 done).`
                  : 'Click Fly Back to Earth & Level Up!'
        }
        nasaFact={
          destination === 'MARS'
            ? 'NASA Perseverance used Terrain Relative Navigation during descent to steer away from boulders toward flat ground in Jezero Crater!'
            : destination === 'LUNAR'
              ? 'Apollo 11 astronauts famously piloted the Lunar Module manually past a boulder crater to touch down gently with under 30 seconds of fuel!'
              : 'Docking spacecraft fire gentle cold-gas RCS thrusters to match station velocity within centimeters per second.'
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: Interactive Canvas Viewport */}
        <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#090F1C] overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              {step === 'landing'
                ? `${destName} · Landing Site Radar`
                : step === 'descent'
                  ? `${selectedZone.name} · Powered Descent`
                  : `${selectedZone.name} · ${activeRoleDef ? activeRoleDef.miniGameName : 'Surface Base'}`}
            </span>
            <span className="font-mono text-cyan-300 tabular-nums">
              {step === 'landing'
                ? `Scanned ${scannedZoneIds.length}/${zones.length} Sites`
                : step === 'descent'
                  ? `Altitude ${descentHud.altM}m · Fuel ${descentHud.fuelPct}%`
                  : `Bonus +${earnedOpsXp} EXP`}
            </span>
          </div>

          <div className="relative h-[330px] sm:h-[380px] w-full">
            <canvas ref={canvasRef} className="w-full h-full block" />

            {/* Interactive Clickable Zone Pins on the Radar */}
            {step === 'landing' &&
              zones.map((z) => {
                const isSelected = z.id === selectedZoneId;
                const isScanned = scannedZoneIds.includes(z.id);
                return (
                  <button
                    key={z.id}
                    onClick={() => handleSelectZone(z)}
                    style={{ left: `${z.xPct}%`, top: `${z.yPct}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border px-2.5 py-1.5 text-left transition-transform ${
                      isSelected ? 'scale-105 z-20' : 'hover:scale-105 z-10'
                    } ${
                      !isScanned
                        ? 'border-cyan-400 bg-[#0D1526]/95 text-cyan-200'
                        : z.safe
                          ? 'border-emerald-400 bg-emerald-950/90 text-emerald-100'
                          : 'border-rose-400 bg-rose-950/90 text-rose-100'
                    }`}
                  >
                    <div className="flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span>{z.name}</span>
                    </div>
                    <div className="text-[10px] font-mono">
                      {isScanned ? (z.safe ? 'SAFE TO LAND' : 'HAZARD!') : 'TAP TO SCAN'}
                    </div>
                  </button>
                );
              })}

            {/* Powered Descent Crash / Success Overlay */}
            {step === 'descent' && descentHud.crashedReason && (
              <div className="absolute inset-0 bg-[#050811]/85 flex items-center justify-center p-4 z-20">
                <div className="max-w-sm rounded-xl border border-amber-500/70 bg-[#0D1526] p-4 text-center space-y-3">
                  <div className="text-sm font-bold text-amber-300 flex items-center justify-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    Aborted Touchdown
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{descentHud.crashedReason}</p>
                  <button
                    onClick={resetDescentGame}
                    className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold py-2.5 text-xs flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry Descent [R]
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right: Step Control Console & Interactive Mini-Game Controls */}
        <aside className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D1526] p-5 flex flex-col justify-between gap-4">
          {step === 'landing' && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">{selectedZone.name}</h2>
                  <span
                    className={`text-xs font-mono font-bold ${
                      selectedZone.safe ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {selectedZone.safe ? 'SAFE ZONE' : 'DANGEROUS ZONE'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                    <div className="text-[10px] text-slate-400">SLOPE</div>
                    <div className="text-sm font-bold text-white tabular-nums">
                      {selectedZone.slopeDeg}°
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                    <div className="text-[10px] text-slate-400">HAZARDS</div>
                    <div
                      className={`text-sm font-bold ${
                        selectedZone.hazardLevel === 'Low' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {selectedZone.hazardLevel}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                    <div className="text-[10px] text-slate-400">SCIENCE</div>
                    <div className="text-xs font-bold text-cyan-300 mt-0.5">
                      {selectedZone.scienceValue.split(' ')[0]}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{selectedZone.note}</p>

                {warningMsg && (
                  <div className="rounded-lg border border-rose-500/70 bg-rose-950/40 p-3 text-xs text-rose-200 flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{warningMsg}</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleStartPoweredDescent}
                className={`w-full rounded-lg font-semibold py-3 text-sm transition-colors flex items-center justify-center gap-2 ${
                  selectedZone.safe
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-rose-900/70 hover:bg-rose-800 text-rose-100 border border-rose-500/60'
                }`}
              >
                <Rocket className="w-4 h-4" />
                {selectedZone.safe
                  ? `Start Powered Descent (+30 EXP)`
                  : 'Unsafe Site — Pick a Green Zone'}
              </button>
            </>
          )}

          {step === 'descent' && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-mono text-cyan-400 uppercase">Lander Cockpit</div>
                <h2 className="text-base font-bold text-white">Pilot Powered Touchdown</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Hold Retro Thrust to slow down under 7.5 m/s over the green pad.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                  <div className="text-[10px] text-slate-400">ALTITUDE</div>
                  <div className="text-base font-bold text-cyan-300 tabular-nums">
                    {descentHud.altM}m
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                  <div className="text-[10px] text-slate-400">SPEED</div>
                  <div
                    className={`text-base font-bold tabular-nums ${
                      descentHud.vSpeed <= 7.5 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {descentHud.vSpeed} m/s
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                  <div className="text-[10px] text-slate-400">PAD ALIGN</div>
                  <div
                    className={`text-sm font-bold mt-0.5 ${
                      descentHud.onPad ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {descentHud.onPad ? 'LOCKED' : 'STEER'}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-1 select-none">
                <button
                  onPointerDown={() => {
                    touchHoldRef.current.up = true;
                  }}
                  onPointerUp={() => {
                    touchHoldRef.current.up = false;
                  }}
                  onPointerLeave={() => {
                    touchHoldRef.current.up = false;
                  }}
                  className="w-full rounded-xl bg-amber-500 active:bg-amber-400 hover:bg-amber-400 text-slate-950 font-bold py-3.5 text-sm flex items-center justify-center gap-2"
                >
                  <Flame className="w-4 h-4" />
                  Hold Retro Engine [W / Space]
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onPointerDown={() => {
                      touchHoldRef.current.left = true;
                    }}
                    onPointerUp={() => {
                      touchHoldRef.current.left = false;
                    }}
                    onPointerLeave={() => {
                      touchHoldRef.current.left = false;
                    }}
                    className="rounded-lg border border-cyan-600/70 bg-cyan-950/50 active:bg-cyan-800/70 py-3 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    RCS Left [A]
                  </button>
                  <button
                    onPointerDown={() => {
                      touchHoldRef.current.right = true;
                    }}
                    onPointerUp={() => {
                      touchHoldRef.current.right = false;
                    }}
                    onPointerLeave={() => {
                      touchHoldRef.current.right = false;
                    }}
                    className="rounded-lg border border-cyan-600/70 bg-cyan-950/50 active:bg-cyan-800/70 py-3 text-xs font-semibold text-cyan-200 flex items-center justify-center gap-1.5"
                  >
                    RCS Right [D]
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'role' && !selectedRole && (
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-bold text-white">Choose Your Planet Role</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Each role has its own interactive mini-game at {selectedZone.name}:
                </p>
              </div>
              <div className="space-y-2.5">
                {ROLE_DEFS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      soundEngine.playSfx('snap');
                      setCompletedTaskIds([]);
                      setSelectedRole(r.id);
                      resetRoleMiniGame(r.id);
                    }}
                    className="w-full rounded-xl border border-slate-700 bg-[#111A2E] hover:border-cyan-400 p-3.5 text-left transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white flex items-center gap-2">
                        {r.id === 'engineer' ? (
                          <Wrench className="w-4 h-4 text-amber-400" />
                        ) : r.id === 'scientist' ? (
                          <FlaskConical className="w-4 h-4 text-cyan-400" />
                        ) : (
                          <Compass className="w-4 h-4 text-emerald-400" />
                        )}
                        {r.title}
                      </span>
                      <span className="text-[11px] font-mono text-amber-300">+65 EXP</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{r.tagline}</p>
                    <div className="text-[11px] font-mono text-cyan-300">{r.miniGameName}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'role' && activeRoleDef && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-cyan-400 uppercase">
                    Active Role · {activeRoleDef.title}
                  </div>
                  <h2 className="text-base font-bold text-white">{activeRoleDef.miniGameName}</h2>
                </div>
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    if (returnTimerRef.current !== null) {
                      window.clearTimeout(returnTimerRef.current);
                      returnTimerRef.current = null;
                    }
                    completedTasksRef.current.clear();
                    setSelectedRole(null);
                    setCompletedTaskIds([]);
                    setRoleFeedback(null);
                  }}
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Switch Role
                </button>
              </div>

              {/* Mini-Game Specific Interactive Controls */}
              {selectedRole === 'explorer' && (
                <div className="rounded-lg border border-emerald-500/40 bg-[#090F1C] p-3 space-y-2 select-none">
                  <div className="text-xs font-semibold text-emerald-300 text-center">
                    Drive Rover with [WASD] / Arrows or Hold D-Pad
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 max-w-[190px] mx-auto">
                    <div />
                    <button
                      onPointerDown={() => {
                        touchHoldRef.current.up = true;
                      }}
                      onPointerUp={() => {
                        touchHoldRef.current.up = false;
                      }}
                      onPointerLeave={() => {
                        touchHoldRef.current.up = false;
                      }}
                      aria-label="Drive Rover Up"
                      className="rounded-lg border border-slate-700 bg-[#111A2E] active:bg-emerald-700 py-2 flex items-center justify-center"
                    >
                      <ArrowUp className="w-4 h-4 text-emerald-300" />
                    </button>
                    <div />
                    <button
                      onPointerDown={() => {
                        touchHoldRef.current.left = true;
                      }}
                      onPointerUp={() => {
                        touchHoldRef.current.left = false;
                      }}
                      onPointerLeave={() => {
                        touchHoldRef.current.left = false;
                      }}
                      aria-label="Drive Rover Left"
                      className="rounded-lg border border-slate-700 bg-[#111A2E] active:bg-emerald-700 py-2 flex items-center justify-center"
                    >
                      <ArrowLeft className="w-4 h-4 text-emerald-300" />
                    </button>
                    <button
                      onPointerDown={() => {
                        touchHoldRef.current.down = true;
                      }}
                      onPointerUp={() => {
                        touchHoldRef.current.down = false;
                      }}
                      onPointerLeave={() => {
                        touchHoldRef.current.down = false;
                      }}
                      aria-label="Drive Rover Down"
                      className="rounded-lg border border-slate-700 bg-[#111A2E] active:bg-emerald-700 py-2 flex items-center justify-center"
                    >
                      <ArrowDown className="w-4 h-4 text-emerald-300" />
                    </button>
                    <button
                      onPointerDown={() => {
                        touchHoldRef.current.right = true;
                      }}
                      onPointerUp={() => {
                        touchHoldRef.current.right = false;
                      }}
                      onPointerLeave={() => {
                        touchHoldRef.current.right = false;
                      }}
                      aria-label="Drive Rover Right"
                      className="rounded-lg border border-slate-700 bg-[#111A2E] active:bg-emerald-700 py-2 flex items-center justify-center"
                    >
                      <ArrowRight className="w-4 h-4 text-emerald-300" />
                    </button>
                  </div>
                </div>
              )}

              {selectedRole === 'scientist' && (
                <div className="rounded-lg border border-cyan-500/40 bg-[#090F1C] p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-cyan-300">Radar Boom Sweep (A/D)</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        sciSignalPct >= 85 ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      Signal: {sciSignalPct}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSciBoomX((x) => clamp(x - 6, 5, 95))}
                      className="rounded border border-slate-700 bg-[#111A2E] px-2.5 py-1.5 text-xs text-cyan-200"
                    >
                      ←
                    </button>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={Math.round(sciBoomX)}
                      onChange={(e) => setSciBoomX(Number(e.target.value))}
                      aria-label="Radar boom horizontal sweep"
                      className="flex-1 accent-cyan-400"
                    />
                    <button
                      onClick={() => setSciBoomX((x) => clamp(x + 6, 5, 95))}
                      className="rounded border border-slate-700 bg-[#111A2E] px-2.5 py-1.5 text-xs text-cyan-200"
                    >
                      →
                    </button>
                  </div>

                  {/* Drill Pressure Calibration Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Core Drill Calibration (Hit Green)</span>
                      <span
                        className={
                          sciNeedlePct >= 36 && sciNeedlePct <= 64
                            ? 'text-emerald-400 font-bold'
                            : ''
                        }
                      >
                        {sciNeedlePct}%
                      </span>
                    </div>
                    <div className="relative h-3 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden">
                      <div
                        className="absolute inset-y-0 bg-emerald-500/45"
                        style={{ left: '36%', width: '28%' }}
                      />
                      <div
                        className="absolute inset-y-0 w-1.5 bg-white"
                        style={{ left: `${sciNeedlePct}%` }}
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleScientistExtract}
                    className={`w-full rounded-lg py-2.5 text-xs font-bold transition-colors ${
                      sciSignalPct >= 85 && sciNeedlePct >= 36 && sciNeedlePct <= 64
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                    }`}
                  >
                    Extract Core Sample #{Math.min(3, sciActiveTargetIdx + 1)} [Space]
                  </button>
                </div>
              )}

              {selectedRole === 'engineer' && engStageIdx < 3 && (
                <div className="rounded-lg border border-amber-500/40 bg-[#090F1C] p-3 space-y-2.5">
                  {engStageIdx === 0 && (
                    <>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-amber-300 font-semibold">1. Dome Pressure Latch</span>
                        <span
                          className={
                            engLatchPct >= 38 && engLatchPct <= 62
                              ? 'text-emerald-400 font-bold'
                              : 'text-slate-300'
                          }
                        >
                          {engLatchPct}%
                        </span>
                      </div>
                      <div className="relative h-3.5 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden">
                        <div
                          className="absolute inset-y-0 bg-emerald-500/45"
                          style={{ left: '38%', width: '24%' }}
                        />
                        <div
                          className="absolute inset-y-0 w-2 bg-amber-300"
                          style={{ left: `${engLatchPct}%` }}
                        />
                      </div>
                      <button
                        onClick={handleEngineerLockLatch}
                        className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 text-xs"
                      >
                        Lock Dome Seal in Green Bracket [Space]
                      </button>
                    </>
                  )}

                  {engStageIdx === 1 && (
                    <>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-amber-300 font-semibold">2. Track Moving Sunbeam</span>
                        <span className="text-emerald-300 tabular-nums">
                          Hold {engSunLockSec}/0.9s
                        </span>
                      </div>
                      <div className="relative h-3.5 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden">
                        <div
                          className="absolute inset-y-0 bg-amber-400/55"
                          style={{ left: `${Math.max(0, engSunAngle - 9)}%`, width: '18%' }}
                        />
                        <div
                          className="absolute inset-y-0 w-2 bg-cyan-300"
                          style={{ left: `${engPanelAngle}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEngPanelAngle((a) => clamp(a - 8, 0, 100))}
                          className="rounded border border-slate-700 bg-[#111A2E] px-2.5 py-1.5 text-xs text-cyan-200"
                        >
                          ← Tilt
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={Math.round(engPanelAngle)}
                          onChange={(e) => setEngPanelAngle(Number(e.target.value))}
                          aria-label="Solar panel aim angle"
                          className="flex-1 accent-cyan-400"
                        />
                        <button
                          onClick={() => setEngPanelAngle((a) => clamp(a + 8, 0, 100))}
                          className="rounded border border-slate-700 bg-[#111A2E] px-2.5 py-1.5 text-xs text-cyan-200"
                        >
                          Tilt →
                        </button>
                      </div>
                    </>
                  )}

                  {engStageIdx === 2 && (
                    <>
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-amber-300 font-semibold">
                          3. O2 Tank Pressure ({engO2Kpa} kPa)
                        </span>
                        <span className="text-emerald-300 tabular-nums">
                          Hold {engO2HoldSec}/1.8s
                        </span>
                      </div>
                      <div className="relative h-3.5 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden">
                        <div
                          className="absolute inset-y-0 bg-emerald-500/40"
                          style={{ left: '65%', width: '20%' }}
                        />
                        <div
                          className="h-full bg-cyan-400 transition-all"
                          style={{ width: `${engO2Kpa}%` }}
                        />
                      </div>
                      <button
                        onPointerDown={() => {
                          touchHoldRef.current.pump = true;
                        }}
                        onPointerUp={() => {
                          touchHoldRef.current.pump = false;
                        }}
                        onPointerLeave={() => {
                          touchHoldRef.current.pump = false;
                        }}
                        className="w-full rounded-lg bg-emerald-500 active:bg-emerald-400 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 text-xs select-none"
                      >
                        Hold to Pump O2 to 65–85 kPa [W / Space]
                      </button>
                    </>
                  )}
                </div>
              )}

              {roleFeedback && (
                <div className="rounded-lg border border-cyan-700/50 bg-cyan-950/30 px-3 py-2 text-xs text-cyan-200">
                  {roleFeedback}
                </div>
              )}

              {/* Checklist progress for current role */}
              <div className="space-y-1.5">
                {activeRoleDef.tasks.map((task) => {
                  const done = completedTaskIds.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      className={`w-full rounded-lg border p-2.5 text-left ${
                        done
                          ? 'border-emerald-600/60 bg-emerald-950/30 text-emerald-100'
                          : 'border-slate-800 bg-[#111A2E] text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                        <span className="flex items-center gap-2">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              done ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          />
                          {task.label}
                        </span>
                        <span className="font-mono text-amber-300 shrink-0 tabular-nums">
                          {done ? 'DONE' : `+${task.xp} EXP`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 pl-6">{task.detail}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 'return' && activeRoleDef && (
            <>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono uppercase">
                  <Sparkles className="w-4 h-4" />
                  Surface Mission Complete
                </div>
                <h2 className="text-xl font-bold text-white">Ready to Return Home to Earth!</h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  As <span className="font-semibold text-white">{activeRoleDef.title}</span> at{' '}
                  <span className="font-semibold text-cyan-300">{selectedZone.name}</span>, you
                  completed all 3 surface mini-games and collected valuable samples &amp; data.
                </p>
                <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3 text-xs text-emerald-200 font-mono">
                  Surface Mission Bonus Earned: +{earnedOpsXp} EXP
                </div>
              </div>

              <button
                onClick={() => {
                  soundEngine.playSfx('ignition');
                  onCompleteReturnToEarth(activeRoleDef.id, selectedZone.name, earnedOpsXp);
                }}
                className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold py-3 text-sm transition-colors flex items-center justify-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                Fly Back to Earth &amp; Level Up!
              </button>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
