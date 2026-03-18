import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const ArowinLogo: React.FC<LogoProps> = ({ className = "", size = 40 }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 512 512" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background Circle */}
      <circle cx="256" cy="256" r="240" fill="#0f172a" />
      
      {/* Orange Arrow Symbol */}
      <path 
        d="M256 120L380 256L256 392L132 256L256 120Z" 
        fill="#f97316" 
      />
      
      {/* Inner Detail */}
      <path 
        d="M256 180L320 256L256 332L192 256L256 180Z" 
        fill="white" 
        fillOpacity="0.2"
      />
      
      {/* Vertical Line */}
      <rect x="248" y="120" width="16" height="272" fill="white" fillOpacity="0.1" />
    </svg>
  );
};
