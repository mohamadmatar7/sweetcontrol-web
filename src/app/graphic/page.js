"use client";

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";
import { motion, useAnimation } from "framer-motion";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

export default function GraphicsPage() {
  // 🧠 Start fresh every load
  const [labels, setLabels] = useState([]);
  const [glucose, setGlucose] = useState([100]);
  const glucoseRef = useRef([100]);
  const [motorPos, setMotorPos] = useState({ x: 0, y: 0 });
  const [motorPulse, setMotorPulse] = useState("blue");
  const [lastGrab, setLastGrab] = useState("None");
  const [lastAction, setLastAction] = useState("Idle");
  const [lastTime, setLastTime] = useState(null);
  const controls = useAnimation();

  // 📡 Real-time listener (no localStorage)
useEffect(() => {
  const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
    wsHost: process.env.NEXT_PUBLIC_SOKETI_HOST,
    wsPort: Number(process.env.NEXT_PUBLIC_SOKETI_PORT),
    forceTLS: process.env.NEXT_PUBLIC_SOKETI_TLS === "true",
    enabledTransports: ["ws", "wss"],
  });

  const channel = pusher.subscribe("joystick-channel");

  // ✅ NEW: tell the Core that the graphic page has connected
  pusher.connection.bind("connected", async () => {
    console.log("✅ Graphic connected — requesting latest game state...");
    try {
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/send-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "joystick-channel",
          event: "init-game",
    data: { source: "graphic" },
        }),
      });
    } catch (err) {
      console.error("❌ Failed to sync with Core:", err);
    }
  });

  // ... your other bindings (move, grab, bg-impact) stay the same ...


    channel.bind("move", (data) => {
      if (data.position) setMotorPos(data.position);
      setMotorPulse("blue");
      setLastAction(`➡️ Moving ${data.direction}`);
      setLastTime(new Date().toLocaleTimeString());
    });

    channel.bind("grab", (data) => {
      setMotorPulse(data.active ? "red" : "blue");
      setLastAction(data.active ? "🖐 Grabbing" : "🤚 Released");
      setLastTime(new Date().toLocaleTimeString());
    });

    channel.bind("bg-impact", (data) => {
      const impact = data.impact;
      const current = glucoseRef.current.at(-1) || 100;
      const target = Math.max(60, Math.min(250, current + impact));
      const start = performance.now();

      function animateGlucose(time) {
        const progress = Math.min((time - start) / 4000, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const newVal = current + (target - current) * ease;
        setGlucose((prev) => {
          const updated = [...prev.slice(-39), newVal];
          glucoseRef.current = updated;
          return updated;
        });
        if (progress < 1) requestAnimationFrame(animateGlucose);
      }
      requestAnimationFrame(animateGlucose);

      setLabels((prev) => [...prev.slice(-39), data.name]);
      setLastGrab(`${data.type === "food" ? "🍔" : "🏃"} ${data.name}`);
      setLastAction(`${data.type === "food" ? "🍔 Ate" : "🏃 Did"} ${data.name.split("(")[0].trim()}`);
      setLastTime(new Date().toLocaleTimeString());
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe("joystick-channel");
      pusher.disconnect();
    };
  }, []);

  // 📊 Live data
  const latest = glucose.at(-1);
  const prev = glucose.at(-2) || latest;
  const delta = latest - prev;

  // 🩸 States
  const status =
    latest > 200
      ? { text: "🚨 Very High Blood Sugar", color: "#ef4444", bg: "bg-red-900/30", mood: "alert" }
      : latest < 80
      ? { text: "⚠️ Low Blood Sugar", color: "#facc15", bg: "bg-yellow-800/30", mood: "low" }
      : { text: "✅ Normal Range", color: "#22c55e", bg: "bg-green-800/30", mood: "calm" };

  const pupilBase = status.mood === "alert" ? 0.8 : status.mood === "low" ? 1.4 : 1.0;
  const bgColor = status.color;

  // 🔴 Shake only > 200
  useEffect(() => {
    if (status.mood === "alert") {
      controls.start({ x: [0, -6, 6, -3, 3, 0], transition: { duration: 0.6 } });
    } else {
      controls.start({ x: 0 });
    }
  }, [status.mood]);

  // 📈 Chart setup
  const data = {
    labels,
    datasets: [
      {
        label: "Blood Glucose (mg/dL)",
        data: glucose,
        borderColor: bgColor,
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        backgroundColor: (ctx) => {
          const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, `${bgColor}40`);
          gradient.addColorStop(1, "transparent");
          return gradient;
        },
      },
    ],
  };

  const options = {
    responsive: true,
    animation: false,
    plugins: {
      legend: { labels: { color: "white" } },
      title: {
        display: true,
        text: "SweetControl — Glucose and Motor Synchronization",
        color: "white",
        font: { size: 18 },
      },
    },
    scales: {
      x: { ticks: { color: "gray" }, grid: { color: "rgba(255,255,255,0.08)" } },
      y: {
        min: 60,
        max: 250,
        ticks: { color: "gray", stepSize: 20 },
        grid: { color: "rgba(255,255,255,0.08)" },
      },
    },
  };

  // Background
  const bgClass =
    status.mood === "alert"
      ? "bg-red-950 animate-pulse"
      : status.mood === "low"
      ? "bg-yellow-950 animate-pulse"
      : "bg-gray-900";

  // Shared rhythm
  const pulseTransition = { duration: 1, repeat: Infinity, ease: "linear" };

  return (
    <motion.div
      animate={controls}
      className={`min-h-screen ${bgClass} text-white flex flex-col items-center justify-start p-8 space-y-6 transition-colors duration-500`}
    >
      {/* 👀 Eyes */}
      <motion.div className="flex gap-10 mb-6">
        {["L", "R"].map((_, i) => (
          <motion.div
            key={i}
            className="relative w-20 h-20 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "#ffffff",
              boxShadow: `0 0 25px ${bgColor}`,
            }}
            animate={{ scale: [1, 1.05, 1] }}
            transition={pulseTransition}
          >
            <motion.div
              animate={{
                x: motorPos.x / 8 + delta / 3,
                y: motorPos.y / 8 + (100 - latest) / 30,
                scale: [pupilBase, pupilBase * 1.2, pupilBase],
              }}
              transition={pulseTransition}
              className="w-7 h-7 bg-black rounded-full shadow-inner"
            />
          </motion.div>
        ))}
      </motion.div>

      <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-bold">
        SweetControl Dashboard
      </motion.h1>

      {/* HUD */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-4xl text-center">
        <div className="relative bg-gray-800/70 border border-gray-700 p-4 rounded-xl">
          <p className="text-gray-400 text-sm mb-1">🩸 Glucose</p>
          <div className="relative flex justify-center items-center">
            <svg width="80" height="80" viewBox="0 0 36 36" className="transform -rotate-90">
              <path
                d="M18 2a16 16 0 1 1 0 32 16 16 0 1 1 0-32"
                stroke="#333"
                strokeWidth="3.5"
                fill="none"
              />
              <motion.path
                d="M18 2a16 16 0 1 1 0 32 16 16 0 1 1 0-32"
                stroke={bgColor}
                strokeWidth="3.5"
                fill="none"
                strokeDasharray="100"
                animate={{
                  strokeDashoffset: 100 - ((latest - 60) / 190) * 100,
                }}
                transition={{ duration: 0.8 }}
              />
            </svg>
            <motion.p
              animate={{ scale: [1, 1.1, 1], color: bgColor }}
              transition={pulseTransition}
              className="absolute text-xl font-bold"
            >
              {latest.toFixed(0)}
            </motion.p>
          </div>
          <p className="text-xs text-gray-500 mt-1">mg/dL</p>
        </div>

        <div className="bg-gray-800/70 border border-gray-700 p-4 rounded-xl">
          <p className="text-gray-400 text-sm">⚙️ Motor Position</p>
          <p className="text-lg font-semibold text-blue-400">
            X:{motorPos.x} / Y:{motorPos.y}
          </p>
        </div>

        <div className="bg-gray-800/70 border border-gray-700 p-4 rounded-xl">
          <p className="text-gray-400 text-sm">🍽️ Last Grab</p>
          <p className="text-lg font-semibold text-green-400 truncate">{lastGrab}</p>
        </div>

        <div className="bg-gray-800/70 border border-gray-700 p-4 rounded-xl">
          <p className="text-gray-400 text-sm">🕒 Last Update</p>
          <p className="text-lg font-semibold text-yellow-400">{lastTime || "--:--"}</p>
        </div>
      </div>

      {/* Status */}
      <motion.div
        className={`px-6 py-3 rounded-xl text-lg font-semibold border ${status.bg}`}
        style={{ borderColor: bgColor }}
      >
        <p style={{ color: bgColor }}>{status.text}</p>
        <p className="text-sm text-gray-300 mt-1">
          Last Action: <span className="font-bold">{lastAction}</span>
        </p>
      </motion.div>

      {/* Chart */}
      <motion.div
        key={motorPulse}
        animate={{
          scale: [1, 1.02, 1],
          boxShadow: [`0 0 15px ${bgColor}40`, `0 0 35px ${bgColor}`, `0 0 15px ${bgColor}40`],
        }}
        transition={pulseTransition}
        className="w-full max-w-4xl bg-gray-800 p-6 rounded-2xl shadow-xl"
      >
        <Line data={data} options={options} />
      </motion.div>

      <p className="text-gray-400 text-sm text-center max-w-md">
        Real-time synchronization between motor movement and glucose rhythms.  
        SweetControl always starts clean and alive 👁️❤️‍🔥
      </p>
    </motion.div>
  );
}
