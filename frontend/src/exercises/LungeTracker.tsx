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

  const leftAngleSmoothingRef = useRef<number | null>(null);
  const rightAngleSmoothingRef = useRef<number | null>(null);
  const alpha = 0.65;

  const [repCount, setRepCount] = useState<number>(0);
  const repCountRef = useRef<number>(0);
  const [phase, setPhase] = useState<"up" | "down">("up");
  const phaseRef = useRef<"up" | "down">("up");

  useEffect(() => {
    repCountRef.current = repCount;
    if (onRepCountChange) onRepCountChange(repCount);
  }, [repCount, onRepCountChange]);

  // Lunge joints (using the same indexes as squats in this example).
  const lungeJoints = {
    left: { hip: 23, knee: 25, ankle: 27 },
    right: { hip: 24, knee: 26, ankle: 28 },
  };

  const minAngle = 90;
  const maxAngle = 170; // Slightly different maximum angle for lunges.

  const calculateAngle = (A: any, B: any, C: any): number => {
    const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

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
      if (!canvasRef.current || !videoRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      }
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        const leftAngle = calculateAngle(
          landmarks[lungeJoints.left.hip],
          landmarks[lungeJoints.left.knee],
          landmarks[lungeJoints.left.ankle]
        );
        const rightAngle = calculateAngle(
          landmarks[lungeJoints.right.hip],
          landmarks[lungeJoints.right.knee],
          landmarks[lungeJoints.right.ankle]
        );
        if (leftAngleSmoothingRef.current === null) {
          leftAngleSmoothingRef.current = leftAngle;
        } else {
          leftAngleSmoothingRef.current = alpha * leftAngle + (1 - alpha) * leftAngleSmoothingRef.current;
        }
        if (rightAngleSmoothingRef.current === null) {
          rightAngleSmoothingRef.current = rightAngle;
        } else {
          rightAngleSmoothingRef.current = alpha * rightAngle + (1 - alpha) * rightAngleSmoothingRef.current;
        }
        const smoothedLeft = leftAngleSmoothingRef.current;
        const smoothedRight = rightAngleSmoothingRef.current;
        canvasCtx.fillStyle = "white";
        canvasCtx.font = "20px Arial";
        canvasCtx.fillText(`L: ${Math.round(smoothedLeft)} R: ${Math.round(smoothedRight)}`, 10, 60);

        if (phaseRef.current === "up" && smoothedLeft < minAngle && smoothedRight < minAngle) {
          phaseRef.current = "down";
          setPhase("down");
          console.log("Lunge: UP → DOWN", smoothedLeft, smoothedRight);
        }
        if (phaseRef.current === "down" && smoothedLeft > maxAngle && smoothedRight > maxAngle) {
          phaseRef.current = "up";
          setPhase("up");
          console.log("Lunge: DOWN → UP, rep counted", smoothedLeft, smoothedRight);
          setRepCount(prev => prev + 1);
        }
      }
      canvasCtx.fillStyle = "white";
      canvasCtx.font = "20px Arial";
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
  }, []); // Run only once

  const instruction = phase === "up" ? "Go Lower" : "Go Higher";

  return (
    <div style={{ textAlign: 'center', paddingLeft: '35px' }}>
      <div className="text-2xl font-semibold text-blue-700 mb-6">Lunge Count: {repCountRef.current}</div>
      <div className="text-2xl font-semibold text-red-700 mb-6">Advice: {instruction}</div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full" />
    </div>
  );
};

export default LungeTracker;
