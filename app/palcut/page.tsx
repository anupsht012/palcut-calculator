"use client";

import { useState, useEffect } from 'react';
import {
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
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, GAME_ID } from './firebase/firebaseConfig';
import { Watermark } from './firebase/myWaterMark/watermark';

export type Multiplier = 'Normal' | 'Dedi' | 'Double' | 'Chaubar';

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

  const [isLoading, setIsLoading] = useState(false);

  const withLoading = async (fn: () => Promise<void>) => {
    setIsLoading(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
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
    if (!winnerId) {
      alert("Select a winner!");
      return;
    }

    await withLoading(async () => {
      const updatedPlayers = players.map(p => {
        if (p.canNoLongerRejoin) return p;
        if (p.isOut) return { ...p, canNoLongerRejoin: true };

        let added = 0;
        if (p.id === winnerId) {
          added = 0;
        } else {
          added = parseInt(roundScores[p.id] || '0');
          if (multiplier === 'Dedi') added *= 1.5;
          if (multiplier === 'Double') added *= 2;
          if (multiplier === 'Chaubar') added *= 4;
        }

        const finalPoints = Math.round(added);
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
          rejoinCount: p.rejoinCount || 0,
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

  const downloadHistoryPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(18);
    doc.text("Palcut Game History", 105, 15, { align: "center" });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Total Games: ${history.length}`, 105, 25, { align: "center" });

    let y = 40;

    history.forEach((game, index) => {
      if (y > 260) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(0);
      doc.text(`Game ${index + 1} — ${game.timestamp?.toDate?.()?.toLocaleDateString() || 'Unknown'}`, 15, y);
      y += 8;

      doc.setFontSize(11);
      doc.text(`Winner: ${game.winnerName}`, 20, y);
      y += 6;
      doc.text(`Final Pot: ₹${game.totalPot}`, 20, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        head: [['Player', 'Rejoins', 'Score', 'Net', 'Status']],
        body: game.playerStats?.map((ps: any) => [
          ps.name + (ps.rejoinCount > 0 ? ` (+${ps.rejoinCount})` : ''),
          ps.rejoinCount,
          ps.score,
          ps.net >= 0 ? `+₹${Math.round(ps.net)}` : `-₹${Math.round(Math.abs(ps.net))}`,
          ps.isWinner ? 'Winner' : 'Eliminated',
        ]) || [],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', halign: 'left' },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 10 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 20 },
          2: { cellWidth: 25 },
          3: { cellWidth: 35 },
          4: { cellWidth: 40 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 3) {
            const value = data.cell.text[0] as string;
            data.cell.styles.textColor = value.startsWith('+') ? [34, 197, 94] : [239, 68, 68];
          }
        },
      });

      // @ts-expect-error
      y = doc.lastAutoTable?.finalY + 12 || y + 12;
    });

    doc.save(`Palcut_All_Games_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const LoaderOverlay = (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="w-14 h-14 rounded-full border-4 border-t-4 border-slate-200 border-t-emerald-500 animate-spin" />
    </div>
  );

  // ────────────────────────────────────────────────
  //                  HISTORY VIEW
  // ────────────────────────────────────────────────
  if (view === 'history') {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-50">
        {isLoading && LoaderOverlay}
        <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 bg-slate-50 z-10 pt-2 pb-4 border-b">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Game History</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setView('game')}
                className="bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-700"
              >
                Back to Game
              </button>
              {history.length > 0 && (
                <button
                  onClick={downloadHistoryPDF}
                  className="bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-green-700"
                >
                  Download PDF
                </button>
              )}
            </div>
          </div>

          {isLoadingHistory ? (
            <div className="text-center py-20">
              <div className="w-12 h-12 mx-auto border-4 border-t-emerald-500 border-slate-200 rounded-full animate-spin" />
              <p className="mt-4 text-slate-600">Loading...</p>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center py-16 text-slate-500">No games yet</p>
          ) : (
            history.map((game) => (
              <div key={game.id} className="bg-white rounded-xl  shadow-sm p-4 sm:p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold">🏆 {game.winnerName}</p>
                      <button
                        onClick={async () => {
                          if (confirm("Delete this game?")) {
                            await withLoading(async () => {
                              await deleteDoc(doc(db, "history", game.id));
                              setHistory(history.filter(h => h.id !== game.id));
                            });
                          }
                        }}
                        className="text-red-500 hover:text-red-700 text-xl font-bold"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {game.timestamp?.toDate?.()?.toLocaleString() || '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase">Pot</p>
                    <p className="text-2xl font-bold text-emerald-600">₹{game.totalPot}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {game.playerStats?.map((ps: any, i: number) => (
                    <div
                      key={i}
                      className="flex justify-between items-center bg-slate-50 p-3 rounded-lg text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {ps.name}
                          {ps.rejoinCount > 0 && (
                            <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                              +{ps.rejoinCount}
                            </span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500">Score: {ps.score}</span>
                      </div>
                      <span
                        className={`font-bold px-3 py-1 rounded ${
                          ps.net >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"
                        }`}
                      >
                        {ps.net >= 0 ? `+₹${Math.round(ps.net)}` : `-₹${Math.round(Math.abs(ps.net))}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <Watermark />
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────
  //                  SUMMARY / FINISH SCREEN
  // ────────────────────────────────────────────────
  if (showSummary) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-50">
        {isLoading && LoaderOverlay}
        <div className="max-w-2xl mx-auto p-5 space-y-6">
          <div className="bg-gradient-to-b from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-xl">
            <h2 className="text-emerald-400 text-xs font-bold uppercase tracking-wide mb-2">
              {finalPayoutDescription}
            </h2>
            <p className="text-3xl font-bold mb-1">🏆 {finalWinnerName}</p>
            <p className="text-emerald-300 text-lg font-bold mb-6">
              Pot: ₹{finalPotAmount}
            </p>

            <div className="space-y-3">
              {finalStats.map((p, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center p-4 rounded-lg text-sm ${
                    p.isWinner ? 'bg-emerald-700/30' : 'bg-white/10'
                  }`}
                >
                  <div>
                    <p className="font-bold">{p.name}</p>
                    <p className="text-xs text-slate-300">Score: {p.score}</p>
                  </div>
                  <p className={`font-bold ${p.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {p.net >= 0 ? `+₹${Math.round(p.net)}` : `-₹${Math.round(Math.abs(p.net))}`}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleStartNewGame}
            className="w-full py-5 bg-indigo-600 text-white rounded-xl font-bold text-lg hover:bg-indigo-700"
          >
            Start New Game
          </button>

          <Watermark />
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────
  //                  SETUP SCREEN (before game start)
  // ────────────────────────────────────────────────
  if (!gameStarted) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-50">
        {isLoading && LoaderOverlay}
        <div className="max-w-lg mx-auto p-5 space-y-6">
          <div className="bg-white rounded-xl shadow p-6 space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Palcut Calculator</h2>
              <button
                onClick={fetchHistory}
                className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100"
              >
                History
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Player name"
                className="flex-1 p-4 bg-slate-50 border rounded-xl focus:border-indigo-500 outline-none"
              />
              <button
                onClick={() => addPlayer()}
                className="bg-indigo-600 text-white px-6 py-4 rounded-xl font-medium hover:bg-indigo-700"
              >
                Add
              </button>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-600 uppercase mb-2">Buy-in (₹)</p>
              <input
                type="number"
                value={buyInAmount === 0 ? '' : buyInAmount}
                onChange={async (e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setBuyInAmount(0);
                    await syncToDb({ buyInAmount: 0 });
                    return;
                  }
                  const num = parseInt(val);
                  if (!isNaN(num) && num >= 0 && num <= 999) {
                    setBuyInAmount(num);
                    await syncToDb({ buyInAmount: num });
                  }
                }}
                onBlur={() => {
                  if (buyInAmount < 50) {
                    setBuyInAmount(100);
                    syncToDb({ buyInAmount: 100 });
                  }
                }}
                placeholder="100"
                className="w-full p-4 bg-slate-50 border rounded-xl text-center text-xl font-bold focus:border-indigo-500 outline-none"
              />
              <p className="text-xs text-slate-500 mt-1">Min ₹50</p>
            </div>

            {frequentNames.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {frequentNames.map(name => (
                    <div
                      key={name}
                      className="flex items-center bg-slate-100 rounded-full px-4 py-1.5 text-sm gap-2"
                    >
                      <button onClick={() => addPlayer(name)} className="font-medium">
                        + {name}
                      </button>
                      <button
                        onClick={() => {
                          const newFreq = frequentNames.filter(n => n !== name);
                          setFrequentNames(newFreq);
                          localStorage.setItem('palcut_frequent_players', JSON.stringify(newFreq));
                        }}
                        className="text-red-500 font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3 min-h-[100px]">
              {players.length === 0 && (
                <p className="text-center py-8 text-slate-400">Add players to start</p>
              )}
              {players.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl">
                  <span className="font-medium">{p.name}</span>
                  <button
                    onClick={() => removePlayer(p.id)}
                    className="text-red-500 text-sm font-medium"
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
              className={`w-full py-5 rounded-xl font-bold text-lg ${
                players.length < 2
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              START GAME
            </button>
          </div>

          <Watermark />
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────
  //                  MAIN GAME SCREEN
  // ────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen overflow-y-auto bg-slate-50">
      {isLoading && LoaderOverlay}
      <div className="max-w-2xl mx-auto p-4 sm:p-5 space-y-5 pb-24">
        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs text-slate-400 uppercase">Total Pot</p>
              <p className="text-4xl font-black text-emerald-400">₹{totalPot}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase">Round #{roundsPlayed + 1}</p>
              <p className="text-lg font-bold text-indigo-300">{multiplier}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="text-xs text-slate-300 uppercase">Leader</p>
              <p className="font-bold truncate">{rankedPlayers[0]?.name || '-'}</p>
            </div>
            <div className="bg-white/10 p-3 rounded-lg">
              <p className="text-xs text-slate-300 uppercase">Active</p>
              <p className="font-bold text-emerald-400">
                {players.filter(p => !p.isOut).length} / {players.length}
              </p>
            </div>
          </div>
        </div>

        {/* Multiplier selector */}
       <div className="flex bg-slate-100/80 backdrop-blur-sm p-1.5 rounded-xl gap-1.5 border border-slate-200">
          {(['Normal', 'Dedi', 'Double', 'Chaubar'] as Multiplier[]).map(m => (
            <button
              key={m}
              onClick={() => setMultiplier(m)}
              className={`
                flex-1 py-4 sm:py-5 rounded-lg font-bold text-sm sm:text-base uppercase transition-all duration-200
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

        {/* Players */}
        <div className="space-y-4">
          {players.map(player => (
            <div
              key={player.id}
              className={`rounded-xl border p-4 ${
                player.isOut ? 'bg-red-50 border-red-200 opacity-75' : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg">{player.name}</span>
                  {player.rejoinCount > 0 && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      +{player.rejoinCount}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black">{player.cumulativeScore}</p>
                  <p className="text-xs text-slate-500">points</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">Paid: ₹{player.totalPaid}</p>

                {!player.isOut ? (
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <button
                      onClick={() => setWinnerId(player.id)}
                      className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${
                        winnerId === player.id
                          ? 'bg-yellow-400 border-2 border-yellow-500'
                          : 'bg-slate-100 border border-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      🏆
                    </button>
                    <input
                      type="number"
                      min="0"
                      disabled={winnerId === player.id}
                      value={winnerId === player.id ? '0' : roundScores[player.id] || ''}
                      onChange={e => {
                        const val = e.target.value;
                        if (/^\d{0,3}$/.test(val)) {
                          setRoundScores({ ...roundScores, [player.id]: val });
                        }
                      }}
                      className="w-28 p-3 text-center text-2xl font-bold bg-slate-50 border rounded-lg focus:border-indigo-500 outline-none"
                      placeholder="0"
                    />
                  </div>
                ) : player.canNoLongerRejoin ? (
                  <div className="flex-1 bg-slate-200 text-slate-600 py-3 rounded-lg text-center text-sm font-medium">
                    Eliminated
                  </div>
                ) : (
                  <button
                    onClick={() => rejoin(player.id)}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700"
                  >
                    Rejoin ₹{buyInAmount}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            onClick={submitRound}
            disabled={!winnerId}
            className={`flex-1 py-4 rounded-xl font-bold text-lg ${
              winnerId
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            SUBMIT ROUND
          </button>

          {roundsPlayed >= 1 && (
            <button
              onClick={handleFinishGame}
              className="flex-1 sm:flex-none sm:w-44 py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700"
            >
              FINISH GAME
            </button>
          )}
        </div>

        <button
          onClick={resetLiveGame}
          className="w-full py-3 text-sm text-slate-500 hover:text-red-600 font-medium"
        >
          Emergency Reset
        </button>

        <Watermark />
      </div>
    </div>
  );
};

export default PalCutGame;