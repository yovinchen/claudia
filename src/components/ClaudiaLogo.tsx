import { motion } from "framer-motion";

interface ClaudiaLogoProps {
  size?: number;
  className?: string;
}

export function ClaudiaLogo({ size = 48, className = "" }: ClaudiaLogoProps) {
  return (
    <motion.div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Background glow animation */}
      <motion.div
        className="absolute inset-0 rounded-2xl"
        style={{
          background: "radial-gradient(circle, rgba(251, 146, 60, 0.3) 0%, transparent 70%)",
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Main logo with image */}
      <motion.div
        className="relative w-full h-full rounded-2xl overflow-hidden shadow-xl"
        animate={{
          rotateY: [0, 360],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "linear",
        }}
        whileHover={{
          scale: 1.1,
          transition: {
            duration: 0.3,
            ease: "easeOut",
          },
        }}
      >
        {/* Use the actual Claudia icon */}
        <motion.img
          src="/icon.png"
          alt="Claudia"
          className="w-full h-full object-contain"
          animate={{
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        
        {/* Shimmer effect overlay */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent"
          animate={{
            x: ["-200%", "200%"],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            repeatDelay: 1,
            ease: "easeInOut",
          }}
        />
      </motion.div>
      
      {/* Orbiting particles */}
      {[...Array(4)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 bg-orange-400 rounded-full"
          style={{
            top: "50%",
            left: "50%",
          }}
          animate={{
            x: [
              0,
              Math.cos((i * Math.PI) / 2) * size * 0.6,
              0,
              -Math.cos((i * Math.PI) / 2) * size * 0.6,
              0,
            ],
            y: [
              0,
              Math.sin((i * Math.PI) / 2) * size * 0.6,
              0,
              -Math.sin((i * Math.PI) / 2) * size * 0.6,
              0,
            ],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: i * 0.25,
            ease: "easeInOut",
          }}
        />
      ))}
    </motion.div>
  );
}

// Alternative minimalist version
export function ClaudiaLogoMinimal({ size = 48, className = "" }: ClaudiaLogoProps) {
  return (
    <motion.div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      animate={{
        rotate: [0, 3, -3, 3, 0],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* Simple orange circle background */}
      <motion.div
        className="absolute inset-0 rounded-2xl bg-orange-500"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Subtle inner shadow for depth */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent to-black/10" />
      
      {/* Letter C - clean and simple */}
      <motion.div
        className="relative z-10 text-white font-bold flex items-center justify-center"
        style={{ fontSize: size * 0.5, fontFamily: 'system-ui, -apple-system, sans-serif' }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        C
      </motion.div>
      
      {/* Single subtle pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-2xl border border-orange-400/30"
        animate={{
          scale: [1, 1.3, 1.5],
          opacity: [0.3, 0.1, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
    </motion.div>
  );
}