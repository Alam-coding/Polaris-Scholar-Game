import {
  AdcsOption,
  CommsOption,
  ComputerOption,
  DifficultyLevel,
  EarthHotspot,
  GroundStation,
  InstrumentDef,
  LaunchVehicleDef,
  MissionDef,
  ObjectiveFocus,
  OrbitDef,
  OrbitId,
  PowerOption,
  PropOption,
  RandomConstraintDef,
  RocketEngineDef,
  ScienceGoalKey,
  StagingStep,
  StoreOption,
  TeamRoleId,
  TechUpgradeDef,
  ThermOption,
} from '../types/mission';
import upgradeBudgetImg from '../assets/images/upgrade_nasa_grant_1794726784899.jpg';
import upgradeSolarImg from '../assets/images/upgrade_solar_arrays_1794726785369.jpg';
import upgradeCarbonImg from '../assets/images/upgrade_carbon_bus_1794726784189.jpg';
import upgradeCommsImg from '../assets/images/upgrade_laser_comms_1794726784572.jpg';
import upgradeNozzleImg from '../assets/images/upgrade_cryo_nozzle_1794726785274.jpg';
import missionZeroImg from '../assets/images/mission_zero_leo_1794733487293.jpg';
import missionEarthImg from '../assets/images/mission_earth_observer_1794733487663.jpg';
import missionSunImg from '../assets/images/mission_solar_sentinel_1794733487477.jpg';
import missionMoonImg from '../assets/images/mission_lunar_prospector_1794733488573.jpg';
import missionMarsImg from '../assets/images/mission_mars_odyssey_1794733488613.jpg';

export const GOAL_LABELS: Record<ScienceGoalKey, string> = {
  imaging: 'Surface Imaging',
  atmo: 'Atmospheric Chemistry',
  climate: 'Climate & Thermal Balance',
  solar: 'Solar Corona & CME Watch',
  particles: 'Energetic Particle Flux',
  magnet: 'Magnetosphere Mapping',
  ice: 'Water-Ice Detection',
  maps: 'Topographic Mapping',
  thermal: 'Thermal Anomaly Sensing',
  relay: 'Deep-Space Rover Relay',
};

export const MISSIONS: MissionDef[] = [
  {
    id: 'zero',
    name: 'Mission Zero: First Light',
    target: 'Low Earth Orbit (500 km)',
    budget: 240,
    durationDays: 120,
    difficulty: 'Tutorial',
    requiredLevel: 1,
    hazardNote: '3 starter faults · Gentle Earth orbit',
    allowedOrbits: ['LEO', 'SSO'],
    goals: ['imaging'],
    briefing:
      'Fix the jammed staging order, install your camera sensor, and upgrade the slow radio to capture Earth’s first multispectral scan.',
    realAnalog: 'Landsat 1 (ERTS-1), humanity’s first dedicated Earth-observing satellite.',
    focusMode: 'satellite',
    rewardCredits: 60,
    rewardXp: 55,
    imagePath: missionZeroImg,
  },
  {
    id: 'earth',
    name: 'Earth Atmosphere Observer',
    target: 'Earth Orbit (LEO, SSO, or GEO)',
    budget: 380,
    durationDays: 365,
    difficulty: 'Beginner',
    requiredLevel: 1,
    hazardNote: '4 faults · Imbalanced mass + heavy data rate',
    allowedOrbits: ['LEO', 'SSO', 'GEO'],
    goals: ['atmo', 'imaging', 'climate'],
    briefing:
      'Repair the power shortage, balance uneven instruments, and clear the downlink bottleneck to monitor global wildfires and cyclones.',
    realAnalog: 'NASA Aqua & Terra Earth Observing System satellites.',
    focusMode: 'satellite',
    rewardCredits: 100,
    rewardXp: 75,
    imagePath: missionEarthImg,
  },
  {
    id: 'sun',
    name: 'Solar Storm Sentinel',
    target: 'Sun–Earth L1 Lagrange Point',
    budget: 420,
    durationDays: 540,
    difficulty: 'Intermediate',
    requiredLevel: 2,
    hazardNote: '5 faults · L1 solar radiation + 0.22x mass cap',
    allowedOrbits: ['L1'],
    goals: ['solar', 'particles', 'magnet'],
    briefing:
      'Fix unshielded radiation exposure, thermal overheating, and weak propulsion so your sentinel survives 1.5M km sunward at L1.',
    realAnalog: 'SOHO and DSCOVR space-weather observatories at Sun–Earth L1.',
    focusMode: 'satellite',
    rewardCredits: 130,
    rewardXp: 100,
    imagePath: missionSunImg,
  },
  {
    id: 'moon',
    name: 'Lunar Ice Prospector',
    target: 'Low Lunar Polar Orbit',
    budget: 480,
    durationDays: 365,
    difficulty: 'Advanced',
    requiredLevel: 3,
    hazardNote: '5 faults · Extreme -230°C thermal swings + 920 m/s Δv',
    allowedOrbits: ['LUNAR'],
    goals: ['maps', 'ice', 'thermal'],
    briefing:
      'Overcome extreme lunar crater freeze, tight rocket capacity, and radiation hazards to map water ice at the lunar south pole.',
    realAnalog: 'NASA Lunar Reconnaissance Orbiter (LRO) & Lunar Trailblazer.',
    focusMode: 'rocket',
    rewardCredits: 160,
    rewardXp: 125,
    imagePath: missionMoonImg,
  },
  {
    id: 'mars',
    name: 'Red Relay: Mars Odyssey',
    target: 'Areocentric Mars Orbit',
    budget: 540,
    durationDays: 680,
    difficulty: 'Expert',
    requiredLevel: 4,
    hazardNote: '5 hard faults · Weak Mars sunlight + strict 420 kg mass limit',
    allowedOrbits: ['MARS'],
    goals: ['maps', 'thermal', 'relay'],
    briefing:
      'Solve the ultimate weight, solar-power, and deep-space Δv puzzle—chemical rockets are too heavy for Mars, so Ion propulsion is key!',
    realAnalog: 'Mars Reconnaissance Orbiter (MRO), our high-rate telecom bridge to Mars rovers.',
    focusMode: 'rocket',
    rewardCredits: 220,
    rewardXp: 160,
    imagePath: missionMarsImg,
  },
];

