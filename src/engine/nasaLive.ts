import { EARTH_HOTSPOTS } from '../data/missionData';
import { EarthHotspot, ScienceGoalKey } from '../types/mission';

export interface LiveNasaFeedResult {
  events: EarthHotspot[];
  isLive: boolean;
  sourceLabel: string;
}

interface EonetEvent {
  id: string;
  title: string;
  categories?: Array<{ id?: string; title?: string }>;
  geometry?: Array<{
    date?: string;
    type?: string;
    coordinates?: number[] | number[][][];
  }>;
}

const EONET_ENDPOINT = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=18';

function mapEonetCategory(title = ''): {
  category: EarthHotspot['category'];
  goals: ScienceGoalKey[];
  fact: string;
} {
  const t = title.toLowerCase();
  if (t.includes('fire') || t.includes('wildfire')) {
    return {
      category: 'Wildfire',
      goals: ['thermal', 'atmo', 'imaging'],
      fact: 'NASA MODIS & VIIRS thermal sensors spot active wildfires through thick smoke so rescue teams know where fires are spreading.',
    };
  }
  if (t.includes('storm') || t.includes('cyclone') || t.includes('hurricane')) {
    return {
      category: 'Cyclone',
      goals: ['atmo', 'climate', 'imaging'],
      fact: 'Infrared weather sounders measure icy storm-cloud tops from orbit to forecast cyclone strength and path.',
    };
  }
  if (t.includes('ice') || t.includes('snow') || t.includes('berg')) {
    return {
      category: 'Cryosphere',
      goals: ['climate', 'imaging', 'thermal'],
      fact: 'Polar satellites track drifting icebergs and glacier melt to help ships navigate safely and monitor sea level.',
    };
  }
  if (t.includes('volcano')) {
    return {
      category: 'Urban Heat',
      goals: ['thermal', 'atmo', 'imaging'],
      fact: 'Thermal radiometers and aerosol lidars track hot lava domes and high-altitude ash plumes to keep airplanes safe.',
    };
  }
  return {
    category: 'Ocean Bloom',
    goals: ['imaging', 'climate', 'atmo'],
    fact: 'Earth-observing satellites monitor ocean color, coastal blooms, and environmental shifts across our planet daily.',
  };
}

export async function fetchLiveNasaEvents(): Promise<LiveNasaFeedResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(EONET_ENDPOINT, { signal: controller.signal });
    window.clearTimeout(timeoutId);
    if (!res.ok) throw new Error('EONET unavailable');

    const data = (await res.json()) as { events?: EonetEvent[] };
    const parsed: EarthHotspot[] = [];

    for (const ev of data.events || []) {
      const geom = ev.geometry?.[ev.geometry.length - 1];
      if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) continue;
      const lon = Number(geom.coordinates[0]);
      const lat = Number(geom.coordinates[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const catTitle = ev.categories?.[0]?.title || '';
      const mapped = mapEonetCategory(catTitle || ev.title);
      parsed.push({
        id: `eonet-${ev.id}`,
        name: ev.title.length > 42 ? `${ev.title.slice(0, 39)}...` : ev.title,
        category: mapped.category,
        lat,
        lon,
        requiredGoals: mapped.goals,
        sciencePoints: 185,
        dataSizeGB: 14,
        fact: mapped.fact,
        isLiveNasa: true,
        eventDate: geom.date ? geom.date.slice(0, 10) : undefined,
      });

      if (parsed.length >= 7) break;
    }

    if (parsed.length >= 3) {
      return {
        events: parsed,
        isLive: true,
        sourceLabel: `LIVE NASA EONET (${parsed.length} Real Events)`,
      };
    }
    return {
      events: EARTH_HOTSPOTS,
      isLive: false,
      sourceLabel: 'NASA Curated Training Targets',
    };
  } catch {
    window.clearTimeout(timeoutId);
    return {
      events: EARTH_HOTSPOTS,
      isLive: false,
      sourceLabel: 'NASA Curated Training Targets (Offline Mode)',
    };
  }
}

