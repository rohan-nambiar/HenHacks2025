import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import Select from 'react-select';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
// Import your BlazePose model JSON data
import modelData from '../data/BlazePoseModel.json';

// Helper: calculate an angle (with vertex at B)
const calculateAngle = (A: any, B: any, C: any): number => {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs(radians * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
};

// Helper: compute Euclidean distance.
const distance = (a: any, b: any): number => {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
};

// Transform saved landmarks so that the saved left/right shoulders (indexes 11 & 12)
// align with the current frame's shoulders.
const transformLandmarks = (
  savedLandmarks: any[],
  savedLeft: any,
  savedRight: any,
  currentLeft: any,
  currentRight: any
) => {
  const savedMid = {
    x: (savedLeft.x + savedRight.x) / 2,
    y: (savedLeft.y + savedRight.y) / 2,
  };
  const currentMid = {
    x: (currentLeft.x + currentRight.x) / 2,
    y: (currentLeft.y + currentRight.y) / 2,
  };

  const savedShoulderDist = distance(savedLeft, savedRight);
  const currentShoulderDist = distance(currentLeft, currentRight);
  const scale = currentShoulderDist / savedShoulderDist;

  const savedAngle = Math.atan2(savedRight.y - savedLeft.y, savedRight.x - savedLeft.x);
  const currentAngle = Math.atan2(currentRight.y - currentLeft.y, currentRight.x - currentLeft.x);
  const rotation = currentAngle - savedAngle;

  return savedLandmarks.map((landmark) => {
    const dx = landmark.x - savedMid.x;
    const dy = landmark.y - savedMid.y;
    const rotatedX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
    const rotatedY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
    return {
      ...landmark,
      x: rotatedX * scale + currentMid.x,
      y: rotatedY * scale + currentMid.y,
    };
  });
};

// Define joints for feedback using landmark indexes.
const angleJoints: { [key: string]: [number, number, number] } = {
  rightElbow: [16, 14, 12],
  rightShoulder: [14, 12, 24],
  leftShoulder: [23, 11, 13],
  leftElbow: [11, 13, 15],
  rightHip: [12, 24, 26],
  rightKnee: [24, 26, 28],
  leftHip: [11, 23, 25],
  leftKnee: [23, 25, 27]
};

// Define weights for each joint.
const jointWeights: { [key: string]: number } = {
  rightElbow: 1.5,
  leftElbow: 1.5,
  rightShoulder: 1.0,
  leftShoulder: 1.0,
  rightHip: 1.0,
  leftHip: 1.0,
  rightKnee: 1.5,
  leftKnee: 1.5
};

// Threshold (in degrees) for feedback.
const angleThreshold = 10;

const getObjectFromLocalStorage = (key: string): any | null => {
  const item = localStorage.getItem(key);
  if (item) {
      return JSON.parse(item);
  }
  return null;
};

const YogaPoseMatcher: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Saved reference pose (state and ref).
  const [savedPose, setSavedPose] = useState<{ landmarks: any[] } | null>(null);
  const savedPoseRef = useRef<{ landmarks: any[] } | null>(null);
  const [savePoseButtonDisabled, setSavePostButtonDisabled] = useState<boolean>(false);
  const myObject = getObjectFromLocalStorage("allYogaPose");
  const [poseOptions, setPoseOptions] = useState<{ value: any[]; label: string}[] | null>(myObject || []);
  const [poseOptionSelected, setPoseOptionSelected] = useState<{ value: any[]; label: string} | null>(null);

  // Timer state for countdown text.
  const [timerText, setTimerText] = useState<string>("");
  const [showTimer, setShowTimer] = useState<boolean>(false);
  
  useEffect(() => {
    savedPoseRef.current = savedPose;
  }, [savedPose]);

  // Live pose state.
  const [currentAngles, setCurrentAngles] = useState<{ [key: string]: number }>({});
  const [currentLandmarks, setCurrentLandmarks] = useState<any[] | null>(null);
  const currentLandmarksRef = useRef<any[] | null>(null);
  useEffect(() => {
    currentLandmarksRef.current = currentLandmarks;
  }, [currentLandmarks]);

  // Feedback and score state.
  const [feedback, setFeedback] = useState<string[]>([]);
  const [matchScore, setMatchScore] = useState<number>(100);
  // Smoothed error state.
  const [smoothedError, setSmoothedError] = useState<number>(0);
  const smoothingFactor = 0.8;

  // Ref to hold the computed score.
  const currentScoreRef = useRef<number>(100);

  // Ref to hold the latest live pose for saving reference.
  const latestPoseRef = useRef<{ landmarks: any[] } | null>(null);

  // Throttle score updates: update matchScore state every 200ms.
  useEffect(() => {
    const interval = setInterval(() => {
      setMatchScore(currentScoreRef.current);
    }, 200); // 200ms delay
    return () => clearInterval(interval);
  }, []);

  // console.log(feedback + "" + currentAngles);

  // Initialize MediaPipe Pose and camera (run once on mount).
  useEffect(() => {
    if (!videoRef.current) return;
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    pose.onResults((results: Results) => {
      if (!results.poseLandmarks || !canvasRef.current || !videoRef.current) return;
      // Save latest pose for reference saving.
      latestPoseRef.current = { landmarks: results.poseLandmarks };

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
      drawLandmarks(ctx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      ctx.restore();

      // Update live landmarks and compute live joint angles.
      setCurrentLandmarks(results.poseLandmarks);
      const liveAngles: { [key: string]: number } = {};
      Object.entries(angleJoints).forEach(([joint, [iA, iB, iC]]) => {
        if (results.poseLandmarks[iA] && results.poseLandmarks[iB] && results.poseLandmarks[iC]) {
          liveAngles[joint] = calculateAngle(
            results.poseLandmarks[iA],
            results.poseLandmarks[iB],
            results.poseLandmarks[iC]
          );
        }
      });
      setCurrentAngles(liveAngles);

      // If a saved pose exists, compare each joint.
      if (savedPoseRef.current) {
        let totalError = 0;
        let totalWeight = 0;
        const newFeedback: string[] = [];

        Object.entries(angleJoints).forEach(([joint, indices]) => {
          if (liveAngles[joint] !== undefined) {
            const refAngle = calculateAngle(
              savedPoseRef.current!.landmarks[indices[0]],
              savedPoseRef.current!.landmarks[indices[1]],
              savedPoseRef.current!.landmarks[indices[2]]
            );
            const liveAngle = liveAngles[joint];
            const diff = liveAngle - refAngle; // positive if live is higher.
            const weight = jointWeights[joint] || 1.0;
            totalError += Math.abs(diff) * weight;
            totalWeight += weight;

            if (Math.abs(diff) > angleThreshold) {
              const jointData = (modelData as any)[joint];
              const name = jointData ? jointData.displayName : joint;
              newFeedback.push(diff < 0 ? `Increase angle for ${name}` : `Decrease angle for ${name}`);
            }
          }
        });

        const avgError = totalWeight > 0 ? totalError / totalWeight : 0;
        // Smooth the error.
        const newSmoothedError = smoothingFactor * smoothedError + (1 - smoothingFactor) * avgError;
        setSmoothedError(newSmoothedError);
        // Adjust multiplier as needed; here, multiplier = 5.
        const score = Math.max(0, 100 - newSmoothedError * 5);
        currentScoreRef.current = Math.round(score);
        setFeedback(newFeedback);

        ctx.save();
        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.fillText(`Match Score: ${Math.round(score)}%`, 10, 30);
        ctx.restore();
      } else {
        const ctx2 = canvasRef.current.getContext('2d');
        if (ctx2) {
          ctx2.save();
          ctx2.fillStyle = "white";
          ctx2.font = "20px Arial";
          ctx2.fillText("No reference pose saved", 10, 30);
          ctx2.restore();
        }
      }

      // Overlay the saved reference pose.
      if (savedPoseRef.current) {
        const savedLandmarks = savedPoseRef.current.landmarks;
        // Assuming left shoulder = index 11 and right shoulder = index 12.
        const savedLeft = savedLandmarks[11];
        const savedRight = savedLandmarks[12];
        const currentLeft = results.poseLandmarks[11];
        const currentRight = results.poseLandmarks[12];
        if (savedLeft && savedRight && currentLeft && currentRight) {
          const transformedReference = transformLandmarks(
            savedLandmarks,
            savedLeft,
            savedRight,
            currentLeft,
            currentRight
          );
          ctx.save();
          drawConnectors(ctx, transformedReference, POSE_CONNECTIONS, { color: '#0000FF', lineWidth: 2 });
          drawLandmarks(ctx, transformedReference, { color: '#0000FF', lineWidth: 1 });
          ctx.fillStyle = "#0000FF";
          ctx.font = "20px Arial";
          ctx.fillText("Reference Pose Overlay", 10, 60);
          ctx.restore();
        }
      }
    });

    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await pose.send({ image: videoRef.current });
      },
      width: 640,
      height: 480,
    });
    camera.start();
    return () => {
      camera.stop();
    };
  }, []); // Run once on mount

  const saveRef = (item: any) => {
    if (item && item.length > 0) {
      console.log("Saving current pose as reference.");
      //prompt user to enter a name for the pose and add it to the dropdown option
      let newPostLabel = window.prompt("Enter a name for the new pose");
      if (newPostLabel) {
        setSavedPose({ landmarks: item });
        setPoseOptions((prev) => [...prev, { value: item, label: newPostLabel }]);
        // add the new pose to local storage for persistence
        localStorage.setItem("allYogaPose", JSON.stringify([...poseOptions, { value: item, label: newPostLabel }]));
        setPoseOptionSelected({ value: item, label: newPostLabel });
      }
    } else {
      console.warn("No valid landmarks to save.");
    }
  }

  const setPoseReference = (selected: any) => {
    if (!selected) return;
    console.info("onchange", selected);
    setPoseOptionSelected(selected);
    setSavedPose({ landmarks: selected.value });
  };

  // Delete a saved pose.
  const deletePose = (selected: any) => {
    if (!selected || !poseOptions || poseOptions.length==0) return;
    const newPoseOptions = poseOptions.filter((option) => option.value !== selected.value);
    setPoseOptions(newPoseOptions);
    // remove the pose from local storage
    localStorage.setItem("allYogaPose", JSON.stringify(newPoseOptions));
    setSavedPose(null);
    setPoseOptionSelected(null);
  };

  // Save the current pose as reference with an optional delay.
  const savePose = (delay: number) => {
    setSavePostButtonDisabled(true);
    let count = delay;
    if (delay === 0) {
      saveRef(currentLandmarksRef.current);
      setSavePostButtonDisabled(false);
    } else {
      setTimerText(`${count}`);
      setShowTimer(true);
      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          setTimerText(`${count}`);
        } else if (count === 0) {
          setTimerText(`Snap!`);
          clearInterval(interval);
          setShowTimer(false);
          saveRef(currentLandmarksRef.current);  
          setSavePostButtonDisabled(false);
        }
      }, 1000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Yoga Pose Matcher</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300" onClick={() => alert("Results emailed to recipients successfully!")}>
          Send Results
        </button>
      </div>
      <div className="mb-4 space-y-4">
        <button
          onClick={savePose.bind(null, 0)}
          className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
          disabled={!currentLandmarksRef.current || currentLandmarksRef.current.length === 0 || savePoseButtonDisabled}
        >
          Take Ref Pose
        </button>
        <button
          onClick={savePose.bind(null, 3)}
          className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded ml-2"
          disabled={!currentLandmarksRef.current || currentLandmarksRef.current.length === 0 || savePoseButtonDisabled}
        >
          Wait 3 Secs
        </button>
        <button
          onClick={savePose.bind(null, 10)}
          className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded ml-2"
          disabled={!currentLandmarksRef.current || currentLandmarksRef.current.length === 0 || savePoseButtonDisabled}
        >
          Wait 10 Secs
        </button>
        <button
          onClick={deletePose.bind(null, poseOptionSelected)}
          disabled={!poseOptionSelected}
          className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded"
        >
          Delete selected Pose
        </button>
        <Select
          name="selectedPose"
          isSearchable={true}
          classNamePrefix="select"
          className="bg-green-600 hover:bg-green-700 py-2 px-4 rounded"
          options={poseOptions}
          isDisabled={!poseOptionSelected}
          value={poseOptionSelected}
          onChange={(selected) => setPoseReference(selected)}
          placeholder="Select a pose as reference"
          />
      </div>
      {/* Overlay the countdown on top of the canvas */}
      <div className="border border-gray-300 rounded-lg overflow-hidden relative">
        <video ref={videoRef} className="hidden" />
        <canvas ref={canvasRef} width={640} height={480} className="w-full" />
        {showTimer && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="countdown font-mono text-6xl">
              <span 
                style={{ "--value": timerText } as React.CSSProperties}
                aria-live="polite" 
                aria-label={`Countdown: ${timerText}`}
                className="bg-white/75 px-4 py-2 rounded shadow"
              >
                {timerText}
              </span>
            </span>
          </div>
        )}
      </div>
      <div className="mt-4 mb-4 text-xl text-gray-700">
        {savedPose ? "Reference Pose Saved" : "No Reference Pose Saved"}
      </div>
      <div className="mb-4 text-xl text-gray-700">
        Current Match Score: {matchScore}%
      </div>
    </div>
  );
};

export default YogaPoseMatcher;
