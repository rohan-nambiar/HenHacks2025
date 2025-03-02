import React from "react";

interface UserStats {
  id: number;
  name: string;
  yogaSessions: number;
  exerciseHours: number;
  avgPoseHoldTime: number; // Average time (in seconds) holding a pose correctly
}

const leaderboardData: UserStats[] = [
  { id: 1, name: "Alice", yogaSessions: 20, exerciseHours: 15, avgPoseHoldTime: 45 },
  { id: 2, name: "Bob", yogaSessions: 18, exerciseHours: 12, avgPoseHoldTime: 40 },
  { id: 3, name: "Charlie", yogaSessions: 22, exerciseHours: 17, avgPoseHoldTime: 50 },
  { id: 4, name: "David", yogaSessions: 16, exerciseHours: 10, avgPoseHoldTime: 38 },
  { id: 5, name: "Emma", yogaSessions: 25, exerciseHours: 20, avgPoseHoldTime: 40 },
  { id: 6, name: "Jason", yogaSessions: 19, exerciseHours: 18, avgPoseHoldTime: 42 } // Your entry
];

const Leaderboard: React.FC = () => {
  return (
    <div className="p-6 max-w-2xl mx-auto bg-gradient-to-br from-blue-100 to-blue-300 shadow-lg rounded-2xl">
      <h1 className="text-3xl font-bold mb-6 text-center text-blue-800">Leaderboard</h1>
      
      {/* Yoga Leaderboard */}
      <h2 className="text-2xl font-semibold mb-4 text-center text-purple-700">Yoga Sessions</h2>
      <table className="w-full border-collapse rounded-lg overflow-hidden shadow-md">
        <thead>
          <tr className="bg-purple-500 text-white">
            <th className="p-3">Rank</th>
            <th className="p-3">Name</th>
            <th className="p-3">Yoga Sessions</th>
            <th className="p-3">Avg Pose Hold Time (s)</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {leaderboardData
            .sort((a, b) => (b.yogaSessions * 0.7 + b.avgPoseHoldTime * 0.3) - (a.yogaSessions * 0.7 + a.avgPoseHoldTime * 0.3))
            .map((user, index) => (
              <tr key={user.id} className={user.name === "Jason" ? "bg-yellow-300" : index % 2 === 0 ? "bg-purple-100" : "bg-purple-200"}>
                <td className="p-3 text-center font-medium">{index + 1}</td>
                <td className="p-3 text-center">{user.name}</td>
                <td className="p-3 text-center">{user.yogaSessions}</td>
                <td className="p-3 text-center">{user.avgPoseHoldTime}</td>
              </tr>
            ))}
        </tbody>
      </table>
      
      {/* Exercise Leaderboard */}
      <h2 className="text-2xl font-semibold mt-6 mb-4 text-center text-green-700">Exercise Hours</h2>
      <table className="w-full border-collapse rounded-lg overflow-hidden shadow-md">
        <thead>
          <tr className="bg-green-500 text-white">
            <th className="p-3">Rank</th>
            <th className="p-3">Name</th>
            <th className="p-3">Exercise Hours</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {leaderboardData
            .sort((a, b) => b.exerciseHours - a.exerciseHours)
            .map((user, index) => (
              <tr key={user.id} className={user.name === "Jason" ? "bg-yellow-300" : index % 2 === 0 ? "bg-green-100" : "bg-green-200"}>
                <td className="p-3 text-center font-medium">{index + 1}</td>
                <td className="p-3 text-center">{user.name}</td>
                <td className="p-3 text-center">{user.exerciseHours}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
};

export default Leaderboard;
