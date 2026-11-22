/*
 * WorkLink - Plataforma Corporativa de Gestão e Comunicação Remota
 * Disciplina: Desenvolvimento de Soluções Remotas
 *
 * Organização do arquivo:
 *   1. Constantes e estado da aplicação
 *   2. Funções auxiliares
 *   3. Camada de dados (Firebase Firestore, com modo local de reserva)
 *   4. Telas: login, monitoramento, atividades, chamados, mural e documentos
 *   5. Eventos, acessibilidade e conexão
 *   6. Configuração do Firebase (no final do arquivo)
 *   7. Se algo cair é culpa do vasco e não foi David que escreveu isso
 */

var CODIGO_MFA = "123456";
var NOME_DO_PERFIL = {
  func: "Funcionário",
  diamante: "Representante Diamante 💎",
  gestor: "Gestor",
  ti: "TI (monitoramento)",
};
var CATEGORIAS = ["TI e suporte", "Recursos Humanos", "Financeiro", "Infraestrutura"],
  PRIORIDADES = ["Baixa", "Média", "Alta"];
var DOCUMENTOS = [
  {
    n: "Manual do colaborador.pdf",
    lv: 1,
  },
  {
    n: "Política de segurança da informação.pdf",
    lv: 1,
  },
  {
    n: "Planejamento trimestral.xlsx",
    lv: 2,
  },
  {
    n: "Contratos e folha de pagamento.pdf",
    lv: 3,
  },
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
var estado = {
  user: null,
  auth: 0,
  tmp: "",
  tab: "atividades",
  ch: [],
  at: [],
  posts: [],
  us: [],
  au: [],
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
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
    }[c];
  });
}
function mostrarErro(m, f) {
  porId("e").innerHTML = '<p class="err" role="alert">' + escaparHtml(m) + "</p>";
  anunciar(m);
  if (f && porId(f)) porId(f).focus();
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
function podeAdministrar() {
  return ehGestor() || ehRepresentante();
}
function podeGerenciar(a) {
  return ehGestor() || (ehRepresentante() && a.por === estado.user.nome);
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
    d.getFullYear() +
    "-" +
    ("0" + (d.getMonth() + 1)).slice(-2) +
    "-" +
    ("0" + d.getDate()).slice(-2)
  );
}
function formatarData(d) {
  return d ? d.split("-").reverse().join("/") : "sem prazo";
}
function gerarId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/* ---- camada de dados: nuvem (db) ou local ---- */
var banco = null,
  COLECOES = ["chamados", "posts", "atividades", "usuarios", "auditoria"],
  memoriaLocal = {},
  ouvintesLocais = {};
COLECOES.forEach(function (n) {
  memoriaLocal[n] = {};
  ouvintesLocais[n] = [];
});
function listarMemoria(n) {
  return Object.keys(memoriaLocal[n]).map(function (k) {
    return Object.assign(
      {
        id: k,
      },
      memoriaLocal[n][k],
    );
  });
}
function avisarOuvintes(n) {
  ouvintesLocais[n].forEach(function (f) {
    f(listarMemoria(n));
  });
}
var Dados = {
  sub: function (n, cb) {
    if (banco)
      return banco.collection(n).onSnapshot(
        function (sn) {
          cb(
            sn.docs.map(function (d) {
              return Object.assign(
                {
                  id: d.id,
                },
                d.data(),
              );
            }),
          );
        },
        function () {
          cb(listarMemoria(n));
        },
      );
    ouvintesLocais[n].push(cb);
    cb(listarMemoria(n));
    return function () {
      ouvintesLocais[n] = ouvintesLocais[n].filter(function (f) {
        return f !== cb;
      });
    };
  },
  set: function (n, id, o) {
    if (banco) return banco.collection(n).doc(id).set(o);
    memoriaLocal[n][id] = o;
    avisarOuvintes(n);
    return Promise.resolve();
  },
  upd: function (n, id, o) {
    if (banco) return banco.collection(n).doc(id).update(o);
    Object.assign(memoriaLocal[n][id], o);
    avisarOuvintes(n);
    return Promise.resolve();
  },
  del: function (n, id) {
    if (banco) return banco.collection(n).doc(id).delete();
    delete memoriaLocal[n][id];
    avisarOuvintes(n);
    return Promise.resolve();
  },
};
function registrarAuditoria(a) {
  var u = estado.user || estado.tmp || {};
  Dados.set("auditoria", "L" + gerarId(), {
    quem: u.nome || "?",
    perfil: u.perfil || "?",
    acao: a,
    quando: Date.now(),
  });
}

