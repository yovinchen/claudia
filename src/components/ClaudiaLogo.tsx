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
        rotate: [0, 5, -5, 5, 0],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      {/* Gradient background */}
      <motion.div
        className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600"
        animate={{
          scale: [1, 1.1, 1],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Inner light effect */}
      <motion.div
        className="absolute inset-1 rounded-xl bg-gradient-to-br from-orange-300/50 to-transparent"
        animate={{
          opacity: [0.5, 1, 0.5],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      
      {/* Letter C with animation */}
      <motion.div
        className="relative z-10 text-white font-bold flex items-center justify-center"
        style={{ fontSize: size * 0.5 }}
        animate={{
          scale: [1, 1.1, 1],
          textShadow: [
            "0 0 10px rgba(255,255,255,0.5)",
            "0 0 20px rgba(255,255,255,0.8)",
            "0 0 10px rgba(255,255,255,0.5)",
          ],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        C
      </motion.div>
      
      {/* Pulse rings */}
      {[...Array(2)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-2xl border-2 border-orange-400"
          animate={{
            scale: [1, 1.5, 2],
            opacity: [0.5, 0.2, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 1.5,
            ease: "easeOut",
          }}
        />
      ))}
    </motion.div>
  );
}