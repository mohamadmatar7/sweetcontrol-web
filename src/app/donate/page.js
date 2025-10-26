"use client";

export default function DonatePage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-8 text-center">
      {/* Title */}
      <h1 className="text-4xl font-bold mb-6">Support "Warmste Week"</h1>

      {/* Short description */}
      <p className="max-w-xl text-gray-300 mb-10 leading-relaxed">
        Join us in making a difference! Your donation will help provide
        essential support and resources to diabetic patients in need. Every
        contribution, big or small, brings us closer to our goal of improving
        lives and fostering a healthier community. Thank you for your generosity
        and kindness.
      </p>

      {/* Placeholder donate button */}
      <button
        className="bg-pink-600 hover:bg-pink-500 transition-all px-8 py-3 rounded-xl text-lg font-semibold shadow-lg"
        onClick={() => alert("Donation feature coming soon ❤️")}
      >
        ❤️ Support Now
      </button>

      {/* Small footer note */}
      <p className="text-gray-500 text-sm mt-10">
        © Sweetcontrol — Built with love and purpose.
      </p>
    </div>
  );
}