export const INSTRUMENTS: InstrumentDef[] = [
  {
    id: 'img',
    name: 'Multispectral Imager',
    mass: 25,
    power: 35,
    cost: 30,
    dataRate: 40,
    scienceScore: 8,
    goals: ['imaging', 'maps'],
    sensorBand: 'Visible + Near-IR (450–880 nm)',
    earthTargetType: 'Deforestation, Crop Health & Urban Heat',
    education: 'Healthy vegetation strongly reflects Near-Infrared (NIR) light, allowing NDVI monitoring from orbit.',
  },
  {
    id: 'snd',
    name: 'Atmospheric Sounder',
    mass: 30,
    power: 45,
    cost: 40,
    dataRate: 15,
    scienceScore: 10,
    goals: ['atmo', 'climate'],
    sensorBand: 'Hyperspectral IR (3.7–15.4 µm)',
    earthTargetType: 'Cyclone Profiles & Greenhouse Gases',
    education: 'Measures vertical profiles of atmospheric temperature, water vapor, CO2, and methane across pressure layers.',
  },
  {
    id: 'lid',
    name: 'Aerosol & Canopy Lidar',
    mass: 40,
    power: 60,
    cost: 45,
    dataRate: 12,
    scienceScore: 9,
    goals: ['atmo', 'maps'],
    sensorBand: 'Active Laser (532 / 1064 nm)',
    earthTargetType: 'Wildfire Smoke Plumes & Forest Canopy Height',
    education: 'Fires laser pulses downward and times the backscatter to measure vertical cloud, dust, and forest structure.',
  },
  {
    id: 'rad',
    name: 'Thermal Radiometer',
    mass: 15,
    power: 20,
    cost: 20,
    dataRate: 4,
    scienceScore: 7,
    goals: ['climate', 'thermal'],
    sensorBand: 'Thermal Infrared (8–12 µm)',
    earthTargetType: 'Wildfires, Ocean Heat & Polar Melt',
    education: 'Detects blackbody thermal radiation day and night, spotting active wildfire fronts through dense smoke.',
  },
  {
    id: 'cor',
    name: 'Solar Coronagraph',
    mass: 35,
    power: 30,
    cost: 50,
    dataRate: 25,
    scienceScore: 10,
    goals: ['solar'],
    sensorBand: 'Occulted White-Light / EUV',
    earthTargetType: 'Coronal Mass Ejections',
    education: 'Uses an occulter disk to create an artificial solar eclipse, revealing faint plasma eruptions heading toward Earth.',
  },
  {
    id: 'par',
    name: 'Energetic Particle Detector',
    mass: 12,
    power: 10,
    cost: 18,
    dataRate: 2,
    scienceScore: 7,
    goals: ['particles'],
    sensorBand: 'Solar Protons & Heavy Ions',
    earthTargetType: 'Radiation Belt & Solar Wind',
    education: 'Counts high-energy protons and electrons streaming out of solar flares to safeguard astronauts and satellites.',
  },
  {
    id: 'mag',
    name: 'Fluxgate Magnetometer',
    mass: 5,
    power: 4,
    cost: 8,
    dataRate: 1,
    scienceScore: 6,
    goals: ['magnet'],
    sensorBand: '3-Axis Vector Magnetic Field',
    earthTargetType: 'Interplanetary & Planetary Magnetic Field',
    education: 'Mounted on an extendable boom away from spacecraft electronics to measure subtle magnetic field shifts.',
  },
  {
    id: 'neu',
    name: 'Neutron & Relay Spectrometer',
    mass: 15,
    power: 18,
    cost: 28,
    dataRate: 6,
    scienceScore: 9,
    goals: ['ice', 'relay'],
    sensorBand: 'Epithermal Neutrons + UHF Transceiver',
    earthTargetType: 'Subsurface Hydrogen & Surface Assets',
    education: 'Cosmic rays knock neutrons off planetary soil; hydrogen in water-ice slows them down, revealing buried ice.',
  },
];

export const POWER_OPTIONS: PowerOption[] = [
  { id: 'a', name: 'Small Solar + Battery', genW: 130, battWh: 800, mass: 20, cost: 8 },
  { id: 'b', name: 'Medium Arrays + Li-Ion', genW: 300, battWh: 2400, mass: 35, cost: 16 },
  { id: 'c', name: 'High-Area Arrays + Pack', genW: 620, battWh: 4800, mass: 60, cost: 28 },
];

export const COMMS_OPTIONS: CommsOption[] = [
  { id: 'a', name: 'UHF Transceiver', rateGB: 10, power: 8, mass: 3, cost: 5 },
  { id: 'b', name: 'S-Band Patch', rateGB: 45, power: 15, mass: 8, cost: 14 },
  { id: 'c', name: 'X-Band High-Gain Dish', rateGB: 185, power: 30, mass: 14, cost: 32 },
  { id: 'd', name: 'Ka-Band Deep Space Dish', rateGB: 420, power: 50, mass: 20, cost: 64 },
];

export const PROP_OPTIONS: PropOption[] = [
  { id: 'a', name: 'Cold Gas RCS', isp: 65, thrustN: 20, propellantKg: 10, mass: 10, cost: 4, power: 0 },
  { id: 'b', name: 'Hydrazine Monoprop', isp: 225, thrustN: 400, propellantKg: 48, mass: 40, cost: 10, power: 0 },
  { id: 'c', name: 'Hypergolic Bipropellant', isp: 325, thrustN: 4000, propellantKg: 115, mass: 70, cost: 18, power: 0 },
  { id: 'd', name: 'Hall-Effect Ion Thruster', isp: 3000, thrustN: 0.15, propellantKg: 24, mass: 55, cost: 40, power: 60 },
];

