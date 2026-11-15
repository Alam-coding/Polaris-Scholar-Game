import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  GitCompare,
  Save,
  Trophy,
  Upload,
  X,
} from 'lucide-react';
import {
  DIFFICULTY_PROFILES,
  MISSIONS,
  OBJECTIVE_FOCUSES,
} from '../data/missionData';
import { soundEngine } from '../engine/audio';
import {
  calculateSatelliteMetrics,
  decodeDesignShareCode,
  encodeDesignShareCode,
  round1,
} from '../engine/physics';
import {
  CampaignSave,
  CompetitiveTeamRun,
  DifficultyLevel,
  LeaderboardEntry,
  MissionDef,
  PlayMode,
  SatelliteConfig,
  SavedMissionDesign,
} from '../types/mission';

interface DesignCompareModalProps {
  initialTab?: 'save' | 'compare' | 'leaderboard';
  mission?: MissionDef;
  currentConfig?: SatelliteConfig;
  currentTeamName?: string;
  difficulty: DifficultyLevel;
  playMode: PlayMode;
  sandboxMode?: boolean;
  save: CampaignSave;
  competitiveTeams?: CompetitiveTeamRun[];
  onSaveDesign?: (design: SavedMissionDesign) => void;
  onLoadConfig?: (config: SatelliteConfig, missionId?: string) => void;
  onClose: () => void;
}

interface ComparableDesignItem {
  id: string;
  label: string;
  authorTeam: string;
  missionId: string;
  config: SatelliteConfig;
  score?: number;
}

