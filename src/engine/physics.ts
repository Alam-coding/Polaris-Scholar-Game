import {
  ADCS_OPTIONS,
  COMMS_OPTIONS,
  COMPUTER_OPTIONS,
  DIFFICULTY_PROFILES,
  GOAL_LABELS,
  INSTRUMENTS,
  LAUNCH_VEHICLES,
  LAUNCH_WINDOWS,
  MISSION_CRITICAL_RESOURCES,
  ORBITS,
  POWER_OPTIONS,
  PROP_OPTIONS,
  ROCKET_DESTINATIONS,
  ROCKET_ENGINES,
  STORE_OPTIONS,
  THERM_OPTIONS,
} from '../data/missionData';
import {
  CampaignSave,
  DifficultyLevel,
  MissionDef,
  MissionProblem,
  OrbitId,
  RandomConstraintDef,
  RocketConfig,
  SatelliteConfig,
  SatelliteMetrics,
  SavedMissionDesign,
  ValidationItem,
} from '../types/mission';

const G0 = 9.80665;
const STRUCTURAL_LIMIT_KG = 380;

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export const round1 = (n: number) => Math.round(n * 10) / 10;

export const DEFAULT_SENSOR_DURABILITY: Record<string, number> = {
  img: 100,
  snd: 100,
  lid: 100,
  rad: 100,
  cor: 100,
  par: 100,
  mag: 100,
  neu: 100,
};

export function getSensorDurability(
  sensorDurability: Record<string, number> | undefined,
  id: string,
): number {
  const raw = sensorDurability?.[id];
  if (typeof raw !== 'number' || Number.isNaN(raw)) return 100;
  return Math.round(clamp(raw, 20, 100));
}

export function getMaintenanceCost(healthPct: number): number {
  const missing = Math.max(0, 100 - clamp(healthPct, 20, 100));
  if (missing === 0) return 0;
  return Math.max(6, Math.ceil(missing * 0.35));
}

export function getDurabilityScienceMultiplier(healthPct: number): number {
  const h = clamp(healthPct, 20, 100);
  // 100% -> 1.00x, 60% -> 0.84x, 20% -> 0.68x (smooth, never zero so missions remain playable)
  return clamp(0.6 + (h / 100) * 0.4, 0.68, 1.0);
}

export const DEFAULT_CAMPAIGN_SAVE: CampaignSave = {
  credits: 120,
  xp: 0,
  streak: 0,
  difficulty: 'engineer',
  upgrades: {
    budget: 0,
    solar: 0,
    composite: 0,
    comms: 0,
    isp: 0,
  },
  sensorDurability: { ...DEFAULT_SENSOR_DURABILITY },
  missionStars: {},
  history: [],
  savedDesigns: [],
  leaderboard: [],
  tutorialDone: false,
  storyStep: 0,
  seenStoryIntros: [],
  prologueSeen: false,
  explorerMode: true,
};

export interface PlayerLevelInfo {
  level: number;
  title: string;
  xp: number;
  currentFloor: number;
  nextThreshold: number;
  progressPct: number;
  xpToNext: number;
}

const LEVEL_BANDS: Array<{ level: number; minXp: number; title: string }> = [
  { level: 1, minXp: 0, title: 'Cadet Explorer' },
  { level: 2, minXp: 100, title: 'Orbital Engineer' },
  { level: 3, minXp: 240, title: 'Flight Specialist' },
  { level: 4, minXp: 420, title: 'Chief Mission Architect' },
  { level: 5, minXp: 650, title: 'Master Space Director' },
  { level: 6, minXp: 950, title: 'Legend of NASA Space Apps' },
];

export function getPlayerLevelInfo(rawXp: number): PlayerLevelInfo {
  const xp = Math.max(0, Math.round(rawXp || 0));
  let cur = LEVEL_BANDS[0];
  let next = LEVEL_BANDS[1];
  for (let i = 0; i < LEVEL_BANDS.length; i++) {
    if (xp >= LEVEL_BANDS[i].minXp) {
      cur = LEVEL_BANDS[i];
      next = LEVEL_BANDS[i + 1] || {
        level: cur.level + 1,
        minXp: cur.minXp + 350,
        title: 'Galactic Pioneer',
      };
    }
  }
  const span = Math.max(1, next.minXp - cur.minXp);
  const progressPct = Math.round(clamp(((xp - cur.minXp) / span) * 100, 0, 100));
  return {
    level: cur.level,
    title: cur.title,
    xp,
    currentFloor: cur.minXp,
    nextThreshold: next.minXp,
    progressPct,
    xpToNext: Math.max(0, next.minXp - xp),
  };
}

const STORAGE_KEY = 'mission-architect-nasa-save-v1';

export function loadCampaignSave(): CampaignSave {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_CAMPAIGN_SAVE,
        upgrades: { ...DEFAULT_CAMPAIGN_SAVE.upgrades },
        sensorDurability: { ...DEFAULT_SENSOR_DURABILITY },
      };
    }
    const parsed = JSON.parse(raw);
    const diff: DifficultyLevel =
      parsed.difficulty === 'cadet' || parsed.difficulty === 'director' ? parsed.difficulty : 'engineer';
    return {
      credits: typeof parsed.credits === 'number' ? parsed.credits : 120,
      xp: typeof parsed.xp === 'number' ? parsed.xp : 0,
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      difficulty: diff,
      upgrades: { ...DEFAULT_CAMPAIGN_SAVE.upgrades, ...(parsed.upgrades || {}) },
      sensorDurability: { ...DEFAULT_SENSOR_DURABILITY, ...(parsed.sensorDurability || {}) },
      missionStars: parsed.missionStars || {},
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 40) : [],
      savedDesigns: Array.isArray(parsed.savedDesigns) ? parsed.savedDesigns.slice(0, 24) : [],
      leaderboard: Array.isArray(parsed.leaderboard) ? parsed.leaderboard.slice(0, 40) : [],
      tutorialDone: !!parsed.tutorialDone,
      storyStep: typeof parsed.storyStep === 'number' ? parsed.storyStep : 0,
      seenStoryIntros: Array.isArray(parsed.seenStoryIntros) ? parsed.seenStoryIntros : [],
      prologueSeen: Boolean(parsed.prologueSeen),
      explorerMode: typeof parsed.explorerMode === 'boolean' ? parsed.explorerMode : true,
    };
  } catch {
    return {
      ...DEFAULT_CAMPAIGN_SAVE,
      upgrades: { ...DEFAULT_CAMPAIGN_SAVE.upgrades },
      sensorDurability: { ...DEFAULT_SENSOR_DURABILITY },
    };
  }
}

