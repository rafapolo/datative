export interface CnpjColumn {
  name: string;
  type: "basico" | "full" | "mixed";
  /** Column holds punctuation (dots/slash/dash) and/or a numeric type that drops
   * leading zeros — strip non-digits and zero-pad before matching. */
  normalize?: boolean;
  /** Extra SQL predicate a row must satisfy for this column to count as a match —
   * for columns whose meaning depends on another column (e.g. CNES `cpf_cnpj`
   * only holds a CNPJ when `tipo_pessoa = '3'`; otherwise it's a CPF
   * right-aligned in 14 digits that would read as a fake CNPJ root). */
  where?: string;
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
  nodeType?: "contrato" | "doacao" | "estabelecimento" | "pagamento" | "empresa";
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
  nodeType?: "contrato" | "doacao" | "estabelecimento" | "pagamento" | "empresa";
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
      { name: "cnpj_prestador_contas", type: "full" },
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
      { name: "cnpj_prestador_contas", type: "full" },
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
    cnpjColumns: [
      { name: "cpf_cnpj_doador", type: "mixed" },
      { name: "cnpj_prestador_contas", type: "full" },
    ],
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
    cnpjColumns: [
      { name: "cpf_cnpj_doador", type: "mixed" },
      { name: "cnpj_prestador_contas", type: "full" },
    ],
    displayFields: ["nome_partido", "nome_doador", "cpf_cnpj_doador", "valor_receita", "data_receita", "ano"],
    nodeType: "doacao",
    nodeIdField: "cpf_cnpj_doador",
    nodeLabelField: "nome_doador",
  },

  // --- Exportadoras / Importadoras (not available in S3) ---

  // --- CNES ---
  {
    id: "cnes",
    label: "MS · CNES Estabelecimentos",
    color: "#f59e0b",
    table: "basedosdados.br_ms_cnes.estabelecimento",
    // cpf_cnpj holds a CPF right-aligned in 14 digits unless tipo_pessoa = '3'
    // (bridges.yaml) — without the guard every CPF reads as a fake CNPJ root.
    cnpjColumns: [
      { name: "cpf_cnpj", type: "full", where: `"tipo_pessoa" = '3'` },
      { name: "cnpj_mantenedora", type: "full", normalize: true },
    ],
    displayFields: ["id_estabelecimento_cnes", "cpf_cnpj", "cnpj_mantenedora", "tipo_unidade", "id_municipio", "sigla_uf"],
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
    cnpjColumns: [
      { name: "cnpj_cpf_fornecedor", type: "mixed" },
      // the deputy's own CPF — links a pessoa entity to their expense claims
      { name: "cpf", type: "mixed" },
    ],
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
    cnpjColumns: [
      { name: "cnpj_basico", type: "basico" },
      { name: "cnpj_agencia", type: "full" },
    ],
    displayFields: ["cnpj_basico", "cnpj_agencia", "instituicao", "sigla_uf", "id_municipio", "valor"],
  },
  {
    id: "bcb_sicor",
    label: "BCB · SICOR Operações",
    color: "#059669",
    table: "basedosdados.br_bcb_sicor.operacao",
    cnpjColumns: [
      { name: "cnpj_basico_instituicao_financeira", type: "basico" },
      { name: "cnpj_basico_agente_investimento", type: "basico" },
      { name: "cnpj_basico_cadastrante", type: "basico" },
    ],
    displayFields: ["cnpj_basico_instituicao_financeira", "cnpj_basico_agente_investimento", "cnpj_basico_cadastrante", "valor_parcela_credito", "area_financiada", "taxa_juro", "ano_emissao"],
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

  // --- CGU Pessoal (not available in S3) ---

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
    cnpjColumns: [
      { name: "cnpj_emissor", type: "full" },
      { name: "cnpj_lider", type: "full" },
      { name: "cnpj_ofertante", type: "full" },
    ],
    displayFields: ["cnpj_emissor", "nome_emissor", "cnpj_lider", "nome_lider", "cnpj_ofertante", "nome_ofertante", "tipo_ativo", "valor_total", "data_registro_oferta"],
  },

  // --- INEP ---
  {
    id: "inep_escola",
    label: "INEP · Censo Escolar",
    color: "#92400e",
    table: "basedosdados.br_inep_censo_escolar.escola",
    // Both columns arrive float-shaped ("4834065000193.0", leading zero lost).
    cnpjColumns: [
      { name: "cnpj_escola_privada", type: "full", normalize: true },
      { name: "cnpj_mantenedora", type: "full", normalize: true },
    ],
    displayFields: ["id_escola", "cnpj_escola_privada", "cnpj_mantenedora", "rede", "tipo_categoria_escola_privada", "sigla_uf", "id_municipio"],
    relatedLookups: [
      { datasetId: "inep_turma", localKey: "id_escola", foreignKey: "id_escola" },
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

  // --- SP ALESP (not available in S3) ---

  // --- MS SIH ---
  {
    id: "ms_sih",
    label: "MS · SIH AIHs",
    color: "#b45309",
    table: "basedosdados.br_ms_sih.aihs_reduzidas",
    // 18,5% of rows lost the leading zero (13 digits) and 23,7% are 14 blank
    // spaces, not NULL (bridges.yaml) — normalize pads the first and the
    // blank guard drops the second.
    cnpjColumns: [
      { name: "cnpj_estabelecimento", type: "full", normalize: true },
      { name: "cnpj_mantenedora", type: "full", normalize: true },
    ],
    displayFields: ["cnpj_estabelecimento", "cnpj_mantenedora", "id_estabelecimento_cnes", "id_municipio_estabelecimento", "sigla_uf", "carater_internacao", "data_internacao", "procedimento_realizado", "valor_aih"],
  },

  // --- SGP Cartão Corporativo (not available in S3) ---

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
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["id_referencia_bacen", "numero_ordem", "cnpj_basico", "cpf", "tipo_pessoa", "valor_parcela"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "cnpj_basico",
  },
  {
    id: "sicor_mutuario",
    label: "BCB · SICOR Mutuários",
    color: "#14532d",
    table: "basedosdados.br_bcb_sicor.recurso_publico_mutuario",
    cnpjColumns: [
      { name: "cnpj_basico", type: "basico" },
      { name: "cnpj", type: "full" },
    ],
    displayFields: ["id_referencia_bacen", "cnpj_basico", "cnpj", "cpf", "tipo_beneficiario", "id_dap", "sexo"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "cnpj_basico",
  },
  {
    id: "sicor_propriedade",
    label: "BCB · SICOR Propriedades Rurais",
    color: "#166534",
    table: "basedosdados.br_bcb_sicor.recurso_publico_propriedade",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["id_referencia_bacen", "numero_ordem", "cnpj_basico", "cpf", "id_sncr", "id_car"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "cnpj_basico",
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

  // --- Holdings · Participações Societárias (empresa-para-empresa; ranked
  // highest of the additions below because every row IS a company-to-company
  // join, unlike the other tables which join once to the searched CNPJ) ---
  {
    id: "brasilio_participacoes",
    label: "Holdings · Sócias (quem me possui)",
    color: "#5b21b6",
    table: "basedosdados.br_brasilio_holdings.holdings",
    cnpjColumns: [{ name: "cnpj", type: "full", normalize: true }],
    displayFields: ["cnpj", "razao_social", "cnpj_socia", "qualificacao_socia", "razao_social_socia"],
    nodeType: "empresa",
    nodeIdField: "cnpj_socia",
    nodeLabelField: "razao_social_socia",
  },
  {
    id: "brasilio_subsidiarias",
    label: "Holdings · Participações (o que eu possuo)",
    color: "#6d28d9",
    table: "basedosdados.br_brasilio_holdings.holdings",
    cnpjColumns: [{ name: "cnpj_socia", type: "full", normalize: true }],
    displayFields: ["cnpj", "razao_social", "cnpj_socia", "qualificacao_socia", "razao_social_socia"],
    nodeType: "empresa",
    nodeIdField: "cnpj",
    nodeLabelField: "razao_social",
  },

  // --- PGFN · Dívida Ativa da União ---
  {
    id: "pgfn_dividaativa",
    label: "PGFN · Dívida Ativa",
    color: "#991b1b",
    table: "basedosdados.br_pgfn_dividaativa.divida",
    // cnpj_basico (clean root, companies only; the table is sorted by it since 2026-10-25) instead
    // of CPF_CNPJ: individuals' CPFs come masked (XXX048.379XX), so the mixed column only ever
    // matched companies, through a regexp over 49.7M rows per batch
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["NOME_DEVEDOR", "CPF_CNPJ", "TIPO_DEVEDOR", "RECEITA_PRINCIPAL", "VALOR_CONSOLIDADO", "SITUACAO_INSCRICAO", "DATA_INSCRICAO", "UF_DEVEDOR"],
    nodeIdField: "NUMERO_INSCRICAO",
    nodeLabelField: "NOME_DEVEDOR",
  },

  // --- TCU · Inidôneos ---
  {
    id: "tcu_empresas_inidoneas",
    label: "TCU · Empresas Inidôneas",
    color: "#7f1d1d",
    table: "basedosdados.br_tcu_inidoneos.empresas",
    cnpjColumns: [{ name: "CPF_CNPJ", type: "mixed", normalize: true }],
    displayFields: ["NOME", "CPF_CNPJ", "PROCESSO", "DELIBERACAO", "DATA TRANSITO JULGADO", "DATA FINAL", "UF", "MUNICIPIO"],
    nodeIdField: "PROCESSO",
    nodeLabelField: "NOME",
  },
  {
    id: "tcu_contas_irregulares",
    label: "TCU · Contas Julgadas Irregulares",
    color: "#9f1239",
    table: "basedosdados.br_tcu_inidoneos.resp_contas_julgadas_irregulares",
    cnpjColumns: [{ name: "CPF_CNPJ", type: "mixed", normalize: true }],
    displayFields: ["NOME", "CPF_CNPJ", "PROCESSO", "DELIBERACAO", "DATA TRANSITO JULGADO", "UF", "MUNICIPIO"],
    nodeIdField: "PROCESSO",
    nodeLabelField: "NOME",
  },

  // --- CVM · Fundos de Investimento ---
  {
    id: "cvm_fundos",
    label: "CVM · Fundos de Investimento",
    color: "#166534",
    table: "basedosdados.br_cvm_fundos.fundos",
    cnpjColumns: [
      { name: "CNPJ_FUNDO", type: "full", normalize: true },
      { name: "CNPJ_ADMIN", type: "full", normalize: true },
      { name: "CPF_CNPJ_GESTOR", type: "mixed", normalize: true },
      { name: "CNPJ_AUDITOR", type: "full", normalize: true },
      { name: "CNPJ_CUSTODIANTE", type: "full", normalize: true },
      { name: "CNPJ_CONTROLADOR", type: "full", normalize: true },
    ],
    displayFields: ["CNPJ_FUNDO", "DENOM_SOCIAL", "CLASSE", "SIT", "ADMIN", "CNPJ_ADMIN", "GESTOR", "VL_PATRIM_LIQ", "DT_PATRIM_LIQ"],
    nodeIdField: "CNPJ_FUNDO",
    nodeLabelField: "DENOM_SOCIAL",
  },

  // --- SICAF · Fornecedores cadastrados (ComprasGov) ---
  {
    id: "sicaf_fornecedores",
    label: "SICAF · Fornecedores",
    color: "#0e7490",
    table: "basedosdados.br_comprasgov_sicaf.fornecedores",
    // `cpf` is masked ("***007562**") and can't join — cnpj only.
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "nomeRazaoSocialFornecedor", "nomeCnae", "porteEmpresaNome", "habilitadoLicitar", "ativo", "nomeMunicipio", "ufSigla"],
    nodeIdField: "cnpj",
    nodeLabelField: "nomeRazaoSocialFornecedor",
  },

  // --- BNDES · Operações Contratadas ---
  {
    id: "bndes_operacoes",
    label: "BNDES · Operações",
    color: "#155e75",
    table: "basedosdados.br_bndes_operacoes_contratadas.operacoes_nao_automaticas",
    cnpjColumns: [
      { name: "cnpj_cliente", type: "full" },
      { name: "cnpj_instituicao_financeira_credenciada", type: "full", normalize: true },
    ],
    displayFields: ["id_contrato", "cnpj_cliente", "nome_cliente", "nome_instituicao_financeira_credenciada", "produto", "valor_operacao", "valor_desembolsado", "data_contratacao", "sigla_uf"],
    nodeIdField: "id_contrato",
    nodeLabelField: "nome_cliente",
  },

  // --- BCB · Penalidades ---
  {
    id: "bcb_penalidades",
    label: "BCB · Penalidades",
    color: "#b45309",
    table: "basedosdados.br_bcb_penalidades.penalidades",
    cnpjColumns: [{ name: "CPF_CNPJ", type: "mixed" }],
    displayFields: ["Nome", "CPF_CNPJ", "Tipo_penalidade_1_instancia", "Valor_da_multa_1_instancia", "Data_da_decisao_1_instancia", "Situacao"],
    nodeIdField: "PAS",
    nodeLabelField: "Nome",
  },

  // --- TCE-RJ · Contratos ---
  {
    id: "tce_rj_contratos_estado",
    label: "TCE-RJ · Contratos (Estado)",
    color: "#334155",
    table: "basedosdados.br_tce_rj.contratos_estado",
    cnpjColumns: [{ name: "CPFCNPJ", type: "mixed" }],
    displayFields: ["Processo", "Fornecedor", "CPFCNPJ", "Objeto", "ValorTotalContrato", "DataContratacao", "Unidade", "StatusContratacao"],
    nodeIdField: "Processo",
    nodeLabelField: "Fornecedor",
  },
  {
    id: "tce_rj_contratos_municipio",
    label: "TCE-RJ · Contratos (Município)",
    color: "#475569",
    table: "basedosdados.br_tce_rj.contratos_municipio",
    cnpjColumns: [{ name: "CNPJCPFContratado", type: "mixed" }],
    displayFields: ["NumeroContrato", "Contratado", "CNPJCPFContratado", "Objeto", "ValorContrato", "DataAssinaturaContrato", "Ente"],
    nodeIdField: "NumeroContrato",
    nodeLabelField: "Contratado",
  },

  // --- Procon · Reclamações de Consumidor ---
  {
    id: "procon_reclamacoes",
    label: "Procon · Reclamações",
    color: "#c2410c",
    table: "basedosdados.br_mjsp_ckan.procon",
    cnpjColumns: [{ name: "NumeroCNPJ", type: "full", normalize: true }],
    displayFields: ["strRazaoSocial", "strNomeFantasia", "NumeroCNPJ", "DescricaoAssunto", "DescricaoProblema", "Atendida", "UF", "AnoCalendario"],
    nodeIdField: "NumeroCNPJ",
    nodeLabelField: "strRazaoSocial",
  },
  // ===== Added 2026-10 from ../rodado's identity bridges + a column scan of
  // every mirrored table for CNPJ/CPF-named columns. One table per family:
  // `_original`/`_historico`/per-period splits, financial-statement line
  // tables (CVM dfp_*/itr_*) and pure metrics tables were left out — they'd
  // add a hub per table without adding a new kind of relation, and inflate
  // the breadth ranking (which counts distinct tables). CPF-only tables were
  // wired only where the person appears in a public-accountability role
  // (sanction, enforcement, candidacy/office, company administration, public
  // supplier/grantee) — never welfare beneficiaries, civil-service payroll,
  // students or party membership. =====

  // --- CGU · Sanções (CEIS / CNEP / CEPIM / Leniência) ---
  {
    id: "cgu_ceis",
    label: "CGU · CEIS (Inidôneas e Suspensas)",
    color: "#dc2626",
    table: "basedosdados.br_cgu_sancoes.ceis",
    cnpjColumns: [{ name: "cpf_cnpj_sancionado", type: "mixed" }],
    displayFields: ["nome_sancionado", "cpf_cnpj_sancionado", "categoria_sancao", "orgao_sancionador", "data_inicio_sancao", "data_final_sancao", "numero_processo", "abrangencia_sancao"],
    nodeIdField: "codigo_sancao",
    nodeLabelField: "categoria_sancao",
  },
  {
    id: "cgu_cnep",
    label: "CGU · CNEP (Empresas Punidas)",
    color: "#b91c1c",
    table: "basedosdados.br_cgu_sancoes.cnep",
    cnpjColumns: [{ name: "cpf_cnpj_sancionado", type: "mixed" }],
    displayFields: ["nome_sancionado", "cpf_cnpj_sancionado", "categoria_sancao", "valor_multa", "orgao_sancionador", "data_inicio_sancao", "data_final_sancao", "numero_processo"],
    nodeIdField: "codigo_sancao",
    nodeLabelField: "categoria_sancao",
  },
  {
    id: "cgu_cepim",
    label: "CGU · CEPIM (Entidades Impedidas)",
    color: "#ef4444",
    table: "basedosdados.br_cgu_sancoes.cepim",
    cnpjColumns: [{ name: "cnpj_entidade", type: "full" }],
    displayFields: ["nome_entidade", "cnpj_entidade", "motivo_impedimento", "numero_convenio", "orgao_concedente"],
    nodeIdField: "numero_convenio",
    nodeLabelField: "motivo_impedimento",
  },
  {
    id: "cgu_leniencia",
    label: "CGU · Acordos de Leniência",
    color: "#f87171",
    table: "basedosdados.br_cgu_sancoes.acordos_leniencia",
    cnpjColumns: [{ name: "cnpj_sancionado", type: "full", normalize: true }],
    displayFields: ["razao_social_receita", "cnpj_sancionado", "situacao_acordo", "data_inicio_acordo", "data_fim_acordo", "orgao_sancionador", "numero_processo"],
    nodeIdField: "id_acordo",
    nodeLabelField: "situacao_acordo",
  },

  // --- TCU · pessoas físicas (CPF completo, pontuado) ---
  {
    id: "tcu_inabilitados",
    label: "TCU · Inabilitados p/ Função Pública",
    color: "#881337",
    table: "basedosdados.br_tcu_inidoneos.inabilitados_funcao_publica",
    cnpjColumns: [{ name: "CPF", type: "mixed", normalize: true }],
    displayFields: ["NOME", "CPF", "PROCESSO", "DELIBERACAO", "DATA TRANSITO JULGADO", "DATA FINAL", "UF", "MUNICIPIO"],
    nodeIdField: "PROCESSO",
    nodeLabelField: "NOME",
  },
  {
    id: "tcu_contas_irregulares_eleitoral",
    label: "TCU · Contas Irregulares (Implicação Eleitoral)",
    color: "#9d174d",
    table: "basedosdados.br_tcu_inidoneos.resp_contas_julgadas_irreg_implicacao_eleitoral",
    cnpjColumns: [{ name: "CPF", type: "mixed", normalize: true }],
    displayFields: ["NOME", "CPF", "PROCESSO", "DELIBERACAO", "DATA TRANSITO JULGADO", "CARGO/FUNCAO", "UF", "MUNICIPIO"],
    nodeIdField: "PROCESSO",
    nodeLabelField: "NOME",
  },

  // --- MTE · Lista Suja do trabalho escravo ---
  {
    id: "mte_lista_suja",
    label: "MTE · Lista Suja (Trabalho Escravo)",
    color: "#450a0a",
    table: "basedosdados.br_mte_listasuja.empregadores",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["empregador", "cpf_cnpj", "estabelecimento", "trabalhadores_envolvidos", "ano_acao_fiscal", "sigla_uf", "cnae", "data_inclusao"],
    nodeIdField: "id",
    nodeLabelField: "estabelecimento",
  },
  {
    id: "mte_ceac",
    label: "MTE · CEAC (Ajuste de Conduta)",
    color: "#7f1d1d",
    table: "basedosdados.br_mte_listasuja.ceac",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["empregador", "cpf_cnpj", "estabelecimento", "ano_acao_fiscal", "sigla_uf", "termo_ajustamento_conduta", "data_inclusao_ceac"],
    nodeIdField: "id",
    nodeLabelField: "estabelecimento",
  },

  // --- IBAMA · autuações, embargos, cadastro técnico ---
  {
    id: "ibama_autos",
    label: "IBAMA · Autos de Infração",
    color: "#15803d",
    table: "basedosdados.br_ibama_autos.auto_infracao",
    cnpjColumns: [{ name: "cpf_cnpj_infrator", type: "mixed" }],
    displayFields: ["num_auto_infracao", "nome_infrator", "cpf_cnpj_infrator", "des_infracao", "val_auto_infracao", "gravidade_infracao", "dat_hora_auto_infracao", "municipio", "uf"],
    nodeIdField: "seq_auto_infracao",
    nodeLabelField: "tipo_infracao",
  },
  {
    id: "ibama_embargos",
    label: "IBAMA · Termos de Embargo",
    color: "#166534",
    table: "basedosdados.br_ibama_embargos_novo.termo_embargo",
    cnpjColumns: [{ name: "cpf_cnpj_embargado", type: "mixed" }],
    displayFields: ["num_tad", "nome_embargado", "cpf_cnpj_embargado", "des_tad", "qtd_area_embargada", "nome_imovel", "dat_embargo", "sit_desembargo", "municipio", "uf"],
    nodeIdField: "seq_tad",
    nodeLabelField: "nome_imovel",
  },
  {
    id: "ibama_embargos_decisao",
    label: "IBAMA · Decisões de Embargo",
    color: "#14532d",
    table: "basedosdados.br_ibama_embargos_novo.decisao",
    cnpjColumns: [{ name: "cpf_cnpj_interessado", type: "mixed" }],
    displayFields: ["seq_tad", "interessado", "cpf_cnpj_interessado", "tipo_decisao", "tipo_acao", "dat_decisao_embargo", "des_observacao"],
    nodeIdField: "seq_decisao_judicial",
    nodeLabelField: "tipo_decisao",
  },
  {
    id: "ibama_ctf_app",
    label: "IBAMA · CTF Atividades Poluidoras",
    color: "#4d7c0f",
    table: "basedosdados.br_ibama_ctf.app",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "razao_social", "descricao_da_categoria", "descricao_da_atividade", "potenc_de_pol_da_atividade", "situacao_cadastral", "municipio", "uf"],
    nodeIdField: "codigo_da_atividade",
    nodeLabelField: "descricao_da_atividade",
  },
  {
    id: "ibama_ctf_aida",
    label: "IBAMA · CTF Instrumentos de Defesa Ambiental",
    color: "#65a30d",
    table: "basedosdados.br_ibama_ctf.aida",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "razao_social", "descricao_da_categoria", "descricao_da_atividade", "situacao_cadastral", "municipio", "uf"],
    nodeIdField: "codigo_da_atividade",
    nodeLabelField: "descricao_da_atividade",
  },

  // --- MGI · Compras Públicas (ComprasGov) ---
  {
    id: "mgi_fornecedor",
    label: "MGI · Fornecedores",
    color: "#0891b2",
    table: "basedosdados.br_mgi_compras_publicas.fornecedor",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "nome_razao_social", "nome_cnae", "porte_empresa", "natureza_juridica", "indicador_habilitado_licitar", "indicador_fornecedor_ativo", "nome_municipio", "sigla_uf"],
    nodeIdField: "cnpj",
    nodeLabelField: "nome_razao_social",
  },
  {
    id: "mgi_licitacao_item",
    label: "MGI · Itens de Licitação",
    color: "#0e7490",
    table: "basedosdados.br_mgi_compras_publicas.licitacao_item",
    cnpjColumns: [{ name: "cnpj_fornecedor", type: "full" }],
    displayFields: ["id_compra", "nome_uasg", "modalidade", "descricao_item", "quantidade", "valor_estimado", "nome_fornecedor", "cnpj_fornecedor", "ano"],
    nodeType: "contrato",
    nodeIdField: "id_compra_item",
    nodeLabelField: "descricao_item",
  },
  {
    id: "mgi_compra_sem_licitacao",
    label: "MGI · Compras sem Licitação",
    color: "#155e75",
    table: "basedosdados.br_mgi_compras_publicas.compra_sem_licitacao_item",
    cnpjColumns: [{ name: "cnpj_vencedor", type: "full" }],
    displayFields: ["id_compra", "modalidade", "objeto_licitacao", "fundamento_legal", "descricao_detalhada", "valor_estimado_item", "nome_fornecedor_vencedor", "cnpj_vencedor", "data_publicacao"],
    nodeType: "contrato",
    nodeIdField: "id_compra_item",
    nodeLabelField: "objeto_licitacao",
  },
  {
    id: "mgi_pregao_oferta",
    label: "MGI · Ofertas em Pregão",
    color: "#164e63",
    table: "basedosdados.br_mgi_compras_publicas.pregao_item_oferta",
    cnpjColumns: [{ name: "cnpj_cpf_fornecedor", type: "mixed" }],
    displayFields: ["id_compra", "numero_item", "nome_fornecedor", "cnpj_cpf_fornecedor", "descricao_item", "quantidade", "valor_unitario", "valor_global", "marca", "ano"],
    nodeType: "contrato",
    nodeIdField: "id_compra",
    nodeLabelField: "descricao_item",
  },

  // --- Câmara · licitações (fornecedor direto; os mesmos registros também
  // seguem acessíveis como RELATED_DATASETS via id_licitacao) ---
  {
    id: "camara_proposta_fornecedor",
    label: "Câmara · Propostas (Fornecedor)",
    color: "#db2777",
    table: "basedosdados.br_camara_dados_abertos.licitacao_proposta",
    cnpjColumns: [{ name: "cpf_cnpj_fornecedor", type: "mixed" }],
    displayFields: ["id_licitacao", "id_proposta", "descricao", "cpf_cnpj_fornecedor", "valor_proposta", "marca_proposta", "fornecedor_situacao", "data_proposta"],
    nodeIdField: "id_proposta",
    nodeLabelField: "descricao",
  },
  {
    id: "camara_item_fornecedor",
    label: "Câmara · Itens Contratados (Fornecedor)",
    color: "#a21caf",
    table: "basedosdados.br_camara_dados_abertos.licitacao_item",
    cnpjColumns: [{ name: "cpf_cnpj_fornecedor", type: "mixed" }],
    displayFields: ["id_licitacao", "id_item", "descricao", "nome_fornecedor", "cpf_cnpj_fornecedor", "quantidade_contratada", "valor_total_contratado", "id_contrato", "situacao_item"],
    nodeIdField: "id_item",
    nodeLabelField: "descricao",
  },

  // --- Senado ---
  {
    id: "senado_ceaps",
    label: "Senado · CEAPS (Cota Parlamentar)",
    color: "#1e40af",
    table: "basedosdados.br_senado_ceaps.despesas",
    cnpjColumns: [{ name: "cpf_cnpj_fornecedor", type: "mixed" }],
    displayFields: ["nome_senador", "tipo_despesa", "nome_fornecedor", "cpf_cnpj_fornecedor", "valor_reembolsado", "data", "detalhamento"],
    nodeType: "pagamento",
    nodeIdField: "id_documento",
    nodeLabelField: "nome_senador",
  },
  {
    id: "senado_contratacao",
    label: "Senado · Contratações",
    color: "#1e3a8a",
    table: "basedosdados.br_senado_dados_abertos_administrativos.contratacao",
    cnpjColumns: [{ name: "cpf_cnpj_empresa", type: "mixed" }],
    displayFields: ["numero_formatado", "tipo_contratacao", "objeto", "nome_empresa", "cpf_cnpj_empresa", "modalidade_licitacao", "status", "data_assinatura", "data_fim_vigencia"],
    nodeType: "contrato",
    nodeIdField: "id_contratacao",
    nodeLabelField: "objeto",
  },
  {
    id: "senado_empresa",
    label: "Senado · Empresas Cadastradas",
    color: "#3730a3",
    table: "basedosdados.br_senado_dados_abertos_administrativos.empresa",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["id_empresa", "nome", "cpf_cnpj"],
    nodeIdField: "id_empresa",
    nodeLabelField: "nome",
  },

  // --- TSE · candidaturas (CPF completo) e pesquisas eleitorais ---
  {
    id: "tse_candidatura",
    label: "TSE · Candidaturas",
    color: "#0284c7",
    table: "basedosdados.br_tse_eleicoes.candidatos",
    cnpjColumns: [{ name: "cpf", type: "mixed" }],
    displayFields: ["ano", "nome", "nome_urna", "cargo", "sigla_partido", "numero", "situacao", "sigla_uf", "cpf"],
    nodeIdField: "sequencial",
    nodeLabelField: "nome_urna",
  },
  {
    id: "tse_pesquisa_empresa",
    label: "TSE · Pesquisas Eleitorais (Instituto)",
    color: "#0369a1",
    table: "basedosdados.br_tse_eleicoes.pesquisa_eleitoral",
    cnpjColumns: [{ name: "cnpj_empresa", type: "full" }],
    displayFields: ["id_pesquisa", "nome_empresa", "cnpj_empresa", "cargos", "quantidade_entrevistados", "valor_pesquisa", "data_divulgacao", "sigla_uf", "ano"],
    nodeIdField: "id_pesquisa",
    nodeLabelField: "cargos",
  },
  {
    id: "tse_pesquisa_contratante",
    label: "TSE · Pesquisas Eleitorais (Contratante)",
    color: "#075985",
    table: "basedosdados.br_tse_eleicoes.pesquisa_eleitoral_contratante",
    cnpjColumns: [{ name: "cpf_cnpj_contratante", type: "mixed" }],
    displayFields: ["id_pesquisa", "nome_contratante", "cpf_cnpj_contratante", "contratante_pagante", "valor_pago", "origem_recurso", "sigla_uf", "ano"],
    nodeIdField: "id_pesquisa",
    nodeLabelField: "nome_contratante",
  },
  {
    id: "tse_pesquisa_pagante",
    label: "TSE · Pesquisas Eleitorais (Pagante)",
    color: "#0c4a6e",
    table: "basedosdados.br_tse_eleicoes.pesquisa_eleitoral_pagante",
    cnpjColumns: [{ name: "cpf_cnpj_pagante", type: "mixed" }],
    displayFields: ["id_pesquisa", "nome_pagante", "cpf_cnpj_pagante", "origem_recurso", "sigla_uf", "ano"],
    nodeIdField: "id_pesquisa",
    nodeLabelField: "nome_pagante",
  },

  // --- CVM · Companhias Abertas (cadastro + formulário de referência) ---
  {
    id: "cvm_cia_aberta",
    label: "CVM · Companhias Abertas",
    color: "#1d4ed8",
    table: "basedosdados.br_cvm_cia_aberta.cadastro",
    cnpjColumns: [
      { name: "CNPJ_CIA", type: "full", normalize: true },
      { name: "CNPJ_AUDITOR", type: "full", normalize: true },
    ],
    displayFields: ["CNPJ_CIA", "DENOM_SOCIAL", "CD_CVM", "SIT", "SETOR_ATIV", "TP_MERC", "CONTROLE_ACIONARIO", "AUDITOR", "CNPJ_AUDITOR", "UF"],
    nodeIdField: "CD_CVM",
    nodeLabelField: "DENOM_SOCIAL",
  },
  // fre_posicao_acionaria read from both sides, like brasilio_* below:
  // matched by CNPJ_Companhia → who holds the company; by CPF_CNPJ_Acionista
  // → which listed companies the entity holds shares in.
  {
    id: "cvm_acionistas",
    label: "CVM · Acionistas (quem me possui)",
    color: "#2563eb",
    table: "basedosdados.br_cvm_cia_aberta.fre_posicao_acionaria",
    cnpjColumns: [{ name: "CNPJ_Companhia", type: "full", normalize: true }],
    displayFields: ["Nome_Companhia", "Acionista", "CPF_CNPJ_Acionista", "Percentual_Total_Acoes_Circulacao", "Acionista_Controlador", "Data_Referencia"],
    nodeIdField: "ID_Acionista",
    nodeLabelField: "Acionista",
  },
  {
    id: "cvm_posicoes_acionarias",
    label: "CVM · Posições Acionárias (o que eu possuo)",
    color: "#3b82f6",
    table: "basedosdados.br_cvm_cia_aberta.fre_posicao_acionaria",
    cnpjColumns: [{ name: "CPF_CNPJ_Acionista", type: "mixed", normalize: true }],
    displayFields: ["Nome_Companhia", "CNPJ_Companhia", "Acionista", "CPF_CNPJ_Acionista", "Percentual_Total_Acoes_Circulacao", "Acionista_Controlador", "Data_Referencia"],
    nodeType: "empresa",
    nodeIdField: "CNPJ_Companhia",
    nodeLabelField: "Nome_Companhia",
  },
  {
    id: "cvm_participadas",
    label: "CVM · Sociedades Participadas",
    color: "#4f46e5",
    table: "basedosdados.br_cvm_cia_aberta.fre_participacao_sociedade",
    cnpjColumns: [{ name: "CNPJ_Companhia", type: "full", normalize: true }],
    displayFields: ["Nome_Companhia", "Razao_Social", "CNPJ", "Tipo_Sociedade", "Participacao_Emissor", "Valor_Contabil", "Data_Referencia"],
    nodeType: "empresa",
    nodeIdField: "CNPJ",
    nodeLabelField: "Razao_Social",
  },
  {
    id: "cvm_participantes",
    label: "CVM · Participação de Companhias Abertas",
    color: "#6366f1",
    table: "basedosdados.br_cvm_cia_aberta.fre_participacao_sociedade",
    cnpjColumns: [{ name: "CNPJ", type: "full", normalize: true }],
    displayFields: ["Nome_Companhia", "CNPJ_Companhia", "Razao_Social", "CNPJ", "Tipo_Sociedade", "Participacao_Emissor", "Data_Referencia"],
    nodeType: "empresa",
    nodeIdField: "CNPJ_Companhia",
    nodeLabelField: "Nome_Companhia",
  },
  {
    id: "cvm_auditores",
    label: "CVM · Auditores",
    color: "#7c3aed",
    table: "basedosdados.br_cvm_cia_aberta.fre_auditor",
    cnpjColumns: [
      { name: "CNPJ_Companhia", type: "full", normalize: true },
      { name: "CNPJ_Auditor", type: "full", normalize: true },
    ],
    displayFields: ["Nome_Companhia", "CNPJ_Companhia", "Auditor", "CNPJ_Auditor", "Servico_Contratado", "Remuneracao_Auditor", "Data_Inicio_Contratacao", "Data_Fim_Contratacao"],
    nodeIdField: "ID_Auditor",
    nodeLabelField: "Auditor",
  },
  {
    id: "cvm_escrituradores",
    label: "CVM · Escrituradores",
    color: "#8b5cf6",
    table: "basedosdados.br_cvm_cia_aberta.fca_escriturador",
    cnpjColumns: [
      { name: "CNPJ_Companhia", type: "full", normalize: true },
      { name: "CNPJ_Escriturador", type: "full", normalize: true },
    ],
    displayFields: ["Nome_Empresarial", "CNPJ_Companhia", "Escriturador", "CNPJ_Escriturador", "Data_Inicio_Atuacao", "Data_Fim_Atuacao"],
    nodeIdField: "ID_Documento",
    nodeLabelField: "Escriturador",
  },
  {
    id: "cvm_administradores",
    label: "CVM · Administradores e Conselho Fiscal",
    color: "#a855f7",
    table: "basedosdados.br_cvm_cia_aberta.fre_administrador_membro_conselho_fiscal",
    cnpjColumns: [
      { name: "CNPJ_Companhia", type: "full", normalize: true },
      { name: "CPF", type: "mixed", normalize: true },
    ],
    displayFields: ["Nome_Companhia", "CNPJ_Companhia", "Nome", "CPF", "Orgao_Administracao", "Cargo_Eletivo_Ocupado", "Data_Posse", "Prazo_Mandato"],
    nodeIdField: "ID_Documento",
    nodeLabelField: "Nome",
  },
  {
    id: "cvm_relacao_familiar",
    label: "CVM · Relações Familiares de Administradores",
    color: "#c026d3",
    table: "basedosdados.br_cvm_cia_aberta.fre_relacao_familiar",
    cnpjColumns: [
      { name: "CNPJ_Companhia", type: "full", normalize: true },
      { name: "CPF_Administrador", type: "mixed", normalize: true },
      { name: "CPF_Pessoa_Relacionada", type: "mixed", normalize: true },
    ],
    displayFields: ["Nome_Companhia", "Nome_Administrador", "CPF_Administrador", "Cargo_Administrador", "Nome_Pessoa_Relacionada", "CPF_Pessoa_Relacionada", "Cargo_Pessoa_Relacionada", "Tipo_Parentesco"],
    nodeIdField: "ID_Documento",
    nodeLabelField: "Tipo_Parentesco",
  },

  // --- CVM · Fundos (registro pós-RCVM 175) e responsáveis por administradoras ---
  {
    id: "cvm_registro_fundo",
    label: "CVM · Registro de Fundos",
    color: "#15803d",
    table: "basedosdados.br_cvm_fundos.registro_fundo",
    cnpjColumns: [
      { name: "CNPJ_Fundo", type: "full", normalize: true },
      { name: "CNPJ_Administrador", type: "full", normalize: true },
      { name: "CPF_CNPJ_Gestor", type: "mixed", normalize: true },
    ],
    displayFields: ["CNPJ_Fundo", "Denominacao_Social", "Tipo_Fundo", "Situacao", "Administrador", "CNPJ_Administrador", "Gestor", "CPF_CNPJ_Gestor", "Patrimonio_Liquido"],
    nodeIdField: "CNPJ_Fundo",
    nodeLabelField: "Denominacao_Social",
  },
  {
    id: "cvm_registro_classe",
    label: "CVM · Classes de Fundos",
    color: "#047857",
    table: "basedosdados.br_cvm_fundos.registro_classe",
    cnpjColumns: [
      { name: "CNPJ_Classe", type: "full", normalize: true },
      { name: "CNPJ_Auditor", type: "full", normalize: true },
      { name: "CNPJ_Custodiante", type: "full", normalize: true },
      { name: "CNPJ_Controlador", type: "full", normalize: true },
    ],
    displayFields: ["CNPJ_Classe", "Denominacao_Social", "Tipo_Classe", "Classificacao", "Situacao", "Auditor", "Custodiante", "Controlador", "Patrimonio_Liquido"],
    nodeIdField: "ID_Registro_Classe",
    nodeLabelField: "Denominacao_Social",
  },
  {
    id: "cvm_adm_carteira_responsavel",
    label: "CVM · Responsáveis de Administradoras",
    color: "#166534",
    table: "basedosdados.br_cvm_administradores_carteira.responsavel",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["cnpj", "nome", "tipo"],
    nodeLabelField: "nome",
  },

  // --- BNDES · demais carteiras ---
  {
    id: "bndes_indiretas",
    label: "BNDES · Operações Indiretas (Agente)",
    color: "#0f766e",
    table: "basedosdados.br_bndes_operacoes_contratadas.operacoes_indiretas_automaticas",
    // cnpj_cliente is masked ("**.*21.635/0001-**") — only the bank's CNPJ joins.
    cnpjColumns: [{ name: "cnpj_agente_financeiro", type: "full" }],
    displayFields: ["instituicao_financeira_credenciada", "cnpj_agente_financeiro", "nome_cliente", "produto", "valor_operacao", "data_contratacao", "sigla_uf"],
    nodeLabelField: "produto",
  },
  {
    id: "bndes_exportacao_bens",
    label: "BNDES · Exportação de Bens",
    color: "#115e59",
    table: "basedosdados.br_bndes_operacoes_contratadas.operacoes_exportacao_bens",
    cnpjColumns: [{ name: "cnpj_exportador", type: "full" }],
    displayFields: ["id_operacao", "nome_exportador", "cnpj_exportador", "sigla_pais_destino", "produto", "tipo_operacao", "data_contratacao", "situacao_operacao"],
    nodeIdField: "id_operacao",
    nodeLabelField: "sigla_pais_destino",
  },
  {
    id: "bndes_exportacao_servicos",
    label: "BNDES · Exportação de Serviços",
    color: "#134e4a",
    table: "basedosdados.br_bndes_operacoes_contratadas.operacoes_exportacao_servicos",
    cnpjColumns: [{ name: "cnpj_exportador", type: "full" }],
    displayFields: ["id_operacao", "nome_exportador", "cnpj_exportador", "sigla_pais_destino", "descricao_operacao", "valor_operacao", "valor_desembolsado", "data_contratacao"],
    nodeIdField: "id_operacao",
    nodeLabelField: "descricao_operacao",
  },

  // --- BCB · cadastro de instituições, SICOR complementos ---
  {
    id: "bcb_ifdata",
    label: "BCB · IF.data Cadastro",
    color: "#0e7490",
    table: "basedosdados.br_bcb_ifdata.cadastro",
    cnpjColumns: [{ name: "cnpj_instituicao_lider", type: "basico" }],
    displayFields: ["nome_instituicao", "cnpj_instituicao_lider", "segmento_tb", "atividade", "situacao", "sigla_uf", "ano_mes"],
    nodeIdField: "cod_inst",
    nodeLabelField: "nome_instituicao",
  },
  {
    id: "sicor_instituicao",
    label: "BCB · SICOR Instituições",
    color: "#047857",
    table: "basedosdados.br_bcb_sicor.instituicao_financeira",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["cnpj_basico", "nome", "segmento"],
    nodeIdField: "cnpj_basico",
    nodeLabelField: "nome",
  },
  {
    id: "sicor_agencia",
    label: "BCB · SICOR Agências",
    color: "#065f46",
    table: "basedosdados.br_bcb_sicor.recurso_publico_complemento_operacao",
    cnpjColumns: [{ name: "cnpj_agencia", type: "full" }],
    displayFields: ["id_referencia_bacen", "cnpj_agencia", "numero_cedula", "id_municipio", "ano_emissao", "mes_emissao"],
    nodeIdField: "id_referencia_bacen",
    nodeLabelField: "numero_cedula",
  },

  // --- ANS · Operadoras de planos de saúde ---
  {
    id: "ans_operadoras_ativas",
    label: "ANS · Operadoras Ativas",
    color: "#e11d48",
    table: "basedosdados.br_ans_operadoras.operadoras_ativas",
    cnpjColumns: [{ name: "CNPJ", type: "full" }],
    displayFields: ["REGISTRO_OPERADORA", "CNPJ", "RAZAO_SOCIAL", "NOME_FANTASIA", "MODALIDADE", "CIDADE", "UF", "DATA_REGISTRO_ANS"],
    nodeIdField: "REGISTRO_OPERADORA",
    nodeLabelField: "RAZAO_SOCIAL",
  },
  {
    id: "ans_operadoras_canceladas",
    label: "ANS · Operadoras Canceladas",
    color: "#be123c",
    table: "basedosdados.br_ans_operadoras.operadoras_canceladas",
    cnpjColumns: [{ name: "CNPJ", type: "full" }],
    displayFields: ["REGISTRO_OPERADORA", "CNPJ", "RAZAO_SOCIAL", "MODALIDADE", "DATA_DESCREDENCIAMENTO", "MOTIVO_DO_DESCREDENCIAMENTO", "UF"],
    nodeIdField: "REGISTRO_OPERADORA",
    nodeLabelField: "RAZAO_SOCIAL",
  },
  {
    id: "ans_penalidades",
    label: "ANS · Penalidades",
    color: "#9f1239",
    table: "basedosdados.br_ans_operadoras.penalidades",
    cnpjColumns: [{ name: "CNPJ", type: "full" }],
    displayFields: ["NR_PROCESSO", "RAZAO_SOCIAL", "CNPJ", "TIPO_PENALIDADE", "OBJETO", "VL_MULTA_FINAL_APLICADA", "STATUS_DEMANDA", "DT_DECISAO_1A"],
    nodeIdField: "NR_DEMANDA",
    nodeLabelField: "TIPO_PENALIDADE",
  },

  // --- ANP / ANVISA / ANEEL / ANTT / ANA / ANM ---
  {
    id: "anp_precos_revenda",
    label: "ANP · Preços de Revenda",
    color: "#9333ea",
    table: "basedosdados.br_anp_combustiveis.precos",
    // ~1M rows lost the leading zero (13 chars) — bridges.yaml.
    cnpjColumns: [{ name: "cnpj", type: "full", normalize: true }],
    displayFields: ["cnpj", "razao", "fantasia", "bandeira", "produto", "preco_revenda", "data_coleta", "municipio", "estado"],
    nodeLabelField: "fantasia",
  },
  {
    id: "anvisa_cmed",
    label: "ANVISA · CMED Preços de Medicamentos",
    color: "#c2410c",
    table: "basedosdados.br_anvisa_cmed.precos",
    cnpjColumns: [{ name: "cnpj", type: "full" }],
    displayFields: ["laboratorio", "cnpj", "substancia", "produto", "apresentacao", "classe_terapeutica", "registro", "pf_sem_impostos", "pmc_sem_impostos"],
    nodeIdField: "registro",
    nodeLabelField: "produto",
  },
  {
    id: "aneel_geracao_distribuida",
    label: "ANEEL · Geração Distribuída",
    color: "#ca8a04",
    table: "basedosdados.br_aneel_dadosabertos.empreendimento_geracao_distribuida",
    // NumCPFCNPJ masks CPFs ("***.754.418-**") — only CNPJ titulares join.
    // NumCNPJDistribuidora is BIGINT (leading zero lost).
    cnpjColumns: [
      { name: "NumCPFCNPJ", type: "mixed" },
      { name: "NumCNPJDistribuidora", type: "full", normalize: true },
    ],
    displayFields: ["CodEmpreendimento", "NomTitularEmpreendimento", "NumCPFCNPJ", "SigAgente", "DscFonteGeracao", "MdaPotenciaInstaladaKW", "NomMunicipio", "SigUF"],
    nodeIdField: "CodEmpreendimento",
    nodeLabelField: "DscFonteGeracao",
  },
  {
    id: "aneel_tarifas",
    label: "ANEEL · Tarifas Homologadas",
    color: "#a16207",
    table: "basedosdados.br_aneel_dadosabertos.tarifas_homologadas",
    cnpjColumns: [{ name: "NumCNPJDistribuidora", type: "full" }],
    displayFields: ["SigAgente", "NumCNPJDistribuidora", "DscREH", "DatInicioVigencia", "DscSubGrupo", "DscModalidadeTarifaria", "VlrTUSD", "VlrTE"],
    nodeIdField: "DscREH",
    nodeLabelField: "DscREH",
  },
  {
    id: "antt_rntrc",
    label: "ANTT · RNTRC Transportadores",
    color: "#92400e",
    table: "basedosdados.br_antt_dadosabertos.rntrc",
    // CPFs of autonomous truckers are masked ("086.***.***-30") and drop out.
    cnpjColumns: [{ name: "cpfcnpjtransportador", type: "mixed" }],
    displayFields: ["numero_rntrc", "nome_transportador", "cpfcnpjtransportador", "categoria_transportador", "situacao_rntrc", "municipio", "uf"],
    nodeIdField: "numero_rntrc",
    nodeLabelField: "nome_transportador",
  },
  {
    id: "ana_captacoes",
    label: "ANA · Outorgas de Captação",
    color: "#0284c7",
    table: "basedosdados.br_ana_outorgas.captacoes",
    cnpjColumns: [{ name: "emp_nu_cpfcnpj", type: "mixed" }],
    displayFields: ["emp_nm_responsavel", "emp_nu_cpfcnpj", "int_qt_vazaomedia", "ing_nm_municipio", "ing_sg_ufmunicipio", "esfera"],
    nodeLabelField: "ing_nm_municipio",
  },
  {
    id: "ana_lancamentos",
    label: "ANA · Outorgas de Lançamento",
    color: "#0369a1",
    table: "basedosdados.br_ana_outorgas.lancamentos",
    cnpjColumns: [{ name: "emp_nu_cpfcnpj", type: "mixed" }],
    displayFields: ["emp_nm_empreendimento", "emp_nm_responsavel", "emp_nu_cpfcnpj", "int_nm_corpohidrico", "int_qt_volumeanual", "out_dt_outorgainicial", "out_dt_outorgafinal", "ing_nm_municipio", "ing_sg_ufmunicipio"],
    nodeLabelField: "emp_nm_empreendimento",
  },
  {
    id: "anm_cfem",
    label: "ANM · CFEM Arrecadação",
    color: "#78716c",
    table: "basedosdados.br_anm.cfem_cfem_arrecadacao",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["processo", "cpf_cnpj", "substancia", "municipio", "uf", "quantidadecomercializada", "valorrecolhido", "ano", "mes"],
    nodeIdField: "processo",
    nodeLabelField: "substancia",
  },
  {
    id: "anm_cfem_autuacao",
    label: "ANM · CFEM Autuações",
    color: "#57534e",
    table: "basedosdados.br_anm.cfem_cfem_autuacao",
    cnpjColumns: [{ name: "cpf_cnpj", type: "mixed" }],
    displayFields: ["numeroauto", "nometitular", "cpf_cnpj", "processominerario", "substancia", "valor", "municipio", "uf"],
    nodeIdField: "numeroauto",
    nodeLabelField: "substancia",
  },
  {
    id: "anm_portaria_lavra",
    label: "ANM · Portarias de Lavra",
    color: "#44403c",
    table: "basedosdados.br_anm.scm_portaria_de_lavra",
    cnpjColumns: [{ name: "cpf_cnpj_do_titular", type: "mixed" }],
    displayFields: ["processo", "titular", "cpf_cnpj_do_titular", "fase_atual", "substancia_s", "municipio_s", "situacao"],
    nodeIdField: "processo",
    nodeLabelField: "substancia_s",
  },
  {
    id: "anm_alvara_pesquisa",
    label: "ANM · Alvarás de Pesquisa",
    color: "#a8a29e",
    table: "basedosdados.br_anm.scm_alvara_de_pesquisa",
    cnpjColumns: [{ name: "cpf_cnpj_do_titular", type: "mixed" }],
    displayFields: ["processo", "titular", "cpf_cnpj_do_titular", "fase_atual", "substancia_s", "municipio_s", "situacao"],
    nodeIdField: "processo",
    nodeLabelField: "substancia_s",
  },
  {
    id: "anm_requerimento_pesquisa",
    label: "ANM · Requerimentos de Pesquisa",
    color: "#d6d3d1",
    table: "basedosdados.br_anm.scm_requerimento_de_pesquisa",
    cnpjColumns: [{ name: "cpf_cnpj_do_titular", type: "mixed" }],
    displayFields: ["processo", "titular", "cpf_cnpj_do_titular", "fase_atual", "substancia_s", "municipio_s", "situacao"],
    nodeIdField: "processo",
    nodeLabelField: "substancia_s",
  },
  {
    id: "anm_licenciamento",
    label: "ANM · Licenciamentos",
    color: "#78716c",
    table: "basedosdados.br_anm.scm_licenciamento",
    cnpjColumns: [{ name: "cpf_cnpj_do_titular", type: "mixed" }],
    displayFields: ["processo", "titular", "cpf_cnpj_do_titular", "fase_atual", "substancia_s", "municipio_s", "situacao"],
    nodeIdField: "processo",
    nodeLabelField: "substancia_s",
  },

  // --- Saúde · BPS e Farmácia Popular ---
  {
    id: "saude_bps",
    label: "Saúde · Banco de Preços (BPS)",
    color: "#be185d",
    table: "basedosdados.br_saude_bps.dados",
    cnpjColumns: [
      { name: "cnpj_da_instituicao", type: "full" },
      { name: "cnpj_do_fornecedor", type: "full" },
      { name: "cnpj_do_fabricante", type: "full" },
    ],
    displayFields: ["nome_da_instituicao", "fornecedor", "cnpj_do_fornecedor", "fabricante", "descricao_catmat", "quantidade_itens_comprados", "preco_unitario", "preco_total", "data_da_compra"],
    nodeType: "pagamento",
    nodeLabelField: "descricao_catmat",
  },
  {
    id: "farmacia_popular",
    label: "Saúde · Farmácia Popular",
    color: "#db2777",
    table: "basedosdados.br_saude_farmaciapopular.estabelecimentos",
    cnpjColumns: [
      { name: "numero_cnpj", type: "full" },
      { name: "numero_cnpj_entidade", type: "full" },
    ],
    displayFields: ["codigo_cnes", "nome_razao_social", "nome_fantasia", "numero_cnpj", "descricao_esfera_administrativa", "codigo_uf", "codigo_municipio"],
    nodeType: "estabelecimento",
    nodeIdField: "codigo_cnes",
    nodeLabelField: "nome_fantasia",
  },

  // --- CGU · terceirizados, Gás do Povo (só o lado empresa) ---
  {
    id: "cgu_terceirizados",
    label: "CGU · Terceirizados (Empresa)",
    color: "#ea580c",
    table: "basedosdados.br_cgu_pessoal_executivo_federal.terceirizados",
    cnpjColumns: [{ name: "cnpj_empresa", type: "full" }],
    displayFields: ["razao_social_empresa", "cnpj_empresa", "contrato_empresa", "unidade_gestora", "categoria_profissional", "custo_mensal", "ano", "mes"],
    nodeIdField: "contrato_empresa",
    nodeLabelField: "unidade_gestora",
  },
  {
    id: "cgu_gas_do_povo",
    label: "CGU · Gás do Povo (Revenda)",
    color: "#f97316",
    table: "basedosdados.br_cgu_gas_do_povo.gas_do_povo",
    cnpjColumns: [{ name: "cnpj_estabelecimento", type: "full" }],
    displayFields: ["estabelecimento", "cnpj_estabelecimento", "nome_municipio", "uf", "valor_beneficio", "data_retirada_vale", "ano_mes"],
    nodeType: "pagamento",
    nodeLabelField: "nome_municipio",
  },

  // --- MinC · SALIC (Lei Rouanet) ---
  {
    id: "minc_salic",
    label: "MinC · SALIC (Lei Rouanet)",
    color: "#e879f9",
    table: "basedosdados.br_minc_salic.entidades",
    cnpjColumns: [{ name: "cnpjcpf", type: "mixed" }],
    displayFields: ["nome", "cnpjcpf", "proponente", "patrocinador", "projetos_count", "projetos_sum", "incentivos_count", "incentivos_sum", "cidade_nome", "uf"],
    nodeIdField: "id",
    nodeLabelField: "nome",
  },
  {
    // legado 2000–2016: view que já traz os dois lados de cada incentivo (quem patrocinou, quem propôs)
    id: "minc_salic_incentivos",
    label: "MinC · Incentivos 2000–2016",
    color: "#d946ef",
    table: "basedosdados.br_minc_salic.incentivos_detalhe",
    cnpjColumns: [
      { name: "patrocinador_cnpjcpf", type: "mixed" },
      { name: "proponente_cnpjcpf", type: "mixed" },
    ],
    displayFields: ["pronac", "projeto", "patrocinador", "patrocinador_cnpjcpf", "proponente", "proponente_cnpjcpf", "valor", "recibos_count", "last_recibo_at", "uf"],
    nodeType: "doacao",
    nodeIdField: "incentivo_id",
    nodeLabelField: "projeto",
  },
  {
    id: "minc_salic_projetos",
    label: "MinC · Projetos (Proponente)",
    color: "#c026d3",
    table: "basedosdados.br_minc_salic.projetos_api",
    cnpjColumns: [{ name: "cgccpf", type: "mixed" }],
    displayFields: ["pronac", "nome", "proponente", "cgccpf", "segmento", "situacao", "valor_aprovado", "valor_captado", "data_inicio", "municipio", "uf"],
    nodeIdField: "pronac",
    nodeLabelField: "nome",
  },
  {
    // 2019–2026: view com o doador e o proponente do projeto na mesma linha
    id: "minc_salic_captacoes",
    label: "MinC · Captações 2019–2026",
    color: "#a21caf",
    table: "basedosdados.br_minc_salic.captacoes_detalhe",
    cnpjColumns: [
      { name: "doador_cgccpf", type: "mixed" },
      { name: "proponente_cgccpf", type: "mixed" },
    ],
    displayFields: ["pronac", "projeto", "nome_doador", "doador_cgccpf", "proponente", "proponente_cgccpf", "valor", "data_recibo", "uf"],
    nodeType: "doacao",
    nodeLabelField: "projeto",
  },
  {
    // quem a verba incentivada pagou: fornecedor e proponente do projeto na mesma linha
    id: "minc_salic_pagamentos",
    label: "MinC · Pagamentos a Fornecedores",
    color: "#86198f",
    table: "basedosdados.br_minc_salic.pagamentos_detalhe",
    cnpjColumns: [
      { name: "fornecedor_cgccpf", type: "mixed" },
      { name: "proponente_cgccpf", type: "mixed" },
    ],
    displayFields: ["pronac", "projeto", "nome_fornecedor", "fornecedor_cgccpf", "proponente", "proponente_cgccpf", "item", "valor_pagamento", "data_pagamento"],
    nodeType: "pagamento",
    nodeIdField: "id_comprovante_pagamento",
    nodeLabelField: "nome_fornecedor",
  },

  // --- Transferegov · SICONV ---
  {
    id: "siconv_obras_fornecedor",
    label: "SICONV · Obras (Fornecedor)",
    color: "#b45309",
    table: "basedosdados.br_transferegov_siconv.siconv_acomp_obras_contratos_medicoes",
    cnpjColumns: [{ name: "CNPJ_FORNECEDOR_CONTRATO_ACOMPANHAMENTO_OBRA", type: "full" }],
    displayFields: ["ID_PROPOSTA", "CNPJ_FORNECEDOR_CONTRATO_ACOMPANHAMENTO_OBRA", "NUMERO_MEDICAO_ACOMPANHAMENTO_OBRA", "SITUACAO_MEDICAO_ACOMPANHAMENTO_OBRA", "DATA_INICIO_OBRA_CONTRATO_ACOMPANHAMENTO_OBRA", "QTD_DIAS_SEM_MEDICAO_ACOMPANHAMENTO_OBRA"],
    nodeType: "contrato",
    nodeIdField: "ID_CONTRATO_MEDICAO_ACOMPANHAMENTO_OBRA",
    nodeLabelField: "SITUACAO_MEDICAO_ACOMPANHAMENTO_OBRA",
  },
  {
    id: "siconv_emendas",
    label: "SICONV · Apoiadores de Emendas",
    color: "#d97706",
    table: "basedosdados.br_transferegov_siconv.siconv_apoiadores_emendas_programas",
    cnpjColumns: [
      { name: "CNPJ_PROPONENTE_APOIADORES_EMENDAS", type: "full" },
      { name: "CNPJ_PJ_SOLICITANTE_APOIADORES_EMENDAS", type: "full" },
    ],
    displayFields: ["NUMERO_EMENDA_APOIADORES_EMENDAS", "NOME_PARLAMENTAR_APOIADORES_EMENDAS", "NOME_PROPONENTE_APOIADORES_EMENDAS", "CNPJ_PROPONENTE_APOIADORES_EMENDAS", "NOME_PJ_SOLICITANTE_APOIADORES_EMENDAS", "VALOR_REPASSE_PROPOSTA_APOIADORES_EMENDAS"],
    nodeType: "pagamento",
    nodeIdField: "NUMERO_EMENDA_APOIADORES_EMENDAS",
    nodeLabelField: "NOME_PARLAMENTAR_APOIADORES_EMENDAS",
  },
  {
    id: "siconv_consorcios",
    label: "SICONV · Consórcios",
    color: "#92400e",
    table: "basedosdados.br_transferegov_siconv.siconv_consorcios",
    cnpjColumns: [
      { name: "CNPJ_CONSORCIO", type: "full" },
      { name: "CNPJ_PARTICIPANTE", type: "full" },
    ],
    displayFields: ["ID_PROPOSTA", "NOME_CONSORCIO", "CNPJ_CONSORCIO", "NOME_PARTICIPANTE", "CNPJ_PARTICIPANTE", "DESC_CNAE_PRIMARIO"],
    nodeType: "empresa",
    nodeIdField: "CNPJ_CONSORCIO",
    nodeLabelField: "NOME_CONSORCIO",
  },

  // --- Receita · DIRPF fundos e RAIS identificada ---
  {
    id: "dirpf_fundos",
    label: "RF · Fundos Habilitados (Doações DIRPF)",
    color: "#64748b",
    table: "basedosdados.br_rf_dirpf.fundos_habilitados",
    // BIGINT — leading zero lost.
    cnpjColumns: [{ name: "cnpj_fundo", type: "full", normalize: true }],
    displayFields: ["nome_empresarial", "cnpj_fundo", "tipo_fundo", "nome_municipio", "uf", "ano_dirpf"],
    nodeIdField: "cnpj_fundo",
    nodeLabelField: "nome_empresarial",
  },
  {
    id: "rais_estabelecimentos",
    label: "RAIS · Estabelecimentos Identificados",
    color: "#475569",
    table: "basedosdados.br_me_rais_identificada.estabelecimentos",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["ano", "cnpj_completo", "razao_social", "nome_fantasia", "quantidade_vinculos_ativos", "cnae_fiscal_principal", "sigla_uf", "situacao_cadastral_descricao"],
    yearField: "ano",
    nodeType: "estabelecimento",
    nodeIdField: "cnpj_completo",
    nodeLabelField: "nome_fantasia",
  },

  // --- Receita · Simples Nacional / MEI (base table: per-entity lookup only,
  // excluded from the breadth ranking like empresas/socios/estabelecimentos) ---
  {
    id: "cnpj_simples",
    label: "CNPJ · Simples Nacional / MEI",
    color: "#6366f1",
    table: "basedosdados.br_me_cnpj.simples",
    cnpjColumns: [{ name: "cnpj_basico", type: "basico" }],
    displayFields: ["cnpj_basico", "opcao_simples", "data_opcao_simples", "data_exclusao_simples", "opcao_mei", "data_opcao_mei", "data_exclusao_mei"],
    nodeIdField: "cnpj_basico",
    nodeLabelField: "opcao_simples",
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
  // INEP Docente (not available in S3)

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

/** Legacy helper kept for compatibility while parquet migration is completed. */
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
