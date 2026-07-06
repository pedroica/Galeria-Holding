/* ================================================================
   TEMPLATES DE E-MAIL POR AGÊNCIA × SETOR
   Carregado antes de block4.js via index.html
   ================================================================ */

var MICROCOPY = {
  btnEmail:       "Gerar e-mail pro decisor",
  siteLink:       function(d){ return "🔗 " + d; },
  siteVazio:      "sem site",
  titulo:         function(e){ return "✉️ E-mail pra " + e; },
  setorDetectado: function(s){ return "Setor: " + s; },
  agenciaLabel:   "Agência",
  agenciaHint:    "sugerida pelo fit do setor",
  badgeMelhorFit: "★ melhor fit",
  decisores:      function(n){ return n + (n === 1 ? " decisor com e-mail" : " decisores com e-mail"); },
  semDecisor:     "Nenhum decisor com e-mail nesta conta — enriqueça antes (Lusha).",
  conflito:       function(m,a){ return "⚠️ Conflito ativo: " + m + ". Evite abordar como " + a + "."; },
  conflitoTrocar: "Trocar de agência",
  conflitoSeguir: "Seguir mesmo assim",
  gerarBtn:       function(n){ return n === 1 ? "Gerar e abrir e-mail" : "Gerar e abrir e-mails"; },
  gerando:        "Gerando com CR.IA…",
  sucessoMulti:   function(n){ return "✅ " + n + " e-mails abertos — 1 por decisor. Atividade registrada."; },
  sucessoUm:      function(n){ return "✅ E-mail aberto pro " + n + ". Atividade registrada."; },
  statusOk:       function(n){ return "✓ " + n + " — aberto"; },
  statusPulado:   function(n){ return "— " + n + " (sem e-mail, pulado)"; },
  ultimoContato:  function(d){ return "ℹ️ Último contato há " + d + " dias."; },
  semChave:       "❌ Configure a Claude API Key em ⚙ pra gerar o texto.",
  erroGerar:      "❌ Não consegui gerar agora. Tenta de novo em instantes."
};

