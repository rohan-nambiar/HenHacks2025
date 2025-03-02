import React, { useState, useRef, useEffect } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// The joints we care about:
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

// Calculate angle for a single joint
function calculateAngle(A: any, B: any, C: any): number {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs(radians * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
}

// Compute angles for all tracked joints
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

// Check if we are near a specific pose for all joints
function isNearPose(
  liveAngles: Record<string, number>,
  targetAngles: Record<string, number>,
  tolerance = 10
): boolean {
  for (const jointName of Object.keys(angleJoints)) {
    const live = liveAngles[jointName] ?? 0;
    const target = targetAngles[jointName] ?? 0;
    if (Math.abs(live - target) > tolerance) {
      return false;
    }
  }
  return true;
}

const NewMovement: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // This ref will hold the *latest* detected pose landmarks every frame:
  const latestLandmarksRef = useRef<any[] | null>(null);

  // Start & End pose data
  const [startPoseAngles, setStartPoseAngles] = useState<Record<string, number> | null>(null);
  const [endPoseAngles, setEndPoseAngles] = useState<Record<string, number> | null>(null);

  // We'll keep them in refs so onResults can see them
  const startPoseAnglesRef = useRef<Record<string, number> | null>(null);
  const endPoseAnglesRef = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    startPoseAnglesRef.current = startPoseAngles;
  }, [startPoseAngles]);
  useEffect(() => {
    endPoseAnglesRef.current = endPoseAngles;
  }, [endPoseAngles]);

  // For UI, just to say "pose saved"
  const [startPoseSaved, setStartPoseSaved] = useState(false);
  const [endPoseSaved, setEndPoseSaved] = useState(false);

  // Min & max angles derived from Start & End
  const [minAngles, setMinAngles] = useState<Record<string, number> | null>(null);
  const [maxAngles, setMaxAngles] = useState<Record<string, number> | null>(null);

  // Rep counting
  const [userPoseState, setUserPoseState] = useState<"AT_START" | "AT_END" | "IN_BETWEEN">("IN_BETWEEN");
  const [repCount, setRepCount] = useState<number>(0);

  const userPoseStateRef = useRef<"AT_START" | "AT_END" | "IN_BETWEEN">("IN_BETWEEN");
  useEffect(() => {
    userPoseStateRef.current = userPoseState;
  }, [userPoseState]);

  // UI states for countdown
  const [timerText, setTimerText] = useState<string>("");
  const [showTimer, setShowTimer] = useState<boolean>(false);
  const [savePoseButtonDisabled, setSavePoseButtonDisabled] = useState<boolean>(false);

  // Initialize MediaPipe Pose once
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
      // Log so you can see if the model is actually detecting you:
      console.log("Mediapipe results:", results.poseLandmarks);

      if (!results.poseLandmarks || !canvasRef.current) {
        return;
      }

      // Save the latest landmarks each frame:
      latestLandmarksRef.current = results.poseLandmarks;

      // Draw the skeleton
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {
        color: '#00FF00',
        lineWidth: 4,
      });
      drawLandmarks(ctx, results.poseLandmarks, {
        color: '#FF0000',
        lineWidth: 2,
      });
      ctx.restore();

      // If no start/end pose is saved, skip rep logic
      if (!startPoseAnglesRef.current || !endPoseAnglesRef.current) return;
      // If we haven't computed min/max, skip as well
      if (!minAngles || !maxAngles) return;

      // Live angles
      const liveAngles = computePoseAngles(results.poseLandmarks);

      // Are we near the minAngles => "AT_START"
      const isAtStart = isNearPose(liveAngles, minAngles, 10);
      // Are we near the maxAngles => "AT_END"
      const isAtEnd = isNearPose(liveAngles, maxAngles, 10);

      let newState: "AT_START" | "AT_END" | "IN_BETWEEN" = "IN_BETWEEN";
      if (isAtStart) newState = "AT_START";
      else if (isAtEnd) newState = "AT_END";

      if (newState !== userPoseStateRef.current) {
        // Example: increment reps when going from start -> end
        if (userPoseStateRef.current === "AT_START" && newState === "AT_END") {
          setRepCount((count) => count + 1);
        }
        setUserPoseState(newState);
      }
    });

    // Start the camera
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
  }, [minAngles, maxAngles]);

  // Countdown helper
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
          setTimeout(() => {
            resolve();
          }, 600);
        }
      }, 1000);
    });
  };

  // Save the user's Start & End poses
  const saveMovement = async (delay: number) => {
    setSavePoseButtonDisabled(true);

    // 1) Countdown -> capture Start
    await runCountdown(delay);

    // Retrieve the latest pose from the ref:
    const startLandmarks = latestLandmarksRef.current || [];
    const sAngles = computePoseAngles(startLandmarks);
    setStartPoseAngles(sAngles);
    setStartPoseSaved(true);

    console.log("Saved START pose angles:", sAngles);

    // 2) Countdown -> capture End
    await runCountdown(delay);

    const endLandmarks = latestLandmarksRef.current || [];
    const eAngles = computePoseAngles(endLandmarks);
    setEndPoseAngles(eAngles);
    setEndPoseSaved(true);

    console.log("Saved END pose angles:", eAngles);

    // 3) Now compute min/max
    const tempMin: Record<string, number> = {};
    const tempMax: Record<string, number> = {};
    for (const jointName of Object.keys(angleJoints)) {
      const startAngle = sAngles[jointName] ?? 0;
      const endAngle = eAngles[jointName] ?? 0;
      tempMin[jointName] = Math.min(startAngle, endAngle);
      tempMax[jointName] = Math.max(startAngle, endAngle);
    }
    setMinAngles(tempMin);
    setMaxAngles(tempMax);

    console.log("Set minAngles:", tempMin);
    console.log("Set maxAngles:", tempMax);

    setShowTimer(false);
    setSavePoseButtonDisabled(false);
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold text-gray-800">New Movement</h1>
        <button
          onClick={() => alert("Results emailed to recipients successfully!")}
          className="bg-blue-500 text-white px-4 py-2 rounded"
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
          className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded"
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
        {startPoseSaved ? "Start Pose Saved" : "No Start Pose Saved"} <br />
        {endPoseSaved ? "End Pose Saved" : "No End Pose Saved"}
      </div>

      <div className="mt-2 mb-2 text-2xl text-gray-800 font-semibold">
        Reps: {repCount}
      </div>
      <div className="text-lg text-gray-600">
        Current Pose State: {userPoseState}
      </div>
    </div>
  );
};

export default NewMovement;