export const THERM_OPTIONS: ThermOption[] = [
  { id: 'a', name: 'Passive MLI Gold Foil', level: 1, mass: 5, cost: 3, power: 0 },
  { id: 'b', name: 'Heaters + Louver Radiators', level: 2, mass: 12, cost: 8, power: 12 },
  { id: 'c', name: 'Active Pumped Fluid Loop', level: 3, mass: 25, cost: 18, power: 30 },
];

export const STORE_OPTIONS: StoreOption[] = [
  { id: 'a', name: '16 GB Radiation-Hard SSD', capacityGB: 16, mass: 1, cost: 2, power: 2 },
  { id: 'b', name: '128 GB Solid-State Recorder', capacityGB: 128, mass: 3, cost: 10, power: 4 },
  { id: 'c', name: '512 GB Deep-Space Buffer', capacityGB: 512, mass: 6, cost: 28, power: 8 },
];

export const COMPUTER_OPTIONS: ComputerOption[] = [
  {
    id: 'a',
    name: 'Basic Flight Sequencer',
    compressionRatio: 1.0,
    resilienceBonus: 0,
    mass: 3,
    cost: 4,
    power: 6,
    note: 'Raw telemetry stream (0% compression). Light & cheap for simple missions.',
  },
  {
    id: 'b',
    name: 'Dual-Redundant Flight CPU',
    compressionRatio: 0.85,
    resilienceBonus: 0.5,
    mass: 6,
    cost: 12,
    power: 14,
    note: 'Compresses science data by 15% and prevents single-event bit-flips.',
  },
  {
    id: 'c',
    name: 'Autonomous Edge-AI Processor',
    compressionRatio: 0.72,
    resilienceBonus: 1.0,
    mass: 10,
    cost: 24,
    power: 24,
    note: 'Onboard cloud-filtering shrinks downlink data by 28% and boosts fault recovery.',
  },
];

export const ADCS_OPTIONS: AdcsOption[] = [
  {
    id: 'a',
    name: 'Spin + Magnetorquers',
    pointingBonusPct: 0,
    comToleranceM: 0.14,
    mass: 4,
    cost: 4,
    power: 5,
    note: 'Simple passive stabilization. Requires tight Left/Right mass balance.',
  },
  {
    id: 'b',
    name: '3-Axis Reaction Wheels',
    pointingBonusPct: 10,
    comToleranceM: 0.18,
    mass: 10,
    cost: 12,
    power: 14,
    note: 'Crisp target tracking (+10% scan yield) & absorbs moderate bay offset.',
  },
  {
    id: 'c',
    name: 'Precision CMG + Star Trackers',
    pointingBonusPct: 18,
    comToleranceM: 0.24,
    mass: 16,
    cost: 24,
    power: 22,
    note: 'Sub-arcsecond pointing (+18% scan precision) for high-res science.',
  },
];

export const LIFETIME_OPTIONS = [
  { months: 12, label: '1 Year (12 mo)', note: 'Minimal station-keeping fuel; quick demonstration flight.' },
  { months: 24, label: '2 Years (24 mo)', note: 'Standard operational window for multi-season Earth watch.' },
  { months: 36, label: '3 Years (36 mo)', note: 'Long-term climate trend tracking (+15% Δv station-keeping in LEO).' },
  { months: 60, label: '5 Years (60 mo)', note: 'Decadal science campaign (needs high Δv reserves; avoids low drag).' },
];

export const DIFFICULTY_PROFILES: Record<
  DifficultyLevel,
  {
    label: string;
    subtitle: string;
    budgetMult: number;
    dvMult: number;
    thermalPenalty: number;
    wearMult: number;
    showAdvancedDefault: boolean;
  }
> = {
  cadet: {
    label: 'Cadet (Guided)',
    subtitle: '+20% mission budget margin, softer thermal wear, simpler subsystem focus.',
    budgetMult: 1.2,
    dvMult: 0.92,
    thermalPenalty: 0.12,
    wearMult: 0.65,
    showAdvancedDefault: false,
  },
  engineer: {
    label: 'Engineer (Standard)',
    subtitle: 'Balanced realistic aerospace constraints across power, mass, budget & comms.',
    budgetMult: 1.0,
    dvMult: 1.0,
    thermalPenalty: 0.16,
    wearMult: 1.0,
    showAdvancedDefault: true,
  },
  director: {
    label: 'Director (Hardcore)',
    subtitle: 'Strict -8% budget cap, +8% Δv demand, faster debris/thermal wear & random events.',
    budgetMult: 0.92,
    dvMult: 1.08,
    thermalPenalty: 0.2,
    wearMult: 1.35,
    showAdvancedDefault: true,
  },
};

export const TEAM_ROLE_DEFS: Array<{
  id: TeamRoleId;
  title: string;
  shortTitle: string;
  ownsSteps: string;
  priority: string;
  description: string;
}> = [
  {
    id: 'commander',
    title: 'Mission Commander',
    shortTitle: 'Commander',
    ownsSteps: 'Step 1 Briefing · Step 4 Orbit & Rocket',
    priority: 'Mission Objective, Target Orbit & Launch Safety',
    description: 'Sets the mission priority, selects orbital regime & rocket capacity, and approves final Go/No-Go.',
  },
  {
    id: 'engineer',
    title: 'Spacecraft Engineer',
    shortTitle: 'Engineer',
    ownsSteps: 'Step 2 Power, Thermal, Propulsion & ADCS · Step 3 Order',
    priority: 'Power Balance, Thermal Survival & Attitude Stability',
    description: 'Sizes solar arrays, thermal loops, reaction wheels, propellant, and deployment sequence.',
  },
  {
    id: 'scientist',
    title: 'Science Director',
    shortTitle: 'Science',
    ownsSteps: 'Step 1 Sensors & Left/Right Bay Balance · Orbit Scanning',
    priority: 'Spectral Coverage & Scan Precision',
    description: 'Selects science instruments, balances left/right bays, and leads target scans in orbit.',
  },
  {
    id: 'comms',
    title: 'Comms & Resource Lead',
    shortTitle: 'Comms & Budget',
    ownsSteps: 'Step 2 Radio, Computer, SSD & Budget',
    priority: 'Budget Cap, Data Compression & Ground Downlink',
    description: 'Manages grant funds, onboard compression CPU, SSD buffer, and ground dish passes.',
  },
];

