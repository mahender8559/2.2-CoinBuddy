import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Palette } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

type Hsl = { h: number; s: number; l: number };

type ThemePreset = {
  id: 'blue' | 'green' | 'purple' | 'orange' | 'pink';
  name: string;
  color: string;
};

const PRESETS: ThemePreset[] = [
  { id: 'blue', name: 'Ocean', color: '#246bfd' },
  { id: 'green', name: 'Emerald', color: '#16834d' },
  { id: 'purple', name: 'Violet', color: '#7b3fe4' },
  { id: 'orange', name: 'Amber', color: '#bf6709' },
  { id: 'pink', name: 'Rose', color: '#c43b6c' },
];

const CUSTOM_PREFIX = 'custom-';
const DEFAULT_CUSTOM = '#3f7cff';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string) {
  const raw = value.replace('#', '').trim();
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw.toLowerCase()}` : DEFAULT_CUSTOM;
}

function paletteCustomHex(palette: string) {
  return palette.startsWith(CUSTOM_PREFIX)
    ? normalizeHex(palette.slice(CUSTOM_PREFIX.length))
    : null;
}

function hexToHsl(hex: string): Hsl {
  const normalized = normalizeHex(hex).slice(1);
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex({ h, s, l }: Hsl) {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];
  return `#${[r, g, b].map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function readableOnColor(hex: string) {
  const raw = normalizeHex(hex).slice(1);
  const channels = [0, 2, 4].map(index => Number.parseInt(raw.slice(index, index + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.48 ? '#08111f' : '#ffffff';
}

function themeName(palette: string) {
  if (palette.startsWith(CUSTOM_PREFIX)) return 'Custom';
  return PRESETS.find(item => item.id === palette)?.name ?? 'Ocean';
}

export function ThemeSystemBridge() {
  const { colorPalette, setColorPalette } = useAppContext();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const customFromState = paletteCustomHex(colorPalette);
  const initialHsl = useMemo(() => hexToHsl(customFromState ?? PRESETS.find(item => item.id === colorPalette)?.color ?? DEFAULT_CUSTOM), [colorPalette, customFromState]);
  const [hue, setHue] = useState(initialHsl.h);
  const [saturation, setSaturation] = useState(Math.max(48, initialHsl.s));
  const [lightness, setLightness] = useState(clamp(initialHsl.l, 32, 68));
  const ringRef = useRef<HTMLDivElement>(null);

  const liveHex = hslToHex({ h: hue, s: saturation, l: lightness });
  const isCustom = colorPalette.startsWith(CUSTOM_PREFIX);

  const applyRuntimeColor = (hex: string) => {
    const root = document.documentElement;
    root.style.setProperty('--cb-custom-accent', normalizeHex(hex));
    root.style.setProperty('--cb-custom-on-accent', readableOnColor(hex));
  };

  const commitCustom = (next: Hsl) => {
    const hex = hslToHex(next);
    applyRuntimeColor(hex);
    setColorPalette(`${CUSTOM_PREFIX}${hex.slice(1)}`);
  };

  useEffect(() => {
    const hex = paletteCustomHex(colorPalette);
    if (!hex) return;
    applyRuntimeColor(hex);
    const next = hexToHsl(hex);
    setHue(next.h);
    setSaturation(Math.max(48, next.s));
    setLightness(clamp(next.l, 32, 68));
  }, [colorPalette]);

  useEffect(() => {
    const locate = () => {
      const firstPreset = document.querySelector<HTMLButtonElement>('button[aria-label="Use blue color theme"]:not(.cb-theme-swatch-button)');
      const nextTarget = firstPreset?.parentElement?.parentElement ?? null;
      setTarget(current => current === nextTarget ? current : nextTarget);
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!target) return;
    target.classList.add('cb-theme-picker-enhanced');
    return () => target.classList.remove('cb-theme-picker-enhanced');
  }, [target]);

  const choosePreset = (preset: ThemePreset) => {
    setColorPalette(preset.id);
  };

  const chooseCustom = () => {
    const base = customFromState ?? PRESETS.find(item => item.id === colorPalette)?.color ?? DEFAULT_CUSTOM;
    const next = hexToHsl(base);
    setHue(next.h);
    setSaturation(Math.max(48, next.s));
    setLightness(clamp(next.l, 32, 68));
    commitCustom({ h: next.h, s: Math.max(48, next.s), l: clamp(next.l, 32, 68) });
  };

  const updateHueFromPointer = (event: PointerEvent<HTMLDivElement>, commit = false) => {
    const ring = ringRef.current;
    if (!ring) return;
    const rect = ring.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 450) % 360;
    const nextHue = Math.round(angle);
    setHue(nextHue);
    const next = { h: nextHue, s: saturation, l: lightness };
    applyRuntimeColor(hslToHex(next));
    if (commit) commitCustom(next);
  };

  const handleRingKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -3 : 3;
    const nextHue = (hue + delta + 360) % 360;
    setHue(nextHue);
    commitCustom({ h: nextHue, s: saturation, l: lightness });
  };

  const knobAngle = (hue - 90) * Math.PI / 180;
  const knobX = 50 + Math.cos(knobAngle) * 42;
  const knobY = 50 + Math.sin(knobAngle) * 42;

  if (!target) return null;

  return createPortal(
    <div className="cb-theme-picker-portal" data-testid="app-theme-picker">
      <button
        type="button"
        className="cb-theme-picker-toggle v35-focus-ring"
        aria-expanded={expanded}
        aria-controls="coinbuddy-theme-options"
        onClick={() => setExpanded(open => !open)}
        data-testid="app-theme-toggle"
      >
        <span className="cb-theme-picker-icon"><Palette className="h-4 w-4" /></span>
        <span className="cb-theme-picker-copy">
          <span className="cb-theme-picker-title">App Theme</span>
          <span className="cb-theme-picker-description">{themeName(colorPalette)}{customFromState ? ` · ${customFromState.toUpperCase()}` : ''}</span>
        </span>
        <span className="cb-theme-current-swatch" style={{ background: customFromState ?? PRESETS.find(item => item.id === colorPalette)?.color ?? PRESETS[0].color }} aria-hidden="true" />
        <ChevronDown className={`h-4 w-4 shrink-0 text-on-surface-variant transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded ? (
        <div id="coinbuddy-theme-options" className="cb-theme-picker-options">
          <div className="cb-theme-preset-strip" aria-label="Theme colors">
            {PRESETS.map(preset => (
              <button
                key={preset.id}
                type="button"
                aria-label={`Use ${preset.id} color theme`}
                aria-pressed={colorPalette === preset.id}
                className="cb-theme-swatch-button v35-focus-ring"
                onClick={() => choosePreset(preset)}
              >
                <span className="cb-theme-swatch" style={{ background: preset.color }}>
                  {colorPalette === preset.id ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span>{preset.name}</span>
              </button>
            ))}
            <button
              type="button"
              aria-label="Use custom color theme"
              aria-pressed={isCustom}
              className="cb-theme-swatch-button v35-focus-ring"
              onClick={chooseCustom}
            >
              <span className="cb-theme-swatch cb-theme-swatch-rainbow">
                {isCustom ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <span>Custom</span>
            </button>
          </div>

          {isCustom ? (
            <div className="cb-custom-theme-panel" data-testid="custom-theme-controls">
              <div className="cb-custom-theme-ring-column">
                <div
                  ref={ringRef}
                  className="cb-custom-hue-ring v35-focus-ring"
                  role="slider"
                  tabIndex={0}
                  aria-label="Custom theme hue"
                  aria-valuemin={0}
                  aria-valuemax={359}
                  aria-valuenow={hue}
                  onKeyDown={handleRingKey}
                  onPointerDown={event => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    updateHueFromPointer(event);
                  }}
                  onPointerMove={event => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateHueFromPointer(event);
                  }}
                  onPointerUp={event => {
                    updateHueFromPointer(event, true);
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                >
                  <span className="cb-custom-hue-ring-inner" style={{ background: liveHex }} />
                  <span className="cb-custom-hue-knob" style={{ left: `${knobX}%`, top: `${knobY}%`, background: liveHex }} />
                </div>
                <div className="cb-custom-color-readout">
                  <span className="cb-custom-color-dot" style={{ background: liveHex }} />
                  <span>{liveHex.toUpperCase()}</span>
                </div>
              </div>

              <div className="cb-custom-theme-sliders">
                <label>
                  <span><span>Saturation</span><strong>{saturation}%</strong></span>
                  <input
                    type="range"
                    min="35"
                    max="100"
                    value={saturation}
                    aria-label="Custom theme saturation"
                    onChange={event => {
                      const nextValue = Number(event.target.value);
                      setSaturation(nextValue);
                      applyRuntimeColor(hslToHex({ h: hue, s: nextValue, l: lightness }));
                    }}
                    onPointerUp={() => commitCustom({ h: hue, s: saturation, l: lightness })}
                    onKeyUp={() => commitCustom({ h: hue, s: saturation, l: lightness })}
                    onBlur={() => commitCustom({ h: hue, s: saturation, l: lightness })}
                  />
                </label>
                <label>
                  <span><span>Brightness</span><strong>{lightness}%</strong></span>
                  <input
                    type="range"
                    min="28"
                    max="72"
                    value={lightness}
                    aria-label="Custom theme brightness"
                    onChange={event => {
                      const nextValue = Number(event.target.value);
                      setLightness(nextValue);
                      applyRuntimeColor(hslToHex({ h: hue, s: saturation, l: nextValue }));
                    }}
                    onPointerUp={() => commitCustom({ h: hue, s: saturation, l: lightness })}
                    onKeyUp={() => commitCustom({ h: hue, s: saturation, l: lightness })}
                    onBlur={() => commitCustom({ h: hue, s: saturation, l: lightness })}
                  />
                </label>
                <p>Choose any hue, then tune saturation and brightness. Financial green/red status colors stay semantic.</p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>,
    target,
  );
}
