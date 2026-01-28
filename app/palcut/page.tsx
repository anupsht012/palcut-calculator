"use client";

import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  addDoc, 
  getDocs, 
  serverTimestamp, 
  query, 
  orderBy,
  deleteDoc
} from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { jsPDF } from 'jspdf';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyD0Yz56yCb2KiqXMGzL_QwyChWJ8Dg_P0s",
  authDomain: "palcut-calculator.firebaseapp.com",
  projectId: "palcut-calculator",
  storageBucket: "palcut-calculator.firebasestorage.app",
  messagingSenderId: "989962419105",
  appId: "1:989962419105:web:873a14a507d4b4099229e0",
  measurementId: "G-K3627RC8F3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
const GAME_ID = "palcut_live_session"; 

export type Multiplier = 'Normal' | 'Deri' | 'Double' | 'Chaubar';

interface Player {
  id: string;
  name: string;
  cumulativeScore: number;
  isOut: boolean;
  totalPaid: number;
  rejoinCount: number;
  canNoLongerRejoin?: boolean;
}

// Reusable Watermark component
const Watermark = () => (
  <div className="text-center text-slate-400 text-xs font-semibold select-none mt-8 py-4">
    © Anup Shrestha {new Date().getFullYear()}
  </div>
);

const PalCutGame = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [newName, setNewName] = useState('');
  const [roundScores, setRoundScores] = useState<Record<string, string>>({});
  const [multiplier, setMultiplier] = useState<Multiplier>('Normal');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [buyInAmount, setBuyInAmount] = useState<number>(100);

  const [finalWinnerName, setFinalWinnerName] = useState('');
  const [finalPotAmount, setFinalPotAmount] = useState(0);
  const [finalRounds, setFinalRounds] = useState(0);
  const [finalStats, setFinalStats] = useState<any[]>([]);
  const [finalPayoutDescription, setFinalPayoutDescription] = useState<string>('');

  const [history, setHistory] = useState<any[]>([]);
  const [view, setView] = useState<'game' | 'history'>('game');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [frequentNames, setFrequentNames] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);

  const withLoading = async (fn: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "games", GAME_ID), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPlayers(data.players || []);
        setGameStarted(data.gameStarted || false);
        setRoundsPlayed(data.roundsPlayed || 0);
        setBuyInAmount(data.buyInAmount || 100);
      }
    });
    const saved = localStorage.getItem('palcut_frequent_players');
    if (saved) setFrequentNames(JSON.parse(saved));
    return () => unsub();
  }, []);

  const syncToDb = async (updates: any) => {
    await setDoc(doc(db, "games", GAME_ID), updates, { merge: true });
  };

  const fetchHistory = async () => {
    await withLoading(async () => {
      setIsLoadingHistory(true);
      try {
        const q = query(collection(db, "history"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        const historyData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setHistory(historyData);
        setView('history');
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    });
  };

  const rankedPlayers = [...players].sort((a, b) => a.cumulativeScore - b.cumulativeScore);
  const totalPot = players.reduce((acc, p) => acc + p.totalPaid, 0);

  const addPlayer = async (nameOverride?: string) => {
    const nameToUse = (nameOverride || newName).trim();
    if (!nameToUse || players.length >= 6) return;
    if (players.find(p => p.name.toLowerCase() === nameToUse.toLowerCase())) return;

    const newPlayer: Player = {
      id: Math.random().toString(36).substr(2, 9),
      name: nameToUse,
      cumulativeScore: 0,
      isOut: false,
      totalPaid: buyInAmount,
      rejoinCount: 0,
      canNoLongerRejoin: false
    };

    const updatedPlayers = [...players, newPlayer];
    setPlayers(updatedPlayers);
    setNewName('');

    await withLoading(async () => {
      await syncToDb({ players: updatedPlayers });
    });

    if (!frequentNames.includes(nameToUse)) {
      const newFreq = [nameToUse, ...frequentNames].slice(0, 10);
      setFrequentNames(newFreq);
      localStorage.setItem('palcut_frequent_players', JSON.stringify(newFreq));
    }
  };

  const removePlayer = async (id: string) => {
    const updatedPlayers = players.filter(p => p.id !== id);
    setPlayers(updatedPlayers);

    await withLoading(async () => {
      await syncToDb({ players: updatedPlayers });
    });
  };

  const submitRound = async () => {
    if (!winnerId) { alert("Select a winner!"); return; }

    await withLoading(async () => {
      const updatedPlayers = players.map(p => {
        if (p.canNoLongerRejoin) return p;
        if (p.isOut) {
          return { ...p, canNoLongerRejoin: true };
        }

        let added = 0;
        if (p.id === winnerId) {
          added = 0;
        } else {
          added = parseInt(roundScores[p.id] || '0');
          if (multiplier === 'Deri') added *= 1.5;
          if (multiplier === 'Double') added *= 2;
          if (multiplier === 'Chaubar') added *= 4;
        }

        const finalPoints = Math.trunc(added);
        const newScore = p.cumulativeScore + finalPoints;
        const isNowOut = newScore >= 100;

        return {
          ...p,
          cumulativeScore: newScore,
          isOut: isNowOut,
        };
      });

      const nextRoundCount = roundsPlayed + 1;
      setPlayers(updatedPlayers);
      setRoundsPlayed(nextRoundCount);
      setRoundScores({});
      setWinnerId(null);
      setMultiplier('Normal');

      await syncToDb({ players: updatedPlayers, roundsPlayed: nextRoundCount });
    });
  };

  const rejoin = async (id: string) => {
    await withLoading(async () => {
      const activeScores = players.filter(p => !p.isOut).map(p => p.cumulativeScore);
      const highestActiveScore = activeScores.length > 0 ? Math.max(...activeScores) : 0;

      const updatedPlayers = players.map(p =>
        p.id === id ? {
          ...p,
          isOut: false,
          cumulativeScore: highestActiveScore,
          totalPaid: p.totalPaid + buyInAmount,
          rejoinCount: p.rejoinCount + 1
        } : p
      );
      setPlayers(updatedPlayers);
      await syncToDb({ players: updatedPlayers });
    });
  };

  const handleFinishGame = async () => {
    if (!confirm("Finish game and save results?")) return;

    await withLoading(async () => {
      const activePlayers = players.filter(p => !p.isOut);
      const activeCount = activePlayers.length;

      let payoutDescription = '';
      let winnerDisplay = '';

      if (activeCount === 0) {
        payoutDescription = 'No winners (all eliminated)';
        winnerDisplay = '—';
      } else if (activeCount === 1) {
        payoutDescription = 'Full Winner (last remaining)';
        winnerDisplay = activePlayers[0].name;
      } else {
        payoutDescription = `Split equally among ${activeCount} remaining players`;
        winnerDisplay = activePlayers.map(p => p.name).join(', ');
      }

      const sharePerWinner = activeCount > 0 ? totalPot / activeCount : 0;

      const stats = players.map(p => {
        const isActive = !p.isOut;
        let net = -p.totalPaid;
        if (isActive) net += sharePerWinner;

        return {
          name: p.name,
          score: p.cumulativeScore,
          paid: p.totalPaid,
          net: Math.round(net),
          isWinner: isActive,
        };
      });

      await addDoc(collection(db, "history"), {
        winnerName: winnerDisplay,
        totalPot: totalPot,
        roundsPlayed: roundsPlayed,
        payoutDescription,
        activeWinnersCount: activeCount,
        timestamp: serverTimestamp(),
        playerStats: stats,
      });

      const resetPlayers = players.map(p => ({
        ...p,
        cumulativeScore: 0,
        isOut: false,
        totalPaid: buyInAmount,
        rejoinCount: 0,
        canNoLongerRejoin: false
      }));

      await setDoc(doc(db, "games", GAME_ID), {
        players: resetPlayers,
        gameStarted: false,
        roundsPlayed: 0,
        buyInAmount
      });

      setFinalWinnerName(winnerDisplay);
      setFinalPotAmount(totalPot);
      setFinalRounds(roundsPlayed);
      setFinalStats(stats);
      setFinalPayoutDescription(payoutDescription);

      setShowSummary(true);
    });
  };

  const resetLiveGame = async () => {
    if (!confirm("Reset current game scores and payments?")) return;

    await withLoading(async () => {
      const resetPlayers = players.map(p => ({
        ...p,
        cumulativeScore: 0,
        isOut: false,
        totalPaid: buyInAmount,
        rejoinCount: 0,
        canNoLongerRejoin: false
      }));

      await setDoc(doc(db, "games", GAME_ID), {
        players: resetPlayers,
        gameStarted: false,
        roundsPlayed: 0,
        buyInAmount
      });
      window.location.reload();
    });
  };

  const handleStartNewGame = () => {
    setShowSummary(false);
    fetchHistory();
  };

  const LoaderOverlay = (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="w-16 h-16 rounded-full border-4 border-t-4 border-slate-200 border-t-emerald-400 animate-spin" />
    </div>
  );

  if (view === 'history') {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 md:p-8 space-y-5 text-sm min-h-screen flex flex-col">
        {isLoading && LoaderOverlay}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
          <h2 className="text-2xl font-bold text-slate-800">Game History</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <button 
              onClick={() => setView('game')} 
              className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase hover:bg-slate-700 transition-colors"
            >
              Back to Game
            </button>
            {history.length > 0 && (
              <button
                onClick={() => {
                  const doc = new jsPDF();
                  let y = 20;

                  doc.setFontSize(18);
                  doc.text("Palcut Game History", 105, y, { align: "center" });
                  y += 15;

                  doc.setFontSize(12);
                  doc.setTextColor(100);
                  doc.text(`Total Games: ${history.length}`, 105, y, { align: "center" });
                  y += 15;

                  history.forEach((game, index) => {
                    if (y > 260) {
                      doc.addPage();
                      y = 20;
                    }

                    doc.setFontSize(14);
                    doc.setTextColor(0);
                    doc.text(`Game ${index + 1} - ${game.timestamp?.toDate?.().toLocaleDateString() || 'Unknown Date'}`, 20, y);
                    y += 10;

                    doc.setFontSize(12);
                    doc.text(`Winner: ${game.winnerName}`, 25, y);
                    y += 8;
                    doc.text(`Final Pot: ₹${game.totalPot}`, 25, y);
                    y += 10;

                    doc.setFontSize(11);
                    doc.text("Players:", 25, y);
                    y += 8;

                    game.playerStats?.forEach((ps: any) => {
                      if (y > 270) {
                        doc.addPage();
                        y = 20;
                      }
                      const status = ps.isWinner ? "Winner" : "Eliminated";
                      const net = ps.isWinner ? `+₹${Math.round(ps.net || 0)}` : `-₹${ps.paid}`;
                      doc.text(`${ps.name} - Score: ${ps.score} - Net: ${net} (${status})`, 30, y);
                      y += 7;
                    });

                    y += 12; // extra spacing between games
                  });

                  doc.save(`Palcut_All_Games_${new Date().toISOString().split('T')[0]}.pdf`);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-bold text-xs uppercase transition-colors shadow-sm"
              >
                Download All as PDF
              </button>
            )}
          </div>
        </div>

        <div className="flex-1">
          {isLoadingHistory ? (
            <div className="text-center py-20 space-y-4">
              <div className="w-12 h-12 mx-auto border-4 border-t-emerald-500 border-slate-200 rounded-full animate-spin" />
              <p className="text-slate-600 font-medium">Loading latest games...</p>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center py-16 text-slate-400 font-medium text-sm">No previous games found.</p>
          ) : (
            history.map((game) => (
              <div key={game.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-4 text-sm mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <p className="text-2xl font-black text-slate-900">🏆 {game.winnerName}</p>
                      <button
                        onClick={async () => {
                          if (confirm(`Delete this game?`)) {
                            await withLoading(async () => {
                              try {
                                await deleteDoc(doc(db, "history", game.id));
                                setHistory(history.filter(h => h.id !== game.id));
                              } catch (err) {
                                alert("Failed to delete");
                              }
                            });
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-2xl font-bold p-1"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-sm text-slate-500">
                      {game.timestamp?.toDate?.().toLocaleString() || '—'}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-sm text-slate-500 font-bold uppercase">Final Pot</p>
                    <p className="text-3xl font-black text-emerald-600">₹{game.totalPot}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {game.playerStats?.map((ps: any, i: number) => (
                    <div 
                      key={i} 
                      className="flex justify-between items-center bg-slate-50 p-4 rounded-xl text-sm"
                    >
                      <span className="text-slate-700 truncate mr-3">
                        {ps.name} <span className="text-xs text-slate-400">({ps.score})</span>
                      </span>
                      <span className={ps.isWinner ? "text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-lg" : "text-red-600"}>
                        {ps.isWinner ? `+₹${Math.round(ps.net || 0)}` : `-₹${ps.paid}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <Watermark />
      </div>
    );
  }

  if (showSummary) {
    return (
      <div className="max-w-2xl mx-auto p-5 sm:p-8 space-y-6 text-center text-sm min-h-screen flex flex-col">
        {isLoading && LoaderOverlay}
        <div className="flex-1">
          {finalStats.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500 animate-pulse">Finalizing game results...</p>
            </div>
          ) : (
            <div className="bg-gradient-to-b from-slate-900 to-slate-800 text-white p-6 sm:p-8 rounded-2xl shadow-xl">
              <h2 className="text-emerald-400 font-bold uppercase tracking-wide text-xs mb-3">
                {finalPayoutDescription}
              </h2>
              <p className="text-3xl sm:text-4xl font-bold mb-2">🏆 {finalWinnerName}</p>
              <p className="text-emerald-300 text-lg sm:text-xl font-bold mb-6">
                Pot: ₹{finalPotAmount}
              </p>
              
              <div className="space-y-3">
                {finalStats.map((p, i) => (
                  <div 
                    key={i} 
                    className={`flex justify-between items-center p-4 rounded-xl text-sm ${
                      p.isWinner 
                        ? 'bg-emerald-600/20 border border-emerald-500/50' 
                        : 'bg-white/10 border border-white/10'
                    }`}
                  >
                    <div className="text-left">
                      <p className="font-bold truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">Score: {p.score}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${p.net >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                        {p.net >= 0 ? `+₹${p.net}` : `₹${p.net}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button 
            onClick={handleStartNewGame}
            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all active:scale-95 mt-6"
          >
            Start New Game
          </button>
        </div>
        <Watermark />
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="max-w-lg mx-auto mt-6 sm:mt-10 px-3 sm:px-0 min-h-screen flex flex-col items-center">
        {isLoading && LoaderOverlay}
        
        {/* Main content box */}
        <div className="w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-5 sm:p-8 space-y-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800">Palcut Calculator</h2>
            <button 
              onClick={fetchHistory} 
              className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg font-bold text-xs uppercase hover:bg-indigo-100 transition-colors"
            >
              History
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Player name"
              className="flex-1 p-4 bg-slate-50 border-2 border-transparent rounded-xl outline-none focus:border-indigo-500 focus:bg-white font-medium text-base transition-all"
            />
            <button 
              onClick={() => addPlayer()} 
              className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-sm hover:bg-indigo-700 active:scale-95 transition-all"
            >
              Add
            </button>
          </div>

          <div className="mb-6">
            <p className="text-xs font-bold text-slate-600 uppercase mb-2 tracking-wide">Buy-in / Rejoin Amount (₹)</p>
            <input
              type="number"
              min={50}
              max={999}
              step={10}
              value={buyInAmount === 0 ? '' : buyInAmount}
              onChange={async (e) => {
                const val = e.target.value;

                if (val === '') {
                  setBuyInAmount(0);
                  await withLoading(async () => {
                    await syncToDb({ buyInAmount: 0 });
                  });
                  return;
                }

                if (/^\d{1,3}$/.test(val)) {
                  const num = parseInt(val, 10);
                  if (num <= 999) {
                    setBuyInAmount(num);
                    await withLoading(async () => {
                      await syncToDb({ buyInAmount: num });
                    });
                  }
                }
              }}
              onBlur={() => {
                if (buyInAmount < 50) {
                  setBuyInAmount(100);
                  syncToDb({ buyInAmount: 100 }).catch(err => console.error(err));
                }
              }}
              placeholder="100"
              className="w-full p-4 bg-slate-50 border-2 border-transparent rounded-xl outline-none focus:border-indigo-500 focus:bg-white font-bold text-base transition-all text-center"
            />
            <p className="text-xs text-slate-500 mt-1">Minimum ₹50 • Applies to new players & rejoins</p>
          </div>

          {frequentNames.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3 ml-1 tracking-wide">Recent Players</p>
              <div className="flex flex-wrap gap-2">
                {frequentNames.map(name => (
                  <div key={name} className="flex items-center bg-slate-100 hover:bg-slate-200 rounded-full px-4 py-1.5 gap-2 transition-colors text-sm">
                    <button 
                      onClick={() => addPlayer(name)} 
                      className="font-medium text-slate-700"
                    >
                      + {name}
                    </button>
                    <button
                      onClick={() => {
                        const newFreq = frequentNames.filter(n => n !== name);
                        setFrequentNames(newFreq);
                        localStorage.setItem('palcut_frequent_players', JSON.stringify(newFreq));
                      }}
                      className="text-red-500 hover:text-red-700 text-base font-bold leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-8 min-h-[100px]">
            {players.length === 0 && (
              <p className="text-center py-10 text-slate-400 font-medium text-sm italic">Add at least 2 players to start</p>
            )}
            {players.map(p => (
              <div key={p.id} className="p-4 bg-slate-50 rounded-xl flex justify-between items-center text-sm">
                <span className="font-bold text-slate-800">{p.name}</span>
                <button 
                  onClick={() => removePlayer(p.id)} 
                  className="text-red-500 hover:text-red-700 font-bold text-xs uppercase"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button 
            onClick={() => withLoading(async () => { 
              setGameStarted(true); 
              await syncToDb({ gameStarted: true }); 
            })} 
            disabled={players.length < 2} 
            className={`w-full py-5 rounded-2xl font-bold text-lg shadow-lg transition-all active:scale-95 ${
              players.length < 2 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            START GAME
          </button>
        </div>

        {/* Watermark outside the box */}
        <Watermark />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-20 space-y-5 min-h-screen text-sm flex flex-col">
      {isLoading && LoaderOverlay}
      <div className="flex-1 space-y-5">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 sm:p-6 rounded-2xl shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <div>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Total Pot</p>
              <p className="text-4xl sm:text-5xl font-black text-emerald-400">₹{totalPot}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-wide mb-1">Round #{roundsPlayed + 1}</p>
              <p className="text-lg sm:text-xl font-bold text-indigo-300">{multiplier}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 p-3 rounded-xl">
              <p className="text-xs text-slate-300 font-bold uppercase mb-1">Leader</p>
              <p className="text-base font-bold text-white truncate">{rankedPlayers[0]?.name || '-'}</p>
            </div>
            <div className="bg-white/10 p-3 rounded-xl">
              <p className="text-xs text-slate-300 font-bold uppercase mb-1">Active</p>
              <p className="text-base font-bold text-emerald-400">
                {players.filter(p => !p.isOut).length} / {players.length}
              </p>
            </div>
          </div>
        </div>

        <div className="flex bg-slate-100/80 backdrop-blur-sm p-1.5 rounded-xl gap-1.5 border border-slate-200">
          {(['Normal', 'Deri', 'Double', 'Chaubar'] as Multiplier[]).map(m => (
            <button
              key={m}
              onClick={() => setMultiplier(m)}
              className={`
                flex-1 py-3 sm:py-4 rounded-lg font-bold text-xs sm:text-sm uppercase transition-all duration-200
                ${multiplier === m 
                  ? 'bg-white text-indigo-700 shadow-md scale-[1.02]' 
                  : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'
                }
              `}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {players.map(player => (
            <div
              key={player.id}
              className={`
                p-4 sm:p-5 rounded-2xl border-2 transition-all duration-300 flex flex-col gap-4 text-sm
                ${player.isOut 
                  ? 'bg-red-50 border-red-200 opacity-75' 
                  : 'bg-white border-slate-200 shadow-sm hover:border-indigo-200'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-xl sm:text-2xl truncate">{player.name}</span>
                  {player.rejoinCount > 0 && (
                    <span className="bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full text-xs font-bold">
                      ×{player.rejoinCount}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl sm:text-4xl font-mono font-black leading-none">{player.cumulativeScore}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Points</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm font-bold text-slate-600">Paid: ₹{player.totalPaid}</p>

                {!player.isOut ? (
                  <div className="flex items-center gap-3 flex-1 sm:justify-end">
                    <button
                      onClick={() => setWinnerId(player.id)}
                      className={`
                        w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center text-3xl shrink-0
                        transition-all active:scale-95
                        ${winnerId === player.id 
                          ? 'bg-yellow-400 shadow-xl border-2 border-yellow-500' 
                          : 'bg-slate-100 border-2 border-slate-200 hover:bg-slate-200'
                        }
                      `}
                    >
                      🏆
                    </button>
                    <input
                      type="number"
                      min="0"
                      max="999"
                      step="1"
                      inputMode="numeric"
                      pattern="\d{0,3}"
                      disabled={winnerId === player.id}
                      value={winnerId === player.id ? '0' : roundScores[player.id] || ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (/^\d{0,3}$/.test(val)) {
                          setRoundScores({ ...roundScores, [player.id]: val });
                        }
                      }}
                      className={`
                        flex-1 max-w-[120px] p-4 rounded-xl font-black text-center text-xl sm:text-2xl
                        bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white
                        outline-none transition-all
                      `}
                      placeholder="0"
                    />
                  </div>
                ) : player.canNoLongerRejoin ? (
                  <div className="flex-1 bg-slate-200 text-slate-500 py-4 px-5 rounded-xl text-sm font-bold text-center uppercase tracking-wide">
                    Eliminated
                  </div>
                ) : (
                  <button
                    onClick={() => rejoin(player.id)}
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all"
                  >
                    Rejoin (₹{buyInAmount})
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-6">
          <button
            onClick={submitRound}
            disabled={!winnerId}
            className={`
              flex-1 py-5 rounded-2xl font-bold text-lg shadow-lg transition-all active:scale-95
              ${winnerId 
                ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }
            `}
          >
            SUBMIT ROUND
          </button>

          {roundsPlayed >= 1 && (
            <button
              onClick={handleFinishGame}
              className="flex-1 sm:flex-none sm:w-40 py-5 bg-slate-800 text-white rounded-2xl font-bold text-base shadow-lg hover:bg-slate-700 transition-all active:scale-95"
            >
              FINISH GAME
            </button>
          )}
        </div>

        <button
          onClick={resetLiveGame}
          className="w-full py-4 text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-red-600 transition-colors"
        >
          Emergency Reset Game
        </button>
      </div>

      <Watermark />
    </div>
  );
};

export default PalCutGame;