export const OBJECTIVE_FOCUSES: Array<{
  id: ObjectiveFocus;
  title: string;
  description: string;
  tradeoffHint: string;
}> = [
  {
    id: 'balanced',
    title: 'Balanced Mission Profile',
    description: 'Equal weight across scientific coverage, budget discipline, and reliability.',
    tradeoffHint: 'Great baseline across all 6 mission pillars.',
  },
  {
    id: 'max-science',
    title: 'Maximum Scientific Yield',
    description: 'Prioritize multi-band instruments, precision ADCS pointing, and multi-year lifetime.',
    tradeoffHint: 'Increases power, mass, and data rate — requires careful radio & computer pairing.',
  },
  {
    id: 'low-cost',
    title: 'Lean SmallSat Efficiency',
    description: 'Hit every goal using minimal mass and budget to earn high cost-efficiency bonus.',
    tradeoffHint: 'Frees grant margin for lighter rockets and faster approval.',
  },
  {
    id: 'rapid-response',
    title: 'Rapid Emergency Deployment',
    description: 'Direct transfer, fast downlink dishes, and resilient flight avionics for crisis passes.',
    tradeoffHint: 'Higher Δv demand in exchange for 5-day arrival & continuous telemetry.',
  },
];

export const MISSION_CRITICAL_RESOURCES: Record<string, string[]> = {
  zero: ['Communications Downlink', 'Deployment Order'],
  earth: ['Power Margin', 'Data & Downlink Bandwidth', 'Left/Right Balance'],
  sun: ['Mass Limit (0.22× L1 Cap)', 'Radiation Shielding', 'Thermal Control'],
  moon: ['Extreme Thermal (-230°C)', 'Δv Fuel Budget', 'Radiation Shielding'],
  mars: ['Strict 420 kg Mass Cap', 'Dim Mars Solar Power', 'Deep-Space Δv'],
};

export const MISSION_ALTERNATIVE_TIPS: Record<string, string[]> = {
  zero: [
    'Use S-Band + Edge-AI Computer compression OR upgrade straight to X-Band Dish with a Basic Computer.',
    'Works cleanly in either LEO (sharper scans) or SSO (94% sunlight, smaller battery needed).',
  ],
  earth: [
    'Low-cost path: LEO + Medium Rocket + X-Band Dish + Dual-Redundant CPU.',
    'Continuous-watch path: GEO + Heavy Rocket + Ka-Band Dish + Ion Propulsion.',
  ],
  sun: [
    'High-efficiency Ion Thruster saves rocket mass vs heavy Bipropellant chemical tanks.',
    'Low-Energy Gravity Assist trims Δv requirement by 18% if chemical propulsion is preferred.',
  ],
  moon: [
    'Bipropellant + Low-Energy Transfer reaches lunar orbit cleanly, OR Ion Thruster arrives faster.',
    'Edge-AI Computer reduces data backlog so X-Band works if you want to save budget vs Ka-Band.',
  ],
  mars: [
    'Hall-Effect Ion Thruster keeps wet mass under 420 kg; pair with High-Area Solar + 24–36 mo life.',
    'Using Edge-AI compression lets X-Band handle Mars data if budget is tight.',
  ],
};

export const RANDOM_MISSION_CONSTRAINTS: RandomConstraintDef[] = [
  {
    id: 'rc-wind',
    title: 'Upper-Atmosphere Wind Shear',
    detail: 'Launch corridor requires +10% extra Δv orbital insertion margin.',
    dvDeltaPct: 10,
    powerDeltaPct: 0,
    downlinkDeltaPct: 0,
    budgetDeltaPct: 0,
  },
  {
    id: 'rc-dsn',
    title: 'Goldstone Dish Maintenance Window',
    detail: 'Ground station pass time shrinks temporarily (-15% downlink capacity).',
    dvDeltaPct: 0,
    powerDeltaPct: 0,
    downlinkDeltaPct: -15,
    budgetDeltaPct: 0,
  },
  {
    id: 'rc-solar',
    title: 'Solar Cell Dust & Flare Attenuation',
    detail: 'Solar array output dips -12% due to heightened charged-particle interference.',
    dvDeltaPct: 0,
    powerDeltaPct: -12,
    downlinkDeltaPct: 0,
    budgetDeltaPct: 0,
  },
  {
    id: 'rc-audit',
    title: 'Program Congressional Cost Cap',
    detail: 'Finance board trims mission contingency budget by -10%.',
    dvDeltaPct: 0,
    powerDeltaPct: 0,
    downlinkDeltaPct: 0,
    budgetDeltaPct: -10,
  },
];