export function saveCampaignSave(save: CampaignSave) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Ignore storage quota errors
  }
}

export function createDefaultSatelliteConfig(mission: MissionDef): SatelliteConfig {
  const orbit = mission.allowedOrbits[0] || 'LEO';
  // Each mission intentionally starts with realistic spacecraft problems to diagnose & fix!
  if (mission.id === 'zero') {
    return {
      power: 'b',
      comms: 'a', // Fault: UHF too slow for 40 GB/d Imager
      prop: 'b',
      therm: 'a',
      store: 'b',
      computer: 'a',
      adcs: 'a',
      lifetimeMonths: 12,
      objectiveFocus: 'balanced',
      instruments: [], // Fault: missing camera sensor
      lv: 'b',
      orbit: 'LEO',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['arr', 'fair', 'ant', 'ops', 'burn'], // Fault: Fairing stuck after Solar Array!
      policy: 'balanced',
      radiationShield: false,
    };
  }
  if (mission.id === 'earth') {
    return {
      power: 'a', // Fault: Small solar panel causes brownout
      comms: 'a', // Fault: UHF bottleneck
      prop: 'b',
      therm: 'a',
      store: 'a', // Fault: 16 GB SSD overflows
      computer: 'a',
      adcs: 'a',
      lifetimeMonths: 24,
      objectiveFocus: 'balanced',
      instruments: ['img', 'lid'], // Fault: both on left side -> CoM offset + missing climate!
      lv: 'b',
      orbit: 'LEO',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['fair', 'arr', 'ant', 'ops', 'burn'],
      policy: 'balanced',
      radiationShield: false,
    };
  }
  if (mission.id === 'sun') {
    return {
      power: 'b',
      comms: 'b',
      prop: 'a', // Fault: Cold gas fails L1 delta-v
      therm: 'a', // Fault: Overheats in continuous L1 sun
      store: 'b',
      computer: 'b',
      adcs: 'b',
      lifetimeMonths: 24,
      objectiveFocus: 'balanced',
      instruments: ['cor'], // Fault: missing particles + magnet
      lv: 'a', // Fault: Light launcher fails L1 payload mass
      orbit: 'L1',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['arr', 'fair', 'ant', 'ops', 'burn'], // Fault: Staging sequence broken
      policy: 'balanced',
      radiationShield: false, // Fault: L1 solar storm requires shielding!
    };
  }
  if (mission.id === 'moon') {
    return {
      power: 'b',
      comms: 'a', // Fault: Slow radio
      prop: 'b', // Fault: Monoprop short on Lunar delta-v
      therm: 'a', // Fault: Extreme Lunar cold requires Level 3 fluid loop
      store: 'a', // Fault: Tiny SSD
      computer: 'b',
      adcs: 'b',
      lifetimeMonths: 24,
      objectiveFocus: 'balanced',
      instruments: ['img'], // Fault: Missing ice + thermal
      lv: 'b', // Fault: Needs Heavy Launcher
      orbit: 'LUNAR',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['arr', 'fair', 'ant', 'ops', 'burn'],
      policy: 'balanced',
      radiationShield: false, // Fault: Deep space radiation shield needed
    };
  }
  // Mars Odyssey (Level 4 Expert): Chemical propellant + weak solar + medium rocket all fail!
  return {
    power: 'b', // Fault: Weak Mars sunlight requires High-Area Arrays ('c')
    comms: 'a', // Fault: Needs X-Band or Ka-Band for Mars distance
    prop: 'c', // Fault: Heavy Bipropellant exceeds Mars 420 kg cap -> must use Ion ('d')!
    therm: 'a', // Fault: Level 1 foil fails Mars thermal swings
    store: 'a', // Fault: Tiny SSD
    computer: 'b',
    adcs: 'b',
    lifetimeMonths: 36,
    objectiveFocus: 'balanced',
    instruments: ['img'], // Fault: Missing thermal + neutron relay
    lv: 'b', // Fault: Needs Heavy Launcher ('c')
    orbit,
    transfer: 'a',
    fuelLoadPct: 100,
    reservePct: 10,
    throttlePct: 75,
    sequence: ['fair', 'arr', 'ant', 'burn', 'ops'], // Note: Ion requires Array before Burn too
    policy: 'balanced',
    radiationShield: false, // Fault: Interplanetary radiation shield required
  };
}

export const DEFAULT_SENSOR_BAY: Record<string, 'left' | 'right'> = {
  img: 'left',
  lid: 'left',
  cor: 'left',
  mag: 'left',
  snd: 'right',
  rad: 'right',
  par: 'right',
  neu: 'right',
};

export function getSensorBay(cfg: Pick<SatelliteConfig, 'sensorBays'>, id: string): 'left' | 'right' {
  return cfg.sensorBays?.[id] || DEFAULT_SENSOR_BAY[id] || 'left';
}

