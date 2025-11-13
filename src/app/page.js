"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);
  const router = useRouter();

  // 🧹 Always clear old sessions when returning home
  useEffect(() => {
    localStorage.removeItem("joystickUser");
  }, []);

  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   setError(null);

  //   if (!name || amount <= 0) {
  //     return setError("⚠️ Vul je naam en een geldig bedrag in.");
  //   }

  //   setLoading(true);
  //   try {
  //     const fixedAmount = Math.min(amount, 500);

  //     // 1️⃣ Save the donation
  //     const res = await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/entries`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({
  //         name: name.trim(),
  //         email: email.trim() || null,
  //         amount: fixedAmount,
  //       }),
  //     });

  //     const data = await res.json();
  //     if (!data.ok) throw new Error(data.error || "Onbekende fout");

  //     // ✅ Store user
  //     localStorage.setItem("joystickUser", name.trim());

  //     // 2️⃣ Try joining queue
  //     const joinRes = await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/joystick/join`, {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ id: name.trim() }),
  //     });

  //     const joinData = await joinRes.json();

  //     // 3️⃣ Handle cases
  //     if (!joinData.success) {
  //       if (joinData.message?.includes("donate again")) {
  //         setError("💡 Je hebt al gespeeld. Doneer opnieuw om nog eens te spelen.");
  //       } else {
  //         setError("❌ Kon niet deelnemen aan de wachtrij.");
  //       }
  //       return;
  //     }

  //     // 4️⃣ Success — show animation
  //     setConfirmed(true);
  //     setTimeout(() => router.push("/joystick"), 2500);
  //   } catch (err) {
  //     console.error("❌ Donation error:", err);
  //     setError("Er ging iets mis. Probeer het opnieuw.");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

const handleSubmit = async (e) => {
  e.preventDefault();
  setError(null);

  if (!name.trim() || amount <= 0) {
    return setError("⚠️ Vul je naam en een geldig bedrag in (minimaal €1).");
  }

  const fixedAmount = Math.min(amount, 500);
  const cleanName = name.trim();
  const cleanEmail = email.trim() || null;

  // Disable button
  setLoading(true);

  try {
    // 🧠 Save locally so Joystick can identify the user after redirect
    localStorage.setItem("joystickUser", cleanName);

    // 💳 Create payment via backend (no DB write until webhook)
    const res = await fetch(`${process.env.NEXT_PUBLIC_CORE_URL}/mollie/create-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: cleanName,
        email: cleanEmail,
        amount: fixedAmount,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Server error: ${text}`);
    }

    const data = await res.json();

    if (!data?.checkoutUrl) {
      throw new Error(data?.error || "Er is een probleem met het betaalverzoek.");
    }

    // 🚀 Redirect to Mollie checkout
    window.location.href = data.checkoutUrl;
  } catch (err) {
    console.error("❌ Payment start error:", err);
    setError(
      "Er ging iets mis bij het starten van de betaling. Controleer je verbinding of probeer opnieuw."
    );
  } finally {
    setLoading(false);
  }
};



  // 🌟 Confirmation screen
  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-900 via-emerald-700 to-emerald-500 text-white text-center px-6">
        <div className="animate-bounce mb-6 text-5xl">🎮</div>
        <h1 className="text-3xl font-extrabold mb-3">Bedankt, {name}!</h1>
        <p className="text-lg text-emerald-100 mb-6">
          Je donatie van <strong>€{Math.min(amount, 500)}</strong> is ontvangen.
          <br /> We maken jouw sessie klaar...
        </p>
        <div className="relative w-48 h-3 bg-emerald-900/50 rounded-full overflow-hidden">
          <div className="absolute top-0 left-0 h-full bg-emerald-300 animate-[progress_2.5s_linear_forwards]"></div>
        </div>

        <style jsx>{`
          @keyframes progress {
            0% {
              width: 0%;
            }
            100% {
              width: 100%;
            }
          }
        `}</style>
      </div>
    );
  }

  // 🏠 Main donation form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 via-emerald-700 to-green-600 px-4">
      <div className="bg-white text-gray-800 shadow-2xl rounded-3xl p-8 w-full max-w-md relative overflow-hidden">
        {/* Glow decorations */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-emerald-400 opacity-20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-green-300 opacity-25 rounded-full blur-3xl"></div>

        <h1 className="text-3xl font-extrabold mb-2 text-center text-emerald-700">
          🎮 SweetControl
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Doneer om te spelen — elke euro = 1 beurt (35 seconden)
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 relative z-10">
          {/* Naam */}
          <div>
            <label className="block text-sm font-semibold mb-1">Naam *</label>
            <input
              type="text"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="Jouw naam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold mb-1">
              E-mail (optioneel)
            </label>
            <input
              type="email"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="voorbeeld@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Bedrag */}
          <div>
            <label className="block text-sm font-semibold mb-1">
              Bedrag (€1 – €500)
            </label>
            <input
              type="number"
              min="1"
              max="500"
              step="1"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              required
            />
            <p className="text-sm text-gray-600 mt-1">
              💰 <strong>1 € = 1 credit</strong> → 35 sec per credit <br />
              (maximaal 5 credits = 175 seconden)
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-100 text-red-700 text-sm px-3 py-2 rounded-md border border-red-300">
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className={`py-3 rounded-xl font-semibold text-white transition-all duration-300 shadow-md ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-700 active:scale-95"
            }`}
          >
            {loading ? "Bezig..." : "🎮 Start sessie"}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          Maximale donatie: <strong>€500</strong> (max. 5 credits per sessie)
        </p>
      </div>
    </div>
  );
}
