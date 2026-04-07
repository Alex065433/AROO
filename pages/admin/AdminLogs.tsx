
import React from 'react';
import { 
  Terminal, Shield, User, Globe, 
  Clock, AlertCircle, Info, CheckCircle2
} from 'lucide-react';

const AdminLogs: React.FC = () => {
  const logs = [
    { id: 1, action: 'User Blocked', admin: 'Root Admin', target: 'USR-1003', status: 'Success', date: '2024-03-15 16:45', ip: '192.168.1.1', type: 'Security' },
    { id: 2, action: 'Settings Updated', admin: 'Root Admin', target: 'Platform Config', status: 'Success', date: '2024-03-15 15:20', ip: '192.168.1.1', type: 'System' },
    { id: 3, action: 'Withdrawal Approved', admin: 'Finance Admin', target: 'TX-10002', status: 'Success', date: '2024-03-15 14:10', ip: '10.0.0.5', type: 'Finance' },
    { id: 4, action: 'Login Attempt', admin: 'Unknown', target: 'Admin Portal', status: 'Failed', date: '2024-03-15 13:05', ip: '45.12.33.1', type: 'Security' },
    { id: 5, action: 'KYC Verified', admin: 'Compliance Team', target: 'USR-1001', status: 'Success', date: '2024-03-15 11:30', ip: '10.0.0.12', type: 'User' },
    { id: 6, action: 'Broadcast Sent', admin: 'Root Admin', target: 'All Nodes', status: 'Success', date: '2024-03-15 10:00', ip: '192.168.1.1', type: 'System' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Activity Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Audit trail of all administrative actions performed on the platform.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all">
            Clear Logs
          </button>
          <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-600/20">
            Export Audit Trail
          </button>
        </div>
      </div>

      {/* Logs Timeline */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">
                <th className="px-8 py-4">Action</th>
                <th className="px-8 py-4">Administrator</th>
                <th className="px-8 py-4">Target</th>
                <th className="px-8 py-4">Status</th>
                <th className="px-8 py-4">IP Address</th>
                <th className="px-8 py-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${
                        log.type === 'Security' ? 'bg-rose-500/10 text-rose-500' :
                        log.type === 'System' ? 'bg-indigo-500/10 text-indigo-500' :
                        log.type === 'Finance' ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {log.type === 'Security' ? <Shield size={16} /> :
                         log.type === 'System' ? <Terminal size={16} /> :
                         log.type === 'Finance' ? <CheckCircle2 size={16} /> :
                         <User size={16} />}
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{log.action}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold">
                        {log.admin.charAt(0)}
                      </div>
                      <span className="text-sm text-slate-600 dark:text-slate-400">{log.admin}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-mono font-bold text-slate-500 dark:text-slate-400">{log.target}</td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-1.5">
                      {log.status === 'Success' ? (
                        <CheckCircle2 size={14} className="text-emerald-500" />
                      ) : (
                        <AlertCircle size={14} className="text-rose-500" />
                      )}
                      <span className={`text-[10px] font-black uppercase tracking-wider ${
                        log.status === 'Success' ? 'text-emerald-500' : 'text-rose-500'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Globe size={14} />
                      {log.ip}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Clock size={14} />
                      {log.date}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
          <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest">Load More Activity</button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogs;
