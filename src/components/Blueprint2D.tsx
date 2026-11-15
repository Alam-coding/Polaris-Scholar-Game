import { INSTRUMENTS } from '../data/missionData';
import { getSensorBay } from '../engine/physics';
import { SatelliteConfig, SatelliteMetrics } from '../types/mission';

interface Blueprint2DProps {
  config: SatelliteConfig;
  metrics: SatelliteMetrics;
  highlightPart: string | null;
  onHoverPart: (part: string | null) => void;
  onSelectPart?: (part: string) => void;
  testFire: boolean;
}

const INSTRUMENT_Y_OFFSET: Record<string, number> = {
  img: 124,
  snd: 124,
  cor: 136,
  par: 136,
  lid: 152,
  rad: 152,
  mag: 162,
  neu: 162,
};

export function Blueprint2D({
  config,
  metrics,
  highlightPart,
  onHoverPart,
  onSelectPart,
  testFire,
}: Blueprint2DProps) {
  const th = config.throttlePct / 100;
  const offPx = Math.abs(metrics.comBlueprintX - 200);
  const bayDiff = Math.abs(metrics.leftMassKg - metrics.rightMassKg);
  const tolM = Math.max(0.16, metrics.comToleranceM || 0.16);
  const isBalanced = metrics.comOffsetM <= tolM && bayDiff <= 30;
  const offColor = offPx < 6 ? '#10B981' : offPx < 14 ? '#F59E0B' : '#EF4444';
  const wingW = config.power === 'a' ? 56 : config.power === 'b' ? 90 : 120;
  const plumeLen =
    (config.prop === 'a' ? 16 : config.prop === 'b' ? 40 : config.prop === 'c' ? 62 : 30) *
    (0.25 + 0.75 * th) *
    (testFire ? 1.45 : 1);
  const plumeColor = config.prop === 'd' ? '#38bdf8' : '#fbbf24';
  const bellW = config.prop === 'a' ? 12 : config.prop === 'b' ? 28 : config.prop === 'c' ? 44 : 40;
  const bellH = config.prop === 'a' ? 10 : config.prop === 'b' ? 22 : config.prop === 'c' ? 38 : 8;
  const yBell = 210 + bellH;
  const throat = config.prop === 'd' ? bellW / 2 : bellW * 0.24;
  const fuelH = 0.28 * config.fuelLoadPct;

  const isHl = (k: string) => highlightPart === k;

  return (
    <div className="space-y-2">
      <div className="blueprint-grid rounded-lg border border-slate-800/80 overflow-hidden">
        <svg
          viewBox="0 0 400 315"
          className="w-full h-auto block select-none"
          role="img"
          aria-label="Spacecraft side-elevation schematic blueprint"
        >
          <defs>
            <linearGradient id="bp-plume" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor={plumeColor} />
              <stop offset="1" stopColor={plumeColor} stopOpacity="0" />
            </linearGradient>
            <pattern id="bp-solar" width="10" height="10" patternUnits="userSpaceOnUse">
              <rect width="10" height="10" fill="#0f2966" />
              <path d="M0 0H10V10" fill="none" stroke="#3b82f6" strokeWidth="0.6" />
            </pattern>
          </defs>

          {/* Center Thrust Axis Guide Corridor */}
          <line x1={200} y1={24} x2={200} y2={290} stroke="#10B981" strokeOpacity="0.22" strokeDasharray="4 4" />
          <rect x={192} y={90} width={16} height={120} fill="#10B981" fillOpacity="0.04" />

          {/* Solar Arrays */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => onHoverPart('power')}
            onMouseLeave={() => onHoverPart(null)}
            onClick={() => onSelectPart?.('power')}
            style={{ filter: isHl('power') ? 'drop-shadow(0 0 5px #22d3ee)' : undefined }}
          >
            <rect
              x={130 - wingW}
              y={120}
              width={wingW}
              height={60}
              fill="url(#bp-solar)"
              stroke={isHl('power') ? '#22d3ee' : '#60a5fa'}
              strokeWidth={isHl('power') ? 2 : 1}
            />
            <rect
              x={270}
              y={120}
              width={wingW}
              height={60}
              fill="url(#bp-solar)"
              stroke={isHl('power') ? '#22d3ee' : '#60a5fa'}
              strokeWidth={isHl('power') ? 2 : 1}
            />
            <line x1={150} y1={150} x2={130} y2={150} stroke="#64748b" strokeDasharray="3 3" />
            <line x1={250} y1={150} x2={270} y2={150} stroke="#64748b" strokeDasharray="3 3" />
            <circle cx={150} cy={150} r={3.5} fill="#070B14" stroke="#22d3ee" />
            <circle cx={250} cy={150} r={3.5} fill="#070B14" stroke="#22d3ee" />
            <text x={130 - wingW} y={113} fill="#94a3b8" fontSize="8" fontFamily="monospace">
              SOLAR ({config.power.toUpperCase()})
            </text>
          </g>

          {/* Comms Antenna */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => onHoverPart('comms')}
            onMouseLeave={() => onHoverPart(null)}
            onClick={() => onSelectPart?.('comms')}
            style={{ filter: isHl('comms') ? 'drop-shadow(0 0 5px #22d3ee)' : undefined }}
          >
            <line x1={200} y1={90} x2={200} y2={62} stroke="#64748b" strokeDasharray="3 3" />
            {config.comms === 'a' && <line x1={200} y1={90} x2={215} y2={38} stroke="#cbd5e1" strokeWidth="2" />}
            {config.comms === 'b' && <rect x={180} y={62} width={40} height={6} fill="#e2e8f0" />}
            {(config.comms === 'c' || config.comms === 'd') && (
              <>
                <path
                  d={
                    config.comms === 'c'
                      ? 'M176 62 Q200 88 224 62'
                      : 'M160 62 Q200 104 240 62'
                  }
                  fill="#1e293b"
                  stroke={isHl('comms') ? '#22d3ee' : '#e2e8f0'}
                  strokeWidth="1.6"
                />
                <line x1={200} y1={74} x2={200} y2={46} stroke="#94a3b8" strokeWidth="1.5" />
              </>
            )}
            <circle cx={200} cy={90} r={3.5} fill="#070B14" stroke="#22d3ee" />
            <text x={244} y={56} fill="#94a3b8" fontSize="8" fontFamily="monospace">
              RADIO ({config.comms.toUpperCase()})
            </text>
          </g>

          {/* Core Spacecraft Bus */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => onHoverPart('bus')}
            onMouseLeave={() => onHoverPart(null)}
          >
            <rect
              x={150}
              y={90}
              width={100}
              height={120}
              fill="#111827"
              stroke={isHl('bus') ? '#22d3ee' : '#64748b'}
            />
            <path d="M150 112 H250 M150 172 H250 M200 90 V112 M200 172 V210" stroke="#334155" />
            <text x={156} y={104} fill="#94a3b8" fontSize="7.5" fontFamily="monospace">
              LEFT {metrics.leftMassKg}kg
            </text>
            <text x={205} y={104} fill="#94a3b8" fontSize="7.5" fontFamily="monospace">
              RIGHT {metrics.rightMassKg}kg
            </text>
          </g>

          {/* Radiation Shielding Armor Plates */}
          {config.radiationShield && (
            <g
              className="cursor-pointer"
              onMouseEnter={() => onHoverPart('shield')}
              onMouseLeave={() => onHoverPart(null)}
              onClick={() => onSelectPart?.('shield')}
            >
              <rect
                x={145}
                y={104}
                width={5}
                height={70}
                fill="#10b981"
                fillOpacity="0.6"
                stroke="#34d399"
                strokeWidth="0.8"
              />
              <rect
                x={250}
                y={104}
                width={5}
                height={70}
                fill="#10b981"
                fillOpacity="0.6"
                stroke="#34d399"
                strokeWidth="0.8"
              />
              <text x={100} y={194} fill="#34d399" fontSize="7.5" fontFamily="monospace">
                RAD SHIELD
              </text>
            </g>
          )}

          {/* Thermal */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => onHoverPart('therm')}
            onMouseLeave={() => onHoverPart(null)}
            onClick={() => onSelectPart?.('therm')}
          >
            {config.therm === 'a' ? (
              <rect
                x={147}
                y={87}
                width={106}
                height={126}
                fill="none"
                stroke={isHl('therm') ? '#22d3ee' : '#eab308'}
                strokeDasharray="6 3"
              />
            ) : (
              <>
                <rect x={136} y={176} width={12} height={30} fill="#e2e8f0" opacity="0.85" />
                <rect x={252} y={176} width={12} height={30} fill="#e2e8f0" opacity="0.85" />
                {config.therm === 'c' && (
                  <path d="M142 180 V202 M258 180 V202" stroke="#f97316" strokeWidth="1.5" />
                )}
              </>
            )}
          </g>

          {/* Storage Unit (centered in lower bus bay) */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => onHoverPart('store')}
            onMouseLeave={() => onHoverPart(null)}
            onClick={() => onSelectPart?.('store')}
          >
            <rect
              x={193}
              y={178}
              width={14}
              height={config.store === 'a' ? 12 : config.store === 'b' ? 20 : 28}
              fill="#1e293b"
              stroke={isHl('store') ? '#22d3ee' : '#94a3b8'}
            />
          </g>

          {/* Propulsion & Fuel Tanks */}
          <g
            className="cursor-pointer"
            onMouseEnter={() => onHoverPart('prop')}
            onMouseLeave={() => onHoverPart(null)}
            onClick={() => onSelectPart?.('prop')}
          >
            <rect x={176} y={176} width={48} height={28} fill="none" stroke="#64748b" strokeDasharray="3 2" />
            <rect
              x={176}
              y={204 - fuelH}
              width={48}
              height={fuelH}
              fill={config.prop === 'd' ? '#38bdf8' : '#f59e0b'}
              opacity="0.55"
            />
            <path
              d={`M${200 - throat} 210 L${200 + throat} 210 L${200 + bellW / 2} ${yBell} L${200 - bellW / 2} ${yBell} Z`}
              fill="#334155"
              stroke={isHl('prop') ? '#22d3ee' : '#94a3b8'}
            />
            <path
              d={`M${200 - bellW / 2 + 2} ${yBell} L200 ${yBell + plumeLen} L${200 + bellW / 2 - 2} ${yBell} Z`}
              fill="url(#bp-plume)"
            />
            <text x={214 + bellW / 2} y={yBell + 4} fill="#94a3b8" fontSize="8" fontFamily="monospace">
              ENGINE
            </text>
          </g>

          {/* Installed Instruments placed dynamically in their assigned Left/Right bays */}
          {config.instruments.map((id, idx) => {
            const bay = getSensorBay(config, id);
            const sameBayBefore = config.instruments
              .slice(0, idx)
              .filter((prevId) => getSensorBay(config, prevId) === bay).length;
            const sx = bay === 'left' ? 166 + (sameBayBefore % 2) * 18 : 234 - (sameBayBefore % 2) * 18;
            const sy = (INSTRUMENT_Y_OFFSET[id] || 138) + Math.floor(sameBayBefore / 2) * 14;
            const inst = INSTRUMENTS.find((i) => i.id === id);
            return (
              <g
                key={id}
                className="cursor-pointer"
                onMouseEnter={() => onHoverPart(`inst:${id}`)}
                onMouseLeave={() => onHoverPart(null)}
                onClick={() => onSelectPart?.(`inst:${id}`)}
              >
                <line x1={sx} y1={sy} x2={200} y2={sy < 140 ? 112 : 172} stroke="#475569" strokeDasharray="2 2" />
                <rect
                  x={sx - 7}
                  y={sy - 8}
                  width={14}
                  height={16}
                  fill="#0f172a"
                  stroke={isHl(`inst:${id}`) ? '#fbbf24' : '#22d3ee'}
                  strokeWidth="1.4"
                />
                <circle cx={sx} cy={sy} r={3} fill="none" stroke="#22d3ee" strokeWidth="0.9" />
                <title>{`${inst?.name || id} (${bay.toUpperCase()} bay)`}</title>
              </g>
            );
          })}

          {/* CoM vs CoT alignment indicator */}
          {offPx > 0.5 && (
            <line
              x1={metrics.comBlueprintX}
              y1={metrics.comBlueprintY}
              x2={200}
              y2={metrics.comBlueprintY}
              stroke={offColor}
              strokeDasharray="2 2"
            />
          )}
          <g transform={`translate(${metrics.comBlueprintX}, ${metrics.comBlueprintY})`}>
            <path d="M-12 0 H12 M0 -12 V12" stroke="#F59E0B" strokeWidth="1" />
            <circle r="6" fill="#070B14" stroke="#F59E0B" />
            <path d="M0 0 H-6 A6 6 0 0 1 0 -6 Z M0 0 H6 A6 6 0 0 1 0 6 Z" fill="#F59E0B" />
          </g>
          <text
            x={metrics.comBlueprintX + 10}
            y={metrics.comBlueprintY - 8}
            fill="#F59E0B"
            fontSize="8.5"
            fontFamily="monospace"
          >
            CoM
          </text>
          <path d={`M200 ${yBell + 16} V${yBell - 6}`} stroke="#22d3ee" strokeWidth="1.2" />
          <path d={`M196 ${yBell - 2} L200 ${yBell - 10} L204 ${yBell - 2} Z`} fill="#22d3ee" />
          <text x={156} y={yBell + 10} fill="#22d3ee" fontSize="8.5" fontFamily="monospace">
            CoT
          </text>
        </svg>
      </div>

      {/* Plain-English Balance Explanation */}
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] leading-snug ${
          isBalanced
            ? 'border-emerald-700/50 bg-emerald-950/25 text-emerald-200'
            : 'border-amber-600/60 bg-amber-950/30 text-amber-200'
        }`}
      >
        {isBalanced ? (
          <span>
            <strong>Balanced ({metrics.leftMassKg}kg L vs {metrics.rightMassKg}kg R):</strong> Center of Mass (orange CoM) lines up with your center thruster (cyan CoT).
          </span>
        ) : (
          <span>
            <strong>Off-Center ({metrics.leftMassKg}kg Left vs {metrics.rightMassKg}kg Right):</strong> Click <strong>Move to Right →</strong> or <strong>Move to ← Left</strong> on any equipped sensor in Step 1 so both sides carry similar weight!
          </span>
        )}
      </div>
    </div>
  );
}
