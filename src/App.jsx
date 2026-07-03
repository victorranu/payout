import React, { useState, useMemo } from 'react';

// Inline Icons to avoid import errors (declared at module scope so they
// aren't recreated on every render).
const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trophy"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);

const DollarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
);

// Settlement Algorithm: Match Winners and Losers.
// Pure function — returns the minimized list of transactions.
const calculateTransactions = (data) => {
  // Deep copy to avoid mutating the caller's data
  let debtors = data
    .filter(p => p.totalMoney < -0.01)
    .map(p => ({ ...p, balance: p.totalMoney }))
    .sort((a, b) => a.balance - b.balance); // Ascending (Largest negative first)

  let creditors = data
    .filter(p => p.totalMoney > 0.01)
    .map(p => ({ ...p, balance: p.totalMoney }))
    .sort((a, b) => b.balance - a.balance); // Descending (Largest positive first)

  const txs = [];

  let i = 0; // creditor index
  let j = 0; // debtor index

  while (i < creditors.length && j < debtors.length) {
    let creditor = creditors[i];
    let debtor = debtors[j];

    // The amount to settle is the minimum of what the debtor owes or what the creditor is owed
    let amount = Math.min(Math.abs(debtor.balance), creditor.balance);

    // Round to 2 decimals to prevent floating point weirdness
    amount = Math.round(amount * 100) / 100;

    if (amount > 0) {
      txs.push({
        from: debtor.name,
        to: creditor.name,
        amount: amount
      });
    }

    // Adjust balances
    creditor.balance -= amount;
    debtor.balance += amount;

    // Move indices if settled (using a small epsilon for float comparison)
    if (creditor.balance < 0.01) i++;
    if (Math.abs(debtor.balance) < 0.01) j++;
  }

  return txs;
};