export const ORBITS: Record<OrbitId, OrbitDef> = {
  LEO: {
    id: 'LEO',
    name: 'Low Earth Orbit',
    altitude: '~500 km · 95 min period',
    dvBase: 260,
    speedKms: 7.61,
    payloadFactor: 1.0,
    sunlightFraction: 0.65,
    contactFraction: 0.32,
    thermalSeverity: 1,
    eclipseFraction: 0.35,
    education: 'Fast orbital velocity (~7.6 km/s) gives sharp surface resolution, but 35% of each orbit is spent in Earth’s shadow.',
  },
  SSO: {
    id: 'SSO',
    name: 'Sun-Synchronous Polar',
    altitude: '~700 km · 98° inclination',
    dvBase: 410,
    speedKms: 7.5,
    payloadFactor: 0.85,
    sunlightFraction: 0.94,
    contactFraction: 0.38,
    thermalSeverity: 1,
    eclipseFraction: 0.06,
    education: 'Passes over every latitude at the same local solar time, keeping shadows consistent for comparing multi-year Earth imagery.',
  },
  GEO: {
    id: 'GEO',
    name: 'Geostationary Orbit',
    altitude: '35,786 km · Equatorial',
    dvBase: 1480,
    speedKms: 3.07,
    payloadFactor: 0.28,
    sunlightFraction: 0.92,
    contactFraction: 1.0,
    thermalSeverity: 2,
    eclipseFraction: 0.08,
    education: 'Matches Earth’s 24-hour rotation so the satellite hovers over one hemisphere continuously—ideal for weather tracking.',
  },
  LUNAR: {
    id: 'LUNAR',
    name: 'Low Lunar Polar Orbit',
    altitude: '~100 km above Moon',
    dvBase: 920,
    speedKms: 1.63,
    payloadFactor: 0.3,
    sunlightFraction: 0.85,
    contactFraction: 0.45,
    thermalSeverity: 3,
    eclipseFraction: 0.15,
    education: 'Extreme temperature swings between sunlit lunar highlands (+120°C) and shadowed polar craters (-230°C) demand active thermal control.',
  },
  L1: {
    id: 'L1',
    name: 'Sun–Earth L1 Halo',
    altitude: '~1.5 million km sunward',
    dvBase: 720,
    speedKms: null,
    payloadFactor: 0.22,
    sunlightFraction: 1.0,
    contactFraction: 0.36,
    thermalSeverity: 2,
    eclipseFraction: 0.0,
    education: 'Gravitational balance point with 100% continuous sunlight and an uninterrupted view of solar storms heading toward Earth.',
  },
  MARS: {
    id: 'MARS',
    name: 'Mars Science Orbit',
    altitude: '~400 km above Mars',
    dvBase: 1650,
    speedKms: 3.36,
    payloadFactor: 0.2,
    sunlightFraction: 0.62,
    contactFraction: 0.26,
    thermalSeverity: 2,
    eclipseFraction: 0.32,
    education: 'Sunlight at Mars is ~43% of Earth’s solar irradiance, and high light-time delay makes autonomous buffering critical.',
  },
};

export const LAUNCH_VEHICLES: LaunchVehicleDef[] = [
  { id: 'a', name: 'Light Launcher (Electron-class)', capLeoKg: 320, costM: 15, reliability: 0.91 },
  { id: 'b', name: 'Medium Launcher (Falcon-class)', capLeoKg: 820, costM: 40, reliability: 0.96 },
  { id: 'c', name: 'Heavy Launcher (Vulcan/Heavy)', capLeoKg: 2100, costM: 90, reliability: 0.98 },
];

export const ROCKET_ENGINES: Record<RocketEngineDef['id'], RocketEngineDef> = {
  kestrel: {
    id: 'kestrel',
    name: 'Kestrel-9 Kerolox',
    description: 'High-reliability RP-1/LOX workhorse. Strong sea-level thrust for first stages.',
    isp: 312,
    atmFactor: 0.9,
    thrustKN: 880,
    massT: 1.4,
    costM: 22,
    color: '#cbd5e1',
  },
  anvil: {
    id: 'anvil',
    name: 'Anvil-H Heavy Booster',
    description: 'Massive thrust for heavy payloads. Lower efficiency, huge liftoff authority.',
    isp: 292,
    atmFactor: 0.88,
    thrustKN: 2250,
    massT: 4.1,
    costM: 52,
    color: '#fb923c',
  },
  whisper: {
    id: 'whisper',
    name: 'Whisper-LH2 Vacuum',
    description: 'Cryogenic hydrolox upper-stage engine. Extraordinary 452s Isp in vacuum, weak at sea level.',
    isp: 452,
    atmFactor: 0.55,
    thrustKN: 195,
    massT: 0.7,
    costM: 48,
    color: '#38bdf8',
  },
  zephyr: {
    id: 'zephyr',
    name: 'Zephyr-NX Methalox',
    description: 'Clean-burning methane/LOX stage engine balancing high thrust and 365s vacuum Isp.',
    isp: 365,
    atmFactor: 0.86,
    thrustKN: 1200,
    massT: 1.9,
    costM: 36,
    color: '#a78bfa',
  },
};

