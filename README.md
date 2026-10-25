# Datative

<div align="center">
  <img src="assets/logo.png" alt="Datative Logo" width="200" />
</div>

Datative é um site estático de investigação que mostra as redes das entidades (CNPJ/CPF) com maior abrangência entre datasets publicos federais — Receita Federal, CGU, TSE, SIAFI e mais. Não há consulta ao vivo: todo o grafo de cada entidade é pré-computado offline e servido como JSON estático.

![Datative Screenshot](assets/datative.png)

## Principais capacidades

- Landing page lista as 50 empresas e 50 pessoas pré-computadas com maior abrangência (número de datasets distintos em que aparecem, não volume de linhas), em seções separadas.
- Visualização de grafo (empresa/pessoa <-> sócios <-> registros de outros datasets), servida a partir de `static/entities/<id>.json`. Cada dataset com hits vira um nó-hub colorido (ex. "CGU · Contratos") com seus registros pendurados embaixo.
- O grafo em si mostra só uma amostra por dataset (evita virar um emaranhado) — o painel lateral mostra a tabela completa, com todas as linhas, independente do que está visível no grafo.
- Painel lateral (esquerda) com uma seção por dataset (tabela de colunas originais, linha a linha) — clicar no nó-hub de um dataset no grafo foca/expande a seção correspondente. Painel de detalhes do nó selecionado fica à direita.
- Layouts de grafo:
  - `radial`
  - `radial-compact` ("Radial Compacto") — mesmo layout, mas limita quantos registros de cada dataset aparecem no anel (o resto vira um nó "+N mais"), para grafos com muitos hits por dataset
  - `forceatlas2`
  - `collapsible-tree`
  - `pack` (circle packing hierarquico, estilo D3 pack)
- Sem servidor de dados em tempo de request — `src/index.ts` só lê arquivos estáticos.


## O que dá para descobrir

O valor está no cruzamento: cada dataset sozinho é uma lista, mas a mesma entidade aparecendo em vários deles conta uma história. Alguns exemplos de perguntas que o grafo e o painel ajudam a responder:

- **Doou e depois foi contratado?** Uma empresa (ou seu sócio) aparece em *TSE · Receitas de Candidatos* como doadora e, nos anos seguintes, em *CGU · Contratos*, *TCE-RJ · Contratos* ou *SICONV · Obras* como fornecedora do poder público.
- **Punida, mas ainda vendendo ao governo?** Um CNPJ listado em *CGU · CEIS*, *CNEP* ou *TCU · Empresas Inidôneas* que continua surgindo em *MGI · Compras sem Licitação* ou *MGI · Ofertas em Pregão*. As datas no painel mostram se o contrato veio antes ou durante a sanção.
- **Devedor que recebe dinheiro público.** Débitos em *PGFN · Dívida Ativa* ao lado de financiamentos do *BNDES*, crédito rural subsidiado no *BCB · SICOR* ou recursos da *Lei Rouanet*.
- **Passivo ambiental e trabalhista.** A mesma empresa com *IBAMA · Autos de Infração* ou *Termos de Embargo*, presença na *MTE · Lista Suja* e, ao mesmo tempo, *ANM · Portarias de Lavra*, *ANA · Outorgas* ou armazéns de soja mapeados pela *TRASE*.
- **Quem controla quem.** *Holdings* e *CVM · Acionistas / Posições Acionárias* desenham cadeias de participação; *CVM · Administradores* e *Relações Familiares* mostram as pessoas por trás delas, e os sócios na Receita fecham o círculo.
- **Política e fornecimento.** Um fornecedor que aparece nas despesas de campanha (*TSE · Despesas de Candidatos*) e também na cota parlamentar (*Câmara · Despesas*, *Senado · CEAPS*), ou um instituto de pesquisa eleitoral pago por quem também contrata com o governo.
- **Licitações combinadas.** Empresas que disputam as mesmas licitações (*CGU · Participantes*, *MIDES · Participantes*) e compartilham sócios: um sinal clássico de concorrência simulada.

Para navegar: comece pelo nó central, clique num nó-hub colorido para abrir a tabela completa daquele dataset no painel à esquerda (as linhas com data vêm da mais recente para a mais antiga) e cruze com os outros hubs.

## Datasets consultados

