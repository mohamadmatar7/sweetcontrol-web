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
  const [totalTime, setTotalTime] = useState(35);
  const [joining, setJoining] = useState(true);
  const [error, setError] = useState(null);
  const [showThanks, setShowThanks] = useState(false);

  const lastPositionRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const joiningRef = useRef(false);
  const playerIdRef = useRef(null); // technical persistent ID
  const moveIntervalRef = useRef(null);

  // ---------------------------------------------------
  // Load playerId from URL (if present) or localStorage
  // ---------------------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) Try to read ?player=... from URL
    const params = new URLSearchParams(window.location.search);
    const urlPlayer = params.get("player");

    let storedId = localStorage.getItem("joystickPlayerId");

    if (urlPlayer) {
      // If URL provides a player, trust it and store it
      storedId = urlPlayer;
      localStorage.setItem("joystickPlayerId", urlPlayer);
    }

    if (!storedId) {
      // No playerId anywhere → send user back home
      router.push("/");
      return;
    }

    playerIdRef.current = storedId;

    const handleUnload = () => {
      if (playerIdRef.current) {
        try {
          navigator.sendBeacon(
            `${process.env.NEXT_PUBLIC_CORE_URL}/joystick/leave`,
            JSON.stringify({ id: playerIdRef.current })
          );
        } catch {
          // ignore beacon errors
        }
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [router]);

  // ---------------------------------------------------
  // End session early (user leaves or timer hits 0)
  // ---------------------------------------------------
  const endSession = async () => {
    if (!playerIdRef.current) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/joystick/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: playerIdRef.current }),
      });
    } catch (e) {
      // swallow errors, UI will still continue
    }

    setShowThanks(true);
    setIsActive(false);
    setQueuePos(null);
    setTimeLeft(0);
  };

  // ---------------------------------------------------
  // Local countdown (backend is source of truth)
  // ---------------------------------------------------
  const startSessionTimer = (seconds = 35) => {
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

  // ---------------------------------------------------
  // Ask backend to join queue or reconnect (single source of truth)
  // Backend itself will handle Mollie race conditions.
  // ---------------------------------------------------
  const requestAccess = async () => {
    if (joiningRef.current) return;
    if (!playerIdRef.current) return;

    joiningRef.current = true;
    setError(null);
    setJoining(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_CORE_URL}/joystick/join`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: playerIdRef.current }),
        }
      );

      const data = await res.json();

      if (!res.ok || data.success === false) {
        // This includes:
        // - no credits
        // - payment not visible yet
        setError(
          data.message ||
            "You already played or we did not receive your credits yet. If you just paid, wait a few seconds and refresh."
        );
        setJoining(false);
        return;
      }

      setQueuePos(data.position ?? null);
      setIsActive(Boolean(data.active));

      if (data.active) {
        const seconds = Number(data.remaining) || 35;
        setTotalTime(seconds);
        startSessionTimer(seconds);
      }

      setJoining(false);
    } catch (err) {
      console.error("❌ requestAccess error:", err);
      setError("Connection failed. Please try again.");
      setJoining(false);
    } finally {
      joiningRef.current = false;
    }
  };

  // ---------------------------------------------------
  // Setup Pusher + realtime queue updates
  // ---------------------------------------------------
  useEffect(() => {
    if (!playerIdRef.current) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      wsHost: process.env.NEXT_PUBLIC_SOKETI_HOST,
      wsPort: Number(process.env.NEXT_PUBLIC_SOKETI_PORT),
      forceTLS: process.env.NEXT_PUBLIC_SOKETI_TLS === "true",
      enabledTransports: ["ws", "wss"],
    });

    const gameChannel = pusher.subscribe("joystick-channel");
    const queueChannel = pusher.subscribe("joystick-queue");

    // Queue updates from backend
    queueChannel.bind("queue-update", (data) => {
      setQueueLength(data.queue.length);

      const entry = data.queue.find((u) => u.id === playerIdRef.current);
      setQueuePos(entry ? entry.position : null);

      const nowActive = data.activeId === playerIdRef.current;
      const remaining = data.remaining || 35;

      if (nowActive && !isActive) {
        setIsActive(true);
        setTotalTime(remaining);
        startSessionTimer(remaining);
      } else if (!nowActive && isActive) {
        // Session ended on the server side
        setIsActive(false);
        clearInterval(timerRef.current);
        setShowThanks(true);
      }
    });

    // When socket connects: init game and ask backend for access
    pusher.connection.bind("connected", async () => {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/send-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "joystick-channel",
            event: "init-game",
            data: {},
          }),
        });
      } catch (e) {
        console.error("❌ Failed to send init-game event:", e);
      }

      // Directly ask backend to join (no extra /mollie/check polling)
      await requestAccess();
    });

    // Reset claw position on "objects-init" event
    gameChannel.bind("objects-init", () => {
      lastPositionRef.current = { x: 0, y: 0 };
      setResetNotice(true);
      setTimeout(() => setResetNotice(false), 2000);
    });

    return () => {
      clearInterval(timerRef.current);
      pusher.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // ---------------------------------------------------
  // Send command to backend (only allowed while active)
  // ---------------------------------------------------
  const sendCommand = async (event, data) => {
    if (!isActive) return;
    try {
      await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/send-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "joystick-channel", event, data }),
      });
    } catch (err) {
      console.error("❌ sendCommand error:", err);
    }
  };

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
      default:
        break;
    }

    lastPositionRef.current = pos;
    sendCommand("move", { direction });
  };

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
    await sendCommand("coin", {});
  };

  // ---------------------------------------------------
  // Screens
  // ---------------------------------------------------

  // Waiting / queue screen
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
          <p className="text-red-400 text-sm text-center max-w-xs">{error}</p>
        ) : (
          <p className="text-gray-400 text-sm">
            Waiting for your turn... Position:{" "}
            <span className="text-green-400 font-semibold">
              {queuePos ?? "-"}
            </span>
          </p>
        )}

        <p className="text-gray-500 text-xs mt-2">
          Players in queue: {queueLength}
        </p>
      </div>
    );
  }

  // Thank you screen after real session end
  if (showThanks) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-green-800 to-emerald-600 text-white p-6 text-center">
        <div className="bg-gray-800/60 backdrop-blur-md rounded-2xl p-8 shadow-2xl">
          <h2 className="text-3xl font-extrabold mb-4">
            🎉 Thank you for playing!
          </h2>
          <p className="text-gray-200 mb-6">
            If you want to play again, please donate again to start a new
            session.
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

  // Main joystick UI
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
          style={{ width: `${(timeLeft / totalTime) * 100 || 0}%` }}
        ></div>
      </div>

      <p className="text-sm text-gray-400 mb-6">Time left: {timeLeft}s</p>

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
        Use arrows to move the claw. Press <strong>🤚 Grab</strong> to pick an
        item or <strong>🪙 Coin</strong> to insert a coin.
      </p>
    </div>
  );
}