export interface SpaceQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const SPACE_QUIZ_BANK: SpaceQuizQuestion[] = [
  {
    id: 'q-orbit',
    question: 'Why does a rocket tilt sideways after lifting off instead of flying straight up forever?',
    options: [
      'To build super-fast sideways speed (~7.7 km/s) so it stays in orbit around Earth',
      'To dodge the Moon on the way up',
      'Because rocket engines stop working if they point straight up',
    ],
    correctIndex: 0,
    explanation: 'Orbit is falling around Earth! Going sideways at ~7.7 km/s lets a spacecraft curve around Earth instead of falling back down.',
  },
  {
    id: 'q-fire',
    question: 'Which satellite sensor can spot wildfires even through thick dark smoke?',
    options: [
      'A regular flashlight camera',
      'Thermal Infrared Radiometer (heat sensor)',
      'A microphone listening from space',
    ],
    correctIndex: 1,
    explanation: 'Thermal Infrared sensors detect heat glowing from active fires right through smoke clouds, day or night!',
  },
  {
    id: 'q-staging',
    question: 'Why do space rockets drop empty lower fuel tanks during flight (Staging)?',
    options: [
      'To make the rocket lighter so the next engine pushes much faster',
      'To turn the tanks into new moons',
      'Because fuel tanks melt if kept for more than 2 minutes',
    ],
    correctIndex: 0,
    explanation: 'Dropping heavy empty tanks sheds dead weight, giving the upper stage way more Δv (speed boost) from the same fuel!',
  },
  {
    id: 'q-com',
    question: 'What happens if all heavy cameras sit on one side of a satellite?',
    options: [
      'The satellite spins off course when firing its engine (Center of Mass imbalance)',
      'The satellite turns invisible to ground stations',
      'The solar panels produce double electricity',
    ],
    correctIndex: 0,
    explanation: 'Just like balancing a seesaw, keeping Center of Mass lined up with the rocket nozzle keeps the satellite flying straight!',
  },
  {
    id: 'q-l1',
    question: 'Why do NASA space-weather satellites sit at the Sun–Earth L1 point?',
    options: [
      'It gives continuous sunlight and 30–60 minutes early warning of solar storms',
      'It is the coldest place inside Earth’s shadow',
      'Astronauts refuel rockets there every week',
    ],
    correctIndex: 0,
    explanation: 'Sitting 1.5 million km toward the Sun lets L1 satellites spot solar storms before they reach Earth’s power grids and astronauts!',
  },
];

export function downloadMissionCertificate(params: {
  missionTitle: string;
  modeLabel: string;
  score: number;
  stars: number;
  highlightStat: string;
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 620;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Deep aerospace certificate backdrop
  const bg = ctx.createLinearGradient(0, 0, 1000, 620);
  bg.addColorStop(0, '#070B14');
  bg.addColorStop(1, '#0E1930');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1000, 620);

  // Double border frame
  ctx.strokeStyle = '#22D3EE';
  ctx.lineWidth = 4;
  ctx.strokeRect(24, 24, 952, 572);
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(36, 36, 928, 548);

  // Header
  ctx.fillStyle = '#22D3EE';
  ctx.font = 'bold 18px monospace';
  ctx.fillText('NASA SPACE APPS CHALLENGE · MISSION ARCHITECT', 72, 92);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText('OFFICIAL FLIGHT CERTIFICATE', 72, 152);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '20px sans-serif';
  ctx.fillText(`Awarded to Flight Architect for completing ${params.modeLabel}:`, 72, 212);

  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 32px sans-serif';
  ctx.fillText(params.missionTitle, 72, 265);

  // Stars & Score Box
  ctx.fillStyle = '#111A2E';
  ctx.fillRect(72, 310, 856, 155);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 310, 856, 155);

  ctx.fillStyle = '#FBBF24';
  ctx.font = 'bold 44px monospace';
  ctx.fillText(`${'★'.repeat(params.stars)}${'☆'.repeat(3 - params.stars)}`, 108, 378);

  ctx.fillStyle = '#34D399';
  ctx.font = 'bold 36px monospace';
  ctx.fillText(`SCORE ${params.score}/100`, 360, 376);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '20px monospace';
  ctx.fillText(params.highlightStat, 108, 428);

  // Footer
  ctx.fillStyle = '#64748B';
  ctx.font = '16px monospace';
  ctx.fillText(
    `DATE: ${new Date().toISOString().slice(0, 10)}   ·   PROJECT AEGIS EARTH & SPACE OBSERVER`,
    72,
    540,
  );

  const link = document.createElement('a');
  link.download = `mission-certificate-${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
