var CONFIG_FIREBASE = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__",
};
var NUVEM_CONFIGURADA = CONFIG_FIREBASE.apiKey.indexOf("__") !== 0;
var fb = null;
var erroNuvem = false;
var firebasePronto = NUVEM_CONFIGURADA
  ? (function () {
      var base = "https://www.gstatic.com/firebasejs/10.14.1/";
      return Promise.all([
        import(base + "firebase-app.js"),
        import(base + "firebase-auth.js"),
        import(base + "firebase-firestore.js"),
      ])
        .then(function (m) {
          var app = m[0].initializeApp(CONFIG_FIREBASE);

          var auth = m[1].initializeAuth(app, { persistence: m[1].inMemoryPersistence });
          fb = { auth: auth, db: m[2].getFirestore(app), A: m[1], F: m[2] };
        })
        .catch(function (e) {
          erroNuvem = true;
          console.warn("Firebase indisponível.", e);
        });
    })()
  : Promise.resolve();

var NOME_DO_PERFIL = {
  func: "Funcionário",
  diamante: "Representante Diamante 💎",
  gestor: "Gestor",
  ti: "TI (monitoramento)",
};
var CATEGORIAS = ["TI e suporte", "Recursos Humanos", "Financeiro", "Infraestrutura"],
  PRIORIDADES = ["Baixa", "Média", "Alta"];
var DOCUMENTOS = [
  { n: "Manual do colaborador.pdf", lv: 1 },
  { n: "Política de segurança da informação.pdf", lv: 1 },
  { n: "Planejamento trimestral.xlsx", lv: 2 },
  { n: "Contratos e folha de pagamento.pdf", lv: 3 },
];
var NIVEL_DE_ACESSO = {
    1: ["func", "diamante", "gestor", "ti"],
    2: ["diamante", "gestor", "ti"],
    3: ["gestor", "ti"],
  },
  NIVEL_DESCRICAO = {
    2: "Representante, Gestor ou TI",
    3: "Gestor ou TI",
  };

var MFA_VALIDADE_MS = 60 * 1000,
  MFA_MAX_TENTATIVAS = 3,
  MFA_MAX_ENVIOS = 3;

var LIMITE_INATIVIDADE_MS = 15 * 60 * 1000;

var INTERVALO_CHAMADOS_MS = 10 * 1000;

var PESO_PRIORIDADE = { Alta: 0, Média: 1, Baixa: 2 },
  ENVELHECIMENTO_MS = 30 * 60 * 1000;

var estado = {
  user: null,
  tmp: null,
  auth: 0,
  cadastro: false,
  mfa: null,
  tab: "atividades",
  ch: [],
  at: [],
  posts: [],
  us: [],
  au: [],
  fila: [],
  chaves: [],
  unsubs: [],
  busy: false,
};
var areaPrincipal = document.getElementById("v"),
  avisoLeitorTela = document.getElementById("live");

function porId(i) {
  return document.getElementById(i);
}
function anunciar(t) {
  avisoLeitorTela.textContent = t;
}
function escaparHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}
function limparErrosCampo() {
  [].forEach.call(document.querySelectorAll('[aria-invalid="true"]'), function (el) {
    el.removeAttribute("aria-invalid");
  });
}
function mostrarErro(m, f) {
  limparErrosCampo();
  var e = porId("e");
  if (e) e.innerHTML = '<p class="err" role="alert">' + escaparHtml(m) + "</p>";
  else avisar(m);
  anunciar(m);
  if (f && porId(f)) {
    var el = porId(f);
    el.setAttribute("aria-invalid", "true");
    el.addEventListener(
      "input",
      function () {
        el.removeAttribute("aria-invalid");
      },
      { once: true },
    );
    el.focus();
  }
}

function confirmarClique(b, textoConfirmar) {
  if (b.dataset.conf === "1") {
    clearTimeout(Number(b.dataset.confT || 0));
    delete b.dataset.conf;
    b.classList.remove("warn");
    return true;
  }
  b.dataset.conf = "1";
  b.dataset.origTxt = b.textContent;
  b.textContent = textoConfirmar;
  b.classList.add("warn");
  anunciar(textoConfirmar + " Clique novamente para confirmar.");
  b.dataset.confT = String(
    setTimeout(function () {
      if (document.body.contains(b) && b.dataset.conf === "1") {
        delete b.dataset.conf;
        b.textContent = b.dataset.origTxt || b.textContent;
        b.classList.remove("warn");
      }
    }, 5000),
  );
  return false;
}

