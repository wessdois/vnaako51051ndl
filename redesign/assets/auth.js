/* ============================================================
   Autenticação compartilhada — controla o bloco de auth do nav
   Requer: supabase-js e assets/config.js carregados antes.

   Markup esperado em qualquer página:
     <div class="navauth" data-navauth></div>
   ============================================================ */
(function () {
  var cfg = window.APP_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL) return;

  var client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  var Auth = {
    client:  client,
    session: null,
    credits: 0,
    user:    null,
    _subs:   [],
    onChange: function (cb) { this._subs.push(cb); if (this.session !== null) cb(this.session); },
    _emit: function () { var s = this.session; this._subs.forEach(function (cb) { try { cb(s); } catch (e) {} }); },
  };

  // Exige login para prosseguir. Retorna true se já está logado.
  Auth.requireLogin = function (msg) {
    if (Auth.session) return true;
    var next = location.pathname.split('/').pop() || 'consulta.html';
    var ir = function () { location.href = 'login.html?next=' + encodeURIComponent(next); };
    if (window.Swal) {
      Swal.fire({
        icon: 'info',
        title: 'Entre na sua conta',
        text: msg || 'Você precisa estar logado para continuar.',
        confirmButtonText: 'Entrar ou criar conta',
        showCancelButton: true,
        cancelButtonText: 'Agora não',
      }).then(function (r) { if (r.isConfirmed) ir(); });
    } else { ir(); }
    return false;
  };

  Auth.logout = function () {
    client.auth.signOut().then(function () { location.reload(); });
  };

  // Ajuste otimista (ex.: logo após consumir uma busca), sem esperar o servidor
  Auth.setCredits = function (n) {
    Auth.credits = Math.max(0, n | 0);
    render();
  };

  Auth.refreshCredits = function () {
    if (!Auth.session) { Auth.credits = 0; render(); return Promise.resolve(0); }
    return client.from('user_credits').select('credits_remaining').single().then(function (r) {
      Auth.credits = (r.data && r.data.credits_remaining) || 0;
      render();
      return Auth.credits;
    }).catch(function () { return 0; });
  };

  function iniciais(user) {
    var nome = (user && user.user_metadata && user.user_metadata.full_name) || '';
    if (nome.trim()) {
      var p = nome.trim().split(/\s+/).filter(function (x) { return x.length > 2; });
      return ((p[0] || nome)[0] + (p[1] ? p[1][0] : '')).toUpperCase();
    }
    var mail = (user && user.email) || '?';
    return mail.slice(0, 2).toUpperCase();
  }

  var ICO = {
    login:  '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/></svg>',
    bolt:   '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    clock:  '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    cart:   '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.4 12.1a2 2 0 0 0 2 1.6h8.5a2 2 0 0 0 2-1.6L21 7H6"/></svg>',
    out:    '<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render() {
    // Pode ser chamado antes do DOM existir (script no <head>)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', render, { once: true });
      return;
    }
    var hosts = document.querySelectorAll('[data-navauth]');
    if (!hosts.length) return;

    var html;
    if (!Auth.session) {
      html = '<a class="navauth__login" href="login.html">' + ICO.login + '<span>Entrar</span></a>';
    } else {
      var u = Auth.user || {};
      var n = Auth.credits;
      html = '<div class="navauth__in">'
        + '<button type="button" class="navauth__credits' + (n <= 0 ? ' navauth__credits--zero' : '') + '" data-auth-buy>'
        + ICO.bolt + '<b>' + n + '</b><span class="navauth__credits-lbl">' + (n === 1 ? 'crédito' : 'créditos') + '</span>'
        + '</button>'
        + '<button type="button" class="navauth__avatar" data-auth-toggle aria-expanded="false" aria-label="Sua conta">'
        + esc(iniciais(u)) + '</button>'
        + '<div class="navauth__menu" data-auth-menu>'
        + '<div class="navauth__menu-head">'
        + '<div class="navauth__menu-mail">' + esc(u.email || '') + '</div>'
        + '<div class="navauth__menu-sub">' + n + ' ' + (n === 1 ? 'consulta disponível' : 'consultas disponíveis') + '</div>'
        + '</div>'
        + (document.getElementById('historicoModal')
            ? '<button type="button" class="navauth__item" data-auth-hist>' + ICO.clock + 'Meu histórico</button>' : '')
        + '<button type="button" class="navauth__item" data-auth-buy>' + ICO.cart + 'Comprar créditos</button>'
        + '<button type="button" class="navauth__item navauth__item--danger" data-auth-logout>' + ICO.out + 'Sair</button>'
        + '</div></div>';
    }

    hosts.forEach(function (host) {
      host.innerHTML = html;

      var toggle = host.querySelector('[data-auth-toggle]');
      var menu   = host.querySelector('[data-auth-menu]');
      if (toggle && menu) {
        toggle.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = menu.classList.toggle('is-open');
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }
      host.querySelectorAll('[data-auth-buy]').forEach(function (b) {
        b.addEventListener('click', function () {
          fecharMenus();
          if (typeof window.openPricingModal === 'function') window.openPricingModal();
          else location.href = 'consulta.html#planos';
        });
      });
      var hist = host.querySelector('[data-auth-hist]');
      if (hist) hist.addEventListener('click', function () {
        fecharMenus();
        if (typeof window.abrirHistorico === 'function') window.abrirHistorico();
      });
      var out = host.querySelector('[data-auth-logout]');
      if (out) out.addEventListener('click', Auth.logout);
    });
  }

  function fecharMenus() {
    document.querySelectorAll('[data-auth-menu].is-open').forEach(function (m) {
      m.classList.remove('is-open');
      var t = m.parentNode.querySelector('[data-auth-toggle]');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }
  document.addEventListener('click', fecharMenus);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharMenus(); });

  function aplicar(session) {
    Auth.session = session || false;
    Auth.user    = session ? session.user : null;
    if (session) { Auth.refreshCredits(); } else { Auth.credits = 0; render(); }
    Auth._emit();
  }

  client.auth.getSession().then(function (r) { aplicar(r.data.session); });
  client.auth.onAuthStateChange(function (_e, s) { aplicar(s); });

  window.CapivaraAuth = Auth;
})();
