import React, { useEffect, useState } from "react";

export default function WeatherLayer() {
  const [time, setTime] = useState(new Date().getHours());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().getHours());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Determine color scheme
  const getSkyColor = () => {
    if (time >= 5 && time < 10) return "from-[#11223a] via-[#1b3350] to-[#26496e]"; // Dawn
    if (time >= 10 && time < 17) return "from-[#0b1e3a] via-[#0e284e] to-[#183a73]"; // Day
    if (time >= 17 && time < 20) return "from-[#09172e] via-[#1c2252] to-[#3a2977]"; // Sunset
    return "from-[#040b14] via-[#070f1e] to-[#0a1533]"; // Night
  };

  // Random floating stars for night
  const [stars] = useState(() =>
    Array.from({ length: 40 }, () => ({
      top: Math.random() * 100,
      left: Math.random() * 100,
      size: Math.random() * 2 + 1,
      delay: Math.random() * 3,
    }))
  );

  return (
    <div
      className={`absolute inset-0 transition-colors duration-[3000ms] bg-gradient-to-b ${getSkyColor()} z-0`}
    >
      {time >= 20 || time < 5 ? (
        <div className="absolute inset-0 overflow-hidden">
          {stars.map((star, i) => (
            <div
              key={i}
              className="absolute bg-white rounded-full opacity-70 animate-pulse"
              style={{
                top: `${star.top}%`,
                left: `${star.left}%`,
                width: `${star.size}px`,
                height: `${star.size}px`,
                animationDelay: `${star.delay}s`,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_10%,rgba(255,255,255,0.05),transparent_70%)]"></div>
      )}
    </div>
  );
}