const MASS_COORDS: Record<string, [number, number, number]> = {
  power: [0, 0, 0.12],
  comms: [0, 1.45, 0.18],
  prop: [0, 0, -1.48],
  therm: [0, -0.68, 0],
  store: [0, -0.35, -0.28],
  img: [-1.05, 0.25, 0.92],
  snd: [1.05, 0.25, 0.92],
  lid: [-1.05, -0.25, 0.92],
  rad: [1.05, -0.25, 0.92],
  cor: [-0.85, 0.25, 0.92],
  par: [0.85, 0.25, 0.92],
  mag: [-0.85, -0.25, 0.92],
  neu: [0.85, -0.25, 0.92],
};

export function calculateSatelliteMetrics(
  mission: MissionDef,
  cfg: SatelliteConfig,
  upgrades: CampaignSave['upgrades'],
  sensorDurability?: Record<string, number>,
  options?: {
    difficulty?: DifficultyLevel;
    sandboxMode?: boolean;
    randomConstraint?: RandomConstraintDef | null;
  },
): SatelliteMetrics {
  const diffLevel = options?.difficulty || 'engineer';
  const diffProfile = DIFFICULTY_PROFILES[diffLevel];
  const sandboxMode = Boolean(options?.sandboxMode);
  const rc = options?.randomConstraint || null;

  const orbit = ORBITS[cfg.orbit];
  const lv = LAUNCH_VEHICLES.find((x) => x.id === cfg.lv) || LAUNCH_VEHICLES[1];
  const powerOpt = POWER_OPTIONS.find((x) => x.id === cfg.power)!;
  const commsOpt = COMMS_OPTIONS.find((x) => x.id === cfg.comms)!;
  const propOpt = PROP_OPTIONS.find((x) => x.id === cfg.prop)!;
  const thermOpt = THERM_OPTIONS.find((x) => x.id === cfg.therm)!;
  const storeOpt = STORE_OPTIONS.find((x) => x.id === cfg.store)!;
  const computerOpt = COMPUTER_OPTIONS.find((x) => x.id === (cfg.computer || 'a')) || COMPUTER_OPTIONS[0];
  const adcsOpt = ADCS_OPTIONS.find((x) => x.id === (cfg.adcs || 'a')) || ADCS_OPTIONS[0];
  const lifetimeMonths = cfg.lifetimeMonths || 24;

  const instruments = cfg.instruments
    .map((id) => INSTRUMENTS.find((i) => i.id === id))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const busMass = Math.round(120 * (1 - upgrades.composite * 0.07));
  const shieldMass = cfg.radiationShield ? 14 : 0;
  const shieldCost = cfg.radiationShield ? 15 : 0;

  const instMass = instruments.reduce((s, i) => s + i.mass, 0);
  const sysMass =
    powerOpt.mass +
    commsOpt.mass +
    propOpt.mass +
    thermOpt.mass +
    storeOpt.mass +
    computerOpt.mass +
    adcsOpt.mass;
  const structuralMassKg = busMass + instMass + sysMass + shieldMass;
  const dryMassKg = structuralMassKg;

  const propMassKg = (propOpt.propellantKg * cfg.fuelLoadPct) / 100;
  const reserveFraction = clamp(cfg.reservePct / 100, 0, 0.3);
  const reserveMassKg = propMassKg * reserveFraction;
  const usablePropKg = Math.max(0, propMassKg - reserveMassKg);
  const wetMassKg = dryMassKg + propMassKg;

  const budgetConstraintMult = rc ? 1 + rc.budgetDeltaPct / 100 : 1;
  const effectiveBudgetM = sandboxMode
    ? 9999
    : Math.round(mission.budget * (1 + upgrades.budget * 0.1) * diffProfile.budgetMult * budgetConstraintMult);
  const instCost = instruments.reduce((s, i) => s + i.cost, 0);
  const sysCost =
    powerOpt.cost +
    commsOpt.cost +
    propOpt.cost +
    thermOpt.cost +
    storeOpt.cost +
    computerOpt.cost +
    adcsOpt.cost;
  const costM = 20 + instCost + sysCost + lv.costM + shieldCost + propMassKg * 0.08;

  const policyMult =
    cfg.policy === 'protect'
      ? { science: 0.88, power: 0.82, label: 'Protect Spacecraft' }
      : cfg.policy === 'science'
        ? { science: 1.15, power: 1.18, label: 'Prioritize Science' }
        : { science: 1.0, power: 1.0, label: 'Balanced Operations' };

  const busPowerW =
    40 + commsOpt.power + storeOpt.power + thermOpt.power + propOpt.power + computerOpt.power + adcsOpt.power;
  const instPowerW = instruments.reduce((s, i) => s + i.power, 0);
  const marsIrradiance = orbit.id === 'MARS' ? 0.8 : 1.0;
  const powerConstraintMult = rc ? 1 + rc.powerDeltaPct / 100 : 1;
  const solarGenW = Math.round(powerOpt.genW * marsIrradiance * (1 + upgrades.solar * 0.12) * powerConstraintMult);
  const orbitAvgGenW = solarGenW * orbit.sunlightFraction;

  const ix = (s: string) => cfg.sequence.indexOf(s as SatelliteConfig['sequence'][number]);
  const fairOK = ix('fair') < ix('arr') && ix('fair') < ix('ant') && ix('fair') < ix('ops');
  const arrayBeforeBurn = ix('arr') < ix('burn');

  let availW = orbitAvgGenW - busPowerW;
  if (!arrayBeforeBurn && cfg.prop === 'd') availW *= 0.25;

  const thermalQuality = clamp(
    1.0 - Math.max(0, orbit.thermalSeverity - thermOpt.level) * diffProfile.thermalPenalty,
    0.54,
    1.0,
  );
  const orderedInst = [...instruments].sort(
    (a, b) => a.power / Math.max(1, a.scienceScore) - b.power / Math.max(1, b.scienceScore),
  );
  const poweredInstruments = orderedInst.map((inst) => {
    const reqW = inst.power * policyMult.power;
    const online = availW >= reqW;
    if (online) availW -= reqW;
    const durPct = getSensorDurability(sensorDurability, inst.id);
    const durMult = getDurabilityScienceMultiplier(durPct);
    return { inst, online, quality: thermalQuality * durMult };
  });
  const avgSensorDurabilityPct =
    instruments.length > 0
      ? Math.round(
          instruments.reduce((s, inst) => s + getSensorDurability(sensorDurability, inst.id), 0) /
            instruments.length,
        )
      : 100;

  const activeInst = poweredInstruments.filter((p) => p.online).map((p) => p.inst);
  const activePowerW = activeInst.reduce((s, i) => s + i.power, 0) * policyMult.power;
  const totalLoadW = busPowerW + instPowerW * policyMult.power;
  const actualLoadW = busPowerW + activePowerW;

  const battCapWh = powerOpt.battWh;
  const eclipseHours = orbit.eclipseFraction * 24;
  const eclipseEnergyWh = actualLoadW * eclipseHours;
  const batteryUsableWh = battCapWh * 0.9;
  const batteryReservePct = Math.round(clamp((batteryUsableWh - eclipseEnergyWh) / Math.max(1, battCapWh), 0, 1) * 100);

  const rawDataProdGB = activeInst.reduce((s, i) => s + i.dataRate, 0) * policyMult.science;
  const dataProdGB = round1(rawDataProdGB * computerOpt.compressionRatio);
  const downlinkConstraintMult = rc ? 1 + rc.downlinkDeltaPct / 100 : 1;
  const downlinkGB = commsOpt.rateGB * orbit.contactFraction * (1 + upgrades.comms * 0.15) * downlinkConstraintMult;
  const storageNeedGB = (dataProdGB * 0.5) / Math.max(0.1, orbit.contactFraction);

  const lvCapacityKg = lv.capLeoKg * orbit.payloadFactor;
  const transferMult = cfg.transfer === 'b' ? 0.82 : 1.0;
  const transferDays = cfg.transfer === 'b' ? 65 : 5;
  const dragPerMonth = orbit.id === 'LEO' ? 1.8 : orbit.id === 'SSO' ? 0.9 : 0.4;
  const lifetimeDvExtra = Math.max(0, Math.round((lifetimeMonths - 12) * dragPerMonth));
  const dvConstraintMult = rc ? 1 + rc.dvDeltaPct / 100 : 1;
  const dvNeeded = Math.round(orbit.dvBase * transferMult * diffProfile.dvMult * dvConstraintMult + lifetimeDvExtra);

  const effectiveIsp = propOpt.isp * (1 + upgrades.isp * 0.06);
  const dvAvailable =
    usablePropKg > 0 ? effectiveIsp * G0 * Math.log(wetMassKg / (dryMassKg + reserveMassKg)) : 0;
  const throttle = clamp(cfg.throttlePct / 100, 0.05, 1);
  const burnTimeSec =
    usablePropKg > 0 ? (usablePropKg * effectiveIsp * G0) / (propOpt.thrustN * throttle) : 0;

  // Center of Mass calculation (lateral Left/Right balance perpendicular to thrust axis)
  let leftMassKg = 0;
  let rightMassKg = 0;
  const instNodes = instruments.map((i) => {
    const base = MASS_COORDS[i.id] || ([0.9, 0, 0.9] as [number, number, number]);
    const bay = getSensorBay(cfg, i.id);
    const xCoord = bay === 'left' ? -Math.abs(base[0] || 0.9) : Math.abs(base[0] || 0.9);
    if (bay === 'left') leftMassKg += i.mass;
    else rightMassKg += i.mass;
    return { m: i.mass, p: [xCoord, base[1], base[2]] as [number, number, number] };
  });

  const massNodes = [
    { m: busMass + shieldMass, p: [0, 0, 0] as [number, number, number] },
    { m: powerOpt.mass, p: MASS_COORDS.power },
    { m: commsOpt.mass, p: [0, 0, 0.18] as [number, number, number] },
    { m: propOpt.mass + propMassKg, p: MASS_COORDS.prop },
    { m: thermOpt.mass + adcsOpt.mass, p: [0, 0, 0] as [number, number, number] },
    { m: storeOpt.mass + computerOpt.mass, p: MASS_COORDS.store },
    ...instNodes,
  ];
  const totalM = massNodes.reduce((s, n) => s + n.m, 0) || 1;
  const comX = massNodes.reduce((s, n) => s + n.m * n.p[0], 0) / totalM;
  const comY = massNodes.reduce((s, n) => s + n.m * n.p[1], 0) / totalM;
  const comOffsetM = Math.hypot(comX, comY * 0.45);
  const comBlueprintX = clamp(200 + comX * 135, 160, 240);
  const comBlueprintY = clamp(142 - comY * 55, 118, 168);

  const warnings: ValidationItem[] = [];
  const pushWarn = (
    code: string,
    severity: ValidationItem['severity'],
    description: string,
    correction: string,
  ) => warnings.push({ code, severity: sandboxMode ? 'WARNING' : severity, description, correction });

  if (instruments.length === 0) {
    pushWarn(
      'SCI-01',
      'NO-GO',
      'No science instruments selected.',
      'Install at least one sensor matching the mission objectives.',
    );
  }
  if (!sandboxMode && costM > effectiveBudgetM) {
    pushWarn(
      'FIN-01',
      'NO-GO',
      `Budget exceeded by $${round1(costM - effectiveBudgetM)}M ($${round1(costM)}M / $${effectiveBudgetM}M).`,
      'Trim extra non-REQ sensors, swap Ka-Band to X-Band, or pick a lighter rocket in LEO/SSO.',
    );
  }
  if (structuralMassKg > STRUCTURAL_LIMIT_KG) {
    pushWarn(
      'STR-01',
      'NO-GO',
      `Structural mass ${round1(structuralMassKg)} kg exceeds bus limit (${STRUCTURAL_LIMIT_KG} kg).`,
      'Trim heavy instruments or upgrade Carbon-Lattice Bus Frame.',
    );
  }
  if (wetMassKg > lvCapacityKg) {
    pushWarn(
      'LCH-01',
      'NO-GO',
      `Wet mass ${round1(wetMassKg)} kg exceeds ${lv.name} payload capacity (${round1(lvCapacityKg)} kg to ${orbit.id}).`,
      'Select a heavier launch vehicle or reduce spacecraft mass.',
    );
  } else if (wetMassKg > lvCapacityKg * 0.92) {
    pushWarn(
      'LCH-02',
      'WARNING',
      `Tight launch mass margin (< 8% remaining on ${lv.name}).`,
      'Consider a heavier rocket or shedding propellant reserve.',
    );
  }
  if (dvAvailable < dvNeeded) {
    pushWarn(
      'PRP-01',
      'NO-GO',
      `Insufficient Δv: need ${round1(dvNeeded)} m/s, spacecraft has ${round1(dvAvailable)} m/s.`,
      'Upgrade propulsion (Bipropellant / Ion), reduce lifetime drag, or choose Low-Energy transfer.',
    );
  }
  if (!sandboxMode && !mission.allowedOrbits.includes(cfg.orbit)) {
    pushWarn(
      'ORB-01',
      'NO-GO',
      `${orbit.name} does not match target mission requirements.`,
      `Switch orbit to ${mission.allowedOrbits.join(' or ')}.`,
    );
  }
  if (!fairOK) {
    pushWarn(
      'SEQ-01',
      'NO-GO',
      'Invalid staging order: Fairing Jettison must occur before Solar Arrays, Antenna, and Sensors.',
      'Move Fairing Jettison to Step 1 in the Staging Sequence.',
    );
  }
  if (cfg.prop === 'd' && !arrayBeforeBurn) {
    pushWarn(
      'SEQ-02',
      'NO-GO',
      'Hall-Effect Ion propulsion requires Solar Arrays deployed before Orbit Burn.',
      'Place Solar Array Unfurl earlier than Orbit Insertion Burn.',
    );
  }
  if ((orbit.id === 'L1' || orbit.id === 'LUNAR' || orbit.id === 'MARS') && !cfg.radiationShield) {
    pushWarn(
      'RAD-01',
      'NO-GO',
      `Deep-space orbit (${orbit.id}) exposes electronics to cosmic & solar storms without Radiation Shielding.`,
      'Enable Radiation Hardened Shielding (+14 kg, +$15M) in Subsystems.',
    );
  }

  if (totalLoadW > orbitAvgGenW) {
    pushWarn(
      'PWR-01',
      'WARNING',
      `Power deficit (${round1(totalLoadW)} W load vs ${round1(orbitAvgGenW)} W generated). Lower-efficiency instruments will brown out.`,
      'Upgrade Solar Arrays or switch Policy to Balanced / Protect.',
    );
  }
  if (batteryReservePct < 15) {
    pushWarn(
      'BAT-01',
      'WARNING',
      `Low eclipse battery reserve (${batteryReservePct}% remaining across ${round1(eclipseHours)}h shadow).`,
      'Select a larger Solar + Li-Ion Power system.',
    );
  }
  if (thermalQuality < 0.99) {
    pushWarn(
      'THM-01',
      'WARNING',
      `Thermal control Level ${thermOpt.level} below orbit severity ${orbit.thermalSeverity} (sensor quality ${Math.round(thermalQuality * 100)}%).`,
      'Upgrade Thermal Control to Heaters + Radiators or Active Fluid Loop.',
    );
  }
  if (storageNeedGB > storeOpt.capacityGB) {
    pushWarn(
      'DAT-01',
      'WARNING',
      `Data buffer (${storeOpt.capacityGB} GB) too small for ${round1(storageNeedGB)} GB between ground passes.`,
      'Upgrade to 128 GB / 512 GB Solid-State Recorder or enable Edge-AI Computer compression.',
    );
  }
  if (dataProdGB > downlinkGB) {
    pushWarn(
      'COM-01',
      'WARNING',
      `Downlink bottleneck: ${round1(downlinkGB)} GB/day capacity vs ${round1(dataProdGB)} GB/day generated.`,
      'Upgrade radio to X-Band/Ka-Band dish or upgrade Onboard Computer compression.',
    );
  }
  mission.goals.forEach((g) => {
    if (!instruments.some((i) => i.goals.includes(g))) {
      pushWarn(
        'SCI-02',
        'WARNING',
        `Missing sensor for mission objective: ${GOAL_LABELS[g]}.`,
        `Equip an instrument tagged with ${GOAL_LABELS[g]}.`,
      );
    }
  });
  const wornEquipped = instruments.filter((i) => getSensorDurability(sensorDurability, i.id) < 65);
  if (wornEquipped.length > 0) {
    const lowest = Math.min(...wornEquipped.map((i) => getSensorDurability(sensorDurability, i.id)));
    pushWarn(
      'DUR-01',
      'WARNING',
      `${wornEquipped.length} equipped sensor(s) worn down (lowest ${lowest}% durability). Science scan yield is reduced.`,
      'Visit Hub → R&D Lab & Maintenance → Sensor Maintenance Bay to restore sensor health to 100%.',
    );
  }

  const hasBlocker = warnings.some((w) => w.severity === 'NO-GO');
  const status = hasBlocker ? 'NO-GO' : warnings.length > 0 ? 'GO WITH WARNINGS' : 'GO';

  return {
    mission,
    orbit,
    lv,
    instruments,
    powerOpt,
    commsOpt,
    propOpt,
    thermOpt,
    storeOpt,
    computerOpt,
    adcsOpt,
    structuralMassKg,
    structuralLimitKg: STRUCTURAL_LIMIT_KG,
    dryMassKg,
    propMassKg,
    reserveMassKg,
    usablePropKg,
    wetMassKg,
    costM,
    effectiveBudgetM,
    busPowerW,
    instPowerW,
    totalLoadW,
    solarGenW,
    orbitAvgGenW,
    battCapWh,
    eclipseHours,
    eclipseEnergyWh,
    batteryReservePct,
    thermalQuality,
    rawDataProdGB,
    dataProdGB,
    downlinkGB,
    storageNeedGB,
    lvCapacityKg,
    dvNeeded,
    dvAvailable,
    burnTimeSec,
    comOffsetM,
    comToleranceM: adcsOpt.comToleranceM,
    comBlueprintX,
    comBlueprintY,
    leftMassKg,
    rightMassKg,
    comX,
    transferDays,
    lifetimeMonths,
    lifetimeDvExtra,
    pointingBonusPct: adcsOpt.pointingBonusPct,
    criticalResources: MISSION_CRITICAL_RESOURCES[mission.id] || ['Power Margin', 'Downlink Bandwidth'],
    poweredInstruments,
    avgSensorDurabilityPct,
    warnings,
    status,
  };
}

