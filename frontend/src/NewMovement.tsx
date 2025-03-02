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

  // State for saving the two poses.
  const [startPose, setStartPose] = useState<{ landmarks: any[] } | null>(null);
  const [endPose, setEndPose] = useState<{ landmarks: any[] } | null>(null);

  // Refs for immediate access to saved poses and current landmarks.
  const startPoseRef = useRef<{ landmarks: any[] } | null>(null);
  const endPoseRef = useRef<{ landmarks: any[] } | null>(null);
  const currentLandmarksRef = useRef<any[] | null>(null);

  // Timer overlay state.
  const [timerText, setTimerText] = useState<string>("");
  const [showTimer, setShowTimer] = useState<boolean>(false);
  const [savePoseButtonDisabled, setSavePoseButtonDisabled] = useState<boolean>(false);

  // Update refs when state changes.
  useEffect(() => {
    startPoseRef.current = startPose;
  }, [startPose]);

  useEffect(() => {
    endPoseRef.current = endPose;
  }, [endPose]);

  // Initialize MediaPipe Pose and Camera.
  useEffect(() => {
    if (!videoRef.current) return;
    const pose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
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
      if (!results.poseLandmarks || !videoRef.current || !canvasRef.current)
        return;
      
      // Save the latest landmarks for pose capture.
      currentLandmarksRef.current = results.poseLandmarks;

      // Draw the constant overlay: video feed plus live pose landmarks.
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
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
          color: '#00FF00',
          lineWidth: 4,
        });
        drawLandmarks(ctx, results.poseLandmarks, {
          color: '#FF0000',
          lineWidth: 2,
        });
        ctx.restore();
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
  }, []);

  // Helper: countdown function that returns a Promise.
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
          // Wait a brief moment (e.g. 1 second) before resolving.
          setTimeout(() => {
            resolve();
          }, 1000);
        }
      }, 1000);
    });
  };

  // Unified function to capture movement:
  // First countdown delay, then save start pose, then second countdown, then save end pose.
  const saveMovement = async (delay: number) => {
    console.log("Button pressed, current landmarks:", currentLandmarksRef.current);
    if (!currentLandmarksRef.current || currentLandmarksRef.current.length === 0) {
      console.warn("No valid landmarks to save.");
      return;
    }
    setSavePoseButtonDisabled(true);

    // First countdown delay.
    await runCountdown(delay);
    setStartPose({ landmarks: currentLandmarksRef.current! });
    console.log("Start pose saved:", startPose);

    // Second countdown delay.
    await runCountdown(delay);
    setEndPose({ landmarks: currentLandmarksRef.current! });
    console.log("End pose saved:", endPose);

    setSavePoseButtonDisabled(false);
    setShowTimer(false);
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">New Movement</h1>
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded shadow hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
          onClick={() => alert("Results emailed to recipients successfully!")}
        >
          Send Results
        </button>
      </div>
      <div className="mb-4 space-x-4">
        <button
          onClick={() => saveMovement(3)}
          className="bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded"
          disabled={savePoseButtonDisabled}  // Only disable based on savePoseButtonDisabled
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
        {startPose ? "Start Pose Saved" : "No Start Pose Saved"}<br />
        {endPose ? "End Pose Saved" : "No End Pose Saved"}
      </div>
    </div>
  );
};

export default NewMovement;
