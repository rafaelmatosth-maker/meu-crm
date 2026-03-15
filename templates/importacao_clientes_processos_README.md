# Template CSV - Clientes e Processos

Arquivo: `importacao_clientes_processos_template.csv`

## Regras de preenchimento
- Uma linha = um processo vinculado a um cliente.
- `cliente_nome` e `processo_numero_processo` são os campos mais importantes.
- `cliente_status`: use `lead`, `ativo` ou `inativo`.
- Datas: prefira `AAAA-MM-DD` (ex.: `2026-02-27`).
- Campos de Sim/Não: use `Sim` ou `No`.
- Se o mesmo cliente tiver 2 processos, repita os dados do cliente em 2 linhas (uma para cada processo).
- Se um campo não se aplicar, deixe vazio.

## Observação
Hoje o sistema possui importação de processos via DJEN e ainda não tem rota dedicada para upload CSV de clientes/processos.
Este template já está pronto para ser usado assim que essa rota de importação CSV for habilitada.