export interface RocketMetrics {
  dest: (typeof ROCKET_DESTINATIONS)[number];
  window: (typeof LAUNCH_WINDOWS)[number];
  dv1: number;
  dv2: number;
  dv3: number;
  dvTotal: number;
  dvRequired: number;
  twrStage1: number;
  twrStage2: number;
  liftoffMassT: number;
  costM: number;
  budgetCapM: number;
  warnings: string[];
  readyToLaunch: boolean;
}

export function calculateRocketMetrics(
  cfg: RocketConfig,
  upgrades: CampaignSave['upgrades'],
  sandboxMode = false,
): RocketMetrics {
  const dest = ROCKET_DESTINATIONS.find((d) => d.id === cfg.destination) || ROCKET_DESTINATIONS[0];
  const window = LAUNCH_WINDOWS[cfg.windowIndex] || LAUNCH_WINDOWS[2];
  const e1 = ROCKET_ENGINES[cfg.stage1Engine];
  const e2 = ROCKET_ENGINES[cfg.stage2Engine];
  const e3 = ROCKET_ENGINES[cfg.stage3Engine];

  const ispMult = 1 + upgrades.isp * 0.06;
  const dryMassMult = 1 - upgrades.composite * 0.07;
  const FUEL_PER_TANK = 10.5;
  const DRY_PER_TANK = 0.72 * dryMassMult;
  const TANK_COST = 8;

  const payloadT = cfg.payloadMassT * (cfg.fairingType === 'composite' ? 0.92 : 1.0) * (1 - upgrades.composite * 0.03);
  const m03 =
    cfg.stage3Tanks > 0
      ? payloadT + e3.massT + cfg.stage3Tanks * (FUEL_PER_TANK + DRY_PER_TANK)
      : payloadT;
  const dv3 =
    cfg.stage3Tanks > 0
      ? e3.isp * ispMult * G0 * Math.log(m03 / (m03 - cfg.stage3Tanks * FUEL_PER_TANK))
      : 0;

  const m02 = m03 + e2.massT + cfg.stage2Tanks * (FUEL_PER_TANK + DRY_PER_TANK);
  const twrStage2 = e2.thrustKN / (m02 * G0);
  let dv2 =
    e2.isp * ispMult * G0 * Math.log(m02 / (m02 - cfg.stage2Tanks * FUEL_PER_TANK));
  if (twrStage2 < 0.25) dv2 *= 0.9;

  const m01 = m02 + cfg.stage1EnginesCount * e1.massT + cfg.stage1Tanks * (FUEL_PER_TANK + DRY_PER_TANK);
  const twrStage1 = (cfg.stage1EnginesCount * e1.thrustKN) / (m01 * G0);
  const dv1 =
    e1.isp * e1.atmFactor * ispMult * G0 * Math.log(m01 / (m01 - cfg.stage1Tanks * FUEL_PER_TANK));

  const dvTotal = dv1 + dv2 + dv3;
  const dvRequired = dest.requiredDv + window.dvPenalty;

  const s3Cost = cfg.stage3Tanks > 0 ? e3.costM + cfg.stage3Tanks * TANK_COST : 0;
  const fairingCost = cfg.fairingType === 'composite' ? 18 : 6;
  const costM =
    cfg.stage1EnginesCount * e1.costM +
    cfg.stage1Tanks * TANK_COST +
    e2.costM +
    cfg.stage2Tanks * TANK_COST +
    s3Cost +
    fairingCost;

  const budgetCapM = sandboxMode ? 9999 : Math.round(420 * (1 + upgrades.budget * 0.1));
  const warnings: string[] = [];

  if (twrStage1 < 1.05) {
    warnings.push(
      `Stage 1 TWR is ${twrStage1.toFixed(2)} (< 1.05). Rocket will stall on the pad! Add Stage 1 engines or reduce fuel tanks.`,
    );
  } else if (twrStage1 < 1.25) {
    warnings.push(
      `Stage 1 TWR is ${twrStage1.toFixed(2)}. Slightly sluggish liftoff; gravity losses will be higher.`,
    );
  }
  if (dvTotal < dvRequired) {
    warnings.push(
      `Total Δv (${Math.round(dvTotal)} m/s) is short of ${dest.name} requirement (${Math.round(dvRequired)} m/s). Add tanks, use Whisper upper stage, or add Stage 3.`,
    );
  }
  if (!sandboxMode && costM > budgetCapM) {
    warnings.push(`Launch cost ($${costM}M) exceeds program allocation ($${budgetCapM}M).`);
  }
  if (window.radioGap) {
    warnings.push(`Day ${window.day} has solar radio interference; expect telemetry blackout risks.`);
  }

  const readyToLaunch = twrStage1 >= 1.0 && dvTotal >= dvRequired * 0.85 && (sandboxMode || costM <= budgetCapM);

  return {
    dest,
    window,
    dv1,
    dv2,
    dv3,
    dvTotal,
    dvRequired,
    twrStage1,
    twrStage2,
    liftoffMassT: m01,
    costM,
    budgetCapM,
    warnings,
    readyToLaunch,
  };
}

