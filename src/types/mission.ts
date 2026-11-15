export type ScienceGoalKey =
  | 'imaging'
  | 'atmo'
  | 'climate'
  | 'solar'
  | 'particles'
  | 'magnet'
  | 'ice'
  | 'maps'
  | 'thermal'
  | 'relay';

export type OrbitId = 'LEO' | 'SSO' | 'GEO' | 'LUNAR' | 'L1' | 'MARS';
export type TransferId = 'a' | 'b';
export type LaunchVehicleId = 'a' | 'b' | 'c';
export type OperationsPolicy = 'balanced' | 'protect' | 'science';
export type StagingStep = 'fair' | 'arr' | 'ant' | 'ops' | 'burn';
export type DifficultyLevel = 'cadet' | 'engineer' | 'director';
export type PlayMode = 'solo' | 'coop' | 'competitive' | 'sandbox';
export type TeamRoleId = 'commander' | 'engineer' | 'scientist' | 'comms';
export type ObjectiveFocus = 'balanced' | 'max-science' | 'low-cost' | 'rapid-response';

export interface MissionDef {
  id: string;
  name: string;
  target: string;
  budget: number;
  durationDays: number;
  difficulty: 'Tutorial' | 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  requiredLevel: number;
  hazardNote: string;
  allowedOrbits: OrbitId[];
  goals: ScienceGoalKey[];
  briefing: string;
  realAnalog: string;
  focusMode: 'satellite' | 'rocket';
  rewardCredits: number;
  rewardXp: number;
  imagePath: string;
}

export interface MissionProblem {
  id: string;
  title: string;
  hint: string;
  xpReward: number;
  fixed: boolean;
}

export interface InstrumentDef {
  id: string;
  name: string;
  mass: number;
  power: number;
  cost: number;
  dataRate: number; // GB/day
  scienceScore: number; // 1..10
  goals: ScienceGoalKey[];
  sensorBand: string;
  earthTargetType: string;
  education: string;
}

export interface PowerOption {
  id: 'a' | 'b' | 'c';
  name: string;
  genW: number;
  battWh: number;
  mass: number;
  cost: number;
}

export interface CommsOption {
  id: 'a' | 'b' | 'c' | 'd';
  name: string;
  rateGB: number;
  power: number;
  mass: number;
  cost: number;
}

export interface PropOption {
  id: 'a' | 'b' | 'c' | 'd';
  name: string;
  isp: number;
  thrustN: number;
  propellantKg: number;
  mass: number;
  cost: number;
  power: number;
}

export interface ThermOption {
  id: 'a' | 'b' | 'c';
  name: string;
  level: 1 | 2 | 3;
  mass: number;
  cost: number;
  power: number;
}

export interface StoreOption {
  id: 'a' | 'b' | 'c';
  name: string;
  capacityGB: number;
  mass: number;
  cost: number;
  power: number;
}

export interface ComputerOption {
  id: 'a' | 'b' | 'c';
  name: string;
  compressionRatio: number; // 1.0 = raw, 0.85 = 15% compressed, 0.72 = 28% compressed
  resilienceBonus: number; // 0..1
  mass: number;
  cost: number;
  power: number;
  note: string;
}

export interface AdcsOption {
  id: 'a' | 'b' | 'c';
  name: string;
  pointingBonusPct: number;
  comToleranceM: number;
  mass: number;
  cost: number;
  power: number;
  note: string;
}

export interface RandomConstraintDef {
  id: string;
  title: string;
  detail: string;
  dvDeltaPct: number;
  powerDeltaPct: number;
  downlinkDeltaPct: number;
  budgetDeltaPct: number;
}

export interface OrbitDef {
  id: OrbitId;
  name: string;
  altitude: string;
  dvBase: number;
  speedKms: number | null;
  payloadFactor: number;
  sunlightFraction: number;
  contactFraction: number;
  thermalSeverity: 1 | 2 | 3;
  eclipseFraction: number;
  education: string;
}

