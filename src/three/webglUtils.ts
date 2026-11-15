import * as THREE from 'three';

export function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function afterDraw(renderer: THREE.WebGLRenderer, cb: () => void): number {
  try {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          return window.setTimeout(poll, 5);
        }
        if (sync) gl.deleteSync(sync);
        return window.setTimeout(cb, 80);
      };
      return window.setTimeout(poll, 5);
    }
  } catch {
    // Fallback
  }
  return window.setTimeout(cb, 80);
}

export function disposeObject3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => {
        materials.add(m);
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) textures.add(std.map);
        if (std.emissiveMap) textures.add(std.emissiveMap);
        if (std.roughnessMap) textures.add(std.roughnessMap);
      });
    }
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}

export function createSolarPanelTexture(
  cols: number,
  rows: number,
  maxAniso: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d2b6b';
  ctx.fillRect(0, 0, 128, 128);

  // Subtle photovoltaic wafer sheen
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
  grad.addColorStop(0.5, 'rgba(30, 58, 138, 0.0)');
  grad.addColorStop(1, 'rgba(99, 102, 241, 0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 124, 124);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(147, 197, 253, 0.45)';
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo((128 / 4) * i, 0);
    ctx.lineTo((128 / 4) * i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (128 / 4) * i);
    ctx.lineTo(128, (128 / 4) * i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(cols, rows);
  tex.anisotropy = Math.min(8, maxAniso || 1);
  return tex;
}

export function createKaptonFoilTexture(maxAniso: number): {
  colorTex: THREE.CanvasTexture;
  bumpTex: THREE.CanvasTexture;
} {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  // Base warm Kapton gold
  ctx.fillStyle = '#d49a2a';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Crinkled faceted MLI blanket cells
  for (let i = 0; i < 180; i++) {
    const x = ((i * 73) % size);
    const y = ((i * 137) % size);
    const w = 14 + (i % 5) * 8;
    const h = 12 + (i % 4) * 7;
    const shade = 0.82 + ((i * 29) % 36) / 100;
    const r = Math.min(255, Math.round(218 * shade));
    const g = Math.min(255, Math.round(158 * shade));
    const b = Math.min(255, Math.round(42 * shade));

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((i % 9) - 4) * 0.22);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -h * 0.35);
    ctx.lineTo(w * 0.45, -h * 0.5);
    ctx.lineTo(w * 0.5, h * 0.4);
    ctx.lineTo(-w * 0.4, h * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 232, 165, 0.22)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();

    const bv = Math.round(95 + ((i * 41) % 120));
    bctx.save();
    bctx.translate(x, y);
    bctx.rotate(((i % 9) - 4) * 0.22);
    bctx.fillStyle = `rgb(${bv},${bv},${bv})`;
    bctx.fillRect(-w * 0.45, -h * 0.45, w * 0.9, h * 0.9);
    bctx.restore();
  }

  // Subtle Kapton blanket seam tape lines
  ctx.strokeStyle = 'rgba(130, 82, 14, 0.45)';
  ctx.lineWidth = 2;
  for (let p = 64; p < size; p += 64) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.wrapS = THREE.RepeatWrapping;
  colorTex.wrapT = THREE.RepeatWrapping;
  colorTex.anisotropy = Math.min(8, maxAniso || 1);

  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.wrapS = THREE.RepeatWrapping;
  bumpTex.wrapT = THREE.RepeatWrapping;
  bumpTex.anisotropy = Math.min(8, maxAniso || 1);

  return { colorTex, bumpTex };
}

export function createRadiatorTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e8eef5';
  ctx.fillRect(0, 0, 128, 128);

  // Louver / thermal radiator fin channels
  for (let y = 6; y < 128; y += 12) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(6, y, 116, 4);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(6, y + 4, 116, 1.5);
  }
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 125, 125);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 1);
  return tex;
}

