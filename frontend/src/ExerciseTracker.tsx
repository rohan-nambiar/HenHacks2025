// src/ExerciseTracker.tsx
import React, { useRef, useEffect } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const ExerciseTracker: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    // Initialize MediaPipe Pose
    const pose = new Pose({
      // Load files from the CDN (or adjust if self-hosting)
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

    // Callback to handle results from MediaPipe Pose
    pose.onResults((results: Results) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      // Clear and draw the current frame
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw pose connections and landmarks
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      }
      canvasCtx.restore();
    });

    // Set up the camera using MediaPipe’s Camera utility
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await pose.send({ image: videoRef.current });
      },
      width: 640,
      height: 480,
    });
    camera.start();

    // Cleanup on component unmount
    return () => {
      camera.stop();
    };
  }, []);

  return (
    <div>
      {/* Hidden video element used for capturing the webcam stream */}
      <video ref={videoRef} style={{ display: 'none' }} />
      {/* Canvas where the processed results are rendered */}
      <canvas ref={canvasRef} width={640} height={480} />
    </div>
  );
};

export default ExerciseTracker;
