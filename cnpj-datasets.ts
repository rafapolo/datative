export interface CnpjColumn {
  name: string;
  type: "basico" | "full" | "mixed";
}

export interface RelatedLookup {
  datasetId: string;   // ID in RELATED_DATASETS
  localKey: string;    // field on this node's row holding the join value
  foreignKey: string;  // column in the related table to match against
}

export interface CnpjDatasetEntry {
  id: string;
  label: string;
  color: string;
  table: string;
  cnpjColumns: CnpjColumn[];
  displayFields: string[];
  yearField?: string;
  nodeType?: "contrato" | "doacao" | "estabelecimento" | "pagamento";
  nodeIdField?: string;
  nodeLabelField?: string;
  relatedLookups?: RelatedLookup[];
}

export interface RelatedDatasetEntry {
  id: string;
  label: string;
  color: string;
  table: string;
  displayFields: string[];
  nodeType?: "contrato" | "doacao" | "estabelecimento" | "pagamento";
  nodeIdField?: string;
  nodeLabelField?: string;
}

export const CNPJ_DATASETS: CnpjDatasetEntry[] = [
  // --- CGU Licitações e Contratos ---
  {
    id: "licitacao_contrato",
    label: "CGU · Contratos",
    color: "#ef4444",
    table: "basedosdados.br_cgu_licitacao_contrato.contrato_compra",
    cnpjColumns: [{ name: "cpf_cnpj_contratado", type: "mixed" }],
    displayFields: ["id_contrato", "id_licitacao", "objeto", "valor_inicial_compra", "data_assinatura_contrato", "nome_contratado", "cpf_cnpj_contratado"],
    nodeType: "contrato",
    nodeIdField: "id_contrato",
    nodeLabelField: "nome_contratado",
    relatedLookups: [
      { datasetId: "cgu_licitacao", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "cgu_licitacao_empenho", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "cgu_contrato_item", localKey: "id_contrato", foreignKey: "id_contrato" },
      { datasetId: "cgu_contrato_termo_aditivo", localKey: "id_contrato", foreignKey: "id_contrato" },
      { datasetId: "cgu_contrato_apostilamento", localKey: "id_contrato", foreignKey: "id_contrato" },
    ],
  },
  {
    id: "licitacao_item",
    label: "CGU · Itens de Licitação",
    color: "#f97316",
    table: "basedosdados.br_cgu_licitacao_contrato.licitacao_item",
    cnpjColumns: [{ name: "cpf_cnpj_vencedor", type: "mixed" }],
    displayFields: ["id_licitacao", "descricao_item", "valor_item", "nome_vencedor", "cpf_cnpj_vencedor"],
    relatedLookups: [
      { datasetId: "cgu_licitacao", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "cgu_licitacao_empenho", localKey: "id_licitacao", foreignKey: "id_licitacao" },
    ],
  },
  {
    id: "licitacao_participante",
    label: "CGU · Participantes de Licitação",
    color: "#eab308",
    table: "basedosdados.br_cgu_licitacao_contrato.licitacao_participante",
    cnpjColumns: [{ name: "cpf_cnpj_participante", type: "mixed" }],
    displayFields: ["id_licitacao", "nome_participante", "cpf_cnpj_participante", "vencedor"],
    relatedLookups: [
      { datasetId: "cgu_licitacao", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "cgu_licitacao_empenho", localKey: "id_licitacao", foreignKey: "id_licitacao" },
    ],
  },

  // --- CGU Cartão de Pagamento ---
  {
    id: "cartao_gov",
    label: "CGU · Cartão Gov. Federal",
    color: "#22c55e",
    table: "basedosdados.br_cgu_cartao_pagamento.microdados_governo_federal",
    cnpjColumns: [{ name: "cnpj_cpf_favorecido", type: "mixed" }],
    displayFields: ["nome_favorecido", "cnpj_cpf_favorecido", "valor_transacao", "data_transacao", "nome_portador"],
    nodeType: "pagamento",
    nodeIdField: "cnpj_cpf_favorecido",
    nodeLabelField: "nome_favorecido",
  },
  {
    id: "cartao_defesa_civil",
    label: "CGU · Cartão Defesa Civil",
    color: "#14b8a6",
    table: "basedosdados.br_cgu_cartao_pagamento.microdados_defesa_civil",
    cnpjColumns: [{ name: "cnpj_cpf_favorecido", type: "mixed" }],
    displayFields: ["nome_favorecido", "cnpj_cpf_favorecido", "valor_transacao", "data_transacao"],
    nodeType: "pagamento",
    nodeIdField: "cnpj_cpf_favorecido",
    nodeLabelField: "nome_favorecido",
  },
  {
    id: "cartao_centralizado",
    label: "CGU · Compras Centralizadas",
    color: "#06b6d4",
    table: "basedosdados.br_cgu_cartao_pagamento.microdados_compras_centralizadas",
    cnpjColumns: [{ name: "cnpj_cpf_favorecido", type: "mixed" }],
    displayFields: ["nome_favorecido", "cnpj_cpf_favorecido", "valor_transacao", "data_transacao"],
    nodeType: "pagamento",
    nodeIdField: "cnpj_cpf_favorecido",
    nodeLabelField: "nome_favorecido",
  },

  // --- TSE Eleições ---
  {
    id: "tse_despesas",
    label: "TSE · Despesas de Candidatos",
    color: "#3b82f6",
    table: "basedosdados.br_tse_eleicoes.despesas_candidato",
    cnpjColumns: [
      { name: "cpf_cnpj_fornecedor", type: "mixed" },
      { name: "cnpj_candidato", type: "full" },
    ],
    displayFields: ["sequencial_candidato", "cargo", "sigla_partido", "nome_fornecedor", "cpf_cnpj_fornecedor", "cnpj_candidato", "valor_despesa", "descricao_despesa", "data_despesa", "ano"],
    nodeType: "contrato",
    nodeIdField: "sequencial_candidato",
    nodeLabelField: "cargo",
    relatedLookups: [
      { datasetId: "tse_candidato", localKey: "sequencial_candidato", foreignKey: "sequencial" },
      { datasetId: "tse_bens_candidato", localKey: "sequencial_candidato", foreignKey: "sequencial_candidato" },
      { datasetId: "tse_resultados_candidato", localKey: "sequencial_candidato", foreignKey: "sequencial_candidato" },
    ],
  },
  {
    id: "tse_receitas",
    label: "TSE · Receitas de Candidatos",
    color: "#8b5cf6",
    table: "basedosdados.br_tse_eleicoes.receitas_candidato",
    cnpjColumns: [
      { name: "cpf_cnpj_doador", type: "mixed" },
      { name: "cnpj_candidato", type: "full" },
    ],
    displayFields: ["sequencial_candidato", "cargo", "sigla_partido", "nome_doador", "cpf_cnpj_doador", "cnpj_candidato", "valor_receita", "descricao_receita", "data_receita", "ano"],
    nodeType: "doacao",
    nodeIdField: "sequencial_candidato",
    nodeLabelField: "cargo",
    relatedLookups: [
      { datasetId: "tse_candidato", localKey: "sequencial_candidato", foreignKey: "sequencial" },
      { datasetId: "tse_bens_candidato", localKey: "sequencial_candidato", foreignKey: "sequencial_candidato" },
      { datasetId: "tse_resultados_candidato", localKey: "sequencial_candidato", foreignKey: "sequencial_candidato" },
    ],
  },
  {
    id: "tse_receitas_comite",
    label: "TSE · Receitas de Comitê",
    color: "#d946ef",
    table: "basedosdados.br_tse_eleicoes.receitas_comite",
    cnpjColumns: [{ name: "cpf_cnpj_doador", type: "mixed" }],
    displayFields: ["sigla_partido", "nome_doador", "cpf_cnpj_doador", "valor_receita", "data_receita", "ano"],
    nodeType: "doacao",
    nodeIdField: "cpf_cnpj_doador",
    nodeLabelField: "nome_doador",
  },
  {
    id: "tse_receitas_orgao",
    label: "TSE · Receitas Órgão Partidário",
    color: "#ec4899",
    table: "basedosdados.br_tse_eleicoes.receitas_orgao_partidario",
    cnpjColumns: [{ name: "cpf_cnpj_doador", type: "mixed" }],
    displayFields: ["nome_partido", "nome_doador", "cpf_cnpj_doador", "valor_receita", "data_receita", "ano"],
    nodeType: "doacao",
    nodeIdField: "cpf_cnpj_doador",
    nodeLabelField: "nome_doador",
  },

  // --- Exportadoras / Importadoras ---
  {
    id: "exportadoras",
    label: "ME · Exportadoras/Importadoras",
    color: "#10b981",
    table: "basedosdados.br_me_exportadoras_importadoras.estabelecimentos",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "razao_social", "sigla_uf", "id_municipio", "id_exportacao_importacao"],
    nodeType: "estabelecimento",
    nodeIdField: "cnpj",
    nodeLabelField: "razao_social",
  },

  // --- CNES ---
  {
    id: "cnes",
    label: "MS · CNES Estabelecimentos",
    color: "#f59e0b",
    table: "basedosdados.br_ms_cnes.estabelecimento",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["id_estabelecimento_cnes", "cpf_cnpj", "tipo_unidade", "id_municipio", "sigla_uf"],
    nodeType: "estabelecimento",
    nodeIdField: "cpf_cnpj",
    nodeLabelField: "id_estabelecimento_cnes",
    relatedLookups: [
      { datasetId: "cnes_profissional", localKey: "id_estabelecimento_cnes", foreignKey: "id_estabelecimento_cnes" },
      { datasetId: "cnes_equipe", localKey: "id_estabelecimento_cnes", foreignKey: "id_estabelecimento_cnes" },
      { datasetId: "cnes_leito", localKey: "id_estabelecimento_cnes", foreignKey: "id_estabelecimento_cnes" },
      { datasetId: "cnes_servico_especializado", localKey: "id_estabelecimento_cnes", foreignKey: "id_estabelecimento_cnes" },
    ],
  },

  // --- Câmara dos Deputados ---
  {
    id: "camara_despesa",
    label: "Câmara · Despesas",
    color: "#84cc16",
    table: "basedosdados.br_camara_dados_abertos.despesa",
    cnpjColumns: [{ name: "cnpj_cpf_fornecedor", type: "mixed" }],
    displayFields: ["id_deputado", "nome_parlamentar", "fornecedor", "cnpj_cpf_fornecedor", "valor_liquido", "categoria_despesa", "ano_competencia"],
    yearField: "ano_competencia",
    nodeType: "pagamento",
    nodeIdField: "cnpj_cpf_fornecedor",
    nodeLabelField: "fornecedor",
    relatedLookups: [
      { datasetId: "camara_deputado", localKey: "id_deputado", foreignKey: "id_deputado" },
    ],
  },
  {
    id: "camara_contrato",
    label: "Câmara · Contratos",
    color: "#0ea5e9",
    table: "basedosdados.br_camara_dados_abertos.licitacao_contrato",
    cnpjColumns: [{ name: "cpf_cnpj_fornecedor", type: "mixed" }],
    displayFields: ["id_licitacao", "id_contrato", "descricao", "nome_fornecedor", "cpf_cnpj_fornecedor", "valor_original", "data_assinatura"],
    nodeType: "contrato",
    nodeIdField: "id_contrato",
    nodeLabelField: "nome_fornecedor",
    relatedLookups: [
      { datasetId: "camara_licitacao", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "camara_licitacao_item", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "camara_licitacao_pedido", localKey: "id_licitacao", foreignKey: "id_licitacao" },
      { datasetId: "camara_licitacao_proposta", localKey: "id_licitacao", foreignKey: "id_licitacao" },
    ],
  },

  // --- Anatel ---
  {
    id: "anatel",
    label: "Anatel · Banda Larga Fixa",
    color: "#6366f1",
    table: "basedosdados.br_anatel_banda_larga_fixa.microdados",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "empresa", "produto", "velocidade", "sigla_uf", "id_municipio"],
  },

  // --- ANP ---
  {
    id: "anp_combustiveis",
    label: "ANP · Preços Combustíveis",
    color: "#a855f7",
    table: "basedosdados.br_anp_precos_combustiveis.microdados",
    cnpjColumns: [{ name: "cnpj_revenda", type: "full" }],
    displayFields: ["cnpj_revenda", "nome_estabelecimento", "produto", "preco_venda", "data_coleta", "sigla_uf", "id_municipio"],
  },

  // --- ANS ---
  {
    id: "ans",
    label: "ANS · Beneficiários",
    color: "#f43f5e",
    table: "basedosdados.br_ans_beneficiario.informacao_consolidada",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "razao_social", "modalidade_operadora", "sigla_uf", "id_municipio"],
  },

  // --- BCB ---
  {
    id: "bcb_agencia",
    label: "BCB · ESTBAN Agências",
    color: "#0891b2",
    table: "basedosdados.br_bcb_estban.agencia",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["cnpj_basico", "instituicao", "sigla_uf", "id_municipio", "valor"],
  },
  {
    id: "bcb_sicor",
    label: "BCB · SICOR Operações",
    color: "#059669",
    table: "basedosdados.br_bcb_sicor.microdados_operacao",
    cnpjColumns: [{ name: "cnpj_basico_instituicao_financeira", type: "basico" }],
    displayFields: ["cnpj_basico_instituicao_financeira", "valor_parcela_credito", "area_financiada", "taxa_juro", "ano"],
  },

  // --- Base dos Dados · Diretórios ---
  {
    id: "bd_empresa",
    label: "BD · Diretórios Brasil",
    color: "#7c3aed",
    table: "basedosdados.br_bd_diretorios_brasil.empresa",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["cnpj_basico", "razao_social", "nome_fantasia", "natureza_juridica", "situacao_cadastral"],
  },

  // --- CGU Pessoal ---
  {
    id: "cgu_terceirizados",
    label: "CGU · Terceirizados",
    color: "#c2410c",
    table: "basedosdados.br_cgu_pessoal_executivo_federal.terceirizados",
    cnpjColumns: [{ name: "cnpj_empresa", type: "full" }],
    displayFields: ["cnpj_empresa", "razao_social_empresa", "unidade_gestora", "nome", "categoria_profissional"],
  },

  // --- CVM ---
  {
    id: "cvm_pj",
    label: "CVM · Administradores PJ",
    color: "#15803d",
    table: "basedosdados.br_cvm_administradores_carteira.pessoa_juridica",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "denominacao_social", "categoria_registro", "situacao", "data_registro"],
  },
  {
    id: "cvm_oferta",
    label: "CVM · Ofertas Públicas",
    color: "#1d4ed8",
    table: "basedosdados.br_cvm_oferta_publica_distribuicao.dia",
    cnpjColumns: [{ name: "cnpj_emissor", type: "full" }],
    displayFields: ["cnpj_emissor", "nome_emissor", "tipo_ativo", "valor_total", "data_registro_oferta"],
  },

  // --- INEP ---
  {
    id: "inep_escola",
    label: "INEP · Censo Escolar",
    color: "#92400e",
    table: "basedosdados.br_inep_censo_escolar.escola",
    cnpjColumns: [{ name: "cnpj_escola_privada", type: "full" }],
    displayFields: ["id_escola", "cnpj_escola_privada", "rede", "tipo_categoria_escola_privada", "sigla_uf", "id_municipio"],
    relatedLookups: [
      { datasetId: "inep_turma", localKey: "id_escola", foreignKey: "id_escola" },
      { datasetId: "inep_docente", localKey: "id_escola", foreignKey: "id_escola" },
    ],
  },

  // --- TRASE ---
  {
    id: "trase_crushing",
    label: "TRASE · Soja Crushing",
    color: "#be123c",
    table: "basedosdados.br_trase_supply_chain.soy_beans_crushing_facilities",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "company", "state", "municipality_id", "capacity"],
  },
  {
    id: "trase_storage",
    label: "TRASE · Soja Armazenamento",
    color: "#0369a1",
    table: "basedosdados.br_trase_supply_chain.soy_beans_storage_facilities",
    cnpjColumns: [{ name: "cnpj_cpf", type: "mixed" }],
    displayFields: ["cnpj_cpf", "company", "state", "municipality_id", "capacity"],
  },

  // --- SP ALESP ---
  {
    id: "sp_alesp",
    label: "SP · ALESP Despesas",
    color: "#ca8a04",
    table: "basedosdados.br_sp_alesp.despesas_gabinete",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["nome_deputado", "fornecedor", "cpf_cnpj", "valor", "tipo"],
    nodeType: "pagamento",
    nodeIdField: "cpf_cnpj",
    nodeLabelField: "fornecedor",
  },

  // --- MS SIH ---
  {
    id: "ms_sih",
    label: "MS · SIH AIHs",
    color: "#b45309",
    table: "basedosdados.br_ms_sih.aihs_reduzidas",
    cnpjColumns: [{ name: "cnpj_estabelecimento", type: "full" }],
    displayFields: ["cnpj_estabelecimento", "id_estabelecimento_cnes", "id_municipio_estabelecimento", "sigla_uf", "carater_internacao", "data_internacao", "procedimento_realizado", "valor_aih"],
  },

  // --- SGP Cartão Corporativo ---
  {
    id: "sgp_cartao",
    label: "SGP · Cartão Corporativo",
    color: "#047857",
    table: "basedosdados.br_sgp_informacao.despesas_cartao_corporativo",
    cnpjColumns: [{ name: "cpf_cnpj_fornecedor", type: "mixed" }],
    displayFields: ["nome_fornecedor", "cpf_cnpj_fornecedor", "valor", "tipo", "data_pagamento"],
    nodeType: "pagamento",
    nodeIdField: "cpf_cnpj_fornecedor",
    nodeLabelField: "nome_fornecedor",
  },

  // --- CNPJ Estabelecimentos ---
  {
    id: "estabelecimentos_cnpj",
    label: "CNPJ · Estabelecimentos",
    color: "#4f46e5",
    table: "basedosdados.br_me_cnpj.estabelecimentos",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["cnpj_basico", "cnpj", "nome_fantasia", "sigla_uf", "id_municipio", "cnae_fiscal_principal", "situacao_cadastral"],
    yearField: "ano",
    nodeType: "estabelecimento",
    nodeIdField: "cnpj",
    nodeLabelField: "nome_fantasia",
  },

  // --- RF CNO (Cadastro Nacional de Obras) ---
  {
    id: "rf_cno_obras",
    label: "RF · CNO Obras",
    color: "#78350f",
    table: "basedosdados.br_rf_cno.microdados",
    cnpjColumns: [{ name: "id_responsavel", type: "full" }],
    displayFields: ["id_cno", "nome_responsavel", "id_responsavel", "qualificacao_responsavel", "nome_empresarial", "situacao", "sigla_uf", "id_municipio", "data_registro"],
    nodeType: "contrato",
    nodeIdField: "id_cno",
    nodeLabelField: "nome_empresarial",
  },
  {
    id: "rf_cno_vinculos",
    label: "RF · CNO Vínculos",
    color: "#7c2d12",
    table: "basedosdados.br_rf_cno.vinculos",
    cnpjColumns: [{ name: "id_responsavel", type: "full" }],
    displayFields: ["id_cno", "id_responsavel", "qualificacao_contribuinte", "data_registro", "data_inicio", "data_fim"],
    nodeIdField: "id_cno",
    nodeLabelField: "id_responsavel",
  },

  // --- World Bank MIDES (licitações estaduais/municipais) ---
  {
    id: "mides_licitacao_item",
    label: "MIDES · Itens de Licitação",
    color: "#312e81",
    table: "basedosdados.world_wb_mides.licitacao_item",
    cnpjColumns: [{ name: "documento", type: "mixed" }],
    displayFields: ["ano", "sigla_uf", "id_municipio", "orgao", "id_licitacao", "descricao", "nome_vencedor", "documento", "valor_unitario", "valor_total"],
    yearField: "ano",
    nodeType: "contrato",
    nodeIdField: "id_licitacao_bd",
    nodeLabelField: "nome_vencedor",
    relatedLookups: [
      { datasetId: "mides_licitacao", localKey: "id_licitacao_bd", foreignKey: "id_licitacao_bd" },
    ],
  },
  {
    id: "mides_licitacao_participante",
    label: "MIDES · Participantes de Licitação",
    color: "#1e3a8a",
    table: "basedosdados.world_wb_mides.licitacao_participante",
    cnpjColumns: [{ name: "documento", type: "mixed" }],
    displayFields: ["ano", "sigla_uf", "id_municipio", "orgao", "id_licitacao", "razao_social", "documento", "habilitado", "classificado", "vencedor"],
    yearField: "ano",
    nodeType: "contrato",
    nodeIdField: "id_licitacao_bd",
    nodeLabelField: "razao_social",
    relatedLookups: [
      { datasetId: "mides_licitacao", localKey: "id_licitacao_bd", foreignKey: "id_licitacao_bd" },
    ],
  },

  // --- BCB SICOR sub-tabelas (tomadores/proprietários de crédito rural) ---
  {
    id: "sicor_cooperado",
    label: "BCB · SICOR Cooperados",
    color: "#064e3b",
    table: "basedosdados.br_bcb_sicor.recurso_publico_cooperado",
    cnpjColumns: [{ name: "tipo_cpf_cnpj", type: "mixed" }],
    displayFields: ["id_referencia_bacen", "numero_ordem", "tipo_cpf_cnpj", "tipo_pessoa", "valor_parcela"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "tipo_cpf_cnpj",
  },
  {
    id: "sicor_mutuario",
    label: "BCB · SICOR Mutuários",
    color: "#14532d",
    table: "basedosdados.br_bcb_sicor.recurso_publico_mutuario",
    cnpjColumns: [{ name: "tipo_cpf_cnpj", type: "mixed" }],
    displayFields: ["id_referencia_bacen", "tipo_cpf_cnpj", "tipo_beneficiario", "id_dap", "indicador_sexo"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "tipo_cpf_cnpj",
  },
  {
    id: "sicor_propriedade",
    label: "BCB · SICOR Propriedades Rurais",
    color: "#166534",
    table: "basedosdados.br_bcb_sicor.recurso_publico_propriedade",
    cnpjColumns: [{ name: "tipo_cpf_cnpj", type: "mixed" }],
    displayFields: ["id_referencia_bacen", "numero_ordem", "tipo_cpf_cnpj", "id_sncr", "id_nirf", "id_car"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "tipo_cpf_cnpj",
  },

  // --- MS SIH Serviços Profissionais ---
  {
    id: "sih_servicos",
    label: "MS · SIH Serviços Profissionais",
    color: "#881337",
    table: "basedosdados.br_ms_sih.servicos_profissionais",
    cnpjColumns: [{ name: "id_prestador_servico", type: "mixed" }],
    displayFields: ["ano", "mes", "sigla_uf", "id_aih", "id_estabelecimento_cnes", "id_prestador_servico", "tipo_servico", "id_procedimento_secundario", "quantidade_procedimentos"],
    yearField: "ano",
    nodeIdField: "id_aih",
    nodeLabelField: "id_prestador_servico",
  },
];

export const RELATED_DATASETS: RelatedDatasetEntry[] = [
  // --- CGU Licitação (joined by id_licitacao from CGU contratos/itens) ---
  {
    id: "cgu_licitacao",
    label: "CGU · Licitação",
    color: "#fb7185",
    table: "basedosdados.br_cgu_licitacao_contrato.licitacao",
    displayFields: ["id_licitacao", "objeto", "modalidade_compra", "situacao_licitacao", "valor_licitacao", "sigla_uf"],
    nodeType: "contrato",
    nodeIdField: "id_licitacao",
    nodeLabelField: "objeto",
  },
  {
    id: "cgu_licitacao_empenho",
    label: "CGU · Empenhos de Licitação",
    color: "#fbbf24",
    table: "basedosdados.br_cgu_licitacao_contrato.licitacao_empenho",
    displayFields: ["id_licitacao", "id_empenho", "nome_unidade_gestora", "modalidade", "observacao", "data_emissao", "valor"],
    nodeType: "pagamento",
    nodeIdField: "id_empenho",
    nodeLabelField: "nome_unidade_gestora",
  },
  {
    id: "cgu_contrato_item",
    label: "CGU · Itens de Contrato",
    color: "#f59e0b",
    table: "basedosdados.br_cgu_licitacao_contrato.contrato_item",
    displayFields: ["id_contrato", "id_item", "descricao_item", "descricao_complementar_item", "nome_orgao"],
    nodeIdField: "id_item",
    nodeLabelField: "descricao_item",
  },
  {
    id: "cgu_contrato_termo_aditivo",
    label: "CGU · Termos Aditivos",
    color: "#f97316",
    table: "basedosdados.br_cgu_licitacao_contrato.contrato_termo_aditivo",
    displayFields: ["id_contrato", "id_termo_aditivo", "nome_orgao", "nome_ug", "data_publicacao_dou"],
    nodeIdField: "id_termo_aditivo",
    nodeLabelField: "nome_orgao",
  },
  {
    id: "cgu_contrato_apostilamento",
    label: "CGU · Apostilamentos",
    color: "#fb923c",
    table: "basedosdados.br_cgu_licitacao_contrato.contrato_apostilamento",
    displayFields: ["id_contrato", "id_apostilamento", "descricao_apostilamento", "nome_orgao", "data_apostilamento"],
    nodeIdField: "id_apostilamento",
    nodeLabelField: "descricao_apostilamento",
  },
  {
    id: "tse_candidato",
    label: "TSE · Candidato",
    color: "#38bdf8",
    table: "basedosdados.br_tse_eleicoes.candidatos",
    displayFields: ["sequencial", "nome", "nome_urna", "cargo", "sigla_partido", "numero", "cpf", "situacao", "ano"],
    nodeIdField: "sequencial",
    nodeLabelField: "nome",
  },
  {
    id: "tse_bens_candidato",
    label: "TSE · Bens de Candidato",
    color: "#818cf8",
    table: "basedosdados.br_tse_eleicoes.bens_candidato",
    displayFields: ["id_eleicao", "sequencial_candidato", "tipo_item", "descricao_item", "valor_item"],
    nodeLabelField: "descricao_item",
  },
  {
    id: "tse_resultados_candidato",
    label: "TSE · Resultado do Candidato",
    color: "#6366f1",
    table: "basedosdados.br_tse_eleicoes.resultados_candidato",
    displayFields: ["id_eleicao", "sequencial_candidato", "numero_candidato", "resultado", "votos"],
    nodeLabelField: "resultado",
  },
  // --- Câmara Licitação (joined by id_licitacao from camara_contrato) ---
  {
    id: "camara_licitacao",
    label: "Câmara · Licitação",
    color: "#38bdf8",
    table: "basedosdados.br_camara_dados_abertos.licitacao",
    displayFields: ["id_licitacao", "objeto", "modalidade", "situacao", "valor_estimado", "valor_contratado", "data_abertura"],
    nodeType: "contrato",
    nodeIdField: "id_licitacao",
    nodeLabelField: "objeto",
  },
  {
    id: "camara_licitacao_item",
    label: "Câmara · Itens de Licitação",
    color: "#a78bfa",
    table: "basedosdados.br_camara_dados_abertos.licitacao_item",
    displayFields: ["id_licitacao", "id_item", "descricao", "unidade", "quantidade_licitada", "valor_unitario_estimado"],
    nodeIdField: "id_item",
    nodeLabelField: "descricao",
  },
  {
    id: "camara_licitacao_pedido",
    label: "Câmara · Pedidos de Licitação",
    color: "#34d399",
    table: "basedosdados.br_camara_dados_abertos.licitacao_pedido",
    displayFields: ["id_licitacao", "id_pedido", "orgao", "descricao", "data_cadastro"],
    nodeIdField: "id_pedido",
    nodeLabelField: "descricao",
  },
  {
    id: "camara_licitacao_proposta",
    label: "Câmara · Propostas de Licitação",
    color: "#f472b6",
    table: "basedosdados.br_camara_dados_abertos.licitacao_proposta",
    displayFields: ["id_licitacao", "id_proposta", "cpf_cnpj_fornecedor", "valor_proposta", "marca_proposta"],
    nodeIdField: "id_proposta",
    nodeLabelField: "cpf_cnpj_fornecedor",
  },
  {
    id: "camara_deputado",
    label: "Câmara · Deputado",
    color: "#65a30d",
    table: "basedosdados.br_camara_dados_abertos.deputado",
    displayFields: ["id_deputado", "nome", "nome_civil", "sexo", "sigla_uf_nascimento"],
    nodeIdField: "id_deputado",
    nodeLabelField: "nome",
  },
  {
    id: "cnes_profissional",
    label: "CNES · Profissionais",
    color: "#facc15",
    table: "basedosdados.br_ms_cnes.profissional",
    displayFields: ["id_estabelecimento_cnes", "nome", "tipo_conselho", "id_registro_conselho", "cbo_2002"],
    nodeLabelField: "nome",
  },
  {
    id: "cnes_equipe",
    label: "CNES · Equipes",
    color: "#eab308",
    table: "basedosdados.br_ms_cnes.equipe",
    displayFields: ["id_estabelecimento_cnes", "id_equipe", "tipo_equipe", "equipe", "descricao_segmento"],
    nodeIdField: "id_equipe",
    nodeLabelField: "equipe",
  },
  {
    id: "cnes_leito",
    label: "CNES · Leitos",
    color: "#fcd34d",
    table: "basedosdados.br_ms_cnes.leito",
    displayFields: ["id_estabelecimento_cnes", "tipo_especialidade_leito", "tipo_leito", "quantidade_total", "quantidade_sus"],
    nodeLabelField: "tipo_leito",
  },
  {
    id: "cnes_servico_especializado",
    label: "CNES · Serviços Especializados",
    color: "#fde68a",
    table: "basedosdados.br_ms_cnes.servico_especializado",
    displayFields: ["id_estabelecimento_cnes", "tipo_servico_especializado", "subtipo_servico_especializado", "tipo_caracterizacao", "quantidade_nacional_estabelecimento_saude_terceiro"],
    nodeLabelField: "tipo_servico_especializado",
  },
  {
    id: "inep_turma",
    label: "INEP · Turmas",
    color: "#b45309",
    table: "basedosdados.br_inep_censo_escolar.turma",
    displayFields: ["id_escola", "id_turma", "etapa_ensino", "tipo_turma", "quantidade_matriculas"],
    nodeIdField: "id_turma",
    nodeLabelField: "tipo_turma",
  },
  {
    id: "inep_docente",
    label: "INEP · Docentes",
    color: "#d97706",
    table: "basedosdados.br_inep_censo_escolar.docente",
    displayFields: ["id_escola", "id_docente", "id_turma", "sexo", "tipo_contratacao"],
    nodeIdField: "id_docente",
    nodeLabelField: "id_docente",
  },

  // --- MIDES Licitação (joined by id_licitacao_bd from mides items/participantes) ---
  {
    id: "mides_licitacao",
    label: "MIDES · Licitação",
    color: "#1d4ed8",
    table: "basedosdados.world_wb_mides.licitacao",
    displayFields: ["ano", "sigla_uf", "id_municipio", "orgao", "id_licitacao", "descricao_objeto", "modalidade", "situacao", "valor", "data_abertura"],
    nodeType: "contrato",
    nodeIdField: "id_licitacao_bd",
    nodeLabelField: "descricao_objeto",
  },
];

/** Build BigQuery WHERE clause fragment for CPF/CNPJ-aware document matching */
export function buildCnpjWhere(col: CnpjColumn): string {
  const digits = `REGEXP_REPLACE(CAST(${col.name} AS STRING), r'\\D', '')`;
  if (col.type === "basico") {
    // Basico only makes sense for CNPJ searches
    return `(@doc_len != 11 AND ${col.name} = @cnpj_root)`;
  }
  if (col.type === "full") {
    // Full CNPJ column: still match on root for CNPJ searches
    return `(@doc_len != 11 AND SUBSTR(${digits}, 1, 8) = @cnpj_root)`;
  }
  // Mixed column may hold CPF (11) or CNPJ (14)
  // CPF searches match CPF exactly; CNPJ searches keep root-based behavior.
  return `(
    (@doc_len = 11 AND LENGTH(${digits}) = 11 AND ${digits} = @doc_digits)
    OR
    (@doc_len != 11 AND LENGTH(${digits}) = 14 AND SUBSTR(${digits}, 1, 8) = @cnpj_root)
  )`;
}
