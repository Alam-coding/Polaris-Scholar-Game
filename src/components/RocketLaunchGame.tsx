import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Flame,
  Lock,
  Play,
  Radio,
  RotateCcw,
  Rocket,
  ShieldAlert,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { LAUNCH_WINDOWS, ROCKET_DESTINATIONS, ROCKET_ENGINES } from '../data/missionData';
import { soundEngine } from '../engine/audio';
import {
  calculateRocketMetrics,
  clamp,
  createDamagedRocketConfig,
  getPlayerLevelInfo,
  getRocketPrelaunchProblems,
} from '../engine/physics';
import { SpacecraftViewport } from '../three/SpacecraftViewport';
import {
  CampaignSave,
  DifficultyLevel,
  LeaderboardEntry,
  MissionHistoryEntry,
  OrbitId,
  PlayMode,
  RocketConfig,
  StoryChapterDef,
} from '../types/mission';
import { CommanderBubble } from './CommanderBubble';
import { EndingBeat, MissionEndingModal } from './MissionEndingModal';
import { PlanetLandingAndRoleOps, PlanetRoleId } from './PlanetLandingAndRoleOps';
import { SpaceQuizCard } from './SpaceQuizCard';

interface RocketLaunchGameProps {
  save: CampaignSave;
  initialDestination?: OrbitId;
  initialPayloadMassT?: number;
  customPayloadName?: string;
  activeChapter?: StoryChapterDef | null;
  sandboxMode?: boolean;
  playMode?: PlayMode;
  difficulty?: DifficultyLevel;
  playerOrTeamName?: string;
  onRecordLeaderboard?: (entry: LeaderboardEntry) => void;
  onRecordResult: (entry: MissionHistoryEntry, creditsEarned: number, stars: number) => void;
  onGrantCredits?: (amount: number) => void;
  onGrantXp?: (amount: number, reason?: string) => void;
  onPayloadDelivered?: () => void;
  onCompleteStoryChapter?: (chapter: StoryChapterDef) => void;
  onBackToHub: () => void;
  onOpenAcademy: () => void;
}

type RocketPhase = 'assembly' | 'flight' | 'landing_role' | 'debrief';

interface AnomalyCard {
  id: string;
  title: string;
  telemetryNote: string;
  optionA: { label: string; effectText: string; dvDelta: number; stressDelta: number; safe: boolean };
  optionB: { label: string; effectText: string; dvDelta: number; stressDelta: number; safe: boolean };
}

interface FlightOutcome {
  status: 'success' | 'partial' | 'fail';
  achievedAltKm: number;
  achievedVelMs: number;
  maxQStress: number;
  stageBonuses: number;
  fairingJettisoned: boolean;
  stars: number;
  score: number;
  credits: number;
  xpEarned: number;
  summary: string;
}