export interface LaunchVehicleDef {
  id: LaunchVehicleId;
  name: string;
  capLeoKg: number;
  costM: number;
  reliability: number;
}

export interface RocketEngineDef {
  id: 'kestrel' | 'anvil' | 'whisper' | 'zephyr';
  name: string;
  description: string;
  isp: number;
  atmFactor: number;
  thrustKN: number;
  massT: number;
  costM: number;
  color: string;
}

export interface RocketConfig {
  destination: OrbitId;
  windowIndex: number;
  stage1Engine: RocketEngineDef['id'];
  stage1EnginesCount: number;
  stage1Tanks: number;
  stage2Engine: RocketEngineDef['id'];
  stage2Tanks: number;
  stage3Engine: RocketEngineDef['id'];
  stage3Tanks: number;
  payloadMassT: number;
  fairingType: 'standard' | 'composite';
}

export interface SatelliteConfig {
  power: 'a' | 'b' | 'c';
  comms: 'a' | 'b' | 'c' | 'd';
  prop: 'a' | 'b' | 'c' | 'd';
  therm: 'a' | 'b' | 'c';
  store: 'a' | 'b' | 'c';
  computer: 'a' | 'b' | 'c';
  adcs: 'a' | 'b' | 'c';
  lifetimeMonths: number;
  objectiveFocus?: ObjectiveFocus;
  instruments: string[];
  lv: LaunchVehicleId;
  orbit: OrbitId;
  transfer: TransferId;
  fuelLoadPct: number;
  reservePct: number;
  throttlePct: number;
  sequence: StagingStep[];
  policy: OperationsPolicy;
  radiationShield: boolean;
  sensorBays?: Record<string, 'left' | 'right'>;
}

export interface ValidationItem {
  code: string;
  severity: 'NO-GO' | 'WARNING';
  description: string;
  correction: string;
}

export interface SatelliteMetrics {
  mission: MissionDef;
  orbit: OrbitDef;
  lv: LaunchVehicleDef;
  instruments: InstrumentDef[];
  powerOpt: PowerOption;
  commsOpt: CommsOption;
  propOpt: PropOption;
  thermOpt: ThermOption;
  storeOpt: StoreOption;
  computerOpt: ComputerOption;
  adcsOpt: AdcsOption;
  structuralMassKg: number;
  structuralLimitKg: number;
  dryMassKg: number;
  propMassKg: number;
  reserveMassKg: number;
  usablePropKg: number;
  wetMassKg: number;
  costM: number;
  effectiveBudgetM: number;
  busPowerW: number;
  instPowerW: number;
  totalLoadW: number;
  solarGenW: number;
  orbitAvgGenW: number;
  battCapWh: number;
  eclipseHours: number;
  eclipseEnergyWh: number;
  batteryReservePct: number;
  thermalQuality: number;
  rawDataProdGB: number;
  dataProdGB: number;
  downlinkGB: number;
  storageNeedGB: number;
  lvCapacityKg: number;
  dvNeeded: number;
  dvAvailable: number;
  burnTimeSec: number;
  comOffsetM: number;
  comToleranceM: number;
  comBlueprintX: number;
  comBlueprintY: number;
  leftMassKg: number;
  rightMassKg: number;
  comX: number;
  transferDays: number;
  lifetimeMonths: number;
  lifetimeDvExtra: number;
  pointingBonusPct: number;
  criticalResources: string[];
  poweredInstruments: Array<{ inst: InstrumentDef; online: boolean; quality: number }>;
  avgSensorDurabilityPct: number;
  warnings: ValidationItem[];
  status: 'GO' | 'GO WITH WARNINGS' | 'NO-GO';
}

export interface EarthHotspot {
  id: string;
  name: string;
  category:
    | 'Wildfire'
    | 'Cyclone'
    | 'Deforestation'
    | 'Cryosphere'
    | 'Ocean Bloom'
    | 'Urban Heat'
    | 'Thermal Anomaly'
    | 'Biosignatures'
    | 'Volcanology'
    | 'Tectonics'
    | 'Water Ice';
  lat: number;
  lon: number;
  requiredGoals: ScienceGoalKey[];
  sciencePoints: number;
  dataSizeGB: number;
  fact: string;
  isLiveNasa?: boolean;
  eventDate?: string;
}

