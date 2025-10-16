"use client";
import React, { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "disabled";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  willHover?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  className,
  children,
  willHover = true,
  ...props
}) => {
  const actualVariant = props.disabled ? "disabled" : variant;
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 900);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!buttonRef.current || !containerRef.current || isPressed || isMobile || !willHover)
      return;

    const rect = buttonRef.current.getBoundingClientRect();

    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);

    setMousePosition({ x: x * 3, y: y * 3 });
  };

  const handleMouseEnter = () => {
    if (!isMobile) {
      setHasInteracted(true);
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsHovered(false);
      setMousePosition({ x: 0, y: 0 });
    }
  };

  const handleMouseDown = () => {
    setIsPressed(true);
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const handleTouchStart = () => {
    setIsPressed(true);
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  const baseStyles = "font-mono font-medium transition-all duration-200";

  const variants = {
    primary:
      "bg-gradient-to-br from-[#89CCBF] to-[#057C7C] text-white relative overflow-hidden",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
    danger:
      "bg-gradient-to-br from-[#FF6B6B] to-[#CC0000] text-white relative overflow-hidden",
    disabled: "bg-my-grey text-background cursor-not-allowed",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "inline-block relative",
        className?.includes("w-full") && "block w-full"
      )}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {!isMobile && (
        <div
          className="absolute"
          style={{
            top: "-32px",
            left: "-32px",
            right: "-32px",
            bottom: "-32px",
            pointerEvents: "auto",
            zIndex: 1,
          }}
        />
      )}
      <button
        ref={buttonRef}
        className={cn(
          baseStyles,
          variants[actualVariant],
          sizes[size],
          className,
          (actualVariant === "primary" || actualVariant === "danger") &&
          hasInteracted &&
          !isMobile && [
            "shimmer-effect",
            isHovered ? "shimmer-forward" : "shimmer-backward",
          ]
        )}
        style={{
          transform:
            isPressed
              ? "translate(4px, 4px)"
              : isHovered && !isMobile && willHover
                ? `translate(${mousePosition.x}px, ${mousePosition.y}px)`
                : !willHover || isMobile
                  ? "translate(-4px, -4px)"
                  : "translate(0px, 0px)",
          transition:
            isPressed || !isHovered || isMobile || !willHover
              ? "transform 0.2s ease-out"
              : "none",
          boxShadow: isPressed
            ? "none"
            : !willHover || isMobile || (isHovered && !isMobile)
              ? "4px 4px 0 0 #9ea393"
              : "none",
          position: "relative",
          zIndex: 2,
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        {...props}
      >
        {children}
      </button>
    </div>
  );
};

export default Button;
