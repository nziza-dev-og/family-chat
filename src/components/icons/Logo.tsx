
import type { SVGProps } from 'react';
import { cn } from '@/lib/utils'; // Import cn

// A simple abstract triangle logo, similar to the example image's top-left logo
export function Logo(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props;
  // Default fill to --sidebar-primary-foreground if on dark sidebar, or --primary if on light bg
  // This is a simplification; true context awareness is harder.
  // Consumers can override fill directly.
  const fill = props.fill || 'currentColor'; // Simpler: use CSS to set color via text-color

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24" // Simple square viewBox
      width={props.width || "28"} 
      height={props.height || "28"}
      aria-label="App Logo"
      className={cn("fill-current", className)} // Allow overriding fill via text color
      {...rest}
    >
      <path d="M12 2L2 22H22L12 2Z" />
    </svg>
  );
}