export function DesignCompareModal({
  initialTab = 'save',
  mission,
  currentConfig,
  currentTeamName = 'Architect Team',
  difficulty,
  playMode,
  sandboxMode = false,
  save,
  competitiveTeams = [],
  onSaveDesign,
  onLoadConfig,
  onClose,
}: DesignCompareModalProps) {
  const [tab, setTab] = useState<'save' | 'compare' | 'leaderboard'>(initialTab);
  const [designLabel, setDesignLabel] = useState(
    mission ? `${mission.id.toUpperCase()} Custom Build` : 'Saved Spacecraft',
  );
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importedDesign, setImportedDesign] = useState<ComparableDesignItem | null>(null);

  const [slotAId, setSlotAId] = useState<string>(currentConfig ? 'current' : save.savedDesigns[0]?.id || '');
  const [slotBId, setSlotBId] = useState<string>(
    save.savedDesigns[0]?.id || (competitiveTeams.length > 1 ? 'comp-1' : 'current'),
  );
  const [boardFilter, setBoardFilter] = useState<'all' | 'mission'>('all');

  const activeMission = mission || MISSIONS[1];

  const comparableItems = useMemo<ComparableDesignItem[]>(() => {
    const list: ComparableDesignItem[] = [];
    if (currentConfig) {
      list.push({
        id: 'current',
        label: `Current Studio Build (${currentTeamName})`,
        authorTeam: currentTeamName,
        missionId: activeMission.id,
        config: currentConfig,
      });
    }
    competitiveTeams.forEach((t, idx) => {
      list.push({
        id: `comp-${idx}`,
        label: `Competitive: ${t.teamName}${t.score !== null ? ` (${t.score} pts)` : ''}`,
        authorTeam: t.teamName,
        missionId: activeMission.id,
        config: t.config,
        score: t.score ?? undefined,
      });
    });
    save.savedDesigns.forEach((d) => {
      list.push({
        id: d.id,
        label: `${d.label} (${d.missionId.toUpperCase()})`,
        authorTeam: d.authorTeam,
        missionId: d.missionId,
        config: d.config,
        score: d.score,
      });
    });
    if (importedDesign) {
      list.push(importedDesign);
    }
    return list;
  }, [currentConfig, currentTeamName, activeMission.id, competitiveTeams, save.savedDesigns, importedDesign]);

  const itemA = comparableItems.find((x) => x.id === slotAId) || comparableItems[0] || null;
  const itemB =
    comparableItems.find((x) => x.id === slotBId) ||
    comparableItems[Math.min(1, comparableItems.length - 1)] ||
    null;

  const metricsA = useMemo(() => {
    if (!itemA) return null;
    const mDef = MISSIONS.find((m) => m.id === itemA.missionId) || activeMission;
    return calculateSatelliteMetrics(mDef, itemA.config, save.upgrades, save.sensorDurability, {
      difficulty,
      sandboxMode,
    });
  }, [itemA, activeMission, save.upgrades, save.sensorDurability, difficulty, sandboxMode]);

  const metricsB = useMemo(() => {
    if (!itemB) return null;
    const mDef = MISSIONS.find((m) => m.id === itemB.missionId) || activeMission;
    return calculateSatelliteMetrics(mDef, itemB.config, save.upgrades, save.sensorDurability, {
      difficulty,
      sandboxMode,
    });
  }, [itemB, activeMission, save.upgrades, save.sensorDurability, difficulty, sandboxMode]);

  const currentShareCode = useMemo(() => {
    if (!currentConfig) return '';
    return encodeDesignShareCode({
      label: designLabel.trim() || `${activeMission.name} Blueprint`,
      missionId: activeMission.id,
      authorTeam: currentTeamName,
      config: currentConfig,
    });
  }, [currentConfig, designLabel, activeMission, currentTeamName]);

  const handleSaveCurrent = () => {
    if (!currentConfig || !onSaveDesign) return;
    const m = calculateSatelliteMetrics(activeMission, currentConfig, save.upgrades, save.sensorDurability, {
      difficulty,
      sandboxMode,
    });
    const entry: SavedMissionDesign = {
      id: `dsn-${Date.now()}`,
      label: designLabel.trim() || `${activeMission.id.toUpperCase()} Blueprint`,
      missionId: activeMission.id,
      authorTeam: currentTeamName,
      difficulty,
      config: { ...currentConfig, instruments: [...currentConfig.instruments], sequence: [...currentConfig.sequence] },
      costM: round1(m.costM),
      wetMassKg: round1(m.wetMassKg),
      dataProdGB: round1(m.dataProdGB),
      downlinkGB: round1(m.downlinkGB),
      createdAt: new Date().toISOString(),
    };
    soundEngine.playSfx('success');
    onSaveDesign(entry);
    setSlotBId(entry.id);
    setSavedNotice(`Saved "${entry.label}" to local blueprints!`);
    window.setTimeout(() => setSavedNotice(null), 2600);
  };

  const handleCopy = (id: string, code: string) => {
    if (!code) return;
    soundEngine.playSfx('snap');
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const handleImportCode = () => {
    const parsed = decodeDesignShareCode(importText);
    if (!parsed) {
      soundEngine.playSfx('warning');
      setImportError('Invalid share code. Paste a full code starting with MA1-...');
      return;
    }
    soundEngine.playSfx('success');
    setImportError(null);
    const imp: ComparableDesignItem = {
      id: `imported-${Date.now()}`,
      label: `Imported: ${parsed.label}`,
      authorTeam: parsed.authorTeam,
      missionId: parsed.missionId,
      config: parsed.config,
    };
    setImportedDesign(imp);
    setSlotBId(imp.id);
  };

  const filteredLeaderboard = useMemo<LeaderboardEntry[]>(() => {
    const entries =
      boardFilter === 'mission' && mission
        ? save.leaderboard.filter((e) => e.missionId === mission.id)
        : save.leaderboard;
    return [...entries].sort((a, b) => b.score - a.score || b.efficiencyScore - a.efficiencyScore);
  }, [save.leaderboard, boardFilter, mission]);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#04070E]/85 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save, Share, Compare & Rankings"
    >
      <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-700 bg-[#0D1526] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 bg-[#0A101D] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-bold text-white">
              Mission Blueprints, Comparison &amp; Rankings
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playSfx('click');
              onClose();
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 hover:border-slate-500 p-1.5 text-slate-300 hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-3 border-b border-slate-800 flex flex-wrap gap-2 bg-[#0A101D]">
          {[
            { id: 'save' as const, label: 'Save & Share Code' },
            { id: 'compare' as const, label: `Compare Designs (${comparableItems.length})` },
            { id: 'leaderboard' as const, label: `Leaderboard (${save.leaderboard.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                soundEngine.playSfx('click');
                setTab(t.id);
              }}
              className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.id
                  ? 'border-cyan-400 text-cyan-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === 'save' && (
            <div className="space-y-5">
              {currentConfig && (
                <div className="rounded-xl border border-slate-800 bg-[#111A2E] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-white">
                        Save Current Spacecraft ({activeMission.name})
                      </h3>
                      <p className="text-xs text-slate-400">
                        Store your blueprint locally or copy its offline share code to exchange with teammates.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-cyan-300">
                      {DIFFICULTY_PROFILES[difficulty].label}
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={designLabel}
                      onChange={(e) => setDesignLabel(e.target.value)}
                      placeholder="Blueprint name..."
                      className="flex-1 rounded-lg border border-slate-700 bg-[#090F1C] px-3 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                    {onSaveDesign && (
                      <button
                        type="button"
                        onClick={handleSaveCurrent}
                        className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-2 text-xs flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save Design
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy('current-code', currentShareCode)}
                      className="rounded-lg border border-slate-600 bg-[#0A101D] hover:border-cyan-400 text-slate-200 font-semibold px-4 py-2 text-xs flex items-center justify-center gap-1.5"
                    >
                      {copiedId === 'current-code' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied Code
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-cyan-400" />
                          Copy Share Code
                        </>
                      )}
                    </button>
                  </div>
                  {savedNotice && (
                    <div className="text-xs font-mono text-emerald-300">{savedNotice}</div>
                  )}
                  <div className="rounded-lg border border-slate-800 bg-[#080D18] p-2.5 text-[10px] font-mono text-slate-400 break-all select-all">
                    {currentShareCode}
                  </div>
                </div>
              )}

              {/* Import Share Code */}
              <div className="rounded-xl border border-slate-800 bg-[#111A2E] p-4 space-y-2.5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-amber-400" />
                  Import &amp; Inspect Share Code
                </h3>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste MA1-... code from a classmate or teammate"
                    className="flex-1 rounded-lg border border-slate-700 bg-[#090F1C] px-3 py-2 text-xs font-mono text-slate-200 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleImportCode}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold px-4 py-2 text-xs"
                  >
                    Decode Blueprint
                  </button>
                </div>
                {importError && <div className="text-xs text-rose-400">{importError}</div>}
                {importedDesign && (
                  <div className="rounded-lg border border-emerald-700/60 bg-emerald-950/25 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-white">{importedDesign.label}</div>
                      <div className="text-[11px] font-mono text-slate-300">
                        Mission: {importedDesign.missionId.toUpperCase()} · Author: {importedDesign.authorTeam} ·{' '}
                        Orbit {importedDesign.config.orbit} · {importedDesign.config.instruments.length} sensors
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playSfx('click');
                          setTab('compare');
                        }}
                        className="rounded border border-cyan-500/60 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500 hover:text-slate-950"
                      >
                        Compare Side-by-Side
                      </button>
                      {onLoadConfig && (
                        <button
                          type="button"
                          onClick={() => {
                            soundEngine.playSfx('snap');
                            onLoadConfig(importedDesign.config, importedDesign.missionId);
                            onClose();
                          }}
                          className="rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 text-xs font-semibold"
                        >
                          Load in Studio
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Saved Blueprints List */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-white">
                  Saved Spacecraft Blueprints ({save.savedDesigns.length})
                </h3>
                {save.savedDesigns.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-5 text-center text-xs text-slate-400">
                    No saved blueprints yet. Build a spacecraft and click Save Design above to store &amp; compare architectures!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {save.savedDesigns.map((d) => {
                      const code = encodeDesignShareCode(d);
                      return (
                        <div
                          key={d.id}
                          className="rounded-lg border border-slate-800 bg-[#111A2E] p-3 flex flex-col justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-white truncate">{d.label}</span>
                              <span className="font-mono text-[11px] text-cyan-300 shrink-0">
                                {d.missionId.toUpperCase()} · {d.config.orbit}
                              </span>
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-1">
                              ${d.costM}M · {d.wetMassKg} kg · {d.dataProdGB}/{d.downlinkGB} GB/d · By {d.authorTeam}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleCopy(d.id, code)}
                              className="rounded border border-slate-700 bg-[#0A101D] hover:border-cyan-400 px-2.5 py-1 text-[11px] text-slate-200 flex items-center gap-1"
                            >
                              {copiedId === d.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  Copied
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Share Code
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                soundEngine.playSfx('click');
                                setSlotBId(d.id);
                                setTab('compare');
                              }}
                              className="rounded border border-slate-700 bg-[#0A101D] hover:border-cyan-400 px-2.5 py-1 text-[11px] text-cyan-200"
                            >
                              Compare
                            </button>
                            {onLoadConfig && (
                              <button
                                type="button"
                                onClick={() => {
                                  soundEngine.playSfx('snap');
                                  onLoadConfig(d.config, d.missionId);
                                  onClose();
                                }}
                                className="ml-auto rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-2.5 py-1 text-[11px] flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" />
                                Load
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'compare' && (
            <div className="space-y-4">
              {comparableItems.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-6 text-center text-xs text-slate-400">
                  Save at least one spacecraft blueprint or open a mission to compare designs side-by-side.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-mono text-cyan-300 mb-1">
                        DESIGN SLOT A
                      </label>
                      <select
                        value={itemA?.id || ''}
                        onChange={(e) => setSlotAId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-[#090F1C] px-3 py-2 text-xs text-white"
                      >
                        {comparableItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-amber-300 mb-1">
                        DESIGN SLOT B
                      </label>
                      <select
                        value={itemB?.id || ''}
                        onChange={(e) => setSlotBId(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-[#090F1C] px-3 py-2 text-xs text-white"
                      >
                        {comparableItems.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {itemA && itemB && metricsA && metricsB && (
                    <div className="rounded-xl border border-slate-800 bg-[#111A2E] overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-[#0A101D] border-b border-slate-800 font-mono text-[11px] text-slate-400">
                          <tr>
                            <th className="text-left px-4 py-2.5">Engineering Dimension</th>
                            <th className="text-left px-4 py-2.5 text-cyan-300">{itemA.label}</th>
                            <th className="text-left px-4 py-2.5 text-amber-300">{itemB.label}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                          {[
                            {
                              k: 'Target Orbit & Launcher',
                              a: `${metricsA.orbit.id} · ${metricsA.lv.name.split(' ')[0]}`,
                              b: `${metricsB.orbit.id} · ${metricsB.lv.name.split(' ')[0]}`,
                            },
                            {
                              k: 'Mission Focus',
                              a:
                                OBJECTIVE_FOCUSES.find((f) => f.id === (itemA.config.objectiveFocus || 'balanced'))
                                  ?.title || 'Balanced',
                              b:
                                OBJECTIVE_FOCUSES.find((f) => f.id === (itemB.config.objectiveFocus || 'balanced'))
                                  ?.title || 'Balanced',
                            },
                            {
                              k: 'Mission Cost vs Budget',
                              a: `$${round1(metricsA.costM)}M / $${metricsA.effectiveBudgetM}M`,
                              b: `$${round1(metricsB.costM)}M / $${metricsB.effectiveBudgetM}M`,
                            },
                            {
                              k: 'Wet Mass vs Rocket Cap',
                              a: `${round1(metricsA.wetMassKg)} / ${round1(metricsA.lvCapacityKg)} kg`,
                              b: `${round1(metricsB.wetMassKg)} / ${round1(metricsB.lvCapacityKg)} kg`,
                            },
                            {
                              k: 'Orbit Avg Power vs Load',
                              a: `${round1(metricsA.orbitAvgGenW)} W vs ${round1(metricsA.totalLoadW)} W`,
                              b: `${round1(metricsB.orbitAvgGenW)} W vs ${round1(metricsB.totalLoadW)} W`,
                            },
                            {
                              k: 'Data Stream vs Downlink',
                              a: `${round1(metricsA.dataProdGB)} vs ${round1(metricsA.downlinkGB)} GB/d (${metricsA.computerOpt.name.split(' ')[0]})`,
                              b: `${round1(metricsB.dataProdGB)} vs ${round1(metricsB.downlinkGB)} GB/d (${metricsB.computerOpt.name.split(' ')[0]})`,
                            },
                            {
                              k: 'ADCS & CoM Balance',
                              a: `${metricsA.adcsOpt.name.split(' ')[0]} · ${metricsA.comOffsetM.toFixed(2)}m`,
                              b: `${metricsB.adcsOpt.name.split(' ')[0]} · ${metricsB.comOffsetM.toFixed(2)}m`,
                            },
                            {
                              k: 'Planned Lifetime & Δv',
                              a: `${metricsA.lifetimeMonths} mo · ${round1(metricsA.dvAvailable)}/${round1(metricsA.dvNeeded)} m/s`,
                              b: `${metricsB.lifetimeMonths} mo · ${round1(metricsB.dvAvailable)}/${round1(metricsB.dvNeeded)} m/s`,
                            },
                            {
                              k: 'Sensors & Readiness',
                              a: `${metricsA.instruments.length} sensors · ${metricsA.status}`,
                              b: `${metricsB.instruments.length} sensors · ${metricsB.status}`,
                            },
                          ].map((row) => (
                            <tr key={row.k} className="hover:bg-[#0D1526]/70">
                              <td className="px-4 py-2 font-sans text-slate-300">{row.k}</td>
                              <td className="px-4 py-2 text-slate-100">{row.a}</td>
                              <td className="px-4 py-2 text-slate-100">{row.b}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {metricsA && metricsB && (
                    <div className="rounded-lg border border-cyan-800/50 bg-cyan-950/25 p-3.5 text-xs text-cyan-100 leading-relaxed">
                      <strong className="text-cyan-300">Tradeoff Insight: </strong>
                      {metricsA.costM < metricsB.costM
                        ? `Slot A saves $${round1(metricsB.costM - metricsA.costM)}M in mission cost `
                        : metricsB.costM < metricsA.costM
                          ? `Slot B saves $${round1(metricsA.costM - metricsB.costM)}M in mission cost `
                          : 'Both builds cost the same '}
                      and{' '}
                      {metricsA.pointingBonusPct > metricsB.pointingBonusPct
                        ? 'Slot A delivers sharper ADCS scan precision.'
                        : metricsB.pointingBonusPct > metricsA.pointingBonusPct
                          ? 'Slot B delivers sharper ADCS scan precision.'
                          : 'both share matching ADCS pointing precision. Multiple valid combinations can succeed!'}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'leaderboard' && (
            <div className="space-y-4">
              {playMode === 'competitive' && competitiveTeams.length > 0 && (
                <div className="rounded-xl border border-amber-500/45 bg-[#111A2E] p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-300 uppercase font-mono">
                    <Trophy className="w-4 h-4" />
                    Current Competitive Match Standings
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {[...competitiveTeams]
                      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                      .map((t, rankIdx) => (
                        <div
                          key={t.teamIndex}
                          className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-mono">
                            <span className="text-amber-300 font-bold">#{rankIdx + 1}</span>
                            <span className="text-emerald-400 font-bold">
                              {t.score !== null ? `${t.score} pts` : 'Pending Run'}
                            </span>
                          </div>
                          <div className="font-semibold text-white truncate">{t.teamName}</div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-400">
                            {t.sciencePts} Sci · ${round1(t.costM)}M · {round1(t.wetMassKg)} kg
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Mission Rankings</h3>
                {mission && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setBoardFilter('all')}
                      className={`rounded border px-2.5 py-1 ${
                        boardFilter === 'all'
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200'
                          : 'border-slate-800 bg-[#111A2E] text-slate-400'
                      }`}
                    >
                      All Missions
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardFilter('mission')}
                      className={`rounded border px-2.5 py-1 ${
                        boardFilter === 'mission'
                          ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200'
                          : 'border-slate-800 bg-[#111A2E] text-slate-400'
                      }`}
                    >
                      {mission.name}
                    </button>
                  </div>
                )}
              </div>

              {filteredLeaderboard.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-[#0A101D] p-6 text-center text-xs text-slate-400">
                  Complete any satellite or team simulation to post your first mission ranking!
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-[#111A2E] overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#0A101D] border-b border-slate-800 font-mono text-[11px] text-slate-400">
                      <tr>
                        <th className="text-left px-3 py-2">Rank</th>
                        <th className="text-left px-3 py-2">Team / Pilot</th>
                        <th className="text-left px-3 py-2">Mission</th>
                        <th className="text-left px-3 py-2">Difficulty</th>
                        <th className="text-right px-3 py-2">Score</th>
                        <th className="text-right px-3 py-2">Science</th>
                        <th className="text-right px-3 py-2">Cost</th>
                        <th className="text-right px-3 py-2">Stars</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                      {filteredLeaderboard.map((e, i) => (
                        <tr key={e.id} className="hover:bg-[#0D1526]/70">
                          <td className="px-3 py-2 text-amber-300 font-bold">#{i + 1}</td>
                          <td className="px-3 py-2 font-sans text-white">
                            {e.playerOrTeam}{' '}
                            <span className="text-[10px] font-mono text-slate-400 uppercase">
                              ({e.playMode})
                            </span>
                          </td>
                          <td className="px-3 py-2 font-sans text-slate-300">{e.missionName}</td>
                          <td className="px-3 py-2 text-cyan-300 uppercase">{e.difficulty}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-400">{e.score}</td>
                          <td className="px-3 py-2 text-right text-slate-200">{e.sciencePts}</td>
                          <td className="px-3 py-2 text-right text-slate-300">${e.costM}M</td>
                          <td className="px-3 py-2 text-right text-amber-400">
                            {'★'.repeat(e.stars)}
                            {'☆'.repeat(3 - e.stars)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
