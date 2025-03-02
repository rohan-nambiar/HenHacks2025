import React, { useState, useEffect } from 'react';
import BalanceTracker from './exercises/BalanceTracker';
import ResistanceTracker from './exercises/ResistanceTracker';
import Confetti from 'react-confetti';

const PhysicalTherapy: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<'balance' | 'stretch' | 'resistance'>('balance');
  const [isBalanced, setIsBalanced] = useState<boolean>(true);
  const [repCount, setRepCount] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState<boolean>(false);

  const handleRepCountChange = (newCount: number) => {
    setRepCount(newCount);
  };

  const onBalanceChange = (isBalanced: boolean) => {
    setIsBalanced(isBalanced);
  };

  useEffect(() => {
    if (repCount > 0 && repCount % 5 === 0) {
      setShowCelebration(true);
      const timer = setTimeout(() => {
        setShowCelebration(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [repCount]);

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8 relative">
      {showCelebration && (
        <>
          <Confetti width={window.innerWidth} height={window.innerHeight} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-green-600 text-white text-2xl font-bold py-4 px-6 rounded shadow-lg">
              You reached {repCount} reps!
            </div>
          </div>
        </>
      )}
      
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Physical Therapy Tracker</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300" onClick={() => alert("Results sent!")}>
          Send Results
        </button>
      </div>
      
      <div className="mb-4">
        <label
          htmlFor="exerciseSelect"
          className="text-lg font-medium text-gray-700 mr-2"
        >
          Choose an exercise:
        </label>
        <select
          id="exerciseSelect"
          value={selectedExercise}
          onChange={(e) => {
            setSelectedExercise(e.target.value as 'balance' | 'stretch' | 'resistance');
            setRepCount(0);
          }}
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-green-300"
        >
          <option value="balance">Balance</option>
          <option value="resistance">Resistance Training</option>
        </select>
      </div>
      
      <div className="mb-4 text-2xl font-semibold text-green-700">
        Total Reps: {repCount}
      </div>
      
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        {selectedExercise === "balance" && (
          <BalanceTracker onBalanceChange={onBalanceChange} />
        )}
        {selectedExercise === "resistance" && (
          <ResistanceTracker onRepCountChange={handleRepCountChange} />
        )}
      </div>
    </div>
  );
};

export default PhysicalTherapy;
