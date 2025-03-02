import React, { useRef, useEffect, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

export interface ResistanceTrackerProps {
  onRepCountChange?: (count: number) => void;
}

const ResistanceTracker: React.FC<ResistanceTrackerProps> = ({ onRepCountChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store the current rep count
  const [repCount, setRepCount] = useState<number>(0);
  const repCountRef = useRef<number>(0);

  // Each joint’s angle is smoothed separately
  const elbowAngleSmoothingRef = useRef<number | null>(null);
  const shoulderAngleSmoothingRef = useRef<number | null>(null);
  const alpha = 0.65; // smoothing factor

  // Phase of the push-up => "up" or "down"
  const [phase, setPhase] = useState<"up" | "down">("up");
  const phaseRef = useRef<"up" | "down">("up");

  // Update parent whenever repCount changes
  useEffect(() => {
    repCountRef.current = repCount;
    if (onRepCountChange) {
      onRepCountChange(repCount);
    }
  }, [repCount, onRepCountChange]);

  // Push-up landmarks
  // 11 = left shoulder, 13 = left elbow, 15 = left wrist
  // 12 = right shoulder, 14 = right elbow, 16 = right wrist
  const pushupJoints = {
    left: { shoulder: 11, elbow: 13, wrist: 15 },
    right: { shoulder: 12, elbow: 14, wrist: 16 },
  };

  // Angles for push-up
  const maxPushupAngle = 160; // Fully extended arms
  const minPushupAngle = 90;  // Elbows bent in push-up

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

      // If we have valid landmarks, compute angles and track push-up
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // Calculate left arm angle
        const leftAngle = calculateAngle(
          landmarks[pushupJoints.left.shoulder],
          landmarks[pushupJoints.left.elbow],
          landmarks[pushupJoints.left.wrist]
        );
        // Calculate right arm angle
        const rightAngle = calculateAngle(
          landmarks[pushupJoints.right.shoulder],
          landmarks[pushupJoints.right.elbow],
          landmarks[pushupJoints.right.wrist]
        );

        // Smooth angles
        if (elbowAngleSmoothingRef.current === null) {
          elbowAngleSmoothingRef.current = (leftAngle + rightAngle) / 2;
        } else {
          elbowAngleSmoothingRef.current =
            alpha * ((leftAngle + rightAngle) / 2) + (1 - alpha) * elbowAngleSmoothingRef.current;
        }

        const smoothedElbow = elbowAngleSmoothingRef.current;

        // Draw angle text
        canvasCtx.fillStyle = "white";
        canvasCtx.font = "20px Arial";
        canvasCtx.fillText(
          `Elbow Angle: ${Math.round(smoothedElbow)}`,
          10,
          60
        );

        // Check push-up phase
        if (phaseRef.current === "up" && smoothedElbow < minPushupAngle) {
          // Elbows bend => down phase
          phaseRef.current = "down";
          setPhase("down");
          console.log("Push-up: up -> down", smoothedElbow);
        } else if (phaseRef.current === "down" && smoothedElbow > maxPushupAngle) {
          // Elbows extend => up phase => increment rep
          phaseRef.current = "up";
          setPhase("up");
          console.log("Push-up: down -> up => +1 rep");
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
  // If the phase is "down", we say "Go Higher"; otherwise "Go Lower"
  const instruction = phase === "down" ? "Go Higher" : "Go Lower";

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="text-2xl font-semibold text-blue-700 mb-6">Resistance Count: {repCountRef.current}</div>
      <div className="text-2xl font-semibold text-red-700 mb-6">Advice: {instruction}</div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full" />
    </div>
  );
};

export default ResistanceTracker;
