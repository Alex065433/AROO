import { supabase } from '../../services/supabase';

console.log('[API] api.ts module loaded');

/**
 * API Utility for safe requests to the backend
 */

export const getApiBaseUrl = () => {
  // In production, we use Supabase Edge Functions
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jhlxehnwnlzftoylancq.supabase.co';
  
  if (supabaseUrl && !supabaseUrl.includes('placeholder')) {
    const cleanUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
    return `${cleanUrl}/functions/v1`;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

let sessionPromise: Promise<any> | null = null;

const getSession = async () => {
  if (sessionPromise) return sessionPromise;
  
  sessionPromise = supabase.auth.getSession().finally(() => {
    // Clear the promise after a short delay to allow fresh checks later
    // but prevent parallel calls in the same tick
    setTimeout(() => { sessionPromise = null; }, 100);
  });
  
  return sessionPromise;
};

export const apiFetch = async (endpoint: string, options: any = {}, retries = 3) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jhlxehnwnlzftoylancq.supabase.co';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpobHhlaG53bmx6ZnRveWxhbmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTUwODUsImV4cCI6MjA4OTA5MTA4NX0.N1XqGjkL3LALBQH05UzBTmGQHLDUs2JkFMIXffTXBNU';
  const functionsUrl = `${supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl}/functions/v1`;
  
  let url = endpoint;
  if (!endpoint.startsWith('http')) {
    console.log(`[API DEBUG] Mapping endpoint: ${endpoint}`);
    // Force mapping for specific routes to Supabase Edge Functions
    if (endpoint.includes('/payments/create') || endpoint.includes('/v1/payment/create') || endpoint.includes('/v1/tx/new')) {
      url = `${functionsUrl}/create-payment`;
      console.log(`[API DEBUG] Mapped to create-payment: ${url}`);
    } else if (endpoint.includes('/payments/status/') || endpoint.includes('/v1/tx/status/')) {
      const id = endpoint.split('/').pop();
      url = `${functionsUrl}/tx-status?id=${id}`;
      console.log(`[API DEBUG] Mapped to tx-status: ${url}`);
    } else if (endpoint.includes('/rates/binance')) {
      url = `${functionsUrl}/binance-rates`;
    } else if (endpoint.includes('/health')) {
      url = `${functionsUrl}/health`;
    } else if (endpoint.includes('/admin/query')) {
      url = `${functionsUrl}/admin-query`;
    } else if (endpoint.includes('/api/')) {
      // Generic mapping for other /api/ routes
      const path = endpoint.split('/api/')[1].replace(/\//g, '-');
      url = `${functionsUrl}/${path}`;
    } else {
      const baseUrl = getApiBaseUrl();
      url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    }
  }
  
  console.log(`[API] Fetching ${url}...`);
  
  for (let i = 0; i <= retries; i++) {
    try {
      // Ensure headers object exists
      const headers = { ...(options.headers || {}) };
      
      // MANDATORY HEADERS for Supabase Edge Functions as requested by user
      if (url.includes('.supabase.co/functions/v1')) {
        headers['apikey'] = anonKey;
        
        // If no authorization header is present, use the anon key as a fallback
        // The user requested Bearer SUPABASE_ANON_KEY specifically
        if (!headers['authorization'] && !headers['Authorization']) {
          headers['authorization'] = `Bearer ${anonKey}`;
        }
      }

      // Add Authorization from session if not already set (and not forced to anon key)
      if (!headers['authorization'] && !headers['Authorization']) {
        try {
          const { data: sessionData } = await getSession();
          const token = sessionData.session?.access_token || localStorage.getItem('arowin_admin_token');
          if (token) {
            headers['authorization'] = `Bearer ${token}`;
          }
        } catch (sessionErr: any) {
          console.warn('[API] Session retrieval failed:', sessionErr.message);
        }
      }
      
      if (url.includes('.supabase.co/functions/v1') && !headers['x-client-info']) {
        headers['x-client-info'] = 'arowin-web-client';
      }
      
      // Add Content-Type if body is present and not already set
      if (options.body && !headers['content-type'] && !headers['Content-Type']) {
        headers['content-type'] = 'application/json';
      }

      const response = await fetch(url, {
        ...options,
        headers
      });
      
      const contentType = response.headers.get('content-type');
      const isJson = contentType && contentType.includes('application/json');
      
      if (!isJson) {
        const text = await response.text();
        console.error(`[API ERROR] Received non-JSON response from ${url}`, {
          status: response.status,
          statusText: response.statusText,
          contentType,
          body: text.substring(0, 200)
        });
        
        throw new Error(`Server returned ${response.status} (${contentType || 'unknown'}). Expected JSON.`);
      }
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.message || `API error: ${response.status}`);
      }
      
      return data;
    } catch (error: any) {
      const isLastRetry = i === retries;
      const isNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';
      const isLockError = error.message?.includes('Lock broken');
      const isTimeout = error.message?.includes('timeout') || error.message?.includes('aborted');
      
      // Handle database cold start / timeout
      if ((isNetworkError || isLockError || isTimeout) && !isLastRetry) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.pow(2, i) * 1000;
        console.warn(`[API] Fetch failed (${error.message}), retrying in ${delay}ms (Attempt ${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Only log critical errors for non-health/rates endpoints to avoid console spam
      if (!url.includes('/health') && !url.includes('/binance-rates')) {
        console.error(`[API CRITICAL] Fetch failed for ${url}:`, error.message);
      }
      throw error;
    }
  }
};
