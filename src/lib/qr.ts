import QRCode from 'qrcode';

type Cache = Map<string, string>;

function getCache(): Cache {
  const g = globalThis as unknown as { __gosQrSvgCache?: Cache };
  if (!g.__gosQrSvgCache) g.__gosQrSvgCache = new Map();
  return g.__gosQrSvgCache;
}

export async function renderQrSvg(input: { text: string; size?: number; dark?: string; light?: string }) {
  const text = String(input.text ?? '').trim();
  if (!text) return '';
  const size = Number.isFinite(input.size) && (input.size as number) > 0 ? Math.round(input.size as number) : 190;
  const dark = String(input.dark ?? '#7b1fa2').trim() || '#7b1fa2';
  const light = String(input.light ?? '#ffffff').trim() || '#ffffff';
  const key = `${size}:${dark}:${light}:${text}`;
  const cache = getCache();
  const cached = cache.get(key);
  if (cached) return cached;
  const svg = await QRCode.toString(text, {
    type: 'svg',
    width: size,
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark, light },
  });
  cache.set(key, svg);
  const max = 50;
  while (cache.size > max) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
  return svg;
}

