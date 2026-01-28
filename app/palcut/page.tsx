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

export type Multiplier = 'Normal' | 'Deri' | 'Chaubar' | 'Double';

interface Player {
  id: string;
  name: string;
  cumulativeScore: number;
  isOut: boolean;
  totalPaid: number;
  rejoinCount: number;
  canNoLongerRejoin?: boolean;
}

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
    await syncToDb({ players: updatedPlayers });

    if (!frequentNames.includes(nameToUse)) {
      const newFreq = [nameToUse, ...frequentNames].slice(0, 10);
      setFrequentNames(newFreq);
      localStorage.setItem('palcut_frequent_players', JSON.stringify(newFreq));
    }
  };

  const removePlayer = async (id: string) => {
    const updatedPlayers = players.filter(p => p.id !== id);
    setPlayers(updatedPlayers);
    await syncToDb({ players: updatedPlayers });
  };

  const submitRound = async () => {
    if (!winnerId) { alert("Select a winner!"); return; }
    
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
        if (multiplier === 'Chaubar') added *= 4;
        if (multiplier === 'Double') added *= 2;
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
  };

  const rejoin = async (id: string) => {
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
  };

  const handleFinishGame = async () => {
    if (!confirm("Finish game and save results?")) return;

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

      if (isActive) {
        net += sharePerWinner;
      }

      return {
        name: p.name,
        score: p.cumulativeScore,
        paid: p.totalPaid,
        net: Math.round(net),
        isWinner: isActive,
      };
    });

    setFinalWinnerName(winnerDisplay);
    setFinalPotAmount(totalPot);
    setFinalRounds(roundsPlayed);
    setFinalStats(stats);
    setFinalPayoutDescription(payoutDescription);

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

    setShowSummary(true);
  };

  const resetLiveGame = async () => {
    if (confirm("Reset current game scores and payments?")) {
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
    }
  };

  if (view === 'history') {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-black text-slate-800">Game History</h2>
          <button 
            onClick={() => setView('game')} 
            className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold text-sm uppercase hover:bg-slate-700 transition-colors"
          >
            Back to Game
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-center py-20 text-slate-400 font-bold">No previous games found.</p>
        ) : (
          history.map((game) => (
            <div key={game.id} className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-4 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-black text-slate-900">🏆 {game.winnerName}</p>
                    <button
                      onClick={async () => {
                        if (confirm(`Delete this game?`)) {
                          try {
                            await deleteDoc(doc(db, "history", game.id));
                            setHistory(history.filter(h => h.id !== game.id));
                          } catch (err) {
                            alert("Failed to delete");
                          }
                        }
                      }}
                      className="text-red-500 hover:text-red-700 text-2xl font-bold p-1"
                    >
                      ×
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    {game.timestamp?.toDate?.().toLocaleString() || '—'}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-500 font-bold uppercase">Final Pot</p>
                  <p className="text-3xl font-black text-emerald-600">₹{game.totalPot}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {game.playerStats?.map((ps: any, i: number) => (
                  <div 
                    key={i} 
                    className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl text-sm font-bold"
                  >
                    <span className="text-slate-700 truncate mr-3">
                      {ps.name} <span className="text-xs text-slate-400">({ps.score})</span>
                    </span>
                    <span className={ps.isWinner ? "text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg" : "text-red-600"}>
                      {ps.isWinner ? `+₹${Math.round(ps.net || 0)}` : `-₹${ps.paid}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (showSummary) {
    return (
      <div className="max-w-2xl mx-auto p-5 sm:p-10 space-y-8 text-center">
        <div className="bg-gradient-to-b from-slate-900 to-slate-800 text-white p-8 sm:p-12 rounded-3xl shadow-2xl">
          <h2 className="text-emerald-400 font-black uppercase tracking-widest text-sm mb-4">
            {finalPayoutDescription}
          </h2>
          <p className="text-4xl sm:text-5xl font-black mb-2">🏆 {finalWinnerName}</p>
          <p className="text-emerald-300 text-xl sm:text-2xl font-black mb-10">
            Pot: ₹{finalPotAmount}
          </p>
          
          <div className="space-y-4">
            {finalStats.map((p, i) => (
              <div 
                key={i} 
                className={`flex justify-between items-center p-5 rounded-2xl ${
                  p.isWinner 
                    ? 'bg-emerald-600/30 border border-emerald-500' 
                    : 'bg-white/10 border border-white/10'
                }`}
              >
                <div className="text-left">
                  <p className="font-black text-base sm:text-lg truncate">{p.name}</p>
                  <p className="text-xs text-slate-400">Score: {p.score}</p>
                </div>
                <div className="text-right">
                  <p className={`font-black text-base sm:text-lg ${p.net >= 0 ? 'text-emerald-300' : 'text-red-400'}`}>
                    {p.net >= 0 ? `+₹${p.net}` : `₹${p.net}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="w-full py-6 bg-indigo-600 text-white rounded-3xl font-black text-xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
        >
          Start New Game
        </button>
      </div>
    );
  }

  if (!gameStarted) {
    return (
      <div className="max-w-lg mx-auto mt-8 sm:mt-12 p-6 sm:p-10 bg-white rounded-3xl shadow-2xl border border-slate-100 mx-4">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-4xl font-black text-slate-800">Setup Game</h2>
          <button 
            onClick={fetchHistory} 
            className="bg-indigo-50 text-indigo-700 px-5 py-3 rounded-xl font-bold text-sm uppercase hover:bg-indigo-100 transition-colors"
          >
            History
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Player name"
            className="flex-1 p-5 bg-slate-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-500 focus:bg-white font-bold text-lg transition-all"
          />
          <button 
            onClick={() => addPlayer()} 
            className="bg-indigo-600 text-white px-10 py-5 rounded-2xl font-black text-base hover:bg-indigo-700 active:scale-95 transition-all"
          >
            Add
          </button>
        </div>

        {/* Buy-in amount input with optimistic  */}
        <div className="mb-8">
          <p className="text-sm font-black text-slate-600 uppercase mb-3 tracking-widest">Buy-in / Rejoin Amount (₹)</p>
          <input
            type="number"
            min="50"
            step="10"
            value={buyInAmount}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= 50) {
                setBuyInAmount(val);           // Instant local UI update
                      
              }
            }}
            className="w-full p-5 bg-slate-50 border-2 border-transparent rounded-2xl outline-none focus:border-indigo-500 focus:bg-white font-bold text-lg transition-all text-center"
            placeholder="100"
          />
          <p className="text-xs text-slate-500 mt-2">Minimum ₹50 • Applies to new players & rejoins</p>
        </div>

        {frequentNames.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-black text-slate-500 uppercase mb-4 ml-1 tracking-widest">Recent Players</p>
            <div className="flex flex-wrap gap-3">
              {frequentNames.map(name => (
                <div key={name} className="flex items-center bg-slate-100 hover:bg-slate-200 rounded-full px-5 py-2.5 gap-2 transition-colors">
                  <button 
                    onClick={() => addPlayer(name)} 
                    className="text-sm font-black text-slate-700"
                  >
                    + {name}
                  </button>
                  <button
                    onClick={() => {
                      const newFreq = frequentNames.filter(n => n !== name);
                      setFrequentNames(newFreq);
                      localStorage.setItem('palcut_frequent_players', JSON.stringify(newFreq));
                    }}
                    className="text-red-500 hover:text-red-700 text-lg font-bold leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4 mb-10 min-h-[120px]">
          {players.length === 0 && (
            <p className="text-center py-12 text-slate-400 font-bold italic">Add at least 2 players to start</p>
          )}
          {players.map(p => (
            <div key={p.id} className="p-5 bg-slate-50 rounded-2xl flex justify-between items-center">
              <span className="font-bold text-slate-800 text-lg">{p.name}</span>
              <button 
                onClick={() => removePlayer(p.id)} 
                className="text-red-500 hover:text-red-700 font-bold text-sm uppercase"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <button 
          onClick={() => syncToDb({ gameStarted: true })} 
          disabled={players.length < 2} 
          className={`w-full py-6 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 ${
            players.length < 2 
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          START GAME
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-48 sm:pb-40 md:pb-32 space-y-6 min-h-screen">
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6 sm:p-8 rounded-3xl shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-slate-400 text-xs sm:text-sm font-black uppercase tracking-wider mb-1">Total Pot</p>
            <p className="text-5xl sm:text-6xl font-black text-emerald-400">₹{totalPot}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs sm:text-sm font-black uppercase tracking-wider mb-1">Round #{roundsPlayed + 1}</p>
            <p className="text-xl sm:text-2xl font-black text-indigo-300">{multiplier}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 p-4 rounded-2xl">
            <p className="text-xs text-slate-300 font-bold uppercase mb-1">Leader</p>
            <p className="text-base sm:text-lg font-bold text-white truncate">{rankedPlayers[0]?.name || '-'}</p>
          </div>
          <div className="bg-white/10 p-4 rounded-2xl">
            <p className="text-xs text-slate-300 font-bold uppercase mb-1">Active</p>
            <p className="text-base sm:text-lg font-bold text-emerald-400">
              {players.filter(p => !p.isOut).length} / {players.length}
            </p>
          </div>
        </div>
      </div>

      <div className="flex bg-slate-100/80 backdrop-blur-sm p-2 rounded-2xl gap-2 sticky top-0 z-20 border border-slate-200 mt-2 mx-0 sm:mx-auto">
        {(['Normal', 'Deri', 'Chaubar', 'Double'] as Multiplier[]).map(m => (
          <button
            key={m}
            onClick={() => setMultiplier(m)}
            className={`
              flex-1 py-4 sm:py-5 rounded-xl font-black text-sm sm:text-base uppercase transition-all duration-200 touch-manipulation
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

      <div className="space-y-5">
        {players.map(player => (
          <div
            key={player.id}
            className={`
              p-5 sm:p-6 rounded-3xl border-2 transition-all duration-300 flex flex-col gap-5
              ${player.isOut 
                ? 'bg-red-50 border-red-200 opacity-70' 
                : 'bg-white border-slate-200 shadow-sm hover:border-indigo-200'
              }
            `}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-black text-2xl sm:text-3xl truncate">{player.name}</span>
                {player.rejoinCount > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-black">
                    ×{player.rejoinCount}
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-4xl sm:text-5xl font-mono font-black leading-none">{player.cumulativeScore}</p>
                <p className="text-xs sm:text-sm font-bold text-slate-500 uppercase tracking-wide">Points</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
              <p className="text-base font-bold text-slate-600">Paid: ₹{player.totalPaid}</p>

              {!player.isOut ? (
                <div className="flex items-center gap-4 flex-1 sm:justify-end">
                  <button
                    onClick={() => setWinnerId(player.id)}
                    className={`
                      w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-4xl shrink-0
                      transition-all touch-manipulation active:scale-95
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
                    step="1"
                    inputMode="numeric"
                    pattern="\d*"
                    disabled={winnerId === player.id}
                    value={winnerId === player.id ? '0' : roundScores[player.id] || ''}
                    onChange={e => setRoundScores({ ...roundScores, [player.id]: e.target.value })}
                    className={`
                      flex-1 max-w-[140px] p-5 rounded-2xl font-black text-center text-2xl 
                      bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white
                      outline-none transition-all touch-manipulation
                    `}
                    placeholder="0"
                  />
                </div>
              ) : player.canNoLongerRejoin ? (
                <div className="flex-1 bg-slate-200 text-slate-500 py-5 px-6 rounded-2xl text-base font-black text-center uppercase tracking-wide">
                  Eliminated
                </div>
              ) : (
                <button
                  onClick={() => rejoin(player.id)}
                  className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl text-base font-black shadow-md active:scale-95 transition-all touch-manipulation"
                >
                  Rejoin (₹{buyInAmount})
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-lg border-t border-slate-200 p-4 sm:p-6 z-30 shadow-2xl pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-4">
          <button
            onClick={submitRound}
            disabled={!winnerId}
            className={`
              flex-1 py-6 rounded-3xl font-black text-xl shadow-xl transition-all active:scale-95 touch-manipulation
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
              className="sm:w-48 py-6 bg-slate-800 text-white rounded-3xl font-black text-lg shadow-xl hover:bg-slate-700 transition-all active:scale-95 touch-manipulation"
            >
              FINISH GAME
            </button>
          )}
        </div>
      </div>

      <button
        onClick={resetLiveGame}
        className="w-full py-6 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-red-600 transition-colors mt-4"
      >
        Emergency Reset Game
      </button>
    </div>
  );
};

export default PalCutGame;