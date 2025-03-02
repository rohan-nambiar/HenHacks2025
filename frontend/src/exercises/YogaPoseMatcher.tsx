// src/exercises/YogaPoseMatcher.tsx
import React, { useRef, useState, useEffect } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// Helper function to calculate an angle given three landmarks
const calculateAngle = (A: any, B: any, C: any): number => {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs(radians * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
};

// Define the joints and their respective landmark indexes.
// The middle point of the three landmarks is used to compute the angle.
const angleJoints: { [key: string]: [number, number, number] } = {
  rightElbow: [16, 14, 12],      // right wrist, right elbow, right shoulder
  rightShoulder: [14, 12, 24],   // right elbow, right shoulder, right hip
  leftShoulder: [23, 11, 13],    // left hip, left shoulder, left elbow
  leftElbow: [11, 13, 15],       // left shoulder, left elbow, left wrist
  rightHip: [12, 24, 26],        // right shoulder, right hip, right knee
  rightKnee: [24, 26, 28],       // right hip, right knee, right ankle
  leftHip: [11, 23, 25],         // left shoulder, left hip, left knee
  leftKnee: [23, 25, 27]         // left hip, left knee, left ankle
};

const YogaPoseMatcher: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Store the reference pose angles after the user "saves" a pose.
  const [referenceAngles, setReferenceAngles] = useState<{ [key: string]: number } | null>(null);
  // Store the live match score (0-100%).
  const [matchScore, setMatchScore] = useState<number>(0);
  // For debugging or display, store the live calculated angles.
  const [currentAngles, setCurrentAngles] = useState<{ [key: string]: number }>({});

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
      
      canvasCtx.save();
      // Clear canvas and draw the current frame.
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // Draw landmarks and connectors for visual feedback.
      if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });
      }
      
      if (results.poseLandmarks) {
        const landmarks = results.poseLandmarks;
        // Calculate the angles for each target joint.
        const angles: { [key: string]: number } = {};
        Object.entries(angleJoints).forEach(([jointName, [iA, iB, iC]]) => {
          if (landmarks[iA] && landmarks[iB] && landmarks[iC]) {
            angles[jointName] = calculateAngle(landmarks[iA], landmarks[iB], landmarks[iC]);
          }
        });
        setCurrentAngles(angles);

        // If a reference pose has been saved, compute the match score.
        if (referenceAngles) {
          let totalScore = 0;
          let count = 0;
          Object.keys(angleJoints).forEach((jointName) => {
            if (angles[jointName] !== undefined && referenceAngles[jointName] !== undefined) {
              const diff = Math.abs(angles[jointName] - referenceAngles[jointName]);
              // Use a tolerance of 30° for full score (0° difference = 100%, >=30° = 0%).
              const jointScore = Math.max(0, (1 - diff / 30)) * 100;
              totalScore += jointScore;
              count++;
            }
          });
          const averageScore = count > 0 ? totalScore / count : 0;
          setMatchScore(Math.round(averageScore));
          canvasCtx.fillStyle = "white";
          canvasCtx.font = "20px Arial";
          canvasCtx.fillText(`Match Score: ${Math.round(averageScore)}%`, 10, 30);
        } else {
          canvasCtx.fillStyle = "white";
          canvasCtx.font = "20px Arial";
          canvasCtx.fillText(`No reference pose saved`, 10, 30);
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
  }, [referenceAngles]);

  // Handler to save the current live pose as the reference.
  const savePose = () => {
    if (Object.keys(currentAngles).length > 0) {
      setReferenceAngles({ ...currentAngles });
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h1>Yoga Pose Matcher</h1>
      <div style={{ marginBottom: '10px' }}>
        <button onClick={savePose}>Save Current Pose as Reference</button>
      </div>
      <div style={{ marginBottom: '10px', fontSize: '20px' }}>
        {referenceAngles ? "Reference Pose Saved" : "No Reference Pose Saved"}
      </div>
      <div style={{ marginBottom: '10px', fontSize: '20px' }}>
        Current Match Score: {matchScore}%
      </div>
      <video ref={videoRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} width={640} height={480} style={{ border: '1px solid #ccc' }} />
    </div>
  );
};

export default YogaPoseMatcher;
