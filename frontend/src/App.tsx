import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ExerciseTracker from './ExerciseTracker';
import YogaPoseMatcher from './exercises/YogaPoseMatcher';
import Leaderboard from './Leaderboard';
import PhysicalTherapy from './PhysicalTherapy';


const App: React.FC = () => {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 flex flex-col">
        <nav className="w-full bg-white shadow-lg">
          <ul className="max-w-5xl mx-auto flex justify-center gap-10 py-5">
            <li>
              <Link
                to="/physical-therapy"
                className="text-xl font-bold text-gray-800 hover:text-indigo-600 transition-colors"
              >
                Physical Therapy
              </Link>
            </li>
            <li>
              <Link
                to="/yoga-pose"
                className="text-xl font-bold text-gray-800 hover:text-indigo-600 transition-colors"
              >
                Yoga Matcher
              </Link>
            </li>
            <li>
              <Link
                to="/"
                className="text-xl font-bold text-gray-800 hover:text-indigo-600 transition-colors"
              >
                Exercise 
              </Link>
            </li>
            <li>
              <Link
                to="/leaderboard"
                className="text-xl font-bold text-gray-800 hover:text-indigo-600 transition-colors"
              >
                Leaderboard
              </Link>
            </li>
          </ul>
        </nav>
        <main className="flex-1 flex flex-col items-center px-4 py-8">
          <div className="w-full max-w-5xl bg-white rounded-xl shadow-xl p-8">
            <Routes>
              <Route path="/" element={<ExerciseTracker />} />
              <Route path="/yoga-pose" element={<YogaPoseMatcher />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/physical-therapy" element={<PhysicalTherapy />} />
            </Routes>
          </div>
        </main>
        <footer className="w-full bg-white py-4 shadow-inner text-center text-gray-600">
          <p>&copy; {new Date().getFullYear()} AI Fitness Tracker. All rights reserved.</p>
        </footer>
      </div>
    </Router>
  );
};

export default App;