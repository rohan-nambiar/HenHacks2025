// App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ExerciseTracker from './ExerciseTracker';
import YogaPoseMatcher from './exercises/YogaPoseMatcher';

const App: React.FC = () => {
  return (
    <Router>
      <div style={{ textAlign: 'center' }}>
        <nav>
          <ul style={{ listStyle: 'none', display: 'flex', justifyContent: 'center', gap: '20px' }}>
            <li>
              <Link to="/">Exercise Tracker</Link>
            </li>
            <li>
              <Link to="/yoga-pose">Yoga Pose Matcher</Link>
            </li>
          </ul>
        </nav>
        <Routes>
          <Route path="/" element={<ExerciseTracker />} />
          <Route path="/yoga-pose" element={<YogaPoseMatcher />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