export const ROCKET_DESTINATIONS: Array<{
  id: OrbitId;
  name: string;
  targetAltKm: number;
  requiredDv: number;
  orbitVelMs: number;
  distanceLabel: string;
  requiredLevel: number;
  difficultyLabel: string;
  fact: string;
}> = [
  {
    id: 'LUNAR',
    name: 'The Moon (Artemis Trajectory)',
    targetAltKm: 384400,
    requiredDv: 11200,
    orbitVelMs: 10900,
    distanceLabel: '384,400 km · Earth → Moon',
    requiredLevel: 1,
    difficultyLabel: 'Lv.1 Moon Landing',
    fact: 'Reaching the Moon takes ~3.1 km/s of extra speed beyond Low Earth Orbit—stage your rocket cleanly and ignite Stage 3 for Trans-Lunar Injection!',
  },
  {
    id: 'LEO',
    name: 'Low Earth Orbit (ISS Plane)',
    targetAltKm: 420,
    requiredDv: 9300,
    orbitVelMs: 7660,
    distanceLabel: '420 km altitude',
    requiredLevel: 1,
    difficultyLabel: 'Lv.1 Standard',
    fact: 'Reaching orbit isn’t mostly about height—it’s accelerating sideways to 7.66 km/s so you fall continuously around Earth!',
  },
  {
    id: 'SSO',
    name: 'Sun-Synchronous Polar Orbit',
    targetAltKm: 705,
    requiredDv: 9850,
    orbitVelMs: 7500,
    distanceLabel: '705 km polar',
    requiredLevel: 1,
    difficultyLabel: 'Lv.1 Polar',
    fact: 'Launching southward into a 98° retrograde polar orbit sacrifices Earth’s rotational boost, costing extra Δv.',
  },
  {
    id: 'GEO',
    name: 'Geostationary Transfer Orbit',
    targetAltKm: 35786,
    requiredDv: 11200,
    orbitVelMs: 10150,
    distanceLabel: '35,786 km apogee',
    requiredLevel: 2,
    difficultyLabel: 'Lv.2 High-Energy',
    fact: 'Weather satellites at GEO stay locked over one longitude 24/7, requiring a multi-stage high-energy burn.',
  },
  {
    id: 'MARS',
    name: 'Trans-Mars Injection (Mars)',
    targetAltKm: 225000000,
    requiredDv: 12200,
    orbitVelMs: 11500,
    distanceLabel: '55–225M km Hohmann',
    requiredLevel: 4,
    difficultyLabel: 'Lv.4 Expert',
    fact: 'A Hohmann transfer to Mars launches only during a 26-month planetary alignment window to minimize fuel.',
  },
];

export const LAUNCH_WINDOWS = [
  { day: 1, label: 'Day 1', dvPenalty: 380, radioGap: false, note: 'Early phase angle: +380 m/s' },
  { day: 2, label: 'Day 2', dvPenalty: 190, radioGap: false, note: 'Closing window: +190 m/s' },
  { day: 3, label: 'Day 3', dvPenalty: 0, radioGap: false, note: 'Optimal alignment: +0 m/s' },
  { day: 4, label: 'Day 4', dvPenalty: 60, radioGap: true, note: 'Solar interference gap' },
  { day: 5, label: 'Day 5', dvPenalty: 160, radioGap: false, note: 'Late phase angle: +160 m/s' },
  { day: 6, label: 'Day 6', dvPenalty: 310, radioGap: true, note: 'High inclination cost + gap' },
  { day: 7, label: 'Day 7', dvPenalty: 480, radioGap: false, note: 'Closing edge: +480 m/s' },
];

export const STAGING_LABELS: Record<StagingStep, string> = {
  fair: 'Fairing Jettison',
  arr: 'Solar Array Unfurl',
  ant: 'High-Gain Dish Deploy',
  ops: 'Sensor Aperture Open',
  burn: 'Orbit Insertion Burn',
};

export const EARTH_HOTSPOTS: EarthHotspot[] = [
  {
    id: 'hs-kalimantan',
    name: 'Borneo Peatland Wildfire',
    category: 'Wildfire',
    lat: -1.6,
    lon: 113.9,
    requiredGoals: ['thermal', 'atmo', 'imaging'],
    sciencePoints: 180,
    dataSizeGB: 14,
    fact: 'Thermal Infrared (3.7–11 µm) satellites pierce dense haze to pinpoint active peat fires and track carbon aerosols.',
  },
  {
    id: 'hs-typhoon',
    name: 'Western Pacific Super Typhoon',
    category: 'Cyclone',
    lat: 18.5,
    lon: 132.0,
    requiredGoals: ['atmo', 'climate', 'imaging'],
    sciencePoints: 200,
    dataSizeGB: 18,
    fact: 'Infrared sounders measure cloud-top temperatures down to -80°C to estimate storm intensity and eyewall pressure.',
  },
  {
    id: 'hs-amazon',
    name: 'Amazon Canopy Carbon Flux',
    category: 'Deforestation',
    lat: -5.2,
    lon: -61.4,
    requiredGoals: ['imaging', 'maps', 'atmo'],
    sciencePoints: 170,
    dataSizeGB: 20,
    fact: 'Spaceborne Lidar combined with Multispectral NIR quantifies forest biomass height and illegal logging edges.',
  },
  {
    id: 'hs-arctic',
    name: 'Greenland Ice Sheet Albedo',
    category: 'Cryosphere',
    lat: 72.0,
    lon: -42.0,
    requiredGoals: ['climate', 'thermal', 'imaging'],
    sciencePoints: 190,
    dataSizeGB: 12,
    fact: 'Polar Sun-Synchronous satellites pass high latitudes 14 times daily, tracking meltwater ponds lowering surface reflectivity.',
  },
  {
    id: 'hs-california',
    name: 'Sierra Nevada Heat & Smoke',
    category: 'Urban Heat',
    lat: 38.2,
    lon: -120.5,
    requiredGoals: ['thermal', 'atmo', 'imaging'],
    sciencePoints: 165,
    dataSizeGB: 15,
    fact: 'Aerosol Lidar tracks smoke plume altitude so aviation and air-quality forecasters know where particulates will settle.',
  },
  {
    id: 'hs-coral',
    name: 'Great Barrier Reef Thermal Stress',
    category: 'Ocean Bloom',
    lat: -18.3,
    lon: 147.7,
    requiredGoals: ['climate', 'imaging', 'thermal'],
    sciencePoints: 175,
    dataSizeGB: 16,
    fact: 'Sea-surface temperature radiometers alert marine biologists weeks before thermal coral bleaching peaks.',
  },
];

