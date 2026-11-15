import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Pause,
  Play,
  Radio,
  ShieldAlert,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from '../engine/audio';

interface PrologueScene {
  id: 'flare' | 'blind' | 'aegis' | 'liftoff';
  actTag: string;
  sceneCode: string;
  timestamp: string;
  headline: string;
  telemetryTag: string;
  speaker: string;
  callsign: string;
  role: string;
  accent: 'amber' | 'rose' | 'cyan' | 'emerald';
  durationMs: number;
  narration: string;
  subNote: string;
}

const PROLOGUE_SCENES: PrologueScene[] = [
  {
    id: 'flare',
    actTag: 'COLD OPEN // SOLAR SECTOR',
    sceneCode: 'SCENE 01 / 04',
    timestamp: 'T - 07 DAYS · SUN-EARTH L1 ALERT',
    headline: 'THE GEOMAGNETIC BLACKOUT',
    telemetryTag: 'NOAA KP-9 STORM · RELAYS OFFLINE',
    speaker: 'Director Elena Vance',
    callsign: 'FLIGHT-01',
    role: 'NASA Mission Operations Lead',
    accent: 'amber',
    durationMs: 7400,
    narration:
      'Seven days ago, an X-class coronal mass ejection slammed into Earth’s magnetosphere. Two primary Earth-observing satellites lost attitude lock and vanished from our telemetry network.',
    subNote: 'Geomagnetic plasma storms ionize the upper atmosphere and sever high-rate RF downlinks.',
  },
  {
    id: 'blind',
    actTag: 'ACT I // EQUATORIAL BLIND SPOT',
    sceneCode: 'SCENE 02 / 04',
    timestamp: 'T - 02 DAYS · SENSOR GAP CRITICAL',
    headline: 'A PLANET UNWATCHED',
    telemetryTag: 'BORNEO WILDFIRE PLUMES · W. PACIFIC TYPHOON',
    speaker: 'Dr. Arya Pratama',
    callsign: 'SCI-LEAD',
    role: 'Lead Earth Observation Scientist',
    accent: 'rose',
    durationMs: 7400,
    narration:
      'With our orbital eyes dark, peatland wildfires across Borneo are spreading beneath choking smoke while a rapidly intensifying Western Pacific typhoon tracks blindly toward coastal cities.',
    subNote: 'Emergency responders depend on thermal radiometers, lidars, and atmospheric sounders.',
  },
  {
    id: 'aegis',
    actTag: 'ACT II // HANGAR 04 CLEANROOM',
    sceneCode: 'SCENE 03 / 04',
    timestamp: 'T - 04 HOURS · ARCHITECT ASSIGNED',
    headline: 'PROJECT AEGIS CONVENED',
    telemetryTag: 'CLEANROOM ONLINE · FLEET CLEARANCE GRANTED',
    speaker: 'Cmdr. Leo Reyes',
    callsign: 'PAD-DIR',
    role: 'Flight Director & Rocket Systems Lead',
    accent: 'cyan',
    durationMs: 7600,
    narration:
      'We stood up Project Aegis to rebuild humanity’s orbital shield from the ground up. As Chief Architect, you will engineer rockets and satellites, balance mass, power, and budgets, and command live scans.',
    subNote: 'Every design trade-off has real physics consequences across power, mass, cost, and downlink capacity.',
  },
  {
    id: 'liftoff',
    actTag: 'ACT III // PAD 39A TERMINAL COUNT',
    sceneCode: 'SCENE 04 / 04',
    timestamp: 'T - 00:00:10 · IGNITION AUTHORIZED',
    headline: 'YOUR COMMAND BEGINS',
    telemetryTag: 'AEGIS CONSTELLATION · LAUNCH SEQUENCE GO',
    speaker: 'NOVA',
    callsign: 'GUIDANCE',
    role: 'Onboard Flight Guidance AI',
    accent: 'emerald',
    durationMs: 7600,
    narration:
      'Ground stations at Goldstone, Canberra, Madrid, and Svalbard are locked on. Steer antennas through space weather storms, protect Earth’s living systems, and chart the route to the Moon and Mars.',
    subNote: 'Prepare for PROJECT AEGIS Command initialization.',
  },
];

