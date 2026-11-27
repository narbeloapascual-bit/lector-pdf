import type { SVGProps } from 'react'

const base = (d: string) =>
  function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
        <path d={d} />
      </svg>
    )
  }

export const IconMenu = base('M3 6h18M3 12h18M3 18h18')
export const IconOpen = base('M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 18v-6M9 15l3-3 3 3')
export const IconPrev = base('M15 18l-6-6 6-6')
export const IconNext = base('M9 18l6-6-6-6')
export const IconUp = base('M18 15l-6-6-6 6')
export const IconDown = base('M6 9l6 6 6-6')
export const IconZoomIn = base('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M11 8v6M8 11h6')
export const IconZoomOut = base('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6')
export const IconSearch = base('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5')
export const IconMoon = base('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z')
export const IconSun = base('M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4')
export const IconExpand = base('M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3')
export const IconShrink = base('M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3')
export const IconClose = base('M18 6L6 18M6 6l12 12')
export const IconChevron = base('M9 18l6-6-6-6')
