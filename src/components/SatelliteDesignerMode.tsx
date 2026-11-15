import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Cpu,
  Flame,
  GitCompare,
  Globe,
  Layers,
  Play,
  Radio,
  Rocket,
  RotateCcw,
  Satellite,
  Save,
  ScanLine,
  Shield,
  ShieldAlert,
  Shuffle,
  Sparkles,
  Sun,
  Thermometer,
  Trophy,
  Wifi,
  Wrench,
} from 'lucide-react';
import {
  ADCS_OPTIONS,
  COMMS_OPTIONS,
  COMPUTER_OPTIONS,
  DIFFICULTY_PROFILES,
  EARTH_HOTSPOTS,
  GOAL_LABELS,
  GROUND_STATIONS,
  INSTRUMENTS,
  LAUNCH_VEHICLES,
  LIFETIME_OPTIONS,
  LUNAR_HOTSPOTS,
  MARS_HOTSPOTS,
  MISSION_ALTERNATIVE_TIPS,
  OBJECTIVE_FOCUSES,
  ORBITS,
  POWER_OPTIONS,
  PROP_OPTIONS,
  RANDOM_MISSION_CONSTRAINTS,
  STAGING_LABELS,
  STORE_OPTIONS,
  THERM_OPTIONS,
} from '../data/missionData';
import { soundEngine } from '../engine/audio';
import { ConnectionStatus } from '../engine/multiplayer';
import {
  calculateSatelliteMetrics,
  clamp,
  createDefaultSatelliteConfig,
  DEFAULT_SENSOR_BAY,
  getDurabilityScienceMultiplier,
  getNovaAdvice,
  getPlayerLevelInfo,
  getSatelliteMissionProblems,
  getSensorBay,
  getSensorDurability,
  round1,
} from '../engine/physics';
import { EarthGlobeView, SubSatelliteStatus } from '../three/EarthGlobeView';
import { SpacecraftViewport } from '../three/SpacecraftViewport';
import {
  CampaignSave,
  CompetitiveTeamRun,
  DifficultyLevel,
  EarthHotspot,
  LeaderboardEntry,
  MissionDef,
  MissionHistoryEntry,
  MultiplayerRoomState,
  ObjectiveFocus,
  OrbitId,
  PlayMode,
  RandomConstraintDef,
  SatelliteConfig,
  SavedMissionDesign,
  StoryChapterDef,
  TeamMember,
  TeamRoleId,
} from '../types/mission';
import { Blueprint2D } from './Blueprint2D';
import { CommanderBubble } from './CommanderBubble';
import { DesignCompareModal } from './DesignCompareModal';
import { EndingBeat, MissionEndingModal } from './MissionEndingModal';
import { SpaceQuizCard } from './SpaceQuizCard';
import { computeTeamCoordinationScore, TeamControlBar } from './TeamControlBar';

interface SatelliteDesignerModeProps {
  mission: MissionDef;
  save: CampaignSave;
  difficulty?: DifficultyLevel;
  playMode?: PlayMode;
  sandboxMode?: boolean;
  room?: MultiplayerRoomState | null;
  localClientId?: string;
  connectionStatus?: ConnectionStatus;
  onSyncRoomConfig?: (opts: {
    config?: SatelliteConfig;
    phase?: MultiplayerRoomState['phase'];
    designStep?: MultiplayerRoomState['designStep'];
  }) => void;
  onClaimRoomRole?: (roleId: TeamRoleId) => void;
  onPickRoomNegotiation?: (dilemmaId: string, choiceId: string) => void;
  onUpdateRoomTeam?: (teamIndex: number, patch: Partial<CompetitiveTeamRun>) => void;
  onSendRoomChat?: (text: string) => void;
  teamMembers?: TeamMember[];
  competitiveTeams?: CompetitiveTeamRun[];
  activeCompetitiveIdx?: number;
  onSelectCompetitiveTeam?: (idx: number, outgoingConfig: SatelliteConfig) => void;
  onRecordCompetitiveRun?: (teamIdx: number, runUpdate: Partial<CompetitiveTeamRun>) => void;
  onSaveDesign?: (design: SavedMissionDesign) => void;
  onRecordLeaderboard?: (entry: LeaderboardEntry) => void;
  liveHotspots?: EarthHotspot[];
  isLiveNasa?: boolean;
  nasaFeedLabel?: string;
  onRefreshLiveNasa?: () => void;
  startInOrbitSignal?: number;
  initialConfig?: SatelliteConfig | null;
  activeChapter?: StoryChapterDef | null;
  onRecordResult: (
    entry: MissionHistoryEntry,
    creditsEarned: number,
    stars: number,
    markTutorialDone?: boolean,
  ) => void;
  onGrantCredits?: (amount: number) => void;
  onGrantXp?: (amount: number, reason?: string) => void;
  onUpdateSensorDurability?: (updater: (prev: Record<string, number>) => Record<string, number>) => void;
  onOpenMaintenanceLab?: () => void;
  onLaunchCustomRocket?: (
    orbit: OrbitId,
    payloadMassT: number,
    missionName: string,
    config: SatelliteConfig,
  ) => void;
  onCompleteStoryChapter?: (chapter: StoryChapterDef) => void;
  onBackToHub: () => void;
  onOpenAcademy: () => void;
}

type SatPhase = 'briefing' | 'design' | 'resources' | 'operations' | 'report';

interface OrbitAnomaly {
  kind: 'solar' | 'debris' | 'thermal';
  title: string;
  detail: string;
  safeLabel: string;
  safeEffect: string;
  riskLabel: string;
  riskEffect: string;
}

interface SpaceWeatherEvent {
  id: string;
  title: string;
  phenomenon: string;
  detail: string;
  targetAntennaDeg: number;
  baseDegradationPct: number;
  remainingTicks: number;
  stabilized: boolean;
}

const SPACE_WEATHER_TEMPLATES: Array<{
  id: string;
  title: string;
  phenomenon: string;
  detail: string;
  baseDegradationPct: number;
}> = [
  {
    id: 'scintillation',
    title: 'Ionospheric Scintillation Band',
    phenomenon: 'F-Layer Plasma Turbulence',
    detail:
      'Dense equatorial ionospheric plasma is refracting your downlink carrier wave. Slew the ADCS high-gain antenna off-nadir to bypass interference.',
    baseDegradationPct: 30,
  },
  {
    id: 'substorm',
    title: 'Geomagnetic Plasma Squall',
    phenomenon: 'Magnetospheric Substorm Shear',
    detail:
      'Charged solar-wind particles are distorting RF polarization along the zenith path. Re-orient your antenna via ADCS to lock onto a clear corridor.',
    baseDegradationPct: 26,
  },
  {
    id: 'radioburst',
    title: 'Solar Radio Burst Interference',
    phenomenon: 'Type IV Microwave Noise Surge',
    detail:
      'Broadband solar radio noise is swamping your receiver dish. Steer the high-gain antenna toward the shielded ground-station vector.',
    baseDegradationPct: 34,
  },
  {
    id: 'auroral',
    title: 'Auroral E-Region Scatter',
    phenomenon: 'Polar Particle Precipitation',
    detail:
      'Energetic electron curtains over high latitudes are scattering ground station beams. Command an ADCS azimuth trim to restore link quality.',
    baseDegradationPct: 32,
  },
];

const LAUNCH_CHECKLIST_STEPS = [
  { id: 'pad', label: 'T-00:00 Main Engine Ignition & Liftoff' },
  { id: 'maxq', label: 'T+01:12 Max-Q Aerodynamic Load Nominal' },
  { id: 'meco', label: 'T+02:38 First Stage MECO & Separation' },
  { id: 'fair', label: 'T+03:20 Payload Fairing Jettison' },
  { id: 'seco', label: 'T+08:45 Upper Stage SECO Parking Orbit' },
  { id: 'sep', label: 'T+12:00 Spacecraft Separation Confirmed' },
  { id: 'arr', label: 'T+14:30 Solar Arrays Unfurled & Sun-Locked' },
  { id: 'ant', label: 'T+18:10 High-Gain Comms Dish Deployed' },
  { id: 'burn', label: 'T+35:00 Apogee Orbit Insertion Burn Complete' },
  { id: 'ops', label: 'T+42:00 Science Sensor Aperture Open — Tracking Targets' },
];

const SENSOR_BAY_LABEL: Record<string, string> = {
  img: 'Left Bay',
  lid: 'Left Bay',
  snd: 'Right Bay',
  rad: 'Right Bay',
  cor: 'Center-Left',
  par: 'Center-Right',
  mag: 'Center-Left',
  neu: 'Center-Right',
};

const DEFAULT_TEAM_MEMBERS: TeamMember[] = [
  { id: 'tm-1', name: 'Player 1', roles: ['commander'] },
  { id: 'tm-2', name: 'Player 2', roles: ['engineer'] },
  { id: 'tm-3', name: 'Player 3', roles: ['scientist'] },
  { id: 'tm-4', name: 'Player 4', roles: ['comms'] },
];

