import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type RoleId = 'commander' | 'engineer' | 'scientist' | 'comms';

interface ServerPlayer {
  clientId: string;
  name: string;
  roles: RoleId[];
  teamIndex: number;
  isHost: boolean;
  online: boolean;
  lastActiveAt: number;
}

interface ServerChat {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  kind: 'chat' | 'system';
}

interface ServerTeamRun {
  teamIndex: number;
  teamName: string;
  config: Record<string, unknown>;
  score: number | null;
  sciencePts: number;
  costM: number;
  wetMassKg: number;
  status: string;
  outcome?: 'success' | 'partial' | 'fail';
}

interface ServerRoom {
  code: string;
  hostId: string;
  playMode: 'coop' | 'competitive';
  difficulty: 'cadet' | 'engineer' | 'director';
  missionId: string;
  launched: boolean;
  phase: 'briefing' | 'design' | 'resources' | 'operations' | 'report';
  designStep: 'sensors' | 'parts' | 'order' | 'orbit';
  sharedConfig: Record<string, unknown>;
  negotiationPicks: Record<string, string>;
  coordinationScore: number;
  players: ServerPlayer[];
  competitiveTeams: ServerTeamRun[];
  chat: ServerChat[];
  lastUpdatedBy: string | null;
  revision: number;
  updatedAt: number;
}

interface SharedLeaderboardEntry {
  id: string;
  playerOrTeam: string;
  playMode: string;
  difficulty: string;
  missionId: string;
  missionName: string;
  score: number;
  sciencePts: number;
  costM: number;
  efficiencyScore: number;
  stars: number;
  timestamp: string;
}

const PORT = Number(process.env.PORT || 3000);
const ALL_ROLES: RoleId[] = ['commander', 'engineer', 'scientist', 'comms'];
const DEFAULT_TEAM_NAMES = ['Team Apollo', 'Team Artemis', 'Team Voyager', 'Team Orion'];

const DILEMMA_SCORES: Record<string, Record<string, number>> = {
  'sci-vs-budget': { 'opt-compress': 35, 'opt-full-sci': 28, 'opt-lean': 30 },
  'power-vs-mass': { 'opt-wheels': 35, 'opt-cmg': 30, 'opt-spin': 32 },
  'speed-vs-life': { 'opt-assist': 30, 'opt-direct': 26 },
};

