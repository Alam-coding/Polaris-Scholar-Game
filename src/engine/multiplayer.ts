import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CompetitiveTeamRun,
  DifficultyLevel,
  LeaderboardEntry,
  MultiplayerRoomState,
  SatelliteConfig,
  TeamRoleId,
} from '../types/mission';

export type ConnectionStatus = 'offline' | 'connecting' | 'connected' | 'error';

const CLIENT_ID_STORAGE_KEY = 'mission_architect_client_id_v1';

export function getOrCreateClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const created = `cl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return `cl-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function getRoomCodeFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').trim().toUpperCase();
  } catch {
    return '';
  }
}

export function buildRoomInviteUrl(code: string): string {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    return url.toString();
  } catch {
    return `?room=${encodeURIComponent(code)}`;
  }
}

export async function fetchServerLeaderboard(): Promise<LeaderboardEntry[]> {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') return [];
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: LeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export async function postServerLeaderboard(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') return [];
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { entries?: LeaderboardEntry[] };
    return Array.isArray(data.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

export interface UseMultiplayerRoomResult {
  clientId: string;
  status: ConnectionStatus;
  room: MultiplayerRoomState | null;
  roomError: string | null;
  clearError: () => void;
  createRoom: (opts: {
    playerName: string;
    playMode: 'coop' | 'competitive';
    difficulty: DifficultyLevel;
    missionId: string;
    config: SatelliteConfig;
    teamName?: string;
  }) => void;
  joinRoom: (opts: { roomCode: string; playerName: string; teamName?: string }) => void;
  leaveRoom: () => void;
  updateSettings: (opts: {
    playMode?: 'coop' | 'competitive';
    difficulty?: DifficultyLevel;
    missionId?: string;
    launched?: boolean;
  }) => void;
  claimRole: (roleId: TeamRoleId, targetClientId?: string) => void;
  pickNegotiation: (dilemmaId: string, choiceId: string) => void;
  syncConfig: (opts: {
    config?: SatelliteConfig;
    phase?: MultiplayerRoomState['phase'];
    designStep?: MultiplayerRoomState['designStep'];
  }) => void;
  updateCompetitiveTeam: (
    teamIndex: number,
    patch: Partial<CompetitiveTeamRun>,
  ) => void;
  sendChat: (text: string) => void;
}

export function useMultiplayerRoom(): UseMultiplayerRoomResult {
  const [clientId] = useState<string>(() => getOrCreateClientId());
  const [status, setStatus] = useState<ConnectionStatus>(() =>
    typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'offline' : 'connecting',
  );
  const [room, setRoom] = useState<MultiplayerRoomState | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueueRef = useRef<string[]>([]);
  const lastRoomRef = useRef<{ code: string; playerName: string } | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const closedByUnmountRef = useRef(false);

  const sendRaw = useCallback((payload: Record<string, unknown>) => {
    const encoded = JSON.stringify(payload);
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(encoded);
    } else {
      pendingQueueRef.current.push(encoded);
      if (pendingQueueRef.current.length > 20) {
        pendingQueueRef.current.shift();
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') {
      setStatus('offline');
      return;
    }

    closedByUnmountRef.current = false;
    let attempt = 0;

    const connect = () => {
      if (closedByUnmountRef.current) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      setStatus('connecting');

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        setStatus('offline');
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus('connected');
        setRoomError(null);

        // Re-join room on reconnect before flushing queued actions
        if (lastRoomRef.current) {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomCode: lastRoomRef.current.code,
              clientId,
              playerName: lastRoomRef.current.playerName,
            }),
          );
        }

        while (pendingQueueRef.current.length > 0 && ws.readyState === WebSocket.OPEN) {
          const item = pendingQueueRef.current.shift();
          if (item) ws.send(item);
        }
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(String(evt.data || '{}')) as {
            type?: string;
            room?: MultiplayerRoomState;
            message?: string;
          };
          if (data.type === 'room:state' && data.room) {
            setRoom(data.room);
            setRoomError(null);
            const me = data.room.players.find((p) => p.clientId === clientId);
            lastRoomRef.current = {
              code: data.room.code,
              playerName: me?.name || lastRoomRef.current?.playerName || 'Crew',
            };
          } else if (data.type === 'room:left') {
            lastRoomRef.current = null;
            setRoom(null);
          } else if (data.type === 'room:error' && data.message) {
            setRoomError(data.message);
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setStatus('error');
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedByUnmountRef.current) return;
        setStatus('offline');
        const delayMs = Math.min(8000, 1000 * Math.pow(1.6, attempt));
        attempt += 1;
        reconnectTimerRef.current = window.setTimeout(connect, delayMs);
      };
    };

    connect();

    const heartbeat = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 20000);

    return () => {
      closedByUnmountRef.current = true;
      window.clearInterval(heartbeat);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [clientId]);

  const createRoom = useCallback(
    (opts: {
      playerName: string;
      playMode: 'coop' | 'competitive';
      difficulty: DifficultyLevel;
      missionId: string;
      config: SatelliteConfig;
      teamName?: string;
    }) => {
      setRoomError(null);
      sendRaw({
        type: 'room:create',
        clientId,
        ...opts,
      });
    },
    [clientId, sendRaw],
  );

  const joinRoom = useCallback(
    (opts: { roomCode: string; playerName: string; teamName?: string }) => {
      const code = opts.roomCode.trim().toUpperCase();
      if (!code) {
        setRoomError('Enter a valid 6-character Room Code.');
        return;
      }
      setRoomError(null);
      lastRoomRef.current = { code, playerName: opts.playerName };
      sendRaw({
        type: 'room:join',
        roomCode: code,
        clientId,
        playerName: opts.playerName,
        teamName: opts.teamName,
      });
    },
    [clientId, sendRaw],
  );

  const leaveRoom = useCallback(() => {
    lastRoomRef.current = null;
    pendingQueueRef.current = [];
    setRoom(null);
    sendRaw({ type: 'room:leave' });
  }, [sendRaw]);

  const updateSettings = useCallback(
    (opts: {
      playMode?: 'coop' | 'competitive';
      difficulty?: DifficultyLevel;
      missionId?: string;
      launched?: boolean;
    }) => {
      sendRaw({ type: 'room:updateSettings', ...opts });
    },
    [sendRaw],
  );

  const claimRole = useCallback(
    (roleId: TeamRoleId, targetClientId?: string) => {
      sendRaw({ type: 'coop:claimRole', roleId, targetClientId });
    },
    [sendRaw],
  );

  const pickNegotiation = useCallback(
    (dilemmaId: string, choiceId: string) => {
      sendRaw({ type: 'coop:pickNegotiation', dilemmaId, choiceId });
    },
    [sendRaw],
  );

  const syncConfig = useCallback(
    (opts: {
      config?: SatelliteConfig;
      phase?: MultiplayerRoomState['phase'];
      designStep?: MultiplayerRoomState['designStep'];
    }) => {
      sendRaw({ type: 'coop:syncConfig', ...opts });
    },
    [sendRaw],
  );

  const updateCompetitiveTeam = useCallback(
    (teamIndex: number, patch: Partial<CompetitiveTeamRun>) => {
      sendRaw({ type: 'comp:updateTeam', teamIndex, ...patch });
    },
    [sendRaw],
  );

  const sendChat = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      sendRaw({ type: 'room:chat', text: trimmed });
    },
    [sendRaw],
  );

  return {
    clientId,
    status,
    room,
    roomError,
    clearError: () => setRoomError(null),
    createRoom,
    joinRoom,
    leaveRoom,
    updateSettings,
    claimRole,
    pickNegotiation,
    syncConfig,
    updateCompetitiveTeam,
    sendChat,
  };
}
