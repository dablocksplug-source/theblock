import React, { useState, useEffect } from "react";

export default function WeatherOverlay() {
  const [time, setTime] = useState(new Date());
  const [greeting, setGreeting] = useState("");
  const [weather, setWeather] = useState("Clear Skies");

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const hour = time.getHours();
    if (hour < 6) setGreeting("🌌 Night in The Block");
    else if (hour < 12) setGreeting("🌅 Morning in The Block");
    else if (hour < 18) setGreeting("🌇 Afternoon in The Block");
    else setGreeting("🌃 Evening in The Block");
  }, [time]);

  return (
    <div className="fixed top-4 right-6 text-cyan-300 text-sm bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-cyan-400/30 shadow-lg z-20">
      <span className="mr-3">{greeting}</span>
      <span className="text-gray-300">{weather}</span>{" "}
      <span className="ml-3 text-cyan-200">
        {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
    </div>
  );
}
