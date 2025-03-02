import React, { useState } from 'react';
import SquatTracker from './exercises/SquatTracker';
import PushupTracker from './exercises/PushupTracker';
import LungeTracker from './exercises/LungeTracker';

const ExerciseTracker: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<"squat" | "pushup" | "lunge">("squat");
  const [repCount, setRepCount] = useState<number>(0);

  const handleRepCountChange = (newCount: number) => {
    setRepCount(newCount);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>AI Physical Therapy Coach</h1>
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="exerciseSelect">Choose an exercise: </label>
        <select
          id="exerciseSelect"
          value={selectedExercise}
          onChange={(e) => {
            setSelectedExercise(e.target.value as "squat" | "pushup" | "lunge");
            setRepCount(0);
          }}
        >
          <option value="squat">Squat</option>
          <option value="pushup">Push-up</option>
          <option value="lunge">Lunge</option>
        </select>
      </div>
      <div style={{ fontSize: "35px", marginBottom: "10px" }}>
        {selectedExercise} Count: {repCount}
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
