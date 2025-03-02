import React, { useState, useRef, useEffect } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

/** Each "angleJoints" entry says which 3 keypoints define a joint for angle measurement. */
const angleJoints: { [key: string]: [number, number, number] } = {
  rightElbow: [16, 14, 12],
  rightShoulder: [14, 12, 24],
  leftShoulder: [23, 11, 13],
  leftElbow: [11, 13, 15],
  rightHip: [12, 24, 26],
  rightKnee: [24, 26, 28],
  leftHip: [11, 23, 25],
  leftKnee: [23, 25, 27],
};

/** Calculate angle (in degrees) for the joint formed by A-B-C. */
function calculateAngle(A: any, B: any, C: any): number {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs(radians * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
}

/** Compute angles for each joint in the given landmarks. */
function computePoseAngles(landmarks: any[]): Record<string, number> {
  const angles: Record<string, number> = {};
  for (const [jointName, [idxA, idxB, idxC]] of Object.entries(angleJoints)) {
    const A = landmarks[idxA];
    const B = landmarks[idxB];
    const C = landmarks[idxC];
    if (A && B && C) {
      angles[jointName] = calculateAngle(A, B, C);
    }
  }
  return angles;
}

/** Returns a scalar representing how "far" liveAngles is from referenceAngles, summing abs differences. */
function angleDistance(
  liveAngles: Record<string, number>,
  referenceAngles: Record<string, number>
): number {
  let sum = 0;
  for (const jointName of Object.keys(angleJoints)) {
    const live = liveAngles[jointName] ?? 0;
    const ref = referenceAngles[jointName] ?? 0;
    sum += Math.abs(live - ref);
  }
  return sum;
}

/** Phase can be 'up', 'down', or 'none'. */
type Phase = 'up' | 'down' | 'none';

const NewMovement: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // ========== Pose States ==========
  const [startPose, setStartPose] = useState<{ landmarks: any[] } | null>(null);
  const [endPose, setEndPose] = useState<{ landmarks: any[] } | null>(null);

  // We keep references to them to read inside the onResults callback
  const startPoseRef = useRef<{ landmarks: any[] } | null>(null);
  const endPoseRef = useRef<{ landmarks: any[] } | null>(null);
  useEffect(() => {
    startPoseRef.current = startPose;
  }, [startPose]);
  useEffect(() => {
    endPoseRef.current = endPose;
  }, [endPose]);

  // ========== Live Landmarks & Angles ==========
  const currentLandmarksRef = useRef<any[] | null>(null);

  // ========== Rep / Phase Logic ==========
  const [repCount, setRepCount] = useState<number>(0);

  // We'll store the user-facing "phase" in state for display,
  // but we also keep a ref so the callback logic always sees the latest.
  const [phase, _setPhase] = useState<Phase>('none');
  const phaseRef = useRef<Phase>('none');
  const setPhase = (newPhase: Phase) => {
    _setPhase(newPhase);
    phaseRef.current = newPhase;
  };

  // Extra text for user feedback
  const [exerciseCue, setExerciseCue] = useState<string>("");

  // ========== Smoothing Variables in Refs (not state) ==========
  const smoothedDistToStartRef = useRef<number>(0);
  const smoothedDistToEndRef = useRef<number>(0);

  // Candidate phase & time we entered it
  const pendingPhaseRef = useRef<Phase>('none');
  const timeEnteredCandidateRef = useRef<number>(0);

  // ========== Timer Overlay for "Save Movement" ==========
  const [timerText, setTimerText] = useState<string>("");
  const [showTimer, setShowTimer] = useState<boolean>(false);
  const [savePoseButtonDisabled, setSavePoseButtonDisabled] =
    useState<boolean>(false);

  // ========== useEffect: Initialize Pose Exactly ONCE ==========
  useEffect(() => {
    if (!videoRef.current) return;

    // Create the Pose instance (model) just once
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

    // The callback that runs every frame
    pose.onResults((results: Results) => {
      if (!results.poseLandmarks || !canvasRef.current) return;

      // Store the landmarks
      currentLandmarksRef.current = results.poseLandmarks;

      // Draw the pose overlay
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(
        results.image,
        0,
        0,
        canvasRef.current.width,
        canvasRef.current.height
      );
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: "#00FF00",
        lineWidth: 4,
      });
      drawLandmarks(ctx, results.poseLandmarks, {
        color: "#FF0000",
        lineWidth: 2,
      });
      ctx.restore();

      // Compute angles for each joint
      const liveAngles: Record<string, number> = {};
      Object.entries(angleJoints).forEach(([joint, [iA, iB, iC]]) => {
        const A = results.poseLandmarks[iA];
        const B = results.poseLandmarks[iB];
        const C = results.poseLandmarks[iC];
        if (A && B && C) {
          liveAngles[joint] = calculateAngle(A, B, C);
        }
      });

      // If we don't have both poses, we can't do rep logic
      if (!startPoseRef.current || !endPoseRef.current) return;

      // Compare distances
      const startAngles = computePoseAngles(startPoseRef.current.landmarks);
      const endAngles = computePoseAngles(endPoseRef.current.landmarks);

      const rawDistToStart = angleDistance(liveAngles, startAngles);
      const rawDistToEnd = angleDistance(liveAngles, endAngles);

      // Smoothing (exponential moving average)
      const alpha = 0.3; // tweak as desired
      const oldSmoothedStart = smoothedDistToStartRef.current;
      const oldSmoothedEnd = smoothedDistToEndRef.current;

      const newSmoothedStart =
        alpha * rawDistToStart + (1 - alpha) * oldSmoothedStart;
      const newSmoothedEnd =
        alpha * rawDistToEnd + (1 - alpha) * oldSmoothedEnd;

      smoothedDistToStartRef.current = newSmoothedStart;
      smoothedDistToEndRef.current = newSmoothedEnd;

      // Debug log if needed
      // console.log(`rawStart=${rawDistToStart}, smoothStart=${newSmoothedStart}`);

      // Decide a candidate phase based on thresholds
      const thresholdStart = 150;
      const thresholdEnd = 150;

      let candidate: Phase = 'none';
      if (newSmoothedStart < thresholdStart) {
        candidate = 'up';
      } else if (newSmoothedEnd < thresholdEnd) {
        candidate = 'down';
      }

      // If the candidate changed from last frame, reset the timer
      if (candidate !== pendingPhaseRef.current) {
        pendingPhaseRef.current = candidate;
        timeEnteredCandidateRef.current = Date.now();
      } else {
        // If candidate is same as last frame, see how long it's been stable
        const elapsed = Date.now() - timeEnteredCandidateRef.current;
        const BUFFER_MS = 100; // wait 100 ms stable
        if (elapsed >= BUFFER_MS && candidate !== phaseRef.current) {
          // If old phase was 'down' and new is 'up', increment rep
          if (phaseRef.current === 'down' && candidate === 'up') {
            setRepCount((prev) => prev + 1);
          }
          // Commit the new phase
          setPhase(candidate);
        }
      }

      // We can do separate user feedback based on the *current* phaseRef
      if (phaseRef.current === 'up') {
        setExerciseCue("You're UP. Go Down!");
      } else if (phaseRef.current === 'down') {
        setExerciseCue("You're DOWN. Go Up!");
      } else {
        setExerciseCue("Move toward start or end pose.");
      }
    });

    // Start camera
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) {
          await pose.send({ image: videoRef.current });
        }
      },
      width: 640,
      height: 480,
    });
    camera.start();

    // Cleanup on unmount
    return () => {
      camera.stop();
    };
  }, []); // empty array => initialize Pose only once

  // ========== Countdown Helper for "Save Movement" ==========
  const runCountdown = (delay: number): Promise<void> => {
    return new Promise((resolve) => {
      let count = delay;
      setTimerText(`${count}`);
      setShowTimer(true);

      const interval = setInterval(() => {
        count--;
        if (count > 0) {
          setTimerText(`${count}`);
        } else if (count === 0) {
          setTimerText("Snap!");
          clearInterval(interval);
          // Wait a small moment, then resolve
          setTimeout(() => {
            resolve();
          }, 1000);
        }
      }, 1000);
    });
  };

  // ========== Save Movement Function ==========
  const saveMovement = async (delay: number) => {
    // Make sure we have landmarks
    if (!currentLandmarksRef.current || currentLandmarksRef.current.length === 0) {
      console.warn("No valid landmarks to save.");
      return;
    }

    setSavePoseButtonDisabled(true);

    // Capture the "Start" pose
    await runCountdown(delay);
    setStartPose({ landmarks: currentLandmarksRef.current! });

    // Capture the "End" pose
    await runCountdown(delay);
    setEndPose({ landmarks: currentLandmarksRef.current! });

    setShowTimer(false);
    setSavePoseButtonDisabled(false);

    // Reset logic
    setRepCount(0);
    setPhase('none');                  // Phase state + ref
    pendingPhaseRef.current = 'none';  // reset
    timeEnteredCandidateRef.current = Date.now();
    smoothedDistToStartRef.current = 0;
    smoothedDistToEndRef.current = 0;

    setExerciseCue("Try moving to start or end pose!");
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">New Movement</h1>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600"
          onClick={() => alert("Results emailed to recipients successfully!")}
        >
          Send Results
        </button>
      </div>

      <div className="mb-4 space-x-4">
        <button
          onClick={() => saveMovement(3)}
          className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded"
          disabled={savePoseButtonDisabled}
        >
          Save Movement (3 Sec Delay)
        </button>
        <button
          onClick={() => saveMovement(10)}
          className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded ml-2"
          disabled={savePoseButtonDisabled}
        >
          Save Movement (10 Sec Delay)
        </button>
      </div>

      <div className="border border-gray-300 rounded-lg overflow-hidden relative">
        <video ref={videoRef} className="hidden" />
        <canvas ref={canvasRef} width={640} height={480} className="w-full" />
        {showTimer && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="countdown font-mono text-6xl bg-white/75 px-4 py-2 rounded shadow">
              {timerText}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 mb-4 text-xl text-gray-700">
        {startPose ? "Start Pose Saved" : "No Start Pose Saved"}
        <br />
        {endPose ? "End Pose Saved" : "No End Pose Saved"}
      </div>

      {startPose && endPose && (
        <div className="text-center mt-6">
          <div className="text-2xl font-bold">{exerciseCue}</div>
          <div className="text-xl mt-4">Reps: {repCount}</div>
          <div className="mt-4 text-sm text-gray-500">
            Current Phase: {phase}
          </div>
        </div>
      )}
    </div>
  );
};

export default NewMovement;
