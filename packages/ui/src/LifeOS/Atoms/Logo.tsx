import { cn } from '../../utils';

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo = ({ size = 32, className }: LogoProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    className={cn('shrink-0', className)}
    aria-label="kaihuman"
  >
    <rect width="512" height="512" rx="88" fill="#0e0e0e" />
    <rect x="60" y="112" width="44" height="288" rx="5" fill="white" />
    <polygon points="88,240 120,272 264,128 232,96" fill="white" />
    <polygon points="120,240 88,272 232,416 264,384" fill="white" />
    <rect x="288" y="112" width="44" height="288" rx="5" fill="white" />
    <rect x="288" y="200" width="160" height="48" rx="24" fill="white" />
    <rect x="404" y="248" width="44" height="152" rx="5" fill="white" />
  </svg>
);
