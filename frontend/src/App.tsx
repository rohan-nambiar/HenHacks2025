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
  
  // Use state for the selected exercise
  const [selectedExercise, setSelectedExercise] = useState<keyof typeof exerciseRules>("squat");

  // Define the exercise rules
  const exerciseRules = {
    squat: {
      joints: { hip: 24, knee: 26, ankle: 28 },
      minAngle: 90, // Below this means squatting
      maxAngle: 160, // Above this means standing up
    },
    pushup: {
      joints: { shoulder: 12, elbow: 14, wrist: 16 },
      minAngle: 90, // Below this means lowering down
      maxAngle: 160, // Above this means pushing up
    },
    lunge: {
      joints: { hip: 24, knee: 26, ankle: 28 },
      minAngle: 90, // Lowered lunge position
      maxAngle: 160, // Standing up
    },
  };

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
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: "red" });
    drawLandmarks(ctx, results.poseLandmarks, { color: "green", radius: 3 });

    const landmarks = results.poseLandmarks;

    // Get exercise-specific joint indices dynamically
    const exercise = exerciseRules[selectedExercise];
    if (!exercise) return;

    let jointA, jointB, jointC;

    if (selectedExercise === "squat" || selectedExercise === "lunge") {
      // Assert that joints exist for squat/lunge
      const joints = exercise.joints as { hip: number; knee: number; ankle: number; };
      jointA = landmarks[joints.hip];
      jointB = landmarks[joints.knee];
      jointC = landmarks[joints.ankle];
    } else if (selectedExercise === "pushup") {
      // Assert that joints exist for pushup
      const joints = exercise.joints as { shoulder: number; elbow: number; wrist: number; };
      jointA = landmarks[joints.shoulder];
      jointB = landmarks[joints.elbow];
      jointC = landmarks[joints.wrist];
    } else {
      return; // Unknown exercise, do nothing
    }

    if (!jointA || !jointB || !jointC) return; // Prevent crashes

    // Calculate joint angle
    const angle = calculateAngle(jointA, jointB, jointC);
    console.log(`${selectedExercise} angle:`, angle);

    // Track movement for the selected exercise
    if (angle < exercise.minAngle && !isSquattingRef.current) {
      isSquattingRef.current = true;
    } else if (angle > exercise.maxAngle && isSquattingRef.current) {
      isSquattingRef.current = false;
      squatCountRef.current += 1;
      console.log(`${selectedExercise} Count:`, squatCountRef.current);
    }

    // Display exercise count
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText(`${selectedExercise} Count: ${squatCountRef.current}`, 50, 50);
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

    // Ensure video is fully loaded before starting detection
    if (video.readyState < 2) {
      console.warn("Video not ready yet. Waiting...");
      setTimeout(() => {
        if (video.readyState >= 2) detectPose();
      }, 500);
      return;
    }

    detectPose();
  }, [pose]);

  return (
    <div style={{ textAlign: "center" }}>
      <h1>AI Physical Therapy Coach</h1>
      
      <label htmlFor="exerciseSelect">Choose an exercise:</label>
      <select
        id="exerciseSelect"
        value={selectedExercise}
        onChange={(e) => {
          setSelectedExercise(e.target.value as keyof typeof exerciseRules);
          squatCountRef.current = 0; // Reset count when switching exercises
        }}
      >
        <option value="squat">Squat</option>
        <option value="pushup">Push-up</option>
        <option value="lunge">Lunge</option>
      </select>

      <div style={{ position: "relative", width: 640, height: 480 }}>
        <Webcam ref={webcamRef} style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }} />
        <canvas ref={canvasRef} width={640} height={480} style={{ position: "absolute", left: 0, top: 0, zIndex: 2 }} />
      </div>
    </div>
  );
};

export default App;
