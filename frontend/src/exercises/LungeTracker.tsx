import React, { useRef, useEffect, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

export interface LungeTrackerProps {
  onRepCountChange?: (count: number) => void;
}

const LungeTracker: React.FC<LungeTrackerProps> = ({ onRepCountChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store the current rep count
  const [repCount, setRepCount] = useState<number>(0);
  const repCountRef = useRef<number>(0);

  // Each leg’s angle is smoothed separately
  const leftAngleSmoothingRef = useRef<number | null>(null);
  const rightAngleSmoothingRef = useRef<number | null>(null);
  const alpha = 0.65; // smoothing factor

  // Each leg has its own “phase” => "up" or "down"
  const [leftPhase, setLeftPhase] = useState<"up" | "down">("up");
  const [rightPhase, setRightPhase] = useState<"up" | "down">("up");
  const leftPhaseRef = useRef<"up" | "down">("up");
  const rightPhaseRef = useRef<"up" | "down">("up");

  // Update parent whenever repCount changes
  useEffect(() => {
    repCountRef.current = repCount;
    if (onRepCountChange) {
      onRepCountChange(repCount);
    }
  }, [repCount, onRepCountChange]);

  // Lunge landmarks
  // 23 = left hip, 25 = left knee, 27 = left ankle
  // 24 = right hip, 26 = right knee, 28 = right ankle
  const lungeJoints = {
    left: { hip: 23, knee: 25, ankle: 27 },
    right: { hip: 24, knee: 26, ankle: 28 },
  };

  // Angles below this => “down” phase
  const minAngle = 90;
  // Angles above this => “up” phase
  const maxAngle = 170;

  const calculateAngle = (A: any, B: any, C: any): number => {
    const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // Initialize Pose once
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
      if (!canvasRef.current || !videoRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      // Draw video
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw pose landmarks
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 4,
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      }

      // If we have valid landmarks, compute angles and track each leg
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // Calculate left leg angle
        const leftAngle = calculateAngle(
          landmarks[lungeJoints.left.hip],
          landmarks[lungeJoints.left.knee],
          landmarks[lungeJoints.left.ankle]
        );
        // Calculate right leg angle
        const rightAngle = calculateAngle(
          landmarks[lungeJoints.right.hip],
          landmarks[lungeJoints.right.knee],
          landmarks[lungeJoints.right.ankle]
        );

        // Smooth angles
        if (leftAngleSmoothingRef.current === null) {
          leftAngleSmoothingRef.current = leftAngle;
        } else {
          leftAngleSmoothingRef.current =
            alpha * leftAngle + (1 - alpha) * leftAngleSmoothingRef.current;
        }
        if (rightAngleSmoothingRef.current === null) {
          rightAngleSmoothingRef.current = rightAngle;
        } else {
          rightAngleSmoothingRef.current =
            alpha * rightAngle + (1 - alpha) * rightAngleSmoothingRef.current;
        }

        const smoothedLeft = leftAngleSmoothingRef.current;
        const smoothedRight = rightAngleSmoothingRef.current;

        // Draw angle text
        canvasCtx.fillStyle = "white";
        canvasCtx.font = "20px Arial";
        canvasCtx.fillText(
          `Left Angle: ${Math.round(smoothedLeft)}, Right Angle: ${Math.round(smoothedRight)}`,
          10,
          60
        );

        // Check left leg
        if (leftPhaseRef.current === "up" && smoothedLeft < minAngle) {
          // Left leg goes down
          leftPhaseRef.current = "down";
          setLeftPhase("down");
          console.log("Left leg: up -> down", smoothedLeft);
        } else if (leftPhaseRef.current === "down" && smoothedLeft > maxAngle) {
          // Left leg comes up => increment rep
          leftPhaseRef.current = "up";
          setLeftPhase("up");
          console.log("Left leg: down -> up => +1 rep");
          setRepCount((prev) => prev + 1);
        }

        // Check right leg
        if (rightPhaseRef.current === "up" && smoothedRight < minAngle) {
          // Right leg goes down
          rightPhaseRef.current = "down";
          setRightPhase("down");
          console.log("Right leg: up -> down", smoothedRight);
        } else if (rightPhaseRef.current === "down" && smoothedRight > maxAngle) {
          // Right leg comes up => increment rep
          rightPhaseRef.current = "up";
          setRightPhase("up");
          console.log("Right leg: down -> up => +1 rep");
          setRepCount((prev) => prev + 1);
        }
      }

      canvasCtx.restore();
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
  }, []); // Empty array => run once

  // Provide a simple “advice” message for the user
  // If either leg is down, we say "Go Higher"; otherwise "Go Lower"
  const eitherLegDown = leftPhase === "down" || rightPhase === "down";
  const instruction = eitherLegDown ? "Go Higher" : "Go Lower";

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="text-2xl font-semibold text-blue-700 mb-6">Lunge Count: {repCountRef.current}</div>
      <div className="text-2xl font-semibold text-red-700 mb-6">Advice: {instruction}</div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full" />
    </div>
  );
};

export default LungeTracker;
