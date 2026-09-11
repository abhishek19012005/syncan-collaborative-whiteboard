import type { CSSProperties } from 'react'

type Props = { size?: number; showGesture?: boolean; className?: string }

export function SyncanLogo({ size = 48, showGesture = true, className = '' }: Props) {
  const style: CSSProperties = { width: size, height: size }
  return (
    <svg className={`syncan-logo ${className}`} style={style} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="SYNCAN logo" role="img">
      <defs>
        <linearGradient id="syncan-s" x1="15" y1="18" x2="100" y2="104" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16C8EA"/>
          <stop offset="0.48" stopColor="#315FF3"/>
          <stop offset="0.72" stopColor="#B63FEA"/>
          <stop offset="1" stopColor="#FF9A35"/>
        </linearGradient>
        <linearGradient id="syncan-pen" x1="78" y1="10" x2="105" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#15254D"/>
          <stop offset="1" stopColor="#314D86"/>
        </linearGradient>
        <linearGradient id="syncan-ink" x1="81" y1="37" x2="67" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6D55F6"/>
          <stop offset="1" stopColor="#18CBE7"/>
        </linearGradient>
      </defs>
      {/* Main S: a single energetic drawing gesture */}
      <path d="M88 25C77 14 57 12 39 18C22 24 13 36 18 48C23 61 42 62 60 64C78 66 91 72 89 85C87 99 67 108 47 105C31 103 20 96 15 87" stroke="url(#syncan-s)" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"/>
      {showGesture && <>
        <path d="M30 27C45 20 61 20 75 26" stroke="white" strokeOpacity=".92" strokeWidth="3.5" strokeLinecap="round"/>
        <path d="M26 91C39 101 57 102 70 95" stroke="white" strokeOpacity=".68" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="27" cy="48" r="6" fill="#10BCEB"/>
        <circle cx="73" cy="84" r="6" fill="#E948B6"/>
      </>}
      {/* Pen nib actively drawing the upper-right stroke */}
      <path d="M82 15L91 6C93 4 96 4 98 6L106 14C108 16 108 19 106 21L97 30L82 15Z" fill="url(#syncan-pen)"/>
      <path d="M82 15L97 30L91 36L76 21L82 15Z" fill="#17284F"/>
      <path d="M76 21L91 36L86 41L71 26L76 21Z" fill="#24365F"/>
      <circle cx="89" cy="24" r="3" fill="white" fillOpacity=".95"/>
      <path d="M86 41L73 53C71 55 68 55 66 53L63 50L77 36L86 41Z" stroke="url(#syncan-ink)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M63 50L59 55" stroke="#6D55F6" strokeWidth="2.8" strokeLinecap="round"/>
    </svg>
  )
}