export function createEarthTextures(maxAniso: number) {
  const w = 1024;
  const h = 512;
  const dayCanvas = document.createElement('canvas');
  dayCanvas.width = w;
  dayCanvas.height = h;
  const ctx = dayCanvas.getContext('2d')!;

  // Deep ocean gradient
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#133a63');
  ocean.addColorStop(0.25, '#0b2f5e');
  ocean.addColorStop(0.5, '#09386e');
  ocean.addColorStop(0.75, '#0b2f5e');
  ocean.addColorStop(1, '#153a60');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // Subtle bathymetry waves
  ctx.fillStyle = 'rgba(14, 116, 144, 0.14)';
  for (let i = 0; i < 40; i++) {
    const rx = ((i * 197) % w);
    const ry = 60 + ((i * 93) % (h - 120));
    ctx.beginPath();
    ctx.ellipse(rx, ry, 75, 18, (i % 5) * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helper to convert lon/lat to texture x/y
  const xy = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * w,
    ((90 - lat) / 180) * h,
  ];

  const drawContinent = (pts: Array<[number, number]>, color: string, desert = false) => {
    ctx.save();
    ctx.beginPath();
    pts.forEach(([lon, lat], i) => {
      const [x, y] = xy(lon, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.shadowColor = 'rgba(34, 211, 238, 0.35)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.36)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    if (desert) {
      ctx.clip();
      ctx.fillStyle = 'rgba(194, 154, 96, 0.48)';
      ctx.fillRect(0, h * 0.28, w, h * 0.2);
    }
    ctx.restore();
  };

  // Stylized world landmasses accurately aligned to lon/lat for real ground-track matching!
  // North America
  drawContinent(
    [
      [-165, 65], [-140, 70], [-95, 70], [-65, 58], [-55, 48], [-75, 35],
      [-82, 25], [-96, 20], [-85, 10], [-92, 14], [-105, 22], [-115, 32],
      [-125, 48], [-152, 58],
    ],
    '#2f6a47',
  );
  // Greenland
  drawContinent(
    [[-52, 60], [-42, 82], [-18, 78], [-25, 66], [-44, 60]],
    '#cbd5e1',
  );
  // South America
  drawContinent(
    [
      [-78, 10], [-62, 11], [-36, -6], [-40, -22], [-56, -38], [-68, -54],
      [-74, -42], [-72, -18], [-81, -5],
    ],
    '#24643f',
  );
  // Europe
  drawContinent(
    [
      [-10, 36], [-9, 44], [2, 51], [12, 58], [26, 70], [45, 68],
      [48, 46], [28, 41], [14, 40], [4, 43], [-5, 36],
    ],
    '#386e4c',
  );
  // Africa
  drawContinent(
    [
      [-17, 15], [-6, 35], [12, 34], [32, 31], [43, 12], [51, 11],
      [40, -10], [28, -33], [18, -34], [12, -16], [8, 4], [-8, 5],
    ],
    '#4f6f42',
    true,
  );
  // Asia
  drawContinent(
    [
      [44, 42], [55, 68], [105, 74], [168, 66], [142, 46], [124, 34],
      [108, 18], [102, 4], [96, 16], [78, 8], [68, 24], [52, 25], [38, 30],
    ],
    '#3b6b47',
    true,
  );
  // Maritime Southeast Asia / Indonesia (Borneo, Sumatra, Java, Sulawesi, Papua)
  drawContinent([[95, 5], [105, -5], [103, -6], [97, 2]], '#1e6840');
  drawContinent([[106, -6], [114, -7], [114, -8.5], [105.5, -7.2]], '#1e6840');
  drawContinent([[109, 2], [118, 5], [118, -3], [110, -3]], '#1e6840');
  drawContinent([[131, -1], [147, -8], [141, -9], [132, -4]], '#266c44');
  // Australia
  drawContinent(
    [[114, -22], [130, -12], [143, -11], [153, -27], [146, -38], [128, -33], [115, -34]],
    '#8c6239',
  );

  // Polar ice caps
  ctx.fillStyle = '#dce8f4';
  ctx.fillRect(0, 0, w, 24);
  ctx.fillRect(0, h - 32, w, 32);

  // Subtle grid lines for scientific globe feel
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const [gx] = xy(lon, 0);
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, gy] = xy(0, lat);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  const dayTex = new THREE.CanvasTexture(dayCanvas);
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.anisotropy = Math.min(8, maxAniso || 1);

  // Night city-lights texture (subtle NASA Black Marble coastal hubs)
  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = 512;
  nightCanvas.height = 256;
  const nctx = nightCanvas.getContext('2d')!;
  nctx.fillStyle = '#000000';
  nctx.fillRect(0, 0, 512, 256);
  const cityHubs: Array<[number, number, number]> = [
    [-74, 40.7, 16], [-87, 41.8, 12], [-118, 34, 14], [-99, 19.4, 10],
    [-46.6, -23.5, 13], [-58.4, -34.6, 10], [-0.1, 51.5, 16], [2.3, 48.8, 15],
    [13.4, 52.5, 12], [37.6, 55.7, 13], [31.2, 30, 14], [3.3, 6.5, 10],
    [55.3, 25.2, 12], [72.8, 19, 16], [77.2, 28.6, 15], [100.5, 13.7, 12],
    [106.8, -6.2, 16], [103.8, 1.3, 12], [116.4, 39.9, 16], [121.5, 31.2, 18],
    [139.7, 35.7, 18], [127, 37.5, 14], [151.2, -33.8, 11],
  ];
  cityHubs.forEach(([lon, lat, count]) => {
    const cx = ((lon + 180) / 360) * 512;
    const cy = ((90 - lat) / 180) * 256;
    for (let i = 0; i < count; i++) {
      const dx = Math.sin(i * 4.1 + lon) * (1.5 + (i % 4) * 1.4);
      const dy = Math.cos(i * 3.7 + lat) * (1.2 + (i % 3) * 1.3);
      nctx.fillStyle = i % 3 === 0 ? 'rgba(251, 191, 36, 0.75)' : 'rgba(245, 158, 11, 0.55)';
      nctx.fillRect(cx + dx, cy + dy, 1.6, 1.6);
    }
  });
  const nightTex = new THREE.CanvasTexture(nightCanvas);
  nightTex.colorSpace = THREE.SRGBColorSpace;

  // Cloud layer canvas
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 512;
  cloudCanvas.height = 256;
  const cctx = cloudCanvas.getContext('2d')!;
  cctx.clearRect(0, 0, 512, 256);
  for (let i = 0; i < 120; i++) {
    const cx = (i * 83) % 512;
    const cy = 20 + ((i * 47) % 216);
    const rx = 18 + (i % 5) * 9;
    const ry = 4 + (i % 4) * 3;
    cctx.fillStyle = `rgba(241, 245, 249, ${0.1 + (i % 4) * 0.05})`;
    cctx.beginPath();
    cctx.ellipse(cx, cy, rx, ry, ((i % 7) - 3) * 0.15, 0, Math.PI * 2);
    cctx.fill();
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;

  return { dayTex, nightTex, cloudTex };
}

export function createMoonTextures(maxAniso: number) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // Lunar highland regolith base gradient
  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0, '#94a3b8');
  baseGrad.addColorStop(0.5, '#7c8798');
  baseGrad.addColorStop(1, '#8d99aa');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  const xy = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * w,
    ((90 - lat) / 180) * h,
  ];

  // Dark basaltic lunar maria (Mare Tranquillitatis, Serenitatis, Imbrium, Procellarum)
  const maria: Array<[number, number, number, number, number]> = [
    [-25, 25, 115, 78, -0.2],   // Oceanus Procellarum
    [-18, 36, 68, 52, 0.15],    // Mare Imbrium
    [18, 28, 52, 42, -0.1],     // Mare Serenitatis
    [32, 8, 58, 44, 0.2],       // Mare Tranquillitatis
    [52, 16, 40, 32, 0],        // Mare Crisium
    [-18, -22, 46, 36, 0.25],   // Mare Nubium
    [45, -18, 44, 34, -0.15],   // Mare Fecunditatis
  ];
  maria.forEach(([lon, lat, rx, ry, rot]) => {
    const [cx, cy] = xy(lon, lat);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, rx);
    g.addColorStop(0, 'rgba(51, 60, 74, 0.85)');
    g.addColorStop(0.7, 'rgba(64, 74, 90, 0.65)');
    g.addColorStop(1, 'rgba(100, 112, 128, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Procedural impact craters with bright rims and shadowed bowls
  for (let i = 0; i < 160; i++) {
    const cx = (i * 193 + 47) % w;
    const cy = 24 + ((i * 109 + 19) % (h - 48));
    const r = 4 + (i % 7) * 3.8;
    // Shadowed bowl
    ctx.fillStyle = 'rgba(42, 49, 61, 0.45)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // Sunlit crater rim
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.42)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 1, r, -Math.PI * 0.8, Math.PI * 0.2);
    ctx.stroke();
  }

  // Prominent Tycho bright ejecta ray crater in southern highlands
  const [tx, ty] = xy(-11, -43);
  ctx.strokeStyle = 'rgba(241, 245, 249, 0.32)';
  ctx.lineWidth = 1.5;
  for (let k = 0; k < 10; k++) {
    const ang = (k / 10) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + Math.cos(ang) * 75, ty + Math.sin(ang) * 55);
    ctx.stroke();
  }
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.arc(tx, ty, 6, 0, Math.PI * 2);
  ctx.fill();

  // Subtle lat/lon scientific grid
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.08)';
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const [gx] = xy(lon, 0);
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const [, gy] = xy(0, lat);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  const dayTex = new THREE.CanvasTexture(canvas);
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.anisotropy = Math.min(8, maxAniso || 1);
  return { dayTex };
}

