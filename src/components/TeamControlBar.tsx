import { useMemo, useState } from 'react';
import { CheckCircle2, GitCompare, MessageSquare, Send, Trophy, Users, Wifi } from 'lucide-react';
import { TEAM_ROLE_DEFS } from '../data/missionData';
import { soundEngine } from '../engine/audio';
import { ConnectionStatus } from '../engine/multiplayer';
import { round1 } from '../engine/physics';
import {
  CompetitiveTeamRun,
  MultiplayerRoomState,
  PlayMode,
  SatelliteMetrics,
  TeamMember,
  TeamRoleId,
} from '../types/mission';

interface TeamControlBarProps {
  playMode: PlayMode;
  designStep: 'sensors' | 'parts' | 'order' | 'orbit';
  metrics: SatelliteMetrics;
  // Optional Live WebSocket Room Context
  room?: MultiplayerRoomState | null;
  localClientId?: string;
  connectionStatus?: ConnectionStatus;
  onClaimRoomRole?: (roleId: TeamRoleId) => void;
  onSendRoomChat?: (text: string) => void;
  // Co-op props (also acts as offline hotseat fallback)
  teamMembers: TeamMember[];
  activeMemberIdx: number;
  onSelectMember: (idx: number) => void;
  negotiationPicks: Record<string, string>;
  onPickNegotiation: (dilemmaId: string, choiceId: string, newScore: number) => void;
  coordinationScore: number;
  // Competitive props
  competitiveTeams: CompetitiveTeamRun[];
  activeCompetitiveIdx: number;
  onSelectCompetitiveTeam: (idx: number) => void;
  onOpenCompare: () => void;
}

interface DilemmaOption {
  id: string;
  label: string;
  effect: string;
  favoredRole: TeamRoleId;
  synergyScore: number;
}

interface NegotiationDilemma {
  id: string;
  title: string;
  conflict: string;
  options: DilemmaOption[];
}

export const TEAM_NEGOTIATION_DILEMMAS: NegotiationDilemma[] = [
  {
    id: 'sci-vs-budget',
    title: 'Science Payload vs. Grant Budget',
    conflict:
      'Science wants maximum spectral instruments; Comms & Budget warns extra sensors spike radio & rocket cost.',
    options: [
      {
        id: 'opt-compress',
        label: 'Required Core Sensors + Edge-AI Compression',
        effect: 'Balanced consensus: shrinks data stream 28% so X-Band works without breaking budget.',
        favoredRole: 'comms',
        synergyScore: 35,
      },
      {
        id: 'opt-full-sci',
        label: 'Extra Secondary Sensors + Ka-Band Upgrade',
        effect: 'Maximizes scan score; team must accept tighter budget margin elsewhere.',
        favoredRole: 'scientist',
        synergyScore: 28,
      },
      {
        id: 'opt-lean',
        label: 'Strict Minimum Sensors + Light Rocket',
        effect: 'High cost-efficiency bonus; fewer multi-band overlap opportunities.',
        favoredRole: 'commander',
        synergyScore: 30,
      },
    ],
  },
  {
    id: 'power-vs-mass',
    title: 'Pointing Precision vs. Bus Mass',
    conflict:
      'Engineer proposes Reaction Wheels + Fluid Thermal Loop; Commander watches rocket payload mass ceiling.',
    options: [
      {
        id: 'opt-wheels',
        label: '3-Axis Reaction Wheels + Mid Solar Arrays',
        effect: '+10% scan precision and wider CoM tolerance for +10 kg mass.',
        favoredRole: 'engineer',
        synergyScore: 35,
      },
      {
        id: 'opt-cmg',
        label: 'Precision CMG + High-Area Solar Wings',
        effect: '+18% scan precision; requires Ion propulsion or Heavy rocket.',
        favoredRole: 'scientist',
        synergyScore: 30,
      },
      {
        id: 'opt-spin',
        label: 'Lightweight Spin Bus + Careful Bay Balance',
        effect: 'Saves 12 kg dead mass; team must balance Left/Right bays manually.',
        favoredRole: 'commander',
        synergyScore: 32,
      },
    ],
  },
  {
    id: 'speed-vs-life',
    title: 'Transfer Speed vs. Mission Lifetime',
    conflict:
      'Commander favors fast 5-day transfer; Science & Comms want a 24–36 month archive window.',
    options: [
      {
        id: 'opt-assist',
        label: 'Low-Energy Assist (-18% Δv) + 24–36 mo Ops',
        effect: 'Unlocks multi-year durability & fuel margin across orbital maneuvers.',
        favoredRole: 'comms',
        synergyScore: 30,
      },
      {
        id: 'opt-direct',
        label: 'Direct 5-Day Transfer + Compact 12 mo Ops',
        effect: 'Fast emergency response; demands strong chemical or Ion Δv budget.',
        favoredRole: 'commander',
        synergyScore: 26,
      },
    ],
  },
];

