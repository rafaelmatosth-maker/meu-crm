UPDATE clientes
SET qualificacao = trim(
  regexp_replace(
    concat_ws(
      ', ',
      concat_ws(
        ', ',
        nullif(trim(nome), ''),
        nullif(trim(nacionalidade), ''),
        nullif(trim(estado_civil), ''),
        nullif(trim(profissao), '')
      ),
      CASE
        WHEN data_nascimento IS NOT NULL THEN 'nascido(a) em ' || to_char(data_nascimento, 'DD/MM/YYYY')
      END,
      CASE
        WHEN nullif(trim(filiacao), '') IS NOT NULL THEN 'filho(a) de ' || trim(filiacao)
      END,
      CASE
        WHEN nullif(trim(rg), '') IS NOT NULL THEN 'portador(a) do RG ' || trim(rg)
      END,
      CASE
        WHEN nullif(trim(cpf), '') IS NOT NULL THEN 'CPF ' || trim(cpf)
      END,
      CASE
        WHEN (
          nullif(trim(endereco), '') IS NOT NULL
          OR nullif(trim(numero_casa), '') IS NOT NULL
          OR nullif(trim(cidade), '') IS NOT NULL
          OR nullif(trim(estado), '') IS NOT NULL
          OR nullif(trim(cep), '') IS NOT NULL
        ) THEN
          'residente e domiciliado(a) em '
          || concat_ws(
            ', ',
            concat_ws(', ', nullif(trim(endereco), ''), nullif(trim(numero_casa), '')),
            concat_ws(' - ', nullif(trim(cidade), ''), nullif(trim(estado), '')),
            CASE WHEN nullif(trim(cep), '') IS NOT NULL THEN 'CEP ' || trim(cep) END
          )
      END
    ),
    '\s+,',
    ',',
    'g'
  )
)
WHERE (
  qualificacao IS NULL
  OR trim(qualificacao) = ''
  OR qualificacao ~* '(^|,)\s*,'
  OR qualificacao ~* 'nascido\s*\(a\)\s*em\s*,'
  OR qualificacao ~* 'filho\s*\(a\)\s*de\s*,'
  OR qualificacao ~* 'sob o n[ºo]\s*,'
  OR qualificacao ~* 'cpf\s*,'
  OR qualificacao ~* 'residente e domiciliado\s*\(a\)\s*em\s*,\s*,'
)
  AND coalesce(trim(nome), '') <> '';