export function getSatelliteMissionProblems(
  mission: MissionDef,
  cfg: SatelliteConfig,
  metrics: SatelliteMetrics,
): MissionProblem[] {
  const xpBase = mission.requiredLevel >= 4 ? 40 : mission.requiredLevel >= 2 ? 35 : 25;
  const problems: MissionProblem[] = [];

  const ix = (s: SatelliteConfig['sequence'][number]) => cfg.sequence.indexOf(s);
  const fairOK = ix('fair') < ix('arr') && ix('fair') < ix('ant') && ix('fair') < ix('ops');

  // 1. Fairing staging order (all missions that start broken or get broken)
  if (mission.id === 'zero' || mission.id === 'sun' || mission.id === 'moon' || !fairOK) {
    problems.push({
      id: 'prob-fairing',
      title: 'Fix Jammed Launch Order',
      hint: 'Step 3 (Launch Order): Move "Fairing Jettison" to Step 1 before Solar Arrays & Sensors.',
      xpReward: xpBase,
      fixed: fairOK && (cfg.prop !== 'd' || ix('arr') < ix('burn')),
    });
  }

  // 2. Science instruments covering all mission goals
  const goalsCovered = mission.goals.every((g) => cfg.instruments.some((id) => {
    const inst = INSTRUMENTS.find((x) => x.id === id);
    return inst?.goals.includes(g);
  }));
  problems.push({
    id: 'prob-sensors',
    title: 'Install Missing Science Sensors',
    hint: `Step 1 (Sensors): Equip green REQ sensors for ${mission.goals.map((g) => GOAL_LABELS[g]).join(', ')}.`,
    xpReward: xpBase,
    fixed: cfg.instruments.length > 0 && goalsCovered,
  });

  // 3. Radio & Storage Bottleneck
  problems.push({
    id: 'prob-comms',
    title: 'Clear Radio & Data Bottleneck',
    hint: 'Step 2 (Core Craft): Upgrade Radio Dish & Data Buffer so Downlink >= Data/day and Storage <= SSD.',
    xpReward: xpBase,
    fixed:
      cfg.instruments.length > 0 &&
      metrics.downlinkGB >= metrics.dataProdGB &&
      metrics.storageNeedGB <= metrics.storeOpt.capacityGB,
  });

  // 4. Power & Balance (Earth Observer and up)
  if (mission.id !== 'zero') {
    const tolM = Math.max(0.16, metrics.comToleranceM || 0.16);
    const bayBalanced = metrics.comOffsetM <= tolM && Math.abs(metrics.leftMassKg - metrics.rightMassKg) <= 30;
    problems.push({
      id: 'prob-power',
      title: 'Fix Solar Power & Left/Right Balance',
      hint: 'Step 2 (Core Craft) + Step 1 (Sensors): Upgrade Solar Panels and click "Move to Left/Right" on equipped sensors until Left & Right kg match.',
      xpReward: xpBase,
      fixed: metrics.orbitAvgGenW >= metrics.totalLoadW && bayBalanced,
    });
  }

  // 5. Intermediate+ Deep-Space Hazards (Lv 2+: Sun, Moon, Mars)
  if (mission.requiredLevel >= 2) {
    problems.push({
      id: 'prob-shield-therm',
      title: 'Add Radiation Shield & Thermal Control',
      hint: 'Step 2 (Core Craft): Turn ON Radiation Shielding and match Thermal Control Level to orbit severity.',
      xpReward: xpBase + 5,
      fixed: cfg.radiationShield && metrics.thermalQuality >= 0.99,
    });
    problems.push({
      id: 'prob-prop-lv',
      title: 'Pass Rocket Capacity & Orbit Δv',
      hint:
        mission.id === 'mars'
          ? 'Step 2 (Hall-Effect Ion Thruster) + Step 4 (Heavy Launcher + Low-Energy Transfer)!'
          : mission.id === 'moon'
            ? 'Step 2 (Ion Thruster OR Bipropellant + Step 4 Low-Energy Assist) + Step 4 Heavy Launcher!'
            : 'Step 2 (Propulsion) + Step 4 (Heavy Launcher) so Δv Available >= Δv Needed.',
      xpReward: xpBase + 5,
      fixed: metrics.wetMassKg <= metrics.lvCapacityKg && metrics.dvAvailable >= metrics.dvNeeded,
    });
  }

  return problems;
}

