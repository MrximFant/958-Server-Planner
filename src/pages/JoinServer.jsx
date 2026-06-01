import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

// Resolves an invite code → redirects to the right destination
export default function JoinServer() {
  const { inviteCode } = useParams();
  const navigate       = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    async function resolve() {
      // Server invite → go to server dashboard
      const { data: server } = await supabase
        .from('servers').select('id').eq('invite_code', inviteCode).single();
      if (server) { navigate(`/server/${server.id}`); return; }

      // Alliance invite → go to registration page for that alliance
      const { data: alliance } = await supabase
        .from('alliances').select('id, server_id').eq('invite_code', inviteCode).single();
      if (alliance) {
        navigate(`/server/${alliance.server_id}/register/${alliance.id}`);
        return;
      }

      // Handshake invite (Phase 4)
      const { data: shake } = await supabase
        .from('server_handshakes').select('id').eq('invite_code', inviteCode).eq('status', 'pending').single();
      if (shake) { navigate(`/handshake/${shake.id}?code=${inviteCode}`); return; }

      setError('This invite link is invalid or has expired.');
    }
    resolve();
  }, [inviteCode, navigate]);

  return (
    <div style={{ minHeight: '100vh', background: '#080d14', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d0e4f4', fontFamily: 'monospace', fontSize: 14 }}>
      {error || 'Resolving invite link…'}
    </div>
  );
}
