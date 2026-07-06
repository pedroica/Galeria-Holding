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
    assinatura: "Pedro Ica · Head of Growth — Galeria Holding\npedro.ica@galeriaholding.co",
    porSetor: {},
    default: {
      assunto: "{empresa}: comunicação à altura do seu negócio",
      corpo: "Olá, {nome}!\n\nSomos a Galeria Holding, o maior grupo de comunicação independente da América Latina — trabalhamos com marcas como McDonald's, Google, Natura, Havaianas e Stellantis.\n\nA {empresa} tem um negócio forte, mas a comunicação ainda não acompanha esse tamanho. É onde entramos: planejamento, rebranding, dados, BI e CRM pra construir uma comunicação que serve o negócio.\n\nVale 20 min essa semana pra eu te mostrar como faríamos pra vocês?"
    }
  },

  galeria: {
    nome: "Galeria",
    assinatura: "Pedro Ica · Head of Growth — Galeria\npedro.ica@galeriaholding.co | galeria.ag",
    default: {
      assunto: "{empresa}: performance e criatividade no mesmo time",
      corpo: "Olá, {nome}!\n\nA Galeria une dados, mídia e criatividade pra gerar resultado real de negócio — com cases em McDonald's, Google, Stellantis e Havaianas.\n\nVejo uma oportunidade clara de aplicar isso pra {empresa}. Topa 20 min pra eu apresentar?"
    },
    porSetor: {
      "Educacao": {
        assunto: "{empresa}: captar mais alunos com criatividade e performance",
        corpo: "Olá, {nome}!\n\nEm educação, quem combina criatividade com performance de mídia sai na frente na captação. A Galeria faz essa integração — com cases reais no setor.\n\nVale 20 min pra eu apresentar aplicado à {empresa}?"
      },
      "Farma": {
        assunto: "{empresa}: comunicação farma que converte sem perder o rigor",
        corpo: "Olá, {nome}!\n\nFarma exige precisão regulatória e criatividade que engaja ao mesmo tempo. A Galeria une as duas coisas com foco em resultado.\n\nTopa 20 min pra eu mostrar como pra {empresa}?"
      },
      "Automotivo": {
        assunto: "{empresa}: do desejo ao lead qualificado com performance",
        corpo: "Olá, {nome}!\n\nNo automotivo, a jornada do consumidor é longa e cara. A Galeria otimiza cada etapa com criatividade e dados — do awareness ao test-drive.\n\n20 min pra eu mostrar pra {empresa}?"
      },
      "Super App": {
        assunto: "{empresa}: crescer em aquisição sem quebrar a marca",
        corpo: "Olá, {nome}!\n\nSuper app precisa de escala e identidade ao mesmo tempo. A Galeria faz os dois andarem juntos — com performance que não dilui a marca.\n\nTopa 20 min?"
      },
      "Varejo": {
        assunto: "{empresa}: campanha com resultado, não só alcance",
        corpo: "Olá, {nome}!\n\nNo grande varejo, cada real de mídia precisa virar resultado mensurável. A Galeria integra criatividade e performance pra que isso aconteça em {empresa}.\n\nVale 20 min?"
      },
      "Games": {
        assunto: "{empresa}: marca que vive dentro da cultura gamer",
        corpo: "Olá, {nome}!\n\nJogo é cultura — e marca que entra no gaming pela mídia tradicional perde para quem entra pela criatividade. A Galeria sabe o caminho.\n\n20 min pra eu mostrar pra {empresa}?"
      },
      "Fintech": {
        assunto: "{empresa}: CAC menor com criatividade que testa rápido",
        corpo: "Olá, {nome}!\n\nEm fintech, CAC sobe quando a criatividade não acompanha o ritmo de teste da mídia. A Galeria une os dois times.\n\nTopa 20 min pra {empresa}?"
      }
    }
  },

  mila: {
    nome: "Milà",
    assinatura: "Pedro Ica · Head of Growth — Milà\npedro.ica@galeriaholding.co | mila.ag",
    default: {
      assunto: "{empresa}: mídia vocês têm. Preferência é o que falta?",
      corpo: "Olá, {nome}!\n\nMarca nacional com boa mídia mas sem narrativa de longo prazo compete sempre no preço. A Milà cria o território que gera amor e preferência pela {empresa}.\n\nTopa 20 min?"
    },
    porSetor: {
      "Beleza": {
        assunto: "{empresa}: presença digital forte. E o território de marca?",
        corpo: "Olá, {nome}!\n\nPresença digital forte mas sem um território de marca que diferencie da concorrência trava o crescimento sustentável. A Milà constrói esse diferencial pra {empresa}.\n\nVale 20 min?"
      },
      "FMCG": {
        assunto: "{empresa}: mídia vocês têm. Preferência é o que falta?",
        corpo: "Olá, {nome}!\n\nMarca nacional com boa mídia mas sem narrativa de longo prazo compete sempre no preço. A Milà cria o território que gera amor e preferência pela {empresa}.\n\nTopa 20 min?"
      },
      "Varejo": {
        assunto: "{empresa}: preço todo mundo faz. E a marca?",
        corpo: "Olá, {nome}!\n\nNo grande varejo a comunicação vive de oferta e preço — a marca fica pra depois. A Milà constrói território de marca que gera preferência, não só conversão de promoção.\n\n20 min pra eu te mostrar aplicado à {empresa}?"
      },
      "Varejo Moda": {
        assunto: "{empresa}: mais que coleção, um desejo",
        corpo: "Olá, {nome}!\n\nEm moda, performance de varejo sem construção de desejo vira guerra de desconto. A Milà constrói a marca que faz a peça valer mais que o preço.\n\n20 min pra eu te mostrar pra {empresa}?"
      },
      "Food": {
        assunto: "{empresa}: espaço pra marca que o líder deixou aberto",
        corpo: "Olá, {nome}!\n\nNessas categorias o líder domina pela marca, não só pelo produto. A Milà ajuda a {empresa} a ocupar um território próprio e disputar preferência, não só ponta de gôndola.\n\n20 min pra eu te mostrar?"
      },
      "Automotivo": {
        assunto: "{empresa}: comunicação de produto sem construção de sonho",
        corpo: "Olá, {nome}!\n\nComunicação de produto sem construção de sonho e aspiração não fideliza. A Milà transforma isso em narrativa que gera amor de marca.\n\nVale 20 min pra eu te mostrar aplicado à {empresa}?"
      }
    }
  },

  "404": {
    nome: "404",
    assinatura: "Pedro Ica · Head of Growth — 404\npedro.ica@galeriaholding.co | 404.ag",
    default: {
      assunto: "{empresa}: comunicar valor sem parecer manual técnico",
      corpo: "Olá, {nome}!\n\nB2B costuma ter produto forte e comunicação fria — e isso trava geração de demanda. A 404 humaniza a marca sem perder a substância.\n\n20 min pra eu te mostrar aplicado à {empresa}?"
    },
    porSetor: {
      "Fintech": {
        assunto: "{empresa}: crescer no Brasil com marca, não só performance",
        corpo: "Olá, {nome}!\n\nFintech que só liga performance no Brasil trava quando o CAC sobe — falta marca. A 404 constrói posicionamento que sustenta o crescimento.\n\nVale 20 min pra {empresa}?"
      },
      "B2B Tech": {
        assunto: "{empresa}: comunicar valor sem parecer manual técnico",
        corpo: "Olá, {nome}!\n\nB2B costuma ter produto forte e comunicação fria — e isso trava geração de demanda. A 404 humaniza a marca sem perder a substância.\n\n20 min pra eu te mostrar aplicado à {empresa}?"
      },
      "Serviços Financeiros": {
        assunto: "{empresa}: marca que comunica confiança e inovação ao mesmo tempo",
        corpo: "Olá, {nome}!\n\nServiços financeiros que comunicam só confiança perdem pra quem comunica inovação também. A 404 une os dois ângulos.\n\nTopa 20 min pra {empresa}?"
      },
      "Beleza": {
        assunto: "{empresa}: desejo no digital sem perder a aura",
        corpo: "Olá, {nome}!\n\nMarca premium no digital é um equilíbrio delicado — escalar sem diluir o desejo. A 404 une tecnologia e criatividade pra marcas como a {empresa} comunicarem à altura.\n\n20 min pra eu te mostrar?"
      },
      "E-commerce": {
        assunto: "{empresa}: nicho é vantagem — se a marca contar isso",
        corpo: "Olá, {nome}!\n\nVarejo de nicho ganha de player grande quando a marca traduz o porquê de existir. A 404 ajuda a {empresa} a transformar nicho em posicionamento.\n\nTopa 20 min?"
      },
      "Proptech": {
        assunto: "{empresa}: inovação no produto — e na comunicação?",
        corpo: "Olá, {nome}!\n\nProptech inovadora com comunicação ainda no modelo tradicional entrega menos do que poderia. A 404 cria o posicionamento que faz o mercado entender o que a {empresa} tem de novo.\n\n20 min?"
      }
    }
  },

  cccaramelo: {
    nome: "Caramelo",
    assinatura: "Pedro Ica · Head of Growth — cccaramelo\npedro.ica@galeriaholding.co | cccaramelo.com",
    default: {
      assunto: "{empresa}: cultura vende nos dois lados",
      corpo: "Olá, {nome}!\n\nSeja B2C ou B2B, quem tem relevância cultural é lembrado primeiro. A Caramelo constrói isso pra {empresa}.\n\nTopa 20 min pra eu te mostrar?"
    },
    porSetor: {
      "Farma": {
        assunto: "{empresa}: farma que fala como gente, não como bula",
        corpo: "Olá, {nome}!\n\nFarma tem verba mas comunicação distante — e o público mais jovem não se conecta. A Caramelo aproxima a {empresa} da cultura, com relevância real.\n\n20 min pra eu te mostrar?"
      },
      "Educacao": {
        assunto: "{empresa}: falar a língua de quem decide o curso",
        corpo: "Olá, {nome}!\n\nEm educação, quem conecta com a cultura do jovem capta melhor. A Caramelo põe a {empresa} dentro da conversa — música, criadores, comunidade.\n\nVale 20 min?"
      },
      "Food": {
        assunto: "{empresa}: marca pequena, presença cultural grande",
        corpo: "Olá, {nome}!\n\nMarca de comida cresce quando vira cultura, não só cardápio. A Caramelo faz a {empresa} ganhar comunidade e fandom.\n\nTopa 20 min?"
      },
      "FMCG": {
        assunto: "{empresa}: personalidade própria dentro do grupo",
        corpo: "Olá, {nome}!\n\nMarca dentro de um grande grupo pode se perder no guarda-chuva. A Caramelo dá à {empresa} um território cultural próprio, com cara e voz.\n\n20 min pra eu mostrar?"
      },
      "Beleza": {
        assunto: "{empresa} e a GenZ: sem parecer que está tentando",
        corpo: "Olá, {nome}!\n\nGenZ fareja marca forçada a quilômetros. A Caramelo conecta a {empresa} de dentro da cultura — música, creators, comunidades — de um jeito que soa verdadeiro.\n\n20 min?"
      },
      "Streaming": {
        assunto: "{empresa}: relevância cultural fora do próprio produto",
        corpo: "Olá, {nome}!\n\nPlataforma de entretenimento que precisa de presença cultural fora do próprio produto — é exatamente o que a Caramelo faz.\n\n20 min pra {empresa}?"
      },
      "Social Media": {
        assunto: "{empresa}: território cultural que gera pertencimento",
        corpo: "Olá, {nome}!\n\nMarca que existe no social mas sem território cultural que gere pertencimento fica só como mídia paga. A Caramelo muda isso pra {empresa}.\n\nTopa 20 min?"
      }
    }
  }

};
