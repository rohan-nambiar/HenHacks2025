// src/ExerciseTracker.tsx
import React, { useRef, useEffect, useState } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const ExerciseTracker: React.FC = () => {
  // References for the hidden video element and canvas.
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for the selected exercise and rep count.
  const [selectedExercise, setSelectedExercise] = useState<"squat" | "pushup" | "lunge">("squat");
  const [repCount, setRepCount] = useState<number>(0);
  // This ref tracks whether the exercise is currently in the “down” phase.
  const inMotionRef = useRef<boolean>(false);

  /* 
    Define exercise rules using MediaPipe’s official landmark indexes.
    For example (from the documentation at:
    https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md):
      - Squat: right hip (24), right knee (26), right ankle (28)
      - Push-up: right shoulder (12), right elbow (14), right wrist (16)
      - Lunge: similar to squat (you may choose different legs or adjust thresholds)
    
    Adjust minAngle and maxAngle values based on your testing for more accurate tracking.
  */
  const exerciseRules = {
    squat: {
      joints: { hip: 24, knee: 26, ankle: 28 },
      minAngle: 90,   // When the knee is bent enough (down phase)
      maxAngle: 160,  // When the leg is nearly straight (up phase)
    },
    pushup: {
      joints: { shoulder: 12, elbow: 14, wrist: 16 },
      minAngle: 80,   // When elbows are bent (down phase)
      maxAngle: 160,  // When arms are extended (up phase)
    },
    lunge: {
      joints: { hip: 24, knee: 26, ankle: 28 },
      minAngle: 90,   // Lower lunge position
      maxAngle: 170,  // Standing position
    },
  };

  // Utility function to calculate the angle at point B given three points A, B, and C.
  const calculateAngle = (A: any, B: any, C: any): number => {
    const radians =
      Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
    let angle = Math.abs(radians * (180 / Math.PI));
    if (angle > 180) {
      angle = 360 - angle;
    }
    return angle;
  };

  useEffect(() => {
    if (!videoRef.current) return;

    // Initialize MediaPipe Pose.
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

    // Process the pose detection results.
    pose.onResults((results: Results) => {
      if (!canvasRef.current || !videoRef.current) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      // Clear and draw the video frame.
      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw pose connections and landmarks.
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      }

      // If pose landmarks are available, perform exercise detection.
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        let jointA, jointB, jointC;
        const rule = exerciseRules[selectedExercise];

        if (selectedExercise === "squat" || selectedExercise === "lunge") {
          // For squats and lunges, use hip, knee, and ankle.
          jointA = landmarks[rule.joints.hip];
          jointB = landmarks[rule.joints.knee];
          jointC = landmarks[rule.joints.ankle];
        } else if (selectedExercise === "pushup") {
          // For push-ups, use shoulder, elbow, and wrist.
          jointA = landmarks[rule.joints.shoulder];
          jointB = landmarks[rule.joints.elbow];
          jointC = landmarks[rule.joints.wrist];
        }

        if (jointA && jointB && jointC) {
          const angle = calculateAngle(jointA, jointB, jointC);
          // Display the current angle on the canvas.
          canvasCtx.fillStyle = "white";
          canvasCtx.font = "20px Arial";
          canvasCtx.fillText(`Angle: ${Math.round(angle)}`, 10, 60);

          // Detect a completed rep: a downward movement (angle < minAngle) followed by an upward movement (angle > maxAngle).
          if (angle < rule.minAngle && !inMotionRef.current) {
            inMotionRef.current = true;
          } else if (angle > rule.maxAngle && inMotionRef.current) {
            inMotionRef.current = false;
            setRepCount((prev) => prev + 1);
          }
        }
      }

      // Display the rep count.
      canvasCtx.fillStyle = "white";
      canvasCtx.font = "20px Arial";
      canvasCtx.fillText(`${selectedExercise} Count: ${repCount}`, 10, 30);
      canvasCtx.restore();
    });

    // Set up the camera using MediaPipe's Camera utility.
    const camera = new cam.Camera(videoRef.current, {
      onFrame: async () => {
        if (videoRef.current) await pose.send({ image: videoRef.current });
      },
      width: 640,
      height: 480,
    });
    camera.start();

    // Cleanup on component unmount.
    return () => {
      camera.stop();
    };
  }, [selectedExercise, repCount]);

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>AI Physical Therapy Coach</h1>
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="exerciseSelect">Choose an exercise: </label>
        <select
          id="exerciseSelect"
          value={selectedExercise}
          onChange={(e) => {
            setSelectedExercise(e.target.value as "squat" | "pushup" | "lunge");
            setRepCount(0); // Reset the rep count when switching exercises.
            inMotionRef.current = false;
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
      {/* The video element is hidden since it is used only as the image source for processing. */}
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} style={{ border: '1px solid #ccc' }} />
    </div>
  );
};

export default ExerciseTracker;
