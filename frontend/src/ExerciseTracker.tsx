// src/ExerciseTracker.tsx
import React, { useRef, useEffect, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// Define joint structures for both legs and arms.
interface SquatLungeJoints {
  left: { hip: number; knee: number; ankle: number };
  right: { hip: number; knee: number; ankle: number };
}

interface PushupJoints {
  left: { shoulder: number; elbow: number; wrist: number };
  right: { shoulder: number; elbow: number; wrist: number };
}

// Define discriminated union types for exercise rules.
interface SquatLungeRule {
  type: "squat" | "lunge";
  joints: SquatLungeJoints;
  minAngle: number;
  maxAngle: number;
}

interface PushupRule {
  type: "pushup";
  joints: PushupJoints;
  minAngle: number;
  maxAngle: number;
}

type ExerciseRule = SquatLungeRule | PushupRule;

const ExerciseTracker: React.FC = () => {
  // References for the hidden video element and canvas.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Refs for smoothing the angle values.
  const leftAngleSmoothingRef = useRef<number | null>(null);
  const rightAngleSmoothingRef = useRef<number | null>(null);
  // Smoothing factor (alpha); lower values produce more smoothing.
  const alpha = 0.65;

  // State for the selected exercise, rep count, and current phase.
  const [selectedExercise, setSelectedExercise] = useState<"squat" | "pushup" | "lunge">("squat");
  const [repCount, setRepCount] = useState<number>(0);
  const [phase, setPhase] = useState<"up" | "down">("up");
  // We'll still use a ref for immediate phase logic without causing re-renders.
  const phaseRef = useRef<"up" | "down">("up");

  // Define exercise rules using the proper landmark indexes.
  const exerciseRules: Record<"squat" | "pushup" | "lunge", ExerciseRule> = {
    squat: {
      type: "squat",
      joints: {
        left: { hip: 23, knee: 25, ankle: 27 },
        right: { hip: 24, knee: 26, ankle: 28 },
      },
      minAngle: 90,  // When both knees are sufficiently bent (down)
      maxAngle: 160, // When both legs are nearly straight (up)
    },
    pushup: {
      type: "pushup",
      joints: {
        left: { shoulder: 11, elbow: 13, wrist: 15 },
        right: { shoulder: 12, elbow: 14, wrist: 16 },
      },
      minAngle: 80,  // When both elbows are bent (down)
      maxAngle: 160, // When both arms are extended (up)
    },
    lunge: {
      type: "lunge",
      joints: {
        left: { hip: 23, knee: 25, ankle: 27 },
        right: { hip: 24, knee: 26, ankle: 28 },
      },
      minAngle: 90,
      maxAngle: 170,
    },
  };

  // Utility function to calculate the angle (in degrees) at point B given points A, B, and C.
  const calculateAngle = (A: any, B: any, C: any): number => {
    const radians =
      Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) {
      angle = 360 - angle;
    }
    return angle;
  };

  // Initialize the MediaPipe Pose instance only once.
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

      // Always redraw the video frame and landmarks.
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      }

      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        const rule = exerciseRules[selectedExercise];
        let leftAngle: number | null = null;
        let rightAngle: number | null = null;

        if (rule.type === "squat" || rule.type === "lunge") {
          leftAngle = calculateAngle(
            landmarks[rule.joints.left.hip],
            landmarks[rule.joints.left.knee],
            landmarks[rule.joints.left.ankle]
          );
          rightAngle = calculateAngle(
            landmarks[rule.joints.right.hip],
            landmarks[rule.joints.right.knee],
            landmarks[rule.joints.right.ankle]
          );
        } else if (rule.type === "pushup") {
          leftAngle = calculateAngle(
            landmarks[rule.joints.left.shoulder],
            landmarks[rule.joints.left.elbow],
            landmarks[rule.joints.left.wrist]
          );
          rightAngle = calculateAngle(
            landmarks[rule.joints.right.shoulder],
            landmarks[rule.joints.right.elbow],
            landmarks[rule.joints.right.wrist]
          );
        }

        // Apply smoothing (exponential moving average)
        if (leftAngle !== null) {
          if (leftAngleSmoothingRef.current === null) {
            leftAngleSmoothingRef.current = leftAngle;
          } else {
            leftAngleSmoothingRef.current = alpha * leftAngle + (1 - alpha) * leftAngleSmoothingRef.current;
          }
        }
        if (rightAngle !== null) {
          if (rightAngleSmoothingRef.current === null) {
            rightAngleSmoothingRef.current = rightAngle;
          } else {
            rightAngleSmoothingRef.current = alpha * rightAngle + (1 - alpha) * rightAngleSmoothingRef.current;
          }
        }

        const smoothedLeft = leftAngleSmoothingRef.current;
        const smoothedRight = rightAngleSmoothingRef.current;

        if (smoothedLeft !== null && smoothedRight !== null) {
          canvasCtx.fillStyle = "white";
          canvasCtx.font = "20px Arial";
          canvasCtx.fillText(`L: ${Math.round(smoothedLeft)} R: ${Math.round(smoothedRight)}`, 10, 60);

          // Phase transitions: update the phase if conditions are met and update state to print in the title.
          if (phaseRef.current === "up" && smoothedLeft < rule.minAngle && smoothedRight < rule.minAngle) {
            phaseRef.current = "down";
            setPhase("down");
            console.log("Transition: UP → DOWN  ", smoothedLeft, smoothedRight);
          }
          if (phaseRef.current === "down" && smoothedLeft > rule.maxAngle && smoothedRight > rule.maxAngle) {
            phaseRef.current = "up";
            setPhase("up");
            console.log("Transition: DOWN → UP, rep counted  ", smoothedLeft, smoothedRight);
            setRepCount((prev) => prev + 1);
          }
        }
      }

      // Draw rep count on the canvas.
      canvasCtx.fillStyle = "white";
      canvasCtx.font = "20px Arial";
      canvasCtx.fillText(`${selectedExercise} Count: ${repCount}`, 10, 30);
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
  }, [selectedExercise]); // Recreate Pose only when the exercise type changes

  // Compute the instruction based on the current phase.
  // If the phase is "up", print "go lower". If the phase is "down", print "go higher".
  const instruction = phase === "up" ? "go lower" : "go higher";

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>AI Physical Therapy Coach - {instruction}</h1>
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="exerciseSelect">Choose an exercise: </label>
        <select
          id="exerciseSelect"
          value={selectedExercise}
          onChange={(e) => {
            setSelectedExercise(e.target.value as "squat" | "pushup" | "lunge");
            setRepCount(0);
            // Reset both the ref and state to "up" when the exercise changes.
            phaseRef.current = "up";
            setPhase("up");
          }}
        >
          <option value="squat">Squat</option>
          <option value="pushup">Push-up</option>
          <option value="lunge">Lunge</option>
        </select>
      </div>
      <div style={{ fontSize: "35px", marginBottom: "10px" }}>
        {selectedExercise} Count: {repCount}
      </div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} style={{ border: '1px solid #ccc' }} />
    </div>
  );
};

export default ExerciseTracker;