export function RocketLaunchGame({
  save,
  initialDestination,
  initialPayloadMassT,
  customPayloadName,
  activeChapter,
  sandboxMode = false,
  playMode = 'solo',
  difficulty = save.difficulty || 'engineer',
  playerOrTeamName,
  onRecordLeaderboard,
  onRecordResult,
  onGrantCredits,
  onGrantXp,
  onPayloadDelivered,
  onCompleteStoryChapter,
  onBackToHub,
  onOpenAcademy,
}: RocketLaunchGameProps) {
  const startDest =
    initialDestination && ROCKET_DESTINATIONS.some((d) => d.id === initialDestination)
      ? initialDestination
      : 'LUNAR';

  const [phase, setPhase] = useState<RocketPhase>('assembly');
  const [stageTab, setStageTab] = useState<1 | 2 | 3>(1);
  const [config, setConfig] = useState<RocketConfig>(() =>
    createDamagedRocketConfig(startDest, initialPayloadMassT || 3.5),
  );
  const [testFire, setTestFire] = useState(false);
  const [xpToast, setXpToast] = useState<string | null>(null);
  const awardedProblemsRef = useRef<Set<string>>(new Set());

  // Flight state — default Auto-Pilot ON in Explorer (kid-friendly) mode so ascent feels smooth
  const [autoPilot, setAutoPilot] = useState(save.explorerMode);
  const [hud, setHud] = useState({
    tSec: 0,
    altKm: 0,
    velMs: 0,
    stage: 1 as 1 | 2 | 3,
    stageFuelPct: 100,
    pitchDeg: 0,
    throttlePct: 100,
    maxQ: 0,
    stageWindowOpen: false,
    burnoutSweetSpot: false,
    fairingAttached: true,
    fairingReady: false,
    progressPct: 0,
    statusText: 'IGNITION SEQUENCE',
    stageBonuses: 0,
    steerX: 0,
    ringsCollected: 0,
    corridorHint: '',
  });
  const [activeAnomaly, setActiveAnomaly] = useState<AnomalyCard | null>(null);
  const [flightLog, setFlightLog] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<FlightOutcome | null>(null);
  const [landingRoleInfo, setLandingRoleInfo] = useState<{
    role: PlanetRoleId;
    site: string;
    opsXp: number;
  } | null>(null);
  const [showEnding, setShowEnding] = useState(false);

  const metrics = useMemo(
    () => calculateRocketMetrics(config, save.upgrades, sandboxMode),
    [config, save.upgrades, sandboxMode],
  );
  const levelInfo = useMemo(() => getPlayerLevelInfo(save.xp), [save.xp]);
  const rocketProblems = useMemo(
    () => getRocketPrelaunchProblems(config, metrics),
    [config, metrics],
  );

  // Award EXP whenever a broken rocket issue is solved!
  useEffect(() => {
    let newlyFixedTitle: string | null = null;
    let newlyFixedXp = 0;
    rocketProblems.forEach((p) => {
      const key = `${config.destination}:${p.id}`;
      if (p.fixed && !awardedProblemsRef.current.has(key)) {
        awardedProblemsRef.current.add(key);
        newlyFixedXp += p.xpReward;
        newlyFixedTitle = p.title;
      }
    });
    if (newlyFixedXp > 0) {
      soundEngine.playSfx('success');
      onGrantXp?.(newlyFixedXp, newlyFixedTitle || 'Rocket Problem Fixed');
      setXpToast(`+${newlyFixedXp} EXP · Fixed: ${newlyFixedTitle}`);
      const t = window.setTimeout(() => setXpToast(null), 3200);
      return () => window.clearTimeout(t);
    }
  }, [rocketProblems, config.destination, onGrantXp]);

  // Mutable simulation ref for 60fps canvas loop
  const simRef = useRef({
    t: 0,
    altKm: 0,
    velMs: 0,
    stage: 1 as 1 | 2 | 3,
    stageFuel: 1, // 1..0
    pitchDeg: 0,
    targetPitchDeg: 0,
    throttlePct: 100,
    maxQ: 0,
    fairingAttached: true,
    stageBonuses: 0,
    dvEarned: 0,
    anomaliesCount: 0,
    paused: false,
    autoPilot: false,
    finished: false,
    steerX: 0,
    targetSteerX: 0,
    ringsCollected: 0,
    nextRingSpawnT: 1.8,
    nextTurbSpawnT: 4.2,
    corridorHint: '',
    corridorHintTimer: 0,
    boostRings: [] as Array<{ id: number; x: number; y: number; r: number; collected: boolean }>,
    turbulence: [] as Array<{ id: number; x: number; y: number; w: number; h: number; hit: boolean }>,
    stars: [] as Array<{ x: number; y: number; r: number; a: number }>,
    plumeParticles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number }>,
  });
  const keysHeldRef = useRef<Record<string, boolean>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    simRef.current.autoPilot = autoPilot;
  }, [autoPilot]);

  useEffect(() => {
    if (phase === 'flight') {
      soundEngine.setTrack('launch');
    } else if (phase === 'debrief' && outcome?.status === 'success') {
      soundEngine.setTrack('victory');
    } else {
      soundEngine.setTrack('orbital');
    }
  }, [phase, outcome]);

  const updateCfg = <K extends keyof RocketConfig>(key: K, val: RocketConfig[K]) => {
    soundEngine.playSfx('click');
    if (key === 'destination') {
      setConfig(createDamagedRocketConfig(val as OrbitId, config.payloadMassT));
      return;
    }
    setConfig((prev) => ({ ...prev, [key]: val }));
  };

  const handleTestFire = () => {
    soundEngine.playSfx('ignition');
    setTestFire(true);
    window.setTimeout(() => setTestFire(false), 1800);
  };

  const startFlight = () => {
    soundEngine.unlockAndStart();
    soundEngine.playSfx('ignition');
    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.7 + Math.random() * 1.5,
      a: 0.35 + Math.random() * 0.65,
    }));
    simRef.current = {
      t: 0,
      altKm: 0,
      velMs: 0,
      stage: 1,
      stageFuel: 1,
      pitchDeg: 0,
      targetPitchDeg: 0,
      throttlePct: 100,
      maxQ: 0,
      fairingAttached: true,
      stageBonuses: 0,
      dvEarned: 0,
      anomaliesCount: 0,
      paused: false,
      autoPilot,
      finished: false,
      steerX: 0,
      targetSteerX: 0,
      ringsCollected: 0,
      nextRingSpawnT: 1.8,
      nextTurbSpawnT: 4.2,
      corridorHint: 'Steer into cyan rings for +95 m/s Δv!',
      corridorHintTimer: 3.0,
      boostRings: [],
      turbulence: [],
      stars,
      plumeParticles: [],
    };
    setActiveAnomaly(null);
    setOutcome(null);
    setLandingRoleInfo(null);
    setShowEnding(false);
    setFlightLog([
      `T+00:00 — Liftoff! ${ROCKET_ENGINES[config.stage1Engine].name} ×${config.stage1EnginesCount} at 100% thrust (Lift Strength ${metrics.twrStage1.toFixed(2)}).`,
    ]);
    setPhase('flight');
  };

  const triggerStageSeparation = useCallback(() => {
    const s = simRef.current;
    if (s.finished || s.paused) return;
    const hasStage3 = config.stage3Tanks > 0;
    if (s.stage === 1 && s.stageFuel <= 0.28) {
      const precision = s.stageFuel <= 0.14 ? 190 : 95;
      s.stage = 2;
      s.stageFuel = 1;
      s.stageBonuses += precision;
      soundEngine.playSfx('stage');
      setFlightLog((prev) => [
        `T+${Math.round(s.t)}s — Clean Stage 1 MECO & separation (+${precision} m/s efficiency bonus). Stage 2 ignition!`,
        ...prev.slice(0, 7),
      ]);
    } else if (s.stage === 2 && hasStage3 && s.stageFuel <= 0.28) {
      const precision = s.stageFuel <= 0.14 ? 160 : 80;
      s.stage = 3;
      s.stageFuel = 1;
      s.stageBonuses += precision;
      soundEngine.playSfx('stage');
      setFlightLog((prev) => [
        `T+${Math.round(s.t)}s — Stage 2 separation (+${precision} m/s bonus). Stage 3 deep-space burn started.`,
        ...prev.slice(0, 7),
      ]);
    }
  }, [config.stage3Tanks]);

  const triggerFairingJettison = useCallback(() => {
    const s = simRef.current;
    if (!s.fairingAttached || s.altKm < 75 || s.finished) return;
    s.fairingAttached = false;
    s.stageBonuses += 140;
    soundEngine.playSfx('snap');
    setFlightLog((prev) => [
      `T+${Math.round(s.t)}s — Payload fairing jettisoned above atmosphere (+140 m/s Δv saved).`,
      ...prev.slice(0, 7),
    ]);
  }, []);

  const resolveAnomaly = (choice: 'a' | 'b') => {
    if (!activeAnomaly) return;
    const picked = choice === 'a' ? activeAnomaly.optionA : activeAnomaly.optionB;
    const s = simRef.current;
    s.stageBonuses += picked.dvDelta;
    s.maxQ = Math.max(0, s.maxQ + picked.stressDelta);
    s.paused = false;
    const crisisXp = metrics.dest.requiredLevel >= 3 ? 35 : 30;
    onGrantXp?.(crisisXp, activeAnomaly.title);
    setXpToast(`+${crisisXp} EXP · Flight Problem Solved!`);
    window.setTimeout(() => setXpToast(null), 2800);
    soundEngine.playSfx(picked.safe ? 'beep' : 'warning');
    setFlightLog((prev) => [
      `T+${Math.round(s.t)}s — Problem solved (${picked.label}): ${picked.effectText} (+${crisisXp} EXP)`,
      ...prev.slice(0, 7),
    ]);
    setActiveAnomaly(null);
  };

  // Keyboard flight controls (held keys for smooth steering + instant actions)
  useEffect(() => {
    if (phase !== 'flight') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      keysHeldRef.current[e.code] = true;
      const s = simRef.current;
      if (s.paused || s.finished) return;
      if (e.code === 'Space') {
        if (s.fairingAttached && s.altKm >= 80 && s.stageFuel > 0.28) {
          triggerFairingJettison();
        } else {
          triggerStageSeparation();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      keysHeldRef.current = {};
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [phase, triggerFairingJettison, triggerStageSeparation]);

  // Main 60fps Ascent Physics & Canvas Renderer
  useEffect(() => {
    if (phase !== 'flight') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const totalFlightDvCapacity = metrics.dvTotal;
    const maxStage = config.stage3Tanks > 0 ? 3 : 2;
    const stageShares =
      maxStage === 3
        ? [
            metrics.dv1 / Math.max(1, totalFlightDvCapacity),
            metrics.dv2 / Math.max(1, totalFlightDvCapacity),
            metrics.dv3 / Math.max(1, totalFlightDvCapacity),
          ]
        : [
            metrics.dv1 / Math.max(1, totalFlightDvCapacity),
            metrics.dv2 / Math.max(1, totalFlightDvCapacity),
            0,
          ];

    let rafId = 0;
    let lastTs = performance.now();
    let lastHudSync = 0;

    const finishFlight = () => {
      const s = simRef.current;
      if (s.finished) return;
      s.finished = true;

      // Trajectory penalty if player never pitched into gravity turn or burned too vertically
      const gravityTurnQuality = s.altKm >= 110 && s.pitchDeg >= 48 ? 1 : s.pitchDeg >= 30 ? 0.88 : 0.75;
      const fairingBonus = !s.fairingAttached ? 0 : -220;
      const effectiveDv = (s.dvEarned + s.stageBonuses + fairingBonus) * gravityTurnQuality;
      const ratio = effectiveDv / Math.max(1, metrics.dvRequired);

      const maxQLimit = metrics.dest.requiredLevel >= 3 ? 108 : 115;
      let status: FlightOutcome['status'] = 'fail';
      let stars = 0;
      if (ratio >= 0.98 && s.maxQ < maxQLimit) {
        status = 'success';
        stars = ratio >= 1.06 && s.stageBonuses >= 200 ? 3 : ratio >= 1.01 ? 2 : 1;
      } else if (ratio >= 0.84) {
        status = 'partial';
        stars = 1;
      }

      const score = Math.round(clamp(ratio * 82 + (s.fairingAttached ? 0 : 8) + (100 - s.maxQ) * 0.1, 15, 100));
      const credits = status === 'success' ? 60 + stars * 25 : status === 'partial' ? 35 : 10;
      const baseDestXp =
        metrics.dest.requiredLevel >= 4
          ? 150
          : metrics.dest.requiredLevel === 3
            ? 115
            : metrics.dest.requiredLevel === 2
              ? 85
              : 55;
      const xpEarned =
        status === 'success'
          ? baseDestXp
          : status === 'partial'
            ? Math.round(baseDestXp * 0.6)
            : Math.round(baseDestXp * 0.25);

      const summary =
        status === 'success'
          ? `Spacecraft successfully injected into ${metrics.dest.name}! Effective Δv reached ${Math.round(effectiveDv).toLocaleString()} m/s.`
          : status === 'partial'
            ? `Sub-orbital / eccentric injection (${Math.round(ratio * 100)}% of target energy). Onboard thrusters must expend reserve fuel.`
            : `Ascent fell short of orbital velocity (${Math.round(effectiveDv).toLocaleString()} / ${Math.round(metrics.dvRequired).toLocaleString()} m/s). Add upper-stage Δv or refine gravity turn.`;

      const result: FlightOutcome = {
        status,
        achievedAltKm: Math.round(s.altKm),
        achievedVelMs: Math.round(effectiveDv * 0.82),
        maxQStress: Math.round(s.maxQ),
        stageBonuses: s.stageBonuses,
        fairingJettisoned: !s.fairingAttached,
        stars,
        score,
        credits,
        xpEarned,
        summary,
      };

      if (status === 'fail') {
        soundEngine.playSfx('warning');
        setOutcome(result);
        onGrantXp?.(xpEarned, `Rocket Flight Attempt: ${metrics.dest.name}`);
        onRecordLeaderboard?.({
          id: `lb-rkt-${Date.now()}`,
          playerOrTeam: playerOrTeamName || levelInfo.title,
          playMode,
          difficulty,
          missionId: `rocket-${config.destination.toLowerCase()}`,
          missionName: `Ascent: ${metrics.dest.name}`,
          score,
          sciencePts: Math.round(clamp(ratio * 100, 0, 100)),
          costM: metrics.costM,
          efficiencyScore: Math.round(clamp(ratio * 100, 0, 100)),
          stars,
          timestamp: new Date().toISOString(),
        });
        onRecordResult(
          {
            id: `rkt-${Date.now()}`,
            missionId: `rocket-${config.destination.toLowerCase()}`,
            missionName: `Ascent: ${metrics.dest.name}`,
            mode: 'rocket',
            outcome: status,
            score,
            stars,
            sciencePct: Math.round(clamp(ratio * 100, 0, 100)),
            costM: metrics.costM,
            timestamp: new Date().toISOString(),
          },
          credits,
          stars,
        );
        setShowEnding(true);
        setPhase('debrief');
      } else {
        // Reached destination! Proceed to Landing Site Search & Crew Role Missions before returning home to Earth.
        soundEngine.playSfx('success');
        setOutcome(result);
        setPhase('landing_role');
      }
    };

    const loop = (now: number) => {
      const rawDt = Math.min((now - lastTs) / 1000, 0.05);
      lastTs = now;
      const s = simRef.current;

      // Resize canvas cleanly to match display size
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth || 640;
      const ch = canvas.clientHeight || 420;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      if (!s.paused && !s.finished) {
        const dt = rawDt;
        s.t += dt;
        const held = keysHeldRef.current;

        // Held key controls: Auto-Pilot steers corridor with A/D/Arrows; Manual steers pitch + Q/E corridor
        const steerLeftHeld =
          held['KeyQ'] || (s.autoPilot && (held['KeyA'] || held['ArrowLeft']));
        const steerRightHeld =
          held['KeyE'] || (s.autoPilot && (held['KeyD'] || held['ArrowRight']));
        if (steerLeftHeld) {
          s.targetSteerX = clamp(s.targetSteerX - 230 * dt, -145, 145);
        }
        if (steerRightHeld) {
          s.targetSteerX = clamp(s.targetSteerX + 230 * dt, -145, 145);
        }
        if (!s.autoPilot) {
          if (held['KeyA'] || held['ArrowLeft']) {
            s.targetPitchDeg = clamp(s.targetPitchDeg - 38 * dt, 0, 88);
          }
          if (held['KeyD'] || held['ArrowRight']) {
            s.targetPitchDeg = clamp(s.targetPitchDeg + 38 * dt, 0, 88);
          }
          if (held['KeyW'] || held['ArrowUp']) {
            s.throttlePct = clamp(s.throttlePct + 45 * dt, 25, 100);
          }
          if (held['KeyS'] || held['ArrowDown']) {
            s.throttlePct = clamp(s.throttlePct - 45 * dt, 25, 100);
          }
        }

        s.steerX += (s.targetSteerX - s.steerX) * Math.min(1, dt * 8);
        if (s.corridorHintTimer > 0) {
          s.corridorHintTimer = Math.max(0, s.corridorHintTimer - dt);
          if (s.corridorHintTimer === 0) s.corridorHint = '';
        }

        // Auto-pilot smooth gravity turn
        if (s.autoPilot) {
          const desired = clamp((s.altKm / 120) * 78, 0, 82);
          s.targetPitchDeg = desired;
          if (s.altKm > 25 && s.altKm < 55) {
            s.throttlePct = 78; // Max-Q bucket
          } else {
            s.throttlePct = 100;
          }
          if (s.fairingAttached && s.altKm >= 92) {
            triggerFairingJettison();
          }
          if (s.stageFuel <= 0.08 && s.stage < maxStage) {
            triggerStageSeparation();
          }
        }

        // Smooth pitch response
        s.pitchDeg += (s.targetPitchDeg - s.pitchDeg) * Math.min(1, dt * 4.5);

        // Burn rate per second (full flight takes ~26-34s so it feels punchy & interactive)
        const stageShare = stageShares[s.stage - 1] || 0.35;
        const stageDuration = Math.max(7, stageShare * 26);
        const fuelBurn = (dt / stageDuration) * (s.throttlePct / 100);
        const actualBurn = Math.min(s.stageFuel, fuelBurn);
        s.stageFuel -= actualBurn;

        const stageDvPool =
          s.stage === 1 ? metrics.dv1 : s.stage === 2 ? metrics.dv2 : metrics.dv3;
        const dvStep = actualBurn * stageDvPool;
        s.dvEarned += dvStep;

        // Vertical climb vs horizontal acceleration by pitch angle
        const pitchRad = (s.pitchDeg * Math.PI) / 180;
        const climbComponent = Math.cos(pitchRad);
        const horizComponent = Math.sin(pitchRad);
        const twrFactor = s.stage === 1 ? clamp(metrics.twrStage1, 0.9, 2.2) : 1.15;

        s.altKm += Math.max(0, (dvStep * 0.048 * climbComponent + 0.35 * dt) * twrFactor);
        s.velMs += dvStep * (0.68 + 0.32 * horizComponent);

        // Max-Q aerodynamic pressure peaks between 15 and 55 km
        const atmoDensity = Math.exp(-s.altKm / 26);
        const qStress = clamp((s.velMs / 1800) * atmoDensity * (s.throttlePct / 100) * 145, 0, 130);
        s.maxQ = Math.max(s.maxQ, qStress);

        // Spawn Tailwind Boost Rings & Turbulence Clouds in the ascent corridor
        if (s.t >= s.nextRingSpawnT) {
          s.nextRingSpawnT = s.t + 3.1;
          s.boostRings.push({
            id: Math.round(s.t * 100),
            x: (Math.random() - 0.5) * 240,
            y: -26,
            r: 22,
            collected: false,
          });
        }
        if (s.t >= s.nextTurbSpawnT && s.altKm < 130) {
          s.nextTurbSpawnT = s.t + 4.4;
          const dirX = Math.random() > 0.5 ? 1 : -1;
          s.turbulence.push({
            id: Math.round(s.t * 100) + 1,
            x: dirX * (45 + Math.random() * 85),
            y: -30,
            w: 58,
            h: 26,
            hit: false,
          });
        }

        const rocketScreenX = cw * 0.5 + s.steerX;
        const rocketScreenY = ch * 0.56;
        const fallSpeed = 135 + (s.throttlePct / 100) * 65;

        s.boostRings = s.boostRings
          .map((ring) => ({ ...ring, y: ring.y + fallSpeed * dt }))
          .filter((ring) => {
            if (!ring.collected) {
              const rx = cw * 0.5 + ring.x;
              const dist = Math.hypot(rocketScreenX - rx, rocketScreenY - ring.y);
              if (dist < ring.r + 22) {
                ring.collected = true;
                s.ringsCollected += 1;
                s.stageBonuses += 95;
                s.corridorHint = 'Boost Ring! +95 m/s Δv';
                s.corridorHintTimer = 1.6;
                soundEngine.playSfx('beep');
                setFlightLog((prev) => [
                  `T+${Math.round(s.t)}s — Caught Tailwind Boost Ring #${s.ringsCollected} (+95 m/s Δv)!`,
                  ...prev.slice(0, 7),
                ]);
              }
            }
            return !ring.collected && ring.y < ch + 40;
          });

        s.turbulence = s.turbulence
          .map((tb) => ({ ...tb, y: tb.y + (fallSpeed * 0.92) * dt }))
          .filter((tb) => {
            if (!tb.hit) {
              const tx = cw * 0.5 + tb.x;
              if (
                Math.abs(rocketScreenX - tx) < tb.w * 0.5 + 12 &&
                Math.abs(rocketScreenY - tb.y) < tb.h * 0.5 + 24
              ) {
                tb.hit = true;
                s.maxQ = clamp(s.maxQ + 5, 0, 125);
                s.stageBonuses = Math.max(0, s.stageBonuses - 45);
                s.corridorHint = 'Wind Shear Hit! (-45 m/s)';
                s.corridorHintTimer = 1.8;
                soundEngine.playSfx('warning');
                setFlightLog((prev) => [
                  `T+${Math.round(s.t)}s — Hit wind shear cloud (-45 m/s, +5% Max-Q). Steer around amber clouds!`,
                  ...prev.slice(0, 7),
                ]);
              }
            }
            return tb.y < ch + 45;
          });

        // Trigger mid-flight anomalies scaled by mission difficulty (1 on Lv.1, 2 on Lv.2+)
        if (s.anomaliesCount === 0 && s.t > 9.5 && s.stage <= 2) {
          s.anomaliesCount = 1;
          s.paused = true;
          soundEngine.playSfx('warning');
          if (metrics.window.radioGap) {
            setActiveAnomaly({
              id: 'radio-blackout',
              title: 'Solar Interference Telemetry Blackout',
              telemetryNote: `Day ${metrics.window.day} launch window triggered plasma S-band attenuation at ${Math.round(s.altKm)} km.`,
              optionA: {
                label: 'Switch to Autonomous Inertial Hold (+30 EXP)',
                effectText: 'Maintains nominal gravity turn with slight guidance drift (-80 m/s).',
                dvDelta: -80,
                stressDelta: -4,
                safe: true,
              },
              optionB: {
                label: 'Boost Ka-Band Carrier & Pitch Hard (+30 EXP)',
                effectText: 'Recovers full telemetry lock (+140 m/s), adds +12% structural load.',
                dvDelta: 140,
                stressDelta: 12,
                safe: false,
              },
            });
          } else {
            setActiveAnomaly({
              id: 'maxq-shear',
              title: 'Upper-Atmosphere Jetstream Wind Shear',
              telemetryNote: `Crosswind spike detected passing Max-Q at ${Math.round(s.altKm)} km altitude.`,
              optionA: {
                label: 'Throttle Bucket to 72% Safe Load (+30 EXP)',
                effectText: 'Relieves structural stress cleanly (-10% Max-Q), small gravity loss (-60 m/s).',
                dvDelta: -60,
                stressDelta: -10,
                safe: true,
              },
              optionB: {
                label: 'Hold 100% Thrust Through Shear (+30 EXP)',
                effectText: 'Preserves full Δv gain (+110 m/s) at +14% aerodynamic stress.',
                dvDelta: 110,
                stressDelta: 14,
                safe: false,
              },
            });
          }
        } else if (
          metrics.dest.requiredLevel >= 2 &&
          s.anomaliesCount === 1 &&
          s.t > 18.5 &&
          s.stage >= 2
        ) {
          s.anomaliesCount = 2;
          s.paused = true;
          soundEngine.playSfx('warning');
          setActiveAnomaly({
            id: 'upper-stage-gimbal',
            title:
              metrics.dest.requiredLevel >= 3
                ? 'Cryogenic Fuel Slosh & Gimbal Oscillations'
                : 'Upper-Stage Guidance Drift',
            telemetryNote: `High-energy burn at ${Math.round(s.altKm)} km detected thrust-vector oscillation.`,
            optionA: {
              label: 'Dampen Gimbal & Stabilize Tank (+35 EXP)',
              effectText: 'Locks clean orbital vector (-40 m/s, -6% Max-Q stress).',
              dvDelta: -40,
              stressDelta: -6,
              safe: true,
            },
            optionB: {
              label: 'Overdrive Guidance Burn (+35 EXP)',
              effectText: 'Gains +130 m/s transfer speed at +10% structural vibration.',
              dvDelta: 130,
              stressDelta: 10,
              safe: false,
            },
          });
        }

        // Auto-advance if player ran completely dry on a stage after a brief grace stall
        if (s.stageFuel <= 0) {
          if (s.stage < maxStage) {
            // Auto stage without precision bonus if they didn't press Space
            s.stage = (s.stage + 1) as 1 | 2 | 3;
            s.stageFuel = 1;
            soundEngine.playSfx('stage');
            setFlightLog((prev) => [
              `T+${Math.round(s.t)}s — Auto-staged after burnout (no manual timing bonus).`,
              ...prev.slice(0, 7),
            ]);
          } else {
            finishFlight();
          }
        }

        // Plume particles anchored to rocket lateral steerX
        if (s.throttlePct > 0) {
          for (let i = 0; i < 3; i++) {
            const rad = (s.pitchDeg * Math.PI) / 180;
            const speed = 130 + Math.random() * 90;
            s.plumeParticles.push({
              x: cw * 0.5 + s.steerX - Math.sin(rad) * 44 + (Math.random() - 0.5) * 6,
              y: ch * 0.56 + Math.cos(rad) * 44 + (Math.random() - 0.5) * 6,
              vx: -Math.sin(rad) * speed + (Math.random() - 0.5) * 28,
              vy: Math.cos(rad) * speed + (Math.random() - 0.5) * 28,
              life: 0.35 + Math.random() * 0.25,
              maxLife: 0.6,
            });
          }
        }
        s.plumeParticles = s.plumeParticles.filter((p) => {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          return p.life > 0;
        });
      }

      // --- Render Ascent Canvas ---
      ctx.save();
      ctx.scale(dpr, dpr);

      const spaceMix = clamp(s.altKm / 130, 0, 1);
      const skyGrad = ctx.createLinearGradient(0, 0, 0, ch);
      const topR = Math.round(5 + (1 - spaceMix) * 10);
      const topG = Math.round(9 + (1 - spaceMix) * 32);
      const topB = Math.round(20 + (1 - spaceMix) * 75);
      const botR = Math.round(8 + (1 - spaceMix) * 25);
      const botG = Math.round(18 + (1 - spaceMix) * 85);
      const botB = Math.round(42 + (1 - spaceMix) * 140);
      skyGrad.addColorStop(0, `rgb(${topR},${topG},${topB})`);
      skyGrad.addColorStop(1, `rgb(${botR},${botG},${botB})`);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, cw, ch);

      // Stars fade in above 35 km
      const starAlpha = clamp((s.altKm - 20) / 70, 0.08, 1);
      s.stars.forEach((st) => {
        ctx.fillStyle = `rgba(226, 232, 240, ${st.a * starAlpha})`;
        ctx.beginPath();
        ctx.arc(st.x * cw, st.y * ch, st.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Curved Earth limb rising at bottom as rocket reaches orbit
      const horizonY = ch + 260 + Math.min(s.altKm * 1.4, 240);
      if (s.altKm < 260) {
        const limbGrad = ctx.createRadialGradient(cw * 0.5, horizonY + 120, 120, cw * 0.5, horizonY, 540);
        limbGrad.addColorStop(0, '#1d4ed8');
        limbGrad.addColorStop(0.75, '#0f766e');
        limbGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = limbGrad;
        ctx.beginPath();
        ctx.arc(cw * 0.5, horizonY, 380, Math.PI, Math.PI * 2);
        ctx.fill();
      }

      // Launchpad tower scrolling down at low altitude
      if (s.altKm < 12) {
        const padOffset = s.altKm * 28;
        ctx.fillStyle = '#334155';
        ctx.fillRect(cw * 0.5 - 70, ch * 0.72 + padOffset, 18, 120);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, ch * 0.85 + padOffset, cw, 160);
      }

      // Exhaust plume particles
      s.plumeParticles.forEach((p) => {
        const a = clamp(p.life / p.maxLife, 0, 1);
        ctx.fillStyle =
          s.stage === 1
            ? `rgba(251, 146, 60, ${a * 0.85})`
            : `rgba(56, 189, 248, ${a * 0.85})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 + (1 - a) * 10, 0, Math.PI * 2);
        ctx.fill();
      });

      // Boost Rings (steer into these for +95 m/s)
      s.boostRings.forEach((ring) => {
        const rx = cw * 0.5 + ring.x;
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(rx, ring.y, ring.r, ring.r * 0.58, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(rx, ring.y, ring.r - 6, (ring.r - 6) * 0.58, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#a5f3fc';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('+95 Δv', rx, ring.y - ring.r * 0.75);
        ctx.restore();
      });

      // Turbulence Shear Clouds (dodge these!)
      s.turbulence.forEach((tb) => {
        const tx = cw * 0.5 + tb.x;
        ctx.save();
        ctx.fillStyle = tb.hit ? 'rgba(244, 63, 94, 0.35)' : 'rgba(245, 158, 11, 0.28)';
        ctx.strokeStyle = tb.hit ? '#fb7185' : '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(tx - tb.w * 0.5, tb.y - tb.h * 0.5, tb.w, tb.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SHEAR', tx, tb.y + 3);
        ctx.restore();
      });

      // Draw Rocket Silhouette rotated by pitchDeg + lateral steerX
      ctx.save();
      ctx.translate(cw * 0.5 + s.steerX, ch * 0.56);
      ctx.rotate((s.pitchDeg * Math.PI) / 180);

      // Flame cone
      if (s.throttlePct > 0) {
        const fLen = (32 + Math.random() * 14) * (s.throttlePct / 100);
        const fGrad = ctx.createLinearGradient(0, 38, 0, 38 + fLen);
        fGrad.addColorStop(0, '#ffffff');
        fGrad.addColorStop(0.4, s.stage === 1 ? '#fb923c' : '#38bdf8');
        fGrad.addColorStop(1, 'rgba(251,146,60,0)');
        ctx.fillStyle = fGrad;
        ctx.beginPath();
        ctx.moveTo(-9, 38);
        ctx.lineTo(0, 38 + fLen);
        ctx.lineTo(9, 38);
        ctx.closePath();
        ctx.fill();
      }

      // Stage body
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-10, -24, 20, 58);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(-10, 8, 20, 6);
      ctx.fillStyle = '#475569';
      ctx.fillRect(-12, 34, 24, 6);

      // Fairing or exposed satellite payload
      if (s.fairingAttached) {
        ctx.fillStyle = config.fairingType === 'composite' ? '#334155' : '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(-11, -24);
        ctx.lineTo(0, -52);
        ctx.lineTo(11, -24);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#eab308';
        ctx.fillRect(-7, -38, 14, 14);
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(-18, -34, 10, 6);
        ctx.fillRect(8, -34, 10, 6);
      }

      // Stage 1 side boosters while in stage 1
      if (s.stage === 1 && config.stage1EnginesCount >= 3) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(-19, -4, 7, 38);
        ctx.fillRect(12, -4, 7, 38);
      }
      ctx.restore();

      // Target World appearing ahead in deep space as journey progresses
      const journeyFrac = clamp(
        (s.dvEarned + s.stageBonuses) / Math.max(1, metrics.dvRequired),
        0,
        1,
      );
      if (journeyFrac > 0.35) {
        const worldAlpha = clamp((journeyFrac - 0.35) / 0.55, 0, 1);
        const wx = cw - 88;
        const wy = ch * 0.34;
        const wr = 22 + worldAlpha * 26;
        ctx.save();
        ctx.globalAlpha = worldAlpha;
        const wGrad = ctx.createRadialGradient(wx - wr * 0.3, wy - wr * 0.3, 4, wx, wy, wr);
        if (config.destination === 'MARS') {
          wGrad.addColorStop(0, '#fb923c');
          wGrad.addColorStop(1, '#9a3412');
        } else if (config.destination === 'LUNAR') {
          wGrad.addColorStop(0, '#f1f5f9');
          wGrad.addColorStop(1, '#64748b');
        } else {
          wGrad.addColorStop(0, '#38bdf8');
          wGrad.addColorStop(1, '#1e3a8a');
        }
        ctx.fillStyle = wGrad;
        ctx.beginPath();
        ctx.arc(wx, wy, wr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(config.destination === 'LUNAR' ? 'MOON' : config.destination, wx, wy + wr + 14);
        ctx.restore();
      }

      // Trajectory progress strip at top-left of canvas
      ctx.fillStyle = 'rgba(7, 11, 20, 0.72)';
      ctx.fillRect(14, 14, 240, 56);
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.strokeRect(14, 14, 240, 56);
      ctx.fillStyle = '#22d3ee';
      ctx.font = '600 11px monospace';
      ctx.fillText(`STAGE ${s.stage}/${maxStage} · T+${s.t.toFixed(1)}s`, 24, 34);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(
        `Speed Power ${Math.round(s.dvEarned + s.stageBonuses)} / ${Math.round(metrics.dvRequired)} m/s`,
        24,
        52,
      );

      // Journey route Earth -> Destination at top-right of canvas
      if (cw > 460) {
        const jx = cw - 235;
        const jy = 14;
        ctx.fillStyle = 'rgba(7, 11, 20, 0.72)';
        ctx.fillRect(jx, jy, 221, 56);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.strokeRect(jx, jy, 221, 56);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '600 10px monospace';
        ctx.fillText(
          `JOURNEY: EARTH → ${config.destination === 'LUNAR' ? 'MOON' : config.destination}`,
          jx + 12,
          jy + 22,
        );
        // Track line
        const lineStart = jx + 18;
        const lineEnd = jx + 203;
        const lineY = jy + 40;
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lineStart, lineY);
        ctx.lineTo(lineEnd, lineY);
        ctx.stroke();
        // Progress line
        const shipX = lineStart + (lineEnd - lineStart) * journeyFrac;
        ctx.strokeStyle = '#22d3ee';
        ctx.beginPath();
        ctx.moveTo(lineStart, lineY);
        ctx.lineTo(shipX, lineY);
        ctx.stroke();
        // Earth dot, Destination dot, Rocket marker
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(lineStart, lineY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = config.destination === 'MARS' ? '#fb923c' : '#cbd5e1';
        ctx.beginPath();
        ctx.arc(lineEnd, lineY, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(shipX, lineY, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Throttled React HUD update (~15Hz)
      if (now - lastHudSync > 65) {
        lastHudSync = now;
        setHud({
          tSec: s.t,
          altKm: s.altKm,
          velMs: s.velMs,
          stage: s.stage,
          stageFuelPct: Math.round(s.stageFuel * 100),
          pitchDeg: Math.round(s.pitchDeg),
          throttlePct: Math.round(s.throttlePct),
          maxQ: Math.round(s.maxQ),
          stageWindowOpen: s.stage < maxStage && s.stageFuel <= 0.28,
          burnoutSweetSpot: s.stage < maxStage && s.stageFuel <= 0.14 && s.stageFuel > 0.02,
          fairingAttached: s.fairingAttached,
          fairingReady: s.fairingAttached && s.altKm >= 75,
          progressPct: Math.round(
            clamp(((s.dvEarned + s.stageBonuses) / Math.max(1, metrics.dvRequired)) * 100, 0, 100),
          ),
          statusText:
            s.altKm < 25
              ? 'ATMOSPHERIC ASCENT'
              : s.altKm < 70
                ? 'MAX-Q & GRAVITY TURN'
                : s.altKm < 140
                  ? 'UPPER STAGE VACUUM BURN'
                  : 'ORBITAL INSERTION',
          stageBonuses: s.stageBonuses,
          steerX: Math.round(s.steerX),
          ringsCollected: s.ringsCollected,
          corridorHint: s.corridorHint,
        });
      }

      if (!s.finished) {
        rafId = requestAnimationFrame(loop);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [
    phase,
    config.destination,
    config.fairingType,
    config.stage1EnginesCount,
    config.stage3Tanks,
    metrics,
    playMode,
    difficulty,
    playerOrTeamName,
    levelInfo.title,
    onRecordLeaderboard,
    onRecordResult,
    triggerFairingJettison,
    triggerStageSeparation,
  ]);

  const budgetPct = sandboxMode ? 15 : clamp((metrics.costM / metrics.budgetCapM) * 100, 0, 120);
  const dvPct = clamp((metrics.dvTotal / metrics.dvRequired) * 100, 0, 120);

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800/90 bg-[#0A101D] px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              soundEngine.playSfx('click');
              onBackToHub();
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-500 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Hub
          </button>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
              <Rocket className="w-4 h-4 text-amber-400" />
              Rocket Launch &amp; Destination Ascent
            </h1>
            <p className="text-xs text-slate-400">
              Vehicle Integration · {metrics.dest.name} · {metrics.window.label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block rounded-lg border border-cyan-800/60 bg-[#0D1526] px-2.5 py-1.5 text-xs font-mono tabular-nums text-cyan-300">
            LV.{levelInfo.level} · {levelInfo.xp} EXP
          </div>
          <button
            onClick={onOpenAcademy}
            className="rounded-lg border border-cyan-800/70 bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-900/50 transition-colors"
          >
            Space Academy (F1)
          </button>
          <div className="rounded-lg border border-slate-800 bg-[#0D1526] px-3 py-1.5 text-xs font-mono tabular-nums text-amber-300">
            {save.credits} CR
          </div>
        </div>
      </header>

      {xpToast && (
        <div className="bg-emerald-950/90 border-b border-emerald-500/60 px-4 lg:px-6 py-2 text-xs font-mono text-emerald-200 flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>{xpToast}</span>
        </div>
      )}

      {activeChapter && (
        <div className="border-b border-amber-700/50 bg-amber-950/30 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-mono font-semibold text-amber-300">
              STORY CH.{activeChapter.chapterNum} · {activeChapter.title}:
            </span>{' '}
            <span className="text-slate-200">{activeChapter.synopsis}</span>
          </div>
          <span className="font-mono text-[11px] text-amber-300">
            Target: {activeChapter.rocketDest === 'LUNAR' ? 'Moon' : activeChapter.rocketDest}
          </span>
        </div>
      )}

      {/* Commander Live Guidance Bubble */}
      {phase !== 'landing_role' && (
        <div className="px-4 lg:px-6 pt-3 max-w-[1600px] w-full mx-auto">
          <CommanderBubble
            tone={
              phase === 'assembly'
                ? rocketProblems.every((p) => p.fixed)
                  ? 'emerald'
                  : 'amber'
                : phase === 'flight'
                  ? activeAnomaly
                    ? 'amber'
                    : 'cyan'
                  : outcome?.status === 'fail'
                    ? 'amber'
                    : 'emerald'
            }
            message={
              phase === 'assembly'
                ? customPayloadName
                  ? `Your satellite "${customPayloadName}" is mounted inside the rocket nose cone! Follow the Composition Guide for ${metrics.dest.name}, fix red Pad Problems, then launch!`
                  : `Let's build a rocket for ${metrics.dest.name}! ${
                      config.destination === 'MARS'
                        ? 'Mars is far away—you need 3 stages, strong Stage 1 boosters, a vacuum Stage 2 engine, Stage 3 kick fuel, and a light Carbon Composite nose cone!'
                        : config.destination === 'LUNAR'
                          ? 'To reach the Moon, use 3 stages with plenty of Stage 2 & Stage 3 fuel plus Day 3 clean launch window!'
                          : 'For Earth orbit, balance Stage 1 lift strength (>= 1.25) with Stage 2 fuel, and keep costs within budget!'
                    }`
                : phase === 'flight'
                  ? activeAnomaly
                    ? `Alert in flight! ${activeAnomaly.title} — pick one of the two engineering fixes on screen to keep flying!`
                    : `Rocket is ascending toward ${metrics.dest.name}! Steer left & right to fly through cyan +95 Δv Boost Rings and dodge amber Wind Shear clouds!`
                  : outcome?.status === 'fail'
                    ? 'Our rocket ran a bit short of target speed, so the recovery chutes brought everything home safely. Check the red problems and launch again!'
                    : `Welcome back to Earth! You reached ${metrics.dest.name}, landed safely at ${landingRoleInfo?.site || 'target site'}, completed your ${landingRoleInfo?.role || 'crew'} mission, and earned +${outcome?.xpEarned || 0} EXP!`
            }
            actionHint={
              phase === 'assembly'
                ? rocketProblems.every((p) => p.fixed)
                  ? 'Everything looks green! Press "Launch Rocket to Ascent" at bottom right.'
                  : 'Follow the Composition Guide and fix the red Pad Problems on the right.'
                : phase === 'flight'
                  ? activeAnomaly
                    ? 'Choose Option A (Safe) or Option B (High-Energy) to solve the problem (+EXP)!'
                    : hud.stageWindowOpen
                      ? 'Press [Space] or click STAGE SEPARATION READY now for a speed bonus!'
                      : hud.fairingReady
                        ? 'Click JETTISON FAIRING ABOVE ATMOSPHERE to shed extra weight!'
                        : autoPilot
                          ? 'Steer left/right with [A]/[D], Arrow keys, or the Corridor buttons to catch Boost Rings!'
                          : 'Steer pitch with [A]/[D], Throttle [W]/[S], and Corridor [Q]/[E] or buttons!'
                  : 'Review your flight rewards, answer the Space Quiz for bonus credits, or return to Hub for harder missions!'
            }
            nasaFact={
              config.destination === 'MARS'
                ? 'NASA launches Mars missions in 3-stage stacks like Atlas V / SLS so heavy lower boosters fall away once empty instead of wasting fuel carrying dead weight!'
                : config.destination === 'LUNAR'
                  ? 'Apollo & Artemis rockets first enter Earth parking orbit before firing Stage 3 ("Trans-Lunar Injection") to slingshot toward the Moon.'
                  : 'Dropping the nose cone (fairing) above 75 km saves hundreds of m/s of speed because space has almost zero air resistance!'
            }
          />
        </div>
      )}

      {/* PHASE 1: ROCKET ASSEMBLY HANGAR */}
      {phase === 'assembly' && (
        <main className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-4 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {/* Left Column: Destination + Launch Window */}
          <section className="xl:col-span-4 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">1. Target Destination</h2>
                <span className="text-[11px] font-mono text-amber-300">
                  Design &amp; balance stages
                </span>
              </div>
              <div className="space-y-2">
                {ROCKET_DESTINATIONS.map((d) => {
                  const active = config.destination === d.id;
                  const unlocked =
                    sandboxMode ||
                    levelInfo.level >= d.requiredLevel ||
                    activeChapter?.rocketDest === d.id ||
                    Boolean(customPayloadName);
                  return (
                    <button
                      key={d.id}
                      disabled={!unlocked}
                      onClick={() => updateCfg('destination', d.id)}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        active
                          ? 'border-cyan-400 bg-cyan-950/40'
                          : unlocked
                            ? 'border-slate-800 bg-[#111A2E] hover:border-slate-600'
                            : 'border-slate-800/60 bg-slate-900/40 opacity-55 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                          {!unlocked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          {d.name}
                        </span>
                        <span className="font-mono text-xs tabular-nums text-amber-300 shrink-0">
                          {unlocked ? `${d.requiredDv.toLocaleString()} m/s Δv` : `Unlock Lv.${d.requiredLevel}`}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {d.difficultyLabel} · {d.distanceLabel} · Orbital speed ~{(d.orbitVelMs / 1000).toFixed(2)} km/s
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#090F1C] p-3 text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-cyan-400">Orbital Physics: </span>
                {metrics.dest.fact}
              </div>
            </div>

            {/* 7-Day Launch Window */}
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">2. 7-Day Launch Window</h2>
                <span className="text-xs font-mono text-slate-400">{metrics.window.note}</span>
              </div>
              <div className="grid grid-cols-7 gap-1.5 items-end h-24 pt-3">
                {LAUNCH_WINDOWS.map((w, idx) => {
                  const selected = config.windowIndex === idx;
                  const heightPct = 28 + Math.round((w.dvPenalty / 480) * 68);
                  return (
                    <button
                      key={w.day}
                      onClick={() => updateCfg('windowIndex', idx)}
                      title={w.note}
                      className={`flex flex-col items-center justify-end h-full rounded p-1 transition-colors border ${
                        selected
                          ? 'border-cyan-400 bg-cyan-950/40'
                          : 'border-slate-800/80 bg-[#111A2E] hover:border-slate-600'
                      }`}
                    >
                      {w.radioGap && <Radio className="w-3 h-3 text-amber-400 mb-0.5" />}
                      <div
                        className={`w-full rounded-sm ${
                          w.dvPenalty === 0
                            ? 'bg-emerald-400'
                            : w.radioGap
                              ? 'bg-amber-400'
                              : 'bg-cyan-500/80'
                        }`}
                        style={{ height: `${heightPct}%` }}
                      />
                      <span className="mt-1 text-[10px] font-mono text-slate-300">D{w.day}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Center Column: Interactive Composition Guide + Stage-by-Stage Builder */}
          <section className="xl:col-span-4 space-y-4">
            {/* Interactive Mission Composition Guide */}
            <div className="rounded-xl border border-cyan-500/40 bg-[#0D1526] p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-cyan-300">
                  Interactive Composition Guide ·{' '}
                  {config.destination === 'LUNAR' ? 'Moon' : config.destination}
                </h2>
                <span className="text-[10px] font-mono text-slate-400">Tap item to edit</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {[
                  {
                    label: 'Lift Strength >= 1.25',
                    ok: metrics.twrStage1 >= 1.25,
                    tab: 1 as const,
                    tip: 'Stage 1: Add boosters',
                  },
                  {
                    label:
                      config.destination === 'MARS' || config.destination === 'LUNAR'
                        ? 'Vacuum Stage 2 (Whisper/Zephyr)'
                        : 'Stage 2 Fuel Ready',
                    ok:
                      config.destination === 'MARS' || config.destination === 'LUNAR'
                        ? config.stage2Engine === 'whisper' || config.stage2Engine === 'zephyr'
                        : metrics.dv2 >= 1800,
                    tab: 2 as const,
                    tip: 'Stage 2: Engine & tanks',
                  },
                  {
                    label:
                      config.destination === 'MARS' || config.destination === 'LUNAR' || config.destination === 'GEO'
                        ? 'Stage 3 Kick Tanks >= 2'
                        : 'Fairing & Payload Mass',
                    ok:
                      config.destination === 'MARS' || config.destination === 'LUNAR' || config.destination === 'GEO'
                        ? config.stage3Tanks >= 2
                        : metrics.dvTotal >= metrics.dvRequired,
                    tab: 3 as const,
                    tip: 'Stage 3 & Nose',
                  },
                  {
                    label:
                      config.destination === 'MARS' || config.destination === 'LUNAR'
                        ? 'Composite Nose + Day 3 Window'
                        : 'Day 3 Clean Window',
                    ok:
                      config.destination === 'MARS' || config.destination === 'LUNAR'
                        ? config.fairingType === 'composite' && config.windowIndex === 2
                        : !metrics.window.radioGap,
                    tab: 3 as const,
                    tip: 'Nose cone / Window',
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setStageTab(item.tab);
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
                      item.ok
                        ? 'border-emerald-600/60 bg-emerald-950/25 text-emerald-200'
                        : 'border-amber-500/50 bg-amber-950/25 text-amber-200 hover:border-amber-400'
                    }`}
                  >
                    <div className="font-semibold truncate">
                      {item.ok ? '✓ ' : '→ '}
                      {item.label}
                    </div>
                    <div className="text-[10px] opacity-80">{item.tip}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-800 bg-[#0A101D] p-1.5">
              {[
                { id: 1 as const, label: 'Stage 1: Liftoff' },
                { id: 2 as const, label: 'Stage 2: Space' },
                { id: 3 as const, label: 'Stage 3 & Nose' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setStageTab(t.id);
                  }}
                  className={`rounded-lg py-2 px-2 text-xs font-semibold transition-colors ${
                    stageTab === t.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:bg-[#111A2E]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Stage 1 */}
            {stageTab === 1 && (
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Stage 1 · Booster Core</h2>
                  <span className="font-mono text-xs tabular-nums text-cyan-300">
                    +{Math.round(metrics.dv1)} m/s
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['kestrel', 'anvil', 'zephyr'] as const).map((eid) => {
                    const eng = ROCKET_ENGINES[eid];
                    const active = config.stage1Engine === eid;
                    return (
                      <button
                        key={eid}
                        onClick={() => updateCfg('stage1Engine', eid)}
                        className={`rounded-lg border p-2.5 text-left transition-colors ${
                          active
                            ? 'border-cyan-400 bg-cyan-950/40'
                            : 'border-slate-800 bg-[#111A2E] hover:border-slate-600'
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-100">{eng.name}</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {eng.thrustKN} kN · {eng.isp}s · ${eng.costM}M
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                    <div className="text-[11px] text-slate-400">Engine Cluster</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <button
                        onClick={() => updateCfg('stage1EnginesCount', Math.max(1, config.stage1EnginesCount - 1))}
                        className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                      >
                        -
                      </button>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {config.stage1EnginesCount}×
                      </span>
                      <button
                        onClick={() => updateCfg('stage1EnginesCount', Math.min(7, config.stage1EnginesCount + 1))}
                        className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                    <div className="text-[11px] text-slate-400">Propellant Tanks</div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <button
                        onClick={() => updateCfg('stage1Tanks', Math.max(2, config.stage1Tanks - 1))}
                        className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                      >
                        -
                      </button>
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {config.stage1Tanks}
                      </span>
                      <button
                        onClick={() => updateCfg('stage1Tanks', Math.min(14, config.stage1Tanks + 1))}
                        className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Stage 2 */}
            {stageTab === 2 && (
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Stage 2 · Vacuum Upper Stage</h2>
                  <span className="font-mono text-xs tabular-nums text-cyan-300">
                    +{Math.round(metrics.dv2)} m/s
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(['whisper', 'zephyr', 'kestrel'] as const).map((eid) => {
                    const eng = ROCKET_ENGINES[eid];
                    const active = config.stage2Engine === eid;
                    return (
                      <button
                        key={eid}
                        onClick={() => updateCfg('stage2Engine', eid)}
                        className={`rounded-lg border p-2.5 text-left transition-colors ${
                          active
                            ? 'border-cyan-400 bg-cyan-950/40'
                            : 'border-slate-800 bg-[#111A2E] hover:border-slate-600'
                        }`}
                      >
                        <div className="text-xs font-semibold text-slate-100">{eng.name}</div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {eng.isp}s Isp · {eng.thrustKN} kN · ${eng.costM}M
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5 flex items-center justify-between">
                  <span className="text-xs text-slate-300">Stage 2 Tanks</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateCfg('stage2Tanks', Math.max(1, config.stage2Tanks - 1))}
                      className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                    >
                      -
                    </button>
                    <span className="font-mono text-sm font-semibold tabular-nums w-6 text-center">
                      {config.stage2Tanks}
                    </span>
                    <button
                      onClick={() => updateCfg('stage2Tanks', Math.min(10, config.stage2Tanks + 1))}
                      className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Stage 3 + Payload Fairing */}
            {stageTab === 3 && (
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Stage 3 (Kick) &amp; Nose Cone</h2>
                  <span className="font-mono text-xs tabular-nums text-cyan-300">
                    +{Math.round(metrics.dv3)} m/s
                  </span>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-slate-200">Optional Stage 3 Tanks</div>
                    <div className="text-[11px] text-slate-400">
                      {config.stage3Tanks > 0
                        ? `Equipped ${ROCKET_ENGINES[config.stage3Engine].name}`
                        : 'Disabled (2-stage stack)'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateCfg('stage3Tanks', Math.max(0, config.stage3Tanks - 1))}
                      className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                    >
                      -
                    </button>
                    <span className="font-mono text-sm font-semibold tabular-nums w-6 text-center">
                      {config.stage3Tanks}
                    </span>
                    <button
                      onClick={() => updateCfg('stage3Tanks', Math.min(7, config.stage3Tanks + 1))}
                      className="w-7 h-7 rounded border border-slate-700 bg-slate-900 text-sm font-mono hover:border-slate-500"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">Satellite Payload Mass</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {config.payloadMassT.toFixed(1)} metric tons
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.5}
                    value={config.payloadMassT}
                    onChange={(e) => updateCfg('payloadMassT', Number(e.target.value))}
                    className="w-full accent-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateCfg('fairingType', 'standard')}
                    className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                      config.fairingType === 'standard'
                        ? 'border-cyan-400 bg-cyan-950/40'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div className="font-semibold">Aluminum Fairing</div>
                    <div className="text-[11px] text-slate-400">$6M · Standard mass</div>
                  </button>
                  <button
                    onClick={() => updateCfg('fairingType', 'composite')}
                    className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                      config.fairingType === 'composite'
                        ? 'border-cyan-400 bg-cyan-950/40'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div className="font-semibold">Carbon Composite</div>
                    <div className="text-[11px] text-slate-400">$18M · -8% payload drag</div>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right Column: 3D Rocket Turntable + Flight Readiness Telemetry */}
          <section className="xl:col-span-4 space-y-4 flex flex-col">
            <div className="rounded-xl border border-slate-800 bg-[#090F1C] overflow-hidden flex flex-col">
              <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  3D Launch Vehicle Integration Bay
                </span>
                <button
                  onClick={handleTestFire}
                  className="rounded border border-amber-500/60 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-900/50 transition-colors flex items-center gap-1"
                >
                  <Flame className="w-3.5 h-3.5" />
                  Static Test Fire
                </button>
              </div>
              <div className="h-[290px] w-full bg-[#060A13]">
                <SpacecraftViewport mode="rocket" rocketConfig={config} testFire={testFire} />
              </div>
            </div>

            <div className="rounded-xl border border-amber-500/50 bg-[#0D1526] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Pad Problems to Fix ({rocketProblems.filter((p) => p.fixed).length}/
                  {rocketProblems.length})
                </h2>
                <span className="text-[11px] font-mono text-emerald-400">Earn EXP!</span>
              </div>
              {(save.upgrades.isp > 0 || save.upgrades.composite > 0 || save.upgrades.budget > 0) && (
                <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/25 px-2.5 py-1.5 text-[11px] font-mono text-emerald-300 flex flex-wrap gap-x-3 gap-y-0.5">
                  <span className="text-slate-300 font-semibold">R&amp;D Lab:</span>
                  {save.upgrades.isp > 0 && <span>+{save.upgrades.isp * 6}% Isp</span>}
                  {save.upgrades.composite > 0 && <span>-{save.upgrades.composite * 7}% Tank Mass</span>}
                  {save.upgrades.budget > 0 && <span>+{save.upgrades.budget * 10}% Budget</span>}
                </div>
              )}
              <div className="space-y-1.5">
                {rocketProblems.map((prob) => (
                  <div
                    key={prob.id}
                    className={`rounded-lg border px-2.5 py-2 text-xs ${
                      prob.fixed
                        ? 'border-emerald-700/60 bg-emerald-950/25 text-emerald-200'
                        : 'border-rose-700/60 bg-rose-950/25 text-rose-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {prob.fixed ? '✓ FIXED: ' : '✖ PROBLEM: '}
                        {prob.title}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-[11px] text-amber-300">
                          +{prob.xpReward} EXP
                        </span>
                        {!prob.fixed && prob.id !== 'rkt-window' && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playSfx('click');
                              setStageTab(
                                prob.id === 'rkt-twr' ? 1 : prob.id === 'rkt-upper' ? 2 : 3,
                              );
                            }}
                            className="rounded border border-amber-400/70 bg-amber-500/20 hover:bg-amber-500/35 px-2 py-0.5 text-[10px] font-mono text-amber-200"
                          >
                            Edit Stage →
                          </button>
                        )}
                      </div>
                    </div>
                    {!prob.fixed && (
                      <p className="text-[11px] opacity-85 mt-0.5 leading-snug">
                        How to fix: {prob.hint}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-white">Pre-Launch Physics Check</h2>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2">
                    <div className="text-[10px] text-slate-400 uppercase">
                      {save.explorerMode ? 'Lift Strength (TWR)' : 'Stage 1 TWR'}
                    </div>
                    <div
                      className={`font-mono text-sm font-bold tabular-nums mt-0.5 ${
                        metrics.twrStage1 >= 1.25
                          ? 'text-emerald-400'
                          : metrics.twrStage1 >= 1.0
                            ? 'text-amber-400'
                            : 'text-rose-400'
                      }`}
                    >
                      {metrics.twrStage1.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2">
                    <div className="text-[10px] text-slate-400 uppercase">Liftoff Mass</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-slate-100 mt-0.5">
                      {Math.round(metrics.liftoffMassT)} t
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-2">
                    <div className="text-[10px] text-slate-400 uppercase">Mission Cost</div>
                    <div
                      className={`font-mono text-sm font-bold tabular-nums mt-0.5 ${
                        metrics.costM <= metrics.budgetCapM ? 'text-cyan-300' : 'text-rose-400'
                      }`}
                    >
                      ${metrics.costM}M
                    </div>
                  </div>
                </div>

                {/* Δv Budget Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-300">
                      {save.explorerMode ? 'Rocket Speed Power (Δv)' : 'Total Δv Capacity'}
                    </span>
                    <span
                      className={
                        metrics.dvTotal >= metrics.dvRequired ? 'text-emerald-400' : 'text-amber-400'
                      }
                    >
                      {Math.round(metrics.dvTotal).toLocaleString()} /{' '}
                      {Math.round(metrics.dvRequired).toLocaleString()} m/s
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded bg-slate-900 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all ${
                        metrics.dvTotal >= metrics.dvRequired ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, dvPct)}%` }}
                    />
                  </div>
                </div>

                {/* Program Budget Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-mono tabular-nums">
                    <span className="text-slate-300">Budget Allocation</span>
                    <span
                      className={
                        sandboxMode || metrics.costM <= metrics.budgetCapM ? 'text-cyan-300' : 'text-rose-400'
                      }
                    >
                      {sandboxMode ? `$${metrics.costM}M / ∞ (Sandbox)` : `$${metrics.costM}M / $${metrics.budgetCapM}M`}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded bg-slate-900 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all ${
                        sandboxMode || metrics.costM <= metrics.budgetCapM ? 'bg-cyan-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, budgetPct)}%` }}
                    />
                  </div>
                </div>

                {metrics.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 space-y-1.5">
                    {metrics.warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-amber-200">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2">
                <div className="text-[11px] font-mono text-center text-cyan-300">
                  {rocketProblems.every((p) => p.fixed)
                    ? 'All pad checks fixed! Ready to launch rocket.'
                    : `Next: Solve ${rocketProblems.filter((p) => !p.fixed).length} red pad problem(s) in Stages 1–3 & Launch Window`}
                </div>
                <button
                  disabled={metrics.twrStage1 < 1.0 || (!sandboxMode && metrics.costM > metrics.budgetCapM)}
                  onClick={startFlight}
                  className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold py-3 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {metrics.twrStage1 < 1.0
                    ? 'NO-GO: Insufficient Liftoff Thrust'
                    : !sandboxMode && metrics.costM > metrics.budgetCapM
                      ? 'NO-GO: Over Program Budget'
                      : 'Launch Rocket to Ascent'}
                </button>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* PHASE 2: INTERACTIVE ASCENT FLIGHT */}
      {phase === 'flight' && (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6 max-w-[1550px] w-full mx-auto">
          <div className="lg:col-span-8 flex flex-col gap-3">
            <div className="relative rounded-xl border border-slate-800 bg-[#060A13] overflow-hidden h-[430px] lg:h-[510px]">
              <canvas ref={canvasRef} className="w-full h-full block" />

              {/* Anomaly Crisis Overlay */}
              {activeAnomaly && (
                <div className="absolute inset-0 bg-[#050811]/88 flex items-center justify-center p-4 z-20">
                  <div className="w-full max-w-lg rounded-xl border border-amber-500/80 bg-[#0E1629] p-5 shadow-2xl space-y-4">
                    <div className="flex items-center gap-2.5 text-amber-400">
                      <ShieldAlert className="w-5 h-5" />
                      <h3 className="text-base font-semibold text-white">{activeAnomaly.title}</h3>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {activeAnomaly.telemetryNote}
                    </p>
                    <div className="grid grid-cols-1 gap-2.5">
                      <button
                        onClick={() => resolveAnomaly('a')}
                        className="rounded-lg border border-emerald-700/70 bg-emerald-950/40 hover:bg-emerald-900/50 p-3 text-left transition-colors"
                      >
                        <div className="text-xs font-semibold text-emerald-300">
                          {activeAnomaly.optionA.label}
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          {activeAnomaly.optionA.effectText}
                        </div>
                      </button>
                      <button
                        onClick={() => resolveAnomaly('b')}
                        className="rounded-lg border border-amber-700/70 bg-amber-950/40 hover:bg-amber-900/50 p-3 text-left transition-colors"
                      >
                        <div className="text-xs font-semibold text-amber-300">
                          {activeAnomaly.optionB.label}
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          {activeAnomaly.optionB.effectText}
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Flight Telemetry Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Altitude</div>
                <div className="font-mono text-base font-bold tabular-nums text-cyan-300">
                  {Math.round(hud.altKm)} km
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Velocity</div>
                <div className="font-mono text-base font-bold tabular-nums text-slate-100">
                  {Math.round(hud.velMs).toLocaleString()} m/s
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Stage Fuel</div>
                <div className="font-mono text-base font-bold tabular-nums text-amber-300">
                  {hud.stageFuelPct}%
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Pitch Angle</div>
                <div className="font-mono text-base font-bold tabular-nums text-slate-100">
                  {hud.pitchDeg}°
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Max-Q Load</div>
                <div
                  className={`font-mono text-base font-bold tabular-nums ${
                    hud.maxQ > 95 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {hud.maxQ}%
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Flight Guidance Controls & Event Log */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-mono text-cyan-400">{hud.statusText}</div>
                  <h2 className="text-sm font-semibold text-white">Flight Guidance &amp; Staging</h2>
                </div>
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setAutoPilot((v) => !v);
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    autoPilot
                      ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300'
                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {autoPilot ? 'Auto-Pilot ON' : 'Manual Pilot'}
                </button>
              </div>

              {/* Interactive Flight Corridor Steering (Catch Boost Rings, Dodge Shear Clouds) */}
              <div className="rounded-lg border border-cyan-500/40 bg-[#090F1C] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-cyan-300">
                    Corridor Steering {autoPilot ? '(A/D or ←/→)' : '(Q/E or Buttons)'}
                  </span>
                  <span className="font-mono text-emerald-300 tabular-nums">
                    Rings: {hud.ringsCollected} (+{hud.ringsCollected * 95} m/s)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      simRef.current.targetSteerX = clamp(simRef.current.targetSteerX - 48, -145, 145);
                    }}
                    className="rounded-lg border border-cyan-600/70 bg-cyan-950/50 hover:bg-cyan-900/60 px-3 py-2 text-xs font-semibold text-cyan-200 whitespace-nowrap shrink-0"
                  >
                    ← Steer Left
                  </button>
                  <input
                    type="range"
                    min={-145}
                    max={145}
                    value={hud.steerX}
                    onChange={(e) => {
                      simRef.current.targetSteerX = Number(e.target.value);
                    }}
                    aria-label="Flight corridor horizontal position"
                    className="flex-1 accent-cyan-400"
                  />
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      simRef.current.targetSteerX = clamp(simRef.current.targetSteerX + 48, -145, 145);
                    }}
                    className="rounded-lg border border-cyan-600/70 bg-cyan-950/50 hover:bg-cyan-900/60 px-3 py-2 text-xs font-semibold text-cyan-200 whitespace-nowrap shrink-0"
                  >
                    Steer Right →
                  </button>
                </div>
                {hud.corridorHint && (
                  <div className="text-[11px] font-mono text-cyan-200 text-center">
                    {hud.corridorHint}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Gravity Turn Pitch {autoPilot ? '(Auto)' : '(A / D)'}</span>
                  <span className="font-mono tabular-nums text-cyan-300">
                    {hud.pitchDeg}° (Target {Math.round(simRef.current.targetPitchDeg)}°)
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={88}
                  value={Math.round(simRef.current.targetPitchDeg)}
                  disabled={autoPilot}
                  onChange={(e) => {
                    simRef.current.targetPitchDeg = Number(e.target.value);
                  }}
                  className="w-full accent-cyan-400"
                />
                <p className="text-[11px] text-slate-400">
                  Tip: Climb vertically near liftoff, then pitch gradually toward 75–82° above 40 km.
                </p>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Main Engine Throttle (W / S)</span>
                  <span className="font-mono tabular-nums text-amber-300">{hud.throttlePct}%</span>
                </div>
                <input
                  type="range"
                  min={25}
                  max={100}
                  value={hud.throttlePct}
                  disabled={autoPilot}
                  onChange={(e) => {
                    simRef.current.throttlePct = Number(e.target.value);
                  }}
                  className="w-full accent-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <div className="space-y-1">
                  {/* Burnout Bullseye Meter */}
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>Stage {hud.stage} Burnout Gauge</span>
                    <span className={hud.burnoutSweetSpot ? 'text-emerald-400 font-bold' : ''}>
                      {hud.burnoutSweetSpot ? 'BULLSEYE (+190 m/s)' : 'Sweet Spot 4–14%'}
                    </span>
                  </div>
                  <div className="relative h-2 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden">
                    <div
                      className="absolute inset-y-0 bg-emerald-500/35"
                      style={{ left: '2%', width: '12%' }}
                    />
                    <div
                      className="h-full bg-amber-400 transition-all"
                      style={{ width: `${hud.stageFuelPct}%` }}
                    />
                  </div>
                  <button
                    disabled={!hud.stageWindowOpen}
                    onClick={triggerStageSeparation}
                    className={`w-full rounded-lg py-2.5 text-xs font-semibold transition-colors border ${
                      hud.burnoutSweetSpot
                        ? 'border-emerald-400 bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                        : hud.stageWindowOpen
                          ? 'border-amber-400 bg-amber-500 text-slate-950 hover:bg-amber-400'
                          : 'border-slate-800 bg-slate-900/70 text-slate-500'
                    }`}
                  >
                    {hud.burnoutSweetSpot
                      ? 'BULLSEYE SEPARATION — PRESS [SPACE]!'
                      : hud.stageWindowOpen
                        ? 'STAGE SEPARATION READY — PRESS [SPACE]'
                        : `Stage ${hud.stage} Burnout Window (< 28% Fuel)`}
                  </button>
                </div>

                <button
                  disabled={!hud.fairingReady}
                  onClick={triggerFairingJettison}
                  className={`w-full rounded-lg py-2.5 text-xs font-semibold transition-colors border ${
                    hud.fairingReady
                      ? 'border-cyan-400 bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                      : 'border-slate-800 bg-slate-900/70 text-slate-500'
                  }`}
                >
                  {!hud.fairingAttached
                    ? 'Fairing Jettisoned (+140 m/s Bonus)'
                    : hud.fairingReady
                      ? 'JETTISON FAIRING ABOVE ATMOSPHERE'
                      : 'Fairing Jettison Unlocks > 75 km'}
                </button>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-400">Orbital Injection Progress</span>
                  <span className="text-emerald-400">{hud.progressPct}%</span>
                </div>
                <div className="h-2 w-full rounded bg-slate-900 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${hud.progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Telemetry Flight Log
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-[11px] font-mono text-slate-300">
                {flightLog.map((line, i) => (
                  <div key={i} className="rounded border border-slate-800/80 bg-[#090F1C] px-2.5 py-1.5">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </main>
      )}

      {/* PHASE 2.5: SEARCH SAFE LANDING SITE + CHOOSE CREW ROLE + SURFACE TASKS + RETURN TO EARTH */}
      {phase === 'landing_role' && outcome && (
        <PlanetLandingAndRoleOps
          destination={config.destination}
          destName={metrics.dest.name}
          solarUpgradeLevel={save.upgrades.solar}
          onAwardXp={(xp, reason) => {
            onGrantXp?.(xp, reason);
            setXpToast(`+${xp} EXP · ${reason}`);
            window.setTimeout(() => setXpToast(null), 2600);
          }}
          onCompleteReturnToEarth={(roleUsed, landingSiteName, bonusXp) => {
            const totalXp = outcome.xpEarned + bonusXp;
            const roleLabel =
              roleUsed === 'engineer'
                ? 'Engineer'
                : roleUsed === 'scientist'
                  ? 'Scientist'
                  : 'Explorer / Scout';
            const finalized: FlightOutcome = {
              ...outcome,
              xpEarned: totalXp,
              score: Math.min(100, outcome.score + 6),
              stars: Math.max(outcome.stars, bonusXp >= 90 ? 3 : 2),
              summary: `${outcome.summary} Landed safely at ${landingSiteName}, finished ${roleLabel} surface tasks (+${bonusXp} EXP), and returned home to Earth!`,
            };
            soundEngine.playSfx('success');
            setLandingRoleInfo({ role: roleUsed, site: landingSiteName, opsXp: bonusXp });
            setOutcome(finalized);
            onGrantXp?.(outcome.xpEarned, `Rocket Return from ${metrics.dest.name}`);
            onRecordLeaderboard?.({
              id: `lb-rkt-${Date.now()}`,
              playerOrTeam: playerOrTeamName || levelInfo.title,
              playMode,
              difficulty,
              missionId: `rocket-${config.destination.toLowerCase()}`,
              missionName: `Round-Trip: ${metrics.dest.name} (${roleLabel})`,
              score: finalized.score,
              sciencePts: 100 + bonusXp,
              costM: metrics.costM,
              efficiencyScore: Math.round(clamp(100 - (metrics.costM / Math.max(1, metrics.budgetCapM)) * 20, 40, 100)),
              stars: finalized.stars,
              timestamp: new Date().toISOString(),
            });
            onRecordResult(
              {
                id: `rkt-${Date.now()}`,
                missionId: `rocket-${config.destination.toLowerCase()}`,
                missionName: `Round-Trip: ${metrics.dest.name} (${roleLabel})`,
                mode: 'rocket',
                outcome: finalized.status,
                score: finalized.score,
                stars: finalized.stars,
                sciencePct: 100,
                costM: metrics.costM,
                timestamp: new Date().toISOString(),
              },
              finalized.credits,
              finalized.stars,
            );
            setShowEnding(true);
            setPhase('debrief');
          }}
        />
      )}

      {/* PHASE 3: MISSION DEBRIEF */}
      {phase === 'debrief' && outcome && (
        <main className="flex-1 flex items-center justify-center p-4 lg:p-8">
          <div className="w-full max-w-2xl rounded-xl border border-slate-800 bg-[#0D1526] p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2 text-xs font-mono uppercase">
                  {outcome.status === 'success' ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Orbit Insertion Confirmed
                    </span>
                  ) : outcome.status === 'partial' ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Marginal Sub-Nominal Orbit
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1">
                      <ShieldAlert className="w-4 h-4" />
                      Insufficient Orbital Energy
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mt-1">{metrics.dest.name}</h2>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Mission Rating</div>
                <div className="text-lg font-mono font-bold text-amber-400">
                  {'★'.repeat(outcome.stars)}
                  {'☆'.repeat(3 - outcome.stars)}
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{outcome.summary}</p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Apogee</div>
                <div className="font-mono text-base font-bold tabular-nums text-cyan-300">
                  {outcome.achievedAltKm} km
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Stage Bonuses</div>
                <div className="font-mono text-base font-bold tabular-nums text-emerald-400">
                  +{outcome.stageBonuses} m/s
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Flight Score</div>
                <div className="font-mono text-base font-bold tabular-nums text-white">
                  {outcome.score} / 100
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3">
                <div className="text-[10px] text-slate-400 uppercase">Rewards Earned</div>
                <div className="font-mono text-base font-bold tabular-nums text-amber-300">
                  +{outcome.credits} CR · +{outcome.xpEarned} EXP
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/25 p-4 text-xs text-cyan-100 leading-relaxed">
              <span className="font-semibold text-cyan-400">Aerospace Takeaway: </span>
              {metrics.dest.fact}
            </div>

            <SpaceQuizCard
              missionTitle={metrics.dest.name}
              modeLabel="Rocket Launch Mode"
              score={outcome.score}
              stars={outcome.stars}
              highlightStat={`APOGEE ${outcome.achievedAltKm} KM · BONUS +${outcome.stageBonuses} M/S`}
              onBonusCredits={(amt) => onGrantCredits?.(amt)}
            />

            <div className="flex flex-wrap gap-3 pt-2">
              {onPayloadDelivered && outcome.status !== 'fail' && (
                <button
                  onClick={() => {
                    soundEngine.playSfx('success');
                    onPayloadDelivered();
                  }}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Deploy {customPayloadName || 'Satellite'} into Orbit &amp; Scan Earth!
                </button>
              )}
              <button
                onClick={() => {
                  soundEngine.playSfx('click');
                  setPhase('assembly');
                }}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-2"
              >
                <Wrench className="w-4 h-4" />
                Reconfigure Rocket
              </button>
              <button
                onClick={startFlight}
                className="flex-1 rounded-lg border border-amber-500/60 bg-amber-950/40 hover:bg-amber-900/50 px-4 py-2.5 text-xs font-semibold text-amber-300 transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Relaunch Same Stack
              </button>
              <button
                onClick={() => {
                  soundEngine.playSfx('click');
                  setShowEnding(true);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-2.5 text-xs font-medium text-slate-300 transition-colors"
              >
                Replay Ending
              </button>
              {activeChapter && outcome.status !== 'fail' && onCompleteStoryChapter ? (
                <button
                  onClick={() => {
                    soundEngine.playSfx('snap');
                    onCompleteStoryChapter(activeChapter);
                  }}
                  className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4" />
                  Continue Story Transmission
                </button>
              ) : (
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    onBackToHub();
                  }}
                  className="flex-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 px-4 py-2.5 text-xs font-semibold text-slate-950 transition-colors flex items-center justify-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  Return to Command Hub
                </button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ENDING CUTSCENE WHEN ROCKET GAMEPLAY FINISHES */}
      {phase === 'debrief' && outcome && showEnding && (
        <MissionEndingModal
          mode="rocket"
          title={customPayloadName ? `${customPayloadName} -> ${metrics.dest.name}` : metrics.dest.name}
          subtitle={`Rocket Ascent Ending · ${config.destination === 'LUNAR' ? 'Moon' : config.destination}`}
          destinationId={config.destination}
          outcome={outcome.status}
          score={outcome.score}
          stars={outcome.stars}
          creditsEarned={outcome.credits}
          highlightLine={`Reached ${outcome.achievedAltKm} km altitude · +${outcome.stageBonuses} m/s stage bonus`}
          realWorldImpact={
            outcome.status === 'success'
              ? config.destination === 'MARS'
                ? 'Your interplanetary rocket broke free of Earth gravity, opening a deep-space science highway to Mars!'
                : config.destination === 'LUNAR'
                  ? 'Your payload entered Moon transfer orbit, helping future Artemis explorers map lunar water ice!'
                  : `Your ${config.payloadMassT}t spacecraft reached ${metrics.dest.name} safely, keeping vital Earth & space sensors flying!`
              : outcome.status === 'partial'
                ? 'Backup onboard thrusters saved the mission in a reserve orbit—ready for emergency science operations!'
                : 'Recovery parachutes brought the payload core safely down to Earth so engineers can upgrade fuel tanks and try again!'
          }
          beats={buildRocketEndingBeats(outcome, metrics.dest.name, config.destination, customPayloadName)}
          onContinue={() => setShowEnding(false)}
        />
      )}
    </div>
  );
}

function buildRocketEndingBeats(
  outcome: FlightOutcome,
  destName: string,
  destId: OrbitId,
  payloadName?: string,
): EndingBeat[] {
  const craft = payloadName || `${destId === 'LUNAR' ? 'Moon' : destId} Payload`;
  if (outcome.status === 'success') {
    return [
      {
        speaker: 'Cmdr. Leo Reyes',
        role: 'Launch Complex Flight Boss',
        line: `Main Engine Cut-Off confirmed! Your ${craft} just separated cleanly at ${outcome.achievedAltKm} km heading for ${destName}.`,
      },
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        line:
          destId === 'MARS'
            ? 'Humanity just sent new eyes toward the Red Planet. Outstanding multi-stage engineering!'
            : `Orbital velocity locked! Your spacecraft is now soaring safely through space without falling back to Earth.`,
      },
    ];
  }
  if (outcome.status === 'partial') {
    return [
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        line: `Main engines fell slightly shy of target energy, so ${craft} fired emergency backup thrusters to hold orbit.`,
      },
      {
        speaker: 'Cmdr. Leo Reyes',
        role: 'Launch Complex Flight Boss',
        line: 'Good save! Adding one more upper-stage fuel tank or timing Stage Separation closer to burnout will earn a full 3-star trajectory.',
      },
    ];
  }
  return [
    {
      speaker: 'NOVA',
      role: 'Onboard Flight Guidance System',
      line: `Orbital speed reached ${outcome.achievedVelMs.toLocaleString()} m/s—just short of staying in ${destName}. Safety recovery parachutes deployed!`,
    },
    {
      speaker: 'Dr. Arya Pratama',
      role: 'Lead Earth Observation Scientist',
      line: 'Zero hardware lost! Head back to the Rocket Hangar, add an extra fuel tank or tune your engines, and launch again.',
    },
  ];
}
