import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Map from './pages/Map';
import AllianceHQ from './pages/AllianceHQ';
import Rules from './pages/Rules';
 
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/"         element={<Landing />} />
        <Route path="/map"      element={<Map />} />
        <Route path="/alliance" element={<AllianceHQ />} />
        <Route path="/rules"    element={<Rules />} />
      </Routes>
    </Router>
  );
}
 
export default App;
 
