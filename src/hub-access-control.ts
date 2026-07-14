/**
 * ============================================================
 *  OWN HUB — Access Control para sites React
 *  Versão TypeScript compatível com Vite
 *
 *  Importe no início do main.tsx de cada sub-site:
 *    import './hub-access-control'
 * ============================================================
 */

const HUB_URL = 'https://ownpainel.vercel.app';
const HUB_SESSION_KEY = '@own-hub:session';
const TOKEN_PARAM = 'hub_token';

interface HubSession {
  userId: string;
  userEmail: string;
  userName: string;
  userRole: string;
  token: string;
  expiresAt: number;
}

declare global {
  interface Window {
    __OWN_HUB_SESSION__?: HubSession;
    OwnHub: {
      getSession: () => HubSession | null;
      getUserEmail: () => string | null;
      getUserName: () => string | null;
      isAuthenticated: () => boolean;
    };
  }
}

function parseRelayFromUrl(): HubSession | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get(TOKEN_PARAM);
  const email = params.get('hub_user');
  const name = params.get('hub_name');

  if (!token || !email) return null;

  try {
    const decoded = JSON.parse(atob(token));
    if (!decoded.uid || !decoded.exp) return null;
    if (Date.now() > decoded.exp) return null;

    return {
      userId: decoded.uid,
      userEmail: email,
      userName: name || email,
      userRole: 'operator',
      token,
      expiresAt: decoded.exp,
    };
  } catch {
    return null;
  }
}

function getLocalSession(): HubSession | null {
  try {
    const raw = localStorage.getItem(HUB_SESSION_KEY);
    if (!raw) return null;
    const session: HubSession = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(HUB_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function saveLocalSession(session: HubSession): void {
  localStorage.setItem(HUB_SESSION_KEY, JSON.stringify(session));
}

function cleanUrlParams(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete(TOKEN_PARAM);
  url.searchParams.delete('hub_user');
  url.searchParams.delete('hub_name');
  try {
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignora
  }
}

function showBlockedScreen(): void {
  const currentUrl = encodeURIComponent(window.location.href);
  const hubRedirect = `${HUB_URL}?redirect=${currentUrl}`;

  document.body.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#000;font-family:'Space Grotesk','Segoe UI',sans-serif;padding:24px;">
      <div style="text-align:center;max-width:440px;">
        <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#E10600,#B00400);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:32px;">✂️</div>
        <div style="font-size:32px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:-0.02em;margin-bottom:8px;font-style:italic;font-family:'Titillium Web',sans-serif;">
          OWN <span style="color:#E10600">HUB</span>
        </div>
        <p style="color:#666;font-size:14px;line-height:1.6;margin-bottom:28px;">
          Este sistema é de <strong style="color:#fff">acesso restrito</strong>.<br>
          Por favor, acesse pelo OWN Hub.
        </p>
        <a href="${hubRedirect}" style="display:inline-flex;align-items:center;gap:8px;background:#E10600;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;box-shadow:0 8px 24px rgba(225,6,0,0.3);">
          → Ir para o OWN Hub
        </a>
        <div style="color:#444;font-size:11px;margin-top:20px;text-transform:uppercase;letter-spacing:0.2em;">
          Redirecionando em <span id="own-countdown">5</span>s...
        </div>
      </div>
    </div>
  `;

  // Fontes OWN
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@1,900&display=swap';
  document.head.appendChild(link);

  let count = 5;
  const el = document.getElementById('own-countdown');
  const interval = setInterval(() => {
    count--;
    if (el) el.textContent = String(count);
    if (count <= 0) {
      clearInterval(interval);
      window.location.href = hubRedirect;
    }
  }, 1000);
}

// ─── Verificação Principal ──────────────────────────────────
(function checkAccess() {
  // 1. Token relay vindo do Hub na URL
  const relaySession = parseRelayFromUrl();
  if (relaySession) {
    saveLocalSession(relaySession);
    cleanUrlParams();
    window.__OWN_HUB_SESSION__ = relaySession;
    console.log('[OWN Hub] ✅ Autenticado via relay:', relaySession.userEmail);
    setupApi();
    return;
  }

  // 2. Sessão local válida
  const localSession = getLocalSession();
  if (localSession) {
    window.__OWN_HUB_SESSION__ = localSession;
    console.log('[OWN Hub] ✅ Sessão local válida:', localSession.userEmail);
    setupApi();
    return;
  }

  // 3. Sem sessão → bloquear e redirecionar
  console.warn('[OWN Hub] ⛔ Acesso negado. Redirecionando...');
  showBlockedScreen();
})();

function setupApi(): void {
  window.OwnHub = {
    getSession: () => window.__OWN_HUB_SESSION__ || null,
    getUserEmail: () => window.__OWN_HUB_SESSION__?.userEmail || null,
    getUserName: () => window.__OWN_HUB_SESSION__?.userName || null,
    isAuthenticated: () => !!window.__OWN_HUB_SESSION__,
  };
}
