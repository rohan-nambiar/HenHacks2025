import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";
import { Pose, POSE_CONNECTIONS, Results } from "@mediapipe/pose";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

const App: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pose, setPose] = useState<Pose | null>(null);

  useEffect(() => {
    const loadPoseModel = async () => {
      const poseInstance = new Pose({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
      });

      poseInstance.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      poseInstance.onResults(onPoseDetected);
      setPose(poseInstance);
    };

    loadPoseModel();
  }, []);

  const onPoseDetected = (results: Results) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx || !results.poseLandmarks) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw pose connections and landmarks
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "red" });
    drawLandmarks(ctx, results.poseLandmarks, { color: "green", radius: 3 });
  };

  useEffect(() => {
    if (!pose || !webcamRef.current || !webcamRef.current.video) return;
    const video = webcamRef.current.video;

    const detectPose = async () => {
      try {
        await pose.send({ image: video });
        requestAnimationFrame(detectPose);
      } catch (error) {
        console.error("Pose detection error:", error);
      }
    };

    // ✅ Ensure video is fully loaded before starting detection
    if (video.readyState < 2) {
      console.warn("Video not ready yet. Waiting...");
      setTimeout(() => {
        if (video.readyState >= 2) detectPose(); // Now detectPose() is properly defined before being called
      }, 500);
      return;
    }

    detectPose();
  }, [pose]);

  return (
    <div style={{ textAlign: "center" }}>
      <h1>AI Physical Therapy Coach</h1>
      <div style={{ position: "relative", width: 640, height: 480 }}>
        <Webcam ref={webcamRef} style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }} />
        <canvas ref={canvasRef} width={640} height={480} style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }} />
      </div>
    </div>
  );
};

export default App;
