import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowClassName?: string;
  onClick?: () => void;
}

export const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className,
  glowClassName,
  onClick,
}) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePosition({ x, y });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-300",
        "bg-card hover:shadow-2xl",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* Glow effect layer */}
      <div
        className={cn(
          "absolute inset-0 opacity-0 transition-opacity duration-300",
          isHovered && "opacity-100",
          "pointer-events-none"
        )}
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(120, 119, 198, 0.1), transparent 40%)`,
        }}
      />

      {/* Border glow effect */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300",
          isHovered && "opacity-100",
          "pointer-events-none"
        )}
        style={{
          background: `radial-gradient(400px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(120, 119, 198, 0.3), transparent 40%)`,
          padding: "1px",
          maskImage: "linear-gradient(#000, #000)",
          maskClip: "content-box, border-box",
          maskComposite: "exclude",
          WebkitMaskImage: "linear-gradient(#000, #000)",
          WebkitMaskClip: "content-box, border-box",
          WebkitMaskComposite: "xor",
        }}
      />

      {/* Animated gradient border */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl",
          "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500",
          "opacity-0 transition-opacity duration-500",
          isHovered && "opacity-20 animate-pulse",
          "pointer-events-none",
          glowClassName
        )}
        style={{
          padding: "2px",
          maskImage: "linear-gradient(#000, #000)",
          maskClip: "content-box, border-box",
          maskComposite: "exclude",
          WebkitMaskImage: "linear-gradient(#000, #000)",
          WebkitMaskClip: "content-box, border-box",
          WebkitMaskComposite: "xor",
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

// 高级炫光卡片组件，带有更多动画效果
export const AdvancedGlowCard: React.FC<GlowCardProps> = ({
  children,
  className,
  glowClassName,
  onClick,
}) => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [gradientAngle, setGradientAngle] = useState(0);

  useEffect(() => {
    if (!isHovered) return;
    
    const interval = setInterval(() => {
      setGradientAngle((prev) => (prev + 1) % 360);
    }, 50);

    return () => clearInterval(interval);
  }, [isHovered]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setMousePosition({ x, y });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setGradientAngle(0);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-500",
        "bg-card/80 backdrop-blur-sm",
        "hover:shadow-2xl hover:shadow-primary/20",
        "hover:scale-[1.02] hover:-translate-y-1",
        "cursor-pointer",
        className
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* Main glow effect */}
      <div
        className={cn(
          "absolute inset-0 opacity-0 transition-opacity duration-500",
          isHovered && "opacity-100",
          "pointer-events-none"
        )}
        style={{
          background: `radial-gradient(800px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(147, 51, 234, 0.15), transparent 40%)`,
        }}
      />

      {/* Secondary glow effect */}
      <div
        className={cn(
          "absolute inset-0 opacity-0 transition-opacity duration-500",
          isHovered && "opacity-60",
          "pointer-events-none"
        )}
        style={{
          background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.1), transparent 40%)`,
        }}
      />

      {/* Animated gradient border */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl",
          "opacity-0 transition-opacity duration-300",
          isHovered && "opacity-100",
          "pointer-events-none",
          glowClassName
        )}
        style={{
          background: `linear-gradient(${gradientAngle}deg, #3b82f6, #8b5cf6, #ec4899, #3b82f6)`,
          padding: "2px",
          maskImage: "linear-gradient(#000, #000)",
          maskClip: "content-box, border-box",
          maskComposite: "exclude",
          WebkitMaskImage: "linear-gradient(#000, #000)",
          WebkitMaskClip: "content-box, border-box",
          WebkitMaskComposite: "xor",
        }}
      />

      {/* Shimmer effect */}
      <div
        className={cn(
          "absolute inset-0 opacity-0",
          isHovered && "opacity-100 animate-shimmer",
          "pointer-events-none"
        )}
        style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(255, 255, 255, 0.1) 50%, transparent 60%)",
          animation: isHovered ? "shimmer 1.5s infinite" : "none",
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

// 简约边框跑马灯卡片组件
export const BorderGlowCard: React.FC<GlowCardProps> = ({
  children,
  className,
  onClick,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        "relative overflow-hidden rounded-xl transition-all duration-500",
        "bg-card",
        "hover:shadow-lg hover:shadow-orange-500/10",
        "hover:scale-[1.01]",
        "cursor-pointer",
        className
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {/* 橙色边框跑马灯效果 - 只有一小段 */}
      <div
        className={cn(
          "absolute inset-0 rounded-xl",
          "opacity-0 transition-opacity duration-300",
          isHovered && "opacity-100",
          "pointer-events-none"
        )}
      >
        {/* 旋转的渐变边框 - 一小段光带 */}
        <div
          className={cn(
            "absolute inset-0 rounded-xl",
            isHovered && "animate-spin-slow"
          )}
          style={{
            background: `conic-gradient(from 0deg, 
              transparent 0deg,
              transparent 85deg,
              #fb923c 90deg,
              #f97316 95deg,
              #fb923c 100deg,
              transparent 105deg,
              transparent 360deg
            )`,
          }}
        />
        {/* 内部遮罩，只显示边框 */}
        <div 
          className="absolute inset-[2px] rounded-xl bg-card"
        />
      </div>

      {/* 静态边框 */}
      <div className="absolute inset-0 rounded-xl border border-border/50" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};