interface PrologueCutsceneModalProps {
  mandatory?: boolean;
  onComplete: () => void;
  onSkip?: () => void;
}

export function PrologueCutsceneModal({
  mandatory = false,
  onComplete,
  onSkip,
}: PrologueCutsceneModalProps) {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [typedLen, setTypedLen] = useState(0);
  const [sceneElapsedMs, setSceneElapsedMs] = useState(0);
  const [fadeOpacity, setFadeOpacity] = useState(1);
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const scene = PROLOGUE_SCENES[sceneIdx];
  const isFirst = sceneIdx === 0;
  const isLast = sceneIdx === PROLOGUE_SCENES.length - 1;
  const fullText = scene.narration;
  const typingDone = typedLen >= fullText.length;

  // Trigger dramatic audio atmosphere per scene
  useEffect(() => {
    setTypedLen(0);
    setSceneElapsedMs(0);
    setFadeOpacity(0);
    const fadeIn = window.setTimeout(() => setFadeOpacity(1), 40);

    if (scene.id === 'flare' || scene.id === 'blind') {
      soundEngine.setTrack('launch');
      soundEngine.playSfx(scene.id === 'flare' ? 'warning' : 'beep');
    } else if (scene.id === 'aegis') {
      soundEngine.setTrack('orbital');
      soundEngine.playSfx('snap');
    } else {
      soundEngine.setTrack('orbital');
      soundEngine.playSfx('ignition');
    }
    return () => window.clearTimeout(fadeIn);
  }, [sceneIdx, scene.id]);

  // Typewriter subtitle streaming + automatic videogame cutscene progression
  useEffect(() => {
    if (paused) return;
    const tickMs = 28;
    const timer = window.setInterval(() => {
      setTypedLen((len) => Math.min(fullText.length, len + 2));
      setSceneElapsedMs((prev) => Math.min(scene.durationMs, prev + tickMs));
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [paused, fullText.length, scene.durationMs]);

  useEffect(() => {
    if (!paused && sceneElapsedMs >= scene.durationMs && sceneIdx < PROLOGUE_SCENES.length - 1) {
      setSceneIdx((i) => i + 1);
      setSceneElapsedMs(0);
    }
  }, [paused, sceneElapsedMs, scene.durationMs, sceneIdx]);

  // Keyboard navigation ([Space]/[ArrowRight]/[Enter] advances once dialogue is typed or reveals text; [Esc] skips ONLY if replay)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      soundEngine.unlockAndStart();
      if (e.key === 'Escape' && !mandatory && onSkip) {
        e.preventDefault();
        soundEngine.playSfx('click');
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!typingDone) {
          setTypedLen(fullText.length);
          return;
        }
        if (!isLast) {
          soundEngine.playSfx('snap');
          setSceneIdx((i) => i + 1);
        } else {
          soundEngine.playSfx('success');
          onComplete();
        }
      } else if (e.key === 'ArrowLeft' && sceneIdx > 0) {
        e.preventDefault();
        soundEngine.playSfx('click');
        setSceneIdx((i) => i - 1);
      } else if (e.key.toLowerCase() === 'p') {
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mandatory, onSkip, typingDone, fullText.length, isLast, sceneIdx, onComplete]);

  // Full-bleed Videogame Cinema Canvas Renderer with Ken Burns camera sweep & particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const stars = Array.from({ length: 140 }, (_, i) => ({
      x: ((i * 89) % 100) / 100,
      y: ((i * 53) % 100) / 100,
      r: 0.65 + (i % 3) * 0.55,
      phase: i * 0.71,
      drift: (i % 5) * 0.004,
    }));

    let rafId = 0;
    const sceneStart = performance.now();

    const drawFrame = (now: number) => {
      const elapsed = prefersReduced ? 2.2 : (now - sceneStart) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth || 1024;
      const ch = canvas.clientHeight || 420;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Subtle videogame camera pan + CME impact tremor in Scene 1
      const camZoom = prefersReduced ? 1 : 1 + Math.min(0.06, elapsed * 0.008);
      const flareHit = scene.id === 'flare' && elapsed > 1.2 && elapsed < 2.3 && !prefersReduced;
      const shakeX = flareHit ? Math.sin(elapsed * 55) * 4 : 0;
      const shakeY = flareHit ? Math.cos(elapsed * 47) * 3 : 0;

      ctx.translate(cw * 0.5 + shakeX, ch * 0.5 + shakeY);
      ctx.scale(camZoom, camZoom);
      ctx.translate(-cw * 0.5, -ch * 0.5);

      // Deep sky gradient
      const bg = ctx.createLinearGradient(0, 0, 0, ch);
      if (scene.id === 'flare') {
        bg.addColorStop(0, '#05070E');
        bg.addColorStop(0.55, '#190C14');
        bg.addColorStop(1, '#2B130B');
      } else if (scene.id === 'blind') {
        bg.addColorStop(0, '#040812');
        bg.addColorStop(1, '#1A0F1A');
      } else if (scene.id === 'aegis') {
        bg.addColorStop(0, '#030814');
        bg.addColorStop(1, '#081C30');
      } else {
        bg.addColorStop(0, '#020610');
        bg.addColorStop(1, '#0A1F36');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(-30, -30, cw + 60, ch + 60);

      // Drifting parallax starfield
      stars.forEach((st) => {
        const px = ((st.x + elapsed * st.drift * 0.25) % 1) * cw;
        const twinkle = 0.35 + 0.55 * Math.sin(elapsed * 2 + st.phase);
        ctx.fillStyle = `rgba(226, 232, 240, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(px, st.y * ch * 0.85, st.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Planetary limb arc across lower frame
      const planetR = cw * 0.72;
      const planetCx = cw * 0.5;
      const planetCy = ch + planetR - 74;

      const halo = ctx.createRadialGradient(planetCx, planetCy, planetR - 4, planetCx, planetCy, planetR + 36);
      if (scene.id === 'flare' || scene.id === 'blind') {
        halo.addColorStop(0, 'rgba(245, 158, 11, 0.45)');
        halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        halo.addColorStop(0, 'rgba(34, 211, 238, 0.55)');
        halo.addColorStop(1, 'rgba(34, 211, 238, 0)');
      }
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(planetCx, planetCy, planetR + 36, Math.PI, Math.PI * 2);
      ctx.fill();

      const surf = ctx.createLinearGradient(0, ch - 94, 0, ch);
      if (scene.id === 'blind') {
        surf.addColorStop(0, '#0c4a6e');
        surf.addColorStop(0.55, '#1e293b');
        surf.addColorStop(1, '#070b14');
      } else {
        surf.addColorStop(0, '#0284c7');
        surf.addColorStop(0.45, '#0f766e');
        surf.addColorStop(1, '#06182c');
      }
      ctx.fillStyle = surf;
      ctx.beginPath();
      ctx.arc(planetCx, planetCy, planetR, Math.PI, Math.PI * 2);
      ctx.fill();

      if (scene.id === 'flare') {
        const flareX = cw * 0.14;
        const flareY = ch * 0.28;
        const sunGrad = ctx.createRadialGradient(flareX, flareY, 6, flareX, flareY, 94);
        sunGrad.addColorStop(0, '#fef9c3');
        sunGrad.addColorStop(0.35, '#f59e0b');
        sunGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(flareX, flareY, 94, 0, Math.PI * 2);
        ctx.fill();

        for (let w = 0; w < 4; w++) {
          const waveT = (elapsed * 0.42 + w * 0.25) % 1;
          const radius = 56 + waveT * cw * 0.92;
          ctx.strokeStyle = `rgba(251, 146, 60, ${(1 - waveT) * 0.72})`;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(flareX, flareY, radius, -0.42, 0.85);
          ctx.stroke();
        }

        [
          { x: cw * 0.56, y: ch * 0.36, rot: 0.35 + Math.sin(elapsed * 2.5) * 0.14 },
          { x: cw * 0.79, y: ch * 0.28, rot: -0.45 - Math.cos(elapsed * 2.1) * 0.16 },
        ].forEach((sat, idx) => {
          ctx.save();
          ctx.translate(sat.x, sat.y);
          ctx.rotate(sat.rot);
          ctx.fillStyle = '#334155';
          ctx.fillRect(-30, -4, 20, 8);
          ctx.fillRect(10, -4, 20, 8);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(-8, -8, 16, 16);
          ctx.strokeStyle = idx === 0 ? '#f43f5e' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 18 + Math.sin(elapsed * 9 + idx) * 2.5, 0, Math.PI * 1.45);
          ctx.stroke();
          ctx.restore();

          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.fillStyle = '#fda4af';
          ctx.fillText(`RELAY-0${idx + 1} // SIGNAL LOST`, sat.x - 62, sat.y + 32);
        });
      } else if (scene.id === 'blind') {
        const fireX = cw * 0.3;
        const fireY = ch - 36;
        for (let k = 0; k < 6; k++) {
          const px = fireX + (k - 2.5) * 20;
          const py = fireY + Math.sin(k * 1.7) * 5;
          const rad = 16 + Math.sin(elapsed * 3.8 + k) * 4;
          const fGrad = ctx.createRadialGradient(px, py, 2, px, py, rad);
          fGrad.addColorStop(0, 'rgba(251, 146, 60, 0.92)');
          fGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
          ctx.fillStyle = fGrad;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#fdba74';
        ctx.fillText('BORNEO THERMAL PLUMES // UNMONITORED', fireX - 110, ch - 68);

        const cycX = cw * 0.72;
        const cycY = ch - 30;
        ctx.save();
        ctx.translate(cycX, cycY);
        ctx.rotate(elapsed * 1.5);
        for (let arm = 0; arm < 4; arm++) {
          ctx.rotate((Math.PI * 2) / 4);
          ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.arc(11, 0, 22, 0.2, Math.PI * 1.15);
          ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#bae6fd';
        ctx.fillText('PACIFIC TYPHOON // BLIND TRACK', cycX - 96, ch - 70);
      } else if (scene.id === 'aegis') {
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
        ctx.setLineDash([6, 5]);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cw * 0.08, ch * 0.48);
        ctx.quadraticCurveTo(cw * 0.5, ch * 0.08, cw * 0.92, ch * 0.48);
        ctx.stroke();
        ctx.setLineDash([]);

        [0.24, 0.5, 0.76].forEach((offset, idx) => {
          const t = (offset + elapsed * 0.045) % 1;
          const x = (1 - t) * (1 - t) * (cw * 0.08) + 2 * (1 - t) * t * (cw * 0.5) + t * t * (cw * 0.92);
          const y =
            (1 - t) * (1 - t) * (ch * 0.48) +
            2 * (1 - t) * t * (ch * 0.08) +
            t * t * (ch * 0.48);

          ctx.fillStyle = 'rgba(34, 211, 238, 0.16)';
          ctx.beginPath();
          ctx.moveTo(x, y + 7);
          ctx.lineTo(x - 34, ch - 30);
          ctx.lineTo(x + 34, ch - 30);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(x - 28, y - 4, 18, 8);
          ctx.fillRect(x + 10, y - 4, 18, 8);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(x - 8, y - 7, 16, 14);
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(x, y + 9, 3.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.fillStyle = '#67e8f9';
          ctx.fillText(`AEGIS-0${idx + 1}`, x - 26, y - 16);
        });
      } else {
        const padX = cw * 0.22;
        const padY = ch - 52;
        const ascent = Math.min(1, (elapsed * 0.2) % 1.06);
        const rx = padX + ascent * cw * 0.48;
        const ry = padY - Math.pow(ascent, 0.85) * (ch * 0.62);
        const angle = 0.24 + ascent * 0.58;

        ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(padX, padY);
        ctx.quadraticCurveTo(cw * 0.44, ch * 0.34, cw * 0.88, ch * 0.18);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(angle);
        const plumeLen = 34 + Math.sin(elapsed * 26) * 7;
        const plume = ctx.createLinearGradient(0, 18, 0, 18 + plumeLen);
        plume.addColorStop(0, '#fef08a');
        plume.addColorStop(0.45, '#f59e0b');
        plume.addColorStop(1, 'rgba(234, 88, 12, 0)');
        ctx.fillStyle = plume;
        ctx.beginPath();
        ctx.moveTo(-6, 16);
        ctx.lineTo(6, 16);
        ctx.lineTo(0, 16 + plumeLen);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(-6, -15, 12, 32);
        ctx.fillStyle = '#06b6d4';
        ctx.beginPath();
        ctx.moveTo(-6, -15);
        ctx.lineTo(0, -28);
        ctx.lineTo(6, -15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(-6, 7, 12, 4);
        ctx.restore();

        ctx.font = '11px "JetBrains Mono", monospace';
        ctx.fillStyle = '#6ee7b7';
        ctx.fillText('PAD 39A -> ORBITAL INSERTION VECTOR', cw * 0.45, ch - 56);
      }

      ctx.restore();

      if (!prefersReduced) {
        rafId = requestAnimationFrame(drawFrame);
      }
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafId);
  }, [scene.id]);

  const accentBadge =
    scene.accent === 'amber'
      ? 'text-amber-300 border-amber-500/50 bg-amber-950/55'
      : scene.accent === 'rose'
        ? 'text-rose-300 border-rose-500/50 bg-rose-950/55'
        : scene.accent === 'cyan'
          ? 'text-cyan-300 border-cyan-500/50 bg-cyan-950/55'
          : 'text-emerald-300 border-emerald-500/50 bg-emerald-950/55';

  const progressPct = Math.min(100, (sceneElapsedMs / Math.max(1, scene.durationMs)) * 100);

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none"
      role="dialog"
      aria-modal="true"
      aria-label="PROJECT AEGIS Opening Cutscene"
      onPointerDown={() => soundEngine.unlockAndStart()}
    >
      {/* Top Cinema Letterbox Matte Bar */}
      <div className="bg-black border-b border-slate-900 px-5 sm:px-8 py-3 flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
          <Radio className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="font-space text-white font-bold tracking-[0.14em] uppercase">
            PROJECT AEGIS
          </span>
          <span className="text-slate-600">//</span>
          <span className="text-cyan-300">{scene.actTag}</span>
          <span className="text-slate-600">·</span>
          <span className="text-slate-400">{scene.sceneCode}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              soundEngine.setMuted(next);
            }}
            className="rounded border border-slate-800 bg-[#0A0F1A] hover:border-slate-600 px-2.5 py-1.5 text-xs font-mono text-slate-300 flex items-center gap-1.5"
          >
            {muted ? (
              <VolumeX className="w-3.5 h-3.5 text-rose-400" />
            ) : (
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>{muted ? 'Muted' : 'Audio'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playSfx('click');
              setPaused((p) => !p);
            }}
            className="rounded border border-slate-800 bg-[#0A0F1A] hover:border-slate-600 px-2.5 py-1.5 text-xs font-mono text-slate-300 flex items-center gap-1.5"
          >
            {paused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>

          {!mandatory && onSkip ? (
            <button
              type="button"
              onClick={() => {
                soundEngine.playSfx('click');
                onSkip();
              }}
              className="rounded border border-slate-700 bg-[#0D1526] hover:border-slate-500 px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Skip Replay [Esc]
            </button>
          ) : (
            <span className="rounded border border-amber-700/50 bg-amber-950/30 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-amber-300">
              Story Opening · Mandatory
            </span>
          )}
        </div>
      </div>

      {/* Main Widescreen Cutscene Stage */}
      <div
        className="relative flex-1 w-full bg-[#04070F] overflow-hidden transition-opacity duration-500"
        style={{ opacity: fadeOpacity }}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Subtle Cinema Scanline + Vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 58%, rgba(2, 5, 12, 0.72) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 1px, transparent 1px, transparent 4px)',
          }}
        />

        {/* Cinema Corner Reticles */}
        <div className="absolute top-4 left-5 right-5 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <div className="border-l-2 border-t-2 border-cyan-400/70 pl-2.5 pt-1 text-[11px] font-mono tabular-nums text-slate-200 bg-black/45 pr-2.5 pb-1">
            {scene.timestamp}
          </div>
          <div className={`border px-3 py-1 text-[11px] font-mono tabular-nums ${accentBadge}`}>
            {scene.telemetryTag}
          </div>
        </div>

        {/* Dramatic Title Card Stinger Overlay */}
        <div className="absolute bottom-6 left-5 right-5 max-w-5xl mx-auto pointer-events-none">
          <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-cyan-300 mb-1">
            NASA Space Apps · Opening Transmission
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-white tracking-tight drop-shadow">
            {scene.headline}
          </h2>
        </div>

        {/* Auto-Advance Cutscene Timeline Scrubber */}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-900">
          <div
            className="h-full bg-cyan-400 transition-[width] duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Bottom Cinema Letterbox Bar: Streaming Subtitles & Cutscene Controls */}
      <div className="bg-black border-t border-slate-900 px-5 sm:px-8 py-4 z-10">
        <div className="max-w-5xl mx-auto space-y-3.5">
          <div className="rounded-lg border border-slate-800 bg-[#080D18] p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-cyan-500/50 bg-cyan-950/40 text-cyan-300">
                  {scene.callsign}
                </span>
                <span className="font-semibold text-white">{scene.speaker}</span>
                <span className="font-mono text-[11px] text-slate-400">· {scene.role}</span>
              </div>
              {scene.id === 'flare' && (
                <span className="text-[11px] font-mono text-amber-300 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  SPACE WEATHER ALERT
                </span>
              )}
            </div>

            <p className="text-sm sm:text-base text-slate-100 leading-relaxed min-h-[3.2rem]">
              {fullText.slice(0, typedLen)}
              {!typingDone && <span className="inline-block w-2 h-4 bg-cyan-400 ml-0.5 align-middle" />}
            </p>

            <p className="text-xs font-mono text-slate-400 border-t border-slate-800/80 pt-2">
              {scene.subNote}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-label="Cutscene scenes">
              {PROLOGUE_SCENES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={mandatory && idx > sceneIdx && !typingDone}
                  onClick={() => {
                    soundEngine.playSfx('click');
                    setSceneIdx(idx);
                  }}
                  className={`h-2 rounded-sm transition-all ${
                    idx === sceneIdx
                      ? 'w-12 bg-cyan-400'
                      : idx < sceneIdx
                        ? 'w-6 bg-emerald-500/80 hover:bg-emerald-400'
                        : 'w-6 bg-slate-800 hover:bg-slate-700'
                  }`}
                  aria-label={`Scene ${idx + 1}: ${s.headline}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isFirst}
                onClick={() => {
                  soundEngine.playSfx('click');
                  setSceneIdx((i) => Math.max(0, i - 1));
                }}
                className="rounded-lg border border-slate-800 bg-[#0D1526] hover:bg-slate-800 disabled:opacity-35 px-3.5 py-2 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Prev
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!typingDone) {
                    setTypedLen(fullText.length);
                    return;
                  }
                  if (isLast) {
                    soundEngine.playSfx('success');
                    onComplete();
                  } else {
                    soundEngine.playSfx('snap');
                    setSceneIdx((i) => i + 1);
                  }
                }}
                className={`rounded-lg px-5 py-2 text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  isLast && typingDone
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                }`}
              >
                {!typingDone ? (
                  <>
                    Reveal Line [Space]
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                ) : isLast ? (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Launch PROJECT AEGIS [Space]
                  </>
                ) : (
                  <>
                    Next Scene [Space]
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
