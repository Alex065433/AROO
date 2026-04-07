import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TwoFactorAuth } from '../components/TwoFactorAuth';
import { useUser } from '../src/context/UserContext';

const TwoFactorPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout, refreshProfile } = useUser();
  
  // Try to get the ID from profile, fallback to localStorage
  const emailOrId = profile?.operator_id || profile?.email || localStorage.getItem('arowin_login_id') || 'Operator';

  const handleVerify = () => {
    if (profile?.id) {
      localStorage.setItem(`2fa_verified_${profile.id}`, 'true');
    }
    refreshProfile(); // Ensure profile is up to date
    if (profile?.role === 'admin') {
      navigate('/admin/dashboard');
    } else {
      navigate('/dashboard');
    }
  };

  const handleCancel = async () => {
    if (profile?.id) {
      localStorage.removeItem(`2fa_verified_${profile.id}`);
    }
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute top-[-20%] left-[-10%] w-[1000px] h-[1000px] bg-[#0f172a] rounded-full blur-[150px] opacity-40 pointer-events-none" />
      
      <div className="w-full max-w-lg relative z-10">
        <TwoFactorAuth 
          emailOrId={emailOrId}
          onVerify={handleVerify}
          onCancel={handleCancel}
        />
      </div>
    </div>
  );
};

export default TwoFactorPage;