export function createMarsTextures(maxAniso: number) {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const marsGrad = ctx.createLinearGradient(0, 0, 0, h);
  marsGrad.addColorStop(0, '#c25934');
  marsGrad.addColorStop(0.5, '#b84b28');
  marsGrad.addColorStop(1, '#9a3b1e');
  ctx.fillStyle = marsGrad;
  ctx.fillRect(0, 0, w, h);

  // Dark basaltic plains (Syrtis Major, Acidalia)
  for (let i = 0; i < 24; i++) {
    const cx = (i * 157 + 60) % w;
    const cy = 70 + ((i * 89) % (h - 140));
    ctx.fillStyle = 'rgba(84, 34, 22, 0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 45 + (i % 5) * 20, 22 + (i % 4) * 10, (i % 3) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Valles Marineris canyon scar
  ctx.strokeStyle = 'rgba(62, 22, 14, 0.72)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(w * 0.25, h * 0.54);
  ctx.quadraticCurveTo(w * 0.34, h * 0.52, w * 0.43, h * 0.55);
  ctx.stroke();

  // Polar CO2 ice caps
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, w, 18);
  ctx.fillRect(0, h - 20, w, 20);

  const dayTex = new THREE.CanvasTexture(canvas);
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.anisotropy = Math.min(8, maxAniso || 1);
  return { dayTex };
}
