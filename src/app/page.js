"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Cpu, LineChart, Gamepad2, Heart } from "lucide-react";

// Home Page Component
export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white flex flex-col items-center justify-center px-6 py-12">
      {/* Project title and short intro */}
      <motion.div
        initial={{ opacity: 0, y: -40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
        className="text-center max-w-2xl"
      >
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          Sweetcontrol
        </h1>
        <p className="text-gray-300 text-lg mb-8">
          A smart control system built for Raspberry Pi — manage motors, view
          real-time data graphics, and interact using a joystick interface.
        </p>
      </motion.div>

      {/* Navigation cards */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-3xl"
      >
        {/* Motor Page */}
        <Link
          href="/motor"
          className="group bg-gray-800 hover:bg-gray-700 transition-all rounded-2xl p-6 shadow-lg flex items-center gap-4"
        >
          <Cpu className="w-10 h-10 text-blue-400 group-hover:scale-110 transition-transform" />
          <div>
            <h2 className="text-xl font-semibold">Motor Control</h2>
            <p className="text-gray-400 text-sm">
              Manage motor speed and direction in real-time.
            </p>
          </div>
        </Link>

        {/* Graphic Page */}
        <Link
          href="/graphic"
          className="group bg-gray-800 hover:bg-gray-700 transition-all rounded-2xl p-6 shadow-lg flex items-center gap-4"
        >
          <LineChart className="w-10 h-10 text-green-400 group-hover:scale-110 transition-transform" />
          <div>
            <h2 className="text-xl font-semibold">Graphic</h2>
            <p className="text-gray-400 text-sm">
              View live charts and analytics of system performance.
            </p>
          </div>
        </Link>

        {/* Joystick Page */}
        <Link
          href="/joystick"
          className="group bg-gray-800 hover:bg-gray-700 transition-all rounded-2xl p-6 shadow-lg flex items-center gap-4"
        >
          <Gamepad2 className="w-10 h-10 text-yellow-400 group-hover:scale-110 transition-transform" />
          <div>
            <h2 className="text-xl font-semibold">Joystick</h2>
            <p className="text-gray-400 text-sm">
              Control devices interactively with a joystick interface.
            </p>
          </div>
        </Link>

        {/* Donate Page */}
        <Link
          href="/donate"
          className="group bg-gray-800 hover:bg-gray-700 transition-all rounded-2xl p-6 shadow-lg flex items-center gap-4"
        >
          <Heart className="w-10 h-10 text-pink-400 group-hover:scale-110 transition-transform" />
          <div>
            <h2 className="text-xl font-semibold">Support "Warmste Week"</h2>
            <p className="text-gray-400 text-sm">
              Help diabetic patients by supporting our charity initiative.
            </p>
          </div>
        </Link>
      </motion.div>

      {/* Footer */}
      <footer className="mt-12 text-gray-500 text-sm">
        <p>Sweetcontrol. All rights reserved.</p>
      </footer>
    </div>
  );
}