const STEP_RECOMMENDED_ROLE: Record<'sensors' | 'parts' | 'order' | 'orbit', TeamRoleId> = {
  sensors: 'scientist',
  parts: 'engineer',
  order: 'comms',
  orbit: 'commander',
};

export function computeTeamCoordinationScore(
  members: TeamMember[],
  picks: Record<string, string>,
): number {
  const uniqueRoles = new Set<TeamRoleId>();
  members.forEach((m) => m.roles.forEach((r) => uniqueRoles.add(r)));
  const roleCoveragePts = Math.round((uniqueRoles.size / 4) * 25);

  let dilemmaPts = 0;
  TEAM_NEGOTIATION_DILEMMAS.forEach((d) => {
    const pickedId = picks[d.id];
    const opt = d.options.find((o) => o.id === pickedId);
    dilemmaPts += opt ? Math.round(opt.synergyScore * 0.72) : 14;
  });

  return Math.min(100, Math.max(40, roleCoveragePts + dilemmaPts));
}

export function TeamControlBar({
  playMode,
  designStep,
  metrics,
  room = null,
  localClientId,
  connectionStatus = 'offline',
  onClaimRoomRole,
  onSendRoomChat,
  teamMembers,
  activeMemberIdx,
  onSelectMember,
  negotiationPicks,
  onPickNegotiation,
  coordinationScore,
  competitiveTeams,
  activeCompetitiveIdx,
  onSelectCompetitiveTeam,
  onOpenCompare,
}: TeamControlBarProps) {
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatDraft, setChatDraft] = useState('');

  const recommendedRole = STEP_RECOMMENDED_ROLE[designStep];
  const recommendedRoleDef = TEAM_ROLE_DEFS.find((r) => r.id === recommendedRole);
  const resolvedCount = useMemo(
    () => TEAM_NEGOTIATION_DILEMMAS.filter((d) => Boolean(negotiationPicks[d.id])).length,
    [negotiationPicks],
  );

  if (playMode !== 'coop' && playMode !== 'competitive') return null;

  const isLiveRoom = Boolean(room);
  const localRoomPlayer = room?.players.find((p) => p.clientId === localClientId) || null;
  const displayTeams = room ? room.competitiveTeams : competitiveTeams;

  const handleSubmitChat = () => {
    if (!chatDraft.trim() || !onSendRoomChat) return;
    soundEngine.playSfx('click');
    onSendRoomChat(chatDraft);
    setChatDraft('');
  };

  if (playMode === 'competitive') {
    return (
      <div className="rounded-xl border border-amber-500/45 bg-[#0D1526] px-4 py-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-semibold text-white">
              {isLiveRoom ? `Live Room ${room?.code} · Competitive Match` : 'Competitive Teams Match'}
            </span>
            {isLiveRoom && localRoomPlayer ? (
              <span className="font-mono text-[11px] text-emerald-300 flex items-center gap-1">
                <Wifi className="w-3 h-3" />
                Playing as {displayTeams[localRoomPlayer.teamIndex]?.teamName || `Team ${localRoomPlayer.teamIndex + 1}`} ·{' '}
                {room?.players.filter((p) => p.online).length} online
              </span>
            ) : (
              <span className="text-slate-400 hidden sm:inline">
                · Switch teams locally to build &amp; simulate competing designs
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLiveRoom && onSendRoomChat && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playSfx('click');
                  setShowChat((v) => !v);
                }}
                className="rounded-lg border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-3 py-1 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                Room Chat ({room?.chat.length || 0})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                soundEngine.playSfx('click');
                onOpenCompare();
              }}
              className="rounded-lg border border-cyan-500/60 bg-cyan-950/40 hover:bg-cyan-500 hover:text-slate-950 px-3 py-1 text-xs font-semibold text-cyan-200 transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare Teams
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {displayTeams.map((t, idx) => {
            const isActive = isLiveRoom
              ? localRoomPlayer?.teamIndex === t.teamIndex
              : idx === activeCompetitiveIdx;
            const liveCost = isActive ? round1(metrics.costM) : round1(t.costM);
            const liveMass = isActive ? round1(metrics.wetMassKg) : round1(t.wetMassKg);
            const seatPlayer = room?.players.find((p) => p.teamIndex === t.teamIndex);
            return (
              <button
                key={t.teamIndex}
                type="button"
                disabled={isLiveRoom && !isActive}
                onClick={() => {
                  if (isLiveRoom) return;
                  soundEngine.playSfx('snap');
                  onSelectCompetitiveTeam(idx);
                }}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  isActive
                    ? 'border-amber-400 bg-amber-950/35 text-white'
                    : isLiveRoom
                      ? 'border-slate-800 bg-[#0A101D] text-slate-300 cursor-default'
                      : 'border-slate-800 bg-[#111A2E] hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-semibold">
                  <span className="truncate">
                    {t.teamName}
                    {seatPlayer ? ` (${seatPlayer.name})` : ''}
                  </span>
                  <span
                    className={`font-mono text-[11px] tabular-nums shrink-0 ${
                      t.score !== null
                        ? 'text-emerald-400'
                        : isActive
                          ? 'text-amber-300'
                          : 'text-slate-500'
                    }`}
                  >
                    {t.score !== null ? `${t.score} pts` : isActive ? 'YOUR TEAM' : 'LIVE'}
                  </span>
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                  ${liveCost}M · {liveMass} kg · {t.config.instruments.length} sensors · {t.status}
                </div>
              </button>
            );
          })}
        </div>

        {isLiveRoom && showChat && (
          <RoomChatDrawer
            chat={room?.chat || []}
            draft={chatDraft}
            onDraftChange={setChatDraft}
            onSubmit={handleSubmitChat}
          />
        )}
      </div>
    );
  }

  // Co-op 2-4 Players Mode (Live WebSocket Room or Local Hotseat Fallback)
  const activeMember = teamMembers[activeMemberIdx] || teamMembers[0];

  return (
    <div className="rounded-xl border border-cyan-500/40 bg-[#0D1526] px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Users className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-semibold text-white">
            {isLiveRoom ? `Live Room ${room?.code} · Co-op Console` : 'Team Co-op Console'}
          </span>
          {isLiveRoom && (
            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                connectionStatus === 'connected'
                  ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-300'
                  : 'border-amber-600/60 bg-amber-950/40 text-amber-300'
              }`}
            >
              {connectionStatus === 'connected'
                ? `${room?.players.filter((p) => p.online).length || 1} ONLINE`
                : 'RECONNECTING'}
            </span>
          )}
          <span className="text-slate-400">
            · Step lead: <strong className="text-cyan-300">{recommendedRoleDef?.shortTitle}</strong>
          </span>
          <span className="text-slate-500">·</span>
          <span className="font-mono tabular-nums text-emerald-300">
            Team Coordination {coordinationScore}%
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isLiveRoom && onSendRoomChat && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playSfx('click');
                setShowChat((v) => !v);
              }}
              className="rounded-lg border border-slate-700 bg-[#111A2E] hover:border-cyan-400 px-3 py-1 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
              Chat ({room?.chat.length || 0})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              soundEngine.playSfx('click');
              setShowNegotiation((v) => !v);
            }}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              resolvedCount < TEAM_NEGOTIATION_DILEMMAS.length
                ? 'border-amber-400/70 bg-amber-950/40 hover:bg-amber-500 hover:text-slate-950 text-amber-200'
                : 'border-emerald-600/60 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {showNegotiation
              ? 'Hide Priority Tradeoffs'
              : `Team Priorities (${resolvedCount}/${TEAM_NEGOTIATION_DILEMMAS.length})`}
          </button>
        </div>
      </div>

      {isLiveRoom && room ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {room.players.map((p) => {
              const isMe = p.clientId === localClientId;
              const ownsCurrentStep = p.roles.includes(recommendedRole);
              return (
                <div
                  key={p.clientId}
                  className={`rounded-lg border px-3 py-2 space-y-1.5 ${
                    isMe
                      ? 'border-cyan-400 bg-cyan-950/40 text-white'
                      : 'border-slate-800 bg-[#111A2E] text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-xs font-semibold">
                    <span className="truncate">
                      {p.name}
                      {isMe ? ' (You)' : ''}
                    </span>
                    <span className="font-mono text-[10px] shrink-0 text-slate-400">
                      {p.online ? (ownsCurrentStep ? 'LEAD' : p.isHost ? 'HOST' : 'LIVE') : 'AWAY'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {TEAM_ROLE_DEFS.map((r) => {
                      const activeRole = p.roles.includes(r.id);
                      if (!isMe && !activeRole) return null;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          disabled={!isMe || !onClaimRoomRole}
                          onClick={() => {
                            if (!isMe || !onClaimRoomRole) return;
                            soundEngine.playSfx('click');
                            onClaimRoomRole(r.id);
                          }}
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                            activeRole
                              ? 'border-cyan-400/80 bg-cyan-950/60 text-cyan-200'
                              : 'border-slate-700 bg-[#0A101D] text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {r.shortTitle}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {room.lastUpdatedBy && (
            <div className="text-[11px] font-mono text-slate-400 bg-[#090F1C] rounded-lg border border-slate-800 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
              <span>Last synced update by: <strong className="text-cyan-300">{room.lastUpdatedBy}</strong></span>
              <span>Shared spacecraft &amp; decisions sync live across all connected players</span>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {teamMembers.map((m, idx) => {
              const isActive = idx === activeMemberIdx;
              const ownsCurrentStep = m.roles.includes(recommendedRole);
              const roleSummary = m.roles
                .map((r) => TEAM_ROLE_DEFS.find((d) => d.id === r)?.shortTitle || r)
                .join(' & ');
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playSfx('click');
                    onSelectMember(idx);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-cyan-400 bg-cyan-950/40 text-white'
                      : 'border-slate-800 bg-[#111A2E] hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-xs font-semibold">
                    <span className="truncate">{m.name}</span>
                    {ownsCurrentStep && (
                      <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                        STEP LEAD
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-cyan-300/90 mt-0.5 truncate">
                    {roleSummary}
                  </div>
                </button>
              );
            })}
          </div>

          {activeMember && (
            <div className="text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2 bg-[#090F1C] rounded-lg border border-slate-800 px-3 py-1.5">
              <span>
                Active Seat: <strong className="text-white">{activeMember.name}</strong> · Handles{' '}
                {activeMember.roles
                  .map((r) => TEAM_ROLE_DEFS.find((d) => d.id === r)?.ownsSteps)
                  .filter(Boolean)
                  .join(' / ')}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Local hotseat crew · Join a Room in Hub for live multi-device play
              </span>
            </div>
          )}
        </>
      )}

      {showNegotiation && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-1">
          {TEAM_NEGOTIATION_DILEMMAS.map((d) => {
            const picked = negotiationPicks[d.id];
            return (
              <div
                key={d.id}
                className="rounded-lg border border-slate-800 bg-[#0A101D] p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="text-xs font-semibold text-white">{d.title}</div>
                  {picked && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">{d.conflict}</p>
                <div className="space-y-1.5">
                  {d.options.map((opt) => {
                    const selected = picked === opt.id;
                    const roleName =
                      TEAM_ROLE_DEFS.find((r) => r.id === opt.favoredRole)?.shortTitle || opt.favoredRole;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          soundEngine.playSfx('snap');
                          const nextPicks = { ...negotiationPicks, [d.id]: opt.id };
                          onPickNegotiation(
                            d.id,
                            opt.id,
                            computeTeamCoordinationScore(teamMembers, nextPicks),
                          );
                        }}
                        className={`w-full rounded border p-2 text-left text-[11px] transition-colors ${
                          selected
                            ? 'border-cyan-400 bg-cyan-950/45 text-white'
                            : 'border-slate-800 bg-[#111A2E] text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-semibold">
                          <span>{opt.label}</span>
                          <span className="text-[10px] font-mono text-cyan-300 shrink-0">
                            +{roleName}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          {opt.effect}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isLiveRoom && showChat && (
        <RoomChatDrawer
          chat={room?.chat || []}
          draft={chatDraft}
          onDraftChange={setChatDraft}
          onSubmit={handleSubmitChat}
        />
      )}
    </div>
  );
}

function RoomChatDrawer({
  chat,
  draft,
  onDraftChange,
  onSubmit,
}: {
  chat: MultiplayerRoomState['chat'];
  draft: string;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-[#090F1C] p-3 space-y-2">
      <div className="max-h-32 overflow-y-auto space-y-1 text-xs">
        {chat.length === 0 ? (
          <div className="text-slate-500 text-[11px]">No crew messages yet.</div>
        ) : (
          chat.map((c) => (
            <div key={c.id} className={c.kind === 'system' ? 'text-amber-300/90 font-mono text-[11px]' : 'text-slate-200'}>
              <span className="font-semibold text-cyan-300">{c.senderName}: </span>
              <span>{c.text}</span>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          placeholder="Message teammates..."
          className="flex-1 rounded border border-slate-700 bg-[#111A2E] px-2.5 py-1.5 text-xs text-white"
        />
        <button
          type="button"
          onClick={onSubmit}
          className="rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-1.5 text-xs flex items-center gap-1"
        >
          <Send className="w-3 h-3" />
          Send
        </button>
      </div>
    </div>
  );
}