function seletorDoElemento(el) {
  if (!el || el === document.body) return null;
  if (el.id) return "#" + el.id;
  if (el.dataset && el.dataset.u) return 'button[data-u="' + el.dataset.u + '"]';
  if (el.dataset && el.dataset.id && el.dataset.s)
    return 'button[data-id="' + el.dataset.id + '"][data-s="' + el.dataset.s + '"]';
  if (el.dataset && el.dataset.a && el.dataset.i)
    return 'button[data-a="' + el.dataset.a + '"][data-i="' + el.dataset.i + '"]';
  if (el.dataset && el.dataset.x) return 'button[data-x="' + el.dataset.x + '"]';
  if (el.tagName === "SUMMARY") return "details > summary";
  return null;
}
function comFocoPreservado(container, fn) {
  var ativo = document.activeElement,
    estavaDentro = container && ativo && container.contains(ativo),
    sel = estavaDentro ? seletorDoElemento(ativo) : null,
    det = container && container.querySelector("details"),
    detAberto = !!(det && det.open);
  fn();
  if (detAberto) {
    var novoDet = container.querySelector("details");
    if (novoDet) novoDet.open = true;
  }
  if (estavaDentro) {
    var alvo = sel ? container.querySelector(sel) : null;
    if (alvo && !alvo.disabled) alvo.focus();
    else if (porId("pn")) porId("pn").focus();
  }
}
var temporizadorAviso = null;
function avisar(m) {
  var a = porId("aviso");
  a.textContent = m;
  a.hidden = false;
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(function () {
    a.hidden = true;
  }, 7000);
}
function perfilAtual() {
  return estado.user ? estado.user.perfil : "";
}
function ehGestor() {
  return perfilAtual() === "gestor";
}
function ehRepresentante() {
  return perfilAtual() === "diamante";
}
function ehTI() {
  return perfilAtual() === "ti";
}
function ehFuncionario() {
  return perfilAtual() === "func";
}
function podeAdministrar() {
  return ehGestor() || ehRepresentante();
}
function podeGerenciar(a) {
  return ehGestor() || (ehRepresentante() && a.porUid === estado.user.uid);
}
function podeVerDocumento(l) {
  return NIVEL_DE_ACESSO[l].indexOf(perfilAtual()) >= 0;
}
function normalizar(x) {
  return String(x || "")
    .trim()
    .toLowerCase();
}
function dataDeHoje() {
  var d = new Date();
  return (
    d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2)
  );
}
function formatarData(d) {
  return d ? d.split("-").reverse().join("/") : "sem prazo";
}
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function paraBase64(buf) {
  var b = new Uint8Array(buf),
    s = "";
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function deBase64(t) {
  var s = atob(t),
    b = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

function ocupar(b, texto) {
  estado.busy = true;
  if (!b) return;
  b.disabled = true;
  b.dataset.txt = b.textContent;
  b.innerHTML = '<span class="spin" aria-hidden="true"></span> ' + texto;
}
function liberar(b) {
  estado.busy = false;
  if (b && document.body.contains(b)) {
    b.disabled = false;
    b.textContent = b.dataset.txt || b.textContent;
  }
}

var acoesEmAndamento = {};
function executarUmaVez(chave, botao, fn) {
  if (acoesEmAndamento[chave]) return;
  acoesEmAndamento[chave] = true;
  if (botao) botao.disabled = true;
  return Promise.resolve()
    .then(fn)
    .catch(function (e) {
      console.warn(e);
      avisar(
        e && e.code === "permission-denied"
          ? "Ação bloqueada pelas regras de segurança do servidor para o seu perfil."
          : "Não foi possível concluir a ação. Tente novamente.",
      );
    })
    .then(function () {
      delete acoesEmAndamento[chave];
      if (botao && document.body.contains(botao)) botao.disabled = false;
    });
}

var COLECOES = ["chamados", "posts", "atividades", "usuarios", "auditoria", "fila", "chaves", "limites"],
  memoriaLocal = {},
  ouvintesLocais = {};
COLECOES.forEach(function (n) {
  memoriaLocal[n] = {};
  ouvintesLocais[n] = [];
});
function listarMemoria(n, filtro) {
  return Object.keys(memoriaLocal[n])
    .map(function (k) {
      return Object.assign({ id: k }, memoriaLocal[n][k]);
    })
    .filter(function (x) {
      if (!filtro) return true;
      if (filtro[1] === "==") return x[filtro[0]] === filtro[2];
      return (x[filtro[0]] || []).indexOf(filtro[2]) >= 0;
    });
}
function avisarOuvintes(n) {
  ouvintesLocais[n].forEach(function (o) {
    o.cb(listarMemoria(n, o.filtro));
  });
}

var latencias = [];
function medir(p) {
  var t0 = performance.now();
  return p.then(function (r) {
    latencias.push(performance.now() - t0);
    if (latencias.length > 20) latencias.shift();
    return r;
  });
}
var Dados = {

  sub: function (n, cb, filtro) {
    if (fb) {
      var F = fb.F,
        ref = F.collection(fb.db, n);
      if (filtro) ref = F.query(ref, F.where(filtro[0], filtro[1], filtro[2]));
      return F.onSnapshot(
        ref,
        function (sn) {
          cb(
            sn.docs.map(function (d) {
              return Object.assign({ id: d.id }, d.data());
            }),
          );
        },
        function (e) {
          console.warn("Leitura negada ou indisponível em " + n, e);
          cb([]);
        },
      );
    }
    var o = { cb: cb, filtro: filtro };
    ouvintesLocais[n].push(o);
    cb(listarMemoria(n, filtro));
    return function () {
      ouvintesLocais[n] = ouvintesLocais[n].filter(function (x) {
        return x !== o;
      });
    };
  },
  get: function (n, id) {
    if (fb)
      return fb.F.getDoc(fb.F.doc(fb.db, n, id)).then(function (s) {
        return s.exists() ? Object.assign({ id: s.id }, s.data()) : null;
      });
    var x = memoriaLocal[n][id];
    return Promise.resolve(x ? Object.assign({ id: id }, x) : null);
  },
  set: function (n, id, o) {
    if (fb) return medir(fb.F.setDoc(fb.F.doc(fb.db, n, id), o));
    memoriaLocal[n][id] = Object.assign({}, o);
    avisarOuvintes(n);
    return Promise.resolve();
  },
  upd: function (n, id, o) {
    if (fb) return medir(fb.F.updateDoc(fb.F.doc(fb.db, n, id), o));
    if (!memoriaLocal[n][id]) return Promise.reject({ code: "not-found" });
    Object.assign(memoriaLocal[n][id], o);
    avisarOuvintes(n);
    return Promise.resolve();
  },
  del: function (n, id) {
    if (fb) return medir(fb.F.deleteDoc(fb.F.doc(fb.db, n, id)));
    delete memoriaLocal[n][id];
    avisarOuvintes(n);
    return Promise.resolve();
  },

  lote: function (ops) {
    if (fb) {
      var F = fb.F,
        b = F.writeBatch(fb.db);
      ops.forEach(function (op) {
        var r = F.doc(fb.db, op[1], op[2]);
        if (op[0] === "set") b.set(r, op[3]);
        else if (op[0] === "merge") b.set(r, op[3], { merge: true });
        else if (op[0] === "upd") b.update(r, op[3]);
        else b.delete(r);
      });
      return medir(b.commit());
    }
    var tocadas = {};
    ops.forEach(function (op) {
      var m = memoriaLocal[op[1]];
      if (op[0] === "set") m[op[2]] = Object.assign({}, op[3]);
      else if (op[0] === "merge" || op[0] === "upd") m[op[2]] = Object.assign(m[op[2]] || {}, op[3]);
      else delete m[op[2]];
      tocadas[op[1]] = 1;
    });
    Object.keys(tocadas).forEach(avisarOuvintes);
    return Promise.resolve();
  },

  criarComLimite: function (n, id, o) {
    var uid = estado.user.uid;
    if (fb) {
      var F = fb.F,
        b = F.writeBatch(fb.db);
      b.set(F.doc(fb.db, n, id), o);
      b.set(F.doc(fb.db, "limites", uid), { ultimo: F.serverTimestamp() });
      return medir(b.commit());
    }
    var l = memoriaLocal.limites[uid];
    if (l && Date.now() - l.ultimo < INTERVALO_CHAMADOS_MS) return Promise.reject({ code: "limite" });
    memoriaLocal.limites[uid] = { ultimo: Date.now() };
    return Dados.set(n, id, o);
  },
};

var contasLocais = {};
function resumoSenha(s) {
  if (!window.crypto || !crypto.subtle) return Promise.resolve(s);
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(paraBase64);
}
var Autenticacao = {
  entrar: function (email, senha) {
    if (fb)
      return fb.A.signInWithEmailAndPassword(fb.auth, email, senha).then(function (c) {
        return { uid: c.user.uid, email: c.user.email };
      });
    return resumoSenha(senha).then(function (h) {
      var c = contasLocais[email];
      if (!c || c.senha !== h) throw { code: "auth/invalid-credential" };
      return { uid: c.uid, email: email };
    });
  },
  cadastrar: function (email, senha) {
    if (fb)
      return fb.A.createUserWithEmailAndPassword(fb.auth, email, senha).then(function (c) {
        return { uid: c.user.uid, email: c.user.email };
      });
    if (contasLocais[email]) return Promise.reject({ code: "auth/email-already-in-use" });
    return resumoSenha(senha).then(function (h) {
      contasLocais[email] = { uid: "U" + gerarId(), senha: h };
      return { uid: contasLocais[email].uid, email: email };
    });
  },
  sair: function () {
    return fb ? fb.A.signOut(fb.auth) : Promise.resolve();
  },
};
function mensagemErroAuth(e) {
  var c = (e && e.code) || "";
  return (
    {
      "auth/invalid-credential": "E-mail ou senha incorretos.",
      "auth/wrong-password": "E-mail ou senha incorretos.",
      "auth/user-not-found": "E-mail ou senha incorretos.",
      "auth/invalid-email": "E-mail inválido.",
      "auth/email-already-in-use": "Este e-mail já está cadastrado. Use “Já tenho conta”.",
      "auth/weak-password": "Senha fraca: use pelo menos 8 caracteres, com letras e números.",
      "auth/password-does-not-meet-requirements":
        "A senha não atende à política de senhas da empresa.",
      "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
      "auth/network-request-failed": "Sem conexão com o servidor. Verifique sua internet.",
      "auth/operation-not-allowed": "O login por e-mail e senha não está ativado no Firebase.",
      "sem-nuvem":
        "Não foi possível conectar ao servidor. Verifique sua internet e recarregue a página.",
    }[c] || "Não foi possível entrar. Tente novamente."
  );
}

function abrirCofre() {
  return new Promise(function (ok, falha) {
    if (!window.indexedDB) return falha(new Error("sem IndexedDB"));
    var r = indexedDB.open("worklink-chaves", 1);
    r.onupgradeneeded = function () {
      r.result.createObjectStore("pares");
    };
    r.onsuccess = function () {
      ok(r.result);
    };
    r.onerror = function () {
      falha(r.error);
    };
  });
}
function cofreLer(k) {
  return abrirCofre().then(function (db) {
    return new Promise(function (ok, falha) {
      var q = db.transaction("pares").objectStore("pares").get(k);
      q.onsuccess = function () {
        ok(q.result);
      };
      q.onerror = function () {
        falha(q.error);
      };
    });
  });
}
function cofreGravar(k, v) {
  return abrirCofre().then(function (db) {
    return new Promise(function (ok, falha) {
      var q = db.transaction("pares", "readwrite").objectStore("pares").put(v, k);
      q.onsuccess = function () {
        ok();
      };
      q.onerror = function () {
        falha(q.error);
      };
    });
  });
}
var ALG_RSA = { name: "RSA-PSS", hash: "SHA-256" },
  PARAM_ASSINATURA = { name: "RSA-PSS", saltLength: 32 };
var Cripto = {
  pronto: null,
  kid: null,
  privada: null,
  preparar: function (uid) {
    Cripto.kid = null;
    Cripto.privada = null;
    if (!window.crypto || !crypto.subtle) return (Cripto.pronto = Promise.resolve());
    var chave = (NUVEM_CONFIGURADA ? CONFIG_FIREBASE.projectId : "local") + ":" + uid;
    Cripto.pronto = cofreLer(chave)
      .catch(function () {
        return null;
      })
      .then(function (salvo) {
        if (salvo && salvo.kid && salvo.par) return salvo;
        return crypto.subtle
          .generateKey(
            {
              name: "RSA-PSS",
              modulusLength: 2048,
              publicExponent: new Uint8Array([1, 0, 1]),
              hash: "SHA-256",
            },
            false,
            ["sign", "verify"],
          )
          .then(function (par) {
            var novo = { kid: "K" + gerarId(), par: par };
            return cofreGravar(chave, novo)
              .catch(function () {})
              .then(function () {
                return novo;
              });
          });
      })
      .then(function (s) {
        Cripto.kid = s.kid;
        Cripto.privada = s.par.privateKey;
        return Dados.get("chaves", s.kid).then(function (doc) {
          if (doc) return;
          return crypto.subtle.exportKey("jwk", s.par.publicKey).then(function (jwk) {
            return Dados.set("chaves", s.kid, {
              uid: uid,
              jwk: JSON.stringify(jwk),
              criado: Date.now(),
            });
          });
        });
      })
      .catch(function (e) {
        console.warn("Assinatura RSA indisponível.", e);
        Cripto.kid = null;
        Cripto.privada = null;
      });
    return Cripto.pronto;
  },
  assinar: function (texto) {
    return crypto.subtle
      .sign(PARAM_ASSINATURA, Cripto.privada, new TextEncoder().encode(texto))
      .then(paraBase64);
  },
  verificar: function (jwkTexto, texto, assinatura) {
    return crypto.subtle
      .importKey("jwk", JSON.parse(jwkTexto), ALG_RSA, false, ["verify"])
      .then(function (k) {
        return crypto.subtle.verify(
          PARAM_ASSINATURA,
          k,
          deBase64(assinatura),
          new TextEncoder().encode(texto),
        );
      });
  },
};
function textoAssinado(e) {
  return JSON.stringify([e.quemUid, e.perfil, e.acao, e.quando, e.kid]);
}
function registrarAuditoria(acao) {
  var u = estado.user || estado.tmp;
  if (!u || !u.uid) return Promise.resolve();
  var e = {
    quemUid: u.uid,
    quem: u.nome || u.email || "?",
    perfil: u.perfil || "?",
    acao: acao,
    quando: Date.now(),
    kid: null,
    assinatura: null,
  };
  return (Cripto.pronto || Promise.resolve())
    .then(function () {
      if (!Cripto.privada) return;
      e.kid = Cripto.kid;
      return Cripto.assinar(textoAssinado(e)).then(function (s) {
        e.assinatura = s;
      });
    })
    .catch(function () {
      e.kid = null;
      e.assinatura = null;
    })
    .then(function () {
      return Dados.set("auditoria", "L" + gerarId(), e);
    })
    .catch(function (err) {
      console.warn("Auditoria não registrada.", err);
    });
}

var contagemMFA = null;
function gerarCodigoMFA() {
  var n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return ("00000" + (n[0] % 1000000)).slice(-6);
}
function iniciarMFA() {
  estado.mfa = {
    codigo: gerarCodigoMFA(),
    expira: Date.now() + MFA_VALIDADE_MS,
    tentativas: 0,
    envios: 1,
  };
}
function pararContagemMFA() {
  clearInterval(contagemMFA);
  contagemMFA = null;
}
function iniciarContagemMFA() {
  pararContagemMFA();
  var avisouExpirado = false;
  function tique() {
    var t = porId("mfat");
    if (!t || !estado.mfa) return pararContagemMFA();
    var resta = Math.ceil((estado.mfa.expira - Date.now()) / 1000);
    if (resta > 0) {
      t.textContent = "expira em " + resta + " s";
    } else {
      t.textContent = "código expirado";
      porId("mfac").textContent = "------";
      if (!avisouExpirado) {
        avisouExpirado = true;
        anunciar("O código expirou. Peça um novo código.");
      }
    }
  }
  tique();
  contagemMFA = setInterval(tique, 1000);
}
var encerrando = false;
function encerrarSessao(msg) {
  if (encerrando) return Promise.resolve();
  encerrando = true;
  estado.unsubs.forEach(function (u) {
    u && u();
  });
  estado.unsubs = [];
  pararContagemMFA();
  return Autenticacao.sair()
    .catch(function () {})
    .then(function () {
      estado.user = null;
      estado.tmp = null;
      estado.mfa = null;
      estado.auth = 0;
      estado.busy = false;
      estado.ch = [];
      estado.at = [];
      estado.us = [];
      estado.au = [];
      estado.fila = [];
      estado.chaves = [];
      estado.posts = [];
      Cripto.kid = null;
      Cripto.privada = null;
      Cripto.pronto = null;
      encerrando = false;
      desenharTela();
      if (msg) mostrarErro(msg);
    });
}

function abasDoPerfil() {
  var t = [
    ["atividades", "Atividades"],
    ["chamados", "Chamados"],
    ["mural", "Mural"],
    ["docs", "Documentos"],
  ];
  if (ehGestor()) t.push(["equipe", "Equipe"]);
  if (ehTI()) t.unshift(["monitor", "Monitoramento"]);
  return t;
}
function telaDeLogin() {
  if (estado.auth === 1) {
    return (
      '<div class="card narrow"><h2 tabindex="-1" id="ttl">Verificação em duas etapas</h2>' +
      "<p>Digite o código de 6 dígitos enviado ao seu aplicativo autenticador.</p>" +
      '<div class="mfa" role="note" aria-label="Aplicativo autenticador simulado"><p class="hint" style="margin:0">📱 Autenticador simulado (demonstração)</p>' +
      '<p style="margin:.2rem 0"><span class="cod" id="mfac">' +
      estado.mfa.codigo +
      '</span> <span class="hint" id="mfat"></span></p></div>' +
      '<form id="fmfa" novalidate><label class="f" for="cd">Código</label><input type="text" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}">' +
      '<p class="hint" id="mfatr">Tentativas restantes: ' +
      (MFA_MAX_TENTATIVAS - estado.mfa.tentativas) +
      "</p>" +
      '<div id="e"></div><div class="row"><button type="button" id="l0">Voltar</button><button type="button" id="nv">Enviar novo código</button><button class="pri" type="submit" id="l2">Verificar e entrar</button></div></form></div>'
    );
  }
  var cad = estado.cadastro;
  return (
    '<div class="card narrow"><h2 tabindex="-1" id="ttl">' +
    (cad ? "Criar conta no WorkLink" : "Entrar no WorkLink") +
    "</h2>" +
    (NUVEM_CONFIGURADA
      ? ""
      : '<p class="hint">Modo local de demonstração: o Firebase não está configurado, então as contas e os dados ficam só nesta aba.</p>') +
    '<form id="flogin" novalidate>' +
    (cad
      ? '<label class="f" for="nm">Nome completo</label><input type="text" id="nm" autocomplete="name">'
      : "") +
    '<label class="f" for="em">E-mail corporativo</label><input type="text" id="em" inputmode="email" autocomplete="username">' +
    '<label class="f" for="pw">Senha</label><input type="password" id="pw" aria-describedby="pwd" autocomplete="' +
    (cad ? "new-password" : "current-password") +
    '">' +
    (cad
      ? '<p class="hint" id="pwd">Mínimo de 8 caracteres, com letras e números.</p><label class="f" for="pw2">Confirme a senha</label><input type="password" id="pw2" autocomplete="new-password">' +
        (NUVEM_CONFIGURADA
          ? '<p class="hint">Novas contas entram como Funcionário. O Gestor altera o perfil depois.</p>'
          : '<label class="f" for="pf">Perfil (só no modo local)</label><select id="pf"><option value="func">Funcionário</option><option value="diamante">Representante Diamante 💎</option><option value="gestor">Gestor</option><option value="ti">TI (monitoramento)</option></select>')
      : '<p class="hint" id="pwd">Protegido por senha e verificação em duas etapas (MFA).</p>') +
    '<div id="e"></div><div class="row"><button class="pri" type="submit" id="l1">' +
    (cad ? "Criar conta" : "Continuar") +
    '</button><button type="button" class="link" id="alt">' +
    (cad ? "Já tenho conta" : "Criar conta") +
    "</button></div></form></div>"
  );
}
function desenharTela() {
  var h = "";
  if (!estado.user) {
    areaPrincipal.innerHTML = telaDeLogin();
    ligarEventos();
    if (estado.auth === 1) iniciarContagemMFA();
    var t = porId("ttl");
    if (t) {
      t.focus();
      anunciar(t.textContent);
    }
    return;
  }
  h =
    '<div class="card"><div class="tools" style="justify-content:space-between"><div><strong>' +
    escaparHtml(estado.user.nome) +
    '</strong> <span class="tag c">' +
    NOME_DO_PERFIL[estado.user.perfil] +
    '</span></div><button class="sm" id="out">Sair</button></div>' +
    '<div class="tabs" role="tablist" aria-label="Seções">' +
    abasDoPerfil()
      .map(function (t) {
        return (
          '<button role="tab" id="t-' +
          t[0] +
          '" aria-selected="' +
          (estado.tab === t[0]) +
          '" aria-controls="pn" data-t="' +
          t[0] +
          '" tabindex="' +
          (estado.tab === t[0] ? 0 : -1) +
          '">' +
          t[1] +
          "</button>"
        );
      })
      .join("") +
    "</div>" +
    '<div id="pn" role="tabpanel" aria-labelledby="t-' +
    estado.tab +
    '" tabindex="0"></div></div>';
  areaPrincipal.innerHTML = h;
  ligarEventos();
  desenharAbaAtual();
}
function desenharAbaAtual() {
  var p = porId("pn");
  if (!p) return;
  ({
    monitor: desenharMonitoramento,
    equipe: desenharEquipe,
    atividades: desenharAtividades,
    chamados: desenharChamados,
    mural: desenharMural,
    docs: desenharDocumentos,
  })[estado.tab](p);
}
var redesenhoAgendado = null;
function agendarRedesenho() {
  if (redesenhoAgendado) return;
  redesenhoAgendado = setTimeout(function () {
    redesenhoAgendado = null;
    if (estado.user) desenharAbaAtual();
  }, 80);
}

function infoRede() {
  var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return c
    ? { tipo: c.effectiveType, rtt: c.rtt, banda: c.downlink, economia: !!c.saveData }
    : null;
}
function tempoDeCarregamento() {
  var n = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  return n && n.domContentLoadedEventEnd ? Math.round(n.domContentLoadedEventEnd) : null;
}

var verificacoes = {};
function verificarRegistro(x) {
  if (verificacoes[x.id]) return verificacoes[x.id];
  if (!x.assinatura || !x.kid) return (verificacoes[x.id] = "sem");
  var ch = estado.chaves.filter(function (k) {
    return k.id === x.kid;
  })[0];
  if (!ch) return "semchave";
  if (ch.uid !== x.quemUid) return (verificacoes[x.id] = "falha");
  verificacoes[x.id] = "verificando";
  Cripto.verificar(ch.jwk, textoAssinado(x), x.assinatura)
    .then(function (ok) {
      verificacoes[x.id] = ok ? "ok" : "falha";
    })
    .catch(function () {
      verificacoes[x.id] = "falha";
    })
    .then(function () {
      if (estado.tab === "monitor") agendarRedesenho();
    });
  return "verificando";
}
var ROTULO_ASSINATURA = {
  ok: '<span class="ok">✔ Íntegra</span>',
  falha: '<span class="bad">✖ Inválida</span>',
  verificando: '<span class="hint">Verificando…</span>',
  sem: '<span class="hint">Sem assinatura</span>',
  semchave: '<span class="hint">Chave não encontrada</span>',
};
function desenharMonitoramento(p) {
  var n = function (k) {
      return estado.ch.filter(function (a) {
        return a.status === k;
      }).length;
    },
    td = dataDeHoje(),
    fim = function (a) {
      return a.membros.every(function (m) {
        return m.feito;
      });
    },
    atr = estado.at.filter(function (a) {
      return a.prazo && a.prazo < td && !fim(a);
    }).length,
    ok = estado.at.filter(fim).length,
    pc = { func: 0, diamante: 0, gestor: 0, ti: 0 };
  estado.us.forEach(function (u) {
    pc[u.perfil] = (pc[u.perfil] || 0) + 1;
  });
  var leve = document.documentElement.classList.contains("lite");
  var L = estado.au
    .slice()
    .sort(function (a, b) {
      return b.quando - a.quando;
    })
    .slice(0, leve ? 15 : 40);
  var res = L.map(function (x) {
      return verificarRegistro(x);
    }),
    integros = res.filter(function (r) {
      return r === "ok";
    }).length,
    invalidos = res.filter(function (r) {
      return r === "falha";
    }).length;
  var r = infoRede(),
    lat = latencias.length
      ? Math.round(
          latencias.reduce(function (s, x) {
            return s + x;
          }, 0) / latencias.length,
        )
      : null,
    carga = tempoDeCarregamento();
  comFocoPreservado(p, function () {
    p.innerHTML =
      '<h3>Visão geral do sistema (somente leitura)</h3><div class="cols">' +
    '<section class="col" aria-label="Rede e QoS"><h3>Rede e QoS</h3><p>Conexão: <strong>' +
    (navigator.onLine ? "online" : "offline") +
    "</strong><br>" +
    (r
      ? "Tipo efetivo: <strong>" +
        escaparHtml(r.tipo || "?") +
        "</strong><br>Latência estimada (RTT): <strong>" +
        r.rtt +
        " ms</strong><br>Banda estimada: <strong>" +
        r.banda +
        " Mbit/s</strong><br>Economia de dados: <strong>" +
        (r.economia ? "sim" : "não") +
        "</strong>"
      : '<span class="hint">Informações de rede indisponíveis neste navegador.</span>') +
    "<br>Modo leve: <strong>" +
    (leve ? "ativo" : "inativo") +
    '</strong></p><p class="hint">O navegador informa no máximo “4g”; redes 5G aparecem como 4g.</p></section>' +
    '<section class="col" aria-label="Desempenho"><h3>Desempenho</h3><p>Carregamento da página: <strong>' +
    (carga != null ? carga + " ms" : "—") +
    "</strong><br>Latência média de gravação na nuvem: <strong>" +
    (lat != null ? lat + " ms" : "—") +
    "</strong>" +
    (latencias.length ? " (últimas " + latencias.length + ")" : "") +
    "<br>Armazenamento: <strong>" +
    (fb ? "nuvem, tempo real" : "local, só esta aba") +
    "</strong></p></section>" +
    '<section class="col" aria-label="Usuários"><h3>Usuários (' +
    estado.us.length +
    ")</h3><p>Funcionários: " +
    pc.func +
    "<br>Representantes: " +
    pc.diamante +
    "<br>Gestores: " +
    pc.gestor +
    "<br>TI: " +
    pc.ti +
    "</p></section>" +
    '<section class="col" aria-label="Chamados"><h3>Chamados (' +
    estado.ch.length +
    ")</h3><p>Pendentes: " +
    n("pendente") +
    "<br>Na fila: " +
    n("confirmado") +
    "<br>Em atendimento: " +
    n("atendimento") +
    "<br>Atendidos: " +
    n("atendido") +
    "<br>Cancelados: " +
    n("cancelado") +
    "</p></section>" +
    '<section class="col" aria-label="Atividades"><h3>Atividades (' +
    estado.at.length +
    ")</h3><p>Concluídas: " +
    ok +
    "<br>Atrasadas: " +
    atr +
    "<br>Em andamento: " +
    (estado.at.length - ok - atr) +
    "</p></section></div>" +
    '<details class="card"><summary><strong>Arquitetura e segurança da solução</strong></summary><ul>' +
    "<li><strong>Front-end:</strong> GitHub Pages (hospedagem estática com CDN e HTTPS/TLS).</li>" +
    "<li><strong>Back-end como serviço (PaaS/BaaS):</strong> Firebase Authentication (login) e Cloud Firestore (dados em tempo real).</li>" +
    "<li><strong>Armazenamento:</strong> Firestore gerenciado pelo Google Cloud, com replicação automática (substitui SAN/NAS próprios).</li>" +
    "<li><strong>Firewall de aplicação:</strong> Regras do Firestore por perfil, com limite de frequência para novos chamados.</li>" +
    "<li><strong>Autenticação:</strong> e-mail e senha + segundo fator (MFA simulado no protótipo), sessão encerrada após 15 min sem atividade.</li>" +
    "<li><strong>Criptografia:</strong> TLS no transporte; assinatura digital RSA-PSS 2048 bits em cada registro de auditoria.</li>" +
    "<li><strong>Navegador:</strong> Content-Security-Policy restringe scripts e conexões aos domínios do próprio site e do Firebase.</li>" +
    "<li><strong>QoS:</strong> fila de chamados ordenada por prioridade, com envelhecimento; modo leve automático em redes lentas.</li>" +
    "</ul></details>" +
    '<h3 style="margin-top:1rem">Registro de auditoria (últimos ' +
    L.length +
    ")</h3>" +
    (L.length
      ? '<p class="hint">Assinaturas RSA: ' +
        integros +
        " íntegra(s), " +
        invalidos +
        " inválida(s).</p>" +
        '<div class="tw"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Perfil</th><th>Ação</th><th>Assinatura RSA</th></tr></thead><tbody>' +
        L.map(function (x, i) {
          return (
            "<tr><td>" +
            new Date(x.quando).toLocaleString("pt-BR") +
            "</td><td>" +
            escaparHtml(x.quem) +
            "</td><td>" +
            escaparHtml(NOME_DO_PERFIL[x.perfil] || x.perfil) +
            "</td><td>" +
            (/Falha|bloqueado/i.test(x.acao)
              ? '<span class="tag x">' + escaparHtml(x.acao) + "</span>"
              : escaparHtml(x.acao)) +
            "</td><td>" +
            ROTULO_ASSINATURA[res[i]] +
            "</td></tr>"
          );
        }).join("") +
        "</tbody></table></div>"
      : '<p class="hint">Nenhum evento registrado ainda.</p>');
  });
}

function desenharEquipe(p) {
  var L = estado.us.slice().sort(function (a, b) {
    return String(a.nome).localeCompare(String(b.nome));
  });
  comFocoPreservado(p, function () {
    p.innerHTML =
      '<h3>Equipe e perfis de acesso</h3><p class="hint">Novos cadastros entram como Funcionário. Somente o Gestor altera perfis; a mesma regra é aplicada no servidor pelas Regras do Firestore.</p>' +
    (L.length
      ? '<div class="tw"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>' +
        L.map(function (u) {
          var eu = u.id === estado.user.uid;
          return (
            "<tr><td>" +
            escaparHtml(u.nome) +
            (eu ? " (você)" : "") +
            "</td><td>" +
            escaparHtml(u.email || "—") +
            '</td><td><select id="pf-' +
            escaparHtml(u.id) +
            '" aria-label="Perfil de ' +
            escaparHtml(u.nome) +
            '"' +
            (eu ? " disabled" : "") +
            ">" +
            Object.keys(NOME_DO_PERFIL)
              .map(function (k) {
                return (
                  '<option value="' +
                  k +
                  '"' +
                  (u.perfil === k ? " selected" : "") +
                  ">" +
                  NOME_DO_PERFIL[k] +
                  "</option>"
                );
              })
              .join("") +
            "</select></td><td>" +
            (eu
              ? '<span class="hint">Seu próprio perfil não pode ser alterado aqui.</span>'
              : '<button class="sm pri" data-u="' +
                escaparHtml(u.id) +
                '" aria-label="Salvar perfil de ' +
                escaparHtml(u.nome) +
                '">Salvar</button>') +
            "</td></tr>"
          );
        }).join("") +
        "</tbody></table></div>"
      : '<p class="hint">Nenhum usuário cadastrado ainda.</p>');
  [].forEach.call(p.querySelectorAll("button[data-u]"), function (b) {
    b.onclick = function () {
      var id = b.dataset.u,
        novo = porId("pf-" + id).value,
        u = estado.us.filter(function (x) {
          return x.id === id;
        })[0];
      if (!u || u.perfil === novo) return anunciar("Nenhuma alteração para salvar");
      executarUmaVez("perfil-" + id, b, function () {
        return Dados.upd("usuarios", id, { perfil: novo }).then(function () {
          registrarAuditoria("Alterou o perfil de " + u.nome + " para " + NOME_DO_PERFIL[novo]);
          anunciar("Perfil de " + u.nome + " atualizado");
        });
      });
    };
  });
  });
}

function membrosPermitidos() {
  var a = ehGestor() ? ["func", "diamante"] : ["func"];
  return estado.us
    .filter(function (u) {
      return a.indexOf(u.perfil) >= 0;
    })
    .sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome));
    });
}
function opcoesDeMembros(sel) {
  return (
    '<option value="">Selecione o membro</option>' +
    membrosPermitidos()
      .map(function (u) {
        return (
          '<option value="' +
          escaparHtml(u.id) +
          '"' +
          (u.id === sel ? " selected" : "") +
          ">" +
          escaparHtml(u.nome) +
          " (" +
          (u.perfil === "func" ? "Funcionário" : "Representante") +
          ")</option>"
        );
      })
      .join("")
  );
}
function linhaDeMembro() {
  return (
    '<div class="mrow" style="display:grid;grid-template-columns:1fr 2fr;gap:.5rem;margin-top:.4rem"><select class="mn" aria-label="Membro">' +
    opcoesDeMembros("") +
    '</select><input type="text" class="mr" aria-label="Responsabilidade do membro" placeholder="Responsabilidade"></div>'
  );
}
function atualizarListasDeMembros() {
  [].forEach.call(document.querySelectorAll(".mn"), function (s) {
    var x = s.value;
    s.innerHTML = opcoesDeMembros(x);
  });
}
function atividadeVisivel(a) {
  var uid = estado.user.uid;
  return (
    ehGestor() ||
    ehTI() ||
    (a.membrosUids || []).indexOf(uid) >= 0 ||
    (ehRepresentante() && a.porUid === uid)
  );
}
function desenharAtividades(p) {
  if (!porId("al")) {
    var hint = ehTI()
      ? "Modo vigilância: você vê todas as atividades, sem poder alterá-las."
      : ehRepresentante()
        ? ""
        : "Seu perfil é de consulta: você vê as atividades em que foi indicado.";
    p.innerHTML =
      (podeAdministrar()
        ? '<h3>Nova atividade para uma equipe</h3><form id="fat" novalidate>' +
          (ehRepresentante()
            ? '<p class="hint">Como Representante, você atribui atividades somente a funcionários comuns.</p>'
            : "") +
          '<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div><label class="f" for="atl">Título</label><input type="text" id="atl"></div><div><label class="f" for="ate">Equipe</label><input type="text" id="ate" placeholder="Ex.: Equipe de Vendas"></div><div><label class="f" for="atp">Prazo</label><input type="date" id="atp" min="' +
          dataDeHoje() +
          '"></div></div><label class="f" for="atr">Requisitos de entrega</label><textarea id="atr" rows="2" placeholder="O que precisa estar pronto para a atividade ser aceita"></textarea><fieldset style="border:0;padding:0;margin:.8rem 0 0"><legend class="f">Membros e responsabilidades</legend><div id="mrows">' +
          linhaDeMembro() +
          linhaDeMembro() +
          '</div><div class="row"><button type="button" class="sm" id="addm">+ Adicionar membro</button>' +
          (fb
            ? ""
            : '<button type="button" class="sm" id="seedu">Carregar funcionários de exemplo</button>') +
          '</div><p class="hint">Só aparecem pessoas que já criaram conta no WorkLink.</p></fieldset><div id="e"></div><div class="row"><button type="submit" class="pri" id="adda">Criar atividade</button></div></form>'
        : '<p class="hint">' + hint + "</p>") + '<div id="al"></div>';
    if (porId("addm"))
      porId("addm").onclick = function () {
        porId("mrows").insertAdjacentHTML("beforeend", linhaDeMembro());
        var r = porId("mrows").querySelectorAll(".mn");
        r[r.length - 1].focus();
      };
    if (porId("seedu"))
      porId("seedu").onclick = function () {
        [
          ["Ana", "func"],
          ["Bruno", "func"],
          ["Carla", "func"],
          ["Diego", "diamante"],
        ].forEach(function (x) {
          Dados.set("usuarios", "ex-" + normalizar(x[0]), {
            nome: x[0],
            email: normalizar(x[0]) + "@exemplo.com",
            perfil: x[1],
            ultimo: Date.now(),
          });
        });
        anunciar("Funcionários de exemplo carregados");
      };
    if (porId("fat"))
      porId("fat").onsubmit = function (ev) {
        ev.preventDefault();
        if (estado.busy) return;
        var t = porId("atl").value.trim(),
          eq = porId("ate").value.trim(),
          pz = porId("atp").value,
          rq = porId("atr").value.trim(),
          m = [],
          seen = {},
          bad = "",
          permitidos = membrosPermitidos();
        [].forEach.call(porId("mrows").querySelectorAll(".mrow"), function (r) {
          var id = r.querySelector(".mn").value,
            x = r.querySelector(".mr").value.trim();
          if (id && x) {
            if (seen[id]) bad = "Cada membro só pode aparecer uma vez.";
            seen[id] = 1;
            var u = permitidos.filter(function (z) {
              return z.id === id;
            })[0];
            if (!u) bad = "Seu perfil não permite atribuir atividade a esse membro.";
            m.push({ uid: id, nome: u ? u.nome : "?", resp: x, feito: false });
          }
        });
        if (t.length < 3) return mostrarErro("Digite o título da atividade.", "atl");
        if (eq.length < 2) return mostrarErro("Informe a equipe responsável.", "ate");
        if (!pz) return mostrarErro("Defina o prazo da atividade.", "atp");
        if (rq.length < 3) return mostrarErro("Descreva os requisitos de entrega.", "atr");
        if (!m.length)
          return mostrarErro(
            permitidos.length
              ? "Escolha pelo menos um membro e escreva a responsabilidade dele."
              : "Ainda não há funcionários cadastrados. Peça para eles criarem conta no WorkLink.",
          );
        if (bad) return mostrarErro(bad);
        var b = porId("adda");
        ocupar(b, "Criando…");
        var id = "AT-" + Date.now().toString(36).toUpperCase();
        Dados.set("atividades", id, {
          titulo: t,
          equipe: eq,
          prazo: pz,
          requisitos: rq,
          membros: m,
          membrosUids: m.map(function (x) {
            return x.uid;
          }),
          criado: Date.now(),
          por: estado.user.nome,
          porUid: estado.user.uid,
        })
          .then(function () {
            registrarAuditoria("Criou a atividade " + id + " (" + t + ")");
            liberar(b);
            ["atl", "ate", "atp", "atr"].forEach(function (i) {
              porId(i).value = "";
            });
            porId("mrows").innerHTML = linhaDeMembro() + linhaDeMembro();
            porId("e").innerHTML =
              '<p class="hint" role="status">Atividade ' +
              id +
              " criada. A equipe já pode ver a sua parte.</p>";
            anunciar("Atividade criada");
          })
          .catch(function () {
            liberar(b);
            mostrarErro("Não foi possível criar a atividade. Tente novamente.");
          });
      };
  }
  atualizarListasDeMembros();
  var L = estado.at.filter(atividadeVisivel).sort(function (a, b) {
    return (a.prazo || "9").localeCompare(b.prazo || "9");
  });
  comFocoPreservado(porId("al"), function () {
    porId("al").innerHTML =
      '<h3 style="margin-top:1rem">' +
    (ehGestor() || ehTI()
      ? "Atividades das equipes"
      : podeAdministrar()
        ? "Atividades que você criou ou participa"
        : "Minhas atividades") +
    " (" +
    L.length +
    ")</h3>" +
    (L.length
      ? L.map(function (a) {
          var tot = a.membros.length,
            ok = a.membros.filter(function (x) {
              return x.feito;
            }).length,
            fim = ok === tot,
            atr = !fim && a.prazo && a.prazo < dataDeHoje(),
            mg = podeGerenciar(a);
          return (
            '<div class="task"><p><strong>' +
            escaparHtml(a.titulo) +
            "</strong> " +
            (fim
              ? '<span class="tag c">Concluída</span>'
              : atr
                ? '<span class="tag x">Atrasada</span>'
                : '<span class="tag">Em andamento</span>') +
            '</p><p class="hint">' +
            escaparHtml(a.id) +
            " · " +
            escaparHtml(a.equipe) +
            " · prazo " +
            formatarData(a.prazo) +
            " · criada por " +
            escaparHtml(a.por) +
            "</p><p><strong>Requisitos:</strong> " +
            escaparHtml(a.requisitos) +
            "</p><p>Progresso: " +
            ok +
            " de " +
            tot +
            ' partes concluídas <progress max="' +
            tot +
            '" value="' +
            ok +
            '" aria-label="Progresso de ' +
            escaparHtml(a.titulo) +
            '"></progress></p><ul style="margin:.3rem 0;padding-left:1.2rem">' +
            a.membros
              .map(function (x, i) {
                return (
                  "<li>" +
                  (x.feito ? '<span aria-hidden="true">✔ </span>' : "") +
                  "<strong>" +
                  escaparHtml(x.nome) +
                  "</strong>: " +
                  escaparHtml(x.resp) +
                  (x.feito
                    ? ' <span class="tag c">Feito</span>'
                    : ' <span class="tag">Pendente</span>') +
                  (mg && !x.feito
                    ? ' <button class="sm pri" data-a="' +
                      escaparHtml(a.id) +
                      '" data-i="' +
                      i +
                      '" aria-label="Marcar a parte de ' +
                      escaparHtml(x.nome) +
                      " em " +
                      escaparHtml(a.titulo) +
                      ' como feita">Marcar como feito</button>'
                    : "") +
                  "</li>"
                );
              })
              .join("") +
            "</ul>" +
            (mg
              ? '<button class="sm" data-x="' +
                escaparHtml(a.id) +
                '" aria-label="Excluir atividade ' +
                escaparHtml(a.titulo) +
                '">Excluir atividade</button>'
              : "") +
            "</div>"
          );
        }).join("")
      : '<p class="hint">Nenhuma atividade para mostrar.</p>');
  [].forEach.call(porId("al").querySelectorAll("button"), function (b) {
    b.onclick = function () {
      if (b.dataset.x) {
        if (!confirmarClique(b, "Confirmar exclusão?")) return;
        var idx = b.dataset.x;
        return executarUmaVez("at-" + idx, b, function () {
          return Dados.del("atividades", idx).then(function () {
            registrarAuditoria("Excluiu a atividade " + idx);
            anunciar("Atividade excluída");
          });
        });
      }
      var a = estado.at.filter(function (z) {
        return z.id === b.dataset.a;
      })[0];
      if (!a || !podeGerenciar(a)) return;
      var i = Number(b.dataset.i);
      executarUmaVez("at-" + a.id, b, function () {
        var m = a.membros.map(function (x, j) {
          return j === i ? Object.assign({}, x, { feito: true }) : x;
        });
        return Dados.upd("atividades", a.id, { membros: m }).then(function () {
          registrarAuditoria(
            "Marcou a parte de " + a.membros[i].nome + " como concluída em " + a.id,
          );
          anunciar("Parte marcada como concluída");
        });
      });
    };
  });
  });
}

