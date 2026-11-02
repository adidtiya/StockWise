import { toast } from './ui.js';

const BASE_URL = (typeof window !== 'undefined' && window.__API_BASE__) || 'http://localhost:8000/api/v1';

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

let refreshPromise = null;

async function doRefreshToken() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          /* no body */
        }
        if (!res.ok || (payload && payload.success === false)) {
          throw new Error(payload?.error?.message || 'Refresh token gagal');
        }
        return payload;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

function isAuthExcluded(path) {
  return (
    path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/refresh') ||
    path.includes('/auth/logout')
  );
}

export async function api(path, options = {}) {
  const { method = 'GET', body, headers = {}, _isRetry = false, ...rest } = options;
  const url = path.startsWith('http') ? path : `${BASE_URL}${path.startsWith('/') ? path : '/' + path}`;

  const fetchHeaders = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  };

  const fetchOptions = {
    method,
    headers: fetchHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    credentials: 'include',
    ...rest,
  };

  const res = await fetch(url, fetchOptions);

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* respons tanpa body JSON */
  }

  // Handle 429 Too Many Requests
  if (res.status === 429) {
    const retryAfter =
      res.headers.get('Retry-After') ||
      res.headers.get('retry-after') ||
      payload?.error?.retry_after ||
      60;
    const msg = `Terlalu banyak permintaan. Silakan tunggu ${retryAfter} detik`;
    try {
      toast(msg, 'error');
    } catch {
      console.warn(msg);
    }
    const err = new Error(payload?.error?.message || msg);
    err.status = 429;
    err.code = payload?.error?.code || 'RateLimitExceededException';
    err.retryAfter = Number(retryAfter);
    throw err;
  }

  // Handle 401 Unauthorized
  if (res.status === 401) {
    if (!isAuthExcluded(path) && !_isRetry) {
      try {
        await doRefreshToken();
        return await api(path, { ...options, _isRetry: true });
      } catch (refreshErr) {
        onUnauthorized();
        const err = new Error(payload?.error?.message || 'Sesi berakhir, silakan masuk kembali.');
        err.status = 401;
        err.code = payload?.error?.code || 'NotAuthenticatedException';
        throw err;
      }
    } else {
      if (!path.includes('/auth/login') && !path.includes('/auth/register')) {
        onUnauthorized();
      }
      const err = new Error(payload?.error?.message || 'Autentikasi gagal.');
      err.status = 401;
      err.code = payload?.error?.code || 'InvalidCredentialsException';
      throw err;
    }
  }

  // Handle standard response envelope
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (!payload.success) {
      const err = new Error(payload.error?.message || 'Terjadi kesalahan. Coba lagi.');
      err.status = res.status;
      err.code = payload.error?.code;
      err.requestId = payload.error?.request_id;
      throw err;
    }
    return payload.data;
  }

  if (!res.ok) {
    const err = new Error(payload?.error || 'Terjadi kesalahan. Coba lagi.');
    err.status = res.status;
    throw err;
  }

  return payload;
}

api.get = (path, opts = {}) => api(path, { ...opts, method: 'GET' });
api.post = (path, body, opts = {}) => api(path, { ...opts, method: 'POST', body });
api.put = (path, body, opts = {}) => api(path, { ...opts, method: 'PUT', body });
api.patch = (path, body, opts = {}) => api(path, { ...opts, method: 'PATCH', body });
api.delete = (path, opts = {}) => api(path, { ...opts, method: 'DELETE' });
