const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface FetchOptions extends RequestInit {
  bodyData?: any;
}

export async function apiFetch(path: string, options: FetchOptions = {}) {
  const url = `${BASE_URL}${path.startsWith('/') ? path : '/' + path}`;
  
  const headers = new Headers(options.headers || {});
  
  // Retrieve token from LocalStorage if executing in the browser
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  // Set Content-Type automatically for JSON body payloads
  let body = options.body;
  if (options.bodyData) {
    if (!(options.bodyData instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.bodyData);
    } else {
      // For FormData, let the browser set the boundary header automatically
      body = options.bodyData;
    }
  }

  const finalOptions: RequestInit = {
    ...options,
    headers,
    body,
  };

  try {
    const response = await fetch(url, finalOptions);

    // Return the raw response object if we are downloading a file stream
    if (path.includes('/download/')) {
      if (!response.ok) {
        throw await parseError(response);
      }
      return response;
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // Parse custom error message from backend
      // (Class validator yields arrays of errors, which we join into a friendly string)
      const errorMessage = data?.message 
        ? (Array.isArray(data.message) ? data.message.join(', ') : data.message)
        : `Request failed with status ${response.status}`;
        
      throw new Error(errorMessage);
    }

    return data;
  } catch (error: any) {
    // If it's a customized validation/quota error message, rethrow it
    if (error.message && !error.message.includes('Failed to fetch') && !error.message.includes('fetch failed')) {
      throw error;
    }
    
    // Catch-all for network disconnected or server offline
    console.error('Network connection error:', error);
    throw new Error('Cannot connect to the server. Please verify the BenzDrive backend is running.');
  }
}

async function parseError(response: Response): Promise<Error> {
  try {
    const data = await response.json();
    const msg = data?.message || `Request failed with status ${response.status}`;
    return new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  } catch {
    return new Error(`Request failed with status ${response.status}`);
  }
}
