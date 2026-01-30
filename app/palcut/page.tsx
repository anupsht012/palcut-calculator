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
  deleteDoc,
  Timestamp
} from "firebase/firestore";
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, analytics } from './firebase/firebaseConfig';
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { logEvent } from "firebase/analytics";
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
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joiningCode, setJoiningCode] = useState('');
  const [authReady, setAuthReady] = useState(false);

  const [players, setPlayers] = useState<Player[]>([]);
  const [gameStarted, setGameStarted] = useState(false);
  const [roundsPlayed, setRoundsPlayed] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [newName, setNewName] = useState('');
  const [roundScores, setRoundScores] = useState<Record<string, string>>({});
  const [multiplier, setMultiplier] = useState<Multiplier>('Normal');
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [buyInAmount, setBuyInAmount] = useState<number>(100);
  const [buyInInput, setBuyInInput] = useState<string>(buyInAmount.toString());

  const [finalWinnerName, setFinalWinnerName] = useState('');
  const [finalPotAmount, setFinalPotAmount] = useState(0);
  const [finalRounds, setFinalRounds] = useState(0);
  const [finalStats, setFinalStats] = useState<any[]>([]);
  const [finalPayoutDescription, setFinalPayoutDescription] = useState<string>('');

  const [history, setHistory] = useState<any[]>([]);
  const [cumulativePlayers, setCumulativePlayers] = useState<any[]>([]);
  const [totalGamesPlayed, setTotalGamesPlayed] = useState<number>(0);
  const [view, setView] = useState<'game' | 'history'>('game');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [frequentNames, setFrequentNames] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);

  // States for editing / correcting last round
  const [previousPlayers, setPreviousPlayers] = useState<Player[] | null>(null);
  const [previousRoundsPlayed, setPreviousRoundsPlayed] = useState<number | null>(null);
  const [previousWinnerId, setPreviousWinnerId] = useState<string | null>(null);
  const [previousRoundScores, setPreviousRoundScores] = useState<Record<string, string>>({});
  const [previousMultiplier, setPreviousMultiplier] = useState<Multiplier>('Normal');
  const [isEditingLastRound, setIsEditingLastRound] = useState(false);

  // Anonymous Authentication & Room Code persistence
  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        signInAnonymously(auth).catch((err) => {
          console.error("Anonymous sign-in error:", err);
        });
      } else {
        setAuthReady(true);
        if (analytics) {
          logEvent(analytics, 'session_started', { method: 'anonymous' });
        }
      }
    });

    const savedRoom = localStorage.getItem('palcut_room');
    if (savedRoom) {
      setRoomCode(savedRoom.toUpperCase());
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Keep the input string in sync with the numeric buy-in amount
    setBuyInInput(buyInAmount.toString());
  }, [buyInAmount]);

  const createNewRoom = () => {
    const newCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomCode(newCode);
    localStorage.setItem('palcut_room', newCode);
    if (analytics) logEvent(analytics, 'room_created', { roomCode: newCode });
  };

  const joinRoom = () => {
    const code = joiningCode.trim().toUpperCase();
    if (code.length < 4) {
      alert("Room code should be at least 4 characters");
      return;
    }
    setRoomCode(code);
    localStorage.setItem('palcut_room', code);
    if (analytics) logEvent(analytics, 'room_joined', { roomCode: code });
  };

  // Firestore listener + auto-create with expireAt
  useEffect(() => {
    if (!authReady || !roomCode) return;

    const gameRef = doc(db, "games", roomCode);

    const unsub = onSnapshot(gameRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setPlayers(data.players || []);
        setGameStarted(data.gameStarted || false);
        setRoundsPlayed(data.roundsPlayed || 0);
        setBuyInAmount(data.buyInAmount || 100);
      } else {
        setDoc(gameRef, {
          players: [],
          gameStarted: false,
          roundsPlayed: 0,
          buyInAmount: 100,
          createdAt: serverTimestamp(),
          lastActive: serverTimestamp(),
          expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
        }).catch(console.error);
      }
    }, (err) => {
      console.error("Snapshot error:", err);
    });

    return () => unsub();
  }, [authReady, roomCode]);

  const syncToDb = async (updates: any) => {
    if (!roomCode) return;
    const gameRef = doc(db, "games", roomCode);

    const extendedUpdates = {
      ...updates,
      lastActive: serverTimestamp(),
      expireAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    };

    try {
      await setDoc(gameRef, extendedUpdates, { merge: true });
    } catch (err) {
      console.error("Sync failed:", err);
    }
  };

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

  const computeCumulative = (hist: any[]) => {
    const playerTotals: Record<string, { totalNet: number; totalRejoins: number }> = {};

    hist.forEach((game) => {
      game.playerStats?.forEach((ps: any) => {
        if (!playerTotals[ps.name]) {
          playerTotals[ps.name] = { totalNet: 0, totalRejoins: 0 };
        }
        playerTotals[ps.name].totalNet += ps.net || 0;
        playerTotals[ps.name].totalRejoins += ps.rejoinCount || 0;
      });
    });

    const totalGames = hist.length;

    const playersData = Object.entries(playerTotals)
      .map(([name, data]) => ({
        name,
        totalRejoins: data.totalRejoins,
        profitLoss: Math.round(data.totalNet),
      }))
      .sort((a, b) => b.profitLoss - a.profitLoss);

    return { playersData, totalGames };
  };

  const fetchHistory = async () => {
    if (!roomCode) {
      alert("No room selected");
      return;
    }

    await withLoading(async () => {
      setIsLoadingHistory(true);
      try {
        const historyRef = collection(db, "games", roomCode, "completedGames");
        const q = query(historyRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        const historyData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        const { playersData, totalGames } = computeCumulative(historyData);

        setHistory(historyData);
        setCumulativePlayers(playersData);
        setTotalGamesPlayed(totalGames);
        setView('history');
      } catch (error) {
        console.error("Error fetching history:", error);
        alert("Could not load history for this room.");
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

    // Check for direct win condition
    const activeNonWinners = players.filter(p => !p.isOut && p.id !== winnerId);
    const allOthersEmpty = activeNonWinners.every(p => {
      const scoreStr = roundScores[p.id];
      return !scoreStr || scoreStr.trim() === '' || scoreStr === '0';
    });

    const isDirectWin = activeNonWinners.length > 0 && allOthersEmpty;

    setPreviousPlayers([...players]);
    setPreviousRoundsPlayed(roundsPlayed);
    setPreviousWinnerId(winnerId);
    setPreviousRoundScores({ ...roundScores });
    setPreviousMultiplier(multiplier);

    await withLoading(async () => {
      let updatedPlayers = [...players];

      if (isDirectWin) {
        updatedPlayers = updatedPlayers.map(p => {
          if (p.id === winnerId) return { ...p };
          if (!p.isOut) {
            return { ...p, cumulativeScore: 100, isOut: true };
          }
          return p;
        });

        setPlayers(updatedPlayers);
        setRoundsPlayed(roundsPlayed + 1);
        await syncToDb({ players: updatedPlayers, roundsPlayed: roundsPlayed + 1 });

        await handleFinishGame(true, winnerId);
      } else {
        // Normal scoring
        updatedPlayers = players.map(p => {
          if (p.canNoLongerRejoin) return p;
          if (p.isOut) return { ...p, canNoLongerRejoin: true };

          let added = 0;
          if (p.id === winnerId) {
            added = 0;
          } else {
            added = parseInt(roundScores[p.id] || '0', 10) || 0;
            if (multiplier === 'Dedi') added = Math.round(added * 1.5);
            if (multiplier === 'Double') added *= 2;
            if (multiplier === 'Chaubar') added *= 4;
          }

          const newScore = p.cumulativeScore + added;
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
        await syncToDb({ players: updatedPlayers, roundsPlayed: nextRoundCount });
      }

      setRoundScores({});
      setWinnerId(null);
      setMultiplier('Normal');
      setIsEditingLastRound(false);
    });
  };

  const startCorrectLastRound = () => {
    if (!previousPlayers || previousRoundsPlayed === null) return;

    if (!confirm("This will let you edit the last round's winner and scores. Continue?")) return;

    setPlayers(previousPlayers);
    setRoundsPlayed(previousRoundsPlayed);
    setWinnerId(previousWinnerId);
    setRoundScores(previousRoundScores);
    setMultiplier(previousMultiplier);
    setIsEditingLastRound(true);
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

  const handleFinishGame = async (isDirectWin: boolean = false, directWinnerId?: string) => {

    if (!confirm("Finish game and save results?")) return;

    await withLoading(async () => {
      const activePlayers = players.filter(p => !p.isOut);
      const activeCount = activePlayers.length;

      let payoutDescription = '';
      let winnerDisplay = '';
      let stats: any[] = [];

      if (isDirectWin && directWinnerId) {
        const winner = players.find(p => p.id === directWinnerId)!;
        payoutDescription = `Direct win – ${winner.name} takes full pot (entry not refunded)`;
        winnerDisplay = winner.name;

        stats = players.map(p => {
          const isWinner = p.id === directWinnerId;
          return {
            name: p.name,
           score: isWinner ? p.cumulativeScore : 100,
            paid: p.totalPaid,
            net: isWinner
              ? Math.round(totalPot - p.totalPaid)
              : -p.totalPaid,
            isWinner,
            rejoinCount: p.rejoinCount || 0,
          };
        });
      }
      else {
        // Normal finish
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

        stats = players.map(p => {
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
      }

      // Save completed game to subcollection
      await addDoc(collection(db, "games", roomCode!, "completedGames"), {
        winnerName: winnerDisplay,
        totalPot: totalPot,
        roundsPlayed: roundsPlayed,
        payoutDescription,
        activeWinnersCount: activeCount,
        timestamp: serverTimestamp(),
        playerStats: stats,
        isDirectWin,
      });

      const resetPlayers = players.map(p => ({
        ...p,
        cumulativeScore: 0,
        isOut: false,
        totalPaid: buyInAmount,
        rejoinCount: 0,
        canNoLongerRejoin: false
      }));

      await syncToDb({
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
    if (!confirm("Reset current game scores and payments? This cannot be undone.")) return;

    await withLoading(async () => {
      const resetPlayers = players.map(p => ({
        ...p,
        cumulativeScore: 0,
        isOut: false,
        totalPaid: buyInAmount,
        rejoinCount: 0,
        canNoLongerRejoin: false
      }));

      await syncToDb({
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
      doc.text(`Final Pot: ${game.totalPot}`, 20, y);
      y += 8;

      autoTable(doc, {
        startY: y,
        margin: { left: 15, right: 15 },
        head: [['Player', 'Rejoins', 'Score', 'Net', 'Status']],
        body: game.playerStats?.map((ps: any) => [
          ps.name + (ps.rejoinCount > 0 ? ` (+${ps.rejoinCount})` : ''),
          ps.rejoinCount,
          ps.score,
          ps.net >= 0 ? `+${Math.round(ps.net)}` : `-${Math.round(Math.abs(ps.net))}`,
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

      y = (doc as any).lastAutoTable?.finalY + 12 || y + 12;
    });

    if (cumulativePlayers.length > 0) {
      doc.addPage();
      doc.setFontSize(16);
      doc.text("Overall Player Profit / Loss (All Games)", 105, 20, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(80);
      doc.text(`Total Games Played: ${totalGamesPlayed}`, 105, 32, { align: "center" });

      const allPlayers = Array.from(new Set(history.flatMap((g: any) => g.playerStats.map((ps: any) => ps.name)))).sort();

      const head = [['Game', ...allPlayers]];

      const body = history.slice().reverse().map((game: any, i: number) => {
        const row = [(i + 1).toString()];
        allPlayers.forEach((name: string) => {
          const ps = game.playerStats.find((p: any) => p.name === name);
          const net = ps ? ps.net : 0;
          const rejoins = ps ? ps.rejoinCount : 0;
          const text =
            net >= 0
              ? `+${Math.round(net)}${rejoins > 0 ? ` (+${rejoins})` : ''}`
              : `-${Math.round(Math.abs(net))}${rejoins > 0 ? ` (+${rejoins})` : ''}`;
          row.push(text);
        });
        return row;
      });

      const totalRow = ['TOTAL'];
      allPlayers.forEach((name: string) => {
        const totalNet = history.reduce((sum: number, g: any) => {
          const ps = g.playerStats.find((p: any) => p.name === name);
          return sum + (ps ? ps.net : 0);
        }, 0);
        const totalRejoins = history.reduce((sum: number, g: any) => {
          const ps = g.playerStats.find((p: any) => p.name === name);
          return sum + (ps ? ps.rejoinCount : 0);
        }, 0);
        const text =
          totalNet >= 0
            ? `+${Math.round(totalNet)}${totalRejoins > 0 ? ` (+${totalRejoins})` : ''}`
            : `-${Math.round(Math.abs(totalNet))}${totalRejoins > 0 ? ` (+${totalRejoins})` : ''}`;
        totalRow.push(text);
      });
      body.push(totalRow);

      autoTable(doc, {
        startY: 45,
        margin: { left: 15, right: 15 },
        head,
        body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 20 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index > 0) {
            const value = data.cell.text[0] as string;
            if (value && (value.startsWith('+') || value.startsWith('-'))) {
              data.cell.styles.textColor = value.startsWith('+') ? [34, 197, 94] : [239, 68, 68];
            }
          }
        },
      });
    }

    doc.save(`Palcut_All_Games_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const LoaderOverlay = (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="w-14 h-14 rounded-full border-4 border-t-4 border-slate-200 border-t-emerald-500 animate-spin" />
    </div>
  );

  // ──────────────────────────────────────────────────────────────
  //                           RENDER
  // ──────────────────────────────────────────────────────────────

  if (!authReady || !roomCode) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-slate-800">Palcut</h1>
            <p className="mt-2 text-lg text-slate-600">Score Calculator for Friends</p>
            <p className="mt-1 text-sm text-emerald-600 font-medium">Multiple tables can play simultaneously</p>
          </div>

          <div className="space-y-6">
            <button
              onClick={createNewRoom}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xl rounded-xl shadow-lg transition transform hover:scale-105"
            >
              Start New Table
            </button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-slate-500">or join existing table</span>
              </div>
            </div>

            <div className="space-y-3">
              <input
                value={joiningCode}
                onChange={(e) => setJoiningCode(e.target.value.toUpperCase())}
                placeholder="Enter room code (e.g. X7P4Q9)"
                className="w-full p-4 text-center text-md font-bold text-slate-600 border-2 border-slate-300 rounded-xl focus:border-emerald-500 focus:ring-emerald-500 outline-none uppercase tracking-widest"
                maxLength={8}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              />
              <button
                onClick={joinRoom}
                disabled={joiningCode.trim().length < 4}
                className={`w-full py-4 font-bold text-xl rounded-xl transition ${joiningCode.trim().length >= 4
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
              >
                Join Table
              </button>
            </div>
          </div>

          <Watermark />
        </div>
      </div>
    );
  }

  if (view === 'history') {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-50">
        {isLoading && LoaderOverlay}
        <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 bg-slate-50 z-10 pt-2 pb-4 border-b">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800">Game History</h2>
              <p className="text-sm text-slate-600">Room: <span className="font-mono font-bold">{roomCode}</span></p>
            </div>
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
              <p className="mt-4 text-slate-600">Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center py-16 text-slate-500">No completed games yet in this room</p>
          ) : (
            <>
              {history.map((game) => (
                <div key={game.id} className="bg-white rounded-xl shadow-sm p-4 sm:p-5 space-y-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xl font-bold text-slate-900">🏆 {game.winnerName}</p>
                        {game.isDirectWin && (
                          <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                            Direct
                          </span>
                        )}
                        <button
                          onClick={async () => {
                            if (confirm("Delete this game record?")) {
                              await withLoading(async () => {
                                await deleteDoc(doc(db, "games", roomCode, "completedGames", game.id));
                                const newHistory = history.filter(h => h.id !== game.id);
                                setHistory(newHistory);
                                const { playersData, totalGames } = computeCumulative(newHistory);
                                setCumulativePlayers(playersData);
                                setTotalGamesPlayed(totalGames);
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
                      <p className="text-2xl font-bold text-emerald-600">{game.totalPot}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {game.playerStats?.map((ps: any, i: number) => (
                      <div
                        key={i}
                        className="flex justify-between items-center bg-slate-50 p-3 rounded-lg text-sm"
                      >
                        <div>
                          <span className="text-slate-900 font-medium">
                            {ps.name}
                            {ps.rejoinCount > 0 && (
                              <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                +{ps.rejoinCount}
                              </span>
                            )}
                          </span>
                          {/* <span className="block text-xs text-slate-500">Score: {ps.score}</span> */}
                          <span className="block text-xs text-slate-500">
                            Score: {game.isDirectWin && ps.name !== game.winnerName ? 100 : ps.score}
                          </span>
                        </div>
                        <span
                          className={`font-bold px-3 py-1 rounded ${ps.net >= 0 ? "text-emerald-600 bg-emerald-50" : "text-red-600 bg-red-50"
                            }`}
                        >
                          {ps.net >= 0 ? `+${Math.round(ps.net)}` : `-${Math.round(Math.abs(ps.net))}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {history.length > 0 && (
                <div className="mt-10 bg-white rounded-xl shadow-sm p-5">
                  <h3 className="font-semibold text-slate-900 text-lg mb-1 flex items-center gap-2">
                    Overall Profit / Loss
                    <span className="text-xs font-normal text-slate-500">(This Room)</span>
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    📅 {history[0]?.timestamp?.toDate?.()?.toLocaleDateString() || 'Unknown'}
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100">
                          <th className="text-left py-3 px-4 font-medium text-slate-900">Game</th>
                          {Array.from(new Set(history.flatMap((g: any) => g.playerStats.map((ps: any) => ps.name)))).sort().map((name: string, i: number) => {
                            const totalRejoins = history.reduce((sum: number, g: any) => {
                              const ps = g.playerStats.find((p: any) => p.name === name);
                              return sum + (ps ? ps.rejoinCount : 0);
                            }, 0);
                            return (
                              <th key={i} className="text-center py-3 px-4 font-medium text-slate-900">
                                {name}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {history.slice().reverse().map((game, i) => {
                          const allPlayers = Array.from(new Set(history.flatMap(g => g.playerStats.map((ps: any) => ps.name)))).sort();
                          return (
                            <tr key={i} className="border-t hover:bg-slate-50">
                              <td className="py-3 px-4 font-medium text-slate-900">{i + 1}</td>
                              {allPlayers.map((name, j) => {
                                const ps = game.playerStats.find((p: any) => p.name === name);
                                const net = ps ? ps.net : 0;
                                return (
                                  <td
                                    key={j}
                                    className={`py-3 px-4 text-center font-bold  ${net >= 0 ? 'text-emerald-600' : 'text-red-600'
                                      }`}
                                  >
                                    {net >= 0
                                      ? `+${Math.round(net)}${ps?.rejoinCount ? ` (+${ps.rejoinCount})` : ''}`
                                      : `-${Math.round(Math.abs(net))}${ps?.rejoinCount ? ` (+${ps.rejoinCount})` : ''}`
                                    }
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                        <tr className="border-t bg-slate-100">
                          <td className="py-3 px-4 font-bold text-slate-900">TOTAL</td>
                          {Array.from(new Set(history.flatMap((g: any) => g.playerStats.map((ps: any) => ps.name)))).sort().map((name, j) => {
                            const totalNet = history.reduce((sum, g: any) => {
                              const ps = g.playerStats.find((p: any) => p.name === name);
                              return sum + (ps ? ps.net : 0);
                            }, 0);
                            const totalRejoins = history.reduce((sum: number, g: any) => {
                              const ps = g.playerStats.find((p: any) => p.name === name);
                              return sum + (ps ? ps.rejoinCount : 0);
                            }, 0);
                            return (
                              <td
                                key={j}
                                className={`py-3 px-4 text-center font-bold ${totalNet >= 0 ? 'text-emerald-600' : 'text-red-600'
                                  }`}
                              >
                                {totalNet >= 0
                                  ? `+${Math.round(totalNet)}${totalRejoins ? ` (+${totalRejoins})` : ''}`
                                  : `-${Math.round(Math.abs(totalNet))}${totalRejoins ? ` (+${totalRejoins})` : ''}`
                                }
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">
                    Total profit or loss across all completed games in this room
                  </p>
                </div>
              )}
            </>
          )}

          <Watermark />
        </div>
      </div>
    );
  }

  if (showSummary) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-50">
        {isLoading && LoaderOverlay}
        <div className="max-w-2xl mx-auto p-5 space-y-6">
          <div className="bg-linear-to-b from-slate-900 to-slate-800 text-white rounded-xl p-6 shadow-xl">
            <h2 className="text-emerald-400 text-xs font-bold uppercase tracking-wide mb-2">
              {finalPayoutDescription}
            </h2>
            <p className="text-3xl font-bold mb-1">🏆 {finalWinnerName}</p>
            <p className="text-emerald-300 text-lg font-bold mb-6">
              Pot: {finalPotAmount}
            </p>

            <div className="space-y-3">
              {finalStats.map((p, i) => (
                <div
                  key={i}
                  className={`flex justify-between items-center p-4 rounded-lg text-sm ${p.isWinner ? 'bg-emerald-700/30' : 'bg-white/10'
                    }`}
                >
                  <div>
                    <p className="font-bold">{p.name}</p>
                    <p className="text-xs text-slate-300">Score: {p.score}</p>
                  </div>
                  <p className={`font-bold ${p.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {p.net >= 0 ? `+${Math.round(p.net)}` : `-${Math.round(Math.abs(p.net))}`}
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

  if (!gameStarted) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-slate-50">
        {isLoading && LoaderOverlay}
        <div className="max-w-lg mx-auto p-5 space-y-6">
          <div className="bg-white rounded-xl shadow p-6 space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Palcut Calculator</h2>
                <p className="text-sm font-medium text-emerald-600">Room: {roomCode}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (confirm("Leave this room and choose another?")) {
                      localStorage.removeItem('palcut_room');
                      setRoomCode(null);
                    }
                  }}
                  className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-100"
                >
                  Change Room
                </button>
                <button
                  onClick={fetchHistory}
                  className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-100"
                >
                  History
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Player name"
                className="flex-1 p-4 bg-slate-50 text-slate-800 border rounded-xl focus:border-indigo-500 outline-none"
              />
              <button
                onClick={() => addPlayer()}
                className="bg-indigo-600 text-white px-6 py-4 rounded-xl font-medium hover:bg-indigo-700"
              >
                Add
              </button>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-600 uppercase mb-2">Buy-in ()</p>
              <input
                type="number"
                min={50}
                max={999}
                value={buyInInput}
                onChange={(e) => setBuyInInput(e.target.value)}
                onBlur={async () => {
                  const value = parseInt(buyInInput, 10);
                  if (isNaN(value) || value < 50 || value > 999) {
                    setBuyInInput(buyInAmount.toString());
                    return;
                  }

                  if (value !== buyInAmount) {
                    setBuyInAmount(value);
                    const updatedPlayers = players.map(p => ({
                      ...p,
                      totalPaid: value,
                    }));
                    setPlayers(updatedPlayers);
                    await syncToDb({
                      buyInAmount: value,
                      players: updatedPlayers,
                    });
                  }
                }}
                className="w-full p-4 text-slate-800 rounded-xl text-center text-xl font-bold bg-slate-50"
              />
              <p className="text-xs text-slate-500 mt-1">Min 50, Max 999</p>
            </div>

            {frequentNames.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Recent Players</p>
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

            <div className="space-y-3 min-h-25">
              {players.length === 0 && (
                <p className="text-center py-8 text-slate-400">Add players to start</p>
              )}
              {players.map(p => (
                <div key={p.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-xl">
                  <span className=" font-bold text-lg text-slate-900">{p.name}</span>
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
              className={`w-full py-4 rounded-xl font-bold text-lg ${players.length < 2
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

  const activeNonWinners = players.filter(p => !p.isOut && p.id !== winnerId);
  const isDirectWinPossible = winnerId && activeNonWinners.length > 0 && activeNonWinners.every(p => {
    const v = roundScores[p.id];
    return !v || v.trim() === '' || v === '0';
  });

  return (
    <div className="h-screen w-screen overflow-y-auto bg-slate-50">
      {isLoading && LoaderOverlay}
      <div className="max-w-2xl mx-auto p-4 sm:p-5 space-y-5 pb-24">

        {/* Room Code Banner */}
        <div className="bg-linear-to-br from-indigo-600 to-indigo-800 text-white rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs uppercase opacity-80">Room Code</p>
              <p className="text-2xl font-black tracking-widest">{roomCode}</p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(roomCode || '');
                alert("Room code copied to clipboard!");
              }}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg text-xs font-medium transition"
            >
              Copy Code
            </button>
          </div>
          <p className="text-xs mt-3 opacity-80">Share this code with everyone at your table</p>
        </div>

        {/* Header - Pot & Round Info */}
        <div className="bg-linear-to-br from-slate-900 to-slate-800 text-white rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-xs text-slate-400 uppercase">Total Pot</p>
              <p className="text-4xl font-black text-emerald-400">{totalPot}</p>
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
              <p className="text-xs text-slate-300 uppercase">Active Players</p>
              <p className="font-bold text-emerald-400">
                {players.filter(p => !p.isOut).length} / {players.length}
              </p>
            </div>
          </div>
        </div>

        {/* Multiplier Selector */}
        <div className="flex bg-slate-100/80 backdrop-blur-sm p-1 rounded-xl gap-1 border border-slate-200">
          {(['Normal', 'Dedi', 'Double', 'Chaubar'] as Multiplier[]).map(m => (
            <button
              key={m}
              onClick={() => setMultiplier(m)}
              className={`
                flex-1 py-3 sm:py-3.5 rounded-lg font-medium text-sm transition-all duration-200
                ${multiplier === m
                  ? 'bg-white text-indigo-700 shadow-md scale-[1.05]'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-white/60'
                }
              `}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Direct win hint */}
        {isDirectWinPossible && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 p-3 rounded-xl text-center text-sm">
            All others have 0 points → winner takes full pot (entry not refunded)
          </div>
        )}

        {/* Players List */}
        <div className="space-y-4">
          {players.map(player => (
            <div
              key={player.id}
              className={`rounded-xl border border-slate-200 p-4 ${player.isOut ? 'bg-red-50 border-red-200 opacity-75' : 'bg-white'
                }`}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-lg text-slate-900">{player.name}</span>
                  {player.rejoinCount > 0 && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                      +{player.rejoinCount}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-3xl font-black text-slate-900">{player.cumulativeScore}</p>
                  <p className="text-xs text-slate-900">points</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-600">Paid: {player.totalPaid}</p>

                {!player.isOut ? (
                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <button
                      onClick={() => setWinnerId(player.id)}
                      className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${winnerId === player.id
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
                      className="w-28 p-3 text-slate-800 text-center text-2xl font-bold bg-slate-50 border rounded-lg focus:border-indigo-500 outline-none"
                      placeholder=""
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
                    Rejoin {buyInAmount}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isEditingLastRound && (
          <div className="bg-orange-50 border border-orange-200 text-orange-800 p-3 rounded-xl text-center text-sm">
            ⚠️ Editing last round — save when ready
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4">
          <button
            onClick={submitRound}
            disabled={!winnerId}
            className={`flex-1 py-4 rounded-xl font-bold text-lg transition-colors ${winnerId
              ? isDirectWinPossible
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
          >
            {isEditingLastRound
              ? "SAVE CORRECTION"
              : isDirectWinPossible
                ? "DECLARE WINNER & FINISH"
                : "SUBMIT ROUND"}
          </button>

          {roundsPlayed >= 1 && (
            <button
              onClick={() => handleFinishGame(false)}
              className="flex-1 sm:flex-none sm:w-44 py-4 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700"
            >
              FINISH GAME
            </button>
          )}
        </div>

        {roundsPlayed >= 1 && !isEditingLastRound && previousPlayers && (
          <button
            onClick={startCorrectLastRound}
            className="w-full py-3 mt-2 text-sm font-medium text-orange-600 hover:text-orange-800 bg-orange-50 rounded-xl border border-orange-200 transition-colors"
          >
            ✏️ Correct Last Round
          </button>
        )}

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