export const LUNAR_HOTSPOTS: EarthHotspot[] = [
  {
    id: 'ln-shackleton',
    name: 'Shackleton Crater Water-Ice',
    category: 'Cryosphere',
    lat: -84.0,
    lon: 129.0,
    requiredGoals: ['ice', 'thermal', 'maps'],
    sciencePoints: 210,
    dataSizeGB: 14,
    fact: 'Permanently shadowed craters near the Lunar South Pole trap ancient water ice at -230°C—vital rocket fuel and water for Artemis bases.',
  },
  {
    id: 'ln-tranq',
    name: 'Mare Tranquillitatis Lava Plain',
    category: 'Cryosphere',
    lat: 8.5,
    lon: 31.4,
    requiredGoals: ['maps', 'imaging'],
    sciencePoints: 175,
    dataSizeGB: 12,
    fact: 'Smooth titanium-rich basalt maria formed billions of years ago and hosted Apollo 11, humanity’s first lunar landing.',
  },
  {
    id: 'ln-tycho',
    name: 'Tycho Bright Ray Crater',
    category: 'Thermal Anomaly',
    lat: -43.3,
    lon: -11.2,
    requiredGoals: ['maps', 'thermal', 'imaging'],
    sciencePoints: 190,
    dataSizeGB: 16,
    fact: 'Fresh impact boulders around Tycho stay warmer during the lunar night than powdery regolith, glowing brightly in thermal infrared.',
  },
  {
    id: 'ln-aitken',
    name: 'South Pole–Aitken Basin',
    category: 'Cryosphere',
    lat: -53.0,
    lon: -169.0,
    requiredGoals: ['ice', 'maps', 'thermal'],
    sciencePoints: 205,
    dataSizeGB: 18,
    fact: 'The Moon’s largest and oldest impact basin exposes deep mantle minerals and shields far-side radio receivers from Earth noise.',
  },
];

export const MARS_HOTSPOTS: EarthHotspot[] = [
  {
    id: 'ms-jezero',
    name: 'Jezero Ancient River Delta',
    category: 'Biosignatures',
    lat: 18.4,
    lon: 77.5,
    requiredGoals: ['maps', 'thermal', 'relay'],
    sciencePoints: 220,
    dataSizeGB: 16,
    fact: 'Orbiters relay gigabytes of Perseverance rover core analyses from Jezero’s clay-rich lakebed delta back to Earth.',
  },
  {
    id: 'ms-olympus',
    name: 'Olympus Mons Shield Caldera',
    category: 'Volcanology',
    lat: 18.6,
    lon: -133.8,
    requiredGoals: ['maps', 'thermal'],
    sciencePoints: 195,
    dataSizeGB: 14,
    fact: 'At 21.9 km tall—nearly three times Mount Everest—Olympus Mons is the largest volcano in the solar system.',
  },
  {
    id: 'ms-valles',
    name: 'Valles Marineris Rift Canyon',
    category: 'Tectonics',
    lat: -13.9,
    lon: -59.2,
    requiredGoals: ['maps', 'imaging', 'thermal'],
    sciencePoints: 205,
    dataSizeGB: 18,
    fact: 'Stretching 4,000 km across Mars, Valles Marineris reveals layered ancient crust and seasonal dust-storm channels.',
  },
  {
    id: 'ms-korolev',
    name: 'Korolev Polar Ice Crater',
    category: 'Water Ice',
    lat: 72.8,
    lon: -164.5,
    requiredGoals: ['ice', 'thermal', 'maps'],
    sciencePoints: 215,
    dataSizeGB: 15,
    fact: 'An 82 km northern crater holds a permanent 1.8 km-thick dome of water ice preserved by a cold-trap microclimate.',
  },
];

export const GROUND_STATIONS: GroundStation[] = [
  { id: 'gs-svalbard', name: 'Svalbard Polar Station', lat: 78.2, lon: 15.4, bandBoost: 1.15 },
  { id: 'gs-goldstone', name: 'Goldstone DSN', lat: 35.4, lon: -116.8, bandBoost: 1.2 },
  { id: 'gs-biak', name: 'Biak Equatorial Dish', lat: -1.17, lon: 136.1, bandBoost: 1.05 },
  { id: 'gs-canberra', name: 'Canberra DSN', lat: -35.4, lon: 148.9, bandBoost: 1.2 },
];

export const TECH_UPGRADES: TechUpgradeDef[] = [
  {
    id: 'budget',
    name: 'NASA Grant Expansion',
    description: 'Unlocks larger program budgets for heavy engines, deep-space rockets, and extra science sensors.',
    whyUseful: 'Lets you combine Heavy Launchers, Ka-Band radios, and multi-sensor payloads without hitting red FIN-01 budget caps.',
    appliesTo: 'Rockets & Satellites',
    imagePath: upgradeBudgetImg,
    maxLevel: 4,
    baseCost: 50,
    effectPerLevel: '+10% Mission Budget Cap per level',
    bonusPerLevelPct: 10,
    bonusSign: '+',
    bonusUnitLabel: 'Mission Budget Cap',
  },
  {
    id: 'solar',
    name: 'Triple-Junction GaAs Solar Wings',
    description: 'High-efficiency sapphire-cell photovoltaic arrays for dim outer orbits and surface descent batteries.',
    whyUseful: 'Prevents satellite sensor brownouts around Mars/Earth and adds +8% extra retro-thruster fuel during Moon & Mars landings.',
    appliesTo: 'Satellites & Lander Descent',
    imagePath: upgradeSolarImg,
    maxLevel: 4,
    baseCost: 55,
    effectPerLevel: '+12% Solar Power & +8% Lander Fuel',
    bonusPerLevelPct: 12,
    bonusSign: '+',
    bonusUnitLabel: 'Solar Array Output',
  },
  {
    id: 'composite',
    name: 'Carbon-Lattice Structural Frame',
    description: 'Aerospace carbon-fiber honeycomb bus frame and ultralight tank walls that shave dead structural mass.',
    whyUseful: 'Cuts dead weight on satellite buses AND rocket propellant tanks, fitting tighter rocket caps and raising total speed power (Δv).',
    appliesTo: 'Rockets & Satellites',
    imagePath: upgradeCarbonImg,
    maxLevel: 4,
    baseCost: 60,
    effectPerLevel: '-7% Dry Bus & Rocket Tank Mass',
    bonusPerLevelPct: 7,
    bonusSign: '-',
    bonusUnitLabel: 'Structural Dry Mass',
  },
  {
    id: 'comms',
    name: 'Optical Laser & Ka-Band Terminal',
    description: 'Precision gimbaled optical waveguide & gold-mesh dish that speeds up ground station data beams.',
    whyUseful: 'Clears satellite SSD memory faster during short ground passes and boosts every Earth hazard scan by +12% science points.',
    appliesTo: 'Satellite Orbit Ops',
    imagePath: upgradeCommsImg,
    maxLevel: 4,
    baseCost: 55,
    effectPerLevel: '+15% Downlink Speed & +12% Science Pts',
    bonusPerLevelPct: 15,
    bonusSign: '+',
    bonusUnitLabel: 'Downlink Bandwidth',
  },
  {
    id: 'isp',
    name: 'Cryogenic Regenerative Nozzle Bell',
    description: 'Spiral-cooled Inconel nozzle bell that extracts higher exhaust velocity from the exact same fuel load.',
    whyUseful: 'Increases Specific Impulse (Isp) across Rocket Stages 1–3 and satellite thrusters so you reach Moon & Mars with fewer tanks.',
    appliesTo: 'Rockets & Satellites',
    imagePath: upgradeNozzleImg,
    maxLevel: 4,
    baseCost: 70,
    effectPerLevel: '+6% Engine Efficiency (Isp)',
    bonusPerLevelPct: 6,
    bonusSign: '+',
    bonusUnitLabel: 'Engine Exhaust Speed (Isp)',
  },
];