/* ---- telas ---- */
function abasDoPerfil() {
  var t = [
    ["atividades", "Atividades"],
    ["chamados", "Chamados"],
    ["mural", "Mural"],
    ["docs", "Documentos"],
  ];
  if (ehTI()) t.unshift(["monitor", "Monitoramento"]);
  return t;
}
function desenharTela() {
  var h = "";
  if (!estado.user) {
    h =
      '<div class="card narrow"><h2 tabindex="-1" id="ttl">Entrar no WorkLink</h2>' +
      (estado.auth === 0
        ? '<label class="f" for="nm">Seu nome</label><input type="text" id="nm" autocomplete="name">' +
          '<label class="f" for="pf">Perfil de acesso (demonstração)</label><select id="pf"><option value="func">Funcionário</option><option value="diamante">Representante Diamante 💎</option><option value="gestor">Gestor</option><option value="ti">TI (monitoramento)</option></select>' +
          '<label class="f" for="pw">Senha</label><input type="password" id="pw" autocomplete="current-password">' +
          '<div id="e"></div><div class="row"><button class="pri" id="l1">Continuar</button></div>'
        : '<p>Segundo fator (MFA): digite o código de 6 dígitos enviado ao seu aplicativo autenticador.</p><p class="hint">Demonstração: o código é ' +
          CODIGO_MFA +
          ".</p>" +
          '<label class="f" for="cd">Código</label><input type="text" id="cd" inputmode="numeric" autocomplete="one-time-code" maxlength="6">' +
          '<div id="e"></div><div class="row"><button id="l0">Voltar</button><button class="pri" id="l2">Verificar e entrar</button></div>') +
      "</div>";
    areaPrincipal.innerHTML = h;
    ligarEventos();
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
    atividades: desenharAtividades,
    chamados: desenharChamados,
    mural: desenharMural,
    docs: desenharDocumentos,
  })[estado.tab](p);
}

/* ---- monitoramento (TI) ---- */
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
    pc = {
      func: 0,
      diamante: 0,
      gestor: 0,
      ti: 0,
    };
  estado.us.forEach(function (u) {
    pc[u.perfil] = (pc[u.perfil] || 0) + 1;
  });
  var L = estado.au
    .slice()
    .sort(function (a, b) {
      return b.quando - a.quando;
    })
    .slice(0, 40);
  p.innerHTML =
    '<h3>Visão geral do sistema (somente leitura)</h3><div class="cols">' +
    '<section class="col" aria-label="Conexão"><h3>Infraestrutura</h3><p>Conexão: <strong>' +
    (navigator.onLine ? "online" : "offline") +
    "</strong></p><p>Armazenamento: <strong>" +
    (banco ? "nuvem, tempo real" : "local, só esta aba") +
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
    '<h3 style="margin-top:1rem">Registro de auditoria (últimos ' +
    L.length +
    ")</h3>" +
    (L.length
      ? '<div class="tw"><table><thead><tr><th>Data e hora</th><th>Usuário</th><th>Perfil</th><th>Ação</th></tr></thead><tbody>' +
        L.map(function (x) {
          return (
            "<tr><td>" +
            new Date(x.quando).toLocaleString("pt-BR") +
            "</td><td>" +
            escaparHtml(x.quem) +
            "</td><td>" +
            escaparHtml(NOME_DO_PERFIL[x.perfil] || x.perfil) +
            "</td><td>" +
            (/Falha/.test(x.acao)
              ? '<span class="tag x">' + escaparHtml(x.acao) + "</span>"
              : escaparHtml(x.acao)) +
            "</td></tr>"
          );
        }).join("") +
        "</tbody></table></div>"
      : '<p class="hint">Nenhum evento registrado ainda.</p>');
}

