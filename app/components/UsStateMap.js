'use client';
import { useRouter } from 'next/navigation';
import usa from '@svg-maps/usa';
import { STATE_DISPLAY } from '@/lib/manual-data';

// @svg-maps/usa names map 1:1 to our slugs once lowercased + hyphenated
// ("New York" -> "new-york"). Anything without a /dmv-test page (e.g.
// "Washington, DC") falls through and renders inert.
const slugFor = (name) => name.toLowerCase().replace(/[\s,]+/g, '-');

/**
 * Interactive US map. Each state is an SVG link to its /dmv-test landing, so a
 * click navigates (client-side) and hover highlights it. This is the UX layer;
 * the crawlable SEO path lives in the plain HTML "All 50 states" link that the
 * home renders alongside the map (Google does not reliably follow SVG links).
 *
 * Loaded via next/dynamic({ ssr:false }) from the home — the path data is ~136KB,
 * so keeping it out of the server HTML protects the home's LCP on mobile.
 */
export default function UsStateMap() {
  const router = useRouter();
  return (
    <svg
      viewBox={usa.viewBox}
      className="w-full h-auto block select-none [filter:drop-shadow(0_4px_8px_rgba(11,28,61,0.10))]"
      role="img"
      aria-label="Map of US states. Pick your state to start a free DMV practice test."
    >
      {usa.locations.map((loc) => {
        const slug = slugFor(loc.name);
        const name = STATE_DISPLAY[slug];
        if (!name) {
          return (
            <path key={loc.id} d={loc.path} fill="#E2E8F0" stroke="#ffffff" strokeWidth={0.8} />
          );
        }
        const href = `/dmv-test/${slug}`;
        return (
          <a
            key={loc.id}
            href={href}
            aria-label={name}
            onClick={(e) => { e.preventDefault(); router.push(href); }}
          >
            <path
              d={loc.path}
              strokeWidth={1}
              className="fill-[#C3D8F8] stroke-white transition-colors duration-150 hover:fill-[#2563EB] cursor-pointer"
            >
              <title>{name}</title>
            </path>
          </a>
        );
      })}
    </svg>
  );
}
