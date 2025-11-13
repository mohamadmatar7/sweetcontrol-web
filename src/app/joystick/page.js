"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Pusher from "pusher-js";

export default function JoystickPage() {
  const router = useRouter();
  const [grabbing, setGrabbing] = useState(false);
  const [resetNotice, setResetNotice] = useState(false);
  const [queuePos, setQueuePos] = useState(null);
  const [queueLength, setQueueLength] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState(null);
  const [showThanks, setShowThanks] = useState(false); // ✅ Modal control

  const lastPositionRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const joiningRef = useRef(false);
  const userId = useRef(null);
  const moveIntervalRef = useRef(null); // ✅ for hold movement

  // ✅ Check if user donated; redirect if not
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedId = localStorage.getItem("joystickUser");

    if (!storedId) {
      console.warn("🚫 No stored user ID — redirecting home");
      router.push("/");
      return;
    }

    userId.current = storedId;
    console.log("🪪 User ID:", userId.current);

    const handleUnload = () => {
      if (userId.current) {
        navigator.sendBeacon(
          `${process.env.NEXT_PUBLIC_CORE_URL}/joystick/leave`,
          JSON.stringify({ id: userId.current })
        );
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [router]);

  // 🧠 Request queue access once ID is ready
  useEffect(() => {
    if (!userId.current) return;
    requestAccess();
  }, [userId.current]);

  const endSession = async () => {
    if (!userId.current) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/joystick/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId.current }),
      });
    } catch (e) {
      console.warn("⚠️ Failed to leave session cleanly:", e.message);
    }

    // 🧹 show thank you modal
    setShowThanks(true);
    localStorage.removeItem("joystickUser");
    setIsActive(false);
    setQueuePos(null);
    setTimeLeft(0);
  };

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

  const requestAccess = async () => {
    if (joiningRef.current) return;
    joiningRef.current = true;
    setError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_CORE_URL}/joystick/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: userId.current }),
        }
      );

      const data = await res.json();

      if (res.status === 403 || data.success === false) {
        setError(data.message || "You already used your credits.");
        localStorage.removeItem("joystickUser");
        setShowThanks(true);
        return;
      }

      if (!res.ok) throw new Error(data.message || "Failed to join queue");

      setQueuePos(data.position);
      setIsActive(data.active);

      if (data.active) {
        const seconds = data.remaining || 30;
        startSessionTimer(seconds);
      }

      setJoining(false);
    } catch (err) {
      console.error("❌ Failed to join queue:", err);
      setError("Connection failed. Please try again.");
      router.push("/");
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

        setShowThanks(true);
        localStorage.removeItem("joystickUser");
      }
    });

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

  // 🎮 Send command
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

  // 🕹️ Movement (with hold)
  const move = (direction) => {
    if (!isActive) return;
    const step = 10;
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

  // ✅ Start & stop continuous movement
  const startMoveHold = (direction) => {
    move(direction);
    moveIntervalRef.current = setInterval(() => move(direction), 150);
  };

  const stopMoveHold = () => {
    clearInterval(moveIntervalRef.current);
  };

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

  const handleCoin = async () => {
    if (!isActive) return;
    console.log("🪙 Sending coin signal...");
    await sendCommand("coin", {});
  };

  // 🧭 Queue waiting screen
  if (!isActive && !showThanks) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-800 text-white p-6">
        <h1 className="text-4xl font-extrabold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-300">
          🎮 SweetControl Queue
        </h1>

        {joining ? (
          <>
            <div className="w-16 h-16 border-4 border-gray-600 border-t-green-500 rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400 text-sm">Connecting to queue...</p>
          </>
        ) : error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : (
          <p className="text-gray-400 text-sm">
            Waiting for your turn... Position:{" "}
            <span className="text-green-400 font-semibold">
              {queuePos || "?"}
            </span>{" "}
            / {queueLength}
          </p>
        )}
      </div>
    );
  }

  // ✅ Thank-you modal
  if (showThanks) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-green-800 to-emerald-600 text-white p-6 text-center">
        <div className="bg-gray-800/60 backdrop-blur-md rounded-2xl p-8 shadow-2xl">
          <h2 className="text-3xl font-extrabold mb-4">🎉 Thank you for playing!</h2>
          <p className="text-gray-200 mb-6">
            If you want to play again, please donate again to start a new session.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl shadow-lg transition"
          >
            🏠 Go to Home
          </button>
        </div>
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

      <div className="relative mb-6 w-64 h-3 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-green-500 transition-all"
          style={{ width: `${(timeLeft / 30) * 100}%` }}
        ></div>
      </div>
      <p className="text-sm text-gray-400 mb-6">Time left: {timeLeft}s</p>

      {/* Controls with hold */}
      <div className="grid grid-cols-3 gap-4 w-64 h-64 place-items-center select-none">
        <div />
        <button
          onMouseDown={() => startMoveHold("up")}
          onMouseUp={stopMoveHold}
          onMouseLeave={stopMoveHold}
          onTouchStart={() => startMoveHold("up")}
          onTouchEnd={stopMoveHold}
          className="bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl w-16 h-16 text-lg font-bold"
        >
          ↑
        </button>
        <div />
        <button
          onMouseDown={() => startMoveHold("left")}
          onMouseUp={stopMoveHold}
          onMouseLeave={stopMoveHold}
          onTouchStart={() => startMoveHold("left")}
          onTouchEnd={stopMoveHold}
          className="bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl w-16 h-16 text-lg font-bold"
        >
          ←
        </button>

        <div className="flex flex-col items-center space-y-2">
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
            onClick={handleCoin}
            className="rounded-xl w-16 h-10 text-sm font-bold bg-yellow-500 hover:bg-yellow-400 text-black shadow-md"
          >
            🪙 Coin
          </button>
        </div>

        <button
          onMouseDown={() => startMoveHold("right")}
          onMouseUp={stopMoveHold}
          onMouseLeave={stopMoveHold}
          onTouchStart={() => startMoveHold("right")}
          onTouchEnd={stopMoveHold}
          className="bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl w-16 h-16 text-lg font-bold"
        >
          →
        </button>
        <div />
        <button
          onMouseDown={() => startMoveHold("down")}
          onMouseUp={stopMoveHold}
          onMouseLeave={stopMoveHold}
          onTouchStart={() => startMoveHold("down")}
          onTouchEnd={stopMoveHold}
          className="bg-gray-700 hover:bg-gray-600 active:bg-gray-500 rounded-xl w-16 h-16 text-lg font-bold"
        >
          ↓
        </button>
        <div />
      </div>

      <p className="mt-8 text-gray-400 text-sm text-center max-w-xs">
        Use arrows to move the claw. Press{" "}
        <strong>🤚 Grab</strong> to pick an item or{" "}
        <strong>🪙 Coin</strong> to insert a coin.
      </p>
    </div>
  );
}