/* ---- atividades ---- */
function membrosPermitidos() {
  var a = ehGestor() ? ["func", "diamante"] : ["func"];
  return estado.us
    .filter(function (u) {
      return a.indexOf(u.perfil) >= 0;
    })
    .sort(function (a, b) {
      return a.nome.localeCompare(b.nome);
    });
}
function opcoesDeMembros(sel) {
  return (
    '<option value="">Selecione o membro</option>' +
    membrosPermitidos()
      .map(function (u) {
        return (
          '<option value="' +
          escaparHtml(u.nome) +
          '"' +
          (u.nome === sel ? " selected" : "") +
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
  var me = normalizar(estado.user.nome),
    m = a.membros.some(function (x) {
      return normalizar(x.nome) === me;
    });
  return ehGestor() || ehTI() || m || (ehRepresentante() && a.por === estado.user.nome);
}
function desenharAtividades(p) {
  if (!porId("al")) {
    var hint = ehTI()
      ? "Modo vigilância: você vê todas as atividades, sem poder alterá-las."
      : ehRepresentante()
        ? ""
        : "Seu perfil é de consulta: você vê as atividades em que o seu nome foi indicado.";
    p.innerHTML =
      (podeAdministrar()
        ? "<h3>Nova atividade para uma equipe</h3>" +
          (ehRepresentante()
            ? '<p class="hint">Como Representante, você atribui atividades somente a funcionários comuns.</p>'
            : "") +
          '<div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div><label class="f" for="atl">Título</label><input type="text" id="atl"></div><div><label class="f" for="ate">Equipe</label><input type="text" id="ate" placeholder="Ex.: Equipe de Vendas"></div><div><label class="f" for="atp">Prazo</label><input type="date" id="atp" min="' +
          dataDeHoje() +
          '"></div></div><label class="f" for="atr">Requisitos de entrega</label><textarea id="atr" rows="2" placeholder="O que precisa estar pronto para a atividade ser aceita"></textarea><fieldset style="border:0;padding:0;margin:.8rem 0 0"><legend class="f">Membros e responsabilidades</legend><div id="mrows">' +
          linhaDeMembro() +
          linhaDeMembro() +
          '</div><div class="row"><button class="sm" id="addm">+ Adicionar membro</button><button class="sm" id="seedu">Carregar funcionários de exemplo</button></div></fieldset><div id="e"></div><div class="row"><button class="pri" id="adda">Criar atividade</button></div>'
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
          Dados.set("usuarios", normalizar(x[0]), {
            nome: x[0],
            perfil: x[1],
            ultimo: Date.now(),
          });
        });
        anunciar("Funcionários de exemplo carregados");
      };
    if (porId("adda"))
      porId("adda").onclick = function () {
        if (estado.busy) return;
        var t = porId("atl").value.trim(),
          eq = porId("ate").value.trim(),
          pz = porId("atp").value,
          rq = porId("atr").value.trim(),
          m = [],
          seen = {},
          bad = "";
        [].forEach.call(porId("mrows").querySelectorAll(".mrow"), function (r) {
          var n = r.querySelector(".mn").value,
            x = r.querySelector(".mr").value.trim();
          if (n && x) {
            if (seen[n]) bad = "Cada membro só pode aparecer uma vez.";
            seen[n] = 1;
            m.push({
              nome: n,
              resp: x,
              feito: false,
            });
          }
        });
        if (t.length < 3) return mostrarErro("Digite o título da atividade.", "atl");
        if (eq.length < 2) return mostrarErro("Informe a equipe responsável.", "ate");
        if (!pz) return mostrarErro("Defina o prazo da atividade.", "atp");
        if (rq.length < 3) return mostrarErro("Descreva os requisitos de entrega.", "atr");
        if (!m.length)
          return mostrarErro(
            membrosPermitidos().length
              ? "Escolha pelo menos um membro e escreva a responsabilidade dele."
              : "Ainda não há funcionários cadastrados. Use “Carregar funcionários de exemplo” ou peça para eles entrarem uma vez.",
          );
        if (bad) return mostrarErro(bad);
        var allow = membrosPermitidos().map(function (u) {
          return u.nome;
        });
        for (var i = 0; i < m.length; i++)
          if (allow.indexOf(m[i].nome) < 0)
            return mostrarErro("Seu perfil não permite atribuir atividade a " + m[i].nome + ".");
        estado.busy = true;
        var b = porId("adda");
        b.disabled = true;
        b.innerHTML = '<span class="spin" aria-hidden="true"></span> Criando…';
        var id = "AT-" + Date.now().toString(36).toUpperCase();
        Dados.set("atividades", id, {
          titulo: t,
          equipe: eq,
          prazo: pz,
          requisitos: rq,
          membros: m,
          criado: Date.now(),
          por: estado.user.nome,
        })
          .then(function () {
            registrarAuditoria("Criou a atividade " + id + " (" + t + ")");
            estado.busy = false;
            b.disabled = false;
            b.textContent = "Criar atividade";
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
            estado.busy = false;
            b.disabled = false;
            b.textContent = "Criar atividade";
            mostrarErro("Não foi possível criar a atividade. Tente novamente.");
          });
      };
  }
  atualizarListasDeMembros();
  var L = estado.at.filter(atividadeVisivel).sort(function (a, b) {
    return (a.prazo || "9").localeCompare(b.prazo || "9");
  });
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
                  (x.feito ? "✔ " : "") +
                  "<strong>" +
                  escaparHtml(x.nome) +
                  "</strong>: " +
                  escaparHtml(x.resp) +
                  (x.feito
                    ? ' <span class="tag c">Feito</span>'
                    : ' <span class="tag">Pendente</span>') +
                  (mg && !x.feito
                    ? ' <button class="sm pri" data-a="' +
                      a.id +
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
                a.id +
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
        Dados.del("atividades", b.dataset.x);
        registrarAuditoria("Excluiu a atividade " + b.dataset.x);
        anunciar("Atividade excluída");
        return;
      }
      var a = estado.at.filter(function (z) {
        return z.id === b.dataset.a;
      })[0];
      if (!a || !podeGerenciar(a)) return;
      var m = a.membros.map(function (x, i) {
        return i == b.dataset.i
          ? {
              nome: x.nome,
              resp: x.resp,
              feito: true,
            }
          : x;
      });
      Dados.upd("atividades", a.id, {
        membros: m,
      });
      registrarAuditoria(
        "Marcou a parte de " + a.membros[b.dataset.i].nome + " como concluída em " + a.id,
      );
      anunciar("Parte marcada como concluída");
    };
  });
}

