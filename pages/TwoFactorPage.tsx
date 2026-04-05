import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TwoFactorAuth } from '../components/TwoFactorAuth';
import { supabaseService } from '../services/supabaseService';

const TwoFactorPage: React.FC = () => {
  const navigate = useNavigate();
  
  // In a real app, you'd get the email/ID from state or context
  const emailOrId = localStorage.getItem('arowin_login_id') || '';

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <TwoFactorAuth 
          emailOrId={emailOrId}
          onVerify={() => {
            sessionStorage.setItem('2fa_verified', 'true');
            const profile = supabaseService.getCurrentUser();
            if (profile?.role === 'admin') {
              navigate('/admin/dashboard');
            } else {
              navigate('/dashboard');
            }
          }}
          onCancel={() => navigate('/login')}
        />
      </div>
    </div>
  );
};

export default TwoFactorPage;
