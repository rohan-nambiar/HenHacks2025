import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";
import { Pose, POSE_CONNECTIONS, Results } from "@mediapipe/pose";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

const App: React.FC = () => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pose, setPose] = useState<Pose | null>(null);
  const isSquattingRef = useRef(false);
  const squatCountRef = useRef(0);


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

  const calculateAngle = (A: any, B: any, C: any) => {
    const radians = Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) {
      angle = 360 - angle;
    }
    return angle;
  };

  



  const onPoseDetected = (results: Results) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx || !results.poseLandmarks) return;

    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw pose connections and landmarks
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "red" });
    drawLandmarks(ctx, results.poseLandmarks, { color: "green", radius: 3 });

    // Get key joints for squats
    const landmarks = results.poseLandmarks;
    const hip = landmarks[24]; // Right hip
    const knee = landmarks[26]; // Right knee
    const ankle = landmarks[28]; // Right ankle

    // Calculate knee angle
    const kneeAngle = calculateAngle(hip, knee, ankle);
    console.log("Knee angle:", kneeAngle);

    // Detect squat movement using useRef instead of state
    if (kneeAngle < 90 && !isSquattingRef.current) {
      isSquattingRef.current = true;
    } else if (kneeAngle > 160 && isSquattingRef.current) {
      isSquattingRef.current = false;
      squatCountRef.current += 1;
      console.log("Squat Count:", squatCountRef.current);
    }

    // Show squat count on screen
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText(`Squats: ${squatCountRef.current}`, 50, 50);
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