/* ---- chamados ---- */
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
function filaDeAtendimento() {
  return estado.ch
    .filter(function (a) {
      return a.status === "confirmado" || a.status === "atendimento";
    })
    .sort(function (a, b) {
      return (a.confirmadoEm || 0) - (b.confirmadoEm || 0);
    });
}
function desenharChamados(p) {
  if (!porId("cl")) {
    p.innerHTML = ehTI()
      ? '<p class="hint">Modo vigilância: você vê todos os chamados, sem poder alterá-los.</p><div id="cl"></div>'
      : '<h3>Pedir ajuda: abrir chamado</h3><div class="cols" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))"><div><label class="f" for="ctt">Título</label><input type="text" id="ctt"></div><div><label class="f" for="cct">Categoria</label><select id="cct">' +
        CATEGORIAS.map(function (c) {
          return "<option>" + c + "</option>";
        }).join("") +
        '</select></div><div><label class="f" for="cpr">Prioridade</label><select id="cpr">' +
        PRIORIDADES.map(function (c, i) {
          return "<option" + (i === 1 ? " selected" : "") + ">" + c + "</option>";
        }).join("") +
        '</select></div></div><label class="f" for="cds">Descrição do problema</label><textarea id="cds" rows="3"></textarea><div id="e"></div><div class="row"><button class="pri" id="addc">Abrir chamado</button>' +
        (podeAdministrar() ? '<button id="seed">Carregar exemplos</button>' : "") +
        '</div><div id="cl"></div>';
    if (porId("addc"))
      porId("addc").onclick = function () {
        if (estado.busy) return;
        var t = porId("ctt").value.trim(),
          d = porId("cds").value.trim();
        if (t.length < 3) return mostrarErro("Digite um título para o chamado.", "ctt");
        if (d.length < 5)
          return mostrarErro("Descreva o problema para a equipe conseguir ajudar.", "cds");
        estado.busy = true;
        var b = porId("addc");
        b.disabled = true;
        b.innerHTML = '<span class="spin" aria-hidden="true"></span> Enviando…';
        var id = "CH-" + Date.now().toString(36).toUpperCase();
        Dados.set("chamados", id, {
          titulo: t,
          cat: porId("cct").value,
          prio: porId("cpr").value,
          desc: d,
          status: "pendente",
          criado: Date.now(),
          por: estado.user.nome,
        })
          .then(function () {
            registrarAuditoria("Abriu o chamado " + id + " (" + t + ")");
            estado.busy = false;
            b.disabled = false;
            b.textContent = "Abrir chamado";
            porId("ctt").value = "";
            porId("cds").value = "";
            porId("e").innerHTML =
              '<p class="hint" role="status">Chamado ' +
              id +
              " aberto. Acompanhe o status abaixo.</p>";
            anunciar("Chamado aberto");
          })
          .catch(function () {
            estado.busy = false;
            b.disabled = false;
            b.textContent = "Abrir chamado";
            mostrarErro("Não foi possível abrir o chamado. Tente novamente.");
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
          });
        });
        anunciar("Exemplos carregados");
      };
  }
  var h = "";
  if (!podeAdministrar() && !ehTI()) {
    var L = estado.ch
        .filter(function (a) {
          return a.por === estado.user.nome;
        })
        .sort(function (a, b) {
          return b.criado - a.criado;
        }),
      fila = filaDeAtendimento();
    h =
      '<h3 style="margin-top:1rem">Meus chamados (' +
      L.length +
      ")</h3>" +
      (L.length
        ? L.map(function (a) {
            var pos = fila.findIndex(function (x) {
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
      '<p class="hint">Seu perfil só pede ajuda. Representantes e Gestores administram os chamados.</p>';
  } else {
    var ro = ehTI(),
      pend = estado.ch
        .filter(function (a) {
          return a.status === "pendente";
        })
        .sort(function (a, b) {
          return a.criado - b.criado;
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
        ? '<div class="tw"><table><caption class="hint" style="text-align:left">Ordem de confirmação: o primeiro é o próximo a ser atendido</caption><thead><tr><th>Nº</th><th>Chamado</th><th>Aberto por</th><th>Status</th>' +
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
  porId("cl").innerHTML = h;
  [].forEach.call(porId("cl").querySelectorAll("button[data-s]"), function (b) {
    b.onclick = function () {
      if (!podeAdministrar()) return;
      var up = {
        status: b.dataset.s,
      };
      if (up.status === "confirmado") up.confirmadoEm = Date.now();
      if (up.status === "atendimento") up.atendente = estado.user.nome;
      Dados.upd("chamados", b.dataset.id, up);
      registrarAuditoria(
        "Chamado " +
          b.dataset.id +
          ": " +
          {
            confirmado: "confirmou (entrou na fila)",
            atendimento: "chamou para atendimento",
            atendido: "concluiu",
            cancelado: "cancelou",
          }[up.status],
      );
      anunciar(
        up.status === "confirmado"
          ? "Chamado adicionado à fila de atendimento"
          : "Status atualizado",
      );
    };
  });
}

/* ---- mural e documentos ---- */
function desenharMural(p) {
  if (!porId("pl")) {
    p.innerHTML =
      (podeAdministrar()
        ? '<h3>Novo comunicado</h3><label class="f" for="ptx">Mensagem</label><textarea id="ptx" rows="3"></textarea><div class="chk"><input type="checkbox" id="pim"><label for="pim">Marcar como importante</label></div><div id="e"></div><div class="row"><button class="pri" id="addp">Publicar</button></div>'
        : '<p class="hint">Somente Representantes e Gestores publicam comunicados.</p>') +
      '<div id="pl"></div>';
    if (porId("addp"))
      porId("addp").onclick = function () {
        if (estado.busy) return;
        var t = porId("ptx").value.trim();
        if (t.length < 3) return mostrarErro("Escreva a mensagem do comunicado.", "ptx");
        estado.busy = true;
        var b = porId("addp");
        b.disabled = true;
        b.innerHTML = '<span class="spin" aria-hidden="true"></span> Publicando…';
        Dados.set("posts", gerarId(), {
          texto: t,
          imp: porId("pim").checked,
          autor: estado.user.nome,
          criado: Date.now(),
        })
          .then(function () {
            registrarAuditoria("Publicou um comunicado");
            estado.busy = false;
            b.disabled = false;
            b.textContent = "Publicar";
            porId("ptx").value = "";
            porId("pim").checked = false;
            porId("e").innerHTML = "";
            anunciar("Comunicado publicado");
          })
          .catch(function () {
            estado.busy = false;
            b.disabled = false;
            b.textContent = "Publicar";
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
        '">' +
        (ok ? "📄 " : "🔒 ") +
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

/* ---- dados em tempo real, login e eventos ---- */
var ABAS_AFETADAS = {
    chamados: ["chamados", "monitor"],
    atividades: ["atividades", "monitor"],
    posts: ["mural"],
    usuarios: ["atividades", "monitor"],
    auditoria: ["monitor"],
  },
  CHAVE_DO_ESTADO = {
    chamados: "ch",
    atividades: "at",
    posts: "posts",
    usuarios: "us",
    auditoria: "au",
  };
function assinarDados() {
  estado.unsubs.forEach(function (u) {
    u && u();
  });
  estado.unsubs = [];
  COLECOES.forEach(function (n) {
    if (n === "auditoria" && !ehTI()) return;
    estado.unsubs.push(
      Dados.sub(n, function (l) {
        estado[CHAVE_DO_ESTADO[n]] = l;
        if (estado.user && ABAS_AFETADAS[n].indexOf(estado.tab) >= 0) desenharAbaAtual();
      }),
    );
  });
}
function ligarEventos() {
  if (porId("l1"))
    porId("l1").onclick = function () {
      var n = porId("nm").value.trim();
      if (n.length < 2) return mostrarErro("Digite seu nome.", "nm");
      if (porId("pw").value.length < 3)
        return mostrarErro("Digite a senha (qualquer valor na demonstração).", "pw");
      estado.tmp = {
        nome: n,
        perfil: porId("pf").value,
      };
      estado.auth = 1;
      desenharTela();
    };
  if (porId("l0"))
    porId("l0").onclick = function () {
      estado.auth = 0;
      desenharTela();
    };
  if (porId("l2"))
    porId("l2").onclick = function () {
      if (porId("cd").value.trim() !== CODIGO_MFA) {
        registrarAuditoria("Falha de MFA (código incorreto)");
        return mostrarErro("Código incorreto. Tente novamente.", "cd");
      }
      estado.user = estado.tmp;
      estado.auth = 0;
      estado.tab = ehTI() ? "monitor" : "atividades";
      Dados.set("usuarios", normalizar(estado.user.nome), {
        nome: estado.user.nome,
        perfil: estado.user.perfil,
        ultimo: Date.now(),
      });
      registrarAuditoria("Login realizado");
      assinarDados();
      desenharTela();
      anunciar("Login realizado como " + NOME_DO_PERFIL[estado.user.perfil]);
    };
  if (porId("out"))
    porId("out").onclick = function () {
      registrarAuditoria("Logout");
      estado.unsubs.forEach(function (u) {
        u && u();
      });
      estado.unsubs = [];
      estado.user = null;
      estado.ch = [];
      estado.at = [];
      estado.us = [];
      estado.au = [];
      desenharTela();
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
        j = k === "ArrowRight" ? i + 1 : k === "ArrowLeft" ? i - 1 : -1;
      if (j < 0) return;
      e.preventDefault();
      all[(j + all.length) % all.length].click();
    };
  });
}
porId("fp").onclick = function () {
  mudarFonte(2);
};
porId("fm").onclick = function () {
  mudarFonte(-2);
};
var tamanhoDaFonte = 17;
function mudarFonte(d) {
  tamanhoDaFonte = Math.max(14, Math.min(28, tamanhoDaFonte + d));
  document.documentElement.style.setProperty("--fs", tamanhoDaFonte + "px");
}
porId("ct").onclick = function () {
  var on = document.documentElement.getAttribute("data-contrast") !== "1";
  if (on) document.documentElement.setAttribute("data-contrast", "1");
  else document.documentElement.removeAttribute("data-contrast");
  this.setAttribute("aria-pressed", on);
};
porId("lt").onclick = function () {
  var on = !document.documentElement.classList.contains("lite");
  document.documentElement.classList.toggle("lite", on);
  this.setAttribute("aria-pressed", on);
  anunciar(on ? "Modo leve ativado" : "Modo leve desativado");
};
function verificarConexao() {
  porId("net").hidden = navigator.onLine;
}
window.addEventListener("online", verificarConexao);
window.addEventListener("offline", verificarConexao);
verificarConexao();
desenharTela();
/* ===== FIREBASE (Firestore) ===== */
var firebaseConfig = {
  apiKey: "AIzaSyDjf9H-XARaa6Ey_FqvuPMpnhXN5WHS0kw",
  authDomain: "organizacao-ambu.firebaseapp.com",
  projectId: "organizacao-ambu",
  storageBucket: "organizacao-ambu.firebasestorage.app",
  messagingSenderId: "524269015365",
  appId: "1:524269015365:web:33e75fe0a5fa44fd65ee2c",
};
(function () {
  var base = "https://www.gstatic.com/firebasejs/10.14.1/";
  Promise.all([import(base + "firebase-app.js"), import(base + "firebase-firestore.js")])
    .then(function (m) {
      var app = m[0].initializeApp(firebaseConfig),
        fs = m[1].getFirestore(app),
        F = m[1];
      banco = {
        collection: function (n) {
          return {
            doc: function (id) {
              return {
                set: function (d) {
                  return F.setDoc(F.doc(fs, n, id), d);
                },
                update: function (d) {
                  return F.updateDoc(F.doc(fs, n, id), d);
                },
                delete: function () {
                  return F.deleteDoc(F.doc(fs, n, id));
                },
              };
            },
            onSnapshot: function (next, error) {
              return F.onSnapshot(
                F.collection(fs, n),
                function (snap) {
                  next({
                    docs: snap.docs.map(function (d) {
                      return {
                        id: d.id,
                        data: function () {
                          return d.data();
                        },
                      };
                    }),
                  });
                },
                error,
              );
            },
          };
        },
      };
    })
    .catch(function (e) {
      console.warn("Firebase indisponível, usando modo local.", e);
    });
})();
