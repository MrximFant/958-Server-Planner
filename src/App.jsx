import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ServerSelect    from './pages/ServerSelect';
import ServerDashboard from './pages/ServerDashboard';
import JoinServer      from './pages/JoinServer';
import AdminPanel      from './pages/AdminPanel';
import Map             from './pages/Map';
import AllianceHQ      from './pages/AllianceHQ';
import Rules           from './pages/Rules';
import Register        from './pages/Register';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/"                           element={<ServerSelect />} />
          <Route path="/join/:inviteCode"           element={<JoinServer />} />
          <Route path="/server/:serverId"           element={<ServerDashboard />} />
          <Route path="/server/:serverId/admin"     element={<AdminPanel />} />
          <Route path="/server/:serverId/map"       element={<Map />} />
          <Route path="/server/:serverId/alliance"  element={<AllianceHQ />} />
          <Route path="/server/:serverId/rules"     element={<Rules />} />
          <Route path="/server/:serverId/register/:allianceId" element={<Register />} />
          <Route path="/map"      element={<Navigate to="/" replace />} />
          <Route path="/alliance" element={<Navigate to="/" replace />} />
          <Route path="/rules"    element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
