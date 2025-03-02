import React, { useState, useEffect } from 'react';
import SquatTracker from './exercises/SquatTracker';
import PushupTracker from './exercises/PushupTracker';
import LungeTracker from './exercises/LungeTracker';
import Confetti from 'react-confetti';

const ExerciseTracker: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<"squat" | "pushup" | "lunge">("squat");
  const [repCount, setRepCount] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState<boolean>(false);

  const handleRepCountChange = (newCount: number) => {
    setRepCount(newCount);
  };

  useEffect(() => {
    // When repCount is a multiple of 10 (and non-zero), trigger celebration
    if (repCount > 0 && repCount % 3 === 0) {
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
          {/* Confetti overlay */}
          <Confetti width={window.innerWidth} height={window.innerHeight} />
          {/* Popup badge */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-blue-600 text-white text-2xl font-bold py-4 px-6 rounded shadow-lg">
              You reached {repCount} reps!
            </div>
          </div>
        </>
      )}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">AI Workout Coach</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300" onClick={() => alert("Results emailed to recipients successfully!")}>
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
            setSelectedExercise(e.target.value as "squat" | "pushup" | "lunge");
            setRepCount(0);
          }}
          className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring focus:ring-blue-300"
        >
          <option value="squat">Squat</option>
          <option value="pushup">Push-up</option>
          <option value="lunge">Lunge</option>
        </select>
      </div>

      <div className="gen-ai-start">
          <button 
            className="start-button font-bold text-gray-800 hover:text-indigo-600 transition-colors rounded-full border-2 border-gray-800 px-4 py-2"
            onClick={() => {
              console.log("Button clicked");
              // handleMicToggle();
            }}
          >
            {"Start Voice Coach"}
          </button>
          {/* Your existing ExerciseTracker content */}
      </div>

      <div className="mb-4 text-2xl font-semibold text-blue-700">
        Total Reps: {repCount}
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden">
        {selectedExercise === "squat" && (
          <SquatTracker onRepCountChange={handleRepCountChange} />
        )}
        {selectedExercise === "pushup" && (
          <PushupTracker onRepCountChange={handleRepCountChange} />
        )}
        {selectedExercise === "lunge" && (
          <LungeTracker onRepCountChange={handleRepCountChange} />
        )}
      </div>
    </div>
  );
};

export default ExerciseTracker;
