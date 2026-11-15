import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Compass,
  Copy,
  Flame,
  GitCompare,
  HelpCircle,
  History,
  Link2,
  Lock,
  Music,
  Play,
  Radio,
  Rocket,
  RotateCcw,
  Satellite,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  Wrench,
} from 'lucide-react';
import { AcademyModal } from './components/AcademyModal';
import { CommanderBubble } from './components/CommanderBubble';
import { DesignCompareModal } from './components/DesignCompareModal';
import { MissionEndingModal } from './components/MissionEndingModal';
import { PrologueCutsceneModal } from './components/PrologueCutsceneModal';
import { RocketLaunchGame } from './components/RocketLaunchGame';
import { SatelliteDesignerMode } from './components/SatelliteDesignerMode';
import { StoryDialogueModal } from './components/StoryDialogueModal';
import { WelcomeTutorialModal } from './components/WelcomeTutorialModal';
import {
  DIFFICULTY_PROFILES,
  EARTH_HOTSPOTS,
  INSTRUMENTS,
  MISSIONS,
  ROCKET_DESTINATIONS,
  TEAM_ROLE_DEFS,
  TECH_UPGRADES,
} from './data/missionData';
import { STORY_CHAPTERS } from './data/storyData';
import { MusicTrackId, soundEngine } from './engine/audio';
import {
  buildRoomInviteUrl,
  fetchServerLeaderboard,
  getRoomCodeFromUrl,
  postServerLeaderboard,
  useMultiplayerRoom,
} from './engine/multiplayer';
import { fetchLiveNasaEvents } from './engine/nasaLive';
import {
  clamp,
  createDefaultSatelliteConfig,
  DEFAULT_CAMPAIGN_SAVE,
  DEFAULT_SENSOR_DURABILITY,
  getDurabilityScienceMultiplier,
  getMaintenanceCost,
  getPlayerLevelInfo,
  getSensorDurability,
  loadCampaignSave,
  saveCampaignSave,
} from './engine/physics';
import { EarthGlobeView } from './three/EarthGlobeView';
import {
  CampaignSave,
  CompetitiveTeamRun,
  DifficultyLevel,
  EarthHotspot,
  LeaderboardEntry,
  MissionDef,
  MissionHistoryEntry,
  OrbitId,
  PlayMode,
  SatelliteConfig,
  SavedMissionDesign,
  StoryChapterDef,
  TeamMember,
  TeamRoleId,
  TechUpgradeDef,
} from './types/mission';

type ScreenState = 'title' | 'hub' | 'rocket' | 'satellite';
type HubTab = 'play' | 'story' | 'lab';

