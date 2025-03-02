import React, { useState, useRef, useEffect } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

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

// -- Helpers --
function calculateAngle(A: any, B: any, C: any): number {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs(radians * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
}

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

function isPoseMatch(
  liveAngles: Record<string, number>,
  refAngles: Record<string, number>,
  threshold = 15
): boolean {
  for (const jointName of Object.keys(angleJoints)) {
    const live = liveAngles[jointName] ?? 0;
    const ref = refAngles[jointName] ?? 0;
    if (Math.abs(live - ref) > threshold) {
      return false;
    }
  }
  return true;
}

const NewMovement: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // -- Pose references/state --
  const [startPose, setStartPose] = useState<{ landmarks: any[] } | null>(null);
  const [endPose, setEndPose] = useState<{ landmarks: any[] } | null>(null);

  // We’ll keep the angles in state as well:
  const [startPoseAngles, setStartPoseAngles] = useState<Record<string, number> | null>(null);
  const [endPoseAngles, setEndPoseAngles] = useState<Record<string, number> | null>(null);

  // And we also store them in refs so that the onResults callback
  // can read the *latest* values without re-initializing Pose.
  const startPoseAnglesRef = useRef<Record<string, number> | null>(null);
  const endPoseAnglesRef = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    startPoseAnglesRef.current = startPoseAngles;
  }, [startPoseAngles]);

  useEffect(() => {
    endPoseAnglesRef.current = endPoseAngles;
  }, [endPoseAngles]);

  // -- Rep tracking / user pose state --
  const [userPoseState, setUserPoseState] = useState<"AT_START" | "AT_END" | "IN_BETWEEN">("IN_BETWEEN");
  const [repCount, setRepCount] = useState<number>(0);

  // Same pattern: store in a ref so the callback can see the latest:
  const userPoseStateRef = useRef<"AT_START" | "AT_END" | "IN_BETWEEN">("IN_BETWEEN");
  useEffect(() => {
    userPoseStateRef.current = userPoseState;
  }, [userPoseState]);

  // -- Timer UI --
  const [timerText, setTimerText] = useState<string>("");
  const [showTimer, setShowTimer] = useState<boolean>(false);
  const [savePoseButtonDisabled, setSavePoseButtonDisabled] = useState<boolean>(false);

  // -- MediaPipe Pose initialization (ONLY ONCE) --
  useEffect(() => {
    if (!videoRef.current) return;

    // Create Pose instance only once
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

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Clear and redraw the current video frame
      ctx.save();
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
      drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
      drawLandmarks(ctx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      ctx.restore();

      // -- EXERCISE/REPS LOGIC --
      const liveAngles = computePoseAngles(results.poseLandmarks);

      const startAngles = startPoseAnglesRef.current;
      const endAngles = endPoseAnglesRef.current;

      let matchesStart = false;
      let matchesEnd = false;

      if (startAngles) {
        matchesStart = isPoseMatch(liveAngles, startAngles, 15);
      }
      if (endAngles) {
        matchesEnd = isPoseMatch(liveAngles, endAngles, 15);
      }

      let newPoseState: "AT_START" | "AT_END" | "IN_BETWEEN" = "IN_BETWEEN";
      if (matchesStart) newPoseState = "AT_START";
      else if (matchesEnd) newPoseState = "AT_END";

      // Compare to the *ref*, so we don’t rely on re-renders:
      if (newPoseState !== userPoseStateRef.current) {
        // e.g. increment rep going from start to end
        if (userPoseStateRef.current === "AT_START" && newPoseState === "AT_END") {
          setRepCount((count) => count + 1);
        }
        setUserPoseState(newPoseState);
      }
    });

    // Start camera once
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await pose.send({ image: videoRef.current });
      },
      width: 640,
      height: 480,
    });
    camera.start();

    // Cleanup on unmount
    return () => {
      camera.stop();
    };
  }, []); // <--- No dependencies so this only runs on mount

  // -- Countdown helper --
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
          // Give a quick moment before resolving
          setTimeout(() => {
            resolve();
          }, 800);
        }
      }, 1000);
    });
  };

  // -- Save start & end poses (two countdowns in a row) --
  const saveMovement = async (delay: number) => {
    setSavePoseButtonDisabled(true);

    // 1) Countdown for start pose
    await runCountdown(delay);
    const sAngles = computePoseAngles((canvasRef.current as any)._poseLandmarks || []);
    setStartPoseAngles(sAngles);
    setStartPose({ landmarks: (canvasRef.current as any)._poseLandmarks || [] });
    console.log("Saved START pose angles:", sAngles);

    // 2) Countdown for end pose
    await runCountdown(delay);
    const eAngles = computePoseAngles((canvasRef.current as any)._poseLandmarks || []);
    setEndPoseAngles(eAngles);
    setEndPose({ landmarks: (canvasRef.current as any)._poseLandmarks || [] });
    console.log("Saved END pose angles:", eAngles);

    setShowTimer(false);
    setSavePoseButtonDisabled(false);
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
        {startPose ? "Start Pose Saved" : "No Start Pose Saved"} <br />
        {endPose ? "End Pose Saved" : "No End Pose Saved"}
      </div>

      <div className="mt-4 mb-2 text-2xl text-gray-800 font-semibold">
        Reps: {repCount}
      </div>
      <div className="text-lg text-gray-600">
        Current Pose State: {userPoseState}
      </div>
    </div>
  );
};

export default NewMovement;