export interface GroundStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  bandBoost: number;
}

export interface TechUpgradeDef {
  id: 'budget' | 'solar' | 'composite' | 'comms' | 'isp';
  name: string;
  description: string;
  whyUseful: string;
  appliesTo: string;
  imagePath: string;
  maxLevel: number;
  baseCost: number;
  effectPerLevel: string;
  bonusPerLevelPct: number;
  bonusSign: '+' | '-';
  bonusUnitLabel: string;
}

export interface MissionHistoryEntry {
  id: string;
  missionId: string;
  missionName: string;
  mode: 'satellite' | 'rocket';
  outcome: 'success' | 'partial' | 'fail';
  score: number;
  stars: number;
  sciencePct: number;
  costM: number;
  timestamp: string;
}

export interface TeamMember {
  id: string;
  name: string;
  roles: TeamRoleId[];
}

export interface SavedMissionDesign {
  id: string;
  label: string;
  missionId: string;
  authorTeam: string;
  difficulty: DifficultyLevel;
  config: SatelliteConfig;
  score?: number;
  costM: number;
  wetMassKg: number;
  dataProdGB: number;
  downlinkGB: number;
  createdAt: string;
}

export interface LeaderboardEntry {
  id: string;
  playerOrTeam: string;
  playMode: PlayMode;
  difficulty: DifficultyLevel;
  missionId: string;
  missionName: string;
  score: number;
  sciencePts: number;
  costM: number;
  efficiencyScore: number;
  stars: number;
  timestamp: string;
}

export interface CompetitiveTeamRun {
  teamIndex: number;
  teamName: string;
  config: SatelliteConfig;
  score: number | null;
  sciencePts: number;
  costM: number;
  wetMassKg: number;
  status: string;
  outcome?: 'success' | 'partial' | 'fail';
}

export interface StoryBeat {
  speaker: string;
  role: string;
  accent: 'cyan' | 'amber' | 'emerald' | 'violet';
  line: string;
}

export interface StoryChapterDef {
  id: string;
  chapterNum: number;
  title: string;
  actLabel: string;
  mode: 'satellite' | 'rocket';
  missionId?: string;
  rocketDest?: OrbitId;
  synopsis: string;
  introBeats: StoryBeat[];
  outroBeats: StoryBeat[];
  bonusCredits: number;
}

export interface CampaignSave {
  credits: number;
  xp: number;
  streak: number;
  difficulty: DifficultyLevel;
  upgrades: Record<TechUpgradeDef['id'], number>;
  sensorDurability: Record<string, number>;
  missionStars: Record<string, number>;
  history: MissionHistoryEntry[];
  savedDesigns: SavedMissionDesign[];
  leaderboard: LeaderboardEntry[];
  tutorialDone: boolean;
  storyStep: number;
  seenStoryIntros: string[];
  prologueSeen?: boolean;
  explorerMode: boolean;
}

export interface MultiplayerPlayer {
  clientId: string;
  name: string;
  roles: TeamRoleId[];
  teamIndex: number;
  isHost: boolean;
  online: boolean;
  lastActiveAt: number;
}

export interface RoomChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  kind?: 'chat' | 'system';
}

export interface MultiplayerRoomState {
  code: string;
  hostId: string;
  playMode: 'coop' | 'competitive';
  difficulty: DifficultyLevel;
  missionId: string;
  launched: boolean;
  phase: 'briefing' | 'design' | 'resources' | 'operations' | 'report';
  designStep: 'sensors' | 'parts' | 'order' | 'orbit';
  sharedConfig: SatelliteConfig;
  negotiationPicks: Record<string, string>;
  coordinationScore: number;
  players: MultiplayerPlayer[];
  competitiveTeams: CompetitiveTeamRun[];
  chat: RoomChatMessage[];
  lastUpdatedBy: string | null;
  revision: number;
}