const App = () => {
  const [unitPrice, setUnitPrice] = useState(1);
  const [players, setPlayers] = useState([
    { id: 1, name: 'Player 1', wolfPoints: 0, skins: 0 },
    { id: 2, name: 'Player 2', wolfPoints: 0, skins: 0 },
    { id: 3, name: 'Player 3', wolfPoints: 0, skins: 0 },
    { id: 4, name: 'Player 4', wolfPoints: 0, skins: 0 },
  ]);

  // Snake game configuration
  const [snakePenalty, setSnakePenalty] = useState(1);
  const [totalThreePutts, setTotalThreePutts] = useState(0);
  const [snakeOwnerId, setSnakeOwnerId] = useState('nobody');

  // Running pot total (Total 3-Putts * Snake Unit Penalty)
  const potTotal = totalThreePutts * snakePenalty;

  // Update a specific field for a player
  const updatePlayer = (id, field, value) => {
    const newPlayers = players.map(p => 
      p.id === id ? { ...p, [field]: field === 'name' ? value : Number(value) } : p
    );
    setPlayers(newPlayers);
  };

  const addPlayer = () => {
    const newId = players.length > 0 ? Math.max(...players.map(p => p.id)) + 1 : 1;
    setPlayers([...players, { id: newId, name: `Player ${newId}`, wolfPoints: 0, skins: 0 }]);
  };

  const removePlayer = (id) => {
    if (players.length > 2) {
      setPlayers(players.filter(p => p.id !== id));
    }
  };

  // Main Calculation Logic — derived during render so the Scorecard and
  // Final Payouts always reflect the latest inputs (instant HMR updates).
  const { results, transactions, totals } = useMemo(() => {
    const playerCount = players.length;

    // 1. Calculate Totals
    const totalWolfPoints = players.reduce((sum, p) => sum + p.wolfPoints, 0);
    const totalSkins = players.reduce((sum, p) => sum + p.skins, 0);

    // 2. Calculate Averages (The "Buy In")
    const averageWolf = playerCount > 0 ? totalWolfPoints / playerCount : 0;

    // 2b. Snake Logic (money, not points)
    // Bypass gracefully if "Nobody" owns the snake, there is no pot, or
    // there aren't enough players to split among.
    const ownerId = Number(snakeOwnerId);
    const hasSnake =
      snakeOwnerId !== 'nobody' &&
      playerCount >= 2 &&
      potTotal > 0 &&
      players.some(p => p.id === ownerId);

    // Winners = everyone except the owner. Round each share DOWN to the
    // nearest dollar; the owner is only penalized for what is actually
    // distributed so the ledger stays perfectly zeroed out.
    const winnerCount = playerCount - 1;
    const perWinner = hasSnake ? Math.floor(potTotal / winnerCount) : 0;
    const ownerPenalty = perWinner * winnerCount;

    // 3. Calculate Net Scores per Player
    const calculatedResults = players.map(p => {
      // Wolf Logic: Your Score - Average Score
      const wolfNet = p.wolfPoints - averageWolf;

      // Skins Logic: (Your Skins * PlayerCount) - TotalSkins
      const skinsNet = (p.skins * playerCount) - totalSkins;

      const totalNetPoints = wolfNet + skinsNet;

      // Snake money adjustment (already in dollars)
      let snakeMoney = 0;
      if (hasSnake) {
        snakeMoney = p.id === ownerId ? -ownerPenalty : perWinner;
      }

      const totalMoney = totalNetPoints * unitPrice + snakeMoney;

      return {
        ...p,
        wolfNet,
        skinsNet,
        snakeMoney,
        totalNetPoints,
        totalMoney
      };
    });

    // 4. Calculate Payouts (Settlement Algorithm)
    return {
      results: calculatedResults,
      transactions: calculateTransactions(calculatedResults),
      totals: { wolf: totalWolfPoints, skins: totalSkins }
    };
    // potTotal already captures snakePenalty * totalThreePutts.
  }, [players, unitPrice, snakeOwnerId, potTotal]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-800">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-600">
          <h1 className="text-2xl font-bold flex items-center gap-2 text-green-800">
            <TrophyIcon />
            Wolf Skins Snake Payout Calculator
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Enter results for each game. The engine nets every player out and minimizes cash transactions.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            <li>
              <span className="font-semibold text-slate-700">Wolf:</span>{' '}
              "Poker style" buy-in for Wolf.
            </li>
            <li>
              <span className="font-semibold text-slate-700">Skins:</span>{' '}
              "Pays Everyone" style for Skins.
            </li>
            <li>
              <span className="font-semibold text-slate-700">Snake:</span>{' '}
              Every 3-putt adds to a progressive pot. The last player to 3-putt owns the snake and pays the whole pot, split evenly among everyone else.
            </li>
          </ul>
        </div>

        {/* Global Settings */}
        <div className="bg-white rounded-xl shadow-sm p-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="font-semibold text-slate-700">Unit Price ($):</label>
            <input
              type="number"
              min="0.01"
              step="0.5"
              value={unitPrice}
              onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
              className="w-24 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-right font-mono"
            />
          </div>
          <div className="text-sm text-slate-500 bg-slate-50 px-3 py-1 rounded border border-slate-200">
             Total Skins: <strong>{totals.skins}</strong> | Total Wolf Pts: <strong>{totals.wolf}</strong>
          </div>
        </div>

        {/* Player Input Grid */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Player Name</th>
                  <th className="p-4 font-semibold w-32 text-center">Wolf Points</th>
                  <th className="p-4 font-semibold w-24 text-center">Skins Won</th>
                  <th className="p-4 font-semibold w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {players.map((player) => (
                  <tr key={player.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3">
                      <input 
                        type="text" 
                        value={player.name}
                        onChange={(e) => updatePlayer(player.id, 'name', e.target.value)}
                        className="w-full bg-transparent border-b border-transparent focus:border-green-500 outline-none p-1"
                        placeholder="Name"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input 
                        type="number" 
                        value={player.wolfPoints}
                        onChange={(e) => updatePlayer(player.id, 'wolfPoints', e.target.value)}
                        className="w-full text-center p-2 bg-slate-50 border border-slate-200 rounded focus:border-green-500 outline-none"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input 
                        type="number" 
                        value={player.skins}
                        onChange={(e) => updatePlayer(player.id, 'skins', e.target.value)}
                        className="w-full text-center p-2 bg-slate-50 border border-slate-200 rounded focus:border-green-500 outline-none"
                      />
                    </td>
                    <td className="p-3 text-center">
                      {players.length > 2 && (
                        <button 
                          onClick={() => removePlayer(player.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="Remove Player"
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <button 
              onClick={addPlayer}
              className="text-sm font-medium text-green-700 hover:text-green-800 flex items-center gap-1"
            >
              <PlusIcon />
              Add Player
            </button>
          </div>
        </div>

        {/* Snake Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4 border-l-4 border-amber-500">
          <h3 className="font-bold text-slate-700 text-lg">Snake</h3>

          {/* Snake Configuration */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="font-semibold text-slate-700">Snake Unit Penalty ($):</label>
              <input
                type="number"
                min="0"
                step="0.5"
                value={snakePenalty}
                onChange={(e) => setSnakePenalty(Math.max(0, Number(e.target.value)))}
                className="w-24 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-right font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="font-semibold text-slate-700">Total 3-Putts in Group:</label>
              <input
                type="number"
                min="0"
                step="1"
                value={totalThreePutts}
                onChange={(e) => setTotalThreePutts(Math.max(0, Math.floor(Number(e.target.value))))}
                className="w-24 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 outline-none text-right font-mono"
              />
            </div>
            <div className="text-sm text-slate-500 bg-slate-50 px-3 py-1 rounded border border-slate-200">
               Calculated Pot Total: <strong>${potTotal.toFixed(2)}</strong>
            </div>
          </div>

          {/* Snake Ownership */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="font-semibold text-slate-700">Snake Owner:</label>
              <select
                value={snakeOwnerId}
                onChange={(e) => setSnakeOwnerId(e.target.value)}
                className="p-2 border border-slate-300 rounded focus:ring-2 focus:ring-green-500 outline-none bg-white"
              >
                <option value="nobody">No Snake</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="text-sm text-slate-600 bg-amber-50 px-3 py-1 rounded border border-amber-200">
               Pot Value: <strong className="text-amber-700">${potTotal.toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {/* Results Analysis */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Detailed Breakdown */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-slate-700 mb-4 text-lg border-b pb-2">Scorecard</h3>
            <div className="space-y-3">
              {results.map(r => (
                <div key={r.id} className="flex justify-between items-center text-sm">
                  <div className="font-medium text-slate-700">{r.name}</div>
                  <div className={`font-mono font-bold ${r.totalMoney >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {r.totalMoney >= 0 ? '+' : ''}{r.totalMoney.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
               <p>Math Check: Total Net should be 0. Actual: {results.reduce((a,b)=>a+b.totalMoney,0).toFixed(2)}</p>
            </div>
          </div>

          {/* Final Payouts */}
          <div className="bg-slate-800 rounded-xl shadow-sm p-6 text-white">
            <h3 className="font-bold text-green-400 mb-4 text-lg border-b border-slate-700 pb-2 flex items-center gap-2">
              <DollarIcon />
              Final Payouts
            </h3>
            
            {transactions.length === 0 ? (
              <div className="text-slate-400 text-center py-8 italic">
                {totals.wolf === 0 && totals.skins === 0 ? "Enter scores to calculate." : "All square! No money exchanges hands."}
              </div>
            ) : (
              <div className="space-y-3">
                {transactions.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-slate-700/50 p-3 rounded-lg border border-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-red-300 font-medium">{t.from}</span>
                      <span className="text-slate-400 text-xs">pays</span>
                      <span className="text-green-300 font-medium">{t.to}</span>
                    </div>
                    <div className="font-bold font-mono text-yellow-400">
                      ${t.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default App;