const TRACK_LABELS: Array<{ id: MusicTrackId; label: string }> = [
  { id: 'orbital', label: 'Orbital Horizon' },
  { id: 'launch', label: 'Launch Tension' },
  { id: 'earth', label: 'Blue Marble' },
  { id: 'victory', label: 'Mission Triumph' },
];

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('title');
  const [hubTab, setHubTab] = useState<HubTab>('play');
  const [save, setSave] = useState<CampaignSave>(() => loadCampaignSave());
  const [selectedMission, setSelectedMission] = useState<MissionDef>(MISSIONS[1]);
  const [rocketDest, setRocketDest] = useState<OrbitId>('LUNAR');
  const [showAcademy, setShowAcademy] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [dismissedWelcome, setDismissedWelcome] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [activeChapter, setActiveChapter] = useState<StoryChapterDef | null>(null);
  const [storyModal, setStoryModal] = useState<{
    chapter: StoryChapterDef;
    variant: 'intro' | 'outro';
  } | null>(null);
  // Play Mode, Difficulty, Team Co-op & Competitive state
  const initialUrlRoom = getRoomCodeFromUrl();
  const [showCampaignFinale, setShowCampaignFinale] = useState(false);
  const [showPrologue, setShowPrologue] = useState<boolean>(() => !save.prologueSeen && !initialUrlRoom);
  const [mandatoryPrologue, setMandatoryPrologue] = useState<boolean>(() => !save.prologueSeen && !initialUrlRoom);
  const [prologueFollowUp, setPrologueFollowUp] = useState<'story' | 'hub' | null>(null);
  const [confirmResetLv1, setConfirmResetLv1] = useState(false);
  const [levelUpNotice, setLevelUpNotice] = useState<{ level: number; title: string } | null>(null);

  // Live NASA EONET Earth Events state
  const [liveHotspots, setLiveHotspots] = useState<EarthHotspot[]>(EARTH_HOTSPOTS);
  const [isLiveNasa, setIsLiveNasa] = useState(false);
  const [nasaFeedLabel, setNasaFeedLabel] = useState('Connecting NASA EONET...');

  const [playMode, setPlayMode] = useState<PlayMode>(() => (initialUrlRoom ? 'coop' : 'solo'));
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(() => save.difficulty || 'engineer');
  const [playerCallsign, setPlayerCallsign] = useState<string>(() => {
    try {
      return localStorage.getItem('ma_callsign') || 'Commander 1';
    } catch {
      return 'Commander 1';
    }
  });
  const [joinCodeInput, setJoinCodeInput] = useState<string>(initialUrlRoom);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const mp = useMultiplayerRoom();
  const handledRoomLaunchRevRef = useRef<number>(0);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([
    { id: 'tm-1', name: 'Player 1', roles: ['commander', 'engineer'] },
    { id: 'tm-2', name: 'Player 2', roles: ['scientist', 'comms'] },
  ]);
  const [competitiveTeamNames, setCompetitiveTeamNames] = useState<string[]>([
    'Team Apollo',
    'Team Artemis',
  ]);
  const [competitiveTeams, setCompetitiveTeams] = useState<CompetitiveTeamRun[]>([]);
  const [activeCompetitiveIdx, setActiveCompetitiveIdx] = useState(0);
  const [hubCompareModal, setHubCompareModal] = useState<'save' | 'compare' | 'leaderboard' | null>(
    null,
  );

  // Unified Rocket -> Satellite Payload Delivery link
  const [customRocketPayload, setCustomRocketPayload] = useState<{
    massT: number;
    name: string;
  } | null>(null);
  const [pendingSatConfig, setPendingSatConfig] = useState<SatelliteConfig | null>(null);
  const [startInOrbitSignal, setStartInOrbitSignal] = useState(0);

  // Audio controls state
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [track, setTrack] = useState<MusicTrackId>('orbital');
  const [volume, setVolume] = useState(0.45);

  const persistSave = useCallback((next: CampaignSave) => {
    setSave(next);
    saveCampaignSave(next);
  }, []);

  const refreshLiveNasa = useCallback(async () => {
    const res = await fetchLiveNasaEvents();
    setLiveHotspots(res.events);
    setIsLiveNasa(res.isLive);
    setNasaFeedLabel(res.sourceLabel);
  }, []);

  useEffect(() => {
    void refreshLiveNasa();
  }, [refreshLiveNasa]);

  // Sync shared server leaderboard on startup
  useEffect(() => {
    let active = true;
    void fetchServerLeaderboard().then((serverEntries) => {
      if (!active || serverEntries.length === 0) return;
      setSave((prev) => {
        const byId = new Map<string, LeaderboardEntry>();
        [...serverEntries, ...prev.leaderboard].forEach((e) => {
          if (!byId.has(e.id)) byId.set(e.id, e);
        });
        const merged = Array.from(byId.values())
          .sort((a, b) => b.score - a.score || b.efficiencyScore - a.efficiencyScore)
          .slice(0, 40);
        const next = { ...prev, leaderboard: merged };
        saveCampaignSave(next);
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  // Auto-open invite room in Hub if user arrived via ?room=CODE URL
  useEffect(() => {
    if (initialUrlRoom && screen === 'title') {
      setScreen('hub');
      setHubTab('play');
    }
  }, [initialUrlRoom, screen]);

  // Keep local playMode / difficulty / screen in sync when host launches a live multiplayer room
  useEffect(() => {
    if (!mp.room) return;
    setPlayMode(mp.room.playMode);
    setDifficulty(mp.room.difficulty);
    const targetMission = MISSIONS.find((m) => m.id === mp.room?.missionId) || MISSIONS[1];
    setSelectedMission(targetMission);

    if (mp.room.launched && handledRoomLaunchRevRef.current !== mp.room.revision && screen !== 'satellite') {
      handledRoomLaunchRevRef.current = mp.room.revision;
      setStartInOrbitSignal(0);
      setPendingSatConfig(
        mp.room.playMode === 'coop'
          ? (mp.room.sharedConfig as SatelliteConfig)
          : (mp.room.competitiveTeams.find(
              (t) =>
                t.teamIndex ===
                (mp.room?.players.find((p) => p.clientId === mp.clientId)?.teamIndex ?? 0),
            )?.config as SatelliteConfig | undefined) || null,
      );
      setActiveChapter(null);
      setScreen('satellite');
    }
  }, [mp.room, mp.clientId, screen]);

  const handleGrantCredits = useCallback((amount: number) => {
    setSave((prev) => {
      const next = { ...prev, credits: prev.credits + amount, xp: prev.xp + 20 };
      saveCampaignSave(next);
      return next;
    });
  }, []);

  const handleGrantXp = useCallback((amount: number) => {
    if (amount <= 0) return;
    setSave((prev) => {
      const next = { ...prev, xp: prev.xp + amount };
      saveCampaignSave(next);
      return next;
    });
  }, []);

  const handleToggleExplorerMode = () => {
    unlockAudio();
    soundEngine.playSfx('snap');
    persistSave({ ...save, explorerMode: !save.explorerMode });
  };

  const unlockAudio = useCallback(() => {
    soundEngine.unlockAndStart();
  }, []);

  useEffect(() => {
    if (screen === 'title' || screen === 'hub') {
      soundEngine.setTrack('orbital');
    }
  }, [screen]);

  const enterDirectGameplay = useCallback(() => {
    unlockAudio();
    soundEngine.playSfx('snap');
    setDismissedWelcome(true);
    setShowWelcome(false);
    setHubTab('play');
    setScreen('hub');
  }, [unlockAudio]);

  const startCompleteTutorial = useCallback(() => {
    unlockAudio();
    soundEngine.playSfx('snap');
    setShowWelcome(true);
  }, [unlockAudio]);

  // Global shortcuts: Enter from Title, M to mute, F1 for Field Guide
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        soundEngine.playSfx('click');
        setShowAcademy((v) => !v);
      } else if (
        e.key.toLowerCase() === 'm' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        setMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
      } else if (e.key === 'Enter' && screen === 'title' && !showPrologue && !showWelcome && !showAcademy) {
        enterDirectGameplay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, enterDirectGameplay, showPrologue, showWelcome, showAcademy]);

  const handleToggleMute = () => {
    unlockAudio();
    const next = !muted;
    setMuted(next);
    soundEngine.setMuted(next);
  };

  const handleToggleMusic = () => {
    unlockAudio();
    const next = !musicOn;
    setMusicOn(next);
    soundEngine.setMusicEnabled(next);
  };

  const handleSelectTrack = (id: MusicTrackId) => {
    unlockAudio();
    setTrack(id);
    soundEngine.setTrack(id);
    if (!musicOn) {
      setMusicOn(true);
      soundEngine.setMusicEnabled(true);
    }
    soundEngine.playSfx('click');
  };

  const handleVolumeChange = (v: number) => {
    unlockAudio();
    setVolume(v);
    soundEngine.setVolumes(v * 0.85, v);
  };

  const handleRecordResult = useCallback(
    (
      entry: MissionHistoryEntry,
      creditsEarned: number,
      stars: number,
      markTutorialDone?: boolean,
    ) => {
      setSave((prev) => {
        const prevStars = prev.missionStars[entry.missionId] || 0;
        const next: CampaignSave = {
          ...prev,
          credits: prev.credits + creditsEarned,
          streak: entry.outcome === 'success' ? prev.streak + 1 : 0,
          upgrades: prev.upgrades,
          missionStars: {
            ...prev.missionStars,
            [entry.missionId]: Math.max(prevStars, stars),
          },
          history: [entry, ...prev.history].slice(0, 30),
          tutorialDone: prev.tutorialDone || Boolean(markTutorialDone),
        };
        saveCampaignSave(next);
        return next;
      });
    },
    [],
  );

  const handleBuyUpgrade = (u: TechUpgradeDef) => {
    unlockAudio();
    const curLevel = save.upgrades[u.id] || 0;
    if (curLevel >= u.maxLevel) return;
    const cost = u.baseCost * (curLevel + 1);
    if (save.credits < cost) {
      soundEngine.playSfx('warning');
      return;
    }
    soundEngine.playSfx('success');
    persistSave({
      ...save,
      credits: save.credits - cost,
      upgrades: {
        ...save.upgrades,
        [u.id]: curLevel + 1,
      },
    });
  };

  const handleUpdateSensorDurability = useCallback(
    (updater: (prev: Record<string, number>) => Record<string, number>) => {
      setSave((prev) => {
        const nextDur = updater(prev.sensorDurability || { ...DEFAULT_SENSOR_DURABILITY });
        const next: CampaignSave = { ...prev, sensorDurability: nextDur };
        saveCampaignSave(next);
        return next;
      });
    },
    [],
  );

  const handleMaintainSensor = (sensorId: string, mode: 'full' | 'free-tune') => {
    unlockAudio();
    const current = getSensorDurability(save.sensorDurability, sensorId);
    if (current >= 100) return;

    if (mode === 'free-tune') {
      if (current >= 75) return;
      soundEngine.playSfx('snap');
      persistSave({
        ...save,
        sensorDurability: {
          ...save.sensorDurability,
          [sensorId]: Math.min(75, current + 20),
        },
      });
      return;
    }

    const cost = getMaintenanceCost(current);
    if (save.credits < cost) {
      soundEngine.playSfx('warning');
      return;
    }
    soundEngine.playSfx('success');
    persistSave({
      ...save,
      credits: save.credits - cost,
      sensorDurability: {
        ...save.sensorDurability,
        [sensorId]: 100,
      },
    });
  };

  const handleMaintainAllSensors = () => {
    unlockAudio();
    const worn = INSTRUMENTS.filter(
      (inst) => getSensorDurability(save.sensorDurability, inst.id) < 100,
    );
    if (worn.length === 0) return;
    const rawCost = worn.reduce(
      (sum, inst) => sum + getMaintenanceCost(getSensorDurability(save.sensorDurability, inst.id)),
      0,
    );
    const bulkCost = worn.length >= 2 ? Math.max(1, Math.round(rawCost * 0.85)) : rawCost;
    if (save.credits < bulkCost) {
      soundEngine.playSfx('warning');
      return;
    }
    soundEngine.playSfx('success');
    const restored: Record<string, number> = { ...save.sensorDurability };
    INSTRUMENTS.forEach((inst) => {
      restored[inst.id] = 100;
    });
    persistSave({
      ...save,
      credits: save.credits - bulkCost,
      sensorDurability: restored,
    });
  };

  const handleChangeDifficulty = (nextDiff: DifficultyLevel) => {
    unlockAudio();
    soundEngine.playSfx('click');
    setDifficulty(nextDiff);
    persistSave({ ...save, difficulty: nextDiff });
    if (mp.room && mp.room.hostId === mp.clientId) {
      mp.updateSettings({ difficulty: nextDiff });
    }
  };

  const handleSaveDesign = useCallback((design: SavedMissionDesign) => {
    setSave((prev) => {
      const next: CampaignSave = {
        ...prev,
        savedDesigns: [design, ...prev.savedDesigns.filter((d) => d.id !== design.id)].slice(0, 24),
      };
      saveCampaignSave(next);
      return next;
    });
  }, []);

  const handleRecordLeaderboard = useCallback((entry: LeaderboardEntry) => {
    setSave((prev) => {
      const merged = [entry, ...prev.leaderboard.filter((x) => x.id !== entry.id)]
        .sort((a, b) => b.score - a.score || b.efficiencyScore - a.efficiencyScore)
        .slice(0, 40);
      const next: CampaignSave = { ...prev, leaderboard: merged };
      saveCampaignSave(next);
      return next;
    });
    void postServerLeaderboard(entry);
  }, []);

  const handleToggleMemberRole = (memberId: string, roleId: TeamRoleId) => {
    soundEngine.playSfx('click');
    setTeamMembers((prev) =>
      prev.map((m) => {
        if (m.id !== memberId) return m;
        const has = m.roles.includes(roleId);
        if (has && m.roles.length === 1) return m;
        return {
          ...m,
          roles: has ? m.roles.filter((r) => r !== roleId) : [...m.roles, roleId],
        };
      }),
    );
  };

  const handleAddTeamMember = () => {
    if (teamMembers.length >= 4) return;
    soundEngine.playSfx('snap');
    const allRoles: TeamRoleId[] = ['commander', 'engineer', 'scientist', 'comms'];
    const fallbackRole = allRoles[teamMembers.length % allRoles.length];
    setTeamMembers((prev) => [
      ...prev,
      { id: `tm-${Date.now()}`, name: `Player ${prev.length + 1}`, roles: [fallbackRole] },
    ]);
  };

  const handleRemoveTeamMember = (id: string) => {
    if (teamMembers.length <= 2) return;
    soundEngine.playSfx('click');
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const initCompetitiveTeamsForMission = useCallback(
    (m: MissionDef): CompetitiveTeamRun[] =>
      competitiveTeamNames.map((name, idx) => ({
        teamIndex: idx,
        teamName: name.trim() || `Team ${idx + 1}`,
        config: createDefaultSatelliteConfig(m),
        score: null,
        sciencePts: 0,
        costM: 0,
        wetMassKg: 0,
        status: 'DRAFT',
      })),
    [competitiveTeamNames],
  );

  const handleSelectCompetitiveTeam = (nextIdx: number, outgoingConfig: SatelliteConfig) => {
    setCompetitiveTeams((prev) =>
      prev.map((t, i) => (i === activeCompetitiveIdx ? { ...t, config: outgoingConfig } : t)),
    );
    setActiveCompetitiveIdx(nextIdx);
  };

  const handleRecordCompetitiveRun = (teamIdx: number, runUpdate: Partial<CompetitiveTeamRun>) => {
    setCompetitiveTeams((prev) =>
      prev.map((t, i) => (i === teamIdx ? { ...t, ...runUpdate } : t)),
    );
  };

  const startSatelliteMission = (
    m: MissionDef,
    chapter: StoryChapterDef | null = null,
    overrideConfig: SatelliteConfig | null = null,
  ) => {
    unlockAudio();
    soundEngine.playSfx('snap');
    setStartInOrbitSignal(0);
    setPendingSatConfig(overrideConfig);
    setActiveChapter(chapter);
    setSelectedMission(m);
    if (playMode === 'competitive' && !mp.room) {
      setCompetitiveTeams(initCompetitiveTeamsForMission(m));
      setActiveCompetitiveIdx(0);
    }
    if (mp.room && !chapter && mp.room.hostId === mp.clientId) {
      mp.updateSettings({ missionId: m.id, launched: true });
    }
    setScreen('satellite');
  };

  const startRocketMission = (dest: OrbitId = 'LUNAR', chapter: StoryChapterDef | null = null) => {
    unlockAudio();
    soundEngine.playSfx('snap');
    setActiveChapter(chapter);
    setRocketDest(dest);
    setScreen('rocket');
  };

  const openPrologue = (followUp: 'story' | 'hub' | null = null, mandatory = false) => {
    unlockAudio();
    soundEngine.playSfx('snap');
    setMandatoryPrologue(mandatory);
    setPrologueFollowUp(followUp);
    setShowPrologue(true);
  };

  const handleResetToLevel1 = (replayPrologue: boolean) => {
    unlockAudio();
    soundEngine.playSfx('snap');
    const resetSave: CampaignSave = {
      ...DEFAULT_CAMPAIGN_SAVE,
      difficulty: save.difficulty,
      upgrades: { ...DEFAULT_CAMPAIGN_SAVE.upgrades },
      sensorDurability: { ...DEFAULT_SENSOR_DURABILITY },
      leaderboard: save.leaderboard,
      savedDesigns: save.savedDesigns,
      prologueSeen: !replayPrologue,
    };
    persistSave(resetSave);
    setLevelUpNotice(null);
    setActiveChapter(null);
    setPendingSatConfig(null);
    setCustomRocketPayload(null);
    setSelectedMission(MISSIONS[0]);
    if (playMode === 'sandbox') {
      setPlayMode('solo');
    }
    setConfirmResetLv1(false);
    setHubTab('play');
    setScreen(replayPrologue ? 'title' : 'hub');
    if (replayPrologue) {
      setMandatoryPrologue(true);
      setPrologueFollowUp('hub');
      setShowPrologue(true);
    }
  };

  const launchStoryChapter = (chapter: StoryChapterDef) => {
    unlockAudio();
    soundEngine.playSfx('snap');
    if (chapter.chapterNum === 1 && !save.prologueSeen) {
      setMandatoryPrologue(true);
      setPrologueFollowUp('story');
      setShowPrologue(true);
      return;
    }
    setStoryModal({ chapter, variant: 'intro' });
  };

  const handleStartChapterFromIntro = (chapter: StoryChapterDef) => {
    setStoryModal(null);
    setSave((prev) => {
      if (prev.seenStoryIntros.includes(chapter.id)) return prev;
      const next = { ...prev, seenStoryIntros: [...prev.seenStoryIntros, chapter.id] };
      saveCampaignSave(next);
      return next;
    });
    if (chapter.mode === 'rocket') {
      startRocketMission(chapter.rocketDest || 'LUNAR', chapter);
    } else {
      const m = MISSIONS.find((x) => x.id === chapter.missionId) || MISSIONS[0];
      startSatelliteMission(m, chapter);
    }
  };

  const handleCompleteStoryChapter = (chapter: StoryChapterDef) => {
    setSave((prev) => {
      const isNewClear = prev.storyStep < chapter.chapterNum;
      const nextXp = prev.xp + (isNewClear ? 45 : 0);
      const next: CampaignSave = {
        ...prev,
        storyStep: Math.max(prev.storyStep, chapter.chapterNum),
        credits: prev.credits + (isNewClear ? chapter.bonusCredits : 0),
        xp: nextXp,
      };
      saveCampaignSave(next);
      return next;
    });
    setActiveChapter(null);
    setScreen('hub');
    setStoryModal({ chapter, variant: 'outro' });
  };

  const currentStoryChapter =
    STORY_CHAPTERS[Math.min(save.storyStep, STORY_CHAPTERS.length - 1)];

  const levelInfo = getPlayerLevelInfo(save.xp);
  const prevLevelRef = useRef(levelInfo.level);
  useEffect(() => {
    if (levelInfo.level > prevLevelRef.current) {
      soundEngine.playSfx('success');
      setLevelUpNotice({ level: levelInfo.level, title: levelInfo.title });
    }
    prevLevelRef.current = levelInfo.level;
  }, [levelInfo.level, levelInfo.title]);
  const totalStars = Object.values(save.missionStars).reduce((s, v) => s + v, 0);
  const wornSensors = INSTRUMENTS.filter(
    (inst) => getSensorDurability(save.sensorDurability, inst.id) < 80,
  );
  const anySensorNeedsService = INSTRUMENTS.filter(
    (inst) => getSensorDurability(save.sensorDurability, inst.id) < 100,
  );
  const bulkMaintenanceCost = (() => {
    const raw = anySensorNeedsService.reduce(
      (sum, inst) => sum + getMaintenanceCost(getSensorDurability(save.sensorDurability, inst.id)),
      0,
    );
    return anySensorNeedsService.length >= 2 ? Math.max(1, Math.round(raw * 0.85)) : raw;
  })();

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100">
      {/* SCREEN 1: FULL-VIEWPORT LIVE 3D TITLE SCREEN */}
      {screen === 'title' && (
        <div
          className="relative h-screen w-screen overflow-hidden bg-[#050912]"
          onPointerDown={unlockAudio}
        >
          <div className="absolute inset-0">
            <EarthGlobeView backdropMode hotspots={liveHotspots} />
          </div>

          {/* Calm left gradient scrim (no backdrop-blur over WebGL) */}
          <div className="absolute inset-y-0 left-0 w-full md:w-[55%] bg-gradient-to-r from-[#050811] via-[#050811]/92 to-transparent pointer-events-none" />

          <div className="relative z-10 h-full flex flex-col justify-between p-6 sm:p-10 lg:p-14 max-w-2xl">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 36 36"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <circle cx="18" cy="18" r="15" stroke="#22D3EE" strokeWidth="1.4" strokeDasharray="3 3" />
                  <ellipse
                    cx="18"
                    cy="18"
                    rx="16"
                    ry="6.5"
                    transform="rotate(-24 18 18)"
                    stroke="#F59E0B"
                    strokeWidth="1.5"
                  />
                  <circle cx="18" cy="18" r="5" fill="#22D3EE" />
                </svg>
                <span className="font-mono text-xs uppercase tracking-widest text-cyan-300">
                  NASA Space Apps Challenge
                </span>
              </div>

              <button
                onClick={handleToggleMute}
                className="rounded-lg border border-slate-700 bg-[#0A101D] px-3 py-1.5 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
              >
                {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-cyan-400" />}
                <span>{muted ? 'Muted' : 'Soundtrack On'}</span>
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <h1 className="font-space text-3xl sm:text-5xl lg:text-6xl font-extrabold uppercase tracking-[0.12em] bg-gradient-to-r from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(34,211,238,0.28)] leading-[1.1]">
                  PROJECT AEGIS
                </h1>
                <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                  Design real NASA rockets &amp; Earth-scanning satellites, solve space problems, explore worlds, and keep Earth healthy!
                </p>
              </div>

              <CommanderBubble
                tone="cyan"
                message="Welcome Cadet! Ready to lead NASA space missions? Take the Complete Tutorial first to learn every step, or jump straight to Gameplay!"
                actionHint="Pick Option 1 (Complete Tutorial) or Option 2 (Go Direct to Gameplay) below."
                nasaFact="Real NASA astronauts & flight controllers train step-by-step in simulators before ever launching a rocket or satellite!"
              />

              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <button
                  onClick={startCompleteTutorial}
                  className="rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-6 py-3.5 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
                >
                  <HelpCircle className="w-4 h-4" />
                  Continue to Complete Tutorial
                </button>
                <button
                  onClick={enterDirectGameplay}
                  className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-6 py-3.5 text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Go Direct to Gameplay
                </button>
                <button
                  onClick={() => openPrologue('hub')}
                  className="rounded-xl border border-cyan-500/60 bg-[#0D1526] hover:bg-cyan-950/40 text-cyan-200 font-semibold px-5 py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                  Watch Prologue
                </button>
                <button
                  onClick={() => launchStoryChapter(currentStoryChapter)}
                  className="rounded-xl border border-violet-500/60 bg-[#0D1526] hover:bg-violet-950/40 text-violet-200 font-semibold px-5 py-3.5 text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Radio className="w-4 h-4 text-violet-300" />
                  {save.storyStep === 0 ? 'Story Campaign' : `Story Ch. ${currentStoryChapter.chapterNum}`}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-4 text-xs font-mono text-slate-400">
              <span>Press Enter to Start · Spacebar Scan/Stage · M Mute</span>
              <div className="flex items-center gap-4">
                {(save.xp > 0 || save.storyStep > 0 || Object.keys(save.missionStars).length > 0) && (
                  <button
                    onClick={() => handleResetToLevel1(true)}
                    className="text-amber-300 hover:text-amber-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Lv.1
                  </button>
                )}
                <button
                  onClick={() => {
                    unlockAudio();
                    setShowAcademy(true);
                  }}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Space Academy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCREEN 2: MISSION COMMAND HUB */}
      {screen === 'hub' && (
        <div className="min-h-screen flex flex-col">
          {/* Clean Top Navigation */}
          <header className="relative border-b border-slate-800 bg-[#0A101D] px-4 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => {
                soundEngine.playSfx('click');
                setScreen('title');
              }}
              className="flex items-center gap-2.5 text-left group"
            >
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none" aria-hidden="true">
                <circle cx="18" cy="18" r="15" stroke="#22D3EE" strokeWidth="1.5" strokeDasharray="3 3" />
                <ellipse
                  cx="18"
                  cy="18"
                  rx="16"
                  ry="6.5"
                  transform="rotate(-24 18 18)"
                  stroke="#F59E0B"
                  strokeWidth="1.6"
                />
                <circle cx="18" cy="18" r="5" fill="#22D3EE" />
              </svg>
              <div>
                <div className="font-space text-sm sm:text-base font-bold uppercase tracking-[0.12em] text-white group-hover:text-cyan-300 transition-colors">
                  PROJECT AEGIS
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {isLiveNasa ? 'Live NASA EONET Connected' : nasaFeedLabel}
                </div>
              </div>
            </button>

            {/* Right Utility Controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="rounded-lg border border-cyan-700/60 bg-[#0D1526] px-3 py-1.5 font-mono tabular-nums text-cyan-300">
                LV.{levelInfo.level} · {levelInfo.xp} EXP
              </div>
              <div className="rounded-lg border border-slate-800 bg-[#0D1526] px-3 py-1.5 font-mono tabular-nums text-amber-300">
                {save.credits} CR · ★ {totalStars}
              </div>

              <button
                onClick={handleToggleExplorerMode}
                title="Switch between simple kid-friendly guidance and pro aerospace labels"
                className={`rounded-lg border px-3 py-1.5 font-semibold transition-colors ${
                  save.explorerMode
                    ? 'border-emerald-500/70 bg-emerald-950/40 text-emerald-300'
                    : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                {save.explorerMode ? 'Simple View' : 'Pro View'}
              </button>

              <button
                onClick={() => {
                  unlockAudio();
                  soundEngine.playSfx('click');
                  setHubCompareModal('compare');
                }}
                className="rounded-lg border border-slate-700 bg-[#0D1526] hover:border-cyan-400 px-3 py-1.5 font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <GitCompare className="w-3.5 h-3.5 text-cyan-400" />
                Compare &amp; Codes
              </button>

              <button
                onClick={() => {
                  unlockAudio();
                  soundEngine.playSfx('click');
                  setHubCompareModal('leaderboard');
                }}
                className="rounded-lg border border-slate-700 bg-[#0D1526] hover:border-amber-400 px-3 py-1.5 font-semibold text-amber-300 flex items-center gap-1.5 transition-colors"
              >
                <Trophy className="w-3.5 h-3.5" />
                Rankings
              </button>

              <button
                onClick={() => {
                  unlockAudio();
                  soundEngine.playSfx('click');
                  setShowWelcome(true);
                }}
                className="rounded-lg border border-slate-700 bg-[#0D1526] hover:border-cyan-400 px-3 py-1.5 font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                Tutorial
              </button>

              <button
                onClick={() => {
                  unlockAudio();
                  soundEngine.playSfx('click');
                  setShowAcademy(true);
                }}
                className="rounded-lg border border-cyan-700/70 bg-cyan-950/40 hover:bg-cyan-900/50 px-3 py-1.5 font-semibold text-cyan-200 flex items-center gap-1.5 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                Academy
              </button>

              <div className="relative">
                <button
                  onClick={() => {
                    unlockAudio();
                    soundEngine.playSfx('click');
                    setShowAudioMenu((v) => !v);
                  }}
                  className="rounded-lg border border-slate-700 bg-[#0D1526] hover:border-slate-500 px-2.5 py-1.5 text-slate-200 flex items-center gap-1.5"
                  aria-label="Audio & Music Settings"
                >
                  {muted ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Music className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                  <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                </button>

                {showAudioMenu && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-700 bg-[#0D1526] p-3.5 shadow-2xl z-30 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-white">
                      <span>Soundtrack &amp; Volume</span>
                      <button
                        onClick={handleToggleMute}
                        className="text-[11px] font-mono text-cyan-300 hover:underline"
                      >
                        {muted ? 'Unmute' : 'Mute All'}
                      </button>
                    </div>
                    <select
                      value={track}
                      onChange={(e) => handleSelectTrack(e.target.value as MusicTrackId)}
                      className="w-full rounded-lg border border-slate-700 bg-[#090F1C] px-2.5 py-1.5 text-xs text-slate-200"
                      aria-label="Select soundtrack"
                    >
                      {TRACK_LABELS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <button
                        onClick={handleToggleMusic}
                        className={`rounded px-2.5 py-1 text-[11px] font-mono border ${
                          musicOn
                            ? 'border-cyan-500/60 bg-cyan-950/40 text-cyan-300'
                            : 'border-slate-700 bg-slate-900 text-slate-500'
                        }`}
                      >
                        {musicOn ? 'Music ON' : 'Music OFF'}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="flex-1 accent-cyan-400"
                        aria-label="Master volume"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto space-y-6">
            {/* Level-Up Celebration Banner */}
            {levelUpNotice && (
              <section className="rounded-xl border border-emerald-500/70 bg-emerald-950/40 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-white">
                      Level Up! You reached Level {levelUpNotice.level} — {levelUpNotice.title}
                    </div>
                    <div className="text-xs text-emerald-200">
                      Harder Space Missions and Rocket Destinations are now unlocked!
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setLevelUpNotice(null)}
                  className="rounded-lg border border-emerald-600/60 bg-emerald-900/50 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-800/60"
                >
                  Awesome!
                </button>
              </section>
            )}

            {/* Compact Rank & Next Goal Bar */}
            <section className="rounded-xl border border-cyan-500/30 bg-[#0D1526] px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono text-cyan-400 uppercase">
                    Level {levelInfo.level} · {levelInfo.title}
                  </div>
                  <div className="text-xs text-slate-300">
                    {!save.tutorialDone
                      ? 'First Step: Start Mission Zero or Rocket Hangar below and fix red problems to earn EXP!'
                      : 'Fix problems inside missions to earn EXP and unlock harder worlds.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="flex-1 sm:w-64 space-y-1">
                    <div className="flex justify-between text-[11px] font-mono tabular-nums">
                      <span className="text-cyan-300">{levelInfo.xp} EXP</span>
                      <span className="text-slate-400">
                        {levelInfo.xpToNext > 0
                          ? `${levelInfo.xpToNext} EXP to Lv.${levelInfo.level + 1}`
                          : 'Max Rank'}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-slate-900 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-cyan-400 transition-all"
                        style={{ width: `${levelInfo.progressPct}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setConfirmResetLv1((v) => !v);
                    }}
                    className="rounded-lg border border-slate-700 bg-[#090F1C] hover:border-rose-400/70 hover:text-rose-200 px-3 py-1.5 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset to Lv.1
                  </button>
                </div>
              </div>

              {confirmResetLv1 && (
                <div className="rounded-lg border border-rose-500/45 bg-rose-950/25 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-rose-100">
                    Reset campaign EXP, stars, credits, R&amp;D upgrades &amp; story chapters back to <strong>Level 1</strong>? (Rankings &amp; saved blueprints stay safe.)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleResetToLevel1(true)}
                      className="rounded border border-cyan-500/60 bg-cyan-950/50 hover:bg-cyan-500 hover:text-slate-950 px-3 py-1 text-[11px] font-semibold text-cyan-200 transition-colors"
                    >
                      Reset Lv.1 &amp; Play Prologue
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetToLevel1(false)}
                      className="rounded bg-rose-500 hover:bg-rose-400 px-3 py-1 text-[11px] font-semibold text-slate-950 transition-colors"
                    >
                      Quick Reset to Lv.1
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetLv1(false)}
                      className="rounded border border-slate-700 bg-[#0D1526] hover:bg-slate-800 px-2.5 py-1 text-[11px] text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Quick R&D Upgrade Prompt when Credits can buy an upgrade */}
            {hubTab === 'play' &&
              TECH_UPGRADES.some(
                (u) => (save.upgrades[u.id] || 0) < u.maxLevel && save.credits >= u.baseCost * ((save.upgrades[u.id] || 0) + 1),
              ) && (
                <section className="rounded-xl border border-emerald-500/45 bg-emerald-950/25 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-emerald-100">
                      You have <strong className="font-mono text-amber-300">{save.credits} CR</strong> ready! Research hardware upgrades in the R&amp;D Lab to boost Rocket Δv, Lander Fuel, Solar Power &amp; Budgets.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      soundEngine.playSfx('click');
                      setHubTab('lab');
                    }}
                    className="rounded-lg border border-emerald-400/70 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 text-xs font-semibold transition-colors"
                  >
                    Open Upgrades Lab →
                  </button>
                </section>
              )}

            {/* Sensor Maintenance Alert when orbital wear or debris has degraded sensors */}
            {hubTab === 'play' && wornSensors.length > 0 && (
              <section className="rounded-xl border border-amber-500/55 bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-xs">
                  <Wrench className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-amber-100">
                    <strong>{wornSensors.length} satellite sensor(s)</strong> degraded below 80% durability from orbital wear &amp; space debris. Perform maintenance in the R&amp;D Lab for full scan yield!
                  </span>
                </div>
                <button
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setHubTab('lab');
                  }}
                  className="rounded-lg border border-amber-400/70 bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-1.5 text-xs font-semibold transition-colors"
                >
                  Open Maintenance Bay →
                </button>
              </section>
            )}

            {/* Clean Hub Section Tabs */}
            <nav
              className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3"
              aria-label="Command Hub Sections"
            >
              {[
                { id: 'play' as HubTab, label: 'Play Missions & Modes' },
                {
                  id: 'story' as HubTab,
                  label: `Story Campaign (${Math.min(save.storyStep, 5)}/5)`,
                },
                {
                  id: 'lab' as HubTab,
                  label:
                    wornSensors.length > 0
                      ? `R&D Lab & Maintenance (${wornSensors.length} Worn)`
                      : 'R&D Lab, Maintenance & Log',
                },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setHubTab(t.id);
                  }}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors border ${
                    hubTab === t.id
                      ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200'
                      : 'border-slate-800 bg-[#0D1526] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            {/* HUB TAB 1: PLAY MISSIONS & MODES */}
            {hubTab === 'play' && (
              <div className="space-y-6">
                <CommanderBubble
                  tone="cyan"
                  message="Pick your Play Mode (Solo, Team Co-op 2–4 Players, Competitive Teams, or Sandbox) and Difficulty below—then launch a Rocket or design a Satellite!"
                  actionHint="Configure Solo / Team Setup below, then launch any Mission on the ladder."
                  nasaFact="Real NASA missions combine specialists across Command, Spacecraft Engineering, Earth Science, and Comms & Resource Management."
                />

                {/* Play Mode & Difficulty Configuration Panel */}
                <section className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-xs font-mono uppercase text-cyan-400 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Play Mode (Single, Team Co-op, Competitive, Sandbox)
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { id: 'solo' as PlayMode, label: 'Solo Pilot', sub: '1 Player' },
                          { id: 'coop' as PlayMode, label: 'Team Co-op', sub: '2–4 Players' },
                          { id: 'competitive' as PlayMode, label: 'Team Match', sub: '2–4 Teams' },
                          { id: 'sandbox' as PlayMode, label: 'Sandbox', sub: 'All Unlocked' },
                        ].map((pm) => (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => {
                              unlockAudio();
                              soundEngine.playSfx('snap');
                              if (mp.room) {
                                if (pm.id === 'solo' || pm.id === 'sandbox') {
                                  mp.leaveRoom();
                                } else if (mp.room.hostId === mp.clientId) {
                                  mp.updateSettings({ playMode: pm.id });
                                }
                              }
                              setPlayMode(pm.id);
                            }}
                            className={`rounded-lg border p-2.5 text-left transition-colors ${
                              playMode === pm.id
                                ? 'border-cyan-400 bg-cyan-950/45 text-white'
                                : 'border-slate-800 bg-[#111A2E] text-slate-300 hover:border-slate-600'
                            }`}
                          >
                            <div className="text-xs font-semibold">{pm.label}</div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">{pm.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-mono uppercase text-amber-400">
                        Simulation Difficulty Level
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(['cadet', 'engineer', 'director'] as DifficultyLevel[]).map((dKey) => {
                          const prof = DIFFICULTY_PROFILES[dKey];
                          const active = difficulty === dKey;
                          return (
                            <button
                              key={dKey}
                              type="button"
                              onClick={() => handleChangeDifficulty(dKey)}
                              className={`rounded-lg border p-2.5 text-left transition-colors ${
                                active
                                  ? 'border-amber-400 bg-amber-950/35 text-white'
                                  : 'border-slate-800 bg-[#111A2E] text-slate-300 hover:border-slate-600'
                              }`}
                            >
                              <div className="text-xs font-semibold truncate">{prof.label}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2 leading-tight">
                                {prof.subtitle}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Live Networked Room + Offline Hotseat Panel for Co-op & Competitive */}
                  {(playMode === 'coop' || playMode === 'competitive') && (
                    <div className="rounded-lg border border-cyan-500/45 bg-[#0A101D] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2 text-xs">
                          <Wifi
                            className={`w-4 h-4 ${
                              mp.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          />
                          <span className="font-semibold text-white">
                            Live Online Multiplayer Room
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-[#111A2E] text-slate-300">
                            {mp.status === 'connected'
                              ? 'WebSocket Server Ready'
                              : mp.status === 'connecting'
                                ? 'Connecting...'
                                : 'Offline (Hotseat Active)'}
                          </span>
                        </div>
                        {mp.room && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playSfx('click');
                              mp.leaveRoom();
                            }}
                            className="rounded border border-rose-700/70 bg-rose-950/35 hover:bg-rose-900/50 px-2.5 py-1 text-[11px] font-mono text-rose-200"
                          >
                            Leave Room {mp.room.code}
                          </button>
                        )}
                      </div>

                      {mp.roomError && (
                        <div className="rounded border border-rose-600/60 bg-rose-950/35 px-3 py-1.5 text-xs text-rose-200 flex items-center justify-between">
                          <span>{mp.roomError}</span>
                          <button
                            type="button"
                            onClick={mp.clearError}
                            className="text-[10px] font-mono underline"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}

                      {!mp.room ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                          <div className="lg:col-span-3 space-y-1">
                            <label className="block text-[10px] font-mono text-slate-400 uppercase">
                              Your Callsign
                            </label>
                            <input
                              type="text"
                              value={playerCallsign}
                              onChange={(e) => {
                                setPlayerCallsign(e.target.value);
                                try {
                                  localStorage.setItem('ma_callsign', e.target.value);
                                } catch {
                                  // ignore
                                }
                              }}
                              placeholder="Commander 1"
                              className="w-full rounded border border-slate-700 bg-[#090F1C] px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>

                          <div className="lg:col-span-4 space-y-1">
                            <label className="block text-[10px] font-mono text-slate-400 uppercase">
                              Host New Live Room ({playMode === 'coop' ? '2–4 Co-op' : '2–4 Teams'})
                            </label>
                            <button
                              type="button"
                              disabled={mp.status !== 'connected'}
                              onClick={() => {
                                unlockAudio();
                                soundEngine.playSfx('snap');
                                mp.createRoom({
                                  playerName: playerCallsign.trim() || 'Commander 1',
                                  playMode,
                                  difficulty,
                                  missionId: selectedMission.id,
                                  config: createDefaultSatelliteConfig(selectedMission),
                                  teamName: competitiveTeamNames[0],
                                });
                              }}
                              className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold px-3 py-1.5 text-xs transition-colors"
                            >
                              {mp.status === 'connected'
                                ? `Create Live ${playMode === 'coop' ? 'Co-op' : 'Match'} Room`
                                : 'Online Server Unavailable'}
                            </button>
                          </div>

                          <div className="lg:col-span-5 space-y-1">
                            <label className="block text-[10px] font-mono text-slate-400 uppercase">
                              Or Join Invite Code
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={joinCodeInput}
                                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                                placeholder="ROOM CODE (e.g. A7K9P2)"
                                className="flex-1 rounded border border-slate-700 bg-[#090F1C] px-2.5 py-1.5 text-xs font-mono uppercase text-cyan-300"
                              />
                              <button
                                type="button"
                                disabled={mp.status !== 'connected' || !joinCodeInput.trim()}
                                onClick={() => {
                                  unlockAudio();
                                  soundEngine.playSfx('snap');
                                  mp.joinRoom({
                                    roomCode: joinCodeInput,
                                    playerName: playerCallsign.trim() || 'Engineer',
                                    teamName: competitiveTeamNames[1] || undefined,
                                  });
                                }}
                                className="rounded-lg border border-emerald-500/70 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-semibold px-3.5 py-1.5 text-xs"
                              >
                                Join Room
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-600/50 bg-[#0D1526] px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              <div>
                                <span className="text-slate-400 font-mono text-[10px] uppercase block">
                                  Room Code
                                </span>
                                <span className="font-mono text-base font-bold text-cyan-300 tracking-wider">
                                  {mp.room.code}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-mono text-[10px] uppercase block">
                                  Target Mission
                                </span>
                                <select
                                  value={mp.room.missionId}
                                  disabled={mp.room.hostId !== mp.clientId}
                                  onChange={(e) =>
                                    mp.updateSettings({ missionId: e.target.value })
                                  }
                                  className="rounded border border-slate-700 bg-[#090F1C] px-2 py-1 text-xs text-white"
                                  aria-label="Room Mission"
                                >
                                  {MISSIONS.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name} ({m.target})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const url = buildRoomInviteUrl(mp.room?.code || '');
                                  if (navigator.clipboard) {
                                    void navigator.clipboard.writeText(url);
                                  }
                                  setCopiedInvite(true);
                                  window.setTimeout(() => setCopiedInvite(false), 2400);
                                }}
                                className="rounded-lg border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-3 py-1.5 text-xs font-semibold text-cyan-200 flex items-center gap-1.5"
                              >
                                {copiedInvite ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                    Invite Link Copied!
                                  </>
                                ) : (
                                  <>
                                    <Link2 className="w-3.5 h-3.5" />
                                    <Copy className="w-3 h-3" />
                                    Copy Invite URL
                                  </>
                                )}
                              </button>

                              {mp.room.hostId === mp.clientId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    unlockAudio();
                                    soundEngine.playSfx('ignition');
                                    mp.updateSettings({ launched: true });
                                  }}
                                  className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold px-4 py-1.5 text-xs flex items-center gap-1.5"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  Launch Room Mission ({mp.room.players.filter((p) => p.online).length} Players)
                                </button>
                              ) : (
                                <span className="font-mono text-[11px] text-amber-300 px-2">
                                  Waiting for Host to launch mission...
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            {mp.room.players.map((p) => {
                              const isMe = p.clientId === mp.clientId;
                              return (
                                <div
                                  key={p.clientId}
                                  className={`rounded-lg border p-2.5 space-y-1.5 ${
                                    isMe
                                      ? 'border-cyan-400 bg-cyan-950/35'
                                      : 'border-slate-800 bg-[#111A2E]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between text-xs font-semibold text-white">
                                    <span className="truncate">
                                      {p.name}
                                      {isMe ? ' (You)' : ''}
                                    </span>
                                    <span className="font-mono text-[10px] text-emerald-400">
                                      {p.isHost ? 'HOST' : p.online ? 'READY' : 'AWAY'}
                                    </span>
                                  </div>
                                  {mp.room?.playMode === 'coop' ? (
                                    <div className="grid grid-cols-2 gap-1">
                                      {TEAM_ROLE_DEFS.map((r) => {
                                        const active = p.roles.includes(r.id);
                                        return (
                                          <button
                                            key={r.id}
                                            type="button"
                                            disabled={!isMe}
                                            onClick={() => mp.claimRole(r.id)}
                                            className={`rounded border px-1.5 py-0.5 text-[10px] font-mono text-left truncate ${
                                              active
                                                ? 'border-cyan-400 bg-cyan-950/60 text-cyan-200'
                                                : 'border-slate-800 bg-[#090F1C] text-slate-400'
                                            }`}
                                          >
                                            {r.shortTitle}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] font-mono text-amber-300">
                                      Assigned:{' '}
                                      {mp.room?.competitiveTeams[p.teamIndex]?.teamName ||
                                        `Team ${p.teamIndex + 1}`}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dynamic Co-op 2-4 Player Roster Editor (Offline / Local Hotseat Fallback) */}
                  {playMode === 'coop' && !mp.room && (
                    <div className="rounded-lg border border-cyan-800/50 bg-[#0A101D] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-white">
                            Local Pass-and-Play Roster ({teamMembers.length}/4 Players)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Playing on one shared screen? Assign responsibilities across Command, Engineering, Science, and Comms.
                          </div>
                        </div>
                        {teamMembers.length < 4 && (
                          <button
                            type="button"
                            onClick={handleAddTeamMember}
                            className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-1.5 text-xs"
                          >
                            + Add Player
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2.5">
                        {teamMembers.map((member) => (
                          <div
                            key={member.id}
                            className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={member.name}
                                onChange={(e) =>
                                  setTeamMembers((prev) =>
                                    prev.map((m) =>
                                      m.id === member.id ? { ...m, name: e.target.value } : m,
                                    ),
                                  )
                                }
                                className="w-full rounded border border-slate-700 bg-[#090F1C] px-2 py-1 text-xs font-semibold text-white"
                                aria-label="Player name"
                              />
                              {teamMembers.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTeamMember(member.id)}
                                  className="text-[10px] font-mono text-rose-400 hover:underline shrink-0"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {TEAM_ROLE_DEFS.map((r) => {
                                const assigned = member.roles.includes(r.id);
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => handleToggleMemberRole(member.id, r.id)}
                                    className={`rounded border px-1.5 py-1 text-[10px] font-mono text-left truncate ${
                                      assigned
                                        ? 'border-cyan-400 bg-cyan-950/50 text-cyan-200'
                                        : 'border-slate-800 bg-[#0A101D] text-slate-400'
                                    }`}
                                  >
                                    {r.shortTitle}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Competitive 2-4 Teams Setup (Offline / Local Hotseat Fallback) */}
                  {playMode === 'competitive' && !mp.room && (
                    <div className="rounded-lg border border-amber-800/50 bg-[#0A101D] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-white">
                            Local Competing Teams ({competitiveTeamNames.length}/4 Teams)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Or create an online room above so each player builds on their own device!
                          </div>
                        </div>
                        {competitiveTeamNames.length < 4 && (
                          <button
                            type="button"
                            onClick={() => {
                              soundEngine.playSfx('snap');
                              setCompetitiveTeamNames((prev) => [
                                ...prev,
                                `Team ${prev.length + 1}`,
                              ]);
                            }}
                            className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-3 py-1.5 text-xs"
                          >
                            + Add Team
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                        {competitiveTeamNames.map((tName, idx) => (
                          <div
                            key={idx}
                            className="rounded-lg border border-slate-800 bg-[#111A2E] p-2.5 flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={tName}
                              onChange={(e) =>
                                setCompetitiveTeamNames((prev) =>
                                  prev.map((n, i) => (i === idx ? e.target.value : n)),
                                )
                              }
                              className="w-full rounded border border-slate-700 bg-[#090F1C] px-2 py-1 text-xs font-semibold text-white"
                              aria-label={`Competing team ${idx + 1}`}
                            />
                            {competitiveTeamNames.length > 2 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setCompetitiveTeamNames((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="text-[10px] font-mono text-rose-400 hover:underline shrink-0"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Two Core Game Modes */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-amber-500/40 bg-[#0D1526] p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-mono uppercase text-amber-400">
                        <Rocket className="w-4 h-4" />
                        Mode 1 · Rocket Launch
                      </div>
                      <h2 className="text-xl font-bold text-white">Fly Rockets to Space</h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        Build your rocket stages, fix pad problems for EXP, and reach Moon, LEO, GEO, or Mars.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => startRocketMission('LUNAR')}
                        className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 text-xs transition-colors flex items-center gap-1.5"
                      >
                        <Flame className="w-4 h-4" />
                        Launch to Moon (Start)
                      </button>
                      {(['LEO', 'GEO', 'MARS'] as OrbitId[]).map((dest) => {
                        const destMeta = ROCKET_DESTINATIONS.find((d) => d.id === dest);
                        const reqLv = destMeta?.requiredLevel || 1;
                        const unlocked = playMode === 'sandbox' || levelInfo.level >= reqLv;
                        return (
                          <button
                            key={dest}
                            disabled={!unlocked}
                            onClick={() => startRocketMission(dest)}
                            className={`rounded-lg border px-3 py-2 text-xs font-mono transition-colors flex items-center gap-1.5 ${
                              unlocked
                                ? 'border-slate-700 bg-[#111A2E] hover:border-amber-400/70 text-slate-200'
                                : 'border-slate-800/70 bg-slate-900/50 text-slate-500 cursor-not-allowed'
                            }`}
                          >
                            {!unlocked && <Lock className="w-3 h-3 text-amber-400" />}
                            {unlocked ? dest : `${dest} (Lv.${reqLv})`}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-cyan-500/40 bg-[#0D1526] p-5 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-mono uppercase text-cyan-400">
                        <Satellite className="w-4 h-4" />
                        Mode 2 · Satellite &amp; Earth Sensors
                      </div>
                      <h2 className="text-xl font-bold text-white">Fix Satellites &amp; Scan Earth</h2>
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                        Add Earth sensors, pass pre-flight checks, launch into 3D orbit, and scan live wildfires &amp; storms.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => startSatelliteMission(MISSIONS[0])}
                        className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 text-xs transition-colors flex items-center gap-1.5"
                      >
                        <Compass className="w-4 h-4" />
                        Guided Tutorial (Mission Zero)
                      </button>
                      <button
                        onClick={() => startSatelliteMission(MISSIONS[1])}
                        className="rounded-lg border border-slate-700 bg-[#111A2E] hover:border-cyan-400/70 px-4 py-2 text-xs font-medium text-cyan-200 transition-colors"
                      >
                        Earth Hazard Mission
                      </button>
                    </div>
                  </div>
                </section>

                {/* Clean 5-Mission Ladder */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <Award className="w-4 h-4 text-cyan-400" />
                      Mission Ladder {playMode === 'sandbox' ? '(Sandbox: All Worlds Unlocked)' : '(Unlock Harder Worlds with EXP)'}
                    </h2>
                    <span className="text-xs text-slate-400">
                      Click any unlocked mission to fix problems and fly
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3.5">
                    {MISSIONS.map((m) => {
                      const stars = save.missionStars[m.id] || 0;
                      const unlocked = playMode === 'sandbox' || levelInfo.level >= m.requiredLevel;
                      return (
                        <div
                          key={m.id}
                          className={`rounded-xl border overflow-hidden flex flex-col justify-between transition-colors ${
                            unlocked
                              ? 'border-slate-800 bg-[#0D1526] hover:border-slate-600'
                              : 'border-slate-800/60 bg-[#0A101D]/85'
                          }`}
                        >
                          <div>
                            {/* Mission Artwork Banner */}
                            <div className="relative h-28 w-full bg-[#070B14] border-b border-slate-800 overflow-hidden">
                              <img
                                src={m.imagePath}
                                alt={m.name}
                                className={`w-full h-full object-cover transition-transform duration-300 ${
                                  unlocked ? 'hover:scale-105' : 'grayscale opacity-45'
                                }`}
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#0D1526] via-[#0D1526]/30 to-transparent" />
                              <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between text-[10px] font-mono tabular-nums">
                                <span
                                  className={`rounded border px-1.5 py-0.5 bg-[#070B14]/88 ${
                                    unlocked
                                      ? 'border-cyan-500/45 text-cyan-300'
                                      : 'border-amber-500/45 text-amber-300'
                                  }`}
                                >
                                  {m.difficulty} · Lv.{m.requiredLevel}
                                </span>
                                <span className="rounded border border-slate-700/80 bg-[#070B14]/88 px-1.5 py-0.5 text-amber-400">
                                  {'★'.repeat(stars)}
                                  {'☆'.repeat(3 - stars)}
                                </span>
                              </div>
                              {!unlocked && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                  <span className="rounded border border-amber-500/55 bg-[#070B14]/92 px-2.5 py-1 text-[10px] font-mono text-amber-300 flex items-center gap-1">
                                    <Lock className="w-3 h-3" />
                                    LV.{m.requiredLevel} REQUIRED
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="p-3.5 space-y-1.5">
                              <h3 className="text-sm font-bold text-white leading-snug">
                                {m.name}
                              </h3>
                              <div className="text-[11px] font-mono text-slate-400">
                                {m.target} · +{m.rewardXp} EXP
                              </div>
                              <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                                {m.briefing}
                              </p>
                            </div>
                          </div>

                          <div className="px-3.5 pb-3.5">
                            {unlocked ? (
                              <div className="space-y-1.5">
                                <button
                                  onClick={() => startSatelliteMission(m)}
                                  className="w-full rounded-lg bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-white font-semibold py-2 text-xs transition-colors"
                                >
                                  {playMode === 'competitive'
                                    ? 'Start Team Match'
                                    : m.id === 'zero'
                                      ? 'Start Guided Mission'
                                      : 'Fix & Design Satellite'}
                                </button>
                                {m.focusMode === 'rocket' && (
                                  <button
                                    onClick={() => startRocketMission(m.allowedOrbits[0])}
                                    className="w-full rounded-lg border border-amber-500/50 bg-amber-950/30 hover:bg-amber-500 hover:text-slate-950 text-amber-300 font-semibold py-1.5 text-xs transition-colors"
                                  >
                                    Pilot Rocket Ascent
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="rounded-lg border border-slate-800 bg-[#090E1A] py-2 px-3 text-center text-xs font-mono text-amber-300">
                                Reach Level {m.requiredLevel}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            )}

            {/* HUB TAB 2: PROJECT AEGIS STORY CAMPAIGN */}
            {hubTab === 'story' && (
              <section className="rounded-xl border border-violet-500/40 bg-[#0D1526] p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-mono uppercase text-violet-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5" />
                      <span className="font-space tracking-wider text-violet-200">PROJECT AEGIS</span> · 5-Chapter Story ({Math.min(save.storyStep, 5)} / 5 Cleared)
                    </div>
                    <h2 className="text-xl font-bold text-white mt-0.5">
                      {save.storyStep >= STORY_CHAPTERS.length
                        ? 'Campaign Complete: Guardians of Pale Blue Dot'
                        : `Chapter ${currentStoryChapter.chapterNum}: ${currentStoryChapter.title}`}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => openPrologue(null)}
                      className="rounded-lg border border-cyan-500/50 bg-cyan-950/35 hover:bg-cyan-900/45 text-cyan-200 font-semibold px-3.5 py-2.5 text-xs transition-colors flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Replay Prologue
                    </button>
                    {save.storyStep >= STORY_CHAPTERS.length && (
                      <button
                        onClick={() => {
                          unlockAudio();
                          soundEngine.playSfx('snap');
                          setShowCampaignFinale(true);
                        }}
                        className="rounded-lg border border-emerald-500/60 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 font-semibold px-4 py-2.5 text-xs transition-colors flex items-center gap-1.5"
                      >
                        <Award className="w-4 h-4" />
                        Watch Campaign Ending
                      </button>
                    )}
                    <button
                      onClick={() => launchStoryChapter(currentStoryChapter)}
                      className="rounded-lg bg-violet-500 hover:bg-violet-400 text-slate-950 font-semibold px-5 py-2.5 text-xs transition-colors flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      {save.storyStep >= STORY_CHAPTERS.length
                        ? 'Replay Final Chapter'
                        : `Play Chapter ${currentStoryChapter.chapterNum}`}
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
                  {currentStoryChapter.synopsis}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {STORY_CHAPTERS.map((ch) => {
                    const cleared = save.storyStep >= ch.chapterNum;
                    const unlocked = save.storyStep + 1 >= ch.chapterNum;
                    const isCurrent = save.storyStep + 1 === ch.chapterNum;
                    return (
                      <button
                        key={ch.id}
                        disabled={!unlocked}
                        onClick={() => launchStoryChapter(ch)}
                        className={`rounded-lg border p-3.5 text-left transition-colors flex flex-col justify-between gap-2 ${
                          isCurrent
                            ? 'border-violet-400 bg-violet-950/45'
                            : cleared
                              ? 'border-emerald-700/60 bg-emerald-950/20 hover:border-emerald-500'
                              : 'border-slate-800 bg-[#0A101D] opacity-55 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono">
                          <span className={isCurrent ? 'text-violet-300' : cleared ? 'text-emerald-400' : 'text-slate-500'}>
                            CH.{ch.chapterNum} · {ch.mode === 'rocket' ? 'ROCKET' : 'SAT'}
                          </span>
                          {cleared ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : !unlocked ? (
                            <Lock className="w-3.5 h-3.5 text-slate-500" />
                          ) : (
                            <span className="text-violet-300">NEXT</span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-white leading-snug">{ch.title}</div>
                        <div className="text-[10px] font-mono text-amber-300">+{ch.bonusCredits} CR</div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* HUB TAB 3: R&D TECH LAB + FLIGHT HISTORY */}
            {hubTab === 'lab' && (
              <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                <div className="xl:col-span-8 rounded-xl border border-slate-800 bg-[#0D1526] p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Wrench className="w-4 h-4 text-emerald-400" />
                        Aerospace R&amp;D Hardware Lab
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Spend Credits earned from missions &amp; quizzes on permanent hardware upgrades for your Rockets and Satellites.
                      </p>
                    </div>
                    <span className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 font-mono text-xs tabular-nums text-amber-300 font-bold">
                      Available: {save.credits} CR
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {TECH_UPGRADES.map((u) => {
                      const lvl = save.upgrades[u.id] || 0;
                      const maxed = lvl >= u.maxLevel;
                      const cost = u.baseCost * (lvl + 1);
                      const curPct = lvl * u.bonusPerLevelPct;
                      const nextPct = Math.min(u.maxLevel, lvl + 1) * u.bonusPerLevelPct;
                      return (
                        <div
                          key={u.id}
                          className="rounded-xl border border-slate-800 bg-[#111A2E] overflow-hidden flex flex-col justify-between"
                        >
                          <div>
                            {/* Hardware Studio Photograph with Safe Fallback */}
                            <div className="relative h-36 w-full bg-gradient-to-br from-[#091224] via-[#0F1B33] to-[#080E1A] overflow-hidden border-b border-slate-800">
                              <img
                                src={u.imagePath}
                                alt={u.name}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                                className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                              />
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#080D18] via-[#080D18]/75 to-transparent px-3.5 py-2 flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-300 font-semibold">
                                  Helps: {u.appliesTo}
                                </span>
                                <span className="font-mono text-xs font-bold tabular-nums text-white bg-[#0A101D]/90 border border-slate-700 px-2 py-0.5 rounded">
                                  Lv {lvl} / {u.maxLevel}
                                </span>
                              </div>
                            </div>

                            <div className="p-3.5 space-y-2.5">
                              <div>
                                <h3 className="text-sm font-bold text-white">{u.name}</h3>
                                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                                  {u.description}
                                </p>
                              </div>

                              {/* Level Pips */}
                              <div className="grid grid-cols-4 gap-1.5">
                                {Array.from({ length: u.maxLevel }).map((_, i) => (
                                  <div
                                    key={i}
                                    className={`h-1.5 rounded ${
                                      i < lvl ? 'bg-emerald-400' : 'bg-slate-800'
                                    }`}
                                  />
                                ))}
                              </div>

                              {/* Before -> After Stat Readout */}
                              <div className="rounded-lg border border-slate-800 bg-[#0A101D] px-3 py-2 flex items-center justify-between text-xs font-mono tabular-nums">
                                <span className="text-slate-400">{u.bonusUnitLabel}</span>
                                <span className="font-bold text-emerald-300">
                                  {maxed
                                    ? `${u.bonusSign}${curPct}% (MAX)`
                                    : `${u.bonusSign}${curPct}% → ${u.bonusSign}${nextPct}%`}
                                </span>
                              </div>

                              <p className="text-[11px] text-cyan-200/90 leading-snug">
                                <strong className="text-cyan-400">Why it helps: </strong>
                                {u.whyUseful}
                              </p>
                            </div>
                          </div>

                          <div className="px-3.5 pb-3.5">
                            <button
                              disabled={maxed || save.credits < cost}
                              onClick={() => handleBuyUpgrade(u)}
                              className={`w-full rounded-lg py-2 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border ${
                                maxed
                                  ? 'border-emerald-700/60 bg-emerald-950/30 text-emerald-300'
                                  : save.credits >= cost
                                    ? 'border-cyan-400 bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                                    : 'border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              {maxed
                                ? 'MAXED HARDWARE'
                                : save.credits >= cost
                                  ? `Install Lv.${lvl + 1} (${cost} CR)`
                                  : `Need ${cost} CR (${cost - save.credits} more)`}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Sensor Durability & Maintenance Bay + Flight Log */}
                <div className="xl:col-span-4 space-y-5">
                  <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <Satellite className="w-4 h-4 text-amber-400" />
                          Sensor Maintenance Bay
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Sensors wear down over orbital passes and debris strikes. Service worn optics to restore 100% science yield.
                        </p>
                      </div>
                      {anySensorNeedsService.length > 0 && (
                        <button
                          disabled={save.credits < bulkMaintenanceCost}
                          onClick={handleMaintainAllSensors}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-colors ${
                            save.credits >= bulkMaintenanceCost
                              ? 'border-amber-400 bg-amber-500 hover:bg-amber-400 text-slate-950'
                              : 'border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          Maintain All ({bulkMaintenanceCost} CR)
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {INSTRUMENTS.map((inst) => {
                        const health = getSensorDurability(save.sensorDurability, inst.id);
                        const cost = getMaintenanceCost(health);
                        const yieldPct = Math.round(getDurabilityScienceMultiplier(health) * 100);
                        const statusColor =
                          health >= 80
                            ? 'text-emerald-400'
                            : health >= 55
                              ? 'text-amber-400'
                              : 'text-rose-400';
                        const barColor =
                          health >= 80
                            ? 'bg-emerald-400'
                            : health >= 55
                              ? 'bg-amber-400'
                              : 'bg-rose-500';
                        return (
                          <div
                            key={inst.id}
                            className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-semibold text-white">{inst.name}</div>
                                <div className="text-[10px] font-mono text-slate-400">
                                  {inst.sensorBand} · Yield {yieldPct}%
                                </div>
                              </div>
                              <span className={`font-mono text-xs font-bold tabular-nums ${statusColor}`}>
                                {health}%
                              </span>
                            </div>

                            <div className="h-1.5 w-full rounded bg-slate-900 overflow-hidden">
                              <div
                                className={`h-full transition-all ${barColor}`}
                                style={{ width: `${clamp(health, 0, 100)}%` }}
                              />
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                              <span className="text-[10px] font-mono text-slate-400">
                                {health === 100
                                  ? 'Calibrated · Flight Ready'
                                  : health >= 80
                                    ? 'Minor wear'
                                    : health >= 55
                                      ? 'Optical drift — service advised'
                                      : 'Debris damage — maintenance urgent'}
                              </span>
                              <div className="flex items-center gap-1.5">
                                {health < 75 && save.credits < cost && (
                                  <button
                                    onClick={() => handleMaintainSensor(inst.id, 'free-tune')}
                                    className="rounded border border-cyan-500/60 bg-cyan-950/50 hover:bg-cyan-500 hover:text-slate-950 px-2 py-1 text-[10px] font-mono font-semibold text-cyan-200 transition-colors"
                                  >
                                    Field Tune (0 CR)
                                  </button>
                                )}
                                <button
                                  disabled={health >= 100 || save.credits < cost}
                                  onClick={() => handleMaintainSensor(inst.id, 'full')}
                                  className={`rounded px-2.5 py-1 text-[11px] font-mono font-semibold border transition-colors ${
                                    health >= 100
                                      ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300'
                                      : save.credits >= cost
                                        ? 'border-amber-400 bg-amber-500 hover:bg-amber-400 text-slate-950'
                                        : 'border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed'
                                  }`}
                                >
                                  {health >= 100 ? '100% Optimal' : `Maintain (${cost} CR)`}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#0D1526] p-5 space-y-4">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <History className="w-4 h-4 text-cyan-400" />
                      Flight Operations Log
                    </h2>
                    {save.history.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-6 text-center text-xs text-slate-400">
                      No flights logged yet. Launch a rocket or deploy a satellite to record telemetry history.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {save.history.map((h) => (
                        <div
                          key={h.id}
                          className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-white">{h.missionName}</div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {h.mode.toUpperCase()} · Score {h.score} · ${h.costM}M
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <div className="text-amber-400">
                              {'★'.repeat(h.stars)}
                              {'☆'.repeat(3 - h.stars)}
                            </div>
                            <div
                              className={`text-[10px] uppercase ${
                                h.outcome === 'success'
                                  ? 'text-emerald-400'
                                  : h.outcome === 'partial'
                                    ? 'text-amber-400'
                                    : 'text-rose-400'
                              }`}
                            >
                              {h.outcome}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </div>
              </section>
            )}
          </main>
        </div>
      )}

      {/* SCREEN 3: ROCKET LAUNCH MODE */}
      {screen === 'rocket' && (
        <RocketLaunchGame
          save={save}
          initialDestination={rocketDest}
          initialPayloadMassT={customRocketPayload?.massT}
          customPayloadName={customRocketPayload?.name}
          activeChapter={activeChapter}
          sandboxMode={playMode === 'sandbox'}
          playMode={playMode}
          difficulty={difficulty}
          playerOrTeamName={
            mp.room
              ? playerCallsign
              : playMode === 'coop'
                ? teamMembers.map((m) => m.name).slice(0, 2).join(' & ')
                : levelInfo.title
          }
          onRecordLeaderboard={handleRecordLeaderboard}
          onRecordResult={(entry, credits, stars) => handleRecordResult(entry, credits, stars)}
          onGrantCredits={handleGrantCredits}
          onGrantXp={handleGrantXp}
          onPayloadDelivered={
            customRocketPayload
              ? () => {
                  setCustomRocketPayload(null);
                  setStartInOrbitSignal((n) => n + 1);
                  setScreen('satellite');
                }
              : undefined
          }
          onCompleteStoryChapter={handleCompleteStoryChapter}
          onBackToHub={() => {
            setCustomRocketPayload(null);
            setPendingSatConfig(null);
            setActiveChapter(null);
            setScreen('hub');
          }}
          onOpenAcademy={() => setShowAcademy(true)}
        />
      )}

      {/* SCREEN 4: SATELLITE DESIGNER & EARTH SENSOR MODE */}
      {screen === 'satellite' && (
        <SatelliteDesignerMode
          mission={selectedMission}
          save={save}
          difficulty={difficulty}
          playMode={playMode}
          sandboxMode={playMode === 'sandbox'}
          room={mp.room}
          localClientId={mp.clientId}
          connectionStatus={mp.status}
          onSyncRoomConfig={mp.syncConfig}
          onClaimRoomRole={(roleId) => mp.claimRole(roleId)}
          onPickRoomNegotiation={mp.pickNegotiation}
          onUpdateRoomTeam={mp.updateCompetitiveTeam}
          onSendRoomChat={mp.sendChat}
          teamMembers={teamMembers}
          competitiveTeams={mp.room ? mp.room.competitiveTeams : competitiveTeams}
          activeCompetitiveIdx={
            mp.room
              ? (mp.room.players.find((p) => p.clientId === mp.clientId)?.teamIndex ?? 0)
              : activeCompetitiveIdx
          }
          onSelectCompetitiveTeam={handleSelectCompetitiveTeam}
          onRecordCompetitiveRun={handleRecordCompetitiveRun}
          onSaveDesign={handleSaveDesign}
          onRecordLeaderboard={handleRecordLeaderboard}
          liveHotspots={liveHotspots}
          isLiveNasa={isLiveNasa}
          nasaFeedLabel={nasaFeedLabel}
          onRefreshLiveNasa={refreshLiveNasa}
          startInOrbitSignal={startInOrbitSignal}
          initialConfig={pendingSatConfig}
          activeChapter={activeChapter}
          onRecordResult={handleRecordResult}
          onGrantCredits={handleGrantCredits}
          onGrantXp={handleGrantXp}
          onUpdateSensorDurability={handleUpdateSensorDurability}
          onOpenMaintenanceLab={() => {
            setStartInOrbitSignal(0);
            setPendingSatConfig(null);
            setCustomRocketPayload(null);
            setActiveChapter(null);
            setHubTab('lab');
            setScreen('hub');
          }}
          onLaunchCustomRocket={(orbit, massT, name, cfg) => {
            setPendingSatConfig(cfg);
            setCustomRocketPayload({ massT, name });
            setRocketDest(orbit);
            setScreen('rocket');
          }}
          onCompleteStoryChapter={handleCompleteStoryChapter}
          onBackToHub={() => {
            if (mp.room && mp.room.hostId === mp.clientId && mp.room.launched) {
              mp.updateSettings({ launched: false });
            }
            setStartInOrbitSignal(0);
            setPendingSatConfig(null);
            setCustomRocketPayload(null);
            setActiveChapter(null);
            setScreen('hub');
          }}
          onOpenAcademy={() => setShowAcademy(true)}
        />
      )}

      {/* STORY DIALOGUE TRANSMISSION MODAL */}
      {storyModal && (
        <StoryDialogueModal
          chapter={storyModal.chapter}
          variant={storyModal.variant}
          onFinish={() => {
            if (storyModal.variant === 'intro') {
              handleStartChapterFromIntro(storyModal.chapter);
            } else {
              const finishedCh5 = storyModal.chapter.chapterNum === STORY_CHAPTERS.length;
              setStoryModal(null);
              if (finishedCh5) {
                setShowCampaignFinale(true);
              }
            }
          }}
          onClose={() => setStoryModal(null)}
        />
      )}

      {/* GRAND STORY CAMPAIGN FINALE ENDING */}
      {showCampaignFinale && (
        <MissionEndingModal
          mode="campaign"
          title="PROJECT AEGIS · Guardians of the Pale Blue Dot"
          subtitle="Grand Campaign Finale · Chapters 1–5 Complete"
          destinationId="MARS"
          outcome="success"
          score={100}
          stars={3}
          creditsEarned={140}
          highlightLine={`Earned ${totalStars} Campaign Stars · Protected Earth & Opened Mars Bridge`}
          realWorldImpact="Your fleet of satellites watches wildfires, cyclones, ice sheets, and solar storms in real time while your interplanetary rocket carries humanity's science relay to Mars!"
          beats={[
            {
              speaker: 'Director Elena Vance',
              role: 'NASA Mission Operations Lead',
              line: 'From Borneo peatland smoke to L1 solar flares and the Mars Horizon transfer—Project Aegis is fully operational thanks to you, Mission Architect!',
            },
            {
              speaker: 'Dr. Arya Pratama',
              role: 'Lead Earth Observation Scientist',
              line: 'Emergency teams, oceanographers, and climate scientists around the globe now share one unified Earth-observing shield.',
            },
            {
              speaker: 'NOVA',
              role: 'Onboard Flight Guidance System',
              line: 'Every rocket hangar, orbital destination, and live NASA EONET Earth scan remains unlocked for sandbox records and R&D mastery!',
            },
          ]}
          onContinue={() => setShowCampaignFinale(false)}
        />
      )}

      {/* SPACE ACADEMY EDUCATIONAL MODAL */}
      {showAcademy && <AcademyModal onClose={() => setShowAcademy(false)} />}

      {/* BEGINNING INTERACTIVE TUTORIAL MODAL */}
      {showWelcome && (
        <WelcomeTutorialModal
          onGoToModeSelect={() => {
            setDismissedWelcome(true);
            setShowWelcome(false);
            setHubTab('play');
            setScreen('hub');
          }}
          onStartRocketMode={() => {
            setDismissedWelcome(true);
            setShowWelcome(false);
            startRocketMission('LUNAR');
          }}
          onStartSatelliteMode={() => {
            setDismissedWelcome(true);
            setShowWelcome(false);
            startSatelliteMission(MISSIONS[0]);
          }}
          onClose={() => {
            setDismissedWelcome(true);
            setShowWelcome(false);
            setHubTab('play');
            setScreen('hub');
          }}
        />
      )}

      {/* OPENING PROLOGUE CUTSCENE MODAL (Mandatory on fresh start, skip allowed on replay) */}
      {showPrologue && (
        <PrologueCutsceneModal
          mandatory={mandatoryPrologue}
          onComplete={() => {
            const nextSave = { ...save, prologueSeen: true };
            persistSave(nextSave);
            setShowPrologue(false);
            setMandatoryPrologue(false);
            if (prologueFollowUp === 'story') {
              setStoryModal({ chapter: STORY_CHAPTERS[0], variant: 'intro' });
            } else if (prologueFollowUp === 'hub') {
              setHubTab('play');
              setScreen('hub');
            }
            setPrologueFollowUp(null);
          }}
          onSkip={() => {
            const nextSave = { ...save, prologueSeen: true };
            persistSave(nextSave);
            setShowPrologue(false);
            setMandatoryPrologue(false);
            if (prologueFollowUp === 'story') {
              setStoryModal({ chapter: STORY_CHAPTERS[0], variant: 'intro' });
            } else if (prologueFollowUp === 'hub') {
              setHubTab('play');
              setScreen('hub');
            }
            setPrologueFollowUp(null);
          }}
        />
      )}

      {/* HUB COMPARE, SHARE CODE & LEADERBOARD MODAL */}
      {hubCompareModal && (
        <DesignCompareModal
          initialTab={hubCompareModal}
          difficulty={difficulty}
          playMode={playMode}
          sandboxMode={playMode === 'sandbox'}
          save={save}
          competitiveTeams={mp.room ? mp.room.competitiveTeams : competitiveTeams}
          onSaveDesign={handleSaveDesign}
          onLoadConfig={(cfg, mId) => {
            const targetMission = MISSIONS.find((x) => x.id === mId) || selectedMission;
            setHubCompareModal(null);
            startSatelliteMission(targetMission, null, cfg);
          }}
          onClose={() => setHubCompareModal(null)}
        />
      )}
    </div>
  );
}
