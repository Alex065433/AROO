import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * API Utility for safe requests to the backend
 */

export const getApiBaseUrl = () => {
  // In production, we use Supabase Edge Functions
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const isProduction = typeof window !== 'undefined' && 
    (window.location.hostname === 'arowintrading.com' || window.location.hostname === 'www.arowintrading.com');

  if (isProduction && supabaseUrl && !supabaseUrl.includes('placeholder')) {
    const cleanUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
    return `${cleanUrl}/functions/v1`;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
};

export const apiFetch = async (endpoint: string, options: any = {}) => {
  const baseUrl = getApiBaseUrl();
  
  let url = endpoint;
  if (!endpoint.startsWith('http')) {
    // Map local API routes to Supabase Edge Functions in production
    const isEdgeFunctionBase = baseUrl.includes('.supabase.co/functions/v1');
    let mappedEndpoint = endpoint;
    
    if (isEdgeFunctionBase) {
      if (endpoint === '/api/admin/query') mappedEndpoint = '/admin-query';
      else if (endpoint === '/api/v1/payment/create' || endpoint === '/api/v1/tx/new') mappedEndpoint = '/create-payment';
      else if (endpoint.startsWith('/api/v1/tx/status/')) mappedEndpoint = `/tx-status?id=${endpoint.split('/').pop()}`;
      else if (endpoint === '/api/rates/binance') mappedEndpoint = '/binance-rates';
      else if (endpoint === '/api/health') mappedEndpoint = '/health';
      else if (endpoint.startsWith('/api/')) mappedEndpoint = endpoint.replace('/api/', '/');
    }

    url = `${baseUrl}${mappedEndpoint.startsWith('/') ? '' : '/'}${mappedEndpoint}`;
  }
  
  console.log(`[API] Fetching ${url}...`);
  
  try {
    // Ensure headers object exists
    const headers = { ...(options.headers || {}) };
    
    // Add Authorization if not present
    if (!headers['Authorization']) {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || localStorage.getItem('arowin_admin_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    // Add Supabase Anon Key if calling Edge Functions (required by Supabase infrastructure)
    if (url.includes('.supabase.co/functions/v1')) {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (anonKey && !headers['apikey']) {
        headers['apikey'] = anonKey;
      }
      if (!headers['x-client-info']) {
        headers['x-client-info'] = 'arowin-web-client';
      }
    }
    
    // Add Content-Type if body is present and not already set
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
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
        body: text.substring(0, 200) // Log first 200 chars
      });
      
      throw new Error(`Server returned ${response.status} (${contentType || 'unknown'}). Expected JSON.`);
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || `API error: ${response.status}`);
    }
    
    return data;
  } catch (error: any) {
    console.error(`[API CRITICAL] Fetch failed for ${url}:`, error.message);
    throw error;
  }
};
