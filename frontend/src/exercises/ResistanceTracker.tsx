import React, { useRef, useEffect, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import modelData from '../data/BlazePoseModel.json';


export interface PushupTrackerProps {
  onRepCountChange?: (count: number) => void;
}

const PushupTracker: React.FC<PushupTrackerProps> = ({ onRepCountChange }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const leftAngleSmoothingRef = useRef<number | null>(null);
  const rightAngleSmoothingRef = useRef<number | null>(null);
  const alpha = 0.65;

  const [repCount, setRepCount] = useState<number>(0);
  const repCountRef = useRef<number>(0);
  const [phase, setPhase] = useState<"up" | "down">("up");
  const phaseRef = useRef<"up" | "down">("up");

  // Update the repCountRef and notify parent when repCount changes.
  useEffect(() => {
    repCountRef.current = repCount;
    if (onRepCountChange) {
      onRepCountChange(repCount);
    }
  }, [repCount, onRepCountChange]);

  const minAngle = 80;
  const maxAngle = 160;

  const calculateAngle = (A: any, B: any, C: any): number => {
    const radians =
      Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // Initialize MediaPipe Pose and camera only once.
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
          landmarks[modelData.leftWrist.index],
          landmarks[modelData.leftElbow.index],
          landmarks[modelData.left_hip.index]
        );
        const rightAngle = calculateAngle(
          landmarks[modelData.rightWrist.index],
          landmarks[modelData.rightElbow.index],
          landmarks[modelData.right_hip.index]
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
          console.log("Lateral Raise: UP → DOWN", smoothedLeft, smoothedRight);
        }
        if (phaseRef.current === "down" && smoothedLeft > maxAngle && smoothedRight > maxAngle) {
          phaseRef.current = "up";
          setPhase("up");
          console.log("Lateral Raise: DOWN → UP, rep counted", smoothedLeft, smoothedRight);
          setRepCount((prev) => prev + 1);
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
  }, []); // Empty dependency array

  const instruction = phase === "up" ? "Go Lower" : "Go Higher";

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <div className="text-2xl font-semibold text-blue-700 mb-6">Push-up Count: {repCountRef.current}</div>
      <div className="text-2xl font-semibold text-red-700 mb-6">Advice: {instruction}</div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} className="w-full" />
    </div>
  );
};

export default PushupTracker;
