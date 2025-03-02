import React, { useState } from 'react';
import SquatTracker from './exercises/SquatTracker';
import PushupTracker from './exercises/PushupTracker';
import LungeTracker from './exercises/LungeTracker';

const ExerciseTracker: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<"squat" | "pushup" | "lunge">("squat");
  const [repCount, setRepCount] = useState<number>(0);

  const handleRepCountChange = (newCount: number) => {
    console.log(repCount)
    setRepCount(newCount);
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">AI Physical Therapy Coach</h1>
      <div className="mb-4">
        <label htmlFor="exerciseSelect" className="text-lg font-medium text-gray-700 mr-2">
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
      
      {/* Display the rep count */}
      <div className="mb-4 text-2xl font-semibold text-blue-700">
      </div>
      
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
  );
};

export default ExerciseTracker;