export function createDamagedRocketConfig(destId: OrbitId, payloadMassT = 3.5): RocketConfig {
  const pMass = clamp(Math.round(payloadMassT * 2) / 2, 1, 10);
  if (destId === 'LEO' || destId === 'SSO') {
    return {
      destination: destId,
      windowIndex: 6, // Fault: Day 7 loses +480 m/s!
      stage1Engine: 'kestrel',
      stage1EnginesCount: 2, // Slightly low TWR if tanks increased
      stage1Tanks: 5,
      stage2Engine: 'kestrel', // Fault: low-Isp sea-level engine in Stage 2
      stage2Tanks: 2, // Fault: too little upper-stage fuel
      stage3Engine: 'whisper',
      stage3Tanks: 0,
      payloadMassT: pMass,
      fairingType: 'standard',
    };
  }
  if (destId === 'GEO') {
    return {
      destination: 'GEO',
      windowIndex: 3, // Fault: Day 4 Radio Blackout!
      stage1Engine: 'kestrel',
      stage1EnginesCount: 2,
      stage1Tanks: 6,
      stage2Engine: 'kestrel', // Fault: needs Vacuum engine
      stage2Tanks: 3,
      stage3Engine: 'whisper',
      stage3Tanks: 0, // Fault: missing Stage 3 kick motor
      payloadMassT: pMass,
      fairingType: 'standard',
    };
  }
  // LUNAR or MARS (starts with clear fixable faults)
  return {
    destination: destId,
    windowIndex: 5, // Fault: Day 6 +310 m/s penalty + Radio Blackout!
    stage1Engine: 'kestrel',
    stage1EnginesCount: 2,
    stage1Tanks: 6,
    stage2Engine: 'kestrel', // Fault: heavy low-Isp Stage 2
    stage2Tanks: 3,
    stage3Engine: 'whisper',
    stage3Tanks: 0, // Fault: needs Stage 3 kick stage
    payloadMassT: destId === 'LUNAR' ? Math.min(pMass, 3.0) : pMass,
    fairingType: 'standard', // Fault: heavy fairing
  };
}