export const ACADEMY_TOPICS = [
  {
    id: 'dv',
    title: 'Delta-v & The Tsiolkovsky Rocket Equation',
    formula: 'Δv = Isp · g₀ · ln(m₀ / mf)',
    summary:
      'Delta-v (change in velocity) is the currency of spaceflight. Because fuel itself has mass that must be accelerated, doubling fuel gives less than double Δv. Staging drops empty tanks so the next engine accelerates a much lighter craft!',
    tip: 'Use Whisper (high Isp) on upper stages and Anvil/Kestrel (high thrust) on Stage 1 liftoff.',
  },
  {
    id: 'twr',
    title: 'Thrust-to-Weight Ratio (TWR)',
    formula: 'TWR = Thrust / (Mass · 9.81 m/s²)',
    summary:
      'To rise off a launchpad, a rocket’s TWR must exceed 1.0 (ideally 1.25–1.6 to minimize gravity losses). Once in orbit, weightlessness means even a tiny 0.15 N Hall-effect ion thruster can spiral a spacecraft to the Moon or Mars.',
    tip: 'If your rocket stalls on the pad, add Stage 1 engines or trim upper fuel tanks.',
  },
  {
    id: 'com',
    title: 'Center of Mass (CoM) vs Center of Thrust (CoT)',
    formula: 'Torque τ = Thrust × Offset',
    summary:
      'If heavy science instruments sit asymmetrically on one side of a satellite, the Center of Mass shifts off the engine’s thrust line. Firing the main engine then creates unwanted spin torque that wastes attitude-control fuel.',
    tip: 'Watch the CoM crosshair in the 2D Blueprint view and balance instruments symmetrically.',
  },
  {
    id: 'sensing',
    title: 'Earth Observation Spectral Bands',
    formula: 'VIS (0.4–0.7 µm) · NIR (0.8 µm) · TIR (10 µm)',
    summary:
      'Different Earth hazards glow in different wavelengths. Visible/Near-IR cameras map vegetation & floods; Thermal IR sees wildfires through smoke and ocean heat; Lidar pulses measure smoke plume height and forest biomass.',
    tip: 'Pair Thermal Radiometer + Sounder + Imager to maximize Earth-scan coverage.',
  },
  {
    id: 'orbits',
    title: 'Choosing the Right Orbit',
    formula: 'LEO (500 km) · SSO (700 km) · GEO (35,786 km)',
    summary:
      'LEO offers sharp imagery but spends 35% of each orbit in Earth’s shadow (requiring battery reserves). Sun-Synchronous Polar (SSO) stays nearly 94% sunlit and covers the entire globe. GEO hovers stationary above one hemisphere for continuous weather watch.',
    tip: 'Always match the orbit to your mission briefing targets and upgrade thermal control for GEO or Lunar orbits.',
  },
  {
    id: 'link',
    title: 'Data Storage & Ground Downlink Budget',
    formula: 'Data Delivered = min(Produced, Buffer, Downlink)',
    summary:
      'A high-resolution imager can easily generate 40+ GB/day, but a satellite only sees ground stations during brief passes (30–38% of the day in LEO). Without enough solid-state storage and X/Ka-band radio bandwidth, valuable science is overwritten!',
    tip: 'If your downlink meter turns amber or red, upgrade to X-Band/Ka-Band or increase storage.',
  },
];

export const NASA_OPEN_DATA_LINKS = [
  {
    name: 'NASA Open Data Portal',
    url: 'https://data.nasa.gov/',
    detail: 'Official repository of NASA Earth, planetary, and aeronautics datasets.',
  },
  {
    name: 'NASA Earthdata & FIRMS Active Fires',
    url: 'https://www.earthdata.nasa.gov/',
    detail: 'Near real-time MODIS/VIIRS thermal anomalies, atmospheric aerosols, and sea-surface temperatures.',
  },
  {
    name: 'NASA CCMC DONKI Space Weather',
    url: 'https://ccmc.gsfc.nasa.gov/DONKI/',
    detail: 'Live database of Coronal Mass Ejections (CMEs), solar flares, and geomagnetic storms at L1.',
  },
];
