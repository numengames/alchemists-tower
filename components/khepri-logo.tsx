'use client';

import { useState } from 'react';

interface KhepriLogoProps {
  size?: number;
  className?: string;
}

export function KhepriLogo({ size = 64, className = '' }: KhepriLogoProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width: size, height: size }}
    >
      {/* Sun disk background */}
      <div
        className={`absolute inset-0 rounded-full bg-linear-to-br suppressHydrationWarning from-primary to-accent transition-all duration-500 ${
          isHovered ? 'scale-110 opacity-20 blur-md' : 'scale-100 opacity-10'
        }`}
      />

      {/* Main scarab beetle */}
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`relative z-10 transition-transform duration-700 suppressHydrationWarning ${isHovered ? 'scale-90 rotate-12' : 'scale-100'}`}
        style={{ width: size, height: size }}
      >
        {/* Scarab body */}
        <ellipse
          cx="50"
          cy="55"
          rx="20"
          ry="25"
          fill="currentColor"
          className={`text-primary transition-all duration-500 suppressHydrationWarning ${isHovered ? 'opacity-100' : 'opacity-90'}`}
        />

        {/* Scarab head */}
        <circle
          cx="50"
          cy="30"
          r="12"
          fill="currentColor"
          className={`text-primary transition-all duration-500 suppressHydrationWarning ${isHovered ? 'opacity-100' : 'opacity-90'}`}
        />

        {/* Left wing */}
        <path
          d="M 30 55 Q 15 55 10 70 Q 15 80 30 75 Z"
          fill="currentColor"
          className={`text-accent transition-all duration-700 origin-center ${
            isHovered ? 'opacity-100 -translate-x-2' : 'opacity-80 translate-x-0'
          }`}
        />

        {/* Right wing */}
        <path
          d="M 70 55 Q 85 55 90 70 Q 85 80 70 75 Z"
          fill="currentColor"
          className={`text-accent transition-all duration-700 origin-center suppressHydrationWarning ${
            isHovered ? 'opacity-100 translate-x-2' : 'opacity-80 translate-x-0'
          }`}
        />

        {/* Center scarab pattern */}
        <line
          x1="50"
          y1="35"
          x2="50"
          y2="75"
          stroke="currentColor"
          strokeWidth="2"
          className="text-background"
        />

        {/* Left antenna */}
        <path
          d="M 44 25 Q 40 15 38 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-primary transition-all duration-500 suppressHydrationWarning ${isHovered ? 'opacity-100' : 'opacity-70'}`}
        />

        {/* Right antenna */}
        <path
          d="M 56 25 Q 60 15 62 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-primary transition-all duration-500 suppressHydrationWarning ${isHovered ? 'opacity-100' : 'opacity-70'}`}
        />

        {/* Left legs */}
        <path
          d="M 35 50 Q 25 55 20 60"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-primary opacity-70"
        />
        <path
          d="M 35 60 Q 25 65 20 70"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-primary opacity-70"
        />

        {/* Right legs */}
        <path
          d="M 65 50 Q 75 55 80 60"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-primary opacity-70"
        />
        <path
          d="M 65 60 Q 75 65 80 70"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="text-primary opacity-70"
        />
      </svg>

      {/* Rotating sun rays on hover */}
      {isHovered && (
        <div className="absolute inset-0 animate-spin-slow">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-1 h-full origin-bottom"
              style={{
                transform: `translate(-50%, -100%) rotate(${i * 45}deg)`,
              }}
            >
              <div className="w-full h-3 bg-linear-to-t from-accent/40 to-transparent rounded-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