export function getRocketPrelaunchProblems(
  cfg: RocketConfig,
  metrics: RocketMetrics,
): MissionProblem[] {
  const xpBase = metrics.dest.requiredLevel >= 4 ? 40 : metrics.dest.requiredLevel >= 2 ? 35 : 25;
  const needsThreeStage =
    metrics.dest.id === 'LUNAR' || metrics.dest.id === 'MARS' || metrics.dest.id === 'GEO';
  const needsComposite = metrics.dest.id === 'LUNAR' || metrics.dest.id === 'MARS';
  const problems: MissionProblem[] = [
    {
      id: 'rkt-window',
      title: 'Fix Bad Launch Window',
      hint: 'Pick Day 3 (green bar) so alignment wastes 0 m/s and avoids solar radio gaps.',
      xpReward: xpBase,
      fixed: metrics.window.dvPenalty <= 160 && !metrics.window.radioGap,
    },
    {
      id: 'rkt-twr',
      title: 'Ensure Strong Liftoff Thrust (TWR >= 1.25)',
      hint: 'Add Stage 1 engines or switch to Anvil Heavy Booster so the rocket climbs fast.',
      xpReward: xpBase,
      fixed: metrics.twrStage1 >= 1.25,
    },
    {
      id: 'rkt-dv',
      title: `Reach Target Speed Power (${metrics.dest.requiredDv.toLocaleString()} m/s)`,
      hint: needsThreeStage
        ? 'Use Whisper/Zephyr on Stage 2, add Stage 3 tanks, and equip Composite Fairing!'
        : 'Use Whisper-LH2 on Stage 2 and add fuel tanks until Δv covers the target.',
      xpReward: xpBase + 5,
      fixed: metrics.dvTotal >= metrics.dvRequired,
    },
  ];

  if (needsThreeStage) {
    problems.push({
      id: 'rkt-upper',
      title: 'Upgrade Vacuum Upper Stage & Fairing',
      hint: 'Equip Whisper-LH2 or Zephyr-NX on Stage 2, add Stage 3 tanks (and Composite Fairing for Moon/Mars).',
      xpReward: xpBase,
      fixed:
        (cfg.stage2Engine === 'whisper' || cfg.stage2Engine === 'zephyr') &&
        cfg.stage3Tanks >= 1 &&
        (!needsComposite || cfg.fairingType === 'composite'),
    });
  }

  return problems;
}

