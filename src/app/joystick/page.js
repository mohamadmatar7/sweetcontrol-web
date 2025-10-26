"use client";

import { useEffect, useState, useRef } from "react";
import Pusher from "pusher-js";

export default function JoystickPage() {
  const [grabbing, setGrabbing] = useState(false);
  const [resetNotice, setResetNotice] = useState(false);
  const [queuePos, setQueuePos] = useState(null);
  const [queueLength, setQueueLength] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [joining, setJoining] = useState(true);

  const lastPositionRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const joiningRef = useRef(false);
  const userId = useRef(null);

  // ✅ Keep persistent user ID
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedId = localStorage.getItem("joystickUser");
    if (storedId) {
      userId.current = storedId;
    } else {
      const newId = crypto.randomUUID();
      localStorage.setItem("joystickUser", newId);
      userId.current = newId;
    }

    console.log("🪪 User ID:", userId.current);

    // Leave cleanly when tab closes
    const handleUnload = () => {
      if (userId.current) {
        navigator.sendBeacon(
          `${process.env.NEXT_PUBLIC_CORE_URL}/joystick-leave`,
          JSON.stringify({ id: userId.current })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  // 🧠 Request queue access once ID is ready
  useEffect(() => {
    if (!userId.current) return;
    requestAccess();
  }, [userId.current]);

  // 🚪 Leave queue or session manually
  const endSession = async () => {
    if (!userId.current) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/joystick-leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId.current }),
      });
    } catch (e) {
      console.warn("⚠️ Failed to leave session cleanly:", e.message);
    }
    setIsActive(false);
    setQueuePos(null);
    setTimeLeft(0);
  };

  // ⏱️ Start or resume session countdown
  const startSessionTimer = (seconds = 30) => {
    clearInterval(timerRef.current);
    setTimeLeft(seconds);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 🧩 Request to join or resume queue
  const requestAccess = async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/joystick-join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId.current }),
      });
      const data = await res.json();

      setQueuePos(data.position);
      setIsActive(data.active);

      if (data.active) {
        const seconds = data.remaining || 30;
        startSessionTimer(seconds);
      }

      setJoining(false);
    } catch (err) {
      console.error("❌ Failed to join queue:", err);
    } finally {
      joiningRef.current = false;
    }
  };

  // 🔌 Setup Pusher
  useEffect(() => {
    if (!userId.current) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      wsHost: process.env.NEXT_PUBLIC_SOKETI_HOST,
      wsPort: Number(process.env.NEXT_PUBLIC_SOKETI_PORT),
      forceTLS: process.env.NEXT_PUBLIC_SOKETI_TLS === "true",
      enabledTransports: ["ws", "wss"],
    });

    const gameChannel = pusher.subscribe("joystick-channel");
    const queueChannel = pusher.subscribe("joystick-queue");

    // 🌀 Realtime queue updates (includes remaining seconds)
    queueChannel.bind("queue-update", (data) => {
      setQueueLength(data.queue.length);
      const entry = data.queue.find((u) => u.id === userId.current);
      setQueuePos(entry ? entry.position : null);

      const nowActive = data.activeId === userId.current;
      const remaining = data.remaining || 0;

      if (nowActive && !isActive) {
        console.log("🎮 You are now active!");
        setIsActive(true);
        startSessionTimer(remaining || 30);
      } else if (!nowActive && isActive) {
        console.log("⌛ Session ended");
        setIsActive(false);
        clearInterval(timerRef.current);
      }
    });

    // ✅ Sync game on connect
    pusher.connection.bind("connected", async () => {
      console.log("✅ Connected — syncing game...");
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/send-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "joystick-channel",
          event: "init-game",
          data: {},
        }),
      });
      await requestAccess();
    });

    // ♻️ Reset joystick on new round
    gameChannel.bind("objects-init", () => {
      console.log("♻️ Game reset — joystick reset");
      lastPositionRef.current = { x: 0, y: 0 };
      setResetNotice(true);
      setTimeout(() => setResetNotice(false), 2000);
    });

    return () => {
      clearInterval(timerRef.current);
      pusher.disconnect();
    };
  }, [isActive]);

  // 🎮 Send command to Core
  const sendCommand = async (event, data) => {
    if (!isActive) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/send-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "joystick-channel",
          event,
          data,
        }),
      });
    } catch (err) {
      console.error("Error sending command:", err);
    }
  };

  // Movement controls
  const move = (direction) => {
    if (!isActive) return;
    const step = 20;
    const pos = { ...lastPositionRef.current };

    switch (direction) {
      case "up":
        pos.y = Math.max(-120, pos.y - step);
        break;
      case "down":
        pos.y = Math.min(120, pos.y + step);
        break;
      case "left":
        pos.x = Math.max(-120, pos.x - step);
        break;
      case "right":
        pos.x = Math.min(120, pos.x + step);
        break;
    }

    lastPositionRef.current = pos;
    sendCommand("move", { direction });
  };

  // Grab handler
  const handleGrab = async () => {
    if (grabbing || !isActive) return;
    setGrabbing(true);
    const { x, y } = lastPositionRef.current;
    await sendCommand("grab", { active: true, clawX: x + 130, clawY: y + 130 });
    setTimeout(() => {
      sendCommand("grab", { active: false });
      setGrabbing(false);
    }, 1500);
  };

  // 🧭 Queue screen (waiting)
  if (!isActive) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 text-white p-6 relative overflow-hidden">
        <div className="absolute w-[500px] h-[500px] bg-green-600/10 rounded-full blur-3xl -top-40 -right-40"></div>

        <h1 className="text-4xl font-extrabold mb-2 tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-300">
          🎮 SweetControl Queue
        </h1>
        <p className="text-gray-400 text-sm mb-8">
          Stay ready — the system will move you in automatically.
        </p>

        {joining ? (
          <>
            <div className="w-16 h-16 border-4 border-gray-600 border-t-green-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400 text-sm">Connecting to queue...</p>
          </>
        ) : (
          <div className="w-full max-w-sm text-center">
            <div className="relative mb-6">
              <p className="text-sm text-gray-400 mt-2">
                {queuePos === 1 ? (
                  <span className="text-green-400 font-semibold animate-pulse">
                    You’re next! 🚀
                  </span>
                ) : (
                  <>
                    Your position:{" "}
                    <span className="font-semibold text-white">
                      {queuePos || "?"}
                    </span>
                  </>
                )}
              </p>
              {timeLeft > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  Current session time left:{" "}
                  <span className="text-green-400 font-semibold">
                    {timeLeft}s
                  </span>
                </p>
              )}
            </div>

            <div className="flex flex-col items-center space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <span className="w-3 h-3 bg-green-400 rounded-full animate-ping"></span>
                <span className="text-gray-300">Waiting for your turn...</span>
              </div>
              <p className="text-xs text-gray-500 italic">
                Please don’t refresh — the page will auto-activate.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 🎮 Active joystick screen
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-6">
      <h1 className="text-3xl font-bold mb-4">Joystick Control</h1>

      {resetNotice && (
        <div className="mb-4 text-yellow-400 text-sm animate-pulse">
          ♻️ New round started — joystick reset
        </div>
      )}

      {/* Countdown Bar */}
      <div className="relative mb-6 w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-green-500 transition-all"
          style={{ width: `${(timeLeft / 30) * 100}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-400 mb-6">Time left: {timeLeft}s</p>

      {/* Controls */}
      <div className="grid grid-cols-3 gap-4 w-64 h-64 place-items-center">
        <div />
        <button
          onClick={() => move("up")}
          className="bg-gray-700 hover:bg-gray-600 rounded-xl w-16 h-16 text-lg font-bold"
        >
          ↑
        </button>
        <div />
        <button
          onClick={() => move("left")}
          className="bg-gray-700 hover:bg-gray-600 rounded-xl w-16 h-16 text-lg font-bold"
        >
          ←
        </button>
        <button
          onClick={handleGrab}
          disabled={grabbing}
          className={`rounded-xl w-16 h-16 text-lg font-bold transition-all ${
            grabbing
              ? "bg-red-500 hover:bg-red-400"
              : "bg-green-600 hover:bg-green-500"
          }`}
        >
          {grabbing ? "🖐" : "🤚"}
        </button>
        <button
          onClick={() => move("right")}
          className="bg-gray-700 hover:bg-gray-600 rounded-xl w-16 h-16 text-lg font-bold"
        >
          →
        </button>
        <div />
        <button
          onClick={() => move("down")}
          className="bg-gray-700 hover:bg-gray-600 rounded-xl w-16 h-16 text-lg font-bold"
        >
          ↓
        </button>
        <div />
      </div>

      <p className="mt-8 text-gray-400 text-sm text-center max-w-xs">
        Use the arrows to move the claw. Press{" "}
        <strong>🤚 Grab</strong> to pick up nearby objects.
      </p>
    </div>
  );
}
