import React, { useState, useEffect } from 'react';
import SquatTracker from './exercises/SquatTracker';
import PushupTracker from './exercises/PushupTracker';
import LungeTracker from './exercises/LungeTracker';
import Confetti from 'react-confetti';
//@ts-ignore
import {GeminiAgent} from './gemini/main/agent.js';
//@ts-ignore
import { getConfig, getWebsocketUrl, getDeepgramApiKey, MODEL_SAMPLE_RATE } from './gemini/config/config.js';

const url = getWebsocketUrl();
const config = getConfig();
const deepgramApiKey = getDeepgramApiKey();
const toolManager = null;
// initialize geminiAgent of type GeminiAgent to null;
let geminiAgent: GeminiAgent | null = null;

const ExerciseTracker: React.FC = () => {
  const [selectedExercise, setSelectedExercise] = useState<"squat" | "pushup" | "lunge">("squat");
  const [repCount, setRepCount] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState<boolean>(false);
  // add is voice coach button clicked
  const [isVoiceCoachActive, setIsVoiceCoachActive] = useState<boolean>(false);

  const toggleVoiceCoach = async () => {

    console.log("toggleVoiceCoach button clicked");
    
    if (!isVoiceCoachActive) {
      console.log("Starting voice coach")
      config.systemInstruction = {
        parts: [{
            text: localStorage.getItem('systemInstructions') || "You are a friendly personal fitness coach. Introduce yourself as the AI Workout Coach. "
            + "Note, there may be subsequent messages preceded by 'SYSTEM COMMAND' - follow these system commands to their fullest extent. "
            + "There will be a SYSTEM COMMAND for the number of reps done. "
            + "At the start of the exercise, ask the user how many reps they want to do, and coach them to do that many, while caring for the health and well-being throughout, "
            + " stopping or cancelling the exercise if necessary. "
            + "The first exercise, which may be overriden by a SYSTEM COMMAND, is the " + selectedExercise
          }]
      }
      geminiAgent = new GeminiAgent({
        url,
        config,
        deepgramApiKey,
        modelSampleRate: MODEL_SAMPLE_RATE,
        toolManager
      });
      // Starting voice coach
      geminiAgent.connect();
      if (!geminiAgent.initialized) {
        await geminiAgent.initialize();
        const message = 'SYSTEM COMMAND: coach the user through the ' + selectedExercise + ' exercise. There is no need to mention that the user has done 0 reps of an exercise when they just start.';
        console.log(message)
        geminiAgent.sendText(message);
      }
    } else {
      // Stopping voice coach
      geminiAgent.disconnect();
    }
    
    // Toggle microphone regardless of current state
    geminiAgent.toggleMic();
    
    // Update button state
    setIsVoiceCoachActive(!isVoiceCoachActive);
  };

  const handleRepCountChange = (newCount: number) => {
    setRepCount(newCount);
    if (geminiAgent && geminiAgent.initialized) {
      geminiAgent.sendText('SYSTEM COMMAND: in total, the user performed ' + newCount + ' reps of ' + selectedExercise)
    }
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
            console.log("Selected exercise: " + e.target.value);
            setRepCount(0);
            if (geminiAgent && geminiAgent.initialized) {
              console.log("sending new command")
              geminiAgent.sendText("SYSTEM COMMAND: the user's selected exercise is now " + e.target.value)
            }
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
            onClick={toggleVoiceCoach}
          >
            {isVoiceCoachActive ? "Stop Voice Coach" : "Start Voice Coach"}
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