function computeRoomCoordinationScore(
  players: ServerPlayer[],
  picks: Record<string, string>,
): number {
  const uniqueRoles = new Set<RoleId>();
  players.forEach((p) => p.roles.forEach((r) => uniqueRoles.add(r)));
  const roleCoveragePts = Math.round((uniqueRoles.size / 4) * 25);
  let dilemmaPts = 0;
  Object.keys(DILEMMA_SCORES).forEach((dId) => {
    const picked = picks[dId];
    const raw = picked ? DILEMMA_SCORES[dId][picked] : undefined;
    dilemmaPts += raw ? Math.round(raw * 0.72) : 14;
  });
  return Math.min(100, Math.max(40, roleCoveragePts + dilemmaPts));
}

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function defaultStarterConfig(missionId: string): Record<string, unknown> {
  if (missionId === 'zero') {
    return {
      power: 'b',
      comms: 'a',
      prop: 'b',
      therm: 'a',
      store: 'b',
      computer: 'a',
      adcs: 'a',
      lifetimeMonths: 12,
      objectiveFocus: 'balanced',
      instruments: [],
      lv: 'b',
      orbit: 'LEO',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['arr', 'fair', 'ant', 'ops', 'burn'],
      policy: 'balanced',
      radiationShield: false,
    };
  }
  if (missionId === 'sun') {
    return {
      power: 'b',
      comms: 'b',
      prop: 'a',
      therm: 'a',
      store: 'b',
      computer: 'b',
      adcs: 'b',
      lifetimeMonths: 24,
      objectiveFocus: 'balanced',
      instruments: ['cor'],
      lv: 'a',
      orbit: 'L1',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['arr', 'fair', 'ant', 'ops', 'burn'],
      policy: 'balanced',
      radiationShield: false,
    };
  }
  if (missionId === 'moon') {
    return {
      power: 'b',
      comms: 'a',
      prop: 'b',
      therm: 'a',
      store: 'a',
      computer: 'b',
      adcs: 'b',
      lifetimeMonths: 24,
      objectiveFocus: 'balanced',
      instruments: ['img'],
      lv: 'b',
      orbit: 'LUNAR',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['arr', 'fair', 'ant', 'ops', 'burn'],
      policy: 'balanced',
      radiationShield: false,
    };
  }
  if (missionId === 'mars') {
    return {
      power: 'b',
      comms: 'a',
      prop: 'c',
      therm: 'a',
      store: 'a',
      computer: 'b',
      adcs: 'b',
      lifetimeMonths: 36,
      objectiveFocus: 'balanced',
      instruments: ['img'],
      lv: 'b',
      orbit: 'MARS',
      transfer: 'a',
      fuelLoadPct: 100,
      reservePct: 10,
      throttlePct: 75,
      sequence: ['fair', 'arr', 'ant', 'burn', 'ops'],
      policy: 'balanced',
      radiationShield: false,
    };
  }
  return {
    power: 'a',
    comms: 'a',
    prop: 'b',
    therm: 'a',
    store: 'a',
    computer: 'a',
    adcs: 'a',
    lifetimeMonths: 24,
    objectiveFocus: 'balanced',
    instruments: ['img', 'lid'],
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

const rooms = new Map<string, ServerRoom>();
const socketMeta = new Map<WebSocket, { roomCode: string | null; clientId: string | null }>();
const sharedLeaderboard: SharedLeaderboardEntry[] = [];

function serializeRoom(room: ServerRoom) {
  return {
    code: room.code,
    hostId: room.hostId,
    playMode: room.playMode,
    difficulty: room.difficulty,
    missionId: room.missionId,
    launched: room.launched,
    phase: room.phase,
    designStep: room.designStep,
    sharedConfig: room.sharedConfig,
    negotiationPicks: room.negotiationPicks,
    coordinationScore: room.coordinationScore,
    players: room.players,
    competitiveTeams: room.competitiveTeams,
    chat: room.chat.slice(-40),
    lastUpdatedBy: room.lastUpdatedBy,
    revision: room.revision,
  };
}

function sendJson(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: ServerRoom) {
  const payload = JSON.stringify({ type: 'room:state', room: serializeRoom(room) });
  for (const [sock, meta] of socketMeta.entries()) {
    if (meta.roomCode === room.code && sock.readyState === WebSocket.OPEN) {
      sock.send(payload);
    }
  }
}

function appendSystemChat(room: ServerRoom, text: string) {
  room.chat.push({
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderId: 'system',
    senderName: 'Mission Control',
    text,
    timestamp: new Date().toISOString(),
    kind: 'system',
  });
  if (room.chat.length > 50) room.chat.splice(0, room.chat.length - 50);
}

function removeClientFromRoom(ws: WebSocket, notify = true) {
  const meta = socketMeta.get(ws);
  if (!meta || !meta.roomCode || !meta.clientId) return;
  const room = rooms.get(meta.roomCode);
  const clientId = meta.clientId;
  meta.roomCode = null;
  if (!room) return;

  const target = room.players.find((p) => p.clientId === clientId);
  if (target) {
    target.online = false;
    target.lastActiveAt = Date.now();
    // Keep player slot reserved briefly for reconnects, reassign host if another online player exists
    const onlinePlayers = room.players.filter((p) => p.online);
    if (room.hostId === clientId && onlinePlayers.length > 0) {
      onlinePlayers[0].isHost = true;
      target.isHost = false;
      room.hostId = onlinePlayers[0].clientId;
      appendSystemChat(room, `${onlinePlayers[0].name} assumed Mission Host command.`);
    }
    if (notify) {
      room.revision += 1;
      room.updatedAt = Date.now();
      broadcastRoom(room);
    }
  }
}

// Prune completely empty / inactive rooms after 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    const anyOnline = room.players.some((p) => p.online);
    if (!anyOnline && now - room.updatedAt > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      rooms: rooms.size,
      leaderboardCount: sharedLeaderboard.length,
    });
  });

  app.get('/api/leaderboard', (_req, res) => {
    res.json({ entries: sharedLeaderboard });
  });

  app.post('/api/leaderboard', (req, res) => {
    const entry = req.body as Partial<SharedLeaderboardEntry>;
    if (!entry || typeof entry.score !== 'number' || typeof entry.missionId !== 'string') {
      res.status(400).json({ error: 'Invalid leaderboard payload' });
      return;
    }
    const clean: SharedLeaderboardEntry = {
      id: typeof entry.id === 'string' ? entry.id : `lb-${Date.now()}`,
      playerOrTeam: typeof entry.playerOrTeam === 'string' ? entry.playerOrTeam.slice(0, 48) : 'Architect',
      playMode: typeof entry.playMode === 'string' ? entry.playMode : 'solo',
      difficulty: typeof entry.difficulty === 'string' ? entry.difficulty : 'engineer',
      missionId: entry.missionId,
      missionName: typeof entry.missionName === 'string' ? entry.missionName : entry.missionId,
      score: Math.round(entry.score),
      sciencePts: Math.round(Number(entry.sciencePts || 0)),
      costM: Math.round(Number(entry.costM || 0) * 10) / 10,
      efficiencyScore: Math.round(Number(entry.efficiencyScore || 0)),
      stars: Math.round(Number(entry.stars || 0)),
      timestamp: typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString(),
    };
    const idx = sharedLeaderboard.findIndex((x) => x.id === clean.id);
    if (idx >= 0) sharedLeaderboard[idx] = clean;
    else sharedLeaderboard.unshift(clean);
    sharedLeaderboard.sort((a, b) => b.score - a.score || b.efficiencyScore - a.efficiencyScore);
    if (sharedLeaderboard.length > 50) sharedLeaderboard.length = 50;
    res.json({ ok: true, entries: sharedLeaderboard });
  });

  app.get('/api/rooms/:code', (req, res) => {
    const code = String(req.params.code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json({ room: serializeRoom(room) });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    socketMeta.set(ws, { roomCode: null, clientId: null });

    ws.on('message', (raw: Buffer | string) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = String(msg.type || '');
      const meta = socketMeta.get(ws) || { roomCode: null, clientId: null };

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', ts: Date.now() });
        return;
      }

      if (type === 'room:create') {
        removeClientFromRoom(ws, true);
        let code = makeRoomCode();
        while (rooms.has(code)) code = makeRoomCode();

        const clientId = String(msg.clientId || `cl-${Date.now()}`);
        const playerName = String(msg.playerName || 'Commander 1').trim().slice(0, 28) || 'Commander 1';
        const playMode = msg.playMode === 'competitive' ? 'competitive' : 'coop';
        const difficulty =
          msg.difficulty === 'cadet' || msg.difficulty === 'director' ? msg.difficulty : 'engineer';
        const missionId = String(msg.missionId || 'earth');
        const initialConfig =
          msg.config && typeof msg.config === 'object'
            ? (msg.config as Record<string, unknown>)
            : defaultStarterConfig(missionId);
        const hostTeamName = String(msg.teamName || DEFAULT_TEAM_NAMES[0]).trim().slice(0, 28) || DEFAULT_TEAM_NAMES[0];

        const hostPlayer: ServerPlayer = {
          clientId,
          name: playerName,
          roles: ['commander', 'engineer'],
          teamIndex: 0,
          isHost: true,
          online: true,
          lastActiveAt: Date.now(),
        };

        const competitiveTeams: ServerTeamRun[] = [
          {
            teamIndex: 0,
            teamName: hostTeamName,
            config: { ...initialConfig },
            score: null,
            sciencePts: 0,
            costM: 0,
            wetMassKg: 0,
            status: 'DRAFT',
          },
          {
            teamIndex: 1,
            teamName: DEFAULT_TEAM_NAMES[1],
            config: defaultStarterConfig(missionId),
            score: null,
            sciencePts: 0,
            costM: 0,
            wetMassKg: 0,
            status: 'DRAFT',
          },
        ];

        const room: ServerRoom = {
          code,
          hostId: clientId,
          playMode,
          difficulty,
          missionId,
          launched: false,
          phase: 'briefing',
          designStep: 'sensors',
          sharedConfig: { ...initialConfig },
          negotiationPicks: {},
          coordinationScore: computeRoomCoordinationScore([hostPlayer], {}),
          players: [hostPlayer],
          competitiveTeams,
          chat: [],
          lastUpdatedBy: playerName,
          revision: 1,
          updatedAt: Date.now(),
        };
        appendSystemChat(room, `${playerName} created Room ${code} (${playMode === 'coop' ? 'Team Co-op' : 'Competitive Match'}).`);
        rooms.set(code, room);
        socketMeta.set(ws, { roomCode: code, clientId });
        broadcastRoom(room);
        return;
      }

      if (type === 'room:join') {
        const code = String(msg.roomCode || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) {
          sendJson(ws, { type: 'room:error', message: `Room "${code}" not found or expired.` });
          return;
        }
        const clientId = String(msg.clientId || `cl-${Date.now()}`);
        const playerName = String(msg.playerName || 'Engineer').trim().slice(0, 28) || 'Engineer';

        if (meta.roomCode && meta.roomCode !== code) {
          removeClientFromRoom(ws, true);
        }

        const existing = room.players.find((p) => p.clientId === clientId);
        if (existing) {
          existing.name = playerName;
          existing.online = true;
          existing.lastActiveAt = Date.now();
          if (room.players.every((p) => !p.isHost || !p.online)) {
            room.players.forEach((p) => {
              p.isHost = p.clientId === existing.clientId;
            });
            room.hostId = existing.clientId;
          }
        } else {
          const activeCount = room.players.filter((p) => p.online).length;
          if (activeCount >= 4 && room.players.length >= 4) {
            sendJson(ws, { type: 'room:error', message: `Room ${code} is full (max 4 players).` });
            return;
          }
          const idx = room.players.length;
          const fallbackRole = ALL_ROLES[idx % ALL_ROLES.length];
          const teamIndex = Math.min(3, idx);
          if (room.playMode === 'competitive' && !room.competitiveTeams[teamIndex]) {
            const customTeamName =
              typeof msg.teamName === 'string' && msg.teamName.trim()
                ? msg.teamName.trim().slice(0, 28)
                : DEFAULT_TEAM_NAMES[teamIndex] || `Team ${teamIndex + 1}`;
            room.competitiveTeams.push({
              teamIndex,
              teamName: customTeamName,
              config: defaultStarterConfig(room.missionId),
              score: null,
              sciencePts: 0,
              costM: 0,
              wetMassKg: 0,
              status: 'DRAFT',
            });
          } else if (
            room.playMode === 'competitive' &&
            typeof msg.teamName === 'string' &&
            msg.teamName.trim() &&
            room.competitiveTeams[teamIndex]
          ) {
            room.competitiveTeams[teamIndex].teamName = msg.teamName.trim().slice(0, 28);
          }

          const newPlayer: ServerPlayer = {
            clientId,
            name: playerName,
            roles: [fallbackRole],
            teamIndex,
            isHost: room.players.filter((p) => p.online).length === 0,
            online: true,
            lastActiveAt: Date.now(),
          };
          if (newPlayer.isHost) room.hostId = clientId;
          room.players.push(newPlayer);
          appendSystemChat(room, `${playerName} joined the mission crew.`);
        }

        room.coordinationScore = computeRoomCoordinationScore(room.players, room.negotiationPicks);
        room.revision += 1;
        room.updatedAt = Date.now();
        socketMeta.set(ws, { roomCode: code, clientId });
        broadcastRoom(room);
        return;
      }

      if (type === 'room:leave') {
        removeClientFromRoom(ws, true);
        sendJson(ws, { type: 'room:left' });
        return;
      }

      const room = meta.roomCode ? rooms.get(meta.roomCode) : null;
      if (!room || !meta.clientId) return;
      const sender = room.players.find((p) => p.clientId === meta.clientId);

      if (type === 'room:updateSettings') {
        if (msg.playMode === 'coop' || msg.playMode === 'competitive') {
          room.playMode = msg.playMode;
        }
        if (msg.difficulty === 'cadet' || msg.difficulty === 'engineer' || msg.difficulty === 'director') {
          room.difficulty = msg.difficulty;
        }
        if (typeof msg.missionId === 'string' && msg.missionId !== room.missionId) {
          room.missionId = msg.missionId;
          room.sharedConfig = defaultStarterConfig(msg.missionId);
          room.competitiveTeams = room.competitiveTeams.map((t) => ({
            ...t,
            config: defaultStarterConfig(msg.missionId as string),
            score: null,
            sciencePts: 0,
            status: 'DRAFT',
          }));
        }
        if (typeof msg.launched === 'boolean') {
          room.launched = msg.launched;
          if (msg.launched) {
            room.phase = 'briefing';
            room.designStep = 'sensors';
            appendSystemChat(room, `${sender?.name || 'Host'} launched mission ${room.missionId.toUpperCase()} for the room.`);
          }
        }
        room.lastUpdatedBy = sender?.name || null;
        room.revision += 1;
        room.updatedAt = Date.now();
        broadcastRoom(room);
        return;
      }

      if (type === 'coop:claimRole') {
        const targetId = typeof msg.targetClientId === 'string' ? msg.targetClientId : meta.clientId;
        const target = room.players.find((p) => p.clientId === targetId);
        const roleId = msg.roleId as RoleId;
        if (!target || !ALL_ROLES.includes(roleId)) return;
        const has = target.roles.includes(roleId);
        if (has && target.roles.length > 1) {
          target.roles = target.roles.filter((r) => r !== roleId);
        } else if (!has) {
          target.roles = [...target.roles, roleId];
        }
        room.coordinationScore = computeRoomCoordinationScore(room.players, room.negotiationPicks);
        room.lastUpdatedBy = sender?.name || target.name;
        room.revision += 1;
        room.updatedAt = Date.now();
        broadcastRoom(room);
        return;
      }

      if (type === 'coop:pickNegotiation') {
        const dilemmaId = String(msg.dilemmaId || '');
        const choiceId = String(msg.choiceId || '');
        if (!dilemmaId || !choiceId) return;
        room.negotiationPicks = { ...room.negotiationPicks, [dilemmaId]: choiceId };
        room.coordinationScore = computeRoomCoordinationScore(room.players, room.negotiationPicks);
        room.lastUpdatedBy = sender?.name || null;
        room.revision += 1;
        room.updatedAt = Date.now();
        broadcastRoom(room);
        return;
      }

      if (type === 'coop:syncConfig') {
        if (msg.config && typeof msg.config === 'object') {
          room.sharedConfig = msg.config as Record<string, unknown>;
        }
        if (
          msg.phase === 'briefing' ||
          msg.phase === 'design' ||
          msg.phase === 'resources' ||
          msg.phase === 'operations' ||
          msg.phase === 'report'
        ) {
          room.phase = msg.phase;
        }
        if (
          msg.designStep === 'sensors' ||
          msg.designStep === 'parts' ||
          msg.designStep === 'order' ||
          msg.designStep === 'orbit'
        ) {
          room.designStep = msg.designStep;
        }
        room.lastUpdatedBy = sender?.name || null;
        room.revision += 1;
        room.updatedAt = Date.now();
        broadcastRoom(room);
        return;
      }

      if (type === 'comp:updateTeam') {
        const teamIdx = Number(msg.teamIndex);
        const targetTeam = room.competitiveTeams.find((t) => t.teamIndex === teamIdx);
        if (!targetTeam) return;
        if (msg.config && typeof msg.config === 'object') {
          targetTeam.config = msg.config as Record<string, unknown>;
        }
        if (typeof msg.costM === 'number') targetTeam.costM = msg.costM;
        if (typeof msg.wetMassKg === 'number') targetTeam.wetMassKg = msg.wetMassKg;
        if (typeof msg.status === 'string') targetTeam.status = msg.status;
        if (typeof msg.score === 'number') targetTeam.score = msg.score;
        if (typeof msg.sciencePts === 'number') targetTeam.sciencePts = msg.sciencePts;
        if (msg.outcome === 'success' || msg.outcome === 'partial' || msg.outcome === 'fail') {
          targetTeam.outcome = msg.outcome;
          appendSystemChat(room, `${targetTeam.teamName} finished simulation (${targetTeam.score ?? 0} pts · ${targetTeam.outcome.toUpperCase()})!`);
        }
        room.lastUpdatedBy = sender?.name || targetTeam.teamName;
        room.revision += 1;
        room.updatedAt = Date.now();
        broadcastRoom(room);
        return;
      }

      if (type === 'room:chat') {
        const text = String(msg.text || '').trim().slice(0, 220);
        if (!text) return;
        room.chat.push({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          senderId: meta.clientId,
          senderName: sender?.name || 'Crew',
          text,
          timestamp: new Date().toISOString(),
          kind: 'chat',
        });
        if (room.chat.length > 50) room.chat.splice(0, room.chat.length - 50);
        room.revision += 1;
        room.updatedAt = Date.now();
        broadcastRoom(room);
      }
    });

    ws.on('close', () => {
      removeClientFromRoom(ws, true);
      socketMeta.delete(ws);
    });
  });

  const distDir = path.join(__dirname, 'dist');
  const useProdStatic = process.env.NODE_ENV === 'production' && fs.existsSync(path.join(distDir, 'index.html'));

  if (useProdStatic) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Mission Architect server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Mission Architect server:', err);
  process.exit(1);
});
