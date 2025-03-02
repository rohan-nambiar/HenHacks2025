import React, { useRef, useEffect, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

export interface BalanceTrackerProps {
  onBalanceChange?: (isBalanced: boolean) => void;
}

const BalanceTracker: React.FC<BalanceTrackerProps> = ({ onBalanceChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for the balance status
  const [isBalanced, setIsBalanced] = useState<boolean>(true);

  // Each leg’s angle is smoothed separately
  const leftAngleSmoothingRef = useRef<number | null>(null);
  const rightAngleSmoothingRef = useRef<number | null>(null);
  const alpha = 0.65; // smoothing factor

  // Balance thresholds
  const balanceThreshold = 5; // Degrees from vertical where balance is lost

  // Update parent whenever balance state changes
  useEffect(() => {
    if (onBalanceChange) {
      onBalanceChange(isBalanced);
    }
  }, [isBalanced, onBalanceChange]);

  // Balance landmarks
  // 23 = left hip, 25 = left knee, 27 = left ankle
  // 24 = right hip, 26 = right knee, 28 = right ankle
  const balanceJoints = {
    left: { hip: 23, knee: 25, ankle: 27 },
    right: { hip: 24, knee: 26, ankle: 28 },
  };

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

      // If we have valid landmarks, compute angles for each leg
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;

        // Calculate left leg angle
        const leftAngle = calculateAngle(
          landmarks[balanceJoints.left.hip],
          landmarks[balanceJoints.left.knee],
          landmarks[balanceJoints.left.ankle]
        );
        // Calculate right leg angle
        const rightAngle = calculateAngle(
          landmarks[balanceJoints.right.hip],
          landmarks[balanceJoints.right.knee],
          landmarks[balanceJoints.right.ankle]
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

        // Determine balance state based on angles
        if (
          Math.abs(smoothedLeft - 180) > balanceThreshold ||
          Math.abs(smoothedRight - 180) > balanceThreshold
        ) {
          // Balance lost if either leg is too tilted
          setIsBalanced(false);
        } else {
          // Balance is maintained
          setIsBalanced(true);
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

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="text-2xl font-semibold text-blue-700 mb-6">
        {isBalanced ? "Balanced" : "Not Balanced"}
      </div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full" />
    </div>
  );
};

export default BalanceTracker;
