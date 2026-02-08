// components/UserManual.tsx
import React from "react";

interface UserManualProps {
    onClose: () => void;
}

const UserManual: React.FC<UserManualProps> = ({ onClose }) => {
    return (
        <div className="h-screen bg-slate-50 flex flex-col">
            {/* ─── Header / Navigation Bar ─── */}
            <header
                className="text-white px-5 py-4 flex items-center justify-between sticky top-0 z-20 shadow-md"
                style={{ backgroundColor: "#047857" }}
            >
                <button
                    onClick={onClose}
                    className="flex items-center gap-2 font-medium hover:opacity-90 transition"
                >
                    ← Back
                </button>
                <h1 className="text-xl font-bold">Palcut User Manual</h1>
                <div className="w-10" /> {/* spacer */}
            </header>


            {/* ─── Main Content Area ─── */}
            <main className="flex-1 overflow-y-auto min-h-0">
                <div className="mt-10 max-w-4xl mx-auto px-5 sm:px-8 lg:px-12 py-8 lg:py-12">
                    <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 mb-10 text-center lg:text-left">
                        Palcut Game Calculator – User Manual
                    </h1>

                    {/* Welcome Section */}
                    <section className="mb-14">
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-700 mb-6">
                            Welcome to Palcut Game Calculator!
                        </h2>

                        <div className="text-slate-800 prose prose-slate max-w-none text-lg">
                            <p className="mb-4">
                                This web app helps groups of friends track scores, manage buy-ins,
                                and handle payouts for the card game{" "}
                                <strong>Palcut</strong> — a points-based elimination game played
                                with 4–6 players.
                            </p>

                            <p className="mb-4">
                                It supports <strong>real-time syncing</strong> across devices
                                using room codes — perfect for everyone at the table to see
                                updates instantly.
                            </p>

                            <div className="mb-6 bg-amber-50 border border-amber-200 p-5 rounded-xl mt-6 text-sm">
                                <strong>Note:</strong> The app uses anonymous authentication (no
                                login needed). Rooms expire after 24 hours of inactivity.
                            </div>
                        </div>
                    </section>

                    {/* Table of Contents */}
                    <section className="mb-6">
                        <h3 className="text-xl font-semibold text-slate-800 mb-5">
                            Table of Contents
                        </h3>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-700 font-medium">
                            <li>Getting Started</li>
                            <li>Setting Up a Game</li>
                            <li>Playing the Game</li>
                            <li>Special Features</li>
                            <li>Game History and Reports</li>
                            <li>Troubleshooting and Tips</li>
                        </ul>
                    </section>

                    {/* Getting Started */}
                    <section className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">
                            Getting Started
                        </h2>

                        <div className="space-y-8 text-slate-700 text-lg leading-relaxed">
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    1) Open the App
                                </h3>
                                <p>
                                    Open the Palcut Calculator on your phone or laptop browser.
                                    The app works best on Chrome, Safari, or Edge.
                                </p>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    2) Create a Room
                                </h3>
                                <p className="mb-3">
                                    Tap <strong>Create Room</strong> to start a new game.
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>You will get a unique Room Code.</li>
                                    <li>Share the Room Code with friends.</li>
                                    <li>Everyone who joins sees the same live data.</li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    3) Join a Room
                                </h3>
                                <p className="mb-3">
                                    Tap <strong>Join Room</strong> and enter the Room Code.
                                </p>
                                <div className="bg-slate-50 border rounded-xl p-4 text-sm">
                                    Tip: If someone’s phone dies, they can rejoin anytime using the
                                    same Room Code.
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Setting Up a Game */}
                    <section className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">
                            Setting Up a Game
                        </h2>

                        <div className="space-y-8 text-slate-700 text-lg leading-relaxed">
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    1) Add Players
                                </h3>
                                <p className="mb-3">
                                    Enter each player name and tap <strong>Add</strong>.
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Supports 3–8 players (best for 4–6).</li>
                                    <li>Names can be edited anytime.</li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    2) Set Buy-In Amount
                                </h3>
                                <p className="mb-3">
                                    Set the amount each player pays to enter the game (example:
                                    Rs. 100).
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Buy-in affects pot and profit calculation.</li>
                                    <li>Can be changed before the first round starts.</li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    3) Confirm and Start
                                </h3>
                                <p>
                                    Once players and buy-in are ready, start playing and enter
                                    scores after each round.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Playing the Game */}
                    <section className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">
                            Playing the Game
                        </h2>

                        <div className="space-y-8 text-slate-700 text-lg leading-relaxed">
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Entering Round Scores
                                </h3>
                                <p className="mb-3">
                                    After each round, enter points for each player:
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Players who lose get positive points (example: 30).</li>
                                    <li>Winner usually gets 0 points.</li>
                                    <li>The app automatically totals scores.</li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Knockout / Cut (100 Rule)
                                </h3>
                                <p className="mb-3">
                                    In Palcut, a player is out when their total reaches{" "}
                                    <strong>100</strong> or more.
                                </p>
                                <div className="bg-slate-50 border rounded-xl p-4 text-sm">
                                    The app shows who is knocked out and prevents further score
                                    entry for eliminated players.
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Ending the Game
                                </h3>
                                <p>
                                    The game ends when only 1 player remains (winner). The app
                                    automatically calculates:
                                </p>
                                <ul className="list-disc pl-6 space-y-2 mt-3">
                                    <li>Total pot</li>
                                    <li>Each player’s net profit/loss</li>
                                    <li>Payouts</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Special Features */}
                    <section className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">
                            Special Features
                        </h2>

                        <div className="space-y-8 text-slate-700 text-lg leading-relaxed">
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Direct Win (Winner Selected)
                                </h3>
                                <p className="mb-3">
                                    Sometimes a player wins directly without entering round points
                                    (example: all others knocked instantly).
                                </p>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
                                    In this case, the winner receives the full pot minus their own
                                    buy-in, and everyone else loses their buy-in.
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Rejoin Support
                                </h3>
                                <p>
                                    If a player leaves the room or closes the browser, they can
                                    rejoin anytime using the Room Code. The app keeps the same
                                    history and totals.
                                </p>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Live Sync for Everyone
                                </h3>
                                <p>
                                    Multiple people can open the same room on different devices.
                                    Changes update instantly for everyone.
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Game History and Reports */}
                    <section className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">
                            Game History and Reports
                        </h2>

                        <div className="space-y-8 text-slate-700 text-lg leading-relaxed">
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    History Tab
                                </h3>
                                <p className="mb-3">
                                    The History tab shows every round, including:
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Date & time</li>
                                    <li>Round scores per player</li>
                                    <li>Total points after each round</li>
                                    <li>Direct win results (if used)</li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Download PDF Report
                                </h3>
                                <p className="mb-3">
                                    Tap <strong>Download PDF</strong> to generate a report that
                                    includes:
                                </p>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Game summary</li>
                                    <li>Total pot</li>
                                    <li>Final profit/loss per player</li>
                                    <li>Full round-by-round table</li>
                                </ul>
                            </div>

                            <div className="bg-slate-50 border rounded-2xl p-6 text-sm">
                                <strong>Tip:</strong> If your PDF looks too small on mobile,
                                download it and open using Google Drive or a PDF viewer.
                            </div>
                        </div>
                    </section>

                    {/* Troubleshooting */}
                    <section className="mb-6">
                        <h2 className="text-2xl font-bold text-slate-700 mb-6">
                            Troubleshooting and Tips
                        </h2>

                        <div className="space-y-8 text-slate-700 text-lg leading-relaxed">
                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Room Not Found
                                </h3>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Double-check the room code spelling.</li>
                                    <li>Ask the host to confirm the code.</li>
                                    <li>
                                        Rooms expire after 24 hours of inactivity — create a new
                                        room if needed.
                                    </li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Scores Entered Wrong
                                </h3>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Use the “Delete Round” option (if available).</li>
                                    <li>Or add a correction round.</li>
                                </ul>
                            </div>

                            <div className="bg-white rounded-2xl shadow-sm border p-6">
                                <h3 className="text-xl font-bold text-slate-900 mb-3">
                                    Best Practices
                                </h3>
                                <ul className="list-disc pl-6 space-y-2">
                                    <li>Keep one person as “host” for clean score entry.</li>
                                    <li>Always confirm round scores before saving.</li>
                                    <li>Download PDF at the end for permanent record.</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Final action button */}
                    <div className="mt-6 mb-6 text-center">
                        <button
                            onClick={onClose}
                            className="bg-emerald-600 hover:bg-slate-700 text-white px-5 py-3 rounded-xl font-bold text-md shadow-md transition hover:shadow-lg"
                        >
                            Got it – Return to Game
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default UserManual;