Para cada entidade, o gerador procura correspondências de CNPJ/CPF nas 117 tabelas abaixo (todas usando o [rodado.xyz](https://rodado.xyz)). Além delas, `br_me_cnpj.empresas` e `br_me_cnpj.socios` montam a base da rede (empresa ↔ sócios). Tabelas com CPF só entram quando a pessoa aparece em papel de prestação de contas pública (sanções, TSE, TCU, IBAMA, administradores na CVM, fornecedores/beneficiários de recursos públicos) — programas sociais, folha de servidores e filiação partidária ficam de fora de propósito.

| Dataset | Descrição |
|---|---|
| CGU · Contratos | Contratos firmados pelo governo federal, com objeto, valor e contratado |
| CGU · Itens de Licitação | Itens licitados pelo governo federal e quem venceu cada um |
| CGU · Participantes de Licitação | Empresas e pessoas que disputaram licitações federais |
| CGU · Cartão Gov. Federal | Gastos com cartão corporativo do governo federal, por favorecido |
| CGU · Cartão Defesa Civil | Gastos com o cartão de pagamento da Defesa Civil |
| CGU · Compras Centralizadas | Compras centralizadas pagas com cartão do governo federal |
| TSE · Despesas de Candidatos | Despesas de campanha declaradas por candidatos, com fornecedor |
| TSE · Receitas de Candidatos | Doações recebidas por candidatos, com doador |
| TSE · Receitas de Comitê | Doações recebidas por comitês de campanha |
| TSE · Receitas Órgão Partidário | Doações recebidas por diretórios partidários |
| MS · CNES Estabelecimentos | Cadastro nacional de estabelecimentos de saúde e suas mantenedoras |
| Câmara · Despesas | Despesas da cota parlamentar dos deputados, por fornecedor |
| Câmara · Contratos | Contratos administrativos da Câmara dos Deputados |
| Anatel · Banda Larga Fixa | Acessos de banda larga fixa por prestadora e município |
| ANP · Preços Combustíveis | Preços de combustíveis coletados pela ANP em cada posto |
| ANS · Beneficiários | Beneficiários de planos de saúde por operadora |
| BCB · ESTBAN Agências | Saldos contábeis (ESTBAN) das agências bancárias |
| BCB · SICOR Operações | Operações de crédito rural, com instituição financeira e agentes |
| BD · Diretórios Brasil | Diretório de empresas da Base dos Dados |
| CVM · Administradores PJ | Administradoras de carteira (PJ) registradas na CVM |
| CVM · Ofertas Públicas | Ofertas públicas de valores mobiliários: emissor, líder e ofertante |
| INEP · Censo Escolar | Escolas do Censo Escolar, com CNPJ da escola privada e mantenedora |
| TRASE · Soja Crushing | Esmagadoras de soja mapeadas pela TRASE |
| TRASE · Soja Armazenamento | Armazéns de soja mapeados pela TRASE |
| MS · SIH AIHs | Internações hospitalares pagas pelo SUS (AIH), por estabelecimento |
| CNPJ · Estabelecimentos | Filiais e endereços da empresa na Receita Federal |
| RF · CNO Obras | Obras de construção civil registradas no CNO, por responsável |
| RF · CNO Vínculos | Vínculos de responsáveis com obras do CNO |
| MIDES · Itens de Licitação | Itens de licitações municipais (MIDES/Banco Mundial) |
| MIDES · Participantes de Licitação | Participantes de licitações municipais (MIDES/Banco Mundial) |
| BCB · SICOR Cooperados | Cooperados beneficiados por crédito rural com recurso público |
| BCB · SICOR Mutuários | Tomadores de crédito rural com recurso público |
| BCB · SICOR Propriedades Rurais | Propriedades rurais ligadas a operações de crédito rural |
| MS · SIH Serviços Profissionais | Serviços profissionais faturados em internações do SUS |
| Holdings · Sócias (quem me possui) | Empresas que são sócias desta empresa (Brasil.IO) |
| Holdings · Participações (o que eu possuo) | Empresas das quais esta empresa é sócia (Brasil.IO) |
| PGFN · Dívida Ativa | Débitos inscritos na dívida ativa da União |
| TCU · Empresas Inidôneas | Empresas declaradas inidôneas pelo TCU para licitar |
| TCU · Contas Julgadas Irregulares | Responsáveis por contas julgadas irregulares pelo TCU |
| CVM · Fundos de Investimento | Fundos de investimento com administrador, gestor, auditor e custodiante |
| SICAF · Fornecedores | Fornecedores cadastrados no SICAF para vender ao governo |
| BNDES · Operações | Financiamentos diretos do BNDES, por cliente |
| BCB · Penalidades | Penalidades aplicadas pelo Banco Central |
| TCE-RJ · Contratos (Estado) | Contratos do governo do Estado do Rio de Janeiro |
| TCE-RJ · Contratos (Município) | Contratos dos municípios fluminenses |
| Procon · Reclamações | Reclamações de consumidores registradas nos Procons |
| CGU · CEIS (Inidôneas e Suspensas) | Empresas e pessoas inidôneas ou suspensas de contratar com o governo |
| CGU · CNEP (Empresas Punidas) | Empresas punidas pela Lei Anticorrupção |
| CGU · CEPIM (Entidades Impedidas) | Entidades sem fins lucrativos impedidas de receber recursos |
| CGU · Acordos de Leniência | Acordos de leniência firmados com a CGU |
| TCU · Inabilitados p/ Função Pública | Pessoas inabilitadas pelo TCU para cargo público |
| TCU · Contas Irregulares (Implicação Eleitoral) | Contas irregulares no TCU com implicação eleitoral |
| MTE · Lista Suja (Trabalho Escravo) | Empregadores flagrados com trabalho análogo ao escravo |
| MTE · CEAC (Ajuste de Conduta) | Empregadores com termo de ajuste de conduta trabalhista |
| IBAMA · Autos de Infração | Autos de infração ambiental lavrados pelo IBAMA |
| IBAMA · Termos de Embargo | Áreas e atividades embargadas pelo IBAMA |
| IBAMA · Decisões de Embargo | Decisões em processos de embargo do IBAMA |
| IBAMA · CTF Atividades Poluidoras | Cadastro técnico de atividades potencialmente poluidoras |
| IBAMA · CTF Instrumentos de Defesa Ambiental | Cadastro técnico de instrumentos de defesa ambiental |
| MGI · Fornecedores | Fornecedores do sistema de compras públicas federal |
| MGI · Itens de Licitação | Itens de licitações federais, por fornecedor |
| MGI · Compras sem Licitação | Compras federais com dispensa ou inexigibilidade de licitação |
| MGI · Ofertas em Pregão | Lances e ofertas em pregões federais |
| Câmara · Propostas (Fornecedor) | Propostas de fornecedores em licitações da Câmara |
| Câmara · Itens Contratados (Fornecedor) | Itens contratados pela Câmara, por fornecedor |
| Senado · CEAPS (Cota Parlamentar) | Despesas da cota parlamentar dos senadores, por fornecedor |
| Senado · Contratações | Contratações administrativas do Senado |
| Senado · Empresas Cadastradas | Empresas cadastradas como fornecedoras do Senado |
| TSE · Candidaturas | Candidaturas registradas no TSE |
| TSE · Pesquisas Eleitorais (Instituto) | Institutos que registraram pesquisas eleitorais |
| TSE · Pesquisas Eleitorais (Contratante) | Quem contratou pesquisas eleitorais |
| TSE · Pesquisas Eleitorais (Pagante) | Quem pagou pesquisas eleitorais |
| CVM · Companhias Abertas | Cadastro de companhias abertas e seus auditores |
| CVM · Acionistas (quem me possui) | Acionistas relevantes desta companhia aberta |
| CVM · Posições Acionárias (o que eu possuo) | Companhias abertas em que esta entidade é acionista |
| CVM · Sociedades Participadas | Sociedades em que a companhia aberta tem participação |
| CVM · Participação de Companhias Abertas | Companhias abertas que participam desta empresa |
| CVM · Auditores | Auditores independentes das companhias abertas |
| CVM · Escrituradores | Escrituradores de ações das companhias abertas |
| CVM · Administradores e Conselho Fiscal | Diretores, conselheiros e membros do conselho fiscal |
| CVM · Relações Familiares de Administradores | Relações familiares declaradas entre administradores |
| CVM · Registro de Fundos | Registro de fundos na CVM, com administrador e gestor |
| CVM · Classes de Fundos | Classes de fundos, com auditor, custodiante e controlador |
| CVM · Responsáveis de Administradoras | Responsáveis técnicos por administradoras de carteira |
| BNDES · Operações Indiretas (Agente) | Operações indiretas do BNDES, pelo agente financeiro repassador |
| BNDES · Exportação de Bens | Financiamentos do BNDES à exportação de bens |
| BNDES · Exportação de Serviços | Financiamentos do BNDES à exportação de serviços |
| BCB · IF.data Cadastro | Cadastro de instituições financeiras e conglomerados (IF.data) |
| BCB · SICOR Instituições | Instituições financeiras que operam crédito rural |
| BCB · SICOR Agências | Agências bancárias em operações de crédito rural |
| ANS · Operadoras Ativas | Operadoras de planos de saúde com registro ativo |
| ANS · Operadoras Canceladas | Operadoras de planos de saúde com registro cancelado |
| ANS · Penalidades | Multas e penalidades aplicadas pela ANS a operadoras |
| ANP · Preços de Revenda | Preços de revenda de combustíveis por posto |
| ANVISA · CMED Preços de Medicamentos | Preços máximos de medicamentos (CMED), por laboratório |
| ANEEL · Geração Distribuída | Micro e minigeração distribuída (ex. solar), por titular |
| ANEEL · Tarifas Homologadas | Tarifas de energia homologadas por distribuidora |
| ANTT · RNTRC Transportadores | Transportadores rodoviários de carga registrados na ANTT |
| ANA · Outorgas de Captação | Outorgas de captação de água concedidas pela ANA |
| ANA · Outorgas de Lançamento | Outorgas de lançamento de efluentes concedidas pela ANA |
| ANM · CFEM Arrecadação | Royalties de mineração (CFEM) pagos à ANM |
| ANM · CFEM Autuações | Autuações por falta de pagamento da CFEM |
| ANM · Portarias de Lavra | Portarias de lavra (direito de extrair minério) |
| ANM · Alvarás de Pesquisa | Alvarás de pesquisa mineral |
| ANM · Requerimentos de Pesquisa | Pedidos de pesquisa mineral |
| ANM · Licenciamentos | Licenciamentos minerais (areia, brita, argila) |
| Saúde · Banco de Preços (BPS) | Compras de produtos de saúde: instituição, fornecedor e fabricante |
| Saúde · Farmácia Popular | Farmácias credenciadas no Farmácia Popular |
| CGU · Terceirizados (Empresa) | Empresas que fornecem terceirizados ao governo federal |
| CGU · Gás do Povo (Revenda) | Revendas credenciadas no programa Gás do Povo |
| MinC · SALIC (Lei Rouanet) | Proponentes de projetos culturais da Lei Rouanet |
| SICONV · Obras (Fornecedor) | Fornecedores de obras pagas com convênios federais |
| SICONV · Apoiadores de Emendas | Proponentes e solicitantes de emendas parlamentares |
| SICONV · Consórcios | Consórcios públicos e seus participantes |
| RF · Fundos Habilitados (Doações DIRPF) | Fundos habilitados a receber doações deduzíveis do IR |
| RAIS · Estabelecimentos Identificados | Estabelecimentos empregadores declarados na RAIS |
| CNPJ · Simples Nacional / MEI | Opção pelo Simples Nacional e pelo MEI |

## Estrutura de arquivos

- `src/`: servidor + templates + cliente de grafo
- `scripts/`: `generate-static-entities.ts`, `build-site.ts`, `benchmark.ts`, `lib/` (acesso a dados offline)
- `data/`: `schemas.json` (catálogo de tabelas)
- `static/`: saída gerada por `generate-static-entities.ts` (`entities/`, `entities-index.json`) — fonte de dados tanto do servidor de dev quanto do export estático
- `public/`: `graph.js` (bundle gerado a partir de `src/graph-client.ts`) e `favicon.svg`
- `dist/`: saída de `bun run build:site` (gitignored — gerado no CI a cada deploy)
- `tests/`: testes unitários (`bun test`)

## Licenca

Defina aqui a licenca oficial do projeto (ex.: MIT, Apache-2.0, proprietaria).