var AGENCY_TEMPLATES = {

  galeria_holding: {
    nome: "Galeria Holding",
    assinatura: "Pedro Ica · Head of Growth — Galeria Holding",
    default: {
      assunto: "{empresa}: comunicação à altura do seu negócio",
      corpo: "Olá, {nome}! Somos a Galeria Holding, o maior grupo de comunicação independente da América Latina — trabalhamos com marcas como McDonald's, Google, Natura, Havaianas e Stellantis. A {empresa} tem um negócio forte, mas a comunicação ainda não acompanha esse tamanho. É onde entramos: planejamento, rebranding, dados, BI e CRM pra construir uma comunicação que serve o negócio. Vale 20 min essa semana pra eu te mostrar como faríamos pra vocês?"
    },
    porSetor: {}
  },

  galeria: {
    nome: "Galeria",
    assinatura: "Pedro Ica · Head of Growth — Galeria Holding",
    default: {
      assunto: "{empresa}: quando mídia e criação falam a mesma língua",
      corpo: "Olá, {nome}! Muita verba em mídia mas criatividade e performance em trilhos separados — CPM alto sem a conversão que o investimento merecia. A Galeria une dados, mídia e criação com um objetivo: resultado de negócio. 20 min essa semana pra eu te mostrar pra {empresa}?"
    },
    porSetor: {
      "Educacao": {
        assunto: "{empresa}: captação com criativo que diferencia",
        corpo: "Olá, {nome}! Na captação quase toda instituição briga pela mesma mídia cara com criativo genérico — e o CAC sobe a cada ciclo. A Galeria baixa o custo por aluno com peças que diferenciam a {empresa}. 20 min essa semana?"
      },
      "Farma": {
        assunto: "{empresa}: da mídia ao sell-out na farmácia",
        corpo: "Olá, {nome}! Em farma sobra mídia e falta conectar ao sell-out no PDV. A Galeria fecha esse loop, dentro do regulatório. 20 min pra eu mostrar pra {empresa}?"
      },
      "Automotivo": {
        assunto: "{empresa}: lançamento com desejo e atribuição",
        corpo: "Olá, {nome}! Jornada longa e mídia de lançamento sem atribuição ponta a ponta. A Galeria une desejo e performance que se mede. 20 min pra {empresa}?"
      },
      "Super App": {
        assunto: "{empresa}: uma marca só, não uma por vertical",
        corpo: "Olá, {nome}! Cada vertical roda a própria campanha e a marca vira várias — o CAC sofre. A Galeria dá unidade criativa com performance. 20 min pra {empresa}?"
      },
      "Games": {
        assunto: "{empresa}: aquisição que fala a língua do gamer",
        corpo: "Olá, {nome}! O público que mais fareja marketing raso — aquisição fica cara quando o criativo não conversa com a comunidade. A Galeria une UA e criação que o gamer respeita. 20 min?"
      },
      "Grande Varejo": {
        assunto: "{empresa}: volume de oferta com eficiência de mídia",
        corpo: "Olá, {nome}! Calendário promocional implacável, margem apertada. A Galeria escala criativo com dados e melhora o ROI de cada real. 20 min pra {empresa}?"
      },
      "Cerveja": {
        assunto: "{empresa}: marca de cerveja com dados por trás",
        corpo: "Olá, {nome}! Categoria de marca e alta verba, mas performance e criação quase nunca conversam. A Galeria conecta as pontas. 20 min pra {empresa}?"
      }
    }
  },

  mila: {
    nome: "Milà",
    assinatura: "Pedro Ica · Milà — Galeria Holding",
    default: {
      assunto: "{empresa} tem performance. E território de marca?",
      corpo: "Olá, {nome}! Comunicação só de oferta e performance compete sempre no preço. A Milà cria o território que gera amor e preferência pela {empresa}. 20 min pra eu te mostrar?"
    },
    porSetor: {
      "Grande Varejo": {
        assunto: "{empresa}: preço todo mundo faz. E a marca?",
        corpo: "Olá, {nome}! No grande varejo a comunicação vive de oferta e a marca fica pra depois. A Milà constrói território que gera preferência, não só promoção. 20 min pra {empresa}?"
      },
      "Sorvetes": {
        assunto: "{empresa}: sorvete é memória afetiva, não só produto",
        corpo: "Olá, {nome}! Sorvete vende emoção, mas quase toda marca comunica sabor e preço. A Milà transforma isso em marca que fica o ano todo. 20 min pra {empresa}?"
      },
      "Franqueadoras": {
        assunto: "{empresa}: marca forte atrai franqueado e cliente",
        corpo: "Olá, {nome}! Franqueadora forte precisa de marca forte — pro consumidor e pro franqueado. A Milà constrói essa narrativa dupla. 20 min pra {empresa}?"
      },
      "FMCG": {
        assunto: "{empresa}: mídia vocês têm. Preferência é o que falta?",
        corpo: "Olá, {nome}! Marca nacional com boa mídia mas sem narrativa de longo prazo compete no preço. A Milà cria o território da {empresa}. 20 min?"
      },
      "Varejo Moda": {
        assunto: "{empresa}: mais que coleção, um desejo",
        corpo: "Olá, {nome}! Performance sem desejo vira guerra de desconto. A Milà faz a peça valer mais que o preço. 20 min pra {empresa}?"
      },
      "Lacteos": {
        assunto: "{empresa}: commodity ou marca de escolha?",
        corpo: "Olá, {nome}! Lácteo vira commodity — quem constrói marca escapa da briga de preço. É o que a Milà faz. 20 min pra {empresa}?"
      },
      "Alimentos": {
        assunto: "{empresa}: o espaço que o líder deixou aberto",
        corpo: "Olá, {nome}! Nessas categorias o líder domina pela marca. A Milà ajuda a {empresa} a ocupar território próprio e disputar preferência. 20 min?"
      }
    }
  },

  "404": {
    nome: "404",
    assinatura: "Pedro Ica · 404 — Galeria Holding",
    default: {
      assunto: "{empresa}: produto do futuro, comunicação do presente",
      corpo: "Olá, {nome}! É comum o produto correr na frente da comunicação, presa no modelo tradicional. A 404 une tech e criatividade pra {empresa} comunicar à altura da inovação. 20 min?"
    },
    porSetor: {
      "Luxo": {
        assunto: "{empresa}: desejo no digital sem perder a aura",
        corpo: "Olá, {nome}! Luxo no digital é escalar sem diluir o desejo. A 404 faz esse equilíbrio pra {empresa}. 20 min?"
      },
      "Internacional": {
        assunto: "{empresa} no Brasil: com quem conhece o terreno",
        corpo: "Olá, {nome}! Entrar no Brasil é adaptar cultura, canal e modelo — não traduzir campanha. A 404 leva marcas internacionais ao mercado brasileiro. 20 min pra {empresa}?"
      },
      "B2B": {
        assunto: "{empresa}: comunicar valor sem parecer manual técnico",
        corpo: "Olá, {nome}! B2B com produto forte e comunicação fria trava demanda. A 404 humaniza sem perder substância. 20 min pra {empresa}?"
      },
      "SaaS": {
        assunto: "{empresa}: crescer no Brasil com marca, não só performance",
        corpo: "Olá, {nome}! SaaS que só liga performance trava quando o CAC sobe — falta marca. A 404 constrói o posicionamento. 20 min pra {empresa}?"
      },
      "Varejo Nicho": {
        assunto: "{empresa}: nicho é vantagem — se a marca contar isso",
        corpo: "Olá, {nome}! Nicho ganha do grande quando a marca traduz o porquê de existir. A 404 transforma nicho em posicionamento. 20 min?"
      },
      "Lancamento": {
        assunto: "{empresa}: um lançamento à altura da inovação",
        corpo: "Olá, {nome}! Produto inovador com comunicação tradicional entrega menos. A 404 faz o mercado entender o que a {empresa} tem de novo. 20 min?"
      }
    }
  },

  cccaramelo: {
    nome: "Caramelo",
    assinatura: "Pedro Ica · Caramelo — Galeria Holding",
    default: {
      assunto: "{empresa} na cultura — não só na mídia",
      corpo: "Olá, {nome}! Alcance não é pertencimento. A Caramelo conecta a {empresa} à cultura de verdade — música, comunidades, creators. 20 min pra eu te mostrar?"
    },
    porSetor: {
      "Farma": {
        assunto: "{empresa}: farma que fala como gente, não como bula",
        corpo: "Olá, {nome}! Farma tem verba mas comunicação distante, e o jovem não se conecta. A Caramelo aproxima a {empresa} da cultura. 20 min?"
      },
      "Educacao": {
        assunto: "{empresa}: falar a língua de quem decide o curso",
        corpo: "Olá, {nome}! Quem conecta com a cultura do jovem capta melhor. A Caramelo põe a {empresa} dentro da conversa. 20 min?"
      },
      "Comida Indie": {
        assunto: "{empresa}: marca pequena, presença cultural grande",
        corpo: "Olá, {nome}! Comida independente cresce quando vira cultura, não só cardápio. A Caramelo dá comunidade e fandom à {empresa}. 20 min?"
      },
      "Marca de Grupo": {
        assunto: "{empresa}: personalidade própria dentro do grupo",
        corpo: "Olá, {nome}! Marca dentro de um grande grupo se perde no guarda-chuva. A Caramelo dá à {empresa} território cultural próprio. 20 min?"
      },
      "Rebranding": {
        assunto: "{empresa}: rebranding que a audiência abraça",
        corpo: "Olá, {nome}! Rebranding sem conexão cultural vira troca de logo. A Caramelo reposiciona a {empresa} com a cultura a favor. 20 min?"
      },
      "GenZ": {
        assunto: "{empresa} e a GenZ: sem parecer que está tentando",
        corpo: "Olá, {nome}! GenZ fareja marca forçada. A Caramelo conecta a {empresa} de dentro da cultura, de um jeito verdadeiro. 20 min?"
      },
      "Time Enxuto": {
        assunto: "{empresa}: marca grande, time enxuto — a gente cobre",
        corpo: "Olá, {nome}! Dá pra ter marca relevante com time enxuto, com um parceiro que assume a gestão cultural. A Caramelo faz esse braço pra {empresa}. 20 min?"
      }
    }
  }

};