export function SatelliteDesignerMode({
  mission,
  save,
  difficulty = save.difficulty || 'engineer',
  playMode = 'solo',
  sandboxMode = false,
  room = null,
  localClientId,
  connectionStatus = 'offline',
  onSyncRoomConfig,
  onClaimRoomRole,
  onPickRoomNegotiation,
  onUpdateRoomTeam,
  onSendRoomChat,
  teamMembers = DEFAULT_TEAM_MEMBERS,
  competitiveTeams = [],
  activeCompetitiveIdx = 0,
  onSelectCompetitiveTeam,
  onRecordCompetitiveRun,
  onSaveDesign,
  onRecordLeaderboard,
  liveHotspots,
  isLiveNasa = false,
  nasaFeedLabel = 'NASA Training Targets',
  onRefreshLiveNasa,
  startInOrbitSignal = 0,
  initialConfig = null,
  activeChapter,
  onRecordResult,
  onGrantCredits,
  onGrantXp,
  onUpdateSensorDurability,
  onOpenMaintenanceLab,
  onLaunchCustomRocket,
  onCompleteStoryChapter,
  onBackToHub,
  onOpenAcademy,
}: SatelliteDesignerModeProps) {
  const [phase, setPhase] = useState<SatPhase>(startInOrbitSignal > 0 ? 'operations' : 'briefing');
  const [config, setConfig] = useState<SatelliteConfig>(
    () =>
      initialConfig ??
      (room?.playMode === 'coop' ? room.sharedConfig : null) ??
      createDefaultSatelliteConfig(mission),
  );
  const [highlightPart, setHighlightPart] = useState<string | null>(null);
  const [testFire, setTestFire] = useState(false);
  const [useLiveTargets, setUseLiveTargets] = useState(true);
  const [designStep, setDesignStep] = useState<'sensors' | 'parts' | 'order' | 'orbit'>('sensors');
  const [showAdvancedSliders, setShowAdvancedSliders] = useState(false);
  const [xpToast, setXpToast] = useState<string | null>(null);
  const awardedProblemsRef = useRef<Set<string>>(new Set());
  const lastWearDayRef = useRef<number>(1);
  const isApplyingRemoteRef = useRef<boolean>(false);
  const lastSyncedRevisionRef = useRef<number>(0);
  const lastEmittedPayloadRef = useRef<string>('');
  const autoCompletedRef = useRef<boolean>(false);

  // Random mission constraint (active automatically on Hardcore 'director' or toggled in Briefing)
  const [randomConstraint, setRandomConstraint] = useState<RandomConstraintDef | null>(() =>
    difficulty === 'director'
      ? RANDOM_MISSION_CONSTRAINTS[Math.floor(Math.random() * RANDOM_MISSION_CONSTRAINTS.length)]
      : null,
  );
  // Team Co-op & Competitive state
  const [activeMemberIdx, setActiveMemberIdx] = useState(0);
  const [negotiationPicks, setNegotiationPicks] = useState<Record<string, string>>(
    () => room?.negotiationPicks || {},
  );
  const [coordinationScore, setCoordinationScore] = useState(
    () => room?.coordinationScore ?? computeTeamCoordinationScore(teamMembers, {}),
  );
  const [showDesignModal, setShowDesignModal] = useState<'save' | 'compare' | 'leaderboard' | null>(
    null,
  );
  const [consequenceDelta, setConsequenceDelta] = useState<string | null>(null);
  const prevSnapshotRef = useRef<{
    wetMassKg: number;
    totalLoadW: number;
    costM: number;
    dataProdGB: number;
  } | null>(null);

  // Phase 4: Launch Sequence -> Live Earth Sensor Operations
  const [checklistIdx, setChecklistIdx] = useState(
    startInOrbitSignal > 0 ? LAUNCH_CHECKLIST_STEPS.length : 0,
  );
  const [checklistSpeed, setChecklistSpeed] = useState<1 | 5 | 20>(5);
  const [inOrbitOps, setInOrbitOps] = useState(startInOrbitSignal > 0);
  const [speedMult, setSpeedMult] = useState<1 | 2 | 4>(1);
  const [swathSlewDeg, setSwathSlewDeg] = useState(0);
  const [safeMode, setSafeMode] = useState(false);

  const [subSat, setSubSat] = useState<SubSatelliteStatus>({
    lat: 0,
    lon: 0,
    inSunlight: true,
    activeHotspotId: null,
    activeStationId: null,
  });
  const [scannedIds, setScannedIds] = useState<string[]>([]);
  const [scanningPulse, setScanningPulse] = useState(0);
  const [downlinkActive, setDownlinkActive] = useState(false);
  const [batteryPct, setBatteryPct] = useState(92);
  const [bufferGB, setBufferGB] = useState(4);
  const [downlinkedGB, setDownlinkedGB] = useState(0);
  const [sciencePoints, setSciencePoints] = useState(0);
  const [healthPct, setHealthPct] = useState(100);
  const [missionDay, setMissionDay] = useState(1);
  const [activeToast, setActiveToast] = useState<{ title: string; body: string } | null>(null);
  const [officeFixMsg, setOfficeFixMsg] = useState<string | null>(null);
  const [downlinkedTargetsCount, setDownlinkedTargetsCount] = useState(0);
  const [orbitLog, setOrbitLog] = useState<string[]>([]);
  const [orbitAnomaly, setOrbitAnomaly] = useState<OrbitAnomaly | null>(null);
  const [anomaliesTriggered, setAnomaliesTriggered] = useState(0);
  const [antennaDeg, setAntennaDeg] = useState(0);
  const [spaceWeather, setSpaceWeather] = useState<SpaceWeatherEvent | null>(null);
  const [weatherEventsTriggered, setWeatherEventsTriggered] = useState(0);
  const [weatherEventsResolved, setWeatherEventsResolved] = useState(0);
  const lastWeatherDayRef = useRef<number>(1);

  // Report state
  const [reportData, setReportData] = useState<{
    pillars: Array<{ label: string; score: number; weight: number }>;
    totalScore: number;
    rank: string;
    stars: number;
    credits: number;
    xpEarned: number;
    outcome: 'success' | 'partial' | 'fail';
    recommendations: string[];
    causeEffects: Array<{ subsystem: string; verdict: 'PASS' | 'WARN' | 'LOSS'; reason: string }>;
  } | null>(null);
  const [showEnding, setShowEnding] = useState(false);

  const metrics = useMemo(
    () =>
      calculateSatelliteMetrics(mission, config, save.upgrades, save.sensorDurability, {
        difficulty,
        sandboxMode,
        randomConstraint,
      }),
    [mission, config, save.upgrades, save.sensorDurability, difficulty, sandboxMode, randomConstraint],
  );
  const novaAdvice = useMemo(() => getNovaAdvice(metrics), [metrics]);
  const levelInfo = useMemo(() => getPlayerLevelInfo(save.xp), [save.xp]);
  const missionProblems = useMemo(
    () => getSatelliteMissionProblems(mission, config, metrics),
    [mission, config, metrics],
  );

  // ADCS High-Gain Antenna slew speed, storm-bypass lock cone, and real-time RF Link Quality
  const adcsLockConeDeg = metrics.adcsOpt.id === 'c' ? 11 : metrics.adcsOpt.id === 'b' ? 8 : 6;
  const adcsStepDeg = metrics.adcsOpt.id === 'c' ? 6 : metrics.adcsOpt.id === 'b' ? 5 : 4;
  const linkQualityPct = useMemo(() => {
    if (!spaceWeather) return 100;
    const err = Math.abs(antennaDeg - spaceWeather.targetAntennaDeg);
    if (err <= adcsLockConeDeg) {
      return Math.round(clamp(100 - (err / Math.max(1, adcsLockConeDeg)) * 8, 92, 100));
    }
    const ratio = clamp((err - adcsLockConeDeg) / 40, 0, 1);
    return Math.round(
      clamp(
        80 - ratio * (80 - spaceWeather.baseDegradationPct),
        spaceWeather.baseDegradationPct,
        80,
      ),
    );
  }, [spaceWeather, antennaDeg, adcsLockConeDeg]);

  // Detect successful ADCS antenna re-orientation lock during a Random Space Weather event
  useEffect(() => {
    if (!spaceWeather || spaceWeather.stabilized) return;
    const err = Math.abs(antennaDeg - spaceWeather.targetAntennaDeg);
    if (err <= adcsLockConeDeg) {
      soundEngine.playSfx('scan');
      setSpaceWeather((prev) =>
        prev ? { ...prev, stabilized: true, remainingTicks: Math.min(prev.remainingTicks, 5) } : null,
      );
      setWeatherEventsResolved((c) => c + 1);
      onGrantXp?.(25, `ADCS Antenna Lock: ${spaceWeather.title}`);
      setXpToast(`+25 EXP · ADCS Re-Oriented Antenna (${linkQualityPct}% Link Restored!)`);
      setOrbitLog((prev) => [
        `ADCS slewed antenna to ${antennaDeg}° — carrier link stabilized at ${linkQualityPct}% through ${spaceWeather.title}.`,
        ...prev.slice(0, 9),
      ]);
      const t = window.setTimeout(() => setXpToast(null), 3200);
      return () => window.clearTimeout(t);
    }
  }, [spaceWeather, antennaDeg, adcsLockConeDeg, linkQualityPct, onGrantXp]);

  // Live Consequence Feedback whenever a part/sensor/orbit changes
  useEffect(() => {
    const prev = prevSnapshotRef.current;
    const cur = {
      wetMassKg: round1(metrics.wetMassKg),
      totalLoadW: round1(metrics.totalLoadW),
      costM: round1(metrics.costM),
      dataProdGB: round1(metrics.dataProdGB),
    };
    prevSnapshotRef.current = cur;
    if (!prev) return;
    const dMass = round1(cur.wetMassKg - prev.wetMassKg);
    const dPower = round1(cur.totalLoadW - prev.totalLoadW);
    const dCost = round1(cur.costM - prev.costM);
    const dData = round1(cur.dataProdGB - prev.dataProdGB);
    const parts: string[] = [];
    if (Math.abs(dMass) >= 0.1) parts.push(`${dMass > 0 ? '+' : ''}${dMass} kg mass`);
    if (Math.abs(dPower) >= 0.1) parts.push(`${dPower > 0 ? '+' : ''}${dPower} W load`);
    if (Math.abs(dCost) >= 0.1) parts.push(`${dCost > 0 ? '+' : '-'}$${Math.abs(dCost)}M cost`);
    if (Math.abs(dData) >= 0.1) parts.push(`${dData > 0 ? '+' : ''}${dData} GB/d data`);
    if (parts.length > 0) {
      setConsequenceDelta(parts.join(' · '));
    }
  }, [metrics.wetMassKg, metrics.totalLoadW, metrics.costM, metrics.dataProdGB]);

  // Award EXP whenever a broken problem in this mission gets fixed!
  useEffect(() => {
    let newlyFixedTitle: string | null = null;
    let newlyFixedXp = 0;
    missionProblems.forEach((p) => {
      if (p.fixed && !awardedProblemsRef.current.has(p.id)) {
        awardedProblemsRef.current.add(p.id);
        newlyFixedXp += p.xpReward;
        newlyFixedTitle = p.title;
      }
    });
    if (newlyFixedXp > 0) {
      soundEngine.playSfx('success');
      onGrantXp?.(newlyFixedXp, newlyFixedTitle || 'Mission Problem Fixed');
      setXpToast(`+${newlyFixedXp} EXP · Fixed: ${newlyFixedTitle}`);
      const t = window.setTimeout(() => setXpToast(null), 3200);
      return () => window.clearTimeout(t);
    }
  }, [missionProblems, onGrantXp]);

  // Apply incoming WebSocket room updates without triggering an echo loop
  useEffect(() => {
    if (!room || room.revision === lastSyncedRevisionRef.current) return;
    lastSyncedRevisionRef.current = room.revision;

    if (playMode === 'coop') {
      isApplyingRemoteRef.current = true;
      setNegotiationPicks(room.negotiationPicks);
      setCoordinationScore(room.coordinationScore);
      const nextJson = JSON.stringify({
        config: room.sharedConfig,
        designStep: room.designStep,
        phase: room.phase,
      });
      if (nextJson !== lastEmittedPayloadRef.current) {
        lastEmittedPayloadRef.current = nextJson;
        if (room.sharedConfig && Array.isArray(room.sharedConfig.instruments)) {
          setConfig(room.sharedConfig);
        }
        setDesignStep(room.designStep);
        if (
          (phase === 'briefing' || phase === 'design' || phase === 'resources') &&
          (room.phase === 'briefing' || room.phase === 'design' || room.phase === 'resources')
        ) {
          setPhase(room.phase);
        }
      }
      Promise.resolve().then(() => {
        isApplyingRemoteRef.current = false;
      });
    }
  }, [room, playMode, phase]);

  // Reset config when mission changes (preserve custom-launched satellite if returning from Rocket Mode)
  useEffect(() => {
    awardedProblemsRef.current = new Set();
    setXpToast(null);
    prevSnapshotRef.current = null;
    setConsequenceDelta(null);
    autoCompletedRef.current = false;
    if (startInOrbitSignal > 0) {
      if (initialConfig) {
        setConfig(initialConfig);
      }
      setPhase('operations');
      setChecklistIdx(LAUNCH_CHECKLIST_STEPS.length);
      setInOrbitOps(true);
      return;
    }
    const localCompetitiveStart =
      room && playMode === 'competitive'
        ? room.competitiveTeams.find(
            (t) =>
              t.teamIndex ===
              (room.players.find((p) => p.clientId === localClientId)?.teamIndex ?? 0),
          )?.config
        : null;
    setConfig(
      initialConfig ??
        localCompetitiveStart ??
        (room?.playMode === 'coop' ? room.sharedConfig : null) ??
        createDefaultSatelliteConfig(mission),
    );
    setPhase('briefing');
    setDesignStep('sensors');
    setReportData(null);
    setShowEnding(false);
    setAnomaliesTriggered(0);
    setAntennaDeg(0);
    setSpaceWeather(null);
    setWeatherEventsTriggered(0);
    setWeatherEventsResolved(0);
    lastWeatherDayRef.current = 1;
  }, [mission, startInOrbitSignal]);

  // Emit local design edits to WebSocket room (Co-op shared craft or Competitive team progress)
  useEffect(() => {
    if (!room || isApplyingRemoteRef.current) return;
    if (playMode === 'coop' && onSyncRoomConfig) {
      const syncPhase =
        phase === 'briefing' || phase === 'design' || phase === 'resources' ? phase : undefined;
      const serialized = JSON.stringify({
        config,
        designStep,
        phase: syncPhase || room.phase,
      });
      if (serialized === lastEmittedPayloadRef.current) return;
      lastEmittedPayloadRef.current = serialized;
      onSyncRoomConfig({ config, designStep, phase: syncPhase });
    } else if (playMode === 'competitive' && onUpdateRoomTeam) {
      const myTeamIdx =
        room.players.find((p) => p.clientId === localClientId)?.teamIndex ?? activeCompetitiveIdx;
      const serialized = JSON.stringify({
        teamIndex: myTeamIdx,
        config,
        costM: round1(metrics.costM),
        wetMassKg: round1(metrics.wetMassKg),
        status: metrics.status,
      });
      if (serialized === lastEmittedPayloadRef.current) return;
      lastEmittedPayloadRef.current = serialized;
      onUpdateRoomTeam(myTeamIdx, {
        config,
        costM: round1(metrics.costM),
        wetMassKg: round1(metrics.wetMassKg),
        status: metrics.status,
      });
    }
  }, [
    room,
    playMode,
    config,
    designStep,
    phase,
    metrics.costM,
    metrics.wetMassKg,
    metrics.status,
    localClientId,
    activeCompetitiveIdx,
    onSyncRoomConfig,
    onUpdateRoomTeam,
  ]);

  const handleSwitchCompetitiveTeam = (idx: number) => {
    const target = competitiveTeams[idx];
    onSelectCompetitiveTeam?.(idx, config);
    if (target) {
      prevSnapshotRef.current = null;
      setConfig({ ...target.config });
    }
    if (phase === 'report' || phase === 'operations') {
      setPhase('design');
      setDesignStep('sensors');
      setReportData(null);
      setShowEnding(false);
    }
  };

  // Adaptive music track
  useEffect(() => {
    if (phase === 'operations') {
      soundEngine.setTrack(inOrbitOps ? 'earth' : 'launch');
    } else if (phase === 'report' && reportData?.outcome === 'success') {
      soundEngine.setTrack('victory');
    } else {
      soundEngine.setTrack('orbital');
    }
  }, [phase, inOrbitOps, reportData]);

  const toggleInstrument = (id: string) => {
    soundEngine.playSfx('snap');
    setConfig((prev) => {
      const exists = prev.instruments.includes(id);
      if (exists) {
        return { ...prev, instruments: prev.instruments.filter((x) => x !== id) };
      }
      if (prev.instruments.length >= 6) return prev;
      const defaultBay: 'left' | 'right' = DEFAULT_SENSOR_BAY[id] || 'left';
      return {
        ...prev,
        instruments: [...prev.instruments, id],
        sensorBays: { ...(prev.sensorBays || {}), [id]: prev.sensorBays?.[id] || defaultBay },
      };
    });
  };

  const swapSensorBay = (id: string) => {
    soundEngine.playSfx('snap');
    setConfig((prev) => {
      const current = getSensorBay(prev, id);
      return {
        ...prev,
        sensorBays: {
          ...(prev.sensorBays || {}),
          [id]: current === 'left' ? 'right' : 'left',
        },
      };
    });
  };

  const moveSequence = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= config.sequence.length) return;
    soundEngine.playSfx('click');
    setConfig((prev) => {
      const next = [...prev.sequence];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...prev, sequence: next };
    });
  };

  const handleTestFire = () => {
    soundEngine.playSfx('ignition');
    setTestFire(true);
    window.setTimeout(() => setTestFire(false), 1600);
  };

  const launchSatellite = () => {
    if (metrics.status === 'NO-GO') {
      soundEngine.playSfx('warning');
      return;
    }
    soundEngine.unlockAndStart();
    soundEngine.playSfx('ignition');
    setChecklistIdx(0);
    setInOrbitOps(false);
    setScannedIds([]);
    setBatteryPct(94);
    setBufferGB(2);
    setDownlinkedGB(0);
    setSciencePoints(0);
    setHealthPct(100);
    setMissionDay(1);
    lastWearDayRef.current = 1;
    autoCompletedRef.current = false;
    setSafeMode(false);
    setAnomaliesTriggered(0);
    setDownlinkedTargetsCount(0);
    setOfficeFixMsg(null);
    setOrbitAnomaly(null);
    setActiveToast(null);
    setAntennaDeg(0);
    setSpaceWeather(null);
    setWeatherEventsTriggered(0);
    setWeatherEventsResolved(0);
    lastWeatherDayRef.current = 1;
    setOrbitLog([`Launch committed on ${metrics.lv.name} toward ${metrics.orbit.name}.`]);
    setPhase('operations');
  };

  // Launch Checklist Auto-Advance
  useEffect(() => {
    if (phase !== 'operations' || inOrbitOps) return;
    if (checklistIdx >= LAUNCH_CHECKLIST_STEPS.length) {
      setInOrbitOps(true);
      soundEngine.playSfx('success');
      setOrbitLog((prev) => [
        `Orbital insertion complete. Sensor swath active over Earth.`,
        ...prev.slice(0, 9),
      ]);
      return;
    }
    const delayMs = checklistSpeed === 20 ? 180 : checklistSpeed === 5 ? 450 : 1200;
    const timer = window.setTimeout(() => {
      if (checklistIdx === 2 || checklistIdx === 3 || checklistIdx === 6) {
        soundEngine.playSfx('stage');
      } else {
        soundEngine.playSfx('beep');
      }
      setChecklistIdx((c) => c + 1);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [phase, inOrbitOps, checklistIdx, checklistSpeed]);

  // Live Orbital Sensor Loop (battery, eclipse, passive buffer fill, radiation/thermal)
  useEffect(() => {
    if (phase !== 'operations' || !inOrbitOps || orbitAnomaly) return;

    const dayIncrement = speedMult * Math.max(2, Math.round(mission.durationDays / 45));

    const timer = window.setInterval(() => {
      setMissionDay((d) => Math.min(mission.durationDays, d + dayIncrement));

      setBatteryPct((prev) => {
        const netW = subSat.inSunlight
          ? metrics.solarGenW - (safeMode ? metrics.busPowerW * 0.6 : metrics.totalLoadW * 0.72)
          : -(safeMode ? metrics.busPowerW * 0.7 : metrics.totalLoadW);
        const deltaPct = (netW / Math.max(200, metrics.battCapWh)) * 18 * speedMult;
        return clamp(Math.round((prev + deltaPct) * 10) / 10, 5, 100);
      });

      if (!safeMode) {
        // Keep passive background telemetry capped at 45% of SSD capacity so background fill never locks out hotspot scans!
        const passiveCap = Math.min(metrics.storeOpt.capacityGB - 1, Math.max(4, Math.floor(metrics.storeOpt.capacityGB * 0.45)));
        setBufferGB((prev) => {
          if (prev >= passiveCap) return prev;
          return Math.min(passiveCap, round1(prev + (metrics.dataProdGB / 24) * 0.25 * speedMult));
        });
      }

      // Gradual orbital wear on equipped sensors every ~10 mission days (scaled by difficulty & flight computer resilience)
      if (!safeMode && missionDay - lastWearDayRef.current >= 10 && config.instruments.length > 0) {
        lastWearDayRef.current = missionDay;
        const wearMult = DIFFICULTY_PROFILES[difficulty].wearMult;
        const policyWear = config.policy === 'science' ? 3 : config.policy === 'protect' ? 1 : 2;
        const shieldAdjust = config.radiationShield || metrics.computerOpt.resilienceBonus >= 0.5 ? 1 : 0;
        const baseWear = Math.max(1, Math.round((policyWear - shieldAdjust) * wearMult));
        onUpdateSensorDurability?.((prev) => {
          const next = { ...prev };
          config.instruments.forEach((id) => {
            const cur = getSensorDurability(prev, id);
            next[id] = Math.max(20, cur - baseWear);
          });
          return next;
        });
      }

      // Trigger orbital problems scaled by mission level (Solar/Debris + Lv.2+ Thermal)
      if (anomaliesTriggered === 0 && missionDay > 12) {
        setAnomaliesTriggered(1);
        soundEngine.playSfx('warning');
        setOrbitAnomaly({
          kind: 'debris',
          title: 'Space Debris & Micrometeoroid Swarm!',
          detail: config.radiationShield
            ? 'Tracking high-velocity orbital debris crossing your swath! Armor plates will soften impacts, or close sensor shutters.'
            : 'High-velocity space debris cloud crossing your orbital track! Leaving sensor optics open risks serious durability damage.',
          safeLabel: 'Close Sensor Shutters & Evade (+30 EXP)',
          safeEffect: 'Protects sensor durability (-2% minor scuff), uses 10% battery.',
          riskLabel: 'Hold Swath & Scan Through Debris (+30 EXP)',
          riskEffect: config.radiationShield
            ? '+130 Bonus Science, Armor limits sensor wear to -7% health.'
            : '+140 Bonus Science, debris impacts degrade equipped sensors by -16% health.',
        });
      } else if (anomaliesTriggered === 1 && missionDay > 26) {
        setAnomaliesTriggered(2);
        soundEngine.playSfx('warning');
        setOrbitAnomaly({
          kind: 'solar',
          title: 'Coronal Mass Ejection (CME) Radiation Surge',
          detail: config.radiationShield
            ? 'Proton flux rising. Your Radiation Shield absorbs most charged particles, allowing steady sensor calibration.'
            : 'Elevated solar proton flux detected. Without hardened shielding, sensors risk bit-flips unless placed in Safe Mode.',
          safeLabel: 'Enter Sun-Pointing Safe Mode (+30 EXP)',
          safeEffect: 'Protects instruments (+0% damage), consumes 12% battery during recovery.',
          riskLabel: 'Keep All Earth Sensors Active (+30 EXP)',
          riskEffect: config.radiationShield
            ? 'Shield blocks surge cleanly (+120 Bonus Science!).'
            : 'Captures +140 Bonus Science, degrades bus health by -14% and sensors by -6%.',
        });
      } else if (mission.requiredLevel >= 2 && anomaliesTriggered === 2 && missionDay > 42) {
        setAnomaliesTriggered(3);
        soundEngine.playSfx('warning');
        setOrbitAnomaly({
          kind: 'thermal',
          title: 'Thermal Radiator & Reaction Wheel Drift',
          detail:
            'Deep-space temperature swing + solar wind torque are saturating attitude wheels. Pick a recovery maneuver!',
          safeLabel: 'Dump Wheel Momentum & Cool Bus (+35 EXP)',
          safeEffect: 'Restores sensor alignment cleanly, costs 10% battery.',
          riskLabel: 'Push High-Gain Scan Through Drift (+35 EXP)',
          riskEffect:
            metrics.thermalQuality >= 0.99
              ? 'Active thermal loop holds steady (+110 Bonus Science!).'
              : 'Grabs +110 Science, costs -12% bus health and -8% sensor durability.',
        });
      }
      // Random Space Weather lifecycle & intermittent spawns during orbital operations
      if (spaceWeather) {
        if (spaceWeather.remainingTicks <= 1) {
          lastWeatherDayRef.current = missionDay;
          setOrbitLog((prev) => [
            `${spaceWeather.title} front cleared — nominal 100% RF link restored.`,
            ...prev.slice(0, 9),
          ]);
          setSpaceWeather(null);
        } else {
          setSpaceWeather((prev) =>
            prev ? { ...prev, remainingTicks: prev.remainingTicks - 1 } : null,
          );
        }
      } else if (
        !safeMode &&
        missionDay >= 8 &&
        missionDay < mission.durationDays - 5
      ) {
        const daysSinceLast = missionDay - lastWeatherDayRef.current;
        const shouldSpawn =
          (weatherEventsTriggered === 0 && missionDay >= 14) ||
          (daysSinceLast >= 10 && Math.random() < 0.24);
        if (shouldSpawn) {
          const tpl =
            SPACE_WEATHER_TEMPLATES[
              (weatherEventsTriggered + Math.floor(Math.random() * SPACE_WEATHER_TEMPLATES.length)) %
                SPACE_WEATHER_TEMPLATES.length
            ];
          const direction = antennaDeg >= 0 ? -1 : 1;
          const targetDeg = clamp(
            direction * (22 + Math.floor(Math.random() * 17)),
            -40,
            40,
          );
          soundEngine.playSfx('warning');
          setWeatherEventsTriggered((c) => c + 1);
          setSpaceWeather({
            id: `${tpl.id}-${missionDay}`,
            title: tpl.title,
            phenomenon: tpl.phenomenon,
            detail: tpl.detail,
            targetAntennaDeg: targetDeg,
            baseDegradationPct: tpl.baseDegradationPct,
            remainingTicks: 14,
            stabilized: false,
          });
          setActiveToast({
            title: `Space Weather Alert: ${tpl.title}`,
            body: `Downlink quality degraded! Use ADCS [Z]/[C] in Command Deck to re-orient antenna toward ${targetDeg > 0 ? `+${targetDeg}°` : `${targetDeg}°`}.`,
          });
          setOrbitLog((prev) => [
            `SPACE WEATHER: ${tpl.title} (${tpl.phenomenon})! Re-orient antenna with ADCS toward ${targetDeg > 0 ? `+${targetDeg}°` : `${targetDeg}°`}.`,
            ...prev.slice(0, 9),
          ]);
        }
      }
    }, 850);

    return () => window.clearInterval(timer);
  }, [
    phase,
    inOrbitOps,
    orbitAnomaly,
    speedMult,
    subSat.inSunlight,
    safeMode,
    metrics,
    anomaliesTriggered,
    missionDay,
    mission.durationDays,
    mission.requiredLevel,
    config.radiationShield,
    config.policy,
    config.instruments,
    onUpdateSensorDurability,
    spaceWeather,
    weatherEventsTriggered,
    antennaDeg,
  ]);

  const worldLabel =
    config.orbit === 'LUNAR' ? 'Moon' : config.orbit === 'MARS' ? 'Mars' : 'Earth';

  const activeHotspots = useMemo(() => {
    if (config.orbit === 'LUNAR') return LUNAR_HOTSPOTS;
    if (config.orbit === 'MARS') return MARS_HOTSPOTS;
    return useLiveTargets && liveHotspots && liveHotspots.length > 0 ? liveHotspots : EARTH_HOTSPOTS;
  }, [config.orbit, useLiveTargets, liveHotspots]);

  const activeHotspot = useMemo(
    () => activeHotspots.find((h) => h.id === subSat.activeHotspotId) || null,
    [activeHotspots, subSat.activeHotspotId],
  );
  const activeStation = useMemo(
    () => GROUND_STATIONS.find((g) => g.id === subSat.activeStationId) || null,
    [subSat.activeStationId],
  );

  const handleScanHotspot = useCallback(() => {
    if (!activeHotspot || safeMode || scannedIds.includes(activeHotspot.id)) return;
    if (bufferGB >= metrics.storeOpt.capacityGB - 0.5) {
      soundEngine.playSfx('warning');
      setOrbitLog((prev) => [
        `SSD Buffer full (${metrics.storeOpt.capacityGB} GB)! Pass over a green Ground Station dish and press [E] to beam data.`,
        ...prev.slice(0, 9),
      ]);
      return;
    }

    const activeGoals = new Set(
      metrics.poweredInstruments.filter((p) => p.online).flatMap((p) => p.inst.goals),
    );
    const matchedGoals = activeHotspot.requiredGoals.filter((g) => activeGoals.has(g));
    const matchRatio =
      matchedGoals.length > 0
        ? 0.45 + 0.55 * (matchedGoals.length / activeHotspot.requiredGoals.length)
        : 0.3;

    const durMult = getDurabilityScienceMultiplier(metrics.avgSensorDurabilityPct);
    const commsScienceBonus = 1 + (save.upgrades.comms || 0) * 0.12;
    const pointingMult = 1 + (metrics.pointingBonusPct || 0) / 100;
    const pts = Math.round(
      activeHotspot.sciencePoints * matchRatio * metrics.thermalQuality * durMult * commsScienceBonus * pointingMult,
    );
    soundEngine.playSfx('scan');
    setScanningPulse(performance.now());
    setScannedIds((prev) => [...prev, activeHotspot.id]);
    setSciencePoints((s) => s + pts);
    setBufferGB((b) => Math.min(metrics.storeOpt.capacityGB, round1(b + activeHotspot.dataSizeGB)));

    // Operational scan wear on equipped sensors (-2% per capture)
    if (config.instruments.length > 0) {
      onUpdateSensorDurability?.((prev) => {
        const next = { ...prev };
        config.instruments.forEach((id) => {
          next[id] = Math.max(20, getSensorDurability(prev, id) - 2);
        });
        return next;
      });
    }

    setActiveToast({
      title: `Scanned: ${activeHotspot.name} (+${pts} Sci)`,
      body:
        metrics.avgSensorDurabilityPct < 75
          ? `${activeHotspot.fact} (Sensor wear at ${metrics.avgSensorDurabilityPct}% — maintain in R&D Lab for +${Math.round((1 - durMult) * 100)}% more science!)`
          : activeHotspot.fact,
    });
    setOrbitLog((prev) => [
      `Scanned ${activeHotspot.name} (${matchedGoals.length}/${activeHotspot.requiredGoals.length} bands · ${metrics.avgSensorDurabilityPct}% sensor health) -> +${pts} pts`,
      ...prev.slice(0, 9),
    ]);
  }, [
    activeHotspot,
    safeMode,
    scannedIds,
    bufferGB,
    metrics,
    save.upgrades.comms,
    config.instruments,
    onUpdateSensorDurability,
  ]);

  const handleDownlink = useCallback(() => {
    if (!activeStation || bufferGB <= 0.5) return;
    const qualityFactor = linkQualityPct / 100;
    const rawTransfer = Math.max(12, metrics.downlinkGB * 0.45 * activeStation.bandBoost);
    const transferAmt = Math.min(bufferGB, Math.max(2.5, round1(rawTransfer * qualityFactor)));
    const degradedLink = Boolean(spaceWeather && !spaceWeather.stabilized && linkQualityPct < 70);
    soundEngine.playSfx(degradedLink ? 'warning' : 'downlink');
    setDownlinkActive(true);
    window.setTimeout(() => setDownlinkActive(false), 950);

    setBufferGB((b) => Math.max(0, round1(b - transferAmt)));
    setDownlinkedGB((d) => round1(d + transferAmt));

    const newFixes = Math.max(0, scannedIds.length - downlinkedTargetsCount);
    if (newFixes > 0) {
      const bonusXp = newFixes * 20;
      setDownlinkedTargetsCount(scannedIds.length);
      onGrantXp?.(bonusXp, `Sent ${newFixes} Earth scan(s) to Earth Office`);
      setOfficeFixMsg(
        degradedLink
          ? `Weak link (${linkQualityPct}%) throttled transfer to ${round1(transferAmt)} GB — re-orient ADCS antenna toward ${spaceWeather?.targetAntennaDeg}°! (+${bonusXp} EXP)`
          : `Earth Office at ${activeStation.name} received your satellite data! Rescue & climate teams fixed ${newFixes} Earth hazard(s) (+${bonusXp} EXP)!`,
      );
      setXpToast(`+${bonusXp} EXP · Earth Office Solved ${newFixes} Problem(s)!`);
      window.setTimeout(() => setXpToast(null), 3200);
    } else {
      setOfficeFixMsg(
        degradedLink
          ? `Space weather throttled beam to ${round1(transferAmt)} GB (${linkQualityPct}% link). Align ADCS [Z]/[C] to restore full rate!`
          : `Earth Office at ${activeStation.name} received ${round1(transferAmt)} GB of orbital telemetry!`,
      );
    }

    setOrbitLog((prev) => [
      degradedLink
        ? `Throttled downlink (${linkQualityPct}% link): ${round1(transferAmt)} GB sent to ${activeStation.name}. Steer ADCS antenna toward ${spaceWeather?.targetAntennaDeg}°!`
        : `Sent ${round1(transferAmt)} GB to Earth Office (${activeStation.name}) at ${linkQualityPct}% link quality!`,
      ...prev.slice(0, 9),
    ]);
  }, [
    activeStation,
    bufferGB,
    metrics.downlinkGB,
    scannedIds.length,
    downlinkedTargetsCount,
    onGrantXp,
    linkQualityPct,
    spaceWeather,
  ]);

  // Keyboard shortcuts during Earth Sensor Ops: [A/D] or Arrows steer swath beam, [Z/C] slew ADCS antenna, [Space] capture scan, [E/B] downlink
  useEffect(() => {
    if (phase !== 'operations' || !inOrbitOps || orbitAnomaly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (e.code === 'ArrowLeft') e.preventDefault();
        setSwathSlewDeg((v) => clamp(v - 4, -24, 24));
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (e.code === 'ArrowRight') e.preventDefault();
        if (e.code === 'KeyD' && activeStation && bufferGB > 0.5) {
          handleDownlink();
        } else {
          setSwathSlewDeg((v) => clamp(v + 4, -24, 24));
        }
      } else if (e.code === 'KeyZ') {
        setAntennaDeg((v) => clamp(v - adcsStepDeg, -45, 45));
      } else if (e.code === 'KeyC') {
        setAntennaDeg((v) => clamp(v + adcsStepDeg, -45, 45));
      } else if (e.code === 'Space') {
        e.preventDefault();
        handleScanHotspot();
      } else if (e.code === 'KeyB' || e.code === 'KeyE') {
        handleDownlink();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    phase,
    inOrbitOps,
    orbitAnomaly,
    handleScanHotspot,
    handleDownlink,
    activeStation,
    bufferGB,
    adcsStepDeg,
  ]);

  const handleOrbitAnomalyChoice = (risky: boolean) => {
    if (!orbitAnomaly) return;
    const crisisXp = mission.requiredLevel >= 2 ? 35 : 30;
    const applySensorHit = (lossPct: number) => {
      if (lossPct <= 0 || config.instruments.length === 0) return;
      onUpdateSensorDurability?.((prev) => {
        const next = { ...prev };
        config.instruments.forEach((id) => {
          next[id] = Math.max(20, getSensorDurability(prev, id) - lossPct);
        });
        return next;
      });
    };

    if (orbitAnomaly.kind === 'debris') {
      if (risky) {
        const loss = config.radiationShield ? 7 : 16;
        const pts = config.radiationShield ? 130 : 140;
        soundEngine.playSfx(config.radiationShield ? 'scan' : 'warning');
        setSciencePoints((s) => s + pts);
        applySensorHit(loss);
        setOrbitLog((prev) => [
          `Debris field scan: +${pts} Sci, sensors degraded -${loss}% (maintain in R&D Lab).`,
          ...prev.slice(0, 9),
        ]);
      } else {
        soundEngine.playSfx('beep');
        setBatteryPct((b) => Math.max(15, b - 10));
        applySensorHit(2);
        setOrbitLog((prev) => [
          `Shutters closed for debris evasion (-2% minor scuff, +${crisisXp} EXP).`,
          ...prev.slice(0, 9),
        ]);
      }
    } else if (risky) {
      if (config.radiationShield || (orbitAnomaly.kind === 'thermal' && metrics.thermalQuality >= 0.99)) {
        soundEngine.playSfx('scan');
        setSciencePoints((s) => s + 120);
        setOrbitLog((prev) => [`Subsystem handled crisis cleanly (+120 Sci, +${crisisXp} EXP).`, ...prev.slice(0, 9)]);
      } else {
        soundEngine.playSfx('warning');
        setSciencePoints((s) => s + 140);
        setHealthPct((h) => Math.max(40, h - 14));
        const sensorLoss = orbitAnomaly.kind === 'solar' ? 6 : 8;
        applySensorHit(sensorLoss);
        setOrbitLog((prev) => [
          `High-risk crisis capture (+140 Sci, -14% bus health, -${sensorLoss}% sensor durability, +${crisisXp} EXP).`,
          ...prev.slice(0, 9),
        ]);
      }
    } else {
      soundEngine.playSfx('beep');
      setBatteryPct((b) => Math.max(15, b - 12));
      setOrbitLog((prev) => [`Safe recovery prevented hardware damage (+${crisisXp} EXP).`, ...prev.slice(0, 9)]);
    }
    onGrantXp?.(crisisXp, orbitAnomaly.title);
    setXpToast(`+${crisisXp} EXP · Orbit Crisis Fixed!`);
    window.setTimeout(() => setXpToast(null), 2800);
    setOrbitAnomaly(null);
  };

  const generateFinalReport = () => {
    const coveredGoals = mission.goals.filter((g) =>
      metrics.poweredInstruments.some((p) => p.online && p.inst.goals.includes(g)),
    );
    const goalCovPct = (coveredGoals.length / Math.max(1, mission.goals.length)) * 100;
    const scanBonus = clamp((scannedIds.length / 4) * 30, 0, 30);
    const pointingLift = Math.round((metrics.pointingBonusPct || 0) * 0.25);
    const sciencePillar = clamp(Math.round(goalCovPct * 0.72 + scanBonus + pointingLift), 15, 100);

    const tolM = Math.max(0.16, metrics.comToleranceM || 0.16);
    const comPenalty = metrics.comOffsetM > tolM + 0.08 ? 18 : metrics.comOffsetM > tolM ? 8 : 0;
    const engineeringPillar = clamp(
      Math.round(100 - comPenalty - (metrics.structuralMassKg > metrics.structuralLimitKg ? 30 : 0)),
      25,
      100,
    );

    const pwrMargin =
      metrics.orbitAvgGenW >= metrics.totalLoadW
        ? 100
        : (metrics.orbitAvgGenW / Math.max(1, metrics.totalLoadW)) * 100;
    const linkMargin =
      metrics.downlinkGB >= metrics.dataProdGB
        ? 100
        : (metrics.downlinkGB / Math.max(1, metrics.dataProdGB)) * 100;
    const resourcesPillar = clamp(Math.round(pwrMargin * 0.55 + linkMargin * 0.45), 20, 100);

    const reliabilityPillar = clamp(
      Math.round(
        healthPct * 0.4 +
          metrics.thermalQuality * 28 +
          metrics.avgSensorDurabilityPct * 0.24 +
          metrics.computerOpt.resilienceBonus * 8,
      ),
      30,
      100,
    );

    const budgetRatio = metrics.costM / Math.max(1, metrics.effectiveBudgetM);
    const focusCostBoost = config.objectiveFocus === 'low-cost' && budgetRatio <= 0.8 ? 4 : 0;
    const financialPillar = clamp(
      Math.round((budgetRatio <= 0.85 ? 98 : budgetRatio <= 1 ? 85 : 40) + focusCostBoost),
      20,
      100,
    );

    const downlinkBonus = downlinkedGB >= 15 ? 18 : downlinkedGB > 0 ? 9 : 0;
    const weatherOpsBonus = weatherEventsResolved > 0 ? Math.min(8, weatherEventsResolved * 4) : 0;
    const operationsPillar = clamp(
      Math.round(68 + downlinkBonus + weatherOpsBonus + (batteryPct > 40 ? 10 : 0)),
      30,
      100,
    );

    const pillars: Array<{ label: string; score: number; weight: number }> = [
      { label: 'Science Return', score: sciencePillar, weight: 28 },
      { label: 'Engineering & ADCS Balance', score: engineeringPillar, weight: 18 },
      { label: 'Power & Data Link Margin', score: resourcesPillar, weight: 20 },
      { label: 'Thermal, CPU & Durability', score: reliabilityPillar, weight: 12 },
      { label: 'Budget & Mass Efficiency', score: financialPillar, weight: 12 },
      { label: 'Orbit & Ground Ops', score: operationsPillar, weight: 10 },
    ];
    if (playMode === 'coop') {
      // Shift weights slightly to include Team Coordination (10%)
      pillars[0].weight = 25;
      pillars[2].weight = 18;
      pillars[4].weight = 10;
      pillars.push({ label: 'Team Coordination & Priorities', score: coordinationScore, weight: 9 });
    }

    const totalWeight = pillars.reduce((s, p) => s + p.weight, 0) || 100;
    const totalScore = Math.round(
      pillars.reduce((s, p) => s + (p.score * p.weight) / totalWeight, 0),
    );
    const outcome: 'success' | 'partial' | 'fail' =
      totalScore >= 78 && coveredGoals.length === mission.goals.length
        ? 'success'
        : totalScore >= 55
          ? 'partial'
          : 'fail';
    const stars = totalScore >= 88 ? 3 : totalScore >= 72 ? 2 : outcome !== 'fail' ? 1 : 0;
    const rank =
      totalScore >= 90
        ? 'Flight Director'
        : totalScore >= 78
          ? 'Mission Specialist'
          : totalScore >= 60
            ? 'Flight Engineer'
            : 'Academy Cadet';
    const credits =
      outcome === 'success'
        ? mission.rewardCredits + stars * 15
        : outcome === 'partial'
          ? Math.round(mission.rewardCredits * 0.5)
          : 15;

    // Cause-and-Effect Subsystem Audit (explains WHY decisions helped or hurt)
    const causeEffects: Array<{ subsystem: string; verdict: 'PASS' | 'WARN' | 'LOSS'; reason: string }> = [
      {
        subsystem: 'Science & ADCS Pointing',
        verdict: coveredGoals.length === mission.goals.length ? 'PASS' : 'LOSS',
        reason:
          coveredGoals.length === mission.goals.length
            ? `Covered ${coveredGoals.length}/${mission.goals.length} science goals with ${metrics.adcsOpt.name} (+${metrics.pointingBonusPct}% pointing yield) and scanned ${scannedIds.length} targets.`
            : `Only ${coveredGoals.length}/${mission.goals.length} mission goals had powered sensors — unpowered or missing bands cost science points.`,
      },
      {
        subsystem: 'Power & Eclipse Battery',
        verdict: metrics.orbitAvgGenW >= metrics.totalLoadW && metrics.batteryReservePct >= 15 ? 'PASS' : 'WARN',
        reason:
          metrics.orbitAvgGenW >= metrics.totalLoadW
            ? `Solar arrays (${round1(metrics.orbitAvgGenW)} W avg) covered load (${round1(metrics.totalLoadW)} W) with ${metrics.batteryReservePct}% eclipse reserve.`
            : `Power deficit (${round1(metrics.orbitAvgGenW)} W vs ${round1(metrics.totalLoadW)} W needed) risked instrument brownouts.`,
      },
      {
        subsystem: 'Data, Onboard CPU & Radio',
        verdict: metrics.downlinkGB >= metrics.dataProdGB ? 'PASS' : 'WARN',
        reason: `${metrics.computerOpt.name} trimmed ${round1(metrics.rawDataProdGB)} GB/d to ${round1(metrics.dataProdGB)} GB/d; ${metrics.commsOpt.name} delivered ${round1(metrics.downlinkGB)} GB/d (${downlinkedGB} GB beamed).${weatherEventsTriggered > 0 ? ` Stabilized ${weatherEventsResolved}/${weatherEventsTriggered} Space Weather interference event(s) via ADCS antenna alignment.` : ''}`,
      },
      {
        subsystem: 'CoM Balance & Propellant Lifetime',
        verdict: metrics.comOffsetM <= tolM && metrics.dvAvailable >= metrics.dvNeeded ? 'PASS' : 'WARN',
        reason: `Offset ${metrics.comOffsetM.toFixed(2)}m (limit ${tolM.toFixed(2)}m) with ${round1(metrics.dvAvailable)}/${round1(metrics.dvNeeded)} m/s Δv for a ${metrics.lifetimeMonths}-month lifetime.`,
      },
    ];
    if (playMode === 'coop') {
      causeEffects.push({
        subsystem: 'Team Coordination',
        verdict: coordinationScore >= 75 ? 'PASS' : 'WARN',
        reason: `Team ${teamMembers.map((m) => m.name).join(', ')} achieved ${coordinationScore}% role & priority alignment.`,
      });
    }

    const recommendations: string[] = [];
    if (coveredGoals.length < mission.goals.length) {
      recommendations.push(
        `Add sensors covering all mission objectives (${mission.goals.map((g) => GOAL_LABELS[g]).join(', ')}).`,
      );
    }
    if (metrics.thermalQuality < 0.99) {
      recommendations.push('Upgrade Thermal Control to reach 100% sensor calibration quality.');
    }
    if (metrics.downlinkGB < metrics.dataProdGB) {
      recommendations.push('Upgrade radio to X-Band/Ka-Band OR equip Edge-AI Computer compression to eliminate bottlenecks.');
    }
    if (scannedIds.length < 3) {
      recommendations.push('Scan more targets during orbital passes with [Space] before beaming to Ground Stations.');
    }
    if (metrics.avgSensorDurabilityPct < 80) {
      recommendations.push(
        `Sensor durability dropped to ${metrics.avgSensorDurabilityPct}% — perform Maintenance in the R&D Lab to restore 100% scan yield.`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push('Nominal architecture across power, thermal, mass, compression, ADCS, and scanning!');
    }

    const xpEarned =
      outcome === 'success'
        ? mission.rewardXp
        : outcome === 'partial'
          ? Math.round(mission.rewardXp * 0.6)
          : Math.round(mission.rewardXp * 0.25);

    const roomPlayersList = room?.players || [];
    const effectiveCompTeams = room ? room.competitiveTeams : competitiveTeams;
    const effectiveCompIdx =
      room && playMode === 'competitive'
        ? (room.players.find((p) => p.clientId === localClientId)?.teamIndex ?? activeCompetitiveIdx)
        : activeCompetitiveIdx;

    const activeActorName =
      playMode === 'competitive'
        ? effectiveCompTeams[effectiveCompIdx]?.teamName || `Team ${effectiveCompIdx + 1}`
        : playMode === 'coop'
          ? (roomPlayersList.length > 0 ? roomPlayersList : teamMembers)
              .map((m) => m.name)
              .slice(0, 2)
              .join(' & ') +
            ((roomPlayersList.length > 0 ? roomPlayersList : teamMembers).length > 2
              ? ` +${(roomPlayersList.length > 0 ? roomPlayersList : teamMembers).length - 2}`
              : '')
          : levelInfo.title;

    soundEngine.playSfx(outcome === 'success' ? 'success' : 'beep');
    setReportData({
      pillars,
      totalScore,
      rank,
      stars,
      credits,
      xpEarned,
      outcome,
      recommendations,
      causeEffects,
    });
    onGrantXp?.(xpEarned, `${mission.name} Completed`);
    onRecordLeaderboard?.({
      id: `lb-${Date.now()}`,
      playerOrTeam: activeActorName,
      playMode,
      difficulty,
      missionId: mission.id,
      missionName: mission.name,
      score: totalScore,
      sciencePts: sciencePoints,
      costM: round1(metrics.costM),
      efficiencyScore: financialPillar,
      stars,
      timestamp: new Date().toISOString(),
    });
    if (playMode === 'competitive') {
      const compPatch: Partial<CompetitiveTeamRun> = {
        config,
        score: totalScore,
        sciencePts: sciencePoints,
        costM: round1(metrics.costM),
        wetMassKg: round1(metrics.wetMassKg),
        status: metrics.status,
        outcome,
      };
      onRecordCompetitiveRun?.(effectiveCompIdx, compPatch);
      onUpdateRoomTeam?.(effectiveCompIdx, compPatch);
    }
    onRecordResult(
      {
        id: `sat-${Date.now()}`,
        missionId: mission.id,
        missionName: mission.name,
        mode: 'satellite',
        outcome,
        score: totalScore,
        stars,
        sciencePct: sciencePillar,
        costM: round1(metrics.costM),
        timestamp: new Date().toISOString(),
      },
      credits,
      stars,
      mission.id === 'zero',
    );
    setShowEnding(true);
    setPhase('report');
  };

  const generateFinalReportRef = useRef(generateFinalReport);
  generateFinalReportRef.current = generateFinalReport;

  // Auto-finish Phase 4 when the full orbital mission duration elapses cleanly
  useEffect(() => {
    if (
      phase === 'operations' &&
      inOrbitOps &&
      !orbitAnomaly &&
      missionDay >= mission.durationDays &&
      !autoCompletedRef.current
    ) {
      autoCompletedRef.current = true;
      const doneTimer = window.setTimeout(() => {
        generateFinalReportRef.current();
      }, 650);
      return () => window.clearTimeout(doneTimer);
    }
  }, [phase, inOrbitOps, orbitAnomaly, missionDay, mission.durationDays]);

  const jumpToProblem = (probId: string) => {
    soundEngine.playSfx('click');
    if (probId === 'prob-sensors') {
      setDesignStep('sensors');
      setHighlightPart('bus');
    } else if (probId === 'prob-comms') {
      setDesignStep('parts');
      setHighlightPart('comms');
    } else if (probId === 'prob-power') {
      const tolM = Math.max(0.16, metrics.comToleranceM || 0.16);
      const tipped =
        metrics.comOffsetM > tolM || Math.abs(metrics.leftMassKg - metrics.rightMassKg) > 30;
      setDesignStep(tipped ? 'sensors' : 'parts');
      setHighlightPart(tipped ? 'bus' : 'power');
    } else if (probId === 'prob-shield-therm') {
      setDesignStep('parts');
      setHighlightPart(config.radiationShield ? 'therm' : 'shield');
    } else if (probId === 'prob-fairing') {
      setDesignStep('order');
      setHighlightPart('comms');
    } else if (probId === 'prob-prop-lv') {
      setDesignStep(metrics.dvAvailable < metrics.dvNeeded ? 'parts' : 'orbit');
      setHighlightPart('prop');
    }
  };

  const jumpToWarningCode = (code: string) => {
    soundEngine.playSfx('click');
    setPhase('design');
    if (code.startsWith('SCI')) {
      setDesignStep('sensors');
      setHighlightPart('bus');
    } else if (code.startsWith('SEQ')) {
      setDesignStep('order');
      setHighlightPart('comms');
    } else if (code.startsWith('LCH') || code.startsWith('ORB')) {
      setDesignStep('orbit');
      setHighlightPart('prop');
    } else if (code.startsWith('RAD')) {
      setDesignStep('parts');
      setHighlightPart('shield');
    } else if (code.startsWith('PWR') || code.startsWith('BAT')) {
      setDesignStep('parts');
      setHighlightPart('power');
    } else if (code.startsWith('THM')) {
      setDesignStep('parts');
      setHighlightPart('therm');
    } else if (code.startsWith('DAT')) {
      setDesignStep('parts');
      setHighlightPart('store');
    } else if (code.startsWith('COM')) {
      setDesignStep('parts');
      setHighlightPart('comms');
    } else if (code.startsWith('PRP')) {
      setDesignStep('parts');
      setHighlightPart('prop');
    } else if (code.startsWith('FIN')) {
      if (config.instruments.length > mission.goals.length) {
        setDesignStep('sensors');
        setHighlightPart('bus');
      } else {
        setDesignStep('parts');
        setHighlightPart('comms');
      }
    } else {
      setDesignStep('parts');
      setHighlightPart('bus');
    }
  };

  const handleBlueprintSelectPart = (part: string) => {
    soundEngine.playSfx('click');
    setHighlightPart(part);
    if (part.startsWith('inst:')) {
      setDesignStep('sensors');
    } else {
      setDesignStep('parts');
    }
  };

  const tabs: Array<{ id: SatPhase; label: string }> = [
    { id: 'briefing', label: '1. Briefing' },
    { id: 'design', label: '2. Craft Satellite' },
    { id: 'resources', label: '3. Pre-Flight & Launch' },
    { id: 'operations', label: '4. Orbit Sensor Ops' },
    { id: 'report', label: '5. Mission Report' },
  ];

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 flex flex-col">
      {/* Header + Phase Stepper */}
      <header className="border-b border-slate-800 bg-[#0A101D] px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
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
            <h1 className="text-base font-semibold text-white flex items-center gap-2">
              <Satellite className="w-4 h-4 text-cyan-400" />
              {mission.name}
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              {mission.target} · {DIFFICULTY_PROFILES[difficulty].label} ·{' '}
              {sandboxMode
                ? 'Sandbox'
                : playMode === 'coop'
                  ? `Co-op (${room ? `${room.players.filter((p) => p.online).length} Online · Room ${room.code}` : `${teamMembers.length}P`})`
                  : playMode === 'competitive'
                    ? `Match (${room ? `Room ${room.code} · ${room.competitiveTeams[room.players.find((p) => p.clientId === localClientId)?.teamIndex ?? 0]?.teamName || 'Team 1'}` : competitiveTeams[activeCompetitiveIdx]?.teamName || 'Team 1'})`
                    : 'Solo'}{' '}
              · Budget {sandboxMode ? 'Unlimited' : `$${metrics.effectiveBudgetM}M`}
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-1.5" aria-label="Mission phases">
          {tabs.map((t) => {
            const locked =
              (t.id === 'operations' && phase !== 'operations' && phase !== 'report') ||
              (t.id === 'report' && !reportData);
            const active = phase === t.id;
            return (
              <button
                key={t.id}
                disabled={locked}
                onClick={() => {
                  soundEngine.playSfx('click');
                  setPhase(t.id);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors border ${
                  active
                    ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200'
                    : locked
                      ? 'border-slate-800/60 bg-slate-900/40 text-slate-600 cursor-not-allowed'
                      : 'border-slate-800 bg-[#111A2E] text-slate-300 hover:border-slate-600'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              soundEngine.playSfx('click');
              setShowDesignModal('save');
            }}
            className="rounded-lg border border-slate-700 bg-[#0D1526] hover:border-cyan-400 px-2.5 py-1.5 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden md:inline">Save / Compare</span>
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.playSfx('click');
              setShowDesignModal('leaderboard');
            }}
            className="rounded-lg border border-slate-700 bg-[#0D1526] hover:border-amber-400 px-2.5 py-1.5 text-xs font-medium text-amber-300 flex items-center gap-1.5 transition-colors"
            aria-label="Mission Rankings"
          >
            <Trophy className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Rankings</span>
          </button>
          <div className="hidden sm:block rounded-lg border border-cyan-800/60 bg-[#0D1526] px-2.5 py-1.5 text-xs font-mono tabular-nums text-cyan-300">
            LV.{levelInfo.level} · {levelInfo.xp} EXP
          </div>
          <button
            onClick={onOpenAcademy}
            className="rounded-lg border border-cyan-800/70 bg-cyan-950/40 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-900/50 transition-colors"
          >
            Academy (F1)
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
        <div className="border-b border-violet-700/50 bg-violet-950/30 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            <span className="font-mono font-semibold text-violet-300">
              STORY CH.{activeChapter.chapterNum} · {activeChapter.title}:
            </span>{' '}
            <span className="text-slate-200">{activeChapter.synopsis}</span>
          </div>
          <span className="font-mono text-[11px] text-violet-300">
            {activeChapter.actLabel}
          </span>
        </div>
      )}

      {/* Live Commander Guidance Bubble across all Satellite Phases */}
      <div className="px-4 lg:px-6 pt-3 max-w-[1640px] w-full mx-auto">
        <CommanderBubble
          tone={
            phase === 'briefing'
              ? 'cyan'
              : phase === 'design'
                ? missionProblems.every((p) => p.fixed)
                  ? 'emerald'
                  : 'amber'
                : phase === 'resources'
                  ? metrics.status === 'NO-GO'
                    ? 'amber'
                    : 'emerald'
                  : phase === 'operations'
                    ? orbitAnomaly
                      ? 'amber'
                      : 'cyan'
                    : reportData?.outcome === 'success'
                      ? 'emerald'
                      : 'amber'
          }
          message={
            phase === 'briefing'
              ? `Welcome to Satellite Lab! "${mission.name}" needs a balanced spacecraft to scan ${worldLabel} and beam science back to Ground Control.`
              : phase === 'design'
                ? missionProblems.every((p) => p.fixed)
                  ? 'All Craft Checklist items are green! Press "Continue to Pre-Flight & Launch" on the right.'
                  : 'Follow Steps 1 to 4 below—or tap any "Fix in Step →" button on the Craft Checklist to jump straight to the problem!'
                : phase === 'resources'
                  ? metrics.status === 'NO-GO'
                    ? 'HOLD: Resolve the red NO-GO blocker(s) below or click "Back to Craft Studio" before launching.'
                    : 'All pre-flight checks are clear! Choose "Quick Launch & Orbit" or pilot the launch rocket yourself.'
                  : phase === 'operations' && !inOrbitOps
                    ? `Countdown running! Watch each rocket stage carry your satellite safely into ${metrics.orbit.name}.`
                    : phase === 'operations' && orbitAnomaly
                      ? `Space weather alert! ${orbitAnomaly.title} — choose how to protect your satellite so we can keep scanning!`
                      : phase === 'operations'
                        ? activeHotspot && !scannedIds.includes(activeHotspot.id)
                          ? `Target in range: "${activeHotspot.name}"! Press Capture Sensor Scan [Space] right now!`
                          : activeStation && bufferGB > 0.5
                            ? `Connected to ${activeStation.name}! Press Beam Data to Earth [E] to send your ${bufferGB} GB scans!`
                            : `Aim your blue Sensor Swath Beam with [A]/[D] (or Aim buttons) to catch glowing hotspots, press [Space] to Scan, then press [E] over green Ground Dishes!`
                        : reportData?.outcome === 'success'
                          ? `Mission complete! Your satellite data from ${worldLabel} orbit helped Ground Control respond fast.`
                          : 'Satellite mission complete! Review the feedback below to boost your score and earn more EXP.'
          }
          actionHint={
            phase === 'briefing'
              ? 'Review mission goals and click "Open Satellite Craft Studio".'
              : phase === 'design'
                ? missionProblems.every((p) => p.fixed)
                  ? 'Ready for launch checks! Click "Continue to Pre-Flight & Launch".'
                  : 'Complete the Craft Checklist—tap "Fix →" on any item to jump straight to that step.'
                : phase === 'resources'
                  ? 'Click "Quick Launch & Scan Earth" or pilot the launch rocket yourself.'
                  : phase === 'operations' && !inOrbitOps
                    ? 'Wait a few seconds (or click Skip to Orbit) to activate sensors.'
                    : phase === 'operations'
                      ? `Scanned ${scannedIds.length} target(s) · Sent ${downlinkedGB} GB to Ground Stations. Click "End Orbit & Report" when done!`
                      : 'Take the Space Quiz for bonus credits or return to Hub!'
          }
          nasaFact={
            phase === 'operations'
              ? 'NASA ground stations at Svalbard, Goldstone, Biak, and Canberra catch gigabytes of satellite scans every pass so teams can act quickly.'
              : 'Real NASA satellites balance left and right instruments around the center thrust line so thrusters do not waste fuel fighting spin.'
          }
        />
      </div>

      {/* PHASE 1: BRIEFING & MISSION OBJECTIVE DEFINITION */}
      {phase === 'briefing' && (
        <main className="flex-1 flex items-center justify-center p-4 lg:p-8">
          <div className="w-full max-w-4xl rounded-xl border border-slate-800 bg-[#0D1526] p-6 space-y-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono text-cyan-400 uppercase">
                  Mission Briefing · {mission.difficulty} · {DIFFICULTY_PROFILES[difficulty].label}
                </div>
                <h2 className="text-2xl font-bold text-white mt-1">{mission.name}</h2>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-slate-400">Grant Allocation</div>
                <div className="text-lg font-bold text-emerald-400">
                  {sandboxMode ? 'Sandbox ∞' : `$${metrics.effectiveBudgetM}M`}
                </div>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{mission.briefing}</p>

            {/* Define Mission Objective Focus BEFORE Spacecraft Design */}
            <div className="rounded-xl border border-slate-800 bg-[#111A2E] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
                  1. Define Mission Objective Focus
                </h3>
                <span className="text-[11px] text-slate-400">
                  Shapes scoring weights &amp; design tradeoff guidance
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {OBJECTIVE_FOCUSES.map((f) => {
                  const selected = (config.objectiveFocus || 'balanced') === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        soundEngine.playSfx('snap');
                        setConfig((prev) => ({
                          ...prev,
                          objectiveFocus: f.id as ObjectiveFocus,
                          transfer: f.id === 'rapid-response' ? 'a' : prev.transfer,
                        }));
                      }}
                      className={`rounded-lg border p-3 text-left transition-colors flex flex-col justify-between gap-1.5 ${
                        selected
                          ? 'border-cyan-400 bg-cyan-950/45 text-white'
                          : 'border-slate-800 bg-[#0A101D] text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="text-xs font-semibold">{f.title}</div>
                      <div className="text-[11px] text-slate-400 leading-snug">{f.description}</div>
                      <div className="text-[10px] font-mono text-cyan-300/90 pt-1">{f.tradeoffHint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-4 space-y-2">
                <div className="text-xs font-semibold text-white">Required Science Objectives</div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {mission.goals.map((g) => (
                    <li key={g} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>{GOAL_LABELS[g]}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-4 space-y-2">
                <div className="text-xs font-semibold text-white">Most Critical Resources</div>
                <ul className="space-y-1.5 text-xs text-amber-200 font-mono">
                  {metrics.criticalResources.map((cr) => (
                    <li key={cr}>· {cr}</li>
                  ))}
                </ul>
                <div className="text-[11px] text-slate-400 pt-1">
                  Allowed Orbits: {mission.allowedOrbits.join(' / ')} · +{mission.rewardCredits} CR
                </div>
              </div>

              {/* Optional Random Mission Constraint */}
              <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white">Unexpected Constraint</span>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playSfx('click');
                      const next =
                        RANDOM_MISSION_CONSTRAINTS[
                          Math.floor(Math.random() * RANDOM_MISSION_CONSTRAINTS.length)
                        ];
                      setRandomConstraint((cur) => (cur ? (cur.id === next.id ? null : next) : next));
                    }}
                    className="rounded border border-slate-700 bg-[#0A101D] hover:border-amber-400 px-2 py-0.5 text-[10px] font-mono text-amber-300 flex items-center gap-1"
                  >
                    <Shuffle className="w-3 h-3" />
                    {randomConstraint ? 'Re-roll / Clear' : 'Add Event'}
                  </button>
                </div>
                {randomConstraint ? (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-amber-300">{randomConstraint.title}</div>
                    <p className="text-[11px] text-slate-300 leading-snug">{randomConstraint.detail}</p>
                    <button
                      type="button"
                      onClick={() => setRandomConstraint(null)}
                      className="text-[10px] font-mono text-slate-400 hover:text-white underline"
                    >
                      Disable Random Event
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Optional challenge: add a realistic wind-shear, solar attenuation, DSN maintenance, or budget cap twist.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/25 p-4 text-xs text-cyan-100">
              <span className="font-semibold text-cyan-400">Real NASA Heritage: </span>
              {mission.realAnalog}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playSfx('click');
                  setShowDesignModal('save');
                }}
                className="rounded-lg border border-slate-700 bg-[#111A2E] hover:border-cyan-400 text-slate-200 px-4 py-2.5 text-xs font-semibold flex items-center gap-1.5"
              >
                <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
                Load / Import Saved Blueprint
              </button>
              <button
                onClick={() => {
                  soundEngine.playSfx('snap');
                  setPhase('design');
                }}
                className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-6 py-3 text-sm transition-colors flex items-center gap-2"
              >
                Open Satellite Craft Studio
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </main>
      )}

      {/* PHASE 2: SATELLITE CRAFT STUDIO */}
      {phase === 'design' && (
        <main className="flex-1 flex flex-col gap-4 p-4 lg:p-6 max-w-[1640px] w-full mx-auto">
          {/* Team Co-op Role Bar or Competitive Team Switcher */}
          <TeamControlBar
            playMode={playMode}
            designStep={designStep}
            metrics={metrics}
            room={room}
            localClientId={localClientId}
            connectionStatus={connectionStatus}
            onClaimRoomRole={onClaimRoomRole}
            onSendRoomChat={onSendRoomChat}
            teamMembers={teamMembers}
            activeMemberIdx={activeMemberIdx}
            onSelectMember={setActiveMemberIdx}
            negotiationPicks={negotiationPicks}
            onPickNegotiation={(dilemmaId, choiceId, nextScore) => {
              setNegotiationPicks((prev) => ({ ...prev, [dilemmaId]: choiceId }));
              setCoordinationScore(nextScore);
              onPickRoomNegotiation?.(dilemmaId, choiceId);
            }}
            coordinationScore={coordinationScore}
            competitiveTeams={room ? room.competitiveTeams : competitiveTeams}
            activeCompetitiveIdx={
              room
                ? (room.players.find((p) => p.clientId === localClientId)?.teamIndex ?? activeCompetitiveIdx)
                : activeCompetitiveIdx
            }
            onSelectCompetitiveTeam={handleSwitchCompetitiveTeam}
            onOpenCompare={() => setShowDesignModal('compare')}
          />

          {/* 6-Resource Live Mission Dashboard: Mass, Power, Budget, Data, Comms, Time */}
          <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs font-mono tabular-nums">
            {[
              {
                label: '1. MASS (WET / CAP)',
                value: `${round1(metrics.wetMassKg)} / ${round1(metrics.lvCapacityKg)} kg`,
                ok: metrics.wetMassKg <= metrics.lvCapacityKg,
              },
              {
                label: '2. POWER (AVG / LOAD)',
                value: `${round1(metrics.orbitAvgGenW)} / ${round1(metrics.totalLoadW)} W`,
                ok: metrics.orbitAvgGenW >= metrics.totalLoadW,
              },
              {
                label: '3. BUDGET (COST / CAP)',
                value: sandboxMode ? `$${round1(metrics.costM)}M / ∞` : `$${round1(metrics.costM)}M / $${metrics.effectiveBudgetM}M`,
                ok: sandboxMode || metrics.costM <= metrics.effectiveBudgetM,
              },
              {
                label: '4. DATA (STREAM / SSD)',
                value: `${round1(metrics.dataProdGB)} GB/d · ${metrics.storeOpt.capacityGB} GB`,
                ok: metrics.storageNeedGB <= metrics.storeOpt.capacityGB,
              },
              {
                label: '5. COMMS DOWNLINK',
                value: `${round1(metrics.downlinkGB)} / ${round1(metrics.dataProdGB)} GB/d`,
                ok: metrics.downlinkGB >= metrics.dataProdGB,
              },
              {
                label: '6. TIME & ΔV LIFE',
                value: `${metrics.lifetimeMonths} mo · ${round1(metrics.dvAvailable)}/${round1(metrics.dvNeeded)} m/s`,
                ok: metrics.dvAvailable >= metrics.dvNeeded,
              },
            ].map((res) => (
              <div
                key={res.label}
                className={`rounded-lg border px-3 py-2 ${
                  res.ok
                    ? 'border-slate-800 bg-[#0D1526] text-slate-100'
                    : 'border-amber-600/70 bg-amber-950/25 text-amber-200'
                }`}
              >
                <div className="text-[10px] text-slate-400 truncate">{res.label}</div>
                <div className={`font-bold mt-0.5 truncate ${res.ok ? 'text-cyan-300' : 'text-amber-300'}`}>
                  {res.value}
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* Left Panel: Unified Step-by-Step Craft Checklist + 4 Craft Tabs */}
          <section className="xl:col-span-5 space-y-4 overflow-y-auto xl:max-h-[calc(100vh-180px)] pr-1">
            {/* Unified Step-by-Step Craft Checklist */}
            <div className="rounded-xl border border-amber-500/45 bg-[#0D1526] p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Craft Checklist ({missionProblems.filter((p) => p.fixed).length}/
                  {missionProblems.length} Ready)
                </h2>
                <span className="text-[11px] font-mono text-cyan-300">
                  Solve manually to earn EXP
                </span>
              </div>
              <div className="space-y-1.5">
                {missionProblems.map((prob) => (
                  <div
                    key={prob.id}
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      prob.fixed
                        ? 'border-emerald-700/60 bg-emerald-950/25 text-emerald-200'
                        : 'border-rose-700/60 bg-rose-950/25 text-rose-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold">
                      <span>
                        {prob.fixed ? '✓ ' : '• '}
                        {prob.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[11px] text-amber-300">
                          +{prob.xpReward} EXP
                        </span>
                        {!prob.fixed && (
                          <button
                            onClick={() => jumpToProblem(prob.id)}
                            className="rounded border border-amber-400/70 bg-amber-500/20 hover:bg-amber-500/35 px-2 py-0.5 text-[10px] font-mono text-amber-200 transition-colors"
                          >
                            Fix →
                          </button>
                        )}
                      </div>
                    </div>
                    {!prob.fixed && (
                      <p className="text-[11px] opacity-90 mt-0.5 leading-snug">{prob.hint}</p>
                    )}
                  </div>
                ))}
              </div>
              {/* Live Craft Budget Guardrail */}
              <div
                className={`rounded-lg border px-3 py-2 text-xs font-mono tabular-nums flex flex-wrap items-center justify-between gap-2 ${
                  metrics.costM <= metrics.effectiveBudgetM
                    ? 'border-emerald-700/50 bg-emerald-950/20 text-emerald-300'
                    : 'border-rose-600/70 bg-rose-950/35 text-rose-200'
                }`}
              >
                <span>
                  Craft Budget: ${round1(metrics.costM)}M / ${metrics.effectiveBudgetM}M
                </span>
                <span className="text-[11px]">
                  {metrics.costM <= metrics.effectiveBudgetM
                    ? `$${round1(metrics.effectiveBudgetM - metrics.costM)}M margin left`
                    : `Over by $${round1(metrics.costM - metrics.effectiveBudgetM)}M — trim extra sensors or swap Ka-Band`}
                </span>
              </div>
            </div>

            {/* Clean 4-Step Craft Tabs */}
            <div className="grid grid-cols-4 gap-1.5 rounded-xl border border-slate-800 bg-[#0A101D] p-1.5">
              {[
                { id: 'sensors' as const, label: '1. Sensors' },
                { id: 'parts' as const, label: '2. Core Craft' },
                { id: 'order' as const, label: '3. Order' },
                { id: 'orbit' as const, label: '4. Orbit' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setDesignStep(tab.id);
                  }}
                  className={`rounded-lg py-2 px-1.5 text-[11px] sm:text-xs font-semibold transition-colors ${
                    designStep === tab.id
                      ? 'bg-cyan-500 text-slate-950'
                      : 'text-slate-300 hover:bg-[#111A2E]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Step 1: Science Payload Sensors & Clear Left/Right Bay Balance */}
            {designStep === 'sensors' && (() => {
              const bayDiffKg = Math.abs(metrics.leftMassKg - metrics.rightMassKg);
              const tolM = Math.max(0.16, metrics.comToleranceM || 0.16);
              const isBalanced = metrics.comOffsetM <= tolM && bayDiffKg <= 30;
              const tiltPct = clamp(
                50 + ((metrics.rightMassKg - metrics.leftMassKg) / Math.max(40, metrics.leftMassKg + metrics.rightMassKg)) * 42,
                8,
                92,
              );
              return (
                <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold text-white">
                        Step 1 · Pick Sensors &amp; Balance Bays ({config.instruments.length}/6)
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Keep Left &amp; Right balanced, and watch Sensor Durability % (service worn optics in R&amp;D Lab).
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onOpenMaintenanceLab &&
                        config.instruments.some((id) => getSensorDurability(save.sensorDurability, id) < 85) && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playSfx('click');
                              onOpenMaintenanceLab();
                            }}
                            className="rounded border border-amber-400/70 bg-amber-950/40 hover:bg-amber-500 hover:text-slate-950 px-2 py-1 text-[10px] font-mono font-semibold text-amber-200 transition-colors flex items-center gap-1"
                          >
                            <Wrench className="w-3 h-3" />
                            Maintain
                          </button>
                        )}
                      <span
                        className={`font-mono text-[11px] px-2 py-1 rounded border shrink-0 ${
                          isBalanced
                            ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
                            : 'border-amber-600/60 bg-amber-950/30 text-amber-300'
                        }`}
                      >
                        {isBalanced ? 'Balanced ✓' : 'Tilted!'}
                      </span>
                    </div>
                  </div>

                  {/* Interactive Left vs Right Seesaw Balance Bar */}
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      isBalanced
                        ? 'border-emerald-700/50 bg-emerald-950/20'
                        : 'border-amber-500/60 bg-amber-950/25'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-cyan-300 font-bold">LEFT: {metrics.leftMassKg} kg</span>
                      <span className="text-[11px] text-slate-400">
                        Diff: {bayDiffKg} kg (Target &le; 30 kg)
                      </span>
                      <span className="text-amber-300 font-bold">RIGHT: {metrics.rightMassKg} kg</span>
                    </div>
                    <div className="relative h-3 rounded bg-slate-900 border border-slate-700 overflow-hidden">
                      {/* Green center sweet-spot */}
                      <div className="absolute inset-y-0 left-[38%] right-[38%] bg-emerald-500/25 border-x border-emerald-500/50" />
                      {/* Center-of-Mass marker */}
                      <div
                        className={`absolute top-0 bottom-0 w-2.5 -translate-x-1/2 rounded-sm transition-all ${
                          isBalanced ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                        style={{ left: `${tiltPct}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-300 leading-snug">
                      {isBalanced
                        ? 'Center-of-Mass is balanced inside the green zone! Use Move to Left/Right on equipped sensors anytime.'
                        : `Bay weight difference is ${bayDiffKg} kg — click "Move to Right →" or "← Left" on equipped sensor cards below to balance the seesaw!`}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INSTRUMENTS.map((inst) => {
                      const active = config.instruments.includes(inst.id);
                      const matchesMission = inst.goals.some((g) => mission.goals.includes(g));
                      const currentBay = getSensorBay(config, inst.id);
                      const bayLabel = currentBay === 'left' ? 'Left Bay' : 'Right Bay';
                      const healthPctInst = getSensorDurability(save.sensorDurability, inst.id);
                      const healthColor =
                        healthPctInst >= 80
                          ? 'text-emerald-400'
                          : healthPctInst >= 55
                            ? 'text-amber-400'
                            : 'text-rose-400';
                      const healthBar =
                        healthPctInst >= 80
                          ? 'bg-emerald-400'
                          : healthPctInst >= 55
                            ? 'bg-amber-400'
                            : 'bg-rose-500';
                      return (
                        <div
                          key={inst.id}
                          onMouseEnter={() => setHighlightPart(`inst:${inst.id}`)}
                          onMouseLeave={() => setHighlightPart(null)}
                          className={`rounded-lg border p-2.5 transition-colors flex flex-col justify-between gap-1.5 ${
                            active
                              ? 'border-cyan-400 bg-cyan-950/45'
                              : 'border-slate-800 bg-[#111A2E] hover:border-slate-600'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleInstrument(inst.id)}
                            className="text-left w-full"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="text-xs font-semibold text-slate-100">{inst.name}</span>
                              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10px] tabular-nums">
                                <span className={healthColor}>{healthPctInst}%</span>
                                {matchesMission && (
                                  <span className="text-emerald-400">REQ</span>
                                )}
                              </div>
                            </div>
                            <div className="text-[10px] text-cyan-300 mt-0.5">
                              Sees: {inst.earthTargetType}
                            </div>
                            <div className="mt-1 h-1 w-full rounded bg-slate-900 overflow-hidden">
                              <div
                                className={`h-full ${healthBar}`}
                                style={{ width: `${clamp(healthPctInst, 0, 100)}%` }}
                              />
                            </div>
                            <div className="mt-1 flex items-center justify-between font-mono text-[10px] text-slate-400 tabular-nums">
                              <span>
                                {inst.mass}kg · {inst.power}W · {inst.dataRate} GB/d · ${inst.cost}M
                              </span>
                              <span className={active ? 'text-cyan-200 font-semibold' : 'text-slate-400'}>
                                {active ? bayLabel : SENSOR_BAY_LABEL[inst.id] || 'Side Bay'}
                              </span>
                            </div>
                          </button>

                          {active && (
                            <div className="pt-1 border-t border-cyan-800/40 flex items-center justify-between gap-1">
                              <span className="text-[10px] font-mono text-slate-300">
                                Mounted: <strong className="text-white">{bayLabel}</strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => swapSensorBay(inst.id)}
                                className="rounded border border-cyan-400/70 bg-cyan-900/50 hover:bg-cyan-500 hover:text-slate-950 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-100 transition-colors"
                              >
                                Move to {currentBay === 'left' ? 'Right →' : '← Left'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => {
                        soundEngine.playSfx('click');
                        setDesignStep('parts');
                      }}
                      className="rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-200 px-4 py-2 text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      Next: 2. Core Craft
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Step 2: Core Spacecraft Hardware */}
            {designStep === 'parts' && (
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-white">
                    Step 2 · Power, Radio, Thruster &amp; Shield
                  </h2>
                  <span className="text-[11px] font-mono text-slate-400">Hover part to spotlight</span>
                </div>
                {(save.upgrades.solar > 0 ||
                  save.upgrades.comms > 0 ||
                  save.upgrades.isp > 0 ||
                  save.upgrades.composite > 0) && (
                  <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/25 px-3 py-1.5 text-[11px] font-mono text-emerald-300 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="text-slate-300 font-semibold">R&amp;D Lab Active:</span>
                    {save.upgrades.solar > 0 && <span>+{save.upgrades.solar * 12}% Solar</span>}
                    {save.upgrades.comms > 0 && <span>+{save.upgrades.comms * 15}% Downlink</span>}
                    {save.upgrades.isp > 0 && <span>+{save.upgrades.isp * 6}% Thruster Isp</span>}
                    {save.upgrades.composite > 0 && <span>-{save.upgrades.composite * 7}% Bus Mass</span>}
                  </div>
                )}

                {/* Power */}
                <div
                  onMouseEnter={() => setHighlightPart('power')}
                  onMouseLeave={() => setHighlightPart(null)}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      Solar Power &amp; Battery
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        metrics.orbitAvgGenW >= metrics.totalLoadW ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {round1(metrics.orbitAvgGenW)}W / {round1(metrics.totalLoadW)}W needed
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {POWER_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setConfig((c) => ({ ...c, power: p.id }));
                        }}
                        className={`rounded-lg border p-2 text-left text-[11px] transition-colors ${
                          config.power === p.id
                            ? 'border-cyan-400 bg-cyan-950/40'
                            : 'border-slate-800 bg-[#111A2E]'
                        }`}
                      >
                        <div className="font-semibold text-slate-100 truncate">{p.name}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {p.genW}W · ${p.cost}M
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Comms */}
                <div
                  onMouseEnter={() => setHighlightPart('comms')}
                  onMouseLeave={() => setHighlightPart(null)}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-cyan-400" />
                      Communications Dish
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        metrics.downlinkGB >= metrics.dataProdGB ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {round1(metrics.downlinkGB)} / {round1(metrics.dataProdGB)} GB/d needed
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {COMMS_OPTIONS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setConfig((prev) => ({ ...prev, comms: c.id }));
                        }}
                        className={`rounded-lg border p-2 text-left text-[11px] transition-colors ${
                          config.comms === c.id
                            ? 'border-cyan-400 bg-cyan-950/40'
                            : 'border-slate-800 bg-[#111A2E]'
                        }`}
                      >
                        <div className="font-semibold text-slate-100">{c.name}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {c.rateGB} GB/d · {c.power}W · ${c.cost}M
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Propulsion */}
                <div
                  onMouseEnter={() => setHighlightPart('prop')}
                  onMouseLeave={() => setHighlightPart(null)}
                  className="space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-orange-400" />
                      Orbital Engine
                    </span>
                    <span
                      className={`font-mono text-[11px] ${
                        metrics.dvAvailable >= metrics.dvNeeded ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {round1(metrics.dvAvailable)} / {round1(metrics.dvNeeded)} m/s Δv
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PROP_OPTIONS.map((pr) => (
                      <button
                        key={pr.id}
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setConfig((prev) => ({ ...prev, prop: pr.id }));
                        }}
                        className={`rounded-lg border p-2 text-left text-[11px] transition-colors ${
                          config.prop === pr.id
                            ? 'border-cyan-400 bg-cyan-950/40'
                            : 'border-slate-800 bg-[#111A2E]'
                        }`}
                      >
                        <div className="font-semibold text-slate-100">{pr.name}</div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {pr.isp}s Isp · {pr.propellantKg}kg fuel · ${pr.cost}M
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Thermal & Storage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onMouseEnter={() => setHighlightPart('therm')}
                    onMouseLeave={() => setHighlightPart(null)}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Thermometer className="w-3.5 h-3.5 text-rose-400" />
                        Thermal Loop
                      </span>
                      <span
                        className={`font-mono text-[10px] ${
                          metrics.thermalQuality >= 0.99 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {Math.round(metrics.thermalQuality * 100)}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      {THERM_OPTIONS.map((th) => (
                        <button
                          key={th.id}
                          onClick={() => {
                            soundEngine.playSfx('click');
                            setConfig((prev) => ({ ...prev, therm: th.id }));
                          }}
                          className={`w-full rounded border px-2.5 py-1.5 text-left text-[11px] flex justify-between ${
                            config.therm === th.id
                              ? 'border-cyan-400 bg-cyan-950/40 text-white'
                              : 'border-slate-800 bg-[#111A2E] text-slate-300'
                          }`}
                        >
                          <span>{th.name}</span>
                          <span className="font-mono text-slate-400 tabular-nums">
                            L{th.level} · {th.power}W · ${th.cost}M
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div
                    onMouseEnter={() => setHighlightPart('store')}
                    onMouseLeave={() => setHighlightPart(null)}
                    className="space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                        Data Buffer
                      </span>
                      <span
                        className={`font-mono text-[10px] ${
                          metrics.storageNeedGB <= metrics.storeOpt.capacityGB
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {round1(metrics.storageNeedGB)}/{metrics.storeOpt.capacityGB}GB
                      </span>
                    </div>
                    <div className="space-y-1">
                      {STORE_OPTIONS.map((st) => (
                        <button
                          key={st.id}
                          onClick={() => {
                            soundEngine.playSfx('click');
                            setConfig((prev) => ({ ...prev, store: st.id }));
                          }}
                          className={`w-full rounded border px-2.5 py-1.5 text-left text-[11px] flex justify-between ${
                            config.store === st.id
                              ? 'border-cyan-400 bg-cyan-950/40 text-white'
                              : 'border-slate-800 bg-[#111A2E] text-slate-300'
                          }`}
                        >
                          <span>{st.name}</span>
                          <span className="font-mono text-slate-400">${st.cost}M</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Onboard Computer & Attitude Control (ADCS) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                        Onboard Computer
                      </span>
                      <span className="font-mono text-[10px] text-cyan-300">
                        {Math.round((1 - metrics.computerOpt.compressionRatio) * 100)}% Compress
                      </span>
                    </div>
                    <div className="space-y-1">
                      {COMPUTER_OPTIONS.map((comp) => (
                        <button
                          key={comp.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playSfx('click');
                            setConfig((prev) => ({ ...prev, computer: comp.id }));
                          }}
                          className={`w-full rounded border px-2.5 py-1.5 text-left text-[11px] flex justify-between ${
                            (config.computer || 'a') === comp.id
                              ? 'border-cyan-400 bg-cyan-950/40 text-white'
                              : 'border-slate-800 bg-[#111A2E] text-slate-300'
                          }`}
                        >
                          <span className="truncate pr-2">{comp.name}</span>
                          <span className="font-mono text-slate-400 tabular-nums shrink-0">
                            -{Math.round((1 - comp.compressionRatio) * 100)}% data · ${comp.cost}M
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5 text-amber-400" />
                        Attitude Control (ADCS)
                      </span>
                      <span className="font-mono text-[10px] text-emerald-300">
                        +{metrics.adcsOpt.pointingBonusPct}% Pointing
                      </span>
                    </div>
                    <div className="space-y-1">
                      {ADCS_OPTIONS.map((adcs) => (
                        <button
                          key={adcs.id}
                          type="button"
                          onClick={() => {
                            soundEngine.playSfx('click');
                            setConfig((prev) => ({ ...prev, adcs: adcs.id }));
                          }}
                          className={`w-full rounded border px-2.5 py-1.5 text-left text-[11px] flex justify-between ${
                            (config.adcs || 'a') === adcs.id
                              ? 'border-cyan-400 bg-cyan-950/40 text-white'
                              : 'border-slate-800 bg-[#111A2E] text-slate-300'
                          }`}
                        >
                          <span className="truncate pr-2">{adcs.name}</span>
                          <span className="font-mono text-slate-400 tabular-nums shrink-0">
                            +{adcs.pointingBonusPct}% · ${adcs.cost}M
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Radiation Shield + Collapsible Fine-Tune Sliders */}
                <div
                  onMouseEnter={() => setHighlightPart('shield')}
                  onMouseLeave={() => setHighlightPart(null)}
                  className="pt-2 border-t border-slate-800 space-y-2.5"
                >
                  <button
                    onClick={() => {
                      soundEngine.playSfx('snap');
                      setConfig((prev) => ({ ...prev, radiationShield: !prev.radiationShield }));
                    }}
                    className={`w-full rounded-lg border p-2.5 flex items-center justify-between text-xs transition-colors ${
                      config.radiationShield
                        ? 'border-emerald-400 bg-emerald-950/40 text-emerald-200'
                        : 'border-slate-800 bg-[#111A2E] text-slate-300'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <Shield className="w-4 h-4 text-emerald-400" />
                      Radiation Armor Plates (+14 kg · $15M)
                    </span>
                    <span className="font-mono">{config.radiationShield ? 'EQUIPPED' : 'OFF'}</span>
                  </button>

                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setShowAdvancedSliders((v) => !v)}
                      className="text-[11px] font-medium text-slate-400 hover:text-cyan-300 underline"
                    >
                      {showAdvancedSliders
                        ? 'Hide Fuel & Throttle Sliders'
                        : 'Fine-Tune Fuel & Throttle (Optional)'}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setDesignStep('sensors');
                        }}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setDesignStep('order');
                        }}
                        className="rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-200 px-3.5 py-1.5 text-xs font-semibold flex items-center gap-1"
                      >
                        Next: 3. Order
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {showAdvancedSliders && (
                    <div className="grid grid-cols-3 gap-3 text-[11px] pt-1">
                      <div>
                        <div className="flex justify-between text-slate-400">
                          <span>Fuel</span>
                          <span className="font-mono text-amber-300">{config.fuelLoadPct}%</span>
                        </div>
                        <input
                          type="range"
                          min={20}
                          max={100}
                          value={config.fuelLoadPct}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, fuelLoadPct: Number(e.target.value) }))
                          }
                          className="w-full accent-amber-400 mt-1"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-400">
                          <span>Reserve</span>
                          <span className="font-mono text-cyan-300">{config.reservePct}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={25}
                          value={config.reservePct}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, reservePct: Number(e.target.value) }))
                          }
                          className="w-full accent-cyan-400 mt-1"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-slate-400">
                          <span>Throttle</span>
                          <span className="font-mono text-emerald-300">{config.throttlePct}%</span>
                        </div>
                        <input
                          type="range"
                          min={25}
                          max={100}
                          value={config.throttlePct}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, throttlePct: Number(e.target.value) }))
                          }
                          className="w-full accent-emerald-400 mt-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Staging Deployment Order */}
            {designStep === 'order' && (
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-cyan-400" />
                      Step 3 · Deployment Sequence
                    </h2>
                    <p className="text-xs text-slate-400">
                      Use the ↑ / ↓ buttons so <strong>Fairing Jettison</strong> sits at Step 1 (and Solar Arrays open before Orbit Burn).
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {config.sequence.map((step, idx) => (
                    <div
                      key={step}
                      className={`rounded-lg border px-3 py-2.5 flex items-center justify-between gap-2 ${
                        step === 'fair' && idx === 0
                          ? 'border-emerald-600/60 bg-emerald-950/20'
                          : step === 'fair' && idx !== 0
                            ? 'border-rose-600/60 bg-rose-950/20'
                            : 'border-slate-800 bg-[#111A2E]'
                      }`}
                    >
                      <div>
                        <div className="text-[10px] font-mono text-cyan-400">STEP {idx + 1}</div>
                        <div className="text-xs font-semibold text-slate-100">
                          {STAGING_LABELS[step]}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={idx === 0}
                          onClick={() => moveSequence(idx, -1)}
                          className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-30 hover:border-slate-500 text-xs"
                          aria-label="Move up (earlier)"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={idx === config.sequence.length - 1}
                          onClick={() => moveSequence(idx, 1)}
                          className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-30 hover:border-slate-500 text-xs"
                          aria-label="Move down (later)"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setDesignStep('parts');
                    }}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setDesignStep('orbit');
                    }}
                    className="rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-200 px-4 py-1.5 text-xs font-semibold flex items-center gap-1"
                  >
                    Next: 4. Orbit &amp; Rocket
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Orbit & Launch Rocket */}
            {designStep === 'orbit' && (
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold text-white">Step 4 · Target Orbit &amp; Carrier Rocket</h2>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(Object.keys(ORBITS) as OrbitId[]).map((oid) => {
                      const o = ORBITS[oid];
                      const allowed = mission.allowedOrbits.includes(oid);
                      const active = config.orbit === oid;
                      return (
                        <button
                          key={oid}
                          onClick={() => {
                            soundEngine.playSfx('click');
                            setConfig((prev) => ({ ...prev, orbit: oid }));
                          }}
                          className={`rounded-lg border p-2 text-left transition-colors ${
                            active
                              ? 'border-cyan-400 bg-cyan-950/45'
                              : allowed
                                ? 'border-slate-700 bg-[#111A2E] hover:border-slate-500'
                                : 'border-slate-800/60 bg-slate-900/40 opacity-55'
                          }`}
                        >
                          <div className="flex justify-between items-center text-xs font-semibold">
                            <span>{o.id}</span>
                            {allowed && <span className="text-[10px] text-emerald-400 font-mono">OK</span>}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">{o.name}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span>Carrier Rocket</span>
                    <span
                      className={`font-mono text-[11px] ${
                        metrics.wetMassKg <= metrics.lvCapacityKg ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {round1(metrics.wetMassKg)} / {round1(metrics.lvCapacityKg)} kg cap
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {LAUNCH_VEHICLES.map((lv) => (
                      <button
                        key={lv.id}
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setConfig((prev) => ({ ...prev, lv: lv.id }));
                        }}
                        className={`w-full rounded-lg border p-2 text-left flex items-center justify-between text-xs ${
                          config.lv === lv.id
                            ? 'border-cyan-400 bg-cyan-950/40'
                            : 'border-slate-800 bg-[#111A2E]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-100">{lv.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Cap {Math.round(lv.capLeoKg * metrics.orbit.payloadFactor)} kg to {metrics.orbit.id}
                          </div>
                        </div>
                        <span className="font-mono text-amber-300">${lv.costM}M</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setConfig((prev) => ({ ...prev, transfer: 'a' }));
                    }}
                    className={`rounded-lg border p-2 text-left text-xs ${
                      config.transfer === 'a'
                        ? 'border-cyan-400 bg-cyan-950/40'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div className="font-semibold">Direct Transfer</div>
                    <div className="text-[10px] text-slate-400">Fast 5-day · Full Δv</div>
                  </button>
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setConfig((prev) => ({ ...prev, transfer: 'b' }));
                    }}
                    className={`rounded-lg border p-2 text-left text-xs ${
                      config.transfer === 'b'
                        ? 'border-cyan-400 bg-cyan-950/40'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div className="font-semibold">Low-Energy Assist</div>
                    <div className="text-[10px] text-slate-400">-18% Δv needed · 65-day</div>
                  </button>
                </div>

                {/* Planned Mission Lifetime (Time vs Station-Keeping Drag) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-cyan-400" />
                      Planned Mission Lifetime
                    </span>
                    <span className="font-mono text-[11px] text-amber-300">
                      +{metrics.lifetimeDvExtra} m/s drag Δv
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {LIFETIME_OPTIONS.map((lf) => (
                      <button
                        key={lf.months}
                        type="button"
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setConfig((prev) => ({ ...prev, lifetimeMonths: lf.months }));
                        }}
                        className={`rounded-lg border p-2 text-left text-[11px] ${
                          (config.lifetimeMonths || 24) === lf.months
                            ? 'border-cyan-400 bg-cyan-950/40 text-white'
                            : 'border-slate-800 bg-[#111A2E] text-slate-300'
                        }`}
                      >
                        <div className="font-semibold">{lf.label}</div>
                        <div className="text-[10px] text-slate-400 truncate">{lf.note}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setDesignStep('order');
                    }}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      soundEngine.playSfx('snap');
                      setPhase('resources');
                    }}
                    className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
                  >
                    Continue to Pre-Flight Check
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Right Panel: Interactive 3D Spacecraft + 2D Balance Schematic + Status */}
          <section className="xl:col-span-7 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 3D PBR Satellite Turntable */}
              <div className="rounded-xl border border-slate-800 bg-[#090F1C] overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 border-b border-slate-800/80 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-slate-200">
                      3D Spacecraft Assembly
                    </span>
                    <span className="ml-2 text-[10px] font-mono text-slate-400">
                      Drag · Zoom · Explode
                    </span>
                  </div>
                  <button
                    onClick={handleTestFire}
                    className="rounded border border-amber-500/60 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-300 hover:bg-amber-900/50 flex items-center gap-1"
                  >
                    <Flame className="w-3.5 h-3.5" />
                    Test Thruster
                  </button>
                </div>
                <div className="h-[365px] w-full bg-[#060A13]">
                  <SpacecraftViewport
                    mode="satellite"
                    satelliteConfig={config}
                    highlightPart={highlightPart}
                    testFire={testFire}
                  />
                </div>
              </div>

              {/* 2D Engineering Schematic + CoM vs CoT */}
              <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-3 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-slate-200">
                    2D Blueprint &amp; Balance (Click Part to Edit)
                  </span>
                  <span className="font-mono text-[11px] text-amber-300 tabular-nums">
                    Offset {metrics.comOffsetM.toFixed(2)} m
                  </span>
                </div>
                <Blueprint2D
                  config={config}
                  metrics={metrics}
                  highlightPart={highlightPart}
                  onHoverPart={setHighlightPart}
                  onSelectPart={handleBlueprintSelectPart}
                  testFire={testFire}
                />
              </div>
            </div>

            {/* Live NOVA Advisor, Consequence Feedback & Quick Readiness Bar */}
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1 min-w-[260px] space-y-2">
                <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
                  <span
                    className={`font-bold ${
                      metrics.status === 'GO'
                        ? 'text-emerald-400'
                        : metrics.status === 'GO WITH WARNINGS'
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}
                  >
                    STATUS: {metrics.status}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>
                    Mass {round1(metrics.wetMassKg)} / {round1(metrics.lvCapacityKg)} kg
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>
                    Cost ${round1(metrics.costM)}M / {sandboxMode ? '∞' : `$${metrics.effectiveBudgetM}M`}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>
                    Δv {round1(metrics.dvAvailable)} / {round1(metrics.dvNeeded)} m/s
                  </span>
                </div>
                {consequenceDelta && (
                  <div className="text-[11px] font-mono text-amber-300">
                    Decision impact: {consequenceDelta}
                  </div>
                )}
                <p className="text-xs text-cyan-200 leading-relaxed">
                  <span className="font-semibold text-cyan-400">NOVA AI: </span>
                  {novaAdvice}
                </p>
              </div>
              <button
                onClick={() => {
                  soundEngine.playSfx('snap');
                  setPhase('resources');
                }}
                className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2.5 text-xs transition-colors flex items-center gap-1.5"
              >
                Continue to Pre-Flight &amp; Launch
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </section>
          </div>
        </main>
      )}

      {/* PHASE 3: RESOURCES, ORBIT & LAUNCH VALIDATOR */}
      {phase === 'resources' && (
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 lg:p-6 max-w-[1550px] w-full mx-auto">
          {/* Left: Orbit, Launch Vehicle, Trajectory & Policy */}
          <section className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white">Target Orbit Regime</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(Object.keys(ORBITS) as OrbitId[]).map((oid) => {
                  const o = ORBITS[oid];
                  const allowed = mission.allowedOrbits.includes(oid);
                  const active = config.orbit === oid;
                  return (
                    <button
                      key={oid}
                      onClick={() => {
                        soundEngine.playSfx('click');
                        setConfig((prev) => ({ ...prev, orbit: oid }));
                      }}
                      className={`rounded-lg border p-2.5 text-left transition-colors ${
                        active
                          ? 'border-cyan-400 bg-cyan-950/45'
                          : allowed
                            ? 'border-slate-700 bg-[#111A2E] hover:border-slate-500'
                            : 'border-slate-800/60 bg-slate-900/40 opacity-55'
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-semibold">
                        <span>{o.id}</span>
                        {allowed && <span className="text-[10px] text-emerald-400 font-mono">OK</span>}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate">{o.name}</div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#090F1C] p-3 text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-cyan-400">{metrics.orbit.name}: </span>
                {metrics.orbit.education}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white">Launch Vehicle &amp; Transfer</h2>
              <div className="space-y-2">
                {LAUNCH_VEHICLES.map((lv) => (
                  <button
                    key={lv.id}
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setConfig((prev) => ({ ...prev, lv: lv.id }));
                    }}
                    className={`w-full rounded-lg border p-2.5 text-left flex items-center justify-between text-xs ${
                      config.lv === lv.id
                        ? 'border-cyan-400 bg-cyan-950/40'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-slate-100">{lv.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Cap {Math.round(lv.capLeoKg * metrics.orbit.payloadFactor)} kg to {metrics.orbit.id} ·{' '}
                        {Math.round(lv.reliability * 100)}% reliability
                      </div>
                    </div>
                    <span className="font-mono text-amber-300">${lv.costM}M</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setConfig((prev) => ({ ...prev, transfer: 'a' }));
                  }}
                  className={`rounded-lg border p-2.5 text-left text-xs ${
                    config.transfer === 'a'
                      ? 'border-cyan-400 bg-cyan-950/40'
                      : 'border-slate-800 bg-[#111A2E]'
                  }`}
                >
                  <div className="font-semibold">Direct Transfer</div>
                  <div className="text-[10px] text-slate-400">Fast 5-day · Full Δv cost</div>
                </button>
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setConfig((prev) => ({ ...prev, transfer: 'b' }));
                  }}
                  className={`rounded-lg border p-2.5 text-left text-xs ${
                    config.transfer === 'b'
                      ? 'border-cyan-400 bg-cyan-950/40'
                      : 'border-slate-800 bg-[#111A2E]'
                  }`}
                >
                  <div className="font-semibold">Low-Energy Gravity Assist</div>
                  <div className="text-[10px] text-slate-400">-18% Δv required · 65-day</div>
                </button>
              </div>

              <div className="pt-1 space-y-1.5">
                <div className="text-xs font-medium text-slate-300">Operations Policy</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['balanced', 'protect', 'science'] as const).map((pol) => (
                    <button
                      key={pol}
                      onClick={() => {
                        soundEngine.playSfx('click');
                        setConfig((prev) => ({ ...prev, policy: pol }));
                      }}
                      className={`rounded border py-1.5 text-xs font-medium capitalize ${
                        config.policy === pol
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200'
                          : 'border-slate-800 bg-[#111A2E] text-slate-400'
                      }`}
                    >
                      {pol}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Right: 10-Meter Engineering Telemetry & Pre-Flight Go/No-Go Validator */}
          <section className="lg:col-span-7 space-y-4">
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
              <h2 className="text-sm font-semibold text-white">Engineering Resource Telemetry</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                {[
                  {
                    label: 'Budget Spent',
                    val: `$${round1(metrics.costM)}M / $${metrics.effectiveBudgetM}M`,
                    pct: (metrics.costM / metrics.effectiveBudgetM) * 100,
                    ok: metrics.costM <= metrics.effectiveBudgetM,
                  },
                  {
                    label: 'Wet Mass vs Rocket',
                    val: `${round1(metrics.wetMassKg)} / ${round1(metrics.lvCapacityKg)} kg`,
                    pct: (metrics.wetMassKg / metrics.lvCapacityKg) * 100,
                    ok: metrics.wetMassKg <= metrics.lvCapacityKg,
                  },
                  {
                    label: 'Orbit Δv Budget',
                    val: `${round1(metrics.dvAvailable)} / ${round1(metrics.dvNeeded)} m/s`,
                    pct: (metrics.dvAvailable / Math.max(1, metrics.dvNeeded)) * 100,
                    ok: metrics.dvAvailable >= metrics.dvNeeded,
                  },
                  {
                    label: 'Orbit Avg Power',
                    val: `${round1(metrics.totalLoadW)} / ${round1(metrics.orbitAvgGenW)} W`,
                    pct: (metrics.totalLoadW / Math.max(1, metrics.orbitAvgGenW)) * 100,
                    ok: metrics.totalLoadW <= metrics.orbitAvgGenW,
                  },
                  {
                    label: 'Eclipse Battery Reserve',
                    val: `${metrics.batteryReservePct}% (${round1(metrics.eclipseHours)}h shadow)`,
                    pct: metrics.batteryReservePct,
                    ok: metrics.batteryReservePct >= 15,
                  },
                  {
                    label: 'Thermal Calibration',
                    val: `${Math.round(metrics.thermalQuality * 100)}% (Level ${metrics.thermOpt.level})`,
                    pct: metrics.thermalQuality * 100,
                    ok: metrics.thermalQuality >= 0.99,
                  },
                  {
                    label: 'SSD Data Buffer Need',
                    val: `${round1(metrics.storageNeedGB)} / ${metrics.storeOpt.capacityGB} GB`,
                    pct: (metrics.storageNeedGB / metrics.storeOpt.capacityGB) * 100,
                    ok: metrics.storageNeedGB <= metrics.storeOpt.capacityGB,
                  },
                  {
                    label: 'Daily Downlink Bandwidth',
                    val: `${round1(metrics.dataProdGB)} / ${round1(metrics.downlinkGB)} GB/d`,
                    pct: (metrics.dataProdGB / Math.max(1, metrics.downlinkGB)) * 100,
                    ok: metrics.dataProdGB <= metrics.downlinkGB,
                  },
                  {
                    label: 'Sensor Durability',
                    val: `${metrics.avgSensorDurabilityPct}% avg`,
                    pct: metrics.avgSensorDurabilityPct,
                    ok: metrics.avgSensorDurabilityPct >= 65,
                  },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400">{m.label}</span>
                      <span className={m.ok ? 'text-emerald-400' : 'text-amber-400'}>{m.val}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded bg-slate-900 overflow-hidden">
                      <div
                        className={`h-full ${m.ok ? 'bg-cyan-400' : 'bg-amber-500'}`}
                        style={{ width: `${clamp(m.pct, 0, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Flight Readiness Validator */}
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Pre-Flight MissionValidator</h2>
                <span
                  className={`font-mono text-xs font-bold ${
                    metrics.status === 'GO'
                      ? 'text-emerald-400'
                      : metrics.status === 'GO WITH WARNINGS'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  {metrics.status}
                </span>
              </div>

              {metrics.warnings.length === 0 ? (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-3 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>All systems nominal. Cleared for launch and Earth-observation operations.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {metrics.warnings.map((w, idx) => (
                    <div
                      key={`${w.code}-${idx}`}
                      className={`rounded-lg border p-2.5 text-xs flex items-start justify-between gap-2.5 ${
                        w.severity === 'NO-GO'
                          ? 'border-rose-700/70 bg-rose-950/30 text-rose-200'
                          : 'border-amber-700/60 bg-amber-950/25 text-amber-200'
                      }`}
                    >
                      <div>
                        <div className="font-mono font-semibold">
                          [{w.severity}] {w.code} — {w.description}
                        </div>
                        <div className="text-[11px] opacity-85 mt-0.5">Fix: {w.correction}</div>
                      </div>
                      {w.code === 'DUR-01' && onOpenMaintenanceLab ? (
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playSfx('click');
                            onOpenMaintenanceLab();
                          }}
                          className="shrink-0 rounded border border-amber-400/70 bg-amber-950/60 hover:bg-amber-500 hover:text-slate-950 px-2.5 py-1 text-[10px] font-mono font-semibold text-amber-200 transition-colors"
                        >
                          R&amp;D Maintenance →
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => jumpToWarningCode(w.code)}
                          className="shrink-0 rounded border border-cyan-400/60 bg-cyan-950/60 hover:bg-cyan-500 hover:text-slate-950 px-2.5 py-1 text-[10px] font-mono font-semibold text-cyan-200 transition-colors"
                        >
                          Fix in Designer →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setPhase('design');
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white"
                >
                  Back to Designer
                </button>
                {onLaunchCustomRocket && (
                  <button
                    disabled={metrics.status === 'NO-GO'}
                    onClick={() => {
                      soundEngine.playSfx('snap');
                      onLaunchCustomRocket(
                        config.orbit,
                        Math.max(1, metrics.wetMassKg / 1000),
                        mission.name,
                        config,
                      );
                    }}
                    className="rounded-lg border border-amber-500/60 bg-amber-950/40 hover:bg-amber-900/50 disabled:opacity-40 text-amber-300 font-semibold py-2.5 px-4 text-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Rocket className="w-4 h-4" />
                    Pilot Custom Rocket Launch!
                  </button>
                )}
                <button
                  disabled={metrics.status === 'NO-GO'}
                  onClick={launchSatellite}
                  className="flex-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold py-2.5 px-5 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {metrics.status === 'NO-GO'
                    ? 'Resolve NO-GO Blockers to Launch'
                    : 'Quick Launch & Scan Earth'}
                </button>
              </div>
            </div>

            {/* Multiple Valid Engineering Architectures & Active Constraint Box */}
            <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-cyan-300">
                  Multiple Valid Solutions Exist
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {metrics.lifetimeMonths} mo lifetime · {metrics.computerOpt.name} · {metrics.adcsOpt.name}
                </span>
              </div>
              {(MISSION_ALTERNATIVE_TIPS[mission.id] || []).map((tip, i) => (
                <div key={i} className="text-slate-300 leading-snug">
                  · {tip}
                </div>
              ))}
              {randomConstraint && (
                <div className="pt-1 text-amber-300 font-mono text-[11px]">
                  Active Event: {randomConstraint.title} ({randomConstraint.detail})
                </div>
              )}
            </div>
          </section>
        </main>
      )}

      {/* PHASE 4: LAUNCH CHECKLIST -> LIVE 3D EARTH SENSOR OPERATIONS ("SENSOR BUMI") */}
      {phase === 'operations' && (
        <main className="flex-1 p-4 lg:p-6 max-w-[1640px] w-full mx-auto">
          {!inOrbitOps ? (
            <div className="max-w-2xl mx-auto rounded-xl border border-slate-800 bg-[#0D1526] p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="text-xs font-mono text-amber-400">ACTIVE ASCENT TIMELINE</div>
                  <h2 className="text-lg font-bold text-white">
                    Deploying to {metrics.orbit.name}
                  </h2>
                </div>
                <div className="flex items-center gap-1.5">
                  {([1, 5, 20] as const).map((sp) => (
                    <button
                      key={sp}
                      onClick={() => setChecklistSpeed(sp)}
                      className={`rounded border px-2 py-1 text-xs font-mono ${
                        checklistSpeed === sp
                          ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                      }`}
                    >
                      {sp}×
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      soundEngine.playSfx('snap');
                      setChecklistIdx(LAUNCH_CHECKLIST_STEPS.length);
                      setInOrbitOps(true);
                    }}
                    className="rounded border border-emerald-600/70 bg-emerald-950/40 px-2.5 py-1 text-xs font-medium text-emerald-300"
                  >
                    Skip to Orbit
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {LAUNCH_CHECKLIST_STEPS.map((st, idx) => {
                  const done = idx < checklistIdx;
                  const current = idx === checklistIdx;
                  return (
                    <div
                      key={st.id}
                      className={`rounded-lg border px-3 py-2 text-xs font-mono flex items-center justify-between ${
                        done
                          ? 'border-emerald-800/60 bg-emerald-950/25 text-emerald-300'
                          : current
                            ? 'border-cyan-400 bg-cyan-950/40 text-white'
                            : 'border-slate-800 bg-[#0A101D] text-slate-500'
                      }`}
                    >
                      <span>{st.label}</span>
                      <span>{done ? 'CONFIRMED' : current ? 'EXECUTING' : 'PENDING'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
              {/* Interactive 3D Earth Globe Viewport */}
              <div className="xl:col-span-8 flex flex-col gap-3">
                <div className="relative rounded-xl border border-slate-800 bg-[#050912] overflow-hidden h-[430px] lg:h-[540px]">
                  <EarthGlobeView
                    orbitId={config.orbit}
                    hotspots={activeHotspots}
                    scannedIds={scannedIds}
                    scanningPulse={scanningPulse}
                    downlinkActive={downlinkActive}
                    speedMultiplier={speedMult}
                    swathSlewDeg={swathSlewDeg}
                    onStatusUpdate={setSubSat}
                  />

                  {/* Top-Left Live Orbit Coordinate Readout */}
                  <div className="absolute top-3 left-3 rounded-lg border border-slate-700/80 bg-[#070B14]/90 px-3 py-2 text-xs font-mono tabular-nums space-y-0.5 pointer-events-none">
                    <div className="text-cyan-300 font-semibold">
                      SUB-SAT {subSat.lat.toFixed(1)}° , {subSat.lon.toFixed(1)}°
                    </div>
                    <div className="text-slate-300">
                      {subSat.inSunlight ? 'SOLAR EXPOSURE · CHARGING' : 'EARTH ECLIPSE · BATTERY'}
                    </div>
                    <div className="text-slate-400">
                      DAY {missionDay} / {mission.durationDays} · {metrics.orbit.id} · LINK {linkQualityPct}%
                    </div>
                  </div>

                  {/* Top-Right Non-Blocking Space Weather Telemetry Alert */}
                  {spaceWeather && (
                    <div
                      className={`absolute top-3 right-3 max-w-xs rounded-lg border px-3 py-2 text-xs font-mono tabular-nums pointer-events-none ${
                        spaceWeather.stabilized
                          ? 'border-emerald-500/70 bg-emerald-950/85 text-emerald-200'
                          : 'border-amber-500/80 bg-[#1B1007]/92 text-amber-200'
                      }`}
                    >
                      <div className="font-semibold flex items-center justify-between gap-2">
                        <span>
                          {spaceWeather.stabilized ? '● LINK STABILIZED' : '▲ SPACE WEATHER'}
                        </span>
                        <span>{linkQualityPct}% RF</span>
                      </div>
                      <div className="text-[11px] opacity-90 mt-0.5">{spaceWeather.title}</div>
                      <div className="text-[10px] opacity-80 mt-0.5">
                        {spaceWeather.stabilized
                          ? `ADCS locked (${antennaDeg}° vs ${spaceWeather.targetAntennaDeg}° target)`
                          : `Slew ADCS Antenna [Z/C] → ${spaceWeather.targetAntennaDeg > 0 ? `+${spaceWeather.targetAntennaDeg}°` : `${spaceWeather.targetAntennaDeg}°`}`}
                      </div>
                    </div>
                  )}

                  {/* Educational Toast on Hotspot Scan */}
                  {activeToast && (
                    <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md rounded-lg border border-cyan-500/70 bg-[#08101E]/95 p-3 shadow-xl">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-cyan-300">
                          {activeToast.title}
                        </span>
                        <button
                          onClick={() => setActiveToast(null)}
                          className="text-[11px] text-slate-400 hover:text-white"
                        >
                          Dismiss
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-200 leading-relaxed">
                        {activeToast.body}
                      </p>
                    </div>
                  )}

                  {/* Orbital Anomaly Modal */}
                  {orbitAnomaly && (
                    <div className="absolute inset-0 bg-[#050811]/88 flex items-center justify-center p-4 z-20">
                      <div className="w-full max-w-md rounded-xl border border-amber-500/80 bg-[#0E1629] p-5 space-y-3">
                        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                          <ShieldAlert className="w-5 h-5" />
                          <span>{orbitAnomaly.title}</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{orbitAnomaly.detail}</p>
                        <button
                          onClick={() => handleOrbitAnomalyChoice(false)}
                          className="w-full rounded-lg border border-emerald-700 bg-emerald-950/40 hover:bg-emerald-900/50 p-2.5 text-left text-xs"
                        >
                          <div className="font-semibold text-emerald-300">{orbitAnomaly.safeLabel}</div>
                          <div className="text-[11px] text-slate-300">{orbitAnomaly.safeEffect}</div>
                        </button>
                        <button
                          onClick={() => handleOrbitAnomalyChoice(true)}
                          className="w-full rounded-lg border border-amber-700 bg-amber-950/40 hover:bg-amber-900/50 p-2.5 text-left text-xs"
                        >
                          <div className="font-semibold text-amber-300">{orbitAnomaly.riskLabel}</div>
                          <div className="text-[11px] text-slate-300">{orbitAnomaly.riskEffect}</div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Earth Health Progress Bar from Satellite -> Earth Office */}
                <div className="rounded-lg border border-emerald-700/50 bg-[#0D1526] px-4 py-2.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-emerald-300 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      Earth Health Meter (Scan Hazards → Send to Earth Office)
                    </span>
                    <span className="font-mono font-bold tabular-nums text-emerald-300">
                      {Math.min(100, 46 + scannedIds.length * 6 + downlinkedTargetsCount * 10)}% Healthy
                    </span>
                  </div>
                  <div className="h-2 w-full rounded bg-slate-900 overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-emerald-400 transition-all"
                      style={{
                        width: `${Math.min(100, 46 + scannedIds.length * 6 + downlinkedTargetsCount * 10)}%`,
                      }}
                    />
                  </div>
                  {officeFixMsg && (
                    <div className="text-[11px] text-emerald-200 font-medium pt-0.5">
                      ✓ {officeFixMsg}
                    </div>
                  )}
                </div>

                {/* Earth Sensor Quick Status Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono tabular-nums">
                  <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-2.5">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <BatteryCharging className="w-3 h-3 text-emerald-400" />
                      BATTERY
                    </div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">{batteryPct}%</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-2.5">
                    <div className="text-[10px] text-slate-400">DATA MEMORY</div>
                    <div className="text-sm font-bold text-amber-300 mt-0.5">
                      {bufferGB} / {metrics.storeOpt.capacityGB} GB
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-2.5">
                    <div className="text-[10px] text-slate-400">SENT TO OFFICE</div>
                    <div className="text-sm font-bold text-cyan-300 mt-0.5">{downlinkedGB} GB</div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-2.5">
                    <div className="text-[10px] text-slate-400">EARTH SCANS</div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {scannedIds.length} / {activeHotspots.length}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-[#0D1526] p-2.5">
                    <div className="text-[10px] text-slate-400">SENSOR DURABILITY</div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        metrics.avgSensorDurabilityPct >= 80
                          ? 'text-emerald-400'
                          : metrics.avgSensorDurabilityPct >= 55
                            ? 'text-amber-300'
                            : 'text-rose-400'
                      }`}
                    >
                      {metrics.avgSensorDurabilityPct}% · Bus {healthPct}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Earth Sensor & Downlink Console */}
              <aside className="xl:col-span-4 space-y-4">
                <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Globe className="w-4 h-4 text-cyan-400" />
                      Earth Sensor Command Deck
                    </h2>
                    <div className="flex items-center gap-1">
                      {([1, 2, 4] as const).map((sp) => (
                        <button
                          key={sp}
                          onClick={() => setSpeedMult(sp)}
                          className={`rounded border px-2 py-0.5 text-[11px] font-mono ${
                            speedMult === sp
                              ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200'
                              : 'border-slate-700 bg-slate-900 text-slate-400'
                          }`}
                        >
                          {sp}×
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Mission Duration Progress Bar */}
                  <div className="rounded-lg border border-slate-800 bg-[#090F1C] px-3 py-2 space-y-1 text-[10px] font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">ORBIT WINDOW</span>
                      <span className="text-cyan-300 tabular-nums">
                        DAY {missionDay} / {mission.durationDays}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded bg-slate-900 overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all"
                        style={{
                          width: `${clamp((missionDay / Math.max(1, mission.durationDays)) * 100, 2, 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* 3-Step Orbit Ops Tracker */}
                  <div className="rounded-lg border border-slate-800 bg-[#090F1C] p-2.5 grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                    <div
                      className={`rounded border px-2 py-1.5 ${
                        scannedIds.length > 0
                          ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
                          : 'border-amber-500/60 bg-amber-950/25 text-amber-200'
                      }`}
                    >
                      1. SCAN [SPACE]
                      <div className="opacity-80 mt-0.5">{scannedIds.length} captured</div>
                    </div>
                    <div
                      className={`rounded border px-2 py-1.5 ${
                        downlinkedGB > 0
                          ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
                          : scannedIds.length > 0
                            ? 'border-cyan-500/60 bg-cyan-950/25 text-cyan-200'
                            : 'border-slate-800 bg-[#0D1526] text-slate-400'
                      }`}
                    >
                      2. BEAM [E]
                      <div className="opacity-80 mt-0.5">{downlinkedGB} GB sent</div>
                    </div>
                    <div className="rounded border border-slate-800 bg-[#0D1526] px-2 py-1.5 text-slate-300">
                      3. REPORT
                      <div className="opacity-80 mt-0.5">Score &amp; EXP</div>
                    </div>
                  </div>

                  {/* Interactive Cross-Track Sensor Swath Steering */}
                  <div className="rounded-lg border border-slate-800 bg-[#090F1C] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-mono">
                      <span className="text-cyan-300 font-semibold">AIM SENSOR BEAM (A / D or ← / →)</span>
                      <span className="text-slate-300 tabular-nums">
                        {swathSlewDeg > 0 ? `+${swathSlewDeg}°` : `${swathSlewDeg}°`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSwathSlewDeg((v) => clamp(v - 6, -24, 24))}
                        className="rounded border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-2.5 py-1 text-[11px] font-mono text-slate-200"
                      >
                        ← Slew L
                      </button>
                      <input
                        type="range"
                        min={-24}
                        max={24}
                        step={2}
                        value={swathSlewDeg}
                        onChange={(e) => setSwathSlewDeg(Number(e.target.value))}
                        className="flex-1 accent-cyan-400"
                        aria-label="Cross-track sensor swath aim"
                      />
                      <button
                        type="button"
                        onClick={() => setSwathSlewDeg(0)}
                        className="rounded border border-slate-700 bg-[#111A2E] hover:border-slate-500 px-2 py-1 text-[10px] font-mono text-slate-300"
                      >
                        0°
                      </button>
                      <button
                        type="button"
                        onClick={() => setSwathSlewDeg((v) => clamp(v + 6, -24, 24))}
                        className="rounded border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-2.5 py-1 text-[11px] font-mono text-slate-200"
                      >
                        Slew R →
                      </button>
                    </div>
                  </div>

                  {/* Interactive ADCS Antenna Re-Orientation Control (Counters Random Space Weather) */}
                  <div
                    className={`rounded-lg border p-2.5 space-y-2 ${
                      spaceWeather && !spaceWeather.stabilized
                        ? 'border-amber-500 bg-[#1A1208]'
                        : spaceWeather?.stabilized
                          ? 'border-emerald-600/70 bg-emerald-950/25'
                          : 'border-slate-800 bg-[#090F1C]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                      <span
                        className={`font-semibold flex items-center gap-1.5 ${
                          spaceWeather && !spaceWeather.stabilized
                            ? 'text-amber-300'
                            : 'text-cyan-300'
                        }`}
                      >
                        <Radio className="w-3.5 h-3.5" />
                        ADCS ANTENNA LINK (Z / C)
                      </span>
                      <span
                        className={`font-bold ${
                          linkQualityPct >= 88
                            ? 'text-emerald-400'
                            : linkQualityPct >= 60
                              ? 'text-amber-300'
                              : 'text-rose-400'
                        }`}
                      >
                        {linkQualityPct >= 88
                          ? `● ${linkQualityPct}% LOCK`
                          : linkQualityPct >= 60
                            ? `▲ ${linkQualityPct}% FADE`
                            : `✖ ${linkQualityPct}% STORM`}
                      </span>
                    </div>

                    {spaceWeather ? (
                      <div className="text-[11px] text-slate-200 leading-snug space-y-0.5">
                        <div className="font-semibold text-amber-200">
                          {spaceWeather.title} · {spaceWeather.phenomenon}
                        </div>
                        <p className="text-[10px] text-slate-300">{spaceWeather.detail}</p>
                        <div className="font-mono text-[10px] text-cyan-300 tabular-nums pt-0.5">
                          Target Vector:{' '}
                          {spaceWeather.targetAntennaDeg > 0
                            ? `+${spaceWeather.targetAntennaDeg}°`
                            : `${spaceWeather.targetAntennaDeg}°`}{' '}
                          (±{adcsLockConeDeg}° cone · {metrics.adcsOpt.name})
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                        Link nominal ({metrics.adcsOpt.name} · ±{adcsLockConeDeg}° cone). Re-orient antenna if Space Weather strikes.
                      </div>
                    )}

                    {/* Visual Azimuth Lock Gauge */}
                    <div className="space-y-1">
                      <div className="relative h-2.5 w-full rounded bg-slate-900 border border-slate-800 overflow-hidden">
                        {/* Target Storm-Free Cone */}
                        <div
                          className={`absolute inset-y-0 ${
                            spaceWeather ? 'bg-emerald-500/35 border-x border-emerald-400/70' : 'bg-cyan-500/20'
                          }`}
                          style={{
                            left: `${clamp((((spaceWeather ? spaceWeather.targetAntennaDeg : 0) - adcsLockConeDeg + 45) / 90) * 100, 0, 100)}%`,
                            width: `${clamp(((adcsLockConeDeg * 2) / 90) * 100, 8, 100)}%`,
                          }}
                        />
                        {/* Current Antenna Boresight Marker */}
                        <div
                          className={`absolute top-0 bottom-0 w-1.5 -translate-x-1/2 rounded-sm ${
                            linkQualityPct >= 88
                              ? 'bg-emerald-400'
                              : linkQualityPct >= 60
                                ? 'bg-amber-400'
                                : 'bg-rose-500'
                          }`}
                          style={{ left: `${clamp(((antennaDeg + 45) / 90) * 100, 2, 98)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                        <span>-45°</span>
                        <span className="text-slate-200">
                          Boresight {antennaDeg > 0 ? `+${antennaDeg}°` : `${antennaDeg}°`}
                        </span>
                        <span>+45°</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAntennaDeg((v) => clamp(v - adcsStepDeg, -45, 45))}
                        className="rounded border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-2.5 py-1 text-[11px] font-mono text-slate-200"
                      >
                        ↺ Ant -
                      </button>
                      <input
                        type="range"
                        min={-45}
                        max={45}
                        step={1}
                        value={antennaDeg}
                        onChange={(e) => setAntennaDeg(Number(e.target.value))}
                        className="flex-1 accent-amber-400"
                        aria-label="ADCS High-Gain Antenna Azimuth"
                      />
                      <button
                        type="button"
                        onClick={() => setAntennaDeg(0)}
                        className="rounded border border-slate-700 bg-[#111A2E] hover:border-slate-500 px-2 py-1 text-[10px] font-mono text-slate-300"
                      >
                        0°
                      </button>
                      <button
                        type="button"
                        onClick={() => setAntennaDeg((v) => clamp(v + adcsStepDeg, -45, 45))}
                        className="rounded border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-2.5 py-1 text-[11px] font-mono text-slate-200"
                      >
                        Ant + ↻
                      </button>
                    </div>
                  </div>

                  {/* Active Hotspot Action */}
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      activeHotspot && !scannedIds.includes(activeHotspot.id)
                        ? 'border-amber-400 bg-amber-950/30'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <ScanLine className="w-3.5 h-3.5 text-amber-400" />
                        Sensor Swath Target ({worldLabel})
                      </span>
                      <span className="font-mono text-[10px] text-amber-300">
                        {activeHotspot ? activeHotspot.category.toUpperCase() : 'AIM SWATH...'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {activeHotspot
                        ? `${activeHotspot.name} (${activeHotspot.dataSizeGB} GB)`
                        : `Steer your blue sensor cone with [A]/[D] or wait for an amber ${worldLabel} target pass.`}
                    </p>
                    <button
                      disabled={!activeHotspot || safeMode || scannedIds.includes(activeHotspot?.id || '')}
                      onClick={handleScanHotspot}
                      className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold py-2 text-xs transition-colors"
                    >
                      {activeHotspot
                        ? 'Capture Sensor Scan [SPACE]'
                        : 'Aim Swath Over Target to Scan'}
                    </button>
                  </div>

                  {/* Active Ground Station Downlink */}
                  <div
                    className={`rounded-lg border p-3 space-y-2 ${
                      activeStation && bufferGB > 0.5
                        ? linkQualityPct >= 75
                          ? 'border-emerald-400 bg-emerald-950/30'
                          : 'border-amber-400 bg-amber-950/30'
                        : 'border-slate-800 bg-[#111A2E]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                        Ground Station Pass
                      </span>
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          linkQualityPct >= 75 ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {activeStation ? `${activeStation.bandBoost}× · ${linkQualityPct}% LINK` : `NO LOS · ${linkQualityPct}% RF`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {activeStation
                        ? linkQualityPct < 75 && spaceWeather
                          ? `In range of ${activeStation.name}, but Space Weather throttled link (${linkQualityPct}%). Steer ADCS Antenna first!`
                          : `In range of ${activeStation.name}`
                        : 'Green dishes mark DSN & Polar ground receivers for beaming data.'}
                    </p>
                    <button
                      disabled={!activeStation || bufferGB <= 0.5}
                      onClick={handleDownlink}
                      className={`w-full rounded-lg font-semibold py-2 text-xs transition-colors disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 ${
                        linkQualityPct < 75 && spaceWeather
                          ? 'bg-amber-400 hover:bg-amber-300'
                          : 'bg-emerald-500 hover:bg-emerald-400'
                      }`}
                    >
                      {activeStation
                        ? linkQualityPct < 75 && spaceWeather
                          ? `Beam Throttled Data (${linkQualityPct}% Link) [E]`
                          : `Beam Data to Station (${bufferGB} GB) [E]`
                        : 'Awaiting Ground Station Sightline'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        soundEngine.playSfx('click');
                        setSafeMode((v) => !v);
                      }}
                      className={`rounded-lg border py-2 text-xs font-semibold ${
                        safeMode
                          ? 'border-amber-400 bg-amber-950/50 text-amber-200'
                          : 'border-slate-700 bg-slate-900 text-slate-300'
                      }`}
                    >
                      {safeMode ? 'Safe Mode ON' : 'Toggle Safe Mode'}
                    </button>
                    <button
                      onClick={generateFinalReport}
                      className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold py-2 text-xs transition-colors"
                    >
                      End Orbit &amp; Report
                    </button>
                  </div>
                </div>

                {/* Targets Checklist + Live NASA Feed Switcher */}
                <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-semibold text-white">
                      {config.orbit === 'LUNAR'
                        ? 'Lunar Polar Scan Targets'
                        : config.orbit === 'MARS'
                          ? 'Mars Science Targets'
                          : useLiveTargets && isLiveNasa
                            ? 'Live NASA EONET Events'
                            : 'Earth Hazard Targets'}
                    </span>
                    <span className="font-mono text-cyan-300">{sciencePoints} Sci Pts</span>
                  </div>
                  {config.orbit !== 'LUNAR' && config.orbit !== 'MARS' && (
                    <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span className={useLiveTargets && isLiveNasa ? 'text-emerald-400' : 'text-slate-400'}>
                        {useLiveTargets ? nasaFeedLabel : 'NASA Training Targets'}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            soundEngine.playSfx('click');
                            setUseLiveTargets((v) => !v);
                          }}
                          className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-slate-300 hover:border-cyan-400"
                        >
                          {useLiveTargets ? 'Use Training Set' : 'Use Live NASA'}
                        </button>
                        {onRefreshLiveNasa && (
                          <button
                            onClick={() => {
                              soundEngine.playSfx('click');
                              onRefreshLiveNasa();
                            }}
                            className="rounded border border-cyan-800 bg-cyan-950/40 px-2 py-0.5 text-cyan-300 hover:border-cyan-400"
                          >
                            Sync
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {activeHotspots.map((hs) => {
                      const done = scannedIds.includes(hs.id);
                      return (
                        <div
                          key={hs.id}
                          className={`rounded border px-2.5 py-1.5 text-[11px] flex items-center justify-between ${
                            done
                              ? 'border-emerald-700/60 bg-emerald-950/25 text-emerald-200'
                              : 'border-slate-800 bg-[#111A2E] text-slate-300'
                          }`}
                        >
                          <span className="truncate">{hs.name}</span>
                          <span className="font-mono text-[10px] shrink-0 ml-2">
                            {done ? 'SCANNED' : hs.isLiveNasa ? `LIVE · ${hs.category}` : hs.category}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ops Log */}
                <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-4 space-y-2">
                  <div className="text-xs font-semibold text-slate-300 uppercase">Operations Log</div>
                  <div className="space-y-1 max-h-28 overflow-y-auto text-[11px] font-mono text-slate-400">
                    {orbitLog.map((l, i) => (
                      <div key={i} className="border-b border-slate-800/60 pb-1">
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </main>
      )}

      {/* PHASE 5: MISSION REPORT */}
      {phase === 'report' && reportData && (
        <main className="flex-1 flex items-center justify-center p-4 lg:p-8">
          <div className="w-full max-w-3xl rounded-xl border border-slate-800 bg-[#0D1526] p-6 space-y-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-mono uppercase text-cyan-400">
                  Post-Mission Engineering Audit · {reportData.rank}
                </div>
                <h2 className="text-2xl font-bold text-white mt-1">{mission.name}</h2>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-bold text-amber-400">
                  {'★'.repeat(reportData.stars)}
                  {'☆'.repeat(3 - reportData.stars)}
                </div>
                <div className="text-xs font-mono text-slate-300">
                  Score {reportData.totalScore}/100 · +{reportData.credits} CR · +{reportData.xpEarned} EXP
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {reportData.pillars.map((p) => (
                <div key={p.label} className="rounded-lg border border-slate-800 bg-[#111A2E] p-3">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300">
                      {p.label} ({p.weight}%)
                    </span>
                    <span className="text-cyan-300 font-bold">{p.score}%</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded bg-slate-900 overflow-hidden">
                    <div
                      className={`h-full ${
                        p.score >= 80
                          ? 'bg-emerald-500'
                          : p.score >= 60
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                      }`}
                      style={{ width: `${p.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center font-mono">
              <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3">
                <div className="text-[10px] text-slate-400">HOTSPOTS SCANNED</div>
                <div className="text-base font-bold text-amber-300">{scannedIds.length}</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3">
                <div className="text-[10px] text-slate-400">SCIENCE DOWNLINKED</div>
                <div className="text-base font-bold text-cyan-300">{downlinkedGB} GB</div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-3">
                <div className="text-[10px] text-slate-400">MISSION COST</div>
                <div className="text-base font-bold text-emerald-400">${round1(metrics.costM)}M</div>
              </div>
            </div>

            {/* Post-Mission Cause & Effect Subsystem Analysis */}
            <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-4 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  Cause &amp; Effect Engineering Breakdown
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {OBJECTIVE_FOCUSES.find((f) => f.id === (config.objectiveFocus || 'balanced'))?.title}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {reportData.causeEffects.map((ce) => (
                  <div
                    key={ce.subsystem}
                    className={`rounded-lg border p-2.5 text-xs ${
                      ce.verdict === 'PASS'
                        ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-100'
                        : ce.verdict === 'WARN'
                          ? 'border-amber-800/60 bg-amber-950/20 text-amber-100'
                          : 'border-rose-800/60 bg-rose-950/20 text-rose-100'
                    }`}
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span>{ce.subsystem}</span>
                      <span className="font-mono text-[10px]">{ce.verdict}</span>
                    </div>
                    <p className="text-[11px] opacity-90 mt-1 leading-snug">{ce.reason}</p>
                  </div>
                ))}
              </div>
              <div className="pt-1 border-t border-slate-800/80 space-y-1">
                {reportData.recommendations.map((rec, i) => (
                  <div key={i} className="text-xs text-slate-300">
                    · {rec}
                  </div>
                ))}
              </div>
            </div>

            <SpaceQuizCard
              missionTitle={mission.name}
              modeLabel="Satellite & Earth Sensor Mode"
              score={reportData.totalScore}
              stars={reportData.stars}
              highlightStat={`SCANNED ${scannedIds.length} TARGETS · DOWNLINKED ${downlinkedGB} GB`}
              onBonusCredits={(amt) => onGrantCredits?.(amt)}
            />

            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => {
                  soundEngine.playSfx('click');
                  setPhase('design');
                }}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Refine Spacecraft
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playSfx('click');
                  setShowDesignModal('save');
                }}
                className="rounded-lg border border-cyan-600/60 bg-cyan-950/35 hover:bg-cyan-500 hover:text-slate-950 px-3.5 py-2.5 text-xs font-semibold text-cyan-200 transition-colors flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                Save / Compare Design
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playSfx('click');
                  setShowDesignModal('leaderboard');
                }}
                className="rounded-lg border border-amber-500/60 bg-amber-950/35 hover:bg-amber-500 hover:text-slate-950 px-3.5 py-2.5 text-xs font-semibold text-amber-200 transition-colors flex items-center gap-1.5"
              >
                <Trophy className="w-3.5 h-3.5" />
                Rankings
              </button>
              {playMode === 'competitive' && !room && competitiveTeams.length > 1 && onSelectCompetitiveTeam && (
                <button
                  type="button"
                  onClick={() => {
                    const nextIdx = (activeCompetitiveIdx + 1) % competitiveTeams.length;
                    handleSwitchCompetitiveTeam(nextIdx);
                  }}
                  className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  Next Team Turn →
                </button>
              )}
              <button
                onClick={() => {
                  soundEngine.playSfx('click');
                  setShowEnding(true);
                }}
                className="rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-2.5 text-xs font-medium text-slate-300 transition-colors"
              >
                Replay Ending
              </button>
              {onOpenMaintenanceLab && metrics.avgSensorDurabilityPct < 96 && (
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    onOpenMaintenanceLab();
                  }}
                  className="rounded-lg border border-amber-500/60 bg-amber-950/40 hover:bg-amber-500 hover:text-slate-950 px-4 py-2.5 text-xs font-semibold text-amber-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Wrench className="w-4 h-4" />
                  Maintain Sensors ({metrics.avgSensorDurabilityPct}%)
                </button>
              )}
              {activeChapter && reportData.outcome !== 'fail' && onCompleteStoryChapter ? (
                <button
                  onClick={() => {
                    soundEngine.playSfx('snap');
                    onCompleteStoryChapter(activeChapter);
                  }}
                  className="flex-1 rounded-lg bg-violet-500 hover:bg-violet-400 text-slate-950 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
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
                  className="flex-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2"
                >
                  <Award className="w-4 h-4" />
                  Return to Command Hub
                </button>
              )}
            </div>
          </div>
        </main>
      )}

      {/* ENDING CUTSCENE WHEN SATELLITE & EARTH SENSOR GAMEPLAY FINISHES */}
      {phase === 'report' && reportData && showEnding && (
        <MissionEndingModal
          mode="satellite"
          title={
            reportData.outcome === 'success'
              ? `${mission.name} · Healthy Earth View`
              : mission.name
          }
          subtitle={`Satellite Operations Ending · ${metrics.orbit.id} · ${reportData.rank}`}
          destinationId={config.orbit}
          outcome={reportData.outcome}
          score={reportData.totalScore}
          stars={reportData.stars}
          creditsEarned={reportData.credits}
          highlightLine={`Scanned ${scannedIds.length} Earth hazard(s) · Earth Office received ${downlinkedGB} GB · +${reportData.xpEarned} EXP`}
          realWorldImpact={
            reportData.outcome === 'success'
              ? `Look at Earth from orbit—healthy, blue, and protected! Earth Office received ${downlinkedGB} GB of hazard maps across ${scannedIds.length} zones and fixed dangers on the ground!`
              : reportData.outcome === 'partial'
                ? `Earth Office received ${downlinkedGB} GB of satellite scans. Scan more hotspots and beam data to Ground Stations to make Earth 100% healthy!`
                : 'Your spacecraft entered safe recovery mode—adjust sensors, power, or thermal balance in the designer to protect Earth!'
          }
          beats={buildSatelliteEndingBeats(
            reportData.outcome,
            mission.name,
            scannedIds.length,
            downlinkedGB,
            reportData.rank,
          )}
          onContinue={() => setShowEnding(false)}
        />
      )}

      {showDesignModal && (
        <DesignCompareModal
          initialTab={showDesignModal}
          mission={mission}
          currentConfig={config}
          currentTeamName={
            playMode === 'competitive'
              ? (room ? room.competitiveTeams : competitiveTeams)[
                  room
                    ? (room.players.find((p) => p.clientId === localClientId)?.teamIndex ??
                      activeCompetitiveIdx)
                    : activeCompetitiveIdx
                ]?.teamName || 'Team 1'
              : playMode === 'coop'
                ? (room ? room.players : teamMembers).map((m) => m.name).join(' · ')
                : levelInfo.title
          }
          difficulty={difficulty}
          playMode={playMode}
          sandboxMode={sandboxMode}
          save={save}
          competitiveTeams={room ? room.competitiveTeams : competitiveTeams}
          onSaveDesign={onSaveDesign}
          onLoadConfig={(loadedCfg) => {
            setConfig({ ...loadedCfg });
            setPhase('design');
          }}
          onClose={() => setShowDesignModal(null)}
        />
      )}
    </div>
  );
}

function buildSatelliteEndingBeats(
  outcome: 'success' | 'partial' | 'fail',
  missionName: string,
  scannedCount: number,
  downlinkedGB: number,
  rank: string,
): EndingBeat[] {
  if (outcome === 'success') {
    return [
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        line: `All ground stations locked onto ${missionName}! ${downlinkedGB} GB of hazard maps across ${scannedCount} Earth zones are now protecting communities below.`,
      },
      {
        speaker: 'Director Elena Vance',
        role: 'NASA Mission Operations Lead',
        line: `Promoted to ${rank}! Your balance of spacecraft engineering, thermal control, and orbital scanning set a benchmark for Mission Control.`,
      },
    ];
  }
  if (outcome === 'partial') {
    return [
      {
        speaker: 'NOVA',
        role: 'Onboard Flight Guidance System',
        line: `${missionName} transmitted ${downlinkedGB} GB across ${scannedCount} scanned zones before completing its operational window.`,
      },
      {
        speaker: 'Dr. Arya Pratama',
        role: 'Lead Earth Observation Scientist',
        line: 'Good science return! Next time, press [Space] directly over glowing hotspots and [D] over ground stations to boost your score.',
      },
    ];
  }
  return [
    {
      speaker: 'NOVA',
      role: 'Onboard Flight Guidance System',
      line: `${missionName} entered safe diagnostic standby. Some mission goals or spacecraft subsystems need extra engineering margin.`,
    },
    {
      speaker: 'Director Elena Vance',
      role: 'NASA Mission Operations Lead',
      line: 'Every NASA spacecraft improves through testing. Return to the designer, check the red warnings, and try another orbit!',
    },
  ];
}