function etiquetaStatus(st) {
  var m = {
    pendente: ["", "Pendente"],
    confirmado: ["c", "Na fila"],
    atendimento: ["c", "Em atendimento"],
    atendido: ["c", "Atendido"],
    cancelado: ["x", "Cancelado"],
  }[st] || ["", st];
  return '<span class="tag ' + m[0] + '">' + m[1] + "</span>";
}
function etiquetaPrioridade(p) {
  return (
    '<span class="tag' + (p === "Alta" ? " x" : "") + '">Prioridade ' + escaparHtml(p) + "</span>"
  );
}
function botaoDeAcao(id, s, t, tt, pri) {
  return (
    '<button class="sm' +
    (pri ? " pri" : "") +
    '" data-s="' +
    s +
    '" data-id="' +
    escaparHtml(id) +
    '" aria-label="' +
    t +
    " chamado " +
    escaparHtml(tt) +
    '">' +
    t +
    "</button> "
  );
}

function pesoQoS(a, agora) {
  var p = PESO_PRIORIDADE[a.prio];
  if (p == null) p = 1;
  var espera = agora - (a.confirmadoEm || agora);
  return Math.max(0, p - Math.floor(espera / ENVELHECIMENTO_MS));
}
function ordenarFila(lista) {
  var agora = Date.now();
  return lista.slice().sort(function (a, b) {
    var ea = a.status === "atendimento" ? 0 : 1,
      eb = b.status === "atendimento" ? 0 : 1;
    return (
      ea - eb ||
      pesoQoS(a, agora) - pesoQoS(b, agora) ||
      (a.confirmadoEm || 0) - (b.confirmadoEm || 0)
    );
  });
}
function filaDeAtendimento() {
  return ordenarFila(
    estado.ch.filter(function (a) {
      return a.status === "confirmado" || a.status === "atendimento";
    }),
  );
}
var ultimoChamado = 0;
function desenharChamados(p) {
  if (!porId("cl")) {
    p.innerHTML = ehTI()
      ? '<p class="hint">Modo vigilância: você vê todos os chamados, sem poder alterá-los.</p><div id="cl"></div>'
      : '<h3>Pedir ajuda: abrir chamado</h3><form id="fch" novalidate><div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div><label class="f" for="ctt">Título</label><input type="text" id="ctt" maxlength="120"></div><div><label class="f" for="cct">Categoria</label><select id="cct">' +
        CATEGORIAS.map(function (c) {
          return "<option>" + c + "</option>";
        }).join("") +
        '</select></div><div><label class="f" for="cpr">Prioridade</label><select id="cpr">' +
        PRIORIDADES.map(function (c, i) {
          return "<option" + (i === 1 ? " selected" : "") + ">" + c + "</option>";
        }).join("") +
        '</select></div></div><label class="f" for="cds">Descrição do problema</label><textarea id="cds" rows="3" maxlength="2000"></textarea><div id="e"></div><div class="row"><button type="submit" class="pri" id="addc">Abrir chamado</button>' +
        (podeAdministrar() && !fb ? '<button type="button" id="seed">Carregar exemplos</button>' : "") +
        '</div></form><div id="cl"></div>';
    if (porId("fch"))
      porId("fch").onsubmit = function (ev) {
        ev.preventDefault();
        if (estado.busy) return;
        var t = porId("ctt").value.trim(),
          d = porId("cds").value.trim();
        if (t.length < 3) return mostrarErro("Digite um título para o chamado.", "ctt");
        if (d.length < 5)
          return mostrarErro("Descreva o problema para a equipe conseguir ajudar.", "cds");
        if (Date.now() - ultimoChamado < INTERVALO_CHAMADOS_MS)
          return mostrarErro("Aguarde alguns segundos antes de abrir outro chamado.");
        var b = porId("addc");
        ocupar(b, "Enviando…");
        var id = "CH-" + Date.now().toString(36).toUpperCase();
        Dados.criarComLimite("chamados", id, {
          titulo: t,
          cat: porId("cct").value,
          prio: porId("cpr").value,
          desc: d,
          status: "pendente",
          criado: Date.now(),
          por: estado.user.nome,
          porUid: estado.user.uid,
        })
          .then(function () {
            ultimoChamado = Date.now();
            registrarAuditoria("Abriu o chamado " + id + " (" + t + ")");
            liberar(b);
            porId("ctt").value = "";
            porId("cds").value = "";
            porId("e").innerHTML =
              '<p class="hint" role="status">Chamado ' +
              id +
              " aberto. Acompanhe o status abaixo.</p>";
            anunciar("Chamado aberto");
          })
          .catch(function (e) {
            liberar(b);
            mostrarErro(
              e && (e.code === "limite" || e.code === "permission-denied")
                ? "Aguarde alguns segundos antes de abrir outro chamado."
                : "Não foi possível abrir o chamado. Tente novamente.",
            );
          });
      };
    if (porId("seed"))
      porId("seed").onclick = function () {
        [
          ["Notebook não liga", "Ana", "TI e suporte", "Alta"],
          ["Acesso à VPN bloqueado", "Bruno", "TI e suporte", "Média"],
          ["Segunda via de holerite", "Carla", "Recursos Humanos", "Baixa"],
        ].forEach(function (x, i) {
          Dados.set("chamados", "CH-EX" + Date.now().toString(36).toUpperCase() + i, {
            titulo: x[0],
            cat: x[2],
            prio: x[3],
            desc: "Exemplo de demonstração.",
            status: "pendente",
            criado: Date.now() + i,
            por: x[1],
            porUid: "ex-" + normalizar(x[1]),
          });
        });
        anunciar("Exemplos carregados");
      };
  }
  var h = "";
  if (ehFuncionario()) {
    var L = estado.ch
        .filter(function (a) {
          return a.porUid === estado.user.uid;
        })
        .sort(function (a, b) {
          return b.criado - a.criado;
        }),
      espera = ordenarFila(
        estado.fila.filter(function (x) {
          return x.status === "confirmado";
        }),
      );
    h =
      '<h3 style="margin-top:1rem">Meus chamados (' +
      L.length +
      ")</h3>" +
      (L.length
        ? L.map(function (a) {
            var pos = espera.findIndex(function (x) {
              return x.id === a.id;
            });
            return (
              '<div class="task"><p><strong>' +
              escaparHtml(a.titulo) +
              "</strong> " +
              etiquetaStatus(a.status) +
              '</p><p class="hint">' +
              escaparHtml(a.id) +
              " · " +
              escaparHtml(a.cat) +
              " · " +
              etiquetaPrioridade(a.prio) +
              "</p>" +
              (a.status === "confirmado" && pos >= 0
                ? "<p>Posição na fila de atendimento: <strong>" + (pos + 1) + "</strong></p>"
                : "") +
              (a.status === "atendimento"
                ? "<p>Sendo atendido por <strong>" +
                  escaparHtml(a.atendente || "equipe") +
                  "</strong>.</p>"
                : "") +
              "</div>"
            );
          }).join("")
        : '<p class="hint">Você ainda não abriu chamados.</p>') +
      '<p class="hint">Seu perfil só pede ajuda. Representantes e Gestores administram os chamados. A fila prioriza chamados de prioridade Alta.</p>';
  } else {
    var ro = ehTI(),
      pend = estado.ch
        .filter(function (a) {
          return a.status === "pendente";
        })
        .sort(function (a, b) {
          return (
            (PESO_PRIORIDADE[a.prio] || 0) - (PESO_PRIORIDADE[b.prio] || 0) || a.criado - b.criado
          );
        }),
      fl = filaDeAtendimento(),
      enc = estado.ch.filter(function (a) {
        return a.status === "atendido" || a.status === "cancelado";
      });
    h =
      '<h3 style="margin-top:1rem">Fila de atendimento (' +
      fl.length +
      ")</h3>" +
      (fl.length
        ? '<div class="tw"><table><caption class="hint" style="text-align:left">Ordem QoS: prioridade Alta primeiro; na mesma prioridade, ordem de confirmação. A cada 30 min de espera o chamado sobe um nível.</caption><thead><tr><th>Nº</th><th>Chamado</th><th>Aberto por</th><th>Status</th>' +
          (ro ? "" : "<th>Ação</th>") +
          "</tr></thead><tbody>" +
          fl
            .map(function (a, i) {
              var ac = ro
                ? ""
                : "<td>" +
                  (a.status === "atendimento"
                    ? botaoDeAcao(a.id, "atendido", "Concluir", a.titulo, 1)
                    : botaoDeAcao(a.id, "atendimento", "Chamar", a.titulo, 1)) +
                  botaoDeAcao(a.id, "cancelado", "Cancelar", a.titulo) +
                  "</td>";
              return (
                "<tr><td><strong>" +
                (i + 1) +
                "</strong></td><td>" +
                escaparHtml(a.titulo) +
                '<br><span class="hint">' +
                escaparHtml(a.id) +
                " · " +
                escaparHtml(a.cat) +
                "</span><br>" +
                etiquetaPrioridade(a.prio) +
                "</td><td>" +
                escaparHtml(a.por) +
                "</td><td>" +
                etiquetaStatus(a.status) +
                (a.atendente
                  ? '<br><span class="hint">' + escaparHtml(a.atendente) + "</span>"
                  : "") +
                "</td>" +
                ac +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="hint">A fila está vazia.</p>');
    h +=
      '<h3 style="margin-top:1rem">Chamados pendentes (' +
      pend.length +
      ")</h3>" +
      (pend.length
        ? '<div class="tw"><table><thead><tr><th>Chamado</th><th>Descrição</th><th>Aberto por</th>' +
          (ro ? "" : "<th>Ação</th>") +
          "</tr></thead><tbody>" +
          pend
            .map(function (a) {
              return (
                "<tr><td>" +
                escaparHtml(a.titulo) +
                '<br><span class="hint">' +
                escaparHtml(a.id) +
                " · " +
                escaparHtml(a.cat) +
                "</span><br>" +
                etiquetaPrioridade(a.prio) +
                "</td><td>" +
                escaparHtml(a.desc) +
                "</td><td>" +
                escaparHtml(a.por) +
                "</td>" +
                (ro
                  ? ""
                  : "<td>" +
                    botaoDeAcao(a.id, "confirmado", "Confirmar", a.titulo, 1) +
                    botaoDeAcao(a.id, "cancelado", "Cancelar", a.titulo) +
                    "</td>") +
                "</tr>"
              );
            })
            .join("") +
          "</tbody></table></div>"
        : '<p class="hint">Nenhum chamado pendente.</p>');
    if (enc.length)
      h +=
        '<h3 style="margin-top:1rem">Encerrados (' +
        enc.length +
        ")</h3><ul>" +
        enc
          .map(function (a) {
            return (
              "<li>" +
              escaparHtml(a.titulo) +
              " (" +
              escaparHtml(a.por) +
              ") " +
              etiquetaStatus(a.status) +
              "</li>"
            );
          })
          .join("") +
        "</ul>";
  }
  comFocoPreservado(porId("cl"), function () {
    porId("cl").innerHTML = h;
    [].forEach.call(porId("cl").querySelectorAll("button[data-s]"), function (b) {
    b.onclick = function () {
      if (!podeAdministrar()) return;
      var id = b.dataset.id,
        st = b.dataset.s,
        c = estado.ch.filter(function (x) {
          return x.id === id;
        })[0];
      if (!c) return;
      if (st === "cancelado" && !confirmarClique(b, "Confirmar cancelamento?")) return;
      executarUmaVez("ch-" + id, b, function () {

        var up = { status: st },
          ops;
        if (st === "confirmado") {
          up.confirmadoEm = Date.now();
          ops = [
            ["upd", "chamados", id, up],
            ["set", "fila", id, { prio: c.prio, confirmadoEm: up.confirmadoEm, status: st }],
          ];
        } else if (st === "atendimento") {
          up.atendente = estado.user.nome;
          up.atendenteUid = estado.user.uid;
          ops = [
            ["upd", "chamados", id, up],
            [
              "merge",
              "fila",
              id,
              { prio: c.prio, confirmadoEm: c.confirmadoEm || Date.now(), status: st },
            ],
          ];
        } else {
          ops = [
            ["upd", "chamados", id, up],
            ["del", "fila", id],
          ];
        }
        return Dados.lote(ops).then(function () {
          registrarAuditoria(
            "Chamado " +
              id +
              ": " +
              {
                confirmado: "confirmou (entrou na fila)",
                atendimento: "chamou para atendimento",
                atendido: "concluiu",
                cancelado: "cancelou",
              }[st],
          );
          anunciar(
            st === "confirmado" ? "Chamado adicionado à fila de atendimento" : "Status atualizado",
          );
        });
      });
    };
  });
  });
}

function desenharMural(p) {
  if (!porId("pl")) {
    p.innerHTML =
      (podeAdministrar()
        ? '<h3>Novo comunicado</h3><form id="fmu" novalidate><label class="f" for="ptx">Mensagem</label><textarea id="ptx" rows="3" maxlength="2000"></textarea><div class="chk"><input type="checkbox" id="pim"><label for="pim">Marcar como importante</label></div><div id="e"></div><div class="row"><button type="submit" class="pri" id="addp">Publicar</button></div></form>'
        : '<p class="hint">Somente Representantes e Gestores publicam comunicados.</p>') +
      '<div id="pl"></div>';
    if (porId("fmu"))
      porId("fmu").onsubmit = function (ev) {
        ev.preventDefault();
        if (estado.busy) return;
        var t = porId("ptx").value.trim();
        if (t.length < 3) return mostrarErro("Escreva a mensagem do comunicado.", "ptx");
        var b = porId("addp");
        ocupar(b, "Publicando…");
        Dados.set("posts", gerarId(), {
          texto: t,
          imp: porId("pim").checked,
          autor: estado.user.nome,
          autorUid: estado.user.uid,
          criado: Date.now(),
        })
          .then(function () {
            registrarAuditoria("Publicou um comunicado");
            liberar(b);
            porId("ptx").value = "";
            porId("pim").checked = false;
            porId("e").innerHTML = "";
            anunciar("Comunicado publicado");
          })
          .catch(function () {
            liberar(b);
            mostrarErro("Não foi possível publicar.");
          });
      };
  }
  var L = estado.posts.slice().sort(function (a, b) {
    return b.criado - a.criado;
  });
  porId("pl").innerHTML =
    '<h3 style="margin-top:1rem">Comunicados (' +
    L.length +
    ")</h3>" +
    (L.length
      ? L.map(function (x) {
          return (
            '<div class="post' +
            (x.imp ? " imp" : "") +
            '">' +
            (x.imp ? '<span class="tag x">Importante</span> ' : "") +
            escaparHtml(x.texto) +
            '<br><span class="hint">' +
            escaparHtml(x.autor) +
            " · " +
            new Date(x.criado).toLocaleString("pt-BR") +
            "</span></div>"
          );
        }).join("")
      : '<p class="hint">Nenhum comunicado ainda.</p>');
}
function desenharDocumentos(p) {
  p.innerHTML =
    '<h3>Central de documentos</h3><p class="hint">Você vê o que seu perfil permite. Itens restritos aparecem bloqueados.</p><ul class="docs">' +
    DOCUMENTOS.map(function (d, i) {
      var ok = podeVerDocumento(d.lv);
      return (
        '<li><span class="' +
        (ok ? "" : "lock") +
        '"><span aria-hidden="true">' +
        (ok ? "📄 " : "🔒 ") +
        "</span>" +
        escaparHtml(d.n) +
        (ok ? "" : " (requer perfil " + NIVEL_DESCRICAO[d.lv] + ")") +
        "</span>" +
        (ok
          ? '<button class="sm" data-o="' +
            i +
            '" aria-label="Abrir ' +
            escaparHtml(d.n) +
            '">Abrir</button>'
          : "") +
        "</li>"
      );
    }).join("") +
    '</ul><p id="e" class="hint"></p>';
  [].forEach.call(p.querySelectorAll("button"), function (b) {
    b.onclick = function () {
      registrarAuditoria("Abriu o documento " + DOCUMENTOS[b.dataset.o].n);
      porId("e").textContent =
        "Download simulado: arquivo enviado por conexão criptografada (TLS).";
      anunciar("Download simulado");
    };
  });
}

var ABAS_AFETADAS = {
    chamados: ["chamados", "monitor"],
    atividades: ["atividades", "monitor"],
    posts: ["mural"],
    usuarios: ["atividades", "monitor", "equipe"],
    auditoria: ["monitor"],
    chaves: ["monitor"],
    fila: ["chamados"],
  },
  CHAVE_DO_ESTADO = {
    chamados: "ch",
    atividades: "at",
    posts: "posts",
    usuarios: "us",
    auditoria: "au",
    chaves: "chaves",
    fila: "fila",
  };

function assinarDados() {
  estado.unsubs.forEach(function (u) {
    u && u();
  });
  estado.unsubs = [];
  var uid = estado.user.uid,
    func = ehFuncionario(),
    plano = [
      ["chamados", func ? ["porUid", "==", uid] : null],
      ["atividades", func ? ["membrosUids", "array-contains", uid] : null],
      ["posts", null],
    ];
  if (func) plano.push(["fila", null]);
  else plano.push(["usuarios", null]);
  if (ehTI()) plano.push(["auditoria", null], ["chaves", null]);
  plano.forEach(function (x) {
    var n = x[0];
    estado.unsubs.push(
      Dados.sub(
        n,
        function (l) {
          estado[CHAVE_DO_ESTADO[n]] = l;
          if (estado.user && ABAS_AFETADAS[n].indexOf(estado.tab) >= 0) desenharAbaAtual();
        },
        x[1],
      ),
    );
  });
}
function aoEnviarLogin() {
  if (estado.busy) return;
  var cad = estado.cadastro,
    email = normalizar(porId("em").value),
    senha = porId("pw").value,
    nome = cad ? porId("nm").value.trim() : "";
  if (cad && nome.length < 2) return mostrarErro("Digite seu nome.", "nm");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return mostrarErro("Digite um e-mail válido.", "em");
  if (cad) {
    if (senha.length < 8 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha))
      return mostrarErro("A senha precisa ter pelo menos 8 caracteres, com letras e números.", "pw");
    if (senha !== porId("pw2").value) return mostrarErro("As senhas não conferem.", "pw2");
  } else if (!senha) return mostrarErro("Digite sua senha.", "pw");
  var perfilLocal = cad && !NUVEM_CONFIGURADA ? porId("pf").value : null,
    b = porId("l1");
  ocupar(b, cad ? "Criando conta…" : "Verificando…");
  firebasePronto
    .then(function () {
      if (NUVEM_CONFIGURADA && !fb) throw { code: "sem-nuvem" };
      return cad ? Autenticacao.cadastrar(email, senha) : Autenticacao.entrar(email, senha);
    })
    .then(function (c) {
      return Dados.get("usuarios", c.uid).then(function (doc) {
        estado.tmp = {
          uid: c.uid,
          email: c.email,
          nome: doc ? doc.nome : nome || c.email.split("@")[0],
          perfil: doc ? doc.perfil : perfilLocal || "func",
          novo: !doc,
        };
        Cripto.preparar(c.uid);
        iniciarMFA();
        estado.busy = false;
        estado.auth = 1;
        ultimaAtividade = Date.now();
        desenharTela();
      });
    })
    .catch(function (e) {
      console.warn(e);
      liberar(b);
      if (fb && fb.auth.currentUser) Autenticacao.sair();
      mostrarErro(mensagemErroAuth(e));
    });
}
function aoVerificarMFA() {
  if (estado.busy) return;
  var m = estado.mfa,
    v = porId("cd").value.trim();
  if (!/^\d{6}$/.test(v)) return mostrarErro("Digite os 6 dígitos do código.", "cd");
  if (Date.now() > m.expira) return mostrarErro("O código expirou. Peça um novo código.", "nv");
  if (v !== m.codigo) {
    m.tentativas++;
    registrarAuditoria(
      "Falha de MFA (código incorreto, tentativa " + m.tentativas + " de " + MFA_MAX_TENTATIVAS + ")",
    );
    if (m.tentativas >= MFA_MAX_TENTATIVAS) {
      estado.busy = true;
      return registrarAuditoria("Login bloqueado: excesso de tentativas de MFA").then(function () {
        return encerrarSessao("Muitas tentativas incorretas. Por segurança, faça login novamente.");
      });
    }
    if (porId("mfatr"))
      porId("mfatr").textContent =
        "Tentativas restantes: " + (MFA_MAX_TENTATIVAS - m.tentativas);
    porId("cd").value = "";
    return mostrarErro(
      "Código incorreto. Restam " + (MFA_MAX_TENTATIVAS - m.tentativas) + " tentativa(s).",
      "cd",
    );
  }
  var u = estado.tmp,
    b = porId("l2");
  ocupar(b, "Entrando…");
  var p = u.novo
    ? Dados.set("usuarios", u.uid, {
        nome: u.nome,
        email: u.email,
        perfil: u.perfil,
        ultimo: Date.now(),
      })
    : Dados.upd("usuarios", u.uid, { ultimo: Date.now() });
  p.then(function () {
    pararContagemMFA();
    estado.user = { uid: u.uid, nome: u.nome, email: u.email, perfil: u.perfil };
    estado.tmp = null;
    estado.mfa = null;
    estado.auth = 0;
    estado.busy = false;
    estado.tab = ehTI() ? "monitor" : "atividades";
    registrarAuditoria("Login realizado (senha + MFA)");
    assinarDados();
    desenharTela();
    anunciar("Login realizado como " + NOME_DO_PERFIL[estado.user.perfil]);
  }).catch(function (e) {
    console.warn(e);
    liberar(b);
    mostrarErro("Não foi possível concluir o login. Tente novamente.");
  });
}
function ligarEventos() {
  if (porId("flogin"))
    porId("flogin").onsubmit = function (ev) {
      ev.preventDefault();
      aoEnviarLogin();
    };
  if (porId("alt"))
    porId("alt").onclick = function () {
      estado.cadastro = !estado.cadastro;
      desenharTela();
    };
  if (porId("fmfa"))
    porId("fmfa").onsubmit = function (ev) {
      ev.preventDefault();
      aoVerificarMFA();
    };
  if (porId("l0"))
    porId("l0").onclick = function () {
      encerrarSessao();
    };
  if (porId("nv"))
    porId("nv").onclick = function () {
      var m = estado.mfa;
      if (m.envios >= MFA_MAX_ENVIOS) {
        return registrarAuditoria("Login bloqueado: limite de reenvios de MFA").then(function () {
          return encerrarSessao("Limite de reenvios atingido. Faça login novamente.");
        });
      }
      m.codigo = gerarCodigoMFA();
      m.expira = Date.now() + MFA_VALIDADE_MS;
      m.envios++;
      desenharTela();
      anunciar("Novo código enviado");
    };
  if (porId("out"))
    porId("out").onclick = function () {
      this.disabled = true;
      registrarAuditoria("Logout").then(function () {
        encerrarSessao();
      });
    };
  [].forEach.call(document.querySelectorAll('[role="tab"]'), function (b, i, all) {
    b.onclick = function () {
      estado.tab = b.dataset.t;
      desenharTela();
      var n = porId("t-" + estado.tab);
      if (n) n.focus();
    };
    b.onkeydown = function (e) {
      var k = e.key,
        j =
          k === "ArrowRight"
            ? i + 1
            : k === "ArrowLeft"
              ? i - 1
              : k === "Home"
                ? 0
                : k === "End"
                  ? all.length - 1
                  : -1;
      if (j < 0 && k !== "ArrowLeft") return;
      e.preventDefault();
      all[(j + all.length) % all.length].click();
    };
  });
}

function lerPref(k) {
  try {
    return localStorage.getItem("wl-" + k);
  } catch (e) {
    return null;
  }
}
function salvarPref(k, v) {
  try {
    localStorage.setItem("wl-" + k, String(v));
  } catch (e) {}
}
porId("fp").onclick = function () {
  mudarFonte(2);
};
porId("fm").onclick = function () {
  mudarFonte(-2);
};
var tamanhoDaFonte = Number(lerPref("fs")) || 17;
if (tamanhoDaFonte !== 17) mudarFonte(0);
function mudarFonte(d) {
  tamanhoDaFonte = Math.max(14, Math.min(28, tamanhoDaFonte + d));
  document.documentElement.style.setProperty("--fs", tamanhoDaFonte + "px");
  salvarPref("fs", tamanhoDaFonte);
}
function aplicarContraste(on) {
  if (on) document.documentElement.setAttribute("data-contrast", "1");
  else document.documentElement.removeAttribute("data-contrast");
  porId("ct").setAttribute("aria-pressed", on);
}
if (lerPref("ct") === "1") aplicarContraste(true);
porId("ct").onclick = function () {
  var on = document.documentElement.getAttribute("data-contrast") !== "1";
  aplicarContraste(on);
  salvarPref("ct", on ? "1" : "0");
};

var prefLeve = lerPref("lt"),
  modoLeveManual = prefLeve !== null;
function aplicarModoLeve(on, mensagem) {
  document.documentElement.classList.toggle("lite", on);
  porId("lt").setAttribute("aria-pressed", on);
  if (mensagem) anunciar(mensagem);
}
if (prefLeve === "1") aplicarModoLeve(true, "");
porId("lt").onclick = function () {
  modoLeveManual = true;
  var on = !document.documentElement.classList.contains("lite");
  aplicarModoLeve(on, on ? "Modo leve ativado" : "Modo leve desativado");
  salvarPref("lt", on ? "1" : "0");
};
function avaliarRede() {
  var r = infoRede();
  if (r && !modoLeveManual) {
    var lenta = r.economia || r.tipo === "slow-2g" || r.tipo === "2g",
      ativo = document.documentElement.classList.contains("lite");
    if (lenta !== ativo)
      aplicarModoLeve(
        lenta,
        lenta ? "Rede lenta detectada: modo leve ativado automaticamente" : "",
      );
  }
  if (estado.user && estado.tab === "monitor") agendarRedesenho();
}
var conexao = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
if (conexao && conexao.addEventListener) conexao.addEventListener("change", avaliarRede);

var ultimaAtividade = Date.now();
["click", "keydown", "pointerdown", "touchstart"].forEach(function (ev) {
  document.addEventListener(
    ev,
    function () {
      ultimaAtividade = Date.now();
    },
    { passive: true },
  );
});
setInterval(function () {
  if ((estado.user || estado.auth === 1) && Date.now() - ultimaAtividade > LIMITE_INATIVIDADE_MS) {
    ultimaAtividade = Date.now();
    registrarAuditoria("Sessão encerrada por inatividade").then(function () {
      encerrarSessao("Sua sessão foi encerrada após 15 minutos sem atividade.");
    });
  }
}, 30000);

function verificarConexao() {
  porId("net").hidden = navigator.onLine;
  if (estado.user && estado.tab === "monitor") agendarRedesenho();
}
window.addEventListener("online", verificarConexao);
window.addEventListener("offline", verificarConexao);
verificarConexao();
avaliarRede();
desenharTela();