export function encodeDesignShareCode(design: Pick<SavedMissionDesign, 'label' | 'missionId' | 'authorTeam' | 'config'>): string {
  try {
    const payload = JSON.stringify({
      v: 1,
      l: design.label,
      m: design.missionId,
      a: design.authorTeam,
      c: design.config,
    });
    const bytes = new TextEncoder().encode(payload);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return `MA1-${btoa(bin)}`;
  } catch {
    return '';
  }
}

export function decodeDesignShareCode(
  rawCode: string,
): { label: string; missionId: string; authorTeam: string; config: SatelliteConfig } | null {
  try {
    const cleaned = rawCode.trim();
    const b64 = cleaned.startsWith('MA1-') ? cleaned.slice(4) : cleaned;
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes));
    if (!json || !json.c || !Array.isArray(json.c.instruments)) return null;
    return {
      label: typeof json.l === 'string' ? json.l : 'Shared Design',
      missionId: typeof json.m === 'string' ? json.m : 'earth',
      authorTeam: typeof json.a === 'string' ? json.a : 'Guest Team',
      config: {
        computer: 'a',
        adcs: 'a',
        lifetimeMonths: 24,
        ...json.c,
      },
    };
  } catch {
    return null;
  }
}

export function getNovaAdvice(metrics: SatelliteMetrics): string {
  if (metrics.status === 'NO-GO') {
    const first = metrics.warnings.find((w) => w.severity === 'NO-GO');
    return first
      ? `HOLD: ${first.description} Recommendation: ${first.correction}`
      : 'Resolve mandatory engineering blockers before launch.';
  }
  if (metrics.status === 'GO WITH WARNINGS') {
    const first = metrics.warnings[0];
    return `CAUTION: ${first.description} Tip: ${first.correction}`;
  }
  return `NOMINAL: All budgets clear! ${metrics.orbit.name} gives ${Math.round(metrics.orbit.sunlightFraction * 100)}% sunlight and ${round1(metrics.downlinkGB)} GB/day downlink capacity.`;
}
