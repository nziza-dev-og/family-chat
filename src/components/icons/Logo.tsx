
import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  // Determine fill color based on props or default to primary (CSS variable)
  const fill = props.fill || 'hsl(var(--primary-foreground))'; // Default to primary-foreground for visibility on primary bg

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 50"
      width={props.width || "120"} // Allow overriding width
      height={props.height || "30"} // Allow overriding height
      aria-label="FamilyChat Logo"
      {...props}
      fill={fill} // Apply the fill color
    >
      {/* Transparent rect for background if needed for interaction, not strictly necessary for text */}
      {/* <rect width="200" height="50" fill="transparent" />  */}
      <text
        x="10" // Adjusted for better alignment if needed
        y="35" // Adjusted for better vertical centering
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" // System font stack
        fontSize="30"
        fontWeight="bold"
        // fill is now inherited from SVG element or overridden by props.fill
      >
        FamilyChat
      </text>
    </svg>
  );
}

    