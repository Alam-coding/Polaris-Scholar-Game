import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Award, CheckCircle2, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
import { soundEngine } from '../engine/audio';

export type EndingOutcome = 'success' | 'partial' | 'fail';

export interface EndingBeat {
  speaker: string;
  role: string;
  line: string;
}

export interface MissionEndingProps {
  mode: 'rocket' | 'satellite' | 'campaign';
  title: string;
  subtitle: string;
  destinationId: string;
  outcome: EndingOutcome;
  score: number;
  stars: number;
  creditsEarned: number;
  highlightLine: string;
  realWorldImpact: string;
  beats: EndingBeat[];
  onContinue: () => void;
}

export function MissionEndingModal({
  mode,
  title,
  subtitle,
  destinationId,
  outcome,
  score,
  stars,
  creditsEarned,
  highlightLine,
  realWorldImpact,
  beats,
  onContinue,
}: MissionEndingProps) {
  const [beatIdx, setBeatIdx] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const safeBeats = beats.length > 0 ? beats : [
    {
      speaker: 'NOVA',
      role: 'Flight Guidance System',
      line: realWorldImpact,
    },
  ];
  const currentBeat = safeBeats[Math.min(beatIdx, safeBeats.length - 1)];
  const isLast = beatIdx >= safeBeats.length - 1;

  // Set victory or dramatic soundtrack on ending arrival
  useEffect(() => {
    if (outcome === 'success') {
      soundEngine.setTrack('victory');
      soundEngine.playSfx('success');
    } else if (outcome === 'partial') {
      soundEngine.setTrack('earth');
      soundEngine.playSfx('beep');
    } else {
      soundEngine.setTrack('orbital');
      soundEngine.playSfx('warning');
    }
  }, [outcome]);

  // Animated space horizon canvas for every ending
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const starsList = Array.from({ length: 90 }, (_, i) => ({
      x: ((i * 73) % 100) / 100,
      y: ((i * 41) % 100) / 100,
      r: 0.7 + (i % 3) * 0.55,
      phase: i * 0.6,
    }));

    let rafId = 0;
    const start = performance.now();

    const draw = (now: number) => {
      const elapsed = prefersReduced ? 1.5 : (now - start) / 1000;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = canvas.clientWidth || 720;
      const ch = canvas.clientHeight || 220;
      if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
        canvas.width = Math.round(cw * dpr);
        canvas.height = Math.round(ch * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Deep sky gradient
      const bg = ctx.createLinearGradient(0, 0, 0, ch);
      if (destinationId === 'MARS') {
        bg.addColorStop(0, '#070913');
        bg.addColorStop(1, '#24100d');
      } else if (destinationId === 'LUNAR') {
        bg.addColorStop(0, '#050811');
        bg.addColorStop(1, '#151b26');
      } else {
        bg.addColorStop(0, '#040812');
        bg.addColorStop(1, '#091a30');
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

      // Stars
      starsList.forEach((st) => {
        const twinkle = 0.45 + 0.45 * Math.sin(elapsed * 1.8 + st.phase);
        ctx.fillStyle = `rgba(226, 232, 240, ${twinkle})`;
        ctx.beginPath();
        ctx.arc(st.x * cw, st.y * ch * 0.78, st.r, 0, Math.PI * 2);
        ctx.fill();
      });

      // Planetary horizon arc at bottom
      const planetRadius = cw * 0.62;
      const planetCy = ch + planetRadius - 56;
      const planetCx = cw * 0.5;

      // Atmosphere halo
      const haloGrad = ctx.createRadialGradient(
        planetCx,
        planetCy,
        planetRadius - 6,
        planetCx,
        planetCy,
        planetRadius + 28,
      );
      if (destinationId === 'MARS') {
        haloGrad.addColorStop(0, 'rgba(249, 115, 22, 0.55)');
        haloGrad.addColorStop(1, 'rgba(249, 115, 22, 0)');
      } else if (destinationId === 'LUNAR') {
        haloGrad.addColorStop(0, 'rgba(148, 163, 184, 0.35)');
        haloGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');
      } else {
        haloGrad.addColorStop(0, 'rgba(34, 211, 238, 0.55)');
        haloGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
      }
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(planetCx, planetCy, planetRadius + 28, Math.PI, Math.PI * 2);
      ctx.fill();

      // Surface sphere
      const surfGrad = ctx.createLinearGradient(0, ch - 75, 0, ch);
      if (destinationId === 'MARS') {
        surfGrad.addColorStop(0, '#c2410c');
        surfGrad.addColorStop(1, '#451a03');
      } else if (destinationId === 'LUNAR') {
        surfGrad.addColorStop(0, '#64748b');
        surfGrad.addColorStop(1, '#1e293b');
      } else if (outcome === 'success') {
        // Vibrant Healthy Earth with emerald land + ocean blue
        surfGrad.addColorStop(0, '#0ea5e9');
        surfGrad.addColorStop(0.42, '#10b981');
        surfGrad.addColorStop(0.75, '#0284c7');
        surfGrad.addColorStop(1, '#082f49');
      } else {
        surfGrad.addColorStop(0, '#0284c7');
        surfGrad.addColorStop(0.55, '#0f766e');
        surfGrad.addColorStop(1, '#082f49');
      }
      ctx.fillStyle = surfGrad;
      ctx.beginPath();
      ctx.arc(planetCx, planetCy, planetRadius, Math.PI, Math.PI * 2);
      ctx.fill();

      // Lush green continent highlights & clean cloud wisps when Earth is healthy
      if (destinationId !== 'MARS' && destinationId !== 'LUNAR' && outcome === 'success') {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.36)';
        ctx.beginPath();
        ctx.ellipse(cw * 0.36, ch - 22, 68, 18, -0.1, 0, Math.PI * 2);
        ctx.ellipse(cw * 0.64, ch - 18, 84, 20, 0.08, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.ellipse(cw * 0.48, ch - 30, 90, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Orbital path arc
      const orbitY = ch * 0.4;
      ctx.strokeStyle =
        outcome === 'fail' ? 'rgba(251, 146, 60, 0.35)' : 'rgba(34, 211, 238, 0.35)';
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cw * 0.08, orbitY + 28);
      ctx.quadraticCurveTo(cw * 0.5, orbitY - 38, cw * 0.92, orbitY + 28);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated spacecraft / capsule position along arc
      const progress = (elapsed * 0.14) % 1;
      const t = outcome === 'fail' ? 0.55 : progress;
      const sx = (1 - t) * (1 - t) * (cw * 0.08) + 2 * (1 - t) * t * (cw * 0.5) + t * t * (cw * 0.92);
      const sy =
        (1 - t) * (1 - t) * (orbitY + 28) +
        2 * (1 - t) * t * (orbitY - 38) +
        t * t * (orbitY + 28) +
        (outcome === 'fail' ? Math.sin(elapsed * 2) * 3 : 0);

      // Scan cone / signal wave down to planet when successful or partial
      if (outcome !== 'fail') {
        const pulseAlpha = 0.16 + 0.12 * Math.sin(elapsed * 4);
        ctx.fillStyle =
          outcome === 'success'
            ? `rgba(16, 185, 129, ${pulseAlpha})`
            : `rgba(245, 158, 11, ${pulseAlpha})`;
        ctx.beginPath();
        ctx.moveTo(sx, sy + 6);
        ctx.lineTo(sx - 44, ch - 26);
        ctx.lineTo(sx + 44, ch - 26);
        ctx.closePath();
        ctx.fill();
      } else {
        // Recovery parachute canopy
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx - 18, sy - 26);
        ctx.moveTo(sx, sy - 4);
        ctx.lineTo(sx + 18, sy - 26);
        ctx.stroke();
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(sx, sy - 26, 20, Math.PI, Math.PI * 2);
        ctx.fill();
      }

      // Spacecraft icon
      ctx.save();
      ctx.translate(sx, sy);
      // Solar panels
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-26, -4, 15, 8);
      ctx.fillRect(11, -4, 15, 8);
      // Bus core
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-9, -7, 18, 14);
      // Gold foil accent
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(-5, -3, 10, 6);
      ctx.restore();

      // Corner mission stamp
      ctx.fillStyle = 'rgba(7, 11, 20, 0.78)';
      ctx.fillRect(14, 12, 240, 28);
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
      ctx.strokeRect(14, 12, 240, 28);
      ctx.fillStyle =
        outcome === 'success' ? '#34d399' : outcome === 'partial' ? '#fbbf24' : '#fb7185';
      ctx.font = '600 11px monospace';
      ctx.fillText(
        outcome === 'success'
          ? mode === 'satellite' || mode === 'campaign'
            ? 'EARTH HEALTH · PROTECTED & HEALTHY'
            : 'MISSION ACCOMPLISHED · RETURNED HOME'
          : outcome === 'partial'
            ? 'ENDING · BACKUP ORBIT SAVED'
            : 'ENDING · SAFE CREW RECOVERY',
        22,
        30,
      );

      ctx.restore();
      if (!prefersReduced) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [destinationId, outcome]);

  const endingBannerTitle =
    mode === 'campaign'
      ? 'PROJECT AEGIS Complete: Guardians of Earth'
      : outcome === 'success'
        ? 'Mission Accomplished!'
        : outcome === 'partial'
          ? 'Orbit Saved on Backup Systems'
          : 'Safe Recovery & Flight Lesson Learned';

  const borderTone =
    outcome === 'success'
      ? 'border-emerald-500/60'
      : outcome === 'partial'
        ? 'border-amber-500/60'
        : 'border-rose-500/60';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04070E]/92 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ending-modal-title"
    >
      <div
        className={`w-full max-w-3xl rounded-xl border ${borderTone} bg-[#0D1526] shadow-2xl overflow-hidden my-auto`}
      >
        {/* Top Cinematic Orbital Canvas */}
        <div className="relative w-full h-52 sm:h-56 border-b border-slate-800 bg-[#050811]">
          <canvas ref={canvasRef} className="w-full h-full block" />
          <div className="absolute bottom-3 right-4 text-right font-mono">
            <div className="text-lg sm:text-xl font-bold text-amber-400">
              {'★'.repeat(stars)}
              {'☆'.repeat(3 - stars)}
            </div>
            <div className="text-xs text-slate-200 tabular-nums">
              Score {score}/100 · +{creditsEarned} CR
            </div>
          </div>
        </div>

        {/* Ending Header + Narrative Scene */}
        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
                {outcome === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : outcome === 'partial' ? (
                  <Sparkles className="w-4 h-4 text-amber-400" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                )}
                <span>{subtitle}</span>
              </div>
              <h2 id="ending-modal-title" className="text-2xl font-bold text-white mt-1">
                {endingBannerTitle}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">{title}</p>
            </div>

            <div className="text-right text-xs font-mono text-slate-400">
              Scene {beatIdx + 1} / {safeBeats.length}
            </div>
          </div>

          {/* Highlight Telemetry & Real-World Impact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3.5">
              <div className="text-[11px] font-mono text-cyan-400 uppercase">Flight Outcome</div>
              <div className="text-xs sm:text-sm font-semibold text-white mt-1 tabular-nums">
                {highlightLine}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#111A2E] p-3.5">
              <div className="text-[11px] font-mono text-emerald-400 uppercase">
                How This Helps Earth &amp; Space
              </div>
              <div className="text-xs text-slate-200 mt-1 leading-relaxed">{realWorldImpact}</div>
            </div>
          </div>

          {/* Epilogue Transmission Dialogue */}
          <div className="rounded-xl border border-slate-700 bg-[#0A101D] p-4 space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-bold text-cyan-300">{currentBeat.speaker}</span>
              <span className="text-[11px] font-mono text-slate-400">{currentBeat.role}</span>
            </div>
            <p className="text-sm text-slate-100 leading-relaxed">{currentBeat.line}</p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              onClick={() => {
                soundEngine.playSfx('click');
                onContinue();
              }}
              className="text-xs font-medium text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Skip Ending Scene
            </button>

            <button
              onClick={() => {
                soundEngine.playSfx(isLast ? 'snap' : 'click');
                if (isLast) {
                  onContinue();
                } else {
                  setBeatIdx((i) => i + 1);
                }
              }}
              className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-5 py-2.5 text-xs sm:text-sm transition-colors flex items-center gap-2"
            >
              {isLast ? (
                <>
                  <Award className="w-4 h-4" />
                  <span>Open Mission Report, Quiz &amp; Certificate</span>
                </>
              ) : (
                <>
                  <span>Next Ending Scene</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
