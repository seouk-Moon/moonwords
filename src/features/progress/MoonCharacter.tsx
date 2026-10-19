import { useId } from 'react';
import { moonLightPath } from './moon-growth';

export function MoonCharacter({ light, joyful = false }: { light: number; joyful?: boolean }) {
  const id = useId().replace(/:/g, '');
  return <svg className={`moon-character ${joyful ? 'is-joyful' : ''}`} viewBox="0 0 200 210" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id={`${id}-shade`} cx="35%" cy="25%"><stop stopColor="#44526e" /><stop offset="1" stopColor="#2b3651" /></radialGradient>
      <linearGradient id={`${id}-light`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff7db" /><stop offset="1" stopColor="#f6cc76" /></linearGradient>
      <clipPath id={`${id}-disk`}><circle cx="100" cy="100" r="76" /></clipPath>
    </defs>
    <ellipse className="moon-shadow" cx="100" cy="198" rx="45" ry="5" fill="#050d24" opacity=".23" />
    <g className="moon-body">
      <circle cx="100" cy="100" r="82" fill="#ffe4a0" opacity=".055" />
      <circle cx="100" cy="100" r="76" fill={`url(#${id}-shade)`} stroke="#e8dbb0" strokeOpacity=".2" />
      <path className="moon-light" d={moonLightPath(light)} fill={`url(#${id}-light)`} />
      <g clipPath={`url(#${id}-disk)`} fill="#b89c6b" opacity=".17">
        <circle cx="139" cy="58" r="13" /><circle cx="154" cy="126" r="8" /><circle cx="64" cy="143" r="16" /><circle cx="82" cy="48" r="6" />
        <circle cx="129" cy="151" r="4" /><circle cx="44" cy="79" r="5" />
      </g>
      <g className="moon-face" stroke="#fff6da" strokeWidth="4.5" strokeLinecap="round" fill="none">
        <g className="moon-eyes"><path d="M 78 94 v 6 M 121 94 v 6" /></g>
        <path className="moon-smile" d={joyful ? 'M 88 112 Q 100 130 112 112 Z' : 'M 91 114 Q 100 122 109 114'} />
      </g>
      <g fill="#efa799" opacity=".55"><ellipse cx="68" cy="110" rx="8" ry="4" /><ellipse cx="132" cy="110" rx="8" ry="4" /></g>
    </g>
  </svg>;
}
