import React, { useRef, useState, useEffect } from 'react';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// Helper function to calculate an angle between three landmarks (vertex at B).
const calculateAngle = (A: any, B: any, C: any): number => {
  const radians =
    Math.atan2(C.y - B.y, C.x - B.x) - Math.atan2(A.y - B.y, A.x - B.x);
  let angle = Math.abs(radians * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
};

// Define joints for scoring using landmark indexes.
const angleJoints: { [key: string]: [number, number, number] } = {
  rightElbow: [16, 14, 12],
  rightShoulder: [14, 12, 24],
  leftShoulder: [23, 11, 13],
  leftElbow: [11, 13, 15],
  rightHip: [12, 24, 26],
  rightKnee: [24, 26, 28],
  leftHip: [11, 23, 25],
  leftKnee: [23, 25, 27]
};

// Helper to compute Euclidean distance.
const distance = (a: any, b: any): number => {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
};

// Transform saved landmarks so that the saved left/right shoulders (indexes 11 & 12)
// align with the current frame's shoulders.
const transformLandmarks = (
  savedLandmarks: any[],
  savedLeft: any,
  savedRight: any,
  currentLeft: any,
  currentRight: any
) => {
  const savedMid = {
    x: (savedLeft.x + savedRight.x) / 2,
    y: (savedLeft.y + savedRight.y) / 2,
  };
  const currentMid = {
    x: (currentLeft.x + currentRight.x) / 2,
    y: (currentLeft.y + currentRight.y) / 2,
  };

  const savedShoulderDist = distance(savedLeft, savedRight);
  const currentShoulderDist = distance(currentLeft, currentRight);
  const scale = currentShoulderDist / savedShoulderDist;

  const savedAngle = Math.atan2(savedRight.y - savedLeft.y, savedRight.x - savedLeft.x);
  const currentAngle = Math.atan2(currentRight.y - currentLeft.y, currentRight.x - currentLeft.x);
  const rotation = currentAngle - savedAngle;

  return savedLandmarks.map((landmark) => {
    const dx = landmark.x - savedMid.x;
    const dy = landmark.y - savedMid.y;
    const rotatedX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
    const rotatedY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
    return {
      ...landmark,
      x: rotatedX * scale + currentMid.x,
      y: rotatedY * scale + currentMid.y,
    };
  });
};

const YogaPoseMatcher: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for saved reference pose.
  const [referenceAngles, setReferenceAngles] = useState<{ [key: string]: number } | null>(null);
  const [referenceLandmarks, setReferenceLandmarks] = useState<any[] | null>(null);

  // Live pose state.
  const [matchScore, setMatchScore] = useState<number>(0);
  const [currentAngles, setCurrentAngles] = useState<{ [key: string]: number }>({});
  const [currentLandmarks, setCurrentLandmarks] = useState<any[] | null>(null);

  // Refs to hold the latest values.
  const referenceAnglesRef = useRef<{ [key: string]: number } | null>(null);
  const referenceLandmarksRef = useRef<any[] | null>(null);
  const currentLandmarksRef = useRef<any[] | null>(null);
  useEffect(() => {
    referenceAnglesRef.current = referenceAngles;
    referenceLandmarksRef.current = referenceLandmarks;
  }, [referenceAngles, referenceLandmarks]);
  useEffect(() => {
    currentLandmarksRef.current = currentLandmarks;
  }, [currentLandmarks]);

  // Initialize Pose and camera once.
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
      if (!canvasRef.current || !videoRef.current || !results.poseLandmarks) return;
      const canvasCtx = canvasRef.current.getContext('2d');
      if (!canvasCtx) return;

      canvasCtx.save();
      // Draw the video frame.
      canvasCtx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      canvasCtx.drawImage(results.image, 0, 0, canvasRef.current.width, canvasRef.current.height);

      // Draw live pose.
      drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
      drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#FF0000', lineWidth: 2 });

      // Update live landmarks and angles.
      setCurrentLandmarks(results.poseLandmarks);
      const angles: { [key: string]: number } = {};
      Object.entries(angleJoints).forEach(([jointName, [iA, iB, iC]]) => {
        if (results.poseLandmarks[iA] && results.poseLandmarks[iB] && results.poseLandmarks[iC]) {
          angles[jointName] = calculateAngle(
            results.poseLandmarks[iA],
            results.poseLandmarks[iB],
            results.poseLandmarks[iC]
          );
        }
      });
      setCurrentAngles(angles);

      // Display match score if reference exists.
      if (referenceAnglesRef.current) {
        let totalScore = 0;
        let count = 0;
        Object.keys(angleJoints).forEach((jointName) => {
          if (angles[jointName] !== undefined && referenceAnglesRef.current![jointName] !== undefined) {
            const diff = Math.abs(angles[jointName] - referenceAnglesRef.current![jointName]);
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
        canvasCtx.fillText("No reference pose saved", 10, 30);
      }

      // Overlay the saved reference pose transformed to match current shoulders.
      if (referenceLandmarksRef.current) {
        // Assuming left shoulder = index 11, right shoulder = index 12.
        const savedLeft = referenceLandmarksRef.current[11];
        const savedRight = referenceLandmarksRef.current[12];
        const currentLeft = results.poseLandmarks[11];
        const currentRight = results.poseLandmarks[12];
        if (savedLeft && savedRight && currentLeft && currentRight) {
          const transformedReference = transformLandmarks(
            referenceLandmarksRef.current,
            savedLeft,
            savedRight,
            currentLeft,
            currentRight
          );
          drawConnectors(canvasCtx, transformedReference, POSE_CONNECTIONS, { color: '#0000FF', lineWidth: 2 });
          drawLandmarks(canvasCtx, transformedReference, { color: '#0000FF', lineWidth: 1 });
          canvasCtx.fillStyle = "#0000FF";
          canvasCtx.font = "20px Arial";
          canvasCtx.fillText("Reference Pose Overlay", 10, 60);
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
  }, []); // Run once.

  // Save the current pose as reference.
  const savePose = () => {
    if (currentLandmarksRef.current && currentLandmarksRef.current.length > 0) {
      console.log("Saving current pose as reference.");
      setReferenceLandmarks([...currentLandmarksRef.current]);
      setReferenceAngles({ ...currentAngles });
      // Also update refs.
      referenceLandmarksRef.current = [...currentLandmarksRef.current];
      referenceAnglesRef.current = { ...currentAngles };
    } else {
      console.warn("No valid landmarks to save.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-8 my-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Yoga Pose Matcher</h1>
      <div className="mb-4">
        <button 
          onClick={savePose} 
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
          disabled={!currentLandmarksRef.current || currentLandmarksRef.current.length === 0}
        >
          Save Current Pose as Reference
        </button>
      </div>
      <div className="mb-4 text-xl text-gray-700">
        {referenceLandmarks ? "Reference Pose Saved" : "No Reference Pose Saved"}
      </div>
      <div className="mb-4 text-xl text-gray-700">
        Current Match Score: {matchScore}%
      </div>
      <div className="border border-gray-300 rounded-lg overflow-hidden">
        <video ref={videoRef} className="hidden" />
        <canvas ref={canvasRef} width={640} height={480} className="w-full" />
      </div>
    </div>
  );
};

export default YogaPoseMatcher;
